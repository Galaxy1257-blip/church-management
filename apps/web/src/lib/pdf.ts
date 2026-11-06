// A small branded PDF writer — client-side and dependency-free.
//
// It exists for one job: turn what a screen shows into a file a member or a
// treasurer can send on WhatsApp or hand to a board, on the church's own
// letterhead. A full library would cost more than the whole web app deserves, so
// this writes the bytes itself: A4, Helvetica from the standard 14 fonts (nothing
// embedded), the church logo as a JPEG, and flat colour for the accents.
//
// Text is encoded once, on the way in, and every measurement is taken on the
// encoded form, because the byte count has to equal the string length for the
// cross-reference table to line up.

export type PdfAlign = 'left' | 'right';

/** One column of a table. `grow` is its share of the usable width. */
export interface PdfColumn {
  label: string;
  grow?: number;
  align?: PdfAlign;
}

/**
 * The pieces a document is built from. A church report is nearly always the same
 * handful: a line of prose, the figures that name the document, then rows.
 */
export type PdfBlock =
  | { kind: 'text'; text: string; bold?: boolean; size?: number; muted?: boolean; spaceBefore?: number }
  | { kind: 'heading'; text: string; spaceBefore?: number }
  | { kind: 'fields'; rows: Array<{ label: string; value: string; bold?: boolean }>; spaceBefore?: number }
  | { kind: 'table'; columns: PdfColumn[]; rows: string[][]; spaceBefore?: number }
  /** A JPEG data URL printed centred — a QR a member can scan from the sheet. */
  | { kind: 'image'; jpeg: string; maxSide?: number; caption?: string; spaceBefore?: number }
  | { kind: 'rule'; spaceBefore?: number };

export interface PdfDoc {
  /** Document title, set under the church name on the letterhead. */
  title: string;
  /** What it covers — a month, a year, a person's name. */
  subtitle?: string;
  blocks: PdfBlock[];
  /** Small line above the page numbers, on every page. */
  footnote?: string;
}

export interface PdfBrand {
  churchName: string;
  tagline?: string | null;
  /** Must be a JPEG data URL — see `logoToJpeg`. Anything else is left out. */
  logoJpeg?: string | null;
  /** Hex, from Settings → Church branding. */
  accent?: string | null;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
/** Content never prints closer than this to the bottom edge; the footer lives there. */
const BOTTOM = 74;
const BODY = 10;
const LEAD = 13.5;
const DEFAULT_ACCENT = '#c08a2e';
const INK = '#1f2a24';
const MUTED = '#6e6a61';
const ZEBRA = '#f6f2e7';
const GRID = '#e4ddcd';

// ---------------------------------------------------------------- encoding ---

/**
 * WinAnsi is the encoding the standard fonts actually carry, so it reaches
 * further than plain ASCII: real quotes, en and em dashes, accented letters.
 * Characters outside it are transliterated rather than dropped, so a name with a
 * hook in it still prints something readable.
 */
const WINANSI: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
};

const TRANSLITERATE: Array<[RegExp, string]> = [
  [/[ŋŊ]/g, 'ng'],
  [/[ɛɔƐƆ]/g, 'e'],
  [/[₵¢]/g, 'GHS'],
  [/[–—]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[^\x20-\x7e\xa0-\xff]/g, '?'],
];

/** Turn any text into the bytes the standard fonts can draw. */
function encode(text: string): string {
  let source = text ?? '';
  for (const [pattern, value] of TRANSLITERATE) source = source.replace(pattern, value);
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const code = source.charCodeAt(i);
    if (WINANSI[ch] !== undefined) out += String.fromCharCode(WINANSI[ch]);
    else if (code >= 0xa0 && code <= 0xff) out += String.fromCharCode(code);
    else if (code === 0x09 || code < 0x20) out += ' ';
    else out += ch;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** PDF strings are literal, so only these three characters need escaping. */
function escapeBytes(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

// Helvetica and Helvetica-Bold advance widths, characters 32–126, in units/em.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 667, 722,
  667, 722, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];
/** The few bytes above 127 that are common enough to be worth measuring. */
const W_HIGH: Record<number, number> = {
  0x96: 556, 0x97: 1000, 0x95: 350, 0x91: 222, 0x92: 222,
  0x93: 333, 0x94: 333, 0x85: 1000, 0xa0: 278, 0xb0: 370, 0xb1: 584,
};

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? W_BOLD : W_REGULAR)[code - 32] ?? 556;
  return W_HIGH[code] ?? 556;
}

/** Width of a run of already-encoded text in points. */
function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (let i = 0; i < text.length; i += 1) units += charWidth(text.charCodeAt(i), bold);
  return (units / 1000) * size;
}

/** Greedy word wrap against a measured width, never breaking inside a word. */
function wrapText(encoded: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of encoded.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && textWidth(candidate, size, bold) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current || lines.length === 0) lines.push(current);
  return lines.filter((line) => line.length > 0);
}

function hexToRgb(hex: string | null | undefined): [number, number, number] {
  const raw = (hex ?? DEFAULT_ACCENT).trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n) || !/^[0-9a-fA-F]{6}$/.test(full)) return [0.75, 0.54, 0.18];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function color(text: string): string {
  return hexToRgb(text).map((c) => c.toFixed(3)).join(' ');
}

/** Text sitting on a filled band: white or ink, whichever is actually readable. */
function onColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6 ? INK : '#ffffff';
}

// -------------------------------------------------------------------- draw ---

interface TextOp {
  t: 'text';
  /** Baseline x, or the right edge when `right` is set. */
  x: number;
  y: number;
  size: number;
  bold: boolean;
  color: string;
  text: string;
  right?: number;
}
interface FillOp { t: 'fill'; x: number; y: number; w: number; h: number; color: string }
interface RuleOp { t: 'rule'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
interface ImageOp { t: 'image'; name: string; x: number; y: number; w: number; h: number }
type Op = TextOp | FillOp | RuleOp | ImageOp;

/** One op as content-stream operators. Byte length equals string length here. */
function opToString(op: Op): string {
  if (op.t === 'text') {
    const x = op.right !== undefined ? op.right - textWidth(op.text, op.size, op.bold) : op.x;
    return `BT ${color(op.color)} rg /F${op.bold ? 2 : 1} ${op.size} Tf 1 0 0 1 ${x.toFixed(2)} ${op.y.toFixed(2)} Tm (${escapeBytes(op.text)}) Tj ET`;
  }
  if (op.t === 'fill') {
    return `${color(op.color)} rg ${op.x.toFixed(2)} ${op.y.toFixed(2)} ${op.w.toFixed(2)} ${op.h.toFixed(2)} re f`;
  }
  if (op.t === 'rule') {
    return `${color(op.color)} RG ${op.width.toFixed(2)} w ${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m ${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l S`;
  }
  return `q ${op.w.toFixed(2)} 0 0 ${op.h.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)} cm /Logo Do Q`;
}

interface Letterhead {
  accent: string;
  first: Op[];
  firstTop: number;
  later: Op[];
  laterTop: number;
}

/**
 * Page one carries the logo, the name and what the document is. Later pages
 * carry just enough to say whose paper this is if a sheet falls off the stack.
 */
function letterhead(doc: PdfDoc, brand: PdfBrand, logo: { w: number; h: number } | null): Letterhead {
  const accent = brand.accent ?? DEFAULT_ACCENT;
  const ops: Op[] = [{ t: 'fill', x: 0, y: PAGE_H - 14, w: PAGE_W, h: 14, color: accent }];
  let textX = MARGIN;
  let nameY = PAGE_H - 62;
  if (logo) {
    const h = 44;
    const w = Math.max(24, Math.min(150, (logo.w / logo.h) * h));
    ops.push({ t: 'image', name: '/Logo', x: MARGIN, y: PAGE_H - 46 - h, w, h });
    textX = MARGIN + w + 14;
    nameY = PAGE_H - 46 - 30;
  }
  ops.push({ t: 'text', x: textX, y: nameY, size: 16, bold: true, color: INK, text: encode(brand.churchName) });
  let ruleY: number;
  if (brand.tagline) {
    const taglines = wrapText(encode(brand.tagline), 9, PAGE_W - MARGIN - textX);
    taglines.slice(0, 1).forEach((line, i) => {
      ops.push({ t: 'text', x: textX, y: nameY - 14 - i * 12, size: 9, bold: false, color: MUTED, text: line });
    });
    ruleY = nameY - 30;
  } else {
    ruleY = nameY - 18;
  }
  ops.push({ t: 'rule', x1: MARGIN, y1: ruleY, x2: PAGE_W - MARGIN, y2: ruleY, color: accent, width: 1.4 });
  let y = ruleY - 26;
  ops.push({ t: 'text', x: MARGIN, y, size: 13, bold: true, color: INK, text: encode(doc.title) });
  y -= 15;
  if (doc.subtitle) {
    ops.push({ t: 'text', x: MARGIN, y, size: 9.5, bold: false, color: MUTED, text: encode(doc.subtitle) });
    y -= 12;
  }
  const later: Op[] = [
    { t: 'text', x: MARGIN, y: PAGE_H - 52, size: 8.5, bold: true, color: INK, text: encode(brand.churchName) },
    { t: 'text', x: 0, y: PAGE_H - 52, size: 8.5, bold: false, color: MUTED, text: encode(doc.title), right: PAGE_W - MARGIN },
    { t: 'rule', x1: MARGIN, y1: PAGE_H - 58, x2: PAGE_W - MARGIN, y2: PAGE_H - 58, color: accent, width: 0.8 },
  ];
  return { accent, first: ops, firstTop: y - 14, later, laterTop: PAGE_H - 76 };
}

/** Everything a block needs to place itself, with the page break already handled. */
interface Surface {
  y: number;
  push: (ops: Op[]) => void;
  /** Move to a new page; the running head is put back on it. */
  newPage: () => void;
  /** True when this call moved the content onto a new page. */
  room: (height: number) => boolean;
}

/**
 * Lays the blocks out over as many A4 pages as they need. A heading or a table
 * header is never left alone at the foot of a page.
 */
function layOut(blocks: PdfBlock[], surface: Surface, head: Letterhead, images: Map<string, { name: string; w: number; h: number }>): void {
  const paragraph = (text: string, size: number, bold: boolean, ink: string, indent = 0, width = CONTENT_W) => {
    for (const line of wrapText(encode(text), size, width - indent, bold)) {
      surface.room(size + 4);
      surface.push([{ t: 'text', x: MARGIN + indent, y: surface.y - size, size, bold, color: ink, text: line }]);
      surface.y -= LEAD * (size / BODY);
    }
  };

  for (const block of blocks) {
    if (block.spaceBefore) surface.y -= block.spaceBefore;
    if (block.kind === 'heading') {
      const size = 11;
      surface.room(size + 30);
      surface.y -= 4;
      surface.push([
        { t: 'fill', x: MARGIN, y: surface.y - size - 2, w: 3, h: size + 4, color: head.accent },
        { t: 'text', x: MARGIN + 10, y: surface.y - size, size, bold: true, color: INK, text: encode(block.text) },
      ]);
      surface.y -= size + 12;
      continue;
    }
    if (block.kind === 'text') {
      paragraph(block.text, block.size ?? BODY, !!block.bold, block.muted ? MUTED : INK);
      surface.y -= 2;
      continue;
    }
    if (block.kind === 'rule') {
      surface.room(10);
      surface.push([{ t: 'rule', x1: MARGIN, y1: surface.y - 4, x2: PAGE_W - MARGIN, y2: surface.y - 4, color: GRID, width: 0.7 }]);
      surface.y -= 12;
      continue;
    }
    if (block.kind === 'image') {
      const image = images.get(block.jpeg);
      if (!image) continue;
      const side = Math.min(block.maxSide ?? 240, CONTENT_W);
      const scale = Math.min(side / image.w, side / image.h);
      const w = image.w * scale;
      const h = image.h * scale;
      surface.room(h + (block.caption ? 18 : 8));
      surface.push([{ t: 'image', name: image.name, x: MARGIN + (CONTENT_W - w) / 2, y: surface.y - h, w, h }]);
      surface.y -= h + 6;
      if (block.caption) {
        const indent = Math.max(0, (CONTENT_W - textWidth(encode(block.caption), 9, false)) / 2);
        paragraph(block.caption, 9, false, MUTED, indent);
      }
      continue;
    }
    if (block.kind === 'fields') {
      const labelW = Math.min(190, CONTENT_W * 0.42);
      const rowH = LEAD + 2;
      for (const row of block.rows) {
        surface.room(rowH);
        surface.push([
          { t: 'text', x: MARGIN, y: surface.y - BODY, size: BODY, bold: false, color: MUTED, text: encode(row.label) },
          { t: 'text', x: MARGIN + labelW, y: surface.y - BODY, size: BODY, bold: !!row.bold, color: INK, text: encode(row.value) },
        ]);
        surface.y -= rowH;
      }
      surface.y -= 4;
      continue;
    }
    table(block, surface, head.accent);
  }
}

function table(
  block: PdfBlock & { kind: 'table' },
  surface: Surface,
  accent: string,
): void {
  const columns = block.columns.length ? block.columns : [{ label: '' }];
  const grow = columns.reduce((sum, c) => sum + (c.grow ?? 1), 0);
  const widths = columns.map((c) => (CONTENT_W * (c.grow ?? 1)) / grow);
  const size = 9.5;
  const padX = 6;
  const padY = 4;
  const rowLead = LEAD * 0.92;

  const linesIn = (text: string, index: number) => wrapText(encode(text), size, widths[index] - padX * 2);
  const heightOf = (cells: string[]) =>
    Math.max(1, ...cells.map((cell, i) => linesIn(cell, i).length)) * rowLead + padY * 2;

  const drawHeader = () => {
    const h = heightOf(columns.map((c) => c.label)) + 1;
    const ops: Op[] = [{ t: 'fill', x: MARGIN, y: surface.y - h, w: CONTENT_W, h, color: accent }];
    let x = MARGIN;
    columns.forEach((column, i) => {
      wrapText(encode(column.label).toUpperCase(), size - 0.5, widths[i] - padX * 2, true).forEach((line, li) => {
        ops.push({
          t: 'text', x: x + padX, y: surface.y - padY - size + 2 - li * rowLead,
          size: size - 0.5, bold: true, color: onColor(accent), text: line,
          right: column.align === 'right' ? x + widths[i] - padX : undefined,
        });
      });
      x += widths[i];
    });
    surface.push(ops);
    surface.y -= h;
  };

  const drawRow = (cells: string[], index: number) => {
    const h = heightOf(cells);
    const ops: Op[] = [];
    if (index % 2 === 1) ops.push({ t: 'fill', x: MARGIN, y: surface.y - h, w: CONTENT_W, h, color: ZEBRA });
    ops.push({ t: 'rule', x1: MARGIN, y1: surface.y - h, x2: PAGE_W - MARGIN, y2: surface.y - h, color: GRID, width: 0.5 });
    let x = MARGIN;
    cells.forEach((cell, i) => {
      linesIn(cell, i).forEach((line, li) => {
        ops.push({
          t: 'text', x: x + padX, y: surface.y - padY - size + 2 - li * rowLead,
          size, bold: false, color: INK, text: line,
          right: columns[i]?.align === 'right' ? x + widths[i] - padX : undefined,
        });
      });
      x += widths[i];
    });
    surface.push(ops);
    surface.y -= h;
  };

  surface.room(heightOf(columns.map((c) => c.label)) + 24);
  drawHeader();
  if (block.rows.length === 0) {
    drawRow(['Nothing to show.', ...columns.slice(1).map(() => '')], 0);
  }
  block.rows.forEach((cells, index) => {
    const h = heightOf(cells);
    // A row that will not fit moves to a fresh page, and the header has to be
    // drawn again because page two needs to say which column is the money.
    if (surface.room(h + 6)) drawHeader();
    drawRow(cells, index);
  });
  surface.y -= 8;
}

/** The furniture every sheet carries: a hairline, the note, the page numbers. */
function footerOps(index: number, count: number, footnote: string, brand: PdfBrand): Op[] {
  const accent = brand.accent ?? DEFAULT_ACCENT;
  const numbers = `Page ${index + 1} of ${count}`;
  const ops: Op[] = [
    { t: 'rule', x1: MARGIN, y1: 56, x2: PAGE_W - MARGIN, y2: 56, color: accent, width: 0.7 },
    { t: 'text', x: 0, y: 42, size: 8, bold: false, color: MUTED, text: encode(numbers), right: PAGE_W - MARGIN },
  ];
  const limit = CONTENT_W - textWidth(encode(numbers), 8) - 24;
  wrapText(encode(footnote), 8, limit).slice(0, 2).forEach((line, i) => {
    ops.push({ t: 'text', x: MARGIN, y: 42 - i * 10, size: 8, bold: false, color: MUTED, text: line });
  });
  return ops;
}

// ------------------------------------------------------------------- bytes ---

function base64ToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  try {
    const binary = atob(dataUrl.slice(comma + 1).replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 0xff;
    return bytes;
  } catch {
    return null;
  }
}

/** Pixel size of a baseline JPEG, read from its start-of-frame marker. */
function jpegDimensions(bytes: Uint8Array): { w: number; h: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: (bytes[i + 7] << 8) | bytes[i + 8], h: (bytes[i + 5] << 8) | bytes[i + 6] };
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

/**
 * A logo stored as a PNG, an SVG or a progressive JPEG cannot go into a PDF
 * without a real image library, so it is re-drawn through a canvas first. The
 * white fill matters: a JPEG has no transparency, so a clear logo would
 * otherwise print as a solid block.
 */
export async function logoToJpeg(dataUrl: string | null | undefined, maxSide = 200): Promise<string | null> {
  if (!dataUrl || !/^data:image\//.test(dataUrl)) return null;
  const bytes = base64ToBytes(dataUrl);
  if (/^data:image\/jpe?g/i.test(dataUrl) && bytes && jpegDimensions(bytes)) return dataUrl;
  if (typeof document === 'undefined') return null;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('logo would not load'));
      el.src = dataUrl;
    });
    const natural = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
    const scale = natural > 0 ? Math.min(1, maxSide / natural) : 1;
    const w = Math.max(1, Math.round((image.naturalWidth || maxSide) * scale));
    const h = Math.max(1, Math.round((image.naturalHeight || maxSide) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch {
    return null;
  }
}

/** One object in the file: text, optionally followed by raw image bytes. */
interface PdfObject {
  text: string;
  bytes?: Uint8Array;
  tail?: string;
}

/** Build the PDF for one document on one church's letterhead. */
export function buildPdfBytes(doc: PdfDoc, brand: PdfBrand): Uint8Array<ArrayBuffer> {
  const logoBytes = brand.logoJpeg ? base64ToBytes(brand.logoJpeg) : null;
  const dims = logoBytes ? jpegDimensions(logoBytes) : null;
  const logo = dims && dims.w > 0 && dims.h > 0 ? dims : null;
  const head = letterhead(doc, brand, logo);

  // Any image a block asks for gets its own object, once, however many pages use it.
  const images = new Map<string, { name: string; ref: number; w: number; h: number }>();
  const imageObjects: PdfObject[] = [];
  for (const block of doc.blocks) {
    if (block.kind !== 'image' || images.has(block.jpeg)) continue;
    const bytes = base64ToBytes(block.jpeg);
    if (!bytes) continue;
    const size = jpegDimensions(bytes);
    if (!size || size.w <= 0 || size.h <= 0) continue;
    const ref = 6 + imageObjects.length;
    images.set(block.jpeg, { name: `/Im${imageObjects.length}`, ref, ...size });
    imageObjects.push({
      text:
        `<< /Type /XObject /Subtype /Image /Width ${size.w} /Height ${size.h}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
      bytes,
      tail: '\nendstream',
    });
  }
  const firstPageObject = 6 + imageObjects.length;

  const pages: Op[][] = [];
  let ops: Op[] = [...head.first];
  const surface: Surface = {
    y: head.firstTop,
    push: (list) => { ops.push(...list); },
    newPage: () => { pages.push(ops); ops = [...head.later]; surface.y = head.laterTop; },
    room: (height) => {
      if (surface.y - height >= BOTTOM) return false;
      surface.newPage();
      return true;
    },
  };
  layOut(doc.blocks, surface, head, images);
  pages.push(ops);

  // Object numbering: 1 catalog, 2 pages, 3 and 4 the fonts, 5 the logo (an empty
  // slot when the church has not uploaded one), then one object per image in the
  // document, then a page and its content stream for every sheet.
  const count = pages.length;
  const kids = Array.from({ length: count }, (_, p) => `${firstPageObject + 2 * p} 0 R`).join(' ');
  const xobjects = [logo ? '/Logo 5 0 R' : '', ...[...images.values()].map((i) => `${i.name} ${i.ref} 0 R`)].filter(Boolean).join(' ');
  const resources =
    `<< /Font << /F1 3 0 R /F2 4 0 R >>${xobjects ? ` /XObject << ${xobjects} >>` : ''} /ProcSet [/PDF /Text /ImageC] >>`;

  const objects: PdfObject[] = [
    { text: '<< /Type /Catalog /Pages 2 0 R >>' },
    { text: `<< /Type /Pages /Kids [${kids}] /Count ${count} >>` },
    { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' },
    { text: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>' },
    logo && logoBytes
      ? {
          text:
            `<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h}` +
            ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBytes.length} >>\nstream\n`,
          bytes: logoBytes,
          tail: '\nendstream',
        }
      : { text: 'null' },
    ...imageObjects,
  ];
  for (let p = 0; p < count; p += 1) {
    const stream = [...pages[p], ...footerOps(p, count, doc.footnote ?? '', brand)].map(opToString).join('\n');
    objects.push({
      text: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources ${resources} /Contents ${firstPageObject + 2 * p + 1} 0 R >>`,
    });
    objects.push({ text: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
  }

  // Byte offsets have to be exact for the cross-reference table, and a PDF string
  // is one byte per character, so the file is assembled as raw bytes.
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const write = (text: string) => {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
    chunks.push(bytes);
    offset += bytes.length;
  };
  write('%PDF-1.4\n');
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(offset);
    write(`${index + 1} 0 obj\n${object.text}`);
    if (object.bytes) {
      chunks.push(object.bytes);
      offset += object.bytes.length;
      write(object.tail ?? '');
    }
    write('\nendobj\n');
  });
  const xrefStart = offset;
  write(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const value of offsets) write(`${String(value).padStart(10, '0')} 00000 n \n`);
  write(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const merged = new Uint8Array(offset);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.length;
  }
  return merged;
}

/** The same bytes as something a screen can download or hand to WhatsApp. */
export function buildPdfBlob(doc: PdfDoc, brand: PdfBrand): Blob {
  return new Blob([buildPdfBytes(doc, brand)], { type: 'application/pdf' });
}

/** True when this browser can hand a file to another app (WhatsApp on Android). */
export function canShareFiles(file: File): boolean {
  const nav = globalThis.navigator as (Navigator & { canShare?: (data: ShareData) => boolean }) | undefined;
  return !!nav?.canShare && nav.canShare({ files: [file] });
}
