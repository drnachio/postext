/**
 * Letters as rows of dots, for a child to trace (#1017): the dots a text
 * is painted with when its style sets `dotted` (a design text element, a
 * chip style).
 *
 * The browser shapes and draws the text, so a joined script keeps its
 * joins and an Arabic word its forms, and the dots are read off what it
 * drew. The run is painted alone on a small canvas, `RASTER_PITCH` pixels
 * to a dot spacing; the edge of its ink is traced (marching squares, at
 * the half-coverage level); each point of the edge is moved half the
 * stroke's width inward, onto the middle of the stroke; and the dots are
 * laid along each edge at the spacing, the longest edge first, a dot kept
 * only where no dot stands closer than `REJECT` spacings. The two edges of
 * a stroke meet on its middle, so the second one adds nothing: one row of
 * dots per stroke, whatever the weight (the thinnest weight of a face
 * gives the most even rows). An edge too short to carry two dots is a
 * mark of its own (the dot of an i, an accent): one dot at its middle, if
 * that is ink (the eye of a small loop is not).
 *
 * The dots are a function of the run, its font, its tracking, direction
 * and language, and of the spacing: cached under all of them. They are
 * paint, not layout: the run keeps the width it was measured at.
 */

import type { TextDotsStyle } from '../types.js';
import { dimensionToPx } from '../units.js';
import { fillContextText, measureContextText } from '../canvas-backend/contextText.js';

/** Raster pixels to a dot spacing. */
const RASTER_PITCH = 12;
/** A candidate dot nearer than this many spacings to a dot already laid
 *  is dropped. */
const REJECT = 0.8;
/** The largest raster, either way, px. */
const MAX_SIDE = 8192;
/** Runs kept in the cache. */
const CACHE_SIZE = 2000;

export interface TextDotsRequest {
  text: string;
  /** CSS font shorthand the run is painted in. */
  font: string;
  /** Distance between two dots along a stroke, px. */
  spacingPx: number;
  letterSpacingPx?: number;
  rtl?: boolean;
  /** The language the run is shaped in (`ctx.lang`). */
  lang?: string;
}

export interface TextDots {
  /** Dot centres, `x, y` pairs from the run's left edge and baseline, px. */
  points: Float32Array;
  /** The run's advance, px, as the raster's context measured it. */
  width: number;
}

type Raster = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const cache = new Map<string, TextDots>();
let scratch: { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Raster } | null | undefined;

function scratchCanvas(width: number, height: number): Raster | null {
  if (scratch === undefined) {
    let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(1, 1);
    else if (typeof document !== 'undefined') canvas = document.createElement('canvas');
    const ctx = canvas?.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as Raster | null | undefined;
    // A context that cannot be read back (a test's stub) draws no dots.
    scratch = canvas && ctx && typeof ctx.getImageData === 'function' ? { canvas, ctx } : null;
  }
  if (!scratch) return null;
  // Setting the size clears the canvas and resets its state.
  scratch.canvas.width = width;
  scratch.canvas.height = height;
  return scratch.ctx;
}

/** Whether the run's font is loaded where it is painted: dots drawn from
 *  a fallback face are not kept. */
function fontReady(font: string, text: string): boolean {
  const fonts = (globalThis as { document?: { fonts?: FontFaceSet }; fonts?: FontFaceSet }).document?.fonts
    ?? (globalThis as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.check !== 'function') return true;
  try {
    return fonts.check(font, text);
  } catch {
    return true;
  }
}

function setUp(ctx: Raster, req: TextDotsRequest): void {
  ctx.font = req.font;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if ('direction' in ctx) ctx.direction = req.rtl ? 'rtl' : 'ltr';
  if ('letterSpacing' in ctx) (ctx as { letterSpacing: string }).letterSpacing = `${req.letterSpacingPx ?? 0}px`;
  if ('lang' in ctx && req.lang) (ctx as { lang: string }).lang = req.lang;
}

/**
 * The dots `req.text` is traced with, or `null` where there is no canvas
 * to draw it on (the painter then fills the letters).
 */
export function textDots(req: TextDotsRequest): TextDots | null {
  if (!(req.spacingPx > 0) || req.text.trim() === '') return { points: new Float32Array(0), width: 0 };
  const key = `${req.font}\u0000${req.letterSpacingPx ?? 0}\u0000${req.rtl ? 1 : 0}\u0000${req.lang ?? ''}\u0000${req.spacingPx}\u0000${req.text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const probe = scratchCanvas(1, 1);
  if (!probe) return null;
  setUp(probe, req);
  const m = measureContextText(probe, req.text);
  const ascent = Math.max(m.actualBoundingBoxAscent || 0, m.fontBoundingBoxAscent || 0);
  const descent = Math.max(m.actualBoundingBoxDescent || 0, m.fontBoundingBoxDescent || 0);
  // Ink past the advance on either side, within reason: Skia answers a
  // right-to-left run's left bound with a number of no meaning.
  const reach = (v: number): number => (Number.isFinite(v) && Math.abs(v) <= m.width + ascent + descent ? v : 0);
  const left = Math.min(0, -reach(m.actualBoundingBoxLeft));
  const right = Math.max(m.width, reach(m.actualBoundingBoxRight));
  const pad = req.spacingPx;
  let scale = RASTER_PITCH / req.spacingPx;
  const w0 = right - left + 2 * pad;
  const h0 = ascent + descent + 2 * pad;
  scale = Math.min(scale, MAX_SIDE / w0, MAX_SIDE / h0);
  const W = Math.max(1, Math.ceil(w0 * scale));
  const H = Math.max(1, Math.ceil(h0 * scale));
  const ctx = scratchCanvas(W, H);
  if (!ctx) return null;
  setUp(ctx, req);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#000';
  const ox = pad - left;
  const oy = pad + ascent;
  fillContextText(ctx, req.text, ox, oy);
  const data = ctx.getImageData(0, 0, W, H).data;
  const alpha = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = data[i * 4 + 3]! / 255;
  const pitch = req.spacingPx * scale;
  const raster = dotsOnRaster(alpha, W, H, pitch);
  const points = new Float32Array(raster.length);
  for (let i = 0; i < raster.length; i += 2) {
    points[i] = raster[i]! / scale - ox;
    points[i + 1] = raster[i + 1]! / scale - oy;
  }
  const out: TextDots = { points, width: m.width };
  if (fontReady(req.font, req.text)) {
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(key, out);
  }
  return out;
}

/** Forget every run's dots (a face loaded or replaced under a name). */
export function clearTextDots(): void {
  cache.clear();
}

/**
 * Dot centres (flat `x, y`, raster px) along the strokes of the ink in
 * `alpha` (coverage 0…1, `W × H`), `pitch` px apart. Exported for tests.
 */
export function dotsOnRaster(alpha: Float32Array, W: number, H: number, pitch: number): number[] {
  const at = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(W - 1, x0 + 1);
    const y1 = Math.min(H - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = alpha[y0 * W + x0]! * (1 - fx) + alpha[y0 * W + x1]! * fx;
    const b = alpha[y1 * W + x0]! * (1 - fx) + alpha[y1 * W + x1]! * fx;
    return a * (1 - fy) + b * fy;
  };
  const contours = traceContours(alpha, W, H, 0.5);
  // Longest first: the main strokes set the rhythm, the marks follow.
  const measured = contours.map((c) => ({ c, length: polylineLength(c) })).sort((a, b) => b.length - a.length);
  const dots: number[] = [];
  const cell = pitch;
  const grid = new Map<number, number[]>();
  const gridKey = (gx: number, gy: number): number => gy * 65536 + gx;
  const reject = REJECT * pitch;
  const nearest = (x: number, y: number, r: number): boolean => {
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get(gridKey(gx + dx, gy + dy));
        if (!list) continue;
        for (let i = 0; i < list.length; i += 2) {
          const ex = list[i]! - x;
          const ey = list[i + 1]! - y;
          if (ex * ex + ey * ey < r * r) return true;
        }
      }
    }
    return false;
  };
  const put = (x: number, y: number): void => {
    dots.push(x, y);
    const k = gridKey(Math.floor(x / cell), Math.floor(y / cell));
    const list = grid.get(k);
    if (list) list.push(x, y);
    else grid.set(k, [x, y]);
  };
  // How far the ink runs from (x, y) along (nx, ny): the stroke's width
  // there, up to `limit`.
  const depth = (x: number, y: number, nx: number, ny: number, limit: number): number => {
    let d = 0;
    while (d < limit && at(x + nx * (d + 0.5), y + ny * (d + 0.5)) >= 0.5) d += 0.5;
    return d;
  };
  for (const { c, length } of measured) {
    const n = c.length / 2;
    if (length < 2 * pitch) {
      // A mark too small for a row: one dot at its middle, if that is ink.
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < c.length; i += 2) {
        cx += c[i]!;
        cy += c[i + 1]!;
      }
      cx /= n;
      cy /= n;
      if (at(cx, cy) >= 0.5 && !nearest(cx, cy, 0.5 * pitch)) put(cx, cy);
      continue;
    }
    const count = Math.max(1, Math.round(length / pitch));
    const step = length / count;
    let target = 0;
    let walked = 0;
    for (let i = 0; i < n && target < length - 1e-6; i++) {
      const ax = c[2 * i]!;
      const ay = c[2 * i + 1]!;
      const j = (i + 1) % n;
      const bx = c[2 * j]!;
      const by = c[2 * j + 1]!;
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg === 0) continue;
      while (target <= walked + seg && target < length - 1e-6) {
        const t = (target - walked) / seg;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        // The normal into the ink: either side of the edge.
        let nx = -(by - ay) / seg;
        let ny = (bx - ax) / seg;
        if (at(px + nx, py + ny) < at(px - nx, py - ny)) {
          nx = -nx;
          ny = -ny;
        }
        const d = depth(px, py, nx, ny, 3 * pitch);
        const mx = px + nx * d / 2;
        const my = py + ny * d / 2;
        if (!nearest(mx, my, reject)) put(mx, my);
        target += step;
      }
      walked += seg;
    }
  }
  return dots;
}

function polylineLength(c: number[]): number {
  let length = 0;
  const n = c.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    length += Math.hypot(c[2 * j]! - c[2 * i]!, c[2 * j + 1]! - c[2 * i + 1]!);
  }
  return length;
}

/**
 * The closed edges of the ink at coverage `level` (marching squares over
 * the pixel centres, each crossing placed by linear interpolation), as
 * flat `x, y` polylines, the ink on their right (y down). The raster's
 * border is taken as blank, so every edge closes.
 */
export function traceContours(alpha: Float32Array, W: number, H: number, level: number): number[][] {
  // Cells span pixel centres (x, y) to (x + 1, y + 1), from −1 so that the
  // border closes the edges. An edge point is keyed by the cell edge it
  // crosses: horizontal edges `2 · id`, vertical ones `2 · id + 1`.
  const CW = W + 2;
  const size = 2 * CW * (H + 2);
  const next = new Int32Array(size).fill(-1);
  const px = new Float32Array(size);
  const py = new Float32Array(size);
  const keys: number[] = [];
  const v = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? 0 : alpha[y * W + x]!);
  const id = (x: number, y: number): number => (y + 1) * CW + (x + 1);
  const cross = (key: number, ax: number, ay: number, va: number, bx: number, by: number, vb: number): number => {
    const t = va === vb ? 0.5 : (level - va) / (vb - va);
    px[key] = ax + (bx - ax) * t;
    py[key] = ay + (by - ay) * t;
    return key;
  };
  const link = (from: number, to: number): void => {
    next[from] = to;
    keys.push(from);
  };
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const a = v(x, y); // top left
      const b = v(x + 1, y); // top right
      const c = v(x + 1, y + 1); // bottom right
      const d = v(x, y + 1); // bottom left
      const code = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const top = (): number => cross(2 * id(x, y), x, y, a, x + 1, y, b);
      const right = (): number => cross(2 * id(x + 1, y) + 1, x + 1, y, b, x + 1, y + 1, c);
      const bottom = (): number => cross(2 * id(x, y + 1), x, y + 1, d, x + 1, y + 1, c);
      const left = (): number => cross(2 * id(x, y) + 1, x, y, a, x, y + 1, d);
      // A saddle: the two corners of ink meet through the middle or not.
      const joined = (a + b + c + d) / 4 >= level;
      switch (code) {
        case 1: link(left(), bottom()); break;
        case 2: link(bottom(), right()); break;
        case 3: link(left(), right()); break;
        case 4: link(right(), top()); break;
        case 5:
          if (joined) { link(left(), top()); link(right(), bottom()); } else { link(left(), bottom()); link(right(), top()); }
          break;
        case 6: link(bottom(), top()); break;
        case 7: link(left(), top()); break;
        case 8: link(top(), left()); break;
        case 9: link(top(), bottom()); break;
        case 10:
          if (joined) { link(top(), right()); link(bottom(), left()); } else { link(top(), left()); link(bottom(), right()); }
          break;
        case 11: link(top(), right()); break;
        case 12: link(right(), left()); break;
        case 13: link(right(), bottom()); break;
        case 14: link(bottom(), left()); break;
      }
    }
  }
  const contours: number[][] = [];
  for (const start of keys) {
    if (next[start]! < 0) continue;
    const loop: number[] = [];
    let k = start;
    while (k >= 0 && next[k]! >= 0) {
      loop.push(px[k]!, py[k]!);
      const n = next[k]!;
      next[k] = -1;
      k = n;
    }
    if (loop.length >= 6) contours.push(loop);
  }
  return contours;
}

/** A `TextDotsStyle` in px, em being `fontSizePx`: `0.1em` apart, `0.05em`
 *  across by default; a spacing never under the dot. */
export function resolveTextDots(style: TextDotsStyle, dpi: number, fontSizePx: number): { spacingPx: number; sizePx: number } {
  const spacing = style.spacing ? dimensionToPx(style.spacing, dpi, fontSizePx) : 0.1 * fontSizePx;
  const size = style.size ? dimensionToPx(style.size, dpi, fontSizePx) : 0.05 * fontSizePx;
  const sizePx = Number.isFinite(size) && size > 0 ? size : 0.05 * fontSizePx;
  const spacingPx = Number.isFinite(spacing) && spacing > 0 ? Math.max(spacing, sizePx) : 0.1 * fontSizePx;
  return { spacingPx, sizePx };
}
