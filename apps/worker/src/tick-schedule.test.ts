import { describe, expect, it } from 'vitest';
import { JOBS, accraNow, planDue } from './tick-schedule';

// A tick is "what is due right now in Accra?" — these times are the shape of
// .github/workflows/jobs-tick.yml, so a schedule change here fails loudly.
const at = (iso: string) => accraNow(new Date(iso));

const decision = (t: ReturnType<typeof accraNow>, job: string) => planDue(t).find((p) => p.job === job)!;

describe('accraNow', () => {
  it('reads the Accra wall clock, not the server timezone', () => {
    expect(at('2026-11-03T16:42:00Z')).toEqual({ date: '2026-11-03', hour: 16, minute: 42 });
  });

  it('rolls the date at Accra midnight', () => {
    expect(at('2026-11-03T23:59:00Z')).toEqual({ date: '2026-11-03', hour: 23, minute: 59 });
    expect(at('2026-11-04T00:01:00Z')).toEqual({ date: '2026-11-04', hour: 0, minute: 1 });
  });
});

describe('the 8pm verse', () => {
  it('is not due during the working day', () => {
    expect(decision(at('2026-11-03T16:42:00Z'), 'verse-of-day').skipReason).toBe('not due yet');
  });

  it('is due at the 20:00 tick', () => {
    expect(decision(at('2026-11-03T20:00:00Z'), 'verse-of-day').lockKey).toBe('tick:verse-of-day:2026-11-03');
  });

  it('asks for the same lock at 22:00, so a later tick the same day cannot send it twice', () => {
    expect(decision(at('2026-11-03T22:00:00Z'), 'verse-of-day').lockKey).toBe('tick:verse-of-day:2026-11-03');
  });

  it('waits for a tick that lands before its time, then runs late rather than not at all', () => {
    expect(decision(at('2026-11-03T19:58:00Z'), 'verse-of-day').lockKey).toBeNull();
    expect(decision(at('2026-11-03T21:34:00Z'), 'verse-of-day').lockKey).toBe('tick:verse-of-day:2026-11-03');
  });
});

describe('the nightly repairs', () => {
  const tick = at('2026-11-04T03:20:00Z');

  it('are all due on the 03:20 tick', () => {
    for (const job of ['reconcile', 'age-promotion', 'missing-member-scan']) {
      expect(decision(tick, job).lockKey, job).toBe(`tick:${job}:2026-11-04`);
    }
  });

  it('are not due at 01:00, so a stray middle-of-the-night poke skips them', () => {
    for (const job of ['reconcile', 'age-promotion', 'missing-member-scan']) {
      expect(decision(at('2026-11-04T01:00:00Z'), job).lockKey, job).toBeNull();
    }
  });

  it('still run when the service was asleep at their clocked minute', () => {
    expect(decision(at('2026-11-04T06:00:00Z'), 'reconcile').lockKey).toBe('tick:reconcile:2026-11-04');
  });
});

describe('the new-visitor drip', () => {
  it('runs on every daytime tick', () => {
    expect(decision(at('2026-11-04T08:00:00Z'), 'followup-tick').lockKey).toBe('tick:followup-tick:2026-11-04:08:00');
    expect(decision(at('2026-11-04T10:00:00Z'), 'followup-tick').lockKey).toBe('tick:followup-tick:2026-11-04:10:00');
  });

  it('waits until morning instead of texting at 3am', () => {
    expect(decision(at('2026-11-04T03:20:00Z'), 'followup-tick').skipReason).toMatch(/outside sending hours/);
    expect(decision(at('2026-11-04T05:00:00Z'), 'followup-tick').skipReason).toMatch(/outside sending hours/);
    expect(decision(at('2026-11-04T23:00:00Z'), 'followup-tick').skipReason).toMatch(/outside sending hours/);
  });

  it('does not resend the same five-minute slot if a tick is replayed', () => {
    expect(decision(at('2026-11-04T12:04:00Z'), 'followup-tick').lockKey).toBe(
      decision(at('2026-11-04T12:01:00Z'), 'followup-tick').lockKey,
    );
  });
});

describe('the stuck-gift sweep', () => {
  it('runs at most once an hour, keyed to the hour', () => {
    expect(decision(at('2026-11-04T14:00:00Z'), 'sweep-pending').lockKey).toBe('tick:sweep-pending:2026-11-04:14');
    expect(decision(at('2026-11-04T14:59:00Z'), 'sweep-pending').lockKey).toBe('tick:sweep-pending:2026-11-04:14');
    expect(decision(at('2026-11-04T15:00:00Z'), 'sweep-pending').lockKey).toBe('tick:sweep-pending:2026-11-04:15');
  });
});

describe('the job list', () => {
  it('matches the names main.ts schedules', () => {
    expect(JOBS.map((j) => j.name).sort()).toEqual(
      ['age-promotion', 'followup-tick', 'missing-member-scan', 'reconcile', 'sweep-pending', 'verse-of-day'].sort(),
    );
  });

  it('explains itself in plain words, because the owner reads the report', () => {
    for (const job of JOBS) expect(job.why.length, job.name).toBeGreaterThan(8);
  });
});
