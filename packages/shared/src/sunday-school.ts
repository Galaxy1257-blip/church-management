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
