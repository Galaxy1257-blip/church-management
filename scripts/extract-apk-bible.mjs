// extract-apk-bible.mjs — pull a plain-text Bible out of an Android APK and
// normalise it into the ChMS Bible bundle shape (see bible.service.ts):
//   { translation, language, languageCode, license, publicDomain, source,
//     books: [{ name, chapters: { "1": ["verse", …] } }] }
//
// Usage:
//   node scripts/extract-apk-bible.mjs <apk> <code> <language> [--lang-code xx]
//     [--translation "Twi"] [--license "…"] [--include-en] [--no-decode]
//
// How it works:
//   1. Unzips assets/*.txt from the APK via PowerShell/.NET (no npm deps).
//   2. Parses the two HTML styles we've seen: <p>/<strong><em>N</em></strong>
//      (mobobi apps) and Apple-export <span class="s3">N</span> (some books).
//   3. Legacy-font decode: q→ɔ Q→Ɔ x→ɛ X→Ɛ (disable with --no-decode).
//   4. Books are IDENTIFIED STRUCTURALLY: chapter count + verse counts per
//      chapter are matched against our bundled KJV (essentially unique per
//      book). Filename hints only break ties; structural mismatch between a
//      file's content and its name → file excluded + reported (found a real
//      APK bug this way: Filemon.txt shipped English Genesis).
//   5. English-content guard: a Twi/Fante/Ewe/Ga text without ɛ/ɔ characters
//      is treated as mis-shipped English and excluded.
//   6. Writes apps/api/data/bible/<code>.json and prints a validation report.
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createDecipheriv, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KJV = JSON.parse(readFileSync(join(ROOT, 'apps/api/data/bible/kjv.json'), 'utf8'));

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const has = (name) => args.includes(name);
const [apk, code, language] = args.filter((a) => !a.startsWith('--')).length >= 3
  ? args.filter((a) => !a.startsWith('--'))
  : [];
if (!apk || !code || !language) {
  console.error('usage: node scripts/extract-apk-bible.mjs <apk> <code> <language> [--lang-code xx] [--translation "Twi"] [--license "…"] [--include-en] [--no-decode]');
  process.exit(1);
}
const LANG_CODE = flag('--lang-code', code);
const TRANSLATION = flag('--translation', language.toUpperCase());
const LICENSE = flag('--license', `Extracted from ${basename(apk)} (licence not verified — confirm translation copyright before redistribution)`);
const INCLUDE_EN = has('--include-en');
const DECODE = !has('--no-decode');
// --mobobi: files are encrypted with the mobobi scheme recovered from
// com.mobobi.* dexdump: AES-256-CBC, key = SHA-256("nv93h50sk1zh508v")
// (FontStyle.a() = (FontMenu.o+p+q).replace(o,"")), IV = 16 zero bytes,
// wrapped in N layers of (base64 → AES). Verse format is plain "N. text" lines.
const MOBOBI = has('--mobobi');

function mobobiDecrypt(text) {
  // `text` is already decoded (BOM/UTF-16 aware) — only base64 blobs get peeled
  const b64str = (s) => /^[A-Za-z0-9+/=\r\n]+$/.test(s.slice(0, 512));
  const b64buf = (b) => /^[A-Za-z0-9+/=\r\n]+$/.test(b.subarray(0, 512).toString('ascii'));
  if (!b64str(text)) return text; // plaintext (Twi-legacy HTML, or already plain)
  let cur = Buffer.from(text.replace(/[\r\n]/g, ''), 'base64');
  const key = createHash('sha256').update('nv93h50sk1zh508v').digest();
  const iv = Buffer.alloc(16);
  for (let layer = 1; layer <= 20; layer++) {
    const d = createDecipheriv('aes-256-cbc', key, iv);
    const out = Buffer.concat([d.update(cur), d.final()]);
    const head = out.subarray(0, 512).toString('latin1');
    const isHtml = out[0] === 0x3c || out[0] === 0xff || out[0] === 0xef || /^<[\w!?]/.test(head);
    // plaintext can also be plain text with no tags (Fante starts "GENESIS")
    const printable = [...out.subarray(0, 1024)].filter((c) => c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 0x80).length / Math.min(out.length, 1024);
    if (isHtml || (!b64buf(out) && printable > 0.9)) {
      if (out[0] === 0xff && out[1] === 0xfe) return out.subarray(2).toString('utf16le');
      if (out[0] === 0xef && out[1] === 0xbb) return out.subarray(3).toString('utf8');
      const t = out.toString('utf8');
      let end = t.length;
      while (end > 0 && t.charCodeAt(end - 1) === 0) end -= 1; // strip trailing NULs
      return t.slice(0, end);
    }
    if (!b64buf(out)) throw new Error(`mobobi decrypt: layer ${layer} produced neither HTML nor base64`);
    cur = Buffer.from(out.toString('ascii').replace(/[\r\n]/g, ''), 'base64');
  }
  throw new Error('mobobi decrypt: layer limit exceeded');
}

// ---------- 1. unzip assets ----------
const tmp = join(ROOT, `.tmp-${code}-extract`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem;
$z=[System.IO.Compression.ZipFile]::OpenRead('${apk.replace(/'/g, "''")}');
$assets=@($z.Entries | Where-Object { $_.FullName -match '^assets/[^/]+\\.txt$' });
if($assets.Count -eq 0){
  # XAPK wrapper (APKPure): take the inner base APK (skip config splits)
  $inner=@($z.Entries | Where-Object { $_.FullName -like '*.apk' -and $_.FullName -notlike 'config*' })[0];
  if($inner){
    $tmpApk='${tmp.replace(/'/g, "''")}\\__inner.apk';
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($inner,$tmpApk,$true);
    $z.Dispose();
    $z=[System.IO.Compression.ZipFile]::OpenRead($tmpApk);
    $assets=@($z.Entries | Where-Object { $_.FullName -match '^assets/[^/]+\\.txt$' });
  }
}
foreach($e in $assets){
  $n=[IO.Path]::GetFileName($e.FullName);
  if('${INCLUDE_EN ? 'y' : 'n'}' -eq 'y' -or -not $n.StartsWith('(')){
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e,(Join-Path '${tmp.replace(/'/g, "''")}' $n),$true);
  }
}
$z.Dispose();`;
execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' });
const files = readdirSync(tmp).filter((f) => f.endsWith('.txt'));
console.log(`extracted ${files.length} scripture files -> ${tmp}`);
if (files.length === 0) { console.error('no assets/*.txt found in APK'); process.exit(1); }

// Android/Windows text assets are often UTF-16LE with BOM — detect it.
function readText(p) {
  const buf = readFileSync(p);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    // UTF-16BE: swap to LE
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  return buf.toString('utf8');
}

// ---------- 2. helpers ----------
const decode = (s) => (DECODE ? s.replace(/q/g, 'ɔ').replace(/Q/g, 'Ɔ').replace(/x/g, 'ɛ').replace(/X/g, 'Ɛ') : s);
const entities = (s) => s
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const clean = (s) => entities(s).replace(/Apple-converted-space/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function kjvSignature(name) {
  const b = KJV.books.find((x) => x.name === name);
  return Object.keys(b.chapters).sort((a, z) => Number(a) - Number(z)).map((c) => b.chapters[c].length);
}

const SIG_MAP = new Map();
for (const b of KJV.books) {
  const sig = Object.keys(b.chapters).sort((a, z) => Number(a) - Number(z)).map((c) => b.chapters[c].length);
  const key = sig.join('.');
  if (!SIG_MAP.has(key)) SIG_MAP.set(key, []);
  SIG_MAP.get(key).push(b.name);
}

// ---------- 3. parser (both observed styles) ----------
function parseFile(raw, hdrStem = '') {
  const chapters = new Map(); // num -> string[]
  const missingChapters = new Set(); // gap-created (source omitted them entirely)
  let ch = 0;
  let pending = '';           // continuation of the current verse
  let lastVerseRef = null;    // [chapter, verseIndex]
  let deferred = null;        // a "1." held back until we see the next marker

  const flushDeferred = () => {
    if (deferred === null) return;
    const a = chapters.get(ch);
    if (process.env.DBG_BOOK && hdrStem === process.env.DBG_BOOK) {
      console.error(`[dbg] flushDeferred → ch=${ch} arrLen=${a?.length} txt=${deferred.slice(0, 30)}`);
    }
    if (a) { a.push(deferred); lastVerseRef = [ch, a.length - 1]; }
    deferred = null;
  };

  const push = (text) => {
    if (!lastVerseRef) return false;
    const arr = chapters.get(lastVerseRef[0]);
    if (!arr) return false;
    arr[lastVerseRef[1]] += (arr[lastVerseRef[1]] ? ' ' : '') + text;
    return true;
  };

  let blocks;
  if (!/<p[\s>]/i.test(raw)) {
    // PLAIN mobobi format (decrypted Ga/Fante): one verse per line as "N. text"
    // (some lines are indented — allow leading whitespace), chapter headers as
    // "Book N" lines, <b> headings.
    const t = raw.replace(/^[ \t]*(\d{1,3})\.\s+/gm, '<strong><em>$1</em></strong> ');
    blocks = t.split(/\r?\n/);
  } else {
    const style = /class="p2"|Apple-converted|<b>\d+<\/b>/.test(raw) ? 'apple' : 'p';
    let src = raw;
    // Some files never close a <p> before opening the next one
    // ("<p>…Korintofo I 6\r\n<p>…") — insert the missing close so headers and
    // headings don't merge into one block.
    src = src.replace(/(?<!<\/p>)(<p(?:\s[^>]*)?>)/g, '</p>$1');
    // Some files keep chapter headers OUTSIDE <p> tags ("    Nnwom 18\r\n") — wrap
    // bare "Book N" lines (single word + optional roman numeral + number only,
    // never a tagged line) so the header branch can see them. NOTE: CRLF endings.
    const pre = src.replace(
      /(^|\n)([ \t]*)((?:\d+\s+)?[A-Za-zÀ-ɿ][A-Za-zÀ-ɿ ]{0,40}(?: (?:I{1,3}|IV|VI{0,3}))? \d{1,3})[ \t]*(?=\r?\n)/g,
      (_m, lead, ws, hdr) => `${lead}${ws}<p>${hdr}</p>`,
    );
    blocks = style === 'apple'
      ? pre.replace(/<\/p>/g, '\n@@\n').split(/\n@@\n/)          // paragraph-ish units
      : [...pre.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
  }

  for (const block of blocks) {
    const inner = block.trim();
    if (!inner) continue;
    // verse markers: <strong><em>N</em>… | <span class="s3">N</span> | <b>N</b>
    // (first branch does NOT require immediate </strong> — Psalms files nest
    //  text right after </em> inside the <strong>)
    const markerRe = /<strong>\s*<em>(\d+)<\/em>|<span class="s3">(\d+)<\/span>|<b>(\d+)<\/b>/g;
    const marks = [...inner.matchAll(markerRe)].map((m) => Number(m[1] ?? m[2] ?? m[3]));
    if (marks.length > 0) {
      if (pending && lastVerseRef) { push(pending); pending = ''; }
      // walk marker positions to slice verse texts between them
      markerRe.lastIndex = 0;
      let prevEnd = -1; let prevMark = -1; let match;
      const found = [];
      while ((match = markerRe.exec(inner)) !== null) {
        if (prevMark !== -1) found.push({ n: prevMark, text: inner.slice(prevEnd, match.index) });
        prevMark = Number(match[1] ?? match[2] ?? match[3]);
        prevEnd = match.index + match[0].length;
      }
      if (prevMark !== -1) found.push({ n: prevMark, text: inner.slice(prevEnd) });
      // ---- deferred "1." handling (source numbering quirks) ------------------
      // A fresh "1." while the chapter already has verses may be (a) a genuine
      // next-chapter start with an omitted header (Fante Jeremiah 22) or (b) a
      // mislabeled verse (Ga Romans 15:2 written as "1."). Decide by the NEXT
      // marker: restart iff it is "2."; otherwise keep the text in this chapter.
      let list = found;
      let mergeInto = -1; // index where a deferred "1." landed (next marker may merge into it)
      if (deferred !== null && list.length > 0) {
        const a0 = chapters.get(ch);
        if (process.env.DBG_BOOK && hdrStem === process.env.DBG_BOOK) {
          console.error(`[dbg] deferred-resolve ch=${ch} nextN=${list[0].n} arrLen=${a0?.length} txt=${deferred.slice(0, 30)}`);
        }
        // Always resolve into the CURRENT chapter: a duplicate "1." mid-chapter
        // is a source mislabel (Twi 2 Kgs 18, Ga Rom 15:2), and genuinely
        // headerless chapter starts are handled by the forward-jump rule below.
        if (a0) {
          a0.push(deferred);
          mergeInto = a0.length - 1;
          lastVerseRef = [ch, mergeInto];
        }
        deferred = null;
      } else if (deferred !== null) {
        flushDeferred(); // no markers in this block — settle it
      }
      if (list.length > 0 && list[0].n === 1 && lastVerseRef && (chapters.get(ch)?.length ?? 0) > 0) {
        deferred = clean(decode(list[0].text));
        if (process.env.DBG_BOOK && hdrStem === process.env.DBG_BOOK) {
          console.error(`[dbg] defer set ch=${ch} arrLen=${chapters.get(ch).length} txt=${deferred.slice(0, 30)}`);
        }
        list = list.slice(1);
      }
      for (const f of list) {
        if (ch === 0) { console.warn('  verse marker before any chapter header — starting chapter 1'); ch = 1; }
        if (!chapters.has(ch)) chapters.set(ch, []);
        const arr = chapters.get(ch);
        const nextF = list[list.indexOf(f) + 1];
        let idx = f.n - 1;
        // Source numbering quirks: an ISOLATED jump of >3 (e.g. Isaiah 52:15
        // written "25", a Psalm title numbered "53", no marker after it) is a
        // typo → clamp to the next slot. If the NEXT marker continues from the
        // jumped number (Genesis 31: 48…53,54,55 — source just omits 49-52),
        // keep the number and pad blanks so later verses stay aligned.
        if (idx > arr.length && idx - arr.length > 3) {
          const sequentialFollow = nextF !== undefined && nextF.n === f.n + 1;
          if (!sequentialFollow) idx = arr.length;
        }
        while (arr.length < idx) arr.push(''); // gap guard (report later)
        if (mergeInto >= 0 && idx === mergeInto) {
          // same index as the deferred mislabel — merge the texts, keep count
          arr[idx] = `${arr[idx]} ${clean(decode(f.text))}`.trim();
          mergeInto = -1;
        } else {
          mergeInto = -1;
          arr[idx] = clean(decode(f.text));
        }
        lastVerseRef = [ch, idx];
      }
      continue;
    }
    // decorative chapter divider ("X-X-X" pre-decode = Ɛ-Ɛ-Ɛ post-decode)
    if (/^[XxQq](-[XxQq]){2,}$/.test(inner.replace(/<[^>]+>/g, '').trim())) continue;
    // chapter header: "<Book…> <n>" — checked BEFORE the heading guard because
    // some headers ship as "Mateo 8 <strong></strong>". Accept:
    //  (a) [1 ]Word(+roman) <n>  — anti-steal: no multiword continuations
    //  (b) exact file-stem + <n>  — multiword Ga headers ("Lalai amli Lala 2")
    const line = clean(inner);
    const NAME = '[A-Za-z\\u00C0-\\u0259_]{1,40}';
    let hdr = new RegExp(`^((?:(?:\\d+)\\s+)?[A-Za-z\\u00C0-\\u0259](?:${NAME})(?: (?:I{1,3}|IV|VI{0,3}))?)\\s+(\\d{1,3})$`).exec(line);
    if (!hdr && hdrStem) {
      for (const cand of hdrStemCandidates(hdrStem)) {
        hdr = new RegExp(`^(${escRe(cand)})\\s+(\\d{1,3})$`).exec(line);
        if (hdr) break;
      }
    }
    if (hdr) {
      const next = Number(hdr[2]);
      const ok = next === ch + 1 || (ch === 0 && next === 1);
      if (process.env.DBG_BOOK && hdrStem === process.env.DBG_BOOK) {
        console.error(`[dbg] line=${JSON.stringify(line)} next=${next} ch=${ch} → ${ok ? 'ACCEPT' : 'REJECT'}`);
      }
      if (ok) {
        if (pending && lastVerseRef) { push(pending); pending = ''; }
        flushDeferred();
        ch = next;
        if (!chapters.has(ch)) chapters.set(ch, []);
        lastVerseRef = null;
        continue;
      }
      // Source skipped whole chapter(s) without any header/content (Fante
      // Jeremiah 21:15–22 entirely absent): a header that jumps FORWARD gets
      // accepted, the skipped chapters become ellipsis placeholders. (A stolen
      // header from a continuation is always next===ch+1, so it never lands here.)
      if (next > ch + 1) {
        if (pending && lastVerseRef) { push(pending); pending = ''; }
        flushDeferred();
        for (let c = ch + 1; c < next; c++) {
          chapters.set(c, []);
          missingChapters.add(c);
        }
        ch = next;
        if (!chapters.has(ch)) chapters.set(ch, []);
        lastVerseRef = null;
        if (process.env.DBG_BOOK && hdrStem === process.env.DBG_BOOK) {
          console.error(`[dbg] jump gap → ch=${ch}`);
        }
        continue;
      }
    }
    // section titles: <strong>/<em>/<b> blocks without a verse number → skip
    if (/<strong>|<em>|<b>/.test(inner)) continue;
    // no marker: continuation of current verse (chapter header already tried)
    const txt = clean(decode(inner));
    if (!txt) continue;
    if (lastVerseRef) pending = pending ? `${pending} ${txt}` : txt;
    // else: heading before chapter/verse → drop (pericope titles)
  }
  if (pending && lastVerseRef) push(pending);
  flushDeferred();

  const out = {};
  for (const [c, arr] of [...chapters.entries()].sort((a, b) => a[0] - b[0])) {
    if (arr.length > 0 && arr.some((v) => v !== '')) out[String(c)] = arr.map((v) => v || ' ');
    else if (missingChapters.has(c)) out[String(c)] = ['…']; // gap placeholder
  }
  return out;
}

// ---------- 4. per-file identification ----------
const sigOf = (chapters) => Object.keys(chapters).sort((a, b) => Number(a) - Number(b)).map((c) => chapters[c].length);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const ROMAN = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
// ZIP entry names arrived CP1252-mojibake ("Å‹tsÉ›" bytes = "ŋtsɛ"); repair so
// multiword header stems match the decoded content.
const CP1252_INV = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
const REV_CP = new Map(Object.entries(CP1252_INV).map(([b, ch]) => [ch.codePointAt(0), Number(b)]));
function repairMojibake(s) {
  const bytes = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp <= 0xff) bytes.push(cp);
    else if (REV_CP.has(cp)) bytes.push(REV_CP.get(cp));
    else return s;
  }
  const t = Buffer.from(bytes).toString('utf8');
  return t.includes('\uFFFD') || t === s ? s : t;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function hdrStemCandidates(stem) {
  const fixed = repairMojibake(stem);
  return fixed === stem ? [stem] : [stem, fixed];
}
function nameTokens(s) {
  return s
    .toLowerCase()
    .replace(/[_\-.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ROMAN[t] ?? t);
}
// Digit tokens are rejectors: "Samuel II" == "2 Samuel" but never == "1 Samuel".
function filenameScore(fileStem, kjvName) {
  const A = new Set(nameTokens(fileStem));
  const B = new Set(nameTokens(kjvName));
  const aDigits = [...A].filter((t) => /^\d+$/.test(t));
  const bDigits = [...B].filter((t) => /^\d+$/.test(t));
  if (aDigits.length && bDigits.length && !aDigits.some((d) => bDigits.includes(d))) return 0;
  if (A.size === B.size && [...A].every((t) => B.has(t))) return 100;
  const shared = [...A].filter((t) => B.has(t)).length;
  const min = Math.min(A.size, B.size);
  if (shared > 0 && shared === min) return 80;
  if (shared > 0) return Math.round((shared / min) * 60);
  // translit fallback: character-bigram similarity ("Yuda"→"Jude", "Eksodos"→"Exodus")
  const a = norm(fileStem); const b = norm(kjvName);
  const bg = (s) => new Set([...s].map((_, i) => s.slice(i, i + 2)).filter((x) => x.length === 2));
  const [sa, sb] = [bg(a), bg(b)];
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size || 1;
  return Math.round((inter / union) * 40); // ≤40 so token matches always win
}

const books = [];
const report = [];
const used = new Map(); // kjvName -> file
for (const f of files.sort()) {
  // Mixed-file salvage: some APKs prepend junk (e.g. English Genesis) before
  // the real book, which starts at its own "Name 1" chapter header. If content
  // before that header is English-dense, slice from the header.
  // --mobobi: peel AES layers first (content then parses in plain mode)
  let raw = readText(join(tmp, f));
  if (MOBOBI) raw = mobobiDecrypt(raw);
  const hdrs = [...raw.matchAll(/<p[^>]*>\s*([A-Za-z][A-Za-z_ ]{0,30}?)\s+1\s*(?:<[^>]+>\s*)*<\/p>/g)];
  if (hdrs.length > 0) {
    const last = hdrs[hdrs.length - 1];
    if (last.index >= 200) {
      const before = raw.slice(0, last.index);
      const enw = (before.match(/\b(the|and|was|were|God|said|his|that|with|beginning|earth|formless)\b/g) ?? []).length;
      if (enw >= 20) { report.push({ file: f, status: `salvaged — sliced ${last.index} chars of English junk off the front` }); raw = raw.slice(last.index); }
    }
  }
  const chapters = parseFile(raw, basename(f, '.txt'));
  const nChapters = Object.keys(chapters).length;
  if (nChapters === 0) { report.push({ file: f, status: 'EMPTY — no chapters parsed' }); continue; }

  // English-content guard: English-dense files are mis-shipped content (our
  // English needs are already met by KJV). Word-based, so short Twi books
  // (2 John = 2 KB) are NOT false-flagged.
  if (!INCLUDE_EN) {
    const enw = (JSON.stringify(chapters).match(/\b(the|and|was|were|God|said|his|that|with|beginning|earth)\b/g) ?? []).length;
    const qx = (raw.match(/[qxQX]/g) ?? []).length;
    const realEco = (raw.match(/[ɛɔ]/g) ?? []).length;
    const native = Math.max(DECODE ? qx : 0, realEco);
    if (enw >= 20 || native < 50) { report.push({ file: f, status: `SKIPPED — looks English (${enw} english words, native ${native})` }); continue; }
  }

  const sig = sigOf(chapters);
  const candidates = SIG_MAP.get(sig.join('.')) ?? [];
  let matched = null;
  if (candidates.length === 1) matched = candidates[0];
  else if (candidates.length > 1) {
    // tie-break with filename similarity
    const stem = basename(f, '.txt');
    matched = [...candidates].sort((a, b) => filenameScore(stem, b) - filenameScore(stem, a))[0];
  }

  if (!matched) {
    // tolerant fallback: same chapter count + ≥90% verse-count agreement.
    // Filename only breaks ties between equally-good candidates (translit
    // names like Eksodos/Exodus share no tokens, so they can't gate here).
    const stem = basename(f, '.txt');
    const cands = [];
    for (const b of KJV.books) {
      const ks = kjvSignature(b.name);
      if (ks.length !== sig.length) continue;
      let same = 0;
      for (let i = 0; i < ks.length; i++) if (ks[i] === sig[i]) same++;
      const agree = same / ks.length;
      const sigSum = sig.reduce((a, b) => a + b, 0);
      const ksSum = ks.reduce((a, b) => a + b, 0);
      const near = Math.abs(sigSum - ksSum) <= 2; // single-chapter books: agree() is all-or-nothing
      const fnameOk = filenameScore(stem, b.name) >= 80;
      // translation versification drift allowed when the filename is decisive
      if ((agree >= 0.9 || near || (agree >= 0.85 && fnameOk)) && !used.has(b.name)) cands.push({ name: b.name, agree, near, ks, fScore: filenameScore(stem, b.name) });
    }
    cands.sort((a, b) => b.agree - a.agree || b.fScore - a.fScore);
    const best = cands[0];
    const tied = best && cands.filter((c) => c.agree === best.agree);
    const winner = tied && tied.length > 1
      ? [...tied].sort((a, b) => b.fScore - a.fScore)[0]
      : best;
    if (winner && (tied.length === 1 || winner.fScore > 0)) {
      used.set(winner.name, f);
      books.push({ name: winner.name, chapters });
      const firstDiff = winner.ks.findIndex((v, i) => v !== sig[i]);
      const label = winner.agree >= 0.9
        ? `TOLERANT match ${(winner.agree * 100).toFixed(0)}% verse-count agreement (first diff: ch ${firstDiff + 1} file ${sig[firstDiff]} vs kjv ${winner.ks[firstDiff]})`
        : `TOLERANT match — chapter counts equal, verse totals within 2 of KJV (source numbers ${winner.ks.map((v, i) => (v === sig[i] ? null : i + 1)).filter(Boolean).map((c) => `ch${c}`).join(',')})`;
      report.push({ file: f, status: `${winner.name}: ${label}` });
      continue;
    }
    report.push({ file: f, status: `NO KJV signature match (${nChapters} ch, ${sig.slice(0, 6).join('/')}…)` });
    // which chapter NUMBERS exist (catches missing-header gaps)
    {
      const keys = Object.keys(chapters).map(Number).sort((a, b) => a - b);
      const max = keys[keys.length - 1] ?? 0;
      const gaps = [];
      for (let i = 1; i <= max; i++) if (!keys.includes(i)) gaps.push(i);
      report.push({ file: '', status: `  ↳ keys: 1..${max} (${keys.length}) ${gaps.length ? `GAPS: ${gaps.join(',')}` : 'contiguous'}` });
    }
    // detailed diff vs the filename's most likely KJV book (same chapter count)
    const stem0 = basename(f, '.txt');
    const guess = [...KJV.books]
      .filter((b) => kjvSignature(b.name).length === sig.length)
      .sort((a, b) => filenameScore(stem0, b.name) - filenameScore(stem0, a.name))[0];
    if (guess) {
      const ks = kjvSignature(guess.name);
      const diffs = ks.map((v, i) => (v === sig[i] ? null : `ch${i + 1}: file ${sig[i] ?? '-'} vs kjv ${v}`)).filter(Boolean);
      report.push({ file: '', status: `  ↳ vs ${guess.name}: ${diffs.slice(0, 8).join('; ') || 'none'}${diffs.length > 8 ? ` …(+${diffs.length - 8})` : ''}` });
    }
    continue;
  }

  const stem = basename(f, '.txt');
  const nameAgrees = filenameScore(stem, matched) >= 40;
  if (used.has(matched) && !nameAgrees) {
    report.push({ file: f, status: `EXCLUDED — duplicate content for ${matched} (filename disagrees)` });
    continue;
  }
  if (used.has(matched)) { report.push({ file: f, status: `EXCLUDED — duplicate of ${matched}` }); continue; }
  // filename strongly suggests a DIFFERENT book than content parsed → content bug
  const bestNamed = [...KJV.books].sort((a, b) => filenameScore(stem, b.name) - filenameScore(stem, a.name))[0];
  if (bestNamed && filenameScore(stem, bestNamed.name) >= 80 && bestNamed.name !== matched) {
    report.push({ file: f, status: `EXCLUDED — filename says ${bestNamed.name} but content matches ${matched} (broken file in APK)` });
    continue;
  }

  used.set(matched, f);
  books.push({ name: matched, chapters });
  const kSig = kjvSignature(matched);
  const diff = sig.length === kSig.length && sig.every((v, i) => v === kSig[i]) ? 'exact' : `STRUCTURE DIFF (file ${sig.join('.')} vs kjv ${kSig.join('.')})`;
  report.push({ file: f, status: `${matched}: ${nChapters} chapters — ${diff}` });
}

// ---------- 5. assemble in KJV order + write ----------
// Source-omitted verse numbers leave '' placeholders — render as ellipsis so
// the reader sees "this verse's text was merged in the source" not a blank line.
for (const b of books) {
  for (const c of Object.keys(b.chapters)) {
    b.chapters[c] = b.chapters[c].map((v) => (v && v.trim() !== '' ? v : '…'));
  }
}
books.sort((a, b) => KJV.books.findIndex((x) => x.name === a.name) - KJV.books.findIndex((x) => x.name === b.name));
const bundle = {
  translation: TRANSLATION,
  language,
  languageCode: LANG_CODE,
  license: LICENSE,
  publicDomain: false,
  source: basename(apk),
  books,
};
const outPath = join(ROOT, 'apps/api/data/bible', `${code}.json`);
writeFileSync(outPath, JSON.stringify(bundle));

console.log('\n=== report ===');
for (const r of report) console.log(` ${r.file.padEnd(28)} ${r.status}`);
const kjvNames = new Set(KJV.books.map((b) => b.name));
const got = new Set(books.map((b) => b.name));
const missing = [...kjvNames].filter((n) => !got.has(n));
console.log(`\nbooks: ${books.length}/66${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`);
const totalVerses = books.reduce((a, b) => a + Object.values(b.chapters).reduce((x, y) => x + y.length, 0), 0);
console.log(`verses: ${totalVerses}`);
console.log('spot checks:');
for (const [bk, ch, vn] of [['Genesis', 1, 1], ['Psalms', 23, 1], ['John', 3, 16]]) {
  const b = books.find((x) => x.name === bk);
  const v = b?.chapters[String(ch)]?.[vn - 1];
  console.log(`  ${bk} ${ch}:${vn} → ${v ? v.slice(0, 110) : 'MISSING'}`);
}
console.log(`\nwritten: ${outPath}`);
rmSync(tmp, { recursive: true, force: true });
if (books.length < 66) process.exitCode = 2; // partial bundle — caller decides
