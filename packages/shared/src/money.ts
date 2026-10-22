// ============================================================
// Money: integer pesewas (GHS minor units). Never floats.
// ============================================================

export type Minor = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertMinor(name: string, value: unknown): asserts value is Minor {
  if (typeof value !== 'number' || !Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${name} must be an integer number of pesewas, got ${String(value)}`);
  }
}

export function assertPositiveMinor(name: string, value: unknown): asserts value is Minor {
  assertMinor(name, value);
  if (value <= 0) throw new MoneyError(`${name} must be > 0 pesewas, got ${String(value)}`);
}

export function assertNonNegativeMinor(name: string, value: unknown): asserts value is Minor {
  assertMinor(name, value);
  if (value < 0) throw new MoneyError(`${name} must be >= 0 pesewas, got ${String(value)}`);
}

const TO_MINOR_RE = /^\d+(\.\d{1,2})?$/;

/** Parse user input ("12", "12.34", 12.34) into integer pesewas. Max 2 decimals. */
export function toMinor(input: string | number): Minor {
  const s = typeof input === 'number' ? input.toFixed(2) : String(input).trim();
  if (!TO_MINOR_RE.test(s)) {
    throw new MoneyError(`cannot parse "${String(input)}" as GHS amount (use up to 2 decimals)`);
  }
  const [whole, frac = ''] = s.split('.');
  const pesewas = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(pesewas)) throw new MoneyError(`amount too large: ${s}`);
  return pesewas;
}

/** pesewas -> major-unit number, e.g. 1234 -> 12.34 (display only; never re-parse into math). */
export function fromMinor(minor: Minor): number {
  assertMinor('minor', minor);
  return minor / 100;
}

/** Canonical display string, e.g. 1234 -> "GHS 12.34". */
export function formatGhs(minor: Minor): string {
  assertMinor('minor', minor);
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}GHS ${whole}.${frac}`;
}

export function sumMinor(values: readonly Minor[]): Minor {
  let total = 0;
  for (const v of values) {
    assertMinor('values[]', v);
    total += v;
  }
  if (!Number.isSafeInteger(total)) throw new MoneyError('sum overflows safe integer range');
  return total;
}
