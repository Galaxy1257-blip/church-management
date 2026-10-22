// Inbound webhooks from the SMS gateway: delivery reports (DLR) and inbound
// messages (opt-out keywords). Protected by a shared secret header (not user
// auth). Both paths are idempotent; the dispatcher remains the only sender.
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { appendAudit, platformPrisma as prisma, withTenant } from '@chms/db';
import { matchOptKeyword, normalizeGhPhone } from '@chms/shared';
import { Env } from '../env';
import { SmsDispatcher } from '../sms/sms-dispatcher';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject('ENV') private readonly env: Env,
    private readonly sms: SmsDispatcher,
  ) {}

  verifySecret(header: string | undefined): void {
    if (!header || header !== this.env.SMS_WEBHOOK_SECRET) {
      throw new UnauthorizedException('bad webhook secret');
    }
  }

  /** DLR: update SmsLog status by providerMessageId; commit or refund credits. */
  async handleDlr(input: {
    providerMessageId: string;
    status: 'SENT' | 'DELIVERED' | 'FAILED' | 'REJECTED' | 'EXPIRED';
    errorCode?: string;
  }): Promise<{ status: string }> {
    const log = await prisma.smsLog.findFirst({ where: { providerMessageId: input.providerMessageId } });
    if (!log) return { status: 'unknown_message' };
    if (['DELIVERED', 'FAILED', 'REJECTED', 'EXPIRED', 'SUPPRESSED'].includes(log.status)) {
      return { status: 'already_final' }; // idempotent replay
    }

    const failed = input.status === 'FAILED' || input.status === 'REJECTED' || input.status === 'EXPIRED';
    await withTenant(log.churchId, null, async (tx) => {
      await tx.smsLog.update({
        where: { id: log.id },
        data: {
          status: input.status,
          errorCode: input.errorCode ?? null,
          sentAt: log.sentAt ?? new Date(),
          deliveredAt: input.status === 'DELIVERED' ? new Date() : null,
        },
      });
      // Settle the reservation: commit (keep the debit) or refund on failure.
      const wallet = await tx.smsWallet.findUnique({ where: { churchId: log.churchId } });
      const reserved = Math.max(0, (wallet?.reservedUnits ?? 0) - log.segments);
      const balance = (wallet?.balanceUnits ?? 0) + (failed ? log.segments : 0);
      await tx.smsWallet.update({
        where: { churchId: log.churchId },
        data: { balanceUnits: balance, reservedUnits: reserved },
      });
      await tx.smsLedger.create({
        data: {
          churchId: log.churchId,
          delta: failed ? log.segments : 0,
          reason: failed ? 'REFUND' : 'COMMIT',
          refType: 'SMS_LOG',
          refId: log.id,
          balanceAfter: balance,
          idempotencyKey: `${failed ? 'refund' : 'commit'}:${log.id}`,
        },
      });
    });
    return { status: failed ? 'refunded' : 'committed' };
  }

  /** Inbound SMS: opt-out keywords suppress campaigns + cancel drip enrolments. */
  async handleInbound(input: {
    fromE164: string;
    body: string;
    providerId?: string;
  }): Promise<{ status: string }> {
    if (input.providerId) {
      const existing = await prisma.inboundSms.findUnique({ where: { providerId: input.providerId } });
      if (existing) return { status: 'duplicate' };
    }

    // Normalise the sender the way outbound logs store recipients
    // (normalizeGhPhone on dispatch): gateways may deliver raw local numbers
    // (024…) or E.164 (+233…); keep the raw value if it parses as neither.
    let from = input.fromE164;
    try {
      from = normalizeGhPhone(input.fromE164);
    } catch {
      /* keep raw */
    }

    // Which church? Match the most recent outbound to this phone.
    const anyLog = await prisma.smsLog.findFirst({
      where: { toE164: from },
      orderBy: { queuedAt: 'desc' },
    });
    const churchId = anyLog?.churchId;
    if (!churchId) return { status: 'unknown_recipient' };

    const inbound = await prisma.inboundSms.create({
      data: { churchId, fromE164: from, body: input.body, providerId: input.providerId ?? null },
    });

    const keyword = matchOptKeyword(input.body);
    if (!keyword) return { status: 'stored' };

    await withTenant(churchId, null, async (tx) => {
      if (keyword.kind === 'OUT') {
        await tx.smsOptOut.upsert({
          where: { churchId_phoneE164: { churchId, phoneE164: from } },
          create: { churchId, phoneE164: from, scope: 'CHURCH' },
          update: {},
        });
        // Cancel active drip enrolments (stop-on-reply policy).
        await tx.followUpProgress.updateMany({
          where: { state: 'ACTIVE', visitor: { phoneE164: from } },
          data: { state: 'CANCELLED', cancelReason: 'OPT_OUT' },
        });
      } else {
        await tx.smsOptOut.deleteMany({ where: { churchId, phoneE164: from } });
      }
      await tx.optEvent.create({
        data: {
          churchId,
          phoneE164: from,
          type: keyword.kind === 'OUT' ? 'OPT_OUT' : 'OPT_IN',
          keyword: keyword.keyword,
          inboundSmsId: inbound.id,
        },
      });
      await tx.inboundSms.update({ where: { id: inbound.id }, data: { handledAt: new Date() } });
      await appendAudit(tx, {
        churchId,
        action: `sms.keyword.${keyword.kind.toLowerCase()}`,
        entity: 'SmsOptOut',
        entityId: from,
        after: { keyword: keyword.keyword },
      });
    });

    // Confirmation reply (REPLY source is opt-out exempt, so it always sends).
    await withTenant(churchId, null, async (tx) => {
      const r = await this.sms.dispatch(tx, {
        churchId,
        toE164: from,
        body:
          keyword.kind === 'OUT'
            ? 'You have been unsubscribed from church messages. Reply START to re-subscribe.'
            : 'You have been re-subscribed to church messages.',
        source: 'REPLY',
        idempotencyKey: `optconfirm:${keyword.kind}:${from}:${inbound.id}`,
      });
      if (r.status === 'QUEUED') this.sms.flush(r);
    });

    return { status: keyword.kind === 'OUT' ? 'opted_out' : 'opted_in' };
  }
}
