import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { localHourIn } from '@chms/shared';
import { SmsService } from './sms.service';

vi.mock('@chms/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@chms/db')>();
  return { ...actual, appendAudit: vi.fn(async () => undefined) };
});

const user = { userId: 'u1', churchId: 'c1' } as Parameters<SmsService['sendCampaign']>[0];

function fakeTenant(tx: unknown) {
  return { run: (_u: unknown, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as unknown as ConstructorParameters<typeof SmsService>[0];
}

describe('SmsService.sendCampaign fan-out', () => {
  it('materialises a campaign and records balances after a competing wallet reservation', async () => {
    const created: { id: string; toE164: string }[] = [];
    const ledger: unknown[] = [];
    let balance = 10;
    let walletUpdates = 0;
    const tx = {
      smsCampaign: {
        findFirst: async () => ({ id: 'camp1', churchId: 'c1', status: 'DRAFT', body: 'Hello', audience: {} }),
        updateMany: async () => ({ count: 1 }),
      },
      church: { findUnique: async () => ({ settings: { smsQuietHours: { enabled: false } }, timezone: 'Africa/Accra' }) },
      smsOptOut: { findMany: async () => [] },
      member: {
        findMany: async () => [
          { id: 'm1', phoneE164: '+233201234567' },
          { id: 'm2', phoneE164: '+233209876543' },
        ],
      },
      smsWallet: {
        findUnique: async () => ({ churchId: 'c1', balanceUnits: balance, reservedUnits: 0 }),
        updateMany: async ({ data }: { data: { balanceUnits: { decrement: number } } }) => {
          walletUpdates += 1;
          const units = data.balanceUnits.decrement;
          if (balance < units) return { count: 0 };
          balance -= units + 1;
          return { count: 1 };
        },
      },
      smsLog: {
        createMany: async ({ data }: { data: { toE164: string }[] }) => {
          for (const row of data) created.push({ id: `log:${row.toE164}`, toE164: row.toE164 });
          return { count: data.length };
        },
        findMany: async ({ where }: { where: { toE164: { in: string[] } } }) =>
          created.filter((l) => where.toE164.in.includes(l.toE164)),
      },
      smsLedger: { createMany: async ({ data }: { data: unknown[] }) => { ledger.push(...data); return { count: data.length }; } },
    };
    const dispatcher = { dispatch: vi.fn() };
    const queues = { enqueueCampaignSend: vi.fn(), enqueueCampaignSendBulk: vi.fn() };
    const svc = new SmsService(fakeTenant(tx), dispatcher as never, queues as never);

    await expect(svc.sendCampaign(user, 'camp1')).resolves.toEqual({ queued: 2 });

    expect(walletUpdates).toBe(1);
    expect(balance).toBe(7);
    expect(ledger).toHaveLength(2);
    expect(ledger).toEqual([
      expect.objectContaining({ delta: -1, balanceAfter: 8 }),
      expect.objectContaining({ delta: -1, balanceAfter: 7 }),
    ]);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
    expect(queues.enqueueCampaignSendBulk).toHaveBeenCalledWith([
      'log:+233201234567',
      'log:+233209876543',
    ]);
  });
});

describe('SmsService.sendCampaign quiet hours', () => {
  const insideWindow = (): { enabled: boolean; start: number; end: number } => {
    const h = localHourIn('Africa/Accra');
    return { enabled: true, start: h, end: (h + 1) % 24 };
  };

  it('refuses to send during quiet hours, before touching the audience or dispatcher', async () => {
    const tx = {
      smsCampaign: {
        findFirst: async () => ({ id: 'camp1', churchId: 'c1', status: 'DRAFT', body: 'Hello', audience: {} }),
      },
      church: {
        findUnique: async () => ({ settings: { smsQuietHours: insideWindow() }, timezone: 'Africa/Accra' }),
      },
    };
    const dispatcher = { dispatch: vi.fn() };
    const queues = { enqueueCampaignSend: vi.fn() };
    const svc = new SmsService(fakeTenant(tx), dispatcher as never, queues as never);
    await expect(svc.sendCampaign(user, 'camp1')).rejects.toThrow(/quiet hours/i);
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });
});
