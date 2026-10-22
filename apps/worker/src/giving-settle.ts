// giving-settle worker: after a transaction flips to SUCCESS, send the
// receipt SMS (idempotent via receiptSent flag + dispatcher key). For
// FAILED/ABANDONED, send a one-time retry nudge (nudgeSentAt flag). Returns
// the SmsLog ids the caller must enqueue after the transaction commits.
import { withTenant, Db } from '@chms/db';
import { localizedSmsBody, smsSegments, formatGhs, SmsLocaleSettings } from '@chms/shared';
import { Logger } from './log';

const log = new Logger('GivingSettle');

function localeSettings(settings: unknown): SmsLocaleSettings | null {
  return ((settings ?? {}) as any).smsLocales ?? null;
}

export interface SettleOutcome {
  result: string;
  logIds: string[];
}

export async function settleGift(txId: string, webUrl: string): Promise<SettleOutcome> {
  const { platformPrisma: prisma } = await import('@chms/db');
  const txRow = await prisma.transaction.findUnique({
    where: { id: txId },
    include: { fund: true, member: true },
  });
  if (!txRow) return { result: 'missing_transaction', logIds: [] };
  const church = await prisma.church.findUnique({ where: { id: txRow.churchId } });
  if (!church) return { result: 'missing_church', logIds: [] };

  if (txRow.status === 'SUCCESS') {
    if (txRow.receiptSent) return { result: 'already_receipted', logIds: [] };
    const phone = txRow.giverPhoneE164 ?? txRow.member?.phoneE164 ?? null;
    if (!phone) {
      await prisma.transaction.update({ where: { id: txId }, data: { receiptSent: true } });
      return { result: 'no_phone', logIds: [] };
    }
    const body = localizedSmsBody('receipt', localeSettings(church.settings), {
      amount: formatGhs(txRow.giftMinor),
      churchName: church.name,
      fundName: txRow.fund.name,
      reference: txRow.reference,
    });
    const outcome = await dispatch(txRow.churchId, {
      toE164: phone,
      body,
      source: 'RECEIPT',
      idempotencyKey: `receipt:${txId}`,
    });
    if (outcome.status === 'queued') {
      // Mark sent only if the log row committed (it did — dispatch is tx-wrapped).
      await prisma.transaction.update({ where: { id: txId }, data: { receiptSent: true } });
    }
    return {
      result: `receipt_${outcome.status}`,
      logIds: outcome.logId ? [outcome.logId] : [],
    };
  }

  if (txRow.status === 'FAILED' || txRow.status === 'ABANDONED') {
    if (txRow.nudgeSentAt) return { result: 'already_nudged', logIds: [] };
    const phone = txRow.giverPhoneE164 ?? txRow.member?.phoneE164 ?? null;
    if (!phone) return { result: 'no_phone', logIds: [] };
    const body = localizedSmsBody('nudge', localeSettings(church.settings), {
      name: txRow.giverName ?? txRow.member?.firstName ?? 'friend',
      amount: formatGhs(txRow.giftMinor),
      churchName: church.name,
      retryLink: `${webUrl}/give/${church.slug}`,
    });
    const outcome = await dispatch(txRow.churchId, {
      toE164: phone,
      body,
      source: 'NUDGE',
      idempotencyKey: `nudge:${txId}`,
    });
    if (outcome.status !== 'error') {
      await prisma.transaction.update({ where: { id: txId }, data: { nudgeSentAt: new Date() } });
    }
    return {
      result: `nudge_${outcome.status}`,
      logIds: outcome.logId ? [outcome.logId] : [],
    };
  }

  return { result: `skipped_${txRow.status.toLowerCase()}`, logIds: [] };
}

/**
 * Worker-side enqueue path (same contract as the API dispatcher: opt-out
 * exempt sources only — RECEIPT/NUDGE — unique idempotency key, wallet
 * reservation + append-only ledger). The gateway is only ever called by the
 * send processor, never here.
 */
async function dispatch(
  churchId: string,
  input: { toE164: string; body: string; source: 'RECEIPT' | 'NUDGE'; idempotencyKey: string },
): Promise<{ status: 'queued' | 'suppressed' | 'duplicate' | 'error'; logId: string | null }> {
  try {
    return await withTenant(churchId, null, async (tx: Db) => {
      const existing = await tx.smsLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return { status: 'duplicate' as const, logId: existing.id };
      const segments = smsSegments(input.body);
      const wallet = await tx.smsWallet.findUnique({ where: { churchId } });
      const balance = wallet?.balanceUnits ?? 0;
      if (balance < segments) return { status: 'suppressed' as const, logId: null };
      const updated = await tx.smsWallet.updateMany({
        where: { churchId, balanceUnits: { gte: segments } },
        data: { balanceUnits: { decrement: segments }, reservedUnits: { increment: segments } },
      });
      if (updated.count === 0) return { status: 'suppressed' as const, logId: null };
      await tx.smsLedger.create({
        data: {
          churchId,
          delta: -segments,
          reason: 'RESERVE',
          refType: 'SMS_LOG',
          refId: null,
          balanceAfter: balance - segments,
          idempotencyKey: `reserve:${input.idempotencyKey}`,
        },
      });
      const smsLog = await tx.smsLog.create({
        data: {
          churchId,
          source: input.source,
          toE164: input.toE164,
          body: input.body,
          segments,
          status: 'QUEUED',
          idempotencyKey: input.idempotencyKey,
        },
      });
      await tx.smsLedger.update({
        where: { idempotencyKey: `reserve:${input.idempotencyKey}` },
        data: { refId: smsLog.id },
      });
      return { status: 'queued' as const, logId: smsLog.id };
    });
  } catch (err) {
    log.error(`dispatch failed key=${input.idempotencyKey}: ${String(err)}`);
    return { status: 'error', logId: null };
  }
}

export { log as settleLog };
