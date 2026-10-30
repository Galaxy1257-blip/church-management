// Integration tests: require a live Postgres (TEST_DATABASE_URL) with the
// schema + extras.sql applied and app_user/platform_user roles present.
// They run in CI; locally they skip when TEST_DATABASE_URL is unset.
// Phase 1 release gates: tenant isolation, duplicate webhook concurrency,
// headcount replay idempotency, opt-out suppression, two-counter rules.
import { describe, expect, it, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/auth/auth.service';
import { ChurchesService } from '../src/churches/churches.service';
import { TenantService } from '../src/common/tenant';
import type { AuthUser } from '../src/common/guards';
import { MembersService } from '../src/members/members.service';
import { ServicesService } from '../src/services/services.service';
import { HeadcountService } from '../src/headcount/headcount.service';
import { GivingService } from '../src/giving/giving.service';
import { MockPaymentProvider } from '../src/platform/payment-provider';
import { BillingService } from '../src/billing/billing.service';
import { SmsService } from '../src/sms/sms.service';
import { SmsDispatcher } from '../src/sms/sms-dispatcher';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { FinanceService } from '../src/finance/finance.service';
import { platformPrisma, withTenant } from '@chms/db';
import { normalizeGhPhone, uuidv7 } from '@chms/shared';

const hasDb = !!process.env.TEST_DATABASE_URL;
const d = describe.runIf(hasDb);

const fakeEnv: any = {
  PLATFORM_SIGNUP_KEY: 'integration-key',
  JWT_SECRET: 'integration-secret-32-chars-min!',
  PAYSTACK_MODE: 'mock',
  PAYSTACK_SECRET_KEY: '',
  WEB_URL: 'http://localhost:3000',
  SMS_WEBHOOK_SECRET: 'test-sms-secret',
  // Only AuthService needs these; verifyOtp -> issueTokens signs with them.
  ACCESS_TOKEN_TTL_SEC: 900,
  REFRESH_TOKEN_TTL_SEC: 2_592_000,
};

const fakeQueues: any = {
  enqueueSmsSend: () => undefined,
  enqueueGivingSettle: () => undefined,
  enqueueCampaignSend: () => undefined,
  enqueueVerifyPending: () => undefined,
};

let seq = 0;
function randPhone(prefix: string): string {
  seq += 1;
  // 7 digits after the 3-char prefix => 10-char Ghana MSISDN (0XXX XXX XXX).
  // slice(-7) keeps uniqueness in the trailing digits (slice(0,n) would not).
  return `${prefix}${String(10000000 + seq).slice(-7)}`;
}

async function makeChurch(slug: string): Promise<{ user: AuthUser; second: AuthUser; third: AuthUser }> {
  const churches = new ChurchesService(fakeEnv);
  const { churchId } = await churches.create({
    platformKey: 'integration-key',
    name: `IT ${slug}`,
    slug,
    admin: { name: 'Admin', phoneE164: randPhone('024'), password: 'password123' },
  });
  const admin = await platformPrisma.user.findFirstOrThrow({ where: { churchId } });
  const secondId = uuidv7();
  const thirdId = uuidv7();
  await platformPrisma.user.create({
    data: { id: secondId, churchId, name: 'Second', phoneE164: randPhone('055') },
  });
  await platformPrisma.user.create({
    data: { id: thirdId, churchId, name: 'Third', phoneE164: randPhone('027') },
  });
  const mk = (id: string, name: string): AuthUser => ({
    userId: id,
    churchId,
    name,
    phoneE164: '',
    roles: ['SUPER_ADMIN'],
    permissions: ['*'],
    branchIds: [],
  });
  return { user: mk(admin.id, 'Admin'), second: mk(secondId, 'Second'), third: mk(thirdId, 'Third') };
}

d('integration', () => {
  let ctx: Awaited<ReturnType<typeof makeChurch>>;
  let tenant: TenantService;

  beforeAll(() => {
    tenant = new TenantService();
  });

  it('creates a church with seeded defaults', async () => {
    ctx = await makeChurch(`it-${Date.now()}`);
    const funds = await platformPrisma.fund.count({ where: { churchId: ctx.user.churchId } });
    const segments = await platformPrisma.headcountSegment.count({ where: { churchId: ctx.user.churchId } });
    const roles = await platformPrisma.role.count({ where: { churchId: ctx.user.churchId } });
    expect(funds).toBeGreaterThanOrEqual(5);
    expect(segments).toBeGreaterThanOrEqual(5);
    expect(roles).toBe(9); // R4 added ELDER + SECRETARY (6 → 8); role tiers added PASTOR (→ 9)
  });

  it('TENANT ISOLATION: church A cannot read church B', async () => {
    const a = await makeChurch(`itA-${Date.now()}`);
    const b = await makeChurch(`itB-${Date.now()}`);
    const members = new MembersService(tenant);
    const created = await members.create(a.user, {
      firstName: 'Secret',
      lastName: 'Person',
      phoneE164: '0241112223',
      ageSegment: 'MEN',
    });
    const listB = await members.list(b.user, {});
    expect(listB.items.map((m) => m.id)).not.toContain(created.id);
    await expect(members.getOne(b.user, created.id)).rejects.toThrow(/not found/);
  });
  it('headcount sync is idempotent under replay (offline outbox)', async () => {
    const services = new ServicesService(tenant);
    const headcount = new HeadcountService(tenant);
    const svc = await services.create(ctx.user, { name: 'Test svc', startsAt: new Date().toISOString() });
    // Use the church's REAL seeded segment keys (age-bracket _M/_W etc) — hardcoding
    // 'MEN'/'WOMEN' predates the bracket-derived segments and got skipped as unknown.
    const segs = await platformPrisma.headcountSegment.findMany({
      where: { churchId: ctx.user.churchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 2,
    });
    const [key1, key2] = segs.map((s) => s.key);
    expect(key1).toBeTruthy();
    expect(key2).toBeTruthy();
    const batch = [
      {
        id: uuidv7(),
        serviceId: svc.id,
        segmentKey: key1,
        delta: 1,
        deviceId: 'dev-1',
        clientSeq: 1,
        recordedAt: new Date().toISOString(),
      },
      {
        id: uuidv7(),
        serviceId: svc.id,
        segmentKey: key2,
        delta: 1,
        deviceId: 'dev-1',
        clientSeq: 2,
        recordedAt: new Date().toISOString(),
      },
    ];
    const first = await headcount.syncBatch(ctx.user, 'dev-1', batch);
    expect(first.applied).toBe(2);
    const replay = await headcount.syncBatch(ctx.user, 'dev-1', batch);
    expect(replay.applied).toBe(0); // already synced — replay is a no-op
    const totals = await headcount.totals(ctx.user, svc.id);
    expect(totals.netTotal).toBe(2); // NOT 4
  });

  it('webhook: duplicate charge.success settles once (one SUCCESS, no double settle)', async () => {
    const funds = new GivingService(tenant, new MockPaymentProvider(fakeEnv), fakeQueues);
    const fund = await platformPrisma.fund.findFirst({ where: { churchId: ctx.user.churchId } });
    const init = await funds.initialize(ctx.user, {
      fundId: fund!.id,
      amountMinor: 10000,
      giverPhoneE164: '0249998887',
    });
    const event = {
      // Per-run event id: processedWebhookEvent is unique on (provider, eventKey)
      // globally, so a hardcoded id makes the second test run look like a replay.
      id: `evt_dup_${Date.now()}`,
      event: 'charge.success',
      data: {
        reference: init.reference,
        amount: init.quote.chargedMinor,
        currency: 'GHS',
        channel: 'mobile_money',
        paid_at: new Date().toISOString(),
      },
    };
    expect((await funds.handlePaystackEvent(event)).status).toBe('settled');
    expect((await funds.handlePaystackEvent(event)).status).toBe('duplicate'); // same event id
    // Different event id, same reference: compare-and-set rejects the flip.
    expect((await funds.handlePaystackEvent({ ...event, id: `${event.id}_b` })).status).toBe('already_settled');
    const txRow = await platformPrisma.transaction.findUnique({ where: { reference: init.reference } });
    expect(txRow?.status).toBe('SUCCESS');
    expect(txRow?.receiptSent).toBe(false); // worker sends exactly one receipt later
  });

  it('webhook: amount mismatch does not settle (held in PROCESSING)', async () => {
    const funds = new GivingService(tenant, new MockPaymentProvider(fakeEnv), fakeQueues);
    const fund = await platformPrisma.fund.findFirst({ where: { churchId: ctx.user.churchId } });
    const init = await funds.initialize(ctx.user, { fundId: fund!.id, amountMinor: 5000 });
    const res = await funds.handlePaystackEvent({
      id: `evt_mismatch_${Date.now()}`,
      event: 'charge.success',
      data: { reference: init.reference, amount: init.quote.chargedMinor + 1, currency: 'GHS' },
    });
    expect(res.status).toBe('amount_mismatch');
    const txRow = await platformPrisma.transaction.findUnique({ where: { reference: init.reference } });
    expect(txRow?.status).toBe('PROCESSING'); // flagged, not credited
  });

  it('opt-out keyword suppresses later campaign sends', async () => {
    const members = new MembersService(tenant);
    const dispatcher = new SmsDispatcher(fakeQueues);
    const smsSvc = new SmsService(tenant, dispatcher, fakeQueues);
    const hooks = new WebhooksService(fakeEnv, dispatcher);
    // Per-run number: SmsLog is unique on idempotencyKey, and the seeded seq helper
    // restarts at 1 every run, so derive the last 7 digits from the clock instead.
    const phone = `055${String(Date.now()).slice(-7)}`;
    await members.create(ctx.user, { firstName: 'Stop', lastName: 'Tester', phoneE164: phone, ageSegment: 'MEN' });

    // handleInbound resolves the church from the most recent OUTBOUND SmsLog to
    // this phone — production always has one before a STOP reply arrives, so
    // dispatch a real (queued) message first. IT churches have no seeded SMS
    // wallet, so top it up first (otherwise NO_BALANCE => SUPPRESSED).
    await platformPrisma.smsWallet.upsert({
      where: { churchId: ctx.user.churchId },
      create: { churchId: ctx.user.churchId, balanceUnits: 100 },
      update: { balanceUnits: { increment: 100 } },
    });
    await withTenant(ctx.user.churchId, ctx.user.userId, async (tx) => {
      const r = await dispatcher.dispatch(tx, {
        churchId: ctx.user.churchId,
        toE164: phone,
        body: 'Hello church',
        source: 'CAMPAIGN',
        idempotencyKey: `it_outbound:${phone}`,
      });
      expect(r.status).toBe('QUEUED');
    });

    const before = await smsSvc.previewCampaign(ctx.user, { body: 'Hello church', audience: {} });
    expect(before.recipients).toBeGreaterThan(0);

    const outcome = await hooks.handleInbound({ fromE164: phone, body: 'STOP', providerId: `pv_${Date.now()}` });
    expect(outcome.status).toBe('opted_out');
    // handleInbound stores the NORMALISED sender — look it up the same way.
    const optOut = await platformPrisma.smsOptOut.findUnique({
      where: { churchId_phoneE164: { churchId: ctx.user.churchId, phoneE164: normalizeGhPhone(phone) } },
    });
    expect(optOut).not.toBeNull();

    const after = await smsSvc.previewCampaign(ctx.user, { body: 'Hello church', audience: {} });
    expect(after.recipients).toBe(before.recipients - 1);
  });

  it('finance batches enforce two counters and a separate approver', async () => {
    const finance = new FinanceService(tenant);
    const services = new ServicesService(tenant);
    const svc = await services.create(ctx.user, { name: 'Cash svc', startsAt: new Date().toISOString() });
    const batch = await finance.createBatch(ctx.user, { serviceId: svc.id, label: 'Sunday' });

    await finance.recordCount(ctx.user, batch.id, 10000);
    await expect(finance.recordCount(ctx.user, batch.id, 10000)).rejects.toThrow(/second person/);
    await expect(finance.recordCount(ctx.second, batch.id, 9999)).rejects.toThrow(/count mismatch/);
    const counted = await finance.recordCount(ctx.second, batch.id, 10000);
    expect(counted.status).toBe('COUNTED');

    // Approver must be neither counter: user (counter 1) is rejected;
    // third user would succeed (assert only the rejection to keep it fast).
    await expect(finance.approve(ctx.user, batch.id)).rejects.toThrow(/other than the two counters/);
    const approved = await finance.approve(ctx.third, batch.id);
    expect(approved.status).toBe('APPROVED');
  });

  it('MEMBER NO: concurrent creates stay unique and a deleted number is never reused', async () => {
    const members = new MembersService(tenant);
    const church = await makeChurch(`itm-${Date.now()}`);

    // Same tick on purpose: the old count()+1 read the same value for every
    // caller and the second insert died with P2002 on @@unique([churchId, memberNo]).
    const created = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        members.create(church.user, { firstName: `N${i}`, lastName: 'Race', ageSegment: 'MEN' }),
      ),
    );
    const numbers = created.map((m) => m.memberNo);
    expect(new Set(numbers).size).toBe(numbers.length); // no duplicates
    for (const no of numbers) expect(no).toMatch(/^M\d{5}$/);

    // Soft-delete lowers count() but must NOT hand the number out again.
    const victim = created[created.length - 1];
    if (!victim) throw new Error('no member created');
    await platformPrisma.member.update({ where: { id: victim.id }, data: { deletedAt: new Date() } });
    const after = await members.create(church.user, { firstName: 'After', lastName: 'Delete', ageSegment: 'MEN' });
    expect(after.memberNo).not.toBe(victim.memberNo);
    expect(numbers).not.toContain(after.memberNo);
  });

  it('OTP: a correct code works, and 5 misses burn the challenge even for the right code', async () => {
    // AuthService(email/sms deps unused here): the SMS dispatcher is faked because
    // this test drives verifyOtp directly and never needs to deliver a code.
    const auth = new AuthService(new JwtService(), fakeEnv, {
      dispatch: async () => ({ status: 'SKIPPED' }),
      flush: () => undefined,
    } as any);
    const slug = `ito-${Date.now()}`;
    const church = await makeChurch(slug);
    const admin = await platformPrisma.user.findFirstOrThrow({
      where: { churchId: church.user.churchId, name: 'Admin' },
    });
    // Same formula as AuthService#hashCode (sha256("<code>:<JWT_SECRET>")).
    const hash = (code: string): string =>
      createHash('sha256').update(`${code}:${fakeEnv.JWT_SECRET}`).digest('hex');
    const issueChallenge = (code: string) =>
      withTenant(church.user.churchId, null, (tx) =>
        tx.otpChallenge.create({
          data: {
            churchId: church.user.churchId,
            phoneE164: admin.phoneE164,
            codeHash: hash(code),
            expiresAt: new Date(Date.now() + 5 * 60_000),
          },
        }),
      );

    // Positive control: a live challenge + the correct code still signs in.
    await issueChallenge('111111');
    const tokens = await auth.verifyOtp({ churchSlug: slug, phoneE164: admin.phoneE164, code: '111111' });
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    // Attempt cap: the pre-fix lookup filtered on codeHash, so a wrong code
    // matched no row, `attempts` never moved and 6 digits were brute-forceable
    // for the whole 5-minute TTL.
    const challenge = await issueChallenge('222222');
    for (let i = 1; i <= 5; i += 1) {
      await expect(
        auth.verifyOtp({ churchSlug: slug, phoneE164: admin.phoneE164, code: '000000' }),
      ).rejects.toThrow(/invalid or expired code/);
      const row = await platformPrisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
      expect(row.attempts).toBe(i);
    }

    // The right code is refused too, and the row is burnt, not merely capped.
    await expect(
      auth.verifyOtp({ churchSlug: slug, phoneE164: admin.phoneE164, code: '222222' }),
    ).rejects.toThrow(/invalid or expired code/);
    const burnt = await platformPrisma.otpChallenge.findUniqueOrThrow({ where: { id: challenge.id } });
    expect(burnt.consumedAt).not.toBeNull();
  });

  it('billing: grace pauses, Paystack settles once and unlocks the church', async () => {
    const church = await makeChurch(`itb-${Date.now()}`);
    const billing = new BillingService(fakeEnv, new MockPaymentProvider(fakeEnv));
    // 20 days ago: trial long over, no payment -> past the 7-day grace.
    const lapsed = await platformPrisma.church.update({
      where: { id: church.user.churchId },
      data: { trialEndsAt: new Date(Date.now() - 20 * 86_400_000), paidUntil: null, billingPausedAt: null },
    });
    const before = await billing.status(church.user);
    expect(before.state).toBe('paused');
    expect(before.locked).toBe(true);

    const checkout = await billing.checkout(church.user);
    expect(checkout.reference.startsWith('sub_')).toBe(true);
    expect(checkout.authorizationUrl).toContain('/give/mock-pay?ref=');
    expect(checkout.amountMinor).toBe(lapsed.monthlyFeeMinor);

    const event = {
      id: `evt_sub_${Date.now()}`,
      event: 'charge.success',
      data: { reference: checkout.reference, amount: lapsed.monthlyFeeMinor, currency: 'GHS' },
    };
    expect(await billing.handlePaystackEvent(event)).toEqual({ status: 'settled' });
    expect(await billing.handlePaystackEvent(event)).toEqual({ status: 'duplicate' });

    const after = await billing.status(church.user);
    expect(after.locked).toBe(false);
    expect(after.state).toBe('active');
    const row = await billing.findByReference(checkout.reference);
    expect(row?.status).toBe('PAID');
    // One row per church per period: a second checkout now targets the next month.
    const next = await billing.checkout(church.user);
    expect(next.period).not.toBe(checkout.period);
    await platformPrisma.subscriptionPayment.update({ where: { id: next.paymentId }, data: { status: 'CANCELLED' } });
  });

  it('billing: a cash claim waits for the office and cannot extend twice', async () => {
    const church = await makeChurch(`itc-${Date.now()}`);
    const billing = new BillingService(fakeEnv, new MockPaymentProvider(fakeEnv));
    await platformPrisma.church.update({
      where: { id: church.user.churchId },
      data: { trialEndsAt: new Date(Date.now() - 20 * 86_400_000), paidUntil: null },
    });

    const claim = await billing.claimCash(church.user, { method: 'CASH', note: 'paid at the office' });
    expect(claim.awaitingConfirmation).toBe(true);
    expect((await billing.status(church.user)).locked).toBe(true); // not paid yet

    // audit_event.actor_id is a uuid column, so platform staff are uuidv7 too.
    const staff = { id: uuidv7(), name: 'Support' };
    const paid = await billing.confirmCash(claim.id, staff);
    expect(paid.status).toBe('PAID');
    const status = await billing.status(church.user);
    expect(status.locked).toBe(false);

    const again = await billing.confirmCash(claim.id, staff);
    expect(again.status).toBe('PAID');
    const churchRow = await platformPrisma.church.findUniqueOrThrow({ where: { id: church.user.churchId } });
    expect(churchRow.paidUntil?.getTime()).toBe(status.coveredUntil?.getTime());
  });
});

