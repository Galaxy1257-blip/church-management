'use client';
// Turning a screen's numbers into a file people can actually move: one branded
// PDF, then either straight into WhatsApp from a phone or into the downloads.
//
// Every report screen used to repeat the share dance — build, try the share
// sheet, fall back to a download, then explain in words what just happened
// because a phone that refused to share is not an error the treasurer can act
// on. It lives here so the wording and the fallbacks stay the same everywhere.
import { buildPdfBytes, canShareFiles, logoToJpeg, type PdfBrand, type PdfDoc } from './pdf';

/** The part of the session or portal response the letterhead is built from. */
export interface ChurchBrandSource {
  name?: string | null;
  branding?: {
    logoDataUrl?: string | null;
    tagline?: string | null;
    primaryColor?: string | null;
  } | null;
}

export type ShareResult =
  | { kind: 'shared'; message: string }
  | { kind: 'saved'; message: string }
  | { kind: 'cancelled'; message: '' }
  | { kind: 'failed'; message: string };

/** A logo redrawn once per sign-in; the stored data URL does not change. */
const jpegCache = new Map<string, Promise<string | null>>();

async function logoJpeg(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  const cached = jpegCache.get(dataUrl);
  if (cached) return cached;
  const started = logoToJpeg(dataUrl);
  jpegCache.set(dataUrl, started);
  if (jpegCache.size > 8) jpegCache.delete(jpegCache.keys().next().value as string);
  return started;
}

/** The church's own letterhead: name, tagline, logo and accent colour. */
export async function brandFor(church: ChurchBrandSource | null | undefined): Promise<PdfBrand> {
  return {
    churchName: church?.name ?? 'Church report',
    tagline: church?.branding?.tagline ?? null,
    logoJpeg: await logoJpeg(church?.branding?.logoDataUrl),
    accent: church?.branding?.primaryColor ?? null,
  };
}

export function pdfFile(doc: PdfDoc, brand: PdfBrand, filename: string): File {
  return new File([buildPdfBytes(doc, brand)], filename, { type: 'application/pdf' });
}

/** Hand the file to the browser's downloads. */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}

export interface PdfShareOptions {
  /** Whose letterhead the document goes on. */
  church: ChurchBrandSource | null | undefined;
  doc: PdfDoc;
  filename: string;
  /** The line the share sheet shows beside the file. */
  title: string;
  text: string;
}

/** The file on the church's letterhead, ready to download or hand to a chat. */
export async function buildPdfFile(
  church: ChurchBrandSource | null | undefined,
  doc: PdfDoc,
  filename: string,
): Promise<File> {
  return pdfFile(doc, await brandFor(church), filename);
}

/**
 * Share the PDF, and say honestly what happened. A phone that will not attach a
 * file to WhatsApp is not a failure of the app — the file is in the downloads,
 * and the person has to make the last move themselves.
 */
export async function sharePdf(options: PdfShareOptions): Promise<ShareResult> {
  let file: File;
  try {
    file = await buildPdfFile(options.church, options.doc, options.filename);
  } catch (err) {
    return { kind: 'failed', message: err instanceof Error ? err.message : 'could not build the PDF' };
  }
  if (!canShareFiles(file)) {
    saveFile(file);
    return {
      kind: 'saved',
      message: 'The PDF is in your downloads. Open WhatsApp and attach it to the chat from there.',
    };
  }
  try {
    await navigator.share({ files: [file], title: options.title, text: options.text });
    return { kind: 'shared', message: 'Done - the PDF went to WhatsApp from your phone.' };
  } catch (err) {
    if ((err as Error).name === 'AbortError') return { kind: 'cancelled', message: '' };
    saveFile(file);
    return {
      kind: 'saved',
      message: 'Your browser would not share the file, so it went into your downloads. Open WhatsApp and attach it from there.',
    };
  }
}
