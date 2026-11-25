// The selection and caret on dark grounds (#1712).
//
// The overlay lies over its page with a darkening blend (multiply): a
// highlight tints the paper and leaves the text crisp. A darkening blend
// shows nothing on a dark ground, so each mark that lies on one is painted
// a second time in a sibling layer with a lightening blend (screen).
//
// The ground is read from the page as painted: a small luminance grid per
// page canvas, built from an `ImageBitmap` of it (never `getImageData` on
// the page canvas itself, which would cost it its GPU acceleration) and
// kept until the page is painted again. A page of elements (the HTML
// preview) is asked for the background under each mark.

import { SVG_NS } from './dom.js';

/** Grid cells across a page. */
const GRID_WIDTH = 192;
/** A ground under this luminance (0–1, gamma-encoded) is dark: a
 *  darkening highlight does not show on it. */
export const DARK_GROUND = 0.25;

export interface LuminanceGrid {
  width: number;
  height: number;
  /** One byte per cell, 0 (black) – 255 (white). */
  lum: Uint8Array;
}

interface Held {
  grid: LuminanceGrid | null;
  /** The page was painted since the grid was read. */
  stale: boolean;
  building: boolean;
}

const held = new WeakMap<HTMLCanvasElement, Held>();

/** The luminance of RGBA pixels over white paper, one byte per pixel. */
export function luminanceOf(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array(rgba.length >> 2);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o++) {
    const a = rgba[i + 3]! / 255;
    const l = 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    out[o] = Math.round(l * a + 255 * (1 - a));
  }
  return out;
}

/**
 * The luminance (0–1) of the ground of a region of the grid, in fractions
 * of the page (`x0`…`y1` in 0–1): the median of its cells, so the ink of
 * the text set on it (under half of any cell row) does not count.
 */
export function groundLuminance(grid: LuminanceGrid, x0: number, y0: number, x1: number, y1: number): number {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const cx0 = clamp(Math.floor(x0 * grid.width), grid.width - 1);
  const cy0 = clamp(Math.floor(y0 * grid.height), grid.height - 1);
  const cx1 = clamp(Math.ceil(x1 * grid.width), grid.width);
  const cy1 = clamp(Math.ceil(y1 * grid.height), grid.height);
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let y = cy0; y < Math.max(cy1, cy0 + 1); y++) {
    for (let x = cx0; x < Math.max(cx1, cx0 + 1); x++) {
      histogram[grid.lum[y * grid.width + x]!]!++;
      count++;
    }
  }
  let seen = 0;
  for (let l = 0; l < 256; l++) {
    seen += histogram[l]!;
    if (seen * 2 >= count) return l / 255;
  }
  return 1;
}

let scratch: HTMLCanvasElement | null = null;

async function readGrid(canvas: HTMLCanvasElement): Promise<LuminanceGrid | null> {
  if (typeof createImageBitmap !== 'function' || canvas.width <= 1 || canvas.height <= 1) return null;
  const width = Math.min(GRID_WIDTH, canvas.width);
  const height = Math.max(1, Math.round((width * canvas.height) / canvas.width));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(canvas, { resizeWidth: width, resizeHeight: height, resizeQuality: 'medium' });
  } catch {
    return null;
  }
  try {
    scratch ??= document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);
    return { width, height, lum: luminanceOf(ctx.getImageData(0, 0, width, height).data) };
  } catch {
    // A page with a picture of another origin cannot be read.
    return null;
  } finally {
    bitmap.close();
  }
}

/** The marks of an overlay: its selection rects and its caret, when shown. */
function marksOf(svg: SVGSVGElement): { selection: SVGGElement | null; cursor: SVGGElement | null; rects: SVGRectElement[]; caret: SVGRectElement | null } {
  const selection = svg.querySelector<SVGGElement>(':scope > g[data-role="selection"]');
  const cursor = svg.querySelector<SVGGElement>(':scope > g[data-role="cursor"]');
  const rects = selection ? [...selection.querySelectorAll<SVGRectElement>('rect')] : [];
  const rect = cursor?.firstElementChild as SVGRectElement | null | undefined;
  const caret = rect && rect.style.display !== 'none' && rect.style.visibility !== 'hidden' ? rect : null;
  return { selection, cursor, rects, caret };
}

/** The layer of lightening copies beside an overlay. */
export function lightLayerOf(svg: SVGSVGElement): SVGSVGElement | null {
  // Read by its name: an overlay may be drawn where there is no page.
  const next = svg.nextElementSibling as (Element & { dataset?: DOMStringMap }) | null | undefined;
  return next && next.tagName?.toLowerCase() === 'svg' && next.dataset?.role === 'overlay-light' ? (next as SVGSVGElement) : null;
}

function ensureLightLayer(svg: SVGSVGElement): SVGSVGElement {
  let layer = lightLayerOf(svg);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, 'svg');
    layer.dataset.role = 'overlay-light';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('preserveAspectRatio', 'none');
    layer.style.position = 'absolute';
    layer.style.pointerEvents = 'none';
    layer.style.mixBlendMode = 'screen';
    svg.after(layer);
  }
  layer.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '');
  layer.style.top = svg.style.top;
  layer.style.left = svg.style.left;
  layer.style.width = svg.style.width;
  layer.style.height = svg.style.height;
  return layer;
}

/** The copies' size follows the overlay's (a zoom resizes both). */
export function resizeLightLayer(svg: SVGSVGElement): void {
  const layer = lightLayerOf(svg);
  if (!layer) return;
  layer.style.width = svg.style.width;
  layer.style.height = svg.style.height;
}

export function clearLightLayer(svg: SVGSVGElement): void {
  const layer = lightLayerOf(svg);
  if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild);
}

const TRANSPARENT = /^(transparent|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\))$/;

/** The luminance of the background under a point of a page of elements. */
function elementGround(x: number, y: number): number | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || TRANSPARENT.test(bg)) continue;
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(bg);
    if (!m) continue;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const l = (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
    return l * a + (1 - a);
  }
  return null;
}

/**
 * Paints again, lightening, the marks of `svg` that lie on a dark ground.
 * Called after the overlay is drawn and after its page is painted; a no-op
 * for an overlay that is not on a page (Folio draws its own, on the print).
 */
export function syncBackdropMarks(svg: SVGSVGElement): void {
  const slot = svg.parentElement;
  if (!slot) return;
  const { selection, cursor, rects, caret } = marksOf(svg);
  if (rects.length === 0 && !caret) {
    clearLightLayer(svg);
    return;
  }
  const canvas = slot.querySelector<HTMLCanvasElement>(':scope > canvas');
  let grid: LuminanceGrid | null = null;
  if (canvas) {
    let entry = held.get(canvas);
    if (!entry) {
      entry = { grid: null, stale: true, building: false };
      held.set(canvas, entry);
    }
    if (entry.stale && !entry.building) {
      const mine = entry;
      mine.building = true;
      mine.stale = false;
      void readGrid(canvas).then((next) => {
        mine.building = false;
        mine.grid = next;
        // Painted again meanwhile: read once more, with what is there now.
        if (svg.isConnected) syncBackdropMarks(svg);
      });
    }
    // Until the page is read again, the ground it had stands.
    grid = entry.grid;
    if (!grid) {
      clearLightLayer(svg);
      return;
    }
  }
  const page = (canvas ?? svg).getBoundingClientRect();
  if (!(page.width > 0) || !(page.height > 0)) return;
  const isDark = (mark: SVGRectElement): boolean => {
    const r = mark.getBoundingClientRect();
    if (grid) {
      // A caret is thinner than a cell: its neighbourhood is read.
      const pad = Math.max(0, (page.width / grid.width) * 1.5 - r.width / 2);
      const l = groundLuminance(grid, (r.left - pad - page.left) / page.width, (r.top - page.top) / page.height, (r.right + pad - page.left) / page.width, (r.bottom - page.top) / page.height);
      return l < DARK_GROUND;
    }
    const l = elementGround(r.left + r.width / 2, r.top + r.height / 2);
    return l !== null && l < DARK_GROUND;
  };
  const darkRects = rects.filter(isDark);
  const darkCaret = caret && isDark(caret) ? caret : null;
  if (darkRects.length === 0 && !darkCaret) {
    clearLightLayer(svg);
    return;
  }
  const layer = ensureLightLayer(svg);
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  const copyGroup = (from: SVGGElement | null): SVGGElement => {
    const g = document.createElementNS(SVG_NS, 'g');
    const transform = from?.getAttribute('transform');
    if (transform) g.setAttribute('transform', transform);
    layer.appendChild(g);
    return g;
  };
  if (darkRects.length) {
    const g = copyGroup(selection);
    for (const r of darkRects) g.appendChild(r.cloneNode(false));
  }
  if (darkCaret) {
    const g = copyGroup(cursor);
    g.setAttribute('class', 'cursor-blink');
    g.appendChild(darkCaret.cloneNode(false));
    // Blinking with the caret it copies.
    const theirs = cursor?.getAnimations?.()[0];
    const mine = g.getAnimations?.()[0];
    if (theirs && mine) mine.currentTime = theirs.currentTime;
  }
}

/** A page canvas was painted: its ground is read again, and the marks
 *  over it follow. */
export function backdropPainted(canvas: HTMLCanvasElement): void {
  const entry = held.get(canvas);
  if (entry) entry.stale = true;
  const overlay = canvas.parentElement?.querySelector<SVGSVGElement>(':scope > svg:not([data-role="overlay-light"])');
  if (!overlay) return;
  const { rects, caret } = marksOf(overlay);
  if (rects.length || caret) syncBackdropMarks(overlay);
}

/**
 * Whether the ground of a region of a canvas being drawn on is dark: the
 * region is `x, y, w, h` in the context's own units, through `matrix`
 * when the mark has one. For a canvas that is read anyway (Folio's page
 * textures); the canvas preview's pages go through the grid above.
 */
export function canvasGroundIsDark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, matrix?: readonly number[] | null): boolean {
  try {
    let m = ctx.getTransform();
    if (matrix) m = m.multiply(new DOMMatrix([matrix[0]!, matrix[1]!, matrix[2]!, matrix[3]!, matrix[4]!, matrix[5]!]));
    const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => m.transformPoint({ x: px!, y: py! }));
    const left = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.x))));
    const top = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.y))));
    const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...corners.map((c) => c.x))));
    const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...corners.map((c) => c.y))));
    // A caret's neighbourhood, as above.
    const pad = right - left < 8 ? 4 : 0;
    const sx = Math.max(0, left - pad);
    const sw = Math.min(ctx.canvas.width, right + pad) - sx;
    const sh = bottom - top;
    if (sw <= 0 || sh <= 0) return false;
    const lum = luminanceOf(ctx.getImageData(sx, top, sw, sh).data);
    return groundLuminance({ width: sw, height: sh, lum }, 0, 0, 1, 1) < DARK_GROUND;
  } catch {
    return false;
  }
}
