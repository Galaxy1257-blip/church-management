// One reference parser and one book matcher, shared by the Bible API, the
// worker's verse SMS and the daily reading, so anything that resolves on screen
// resolves in an SMS as well.
export interface BibleBookLike {
  name: string;
  chapters: Record<string, string[]>;
}

export interface ParsedVerseRef {
  book: string;
  chapter: number;
  from: number;
  to: number;
}

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
};

/** '1 John' and 'I John' are the same book; the KJV and ASV bundles spell them differently. */
export function normaliseBookName(name: string): string {
  const q = name.trim().toLowerCase().replace(/\s+/g, ' ');
  const m = /^([ivx]+)\s+(.+)$/.exec(q);
  if (m && ROMAN[m[1]]) return `${ROMAN[m[1]]} ${m[2]}`;
  if (q === 'psalm') return 'psalms';
  if (q === 'revelation of john' || q === 'the revelation of john') return 'revelation';
  return q;
}

export function parseVerseRef(ref: string): ParsedVerseRef | null {
  const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) return null;
  const chapter = Number(m[2]);
  const from = Number(m[3]);
  const to = m[4] ? Number(m[4]) : from;
  if (!Number.isFinite(chapter) || !Number.isFinite(from) || from < 1 || to < from) return null;
  return { book: m[1].trim(), chapter, from, to };
}

export function matchBook<T extends BibleBookLike>(books: T[], wanted: string): T | null {
  const key = normaliseBookName(wanted);
  return (
    books.find((b) => normaliseBookName(b.name) === key) ??
    books.find((b) => normaliseBookName(b.name).startsWith(key)) ??
    null
  );
}

/** Verses for a reference in one bundle, or null when that bundle cannot answer it. */
export function readVerse(
  books: BibleBookLike[],
  ref: string,
  maxChars = 450,
): { text: string; ref: string; book: string } | null {
  const parsed = parseVerseRef(ref);
  if (!parsed) return null;
  const book = matchBook(books, parsed.book);
  if (!book) return null;
  const verses = book.chapters[String(parsed.chapter)];
  if (!verses) return null;
  const picked: string[] = [];
  for (let n = parsed.from; n <= parsed.to; n++) if (verses[n - 1]) picked.push(verses[n - 1]);
  if (picked.length === 0) return null;
  const text = picked.join(' ');
  const label = `${book.name} ${parsed.chapter}:${parsed.from}${parsed.to > parsed.from ? `-${parsed.to}` : ''}`;
  return {
    text: text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text,
    ref: label,
    book: book.name,
  };
}
