// The pictures a cover carries itself (the barcode, its effects, the
// mirrored bleed), decoded for the canvas, which paints only pictures it
// has been given. The book's own pictures go through `ensureResourceImages`.

import { registerResourceImage } from 'postext';
import { rasterizedSvg, type SvgRaster } from '../controls/media/resourceImages.js';

type Mime = 'image/svg+xml' | 'image/png' | 'image/jpeg';

/** What the bytes are, from their first bytes: PNG, JPEG, or an SVG's
 *  text; null for anything else (never decoded). */
export function sniffCoverFile(bytes: Uint8Array): Mime | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
  return head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--') ? 'image/svg+xml' : null;
}

/** A short fingerprint of the bytes (FNV-1a), so the same file is not
 *  decoded again on every rebuild. */
export function bytesKey(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193);
  }
  return `${bytes.length}:${(h >>> 0).toString(36)}`;
}

const registered = new Map<string, string>();

async function decode(bytes: Uint8Array, mime: Mime, raster?: SvgRaster): Promise<CanvasImageSource | null> {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  if (mime !== 'image/svg+xml') return createImageBitmap(blob);
  // A worker has no <img> to decode an SVG: the page rasterizes it.
  if (typeof Image === 'undefined') return raster ? rasterizedSvg(new TextDecoder().decode(bytes), raster) : null;
  // An SVG through an <img>, its URL freed once decoded.
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Register the cover's own files for the canvas (in a worker, its SVGs
 *  through `raster`). Returns true when one was (re)registered. */
export async function registerCoverFiles(files: Readonly<Record<string, Uint8Array>>, raster?: SvgRaster): Promise<boolean> {
  let changed = false;
  await Promise.all(Object.entries(files).map(async ([fileId, bytes]) => {
    const key = bytesKey(bytes);
    if (registered.get(fileId) === key) return;
    const mime = sniffCoverFile(bytes);
    if (!mime) return;
    const image = await decode(bytes, mime, raster).catch(() => null);
    if (!image) return;
    registerResourceImage(fileId, image, { vector: mime === 'image/svg+xml', singleInk: false });
    registered.set(fileId, key);
    changed = true;
  }));
  return changed;
}
