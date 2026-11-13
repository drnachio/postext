/**
 * The finish mask of a page (#1564): where each special ink lies on it and
 * what it is, painted with the ordinary page painter through the paint
 * hook of `finishPaint.ts`. Folio lights metallic ink, foil, fluorescent
 * ink, opaque white and varnish from it; the canvas preview shows it
 * (`RenderPageOptions.finishes`).
 *
 * Channels, each scaled by the ink's tint:
 * - R metalness: a metallic ink or a foil;
 * - G sheen: gloss 1, satin .7, matte .4, soft-touch .2 — a metallic ink's
 *   or a foil's own, and a varnish's over everything;
 * - B fluorescence;
 * - A opaque white coverage.
 *
 * Three paints of the page, each on a canvas of its own:
 * 1. *inks*: a metallic, foil or fluorescent hex in its mask colour; any
 *    other paint black (it knocks the ink out, as on press), unless it
 *    overprints, when it is left out; pictures black over what they cover;
 *    a varnish left out.
 * 2. *white*: a white ink in white, the rest as in the first paint.
 * 3. *varnish*: a varnish in its sheen, nothing else.
 * The three are packed into one RGBA buffer on the CPU, the varnish's sheen
 * merged into the first paint's with `lighten` (the larger wins).
 */

import type { VDTDocument, VDTPage } from '../vdt.js';
import { authoredSpotColors, overprintColors } from '../color/authored.js';
import { finishInks, type FinishInk } from '../color/finishInks.js';
import { finishSheen, sheenLevel } from '../color/finishKinds.js';
import { printedSpot } from '../color/inks.js';
import type { ResolvedPrintInk } from '../types.js';
import { NO_PAINT, overridePaints, parsePaint, rgbaPaint, withScreenFinishesOff, type PaintValue } from './finishPaint.js';
import { setFinishImageHook } from './renderResourceBlock/images.js';
import { renderPageToCanvas } from './index.js';
import { restoreContext, saveContext } from './contextState.js';

/** The finish mask of a page: RGBA bytes, not premultiplied, `width` ×
 *  `height` pixels (the page canvas's size at the same scale). */
export interface FinishMask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** One of the three paints of a mask. */
export type FinishMaskPass = 'inks' | 'white' | 'varnish';

/** A canvas the mask paints on: a DOM canvas or an `OffscreenCanvas`. */
export interface FinishMaskCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): unknown;
}

export interface FinishMaskOptions {
  /** Bitmap pixels per page pixel, as `RenderPageOptions.scale`. Default 1. */
  scale?: number;
  /** The trimmed page only, as `RenderPageOptions.trim`. */
  trim?: boolean;
  /** Makes the canvases the mask is painted on. Default: an
   *  `OffscreenCanvas`, else a DOM canvas. */
  createCanvas?: (width: number, height: number) => FinishMaskCanvas;
  /**
   * The picture to paint for a registered image in one paint of the mask,
   * when the host has it: an SVG whose inks have a finish, recoloured with
   * `finishMaskSvg` for that paint. A picture the host gives none for is
   * painted black (it knocks the inks under it out) in the first two
   * paints and left out of the varnish's.
   */
  images?: (fileId: string, pass: FinishMaskPass) => CanvasImageSource | undefined;
}

type Painter = (canvas: FinishMaskCanvas) => void;

function defaultCanvas(width: number, height: number): FinishMaskCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height) as unknown as FinishMaskCanvas;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c as unknown as FinishMaskCanvas;
}

const overprintCache = new WeakMap<object, { printColors: unknown; hexes: ReadonlySet<string> }>();

/** The hexes that overprint: colours marked so, and spot colours whose ink
 *  overprints once the ink table has spoken. */
export function overprintHexes(doc: Pick<VDTDocument, 'config' | 'printColors'>): ReadonlySet<string> {
  const hit = overprintCache.get(doc.config);
  if (hit && hit.printColors === doc.printColors) return hit.hexes;
  const hexes = overprintColors([doc.config, doc.printColors]);
  const inks = (doc.config as { print?: { inks?: ResolvedPrintInk[] } }).print?.inks ?? [];
  for (const [hex, spot] of authoredSpotColors([doc.config, doc.printColors])) {
    if (printedSpot(spot, inks)?.overprint) hexes.add(hex);
  }
  overprintCache.set(doc.config, { printColors: doc.printColors, hexes });
  return hexes;
}

/** The colour a metallic, foil or fluorescent ink paints in the first
 *  paint, at its tint, as bytes. */
export function inkMaskColor(ink: FinishInk): [number, number, number] {
  const t = ink.tint / 100;
  const metal = ink.kind === 'metallic' || ink.kind === 'foil' ? 1 : 0;
  const sheen = metal ? sheenLevel(finishSheen(ink)) : 0;
  const fluo = ink.kind === 'fluorescent' ? 1 : 0;
  return [255 * metal * t, 255 * sheen * t, 255 * fluo * t];
}

/** The black the mask's own code knocks out with: it passes the paint
 *  hook as it is, whatever overprints. */
const KNOCK_OUT = 'rgba(0, 0, 0, 1)';

/** How each paint of the mask maps a colour. */
export function maskPaintMap(pass: FinishMaskPass, inks: ReadonlyMap<string, FinishInk>, overprint: ReadonlySet<string>): (value: PaintValue) => PaintValue {
  const black = (alpha: number) => rgbaPaint(0, 0, 0, alpha);
  return (value) => {
    if (value === KNOCK_OUT) return value;
    const p = parsePaint(value);
    // A gradient or a pattern: an ordinary paint that knocks out.
    if (!p) return pass === 'varnish' ? NO_PAINT : black(1);
    if (p.alpha === 0) return value;
    const ink = inks.get(p.hex);
    if (pass === 'varnish') {
      if (ink?.kind !== 'varnish') return NO_PAINT;
      return rgbaPaint(0, 255 * sheenLevel(finishSheen(ink)) * (ink.tint / 100), 0, p.alpha);
    }
    if (ink?.kind === 'varnish') return NO_PAINT;
    if (pass === 'white' && ink?.kind === 'white') {
      const v = 255 * (ink.tint / 100);
      return rgbaPaint(v, v, v, p.alpha);
    }
    if (pass === 'inks' && ink && ink.kind !== 'white') return rgbaPaint(...inkMaskColor(ink), p.alpha);
    return overprint.has(p.hex) ? NO_PAINT : black(p.alpha);
  };
}

/** The size `drawImage` takes a source at, with no size given. */
function sourceSize(image: CanvasImageSource): [number, number] {
  const s = image as { displayWidth?: number; displayHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: unknown; height?: unknown };
  if (typeof s.displayWidth === 'number') return [s.displayWidth, s.displayHeight ?? 0];
  if (typeof s.naturalWidth === 'number' && s.naturalWidth > 0) return [s.naturalWidth, s.naturalHeight ?? 0];
  return [typeof s.width === 'number' ? s.width : 0, typeof s.height === 'number' ? s.height : 0];
}

/** The longest side of the bitmap a picture's silhouette is cut in. */
const SILHOUETTE_MAX = 1024;

type Ctx2D = CanvasRenderingContext2D;

/**
 * Route `drawImage` of `ctx`: a picture the host recoloured for this paint
 * (`passThrough`) paints as it is; any other is painted as its silhouette
 * in black in the first two paints (what it covers, by its own alpha: a
 * photograph its box, a transparent drawing its shapes), and left out of
 * the varnish's.
 */
function overrideImages(ctx: Ctx2D, pass: FinishMaskPass, passThrough: WeakSet<object>, createCanvas: (w: number, h: number) => FinishMaskCanvas): () => void {
  const own = Object.getOwnPropertyDescriptor(ctx, 'drawImage');
  const draw = ctx.drawImage as (...args: unknown[]) => void;
  (ctx as unknown as { drawImage: unknown }).drawImage = function (...args: unknown[]): void {
    const image = args[0] as CanvasImageSource;
    if (passThrough.has(image as object)) {
      draw.apply(ctx, args);
      return;
    }
    if (pass === 'varnish') return;
    const [iw, ih] = sourceSize(image);
    const [sx, sy, sw, sh] = args.length >= 9 ? (args.slice(1, 5) as number[]) : [0, 0, iw, ih];
    const [dx, dy, dw, dh] = args.length >= 9 ? (args.slice(5, 9) as number[]) : args.length >= 5 ? (args.slice(1, 5) as number[]) : [args[1] as number, args[2] as number, iw, ih];
    const fit = Math.min(1, SILHOUETTE_MAX / Math.max(sw, sh, 1));
    const w = Math.max(1, Math.round(sw * fit));
    const h = Math.max(1, Math.round(sh * fit));
    try {
      const scratch = createCanvas(w, h);
      const s = scratch.getContext('2d') as Ctx2D | null;
      if (!s || sw <= 0 || sh <= 0) throw new Error('no scratch');
      s.drawImage(image, sx!, sy!, sw!, sh!, 0, 0, w, h);
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = '#000000';
      s.fillRect(0, 0, w, h);
      draw.call(ctx, scratch, 0, 0, w, h, dx, dy, dw, dh);
    } catch {
      // No canvas to cut the silhouette in: the picture's box.
      saveContext(ctx);
      ctx.fillStyle = KNOCK_OUT;
      ctx.fillRect(dx!, dy!, dw!, dh!);
      restoreContext(ctx);
    }
  };
  return () => {
    if (own) Object.defineProperty(ctx, 'drawImage', own);
    else delete (ctx as unknown as Record<string, unknown>).drawImage;
  };
}

/**
 * Paint the three paints of a mask with `paint` (the page painter on a
 * canvas it sizes) and pack them. `undefined` when nothing special landed.
 * The core of {@link renderFinishMask}, apart so a test can drive it with
 * a painter of its own.
 */
export function paintFinishMask(
  width: number,
  height: number,
  paint: Painter,
  inks: ReadonlyMap<string, FinishInk>,
  overprint: ReadonlySet<string>,
  options: Pick<FinishMaskOptions, 'createCanvas' | 'images'> = {},
): FinishMask | undefined {
  const createCanvas = options.createCanvas ?? defaultCanvas;
  const kinds = new Set([...inks.values()].map((i) => i.kind));
  const passes: FinishMaskPass[] = [];
  if (kinds.has('metallic') || kinds.has('foil') || kinds.has('fluorescent')) passes.push('inks');
  if (kinds.has('white')) passes.push('white');
  if (kinds.has('varnish')) passes.push('varnish');
  const layers = new Map<FinishMaskPass, Uint8ClampedArray>();
  for (const pass of passes) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d') as Ctx2D | null;
    if (!ctx) return undefined;
    const passThrough = new WeakSet<object>();
    const host = options.images;
    const previousHook = setFinishImageHook(host
      ? (fileId) => {
          const img = host(fileId, pass);
          if (img) passThrough.add(img as object);
          return img;
        }
      : null);
    const undoPaints = overridePaints(ctx, maskPaintMap(pass, inks, overprint));
    const undoImages = overrideImages(ctx, pass, passThrough, createCanvas);
    try {
      withScreenFinishesOff(() => paint(canvas));
    } finally {
      undoImages();
      undoPaints();
      setFinishImageHook(previousHook);
    }
    if (canvas.width !== width || canvas.height !== height) return undefined;
    try {
      layers.set(pass, ctx.getImageData(0, 0, width, height).data);
    } catch {
      // A canvas that cannot be read back has no mask to give.
      return undefined;
    }
  }
  return packFinishMask(width, height, layers);
}

/** Pack the paints into one RGBA buffer; `undefined` when every channel
 *  is empty. */
export function packFinishMask(width: number, height: number, layers: ReadonlyMap<FinishMaskPass, Uint8ClampedArray>): FinishMask | undefined {
  const inks = layers.get('inks');
  const white = layers.get('white');
  const varnish = layers.get('varnish');
  const data = new Uint8ClampedArray(width * height * 4);
  let any = false;
  for (let i = 0; i < data.length; i += 4) {
    const r = inks ? inks[i]! : 0;
    const b = inks ? inks[i + 2]! : 0;
    // The varnish paint starts transparent: its sheen counts as far as it
    // covers the pixel.
    const v = varnish ? Math.round((varnish[i + 1]! * varnish[i + 3]!) / 255) : 0;
    const g = Math.max(inks ? inks[i + 1]! : 0, v);
    const a = white ? white[i]! : 0;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
    if (r | g | b | a) any = true;
  }
  return any ? { width, height, data } : undefined;
}

/** Whether the page paints any of `inks` somewhere, or places a picture
 *  the host recolours for the mask: a walk over its colours, far cheaper
 *  than a paint. */
export function pagePaintsFinish(page: VDTPage, inks: ReadonlyMap<string, FinishInk>, background: string | undefined, hostImage?: (fileId: string) => boolean): boolean {
  const isInk = (s: string) => s.length >= 7 && s[0] === '#' && inks.has(s.slice(0, 7).toLowerCase());
  if (background && isInk(background)) return true;
  const seen = new Set<object>();
  const stack: unknown[] = [page];
  while (stack.length > 0) {
    const v = stack.pop();
    if (!v || typeof v !== 'object' || seen.has(v)) continue;
    seen.add(v);
    if (ArrayBuffer.isView(v)) continue;
    for (const [key, child] of Object.entries(v)) {
      if (typeof child === 'string') {
        if (isInk(child) || (hostImage && key === 'fileId' && hostImage(child))) return true;
      } else if (child && typeof child === 'object') stack.push(child);
    }
  }
  return false;
}

/**
 * The finish mask of `page` (see the module comment), at `options.scale`
 * bitmap pixels per page pixel like the page's own canvas, or `undefined`
 * when the page paints no special ink: a document without special inks
 * costs one map lookup, a page without them a walk over its colours.
 */
export function renderFinishMask(page: VDTPage, doc: VDTDocument, options: FinishMaskOptions = {}): FinishMask | undefined {
  const inks = finishInks(doc);
  if (inks.size === 0) return undefined;
  const host = options.images;
  const hostImage = host ? (fileId: string) => !!(host(fileId, 'inks') ?? host(fileId, 'white') ?? host(fileId, 'varnish')) : undefined;
  const paper = page.background ?? doc.config.page.backgroundColor.hex;
  if (!pagePaintsFinish(page, inks, paper, hostImage)) return undefined;
  const scale = options.scale && options.scale > 0 ? options.scale : 1;
  const inset = options.trim ? Math.max(0, doc.trimOffset) : 0;
  const width = Math.max(1, Math.round((page.width - 2 * inset) * scale));
  const height = Math.max(1, Math.round((page.height - 2 * inset) * scale));
  const paint: Painter = (canvas) => renderPageToCanvas(page, doc, canvas as unknown as HTMLCanvasElement, { scale, ...(options.trim ? { trim: true } : {}) });
  return paintFinishMask(width, height, paint, inks, overprintHexes(doc), options);
}
