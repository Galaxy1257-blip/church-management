// Stuck-PENDING sweeper: transactions that never received a webhook get
// verified against the provider. Mock mode: PENDING > 24h becomes ABANDONED.
// Live mode: Paystack verify endpoint is the source of truth. Either way the
// compare-and-set keeps replays safe, and FAILED/ABANDONED flow to the
// giving-settle processor for a one-time nudge.
import { Logger } from './log';
import type { WorkerEnv } from './env';

const log = new Logger('VerifyPending');

const STUCK_PENDING_MS = 30 * 60_000; // consider for verification after 30 min
const ABANDON_AFTER_MS = 24 * 3600_000;

export async function verifyPendingTx(txId: string, env: WorkerEnv): Promise<{ result: string }> {
  const { platformPrisma: prisma } = await import('@chms/db');
  const txRow = await prisma.transaction.findUnique({ where: { id: txId } });
  if (!txRow) return { result: 'missing' };
  if (txRow.status !== 'PENDING' && txRow.status !== 'PROCESSING') {
    return { result: `already_${txRow.status.toLowerCase()}` };
  }
  const ageMs = Date.now() - txRow.createdAt.getTime();
  if (ageMs < STUCK_PENDING_MS) return { result: 'too_fresh' };

  if (env.PAYSTACK_MODE === 'mock') {
    if (ageMs >= ABANDON_AFTER_MS) {
      const updated = await prisma.transaction.updateMany({
        where: { id: txId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'ABANDONED', failureCode: 'MOCK_SWEEPER_TIMEOUT' },
      });
      if (updated.count > 0) return { result: 'abandoned' };
    }
    return { result: 'mock_pending' };
  }

  // Live: ask Paystack what happened.
  try {
    const res = await fetch(
      `${env.PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(txRow.reference)}`,
      { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
    );
    if (!res.ok) throw new Error(`verify http ${res.status}`);
    const body = (await res.json()) as { data?: { status?: string; amount?: number } };
    const status = body.data?.status;
    if (status === 'success' && body.data?.amount === txRow.chargedMinor) {
      const updated = await prisma.transaction.updateMany({
        where: { id: txId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'SUCCESS', paidAt: new Date(), channel: 'MOBILE_MONEY' },
      });
      if (updated.count > 0) return { result: 'settled_by_verify' };
    }
    if (status === 'failed' || status === 'abandoned') {
      const updated = await prisma.transaction.updateMany({
        where: { id: txId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: status === 'failed' ? 'FAILED' : 'ABANDONED', failureCode: 'VERIFY_ENDPOINT' },
      });
      if (updated.count > 0) return { result: status };
    }
    return { result: `gateway_${status ?? 'unknown'}` };
  } catch (err) {
    log.error(`verify failed tx=${txId}: ${String(err)}`);
    return { result: 'verify_error' };
  }
}
