// Church subscription billing: Paystack checkout, cash claims confirmed by the
// platform office, and the lock/grace state machine. Every read is
// platform-scoped because the sweeper and the support office act across
// churches; church-facing methods filter by the caller's churchId.
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { appendAudit, platformPrisma as prisma, withPlatform } from '@chms/db';
import { formatGhs, uuidv7 } from '@chms/shared';
import { AuthUser } from '../common/guards';
import type { Env } from '../env';
import { PaymentProvider } from '../platform/payment-provider';
import {
  BillingSnapshot,
  DEFAULT_GRACE_DAYS,
  deriveBilling,
  extendCoverage,
  periodEnd,
  periodForCoverage,
} from './billing.logic';

type ChurchBillingRow = {
  id: string;
  name: string;
  slug: string;
  monthlyFeeMinor: number;
  billingDay: number;
  graceDays: number;
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  billingPausedAt: Date | null;
  billingExempt: boolean;
  billingEmail: string | null;
  billingPhone: string | null;
  billingNote: string | null;
};

const CHURCH_BILLING_SELECT = {
  id: true,
  name: true,
  slug: true,
  monthlyFeeMinor: true,
  billingDay: true,
  graceDays: true,
  trialEndsAt: true,
  paidUntil: true,
  billingPausedAt: true,
  billingExempt: true,
  billingEmail: true,
  billingPhone: true,
  billingNote: true,
} as const;

export type CashMethod = 'CASH' | 'TRANSFER';

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');
  private readonly cache = new Map<string, { at: number; snap: BillingSnapshot }>();

  constructor(
    @Inject('ENV') private readonly env: Env,
    private readonly provider: PaymentProvider,
  ) {}

  /** Lock state for the request guard; 30s cache keeps it off the hot path. */
  async snapshot(churchId: string): Promise<BillingSnapshot> {
    const hit = this.cache.get(churchId);
    if (hit && Date.now() - hit.at < 30_000) return hit.snap;
    const church = await prisma.church.findUnique({
      where: { id: churchId },
      select: { trialEndsAt: true, paidUntil: true, graceDays: true, billingExempt: true },
    });
    // A missing church is not a billing problem; let the route answer with 404.
    const snap = church
      ? deriveBilling(church, new Date())
      : { state: 'grandfathered', locked: false, coveredUntil: null, locksAt: null, daysLeft: 0, graceDaysLeft: 0 } as BillingSnapshot;
    this.cache.set(churchId, { at: Date.now(), snap });
    if (this.cache.size > 1000) this.cache.clear();
    return snap;
  }

  private forget(churchId: string): void {
    this.cache.delete(churchId);
  }

  private webOrigin(): string {
    return (this.env.WEB_URL.split(',')[0] ?? '').trim().replace(/\/+$/, '');
  }

  private nextPlan(church: ChurchBillingRow, now: Date) {
    const paidUntil = extendCoverage(church.paidUntil, now, church.billingDay);
    return { paidUntil, period: periodForCoverage(paidUntil) };
  }

  /** Summary for the signed-in church (Settings → Billing and the lock screen). */
  async status(user: AuthUser) {
    const church = await prisma.church.findUnique({
      where: { id: user.churchId },
      select: CHURCH_BILLING_SELECT,
    });
    if (!church) throw new NotFoundException('church not found');
    return this.present(church, new Date());
  }

  async present(church: ChurchBillingRow, now: Date) {
    const snap = deriveBilling(church, now);
    const plan = church.billingExempt ? null : this.nextPlan(church, now);
    return {
      ...snap,
      plan: church.billingExempt ? 'exempt' : 'standard',
      amountMinor: church.monthlyFeeMinor,
      amountLabel: formatGhs(church.monthlyFeeMinor),
      billingDay: church.billingDay,
      graceDays: church.graceDays ?? DEFAULT_GRACE_DAYS,
      billingEmail: church.billingEmail,
      billingPhone: church.billingPhone,
      billingNote: church.billingNote,
      /** What the next payment would cover, when one is needed. */
      nextPeriod: plan?.period ?? null,
      coverageEndsAt: snap.coveredUntil,
      pausedAt: church.billingPausedAt,
      church: { name: church.name, slug: church.slug },
    };
  }

  /** Settings → Billing: Paystack checkout for the next uncovered month. */
  async checkout(user: AuthUser, ip?: string) {
    const church = await prisma.church.findUnique({
      where: { id: user.churchId },
      select: CHURCH_BILLING_SELECT,
    });
    if (!church) throw new NotFoundException('church not found');
    if (church.billingExempt) throw new BadRequestException('this church does not pay a subscription');

    const now = new Date();
    const plan = this.nextPlan(church, now);
    const existing = await prisma.subscriptionPayment.findUnique({
      where: { churchId_period: { churchId: church.id, period: plan.period } },
    });
    if (existing?.status === 'PAID') throw new ConflictException(`the ${plan.period} month is already paid`);
    if (existing && existing.method !== 'PAYSTACK' && existing.status === 'PENDING') {
      throw new ConflictException('a cash payment for this month is waiting for confirmation');
    }

    const reference = `sub_${uuidv7()}`;
    const data = {
      amountMinor: church.monthlyFeeMinor,
      method: 'PAYSTACK' as const,
      status: 'PENDING' as const,
      reference,
      paidAt: null,
      providerRef: null,
    };
    const row = existing
      ? await prisma.subscriptionPayment.update({ where: { id: existing.id }, data })
      : await prisma.subscriptionPayment.create({
          data: { churchId: church.id, period: plan.period, ...data },
        });

    const init = await this.provider.initialize({
      reference,
      amountMinor: church.monthlyFeeMinor,
      currency: 'GHS',
      email: church.billingEmail ?? undefined,
      callbackUrl: `${this.webOrigin()}/settings?billing=paid`,
      metadata: { kind: 'subscription', churchId: church.id, period: plan.period },
    });

    await withPlatform((tx) =>
      appendAudit(tx, {
        churchId: church.id,
        actorId: user.userId,
        action: 'billing.checkout',
        entity: 'SubscriptionPayment',
        entityId: row.id,
        after: { period: plan.period, amountMinor: church.monthlyFeeMinor, reference },
        ip,
      }),
    );

    return {
      paymentId: row.id,
      reference,
      authorizationUrl: init.authorizationUrl,
      period: plan.period,
      amountMinor: church.monthlyFeeMinor,
      amountLabel: formatGhs(church.monthlyFeeMinor),
    };
  }

  /**
   * "We paid cash at the office." Does NOT unlock on its own: the platform
   * office confirms it (confirmCash) once the money is seen.
   */
  async claimCash(user: AuthUser, input: { method?: string; note?: string; payerName?: string }, ip?: string) {
    const method = (input.method ?? 'CASH').toUpperCase();
    if (method !== 'CASH' && method !== 'TRANSFER') {
      throw new BadRequestException('method must be CASH or TRANSFER');
    }
    const church = await prisma.church.findUnique({
      where: { id: user.churchId },
      select: CHURCH_BILLING_SELECT,
    });
    if (!church) throw new NotFoundException('church not found');
    if (church.billingExempt) throw new BadRequestException('this church does not pay a subscription');

    const now = new Date();
    const plan = this.nextPlan(church, now);
    const existing = await prisma.subscriptionPayment.findUnique({
      where: { churchId_period: { churchId: church.id, period: plan.period } },
    });
    if (existing?.status === 'PAID') throw new ConflictException(`the ${plan.period} month is already paid`);

    const data = {
      amountMinor: church.monthlyFeeMinor,
      method: method as CashMethod,
      status: 'PENDING' as const,
      reference: `subclaim_${uuidv7()}`,
      recordedById: user.userId,
      recordedByName: input.payerName?.trim() || user.name,
      note: input.note?.trim() || null,
      paidAt: null,
      providerRef: null,
    };
    const row = existing
      ? await prisma.subscriptionPayment.update({ where: { id: existing.id }, data })
      : await prisma.subscriptionPayment.create({
          data: { churchId: church.id, period: plan.period, ...data },
        });

    await withPlatform((tx) =>
      appendAudit(tx, {
        churchId: church.id,
        actorId: user.userId,
        action: 'billing.claim.cash',
        entity: 'SubscriptionPayment',
        entityId: row.id,
        after: { period: plan.period, method, note: data.note },
        ip,
      }),
    );
    return { ...row, awaitingConfirmation: true };
  }

  history(user: AuthUser) {
    return prisma.subscriptionPayment.findMany({
      where: { churchId: user.churchId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Paystack webhook entry (signature already verified by the controller). */
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
    try {
      await prisma.processedWebhookEvent.create({ data: { provider: 'paystack', eventKey } });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { status: 'duplicate' };
      throw e;
    }

    const row = await prisma.subscriptionPayment.findUnique({ where: { reference } });
    if (!row) return { status: 'unknown_reference' };

    if (eventName === 'charge.success') {
      const currency = String(data.currency ?? '').toUpperCase();
      if (currency !== 'GHS') {
        this.logger.error(`subscription currency mismatch ref=${reference} got=${currency}`);
        return { status: 'currency_mismatch' };
      }
      const amount = Number(data.amount ?? 0);
      if (amount !== row.amountMinor) {
        this.logger.error(`subscription amount mismatch ref=${reference} expected=${row.amountMinor} got=${amount}`);
        return { status: 'amount_mismatch' };
      }
      const updated = await prisma.subscriptionPayment.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          paidAt: data.paid_at ? new Date(String(data.paid_at)) : new Date(),
          providerRef: data.id ? String(data.id) : null,
        },
      });
      if (updated.count === 0) return { status: 'already_settled' };
      await this.activate(row.churchId, row.period, 'billing.payment.paid', row.id);
      return { status: 'settled' };
    }

    if (eventName === 'charge.failed' || eventName === 'charge.abandoned') {
      const updated = await prisma.subscriptionPayment.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: eventName === 'charge.failed' ? 'FAILED' : 'CANCELLED' },
      });
      if (updated.count > 0) {
        await withPlatform((tx) =>
          appendAudit(tx, {
            churchId: row.churchId,
            action: `billing.${eventName}`,
            entity: 'SubscriptionPayment',
            entityId: row.id,
            after: { reference },
          }),
        );
      }
      return { status: updated.count > 0 ? 'marked_failed' : 'already_settled' };
    }

    return { status: 'ignored' };
  }

  findByReference(reference: string) {
    return prisma.subscriptionPayment.findUnique({ where: { reference } });
  }

  /** Dev-only: drive the same handlePaystackEvent path as a real webhook. */
  async completeMock(reference: string, success: boolean) {
    const row = await this.findByReference(reference);
    if (!row) throw new BadRequestException('unknown subscription reference');
    return this.handlePaystackEvent({
      id: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      event: success ? 'charge.success' : 'charge.failed',
      data: {
        reference,
        amount: row.amountMinor,
        currency: 'GHS',
        channel: 'card',
        paid_at: new Date().toISOString(),
        gateway_response: success ? 'Successful' : 'Declined',
      },
    });
  }

  /**
   * Platform office: money was received in cash/bank, unlock the church.
   * Compare-and-set on PENDING so a double click cannot extend twice.
   */
  async confirmCash(
    paymentId: string,
    actor: { id: string; name: string },
    ip?: string,
  ) {
    const row = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('payment not found');
    if (row.status === 'PAID') return row;

    const updated = await prisma.subscriptionPayment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        recordedById: actor.id,
        recordedByName: actor.name,
      },
    });
    if (updated.count === 0) throw new ConflictException('payment is not awaiting confirmation');

    await this.activate(row.churchId, row.period, 'billing.cash.confirmed', row.id, actor.id, ip);
    return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  async cancelPayment(paymentId: string, actorId?: string, ip?: string) {
    const row = await prisma.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!row) throw new NotFoundException('payment not found');
    if (row.status === 'PAID') throw new ConflictException('a paid month cannot be cancelled');
    const updated = await prisma.subscriptionPayment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    if (updated.count > 0) {
      await withPlatform((tx) =>
        appendAudit(tx, {
          churchId: row.churchId,
          actorId: actorId ?? null,
          action: 'billing.payment.cancelled',
          entity: 'SubscriptionPayment',
          entityId: row.id,
          after: { period: row.period },
          ip,
        }),
      );
    }
    return prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  /** Extend coverage to at least the paid month and clear any pause. */
  private async activate(
    churchId: string,
    period: string,
    action: string,
    paymentId: string,
    actorId?: string,
    ip?: string,
  ) {
    const church = await prisma.church.findUnique({
      where: { id: churchId },
      select: { paidUntil: true, billingDay: true, billingPausedAt: true },
    });
    if (!church) return;
    const now = new Date();
    const extended = extendCoverage(church.paidUntil, now, church.billingDay);
    const target = periodEnd(period);
    const paidUntil = extended.getTime() > target.getTime() ? extended : target;

    await prisma.church.update({
      where: { id: churchId },
      data: { paidUntil, billingPausedAt: null },
    });
    this.forget(churchId);

    await withPlatform((tx) =>
      appendAudit(tx, {
        churchId,
        actorId: actorId ?? null,
        action,
        entity: 'SubscriptionPayment',
        entityId: paymentId,
        before: { paidUntil: church.paidUntil, billingPausedAt: church.billingPausedAt },
        after: { paidUntil, period },
        ip,
      }),
    );
  }

  /**
   * Daily sweep (worker): stamp billingPausedAt when grace is over and clear it
   * when a church has paid. The guard derives from dates, so the stamps are
   * for reporting and for the "paused since" line on the lock screen.
   */
  async sweep(now = new Date()): Promise<{ paused: number; resumed: number }> {
    const churches = await prisma.church.findMany({
      where: {
        billingExempt: false,
        NOT: { AND: [{ trialEndsAt: null }, { paidUntil: null }] },
      },
      select: {
        id: true,
        trialEndsAt: true,
        paidUntil: true,
        graceDays: true,
        billingExempt: true,
        billingPausedAt: true,
      },
    });
    let paused = 0;
    let resumed = 0;
    for (const church of churches) {
      const snap = deriveBilling(church, now);
      if (snap.locked && !church.billingPausedAt) {
        await prisma.church.update({ where: { id: church.id }, data: { billingPausedAt: now } });
        this.forget(church.id);
        await withPlatform((tx) =>
          appendAudit(tx, {
            churchId: church.id,
            action: 'billing.pause',
            entity: 'Church',
            entityId: church.id,
            after: { locksAt: snap.locksAt },
          }),
        );
        paused += 1;
      } else if (!snap.locked && church.billingPausedAt) {
        await prisma.church.update({ where: { id: church.id }, data: { billingPausedAt: null } });
        this.forget(church.id);
        resumed += 1;
      }
    }
    return { paused, resumed };
  }
}
