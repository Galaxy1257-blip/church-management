// A pledge is a promise by a named person, and the campaign sheet the board gets
// has to say who promised what. PledgesService.pledges now asks Prisma for the
// member and the campaign alongside the fund, so the screen never shows an id.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PledgesService } from './pledges.module';

function fakeService() {
  const seen: Record<string, unknown> = {};
  const tx = {
    pledge: {
      findMany: async (args: unknown) => {
        seen.pledges = args;
        return [
          {
            id: 'p1', memberId: 'm1', amountMinor: 200_000, frequency: 'MONTHLY',
            fund: { name: 'Building' }, member: { firstName: 'Yaw', lastName: 'Mensah', memberNo: 'M-001' },
            campaign: { name: 'New roof' },
          },
        ];
      },
    },
  };
  return { svc: new PledgesService({ run: (_user, fn) => fn(tx) } as never), seen };
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('the pledge list', () => {
  it('brings the person and the appeal with the promise', async () => {
    const { svc, seen } = fakeService();
    const rows = await svc.pledges(USER);
    expect(rows[0].member?.firstName).toBe('Yaw');
    expect(rows[0].campaign?.name).toBe('New roof');
    const args = seen.pledges as { include: Record<string, unknown> };
    expect(Object.keys(args.include)).toEqual(['fund', 'member', 'campaign']);
  });

  it('still filters to one member when the caller names them', async () => {
    const { svc, seen } = fakeService();
    await svc.pledges(USER, 'm1');
    expect((seen.pledges as { where: { churchId: string; memberId: string } }).where).toEqual({ churchId: 'c1', memberId: 'm1' });
  });
});
