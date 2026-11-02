import { describe, expect, it } from 'vitest';
import {
  BIBLE_NOTE_COLOURS,
  cleanNoteText,
  normaliseNoteColour,
  normaliseNoteRef,
  isBibleNoteColour,
  NOTE_TEXT_MAX,
} from './bible-notes';

describe('normaliseNoteColour', () => {
  it('keeps a known colour and falls back to yellow', () => {
    for (const colour of BIBLE_NOTE_COLOURS) expect(normaliseNoteColour(colour)).toBe(colour);
    expect(normaliseNoteColour('#ffcc00')).toBe('yellow');
    expect(normaliseNoteColour(undefined)).toBe('yellow');
    expect(normaliseNoteColour(7)).toBe('yellow');
  });

  it('isBibleNoteColour only accepts the fixed keys', () => {
    expect(isBibleNoteColour('green')).toBe(true);
    expect(isBibleNoteColour('GREEN')).toBe(false);
    expect(isBibleNoteColour('hot pink')).toBe(false);
  });
});

describe('normaliseNoteRef', () => {
  it('accepts a real verse reference', () => {
    expect(normaliseNoteRef('John 3:16')).toBe('John 3:16');
    expect(normaliseNoteRef('  1   John  3:16 ')).toBe('1 John 3:16');
    expect(normaliseNoteRef('Psalm 23:1-3')).toBe('Psalm 23:1-3');
  });

  it('rejects anything that is not a verse', () => {
    expect(normaliseNoteRef('John 3')).toBeNull();
    expect(normaliseNoteRef('John')).toBeNull();
    expect(normaliseNoteRef('')).toBeNull();
    expect(normaliseNoteRef(undefined)).toBeNull();
    expect(normaliseNoteRef(42)).toBeNull();
  });

  it('rejects a runaway reference instead of saving half of it', () => {
    expect(normaliseNoteRef(`${'a'.repeat(200)} 3:16`)).toBeNull();
  });
});

describe('cleanNoteText', () => {
  it('trims and caps the note', () => {
    expect(cleanNoteText('  the Lord is my shepherd  ')).toBe('the Lord is my shepherd');
    expect(cleanNoteText(`${'x'.repeat(NOTE_TEXT_MAX + 500)}`).length).toBe(NOTE_TEXT_MAX);
    expect(cleanNoteText('line one\r\nline two')).toBe('line one\nline two');
  });

  it('gives up on anything that is not a string', () => {
    expect(cleanNoteText(null)).toBe('');
    expect(cleanNoteText({})).toBe('');
  });
});
