// Gateway-side status handling shared by the send processors.
import { withTenant } from '@chms/db';
import { Logger } from './log';

const log = new Logger('SmsSend');

/**
 * Deliver one SmsLog row via the gateway. Idempotent: only QUEUED/SENDING
 * rows are sent; a replayed job on a SENT row is a no-op. Wallet reservation
 * already happened at enqueue time (dispatcher); DLR settlement (COMMIT/
 * REFUND) happens in the API webhook — here we just mark SENT/FAILED.
 */
export async function sendSmsLog(
  logId: string,
  gateway: { send: (input: { toE164: string; body: string; idempotencyKey: string }) => Promise<{ providerMessageId: string }> },
): Promise<{ result: string }> {
  const { platformPrisma: prisma } = await import('@chms/db');
  const smsLog = await prisma.smsLog.findUnique({ where: { id: logId } });
  if (!smsLog) return { result: 'missing_log' };
  if (smsLog.status !== 'QUEUED' && smsLog.status !== 'SENDING') {
    return { result: `already_${smsLog.status.toLowerCase()}` };
  }

  await prisma.smsLog.update({ where: { id: logId }, data: { status: 'SENDING' } });
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
    return { result: 'sent' };
  } catch (err) {
    log.error(`send failed log=${logId}: ${String(err)}`);
    await withTenant(smsLog.churchId, null, async (tx) => {
      await tx.smsLog.update({
        where: { id: logId },
        data: { status: 'FAILED', errorCode: String(err).slice(0, 200), attempts: { increment: 1 } },
      });
      // Refund the reservation immediately (no DLR will arrive for a send failure).
      const wallet = await tx.smsWallet.findUnique({ where: { churchId: smsLog.churchId } });
      const reserved = Math.max(0, (wallet?.reservedUnits ?? 0) - smsLog.segments);
      const balance = (wallet?.balanceUnits ?? 0) + smsLog.segments;
      await tx.smsWallet.update({
        where: { churchId: smsLog.churchId },
        data: { balanceUnits: balance, reservedUnits: reserved },
      });
      await tx.smsLedger.create({
        data: {
          churchId: smsLog.churchId,
          delta: smsLog.segments,
          reason: 'REFUND',
          refType: 'SMS_LOG',
          refId: logId,
          balanceAfter: balance,
          idempotencyKey: `refund:${logId}`,
        },
      });
    });
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
