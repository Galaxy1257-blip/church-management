import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localDateKey } from './datetime';
import {
  DAILY_READINGS,
  DEFAULT_DEVOTIONAL,
  dailyReading,
  dailyReadingFor,
  resolveDevotional,
} from './daily-reading';
import { parseVerseRef, readVerse } from './verse';

const BIBLE_DIR = resolve(import.meta.dirname, '../../../apps/api/data/bible');

function dateKeyFromDay(offset: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + offset));
  return localDateKey('UTC', d);
}

describe('DAILY_READINGS', () => {
  it('is a long rotation of unique references', () => {
    expect(DAILY_READINGS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(DAILY_READINGS.map((r) => r.ref)).size).toBe(DAILY_READINGS.length);
  });

  it('carries a short plain line beside every verse', () => {
    for (const r of DAILY_READINGS) {
      expect(parseVerseRef(r.ref)).not.toBeNull();
      expect(r.note.length).toBeGreaterThan(15);
      expect(r.note.length).toBeLessThanOrEqual(120);
      expect(r.note.endsWith('.')).toBe(true);
    }
  });

  it('never repeats inside a season: 84 consecutive days cover the whole list once', () => {
    const seen = new Set(Array.from({ length: DAILY_READINGS.length }, (_, i) => dailyReadingFor(dateKeyFromDay(i)).ref));
    expect(seen.size).toBe(DAILY_READINGS.length);
  });
});

describe('dailyReadingFor', () => {
  it('is the same passage for the same date, however often it is asked', () => {
    expect(dailyReadingFor('2026-11-02')).toEqual(dailyReadingFor('2026-11-02'));
    expect(DAILY_READINGS).toContainEqual(dailyReadingFor('2026-11-02'));
  });

  it('moves on when the day moves on', () => {
    expect(dailyReadingFor('2026-11-03').ref).not.toBe(dailyReadingFor('2026-11-02').ref);
  });

  it('keys off the church-local date, not the server clock', () => {
    const at = new Date('2026-11-02T20:00:00Z');
    expect(dailyReading(at, 'Pacific/Kiritimati')).toEqual(dailyReadingFor('2026-11-03'));
    expect(dailyReading(at, 'Africa/Accra')).toEqual(dailyReadingFor('2026-11-02'));
  });

  it('falls back to the first reading on a nonsense date', () => {
    expect(dailyReadingFor('not-a-date')).toBe(DAILY_READINGS[0]);
  });
});

describe('resolveDevotional', () => {
  it('defaults to SMS off, KJV and no pinned verse', () => {
    expect(resolveDevotional(undefined)).toEqual(DEFAULT_DEVOTIONAL);
    expect(resolveDevotional({})).toEqual(DEFAULT_DEVOTIONAL);
    expect(DEFAULT_DEVOTIONAL.verse).toBe('');
  });

  it('only sends the SMS when the church says so', () => {
    expect(resolveDevotional({ enabled: 'yes' }).enabled).toBe(false);
    expect(resolveDevotional({ enabled: true }).enabled).toBe(true);
  });

  it('keeps a pinned verse trimmed and the translation lower-case', () => {
    const d = resolveDevotional({ verse: '  John 3:16 ', translation: 'TWI-Asante' });
    expect(d.verse).toBe('John 3:16');
    expect(d.translation).toBe('twi-asante');
  });

  it('ignores a verse that is only whitespace, so the rotation still runs', () => {
    expect(resolveDevotional({ verse: '   ' }).verse).toBe('');
  });
});

// The bundles are 27MB of licensed data and are not committed, so this only runs
// where they have been fetched (`npm run bible:fetch`).
describe.runIf(existsSync(BIBLE_DIR))('every reading resolves in every bundled translation', () => {
  // runIf skips the tests but still runs this callback, so the read has to
  // tolerate the missing folder itself or CI fails on the collect step.
  const codes = existsSync(BIBLE_DIR)
    ? readdirSync(BIBLE_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
    : [];

  it('has at least the KJV to check against', () => {
    expect(codes.length).toBeGreaterThan(0);
    expect(codes).toContain('kjv');
  });

  for (const code of codes) {
    it(`${code}: all ${DAILY_READINGS.length} references return text`, () => {
      const bundle = JSON.parse(readFileSync(resolve(BIBLE_DIR, `${code}.json`), 'utf8')) as {
        books: { name: string; chapters: Record<string, string[]> }[];
      };
      const misses = DAILY_READINGS.filter((r) => !readVerse(bundle.books, r.ref)).map((r) => r.ref);
      expect(misses).toEqual([]);
    });
  }
});
