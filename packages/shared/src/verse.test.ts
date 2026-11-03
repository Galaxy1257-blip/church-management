import { describe, expect, it } from 'vitest';
import { BOOK_ORDER, inBookOrder, matchBook, normaliseBookName, parseVerseRef, readVerse } from './verse';

const BOOKS = [
  { name: '1 John', chapters: { '3': ['one', 'two', 'three'] } },
  { name: 'Psalms', chapters: { '23': ['The LORD is my shepherd', '', 'he leadeth'] } },
  { name: 'Revelation', chapters: { '21': ['a', 'b', 'c', 'd'] } },
];

const TWI = [
  { name: 'Matthew', localName: 'Mateo', chapters: { '1': ['the book of the generation', ' Abraam'] } },
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

  it('finds a book by the title the translation itself prints', () => {
    expect(matchBook(TWI, 'Mateo')?.name).toBe('Matthew');
    expect(matchBook(TWI, 'Matthew')?.name).toBe('Matthew');
  });
});

describe('inBookOrder', () => {
  it('puts the books in the order a printed Bible uses', () => {
    const out = inBookOrder([
      { name: 'Revelation' },
      { name: '1 Chronicles' },
      { name: 'Genesis' },
      { name: 'Matthew' },
      { name: 'Psalms' },
    ]);
    expect(out.map((b) => b.name)).toEqual(['Genesis', '1 Chronicles', 'Psalms', 'Matthew', 'Revelation']);
  });

  it('covers all 66 books and leaves anything unknown at the end', () => {
    expect(new Set(BOOK_ORDER).size).toBe(66);
    expect(BOOK_ORDER[0]).toBe('Genesis');
    expect(BOOK_ORDER[65]).toBe('Revelation');
    expect(inBookOrder([{ name: 'Testimony of Judas' }, { name: 'John' }]).map((b) => b.name)).toEqual(['John', 'Testimony of Judas']);
  });
});

describe('readVerse', () => {
  it('accepts a local reference and keeps the citation canonical', () => {
    expect(readVerse(TWI, 'Mateo 1:1')).toEqual({
      text: 'the book of the generation',
      ref: 'Matthew 1:1',
      book: 'Matthew',
      bookLocal: 'Mateo',
    });
  });

  it('joins a range and labels it with the bundle spelling', () => {
    expect(readVerse(BOOKS, 'I John 3:2-3')).toEqual({ text: 'two three', ref: '1 John 3:2-3', book: '1 John', bookLocal: '1 John' });
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
