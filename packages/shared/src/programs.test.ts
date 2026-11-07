import { describe, expect, it } from 'vitest';
import {
  anniversaryWithin,
  isProgramDateField,
  memberProgramDate,
  nextAnniversary,
  ordinalSuffix,
  PROGRAM_DATE_LABELS,
} from './programs';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('nextAnniversary', () => {
  it('finds this year when the date is still ahead', () => {
    const from = utc(2026, 11, 7); // 7 Nov 2026
    const a = nextAnniversary(utc(1990, 12, 25), from)!;
    expect(a.next).toEqual(utc(2026, 12, 25));
    expect(a.ordinal).toBe(36);
  });

  it('rolls to next year when the date already passed', () => {
    const from = utc(2026, 11, 7);
    const a = nextAnniversary(utc(1995, 1, 1), from)!;
    expect(a.next).toEqual(utc(2027, 1, 1));
    expect(a.ordinal).toBe(32);
  });

  it('treats a same-day anniversary as now', () => {
    const from = utc(2026, 11, 7);
    const a = nextAnniversary(utc(2020, 11, 7), from)!;
    expect(a.next).toEqual(utc(2026, 11, 7));
    expect(a.ordinal).toBe(6);
  });

  it('moves Feb 29 to Feb 28 in a non-leap year, keeps Feb 29 in a leap year', () => {
    const from = utc(2026, 11, 7);
    expect(nextAnniversary(utc(2000, 2, 29), from)!.next).toEqual(utc(2027, 2, 28));
    expect(nextAnniversary(utc(2000, 2, 29), utc(2027, 11, 7))!.next).toEqual(utc(2028, 2, 29));
  });
});

describe('anniversaryWithin', () => {
  it('true only inside (from, from + days]', () => {
    const from = utc(2026, 11, 7);
    expect(anniversaryWithin(utc(1990, 11, 9), from, 7)).toBe(true); // 9 Nov, 2 days ahead
    expect(anniversaryWithin(utc(1990, 11, 7), from, 7)).toBe(false); // today, not "ahead"
    expect(anniversaryWithin(utc(1990, 11, 14), from, 7)).toBe(true); // exactly 7 days
    expect(anniversaryWithin(utc(1990, 11, 15), from, 7)).toBe(false); // 8 days
    expect(anniversaryWithin(utc(1990, 11, 10), from, 7)).toBe(true);
  });
});

describe('memberProgramDate + labels', () => {
  it('maps each field to its member column', () => {
    const m = {
      dob: utc(1990, 1, 1),
      joinedAt: utc(2020, 6, 1),
      salvationDate: utc(2015, 3, 5),
      baptismDate: utc(2015, 4, 5),
      marriageDate: utc(2018, 9, 9),
      ordinationDate: utc(2019, 10, 10),
    };
    expect(memberProgramDate(m, 'DOB')).toEqual(m.dob);
    expect(memberProgramDate(m, 'MARRIAGE')).toEqual(m.marriageDate);
    expect(memberProgramDate({}, 'DOB')).toBeNull();
  });

  it('labels every field and validates', () => {
    expect(PROGRAM_DATE_LABELS.DOB).toBe('Birthday');
    expect(isProgramDateField('SALVATION')).toBe(true);
    expect(isProgramDateField('nope')).toBe(false);
  });
});

describe('ordinalSuffix', () => {
  it('handles the irregulars and teens', () => {
    expect(ordinalSuffix(1)).toBe('1st');
    expect(ordinalSuffix(2)).toBe('2nd');
    expect(ordinalSuffix(3)).toBe('3rd');
    expect(ordinalSuffix(4)).toBe('4th');
    expect(ordinalSuffix(11)).toBe('11th');
    expect(ordinalSuffix(12)).toBe('12th');
    expect(ordinalSuffix(13)).toBe('13th');
    expect(ordinalSuffix(21)).toBe('21st');
    expect(ordinalSuffix(102)).toBe('102nd');
  });
});
