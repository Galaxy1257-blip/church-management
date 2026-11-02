// Verse notes belong to the person who wrote them — a note is not church data
// anybody else reads. Colours are fixed keys instead of raw hex so the reader
// can remap them for dark mode and they look the same on every device.
import { parseVerseRef } from './verse';

export const BIBLE_NOTE_COLOURS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;

export type BibleNoteColour = (typeof BIBLE_NOTE_COLOURS)[number];

export const BIBLE_NOTE_COLOUR_LABELS: Record<BibleNoteColour, string> = {
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  pink: 'Pink',
  purple: 'Purple',
};

export const NOTE_REF_MAX = 60;
export const NOTE_TEXT_MAX = 500;

/** How many notes one person may keep — the list is capped, not the storage. */
export const NOTE_LIST_LIMIT = 300;

export function isBibleNoteColour(value: unknown): value is BibleNoteColour {
  return typeof value === 'string' && (BIBLE_NOTE_COLOURS as readonly string[]).includes(value);
}

/** An unknown or missing colour falls back to the plain highlight. */
export function normaliseNoteColour(value: unknown): BibleNoteColour {
  return isBibleNoteColour(value) ? value : 'yellow';
}

/** The reference as written, or null when it does not point at a verse. */
export function normaliseNoteRef(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ref = value.trim().replace(/\s+/g, ' ');
  if (ref.length > NOTE_REF_MAX) return null;
  return parseVerseRef(ref) ? ref : null;
}

export function cleanNoteText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, NOTE_TEXT_MAX);
}
