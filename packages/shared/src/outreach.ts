// Outreach: the record of an evangelism or visitation outing, and the people met.
// The only rules the screen needs live here so the API and the web cannot disagree.

export const OUTREACH_KINDS = ['EVANGELISM', 'VISIT', 'COMMUNITY', 'OTHER'] as const;
export type OutreachKind = (typeof OUTREACH_KINDS)[number];

/** What the church reads for a kind. Unknown kinds fall back to the stored value. */
export const OUTREACH_KIND_LABELS: Record<OutreachKind, string> = {
  EVANGELISM: 'Evangelism',
  VISIT: 'Home or hospital visit',
  COMMUNITY: 'Community service',
  OTHER: 'Other',
};

export function isOutreachKind(value: unknown): value is OutreachKind {
  return typeof value === 'string' && (OUTREACH_KINDS as readonly string[]).includes(value);
}

/**
 * A real calendar day "YYYY-MM-DD". Rejects 2024-02-30 and 13-13-2024. The same
 * check the Sunday School calendar uses, generalised here because an outreach
 * outing can fall on any day, not only a Sunday.
 */
export function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  const daysInMonth = new Date(y, m, 0).getDate();
  return d <= daysInMonth;
}

/**
 * The number of people reached: an integer 0..100000, or null when the caller
 * sent nothing. "30 people" is typed by a volunteer, so it is clamped, never
 * rounded silently and never rejected for being big.
 */
export function outreachClampCount(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100_000, Math.max(0, Math.trunc(n)));
}

/** Place text must be a non-empty trimmed string when the caller supplies it. */
export function outreachPlace(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}