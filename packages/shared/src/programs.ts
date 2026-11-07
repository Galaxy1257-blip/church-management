// Program tracking: church programs repeat on a member's date (birthday,
// wedding anniversary, salvation day...). Leaders set the reminder window on
// the Programs screen; approving a milestone pushes a whole-church notification.
// The date maths below is pure so the leader list and the notification can
// agree on whose milestone is coming and what ordinal to name.

export const PROGRAM_DATE_FIELDS = ['DOB', 'JOINED', 'SALVATION', 'BAPTISM', 'MARRIAGE', 'ORDINATION'] as const;
export type ProgramDateField = (typeof PROGRAM_DATE_FIELDS)[number];

export const PROGRAM_DATE_LABELS: Record<ProgramDateField, string> = {
  DOB: 'Birthday',
  JOINED: 'Joined the church',
  SALVATION: 'Salvation day',
  BAPTISM: 'Baptism day',
  MARRIAGE: 'Wedding anniversary',
  ORDINATION: 'Ordination day',
};

export function isProgramDateField(value: unknown): value is ProgramDateField {
  return typeof value === 'string' && (PROGRAM_DATE_FIELDS as readonly string[]).includes(value);
}

/** The member's date for a program field, or null when the member has none. */
export function memberProgramDate(
  member: { dob?: Date | null; joinedAt?: Date | null; salvationDate?: Date | null; baptismDate?: Date | null; marriageDate?: Date | null; ordinationDate?: Date | null },
  field: ProgramDateField,
): Date | null {
  switch (field) {
    case 'DOB': return member.dob ?? null;
    case 'JOINED': return member.joinedAt ?? null;
    case 'SALVATION': return member.salvationDate ?? null;
    case 'BAPTISM': return member.baptismDate ?? null;
    case 'MARRIAGE': return member.marriageDate ?? null;
    case 'ORDINATION': return member.ordinationDate ?? null;
  }
}

function daysInMonth(year: number, month: number): number {
  // month is 0-based; day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * The next occurrence of a date's month/day on or after `from` (UTC midnight),
 * plus how many years have passed since the original. Feb 29 celebrations fall
 * to Feb 28 in non-leap years. Returns null only for an invalid source date.
 */
export function nextAnniversary(date: Date, from: Date): { next: Date; ordinal: number } | null {
  const orig = { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
  if (Number.isNaN(orig.y)) return null;
  const fromMs = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  let year = from.getUTCFullYear();
  let day = Math.min(orig.d, daysInMonth(year, orig.m));
  let nextMs = Date.UTC(year, orig.m, day);
  if (nextMs < fromMs) {
    year += 1;
    day = Math.min(orig.d, daysInMonth(year, orig.m));
    nextMs = Date.UTC(year, orig.m, day);
  }
  return { next: new Date(nextMs), ordinal: year - orig.y };
}

/** True when the next anniversary falls within (from, from + days]. */
export function anniversaryWithin(date: Date, from: Date, days: number): boolean {
  const a = nextAnniversary(date, from);
  if (!a) return false;
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = start + days * 86_400_000;
  const at = a.next.getTime();
  return at > start && at <= end;
}

/** "1st" / "2nd" / "3rd" / "4th" ... — the ordinal a celebration names. */
export function ordinalSuffix(n: number): string {
  if (!Number.isInteger(n) || n <= 0) return String(n);
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
