// A campaign's total is the money on its fund, so the dates are the only thing
// that tells two campaigns apart. Counting from the start with no end charged
// every later gift to the first campaign forever, and made two campaigns on one
// fund read identical. These are the two halves of the rule: the window is
// bounded when the church gave it an end date, and each campaign gets its own.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import type { AuthUser } from '../common/guards';
import { PledgesService, campaignRaisedWhere } from './pledges.module';

const user = { userId: 'u1', churchId: 'c1', roles: ['TREASURER'], permissions: ['giving:read'] } as AuthUser;
const onDay = (n: number) => new Date(Date.UTC(2026, 10, n, 9));

/** Reads the where clause the same way Postgres would, so the window is what fails. */
function world(campaigns: Record<string, unknown>[], gifts: { fundId: string; status: string; paidAt: Date; giftMinor: number }[], seen: Record<string, unknown>[]) {
  const tx = {
    campaign: { findMany: async () => campaigns },
    transaction: {
      aggregate: async ({ where }: { where: Record<string, unknown> }) => {
        seen.push(where);
        const paidAt = where.paidAt as { gte: Date; lt?: Date };
        const total = gifts
          .filter((g) => g.fundId === where.fundId && g.status === where.status)
          .filter((g) => g.paidAt >= paidAt.gte && (!paidAt.lt || g.paidAt < paidAt.lt))
          .reduce((sum, g) => sum + g.giftMinor, 0);
        return { _sum: { giftMinor: total } };
      },
    },
    pledge: { aggregate: async () => ({ _sum: { amountMinor: 0 } }) },
  };
  return new PledgesService({ run: (_u: AuthUser, fn: (t: unknown) => Promise<unknown>) => fn(tx) } as never);
}

describe('campaign progress', () => {
  it('stops counting on the day the campaign ends', () => {
    const where = campaignRaisedWhere('c1', {
      fundId: 'f1',
      startsOn: new Date('2026-11-01T00:00:00.000Z'),
      endsOn: new Date('2026-11-10T00:00:00.000Z'),
    });
    expect(where.paidAt.gte).toEqual(new Date('2026-11-01T00:00:00.000Z'));
    // The last day still counts: the boundary is the day after the end.
    expect(where.paidAt.lt).toEqual(new Date('2026-11-11T00:00:00.000Z'));
  });

  it('keeps counting a campaign the church never gave an end date', () => {
    const where = campaignRaisedWhere('c1', { fundId: 'f1', startsOn: new Date('2026-11-01T00:00:00.000Z'), endsOn: null });
    expect(where.paidAt).toEqual({ gte: new Date('2026-11-01T00:00:00.000Z') });
  });

  it('counts each campaign on one fund only inside its own dates', async () => {
    const seen: Record<string, unknown>[] = [];
    const gifts = [
      { fundId: 'f1', status: 'SUCCESS', paidAt: onDay(3), giftMinor: 5000 },
      { fundId: 'f1', status: 'SUCCESS', paidAt: onDay(18), giftMinor: 7000 },
      { fundId: 'f1', status: 'PENDING', paidAt: onDay(18), giftMinor: 9000 },
    ];
    const svc = world([
      { id: 'c1', churchId: 'c1', fundId: 'f1', name: 'Harvest', startsOn: onDay(1), endsOn: onDay(10) },
      { id: 'c2', churchId: 'c1', fundId: 'f1', name: 'Building', startsOn: onDay(15), endsOn: null },
    ], gifts, seen);
    const out = await svc.campaigns(user);
    expect(out.map((c) => [c.name, c.raisedMinor])).toEqual([['Harvest', 5000], ['Building', 7000]]);
  });

  it('asks for settled gifts on this church and this fund every time', async () => {
    const seen: Record<string, unknown>[] = [];
    const svc = world([{ id: 'c1', churchId: 'c1', fundId: 'f1', name: 'Harvest', startsOn: onDay(1), endsOn: null }], [], seen);
    await svc.campaigns(user);
    expect(seen[0]).toMatchObject({ churchId: 'c1', fundId: 'f1', status: 'SUCCESS' });
  });
});
