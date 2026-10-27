// Laid-out tables of a resource block: cells, cell images, strokes, the
// rounded frame and cell fills, caption bars and table slices
// (#1276: split out of vdt.ts).
import type { TableCellAlign, TableCellVerticalAlign, TableRules } from '../types.js';
import type { BoundingBox } from './document.js';
import type { VDTLine } from './lines.js';

// ---------------------------------------------------------------------------
// Resolved resource block (issue #49) — a measured, placement-ready embed of a
// `Resource` (bitmap / svg / table) plus its caption. Produced during the
// measurement phase so canvas/PDF renderers can draw it synchronously. All
// geometry is in px, relative to the block origin (`(0,0)` = block top-left),
// and offset to absolute page coordinates at placement time.
// ---------------------------------------------------------------------------

/** A single laid-out table cell: its primary grid position, pixel rect within
 *  the block, alignment, header flag, and the measured rich-text lines of its
 *  content. Cells covered by a merge are omitted (only the primary is kept). */
/** A cell's embedded image (`TableCell.image`), resolved to its payload and
 *  placed inside the cell. */
export interface VDTResourceTableCellImage {
  /** The referenced `Resource.id`. */
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** Out-of-band binary id, resolved at render time like a figure's. */
  fileId: string;
  /** For bitmaps: the source format (e.g. `'png'`, `'jpeg'`). */
  format?: string;
  /** Alternative text of the image (the resource's `altText`, else its
   *  caption), for accessible output. */
  altText?: string;
  /** For an SVG with a print master (`Resource.svg.pdfFileId`): the
   *  master's id, which the PDF backend embeds in place of the SVG. */
  pdfFileId?: string;
  /** Pixel rect of the image, in the same frame as the cell `rect`. */
  rect: BoundingBox;
}

export interface VDTResourceTableCell {
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
  align: TableCellAlign;
  verticalAlign: TableCellVerticalAlign;
  /** Pixel rect of the cell relative to the resource block origin. */
  rect: BoundingBox;
  /** Measured content lines, with bboxes relative to the cell's text origin. */
  lines: VDTLine[];
  /** The cell's embedded image, when it has one and the resource resolved. */
  image?: VDTResourceTableCellImage;
  /** The cell's own fill (hex, `TableCell.background` resolved through the
   *  palette), painted instead of the table's header / body fill. */
  background?: string;
  /** A body cell on an alternate (even-numbered) body row of a table with
   *  zebra rows: it takes `bodyAlternateBackground` instead of
   *  `bodyBackground`. Set only while the table style enables them. */
  alternate?: boolean;
}

/** Laid-out table geometry for a `kind: 'table'` resource block. */
export interface VDTResourceTableLayout {
  /** Body-cell font strings used for the rich-text line renderer. */
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  /** Body-cell text colour (hex). */
  color: string;
  /** Header-cell font strings. Header cells are measured with these, so the
   *  renderer must paint header cells with the same set. */
  headerFontString: string;
  headerBoldFontString: string;
  headerItalicFontString: string;
  headerBoldItalicFontString: string;
  /** Header-cell text colour (hex). */
  headerColor: string;
  /** Border colour (hex). */
  borderColor: string;
  /** Border thickness in px; `0` means no borders. */
  borderWidthPx: number;
  /** Header background colour (hex), or undefined for no fill. */
  headerBackground?: string;
  /** Body background colour (hex), or undefined for no fill. */
  bodyBackground?: string;
  /** Fill of the alternate body rows (hex, `tableStyle.bodyAlternateBackground`),
   *  painted on the cells marked `alternate`; absent without zebra rows. */
  bodyAlternateBackground?: string;
  cells: VDTResourceTableCell[];
  /** Column x-edges (length = columnCount + 1) relative to block origin. */
  columnEdges: number[];
  /** Row y-edges (length = rowCount + 1) relative to the table's top. */
  rowEdges: number[];
  /** Which rules to stroke with `borderWidthPx` (`'grid'` when absent). */
  rules?: TableRules;
  /** The rules of a `'booktabs'` table (#625), computed by the layout: the
   *  renderers stroke exactly these, in `borderColor`, and skip the
   *  {@link rules} pattern (and the rounded frame). Coordinates are
   *  relative to the table body's top-left corner, like {@link rowEdges};
   *  each stroke is centred on its line. `borderWidthPx` is then the
   *  widest stroke. Absent for the other patterns. */
  strokes?: VDTTableStroke[];
  /** Radii (px) of the outer frame's corners — top-left, top-right,
   *  bottom-right, bottom-left — from `tableStyle.borderRadius`, clamped to
   *  half the table's width and height. The frame is stroked round and the
   *  cell fills are clipped to it. A part of a split table keeps square the
   *  corners where it continues. Absent for a square frame. */
  frameRadii?: [number, number, number, number];
}

/** One rule of a table (`VDTResourceTableLayout.strokes`): a straight
 *  line from `(x1, y1)` to `(x2, y2)`, `widthPx` thick, with butt ends. */
export interface VDTTableStroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
}

/** A rounded outline: a rect and its corner radii (top-left, top-right,
 *  bottom-right, bottom-left). */
export interface RoundedOutline {
  x: number;
  y: number;
  width: number;
  height: number;
  radii: [number, number, number, number];
}

/** The outer frame of a laid-out table whose body starts at `(x, y)` and is
 *  `width` px wide, grown by `outset` px on every side — its radii grow
 *  alike, a square corner stays square. With `outset = 0` it is the line
 *  the frame is stroked along and the fills are clipped to; with half the
 *  border width it is the frame's outer contour. */
export function tableFrameOutline(
  table: Pick<VDTResourceTableLayout, 'rowEdges' | 'frameRadii'>,
  x: number,
  y: number,
  width: number,
  outset = 0,
): RoundedOutline {
  const height = table.rowEdges[table.rowEdges.length - 1] ?? 0;
  const grow = (r: number) => (r > 0 ? r + outset : 0);
  const [tl, tr, br, bl] = table.frameRadii ?? [0, 0, 0, 0];
  return {
    x: x - outset,
    y: y - outset,
    width: width + outset * 2,
    height: height + outset * 2,
    radii: [grow(tl), grow(tr), grow(br), grow(bl)],
  };
}

/** The fill (hex) a table cell is painted with, or undefined for none: the
 *  cell's own `background`, else the header tint for a header cell, else
 *  the alternate body fill on a zebra row, else the body fill. Every
 *  backend paints cells through it. */
export function tableCellFill(
  table: Pick<VDTResourceTableLayout, 'headerBackground' | 'bodyBackground' | 'bodyAlternateBackground'>,
  cell: Pick<VDTResourceTableCell, 'background' | 'isHeader' | 'alternate'>,
): string | undefined {
  if (cell.background !== undefined) return cell.background;
  if (cell.isHeader) return table.headerBackground;
  if (cell.alternate && table.bodyAlternateBackground !== undefined) return table.bodyAlternateBackground;
  return table.bodyBackground;
}

/** One cell fill as {@link tableCellFillRects} paints it. */
export interface TableCellFillRects {
  /** The fill (hex), as {@link tableCellFill} gives it. */
  fill: string;
  /** The cell's rect, then the strips it runs across the edges it shares
   *  with later neighbours. */
  rects: BoundingBox[];
}

/** Cells whose edges are this close (px) share an edge. */
const CELL_EDGE_EPS = 0.01;

/** Whether a fill (`#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa`) is opaque. */
function isOpaqueFill(hex: string): boolean {
  const h = hex.replace(/^#/, '');
  if (h.length === 8) return h.slice(6).toLowerCase() === 'ff';
  if (h.length === 4) return h[3]!.toLowerCase() === 'f';
  return true;
}

/**
 * The cell fills of a laid-out table in paint order, each as the cell's
 * rect followed by a strip across every edge it shares with an opaque
 * neighbour painted after it: along the shared part of the edge, reaching
 * half the narrower cell into each. A renderer that anti-aliases each fill
 * on its own — an HTML page at a fractional device-pixel ratio, a PDF
 * viewer — would otherwise let the page show through where two fills meet
 * inside a pixel: a faint seam between cells of one tint. The strip covers
 * the edge's pixels whole, and the later cell, painted over it, blends its
 * edge into the earlier fill instead of the page. Translucent fills keep
 * to their own cell (the overlap would show). The HTML and PDF backends
 * paint the fills this way; the canvas snaps its fills to device pixels
 * instead.
 */
export function tableCellFillRects(
  table: Pick<VDTResourceTableLayout, 'cells' | 'headerBackground' | 'bodyBackground' | 'bodyAlternateBackground'>,
): TableCellFillRects[] {
  const filled: { rect: BoundingBox; fill: string }[] = [];
  for (const cell of table.cells) {
    const fill = tableCellFill(table, cell);
    if (fill !== undefined) filled.push({ rect: cell.rect, fill });
  }
  return filled.map((a, i) => {
    const rects: BoundingBox[] = [a.rect];
    if (!isOpaqueFill(a.fill)) return { fill: a.fill, rects };
    const ar = a.rect;
    for (let j = i + 1; j < filled.length; j++) {
      const b = filled[j]!;
      if (!isOpaqueFill(b.fill)) continue;
      const br = b.rect;
      const y0 = Math.max(ar.y, br.y);
      const y1 = Math.min(ar.y + ar.height, br.y + br.height);
      const x0 = Math.max(ar.x, br.x);
      const x1 = Math.min(ar.x + ar.width, br.x + br.width);
      // The strip straddles the shared edge (half the narrower cell each
      // side), so the edge's pixels are covered by one shape whatever the
      // renderer does with separate shapes of one colour.
      if (y1 - y0 > CELL_EDGE_EPS) {
        const d = Math.min(ar.width, br.width) / 2;
        const edge = Math.abs(br.x - (ar.x + ar.width)) < CELL_EDGE_EPS ? br.x
          : Math.abs(br.x + br.width - ar.x) < CELL_EDGE_EPS ? ar.x : undefined;
        if (edge !== undefined) rects.push({ x: edge - d, y: y0, width: 2 * d, height: y1 - y0 });
      }
      if (x1 - x0 > CELL_EDGE_EPS) {
        const d = Math.min(ar.height, br.height) / 2;
        const edge = Math.abs(br.y - (ar.y + ar.height)) < CELL_EDGE_EPS ? br.y
          : Math.abs(br.y + br.height - ar.y) < CELL_EDGE_EPS ? ar.y : undefined;
        if (edge !== undefined) rects.push({ x: x0, y: edge - d, width: x1 - x0, height: 2 * d });
      }
    }
    return { fill: a.fill, rects };
  });
}

/** Background bar painted behind a resource caption (issue #49 §7). */
export interface VDTCaptionBar {
  /** Bar rect — block-relative until placement offsets it, like caption lines. */
  rect: BoundingBox;
  /** Fill colour (hex). */
  background: string;
}

/** Which rows of a split table a block carries, and how it links to the
 *  neighbouring slices (see `TableStyleConfig.overflow`). */
export interface VDTTableSlice {
  /** First model row of the slice (header rows excluded — they are repeated
   *  on every continuation regardless). */
  startRow: number;
  /** One past the last model row of the slice. */
  endRow: number;
  /** The slice continues an earlier one: its caption carries the continued
   *  suffix and the header rows are repeated. Anchors / link destinations
   *  belong to the first slice only. */
  continued: boolean;
  /** More rows follow on a later page: the continues marker is set under
   *  the slice and the note is held back for the last one. */
  continues: boolean;
}
