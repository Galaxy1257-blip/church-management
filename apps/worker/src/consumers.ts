// Queue consumers, shared by the two entrypoints: main.ts (always-on worker, the
// paid/normal shape) and tick-server.ts (the free-plan shape, where the process
// only exists while GitHub is poking it). One set of handlers, not two.
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import type { WorkerEnv } from './env';
import { runMaintenance } from './maintenance';
import { sendSmsLog } from './send';
import { getSmsGateway } from './sms-gateway';
import { settleGift } from './giving-settle';
import { verifyPendingTx } from './verify-pending';

export const QUEUE_SMS_SEND = 'sms-send';
export const QUEUE_GIVING_SETTLE = 'giving-settle';
export const QUEUE_CAMPAIGN_SEND = 'campaign-send';
export const QUEUE_VERIFY_PENDING = 'verify-pending';
export const QUEUE_MAINTENANCE = 'maintenance';

export interface Consumers {
  connection: IORedis;
  queues: {
    smsSend: Queue;
    givingSettle: Queue;
    campaignSend: Queue;
    verifyPending: Queue;
    maintenance: Queue;
  };
  close(): Promise<void>;
}

export function startConsumers(env: WorkerEnv): Consumers {
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const opts = { connection };

  const queues = {
    smsSend: new Queue(QUEUE_SMS_SEND, opts),
    givingSettle: new Queue(QUEUE_GIVING_SETTLE, opts),
    campaignSend: new Queue(QUEUE_CAMPAIGN_SEND, opts),
    verifyPending: new Queue(QUEUE_VERIFY_PENDING, opts),
    maintenance: new Queue(QUEUE_MAINTENANCE, opts),
  };

  function drainLogIds(logIds: string[]): void {
    for (const id of logIds) {
      void queues.smsSend.add('send', { logId: id }, { jobId: `sms:${id}` }).catch(() => undefined);
    }
  }

  const budget = { enabled: env.SMS_SENDING_ENABLED, hourlyUnitCap: env.SMS_HOURLY_UNIT_CAP };
  const runSms = async (logId: string) => {
    const result = await sendSmsLog(logId, await getSmsGateway(), budget);
    if (result.result === 'deferred_hourly_cap' || result.result === 'deferred_disabled') {
      const delay = result.result === 'deferred_hourly_cap' ? 60_000 : 300_000;
      await queues.smsSend.add('send', { logId }, { jobId: `sms:${logId}:retry:${Date.now()}`, delay });
    }
    return result;
  };

  const workers = [
    new Worker(
      QUEUE_SMS_SEND,
      async (job) => runSms(job.data.logId),
      { connection, concurrency: 10 },
    ),
    new Worker(
      QUEUE_CAMPAIGN_SEND,
      async (job) => runSms(job.data.logId),
      { connection, concurrency: 5 },
    ),
    new Worker(
      QUEUE_GIVING_SETTLE,
      async (job) => {
        const result = await settleGift(job.data.txId, env.WEB_URL);
        drainLogIds(result.logIds);
        return result;
      },
      { connection, concurrency: 5 },
    ),
    new Worker(
      QUEUE_VERIFY_PENDING,
      async (job) => {
        const result = await verifyPendingTx(job.data.txId, env);
        if (result.result === 'settled_by_verify' || result.result === 'failed' || result.result === 'abandoned') {
          queues.givingSettle
            .add('settle', { txId: job.data.txId }, { jobId: `settle:${job.data.txId}` })
            .catch(() => undefined);
        }
        return result;
      },
      { connection, concurrency: 2 },
    ),
    // Maintenance: the stuck-PENDING sweep, the nightly reconcile, and the
    // scheduled scans (drip, verse, missing members, age promotions).
    new Worker(QUEUE_MAINTENANCE, async (job) => runMaintenance(job.name, queues), {
      connection,
      concurrency: 1,
    }),
  ];

  return {
    connection,
    queues,
    async close() {
      await Promise.allSettled([
        ...workers.map((w) => w.close()),
        ...Object.values(queues).map((q) => q.close()),
        connection.quit(),
      ]);
    },
  };
}
