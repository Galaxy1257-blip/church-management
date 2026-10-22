// Assembles WEB (World English Bible — public domain) chapter-by-chapter from
// bible-api.com (serves public-domain translations; WEB confirmed PD). Runs
// detached: ~1189 chapters, pool of 8, retries. Output: apps/api/data/bible/web.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/data/bible/web.json');
const API = 'https://bible-api.com';

// Canonical 66 books as bible-api.com slugs + display names + chapter counts.
const BOOKS = [
  ['genesis', 'Genesis', 50], ['exodus', 'Exodus', 40], ['leviticus', 'Leviticus', 27], ['numbers', 'Numbers', 36],
  ['deuteronomy', 'Deuteronomy', 34], ['joshua', 'Joshua', 24], ['judges', 'Judges', 21], ['ruth', 'Ruth', 4],
  ['1 samuel', '1 Samuel', 31], ['2 samuel', '2 Samuel', 24], ['1 kings', '1 Kings', 22], ['2 kings', '2 Kings', 25],
  ['1 chronicles', '1 Chronicles', 29], ['2 chronicles', '2 Chronicles', 36], ['ezra', 'Ezra', 10],
  ['nehemiah', 'Nehemiah', 13], ['esther', 'Esther', 10], ['job', 'Job', 42], ['psalms', 'Psalms', 150],
  ['proverbs', 'Proverbs', 31], ['ecclesiastes', 'Ecclesiastes', 12], ['song of solomon', 'Song of Solomon', 8],
  ['isaiah', 'Isaiah', 66], ['jeremiah', 'Jeremiah', 52], ['lamentations', 'Lamentations', 5],
  ['ezekiel', 'Ezekiel', 48], ['daniel', 'Daniel', 12], ['hosea', 'Hosea', 14], ['joel', 'Joel', 3],
  ['amos', 'Amos', 9], ['obadiah', 'Obadiah', 1], ['jonah', 'Jonah', 4], ['micah', 'Micah', 7],
  ['nahum', 'Nahum', 3], ['habakkuk', 'Habakkuk', 3], ['zephaniah', 'Zephaniah', 3], ['haggai', 'Haggai', 2],
  ['zechariah', 'Zechariah', 14], ['malachi', 'Malachi', 4],
  ['matthew', 'Matthew', 28], ['mark', 'Mark', 16], ['luke', 'Luke', 24], ['john', 'John', 21], ['acts', 'Acts', 28],
  ['romans', 'Romans', 16], ['1 corinthians', '1 Corinthians', 16], ['2 corinthians', '2 Corinthians', 13],
  ['galatians', 'Galatians', 6], ['ephesians', 'Ephesians', 6], ['philippians', 'Philippians', 4],
  ['colossians', 'Colossians', 4], ['1 thessalonians', '1 Thessalonians', 5], ['2 thessalonians', '2 Thessalonians', 3],
  ['1 timothy', '1 Timothy', 6], ['2 timothy', '2 Timothy', 4], ['titus', 'Titus', 3], ['philemon', 'Philemon', 1],
  ['hebrews', 'Hebrews', 13], ['james', 'James', 5], ['1 peter', '1 Peter', 5], ['2 peter', '2 Peter', 3],
  ['1 john', '1 John', 5], ['2 john', '2 John', 1], ['3 john', '3 John', 1], ['jude', 'Jude', 1],
  ['revelation', 'Revelation', 22],
];

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000 * attempt)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 700 * attempt));
    }
  }
  throw lastErr;
}

const jobs = [];
for (const [slug, , chapters] of BOOKS) {
  for (let c = 1; c <= chapters; c++) jobs.push({ slug, chapter: c });
}
console.log(`fetching ${jobs.length} chapters of WEB…`);

const booksOut = BOOKS.map(([, name]) => ({ name, chapters: {} }));
const bookIdx = new Map(BOOKS.map(([, name], i) => [name, i]));
let done = 0;
let failed = 0;
let next = 0;

await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < jobs.length) {
      const i = next++;
      const job = jobs[i];
      try {
        const data = await fetchJson(`${API}/${job.slug.replace(/ /g, '+')}?translation=web`);
        const verses = (data.verses ?? [])
          .filter((v) => Number(v.chapter) === job.chapter)
          .sort((a, b) => Number(a.verse) - Number(b.verse))
          .map((v) => v.text.replace(/\s+/g, ' ').trim());
        if (verses.length > 0) {
          const bi = bookIdx.get(BOOKS.find((b) => b[0] === job.slug)[1]);
          booksOut[bi].chapters[String(job.chapter)] = verses;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 150 === 0) console.log(`  ${done}/${jobs.length} (failed ${failed})`);
    }
  }),
);

const complete = booksOut.filter((b) => Object.keys(b.chapters).length > 0);
if (complete.length < 60) {
  console.error(`only ${complete.length} books complete (failed ${failed}) — aborting`);
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  translation: 'WEB',
  language: 'English',
  languageCode: 'en',
  license: 'World English Bible — public domain (no copyright)',
  publicDomain: true,
  source: 'bible-api.com (WEB text)',
  books: booksOut,
}));
console.log(`WEB bundled: ${complete.length} books, ${failed} chapter failures -> ${OUT}`);
