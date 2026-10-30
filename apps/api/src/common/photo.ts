// Photos are stored as data URLs (the logo uses the same pattern). Keeping the
// cap small means a member drawer can open instantly without a file server.
import { BadRequestException } from '@nestjs/common';

const MAX_PHOTO_CHARS = 280_000; // ~200 KB of image data
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;

export function normalizePhotoDataUrl(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!DATA_URL.test(value)) throw new BadRequestException('photo must be a PNG, JPEG or WebP image');
  if (value.length > MAX_PHOTO_CHARS) throw new BadRequestException('photo is too large — please use one under 200 KB');
  return value;
}
