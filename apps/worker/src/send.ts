// Gateway-side status handling shared by the send processors.
import { withTenant } from '@chms/db';
import { effectiveModules, resolveModules } from '@chms/shared';
import { billingIsLocked, deliveryDecision } from './announcements';
import { Logger } from './log';
import { smsHourlyBudgetAllows } from './sms-budget';

const log = new Logger('SmsSend');

export interface SmsBudgetOptions {
  enabled: boolean;
  hourlyUnitCap: number;
}

async function settleUnsentSms(
  churchId: string,
  logId: string,
  segments: number,
  status: 'FAILED' | 'SUPPRESSED',
  errorCode: string,
): Promise<void> {
  await withTenant(churchId, null, async (tx) => {
    const updated = await tx.smsLog.updateMany({
      where: { id: logId, status: 'SENDING' },
      data: { status, errorCode, attempts: { increment: 1 } },
    });
    if (!updated.count) return;
    const wallet = await tx.smsWallet.findUnique({ where: { churchId } });
    const reserved = Math.max(0, (wallet?.reservedUnits ?? 0) - segments);
    const balance = (wallet?.balanceUnits ?? 0) + segments;
    await tx.smsWallet.update({
      where: { churchId },
      data: { balanceUnits: balance, reservedUnits: reserved },
    });
    await tx.smsLedger.create({
      data: {
        churchId,
        delta: segments,
        reason: 'REFUND',
        refType: 'SMS_LOG',
        refId: logId,
        balanceAfter: balance,
        idempotencyKey: `refund:${logId}`,
      },
    });
  });
}

async function announcementSmsBlockReason(smsLog: {
  churchId: string;
  toE164: string;
  idempotencyKey: string;
}): Promise<string | null> {
  const announcementId = smsLog.idempotencyKey.match(/^announcement:([^:]+):sms:/)?.[1];
  if (!announcementId) return null;
  return withTenant(smsLog.churchId, null, async (tx) => {
    const announcement = await tx.announcement.findUnique({
      where: { id: announcementId },
      select: { publishAt: true, expiresAt: true, cancelledAt: true, moderation: true, createdBy: true },
    });
    if (!announcement) return 'The announcement no longer exists.';
    const [optOut, creator, church] = await Promise.all([
      tx.smsOptOut.findUnique({
        where: { churchId_phoneE164: { churchId: smsLog.churchId, phoneE164: smsLog.toE164 } },
      }),
      tx.user.findFirst({
        where: { id: announcement.createdBy, churchId: smsLog.churchId },
        select: { isActive: true, roles: { select: { role: { select: { key: true } } } } },
      }),
      tx.church.findUnique({
        where: { id: smsLog.churchId },
        select: { settings: true, billingLocked: true, billingExempt: true, paidUntil: true, trialEndsAt: true, graceDays: true },
      }),
    ]);
    if (optOut) return 'The recipient has opted out of church texts.';
    if (!church) return 'The church no longer exists.';
    const now = new Date();
    const decision = deliveryDecision({
      now,
      cancelledAt: announcement.cancelledAt,
      moderation: announcement.moderation,
      publishAt: announcement.publishAt,
      expiresAt: announcement.expiresAt,
      creator,
      reachEnabled: effectiveModules(resolveModules(church.settings)).reach,
      billingLocked: billingIsLocked(church, now),
      channel: 'SMS',
      pushEnabled: false,
      pushConfigured: false,
    });
    return decision.kind === 'send' ? null : decision.kind === 'reschedule' ? 'The publishing time changed.' : decision.reason;
  });
}

/**
 * Deliver one SmsLog row via the gateway. Idempotent: only QUEUED/SENDING
 * rows are sent; a replayed job on a SENT row is a no-op. Wallet reservation
 * already happened at enqueue time (dispatcher); DLR settlement (COMMIT/
 * REFUND) happens in the API webhook — here we just mark SENT/FAILED.
 */
export async function sendSmsLog(
  logId: string,
  gateway: { send: (input: { toE164: string; body: string; idempotencyKey: string }) => Promise<{ providerMessageId: string }> },
  budget: SmsBudgetOptions = { enabled: true, hourlyUnitCap: 5_000 },
): Promise<{ result: string }> {
  const { platformPrisma: prisma } = await import('@chms/db');
  const smsLog = await prisma.smsLog.findUnique({ where: { id: logId } });
  if (!smsLog) return { result: 'missing_log' };
  if (smsLog.status !== 'QUEUED') {
    if (smsLog.campaignId && ['SENT', 'DELIVERED', 'FAILED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(smsLog.status)) {
      await maybeCompleteCampaign(smsLog.campaignId);
    }
    return { result: `already_${smsLog.status.toLowerCase()}` };
  }

  const windowStart = new Date(Date.now() - 60 * 60_000);
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(741903)`;
    if (!budget.enabled) return 'disabled' as const;
    const used = await tx.smsLog.aggregate({
      where: {
        OR: [
          { sentAt: { gte: windowStart } },
          { status: 'SENDING', queuedAt: { gte: windowStart } },
        ],
      },
      _sum: { segments: true },
    });
    if (!smsHourlyBudgetAllows(used._sum.segments ?? 0, smsLog.segments, budget.hourlyUnitCap)) {
      return 'hourly_cap' as const;
    }
    const updated = await tx.smsLog.updateMany({
      where: { id: logId, status: 'QUEUED' },
      data: { status: 'SENDING' },
    });
    return updated.count === 1 ? ('claimed' as const) : ('already_claimed' as const);
  });
  if (claim === 'disabled') return { result: 'deferred_disabled' };
  if (claim === 'hourly_cap') {
    log.warn(`hourly SMS cap reached (${budget.hourlyUnitCap} units); log=${logId} deferred`);
    return { result: 'deferred_hourly_cap' };
  }
  if (claim !== 'claimed') return { result: 'already_claimed' };

  if (smsLog.source === 'ANNOUNCEMENT') {
    const blocked = await announcementSmsBlockReason(smsLog);
    if (blocked) {
      await settleUnsentSms(smsLog.churchId, logId, smsLog.segments, 'SUPPRESSED', blocked);
      return { result: 'suppressed_announcement' };
    }
  }

  try {
    const res = await gateway.send({
      toE164: smsLog.toE164,
      body: smsLog.body,
      idempotencyKey: smsLog.idempotencyKey,
    });
    await prisma.smsLog.update({
      where: { id: logId },
      data: { status: 'SENT', sentAt: new Date(), providerMessageId: res.providerMessageId, attempts: { increment: 1 } },
    });
    if (smsLog.campaignId) await maybeCompleteCampaign(smsLog.campaignId);
    return { result: 'sent' };
  } catch (err) {
    log.error(`send failed log=${logId}: ${String(err)}`);
    await settleUnsentSms(smsLog.churchId, logId, smsLog.segments, 'FAILED', String(err).slice(0, 200));
    if (smsLog.campaignId) await maybeCompleteCampaign(smsLog.campaignId);
    return { result: 'failed' };
  }
}

/** Mark a campaign DONE once every materialised log reached a terminal state. */
export async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const { platformPrisma: prisma } = await import('@chms/db');
  const campaign = await prisma.smsCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status !== 'SENDING') return;
  const pending = await prisma.smsLog.count({
    where: { campaignId, status: { in: ['QUEUED', 'SENDING'] } },
  });
  if (pending === 0) {
    await prisma.smsCampaign.update({ where: { id: campaignId }, data: { status: 'DONE' } });
    log.log(`campaign ${campaignId} done`);
  }
}
