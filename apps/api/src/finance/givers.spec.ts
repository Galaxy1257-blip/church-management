// The board report names the people behind the money. A gift reaches the ledger
// from a member's card, a visitor's mobile-money number or the offering desk, so
// the giver is either Transaction.memberId or Transaction.giverName — and a gift
// marked private must be counted without ever being named. These tests pin the
// grouped read that FinanceService.analytics feeds the PDF.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { FinanceService } from './finance.service';

function fakeService(log: string[]) {
  const tx = {
    $queryRaw: (strings: TemplateStringsArray) => {
      const sql = strings.join('?');
      log.push(sql);
      if (sql.includes('AS name')) {
        return Promise.resolve([
          { name: 'Yaw Mensah', memberno: 'M-001', total: 500_000n, count: 7n },
          { name: 'Auntie Adjoa', memberno: null, total: 120_000n, count: 1n },
        ]);
      }
      if (sql.includes('"isAnonymous" = true')) {
        return Promise.resolve([{ total: 30_000n, count: 2n }]);
      }
      return Promise.resolve([]);
    },
    transaction: {
      groupBy: async () => [{ channel: 'CASH', _sum: { giftMinor: 620_000 }, _count: { _all: 8 } }],
    },
  };
  return new FinanceService({ run: (_user, fn) => fn(tx) } as never);
}

const USER = { userId: 'u1', churchId: 'c1' } as never;

describe('who gave, across every way of giving', () => {
  const log: string[] = [];
  const svc = fakeService(log);

  it('names members and visitors together, biggest first', async () => {
    const stats = await svc.analytics(USER, 90);
    expect(stats.topGivers).toEqual([
      { name: 'Yaw Mensah', memberNo: 'M-001', totalMinor: 500000, count: 7 },
      { name: 'Auntie Adjoa', memberNo: null, totalMinor: 120000, count: 1 },
    ]);
  });

  it('reads the name from the member record, else the name the giver left', async () => {
    const stats = await svc.analytics(USER, 90);
    void stats;
    const givers = log.find((sql) => sql.includes('AS name')) ?? '';
    expect(givers).toContain('LEFT JOIN "Member"');
    expect(givers).toContain('t."giverName"');
    expect(givers).toContain('t."isAnonymous" = false');
    expect(givers).toContain('t."churchId"');
  });

  it('counts private gifts in the open but never names them', async () => {
    const stats = await svc.analytics(USER, 90);
    expect(stats.privateGiven).toEqual({ totalMinor: 30000, count: 2 });
    const anon = log.find((sql) => sql.includes('"isAnonymous" = true')) ?? '';
    expect(anon).not.toContain('giverName');
  });

  it('keeps the channel mix and the daily trend beside the names', async () => {
    const stats = await svc.analytics(USER, 90);
    expect(stats.channels).toEqual([{ channel: 'CASH', totalMinor: 620000, count: 8 }]);
    expect(stats.daily).toEqual([]);
    expect(stats.days).toBe(90);
  });
});
