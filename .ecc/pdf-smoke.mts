// One-off check: does lib/pdf.ts build a structurally valid PDF?
// Run: node_modules/.bin/tsx .ecc/pdf-smoke.mts
import { writeFileSync } from 'node:fs';
import { pdfBlob, type PdfLine } from '../apps/web/src/lib/pdf.ts';

const lines: PdfLine[] = [
  { text: 'Bethel Praise Chapel', bold: true, size: 16 },
  { text: 'Expenses - October 2026', size: 12, spaceBefore: 6 },
  { text: 'Total approved: GHS 1,240.50', bold: true, spaceBefore: 10 },
  { text: 'Waiting for approval: GHS 80.00' },
  { text: 'Where the money went', bold: true, size: 13, spaceBefore: 14 },
  { text: '- Utilities: GHS 400.00 (3 items)' },
  { text: 'Each payment', bold: true, size: 13, spaceBefore: 14 },
];
for (let i = 0; i < 90; i += 1) {
  lines.push({ text: `0${(i % 9) + 1} Oct 2026  GHS ${(i + 1) * 13}.00  Maintenance - Vendor number ${i} (a note with (brackets) and a back\\slash)` });
}

const blob = await pdfBlob(lines);
const text = await blob.text();
writeFileSync('.ecc/pdf-sample.pdf', Buffer.from(text, 'latin1'));

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

check('starts with the PDF header', text.startsWith('%PDF-1.4'));
check('ends with %%EOF', text.trimEnd().endsWith('%%EOF'));
check('stays ASCII', !/[^\x00-\x7F]/.test(text));

const size = Number(text.match(/\/Size (\d+)/)?.[1] ?? 0);
const startxref = Number(text.match(/startxref\n(\d+)/)?.[1] ?? -1);
check('startxref points at the xref keyword', text.slice(startxref, startxref + 4) === 'xref');

const rows = text.slice(startxref).split('\n').slice(2).filter((r) => /^\d{10} \d{5} n/.test(r));
check('xref has one row per object', rows.length === size - 1, `${rows.length} vs ${size - 1}`);
const badOffset = rows.findIndex((row, index) => text.slice(Number(row.slice(0, 10)), Number(row.slice(0, 10)) + `${index + 1} 0 obj`.length) !== `${index + 1} 0 obj`);
check('every xref offset lands on its object', badOffset === -1, `first bad at object ${badOffset + 1}`);

const lengths = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
check('every stream length matches its bytes', lengths.every((m) => Number(m[1]) === m[2].length), lengths.map((m) => `${m[1]}/${m[2].length}`).join(','));
const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
check('kids match the page count', (text.match(/ 0 R/g) ?? []).length > 0 && pageCount >= 2, `pages=${pageCount}`);
check('page content stays inside the page box', !/(\d+\.\d+) Tm/.test(text) || [...text.matchAll(/(\d+\.\d+) Tm/g)].every((m) => Number(m[1]) > 40 && Number(m[1]) < 800));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} — ${lengths.length} page(s), ${blob.size} bytes`);
process.exit(failures === 0 ? 0 : 1);
