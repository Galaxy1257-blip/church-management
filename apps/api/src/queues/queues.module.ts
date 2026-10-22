// BullMQ queues the API enqueues into. Redis being down must not 500 a
// request: writes land in Postgres first and the worker's reconciler
// re-enqueues from DB rows (ground rule 5).
import { Global, Inject, Injectable, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Env } from '../env';

export const QUEUE_SMS_SEND = 'sms-send';
export const QUEUE_GIVING_SETTLE = 'giving-settle';
export const QUEUE_CAMPAIGN_SEND = 'campaign-send';
export const QUEUE_VERIFY_PENDING = 'verify-pending';

export function redisConnection(url: string): IORedis {
  return new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });
}

@Injectable()
export class QueuesService implements OnModuleDestroy {
  private readonly logger = new Logger('Queues');
  private readonly connection: IORedis;
  readonly smsSend: Queue;
  readonly givingSettle: Queue;
  readonly campaignSend: Queue;
  readonly verifyPending: Queue;

  constructor(@Inject('ENV') env: Env) {
    this.connection = redisConnection(env.REDIS_URL);
    const opts = { connection: this.connection };
    this.smsSend = new Queue(QUEUE_SMS_SEND, opts);
    this.givingSettle = new Queue(QUEUE_GIVING_SETTLE, opts);
    this.campaignSend = new Queue(QUEUE_CAMPAIGN_SEND, opts);
    this.verifyPending = new Queue(QUEUE_VERIFY_PENDING, opts);
  }

  /** Fire-and-forget enqueue: DB is the source of truth, reconciler repairs gaps. */
  private safeAdd(queue: Queue, name: string, data: unknown, opts?: { jobId?: string }): void {
    queue.add(name, data, opts).catch((err: unknown) => {
      this.logger.warn(`enqueue ${queue.name} failed (reconciler will repair): ${String(err)}`);
    });
  }

  enqueueSmsSend(logId: string): void {
    this.safeAdd(this.smsSend, 'send', { logId }, { jobId: `sms:${logId}` });
  }

  enqueueGivingSettle(txId: string): void {
    this.safeAdd(this.givingSettle, 'settle', { txId }, { jobId: `settle:${txId}` });
  }

  enqueueCampaignSend(logId: string): void {
    this.safeAdd(this.campaignSend, 'send', { logId }, { jobId: `camp:${logId}` });
  }

  enqueueVerifyPending(txId: string): void {
    this.safeAdd(this.verifyPending, 'verify', { txId }, { jobId: `verify:${txId}` });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.smsSend.close(),
      this.givingSettle.close(),
      this.campaignSend.close(),
      this.verifyPending.close(),
      this.connection.quit(),
    ]);
  }
}

@Global()
@Module({
  providers: [QueuesService],
  exports: [QueuesService],
})
export class QueuesModule {}
