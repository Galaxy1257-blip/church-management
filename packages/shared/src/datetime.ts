// Church-local time helpers. Churches store an IANA timezone
// (default Africa/Accra) and 'HH:MM' strings for service times.

export function isValidHhMm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function minutesSinceMidnight(hhmm: string): number {
  if (!isValidHhMm(hhmm)) throw new Error(`invalid HH:MM time: ${hhmm}`);
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Quiet-hours check on a church-local hour (0-23). Windows that wrap
 * midnight are supported: quietStart=20, quietEnd=8 means 20:00-08:00.
 * Equal start/end means no quiet hours.
 */
export function inQuietHours(localHour: number, quietStart: number, quietEnd: number): boolean {
  if (!Number.isInteger(localHour) || localHour < 0 || localHour > 23) throw new Error('localHour must be 0-23');
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return localHour >= quietStart && localHour < quietEnd;
  return localHour >= quietStart || localHour < quietEnd;
}

/** Current hour (0-23) in the given IANA timezone. */
export function localHourIn(timeZone: string, at: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false });
  const parts = fmt.formatToParts(at);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  return Number(hour === '24' ? '0' : hour);
}

/** Current date string YYYY-MM-DD in the church timezone (for per-Sunday grouping). */
export function localDateKey(timeZone: string, at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(at);
}

/** 'HH:MM' of `at` in the church timezone. */
export function localHhMm(timeZone: string, at: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt.format(at);
}
