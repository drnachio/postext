// A figure's layout, caption text and alt text, and tables: header rows,
// the tagged cells and the table drawn with its rules, fills and cell
// images (#1276: split out of renderResourceBlock.ts).
import type { Color } from 'pdf-lib';
import { type ResolvedResourceBlock, altWithLabels, undrawnLabels, type VDTResourceTableCell, tableFrameOutline, tableCellFillRects } from 'postext';
import { LinkRegistry, refTarget } from '../../structure/links.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, colorFromHex, pushClipOutline, popClip, fillRectsPx, drawLinePx, strokeOutlinePx, fillRectPx } from '../../primitives.js';
import { type StructAttrs, type StructElem, tagArtifact, tagContent } from '../../structure/tagging.js';
import type { ResourceImageMap } from '../renderResourceBlock.js';
import { type PaintFonts, drawEmbeddedResource, paintLine } from './lines.js';

/** Layout attributes of a figure: its bounding box on the page (PDF user
 *  space, bottom-up) and block placement. */
export function figureLayout(ctx: PageCtx, xPx: number, yPx: number, wPx: number, hPx: number): StructAttrs['attributes'] {
  const { scale, pageHeightPt } = ctx;
  const rect: [number, number, number, number] = [
    xPx * scale,
    pageHeightPt - (yPx + hPx) * scale,
    (xPx + wPx) * scale,
    pageHeightPt - yPx * scale,
  ];
  const bbox = ctx.page.doc.context.obj(ctx.mapRectPt ? ctx.mapRectPt(rect) : rect);
  return [{ owner: 'Layout', entries: { BBox: bbox, Placement: 'Block' } }];
}

/** Plain text of a resource caption, for figure alt text fallbacks. */
function captionText(rb: ResolvedResourceBlock): string {
  return rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
}

/** Alt text of a figure: the resource's `altText`, else its caption, else
 *  its label (`Figure 1.2`) — PDF/UA-1 §7.3 requires one on every figure.
 *  A video's text says what the picture is, in its type's name (`Video: …`):
 *  the reader hears a poster that links to a video, not a still. */
export function figureAlt(rb: ResolvedResourceBlock): string {
  const label = `${rb.captionPrefix} ${rb.number}`.trim();
  const text = rb.resource.altText?.trim() || rb.score?.alt || captionText(rb);
  // Labels drawn as text are read as text, after the picture (#860).
  if (rb.kind !== 'video') return altWithLabels(text || label, undrawnLabels(rb.labels));
  const name = rb.captionPrefix.trim() || 'Video';
  // A Chinese or Japanese name takes the full-width colon (视频：…).
  const colon = /[\u3040-\u30ff\u3400-\u9fff]$/.test(name) ? '：' : ': ';
  return text ? `${name}${colon}${text}` : label || name;
}

/** Rows whose every cell is a header cell: the column-header rows, which
 *  a continuation slice repeats and an accessible render then flags as
 *  artifacts (the reader already met them on the first slice). */
function headerRows(cells: VDTResourceTableCell[]): Set<number> {
  const rows = new Map<number, boolean>();
  for (const cell of cells) rows.set(cell.row, (rows.get(cell.row) ?? true) && cell.isHeader);
  const out = new Set<number>();
  for (const [row, allHeader] of rows) if (allHeader) out.add(row);
  return out;
}

/** Build the `TR` › `TH` / `TD` elements of a table slice: one element per
 *  cell in row / column order, with span and scope attributes. Cells of
 *  repeated header rows on a continuation slice get no element. */
function tableCellElems(
  table: StructElem,
  cells: VDTResourceTableCell[],
  continued: boolean,
): Map<VDTResourceTableCell, StructElem> {
  const out = new Map<VDTResourceTableCell, StructElem>();
  const heads = headerRows(cells);
  const ordered = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  let row: StructElem | undefined;
  let rowIndex = -1;
  for (const cell of ordered) {
    if (continued && heads.has(cell.row)) continue;
    if (cell.row !== rowIndex) {
      rowIndex = cell.row;
      row = table.child('TR');
    }
    const entries: Record<string, number | string> = {};
    if (cell.colSpan > 1) entries.ColSpan = cell.colSpan;
    if (cell.rowSpan > 1) entries.RowSpan = cell.rowSpan;
    if (cell.isHeader) entries.Scope = heads.has(cell.row) ? 'Column' : 'Row';
    const attrs: StructAttrs = Object.keys(entries).length > 0
      ? { attributes: [{ owner: 'Table', entries }] }
      : {};
    out.set(cell, row!.child(cell.isHeader ? 'TH' : 'TD', attrs));
  }
  return out;
}

export function renderTable(
  ctx: PageCtx,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
  fontCache: FontCache,
  images: ResourceImageMap,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  tableElem: StructElem | undefined,
): void {
  const t = rb.table;
  if (!t) return;
  // Cell grid, fills and rules are layout; the reader gets the cell text.
  tagArtifact(ctx, { type: 'Layout' });
  const cellElems = tableElem ? tableCellElems(tableElem, t.cells, !!rb.slice?.continued) : undefined;
  const borderColor = colorFromHex(t.borderColor, ctx.colorSpace);
  const bodyColor = colorFromHex(t.color, ctx.colorSpace);
  const headerColor = colorFromHex(t.headerColor, ctx.colorSpace);
  const bodyFonts: PaintFonts = {
    normal: t.fontString,
    bold: t.boldFontString,
    italic: t.italicFontString,
    boldItalic: t.boldItalicFontString,
  };
  const headerFonts: PaintFonts = {
    normal: t.headerFontString,
    bold: t.headerBoldFontString,
    italic: t.headerItalicFontString,
    boldItalic: t.headerBoldItalicFontString,
  };

  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is stroked round on top.
  const rounded = t.frameRadii !== undefined;
  const outline = (outset: number) => tableFrameOutline(t, bx, by, rb.bodyRect.width, outset);
  const clipTo = (outset: number) => {
    pushClipOutline(ctx, outline(outset));
    tagArtifact(ctx, { type: 'Layout' });
  };
  const unclip = () => {
    popClip(ctx);
    tagArtifact(ctx, { type: 'Layout' });
  };
  // Cell backgrounds (the cell's own fill, else the header tint / the body
  // or zebra fill). Each opaque fill runs across the edges it shares with
  // the cells painted after it, in the same fill operation, so a viewer
  // shows no seam between two cells (see `tableCellFillRects`).
  if (rounded) clipTo(0);
  for (const { fill, rects } of tableCellFillRects(t)) {
    fillRectsPx(ctx, rects, colorFromHex(fill, ctx.colorSpace));
  }
  if (rounded) unclip();
  // Borders: the full cell grid, horizontal rules only, or the outer frame.
  // `drawLinePx` strokes exactly `borderWidthPx` (scaled to pt), so fractional
  // hairlines such as 0.5pt survive.
  if (t.strokes) {
    // Booktabs (#625): the layout's strokes, each its own (fractional) width.
    for (const s of t.strokes) drawLinePx(ctx, bx + s.x1, by + s.y1, bx + s.x2, by + s.y2, borderColor, s.widthPx);
  } else if (t.borderWidthPx > 0) {
    const rules = t.rules ?? 'grid';
    const bw = t.borderWidthPx;
    if (rules === 'outer') {
      if (!rounded) {
        const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
        const x = bx, y = by, width = rb.bodyRect.width, height = tableHeight;
        drawLinePx(ctx, x, y, x + width, y, borderColor, bw);
        drawLinePx(ctx, x, y + height, x + width, y + height, borderColor, bw);
        drawLinePx(ctx, x, y, x, y + height, borderColor, bw);
        drawLinePx(ctx, x + width, y, x + width, y + height, borderColor, bw);
      }
    } else {
      if (rounded) clipTo(bw / 2);
      for (const cell of t.cells) {
        const { x, y, width, height } = cell.rect;
        drawLinePx(ctx, x, y, x + width, y, borderColor, bw);
        drawLinePx(ctx, x, y + height, x + width, y + height, borderColor, bw);
        if (rules === 'grid') {
          drawLinePx(ctx, x, y, x, y + height, borderColor, bw);
          drawLinePx(ctx, x + width, y, x + width, y + height, borderColor, bw);
        }
      }
      if (rounded) unclip();
    }
    if (rounded && (rules === 'grid' || rules === 'outer')) strokeOutlinePx(ctx, outline(0), borderColor, bw);
  }
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const { x, y, width, height } = img.rect;
    const cellElem = cellElems?.get(cell);
    if (cellElems) {
      if (cellElem) {
        tagContent(ctx, cellElem.child('Figure', {
          alt: img.altText?.trim() || img.resourceId,
          attributes: figureLayout(ctx, x, y, width, height),
        }));
      } else {
        tagArtifact(ctx, { type: 'Layout' });
      }
    }
    const embedded = images.get(img.fileId);
    if (embedded) drawEmbeddedResource(ctx, embedded, x, y, width, height);
    else {
      ctx.onMissingImage?.(img.fileId, img.resourceId);
      fillRectPx(ctx, x, y, width, height, colorFromHex('#eeeeee', ctx.colorSpace));
    }
  }
  // Cell content.
  for (const cell of t.cells) {
    const fonts = cell.isHeader ? headerFonts : bodyFonts;
    const color = cell.isHeader ? headerColor : bodyColor;
    const cellElem = cellElems?.get(cell);
    if (cellElems && !cellElem) tagArtifact(ctx, { type: 'Layout' });
    for (const line of cell.lines) {
      paintLine(ctx, line, fonts, fontCache, color, linkColor, linkRegistry, refTarget, color, cellElem);
    }
  }
}
