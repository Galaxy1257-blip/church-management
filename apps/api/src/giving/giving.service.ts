// Paystack giving: quote -> initialize -> signed webhook -> settle worker.
// Money is integer pesewas end-to-end; the fund is credited giftMinor and the
// gateway charges chargedMinor. Webhook processing is compare-and-set on
// status so a duplicate delivery can never double-credit or double-receipt.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendAudit, Db, platformPrisma as prisma, withPlatform } from '@chms/db';
import {
  FeeMode,
  FeeSettings,
  formatGhs,
  normalizeGhPhone,
  quote as feeQuote,
  uuidv7,
} from '@chms/shared';
import { TenantService } from '../common/tenant';
import { AuthUser } from '../common/guards';
import { PaymentProvider } from '../platform/payment-provider';
import { QueuesService } from '../queues/queues.module';

export interface QuoteInput {
  fundId: string;
  amountMinor: number;
  feeChoice?: boolean;
}

export interface InitializeGiftInput extends QuoteInput {
  giverName?: string;
  giverPhoneE164?: string;
  isAnonymous?: boolean;
  returnUrl?: string;
}

@Injectable()
export class GivingService {
  private readonly logger = new Logger('Giving');

  constructor(
    private readonly tenant: TenantService,
    private readonly provider: PaymentProvider,
    private readonly queues: QueuesService,
  ) {}

  private async feeSettings(tx: Db, churchId: string): Promise<FeeSettings> {
    const s = await tx.churchGivingSettings.findUnique({ where: { churchId } });
    return {
      feeMode: (s?.feeMode ?? 'CHURCH_ABSORBS') as FeeMode,
      feeBps: s?.feeBps ?? 195,
      feeFlatMinor: s?.feeFlatMinor ?? 10,
      feeCapMinor: s?.feeCapMinor ?? null,
    };
  }

  funds(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.fund.findMany({ where: { churchId: user.churchId, isActive: true }, orderBy: { name: 'asc' } }),
    );
  }

  async quote(user: AuthUser, input: QuoteInput) {
    return this.tenant.run(user, async (tx) => {
      const fund = await tx.fund.findFirst({
        where: { id: input.fundId, churchId: user.churchId, isActive: true },
      });
      if (!fund) throw new NotFoundException('fund not found');
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new BadRequestException('amountMinor must be a positive integer (pesewas)');
      }
      const settings = await this.feeSettings(tx, user.churchId);
      return feeQuote(input.amountMinor, settings, { feeChoice: input.feeChoice });
    });
  }

  async initialize(user: AuthUser, input: InitializeGiftInput, ip?: string) {
    const phone = input.giverPhoneE164 ? normalizeGhPhone(input.giverPhoneE164) : null;
    return this.tenant.run(user, async (tx) => {
      const fund = await tx.fund.findFirst({
        where: { id: input.fundId, churchId: user.churchId, isActive: true },
      });
      if (!fund) throw new NotFoundException('fund not found');
      if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
        throw new BadRequestException('amountMinor must be a positive integer (pesewas)');
      }
      const settings = await this.feeSettings(tx, user.churchId);
      const q = feeQuote(input.amountMinor, settings, { feeChoice: input.feeChoice });

      const reference = `chms_${uuidv7()}`;
      const txRow = await tx.transaction.create({
        data: {
          churchId: user.churchId,
          fundId: fund.id,
          giverName: input.giverName?.trim() || null,
          giverPhoneE164: phone,
          giftMinor: q.giftMinor,
          feeCoverMinor: q.feeCoverMinor,
          chargedMinor: q.chargedMinor,
          feeEstimateMinor: q.feeMinor,
          currency: 'GHS',
          status: 'PENDING',
          reference,
          isAnonymous: input.isAnonymous ?? false,
        },
      });

      const init = await this.provider.initialize({
        reference,
        amountMinor: q.chargedMinor,
        currency: 'GHS',
        callbackUrl: input.returnUrl,
        metadata: { churchId: user.churchId, fundId: fund.id, kind: 'giving' },
      });

      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'giving.initialize',
        entity: 'Transaction',
        entityId: txRow.id,
        after: { reference, giftMinor: q.giftMinor, chargedMinor: q.chargedMinor, fundId: fund.id },
        ip,
      });

      return {
        transactionId: txRow.id,
        authorizationUrl: init.authorizationUrl,
        reference,
        quote: q,
        amountLabel: formatGhs(q.chargedMinor),
      };
    });
  }

  /**
   * Webhook entry (HMAC already verified by the controller). Handles
   * charge.success / charge.failed / charge.abandoned. Replayed events are
   * deduped at the provider level (ProcessedWebhookEvent) and the status flip
   * is compare-and-set, so a duplicate delivery can never double-credit.
   */
  async handlePaystackEvent(event: {
    id?: string | number;
    event?: string;
    data?: Record<string, any>;
  }): Promise<{ status: string }> {
    const eventName = event.event;
    const data = event.data ?? {};
    const reference: string | undefined = data.reference;
    if (!reference || !eventName) return { status: 'ignored' };

    const eventKey = String(event.id ?? `${eventName}:${reference}`);
    // ProcessedWebhookEvent has no churchId (platform table, not RLS-scoped).
    try {
      await prisma.processedWebhookEvent.create({ data: { provider: 'paystack', eventKey } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { status: 'duplicate' };
      throw e;
    }

    const txRow = await prisma.transaction.findUnique({ where: { reference } });
    if (!txRow) return { status: 'unknown_reference' };

    if (eventName === 'charge.success') {
      const paidAmount = Number(data.amount ?? 0);
      const currency = String(data.currency ?? '').toUpperCase();
      if (currency !== txRow.currency) {
        await this.flagMismatch(txRow.id, txRow.churchId, 'currency', {
          expected: txRow.currency,
          got: currency,
        });
        return { status: 'currency_mismatch' };
      }
      // Amount check against chargedMinor (the gateway charge, not the gift).
      if (paidAmount !== txRow.chargedMinor) {
        await this.flagMismatch(txRow.id, txRow.churchId, 'amount', {
          expected: txRow.chargedMinor,
          got: paidAmount,
        });
        return { status: 'amount_mismatch' };
      }
      const updated = await prisma.transaction.updateMany({
        where: { id: txRow.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          status: 'SUCCESS',
          paidAt: data.paid_at ? new Date(String(data.paid_at)) : new Date(),
          channel: mapChannel(data.channel),
          paystackTxId: data.id ? BigInt(String(data.id)) : null,
          gatewayResponse: data.gateway_response ?? undefined,
        },
      });
      if (updated.count === 0) return { status: 'already_settled' };

      await this.auditOutsideTx(txRow.churchId, 'giving.settle.success', txRow.id, {
        paidAmount,
        reference,
      });
      this.queues.enqueueGivingSettle(txRow.id);
      return { status: 'settled' };
    }

    if (eventName === 'charge.failed' || eventName === 'charge.abandoned') {
      const updated = await prisma.transaction.updateMany({
        where: { id: txRow.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          status: eventName === 'charge.failed' ? 'FAILED' : 'ABANDONED',
          failureCode: String(data.gateway_response ?? eventName),
          gatewayResponse: data as any,
        },
      });
      if (updated.count > 0) {
        await this.auditOutsideTx(txRow.churchId, `giving.${eventName}`, txRow.id, { reference });
        this.queues.enqueueGivingSettle(txRow.id); // worker sends the retry nudge
      }
      return { status: updated.count > 0 ? 'marked_failed' : 'already_settled' };
    }

    return { status: 'ignored' };
  }

  private async flagMismatch(txId: string, churchId: string, kind: string, detail: unknown): Promise<void> {
    await prisma.transaction.updateMany({
      where: { id: txId, status: { in: ['PENDING', 'PROCESSING'] } },
      data: { status: 'PROCESSING', gatewayResponse: { flag: kind, detail } as any },
    });
    await prisma.alertState.upsert({
      where: { churchId_key: { churchId, key: `giving_mismatch_${kind}` } },
      create: { churchId, key: `giving_mismatch_${kind}`, level: 1 },
      update: { level: { increment: 1 } },
    });
    this.logger.error(`giving ${kind} mismatch tx=${txId}: ${JSON.stringify(detail)}`);
  }

  private async auditOutsideTx(churchId: string, action: string, txId: string, after: unknown): Promise<void> {
    await withPlatform((tx) =>
      appendAudit(tx, { churchId, action, entity: 'Transaction', entityId: txId, after }),
    );
  }

  async findByReference(reference: string) {
    return prisma.transaction.findUnique({ where: { reference } });
  }

  /** R4.4 customisation: church manages its own fund list (Ghana-typical seeds + custom). */
  saveFund(
    user: AuthUser,
    input: { id?: string; name: string; type: string; isActive?: boolean },
    ip?: string,
  ) {
    const allowed = ['TITHE', 'OFFERING', 'WELFARE', 'BUILDING', 'MISSIONS', 'SEED', 'EVENT', 'OTHER', 'FIRST_FRUIT', 'THANKSGIVING', 'HARVEST', 'ANNIVERSARY'];
    if (!allowed.includes(input.type)) throw new BadRequestException(`unknown fund type ${input.type}`);
    return this.tenant.run(user, async (tx) => {
      let fund;
      if (input.id) {
        fund = await tx.fund.update({
          where: { id: input.id },
          data: { name: input.name, type: input.type as never, isActive: input.isActive ?? true },
        });
      } else {
        const dupe = await tx.fund.findFirst({ where: { churchId: user.churchId, name: input.name } });
        if (dupe) throw new BadRequestException(`fund "${input.name}" already exists`);
        fund = await tx.fund.create({
          data: { churchId: user.churchId, name: input.name, type: input.type as never, isActive: input.isActive ?? true },
        });
      }
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: input.id ? 'fund.update' : 'fund.create',
        entity: 'Fund',
        entityId: fund.id,
        after: fund,
        ip,
      });
      return fund;
    });
  }

  fundsAdmin(user: AuthUser) {
    return this.tenant.run(user, (tx) =>
      tx.fund.findMany({ where: { churchId: user.churchId }, orderBy: { name: 'asc' } }),
    );
  }

  /** Fee model customisation (e.g. 1.95% + 10p, cap, who absorbs). */
  feeSettingsAdmin(user: AuthUser) {
    return this.tenant.run(user, async (tx) => {
      const s = await tx.churchGivingSettings.findUnique({ where: { churchId: user.churchId } });
      return (
        s ?? { churchId: user.churchId, feeMode: 'CHURCH_ABSORBS', feeBps: 195, feeFlatMinor: 10, feeCapMinor: null, feeDefaultOptIn: true }
      );
    });
  }

  saveFeeSettings(
    user: AuthUser,
    patch: { feeMode?: string; feeBps?: number; feeFlatMinor?: number; feeCapMinor?: number | null; feeDefaultOptIn?: boolean },
    ip?: string,
  ) {
    return this.tenant.run(user, async (tx) => {
      if (patch.feeMode && !['CHURCH_ABSORBS', 'GIVER_ABSORBS', 'GIVER_CHOICE'].includes(patch.feeMode)) {
        throw new BadRequestException('bad feeMode');
      }
      const s = await tx.churchGivingSettings.upsert({
        where: { churchId: user.churchId },
        create: {
          churchId: user.churchId,
          feeMode: (patch.feeMode as never) ?? 'CHURCH_ABSORBS',
          feeBps: patch.feeBps ?? 195,
          feeFlatMinor: patch.feeFlatMinor ?? 10,
          feeCapMinor: patch.feeCapMinor ?? null,
          feeDefaultOptIn: patch.feeDefaultOptIn ?? true,
        },
        update: {
          ...(patch.feeMode ? { feeMode: patch.feeMode as never } : {}),
          ...(patch.feeBps !== undefined ? { feeBps: patch.feeBps } : {}),
          ...(patch.feeFlatMinor !== undefined ? { feeFlatMinor: patch.feeFlatMinor } : {}),
          ...(patch.feeCapMinor !== undefined ? { feeCapMinor: patch.feeCapMinor } : {}),
          ...(patch.feeDefaultOptIn !== undefined ? { feeDefaultOptIn: patch.feeDefaultOptIn } : {}),
        },
      });
      await appendAudit(tx, {
        churchId: user.churchId,
        actorId: user.userId,
        action: 'giving.fees.update',
        entity: 'ChurchGivingSettings',
        entityId: user.churchId,
        after: s,
        ip,
      });
      return s;
    });
  }

  transactions(user: AuthUser, opts: { status?: string; limit?: number } = {}) {
    return this.tenant.run(user, (tx) =>
      tx.transaction.findMany({
        where: { churchId: user.churchId, ...(opts.status ? { status: opts.status as any } : {}) },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, opts.limit ?? 50),
        include: { fund: { select: { name: true } } },
      }),
    );
  }
}

function mapChannel(raw: unknown): 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | null {
  switch (String(raw)) {
    case 'mobile_money':
      return 'MOBILE_MONEY';
    case 'card':
      return 'CARD';
    case 'bank_transfer':
      return 'BANK_TRANSFER';
    default:
      return null;
  }
}

/** Verify a Paystack HMAC SHA512 signature over the raw request body. */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Secret used to verify Paystack signatures. In mock mode an empty key falls
 * back to a fixed dev secret so the local loop (dev simulation -> webhook)
 * works without real sandbox credentials. Live mode requires a real key
 * (PaymentProvider construction already enforces that).
 */
export function paystackSecret(env: { PAYSTACK_MODE: string; PAYSTACK_SECRET_KEY: string }): string {
  if (env.PAYSTACK_SECRET_KEY) return env.PAYSTACK_SECRET_KEY;
  if (env.PAYSTACK_MODE === 'mock') return 'dev-secret';
  return '';
}
