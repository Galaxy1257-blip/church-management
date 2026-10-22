// UUIDv7: time-ordered ids for client-generated rows (headcount outbox,
// attendance, idempotent inserts). v7 keeps B-tree inserts cheap vs random v4.
// Uses Web Crypto (globalThis.crypto) so the SAME build works in Node, worker
// and the browser bundle — no node:crypto (webpack can't parse node: URLs).

function randomFill(bytes: Uint8Array): Uint8Array {
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp + version 7 + variant 10 + 74 random bits. */
export function uuidv7(nowMs: number = Date.now()): string {
  if (!Number.isInteger(nowMs) || nowMs < 0 || nowMs > 0xffffffffffff) {
    throw new Error(`uuidv7: timestamp out of range: ${nowMs}`);
  }
  const tsHex = nowMs.toString(16).padStart(12, '0');
  const r = randomFill(new Uint8Array(16));
  const dv = new DataView(r.buffer);
  // rand_a: 12 random bits directly after the version nibble
  const a = ((r[0] & 0x0f) << 8) | r[1];
  const aHex = a.toString(16).padStart(3, '0');
  // variant '10' + 62 random bits (>>> 0 keeps the 32-bit word unsigned)
  const bHigh = (((dv.getUint32(2) & 0x3fffffff) | 0x80000000) >>> 0);
  const bLow = dv.getUint32(6) >>> 0;
  const bHex = bHigh.toString(16).padStart(8, '0') + bLow.toString(16).padStart(8, '0');
  const full = `${tsHex}7${aHex}${bHex}`;
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
