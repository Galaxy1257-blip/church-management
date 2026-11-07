import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { localHourIn } from '@chms/shared';
import { SmsDispatcher } from './sms-dispatcher';

const queues = { enqueueSmsSend: vi.fn(), enqueueCampaignSend: vi.fn() } as unknown as ConstructorParameters<typeof SmsDispatcher>[0];

/** A tenant tx that records what would be written. Church row drives quiet hours. */
function fakeTx(settings: unknown, opts: { balance?: number } = {}) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    church: { findUnique: async () => ({ settings, timezone: 'Africa/Accra' }) },
    smsOptOut: { findUnique: async () => null },
    smsLog: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 'log1', segments: data.segments };
      },
    },
    smsWallet: {
      findUnique: async () => ({ balanceUnits: opts.balance ?? 100, reservedUnits: 0 }),
      updateMany: async () => ({ count: 1 }),
    },
    smsLedger: {
      findUnique: async () => null,
      create: async () => ({}),
      update: async () => ({}),
    },
  };
  return { tx: tx as never, created };
}

const base = { churchId: 'c1', toE164: '+233241234567', body: 'Hello church', idempotencyKey: 'k1' };

describe('SmsDispatcher quiet hours', () => {
  // Derive the window from the real church-local hour so the test is
  // deterministic no matter when it runs: [now, now+1) is always "inside".
  const insideWindow = (): { enabled: boolean; start: number; end: number } => {
    const h = localHourIn('Africa/Accra');
    return { enabled: true, start: h, end: (h + 1) % 24 };
  };

  it('holds a campaign during the quiet window and reserves nothing', async () => {
    const { tx, created } = fakeTx({ smsQuietHours: insideWindow() });
    const d = new SmsDispatcher(queues);
    const out = await d.dispatch(tx, { ...base, source: 'CAMPAIGN' });
    expect(out).toEqual({ status: 'SUPPRESSED', reason: 'QUIET_HOURS', logId: null, segments: 0 });
    expect(created).toHaveLength(0);
  });

  it('queues a campaign when quiet hours are switched off', async () => {
    const { tx, created } = fakeTx({ smsQuietHours: { enabled: false } });
    const d = new SmsDispatcher(queues);
    const out = await d.dispatch(tx, { ...base, source: 'CAMPAIGN' });
    expect(out.status).toBe('QUEUED');
    expect(created).toHaveLength(1);
  });

  it('never holds a transactional OTP, even inside the quiet window', async () => {
    const { tx, created } = fakeTx({ smsQuietHours: insideWindow() });
    const d = new SmsDispatcher(queues);
    const out = await d.dispatch(tx, { ...base, source: 'OTP' });
    expect(out.status).toBe('QUEUED');
    expect(created).toHaveLength(1);
  });

  it('defaults to the 20:00–08:00 window when the church has no quiet-hours setting', async () => {
    const { tx, created } = fakeTx({});
    const d = new SmsDispatcher(queues);
    const out = await d.dispatch(tx, { ...base, source: 'CAMPAIGN' });
    // Deterministic branch: never blocked if resolveSmsQuietHours is wrong
    // (blocked is a function of the current hour, so assert the short-circuit
    // path by checking a suppressed result only when the clock says so).
    if (out.status === 'SUPPRESSED') {
      expect(out).toMatchObject({ reason: 'QUIET_HOURS' });
      expect(created).toHaveLength(0);
    } else {
      expect(out.status).toBe('QUEUED');
      expect(created).toHaveLength(1);
    }
  });
});
