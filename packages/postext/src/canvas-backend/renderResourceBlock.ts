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

/** Module-level registry of decoded images, keyed by `fileId`. The sandbox
 *  decodes blobs (createImageBitmap for bitmaps; an `<img>`/offscreen canvas
 *  for SVGs) once and registers them here before rendering a page. */
const imageRegistry = new Map<string, ResourceImageSource>();

/** Register (or replace) a decoded image for a `fileId`. */
export function registerResourceImage(fileId: string, image: ResourceImageSource): void {
  imageRegistry.set(fileId, image);
}

/** Remove a cached image (e.g. when its resource is deleted). */
export function unregisterResourceImage(fileId: string): void {
  imageRegistry.delete(fileId);
}

/** Clear the entire image registry. */
export function clearResourceImages(): void {
  imageRegistry.clear();
}

/** Look up a decoded image. Exposed so the host can check what still needs
 *  decoding before a render. */
export function getResourceImage(fileId: string): ResourceImageSource | undefined {
  return imageRegistry.get(fileId);
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
): void {
  ctx.textBaseline = 'alphabetic';
  if (line.segments && line.segments.length > 0) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      ctx.font = pickFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
      ctx.fillStyle = seg.refResourceId !== undefined ? linkColor : color;
      ctx.fillText(seg.text, x, line.baseline);
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
): void {
  const t = rb.table;
  if (!t) return;
  // Header backgrounds first, then borders, then cell content.
  for (const cell of t.cells) {
    if (cell.isHeader && t.headerBackground) {
      ctx.fillStyle = t.headerBackground;
      ctx.fillRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
    }
  }
  ctx.save();
  ctx.strokeStyle = t.borderColor;
  ctx.lineWidth = t.borderWidthPx;
  for (const cell of t.cells) {
    ctx.strokeRect(cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height);
  }
  ctx.restore();
  for (const cell of t.cells) {
    for (const line of cell.lines) {
      paintLine(
        ctx, line,
        t.fontString, t.boldFontString, t.italicFontString, t.boldItalicFontString,
        t.color, rb.linkColor,
      );
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
    const img = rb.fileId ? imageRegistry.get(rb.fileId) : undefined;
    if (img) {
      ctx.drawImage(img, bx, by, bw, bh);
    } else {
      drawPlaceholder(ctx, bx, by, bw, bh, rb.kind === 'svg' ? 'SVG' : 'Image');
    }
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb);
  }

  // Caption (already positioned in absolute page coords during placement).
  ctx.save();
  ctx.textAlign = 'left';
  for (const line of rb.captionLines) {
    paintLine(
      ctx, line,
      rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString,
      rb.captionColor, rb.linkColor,
    );
  }
  ctx.restore();
}
