// ============================================================
// Age brackets & promotion engine (pure functions, unit tested).
// A church configures brackets (min/max age in years); members are
// resolved into one from their birth date, and the promotion check
// detects members who crossed a boundary since their last assignment.
// ============================================================

export interface AgeBracketCfg {
  id: string;
  key: string;
  label: string;
  minAge: number;
  /** inclusive upper bound; null/undefined = open-ended (e.g. 60+) */
  maxAge?: number | null;
  /** split headcount into KEY_M / KEY_W sections (adults) */
  genderSplit?: boolean;
  segmentKey: string;
  isActive?: boolean;
  sortOrder?: number;
}

/** Exact age in full years on `at`, from a YYYY-MM-DD birth date. */
export function ageOn(dob: Date | string, at: Date = new Date()): number {
  const d = typeof dob === 'string' ? new Date(`${dob.slice(0, 10)}T00:00:00Z`) : dob;
  if (Number.isNaN(d.getTime())) throw new Error(`invalid dob: ${String(dob)}`);
  const atUtc = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const dobUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  let age = atUtc.getUTCFullYear() - dobUtc.getUTCFullYear();
  const monthDiff = atUtc.getUTCMonth() - dobUtc.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && atUtc.getUTCDate() < dobUtc.getUTCDate())) age -= 1;
  return Math.max(0, age); // future/invalid dob -> 0, never negative
}

/** Bracket covering `age` (minAge <= age <= maxAge, maxAge null = open). First match wins. */
export function resolveBracket<T extends AgeBracketCfg>(age: number, brackets: readonly T[]): T | null {
  const sorted = [...brackets]
    .filter((b) => b.isActive !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.minAge - b.minAge);
  for (const b of sorted) {
    if (age >= b.minAge && (b.maxAge == null || age <= b.maxAge)) return b;
  }
  return null;
}

/** Headcount section key for a person in `bracket` (gender-split aware). */
export function segmentKeyFor(
  bracket: AgeBracketCfg,
  gender?: 'MALE' | 'FEMALE' | null,
): string {
  if (bracket.genderSplit && (gender === 'MALE' || gender === 'FEMALE')) {
    return `${bracket.segmentKey}_${gender === 'MALE' ? 'M' : 'W'}`;
  }
  return bracket.segmentKey;
}

export interface PromotionCandidate {
  id: string;
  name: string;
  age: number;
  fromBracketKey: string;
  toBracketKey: string;
  fromLabel: string;
  toLabel: string;
}

/**
 * Detect members whose age now falls in a different bracket than the one
 * they're assigned to (birthday auto-upgrade). Members without a dob are
 * skipped; inactive brackets are never promotion targets.
 */
export function promotionsFor(
  members: { id: string; name: string; ageBracketId: string | null; dob: Date | string | null }[],
  brackets: readonly AgeBracketCfg[],
  at: Date = new Date(),
): PromotionCandidate[] {
  const byId = new Map(brackets.map((b) => [b.id, b]));
  const out: PromotionCandidate[] = [];
  for (const m of members) {
    if (!m.dob) continue;
    const age = ageOn(m.dob, at);
    const target = resolveBracket(age, brackets);
    if (!target) continue;
    if (m.ageBracketId === target.id) continue;
    const current = m.ageBracketId ? byId.get(m.ageBracketId) : undefined;
    out.push({
      id: m.id,
      name: m.name,
      age,
      fromBracketKey: current?.key ?? 'UNASSIGNED',
      toBracketKey: target.key,
      fromLabel: current?.label ?? 'Unassigned',
      toLabel: target.label,
    });
  }
  return out;
}
