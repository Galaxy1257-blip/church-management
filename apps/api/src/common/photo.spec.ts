import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizePhotoDataUrl } from './photo';

async function pngDataUrl(): Promise<string> {
  const bytes = await sharp({
    create: { width: 32, height: 24, channels: 4, background: { r: 30, g: 80, b: 60, alpha: 1 } },
  })
    .png()
    .withMetadata({ exif: { IFD0: { Copyright: 'private metadata' } } })
    .toBuffer();
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

describe('normalizePhotoDataUrl', () => {
  it('re-encodes a valid image and strips metadata', async () => {
    const output = await normalizePhotoDataUrl(await pngDataUrl());
    expect(output).toMatch(/^data:image\/webp;base64,/);
    const bytes = Buffer.from(output!.split(',')[1], 'base64');
    const metadata = await sharp(bytes).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
  });

  it('rejects a disguised file and malformed base64', async () => {
    const disguised = `data:image/png;base64,${Buffer.from('not an image').toString('base64')}`;
    await expect(normalizePhotoDataUrl(disguised)).rejects.toBeInstanceOf(BadRequestException);
    await expect(normalizePhotoDataUrl('data:image/png;base64,!!!')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves null and undefined semantics', async () => {
    await expect(normalizePhotoDataUrl(null)).resolves.toBeNull();
    await expect(normalizePhotoDataUrl(undefined)).resolves.toBeUndefined();
  });
});
