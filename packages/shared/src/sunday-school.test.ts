import { describe, expect, it } from 'vitest';
import { isSundaySchoolDateKey, isSundaySchoolSkipped, resolveSundaySchoolSkips } from './sunday-school';

describe('Sunday School day-off dates', () => {
  it('starts empty for a church that never set any', () => {
    expect(resolveSundaySchoolSkips(undefined)).toEqual([]);
    expect(resolveSundaySchoolSkips(null)).toEqual([]);
    expect(resolveSundaySchoolSkips({})).toEqual([]);
    expect(resolveSundaySchoolSkips({ sundaySchoolSkips: 'x' })).toEqual([]);
    expect(isSundaySchoolSkipped({}, '2026-12-27')).toBe(false);
  });

  it('keeps only real dates, once each, in order', () => {
    const settings = { sundaySchoolSkips: ['2026-12-27', '2026-12-27', 'nope', '2026-02-31', '2026-12-20'] };
    expect(resolveSundaySchoolSkips(settings)).toEqual(['2026-12-20', '2026-12-27']);
  });

  it('answers for one date without trusting a stray value', () => {
    expect(isSundaySchoolSkipped({ sundaySchoolSkips: ['2026-12-27'] }, '2026-12-27')).toBe(true);
    expect(isSundaySchoolSkipped({ sundaySchoolSkips: ['2026-12-27'] }, '2026-12-28')).toBe(false);
    expect(isSundaySchoolSkipped({ sundaySchoolSkips: [42] }, '2026-12-27')).toBe(false);
  });

  it('accepts the shapes a date input sends and rejects the impossible ones', () => {
    expect(isSundaySchoolDateKey('2026-01-04')).toBe(true);
    expect(isSundaySchoolDateKey('2028-02-29')).toBe(true);
    expect(isSundaySchoolDateKey('2027-02-29')).toBe(false);
    expect(isSundaySchoolDateKey('2026-13-01')).toBe(false);
    expect(isSundaySchoolDateKey('2026-1-4')).toBe(false);
    expect(isSundaySchoolDateKey(20260104)).toBe(false);
    expect(isSundaySchoolDateKey(null)).toBe(false);
  });
});
