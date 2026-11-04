// The annual statement is the one money document a member is told they can
// download, and it is filtered by year. Two rules hold it together: the year runs
// from its first instant to the next year's first instant (so a gift at 23:00 on
// 31 December belongs to that year, not the next), and the statement reads the
// year from the database rather than from the 200-row giving page — a truncated
// page reports a total that is quietly too small.
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { statementWindow } from './portal.module';

describe('the giving statement year', () => {
  it('runs to the exact start of the next year', () => {
    expect(statementWindow(2026)).toEqual({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2027-01-01T00:00:00.000Z'),
    });
  });

  it('keeps a gift in the year it was paid, including the last minute of the year', () => {
    const { from, to } = statementWindow(2026);
    const inYear = (d: string) => new Date(d) >= from && new Date(d) < to;
    expect(inYear('2026-01-01T00:00:00.000Z')).toBe(true);
    expect(inYear('2026-12-31T23:59:59.000Z')).toBe(true);
    expect(inYear('2027-01-01T00:00:00.000Z')).toBe(false);
    expect(inYear('2025-12-31T23:00:00.000Z')).toBe(false);
  });
});
