/**
 * Bitmap masks: a picture of the cover's gallery marked as a mask (a
 * greyscale PNG or JPEG, or a PNG with transparency) cuts another picture
 * softly, its greys as the picture's transparency: white shows, black
 * hides, the greys between fade (a vignette, a torn edge, a texture). The
 * mask is stretched to the picture.
 *
 * The outputs cannot mask a picture as they draw it (the PDF's SVG reader
 * has no masks), so the masked picture is made here, once, as a PNG of
 * its own in the gallery, which every output draws as it is; it keeps the
 * picture and the mask it was made from, to make it again.
 */

import type { Pixels } from '../library/traceOutline.js';
import type { GalleryPicture } from '../library/coverGallery.js';
import { newGalleryId } from '../library/coverGallery.js';

/** How much each pixel of a mask shows, 0 … 255: its transparency when it
 *  has any, else its lightness. */
export function maskAlpha(mask: Pixels): Uint8ClampedArray {
  const { width, height, data } = mask;
  const n = width * height;
  let transparent = false;
  for (let p = 0; p < n; p++) {
    if (data[4 * p + 3]! < 250) {
      transparent = true;
      break;
    }
  }
  const out = new Uint8ClampedArray(n);
  for (let p = 0; p < n; p++) {
    out[p] = transparent
      ? data[4 * p + 3]!
      // Rec. 709 lightness, the mask's own alpha over it.
      : Math.round((0.2126 * data[4 * p]! + 0.7152 * data[4 * p + 1]! + 0.0722 * data[4 * p + 2]!) * (data[4 * p + 3]! / 255));
  }
  return out;
}

/** A picture's pixels with a mask's (as `maskAlpha` reads it, the same
 *  size) laid on their transparency; `invert` hides where the mask shows. */
export function applyMask(picture: Pixels, alpha: Uint8ClampedArray, invert = false): Uint8ClampedArray {
  const out = new Uint8ClampedArray(picture.data);
  for (let p = 0; p < picture.width * picture.height; p++) {
    const a = invert ? 255 - alpha[p]! : alpha[p]!;
    out[4 * p + 3] = Math.round((out[4 * p + 3]! * a) / 255);
  }
  return out;
}

/** The most pixels a masked picture is made a side. */
const MAX_SIDE = 2400;

async function decoded(p: Pick<GalleryPicture, 'bytes' | 'mime'>): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.mime }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `picture` masked by `mask`, as a new picture of the gallery (a PNG at
 *  the picture's size, up to {@link MAX_SIDE} a side). */
export async function maskedPicture(picture: GalleryPicture, mask: GalleryPicture, invert = false): Promise<GalleryPicture> {
  const [img, maskImg] = await Promise.all([decoded(picture), decoded(mask)]);
  const w0 = img.naturalWidth || picture.width;
  const h0 = img.naturalHeight || picture.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));
  const read = (source: HTMLImageElement): Uint8ClampedArray => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(source, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
  };
  const pixels = { width, height, data: read(img) };
  const alpha = maskAlpha({ width, height, data: read(maskImg) });
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  out.getContext('2d')!.putImageData(new ImageData(applyMask(pixels, alpha, invert) as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
  if (!blob) throw new Error('masked picture not made');
  return {
    id: newGalleryId('pic'),
    name: `${picture.name} · ${mask.name}`,
    mime: 'image/png',
    bytes: new Uint8Array(await blob.arrayBuffer()),
    width,
    height,
    masked: { source: picture.id, mask: mask.id, ...(invert ? { invert: true } : {}) },
    updatedAt: Date.now(),
  };
}
