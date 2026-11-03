// Worker entrypoint: BullMQ consumers + repeatable schedules + boot
// reconciliation. The API only writes rows and enqueues; every side effect
// (gateway send, receipt, sweep, service instantiation, audit verification)
// happens here, and the reconciler can rebuild any lost job from Postgres.
//
// The consumers themselves live in consumers.ts so that tick-server.ts (the
// free-plan shape, where nothing is awake unless GitHub pokes it) runs the same
// job bodies instead of a second copy that drifts.
import './load-root-env'; // root .env first — npm -w runs with cwd apps/worker
import { loadWorkerEnv } from './env';
import { startConsumers } from './consumers';
import { Logger } from './log';
import { getSmsGateway } from './sms-gateway';
import { reconcile } from './reconciler';

const env = loadWorkerEnv();
const logger = new Logger('Worker');

const { queues, close } = startConsumers(env);

async function main(): Promise<void> {
  // Repeatable schedules (idempotent via jobId + BullMQ dedupe).
  await queues.maintenance.add('sweep-pending', {}, { repeat: { pattern: '15 * * * *' }, jobId: 'sweep-pending' });
  await queues.maintenance.add('reconcile', {}, { repeat: { pattern: '20 2 * * *' }, jobId: 'nightly-reconcile' });
  await queues.maintenance.add('age-promotion', {}, { repeat: { pattern: '35 2 * * *' }, jobId: 'nightly-age-promotion' });
  await queues.maintenance.add('followup-tick', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'followup-tick' });
  // 20:00 UTC = 20:00 Accra (Ghana is UTC+0). Job id is new so the old 05:55
  // repeat schedule is superseded instead of running both.
  await queues.maintenance.removeRepeatable('verse-of-day', { pattern: '55 5 * * *' }, 'verse-of-day');
  await queues.maintenance.add('verse-of-day', {}, { repeat: { pattern: '0 20 * * *' }, jobId: 'verse-of-day-8pm' });
  await queues.maintenance.add('missing-member-scan', {}, { repeat: { pattern: '10 3 * * *' }, jobId: 'missing-member-scan' }); // 03:10 UTC = 03:10 Accra (Ghana is UTC+0)

  // Boot reconciliation: rebuild any lost jobs from DB rows.
  // The `:boot` job ids are deliberate — a restart must not re-send what the
  // previous process already queued, so the ids stay stable across boots.
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
    await close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error(`fatal: ${String(err)}`);
  process.exit(1);
});
