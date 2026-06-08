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
 *  - table: equal column split; each cell measured via the shared rich-text
 *    measurer; row height = max cell height (rowspans distribute across rows).
 *  - caption: measured via the rich-text measurer with the caption font, with
 *    the type's caption prefix + number prepended. Inline `:ref` spans resolve
 *    to their computed label and are tagged so renderers can colour / link them.
 *
 * Resource + caption are measured as one group; `totalHeight` is what goes to
 * placement (resources paginate atomically — no mid-split for v1).
 */

import type { InlineSpan } from '../parse';
import type {
  Resource,
  ResourceType,
  TableModel,
  TableCellAlign,
  TableCellVerticalAlign,
} from '../types';
import type {
  ResolvedConfig,
  ResolvedResourceBlock,
  VDTLine,
  VDTResourceTableCell,
  VDTResourceTableLayout,
} from '../vdt';
import { createBoundingBox } from '../vdt';
import { measureRichBlock } from '../measure';
import { parseInlineFormatting } from '../parse/inlineFormatting';
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
    const name = type?.name ?? type?.shortLabel ?? '';
    return name ? `${name}${NBSP}${number}` : number;
  }
  // default: short label + number (e.g. "Fig. 1.7")
  const short = type?.shortLabel ?? type?.name ?? '';
  return short ? `${short}${NBSP}${number}` : number;
}

/** Resolve inline `:ref` placeholder spans to plain text spans carrying the
 *  computed label. Each ref label is glued with NBSP so it remains a single
 *  token; the returned set records the exact label strings so a downstream pass
 *  can re-tag the produced segments with their `refResourceId`. */
function resolveCaptionSpans(
  spans: InlineSpan[],
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
): { spans: InlineSpan[]; refByLabel: Map<string, string> } {
  const refByLabel = new Map<string, string>();
  const out: InlineSpan[] = spans.map((span) => {
    if (!span.ref) return span;
    const rawLabel = resolveRefLabel(span.ref, resourceNumbering, resourceTypes, resources);
    const label = rawLabel.replace(/\s+/g, NBSP);
    refByLabel.set(label, span.ref.resourceId);
    return { text: label, bold: span.bold, italic: span.italic };
  });
  return { spans: out, refByLabel };
}

/** Tag segments whose text matches a resolved ref label with `refResourceId`,
 *  so renderers can recolour / link them. Mutates the supplied lines in place
 *  (they are freshly produced by the measurer and not shared). */
function tagRefSegments(lines: VDTLine[], refByLabel: Map<string, string>): void {
  if (refByLabel.size === 0) return;
  for (const line of lines) {
    if (!line.segments) continue;
    for (const seg of line.segments) {
      const id = refByLabel.get(seg.text);
      if (id !== undefined) seg.refResourceId = id;
    }
  }
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

interface TableCellStyleStrings {
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  color: string;
}

/** Lay out an HTML-table resource: equal column split, per-cell rich-text
 *  measurement, row height = max measured cell height. Rowspans reserve their
 *  primary cell's full vertical extent. */
function layoutTable(
  model: TableModel,
  columnWidth: number,
  styles: TableCellStyleStrings,
  lineHeightPx: number,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  borderColor: string,
  borderWidthPx: number,
  cellPaddingPx: number,
  headerBackground: string | undefined,
): { layout: VDTResourceTableLayout; height: number } {
  const rowCount = model.rows.length;
  const colCount = rowCount > 0 ? Math.max(...model.rows.map((r) => r.length)) : 0;
  const colWidth = colCount > 0 ? columnWidth / colCount : columnWidth;

  const columnEdges: number[] = [];
  for (let c = 0; c <= colCount; c++) columnEdges.push(c * colWidth);

  // First pass: measure each primary cell's content height (single-row span
  // contribution); rowspan cells are distributed after row heights are known.
  interface Measured {
    row: number;
    col: number;
    colSpan: number;
    rowSpan: number;
    isHeader: boolean;
    align: TableCellAlign;
    verticalAlign: TableCellVerticalAlign;
    lines: VDTLine[];
    contentHeight: number;
  }
  const measured: Measured[] = [];
  const rowMinHeight = new Array<number>(rowCount).fill(lineHeightPx);

  for (let r = 0; r < rowCount; r++) {
    const row = model.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (cell.hiddenBy) continue;
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const cellWidth = colSpan * colWidth - cellPaddingPx * 2;
      const { spans, refByLabel } = resolveCaptionSpans(
        parseInlineFormatting(cell.content),
        resourceNumbering,
        resourceTypes,
        resources,
      );
      const m = measureRichBlock(
        spans,
        styles.fontString,
        styles.boldFontString,
        styles.italicFontString,
        styles.boldItalicFontString,
        Math.max(1, cellWidth),
        lineHeightPx,
        { textAlign: cell.align === 'center' ? 'center' : cell.align === 'right' ? 'left' : 'left' },
      );
      tagRefSegments(m.lines, refByLabel);
      const contentHeight = Math.max(lineHeightPx, m.totalHeight) + cellPaddingPx * 2;
      measured.push({
        row: r,
        col: c,
        colSpan,
        rowSpan,
        isHeader: cell.isHeader ?? r < (model.headerRowCount ?? 0),
        align: cell.align ?? 'left',
        verticalAlign: cell.verticalAlign ?? 'top',
        lines: m.lines,
        contentHeight,
      });
      // Single-row cells drive their row's minimum height directly.
      if (rowSpan === 1) {
        rowMinHeight[r] = Math.max(rowMinHeight[r]!, contentHeight);
      }
    }
  }

  // Distribute rowspan cells: ensure the spanned rows together fit the content.
  for (const m of measured) {
    if (m.rowSpan <= 1) continue;
    let spannedHeight = 0;
    for (let r = m.row; r < m.row + m.rowSpan && r < rowCount; r++) {
      spannedHeight += rowMinHeight[r]!;
    }
    if (m.contentHeight > spannedHeight) {
      const lastRow = Math.min(m.row + m.rowSpan - 1, rowCount - 1);
      rowMinHeight[lastRow] = rowMinHeight[lastRow]! + (m.contentHeight - spannedHeight);
    }
  }

  const rowEdges: number[] = [0];
  for (let r = 0; r < rowCount; r++) rowEdges.push(rowEdges[r]! + rowMinHeight[r]!);
  const tableHeight = rowEdges[rowCount] ?? 0;

  const cells: VDTResourceTableCell[] = measured.map((m) => {
    const x0 = columnEdges[m.col] ?? 0;
    const x1 = columnEdges[Math.min(m.col + m.colSpan, colCount)] ?? columnWidth;
    const y0 = rowEdges[m.row] ?? 0;
    const y1 = rowEdges[Math.min(m.row + m.rowSpan, rowCount)] ?? tableHeight;
    const rect = createBoundingBox(x0, y0, x1 - x0, y1 - y0);
    // Place lines inside the cell with padding; horizontal alignment is applied
    // by the renderer via the cell rect + align flag.
    const placed = shiftLines(m.lines, x0 + cellPaddingPx, y0 + cellPaddingPx);
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
    };
  });

  const layout: VDTResourceTableLayout = {
    fontString: styles.fontString,
    boldFontString: styles.boldFontString,
    italicFontString: styles.italicFontString,
    boldItalicFontString: styles.boldItalicFontString,
    color: styles.color,
    borderColor,
    borderWidthPx,
    headerBackground,
    cells,
    columnEdges,
    rowEdges,
  };
  return { layout, height: tableHeight };
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

  const bodyStyle = resolveBodyStyle(resolved);
  const lineHeightPx = bodyStyle.lineHeightPx;
  const captionGapPx = lineHeightPx * 0.5;

  // --- Figure body -------------------------------------------------------
  let bodyWidth = columnWidth;
  let bodyHeight = 0;
  let table: VDTResourceTableLayout | undefined;
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
    const fit = fitWidth(0, 0, columnWidth);
    bodyWidth = fit.width;
    bodyHeight = fit.height;
  } else if (resource.kind === 'table' && resource.table) {
    const styles: TableCellStyleStrings = {
      fontString: bodyStyle.fontString,
      boldFontString: bodyStyle.boldFontString ?? bodyStyle.fontString,
      italicFontString: bodyStyle.italicFontString ?? bodyStyle.fontString,
      boldItalicFontString: bodyStyle.boldItalicFontString ?? bodyStyle.fontString,
      color: bodyStyle.color,
    };
    const borderWidthPx = Math.max(1, Math.round(resolved.page.dpi / 96));
    const cellPaddingPx = lineHeightPx * 0.25;
    const { layout, height } = layoutTable(
      resource.table.model,
      columnWidth,
      styles,
      lineHeightPx,
      resourceNumbering,
      resourceTypes,
      resources,
      bodyStyle.color,
      borderWidthPx,
      cellPaddingPx,
      // Light header tint — derived from the body colour at low alpha is not
      // available here as hex, so use a neutral light grey for v1.
      '#f0f0f0',
    );
    table = layout;
    bodyWidth = columnWidth;
    bodyHeight = height;
  }

  const bodyRect = createBoundingBox(0, 0, bodyWidth, bodyHeight);

  // --- Caption -----------------------------------------------------------
  const captionPrefix = resourceType?.captionPrefix ?? '';
  const linkColor = resolved.bodyText.color.hex;
  let captionLines: VDTLine[] = [];
  const captionText = resource.caption ?? '';
  const hasCaption = captionText.trim().length > 0 || captionPrefix.length > 0;
  if (hasCaption) {
    // Prefix span: "<captionPrefix> <number>. " (non-breaking inside the label).
    const prefixText = captionPrefix.length > 0
      ? `${captionPrefix}${NBSP}${number}.${number ? ' ' : ''}`
      : '';
    const captionSpans = parseInlineFormatting(captionText);
    const { spans: resolvedSpans, refByLabel } = resolveCaptionSpans(
      captionSpans,
      resourceNumbering,
      resourceTypes,
      resources,
    );
    const allSpans: InlineSpan[] = prefixText.length > 0
      ? [{ text: prefixText, bold: true, italic: false }, ...resolvedSpans]
      : resolvedSpans;
    const measured = measureRichBlock(
      allSpans,
      bodyStyle.fontString,
      bodyStyle.boldFontString ?? bodyStyle.fontString,
      bodyStyle.italicFontString ?? bodyStyle.fontString,
      bodyStyle.boldItalicFontString ?? bodyStyle.fontString,
      Math.max(1, columnWidth),
      lineHeightPx,
      { textAlign: 'left' },
    );
    tagRefSegments(measured.lines, refByLabel);
    captionLines = shiftLines(measured.lines, 0, bodyHeight + captionGapPx);
  }

  const captionHeight = captionLines.length > 0
    ? captionLines.length * lineHeightPx + captionGapPx
    : 0;
  const totalHeight = bodyHeight + captionHeight;

  const block: ResolvedResourceBlock = {
    resource,
    kind: resource.kind,
    number,
    captionPrefix,
    bodyRect,
    fileId,
    format,
    captionLines,
    captionFontString: bodyStyle.fontString,
    captionBoldFontString: bodyStyle.boldFontString ?? bodyStyle.fontString,
    captionItalicFontString: bodyStyle.italicFontString ?? bodyStyle.fontString,
    captionBoldItalicFontString: bodyStyle.boldItalicFontString ?? bodyStyle.fontString,
    captionColor: bodyStyle.color,
    linkColor,
    table,
  };

  return { block, totalHeight };
}
