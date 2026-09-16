/**
 * Resource block layout (issue #49 §7 — Measurement).
 *
 * Turns a `Resource` + its computed number into a measured, placement-ready
 * {@link ResolvedResourceBlock}. The result is fully self-contained so the
 * canvas / PDF renderers can draw it synchronously without touching the parser
 * or numbering pipeline again.
 *
 * Layout rules for v1 (kept intentionally simple — see the issue plan):
 *  - bitmap / svg: scale to the column width, preserving aspect ratio. The
 *    height follows from the intrinsic dimensions; svgs without intrinsic
 *    dimensions fall back to a 4:3 box at column width.
 *  - table: columns split by `TableModel.columnWidths` weights (equal split
 *    when unset); each cell measured via the shared rich-text measurer; row
 *    height = max cell height (rowspans distribute across rows).
 *  - caption: measured via the rich-text measurer with the caption font, with
 *    the type's caption prefix + number prepended. Inline `:ref` spans resolve
 *    to their computed label and are tagged so renderers can colour / link them.
 *    Sits below the body by default or above it (`captionStyle.position`),
 *    optionally on a background bar spanning the block width. A resource type
 *    may override the caption style partially (`ResourceType.captionStyle`).
 *  - note: an optional smaller run (`Resource.note`) placed under the body when
 *    the caption is above, otherwise under the caption.
 *
 * Resource + caption + note are measured as one group; `totalHeight` is what
 * goes to placement. Figures paginate atomically; a table taller than the
 * page can be laid out as a *slice* of its rows (`ResourceLayoutInput.slice`)
 * — a continuation repeats the header rows and suffixes the caption, and a
 * slice that goes on sets a marker under it and holds the note back for the
 * last one. {@link planTableSlice} picks the rows a slice can carry from the
 * row metrics the full-table layout reports.
 */

import type { InlineSpan, RefCase } from '../parse';
import type {
  ResolvedCaptionStyleConfig,
  Resource,
  ResourceType,
  TableCell,
  TableModel,
  TableCellAlign,
  TableCellVerticalAlign,
  TableRules,
} from '../types';
import type {
  ResolvedConfig,
  ResolvedResourceBlock,
  VDTLine,
  VDTResourceTableCell,
  VDTResourceTableCellImage,
  VDTLineSegment,
  VDTResourceTableLayout,
  VDTTableSlice,
} from '../vdt';
import { createBoundingBox } from '../vdt';
import { measureRichBlock, measureTextWidth, buildFontString } from '../measure';
import { dimensionToPx } from '../units';
// Caption / table-cell / note content is parsed with the shared snippet
// parser so measurement and the sandbox's glyph→snippet mapping agree on
// one span list (`:ref{…}` becomes a one-char placeholder span).
import { parseInlineSnippetSpans as parseRefAwareSpans } from '../parse/inlineSnippet';
import { mergeCaptionStyle } from '../defaults/captionStyle';
import { resolveBodyStyle } from './styles';
import type { ResourceNumberingMap } from './resourceNumbering';

/** Non-breaking space used to glue a resolved `:ref` label into a single
 *  atomic text token, so a post-measurement pass can tag it reliably. */
const NBSP = ' ';

export interface ResourceLayoutInput {
  resource: Resource;
  resourceType: ResourceType | undefined;
  number: string;
  resolved: ResolvedConfig;
  /** Available column width in px. */
  columnWidth: number;
  /** Full numbering map — lets inline `:ref`s inside the caption resolve. */
  resourceNumbering: ResourceNumberingMap;
  resourceTypes: ResourceType[];
  resources: Resource[];
  /** Lay out only these rows of a table (a slice of a table split across
   *  pages). Ignored for figures. */
  slice?: TableSliceSpec;
}

/** The rows a table slice carries. `startRow > 0` makes it a continuation:
 *  the header rows are repeated above `startRow` and the caption gets the
 *  continued suffix. `continues` sets the marker under the slice (and holds
 *  the note back). */
export interface TableSliceSpec {
  startRow: number;
  /** Exclusive. */
  endRow: number;
  continues: boolean;
}

/** Per-row metrics of a table laid out in full at some width, from which
 *  {@link planTableSlice} decides where a slice can end. Row heights are
 *  exact for any slice at the same width: every row is measured at the same
 *  column edges, and rowspans never straddle a break. */
export interface TableRowMetrics {
  /** Height of each model row in px (rowspan overflow already distributed). */
  rowHeights: number[];
  /** Leading header rows, repeated at the top of every continuation. */
  headerRowCount: number;
  /** Whether a slice may end after row `i` — no rowspan crosses the edge
   *  between `i` and `i + 1`. */
  breakableAfter: boolean[];
  /** Rows that head the rows below them (a single cell across every column,
   *  or all header cells): a slice never ends on one when it can help it. */
  groupHeaderRow: boolean[];
}

/** Build a label for an inline `:ref` to a resource, honouring its `style` and
 *  optional override `text`. Mirrors the caption-prefix conventions. */
export function resolveRefLabel(
  ref: NonNullable<InlineSpan['ref']>,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
): string {
  if (ref.text !== undefined && ref.text.length > 0) return ref.text;
  const entry = resourceNumbering[ref.resourceId];
  const number = entry?.number ?? '?';
  if (ref.style === 'number') return number;
  const resource = resources.find((r) => r.id === ref.resourceId);
  const type = resource ? resourceTypes.find((t) => t.id === resource.typeId) : undefined;
  if (ref.style === 'full') {
    const name = applyRefCase(type?.name ?? type?.shortLabel ?? '', ref.case);
    return name ? `${name}${NBSP}${number}` : number;
  }
  // default: short label + number (e.g. "Fig. 1.7")
  const short = applyRefCase(type?.shortLabel ?? type?.name ?? '', ref.case);
  return short ? `${short}${NBSP}${number}` : number;
}

/** Apply a `:ref{case=…}` transform to the label part of a computed
 *  reference (`Fig.` / `Figure`). The number is never touched — the caller
 *  joins it afterwards — and `text=` overrides bypass this entirely. */
function applyRefCase(label: string, refCase: RefCase | undefined): string {
  if (refCase === undefined || label.length === 0) return label;
  switch (refCase) {
    case 'lower':
      return label.toLocaleLowerCase();
    case 'upper':
      return label.toLocaleUpperCase();
    case 'capitalize': {
      const first = [...label][0]!;
      return first.toLocaleUpperCase() + label.slice(first.length);
    }
  }
}

/** Resolve inline `:ref` spans to their computed label, keeping the `ref`
 *  metadata so the rich-text measurer treats each label as one atomic,
 *  non-breaking token and tags the produced segment with `refResourceId`. */
export function resolveRefSpans(
  spans: InlineSpan[],
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle?: { bold: boolean; italic: boolean },
): InlineSpan[] {
  if (!spans.some((s) => s.ref)) return spans;
  return spans.map((span) => {
    if (!span.ref) return span;
    return {
      ...span,
      text: resolveRefLabel(span.ref, resourceNumbering, resourceTypes, resources),
      // Reference labels carry their own emphasis (bold/italic) so the measurer
      // selects the matching font; colour is applied by renderers via
      // `refResourceId`.
      bold: refStyle?.bold ?? span.bold,
      italic: refStyle?.italic ?? span.italic,
    };
  });
}

/** Offset every line's bbox / baseline by `dy` (block-relative → block-relative
 *  shifted). Returns new line objects (FP-first). */
function shiftLines(lines: VDTLine[], dx: number, dy: number): VDTLine[] {
  return lines.map((line) => ({
    ...line,
    bbox: createBoundingBox(line.bbox.x + dx, line.bbox.y + dy, line.bbox.width, line.bbox.height),
    baseline: line.baseline + dy,
  }));
}

/** Compute the displayed (column-fitted, aspect-preserved) size of a bitmap. */
function fitWidth(intrinsicW: number, intrinsicH: number, columnWidth: number): { width: number; height: number } {
  if (intrinsicW <= 0 || intrinsicH <= 0) {
    // No intrinsic dims — default to a 4:3 box at column width.
    return { width: columnWidth, height: columnWidth * 0.75 };
  }
  const width = Math.min(intrinsicW, columnWidth);
  const height = (intrinsicH / intrinsicW) * width;
  return { width, height };
}

/** One resolved font set (normal / bold / italic / bold+italic), its colour,
 *  and its line height, for either the body or header cells of a table. */
interface CellFontSet {
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  color: string;
  lineHeightPx: number;
}

/** Fully-resolved table styling consumed by {@link layoutTable}. */
interface TableLayoutStyle {
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
  /** Which rules to stroke. */
  rules: TableRules;
  /** Gap between a list marker and its text inside a cell (px) — the
   *  document's `unorderedLists.gap` at the body-cell size. */
  listGapPx: number;
}

/** A list-item marker at the head of a cell paragraph: the glyph as
 *  authored, the whitespace that follows it, and the nesting depth (from the
 *  leading indentation, two spaces per level). */
interface CellItemMarker {
  text: string;
  ws: string;
  level: number;
}

/** Markers a cell paragraph may open with: bullets, dashes, a number with
 *  its dot or bracket — followed by whitespace and some text. */
const CELL_ITEM_MARKER = /^(\s*)([•·◦○▪‣\-*–—]|\d{1,3}[.)])(\s+)(?=\S)/;

/** Split a cell's spans into paragraphs at hard line breaks (`\n`). The
 *  break characters are dropped; an empty paragraph (a blank line) is kept
 *  out — the measurer would skip it as whitespace anyway. */
function splitCellParagraphs(spans: InlineSpan[]): InlineSpan[][] {
  const out: InlineSpan[][] = [];
  let current: InlineSpan[] = [];
  const flush = () => {
    if (current.some((sp) => sp.text.trim().length > 0)) out.push(current);
    current = [];
  };
  for (const span of spans) {
    if (span.ref || span.math || !span.text.includes('\n')) {
      current.push(span);
      continue;
    }
    const pieces = span.text.split('\n');
    pieces.forEach((piece, i) => {
      if (i > 0) flush();
      if (piece.length > 0) current.push({ ...span, text: piece });
    });
  }
  flush();
  return out;
}

/** Detach a list marker from the head of a paragraph, when it opens with
 *  one. Returns the marker and the spans with it stripped. */
function takeCellItemMarker(spans: InlineSpan[]): { marker: CellItemMarker; spans: InlineSpan[] } | null {
  const first = spans[0];
  if (!first || first.ref || first.math) return null;
  const m = CELL_ITEM_MARKER.exec(first.text);
  if (!m) return null;
  const [whole, indent, text, ws] = m as unknown as [string, string, string, string];
  const rest = first.text.slice(whole.length);
  const stripped = rest.length > 0 ? [{ ...first, text: rest }, ...spans.slice(1)] : spans.slice(1);
  return { marker: { text, ws, level: Math.min(5, 1 + Math.floor(indent.length / 2)) }, spans: stripped };
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
  const measure = (ps: InlineSpan[], w: number) => measureRichBlock(
    ps, set.fontString, set.boldFontString, set.italicFontString, set.boldItalicFontString,
    Math.max(1, w), set.lineHeightPx, { textAlign: 'left' },
  );
  // Plain paragraphs follow the cell's horizontal alignment: the measurer
  // sets every line flush left at its natural width, so a centred or
  // right-aligned line is pushed over by the slack. List items stay flush
  // left (their markers align).
  const slack = (line: VDTLine): number =>
    textAlign === 'center' ? Math.max(0, (width - line.bbox.width) / 2)
      : textAlign === 'right' ? Math.max(0, width - line.bbox.width)
        : 0;
  for (const paragraph of paragraphs) {
    const item = takeCellItemMarker(paragraph);
    if (!item) {
      const m = measure(paragraph, width);
      lines.push(...m.lines.map((line) => shiftLines([line], slack(line), y)[0]!));
      y += m.lines.length * set.lineHeightPx;
      continue;
    }
    const markerWidth = measureTextWidth(item.marker.text, set.fontString);
    const indentPx = markerWidth + listGapPx;
    const levelOffset = (item.marker.level - 1) * indentPx;
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
  let kind: 'bitmap' | 'svg';
  let width: number;
  let height: number;
  if (resource.kind === 'bitmap' && resource.bitmap) {
    kind = 'bitmap';
    fileId = resource.bitmap.fileId;
    format = resource.bitmap.format;
    const fit = fitWidth(resource.bitmap.width, resource.bitmap.height, target);
    width = fit.width;
    height = fit.height;
  } else if (resource.kind === 'svg' && resource.svg) {
    kind = 'svg';
    fileId = resource.svg.fileId;
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
  return { resourceId: resource.id, kind, fileId, format, altText, x: Math.max(0, x), width, height };
}

/** Smallest border thickness (px) we let through: thinner rules would vanish
 *  on screen, but 0.5pt (≈0.67px at 96dpi) hairlines must survive intact —
 *  the previous `max(1, round(px))` rounded them up to a full pixel. */
const MIN_BORDER_PX = 0.25;

/**
 * Column x-edges (length = columnCount + 1) for a table model laid out at
 * `columnWidth`. `TableModel.columnWidths` are relative weights, normalised so
 * they always fill the width exactly; a missing array, a wrong length, or any
 * non-positive / non-finite weight falls back to an equal split.
 */
export function computeColumnEdges(model: TableModel, columnWidth: number): number[] {
  const colCount = model.rows.length > 0 ? Math.max(...model.rows.map((r) => r.length)) : 0;
  const weights = model.columnWidths;
  const valid = weights !== undefined
    && weights.length === colCount
    && weights.every((w) => Number.isFinite(w) && w > 0);
  const edges: number[] = [0];
  if (colCount === 0) return edges;
  if (!valid) {
    const colWidth = columnWidth / colCount;
    for (let c = 1; c <= colCount; c++) edges.push(c * colWidth);
    return edges;
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let c = 0; c < colCount; c++) {
    acc += (weights[c]! / total) * columnWidth;
    edges.push(acc);
  }
  // Snap the last edge so floating-point drift never leaves a sliver.
  edges[colCount] = columnWidth;
  return edges;
}

/** Number of leading header rows of a table: `headerRowCount` when the
 *  model declares it, else the leading run of rows whose visible cells are
 *  all header cells. Never the whole table — a continuation needs at least
 *  one body row to carry. */
export function tableHeaderRowCount(model: TableModel): number {
  const rowCount = model.rows.length;
  if (rowCount === 0) return 0;
  const declared = model.headerRowCount ?? 0;
  let count = 0;
  if (declared > 0) {
    count = declared;
  } else {
    for (const row of model.rows) {
      const visible = row.filter((c) => !c.hiddenBy);
      if (visible.length === 0 || !visible.every((c) => c.isHeader)) break;
      count++;
    }
  }
  return Math.max(0, Math.min(count, rowCount - 1));
}

/** Whether a table cell is painted as a header cell. */
const cellIsHeader = (cell: TableCell, row: number, model: TableModel): boolean =>
  cell.isHeader ?? row < (model.headerRowCount ?? 0);

/** The model rows a slice lays out, in order: the header rows (repeated on a
 *  continuation) followed by the slice's own rows. */
export function tableSliceRows(model: TableModel, slice: TableSliceSpec): number[] {
  const headerRows = tableHeaderRowCount(model);
  const rowCount = model.rows.length;
  const start = Math.max(0, Math.min(slice.startRow, rowCount));
  const end = Math.max(start, Math.min(slice.endRow, rowCount));
  const rows: number[] = [];
  if (start > 0) {
    for (let r = 0; r < headerRows; r++) rows.push(r);
    for (let r = Math.max(start, headerRows); r < end; r++) rows.push(r);
  } else {
    for (let r = start; r < end; r++) rows.push(r);
  }
  return rows;
}

/**
 * Where a slice starting at `startRow` can end so that its rows (plus the
 * repeated header rows of a continuation) stay within `bodyBudget` px: the
 * furthest row edge no rowspan straddles, backed off a group-header row so
 * the heading opens the rows it heads on the next page. Returns the
 * exclusive end row — `startRow` when not even one row fits, the row count
 * when the whole rest fits.
 */
export function planTableSlice(metrics: TableRowMetrics, startRow: number, bodyBudget: number): number {
  const { rowHeights, headerRowCount, breakableAfter, groupHeaderRow } = metrics;
  const rowCount = rowHeights.length;
  const start = Math.max(0, Math.min(startRow, rowCount));
  // A continuation carries the header rows again; the first slice includes
  // them as ordinary leading rows.
  const firstBody = start > 0 ? Math.max(start, headerRowCount) : start;
  let acc = 0;
  if (start > 0) for (let r = 0; r < headerRowCount; r++) acc += rowHeights[r] ?? 0;
  let best = start;
  for (let r = firstBody; r < rowCount; r++) {
    acc += rowHeights[r] ?? 0;
    if (acc > bodyBudget + 0.01) break;
    if (breakableAfter[r] ?? true) best = r + 1;
  }
  // The first slice must carry a body row past the header; a continuation
  // at least its first row. Below that floor the caller decides.
  const floor = (start > 0 ? firstBody : headerRowCount) + 1;
  // Back off group heads left at the cut, but only when a row that is not
  // one remains: a run of nothing but heads is not a heading at all.
  let cut = best;
  while (cut > floor && groupHeaderRow[cut - 1]) cut--;
  return cut > floor || best <= floor ? cut : best;
}

/** Lay out an HTML-table resource: weighted column split (see
 *  {@link computeColumnEdges}), per-cell rich-text measurement, row height =
 *  max measured cell height. Rowspans reserve their primary cell's full
 *  vertical extent. `selection` restricts the layout to those model rows
 *  (in order) for a slice; cells keep their model row index. The row metrics
 *  are reported for a full layout only. */
function layoutTable(
  model: TableModel,
  columnWidth: number,
  style: TableLayoutStyle,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle: { bold: boolean; italic: boolean },
  selection?: readonly number[],
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
    image: FittedCellImage | null;
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
      const spans = resolveRefSpans(
        parseRefAwareSpans(cell.content),
        resourceNumbering,
        resourceTypes,
        resources,
        refStyle,
      );
      const m = measureCellContent(
        spans,
        set,
        Math.max(1, cellWidth),
        cell.align ?? 'left',
        style.listGapPx,
      );
      // An embedded image sits at the top of the cell; the text (when
      // there is any) runs under it, a padding's worth below.
      const image = cell.hiddenBy ? null : fitCellImage(cell.image, cell.align ?? 'left', Math.max(1, cellWidth), resources);
      const textHeight = m.totalHeight;
      const textY = image ? image.height + (textHeight > 0 ? cellPaddingPx : 0) : 0;
      const lines = image && textHeight > 0 ? shiftLines(m.lines, 0, textY) : m.lines;
      const stackHeight = image ? textY + textHeight : textHeight;
      const contentHeight = Math.max(set.lineHeightPx, stackHeight) + cellPaddingPx * 2;
      measured.push({
        row: r,
        sliceRow: si,
        col: c,
        colSpan,
        rowSpan,
        isHeader,
        align: cell.align ?? 'left',
        verticalAlign: cell.verticalAlign ?? 'top',
        lines,
        contentHeight,
        image,
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

  const cells: VDTResourceTableCell[] = measured.map((m) => {
    const x0 = columnEdges[m.col] ?? 0;
    const x1 = columnEdges[Math.min(m.col + m.colSpan, colCount)] ?? columnWidth;
    const y0 = rowEdges[m.sliceRow] ?? 0;
    const y1 = rowEdges[Math.min(m.sliceRow + m.rowSpan, rowCount)] ?? tableHeight;
    const rect = createBoundingBox(x0, y0, x1 - x0, y1 - y0);
    // Place lines inside the cell with padding; horizontal alignment is applied
    // by the renderer via the cell rect + align flag.
    const placed = shiftLines(m.lines, x0 + cellPaddingPx, y0 + cellPaddingPx);
    const image: VDTResourceTableCellImage | undefined = m.image
      ? {
          resourceId: m.image.resourceId,
          kind: m.image.kind,
          fileId: m.image.fileId,
          ...(m.image.format !== undefined ? { format: m.image.format } : {}),
          ...(m.image.altText !== undefined ? { altText: m.image.altText } : {}),
          rect: createBoundingBox(x0 + cellPaddingPx + m.image.x, y0 + cellPaddingPx, m.image.width, m.image.height),
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
    cells,
    columnEdges,
    rowEdges,
    rules: style.rules,
  };
  return metrics ? { layout, height: tableHeight, metrics } : { layout, height: tableHeight };
}

/**
 * Measure a resource block (image / svg / table) plus its caption into a
 * placement-ready {@link ResolvedResourceBlock}. Returns the block and its
 * combined height (figure body + gap + caption) — the value placement uses to
 * decide whether the group fits the remaining column space.
 */
export function layoutResourceBlock(input: ResourceLayoutInput): {
  block: ResolvedResourceBlock;
  totalHeight: number;
  /** Row metrics of a table laid out in full (no `slice`), for
   *  {@link planTableSlice}. */
  tableRows?: TableRowMetrics;
} {
  const {
    resource,
    resourceType,
    number,
    resolved,
    columnWidth,
    resourceNumbering,
    resourceTypes,
    resources,
  } = input;
  // A slice only applies to tables; a slice covering the whole table from
  // row 0 is the full table (no continuation marks).
  const model = resource.kind === 'table' ? resource.table?.model : undefined;
  const slice: VDTTableSlice | undefined = model && input.slice
    && (input.slice.startRow > 0 || input.slice.endRow < model.rows.length || input.slice.continues)
    ? {
        startRow: Math.max(0, Math.min(input.slice.startRow, model.rows.length)),
        endRow: Math.max(0, Math.min(input.slice.endRow, model.rows.length)),
        continued: input.slice.startRow > 0,
        continues: input.slice.continues,
      }
    : undefined;

  const bodyStyle = resolveBodyStyle(resolved);
  const dpi = resolved.page.dpi;
  // Normal / bold weights reused for table + caption font sets.
  const normalWeight = resolved.bodyText.fontWeight.toString();
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  // Line-height ratio of the body text — applied to any custom table/caption
  // font size so a resized run keeps a proportional leading (and reproduces the
  // previous heights exactly when the size is left at the body default).
  const lineHeightRatio = bodyStyle.lineHeightPx / bodyStyle.fontSizePx;
  // Inline `:ref` emphasis (bold/italic), applied to refs in captions + cells.
  const refStyle = { bold: resolved.bodyText.referenceBold, italic: resolved.bodyText.referenceItalic };

  // --- Figure body -------------------------------------------------------
  let bodyWidth = columnWidth;
  let bodyHeight = 0;
  let table: VDTResourceTableLayout | undefined;
  let tableRows: TableRowMetrics | undefined;
  let fileId: string | undefined;
  let format: string | undefined;

  if (resource.kind === 'bitmap' && resource.bitmap) {
    fileId = resource.bitmap.fileId;
    format = resource.bitmap.format;
    const fit = fitWidth(resource.bitmap.width, resource.bitmap.height, columnWidth);
    bodyWidth = fit.width;
    bodyHeight = fit.height;
  } else if (resource.kind === 'svg' && resource.svg) {
    fileId = resource.svg.fileId;
    // SVGs are vector: fill the column width and derive height from the
    // intrinsic aspect ratio (viewBox / width:height). Fall back to a 4:3 box
    // only when no intrinsic size was captured.
    const iw = resource.svg.width ?? 0;
    const ih = resource.svg.height ?? 0;
    bodyWidth = columnWidth;
    bodyHeight = iw > 0 && ih > 0 ? columnWidth * (ih / iw) : columnWidth * 0.75;
  } else if (resource.kind === 'table' && resource.table) {
    const ts = resolved.tableStyle;
    const bodyFontPx = dimensionToPx(ts.bodyFontSize, dpi);
    const headerFontPx = dimensionToPx(ts.headerFontSize, dpi);
    // Header weight/slant: the header's base run is bold (and/or italic) by
    // default; inline markup still toggles relative to that base, mirroring the
    // blockquote/heading italic-flip convention.
    const hWeight = ts.headerBold ? boldWeight : normalWeight;
    const hBase = ts.headerItalic ? 'italic' : 'normal';
    const hFlip = ts.headerItalic ? 'normal' : 'italic';
    const style: TableLayoutStyle = {
      body: {
        fontString: buildFontString(ts.bodyFontFamily, bodyFontPx, normalWeight),
        boldFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, boldWeight),
        italicFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, normalWeight, 'italic'),
        boldItalicFontString: buildFontString(ts.bodyFontFamily, bodyFontPx, boldWeight, 'italic'),
        color: ts.bodyColor.hex,
        lineHeightPx: bodyFontPx * lineHeightRatio,
      },
      header: {
        fontString: buildFontString(ts.headerFontFamily, headerFontPx, hWeight, hBase),
        boldFontString: buildFontString(ts.headerFontFamily, headerFontPx, boldWeight, hBase),
        italicFontString: buildFontString(ts.headerFontFamily, headerFontPx, hWeight, hFlip),
        boldItalicFontString: buildFontString(ts.headerFontFamily, headerFontPx, boldWeight, hFlip),
        color: ts.headerColor.hex,
        lineHeightPx: headerFontPx * lineHeightRatio,
      },
      borderColor: ts.borderColor.hex,
      borderWidthPx: ts.borders && ts.rules !== 'none'
        ? Math.max(MIN_BORDER_PX, dimensionToPx(ts.borderWidth, dpi))
        : 0,
      cellPaddingPx: dimensionToPx(ts.cellPadding, dpi, bodyFontPx),
      headerBackground: ts.headerBackgroundEnabled ? ts.headerBackground.hex : undefined,
      bodyBackground: ts.bodyBackgroundEnabled ? ts.bodyBackground.hex : undefined,
      rules: ts.rules,
      listGapPx: dimensionToPx(resolved.unorderedLists.gap, dpi, bodyFontPx),
    };
    const { layout, height, metrics } = layoutTable(
      resource.table.model,
      columnWidth,
      style,
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
      slice ? tableSliceRows(resource.table.model, slice) : undefined,
    );
    table = layout;
    tableRows = metrics;
    bodyWidth = columnWidth;
    bodyHeight = height;
  }

  // --- Caption -----------------------------------------------------------
  const cs: ResolvedCaptionStyleConfig = mergeCaptionStyle(
    resolved.captionStyle,
    resourceType?.captionStyle,
    resolved.colorPalette,
  );
  const captionFontPx = dimensionToPx(cs.fontSize, dpi);
  const captionLineHeightPx = captionFontPx * lineHeightRatio;
  const captionGapPx = dimensionToPx(cs.gap, dpi, captionFontPx);
  const captionPaddingPx = cs.backgroundEnabled ? dimensionToPx(cs.padding, dpi, captionFontPx) : 0;
  // Caption font set (label + description share one typeface/size; weight and
  // slant vary per span).
  const captionFontString = buildFontString(cs.fontFamily, captionFontPx, normalWeight);
  const captionBoldFontString = buildFontString(cs.fontFamily, captionFontPx, boldWeight);
  const captionItalicFontString = buildFontString(cs.fontFamily, captionFontPx, normalWeight, 'italic');
  const captionBoldItalicFontString = buildFontString(cs.fontFamily, captionFontPx, boldWeight, 'italic');

  const captionPrefix = resourceType?.captionPrefix ?? '';
  // Inline `:ref` labels render in the configured reference colour (defaults to
  // the emphasis/bold colour).
  const linkColor = resolved.bodyText.referenceColor.hex;
  // Caption lines measured at the block origin (y = 0); positioned below.
  let measuredCaption: VDTLine[] = [];
  const captionText = resource.caption ?? '';
  const hasCaption = captionText.trim().length > 0 || captionPrefix.length > 0;
  if (hasCaption) {
    // Prefix span: "<captionPrefix> <number>. " (non-breaking inside the label).
    const prefixText = captionPrefix.length > 0
      ? `${captionPrefix}${NBSP}${number}.${number ? ' ' : ''}`
      : '';
    const resolvedSpans = resolveRefSpans(
      parseRefAwareSpans(captionText),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    );
    // Description spans pick up the configured slant on top of their own markup.
    const descSpans: InlineSpan[] = cs.descriptionItalic
      ? resolvedSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : resolvedSpans;
    // A continued table slice: "Table 6-4. Title (cont.)" — the suffix is
    // set in italics after the description, glued to it by a plain space.
    const suffix = slice?.continued ? resolved.tableStyle.continuedSuffix.trim() : '';
    const suffixSpans: InlineSpan[] = suffix.length > 0
      ? [{ text: `${descSpans.length > 0 ? ' ' : ''}${suffix}`, bold: false, italic: true }]
      : [];
    const allSpans: InlineSpan[] = prefixText.length > 0
      ? [{ text: prefixText, bold: cs.labelBold, italic: cs.labelItalic, captionLabel: true }, ...descSpans, ...suffixSpans]
      : [...descSpans, ...suffixSpans];
    const measured = measureRichBlock(
      allSpans,
      captionFontString,
      captionBoldFontString,
      captionItalicFontString,
      captionBoldItalicFontString,
      Math.max(1, columnWidth - captionPaddingPx * 2),
      captionLineHeightPx,
      { textAlign: cs.align },
    );
    measuredCaption = measured.lines;
  }
  const captionTextHeight = measuredCaption.length * captionLineHeightPx;
  // Height of the caption band: the text plus the bar padding on both sides.
  const captionBandHeight = measuredCaption.length > 0
    ? captionTextHeight + captionPaddingPx * 2
    : 0;
  const captionHeight = captionBandHeight > 0 ? captionBandHeight + captionGapPx : 0;

  // --- Note --------------------------------------------------------------
  const noteFontPx = dimensionToPx(cs.note.fontSize, dpi);
  const noteLineHeightPx = noteFontPx * lineHeightRatio;
  const noteGapPx = dimensionToPx(cs.note.gap, dpi, noteFontPx);
  const noteFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight);
  const noteBoldFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight);
  const noteItalicFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight, 'italic');
  const noteBoldItalicFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight, 'italic');
  let measuredNote: VDTLine[] = [];
  const noteText = resource.note ?? '';
  // The note closes the table: a slice that continues holds it back for
  // the last slice.
  if (noteText.trim().length > 0 && !slice?.continues) {
    const noteSpans = resolveRefSpans(
      parseRefAwareSpans(noteText),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    );
    const slanted: InlineSpan[] = cs.note.italic
      ? noteSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : noteSpans;
    const measured = measureRichBlock(
      slanted,
      noteFontString,
      noteBoldFontString,
      noteItalicFontString,
      noteBoldItalicFontString,
      Math.max(1, columnWidth),
      noteLineHeightPx,
      { textAlign: cs.note.align },
    );
    measuredNote = measured.lines;
  }
  const noteHeight = measuredNote.length > 0
    ? measuredNote.length * noteLineHeightPx + noteGapPx
    : 0;

  // --- Continues marker --------------------------------------------------
  // "Continued" under a slice that goes on: the note's typeface and size,
  // italic, flush right — where the note would sit.
  let measuredContinues: VDTLine[] = [];
  const ts = resolved.tableStyle;
  const markerText = slice?.continues && ts.continuesMarkerEnabled ? ts.continuesMarker.trim() : '';
  if (markerText.length > 0) {
    const measured = measureRichBlock(
      [{ text: markerText, bold: false, italic: true }],
      noteFontString,
      noteBoldFontString,
      noteItalicFontString,
      noteBoldItalicFontString,
      Math.max(1, columnWidth),
      noteLineHeightPx,
      { textAlign: 'left' },
    );
    // Flush right: the measurer has no right alignment, so each line is
    // pushed to the block's right edge by its own width.
    measuredContinues = measured.lines.map((line) => ({
      ...line,
      bbox: createBoundingBox(columnWidth - line.bbox.width, line.bbox.y, line.bbox.width, line.bbox.height),
    }));
  }
  const continuesHeight = measuredContinues.length > 0
    ? measuredContinues.length * noteLineHeightPx + noteGapPx
    : 0;

  // --- Vertical stacking -------------------------------------------------
  // above: [caption band] gap [body] noteGap [note]
  // below: [body] gap [caption band] noteGap [note]
  const captionAbove = cs.position === 'above' && captionBandHeight > 0;
  const captionBandY = captionAbove ? 0 : bodyHeight + (captionBandHeight > 0 ? captionGapPx : 0);
  const bodyY = captionAbove ? captionHeight : 0;
  const bodyRect = createBoundingBox(0, bodyY, bodyWidth, bodyHeight);
  // Table cells were laid out with the table's top at y = 0; when the caption
  // sits above, move them down with the body (block-relative, like captions).
  if (table && bodyY > 0) {
    table = {
      ...table,
      cells: table.cells.map((cell) => ({
        ...cell,
        rect: createBoundingBox(cell.rect.x, cell.rect.y + bodyY, cell.rect.width, cell.rect.height),
        lines: shiftLines(cell.lines, 0, bodyY),
        ...(cell.image
          ? { image: { ...cell.image, rect: createBoundingBox(cell.image.rect.x, cell.image.rect.y + bodyY, cell.image.rect.width, cell.image.rect.height) } }
          : {}),
      })),
    };
  }
  const captionLines = shiftLines(measuredCaption, captionPaddingPx, captionBandY + captionPaddingPx);
  // A table's rules are stroked centred on the cell edges, so its outer
  // frame reaches half a stroke beyond the body on each side; the caption
  // bar spans that same outer extent, or it would read a hair narrower.
  const barOverhang = table ? table.borderWidthPx / 2 : 0;
  const captionBar = cs.backgroundEnabled && captionBandHeight > 0
    ? {
        rect: createBoundingBox(0 - barOverhang || 0, captionBandY, columnWidth + 2 * barOverhang, captionBandHeight),
        background: cs.background.hex,
      }
    : undefined;
  const noteY = (captionAbove ? bodyY + bodyHeight : bodyHeight + captionHeight) + noteGapPx;
  const noteLines = shiftLines(measuredNote, 0, noteY);
  // The marker takes the note's slot (a continuing slice has no note).
  const continuesLines = shiftLines(measuredContinues, 0, noteY);
  const totalHeight = bodyHeight + captionHeight + noteHeight + continuesHeight;

  const block: ResolvedResourceBlock = {
    resource,
    kind: resource.kind,
    ...(slice ? { slice } : {}),
    number,
    captionPrefix,
    bodyRect,
    fileId,
    format,
    captionLines,
    captionFontString,
    captionBoldFontString,
    captionItalicFontString,
    captionBoldItalicFontString,
    captionColor: cs.color.hex,
    captionLabelColor: cs.labelColor.hex,
    linkColor,
    table,
    captionBar,
    noteLines,
    noteFontString,
    noteBoldFontString,
    noteItalicFontString,
    noteBoldItalicFontString,
    noteColor: cs.note.color.hex,
    continuesLines,
  };

  return tableRows ? { block, totalHeight, tableRows } : { block, totalHeight };
}
