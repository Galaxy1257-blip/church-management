// Audit round 5 follow-up: the transfer approval step had no way to see what was
// waiting. `MemberTransfer` carries bare ids and no Prisma relations, so
// BranchesService.listTransfers stitches the person, both branches and the
// requester by hand. These tests pin that stitching — the screen is only useful
// if it can name the member and say who asked.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS_KEY } from '../common/decorators';
import { BranchesController, BranchesService } from './branches.module';

interface FakeRows {
  id: string;
  memberId: string;
  fromBranchId: string;
  toBranchId: string;
  requestedBy: string;
  approvedBy: string | null;
  status: string;
}

const TRANSFERS: FakeRows[] = [
  { id: 't1', memberId: 'm1', fromBranchId: 'b1', toBranchId: 'b2', requestedBy: 'u1', approvedBy: null, status: 'PENDING' },
  { id: 't2', memberId: 'gone', fromBranchId: 'b1', toBranchId: 'b9', requestedBy: 'u2', approvedBy: 'u1', status: 'PENDING' },
];

/** The tenant wrapper replaced by a stub that records the queries it is handed. */
function fakeService() {
  const seen: Record<string, unknown> = {};
  const tx = {
    memberTransfer: {
      findMany: async (args: unknown) => {
        seen.transfers = args;
        return TRANSFERS;
      },
    },
    branch: {
      findMany: async (args: unknown) => {
        seen.branches = args;
        return [
          { id: 'b1', name: 'Accra Central' },
          { id: 'b2', name: 'Tema' },
          { id: 'b9', name: 'Kumasi' },
        ];
      },
    },
    member: {
      findMany: async (args: unknown) => {
        seen.members = args;
        return [{ id: 'm1', firstName: 'Yaw', lastName: 'Mensah', memberNo: 'M-001' }];
      },
    },
    user: {
      findMany: async (args: unknown) => {
        seen.users = args;
        return [
          { id: 'u1', name: 'Secretary Grace' },
          { id: 'u2', name: 'Brother Kwame' },
        ];
      },
    },
  };
  const svc = new BranchesService({ run: (_user, fn) => fn(tx) } as never);
  return { svc, seen };
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('the waiting-transfer list', () => {
  it('names the member, both branches and the one who asked', async () => {
    const { svc } = fakeService();
    const rows = await svc.listTransfers(USER, 'PENDING');
    expect(rows[0]).toMatchObject({
      id: 't1',
      memberName: 'Yaw Mensah',
      memberNo: 'M-001',
      fromBranchName: 'Accra Central',
      toBranchName: 'Tema',
      requestedByName: 'Secretary Grace',
      approvedByName: null,
    });
  });

  it('says so when a member or a worker is no longer on the book', async () => {
    const { svc } = fakeService();
    const rows = await svc.listTransfers(USER, 'PENDING');
    expect(rows[1]).toMatchObject({
      memberName: 'No longer on the book',
      toBranchName: 'Kumasi',
      requestedByName: 'Brother Kwame',
      approvedByName: 'Secretary Grace',
    });
  });

  it('asks for the status the caller named and never for the whole table', async () => {
    const { svc, seen } = fakeService();
    await svc.listTransfers(USER, 'PENDING');
    expect((seen.transfers as { where: { churchId: string; status?: string } }).where).toEqual({ churchId: 'c1', status: 'PENDING' });
    const ids = (args: unknown) => ((args as { where: { id: { in: string[] } } }).where.id.in);
    // one lookup per side, each id once: t1+t2 share b1, members are the two ids,
    // users are the three distinct people (t2's approver is t1's requester).
    expect([...new Set(ids(seen.branches))].sort()).toEqual(['b1', 'b2', 'b9']);
    expect([...new Set(ids(seen.members))].sort()).toEqual(['gone', 'm1']);
    expect([...new Set(ids(seen.users))].sort()).toEqual(['u1', 'u2']);
  });

  it('lists a transfer without a status filter for the whole history', async () => {
    const { svc, seen } = fakeService();
    await svc.listTransfers(USER);
    expect((seen.transfers as { where: { status?: string } }).where.status).toBeUndefined();
  });

  it('puts the list behind the same permission as the two approval routes', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, BranchesController.prototype.listTransfers)).toEqual(['branches:write']);
  });
});
