import { describe, expect, it } from 'vitest';
import {
  isCalendarDateKey,
  isOutreachKind,
  outreachClampCount,
  outreachPlace,
  OUTREACH_KIND_LABELS,
  OUTREACH_KINDS,
} from './outreach';

describe('outreach kinds', () => {
  it('accepts exactly the four kinds', () => {
    expect(OUTREACH_KINDS).toEqual(['EVANGELISM', 'VISIT', 'COMMUNITY', 'OTHER']);
    for (const k of OUTREACH_KINDS) expect(isOutreachKind(k)).toBe(true);
    for (const v of ['evangelism', 'FUNDRAISER', '', 3]) expect(isOutreachKind(v)).toBe(false);
  });

  it('labels every kind', () => {
    for (const k of OUTREACH_KINDS) {
      expect(OUTREACH_KIND_LABELS[k]).toBeTruthy();
    }
  });
});

describe('isCalendarDateKey', () => {
  it('accepts real calendar days', () => {
    expect(isCalendarDateKey('2024-02-29')).toBe(true); // leap year
    expect(isCalendarDateKey('2023-02-28')).toBe(true);
    expect(isCalendarDateKey('2024-12-31')).toBe(true);
  });

  it('rejects impossible or malformed dates', () => {
    expect(isCalendarDateKey('2024-02-30')).toBe(false);
    expect(isCalendarDateKey('2023-02-29')).toBe(false);
    expect(isCalendarDateKey('2024-13-01')).toBe(false);
    expect(isCalendarDateKey('2024-00-10')).toBe(false);
    expect(isCalendarDateKey('13-13-2024')).toBe(false);
    expect(isCalendarDateKey('today')).toBe(false);
    expect(isCalendarDateKey(20240229)).toBe(false);
  });
});

describe('outreachClampCount', () => {
  it('returns null when nothing was typed', () => {
    expect(outreachClampCount(undefined)).toBe(null);
    expect(outreachClampCount(null)).toBe(null);
    expect(outreachClampCount('')).toBe(null);
    expect(outreachClampCount('   ')).toBe(null);
  });

  it('clamps to the 0..100000 window, never rounds silently', () => {
    expect(outreachClampCount('30')).toBe(30);
    expect(outreachClampCount(30)).toBe(30);
    expect(outreachClampCount('30.9')).toBe(30);
    expect(outreachClampCount('-5')).toBe(0);
    expect(outreachClampCount('999999999')).toBe(100000);
    expect(outreachClampCount('banana')).toBe(null);
  });
});

describe('outreachPlace', () => {
  it('trims and rejects blanks and non-strings', () => {
    expect(outreachPlace('  Community Centre ')).toBe('Community Centre');
    expect(outreachPlace('   ')).toBe(null);
    expect(outreachPlace('')).toBe(null);
    expect(outreachPlace(undefined)).toBe(null);
    expect(outreachPlace(null)).toBe(null);
    expect(outreachPlace(5)).toBe(null);
  });
});