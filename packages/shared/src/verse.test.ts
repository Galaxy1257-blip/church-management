import { describe, expect, it } from 'vitest';
import { matchBook, normaliseBookName, parseVerseRef, readVerse } from './verse';

const BOOKS = [
  { name: '1 John', chapters: { '3': ['one', 'two', 'three'] } },
  { name: 'Psalms', chapters: { '23': ['The LORD is my shepherd', '', 'he leadeth'] } },
  { name: 'Revelation', chapters: { '21': ['a', 'b', 'c', 'd'] } },
];

describe('normaliseBookName', () => {
  it('treats roman and arabic numbered books as the same book', () => {
    expect(normaliseBookName('I John')).toBe('1 john');
    expect(normaliseBookName('ii Samuel')).toBe('2 samuel');
    expect(normaliseBookName('III John')).toBe('3 john');
    expect(normaliseBookName('1 John')).toBe('1 john');
  });

  it('accepts the singular psalm and the ASV name for revelation', () => {
    expect(normaliseBookName('Psalm')).toBe('psalms');
    expect(normaliseBookName('Revelation of John')).toBe('revelation');
  });

  it('collapses spacing and case without inventing aliases', () => {
    expect(normaliseBookName('  Song   of  Solomon ')).toBe('song of solomon');
  });
});

describe('parseVerseRef', () => {
  it('reads single verses and ranges', () => {
    expect(parseVerseRef('John 3:16')).toEqual({ book: 'John', chapter: 3, from: 16, to: 16 });
    expect(parseVerseRef('1 Peter 5:7')).toEqual({ book: '1 Peter', chapter: 5, from: 7, to: 7 });
    expect(parseVerseRef('Psalm 23:1-3')).toEqual({ book: 'Psalm', chapter: 23, from: 1, to: 3 });
  });

  it('rejects anything that is not a chapter:verse reference', () => {
    expect(parseVerseRef('John')).toBeNull();
    expect(parseVerseRef('John 3')).toBeNull();
    expect(parseVerseRef('John 3:16-14')).toBeNull();
    expect(parseVerseRef('John 3:0')).toBeNull();
    expect(parseVerseRef('')).toBeNull();
  });
});

describe('matchBook', () => {
  it('finds the arabic name through the roman spelling and back', () => {
    expect(matchBook(BOOKS, 'I John')?.name).toBe('1 John');
    expect(matchBook(BOOKS, 'Psalm')?.name).toBe('Psalms');
    expect(matchBook(BOOKS, 'Revelation of John')?.name).toBe('Revelation');
    expect(matchBook(BOOKS, 'Esther')).toBeNull();
  });
});

describe('readVerse', () => {
  it('joins a range and labels it with the bundle spelling', () => {
    expect(readVerse(BOOKS, 'I John 3:2-3')).toEqual({ text: 'two three', ref: '1 John 3:2-3', book: '1 John' });
  });

  it('skips empty verse slots instead of returning holes', () => {
    expect(readVerse(BOOKS, 'Psalm 23:1-3')?.text).toBe('The LORD is my shepherd he leadeth');
  });

  it('caps long passages so an SMS stays affordable', () => {
    const big = [{ name: 'Genesis', chapters: { '1': ['x'.repeat(500)] } }];
    const out = readVerse(big, 'Genesis 1:1', 450);
    expect(out?.text.length).toBe(450);
    expect(out?.text.endsWith('…')).toBe(true);
  });

  it('returns null when this bundle cannot answer the reference', () => {
    expect(readVerse(BOOKS, 'John 3:16')).toBeNull();
    expect(readVerse(BOOKS, '1 John 4:1')).toBeNull();
    expect(readVerse(BOOKS, '1 John 3:9')).toBeNull();
    expect(readVerse(BOOKS, 'not a reference')).toBeNull();
  });
});
