// Automatic service windows: a church sets one recurring weekly window (by
// default Sunday 07:30–12:00). Inside the window the service is open for
// check-in without anyone pressing Start; after it closes itself. A date can be
// marked "no church" so that week is skipped.
import { isValidHhMm, minutesSinceMidnight } from './datetime';

export interface ServiceSchedule {
  enabled: boolean;
  weekday: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // 'HH:MM' church-local
  endTime: string; // 'HH:MM' church-local
  name: string;
  skipDates: string[]; // YYYY-MM-DD, church-local — no church on these days
}

export const DEFAULT_SERVICE_SCHEDULE: ServiceSchedule = {
  enabled: true,
  weekday: 0,
  startTime: '07:30',
  endTime: '12:00',
  name: 'Sunday Service',
  skipDates: [],
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY.test(value);
}

/** Tolerant read of Church.settings.serviceSchedule. */
export function resolveServiceSchedule(settings: unknown): ServiceSchedule {
  const raw = (settings as { serviceSchedule?: unknown } | null)?.serviceSchedule;
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SERVICE_SCHEDULE, skipDates: [] };
  const s = raw as Record<string, unknown>;
  const start = typeof s.startTime === 'string' && isValidHhMm(s.startTime) ? s.startTime : DEFAULT_SERVICE_SCHEDULE.startTime;
  let end = typeof s.endTime === 'string' && isValidHhMm(s.endTime) ? s.endTime : DEFAULT_SERVICE_SCHEDULE.endTime;
  if (minutesSinceMidnight(end) <= minutesSinceMidnight(start)) end = DEFAULT_SERVICE_SCHEDULE.endTime;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_SERVICE_SCHEDULE.enabled,
    weekday:
      typeof s.weekday === 'number' && Number.isInteger(s.weekday) && s.weekday >= 0 && s.weekday <= 6
        ? s.weekday
        : DEFAULT_SERVICE_SCHEDULE.weekday,
    startTime: start,
    endTime: end,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 60) : DEFAULT_SERVICE_SCHEDULE.name,
    skipDates: Array.isArray(s.skipDates) ? [...new Set(s.skipDates.filter(isDateKey))].sort() : [],
  };
}

export type ServiceWindowState = 'off' | 'skipped' | 'before' | 'open' | 'after';

/**
 * Where `now` sits relative to this week's window, in church-local terms.
 * The caller supplies the local weekday, HH:MM and date key so this stays a
 * pure function (no timezone library).
 */
export function serviceWindowState(input: {
  schedule: ServiceSchedule;
  weekday: number;
  timeHhMm: string;
  dateKey: string;
}): ServiceWindowState {
  const { schedule, weekday, timeHhMm, dateKey } = input;
  if (!schedule.enabled) return 'off';
  if (weekday !== schedule.weekday) return 'off';
  if (schedule.skipDates.includes(dateKey)) return 'skipped';
  const now = minutesSinceMidnight(timeHhMm);
  if (now < minutesSinceMidnight(schedule.startTime)) return 'before';
  if (now >= minutesSinceMidnight(schedule.endTime)) return 'after';
  return 'open';
}
