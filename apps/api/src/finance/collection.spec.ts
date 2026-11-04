// Money is counted at Sunday service and at other programs (harvest night, a
// funeral, a fund drive). The batch label is what the treasurer reads, so one of
// service or program must name it.
import { describe, expect, it } from 'vitest';
import { collectionBatchLabel } from './finance.service';

describe('the collection batch label', () => {
  it('names the service when the count is for one', () => {
    expect(collectionBatchLabel('Sunday Worship', null)).toBe('Offering count — Sunday Worship');
  });

  it('names the program when there is no service', () => {
    expect(collectionBatchLabel(null, '  Harvest night ')).toBe('Offering count — Harvest night');
  });

  it('prefers the typed program name over the service', () => {
    expect(collectionBatchLabel('Sunday Worship', 'Youth camp')).toBe('Offering count — Youth camp');
  });

  it('refuses a count that names neither', () => {
    expect(() => collectionBatchLabel(null, '  ')).toThrow(/service or name the program/);
  });
});
