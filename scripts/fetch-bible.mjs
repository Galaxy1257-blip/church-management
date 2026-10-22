// Bundles the public-domain KJV into apps/api/data/bible/kjv.json (gitignored).
// Source: aruljohn/Bible-kjv (one JSON per book; KJV crown copyright expired
// 2016 => public domain). Licensed translations drop in beside it later with
// the same shape: { translation, publicDomain, books: [{ name, chapters: { "1": ["v", ...] } }] }.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_REPO = 'aruljohn/Bible-kjv';
const API_LIST = `https://api.github.com/repos/${SRC_REPO}/contents/`;
const RAW_BASE = `https://raw.githubusercontent.com/${SRC_REPO}/master/`;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/api/data/bible/kjv.json');

const listRes = await fetch(API_LIST, { headers: { Accept: 'application/vnd.github+json' } });
if (!listRes.ok) {
  console.error(`Failed to list source repo: HTTP ${listRes.status}`);
  process.exit(1);
}
const entries = (await listRes.json()).filter(
  (e) => e.type === 'file' && e.name.endsWith('.json') && e.name !== 'Books.json',
);
console.log(`Found ${entries.length} book files`);

// Parallel fetches (pool of 8) — 66 sequential fetches trip the 30s shell cap.
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function fetchJson(url, timeoutMs = 60000) {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

const results = await mapPool(entries, 8, async (entry) => {
  try {
    const raw = await fetchJson(RAW_BASE + entry.name, 30000);
    if (!raw?.book || !Array.isArray(raw.chapters)) return null;
    const chapters = {};
    for (const ch of raw.chapters) chapters[String(ch.chapter)] = (ch.verses ?? []).map((v) => v.text);
    return { name: String(raw.book), chapters };
  } catch {
    return null; // counted below; <60 aborts loudly
  }
});

const books = results.filter(Boolean);
if (books.length < 60) {
  console.error(`Only ${books.length} books fetched — aborting (expected 66)`);
  process.exit(1);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ translation: 'KJV', language: 'English', languageCode: 'en', license: 'Public domain (KJV crown copyright expired 2016)', publicDomain: true, source: SRC_REPO, books }));
console.log(`KJV bundled: ${books.length} books -> ${OUT}`);

// ---- Phase 2: more public-domain English translations (scrollmapper, MIT repo)
// Flat per-verse rows OR per-book shapes are auto-detected; missing files are
// skipped (log says why). R2.2 checklist lives in BUILD_ORDER.md.
const EXTRA_SRC = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json';
const EXTRA = [
  { code: 'asv', file: 'ASV', translation: 'ASV (1901)', license: 'Public domain (1901)', publicDomain: true },
  // WEB: not in this repo (404 on WEB/WBT/WBS, 21 Oct) — add its verified
  // public-domain source here once confirmed (see BUILD_ORDER R2.2).
];

function normalize(raw, meta) {
  // Shape A: flat rows [{book, chapter, verse, text}]
  if (Array.isArray(raw) && raw[0]?.book && (raw[0]?.verse !== undefined || raw[0]?.text)) {
    const booksMap = new Map();
    for (const row of raw) {
      if (!booksMap.has(row.book)) booksMap.set(row.book, {});
      const chapters = booksMap.get(row.book);
      const cn = String(row.chapter);
      if (!chapters[cn]) chapters[cn] = [];
      chapters[cn][Number(row.verse) - 1] = row.text;
    }
    return { translation: meta.translation, language: 'English', languageCode: 'en', license: meta.license, publicDomain: meta.publicDomain, source: EXTRA_SRC, books: [...booksMap.entries()].map(([name, chapters]) => ({ name, chapters })) };
  }
  // Shape B: per-book [{book/chapters...}] or wrapper {books:[...]}
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.books) ? raw.books : null;
  if (arr && arr[0]?.chapters) {
    const shaped = arr.map((b) => {
      const chapters = {};
      if (Array.isArray(b.chapters) && b.chapters[0]?.verses) {
        for (const ch of b.chapters) chapters[String(ch.chapter)] = ch.verses.map((v) => v.text ?? v);
      } else if (b.chapters && typeof b.chapters === 'object') {
        for (const [cn, verses] of Object.entries(b.chapters)) chapters[cn] = verses.map((v) => (typeof v === 'string' ? v : v.text));
      }
      return { name: b.book ?? b.name, chapters };
    });
    return { translation: meta.translation, language: 'English', languageCode: 'en', license: meta.license, publicDomain: meta.publicDomain, source: EXTRA_SRC, books: shaped };
  }
  return null;
}

for (const meta of EXTRA) {
  try {
    const raw = await fetchJson(`${EXTRA_SRC}/${meta.file}.json`, 120000); // ~8.4MB files
    const bundle = normalize(raw, meta);
    if (!bundle || bundle.books.length < 60) { console.log(`skip ${meta.code}: unrecognized shape or too few books`); continue; }
    writeFileSync(resolve(dirname(OUT), `${meta.code}.json`), JSON.stringify(bundle));
    console.log(`${meta.translation} bundled: ${bundle.books.length} books -> ${meta.code}.json`);
  } catch (err) {
    console.log(`skip ${meta.code}: ${err.message}`);
  }
}
console.log('done');

