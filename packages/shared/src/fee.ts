// ============================================================
// Giving fees (Paystack GH): integer pesewas, deterministic.
// fee = round(gift * bps / 10000) + flat, capped at feeCapMinor.
// ============================================================

import { assertPositiveMinor, assertMinor, Minor } from './money';

export type FeeMode = 'CHURCH_ABSORBS' | 'GIVER_ABSORBS' | 'GIVER_CHOICE';

export interface FeeSettings {
  feeMode: FeeMode;
  feeBps: number; // 195 = 1.95%
  feeFlatMinor: number; // 10 = GHS 0.10
  feeCapMinor: number | null;
}

export interface FeeQuote {
  /** Amount credited to the fund (what the church cares about). */
  giftMinor: Minor;
  /** Total processing fee charged by the gateway for this transaction. */
  feeMinor: Minor;
  /** How much of the fee the giver is covering on top of the gift. */
  feeCoverMinor: Minor;
  /** What the giver actually pays. */
  chargedMinor: Minor;
  /** gift - (church-absorbed part of the fee). Equals giftMinor unless feeMode is CHURCH_ABSORBS. */
  netToFundMinor: Minor;
  feeMode: FeeMode;
}

function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** Gateway fee on a charge of `amountMinor` pesewas. */
export function computeFee(amountMinor: Minor, settings: FeeSettings): Minor {
  assertPositiveMinor('amountMinor', amountMinor);
  if (!Number.isInteger(settings.feeBps) || settings.feeBps < 0) {
    throw new Error('feeBps must be a non-negative integer');
  }
  if (!Number.isInteger(settings.feeFlatMinor) || settings.feeFlatMinor < 0) {
    throw new Error('feeFlatMinor must be a non-negative integer');
  }
  if (settings.feeCapMinor !== null) assertNonNegativeInt(settings.feeCapMinor);
  const raw = roundHalfUp((amountMinor * settings.feeBps) / 10000) + settings.feeFlatMinor;
  const capped = settings.feeCapMinor === null ? raw : Math.min(raw, settings.feeCapMinor);
  assertMinor('fee', capped);
  return capped;
}

function assertNonNegativeInt(v: number): void {
  if (!Number.isInteger(v) || v < 0) throw new Error('feeCapMinor must be a non-negative integer');
}

/**
 * Quote a gift: giver wants the fund credited `giftMinor`.
 * opts.feeChoice only applies to GIVER_CHOICE (true = giver covers the fee).
 */
export function quote(giftMinor: Minor, settings: FeeSettings, opts: { feeChoice?: boolean } = {}): FeeQuote {
  assertPositiveMinor('giftMinor', giftMinor);
  const fee = computeFee(giftMinor, settings);

  let feeCoverMinor: Minor;
  switch (settings.feeMode) {
    case 'CHURCH_ABSORBS':
      feeCoverMinor = 0;
      break;
    case 'GIVER_ABSORBS':
      feeCoverMinor = fee;
      break;
    case 'GIVER_CHOICE':
      feeCoverMinor = opts.feeChoice ? fee : 0;
      break;
    default:
      throw new Error(`unknown feeMode ${String(settings.feeMode)}`);
  }

  const chargedMinor = giftMinor + feeCoverMinor;
  const netToFundMinor = chargedMinor - fee; // fee is taken off the top by the gateway
  return {
    giftMinor,
    feeMinor: fee,
    feeCoverMinor,
    chargedMinor,
    netToFundMinor,
    feeMode: settings.feeMode,
  };
}

/**
 * Gross-up: the giver wants the fund credited exactly `targetNetMinor` and will
 * cover the fee. The fee is computed on the gross charge C, so we solve
 * C - fee(C) = target for the smallest such C (rounding may make exact equality
 * impossible; we never under-credit the fund).
 */
export function grossUp(targetNetMinor: Minor, settings: FeeSettings): FeeQuote {
  assertPositiveMinor('targetNetMinor', targetNetMinor);
  const bps = settings.feeBps;
  const flat = settings.feeFlatMinor;
  if (bps >= 10000) throw new Error('feeBps must be < 10000 to gross up');

  // Analytic seed, then integer correction. net(C) is non-decreasing in C.
  let c = Math.ceil(((targetNetMinor + flat) * 10000) / (10000 - bps));
  if (!Number.isSafeInteger(c) || c <= 0) c = targetNetMinor + flat + 1;

  const net = (x: Minor) => x - computeFee(x, settings);
  let guard = 0;
  while (net(c) < targetNetMinor && guard++ < 1_000_000) c += 1;
  guard = 0;
  while (c > 1 && net(c - 1) >= targetNetMinor && guard++ < 1_000_000) c -= 1;

  const feeCharged = c - net(c);
  return {
    giftMinor: targetNetMinor,
    feeMinor: feeCharged,
    feeCoverMinor: feeCharged,
    chargedMinor: c,
    netToFundMinor: net(c),
    feeMode: 'GIVER_ABSORBS',
  };
}
