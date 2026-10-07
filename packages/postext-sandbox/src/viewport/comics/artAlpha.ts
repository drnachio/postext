/**
 * Whether a comic picture shows ink at a sheet point (#594): a click on a
 * pop-out cut-out (a transparent picture drawn over a panel's border)
 * opens it only where it is opaque. The picture is read from the image
 * registry the previews paint from, rasterised once to a small alpha mask.
 * Null where that cannot be told (not decoded yet, no canvas, a picture
 * the browser will not read back).
 */

import { getResourceImage, type VDTComicArt } from 'postext';
import type { ArtOpacity } from './comicHit';

/** The longest side of a mask (px). */
const MASK_SIDE = 256;
/** The least alpha that counts as ink (of 255). */
const INK_ALPHA = 24;

interface Mask {
  image: CanvasImageSource;
  width: number;
  height: number;
  alpha: Uint8ClampedArray | null;
}

const masks = new Map<string, Mask>();

function sizeOf(image: CanvasImageSource): { width: number; height: number } {
  const o = image as { naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  const width = o.naturalWidth || (typeof o.width === 'number' ? o.width : 0);
  const height = o.naturalHeight || (typeof o.height === 'number' ? o.height : 0);
  return { width, height };
}

function maskOf(image: CanvasImageSource, art: VDTComicArt): Mask {
  const natural = sizeOf(image);
  const w0 = natural.width || art.box.width;
  const h0 = natural.height || art.box.height;
  const k = Math.min(1, MASK_SIDE / Math.max(1, w0, h0));
  const width = Math.max(1, Math.round(w0 * k));
  const height = Math.max(1, Math.round(h0 * k));
  let alpha: Uint8ClampedArray | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(image, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height).data;
      alpha = new Uint8ClampedArray(width * height);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
    }
  } catch {
    // A picture the browser will not read back (or no canvas): unknown.
    alpha = null;
  }
  return { image, width, height, alpha };
}

/** The registry's picture read at a sheet point (see {@link ArtOpacity}). */
export const registryArtOpacity: ArtOpacity = (art, x, y) => {
  if (typeof document === 'undefined') return null;
  const image = getResourceImage(art.fileId);
  if (!image) return null;
  let mask = masks.get(art.fileId);
  if (!mask || mask.image !== image) {
    mask = maskOf(image, art);
    masks.set(art.fileId, mask);
  }
  if (!mask.alpha) return null;
  const { box } = art;
  if (box.width <= 0 || box.height <= 0) return null;
  let u = (x - box.x) / box.width;
  const v = (y - box.y) / box.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (art.mirrored) u = 1 - u;
  const px = Math.min(mask.width - 1, Math.floor(u * mask.width));
  const py = Math.min(mask.height - 1, Math.floor(v * mask.height));
  return mask.alpha[py * mask.width + px]! >= INK_ALPHA;
};
