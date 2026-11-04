import { describe, expect, it } from 'vitest';
import { cardPayload, parseCardScan } from './card';

describe('member card payloads', () => {
  it('round-trips the issuing church and the card reference', () => {
    const scan = parseCardScan(cardPayload('demo', 'MEM-0001'));
    expect(scan).toEqual({ slug: 'demo', ref: 'MEM-0001' });
  });

  it('lower-cases the church id, because sign-in does', () => {
    expect(parseCardScan('chms-card://DEMO/MEM-0001')).toEqual({ slug: 'demo', ref: 'MEM-0001' });
  });

  it('leaves a typed member number or phone alone', () => {
    expect(parseCardScan('MEM-0001')).toBeNull();
    expect(parseCardScan('0241234567')).toBeNull();
    expect(parseCardScan('')).toBeNull();
  });

  it('refuses a card that lost its reference or its church', () => {
    expect(parseCardScan('chms-card://demo/')).toBeNull();
    expect(parseCardScan('chms-card:///MEM-0001')).toBeNull();
    expect(parseCardScan('chms-card://demo')).toBeNull();
  });
});
