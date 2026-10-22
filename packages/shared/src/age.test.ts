import { describe, expect, it } from 'vitest';
import { ageOn, AgeBracketCfg, promotionsFor, resolveBracket, segmentKeyFor } from './age';

const BRACKETS: AgeBracketCfg[] = [
  { id: 'b1', key: 'TODDLERS', label: 'Nursery & Toddlers', minAge: 0, maxAge: 4, segmentKey: 'TODDLERS', sortOrder: 10 },
  { id: 'b2', key: 'CHILDREN', label: 'Children Ministry', minAge: 5, maxAge: 12, segmentKey: 'CHILDREN', sortOrder: 20 },
  { id: 'b3', key: 'TEENS', label: 'Teens Chapel', minAge: 13, maxAge: 19, segmentKey: 'TEENS', sortOrder: 30 },
  { id: 'b4', key: 'YOUNG_ADULTS', label: 'Young Adults', minAge: 20, maxAge: 35, segmentKey: 'YOUNG_ADULTS', sortOrder: 40 },
  { id: 'b5', key: 'ADULTS', label: 'Main Sanctuary Adults', minAge: 36, maxAge: 59, segmentKey: 'ADULTS', genderSplit: true, sortOrder: 50 },
  { id: 'b6', key: 'SENIORS', label: 'Golden Age', minAge: 60, maxAge: null, segmentKey: 'SENIORS', sortOrder: 60 },
];

function dobForAge(age: number, at: Date): string {
  const y = at.getUTCFullYear() - age;
  return `${y}-06-15`;
}

describe('ageOn', () => {
  const at = new Date('2026-10-21T12:00:00Z');

  it('computes exact age, respecting birthday not-yet-passed', () => {
    expect(ageOn('2013-01-01', at)).toBe(13); // birthday passed
    expect(ageOn('2013-12-31', at)).toBe(12); // birthday not yet passed
    expect(ageOn('2026-10-21', at)).toBe(0); // birthday today
    expect(ageOn('2026-10-22', at)).toBe(0); // born tomorrow-relative: age 0
  });

  it('rejects garbage', () => {
    expect(() => ageOn('not-a-date', at)).toThrow();
  });
});

describe('resolveBracket', () => {
  it('maps each boundary age to the right bracket', () => {
    expect(resolveBracket(0, BRACKETS)?.key).toBe('TODDLERS');
    expect(resolveBracket(4, BRACKETS)?.key).toBe('TODDLERS');
    expect(resolveBracket(5, BRACKETS)?.key).toBe('CHILDREN');
    expect(resolveBracket(12, BRACKETS)?.key).toBe('CHILDREN');
    expect(resolveBracket(13, BRACKETS)?.key).toBe('TEENS');
    expect(resolveBracket(19, BRACKETS)?.key).toBe('TEENS');
    expect(resolveBracket(20, BRACKETS)?.key).toBe('YOUNG_ADULTS');
    expect(resolveBracket(36, BRACKETS)?.key).toBe('ADULTS');
    expect(resolveBracket(59, BRACKETS)?.key).toBe('ADULTS');
    expect(resolveBracket(60, BRACKETS)?.key).toBe('SENIORS');
    expect(resolveBracket(95, BRACKETS)?.key).toBe('SENIORS'); // open-ended
  });

  it('ignores inactive brackets', () => {
    const off = BRACKETS.map((b) => (b.key === 'TEENS' ? { ...b, isActive: false } : b));
    expect(resolveBracket(15, off)).toBeNull();
  });
});

describe('segmentKeyFor (auto-sort on check-in)', () => {
  const adults = BRACKETS.find((b) => b.key === 'ADULTS')!;
  const teens = BRACKETS.find((b) => b.key === 'TEENS')!;

  it('splits gendered brackets into M/W sections', () => {
    expect(segmentKeyFor(adults, 'MALE')).toBe('ADULTS_M');
    expect(segmentKeyFor(adults, 'FEMALE')).toBe('ADULTS_W');
  });
  it('non-gendered brackets use one section', () => {
    expect(segmentKeyFor(teens, 'MALE')).toBe('TEENS');
    expect(segmentKeyFor(teens, null)).toBe('TEENS');
  });
});

describe('promotionsFor (birthday auto-upgrade)', () => {
  const at = new Date('2026-10-21T12:00:00Z');

  it('detects members who crossed a boundary', () => {
    const members = [
      // 12 turning 13 this week -> still CHILDREN by dob? born 2013-10-25 => age 12 until Oct 25
      { id: 'm1', name: 'Junior Mensah', ageBracketId: 'b2', dob: dobForAge(13, at) },
      { id: 'm2', name: 'Steady Adult', ageBracketId: 'b5', dob: dobForAge(40, at) },
      { id: 'm3', name: 'No dob', ageBracketId: 'b2', dob: null },
    ];
    const promos = promotionsFor(members, BRACKETS, at);
    expect(promos).toHaveLength(1);
    expect(promos[0]).toMatchObject({
      id: 'm1',
      fromBracketKey: 'CHILDREN',
      toBracketKey: 'TEENS',
      age: 13,
    });
  });

  it('assigns unassigned members with dob', () => {
    const promos = promotionsFor(
      [{ id: 'm4', name: 'New Kid', ageBracketId: null, dob: dobForAge(7, at) }],
      BRACKETS,
      at,
    );
    expect(promos[0]?.toBracketKey).toBe('CHILDREN');
    expect(promos[0]?.fromBracketKey).toBe('UNASSIGNED');
  });

  it('is idempotent: no promotion when already in the right bracket', () => {
    const promos = promotionsFor(
      [{ id: 'm5', name: 'Fine', ageBracketId: 'b3', dob: dobForAge(15, at) }],
      BRACKETS,
      at,
    );
    expect(promos).toHaveLength(0);
  });
});
