import { describe, expect, it } from 'vitest';
import {
  isRegisterStatus,
  isSundayKey,
  isSundaySchoolDateKey,
  isSundaySchoolSkipped,
  resolveSundaySchoolSkips,
  sundayRegisterWindow,
} from './sunday-school';

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

describe('the class register runs on Sundays', () => {
  it('accepts only real Sundays', () => {
    expect(isSundayKey('2026-11-15')).toBe(true);
    expect(isSundayKey('2026-11-14')).toBe(false);
    expect(isSundayKey('2027-02-29')).toBe(false);
    expect(isSundayKey('nope')).toBe(false);
  });

  it('lists the recent Sundays oldest first, ending on the latest one', () => {
    // Friday 13 Nov 2026 -> the week ends on Sunday 8 Nov.
    expect(sundayRegisterWindow('2026-11-13', 3)).toEqual(['2026-10-25', '2026-11-01', '2026-11-08']);
    // A Sunday is its own latest day.
    expect(sundayRegisterWindow('2026-11-15', 2)).toEqual(['2026-11-08', '2026-11-15']);
  });

  it('returns nothing for a key it cannot trust, and caps the span', () => {
    expect(sundayRegisterWindow('2026-02-31')).toEqual([]);
    expect(sundayRegisterWindow('2026-11-14', 0)).toHaveLength(1);
    expect(sundayRegisterWindow('2026-11-14', 999)).toHaveLength(26);
  });

  it('knows the two register marks and nothing else', () => {
    expect(isRegisterStatus('PRESENT')).toBe(true);
    expect(isRegisterStatus('ABSENT')).toBe(true);
    expect(isRegisterStatus('present')).toBe(false);
    expect(isRegisterStatus(null)).toBe(false);
  });
});
