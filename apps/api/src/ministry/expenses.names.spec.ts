// A board report that only says "GHS 400 to the electrician" proves nothing. The
// ledger stores who started each payment and who signed it off as bare user ids
// (Expense.submittedBy / approvedBy), so ExpensesService.summary stitches the
// names in — the same hand-stitch the transfer list uses. These tests pin that,
// including what the PDF must say when a worker has since left the team.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ExpensesService } from './expenses.module';

const ROWS = [
  {
    id: 'e1', categoryId: 'c1', category: { name: 'Utilities' }, amountMinor: 40000,
    spentOn: new Date('2026-10-05'), payee: 'ECG', note: null, status: 'APPROVED',
    submittedBy: 'u1', approvedBy: 'u2',
  },
  {
    id: 'e2', categoryId: 'c2', category: { name: 'Transport' }, amountMinor: 9000,
    spentOn: new Date('2026-10-12'), payee: 'Fuel', note: 'Funeral trip', status: 'APPROVED',
    submittedBy: 'u2', approvedBy: 'gone',
  },
  {
    id: 'e3', categoryId: 'c1', category: { name: 'Utilities' }, amountMinor: 15000,
    spentOn: new Date('2026-10-19'), payee: 'Water', note: null, status: 'SUBMITTED',
    submittedBy: 'u1', approvedBy: null,
  },
];

function fakeService() {
  const seen: Record<string, unknown> = {};
  const tx = {
    expense: {
      findMany: async (args: unknown) => {
        seen.expenses = args;
        return ROWS;
      },
    },
    user: {
      findMany: async (args: unknown) => {
        seen.users = args;
        return [
          { id: 'u1', name: 'Secretary Grace' },
          { id: 'u2', name: 'Elder Kojo' },
        ];
      },
    },
  };
  const svc = new ExpensesService({ run: (_user, fn) => fn(tx) } as never);
  return { svc, seen };
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('the monthly expense summary', () => {
  it('names who started and who signed off each paid item', async () => {
    const { svc } = fakeService();
    const summary = await svc.summary(USER, '2026-10');
    expect(summary.items[0]).toMatchObject({
      payee: 'ECG',
      startedByName: 'Secretary Grace',
      approvedByName: 'Elder Kojo',
    });
  });

  it('says so when the leader who signed off is no longer on the team', async () => {
    const { svc } = fakeService();
    const summary = await svc.summary(USER, '2026-10');
    expect(summary.items[1]).toMatchObject({
      startedByName: 'Elder Kojo',
      approvedByName: 'A worker no longer on the team',
    });
  });

  it('lists the sign-offs once, in name order, for the report header', async () => {
    const { svc } = fakeService();
    const summary = await svc.summary(USER, '2026-10');
    expect(summary.signOffBy).toEqual(['A worker no longer on the team', 'Elder Kojo']);
  });

  it('totals only approved payments and keeps the waiting money separate', async () => {
    const { svc } = fakeService();
    const summary = await svc.summary(USER, '2026-10');
    expect(summary.approvedMinor).toBe(49000);
    expect(summary.pendingMinor).toBe(15000);
    expect(summary.items).toHaveLength(2);
  });

  it('looks the people up once for the whole month, each id only once', async () => {
    const { svc, seen } = fakeService();
    await svc.summary(USER, '2026-10');
    const ids = (seen.users as { where: { id: { in: string[] } } }).where.id.in;
    expect(ids).toHaveLength(3);
    expect([...new Set(ids)].sort()).toEqual(['gone', 'u1', 'u2']);
  });
});
