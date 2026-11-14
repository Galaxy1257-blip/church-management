// Which Sundays the church has marked off for Sunday School. Stored in
// Church.settings as YYYY-MM-DD church-local dates; a date that is not a valid
// key is ignored rather than trusted, so a hand-edited row cannot break the desk.
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isSundaySchoolDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function resolveSundaySchoolSkips(settings: unknown): string[] {
  const raw = (settings as { sundaySchoolSkips?: unknown } | null | undefined)?.sundaySchoolSkips;
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isSundaySchoolDateKey))].sort();
}

export function isSundaySchoolSkipped(settings: unknown, dateKey: string): boolean {
  return resolveSundaySchoolSkips(settings).includes(dateKey);
}

/** A real date key that is also a Sunday — the only day a class register runs. */
export function isSundayKey(value: unknown): value is string {
  if (!isSundaySchoolDateKey(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}

/**
 * The Sundays a register can be taken on: the most recent Sunday on or before
 * `todayKey`, then the weeks before it, oldest first. An invalid key or an
 * absurd span returns nothing rather than a guess.
 */
export function sundayRegisterWindow(todayKey: string, weeks = 8): string[] {
  if (!isSundaySchoolDateKey(todayKey)) return [];
  const span = Math.min(26, Math.max(1, Math.floor(weeks)));
  const [y, m, d] = todayKey.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() - day.getUTCDay());
  const out: string[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const at = new Date(day);
    at.setUTCDate(day.getUTCDate() - i * 7);
    out.push(at.toISOString().slice(0, 10));
  }
  return out;
}

export type RegisterStatus = 'PRESENT' | 'ABSENT';

export function isRegisterStatus(value: unknown): value is RegisterStatus {
  return value === 'PRESENT' || value === 'ABSENT';
}
