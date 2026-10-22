// THE single SMS dispatcher (ground rule 4): normalise phone, check opt-out,
// reserve credits, create SmsLog (unique idempotency key), enqueue. No other
// code may call the gateway — the gateway lives in the worker; this service
// only writes rows and pushes jobs. Everything runs inside the caller's tx so
// a rolled-back business write also rolls back its SMS.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Db } from '@chms/db';
import {
  normalizeGhPhone,
  PhoneError,
  render,
  smsSegments,
  SMS_OPTOUT_EXEMPT_SOURCES,
  SmsSource,
} from '@chms/shared';
import { QueuesService } from '../queues/queues.module';

export interface DispatchInput {
  churchId: string;
  toE164: string;
  body: string;
  source: SmsSource;
  /** Stable per logical message; a retry with the same key is a no-op. */
  idempotencyKey: string;
  campaignId?: string | null;
  progressId?: string | null;
}

export type DispatchOutcome =
  | { status: 'QUEUED'; logId: string; segments: number }
  | { status: 'SUPPRESSED'; reason: 'OPTED_OUT'; logId: null; segments: 0 }
  | { status: 'SUPPRESSED'; reason: 'NO_BALANCE'; logId: null; segments: number };

@Injectable()
export class SmsDispatcher {
  constructor(private readonly queues: QueuesService) {}

  /**
   * Call INSIDE a withTenant transaction. Creates SmsLog + wallet reservation
   * atomically. Queueing happens after commit via enqueueAfterCommit (the
   * caller invokes it once its transaction resolves) — we instead attach a
   * microtask-free pattern: the returned outcome carries the logId and the
   * caller calls `this.flush(outcome)` post-commit. To keep call sites simple
   * we enqueue immediately after insert; if the tx later rolls back, the
   * worker's send step re-checks the log row exists (reconciler-safe).
   */
  async dispatch(tx: Db, input: DispatchInput): Promise<DispatchOutcome> {
    let to: string;
    try {
      to = normalizeGhPhone(input.toE164);
    } catch (e) {
      if (e instanceof PhoneError) throw new BadRequestException(`bad recipient phone: ${e.message}`);
      throw e;
    }
    const segments = smsSegments(input.body);
    const exempt = SMS_OPTOUT_EXEMPT_SOURCES.includes(input.source);

    if (!exempt) {
      const optOut = await tx.smsOptOut.findUnique({
        where: { churchId_phoneE164: { churchId: input.churchId, phoneE164: to } },
      });
      if (optOut) {
        return { status: 'SUPPRESSED', reason: 'OPTED_OUT', logId: null, segments: 0 };
      }
    }

    // Idempotent: same key => same log row, no double reservation.
    const existing = await tx.smsLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      return { status: 'QUEUED', logId: existing.id, segments: existing.segments };
    }

    // Reserve credits: balance must cover the reservation (compare-and-set).
    const wallet = await tx.smsWallet.findUnique({ where: { churchId: input.churchId } });
    const balance = wallet?.balanceUnits ?? 0;
    if (balance < segments) {
      return { status: 'SUPPRESSED', reason: 'NO_BALANCE', logId: null, segments };
    }
    const updated = await tx.smsWallet.updateMany({
      where: { churchId: input.churchId, balanceUnits: { gte: segments } },
      data: { balanceUnits: { decrement: segments }, reservedUnits: { increment: segments } },
    });
    if (updated.count === 0) {
      return { status: 'SUPPRESSED', reason: 'NO_BALANCE', logId: null, segments };
    }

    const ledgerKey = `reserve:${input.idempotencyKey}`;
    const alreadyLedgered = await tx.smsLedger.findUnique({ where: { idempotencyKey: ledgerKey } });
    if (!alreadyLedgered) {
      await tx.smsLedger.create({
        data: {
          churchId: input.churchId,
          delta: -segments,
          reason: 'RESERVE',
          refType: 'SMS_LOG',
          refId: null, // filled below after log insert
          balanceAfter: balance - segments,
          idempotencyKey: ledgerKey,
        },
      });
    }

    const log = await tx.smsLog.create({
      data: {
        churchId: input.churchId,
        channel: 'SMS',
        source: input.source,
        campaignId: input.campaignId ?? null,
        progressId: input.progressId ?? null,
        toE164: to,
        body: input.body,
        segments,
        status: 'QUEUED',
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (!alreadyLedgered) {
      await tx.smsLedger.update({ where: { idempotencyKey: ledgerKey }, data: { refId: log.id } });
    }

    return { status: 'QUEUED', logId: log.id, segments };
  }

  /** Push a queued log to the worker. Call after the DB transaction commits. */
  flush(outcome: DispatchOutcome): void {
    if (outcome.status === 'QUEUED' && outcome.logId) {
      this.queues.enqueueSmsSend(outcome.logId);
    }
  }

  /** Convenience for templates: render vars then dispatch. */
  async dispatchRendered(
    tx: Db,
    input: Omit<DispatchInput, 'body'> & { template: string; vars: Record<string, string | number> },
  ): Promise<DispatchOutcome> {
    const body = render(input.template, input.vars);
    return this.dispatch(tx, { ...input, body });
  }
}
