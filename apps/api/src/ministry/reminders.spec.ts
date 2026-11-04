// One message, one key: two leaders cannot broadcast the same reminder twice,
// and a program date turns one message into a small schedule.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../common/guards';
import { RemindersService, reminderKey, reminderRows } from './reminders.module';

const user = { userId: 'u1', churchId: 'c1', roles: ['PASTOR'], permissions: ['campaigns:write'] } as AuthUser;

function service(existing: { scheduledFor: Date } | null) {
  const rows: Record<string, unknown>[] = [];
  const tx = {
    // appendAudit writes through the raw client; the unit test does not need it.
    $executeRaw: async () => 0,
    notification: {
      findFirst: async () => existing,
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        rows.push(...data);
        return { count: data.length };
      },
    },
  };
  const svc = new RemindersService({ run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never);
  return { svc, rows };
}

describe('reminder keys', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(reminderKey('Harvest Sunday!', 'Wear  white.')).toBe(reminderKey('harvest   sunday', 'wear white'));
  });

  it('turns a program date into 1 week / 3 days / 1 day rows', () => {
    const programAt = new Date('2026-12-06T09:00:00Z');
    const rows = reminderRows({ title: 'Harvest', body: 'Bring produce', programAt, offsets: [1, 7, 3] });
    expect(rows.map((r) => r.scheduledFor.toISOString())).toEqual([
      '2026-11-29T09:00:00.000Z',
      '2026-12-03T09:00:00.000Z',
      '2026-12-05T09:00:00.000Z',
    ]);
    expect(new Set(rows.map((r) => r.dedupeKey)).size).toBe(3);
  });

  it('sends once, now, when there is no program date', () => {
    const rows = reminderRows({ title: 'Lock-in', body: '  Doors 6pm  ' });
    expect(rows).toHaveLength(1);
  });
});

describe('sending a reminder', () => {
  it('creates three scheduled rows for a program', async () => {
    const { svc, rows } = service(null);
    const res = await svc.send(user, { title: 'Harvest', body: 'Bring produce', programAt: '2026-12-06T09:00:00Z', offsets: [7, 3, 1] });
    expect(res.created).toBe(3);
    expect(rows).toHaveLength(3);
  });

  it('refuses the same words a second time and says when the first went out', async () => {
    const { svc } = service({ scheduledFor: new Date('2026-11-01T09:00:00Z') });
    await expect(svc.send(user, { title: 'Harvest', body: 'Bring produce' })).rejects.toThrow(/already/);
  });
});
