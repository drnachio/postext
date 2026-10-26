// A table laid out: cell fonts and style, cell content and images fitted to
// their cells, alignment, the grid painted, and the mirrored layout of a
// right-to-left table (#1276: split out of resourceLayout.ts).
import { bitmapLayoutSize } from '../../../bitmapResolution.js';
import { getMeasureDirection, setMeasureDirection, shiftLineX } from '../../../measure/rtl/bidiLines.js';
import type { InlineSpan } from '../../../parse/index.js';
import type { TableRules, ColorPaletteEntry, ResolvedInlineCodeStyleConfig, ResolvedMathConfig, TableCellAlign, TableCell, Resource, TableCellAlignKeyword, TableCellVerticalAlign, TableModel, ResourceType } from '../../../types.js';
import { type VDTLine, type VDTLineSegment, createBoundingBox, type VDTResourceTableLayout, type VDTResourceTableCell, type VDTResourceTableCellImage } from '../../../vdt.js';
import { measureTextWidth } from '../../../measure/index.js';
import { linkSegments } from '../../../measure/links.js';
import { graphemeCount } from '../../../measure/graphemes.js';
import { parseInlineSnippetSpans } from '../../../parse/inlineSnippet.js';
import { nestListItem, listDepth } from '../../../parse/listNesting.js';
import { type ChipContext, fontSizePxOf } from '../../text/chips.js';
import { withSnippetInlineCode } from '../../code/codeInline.js';
import { startEndAsLeftRight, resolveColorValue } from '../../../defaults/shared.js';
import { uppercasePreservingLength } from '../../blocks/buildBlockKind.js';
import { lineTrailingTracking } from '../../../paint/lineInk.js';
import type { ResourceNumberingMap } from '../resourceNumbering.js';
import type { TableRowMetrics } from './input.js';
import { type AnnotationScope, annotatedSpans, resolveCellChips, resolveSwatchSpans, resolveRefSpans } from './refSpans.js';
import { splitCellParagraphs, measureSnippet, takeCellItemMarker, shiftLines, fitWidth, snippetMathSpans } from './snippets.js';
import { computeColumnEdges, cellIsHeader, tableHeaderRowCount } from './tableSlices.js';

/** One resolved font set (normal / bold / italic / bold+italic), its colour,
 *  and its line height, for either the body or header cells of a table. */
export interface CellFontSet {
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  color: string;
  lineHeightPx: number;
  /** Tracking after every character (px), measured into the lines and set
   *  on each as `VDTLine.letterSpacing` for the renderers; absent for none. */
  letterSpacingPx?: number;
  /** Set the text in capitals (length-preserving). */
  uppercase?: boolean;
}

/** Fully-resolved table styling consumed by {@link layoutTable}. */
export interface TableLayoutStyle {
  /** Layout px per inch (`page.dpi`), for a cell picture's natural size. */
  dpi: number;
  body: CellFontSet;
  header: CellFontSet;
  borderColor: string;
  /** Border thickness in px; `0` disables borders. */
  borderWidthPx: number;
  cellPaddingPx: number;
  /** Header fill (hex), or undefined when disabled. */
  headerBackground?: string;
  /** Body fill (hex), or undefined when disabled. */
  bodyBackground?: string;
  /** Fill of the alternate (zebra) body rows (hex), or undefined when
   *  disabled. */
  bodyAlternateBackground?: string;
  /** Which rules to stroke. */
  rules: TableRules;
  /** Gap between a list marker and its text inside a cell (px) — the
   *  document's `unorderedLists.gap` at the body-cell size. */
  listGapPx: number;
  /** Document palette, for palette-linked cell fills and swatch colours. */
  palette?: ColorPaletteEntry[];
  /** Chip styles, for inline `:chip[…]` in cells. */
  chips?: ChipContext;
  /** `codeStyle.inline`, for the inline code of cells; unset, inline code
   *  is set in the cell's face. */
  inlineCode?: ResolvedInlineCodeStyleConfig;
  /** The document's CJK settings, for the annotations of cells
   *  ({@link annotatedSpans}). */
  annotations: AnnotationScope;
  /** The document's maths settings, for the formulas of cells (#541). */
  math?: ResolvedMathConfig;
}

/**
 * Measure a cell's content: paragraphs separated by hard line breaks, each
 * either plain text or a list item. An item hangs its text off its marker —
 * the marker is painted as authored ("•", "–", "1."), the text starts after
 * `listGapPx`, and wrapped lines align with the text — nested two spaces per
 * level. Every plain character of the content survives in the produced
 * segments (the marker and its whitespace included), so the sandbox's
 * glyph → snippet mapping stays exact.
 */
function measureCellContent(
  spans: InlineSpan[],
  set: CellFontSet,
  width: number,
  textAlign: TableCellAlign,
  listGapPx: number,
): { lines: VDTLine[]; totalHeight: number } {
  const paragraphs = splitCellParagraphs(spans);
  const lines: VDTLine[] = [];
  let y = 0;
  const tracking = set.letterSpacingPx ?? 0;
  const measure = (ps: InlineSpan[], w: number) => {
    const m = measureSnippet(
      ps, set.fontString, set.boldFontString, set.italicFontString, set.boldItalicFontString,
      Math.max(1, w), set.lineHeightPx, tracking !== 0 ? { textAlign: 'left', letterSpacingPx: tracking } : { textAlign: 'left' },
    );
    const linked = linkSegments(m.lines, ps);
    return { ...m, lines: tracking !== 0 ? linked.map((line) => ({ ...line, letterSpacing: tracking })) : linked };
  };
  // Plain paragraphs follow the cell's horizontal alignment: the measurer
  // sets every line flush left at its natural width, so a centred or
  // right-aligned line is pushed over by the slack. List items stay flush
  // left (their markers align). The tracking after a tracked line's last
  // letter is advance, not ink, and is left out (EF-153).
  const slack = (line: VDTLine): number => {
    const ink = line.bbox.width - lineTrailingTracking(line, tracking);
    return textAlign === 'center' ? Math.max(0, (width - ink) / 2)
      : textAlign === 'right' ? Math.max(0, width - ink)
        : 0;
  };
  // Marker columns of the open items: an item nests under the one it is
  // indented past (#465); a plain paragraph closes the list.
  let openItems: readonly number[] = [];
  for (const paragraph of paragraphs) {
    const item = takeCellItemMarker(paragraph);
    if (!item) {
      openItems = [];
      const m = measure(paragraph, width);
      lines.push(...m.lines.map((line) => shiftLines([line], slack(line), y)[0]!));
      y += m.lines.length * set.lineHeightPx;
      continue;
    }
    const markerWidth = measureTextWidth(item.marker.text, set.fontString) + tracking * graphemeCount(item.marker.text);
    const indentPx = markerWidth + listGapPx;
    openItems = nestListItem(openItems, item.marker.column);
    const levelOffset = (listDepth(openItems) - 1) * indentPx;
    const textX = levelOffset + indentPx;
    const m = measure(item.spans, width - textX);
    m.lines.forEach((line, i) => {
      if (i === 0) {
        const head: VDTLineSegment[] = [
          { kind: 'text', text: item.marker.text, width: markerWidth },
          { kind: 'space', text: item.marker.ws, width: indentPx - markerWidth },
        ];
        lines.push({
          ...line,
          text: `${item.marker.text}${item.marker.ws}${line.text}`,
          bbox: createBoundingBox(levelOffset, line.bbox.y + y, indentPx + line.bbox.width, line.bbox.height),
          baseline: line.baseline + y,
          segments: [...head, ...(line.segments ?? [])],
        });
      } else {
        lines.push({
          ...line,
          bbox: createBoundingBox(textX + line.bbox.x, line.bbox.y + y, line.bbox.width, line.bbox.height),
          baseline: line.baseline + y,
        });
      }
    });
    y += m.lines.length * set.lineHeightPx;
  }
  return { lines, totalHeight: y };
}

/** A cell image resolved to its resource and fitted into the cell's inner
 *  width: the payload ids plus the box it takes, relative to the cell's
 *  content origin (top-left inside the padding). */
interface FittedCellImage {
  resourceId: string;
  kind: 'bitmap' | 'svg';
  fileId: string;
  format?: string;
  pdfFileId?: string;
  altText?: string;
  x: number;
  width: number;
  height: number;
}

/**
 * Resolve `TableCell.image` against the document's resources and size it:
 * the image takes `image.width` of the cell's inner width (all of it by
 * default) with its aspect ratio kept — a bitmap narrower than that keeps
 * its intrinsic size, like a floated figure — and sits at the cell's
 * horizontal alignment. An id that matches no bitmap / SVG resource, or a
 * payload without a file, yields null and the cell lays out text-only.
 */
function fitCellImage(
  image: TableCell['image'],
  align: TableCellAlign,
  innerWidth: number,
  resources: Resource[],
  dpi: number,
): FittedCellImage | null {
  if (!image) return null;
  const resource = resources.find((r) => r.id === image.resourceId);
  if (!resource) return null;
  const fraction = image.width !== undefined && Number.isFinite(image.width) && image.width > 0
    ? Math.min(1, image.width)
    : 1;
  const target = Math.max(1, innerWidth * fraction);
  let fileId: string | undefined;
  let format: string | undefined;
  let pdfFileId: string | undefined;
  let kind: 'bitmap' | 'svg';
  let width: number;
  let height: number;
  if (resource.kind === 'bitmap' && resource.bitmap) {
    kind = 'bitmap';
    fileId = resource.bitmap.fileId;
    format = resource.bitmap.format;
    // At its natural print size (#631), never enlarged.
    const natural = bitmapLayoutSize(resource.bitmap, dpi);
    const fit = fitWidth(natural.width, natural.height, target);
    width = fit.width;
    height = fit.height;
  } else if (resource.kind === 'svg' && resource.svg) {
    kind = 'svg';
    fileId = resource.svg.fileId;
    pdfFileId = resource.svg.pdfFileId;
    const iw = resource.svg.width ?? 0;
    const ih = resource.svg.height ?? 0;
    width = target;
    height = iw > 0 && ih > 0 ? target * (ih / iw) : target * 0.75;
  } else {
    return null;
  }
  if (!fileId) return null;
  const x = align === 'center' ? (innerWidth - width) / 2 : align === 'right' ? innerWidth - width : 0;
  const altText = resource.altText ?? resource.caption;
  return { resourceId: resource.id, kind, fileId, format, pdfFileId, altText, x: Math.max(0, x), width, height };
}

/**
 * The physical alignment of a cell's content (#371). Cell text reads its
 * alignment in its own direction, as body text does: `'left'` / `'start'`
 * is the side a line starts on, `'right'` / `'end'` the side it ends on. In
 * a table that runs against its frame (`Resource.table.direction`: an
 * English table in an Arabic book, whose mirrored flow's right is the
 * sheet's left) that start side is the frame's right.
 */
function cellAlignOf(align: TableCellAlignKeyword | undefined, opposite: boolean): TableCellAlign {
  const side = startEndAsLeftRight(align ?? 'left');
  if (!opposite || side === 'center') return side;
  return side === 'left' ? 'right' : 'left';
}

/** Share of a cell's spare height that goes above its content. */
const VERTICAL_ALIGN_FACTOR: Readonly<Record<TableCellVerticalAlign, number>> = { top: 0, middle: 0.5, bottom: 1 };

/** Lay out an HTML-table resource: weighted column split (see
 *  {@link computeColumnEdges}), per-cell rich-text measurement, row height =
 *  max measured cell height. Rowspans reserve their primary cell's full
 *  vertical extent. `selection` restricts the layout to those model rows
 *  (in order) for a slice; cells keep their model row index. The row metrics
 *  are reported for a full layout only. */
export function layoutTable(
  model: TableModel,
  columnWidth: number,
  style: TableLayoutStyle,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle: { bold: boolean; italic: boolean; labelNumberGap?: string; breakLabels?: boolean },
  selection?: readonly number[],
  /** The table's own direction (`Resource.table.direction`), when it
   *  opposes its frame's: its cells are measured in it, its first column
   *  goes to the frame's right and its cells align from that side. */
  opposite?: 'ltr' | 'rtl',
): { layout: VDTResourceTableLayout; height: number; metrics?: TableRowMetrics } {
  if (opposite && opposite !== getMeasureDirection()) {
    const frame = getMeasureDirection();
    setMeasureDirection(opposite);
    try {
      return mirrorTableLayout(layoutTableIn(model, columnWidth, style, resourceNumbering, resourceTypes, resources, refStyle, selection, true), columnWidth);
    } finally {
      setMeasureDirection(frame);
    }
  }
  return layoutTableIn(model, columnWidth, style, resourceNumbering, resourceTypes, resources, refStyle, selection, false);
}

/** {@link layoutTable} with the cells' alignments read against the frame
 *  (`opposite`: the table runs the other way, see {@link cellAlignOf}). */
function layoutTableIn(
  model: TableModel,
  columnWidth: number,
  style: TableLayoutStyle,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle: { bold: boolean; italic: boolean; labelNumberGap?: string; breakLabels?: boolean },
  selection: readonly number[] | undefined,
  opposite: boolean,
): { layout: VDTResourceTableLayout; height: number; metrics?: TableRowMetrics } {
  const { body, header, borderColor, borderWidthPx, cellPaddingPx } = style;
  const modelRowCount = model.rows.length;
  const rows = selection ?? model.rows.map((_r, i) => i);
  const rowCount = rows.length;
  /** Slice index of each laid-out model row. */
  const sliceIndexOf = new Map<number, number>();
  rows.forEach((r, i) => sliceIndexOf.set(r, i));
  const colCount = modelRowCount > 0 ? Math.max(...model.rows.map((r) => r.length)) : 0;
  const columnEdges = computeColumnEdges(model, columnWidth);
  const spanWidth = (col: number, colSpan: number): number =>
    (columnEdges[Math.min(col + colSpan, colCount)] ?? columnWidth) - (columnEdges[col] ?? 0);
  /** Rows a primary cell at model row `r` spanning `rowSpan` rows covers
   *  within this layout: the run of its spanned rows that sit consecutively
   *  after it in the selection. */
  const spanInSlice = (si: number, r: number, rowSpan: number): number => {
    let n = 1;
    while (n < rowSpan && rows[si + n] === r + n) n++;
    return n;
  };

  // First pass: measure each primary cell's content height (single-row span
  // contribution); rowspan cells are distributed after row heights are known.
  interface Measured {
    row: number;
    sliceRow: number;
    col: number;
    colSpan: number;
    rowSpan: number;
    isHeader: boolean;
    align: TableCellAlign;
    verticalAlign: TableCellVerticalAlign;
    lines: VDTLine[];
    contentHeight: number;
    /** Height of the image + text stack, without padding — what
     *  `verticalAlign` moves inside a taller cell. */
    stackHeight: number;
    image: FittedCellImage | null;
    /** The cell's own fill (hex), when it has one. */
    background: string | undefined;
  }
  const measured: Measured[] = [];
  const rowMinHeight = new Array<number>(rowCount).fill(body.lineHeightPx);

  for (let si = 0; si < rowCount; si++) {
    const r = rows[si]!;
    const row = model.rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      let cell = row[c]!;
      if (cell.hiddenBy) {
        // Covered by a merge whose primary is laid out here and reaches this
        // row: skip. A primary left out of the slice (a rowspan running from
        // the header into the body) leaves an empty cell so the grid closes.
        const p = cell.hiddenBy;
        const primary = model.rows[p.row]?.[p.col];
        const psi = sliceIndexOf.get(p.row);
        const covered = primary !== undefined && psi !== undefined && psi <= si
          && spanInSlice(psi, p.row, Math.max(1, primary.rowSpan ?? 1)) > si - psi
          && c >= p.col && c < p.col + Math.max(1, primary.colSpan ?? 1);
        if (covered) continue;
        cell = { content: '', isHeader: cellIsHeader(primary ?? cell, p.row, model) };
      }
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      const rowSpan = spanInSlice(si, r, Math.max(1, cell.rowSpan ?? 1));
      const isHeader = cellIsHeader(cell, r, model);
      const set = isHeader ? header : body;
      const cellWidth = spanWidth(c, colSpan) - cellPaddingPx * 2;
      const parsed = snippetMathSpans(
        withSnippetInlineCode(parseInlineSnippetSpans(cell.content), cell.content, style.inlineCode, style.dpi, fontSizePxOf(set.fontString)),
        fontSizePxOf(set.fontString), set.lineHeightPx, style.math,
      );
      const spans = annotatedSpans(resolveCellChips(resolveSwatchSpans(resolveRefSpans(
        set.uppercase ? parsed.map((s) => (s.ref || s.math ? s : { ...s, text: uppercasePreservingLength(s.text) })) : parsed,
        resourceNumbering,
        resourceTypes,
        resources,
        refStyle,
      ), style.palette, resources, { dpi: style.dpi, fontSizePx: fontSizePxOf(set.fontString) }), style.chips, set), style.annotations, set.fontString);
      const align = cellAlignOf(cell.align, opposite);
      const m = measureCellContent(
        spans,
        set,
        Math.max(1, cellWidth),
        align,
        style.listGapPx,
      );
      // An embedded image sits at the top of the cell; the text (when
      // there is any) runs under it, a padding's worth below.
      const image = cell.hiddenBy ? null : fitCellImage(cell.image, align, Math.max(1, cellWidth), resources, style.dpi);
      const textHeight = m.totalHeight;
      const textY = image ? image.height + (textHeight > 0 ? cellPaddingPx : 0) : 0;
      const lines = image && textHeight > 0 ? shiftLines(m.lines, 0, textY) : m.lines;
      const stackHeight = image ? textY + textHeight : textHeight;
      const contentHeight = Math.max(set.lineHeightPx, stackHeight) + cellPaddingPx * 2;
      const background = cell.background && !cell.hiddenBy
        ? resolveColorValue(cell.background, style.palette, cell.background).hex
        : undefined;
      measured.push({
        row: r,
        sliceRow: si,
        col: c,
        colSpan,
        rowSpan,
        isHeader,
        align,
        verticalAlign: cell.verticalAlign ?? 'top',
        lines,
        contentHeight,
        stackHeight,
        image,
        background,
      });
      // Single-row cells drive their row's minimum height directly.
      if (rowSpan === 1) {
        rowMinHeight[si] = Math.max(rowMinHeight[si]!, contentHeight);
      }
    }
  }

  // Distribute rowspan cells: ensure the spanned rows together fit the content.
  for (const m of measured) {
    if (m.rowSpan <= 1) continue;
    let spannedHeight = 0;
    for (let si = m.sliceRow; si < m.sliceRow + m.rowSpan && si < rowCount; si++) {
      spannedHeight += rowMinHeight[si]!;
    }
    if (m.contentHeight > spannedHeight) {
      const lastRow = Math.min(m.sliceRow + m.rowSpan - 1, rowCount - 1);
      rowMinHeight[lastRow] = rowMinHeight[lastRow]! + (m.contentHeight - spannedHeight);
    }
  }

  const rowEdges: number[] = [0];
  for (let si = 0; si < rowCount; si++) rowEdges.push(rowEdges[si]! + rowMinHeight[si]!);
  const tableHeight = rowEdges[rowCount] ?? 0;

  // Row metrics for slice planning (full layouts only — a slice's rows are
  // a subset, so its heights say nothing about the rest).
  let metrics: TableRowMetrics | undefined;
  if (!selection) {
    const breakableAfter = new Array<boolean>(rowCount).fill(true);
    const groupHeaderRow = new Array<boolean>(rowCount).fill(false);
    const primaries = new Array<number>(rowCount).fill(0);
    const allHeader = new Array<boolean>(rowCount).fill(true);
    const fullSpan = new Array<boolean>(rowCount).fill(false);
    for (const m of measured) {
      for (let r = m.row; r < m.row + m.rowSpan - 1; r++) breakableAfter[r] = false;
      primaries[m.row] = (primaries[m.row] ?? 0) + 1;
      if (!m.isHeader) allHeader[m.row] = false;
      if (m.colSpan >= colCount) fullSpan[m.row] = true;
    }
    const headerRowCount = tableHeaderRowCount(model);
    for (let r = headerRowCount; r < rowCount; r++) {
      const p = primaries[r] ?? 0;
      // A single cell across every column heads the rows below it — in a
      // multi-column table. Every row of a one-column (boxed) table spans
      // it, and none of them is a heading.
      groupHeaderRow[r] = p > 0 && ((p === 1 && fullSpan[r] === true && colCount > 1) || allHeader[r] === true);
    }
    metrics = { rowHeights: [...rowMinHeight], headerRowCount, breakableAfter, groupHeaderRow };
  }

  // Zebra rows count the body rows from the first one after the header, by
  // model row: a continuation slice keeps every row's stripe, and a merged
  // cell takes the stripe of its first row.
  const zebra = style.bodyAlternateBackground !== undefined;
  const zebraFrom = zebra ? tableHeaderRowCount(model) : 0;
  const cells: VDTResourceTableCell[] = measured.map((m) => {
    const x0 = columnEdges[m.col] ?? 0;
    const x1 = columnEdges[Math.min(m.col + m.colSpan, colCount)] ?? columnWidth;
    const y0 = rowEdges[m.sliceRow] ?? 0;
    const y1 = rowEdges[Math.min(m.sliceRow + m.rowSpan, rowCount)] ?? tableHeight;
    const rect = createBoundingBox(x0, y0, x1 - x0, y1 - y0);
    // The image + text stack moves as one unit inside a cell taller than it
    // (a tall neighbour in the row, or rows a rowspan covers): top, centred
    // or at the bottom of the padded box.
    const slack = Math.max(0, y1 - y0 - cellPaddingPx * 2 - m.stackHeight);
    const top = y0 + cellPaddingPx + slack * VERTICAL_ALIGN_FACTOR[m.verticalAlign];
    // Lines already carry their horizontal alignment (measureCellContent).
    const placed = shiftLines(m.lines, x0 + cellPaddingPx, top);
    const image: VDTResourceTableCellImage | undefined = m.image
      ? {
          resourceId: m.image.resourceId,
          kind: m.image.kind,
          fileId: m.image.fileId,
          ...(m.image.format !== undefined ? { format: m.image.format } : {}),
          ...(m.image.altText !== undefined ? { altText: m.image.altText } : {}),
          ...(m.image.pdfFileId ? { pdfFileId: m.image.pdfFileId } : {}),
          rect: createBoundingBox(x0 + cellPaddingPx + m.image.x, top, m.image.width, m.image.height),
        }
      : undefined;
    return {
      row: m.row,
      col: m.col,
      colSpan: m.colSpan,
      rowSpan: m.rowSpan,
      isHeader: m.isHeader,
      align: m.align,
      verticalAlign: m.verticalAlign,
      rect,
      lines: placed,
      ...(image ? { image } : {}),
      ...(m.background !== undefined ? { background: m.background } : {}),
      ...(zebra && !m.isHeader && m.row >= zebraFrom && (m.row - zebraFrom) % 2 === 1 ? { alternate: true } : {}),
    };
  });

  const layout: VDTResourceTableLayout = {
    fontString: body.fontString,
    boldFontString: body.boldFontString,
    italicFontString: body.italicFontString,
    boldItalicFontString: body.boldItalicFontString,
    color: body.color,
    headerFontString: header.fontString,
    headerBoldFontString: header.boldFontString,
    headerItalicFontString: header.italicFontString,
    headerBoldItalicFontString: header.boldItalicFontString,
    headerColor: header.color,
    borderColor,
    borderWidthPx,
    headerBackground: style.headerBackground,
    bodyBackground: style.bodyBackground,
    ...(zebra ? { bodyAlternateBackground: style.bodyAlternateBackground } : {}),
    cells,
    columnEdges,
    rowEdges,
    rules: style.rules,
  };
  return metrics ? { layout, height: tableHeight, metrics } : { layout, height: tableHeight };
}

/**
 * A table laid out for a frame of the other direction, turned over its
 * vertical axis (#371): each cell's rect, its lines and its image move to
 * the mirror place in the table's width, so the first column lands on the
 * frame's right — the start side of the table. The lines themselves keep
 * their order (they read in the table's direction, measured in it); the
 * cells were already aligned from the mirrored side (`cellAlignOf`).
 */
function mirrorTableLayout<T extends { layout: VDTResourceTableLayout }>(result: T, width: number): T {
  const flip = (x: number, w: number): number => width - x - w;
  const cells = result.layout.cells.map((cell) => {
    const rect = createBoundingBox(flip(cell.rect.x, cell.rect.width), cell.rect.y, cell.rect.width, cell.rect.height);
    const dx = rect.x - cell.rect.x;
    const lines = dx === 0 ? cell.lines : cell.lines.map((line) => {
      const moved: VDTLine = { ...line, bbox: { ...line.bbox } };
      shiftLineX(moved, dx);
      return moved;
    });
    return {
      ...cell,
      rect,
      lines,
      ...(cell.image ? { image: { ...cell.image, rect: { ...cell.image.rect, x: cell.image.rect.x + dx } } } : {}),
    };
  });
  const columnEdges = result.layout.columnEdges.map((e) => width - e).reverse();
  return { ...result, layout: { ...result.layout, cells, columnEdges } };
}
