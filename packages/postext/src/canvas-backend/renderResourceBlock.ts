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

import type { VDTBlock, VDTLine, ResolvedResourceBlock } from '../vdt';

/** A decoded image the canvas backend can `drawImage`. */
export type ResourceImageSource = CanvasImageSource;

export interface RegisterResourceImageOptions {
  /** The source is vector art (an SVG `<img>`): every `drawImage` of it
   *  re-rasterises the document, so the backend rasterises it once at each
   *  placed pixel size and blits the bitmap thereafter (see
   *  {@link drawResourceImage}). Defaults to true for an `HTMLImageElement`
   *  — the host decodes rasters through `createImageBitmap`. */
  vector?: boolean;
}

interface RegistryEntry {
  image: ResourceImageSource;
  vector: boolean;
}

/** Module-level registry of decoded images, keyed by `fileId`. The sandbox
 *  decodes blobs (createImageBitmap for bitmaps; an `<img>`/offscreen canvas
 *  for SVGs) once and registers them here before rendering a page. */
const imageRegistry = new Map<string, RegistryEntry>();

function isImageElement(image: ResourceImageSource): boolean {
  return typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement;
}

/** Register (or replace) a decoded image for a `fileId`. */
export function registerResourceImage(
  fileId: string,
  image: ResourceImageSource,
  options?: RegisterResourceImageOptions,
): void {
  imageRegistry.set(fileId, { image, vector: options?.vector ?? isImageElement(image) });
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
 *  request; null when no offscreen canvas can be made (or the size is out
 *  of range), in which case the caller draws the source directly. */
function getVectorRaster(fileId: string, image: ResourceImageSource, w: number, h: number): RasterCanvas | null {
  if (w <= 0 || h <= 0 || w > RASTER_MAX_SIDE || h > RASTER_MAX_SIDE) return null;
  const key = `${fileId}|${w}x${h}`;
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

/** Draw the registered image of `fileId` into the box, through the raster
 *  cache for vector sources. Returns false when nothing is registered, so
 *  the caller can paint its placeholder. */
export function drawResourceImage(
  ctx: CanvasRenderingContext2D,
  fileId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): boolean {
  const entry = imageRegistry.get(fileId);
  if (!entry) return false;
  if (entry.vector) {
    // The page canvas is 1 device px per page px (no transform), so the
    // placed box rounded to whole pixels is the bitmap size the figure
    // shows at.
    const raster = getVectorRaster(fileId, entry.image, Math.round(w), Math.round(h));
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
  ctx.textBaseline = 'alphabetic';
  if (line.segments && line.segments.length > 0) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      ctx.font = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
      ctx.fillStyle = seg.refResourceId !== undefined
        ? linkColor
        : seg.captionLabel
          ? labelColor
          : color;
      ctx.fillText(seg.text, x, line.baseline + (seg.baselineShift ?? 0));
      x += seg.width;
    }
    return;
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(line.text, line.bbox.x, line.baseline);
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

function renderTable(
  ctx: CanvasRenderingContext2D,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
): void {
  const t = rb.table;
  if (!t) return;
  // Cell backgrounds first (header tint / body fill), then borders, then text.
  for (const cell of t.cells) {
    const fill = cell.isHeader ? t.headerBackground : t.bodyBackground;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
    }
  }
  if (t.borderWidthPx > 0) {
    ctx.save();
    ctx.strokeStyle = t.borderColor;
    ctx.lineWidth = t.borderWidthPx;
    const rules = t.rules ?? 'grid';
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
    } else if (rules === 'outer') {
      const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
      ctx.strokeRect(bx, by, rb.bodyRect.width, tableHeight);
    }
    ctx.restore();
  }
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const { x, y, width, height } = img.rect;
    if (!drawResourceImage(ctx, img.fileId, x, y, width, height)) {
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
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  const bx = block.bbox.x + rb.bodyRect.x;
  const by = block.bbox.y + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;

  if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const drawn = rb.fileId ? drawResourceImage(ctx, rb.fileId, bx, by, bw, bh) : false;
    if (!drawn) {
      drawPlaceholder(ctx, bx, by, bw, bh, rb.kind === 'svg' ? 'SVG' : 'Image');
    }
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, bx, by);
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
}
