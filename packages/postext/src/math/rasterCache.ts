import type { MathRender } from './types';

// ---------------------------------------------------------------------------
// Raster cache
//
// Canvas paint of math is dominated by `new Path2D(d)` + `ctx.fill` for every
// path of every formula, on every repaint. We pre-rasterise each MathRender
// into an offscreen bitmap the first time it is painted, then blit it on
// subsequent repaints — O(paths) once, O(1) forever after.
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

function contentKey(render: MathRender, fallbackColor: string): string {
  return `${render.displayMode ? 'D' : 'I'}|${render.widthPx}|${render.heightPx}|${render.scale}|${fallbackColor}|${render.tex}`;
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

export function getMathRaster(
  render: MathRender,
  fallbackColor: string,
): RasterCanvas | null {
  const { viewBox, widthPx, heightPx, paths } = render;
  if (!paths.length || widthPx <= 0 || heightPx <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return null;
  }
  let inner = identityCache.get(render);
  if (!inner) {
    inner = new Map();
    identityCache.set(render, inner);
  }
  const identityHit = inner.get(fallbackColor);
  if (identityHit) return identityHit;

  const ckey = contentKey(render, fallbackColor);
  const contentHit = contentCache.get(ckey);
  if (contentHit) {
    inner.set(fallbackColor, contentHit);
    touchLru(ckey, contentHit);
    return contentHit;
  }

  const pxW = Math.max(1, Math.ceil(widthPx));
  const pxH = Math.max(1, Math.ceil(heightPx));
  const canvas = createCanvas(pxW, pxH);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  const sx = widthPx / viewBox.width;
  const sy = heightPx / viewBox.height;
  ctx.scale(sx, sy);
  ctx.translate(-viewBox.minX, -viewBox.minY);
  for (const path of paths) {
    ctx.fillStyle = path.fill === 'currentColor' ? fallbackColor : path.fill;
    ctx.fill(new Path2D(path.d));
  }
  inner.set(fallbackColor, canvas);
  touchLru(ckey, canvas);
  return canvas;
}
