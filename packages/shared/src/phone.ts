// ============================================================
// Ghana phone normalisation to E.164 (+233...).
// Mobile numbers only: +233 followed by 9 digits starting 2 or 5.
// ============================================================

export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhoneError';
  }
}

const NON_DIGITS = /[\s\-().]/g;

/**
 * Normalise a Ghanaian mobile number to E.164.
 * Accepts: "0241234567", "241234567", "233241234567", "+233 24 123 4567",
 * "00233241234567", "(0) 24 123 4567", and the very common "+233 024 123 4567"
 * where the trunk 0 is kept behind the country code.
 * Throws PhoneError for anything that is not a valid GH mobile number.
 */
export function normalizeGhPhone(input: string): string {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new PhoneError('Enter a phone number.');
  }
  let raw = input.trim().replace(NON_DIGITS, '');
  if (raw.startsWith('00')) raw = '+' + raw.slice(2);
  if (!/^\+?\d+$/.test(raw)) throw new PhoneError('That does not look like a phone number.');

  let national: string;
  if (raw.startsWith('+233')) {
    national = raw.slice(4);
  } else if (raw.startsWith('233')) {
    national = raw.slice(3);
  } else if (raw.startsWith('0')) {
    national = raw.slice(1);
  } else {
    national = raw;
  }

  // People write their number the way they dial it, so "+233 024 123 4567"
  // arrives here with the trunk 0 still attached. Drop it.
  if (national.length === 10 && national.startsWith('0')) national = national.slice(1);

  if (national.length !== 9) {
    throw new PhoneError('A Ghana mobile number has 10 digits, like 024 000 0000.');
  }
  if (!/^[25]/.test(national)) {
    throw new PhoneError('A Ghana mobile number starts with 02 or 05, like 024 000 0000.');
  }
  return `+233${national}`;
}

export function isValidGhPhone(input: string): boolean {
  try {
    normalizeGhPhone(input);
    return true;
  } catch {
    return false;
  }
}

/** Mask for logs/UI: +233241234567 -> 024***4567. */
export function maskPhone(e164: string): string {
  if (!e164 || !e164.startsWith('+233') || e164.length < 8) return '***';
  const national = e164.slice(4);
  return `0${national.slice(0, 2)}***${national.slice(-4)}`;
}

/** Display form used in CSV exports: 024 123 4567. */
export function formatGhPhoneDisplay(e164: string): string {
  const n = normalizeGhPhone(e164).slice(4);
  return `0${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
}
