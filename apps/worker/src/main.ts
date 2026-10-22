// Worker entrypoint: BullMQ consumers + repeatable schedules + boot
// reconciliation. The API only writes rows and enqueues; every side effect
// (gateway send, receipt, sweep, service instantiation, audit verification)
// happens here, and the reconciler can rebuild any lost job from Postgres.
import './load-root-env'; // root .env first — npm -w runs with cwd apps/worker
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadWorkerEnv } from './env';
import { Logger } from './log';
import { getSmsGateway } from './sms-gateway';
import { sendSmsLog, maybeCompleteCampaign } from './send';
import { settleGift } from './giving-settle';
import { verifyPendingTx } from './verify-pending';
import { reconcile } from './reconciler';

const env = loadWorkerEnv();
const logger = new Logger('Worker');

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });

const QUEUE_SMS_SEND = 'sms-send';
const QUEUE_GIVING_SETTLE = 'giving-settle';
const QUEUE_CAMPAIGN_SEND = 'campaign-send';
const QUEUE_VERIFY_PENDING = 'verify-pending';
const QUEUE_MAINTENANCE = 'maintenance';

const queues = {
  smsSend: new Queue(QUEUE_SMS_SEND, { connection }),
  givingSettle: new Queue(QUEUE_GIVING_SETTLE, { connection }),
  campaignSend: new Queue(QUEUE_CAMPAIGN_SEND, { connection }),
  verifyPending: new Queue(QUEUE_VERIFY_PENDING, { connection }),
  maintenance: new Queue(QUEUE_MAINTENANCE, { connection }),
};

function drainLogIds(logIds: string[]): void {
  for (const id of logIds) {
    void queues.smsSend.add('send', { logId: id }, { jobId: `sms:${id}` }).catch(() => undefined);
  }
}

const smsWorker = new Worker(
  QUEUE_SMS_SEND,
  async (job) => sendSmsLog(job.data.logId, await getSmsGateway()),
  { connection, concurrency: 10 },
);

const campaignWorker = new Worker(
  QUEUE_CAMPAIGN_SEND,
  async (job) => {
    const result = await sendSmsLog(job.data.logId, await getSmsGateway());
    if (job.data.campaignId) await maybeCompleteCampaign(job.data.campaignId);
    return result;
  },
  { connection, concurrency: 5 },
);

const settleWorker = new Worker(
  QUEUE_GIVING_SETTLE,
  async (job) => {
    const result = await settleGift(job.data.txId, env.WEB_URL);
    drainLogIds(result.logIds);
    return result;
  },
  { connection, concurrency: 5 },
);

const verifyWorker = new Worker(
  QUEUE_VERIFY_PENDING,
  async (job) => {
    const result = await verifyPendingTx(job.data.txId, env);
    if (result.result === 'settled_by_verify' || result.result === 'failed' || result.result === 'abandoned') {
      queues.givingSettle.add('settle', { txId: job.data.txId }, { jobId: `settle:${job.data.txId}` }).catch(() => undefined);
    }
    return result;
  },
  { connection, concurrency: 2 },
);

// Maintenance: hourly stuck-PENDING sweep + nightly reconcile + services.
const maintenanceWorker = new Worker(
  QUEUE_MAINTENANCE,
  async (job) => {
    switch (job.name) {
      case 'sweep-pending': {
        const { platformPrisma: prisma } = await import('@chms/db');
        const stale = await prisma.transaction.findMany({
          where: { status: { in: ['PENDING', 'PROCESSING'] }, createdAt: { lt: new Date(Date.now() - 30 * 60_000) } },
          select: { id: true },
          take: 500,
        });
        for (const t of stale) {
          await queues.verifyPending.add('verify', { txId: t.id }, { jobId: `verify:${t.id}:${Date.now()}` });
        }
        return { swept: stale.length };
      }
      case 'reconcile':
      case 'boot-reconcile': {
        return reconcile({
          smsSend: (logId) => {
            void queues.smsSend.add('send', { logId }, { jobId: `sms:${logId}:${Date.now()}` });
          },
          givingSettle: (txId) => {
            void queues.givingSettle.add('settle', { txId }, { jobId: `settle:${txId}:${Date.now()}` });
          },
          verifyPending: (txId) => {
            void queues.verifyPending.add('verify', { txId }, { jobId: `verify:${txId}:${Date.now()}` });
          },
        });
      }
      case 'followup-tick': {
        const { processFollowups } = await import('./followup');
        return processFollowups();
      }
      case 'verse-of-day': {
        const { sendVerseOfDay } = await import('./verse-of-day');
        return sendVerseOfDay();
      }
      case 'missing-member-scan': {
        const { scanMissingMembers } = await import('./missing-member');
        return scanMissingMembers();
      }
      case 'age-promotion': {
        // Birthday auto-upgrade for churches with demographics.autoPromote on.
        const { platformPrisma: pp, withTenant, appendAudit } = await import('@chms/db');
        const { promotionsFor } = await import('@chms/shared');
        const churches = await pp.church.findMany({ select: { id: true, settings: true } });
        let promoted = 0;
        for (const c of churches) {
          const demo = (c.settings as any)?.demographics ?? {};
          if (demo.autoPromote !== true) continue;
          await withTenant(c.id, null, async (tx) => {
            const rows = await tx.ageBracket.findMany({ where: { churchId: c.id } });
            const brackets = rows.map((b) => ({
              id: b.id,
              key: b.key,
              label: b.label,
              minAge: b.minAge,
              maxAge: b.maxAge,
              genderSplit: b.genderSplit,
              segmentKey: b.segmentKey,
              isActive: b.isActive,
              sortOrder: b.sortOrder,
            }));
            const members = await tx.member.findMany({
              where: { churchId: c.id, deletedAt: null, status: 'ACTIVE', dob: { not: null } },
              select: { id: true, firstName: true, lastName: true, ageBracketId: true, dob: true },
            });
            const promos = promotionsFor(
              members.map((m) => ({
                id: m.id,
                name: `${m.firstName} ${m.lastName}`,
                ageBracketId: m.ageBracketId,
                dob: m.dob,
              })),
              brackets,
            );
            for (const p of promos) {
              const target = brackets.find((b) => b.key === p.toBracketKey);
              if (!target) continue;
              await tx.member.update({ where: { id: p.id }, data: { ageBracketId: target.id } });
              await appendAudit(tx, {
                churchId: c.id,
                action: 'member.age_promotion.auto',
                entity: 'Member',
                entityId: p.id,
                before: { bracketKey: p.fromBracketKey },
                after: { bracketKey: p.toBracketKey, age: p.age },
              });
              promoted += 1;
            }
          });
        }
        return { promoted };
      }
      default:
        return { ignored: job.name };
    }
  },
  { connection, concurrency: 1 },
);

async function main(): Promise<void> {
  // Repeatable schedules (idempotent via jobId + BullMQ dedupe).
  await queues.maintenance.add('sweep-pending', {}, { repeat: { pattern: '15 * * * *' }, jobId: 'sweep-pending' });
  await queues.maintenance.add('reconcile', {}, { repeat: { pattern: '20 2 * * *' }, jobId: 'nightly-reconcile' });
  await queues.maintenance.add('age-promotion', {}, { repeat: { pattern: '35 2 * * *' }, jobId: 'nightly-age-promotion' });
  await queues.maintenance.add('followup-tick', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'followup-tick' });
  await queues.maintenance.add('verse-of-day', {}, { repeat: { pattern: '55 5 * * *' }, jobId: 'verse-of-day' }); // 05:55 UTC = 05:55 Accra
  await queues.maintenance.add('missing-member-scan', {}, { repeat: { pattern: '10 3 * * *' }, jobId: 'missing-member-scan' }); // 03:10 UTC = 03:10 Accra (Ghana is UTC+0)

  // Boot reconciliation: rebuild any lost jobs from DB rows.
  const boot = await reconcile({
    smsSend: (logId) => {
      void queues.smsSend.add('send', { logId }, { jobId: `sms:${logId}:boot` });
    },
    givingSettle: (txId) => {
      void queues.givingSettle.add('settle', { txId }, { jobId: `settle:${txId}:boot` });
    },
    verifyPending: (txId) => {
      void queues.verifyPending.add('verify', { txId }, { jobId: `verify:${txId}:boot` });
    },
  });
  logger.log(
    `boot reconciled: sms=${boot.requeuedSms} pendingGive=${boot.requeuedPendingGive} services=${boot.instantiatedServices} auditBreaks=${boot.auditBreaks.length}`,
  );

  logger.log(`worker up (gateway=${(await getSmsGateway()).name}, paystack=${env.PAYSTACK_MODE})`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`received ${signal}, draining...`);
    await Promise.allSettled([
      smsWorker.close(),
      campaignWorker.close(),
      settleWorker.close(),
      verifyWorker.close(),
      maintenanceWorker.close(),
      ...Object.values(queues).map((q) => q.close()),
      connection.quit(),
    ]);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`fatal: ${String(err)}`);
  process.exit(1);
});
