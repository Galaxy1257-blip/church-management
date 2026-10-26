import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time compare for shared secrets and hashes. Length is not secret
 * (it is fixed by the format), so a length check before the compare leaks
 * nothing useful and keeps `timingSafeEqual` from throwing on size mismatch.
 */
export function timingSafeEqualStr(a: string | undefined | null, b: string | undefined | null): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
