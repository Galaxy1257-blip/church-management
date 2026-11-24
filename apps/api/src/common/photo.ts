import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

const MAX_IMAGE_BYTES = 200 * 1024;
const DATA_URL = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]*={0,2})$/;

function matchesSignature(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

export async function normalizePhotoDataUrl(
  value: string | null | undefined,
  maxImageBytes = MAX_IMAGE_BYTES,
): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const maxChars = Math.ceil((maxImageBytes / 3) * 4);
  const limit = `${Math.round(maxImageBytes / 1024)} KB`;
  const match = DATA_URL.exec(value);
  if (!match || value.length > maxChars) {
    throw new BadRequestException(`photo must be a PNG, JPEG or WebP image under ${limit}`);
  }

  const mime = match[1];
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > maxImageBytes || !matchesSignature(mime, bytes)) {
    throw new BadRequestException('photo file does not match its image type');
  }

  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: 'error', sequentialRead: true })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true });

    for (const quality of [82, 72, 62, 52]) {
      const output = await image.clone().webp({ quality }).toBuffer();
      if (output.length <= maxImageBytes) {
        return `data:image/webp;base64,${output.toString('base64')}`;
      }
    }
  } catch {
    throw new BadRequestException('photo could not be read as an image');
  }

  throw new BadRequestException('photo is too large after processing — please use a simpler image');
}
