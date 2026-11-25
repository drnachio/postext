// The selection and caret on grounds where their tint does not show
// (#1712, #1716).
//
// The overlay lies over its page with a darkening blend (multiply): a
// highlight tints the paper and leaves the text crisp. A darkening blend
// shows nothing on a dark ground, so each mark that lies on one is painted
// a second time in a sibling layer with a lightening blend (screen). And a
// tint changes next to nothing on a ground of its own hue (a yellow
// highlight on an orange box): there the mark is painted once more as a
// neutral shade, which darkens ground and text alike.
//
// The ground is read from the page as painted: a small colour grid per
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
/** A tint that moves the ground less than this far (the distance between
 *  the two colours, each channel 0–1) cannot be told from it. */
export const FAINT_TINT = 0.12;
/** The shade painted, darkening, where the tint does not show. */
export const SHADE_FILL = '#00000047';

/** A colour, each channel 0–1. */
export type Rgb = [number, number, number];

export interface ColourGrid {
  width: number;
  height: number;
  /** Three bytes per cell (red, green, blue), over white paper. */
  rgb: Uint8Array;
}

/** What is painted besides the mark itself: a lightening copy on a dark
 *  ground, a shade where the mark's tint does not show, or nothing. */
export type MarkTreatment = 'none' | 'screen' | 'shade';

export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** A `#rgb`, `#rrggbb` or `#rrggbbaa` fill as a colour and its alpha. */
export function parseFill(fill: string): { rgb: Rgb; alpha: number } | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(fill.trim());
  if (!m) return null;
  let hex = m[1]!;
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join('');
  if (hex.length !== 6 && hex.length !== 8) return null;
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  return { rgb: [n(0), n(2), n(4)], alpha: hex.length === 8 ? n(6) : 1 };
}

/**
 * What a mark filled with `fill` needs on a ground of colour `ground`:
 * a lightening copy when the ground is dark, a shade when the mark's own
 * tint (multiplied into the ground, as the overlay paints it) leaves the
 * ground where it was.
 */
export function markTreatment(ground: Rgb, fill: string): MarkTreatment {
  if (luminance(ground) < DARK_GROUND) return 'screen';
  const tint = parseFill(fill);
  if (!tint) return 'none';
  let moved = 0;
  for (let i = 0; i < 3; i++) {
    const d = ground[i]! * tint.alpha * (1 - tint.rgb[i]!);
    moved += d * d;
  }
  return Math.sqrt(moved) < FAINT_TINT ? 'shade' : 'none';
}

interface Held {
  grid: ColourGrid | null;
  /** The page was painted since the grid was read. */
  stale: boolean;
  building: boolean;
}

const held = new WeakMap<HTMLCanvasElement, Held>();

/** RGBA pixels over white paper, three bytes per pixel. */
export function overPaper(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const out = new Uint8Array((rgba.length >> 2) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    const a = rgba[i + 3]! / 255;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(rgba[i + c]! * a + 255 * (1 - a));
  }
  return out;
}

/**
 * The colour of the ground of a region of the grid, in fractions of the
 * page (`x0`…`y1` in 0–1): the median of its cells, channel by channel, so
 * the ink of the text set on it (under half of any cell row) does not
 * count.
 */
export function groundColour(grid: ColourGrid, x0: number, y0: number, x1: number, y1: number): Rgb {
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
  const cx0 = clamp(Math.floor(x0 * grid.width), grid.width - 1);
  const cy0 = clamp(Math.floor(y0 * grid.height), grid.height - 1);
  const cx1 = Math.max(clamp(Math.ceil(x1 * grid.width), grid.width), cx0 + 1);
  const cy1 = Math.max(clamp(Math.ceil(y1 * grid.height), grid.height), cy0 + 1);
  const count = (cx1 - cx0) * (cy1 - cy0);
  const out: Rgb = [1, 1, 1];
  const histogram = new Uint32Array(256);
  for (let c = 0; c < 3; c++) {
    histogram.fill(0);
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) histogram[grid.rgb[(y * grid.width + x) * 3 + c]!]!++;
    let seen = 0;
    for (let l = 0; l < 256; l++) {
      seen += histogram[l]!;
      if (seen * 2 >= count) {
        out[c] = l / 255;
        break;
      }
    }
  }
  return out;
}

let scratch: HTMLCanvasElement | null = null;

async function readGrid(canvas: HTMLCanvasElement): Promise<ColourGrid | null> {
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
    return { width, height, rgb: overPaper(ctx.getImageData(0, 0, width, height).data) };
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

type LayerRole = 'overlay-light' | 'overlay-shade';
const LAYER_BLEND: Record<LayerRole, string> = { 'overlay-light': 'screen', 'overlay-shade': 'multiply' };

/** A layer of copies beside an overlay: the lightening one, then the shade. */
function layerOf(svg: SVGSVGElement, role: LayerRole): SVGSVGElement | null {
  // Read by its name: an overlay may be drawn where there is no page.
  let next = svg.nextElementSibling as (Element & { dataset?: DOMStringMap }) | null | undefined;
  for (let i = 0; i < 2 && next; i++) {
    if (next.tagName?.toLowerCase() !== 'svg' || !next.dataset?.role?.startsWith('overlay-')) return null;
    if (next.dataset.role === role) return next as SVGSVGElement;
    next = next.nextElementSibling;
  }
  return null;
}

/** The layer of lightening copies beside an overlay. */
export function lightLayerOf(svg: SVGSVGElement): SVGSVGElement | null {
  return layerOf(svg, 'overlay-light');
}

/** The layer of shades beside an overlay. */
export function shadeLayerOf(svg: SVGSVGElement): SVGSVGElement | null {
  return layerOf(svg, 'overlay-shade');
}

function ensureLayer(svg: SVGSVGElement, role: LayerRole): SVGSVGElement {
  let layer = layerOf(svg, role);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, 'svg');
    layer.dataset.role = role;
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('preserveAspectRatio', 'none');
    layer.style.position = 'absolute';
    layer.style.pointerEvents = 'none';
    layer.style.mixBlendMode = LAYER_BLEND[role];
    svg.after(layer);
  }
  layer.setAttribute('viewBox', svg.getAttribute('viewBox') ?? '');
  layer.style.top = svg.style.top;
  layer.style.left = svg.style.left;
  layer.style.width = svg.style.width;
  layer.style.height = svg.style.height;
  while (layer.firstChild) layer.removeChild(layer.firstChild);
  return layer;
}

/** The copies' size follows the overlay's (a zoom resizes both). */
export function resizeLightLayer(svg: SVGSVGElement): void {
  for (const role of ['overlay-light', 'overlay-shade'] as const) {
    const layer = layerOf(svg, role);
    if (!layer) continue;
    layer.style.width = svg.style.width;
    layer.style.height = svg.style.height;
  }
}

function clearLayer(svg: SVGSVGElement, role: LayerRole): void {
  const layer = layerOf(svg, role);
  if (layer) while (layer.firstChild) layer.removeChild(layer.firstChild);
}

export function clearLightLayer(svg: SVGSVGElement): void {
  clearLayer(svg, 'overlay-light');
  clearLayer(svg, 'overlay-shade');
}

const TRANSPARENT = /^(transparent|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\))$/;

/** The background under a point of a page of elements. */
function elementGround(x: number, y: number): Rgb | null {
  if (typeof document.elementsFromPoint !== 'function') return null;
  for (const el of document.elementsFromPoint(x, y)) {
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg || TRANSPARENT.test(bg)) continue;
    const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/.exec(bg);
    if (!m) continue;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const over = (v: string) => (Number(v) / 255) * a + (1 - a);
    return [over(m[1]!), over(m[2]!), over(m[3]!)];
  }
  return null;
}

/**
 * Paints again the marks of `svg` whose tint does not show on their
 * ground: lightening on a dark one, as a shade on one of the tint's hue.
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
  let grid: ColourGrid | null = null;
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
  const treatmentOf = (mark: SVGRectElement): MarkTreatment => {
    const r = mark.getBoundingClientRect();
    let ground: Rgb | null;
    if (grid) {
      // A caret is thinner than a cell: its neighbourhood is read.
      const pad = Math.max(0, (page.width / grid.width) * 1.5 - r.width / 2);
      ground = groundColour(grid, (r.left - pad - page.left) / page.width, (r.top - page.top) / page.height, (r.right + pad - page.left) / page.width, (r.bottom - page.top) / page.height);
    } else {
      ground = elementGround(r.left + r.width / 2, r.top + r.height / 2);
    }
    return ground ? markTreatment(ground, mark.getAttribute('fill') ?? '') : 'none';
  };
  const treated = rects.map(treatmentOf);
  const caretTreatment = caret ? treatmentOf(caret) : 'none';
  for (const [role, treatment] of [['overlay-light', 'screen'], ['overlay-shade', 'shade']] as const) {
    const marks = rects.filter((_, i) => treated[i] === treatment);
    const ownCaret = caret && caretTreatment === treatment ? caret : null;
    if (marks.length === 0 && !ownCaret) {
      clearLayer(svg, role);
      continue;
    }
    const layer = ensureLayer(svg, role);
    const copy = (from: SVGGElement | null, mark: SVGRectElement): SVGGElement => {
      const g = document.createElementNS(SVG_NS, 'g');
      const transform = from?.getAttribute('transform');
      if (transform) g.setAttribute('transform', transform);
      layer.appendChild(g);
      const rect = mark.cloneNode(false) as SVGRectElement;
      if (treatment === 'shade') rect.setAttribute('fill', SHADE_FILL);
      g.appendChild(rect);
      return g;
    };
    for (const r of marks) copy(selection, r);
    if (ownCaret) {
      const g = copy(cursor, ownCaret);
      g.setAttribute('class', 'cursor-blink');
      // Blinking with the caret it copies.
      const theirs = cursor?.getAnimations?.()[0];
      const mine = g.getAnimations?.()[0];
      if (theirs && mine) mine.currentTime = theirs.currentTime;
    }
  }
}

/** A page canvas was painted: its ground is read again, and the marks
 *  over it follow. */
export function backdropPainted(canvas: HTMLCanvasElement): void {
  const entry = held.get(canvas);
  if (entry) entry.stale = true;
  const overlay = canvas.parentElement?.querySelector<SVGSVGElement>(':scope > svg:not([data-role^="overlay-"])');
  if (!overlay) return;
  const { rects, caret } = marksOf(overlay);
  if (rects.length || caret) syncBackdropMarks(overlay);
}

/**
 * What a mark filled with `fill` needs on a region of a canvas being drawn
 * on: the region is `x, y, w, h` in the context's own units, through
 * `matrix` when the mark has one. For a canvas that is read anyway
 * (Folio's page textures); the canvas preview's pages go through the grid
 * above.
 */
export function canvasMarkTreatment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, matrix?: readonly number[] | null): MarkTreatment {
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
    if (sw <= 0 || sh <= 0) return 'none';
    const rgb = overPaper(ctx.getImageData(sx, top, sw, sh).data);
    return markTreatment(groundColour({ width: sw, height: sh, rgb }, 0, 0, 1, 1), fill);
  } catch {
    return 'none';
  }
}
