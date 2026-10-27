// Resource images: the host-filled registry of decoded images, the
// missing-image sink, the vector raster cache and drawing an image with its ink.
import { isSingleInkSvgUrl, applySingleInkToPixels } from '../../svg/singleInk.js';
import { rasterScaleOf } from '../deviceScale.js';

/** A decoded image the canvas backend can `drawImage`. */
export type ResourceImageSource = CanvasImageSource;

export interface RegisterResourceImageOptions {
  /** The source is vector art (an SVG `<img>`): every `drawImage` of it
   *  re-rasterises the document, so the backend rasterises it once at each
   *  size it shows at in device pixels and blits the bitmap thereafter (see
   *  {@link drawResourceImage}). Defaults to true for an `HTMLImageElement`
   *  — the host decodes rasters through `createImageBitmap`. */
  vector?: boolean;
  /** Whether `diagramStyle.singleInk` recolours this picture on canvas:
   *  `true` tints the pixels of this SVG picture — a figure, a cell image,
   *  a design image or box icon whose resource is an SVG — to the
   *  document's ink (the mapping `applySingleInkToSvg` applies to markup),
   *  never a bitmap; `false` paints it as given, for a picture recoloured
   *  with `applySingleInkToSvg` before it was decoded (`registerBundleImages`
   *  and the Sandbox do). Unset, the render decides
   *  (`RenderPageOptions.singleInk`, off by default in postext 1.x, where
   *  hosts recolour the markup themselves). An `<img>` whose `src` is an
   *  SVG data URI marked by `applySingleInkToSvg` (`SINGLE_INK_MARK`) is
   *  never tinted, whatever this says. (A design image of a VDT built
   *  before design images carried `imageKind` is tinted when it is a vector
   *  source or registered with `true`.) */
  singleInk?: boolean;
}

interface RegistryEntry {
  image: ResourceImageSource;
  vector: boolean;
  singleInk?: boolean;
}

/** Module-level registry of decoded images, keyed by `fileId`. The sandbox
 *  decodes blobs (createImageBitmap for bitmaps; an `<img>`/offscreen canvas
 *  for SVGs) once and registers them here before rendering a page. */
const imageRegistry = new Map<string, RegistryEntry>();

function isImageElement(image: ResourceImageSource): boolean {
  return typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement;
}

/** Whether a decoded image shows markup `applySingleInkToSvg` recoloured:
 *  an `<img>` (anything with a `src`) loaded from an SVG data URI that
 *  carries the mark. A blob URL or a bitmap cannot tell. */
function isSingleInkImage(image: ResourceImageSource): boolean {
  const src = (image as { src?: unknown }).src;
  return typeof src === 'string' && isSingleInkSvgUrl(src);
}

/** Register (or replace) a decoded image for a `fileId`. */
export function registerResourceImage(
  fileId: string,
  image: ResourceImageSource,
  options?: RegisterResourceImageOptions,
): void {
  // Recoloured already (a marked data URI): never tinted again, whatever
  // the flag says.
  const singleInk = isSingleInkImage(image) ? false : options?.singleInk;
  imageRegistry.set(fileId, {
    image,
    vector: options?.vector ?? isImageElement(image),
    ...(singleInk !== undefined ? { singleInk } : {}),
  });
  dropRasters(fileId);
}

/** Remove a cached image (e.g. when its resource is deleted). */
export function unregisterResourceImage(fileId: string): void {
  imageRegistry.delete(fileId);
  dropRasters(fileId);
}

/** Clear the entire image registry. */
export function clearResourceImages(): void {
  imageRegistry.clear();
  rasterCache.clear();
  rasterBytes = 0;
}

/** Look up a decoded image. Exposed so the host can check what still needs
 *  decoding before a render. */
export function getResourceImage(fileId: string): ResourceImageSource | undefined {
  return imageRegistry.get(fileId)?.image;
}

/** Told of every image a render paints as a placeholder (nothing
 *  registered for its `fileId`). Set by `renderPageToCanvas` for the span of
 *  one synchronous page paint when the host asked for warnings. */
export type MissingImageSink = (fileId: string, resourceId?: string) => void;
let missingImageSink: MissingImageSink | null = null;

/** Install the sink for the paint in progress; returns the one it replaces,
 *  for the caller to restore. */
export function setMissingImageSink(sink: MissingImageSink | null): MissingImageSink | null {
  const previous = missingImageSink;
  missingImageSink = sink;
  return previous;
}

/** Whether the paint in progress tints the SVG pictures registered without
 *  a `singleInk` flag (`RenderPageOptions.singleInk`). Set by
 *  `renderPageToCanvas` for the span of one synchronous page paint. */
let tintUnflagged = false;

/** Set {@link tintUnflagged} for the paint in progress; returns the value it
 *  replaces, for the caller to restore. */
export function setTintUnflagged(on: boolean): boolean {
  const previous = tintUnflagged;
  tintUnflagged = on;
  return previous;
}

// ---------------------------------------------------------------------------
// Vector raster cache
//
// Drawing an SVG `<img>` onto a canvas rasterises the whole SVG document on
// every call — text set in embedded fonts, embedded raster fills, filters —
// at print resolution that is tens to hundreds of milliseconds per figure,
// paid again on every repaint of the page (a rebuild, a view-mode switch).
// The first draw at a size rasterises into an offscreen bitmap, keyed by
// fileId and size, and later draws blit that bitmap. The cache is bounded
// by bytes, least recently used first, and a fileId's entries are dropped
// when its image is (re)registered.
//
// The size is the one the figure shows at in device pixels (#674): the
// placed box in page pixels on a page painted at its own resolution or
// below it (every reduction of a page then shares one bitmap), and the box
// times the context's scale on a page painted larger (`scale` above 1: a
// small trim shown wide, a high-density canvas, page images above the
// page's dpi), where a bitmap of the page pixels would be upsampled and
// the figure would come out soft beside its caption.
// ---------------------------------------------------------------------------

type RasterCanvas = OffscreenCanvas | HTMLCanvasElement;

interface RasterEntry {
  fileId: string;
  canvas: RasterCanvas;
  bytes: number;
}

/** Insertion order doubles as recency: a hit is re-inserted at the end. */
const rasterCache = new Map<string, RasterEntry>();
let rasterBytes = 0;
/** ~256 MB of RGBA bitmaps: a few dozen full-width figures at 300 dpi. */
const RASTER_CACHE_MAX_BYTES = 256 * 1024 * 1024;
/** Above this many device pixels on a side the draw stays direct — a bitmap
 *  that large would evict everything else for one figure. */
const RASTER_MAX_SIDE = 8192;
/** The most a bitmap larger than the figure's page pixels may take: a
 *  quarter of the cache (a 4096 px square), so a deep zoom into a large
 *  figure does not allocate hundreds of megabytes for it. */
const RASTER_SCALED_MAX_BYTES = RASTER_CACHE_MAX_BYTES / 4;

function dropRasters(fileId: string): void {
  for (const [key, entry] of rasterCache) {
    if (entry.fileId !== fileId) continue;
    rasterCache.delete(key);
    rasterBytes -= entry.bytes;
  }
}

function createRasterCanvas(w: number, h: number): RasterCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return null;
}

function evictRastersTo(budget: number): void {
  for (const [key, entry] of rasterCache) {
    if (rasterBytes <= budget) return;
    rasterCache.delete(key);
    rasterBytes -= entry.bytes;
  }
}

/** The bitmap of `image` at `w`×`h` device pixels, rasterised on the first
 *  request — its pixels tinted to `inkHex` when set (single-ink diagrams);
 *  null when no offscreen canvas can be made, the size is out of range or
 *  the pixels cannot be read back (a tainted cross-origin image), in which
 *  case the caller draws the source directly. */
function getVectorRaster(fileId: string, image: ResourceImageSource, w: number, h: number, inkHex: string | null = null, tintHex: string | null = null): RasterCanvas | null {
  if (w <= 0 || h <= 0 || w > RASTER_MAX_SIDE || h > RASTER_MAX_SIDE) return null;
  const key = tintHex ? `${fileId}|${w}x${h}|tint:${tintHex}` : inkHex ? `${fileId}|${w}x${h}|${inkHex}` : `${fileId}|${w}x${h}`;
  const hit = rasterCache.get(key);
  if (hit) {
    rasterCache.delete(key);
    rasterCache.set(key, hit);
    return hit.canvas;
  }
  const bytes = w * h * 4;
  if (bytes > RASTER_CACHE_MAX_BYTES) return null;
  const canvas = createRasterCanvas(w, h);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) return null;
  try {
    ctx.drawImage(image, 0, 0, w, h);
    if (tintHex) {
      // The silhouette in one colour (#995): the colour fills what the
      // picture covers, in proportion to its opacity. No pixels are read,
      // so a picture the canvas will not hand back still takes it.
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = tintHex;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    } else if (inkHex) {
      const pixels = ctx.getImageData(0, 0, w, h);
      if (!applySingleInkToPixels(pixels.data, inkHex)) return null;
      ctx.putImageData(pixels, 0, 0);
    }
  } catch {
    return null;
  }
  evictRastersTo(RASTER_CACHE_MAX_BYTES - bytes);
  rasterCache.set(key, { fileId, canvas, bytes });
  rasterBytes += bytes;
  return canvas;
}

/** Bytes of vector bitmaps currently cached (diagnostics / tests). */
export function resourceRasterCacheBytes(): number {
  return rasterBytes;
}

/**
 * The bitmap size of a vector picture placed `w`×`h` page pixels on `ctx`:
 * the box in device pixels under the context's transform, never smaller
 * than the box in page pixels ({@link rasterScaleOf}). A bitmap above the
 * page size that would pass the bound ({@link RASTER_MAX_SIDE},
 * {@link RASTER_SCALED_MAX_BYTES}) is not made: null, and the caller draws
 * the source, which the canvas rasterises at the device size on its own. A
 * picture that needs its pixels (`pixels`: the single-ink tint) takes the
 * largest bitmap the bound allows instead.
 */
function vectorRasterSize(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pixels: boolean,
): [number, number] | null {
  const pw = Math.round(w);
  const ph = Math.round(h);
  const s = rasterScaleOf(ctx);
  if (s.x === 1 && s.y === 1) return [pw, ph];
  const dw = Math.round(w * s.x);
  const dh = Math.round(h * s.y);
  const fit = Math.min(
    1,
    RASTER_MAX_SIDE / Math.max(dw, dh, 1),
    Math.sqrt(RASTER_SCALED_MAX_BYTES / (Math.max(dw, 1) * Math.max(dh, 1) * 4)),
  );
  if (fit >= 1) return [dw, dh];
  if (!pixels) return null;
  return [Math.max(pw, Math.floor(dw * fit)), Math.max(ph, Math.floor(dh * fit))];
}

/** How a picture is painted under `diagramStyle.singleInk`: the document's
 *  ink (null when single ink is off), and whether the picture is an SVG
 *  (`true`), a bitmap (`false`) or unknown — a design image of a VDT built
 *  before design images carried `imageKind` (`undefined`: the registry
 *  decides). */
export interface ImageInk {
  inkHex: string | null;
  svg?: boolean;
  /** Paint the picture's silhouette in this colour (`VDTDesignImageBlock.tint`,
   *  #995), whatever the picture and the document's ink. */
  tint?: string;
}

/** Whether a registered picture takes the ink: never a bitmap, never one
 *  its host recoloured (`singleInk: false`), one registered without a flag
 *  only when the render asks ({@link tintUnflagged}); then an SVG always,
 *  one of unknown kind when it is a vector source or registered with
 *  `singleInk: true`. */
function takesInk(entry: RegistryEntry, ink: ImageInk | undefined): ink is { inkHex: string; svg?: boolean } {
  if (!ink?.inkHex || ink.svg === false || !(entry.singleInk ?? tintUnflagged)) return false;
  return ink.svg === true || entry.singleInk === true || entry.vector;
}

/** Draw the registered image of `fileId` into the box, through the raster
 *  cache for vector sources — rasterised at the size the box has on the
 *  device under the context's transform ({@link vectorRasterSize}), tinted
 *  to the document's ink for a raw SVG picture of a single-ink document
 *  (see {@link ImageInk}). Returns false
 *  when nothing is registered, so the caller can paint its placeholder (the
 *  miss goes to the render's {@link MissingImageSink}, with `resourceId`
 *  when the caller knows it). */
export function drawResourceImage(
  ctx: CanvasRenderingContext2D,
  fileId: string,
  x: number,
  y: number,
  w: number,
  h: number,
  ink?: ImageInk,
  resourceId?: string,
): boolean {
  const entry = imageRegistry.get(fileId);
  if (!entry) {
    missingImageSink?.(fileId, resourceId);
    return false;
  }
  const tintHex = ink?.tint ?? null;
  const inkHex = tintHex === null && takesInk(entry, ink) ? ink.inkHex : null;
  if (entry.vector || inkHex || tintHex) {
    // A vector source takes the size the box shows at on the device; a
    // bitmap tinted here has no more pixels to give than its own, and keeps
    // the box in page pixels.
    const size = entry.vector ? vectorRasterSize(ctx, w, h, inkHex !== null) : [Math.round(w), Math.round(h)] as const;
    const raster = size ? getVectorRaster(fileId, entry.image, size[0], size[1], inkHex, tintHex) : null;
    if (raster) {
      ctx.drawImage(raster, x, y, w, h);
      return true;
    }
  }
  ctx.drawImage(entry.image, x, y, w, h);
  return true;
}
