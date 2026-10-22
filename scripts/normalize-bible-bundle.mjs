// normalize-bible-bundle.mjs — post-process a RAW Bible bundle (any book names,
// e.g. from extract-akuapem-sqlite.py) into a ChMS bundle with canonical KJV
// book names, KJV order, validation report and metadata.
//
// usage: node normalize-bible-bundle.mjs <in.json> <out.json> --translation "X"
//   --language "L" --lang-code cc --license "…" [--source "…"] [--pd false]
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const [inp, outp] = argv.filter((a) => !a.startsWith('--'));
const flag = (name, def = '') => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
if (!inp || !outp) {
  console.error('usage: normalize-bible-bundle.mjs <in> <out> --translation X --language L --lang-code cc --license "…"');
  process.exit(1);
}

const KJV = JSON.parse(readFileSync('apps/api/data/bible/kjv.json', 'utf8'));
const raw = JSON.parse(readFileSync(inp, 'utf8'));

const sigOf = (chapters) =>
  Object.keys(chapters).sort((a, b) => Number(a) - Number(b)).map((c) => chapters[c].length);
const SIG = new Map();
for (const b of KJV.books) {
  const key = sigOf(b.chapters).join('.');
  if (!SIG.has(key)) SIG.set(key, []);
  SIG.get(key).push(b.name);
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function nameScore(a0, b0) {
  const A = new Set(a0.toLowerCase().replace(/[_\-.]/g, ' ').split(/\s+/).filter(Boolean)
    .map((t) => ({ i: '1', ii: '2', iii: '3', iv: '4' }[t] ?? t)));
  const B = new Set(b0.toLowerCase().split(/\s+/).filter(Boolean));
  const aD = [...A].filter((t) => /^\d+$/.test(t));
  const bD = [...B].filter((t) => /^\d+$/.test(t));
  if (aD.length && bD.length && !aD.some((d) => bD.includes(d))) return 0;
  if (A.size === B.size && [...A].every((t) => B.has(t))) return 100;
  const shared = [...A].filter((t) => B.has(t)).length;
  if (shared > 0 && shared === Math.min(A.size, B.size)) return 80;
  if (shared > 0) return Math.round((shared / Math.min(A.size, B.size)) * 60);
  const a = norm(a0); const b = norm(b0);
  const bg = (s) => new Set([...s].map((_, i) => s.slice(i, i + 2)).filter((x) => x.length === 2));
  const [sa, sb] = [bg(a), bg(b)];
  const inter = [...sa].filter((x) => sb.has(x)).length;
  return Math.round((inter / (new Set([...sa, ...sb]).size || 1)) * 40);
}

const report = [];
const used = new Map();
const matched = [];
for (const b of raw.books) {
  const sig = sigOf(b.chapters);
  const cands = SIG.get(sig.join('.')) ?? [];
  let kjvName = null;
  let kind = 'exact';
  if (cands.length === 1) kjvName = cands[0];
  else if (cands.length > 1) {
    kjvName = [...cands].sort((x, y) => nameScore(b.name, y) - nameScore(b.name, x))[0];
  } else {
    // tolerant: chapter count + ≥75% verse agreement (or totals within 2) — an equal-chapter
// book with ≥75% matching per-chapter counts is a strong, effectively unique identifier
    const list = [];
    for (const kb of KJV.books) {
      const ks = sigOf(kb.chapters);
      if (ks.length !== sig.length) continue;
      let same = 0;
      for (let i = 0; i < ks.length; i++) if (ks[i] === sig[i]) same++;
      const agree = same / ks.length;
      const sumD = Math.abs(sig.reduce((x, y) => x + y, 0) - ks.reduce((x, y) => x + y, 0));
      if ((agree >= 0.75 || sumD <= 2) && !used.has(kb.name)) list.push({ name: kb.name, agree, ks, ns: nameScore(b.name, kb.name) });
    }
    list.sort((x, y) => y.agree - x.agree || y.ns - x.ns);
    const best = list[0];
    const tied = best ? list.filter((c) => c.agree === best.agree) : [];
    const win = tied.length > 1 ? [...tied].sort((x, y) => y.ns - x.ns)[0] : best;
    if (win && (tied.length === 1 || win.ns > 0)) {
      kjvName = win.name;
      kind = `TOLERANT ${(win.agree * 100).toFixed(0)}%`;
    }
  }
  if (!kjvName || used.has(kjvName)) {
    report.push(` NO MATCH: "${b.name}" (${sig.length} ch)`);
    continue;
  }
  used.set(kjvName, true);
  matched.push({ name: kjvName, chapters: b.chapters });
  report.push(` ${String(b.name).padEnd(20)} → ${kjvName}: ${kind}`);
}

// ellipsis for blanks + KJV order
for (const b of matched) {
  for (const c of Object.keys(b.chapters)) {
    b.chapters[c] = b.chapters[c].map((v) => (v && v.trim() ? v : '…'));
  }
}
matched.sort((a, b) => KJV.books.findIndex((x) => x.name === a.name) - KJV.books.findIndex((x) => x.name === b.name));

const missing = KJV.books.map((b) => b.name).filter((n) => !used.has(n));
const bundle = {
  translation: flag('--translation'),
  language: flag('--language'),
  languageCode: flag('--lang-code'),
  license: flag('--license'),
  publicDomain: flag('--pd', 'false') !== 'true',
  source: flag('--source', ''),
  books: matched,
};
writeFileSync(outp, JSON.stringify(bundle));

console.log(report.join('\n'));
const total = matched.reduce((a, b) => a + Object.values(b.chapters).reduce((x, y) => x + y.length, 0), 0);
console.log(`books: ${matched.length}/66${missing.length ? ` — MISSING: ${missing.join(', ')}` : ''}`);
console.log(`verses: ${total}`);
for (const [bk, ch, vn] of [['Genesis', 1, 1], ['Psalms', 23, 1], ['John', 3, 16]]) {
  const v = matched.find((x) => x.name === bk)?.chapters[String(ch)]?.[vn - 1];
  console.log(`  ${bk} ${ch}:${vn} → ${v ? v.slice(0, 110) : 'MISSING'}`);
}
console.log(`written: ${outp}`);
if (matched.length < 66) process.exitCode = 2;
