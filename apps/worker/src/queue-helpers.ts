// Small indirection so followup.ts can enqueue without circular imports.
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { loadWorkerEnv } from './env';

let queue: Queue | null = null;

export function enqueueSmsSend(logId: string): void {
  if (!queue) {
    const env = loadWorkerEnv();
    queue = new Queue('sms-send', {
      connection: new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    });
  }
  void queue.add('send', { logId }, { jobId: `sms:${logId}` }).catch(() => undefined);
}
