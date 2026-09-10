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
 * goes to placement (resources paginate atomically — no mid-split for v1).
 */

import type { InlineSpan, RefCase } from '../parse';
import type {
  ResolvedCaptionStyleConfig,
  Resource,
  ResourceType,
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
  VDTResourceTableLayout,
} from '../vdt';
import { createBoundingBox } from '../vdt';
import { measureRichBlock, buildFontString } from '../measure';
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

/** Lay out an HTML-table resource: weighted column split (see
 *  {@link computeColumnEdges}), per-cell rich-text measurement, row height =
 *  max measured cell height. Rowspans reserve their primary cell's full
 *  vertical extent. */
function layoutTable(
  model: TableModel,
  columnWidth: number,
  style: TableLayoutStyle,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle: { bold: boolean; italic: boolean },
): { layout: VDTResourceTableLayout; height: number } {
  const { body, header, borderColor, borderWidthPx, cellPaddingPx } = style;
  const rowCount = model.rows.length;
  const colCount = rowCount > 0 ? Math.max(...model.rows.map((r) => r.length)) : 0;
  const columnEdges = computeColumnEdges(model, columnWidth);
  const spanWidth = (col: number, colSpan: number): number =>
    (columnEdges[Math.min(col + colSpan, colCount)] ?? columnWidth) - (columnEdges[col] ?? 0);

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
  const rowMinHeight = new Array<number>(rowCount).fill(body.lineHeightPx);

  for (let r = 0; r < rowCount; r++) {
    const row = model.rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]!;
      if (cell.hiddenBy) continue;
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const isHeader = cell.isHeader ?? r < (model.headerRowCount ?? 0);
      const set = isHeader ? header : body;
      const cellWidth = spanWidth(c, colSpan) - cellPaddingPx * 2;
      const spans = resolveRefSpans(
        parseRefAwareSpans(cell.content),
        resourceNumbering,
        resourceTypes,
        resources,
        refStyle,
      );
      const m = measureRichBlock(
        spans,
        set.fontString,
        set.boldFontString,
        set.italicFontString,
        set.boldItalicFontString,
        Math.max(1, cellWidth),
        set.lineHeightPx,
        { textAlign: cell.align === 'center' ? 'center' : cell.align === 'right' ? 'left' : 'left' },
      );
      const contentHeight = Math.max(set.lineHeightPx, m.totalHeight) + cellPaddingPx * 2;
      measured.push({
        row: r,
        col: c,
        colSpan,
        rowSpan,
        isHeader,
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
    };
    const { layout, height } = layoutTable(
      resource.table.model,
      columnWidth,
      style,
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    );
    table = layout;
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
    const allSpans: InlineSpan[] = prefixText.length > 0
      ? [{ text: prefixText, bold: cs.labelBold, italic: cs.labelItalic, captionLabel: true }, ...descSpans]
      : descSpans;
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
  if (noteText.trim().length > 0) {
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
      })),
    };
  }
  const captionLines = shiftLines(measuredCaption, captionPaddingPx, captionBandY + captionPaddingPx);
  const captionBar = cs.backgroundEnabled && captionBandHeight > 0
    ? {
        rect: createBoundingBox(0, captionBandY, columnWidth, captionBandHeight),
        background: cs.background.hex,
      }
    : undefined;
  const noteY = (captionAbove ? bodyY + bodyHeight : bodyHeight + captionHeight) + noteGapPx;
  const noteLines = shiftLines(measuredNote, 0, noteY);
  const totalHeight = bodyHeight + captionHeight + noteHeight;

  const block: ResolvedResourceBlock = {
    resource,
    kind: resource.kind,
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
  };

  return { block, totalHeight };
}
