import { describe, expect, it } from 'vitest';
import { fmtDate, fmtDateTime, fmtTime, ghs } from './format';

// One money format for the whole staff app, because a board report and a giving
// screen that print the same gift two different ways get questioned in meeting.
describe('ghs', () => {
  it('writes the sign Ghanaians use, with the pesewas', () => {
    expect(ghs(1234)).toBe('GH₵ 12.34');
    expect(ghs(5)).toBe('GH₵ 0.05');
    expect(ghs(0)).toBe('GH₵ 0.00');
  });

  it('groups thousands so a five-figure offering stays readable', () => {
    expect(ghs(123456789)).toBe('GH₵ 1,234,567.89');
    expect(ghs(49400000)).toBe('GH₵ 494,000.00');
  });

  it('keeps the sign on a negative amount, before the number', () => {
    expect(ghs(-250)).toBe('-GH₵ 2.50');
  });
});

describe('dates', () => {
  it('keeps a date-only value on its calendar day in every timezone', () => {
    expect(fmtDate('2026-11-24')).toBe('24 Nov 2026');
    expect(fmtDateTime('2026-11-24')).toBe('24 Nov 2026');
    expect(fmtTime('2026-11-24')).toBe('—');
  });

  it('formats a local date and time without changing the day', () => {
    const value = new Date(2026, 10, 24, 14, 30);
    expect(fmtDate(value)).toBe('24 Nov 2026');
    expect(fmtTime(value)).toBe('14:30');
  });
});
