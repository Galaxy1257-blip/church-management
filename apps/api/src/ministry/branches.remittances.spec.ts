// Branch money moving to head office is a payment with two hands on it, so the
// remittance report names them. `Remittance.submittedBy` / `approvedBy` are bare
// user ids, stitched the same way the transfer list stitches its people.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { BranchesService } from './branches.module';

const ROWS = [
  { id: 'r1', amountMinor: 50000, reference: 'DEP-1', status: 'SUBMITTED', submittedBy: 'u1', approvedBy: null, fromBranch: { name: 'Tema', code: 'TEM' } },
  { id: 'r2', amountMinor: 80000, reference: 'DEP-2', status: 'REMITTED', submittedBy: 'u2', approvedBy: 'gone', fromBranch: { name: 'Tema', code: 'TEM' } },
];

function fakeService() {
  const seen: Record<string, unknown> = {};
  const tx = {
    remittance: {
      findMany: async (args: unknown) => {
        seen.rows = args;
        return ROWS;
      },
    },
    user: {
      findMany: async (args: unknown) => {
        seen.users = args;
        return [{ id: 'u1', name: 'Sister Efua' }, { id: 'u2', name: 'Treasurer Dan' }];
      },
    },
  };
  return { svc: new BranchesService({ run: (_user, fn) => fn(tx) } as never), seen };
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('the remittance list', () => {
  it('names the branch worker who sent the money', async () => {
    const { svc } = fakeService();
    const rows = await svc.listRemittances(USER);
    expect(rows[0]).toMatchObject({ submittedByName: 'Sister Efua', approvedByName: 'Not approved yet' });
  });

  it('says so when the approver has left the team, and keeps the rest of the row', async () => {
    const { svc } = fakeService();
    const rows = await svc.listRemittances(USER);
    expect(rows[1]).toMatchObject({
      reference: 'DEP-2',
      status: 'REMITTED',
      submittedByName: 'Treasurer Dan',
      approvedByName: 'A worker no longer on the team',
    });
    expect(rows[1].fromBranch?.name).toBe('Tema');
  });

  it('asks for the whole set of names in one lookup', async () => {
    const { svc, seen } = fakeService();
    await svc.listRemittances(USER);
    expect((seen.users as { where: { id: { in: string[] } } }).where.id.in).toEqual(['u1', 'u2', 'gone']);
  });
});
