/**
 * The natural print size of a bitmap (#631). A bitmap declares its pixel
 * count (`Resource.bitmap.width` / `height`); how many of those pixels go
 * to an inch decides the size it is laid out at before the column caps it:
 *
 * - its own `resolution`, when it declares one;
 * - else the document's `layout.bitmapResolution`: a number is the ppi of
 *   every such bitmap, `'file'` the resolution read from the file
 *   (`fileResolution`, 72 and 96 counting as unset), `'document'` (the
 *   default) none;
 * - with none, one pixel per layout px (`page.dpi`).
 *
 * A build stamps the document's policy onto the bitmaps that take it
 * (`withBitmapResolutions`), so the layout code reads `bitmap.resolution`
 * alone (`bitmapLayoutSize`).
 */

import type { BitmapResolution, Resource } from './types';

type Bitmap = NonNullable<Resource['bitmap']>;

/** 72 and 96 ppi, what cameras, screenshots and web exports write when
 *  they know nothing of a print size: `'file'` reads them as unset. */
export function isPlaceholderResolution(ppi: number): boolean {
  return Math.abs(ppi - 72) < 0.5 || Math.abs(ppi - 96) < 0.5;
}

function usable(ppi: number | undefined): ppi is number {
  return typeof ppi === 'number' && Number.isFinite(ppi) && ppi > 0;
}

/** The ppi a bitmap takes its natural size from under `policy`, or
 *  `undefined` when its pixels are read at `page.dpi`. */
export function bitmapResolutionFor(bitmap: Pick<Bitmap, 'resolution' | 'fileResolution'>, policy: BitmapResolution = 'document'): number | undefined {
  if (usable(bitmap.resolution)) return bitmap.resolution;
  if (typeof policy === 'number') return usable(policy) ? policy : undefined;
  if (policy === 'file' && usable(bitmap.fileResolution) && !isPlaceholderResolution(bitmap.fileResolution)) return bitmap.fileResolution;
  return undefined;
}

/** The ppi a bitmap is laid out at before the column caps it: its
 *  resolution under `policy`, else `dpi`. */
export function effectiveBitmapResolution(bitmap: Pick<Bitmap, 'resolution' | 'fileResolution'>, policy: BitmapResolution | undefined, dpi: number): number {
  return bitmapResolutionFor(bitmap, policy) ?? dpi;
}

/** A bitmap's natural size in layout px at `dpi`: its pixels scaled by
 *  `dpi / resolution`, or the pixels themselves without a resolution. */
export function bitmapLayoutSize(bitmap: Pick<Bitmap, 'width' | 'height' | 'resolution'>, dpi: number): { width: number; height: number } {
  if (!usable(bitmap.resolution) || !usable(dpi)) return { width: bitmap.width, height: bitmap.height };
  const k = dpi / bitmap.resolution;
  return { width: bitmap.width * k, height: bitmap.height * k };
}

const stamped = new WeakMap<readonly Resource[], Map<BitmapResolution, readonly Resource[]>>();

/** `resources` with the document's policy written into the `resolution`
 *  of every bitmap that has none and takes one from it. Under
 *  `'document'`, or when no bitmap changes, the same array (and the same
 *  objects) come back, so a document that does not opt in lays out and
 *  serialises exactly as before. Memoised per array and policy: the
 *  passes of a build see the same objects. */
export function withBitmapResolutions(resources: readonly Resource[], policy: BitmapResolution | undefined): readonly Resource[] {
  if (policy === undefined || policy === 'document' || resources.length === 0) return resources;
  let byPolicy = stamped.get(resources);
  const hit = byPolicy?.get(policy);
  if (hit) return hit;
  let changed = false;
  const out = resources.map((r) => {
    const b = r.bitmap;
    if (r.kind !== 'bitmap' || !b || usable(b.resolution)) return r;
    const ppi = bitmapResolutionFor(b, policy);
    if (ppi === undefined) return r;
    changed = true;
    return { ...r, bitmap: { ...b, resolution: ppi } };
  });
  const result = changed ? out : resources;
  if (!byPolicy) {
    byPolicy = new Map();
    stamped.set(resources, byPolicy);
  }
  byPolicy.set(policy, result);
  return result;
}
