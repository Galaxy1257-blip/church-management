// add-bible-local-names.mjs — give each bundled Bible its own language book
// names. The bundles carry canonical English `name` values because
// normalize-bible-bundle.mjs identifies books structurally (chapter/verse
// signature) and then discards the source's own title. A reader opening the Twi
// Bible should see "Mateo", not "Matthew".
//
// This script re-reads the ORIGINAL sources and merges a `localName` onto every
// book, keeping `name` canonical so chapter/verse references keep working.
//
// Sources:
//   1. mobobi APK — `assets/(English)Mateo.txt` pairs a book's local name (the
//      file stem) with the KJV English title printed on its first line, which
//      identifies the book. Entry names are re-decoded from cp1252 mojibake
//      because these zips store UTF-8 names without the UTF-8 flag.
//   2. christappzz Room DB — `TotalBooks.subBookName` holds the printed title in
//      correct Unicode, and the same table carries an English shelf in the same
//      row order, so the two lists label each other.
//   3. scripts/data/*.json — curated list for a language whose app shipped the
//      WRONG names (com.eweghana.bible stores the Twi book list verbatim).
//
// Usage:
//   node scripts/add-bible-local-names.mjs            # report only, no writes
//   node scripts/add-bible-local-names.mjs --write    # merge into the bundles
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIBLE_DIR = join(ROOT, 'apps/api/data/bible');
const TMP = process.env.LOCAL_NAMES_TMP || 'C:/tmp_bible_names';
const WRITE = process.argv.includes('--write');
const DOWNLOADS = 'C:/Users/HP/Downloads';

// ---------- canonical name from the KJV-style English title ----------
function titleToCanon(rawTitle) {
  const t = rawTitle.toLowerCase().replace(/\s+/g, ' ').trim();
  const ord = /\bsecond\b/.test(t) ? 2 : /\bthird\b/.test(t) ? 3 : /\bfirst\b/.test(t) ? 1 : 0;
  const has = (re) => re.test(t);
  const numbered = (family, fallback) => (ord === 2 ? `2 ${family}` : `${fallback ?? 1} ${family}`);
  if (has(/genesis/)) return 'Genesis';
  if (has(/exodus/)) return 'Exodus';
  if (has(/leviticus/)) return 'Leviticus';
  if (has(/numbers/)) return 'Numbers';
  if (has(/deuteronom/)) return 'Deuteronomy';
  if (has(/joshua/)) return 'Joshua';
  if (has(/judges/)) return 'Judges';
  if (has(/ruth/)) return 'Ruth';
  if (has(/book of samuel/)) return numbered('Samuel');
  if (has(/book of the kings/)) return numbered('Kings');
  if (has(/chronicles/)) return numbered('Chronicles');
  if (has(/ezra/)) return 'Ezra';
  if (has(/nehemiah/)) return 'Nehemiah';
  if (has(/esther/)) return 'Esther';
  if (has(/book of job/)) return 'Job';
  if (has(/lamentation/)) return 'Lamentations';
  if (has(/psalm|psalter/)) return 'Psalms';
  if (has(/proverb/)) return 'Proverbs';
  if (has(/ecclesiastes|preacher/)) return 'Ecclesiastes';
  if (has(/song of (solomon|songs)/)) return 'Song of Solomon';
  if (has(/isaiah/)) return 'Isaiah';
  if (has(/jeremiah/)) return 'Jeremiah';
  if (has(/ezekiel/)) return 'Ezekiel';
  if (has(/daniel/)) return 'Daniel';
  const minor = ['hosea', 'joel', 'amos', 'obadiah', 'jonah', 'micah', 'nahum', 'habakkuk', 'zephaniah', 'haggai', 'zechariah', 'malachi']
    .find((n) => has(new RegExp(`\\b${n}\\b`)));
  if (minor) return minor[0].toUpperCase() + minor.slice(1);
  if (has(/matthew/)) return 'Matthew';
  if (has(/mark/)) return 'Mark';
  if (has(/luke/)) return 'Luke';
  if (has(/acts/)) return 'Acts';
  if (has(/romans/)) return 'Romans';
  if (has(/corinthians/)) return numbered('Corinthians');
  if (has(/galatian/)) return 'Galatians';
  if (has(/ephesian/)) return 'Ephesians';
  if (has(/philippian/)) return 'Philippians';
  if (has(/colossian/)) return 'Colossians';
  if (has(/thessalonian/)) return numbered('Thessalonians');
  if (has(/timothy/)) return numbered('Timothy');
  if (has(/titus/)) return 'Titus';
  if (has(/philemon/)) return 'Philemon';
  if (has(/hebrew/)) return 'Hebrews';
  if (has(/james/)) return 'James';
  if (has(/peter/)) return numbered('Peter');
  if (has(/revelation|apocalypse/)) return 'Revelation';
  if (has(/\bjud(e|ah)\b/)) return 'Jude';
  if (has(/john/)) return ord && has(/epistle/) ? `${ord} John` : 'John';
  return null;
}

// ZIP entry names in these APKs are UTF-8 bytes that Windows PowerShell decoded
// through the ANSI codepage, so "Ɔsɛnkafo" arrives as "Æ†sÉ›nkafo". Encoding the
// string back through cp1252 and re-reading it as UTF-8 restores the real name.
const CP1252 = (() => {
  const dec = new TextDecoder('windows-1252');
  const m = new Map();
  for (let b = 0; b < 256; b++) m.set(dec.decode(Uint8Array.from([b])), b);
  return m;
})();
function fixMojibake(s) {
  if (![...s].every((c) => CP1252.has(c))) return s;
  const utf8 = Buffer.from([...s].map((c) => CP1252.get(c))).toString('utf8');
  return utf8 !== s && !utf8.includes('\uFFFD') ? utf8 : s;
}

function readTextHead(p) {
  const buf = readFileSync(p).subarray(0, 4000);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buf[0] === 0xef && buf[1] === 0xbb) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

// ---------- harvest 1: mobobi APK/XAPK ----------
function mobobiNames(archive, tag) {
  const dir = join(TMP, tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$out='${dir.replace(/\//g, '\\')}'
$z=[System.IO.Compression.ZipFile]::OpenRead('${archive.replace(/'/g, "''")}')
$assets=@($z.Entries | Where-Object { $_.FullName -match '^assets/[^/]+\\.txt$' })
if($assets.Count -eq 0){
  $inner=@($z.Entries | Where-Object { $_.FullName -like '*.apk' -and $_.FullName -notlike 'config*' })[0]
  $tmpApk=Join-Path $out '__inner.apk'
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($inner,$tmpApk,$true)
  $z.Dispose()
  $z=[System.IO.Compression.ZipFile]::OpenRead($tmpApk)
  $assets=@($z.Entries | Where-Object { $_.FullName -match '^assets/[^/]+\\.txt$' })
}
$rows=@(); $i=0
foreach($e in $assets){
  $i++
  $p=Join-Path $out ($i.ToString('0000')+'.txt')
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,$p,$true)
  $rows+=@{file=$i.ToString('0000');name=$e.FullName}
}
$z.Dispose()
ConvertTo-Json $rows | Set-Content -Encoding UTF8 (Join-Path $out 'manifest.json')`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
  const raw = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  const rows = Array.isArray(raw) ? raw : [raw];

  const map = new Map();
  const problems = [];
  for (const r of rows) {
    const stem = r.name.replace(/^.*[\\/]/, '');
    if (!stem.startsWith('(')) continue; // the local-text twin; its title is in the English copy
    const local = fixMojibake(stem.replace(/^\(English\)/, '').replace(/\.txt$/i, '').replace(/_/g, ' ')).trim();
    const title = (readTextHead(join(dir, `${r.file}.txt`)).match(/<strong>([^<]{4,140})<\/strong>/) || [])[1] || '';
    const canon = titleToCanon(title);
    if (!canon) problems.push(`no book found in title "${title}" (${stem})`);
    else if (map.has(canon)) problems.push(`two files map to ${canon}: "${map.get(canon)}" and "${local}"`);
    else map.set(canon, local);
  }
  if (problems.length) console.log(`  ! ${tag}: ${problems.slice(0, 25).join('\n    ')}`);
  return map;
}

// ---------- harvest 2: christappzz Room DB ----------
// These apps ship two translations; the local list is whichever key is not the NKJV.
function roomDbNames(archive, tag) {
  const dir = join(TMP, tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$out='${dir.replace(/\//g, '\\')}'
$z=[System.IO.Compression.ZipFile]::OpenRead('${archive.replace(/'/g, "''")}')
$cands=@($z.Entries | Where-Object { $_.FullName -match 'book_database$' })
if($cands.Count -eq 0){
  $inner=@($z.Entries | Where-Object { $_.FullName -like '*.apk' -and $_.FullName -notlike 'config*' })[0]
  $tmpApk=Join-Path $out '__inner.apk'
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($inner,$tmpApk,$true)
  $z.Dispose()
  $z=[System.IO.Compression.ZipFile]::OpenRead($tmpApk)
  $cands=@($z.Entries | Where-Object { $_.FullName -match 'book_database$' })
}
foreach($e in $cands){
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,(Join-Path $out 'book_database'),$true)
  break
}
$z.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
  const db = new DatabaseSync(join(dir, 'book_database'), { readOnly: true });
  const keys = db.prepare('SELECT DISTINCT WhichTypeOfBookName FROM TotalBooks').all().map((r) => r.WhichTypeOfBookName);
  const rows = (k) =>
    db.prepare('SELECT subBookName FROM TotalBooks WHERE WhichTypeOfBookName=? ORDER BY id').all(k).map((r) => r.subBookName.trim());
  // The package always ships an English shelf next to the local one, in the same
  // row order. Pairing them inside the DB labels each local title without
  // trusting a positional book list from elsewhere — our own bundles are not in
  // canonical order (the KJV drop came from an API that sorts alphabetically).
  const englishKey = keys.find((k) => /nkjv|kjv|english|^en[_(]/i.test(k));
  const localKey = keys.find((k) => k !== englishKey);
  if (!englishKey || !localKey) throw new Error(`no English/local pair in ${keys.join(', ')}`);
  const en = rows(englishKey);
  const local = rows(localKey);
  db.close();
  if (en.length !== local.length) throw new Error(`${englishKey} has ${en.length} rows, ${localKey} has ${local.length}`);
  return new Map(en.map((name, i) => [name, local[i]]));
}

// ---------- harvest 3: curated ----------
const EWE = () => new Map(Object.entries(JSON.parse(readFileSync(join(ROOT, 'scripts/data/bible-ewe-book-names.json'), 'utf8')).books));

const JOBS = [
  ['twi.json', () => mobobiNames(join(DOWNLOADS, 'com.mobobi.twibibleoffline_3.8.apk'), 'twi-mobobi'), 'com.mobobi.twibibleoffline_3.8.apk (asset filenames)'],
  ['twi-asante.json', () => roomDbNames(join(DOWNLOADS, 'Akuapem+Twi+Bible+&+Audio_115(1.0.1.115)_APKPure.xapk'), 'twi-room'), 'com.christappzz.twi.bible.akaupem (assets/book_database → TotalBooks.subBookName)'],
  ['fante.json', () => mobobiNames(join(DOWNLOADS, 'Fante+Bible+-+Fante+&+English_1.7_APKPure.xapk'), 'fante'), 'Fante+Bible+-+Fante+&+English_1.7_APKPure.xapk (asset filenames)'],
  ['ga.json', () => mobobiNames(join(DOWNLOADS, 'Ga+Bible+-+Ga+&+English+Bible_2.1_APKPure.xapk'), 'ga'), 'Ga+Bible+-+Ga+&+English+Bible_2.1_APKPure.xapk (asset filenames)'],
  ['ewe.json', EWE, 'scripts/data/bible-ewe-book-names.json (published Ewe list; the app itself ships the Twi names)'],
];

mkdirSync(TMP, { recursive: true });
for (const [file, get, provenance] of JOBS) {
  const bundlePath = join(BIBLE_DIR, file);
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  let map;
  try {
    map = get();
  } catch (e) {
    console.log(`${file}: harvest FAILED — ${String(e.message).split('\n')[0]}`);
    continue;
  }
  const missing = bundle.books.filter((b) => !map.has(b.name)).map((b) => b.name);
  const changed = bundle.books.filter((b) => map.has(b.name) && b.localName !== map.get(b.name)).length;
  const english = bundle.books.filter((b) => map.get(b.name) === b.name).map((b) => b.name);
  console.log(
    `${file}: ${map.size}/66 harvested, ${changed} to write` +
      `${missing.length ? ` | MISSING ${missing.join(', ')}` : ''}` +
      `${english.length ? ` | still English: ${english.join(', ')}` : ''}`,
  );
  if (!WRITE) continue;
  for (const b of bundle.books) if (map.has(b.name)) b.localName = map.get(b.name);
  bundle.localNameSource = provenance;
  writeFileSync(bundlePath, JSON.stringify(bundle), 'utf8');
}
console.log(WRITE ? 'written.' : '(dry run — pass --write to merge)');
