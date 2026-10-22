// Reconciler (ground rule 5): Postgres is the source of truth; Redis is just
// a timer. Everything here rebuilds worker state from DB rows, so a wiped or
// missed queue loses nothing. Runs at boot and on a nightly schedule.
import { platformPrisma as prisma, withTenant, appendAudit, auditVerify } from '@chms/db';
import { Logger } from './log';

const log = new Logger('Reconciler');

export interface ReconcileResult {
  requeuedSms: number;
  requeuedPendingGive: number;
  instantiatedServices: number;
  auditBreaks: { churchId: string; firstBadSeq: number }[];
}

/** Enqueue ids the processors should pick up. */
export interface ReconcileQueues {
  smsSend: (logId: string) => void;
  givingSettle: (txId: string) => void;
  verifyPending: (txId: string) => void;
}

export async function reconcile(queues: ReconcileQueues): Promise<ReconcileResult> {
  // 1. Queued SMS that never left the shed (older than 2 min = lost job).
  const staleLogs = await prisma.smsLog.findMany({
    where: {
      status: 'QUEUED',
      queuedAt: { lt: new Date(Date.now() - 2 * 60_000) },
    },
    select: { id: true },
    take: 1000,
  });
  for (const l of staleLogs) queues.smsSend(l.id);

  // 2. Giving transactions stuck in PENDING/PROCESSING (nudge/sweep candidates).
  const staleTx = await prisma.transaction.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      createdAt: { lt: new Date(Date.now() - 30 * 60_000) },
    },
    select: { id: true },
    take: 500,
  });
  for (const t of staleTx) queues.verifyPending(t.id);

  // 3. SUCCESS gifts that never got receipts (worker restart mid-settle).
  const unreceipted = await prisma.transaction.findMany({
    where: { status: 'SUCCESS', receiptSent: false, batchId: null },
    select: { id: true },
    take: 500,
  });
  for (const t of unreceipted) queues.givingSettle(t.id);

  // 4. Materialise service instances for the next 7 days from templates.
  const instantiatedServices = await instantiateUpcomingServices();

  // 5. Verify each church's audit chain (nightly integrity gate).
  const auditBreaks = await verifyAuditChains();

  if (staleLogs.length || staleTx.length || unreceipted.length) {
    log.log(
      `reconciled: sms=${staleLogs.length} pending=${staleTx.length} receipts=${unreceipted.length} services=${instantiatedServices} auditBreaks=${auditBreaks.length}`,
    );
  }
  return {
    requeuedSms: staleLogs.length,
    requeuedPendingGive: staleTx.length + unreceipted.length,
    instantiatedServices,
    auditBreaks,
  };
}

/**
 * Create Service rows from ServiceTemplates for upcoming days. Supports the
 * seeded simple RRULE subset "FREQ=WEEKLY;BYDAY=SU" (extend when fuller RRULE
 * support is needed — verify against church timezone with luxon later).
 */
async function instantiateUpcomingServices(): Promise<number> {
  const templates = await prisma.serviceTemplate.findMany({ take: 500 });
  let created = 0;
  for (const tpl of templates) {
    if (!tpl.rrule || !tpl.rrule.includes('FREQ=WEEKLY')) continue;
    const bydayMatch = /BYDAY=([A-Z]{2})/.exec(tpl.rrule);
    const targetDow = bydayMatch ? dowToNumber(bydayMatch[1]) : 0; // default Sunday
    for (let offset = 0; offset <= 7; offset++) {
      const day = new Date(Date.now() + offset * 86400_000);
      if (day.getUTCDay() !== targetDow) continue;
      const [h, m] = tpl.startTime.split(':').map(Number);
      const startsAt = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0),
      );
      // Idempotent: one service per template per start time.
      const existing = await prisma.service.findFirst({
        where: { templateId: tpl.id, startsAt },
        select: { id: true },
      });
      if (existing) continue;
      await withTenant(tpl.churchId, null, async (tx) => {
        await tx.service.create({
          data: {
            churchId: tpl.churchId,
            branchId: tpl.branchId,
            templateId: tpl.id,
            name: tpl.name,
            startsAt,
            status: 'SCHEDULED',
          },
        });
      });
      created += 1;
    }
  }
  return created;
}

function dowToNumber(code: string): number {
  const map: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  return map[code] ?? 0;
}

async function verifyAuditChains(): Promise<{ churchId: string; firstBadSeq: number }[]> {
  const churches = await prisma.church.findMany({ select: { id: true } });
  const breaks: { churchId: string; firstBadSeq: number }[] = [];
  for (const c of churches) {
    try {
      const bad = await withTenant(c.id, null, (tx) => auditVerify(tx, c.id));
      if (bad !== null) {
        breaks.push({ churchId: c.id, firstBadSeq: bad });
        await withPlatformAudit(c.id, bad);
      }
    } catch (err) {
      log.error(`audit verify failed church=${c.id}: ${String(err)}`);
    }
  }
  return breaks;
}

async function withPlatformAudit(churchId: string, firstBadSeq: number): Promise<void> {
  const { withPlatform } = await import('@chms/db');
  await withPlatform((tx) =>
    appendAudit(tx, {
      churchId,
      action: 'audit.chain.broken',
      entity: 'audit_event',
      entityId: String(firstBadSeq),
      after: { firstBadSeq },
    }),
  );
}
