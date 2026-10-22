// ============================================================
// SMS segment maths (GSM-7 vs UCS-2). Used for wallet cost
// previews and campaign quotes; the wallet reserves per segment.
// ============================================================

// GSM 7-bit default alphabet (basic), as a set of code points.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ' +
  "ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§' +
  '¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Characters that use the extension table (2 septets each).
const GSM7_EXTENDED = '^{}\\[~]|€';

const GSM7_SET = new Set(Array.from(GSM7_BASIC));
const GSM7_EXT_SET = new Set(Array.from(GSM7_EXTENDED));

export function isGsm7(body: string): boolean {
  for (const ch of body) {
    if (!GSM7_SET.has(ch) && !GSM7_EXT_SET.has(ch)) return false;
  }
  return true;
}

function septetCount(body: string): number {
  let n = 0;
  for (const ch of body) n += GSM7_EXT_SET.has(ch) ? 2 : 1;
  return n;
}

/**
 * Number of SMS segments a body will occupy.
 * GSM-7: 160 single, 153 per part when concatenated.
 * UCS-2: 70 single, 67 per part when concatenated.
 */
export function smsSegments(body: string): number {
  if (body.length === 0) return 1;
  if (isGsm7(body)) {
    const n = septetCount(body);
    if (n <= 160) return 1;
    return Math.ceil(n / 153);
  }
  const chars = Array.from(body); // count code points, not UTF-16 units
  if (chars.length <= 70) return 1;
  return Math.ceil(chars.length / 67);
}

/** Maximum body length that stays within `segments` segments, or null if unreachable. */
export function maxBodyLengthForSegments(segments: number, gsm7: boolean): number | null {
  if (segments < 1) return null;
  if (gsm7) return segments === 1 ? 160 : segments * 153;
  return segments === 1 ? 70 : segments * 67;
}
