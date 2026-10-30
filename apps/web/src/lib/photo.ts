// Photos are stored as data URLs and capped server-side at ~200 KB. Phone
// cameras produce 3–8 MB files, so shrink to a small square-ish preview first.
const MAX_CHARS = 280_000;

export async function fileToPhotoDataUrl(file: File, maxSide = 480): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose a photo (PNG, JPEG or WebP).');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo.'));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  // JPEG has no transparency: paint a warm paper background first.
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL('image/jpeg', 0.82);
  if (out.length > MAX_CHARS) throw new Error('That photo is still too large — try a smaller one.');
  return out;
}
