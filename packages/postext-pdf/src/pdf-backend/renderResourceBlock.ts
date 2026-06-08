/**
 * PDF rendering of resource blocks (issue #49 §7).
 *
 * Draws an embedded `Resource` (bitmap / svg / table) plus its caption into a
 * pdf-lib page. Image payloads live out-of-band (IndexedDB in the sandbox); the
 * host supplies their raw bytes via {@link RenderToPdfOptions.resourceBytes},
 * which {@link preloadResourceImages} embeds into the document up front (PDF
 * embedding is async; page rendering is sync).
 *
 * Bitmaps: `embedPng` / `embedJpg`. WebP is decoded to PNG via a canvas before
 * embedding (browser-only runtime). SVGs:
 *   TODO(#49-svg-vector): emit SVG as vector paths. For v1 SVGs fall back to a
 *   raster embed (the host rasterises the SVG to PNG bytes and registers them
 *   under the same fileId) — vector emission is deferred as a known partial.
 *
 * Inline `:ref` segments render in the link colour and, via {@link LinkRegistry},
 * become clickable link annotations targeting the resource embed's destination.
 */

import { type Color, type PDFImage, type PDFDocument } from 'pdf-lib';
import type {
  VDTBlock,
  VDTLine,
  VDTDocument,
  ResolvedResourceBlock,
} from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, drawTextPx, drawLinePx, fillRectPx, colorFromHex } from './primitives';
import { LinkRegistry } from './links';

/** Raw bytes of a resource binary, keyed by `fileId`. */
export type ResourceBytesProvider = (fileId: string) => Uint8Array | undefined;

/** Embedded images keyed by `fileId`, shared across pages. */
export type ResourceImageMap = Map<string, PDFImage>;

/** Decode WebP bytes to PNG bytes via an offscreen canvas. Browser-only. */
async function webpToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  try {
    const blob = new Blob([bytes as BlobPart], { type: 'image/webp' });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(bitmap, 0, 0);
    const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Embed every bitmap / svg resource image referenced in the document. Returns a
 * map of `fileId → PDFImage` consumed by {@link renderResourceBlock}. SVGs are
 * expected to be supplied as pre-rasterised PNG bytes by the host (see the
 * SVG TODO above); a missing or undecodable image is simply absent from the map
 * and the renderer draws a placeholder.
 */
export async function preloadResourceImages(
  pdfDoc: PDFDocument,
  doc: VDTDocument,
  bytesProvider: ResourceBytesProvider | undefined,
): Promise<ResourceImageMap> {
  const out: ResourceImageMap = new Map();
  if (!bytesProvider) return out;
  for (const block of doc.blocks) {
    const rb = block.resourceBlock;
    if (!rb || !rb.fileId || out.has(rb.fileId)) continue;
    if (rb.kind !== 'bitmap' && rb.kind !== 'svg') continue;
    const bytes = bytesProvider(rb.fileId);
    if (!bytes) continue;
    try {
      const fmt = (rb.format ?? '').toLowerCase();
      let image: PDFImage | null = null;
      if (fmt === 'jpeg' || fmt === 'jpg') {
        image = await pdfDoc.embedJpg(bytes);
      } else if (fmt === 'webp') {
        const png = await webpToPng(bytes);
        if (png) image = await pdfDoc.embedPng(png);
      } else {
        // png / gif-first-frame / svg-rasterised-to-png all go through embedPng.
        image = await pdfDoc.embedPng(bytes);
      }
      if (image) out.set(rb.fileId, image);
    } catch {
      // Undecodable — leave absent; renderer falls back to a placeholder.
    }
  }
  return out;
}

function pickFont(
  bold: boolean,
  italic: boolean,
  fonts: { normal: string; bold: string; italic: string; boldItalic: string },
): string {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.normal;
}

interface PaintFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** Paint one absolutely-positioned rich-text line; records ref link rects. */
function paintLine(
  ctx: PageCtx,
  line: VDTLine,
  fonts: PaintFonts,
  fontCache: FontCache,
  color: Color,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  resolveRefId: ((seg: { refResourceId?: string }) => string | undefined),
): void {
  const baseFont = fontCache.get(fonts.normal);
  if (!baseFont) return;
  const baseSize = parseFontString(fonts.normal)?.sizePx ?? 0;
  if (line.segments && line.segments.length > 0) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      const fontStr = pickFont(!!seg.bold, !!seg.italic, fonts);
      const font = fontCache.get(fontStr) ?? baseFont;
      const size = parseFontString(fontStr)?.sizePx ?? baseSize;
      const refId = resolveRefId(seg);
      const segColor = refId !== undefined ? linkColor : color;
      drawTextPx(ctx, seg.text, x, line.baseline, font, size, segColor);
      if (refId !== undefined && linkRegistry) {
        const { scale, pageHeightPt } = ctx;
        const x1 = x * scale;
        const y2 = pageHeightPt - (line.bbox.y) * scale;
        const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
        const x2 = (x + seg.width) * scale;
        linkRegistry.addLink(ctx.page, [x1, y1, x2, y2], refId);
      }
      x += seg.width;
    }
    return;
  }
  drawTextPx(ctx, line.text, line.bbox.x, line.baseline, baseFont, baseSize, color);
}

function renderTable(
  ctx: PageCtx,
  rb: ResolvedResourceBlock,
  fontCache: FontCache,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
): void {
  const t = rb.table;
  if (!t) return;
  const borderColor = colorFromHex(t.borderColor, ctx.colorSpace);
  const headerBg = t.headerBackground ? colorFromHex(t.headerBackground, ctx.colorSpace) : undefined;
  const tableColor = colorFromHex(t.color, ctx.colorSpace);
  const fonts: PaintFonts = {
    normal: t.fontString,
    bold: t.boldFontString,
    italic: t.italicFontString,
    boldItalic: t.boldItalicFontString,
  };

  // Header backgrounds.
  if (headerBg) {
    for (const cell of t.cells) {
      if (cell.isHeader) {
        fillRectPx(ctx, cell.rect.x, cell.rect.y, cell.rect.width, cell.rect.height, headerBg);
      }
    }
  }
  // Borders (per-cell rectangle outline).
  for (const cell of t.cells) {
    const { x, y, width, height } = cell.rect;
    drawLinePx(ctx, x, y, x + width, y, borderColor, t.borderWidthPx);
    drawLinePx(ctx, x, y + height, x + width, y + height, borderColor, t.borderWidthPx);
    drawLinePx(ctx, x, y, x, y + height, borderColor, t.borderWidthPx);
    drawLinePx(ctx, x + width, y, x + width, y + height, borderColor, t.borderWidthPx);
  }
  // Cell content.
  for (const cell of t.cells) {
    for (const line of cell.lines) {
      paintLine(ctx, line, fonts, fontCache, tableColor, linkColor, linkRegistry, (seg) => seg.refResourceId);
    }
  }
}

function drawPlaceholder(ctx: PageCtx, rb: ResolvedResourceBlock, x: number, y: number): void {
  const fill = colorFromHex('#eeeeee', ctx.colorSpace);
  fillRectPx(ctx, x, y, rb.bodyRect.width, rb.bodyRect.height, fill);
}

export function renderResourceBlock(
  ctx: PageCtx,
  block: VDTBlock,
  fontCache: FontCache,
  images: ResourceImageMap,
  linkRegistry: LinkRegistry | undefined,
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  const bx = block.bbox.x + rb.bodyRect.x;
  const by = block.bbox.y + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;
  const { scale, pageHeightPt } = ctx;
  const linkColor = colorFromHex(rb.linkColor, ctx.colorSpace);

  if (rb.kind === 'bitmap' || rb.kind === 'svg') {
    const image = rb.fileId ? images.get(rb.fileId) : undefined;
    if (image) {
      ctx.page.drawImage(image, {
        x: bx * scale,
        y: pageHeightPt - (by + bh) * scale,
        width: bw * scale,
        height: bh * scale,
      });
    } else {
      drawPlaceholder(ctx, rb, bx, by);
    }
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, fontCache, linkColor, linkRegistry);
  }

  // Named destination for inline refs: top-left of the placed block.
  if (linkRegistry && rb.resource.id) {
    const destTop = pageHeightPt - block.bbox.y * scale;
    linkRegistry.addDestination(rb.resource.id, ctx.page, block.bbox.x * scale, destTop);
  }

  // Caption.
  const captionColor = colorFromHex(rb.captionColor, ctx.colorSpace);
  const captionFonts: PaintFonts = {
    normal: rb.captionFontString,
    bold: rb.captionBoldFontString,
    italic: rb.captionItalicFontString,
    boldItalic: rb.captionBoldItalicFontString,
  };
  for (const line of rb.captionLines) {
    paintLine(ctx, line, captionFonts, fontCache, captionColor, linkColor, linkRegistry, (seg) => seg.refResourceId);
  }
}
