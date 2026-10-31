// A very small PDF writer, client-side and dependency-free.
//
// It exists for one job: turn a summary into a file a person can send on
// WhatsApp. A full library would cost more than the whole web app deserves, and
// what churches actually need is plain text on A4 with a heading — which is what
// this produces. Helvetica from the standard 14 fonts, so no embedding.
//
// Everything written here stays ASCII, which is what lets byte offsets (needed
// by the xref table) equal string lengths.

export interface PdfLine {
  text: string;
  bold?: boolean;
  /** Point size; defaults to 11. */
  size?: number;
  /** Extra space above this line, in points. */
  spaceBefore?: number;
}

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 48;
const TOP_Y = PAGE_HEIGHT - 64;
const BOTTOM_Y = 64;
const LEADING = 15;

const replacements: Array<[RegExp, string]> = [
  [/[–—]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/·/g, '-'],
  [/[^\x20-\x7E]/g, ''],
];

/** PDF strings are literal, so only these three characters need escaping. */
function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function ascii(text: string): string {
  let out = text;
  for (const [pattern, value] of replacements) out = out.replace(pattern, value);
  return out;
}

/** Rough Helvetica width: about half an em per character. */
function maxChars(size: number): number {
  return Math.max(20, Math.floor((PAGE_WIDTH - 2 * MARGIN_X) / (size * 0.5)));
}

function wrap(line: PdfLine): PdfLine[] {
  const size = line.size ?? 11;
  const limit = maxChars(size);
  const rows: string[] = [];
  let current = '';
  for (const word of line.text.split(' ')) {
    if (current && `${current} ${word}`.length > limit) {
      rows.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) rows.push(current);
  // The gap sits above the first row only, wherever the line happens to wrap.
  return rows.map((text, index) => ({
    text,
    bold: line.bold,
    size,
    spaceBefore: index === 0 ? (line.spaceBefore ?? 0) : 0,
  }));
}

function drawPage(lines: PdfLine[]): string {
  let y = TOP_Y;
  const parts: string[] = [];
  for (const line of lines) {
    y -= line.spaceBefore ?? 0;
    const size = line.size ?? 11;
    const font = line.bold ? '/F2' : '/F1';
    parts.push(
      `BT ${font} ${size} Tf 1 0 0 1 ${MARGIN_X} ${y.toFixed(2)} Tm (${escape(ascii(line.text))}) Tj ET`,
    );
    y -= LEADING;
  }
  return parts.join('\n');
}

/** Lay the lines out over as many A4 pages as they need. */
export function pdfBlob(input: PdfLine[]): Blob {
  const flat: PdfLine[] = [];
  for (const line of input) flat.push(...wrap({ ...line, text: ascii(line.text) }));

  const perPage = Math.max(10, Math.floor((TOP_Y - BOTTOM_Y) / LEADING));
  const pages: PdfLine[][] = [];
  for (let i = 0; i < flat.length; i += perPage) pages.push(flat.slice(i, i + perPage));
  if (pages.length === 0) pages.push([{ text: 'Nothing to show.' }]);

  const count = pages.length;
  const kids = Array.from({ length: count }, (_, p) => `${5 + 2 * p} 0 R`).join(' ');

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${count} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  for (let p = 0; p < count; p += 1) {
    // Page object first, then its content stream: numbering is fixed above.
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
        ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>' +
        ` /Contents ${6 + 2 * p} 0 R >>`,
    );
    const stream = drawPage(pages[p]);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((_, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  });

  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([body], { type: 'application/pdf' });
}

/** True when this browser can hand a file to another app (WhatsApp on Android). */
export function canShareFiles(file: File): boolean {
  const nav = globalThis.navigator as (Navigator & { canShare?: (data: ShareData) => boolean }) | undefined;
  return !!nav?.canShare && nav.canShare({ files: [file] });
}
