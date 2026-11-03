// What a tick should run, as pure functions — no Redis, no HTTP, no clocks.
// Split out of tick-server.ts so the rules that decide when a message reaches a
// member's phone can be tested (tick-schedule.test.ts) instead of eyeballed.
export const ACCRA = 'Africa/Accra'; // UTC+0 all year — Ghana has no DST.

export interface AccraNow {
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
}

/** Accra wall-clock from an instant. Uses the tz database, not a hand-rolled
 * offset, so a future Ghana DST change would be picked up automatically. */
export function accraNow(now: Date): AccraNow {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ACCRA,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

export interface TickJob {
  name: string;
  /** Suffix for the lock key, or null when the job is not due yet. */
  slot: (t: AccraNow) => string | null;
  /** How long the lock lives, so the same slot is never run twice. */
  lockSeconds: number;
  /** What it is for, in the words the owner reads in the JSON report. */
  why: string;
  /** Sending window in Accra hours, [start, end). A job outside it waits for
   * the next tick instead of waking a member at 3am. */
  hours?: [number, number];
}

const hhmm = (h: number, m: number) => h * 60 + m;

// Mirrors the cron patterns in main.ts, but as "earliest Accra minute it may run
// today" plus a once-per-slot lock, so a GitHub cron that fires late (it often
// does) or a service that was asleep at 02:20 still runs the job instead of
// losing the whole day. Cadence lives in .github/workflows/jobs-tick.yml.
export const JOBS: TickJob[] = [
  {
    name: 'followup-tick',
    slot: (t) => `${t.date}:${String(t.hour).padStart(2, '0')}:${String(Math.floor(t.minute / 5) * 5).padStart(2, '0')}`,
    lockSeconds: 3300,
    why: 'new-visitor drip messages',
    hours: [6, 23],
  },
  {
    name: 'sweep-pending',
    slot: (t) => `${t.date}:${String(t.hour).padStart(2, '0')}`,
    lockSeconds: 4200,
    why: 're-queue stuck PENDING gifts',
  },
  { name: 'reconcile', slot: (t) => (hhmm(t.hour, t.minute) >= hhmm(2, 20) ? t.date : null), lockSeconds: 90000, why: 'nightly ledger reconcile' },
  { name: 'age-promotion', slot: (t) => (hhmm(t.hour, t.minute) >= hhmm(2, 35) ? t.date : null), lockSeconds: 90000, why: 'birthday bracket upgrades' },
  { name: 'missing-member-scan', slot: (t) => (hhmm(t.hour, t.minute) >= hhmm(3, 10) ? t.date : null), lockSeconds: 90000, why: 'who has not been attended' },
  { name: 'verse-of-day', slot: (t) => (hhmm(t.hour, t.minute) >= hhmm(20, 0) ? t.date : null), lockSeconds: 90000, why: 'the 8pm verse' },
];

export interface PlanItem {
  job: string;
  why: string;
  /** Full Redis lock key when the job is due, otherwise null. */
  lockKey: string | null;
  lockSeconds: number;
  skipReason: string | null;
}

export function planDue(t: AccraNow): PlanItem[] {
  return JOBS.map((job) => {
    if (job.hours && (t.hour < job.hours[0] || t.hour >= job.hours[1])) {
      const from = String(job.hours[0]).padStart(2, '0');
      const to = String(job.hours[1]).padStart(2, '0');
      return { job: job.name, why: job.why, lockKey: null, lockSeconds: job.lockSeconds, skipReason: `outside sending hours ${from}:00–${to}:00 Accra` };
    }
    const slot = job.slot(t);
    if (slot === null) {
      return { job: job.name, why: job.why, lockKey: null, lockSeconds: job.lockSeconds, skipReason: 'not due yet' };
    }
    return { job: job.name, why: job.why, lockKey: `tick:${job.name}:${slot}`, lockSeconds: job.lockSeconds, skipReason: null };
  });
}
