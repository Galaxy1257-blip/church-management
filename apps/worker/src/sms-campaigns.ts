import { platformPrisma, withTenant, appendAudit, type Db, type Prisma } from '@chms/db';
import { smsQuietHoursBlocked, smsSegments } from '@chms/shared';
import { Logger } from './log';

const log = new Logger('SmsCampaigns');
const CAMPAIGN_CHUNK = 500;

interface CampaignAudience {
  branchIds?: string[];
  bracketIds?: string[];
  memberStatus?: string[];
  includeVisitors?: boolean;
  visitFrom?: string;
  visitTo?: string;
}

interface ResolvedRecipient {
  phoneE164: string;
}

async function resolveAudience(
  tx: Db,
  churchId: string,
  audience: CampaignAudience,
): Promise<ResolvedRecipient[]> {
  const optedOut = new Set(
    (await tx.smsOptOut.findMany({ where: { churchId }, select: { phoneE164: true } })).map((o) => o.phoneE164),
  );
  const out: ResolvedRecipient[] = [];
  const seen = new Set<string>();

  const members = await tx.member.findMany({
    where: {
      churchId,
      deletedAt: null,
      status: audience.memberStatus?.length ? { in: audience.memberStatus as never[] } : 'ACTIVE',
      ...(audience.bracketIds?.length ? { ageBracketId: { in: audience.bracketIds } } : {}),
      ...(audience.branchIds?.length ? { branchId: { in: audience.branchIds } } : {}),
      phoneE164: { not: null },
      smsConsent: true,
    },
    select: { phoneE164: true },
  });
  for (const m of members) {
    if (!m.phoneE164 || optedOut.has(m.phoneE164) || seen.has(m.phoneE164)) continue;
    seen.add(m.phoneE164);
    out.push({ phoneE164: m.phoneE164 });
  }

  if (audience.includeVisitors) {
    const visitors = await tx.visitor.findMany({
      where: {
        churchId,
        consentSms: true,
        ...(audience.visitFrom || audience.visitTo
          ? {
              createdAt: {
                ...(audience.visitFrom ? { gte: new Date(audience.visitFrom) } : {}),
                ...(audience.visitTo ? { lte: new Date(audience.visitTo) } : {}),
              },
            }
          : {}),
      },
      select: { phoneE164: true },
    });
    for (const v of visitors) {
      if (optedOut.has(v.phoneE164) || seen.has(v.phoneE164)) continue;
      seen.add(v.phoneE164);
      out.push({ phoneE164: v.phoneE164 });
    }
  }
  return out;
}

/**
 * Poll due SCHEDULED SMS campaigns, respect church quiet hours, atomically
 * claim each campaign, reserve wallet credits, materialise SmsLog/SmsLedger
 * rows, and enqueue them onto the smsSend queue.
 */
export async function processScheduledSmsCampaigns(
  enqueueSend: (logId: string) => unknown,
  now = new Date(),
): Promise<{ processed: number; queued: number; deferredQuietHours: number }> {
  const due = await platformPrisma.smsCampaign.findMany({
    where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    select: { id: true, churchId: true },
  });

  let processed = 0;
  let queued = 0;
  let deferredQuietHours = 0;

  for (const row of due) {
    const result = await withTenant(row.churchId, null, async (tx) => {
      const campaign = await tx.smsCampaign.findFirst({
        where: { id: row.id, churchId: row.churchId, status: 'SCHEDULED' },
      });
      if (!campaign) return { status: 'skipped' as const, logIds: [] as string[] };

      const church = await tx.church.findUnique({
        where: { id: row.churchId },
        select: { settings: true, timezone: true },
      });
      if (church && smsQuietHoursBlocked(church.settings, church.timezone, now)) {
        return { status: 'quiet' as const, logIds: [] as string[] };
      }

      const audience = (campaign.audience ?? {}) as CampaignAudience;
      const recipients = await resolveAudience(tx, row.churchId, audience);
      if (recipients.length === 0) {
        await tx.smsCampaign.updateMany({
          where: { id: campaign.id, churchId: row.churchId, status: 'SCHEDULED' },
          data: { status: 'DONE', totalRecipients: 0 },
        });
        return { status: 'empty' as const, logIds: [] as string[] };
      }

      const claim = await tx.smsCampaign.updateMany({
        where: { id: campaign.id, churchId: row.churchId, status: 'SCHEDULED' },
        data: { status: 'SENDING', totalRecipients: recipients.length },
      });
      if (claim.count === 0) return { status: 'skipped' as const, logIds: [] as string[] };

      const segments = smsSegments(campaign.body);
      const logIds: string[] = [];

      for (let i = 0; i < recipients.length; i += CAMPAIGN_CHUNK) {
        const chunk = recipients.slice(i, i + CAMPAIGN_CHUNK);
        const already = await tx.smsLog.findMany({
          where: { campaignId: campaign.id, toE164: { in: chunk.map((r) => r.phoneE164) } },
          select: { toE164: true },
        });
        const seen = new Set(already.map((r) => r.toE164));
        let fresh = chunk.filter((r) => !seen.has(r.phoneE164));
        if (fresh.length === 0) continue;

        let units = fresh.length * segments;
        let reserved = await tx.smsWallet.updateMany({
          where: { churchId: row.churchId, balanceUnits: { gte: units } },
          data: { balanceUnits: { decrement: units }, reservedUnits: { increment: units } },
        });
        if (reserved.count === 0) {
          const w = await tx.smsWallet.findUnique({ where: { churchId: row.churchId } });
          const affordable = Math.min(fresh.length, Math.floor((w?.balanceUnits ?? 0) / segments));
          if (affordable === 0) break;
          fresh = fresh.slice(0, affordable);
          units = fresh.length * segments;
          reserved = await tx.smsWallet.updateMany({
            where: { churchId: row.churchId, balanceUnits: { gte: units } },
            data: { balanceUnits: { decrement: units }, reservedUnits: { increment: units } },
          });
          if (reserved.count === 0) break;
        }

        const logRows: Prisma.SmsLogCreateManyInput[] = fresh.map((r) => ({
          churchId: row.churchId,
          channel: 'SMS',
          source: 'CAMPAIGN',
          campaignId: campaign.id,
          toE164: r.phoneE164,
          body: campaign.body,
          segments,
          status: 'QUEUED',
          idempotencyKey: `campaign:${campaign.id}:${r.phoneE164}`,
        }));
        await tx.smsLog.createMany({ data: logRows, skipDuplicates: true });

        const inserted = await tx.smsLog.findMany({
          where: { campaignId: campaign.id, toE164: { in: fresh.map((r) => r.phoneE164) } },
          select: { id: true, toE164: true },
        });
        const idByPhone = new Map(inserted.map((r) => [r.toE164, r.id]));

        const walletAfterReservation = await tx.smsWallet.findUnique({ where: { churchId: row.churchId } });
        if (!walletAfterReservation) throw new Error('SMS wallet disappeared during reservation.');
        let balanceAfter = walletAfterReservation.balanceUnits + inserted.length * segments;
        const ledgerRows: Prisma.SmsLedgerCreateManyInput[] = [];
        for (const r of fresh) {
          const logId = idByPhone.get(r.phoneE164);
          if (!logId) continue;
          balanceAfter -= segments;
          ledgerRows.push({
            churchId: row.churchId,
            delta: -segments,
            reason: 'RESERVE',
            refType: 'SMS_LOG',
            refId: logId,
            balanceAfter,
            idempotencyKey: `reserve:campaign:${campaign.id}:${r.phoneE164}`,
          });
          logIds.push(logId);
        }
        await tx.smsLedger.createMany({ data: ledgerRows, skipDuplicates: true });
      }

      await appendAudit(tx, {
        churchId: row.churchId,
        actorId: campaign.createdBy,
        action: 'sms.campaign.send',
        entity: 'SmsCampaign',
        entityId: campaign.id,
        after: { recipients: recipients.length, segments, queued: logIds.length, scheduled: true },
      });

      return { status: 'sent' as const, logIds };
    });

    if (result.status === 'quiet') {
      deferredQuietHours += 1;
      continue;
    }
    if (result.status === 'sent' || result.status === 'empty') {
      processed += 1;
      for (const logId of result.logIds) {
        await enqueueSend(logId);
        queued += 1;
      }
    }
  }

  if (processed > 0 || deferredQuietHours > 0) {
    log.log(`scheduled campaigns: processed=${processed} queued=${queued} deferredQuietHours=${deferredQuietHours}`);
  }
  return { processed, queued, deferredQuietHours };
}
