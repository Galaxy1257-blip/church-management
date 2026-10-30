// Subscription state machine, kept pure so the month/day arithmetic is testable
// without a database. Dates are UTC instants: billingDay is a day of the month
// (1-28), and "paid until 1 Nov" means access is covered up to that instant.
const DAY_MS = 86_400_000;

export type BillingState = 'exempt' | 'grandfathered' | 'trial' | 'active' | 'grace' | 'paused';

export interface BillingDates {
  trialEndsAt?: Date | null;
  paidUntil?: Date | null;
  graceDays?: number | null;
  billingExempt?: boolean | null;
  /** Support override from the platform office; wins over every date. */
  billingLocked?: boolean | null;
}

export interface BillingSnapshot {
  state: BillingState;
  /** True only once the grace days are over; this is what the API blocks on. */
  locked: boolean;
  /** End of paid (or trial) coverage. Null for exempt/grandfathered churches. */
  coveredUntil: Date | null;
  /** When the workspace pauses: coveredUntil + graceDays. */
  locksAt: Date | null;
  daysLeft: number;
  graceDaysLeft: number;
}

export function deriveBilling(church: BillingDates, now: Date): BillingSnapshot {
  if (church.billingLocked) {
    return {
      state: 'paused',
      locked: true,
      coveredUntil: church.paidUntil ?? church.trialEndsAt ?? null,
      locksAt: null,
      daysLeft: 0,
      graceDaysLeft: 0,
    };
  }
  if (church.billingExempt) {
    return { state: 'exempt', locked: false, coveredUntil: null, locksAt: null, daysLeft: 0, graceDaysLeft: 0 };
  }

  const paid = church.paidUntil ?? null;
  const trial = church.trialEndsAt ?? null;
  const coveredUntil =
    paid && trial ? (paid.getTime() > trial.getTime() ? paid : trial) : (paid ?? trial);

  // Churches that predate billing (never trialled, never paid) keep working.
  if (!coveredUntil) {
    return { state: 'grandfathered', locked: false, coveredUntil: null, locksAt: null, daysLeft: 0, graceDaysLeft: 0 };
  }

  if (now.getTime() < coveredUntil.getTime()) {
    const state: BillingState =
      paid && coveredUntil.getTime() === paid.getTime() ? 'active' : 'trial';
    return {
      state,
      locked: false,
      coveredUntil,
      locksAt: null,
      daysLeft: Math.max(1, Math.ceil((coveredUntil.getTime() - now.getTime()) / DAY_MS)),
      graceDaysLeft: 0,
    };
  }

  const graceDays = church.graceDays ?? 7;
  const locksAt = new Date(coveredUntil.getTime() + graceDays * DAY_MS);
  const inGrace = now.getTime() < locksAt.getTime();
  return {
    state: inGrace ? 'grace' : 'paused',
    locked: !inGrace,
    coveredUntil,
    locksAt,
    daysLeft: 0,
    graceDaysLeft: inGrace ? Math.max(0, Math.ceil((locksAt.getTime() - now.getTime()) / DAY_MS)) : 0,
  };
}

/**
 * First payment instant strictly after `after`. With billingDay 1 and a payment
 * on 20 Oct, coverage ends at 1 Nov; paying again before then ends at 1 Dec.
 */
export function nextBillingInstant(after: Date, billingDay = 1): Date {
  const day = Math.min(28, Math.max(1, Math.trunc(billingDay)));
  const candidate = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), day));
  if (candidate.getTime() > after.getTime()) return candidate;
  return new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth() + 1, day));
}

/** Extend coverage from today, or from the end of already-paid time. */
export function extendCoverage(
  paidUntil: Date | null | undefined,
  now: Date,
  billingDay = 1,
): Date {
  const base = paidUntil && paidUntil.getTime() > now.getTime() ? paidUntil : now;
  return nextBillingInstant(base, billingDay);
}

/** "2026-11" for an instant. */
export function periodKey(instant: Date): string {
  return `${instant.getUTCFullYear()}-${String(instant.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The month being paid for when coverage ends at `coveredUntil` (1 Nov -> 2026-10). */
export function periodForCoverage(coveredUntil: Date): string {
  return periodKey(new Date(coveredUntil.getTime() - 1));
}

/** First instant after a period, e.g. "2026-10" -> 1 Nov 2026 00:00Z. */
export function periodEnd(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) throw new Error(`bad period "${period}"`);
  return new Date(Date.UTC(year, month, 1));
}

export const TRIAL_DAYS = 14;
export const DEFAULT_FEE_MINOR = 10_000; // GHS 100 in pesewas
export const DEFAULT_GRACE_DAYS = 7;

export function trialEndsAt(from: Date): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}
