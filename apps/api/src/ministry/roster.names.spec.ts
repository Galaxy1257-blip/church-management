// The volunteer roster is handed to a service leader, so it has to read as names.
// `RosterShift` stores only a member id, and the screen used to print the first
// eight characters of that. RosterService.list now stitches the name and number.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { RosterService } from './roster.module';

const SHIFTS = [
  { id: 's1', serviceId: 'v1', memberId: 'm1', duty: 'Ushering', status: 'CONFIRMED' },
  { id: 's2', serviceId: 'v1', memberId: 'm2', duty: 'Sound', status: 'ASSIGNED' },
  { id: 's3', serviceId: 'v1', memberId: 'm1', duty: 'Cleaning', status: 'ASSIGNED' },
];

function fakeService() {
  const seen: Record<string, unknown> = {};
  const tx = {
    rosterShift: {
      findMany: async (args: unknown) => {
        seen.shifts = args;
        return SHIFTS;
      },
    },
    member: {
      findMany: async (args: unknown) => {
        seen.members = args;
        return [
          { id: 'm1', firstName: 'Yaw', lastName: 'Mensah', memberNo: 'M-001' },
          { id: 'm2', firstName: 'Ama', lastName: 'Bonsu', memberNo: 'M-014' },
        ];
      },
    },
  };
  return { svc: new RosterService({ run: (_user, fn) => fn(tx) } as never), seen };
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('the roster for one service', () => {
  it('names every helper instead of leaving an id on the sheet', async () => {
    const { svc } = fakeService();
    const rows = await svc.list(USER, 'v1');
    expect(rows.map((r) => [r.duty, r.memberName, r.memberNo])).toEqual([
      ['Ushering', 'Yaw Mensah', 'M-001'],
      ['Sound', 'Ama Bonsu', 'M-014'],
      ['Cleaning', 'Yaw Mensah', 'M-001'],
    ]);
  });

  it('looks the members up once, each id only once', async () => {
    const { svc, seen } = fakeService();
    await svc.list(USER, 'v1');
    expect((seen.members as { where: { id: { in: string[] } } }).where.id.in).toEqual(['m1', 'm2']);
  });

  it('says so when a helper is no longer on the book', async () => {
    const tx = {
      rosterShift: { findMany: async () => [{ id: 's9', serviceId: 'v1', memberId: 'gone', duty: 'Ushering', status: 'ASSIGNED' }] },
      member: { findMany: async () => [] },
    };
    const svc = new RosterService({ run: (_user, fn) => fn(tx) } as never);
    const rows = await svc.list(USER, 'v1');
    expect(rows[0]).toMatchObject({ memberName: 'No longer on the book', memberNo: '—' });
  });
});
