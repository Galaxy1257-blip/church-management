// Bundles the public-domain World English Bible (WEB) into
// apps/api/data/bible/web.json (committed, like kjv.json). WEB is modern,
// plain English — the easier companion to the KJV (owner ask, 8 Nov).
// Source: github.com/TehShrike/world-english-bible (public domain; the repo
// ships per-book JSON with chapterNumber/verseNumber/value blocks).
// Regenerate: node scripts/fetch-web-bible.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_REPO = 'TehShrike/world-english-bible';
const RAW_BASE = `https://raw.githubusercontent.com/${SRC_REPO}/master/json/`;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/data/bible/web.json');
const KJV = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/data/bible/kjv.json');

// The repo names books by lowercase slug; the app names them like the KJV
// bundle. Computed from the slug, with one special case, then checked against
// the KJV book list so a rename upstream fails loudly here instead of silently
// producing a book nobody can search.
function canonicalName(slug) {
  if (slug === 'songofsolomon') return 'Song of Solomon';
  const m = /^([123])([a-z]+)$/.exec(slug);
  const words = m ? [m[1], m[2]] : [slug];
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

const SLUGS = [
  '1chronicles', '1corinthians', '1john', '1kings', '1peter', '1samuel', '1thessalonians', '1timothy',
  '2chronicles', '2corinthians', '2john', '2kings', '2peter', '2samuel', '2thessalonians', '2timothy',
  '3john', 'acts', 'amos', 'colossians', 'daniel', 'deuteronomy', 'ecclesiastes', 'ephesians', 'esther',
  'exodus', 'ezekiel', 'ezra', 'galatians', 'genesis', 'habakkuk', 'haggai', 'hebrews', 'hosea', 'isaiah',
  'james', 'jeremiah', 'job', 'joel', 'john', 'jonah', 'joshua', 'jude', 'judges', 'lamentations', 'leviticus',
  'luke', 'malachi', 'mark', 'matthew', 'micah', 'nahum', 'nehemiah', 'numbers', 'obadiah', 'philemon',
  'philippians', 'proverbs', 'psalms', 'revelation', 'romans', 'ruth', 'songofsolomon', 'titus',
  'zechariah', 'zephaniah',
];

const kjv = JSON.parse(readFileSync(KJV, 'utf8'));
const kjvNames = new Set(kjv.books.map((b) => b.name));

async function fetchJson(url, timeoutMs = 60000) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

const books = [];
for (const slug of SLUGS) {
  const name = canonicalName(slug);
  if (!kjvNames.has(name)) throw new Error(`book name "${name}" (from ${slug}) is not in the KJV bundle`);
  const blocks = await fetchJson(`${RAW_BASE}${slug}.json`);
  const chapters = {};
  for (const block of blocks) {
    if (!block || block.verseNumber == null || block.chapterNumber == null || typeof block.value !== 'string') continue;
    const ch = String(block.chapterNumber);
    (chapters[ch] ??= []);
    // The source splits many verses into several blocks (same chapter+verse).
    // Join them in order — overwriting kept only the last fragment (e.g. WEB
    // Genesis 3:16 came out as just "and he will rule over you.").
    const idx = block.verseNumber - 1;
    const piece = block.value.trim();
    if (!piece) continue;
    chapters[ch][idx] = chapters[ch][idx] ? `${chapters[ch][idx]} ${piece}` : piece;
  }
  // Fill any holes (verses the WEB omits, e.g. Acts 8:37) and normalise the
  // joined whitespace. Array.from visits every index — .map would skip sparse
  // holes and leave them, which JSON serialises as null (copied as "null").
  for (const ch of Object.keys(chapters)) {
    const src = chapters[ch];
    chapters[ch] = Array.from({ length: src.length }, (_, i) => (src[i] ?? '').replace(/\s+/g, ' ').trim());
  }
  const chapterCount = Object.keys(chapters).length;
  const kjvBook = kjv.books.find((b) => b.name === name);
  if (kjvBook && Object.keys(kjvBook.chapters).length !== chapterCount) {
    throw new Error(`${name}: WEB has ${chapterCount} chapters, KJV has ${Object.keys(kjvBook.chapters).length}`);
  }
  books.push({ name, chapters });
  console.log(`${name}: ${chapterCount} chapters`);
}

const totalVerses = books.reduce((n, b) => n + Object.values(b.chapters).reduce((m, c) => m + c.length, 0), 0);
if (totalVerses < 30000 || totalVerses > 32000) throw new Error(`verse count ${totalVerses} looks wrong`);

const bundle = {
  translation: 'World English Bible (WEB)',
  language: 'English',
  languageCode: 'en',
  license: 'Public domain (World English Bible; source github.com/TehShrike/world-english-bible)',
  publicDomain: true,
  source: SRC_REPO,
  books,
};
writeFileSync(OUT, JSON.stringify(bundle));
console.log(`wrote ${OUT} — ${books.length} books, ${totalVerses} verses`);
