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
