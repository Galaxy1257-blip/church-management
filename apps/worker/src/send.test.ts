import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { platformPrisma, withTenant } from '@chms/db';
import { sendSmsLog } from './send';

vi.mock('@chms/db', () => ({
  platformPrisma: {
    smsLog: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    smsCampaign: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  withTenant: vi.fn(),
}));

const now = new Date('2026-11-24T10:00:00.000Z');

function setup(overrides: {
  status?: string;
  source?: string;
  campaignId?: string | null;
  cancelledAt?: Date | null;
  optedOut?: boolean;
} = {}) {
  const row = {
    id: 'sms-1',
    churchId: 'c1',
    source: overrides.source ?? 'CAMPAIGN',
    campaignId: overrides.campaignId ?? null,
    toE164: '+233241234567',
    body: 'Sunday service',
    segments: 1,
    status: overrides.status ?? 'QUEUED',
    idempotencyKey: overrides.source === 'ANNOUNCEMENT'
      ? 'announcement:a1:sms:+233241234567'
      : 'campaign:camp-1:+233241234567',
  };
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    smsLog: {
      aggregate: vi.fn(async () => ({ _sum: { segments: 0 } })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    announcement: {
      findUnique: vi.fn(async () => ({
        createdBy: 'u1',
        cancelledAt: overrides.cancelledAt ?? null,
        moderation: 'APPROVED',
        publishAt: new Date('2026-11-24T09:00:00.000Z'),
        expiresAt: null,
      })),
    },
    smsOptOut: { findUnique: vi.fn(async () => overrides.optedOut ? { churchId: 'c1', phoneE164: row.toE164 } : null) },
    user: { findFirst: vi.fn(async () => ({ isActive: true, roles: [{ role: { key: 'PASTOR' } }] })) },
    church: {
      findUnique: vi.fn(async () => ({
        settings: {},
        billingLocked: false,
        billingExempt: false,
        paidUntil: null,
        trialEndsAt: null,
        graceDays: 7,
      })),
    },
    smsWallet: {
      findUnique: vi.fn(async () => ({ churchId: 'c1', balanceUnits: 4, reservedUnits: 1 })),
      update: vi.fn(async () => ({})),
    },
    smsLedger: { create: vi.fn(async () => ({})) },
  };
  vi.mocked(platformPrisma.smsLog.findUnique).mockResolvedValue(row as never);
  vi.mocked(platformPrisma.$transaction).mockImplementation(async (fn) => fn(tx as never));
  vi.mocked(withTenant).mockImplementation(async (_churchId, _userId, fn) => fn(tx as never));
  return { row, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SMS send controls', () => {
  it('defers instead of sending when the global switch is off', async () => {
    setup();
    const gateway = { send: vi.fn() };
    await expect(sendSmsLog('sms-1', gateway, { enabled: false, hourlyUnitCap: 5_000 })).resolves.toEqual({ result: 'deferred_disabled' });
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it('defers instead of sending when the hourly unit cap is reached', async () => {
    const { tx } = setup();
    tx.smsLog.aggregate.mockResolvedValue({ _sum: { segments: 5_000 } } as never);
    const gateway = { send: vi.fn() };
    await expect(sendSmsLog('sms-1', gateway, { enabled: true, hourlyUnitCap: 5_000 })).resolves.toEqual({ result: 'deferred_hourly_cap' });
    expect(gateway.send).not.toHaveBeenCalled();
  });

  it('passes the stable idempotency key to the gateway and records acceptance', async () => {
    const { row } = setup();
    const gateway = { send: vi.fn(async () => ({ providerMessageId: 'provider-1' })) };
    await expect(sendSmsLog('sms-1', gateway)).resolves.toEqual({ result: 'sent' });
    expect(gateway.send).toHaveBeenCalledWith({ toE164: row.toE164, body: row.body, idempotencyKey: row.idempotencyKey });
    expect(platformPrisma.smsLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'provider-1' }),
    }));
  });

  it('suppresses and refunds a queued announcement text cancelled after fan-out', async () => {
    const { tx } = setup({ source: 'ANNOUNCEMENT', cancelledAt: now });
    const gateway = { send: vi.fn() };
    await expect(sendSmsLog('sms-1', gateway)).resolves.toEqual({ result: 'suppressed_announcement' });
    expect(gateway.send).not.toHaveBeenCalled();
    expect(tx.smsLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUPPRESSED', errorCode: 'The announcement was cancelled.' }),
    }));
    expect(tx.smsWallet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { balanceUnits: 5, reservedUnits: 0 },
    }));
    expect(tx.smsLedger.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reason: 'REFUND', idempotencyKey: 'refund:sms-1' }),
    }));
  });

  it('suppresses a queued announcement text when the recipient has since opted out', async () => {
    const { tx } = setup({ source: 'ANNOUNCEMENT', optedOut: true });
    const gateway = { send: vi.fn() };
    await expect(sendSmsLog('sms-1', gateway)).resolves.toEqual({ result: 'suppressed_announcement' });
    expect(gateway.send).not.toHaveBeenCalled();
    expect(tx.smsLog.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUPPRESSED', errorCode: expect.stringContaining('opted out') }),
    }));
  });

  it('completes a campaign after its final queued log is accepted', async () => {
    setup({ campaignId: 'camp-1' });
    vi.mocked(platformPrisma.smsCampaign.findUnique).mockResolvedValue({ id: 'camp-1', status: 'SENDING' } as never);
    vi.mocked(platformPrisma.smsLog.count).mockResolvedValue(0);
    await sendSmsLog('sms-1', { send: vi.fn(async () => ({ providerMessageId: 'provider-1' })) });
    expect(platformPrisma.smsCampaign.update).toHaveBeenCalledWith({ where: { id: 'camp-1' }, data: { status: 'DONE' } });
  });
});
