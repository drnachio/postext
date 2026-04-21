import type { MathRender } from './types';

// ---------------------------------------------------------------------------
// Raster cache
//
// Canvas paint of math is dominated by `new Path2D(d)` + `ctx.fill` for every
// path of every formula, on every repaint. We pre-rasterise each MathRender
// into an offscreen bitmap the first time it is painted, then blit it on
// subsequent repaints — O(paths) once, O(1) forever after.
//
// Keyed by MathRender object identity: the upstream engine cache (see
// engine.ts) already returns the same MathRender instance for the same TeX +
// font size + line box, so a WeakMap keyed on the render object gives us
// "invalidate on change" for free — when inputs change the engine produces a
// new MathRender object and the old raster is GC'd.
// ---------------------------------------------------------------------------

type RasterCanvas = OffscreenCanvas | HTMLCanvasElement;

const cache = new WeakMap<MathRender, Map<string, RasterCanvas>>();

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

export function getMathRaster(
  render: MathRender,
  fallbackColor: string,
): RasterCanvas | null {
  const { viewBox, widthPx, heightPx, paths } = render;
  if (!paths.length || widthPx <= 0 || heightPx <= 0 || viewBox.width <= 0 || viewBox.height <= 0) {
    return null;
  }
  let inner = cache.get(render);
  if (!inner) {
    inner = new Map();
    cache.set(render, inner);
  }
  const hit = inner.get(fallbackColor);
  if (hit) return hit;

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
  return canvas;
}
