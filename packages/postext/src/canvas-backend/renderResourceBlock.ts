/**
 * Canvas rendering of resource blocks (issue #49 §7).
 *
 * Draws an embedded `Resource` (bitmap / svg / table) plus its caption. Image
 * payloads (bitmaps, SVGs) live out-of-band in IndexedDB, which is owned by the
 * sandbox — the core renderer is synchronous and cannot fetch them itself. The
 * host therefore pre-populates a small in-memory registry keyed by `fileId`
 * (see {@link registerResourceImage}). When an image is not yet decoded the
 * renderer draws a neutral placeholder so layout stays stable.
 *
 * Caption + inline `:ref` segments reuse the same per-line rich-text painter as
 * body text. Refs are drawn in the configured link colour; canvas has no click
 * surface, so clickability is PDF-only for v1.
 */

import type { VDTBlock, VDTLine, ResolvedResourceBlock, RoundedOutline } from '../vdt';
import { fillFlowText, setVerticalPaint } from './verticalText';
import { lineMarkCuts } from '../measure/markCuts';
import { tableCellFill, tableFrameOutline } from '../vdt';
import { paintSwatch } from './swatch';
import { paintChip } from './chip';
import { applySingleInkToPixels, isSingleInkSvgUrl } from '../svg/singleInk';

/** A decoded image the canvas backend can `drawImage`. */
export type ResourceImageSource = CanvasImageSource;

export interface RegisterResourceImageOptions {
  /** The source is vector art (an SVG `<img>`): every `drawImage` of it
   *  re-rasterises the document, so the backend rasterises it once at each
   *  placed pixel size and blits the bitmap thereafter (see
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
// A page's figures always draw at the same pixel size (the placed body rect
// at the page DPI), so the first draw at a size rasterises into an offscreen
// bitmap, keyed by fileId and size, and later draws blit that bitmap. The
// cache is bounded by bytes, least recently used first, and a fileId's
// entries are dropped when its image is (re)registered.
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
function getVectorRaster(fileId: string, image: ResourceImageSource, w: number, h: number, inkHex: string | null = null): RasterCanvas | null {
  if (w <= 0 || h <= 0 || w > RASTER_MAX_SIDE || h > RASTER_MAX_SIDE) return null;
  const key = inkHex ? `${fileId}|${w}x${h}|${inkHex}` : `${fileId}|${w}x${h}`;
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
    if (inkHex) {
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

/** How a picture is painted under `diagramStyle.singleInk`: the document's
 *  ink (null when single ink is off), and whether the picture is an SVG
 *  (`true`), a bitmap (`false`) or unknown — a design image of a VDT built
 *  before design images carried `imageKind` (`undefined`: the registry
 *  decides). */
export interface ImageInk {
  inkHex: string | null;
  svg?: boolean;
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
 *  cache for vector sources — tinted to the document's ink for a raw SVG
 *  picture of a single-ink document (see {@link ImageInk}). Returns false
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
  const inkHex = takesInk(entry, ink) ? ink.inkHex : null;
  if (entry.vector || inkHex) {
    // The page canvas is 1 device px per page px (no transform), so the
    // placed box rounded to whole pixels is the bitmap size the figure
    // shows at.
    const raster = getVectorRaster(fileId, entry.image, Math.round(w), Math.round(h), inkHex);
    if (raster) {
      ctx.drawImage(raster, x, y, w, h);
      return true;
    }
  }
  ctx.drawImage(entry.image, x, y, w, h);
  return true;
}

function pickFont(
  bold: boolean,
  italic: boolean,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  if (bold && italic) return boldItalicFont;
  if (bold) return boldFont;
  if (italic) return italicFont;
  return font;
}

/** Paint one already-positioned rich-text line (absolute page coords). Used for
 *  both the caption and individual table cells. `:ref` segments are recoloured
 *  to `linkColor`. */
/** A caption, note or cell line. A tracked line (a table header set with
 *  `headerLetterSpacing`) was measured with the tracking in its widths, so
 *  it is painted with the same canvas `letterSpacing`, reset afterwards. */
function paintLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  color: string,
  linkColor: string,
  labelColor: string = color,
): void {
  const tracking = line.letterSpacing ?? 0;
  if (tracking !== 0) ctx.letterSpacing = `${tracking}px`;
  paintLineRuns(ctx, line, font, boldFont, italicFont, boldItalicFont, color, linkColor, labelColor, tracking);
  if (tracking !== 0) ctx.letterSpacing = '0px';
}

function paintLineRuns(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  color: string,
  linkColor: string,
  labelColor: string,
  tracking = 0,
): void {
  ctx.textBaseline = 'alphabetic';
  if (line.segments && line.segments.length > 0) {
    let x = line.bbox.x;
    // Two marks that meet are painted apart where the line's measurer set
    // them apart (see `fillFlowText`).
    const cuts = lineMarkCuts(line);
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      if (seg.kind === 'swatch') {
        paintSwatch(ctx, x, line.baseline, seg.width, seg.swatch?.color, color);
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        paintChip(ctx, seg.chip, x, line.baseline, () => color);
        x += seg.width;
        continue;
      }
      ctx.font = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
      ctx.fillStyle = seg.refResourceId !== undefined
        ? linkColor
        : seg.captionLabel
          ? labelColor
          : color;
      // A justified CJK line spreads its characters per segment.
      if (seg.tracking !== undefined) ctx.letterSpacing = `${tracking + seg.tracking}px`;
      fillFlowText(ctx, seg.text, x + (seg.inkOffset ?? 0), line.baseline + (seg.baselineShift ?? 0), 'fill', undefined, cuts);
      if (seg.tracking !== undefined) ctx.letterSpacing = `${tracking}px`;
      x += seg.width;
    }
    return;
  }
  ctx.font = font;
  ctx.fillStyle = color;
  fillFlowText(ctx, line.text, line.bbox.x, line.baseline, 'fill', undefined, lineMarkCuts(line));
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(160, 160, 160, 0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(160, 160, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(120, 120, 120, 0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, Math.min(16, h * 0.1))}px sans-serif`;
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}

/** Trace a rounded outline (per-corner radii) as the current path. */
export function roundedOutlinePath(ctx: CanvasRenderingContext2D, o: RoundedOutline): void {
  const { x, y, width: w, height: h } = o;
  const [tl, tr, br, bl] = o.radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** Tolerance for "the transform has no shear" (a quarter turn made with
 *  `rotate(±π/2)` leaves cosines of ~1e-17). */
const AXIS_EPS = 1e-9;

type RectFiller = (x: number, y: number, w: number, h: number) => void;

/**
 * A `fillRect` that moves the rectangle's edges to the nearest device-pixel
 * boundaries under the context's current transform. Each fill is
 * anti-aliased on its own, so two fills meeting on a fractional device
 * pixel both cover it partly and the page shows through: a faint seam
 * between table cells of the same colour. Snapped, neighbours meet on a
 * pixel boundary. Works for scale + translate and quarter turns; under any
 * other transform (or on a context without `getTransform`) it fills as
 * given. Read the transform once: it must not change while filling.
 */
function pixelSnappedFill(ctx: CanvasRenderingContext2D): RectFiller {
  const plain: RectFiller = (x, y, w, h) => ctx.fillRect(x, y, w, h);
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined;
  if (!m) return plain;
  const { a, b, c, d, e, f } = m;
  // Device x from user x (and y from y) — or, turned, device y from x.
  const straight = Math.abs(b) < AXIS_EPS && Math.abs(c) < AXIS_EPS && Math.abs(a) > AXIS_EPS && Math.abs(d) > AXIS_EPS;
  const turned = Math.abs(a) < AXIS_EPS && Math.abs(d) < AXIS_EPS && Math.abs(b) > AXIS_EPS && Math.abs(c) > AXIS_EPS;
  if (!straight && !turned) return plain;
  const [sx, ox, sy, oy] = straight ? [a, e, d, f] : [b, f, c, e];
  const snap = (v: number, s: number, o: number) => (Math.round(s * v + o) - o) / s;
  return (x, y, w, h) => {
    const x0 = snap(x, sx, ox);
    const x1 = snap(x + w, sx, ox);
    const y0 = snap(y, sy, oy);
    const y1 = snap(y + h, sy, oy);
    // A cell thinner than a device pixel keeps its own edges.
    if (x0 === x1 || y0 === y1) ctx.fillRect(x, y, w, h);
    else ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  };
}

function renderTable(
  ctx: CanvasRenderingContext2D,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
  inkHex: string | null,
): void {
  const t = rb.table;
  if (!t) return;
  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is stroked round on top.
  const rounded = t.frameRadii !== undefined;
  const clipTo = (outset: number) => {
    ctx.save();
    roundedOutlinePath(ctx, tableFrameOutline(t, bx, by, rb.bodyRect.width, outset));
    ctx.clip();
  };
  // Cell backgrounds first (the cell's own fill, else the header tint / the
  // body or zebra fill), then borders, then text. Fills sit on device
  // pixels so neighbouring cells show no seam.
  if (rounded) clipTo(0);
  const fillCell = pixelSnappedFill(ctx);
  for (const cell of t.cells) {
    const fill = tableCellFill(t, cell);
    if (fill) {
      ctx.fillStyle = fill;
      fillCell(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
    }
  }
  if (rounded) ctx.restore();
  if (t.borderWidthPx > 0) {
    ctx.save();
    ctx.strokeStyle = t.borderColor;
    ctx.lineWidth = t.borderWidthPx;
    const rules = t.rules ?? 'grid';
    if (rounded && rules !== 'outer') clipTo(t.borderWidthPx / 2);
    if (rules === 'grid') {
      for (const cell of t.cells) {
        ctx.strokeRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
      }
    } else if (rules === 'horizontal') {
      // Top + bottom edge of every cell — i.e. of every row — no verticals.
      ctx.beginPath();
      for (const cell of t.cells) {
        const { x, y, width, height } = cell.rect;
        ctx.moveTo(x, y); ctx.lineTo(x + width, y);
        ctx.moveTo(x, y + height); ctx.lineTo(x + width, y + height);
      }
      ctx.stroke();
    } else if (rules === 'outer' && !rounded) {
      const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
      ctx.strokeRect(bx, by, rb.bodyRect.width, tableHeight);
    }
    if (rounded && rules !== 'outer') ctx.restore();
    if (rounded && (rules === 'grid' || rules === 'outer')) {
      roundedOutlinePath(ctx, tableFrameOutline(t, bx, by, rb.bodyRect.width));
      ctx.stroke();
    }
    ctx.restore();
  }
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const { x, y, width, height } = img.rect;
    if (!drawResourceImage(ctx, img.fileId, x, y, width, height, { inkHex, svg: img.kind === 'svg' }, img.resourceId)) {
      drawPlaceholder(ctx, x, y, width, height, img.kind === 'svg' ? 'SVG' : 'Image');
    }
  }
  for (const cell of t.cells) {
    const font = cell.isHeader ? t.headerFontString : t.fontString;
    const bold = cell.isHeader ? t.headerBoldFontString : t.boldFontString;
    const italic = cell.isHeader ? t.headerItalicFontString : t.italicFontString;
    const boldItalic = cell.isHeader ? t.headerBoldItalicFontString : t.boldItalicFontString;
    const color = cell.isHeader ? t.headerColor : t.color;
    for (const line of cell.lines) {
      paintLine(ctx, line, font, bold, italic, boldItalic, color, rb.linkColor);
    }
  }
}

export function renderResourceBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  /** The document's single ink (`documentInkHex`), null when off. */
  inkHex: string | null = null,
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  // A rotated block: its geometry is in the upright frame, painted through
  // the quarter-turn transform that lands the frame on the page.
  const rot = rb.rotation;
  // Inside a turned block the text reads along the block's own frame: on
  // a vertical page that is the upright figure, set horizontally.
  const outerVertical = rot ? setVerticalPaint(null) : null;
  if (rot) {
    ctx.save();
    ctx.translate(rot.originX, rot.originY);
    ctx.rotate(rot.direction === 'ccw' ? -Math.PI / 2 : Math.PI / 2);
  }
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;

  if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const drawn = rb.fileId ? drawResourceImage(ctx, rb.fileId, bx, by, bw, bh, { inkHex, svg: rb.kind === 'svg' }, rb.resource.id) : false;
    if (!drawn) {
      drawPlaceholder(ctx, bx, by, bw, bh, rb.kind === 'svg' ? 'SVG' : 'Image');
    }
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, bx, by, inkHex);
  }

  // Caption bar (behind the caption lines), then caption + note lines — all
  // already positioned in absolute page coords during placement.
  ctx.save();
  if (rb.captionBar) {
    const { rect, background } = rb.captionBar;
    ctx.fillStyle = background;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.textAlign = 'left';
  for (const line of rb.captionLines) {
    paintLine(
      ctx, line,
      rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString,
      rb.captionColor, rb.linkColor, rb.captionLabelColor,
    );
  }
  // Note, or the "continued" marker of a table slice that goes on (same
  // typeface and colour, right-aligned at layout time).
  for (const line of [...rb.noteLines, ...(rb.continuesLines ?? [])]) {
    paintLine(
      ctx, line,
      rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString,
      rb.noteColor, rb.linkColor,
    );
  }
  ctx.restore();
  if (rot) {
    ctx.restore();
    setVerticalPaint(outerVertical);
  }
}
