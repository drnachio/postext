import type { MathRender } from './types.js';

// ---------------------------------------------------------------------------
// Raster cache
//
// Canvas paint of math is dominated by `new Path2D(d)` + `ctx.fill` for every
// path of every formula, on every repaint. We pre-rasterise each MathRender
// into an offscreen bitmap the first time it is painted, then blit it on
// subsequent repaints — O(paths) once, O(1) forever after.
//
// The bitmap has the size the formula shows at in device pixels (#674):
// its box in page pixels times the scale the caller reads from the context
// it paints on (`rasterScaleOf`: 1 on a page painted at its own resolution
// or below it), so a page painted larger gets a bitmap of its own instead
// of an upsampled one. Each size is a cache entry.
//
// Two-tier lookup:
// 1. A WeakMap keyed by `MathRender` identity handles the same-build case
//    (same object reused across multiple page repaints) with zero hashing.
// 2. A bounded Map keyed by a content hash handles the cross-build case:
//    when the layout is produced by a Web Worker, every build posts a freshly
//    structured-cloned `MathRender`, so identity-keyed caches always miss.
//    The content key makes the raster survive across worker rebuilds — the
//    bitmap only changes when the TeX, font size, or viewport change.
// ---------------------------------------------------------------------------

type RasterCanvas = OffscreenCanvas | HTMLCanvasElement;

const identityCache = new WeakMap<MathRender, Map<string, RasterCanvas>>();
const contentCache = new Map<string, RasterCanvas>();
const CONTENT_CACHE_MAX = 512;
/** Above this many device pixels on a side no bitmap is made: the caller
 *  fills the formula's paths, which need none. */
const RASTER_MAX_SIDE = 8192;

function contentKey(render: MathRender, variant: string): string {
  return `${render.displayMode ? 'D' : 'I'}|${render.widthPx}|${render.heightPx}|${render.scale}|${variant}|${render.tex}`;
}

function createCanvas(pxW: number, pxH: number): RasterCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(pxW, pxH);
  }
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = pxW;
    c.height = pxH;
    return c;
  }
  return null;
}

function touchLru(key: string, value: RasterCanvas): void {
  if (contentCache.has(key)) contentCache.delete(key);
  contentCache.set(key, value);
  if (contentCache.size > CONTENT_CACHE_MAX) {
    const oldest = contentCache.keys().next().value;
    if (oldest !== undefined) contentCache.delete(oldest);
  }
}

/** The bitmap of a formula in `fallbackColor`, `scale` device pixels per
 *  page pixel along each axis (1 when left out); null when it cannot be
 *  made, or would be too large, and the caller fills the paths. */
export function getMathRaster(
  render: MathRender,
  fallbackColor: string,
  scale?: { x: number; y: number },
): RasterCanvas | null {
  const { viewBox, widthPx, heightPx, paths } = render;
  if (!paths.length || widthPx <= 0 || heightPx <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return null;
  }
  const kx = scale && scale.x > 0 ? scale.x : 1;
  const ky = scale && scale.y > 0 ? scale.y : 1;
  const pxW = Math.max(1, Math.ceil(widthPx * kx));
  const pxH = Math.max(1, Math.ceil(heightPx * ky));
  if (pxW > RASTER_MAX_SIDE || pxH > RASTER_MAX_SIDE) return null;
  // The entry of the bitmap: its colour, and its size above the box's own.
  const variant = kx === 1 && ky === 1 ? fallbackColor : `${fallbackColor}|${pxW}x${pxH}`;
  let inner = identityCache.get(render);
  if (!inner) {
    inner = new Map();
    identityCache.set(render, inner);
  }
  const identityHit = inner.get(variant);
  if (identityHit) return identityHit;

  const ckey = contentKey(render, variant);
  const contentHit = contentCache.get(ckey);
  if (contentHit) {
    inner.set(variant, contentHit);
    touchLru(ckey, contentHit);
    return contentHit;
  }

  const canvas = createCanvas(pxW, pxH);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  const sx = (widthPx * kx) / viewBox.width;
  const sy = (heightPx * ky) / viewBox.height;
  ctx.scale(sx, sy);
  ctx.translate(-viewBox.minX, -viewBox.minY);
  for (const path of paths) {
    if (path.fill === 'none') continue; // draws nothing (#1371)
    ctx.fillStyle = path.fill === 'currentColor' ? fallbackColor : path.fill;
    ctx.fill(new Path2D(path.d));
  }
  inner.set(variant, canvas);
  touchLru(ckey, canvas);
  return canvas;
}
