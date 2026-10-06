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

import { findAnchorTarget, resolveAnchorRefLabel, unprefixedId, type AnchorTargets, type CrossRefStrings } from './crossRefs';
import { measuringVertically, withMeasureWritingMode } from '../measure/vertical';
import { getMeasureDirection, setMeasureDirection, shiftLineX } from '../measure/bidiLines';
import type { InlineSpan, RefCase } from '../parse';
import { suffixJoiner } from '../parse/inlineFormatting';
import { resourceSafeArea, safeAreaHeightRange, safeAreaSource } from './safeArea';
import { layoutVideo } from './videoOverlay';
import type {
  ColorPaletteEntry,
  ResolvedCaptionStyleConfig,
  ResolvedCjkConfig,
  ResolvedMathConfig,
  Resource,
  ResourceSafeArea,
  ResourceRotation,
  ResourceType,
  TableCell,
  TableModel,
  TableCellAlign,
  TableCellAlignKeyword,
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
import type { MeasureBlockOptions } from '../measure';
import { isSwatchFill, measureRichSnippet } from '../measure/rich';
import { isBlankText } from '../measure/spaces';
import { linkSegments } from '../measure/links';
import { graphemeCount } from '../measure/graphemes';
import { dimensionToPx } from '../units';
// Caption / table-cell / note content is parsed with the shared snippet
// parser so measurement and the sandbox's glyph→snippet mapping agree on
// one span list (`:ref{…}` becomes a one-char placeholder span).
import { parseInlineSnippetSpans } from '../parse/inlineSnippet';
import { hasAnnotations, resolveAnnotationSpans } from './annotations';
import { sliceSpan } from '../parse/links';
import { indentColumn, listDepth, nestListItem } from '../parse/listNesting';
import { chipContextOf, fontSizePxOf, resolveChipSpans, type ChipContext } from './chips';
import { mergeCaptionStyle } from '../defaults/captionStyle';
import { pickTableStyle } from '../defaults/tableStyle';
import { resolveColorValue, startEndAsLeftRight } from '../defaults/shared';
import { resolveBodyStyle } from './styles';
import { uppercasePreservingLength } from './buildBlockKind';
import { lineTrailingTracking } from '../lineInk';
import type { ResourceNumberingMap } from './resourceNumbering';
import { resolveCitationSpans, type CaptionCitations } from './citations';
import { renderMath } from '../math';

/**
 * A caption's, a note's or a cell's spans with their Chinese and Japanese
 * annotations resolved as the running text resolves them (#429; the
 * marks of #193, #421, ruby #194, warichu #195): `*…*` on CJK characters
 * set with emphasis marks under `cjk.emphasis: 'dots'`, the region's mark
 * where a mark leaves it unset, book titles as `cjk.bookTitleMark` sets
 * them (brackets in the text, the wavy line, or plain), and the faces of
 * ruby readings and warichu notes at the size of `fontString` (the cell's,
 * the caption's or the note's). The measurer then sets readings and notes
 * and flags the marked segments; the marks are placed once the document is
 * laid out (`annotateDocument`), as on body lines. The same array when the
 * spans hold none of them, so plain captions and cells measure as before.
 */
function annotatedSpans(spans: InlineSpan[], scope: AnnotationScope, fontString: string): InlineSpan[] {
  if (!hasAnnotations(spans, scope.cjk)) return spans;
  return resolveAnnotationSpans(spans, { cjk: scope.cjk, dpi: scope.dpi, fontString, fontSizePx: fontSizePxOf(fontString) });
}

/** What {@link annotatedSpans} reads of the document. */
interface AnnotationScope {
  cjk: ResolvedCjkConfig;
  dpi: number;
}

/** Non-breaking space used to glue a resolved `:ref` label into a single
 *  atomic text token, so a post-measurement pass can tag it reliably. */
const NBSP = ' ';

export interface ResourceLayoutInput {
  resource: Resource;
  resourceType: ResourceType | undefined;
  number: string;
  resolved: ResolvedConfig;
  /** Available column width in px — for a rotated block, the width of the
   *  band it takes on the page (the extent its upright height may reach). */
  columnWidth: number;
  /** Set the block turned a quarter turn on the page. Its upright frame is
   *  then laid out `rotatedLength` px wide (the block's extent along the
   *  page's height) and the block reports that length as its height on the
   *  page; the upright height (the footprint's width) is
   *  `block.rotation.height`. See {@link VDTResourceRotation}. */
  rotate?: ResourceRotation;
  /** Upright layout width of a rotated block (px). Defaults to `columnWidth`. */
  rotatedLength?: number;
  /** Full numbering map — lets inline `:ref`s inside the caption resolve. */
  resourceNumbering: ResourceNumberingMap;
  resourceTypes: ResourceType[];
  resources: Resource[];
  /** The formatted citations of resource captions and notes, by resource
   *  id (#529); a citation without one prints as written. */
  captionCitations?: ReadonlyMap<string, CaptionCitations>;
  /** Lay out only these rows of a table (a slice of a table split across
   *  pages). Ignored for figures. */
  slice?: TableSliceSpec;
  /** Set the caption (and note) beside the body instead of under it: in a
   *  band `width` wide whose left edge is `dx` from the block's left (the
   *  side column of a one-and-a-half layout), level with the body's top,
   *  or with its bottom when `alignBottom`. The block's height is then the
   *  body's alone; `asideHeight` reports the caption band's. */
  captionAside?: { dx: number; width: number; alignBottom: boolean; offsetY?: number };
  /** Widest a figure's image (bitmap or SVG) may be set; the caption and
   *  note keep `columnWidth`. Defaults to `columnWidth`. */
  maxBodyWidth?: number;
  /** Make a picture with a safe area (`Resource.safeArea`) this many px
   *  taller (or shorter, when negative) than it would be set, by cropping
   *  outside its safe area; clamped to the range the safe area allows (see
   *  `bodyFlex` in the result). Ignored for pictures without one, tables
   *  and turned blocks. */
  bodyHeightDelta?: number;
  /** Set the block upright on a vertical page (`VDTPage.flow`): laid out
   *  in an upright frame counter-rotated in the flow (`rotation.direction:
   *  'ccw'`, which the page's clockwise frame turns back), so the picture
   *  and its caption read as on a horizontal page. `columnWidth` (the
   *  column's width in the flow: the tier's height on the sheet) bounds
   *  the frame's height; its width is the picture's (a bitmap at its size,
   *  an SVG as tall as the tier leaves room for with its caption), at most
   *  `maxLength` px, and the block reports that width as its height in the
   *  flow. A table is laid out `maxLength` wide, its rows cut to the tier
   *  by the placer. `rotate` and `rotatedLength` are ignored. */
  upright?: { maxLength: number };
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

/** Resolve the colour of every inline `:swatch{…}` span: a `#rgb` / `#rgba`
 *  hex is normalised to six / eight digits, a `#rrggbb` / `#rrggbbaa` one
 *  lower-cased, an `rgb()` / `rgba()` colour kept as written; any other
 *  value is looked up as a document palette entry id. An unresolved colour
 *  is left as written (the measurer then draws an empty outline). Spans
 *  without a swatch pass through. */
export function resolveSwatchSpans(spans: InlineSpan[], palette: ColorPaletteEntry[] | undefined): InlineSpan[] {
  return spans.map((span) => {
    if (!span.swatch) return span;
    const raw = span.swatch.color.trim();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i.exec(raw);
    if (short) return { ...span, swatch: { color: `#${short.slice(1).filter(Boolean).map((d) => d + d).join('')}`.toLowerCase() } };
    if (/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return { ...span, swatch: { color: raw.toLowerCase() } };
    if (isSwatchFill(raw)) return { ...span, swatch: { color: raw } };
    const entry = palette?.find((e) => e.id === raw);
    return entry ? { ...span, swatch: { color: entry.value.hex } } : span;
  });
}

/** Inline chips of a table cell, sized against the cell's font. */
function resolveCellChips(spans: InlineSpan[], chips: ChipContext | undefined, set: CellFontSet): InlineSpan[] {
  return chips ? resolveChipSpans(spans, chips, fontSizePxOf(set.fontString)) : spans;
}

/** Build a label for an inline `:ref` to a resource, honouring its `style` and
 *  optional override `text`. Mirrors the caption-prefix conventions. */
export function resolveRefLabel(
  ref: NonNullable<InlineSpan['ref']>,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  /** Between the label and the number (`captionStyle.labelNumberGap`); a
   *  type's own caption style may set another. */
  labelNumberGap: string = NBSP,
): string {
  if (ref.text !== undefined && ref.text.length > 0) return ref.text;
  const entry = resourceNumbering[ref.resourceId];
  const number = entry?.number ?? '?';
  if (ref.style === 'number') return number;
  const resource = resources.find((r) => r.id === ref.resourceId);
  const type = resource ? resourceTypes.find((t) => t.id === resource.typeId) : undefined;
  const gap = typeof type?.captionStyle?.labelNumberGap === 'string' ? type.captionStyle.labelNumberGap : labelNumberGap;
  if (ref.style === 'full') {
    return labelWithNumber(applyRefCase(type?.name ?? type?.shortLabel ?? '', ref.case), number, gap);
  }
  // default: short label + number (e.g. "Fig. 1.7")
  return labelWithNumber(applyRefCase(type?.shortLabel ?? type?.name ?? '', ref.case), number, gap);
}

/** "Fig. 1.7": a type's label and a number, glued by a no-break space (or
 *  the caption style's `labelNumberGap`: 图1-1). A type whose
 *  `numberingTemplate` is empty has no number, and its label stands alone
 *  (EF-149). */
function labelWithNumber(label: string, number: string, gap: string = NBSP): string {
  if (!label) return number;
  return number ? `${label}${gap}${number}` : label;
}

/** The label that opens a caption: "Figure 1.7. " — or, for a type
 *  numbered with an empty template, "Figure. ". Without a number, spaces at
 *  the prefix's end are dropped, and a prefix that already ends in a stop
 *  (`.`, `:`, `!`, `?`, `…` or a full-width form, as in "Pl.") takes no
 *  second one. Empty without a prefix. With a number, the caption style's
 *  `labelNumberGap` and `labelSeparator` stand around it ("图1-1　"). */
const CAPTION_STOP_RE = /[.:!?…。．：！？]$/;
function captionLabelText(captionPrefix: string, number: string, cs?: Pick<ResolvedCaptionStyleConfig, 'labelNumberGap' | 'labelSeparator'>): string {
  if (captionPrefix.length === 0) return '';
  if (number) return `${captionPrefix}${cs?.labelNumberGap ?? NBSP}${number}${cs?.labelSeparator ?? '. '}`;
  const label = captionPrefix.trimEnd();
  if (label.length === 0) return '';
  return CAPTION_STOP_RE.test(label) ? `${label} ` : `${label}. `;
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

/** Anchor targets and the words a cross-reference prints, threaded into
 *  {@link resolveRefSpans} (#262). */
export interface AnchorRefContext {
  targets: AnchorTargets;
  strings: CrossRefStrings;
}

/** Resolve inline `:ref` spans to their computed label, keeping the `ref`
 *  metadata so the rich-text measurer treats each label as one atomic,
 *  non-breaking token and tags the produced segment with `refResourceId`.
 *  A reference whose id names no resource but an anchor (a heading's
 *  `{#id}`, an inline anchor, a container) prints the anchor's label and is
 *  flagged `ref.anchor` (#262); a pandoc-crossref prefix (`fig:map`) may be
 *  left off the identifier it names. */
export function resolveRefSpans(
  spans: InlineSpan[],
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle?: { bold: boolean; italic: boolean; labelNumberGap?: string; anchors?: AnchorRefContext },
): InlineSpan[] {
  if (!spans.some((s) => s.ref)) return spans;
  const isResource = (id: string): boolean => resourceNumbering[id] !== undefined || resources.some((r) => r.id === id);
  return spans.map((span) => {
    if (!span.ref) return span;
    let ref = span.ref;
    let text: string | undefined;
    if (!isResource(ref.resourceId)) {
      const target = findAnchorTarget(refStyle?.anchors?.targets, ref.resourceId);
      const bare = unprefixedId(ref.resourceId);
      if (target && refStyle?.anchors) {
        ref = { ...ref, resourceId: target.id, anchor: true, ...(target.pageIndex !== undefined ? { pageIndex: target.pageIndex } : {}) };
        text = resolveAnchorRefLabel(ref, target, refStyle.anchors.strings);
      } else if (bare !== undefined && isResource(bare)) {
        ref = { ...ref, resourceId: bare };
      }
    }
    return {
      ...span,
      ref,
      text: text ?? resolveRefLabel(ref, resourceNumbering, resourceTypes, resources, refStyle?.labelNumberGap),
      // Reference labels keep the emphasis of the run they sit in, and the
      // reference style adds its own on top where it sets it (#531), so the
      // measurer selects the matching font; colour is applied by renderers
      // via `refResourceId`.
      bold: span.bold || (refStyle?.bold ?? false),
      italic: span.italic || (refStyle?.italic ?? false),
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

/** Share of the free room set left of a body aligned per `placement.align`. */
function alignFactor(align: 'left' | 'center' | 'right' | 'start' | 'end' | undefined): number {
  return align === 'center' ? 0.5 : align === 'right' || align === 'end' ? 1 : 0;
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
  /** Tracking after every character (px), measured into the lines and set
   *  on each as `VDTLine.letterSpacing` for the renderers; absent for none. */
  letterSpacingPx?: number;
  /** Set the text in capitals (length-preserving). */
  uppercase?: boolean;
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
  /** The document's CJK settings, for the annotations of cells
   *  ({@link annotatedSpans}). */
  annotations: AnnotationScope;
  /** The document's maths settings, for the formulas of cells (#541). */
  math?: ResolvedMathConfig;
}

/** The inline formulas of a caption, a note or a cell (#541), rendered at
 *  the snippet's size as the body's are at the body's: one em of the
 *  formula is `fontPx` × `math.fontSizeScale`, and a formula taller than
 *  the line is scaled down to it. With maths off the TeX prints as
 *  written, between its dollars. */
export function snippetMathSpans(spans: InlineSpan[], fontPx: number, lineHeightPx: number, math: ResolvedMathConfig | undefined): InlineSpan[] {
  if (!math || !spans.some((s) => s.math)) return spans;
  return spans.map((s) => {
    if (!s.math) return s;
    if (!math.enabled) return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
    return { ...s, mathRender: renderMath(s.math.tex, false, fontPx * math.fontSizeScale, { lineBoxPx: lineHeightPx, ...(math.color ? { color: math.color.hex } : {}) }) };
  });
}

/** A list-item marker at the head of a cell paragraph: the glyph as
 *  authored, the whitespace that follows it, and the column of its leading
 *  indentation (the cell nests its items as the parser nests a list's, see
 *  `parse/listNesting.ts`). */
interface CellItemMarker {
  text: string;
  ws: string;
  column: number;
}

/** Markers a cell paragraph may open with: bullets, dashes, a number with
 *  its dot or bracket — followed by whitespace and some text. */
const CELL_ITEM_MARKER = /^(\s*)([•·◦○▪‣\-*–—]|\d{1,3}[.)])(\s+)(?=\S)/;

/** A cell breaks its lines at a newline and at a forced break (`\\`, see
 *  `SNIPPET_BREAK_RE`); a caption or a note only at a forced break. */
const CELL_BREAK_RE = /[\n\u2028]/;
const FORCED_BREAK_RE = /\u2028/;

/** Split a cell's spans into paragraphs at hard line breaks (`\n`, and
 *  the forced breaks). The break characters are dropped; an empty paragraph
 *  (a blank line) is kept out — the measurer would skip it as whitespace
 *  anyway. A line holding a no-break space is no blank line: it sets a
 *  line of the cell, as in CommonMark (EF-154). */
function splitCellParagraphs(spans: InlineSpan[], breakRe: RegExp = CELL_BREAK_RE): InlineSpan[][] {
  const out: InlineSpan[][] = [];
  let current: InlineSpan[] = [];
  const flush = () => {
    if (current.some((sp) => !isBlankText(sp.text))) out.push(current);
    current = [];
  };
  for (const span of spans) {
    if (span.ref || span.math || !breakRe.test(span.text)) {
      current.push(span);
      continue;
    }
    const pieces = span.text.split(breakRe);
    let at = 0;
    pieces.forEach((piece, i) => {
      if (i > 0) flush();
      if (piece.length > 0) current.push(span.links ? sliceSpan(span, at, at + piece.length) : { ...span, text: piece });
      at += piece.length + 1;
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
  const stripped = rest.length > 0 ? [first.links ? sliceSpan(first, whole.length) : { ...first, text: rest }, ...spans.slice(1)] : spans.slice(1);
  return { marker: { text, ws, column: indentColumn(indent) }, spans: stripped };
}

/** The four faces a caption or note run is set in (normal, bold, italic,
 *  bold italic). */
type SnippetFonts = readonly [string, string, string, string];

/**
 * Measure a caption or a note. Without a forced break it is one rich block,
 * exactly as before; with forced breaks (`\\`, or a backslash ending a line
 * — see `SNIPPET_BREAK_RE`) each piece is measured on its own and the
 * pieces are stacked, one line pitch apart. An empty piece (two breaks in a
 * row) adds no line. Lines are block-relative (y = 0 at the first line).
 */
function measureSnippetLines(
  spans: InlineSpan[],
  fonts: SnippetFonts,
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions,
): VDTLine[] {
  const [normal, bold, italic, boldItalic] = fonts;
  // The measurer sets every line flush left at its natural width unless it
  // justifies: a centred or right-aligned caption or note is pushed over by
  // each line's slack (EF-166), as table cells are.
  const align = options.textAlign;
  const aligned = (lines: VDTLine[]): VDTLine[] =>
    align === 'center' || align === 'right'
      ? lines.map((line) => {
          const slack = Math.max(0, maxWidthPx - line.bbox.width);
          return shiftLines([line], align === 'center' ? slack / 2 : slack, 0)[0]!;
        })
      : lines;
  const measure = (ps: InlineSpan[]): VDTLine[] =>
    aligned(linkSegments(measureRichSnippet(ps, normal, bold, italic, boldItalic, maxWidthPx, lineHeightPx, options).lines, ps));
  if (!spans.some((s) => !s.ref && !s.math && FORCED_BREAK_RE.test(s.text))) return measure(spans);
  const lines: VDTLine[] = [];
  for (const piece of splitCellParagraphs(spans, FORCED_BREAK_RE)) {
    const measured = measure(piece);
    lines.push(...shiftLines(measured, 0, lines.length * lineHeightPx));
  }
  return lines;
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
    const m = measureRichSnippet(
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
    const fit = fitWidth(resource.bitmap.width, resource.bitmap.height, target);
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
function layoutTable(
  model: TableModel,
  columnWidth: number,
  style: TableLayoutStyle,
  resourceNumbering: ResourceNumberingMap,
  resourceTypes: ResourceType[],
  resources: Resource[],
  refStyle: { bold: boolean; italic: boolean; labelNumberGap?: string },
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
  refStyle: { bold: boolean; italic: boolean; labelNumberGap?: string },
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
      const parsed = snippetMathSpans(parseInlineSnippetSpans(cell.content), fontSizePxOf(set.fontString), set.lineHeightPx, style.math);
      const spans = annotatedSpans(resolveCellChips(resolveSwatchSpans(resolveRefSpans(
        set.uppercase ? parsed.map((s) => (s.ref || s.math ? s : { ...s, text: uppercasePreservingLength(s.text) })) : parsed,
        resourceNumbering,
        resourceTypes,
        resources,
        refStyle,
      ), style.palette), style.chips, set), style.annotations, set.fontString);
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
      const image = cell.hiddenBy ? null : fitCellImage(cell.image, align, Math.max(1, cellWidth), resources);
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

/**
 * Measure a resource block (image / svg / table) plus its caption into a
 * placement-ready {@link ResolvedResourceBlock}. Returns the block and its
 * combined height (figure body + gap + caption) — the value placement uses to
 * decide whether the group fits the remaining column space.
 */
export function layoutResourceBlock(input: ResourceLayoutInput): {
  block: ResolvedResourceBlock;
  totalHeight: number;
  /** Height of the caption + note band set beside the body
   *  (`captionAside`); absent otherwise. */
  asideHeight?: number;
  /** Row metrics of a table laid out in full (no `slice`), for
   *  {@link planTableSlice}. */
  tableRows?: TableRowMetrics;
} {
  // Captions, notes and table cells are set horizontally on every page: a
  // resource of a vertical flow stands upright, its text read as on a
  // horizontal page.
  if (measuringVertically()) return withMeasureWritingMode('horizontal-tb', () => layoutResourceBlock(input));
  if (input.upright) return layoutUprightResourceBlock(input, input.upright.maxLength);
  const {
    resource,
    resourceType,
    number,
    resolved,
    columnWidth: footprintWidth,
    resourceNumbering,
    resourceTypes,
    resources,
    rotate,
  } = input;
  // A rotated block is laid out upright, `rotatedLength` wide; its upright
  // height must then fit the band's width on the page (`footprintWidth`).
  const columnWidth = rotate ? Math.max(1, input.rotatedLength ?? footprintWidth) : footprintWidth;
  const palette = resolved.colorPalette;
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

  // The style a table is set in: its named style, else the document's.
  const tableStyle = pickTableStyle(resolved, resource.table?.styleId);
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
  const refStyle = { bold: resolved.bodyText.referenceBold, italic: resolved.bodyText.referenceItalic, labelNumberGap: resolved.captionStyle.labelNumberGap };

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
    const fit = fitWidth(resource.bitmap.width, resource.bitmap.height, Math.min(columnWidth, input.maxBodyWidth ?? columnWidth));
    bodyWidth = fit.width;
    bodyHeight = fit.height;
  } else if (resource.kind === 'svg' && resource.svg) {
    fileId = resource.svg.fileId;
    // SVGs are vector: fill the column width and derive height from the
    // intrinsic aspect ratio (viewBox / width:height). Fall back to a 4:3 box
    // only when no intrinsic size was captured.
    const iw = resource.svg.width ?? 0;
    const ih = resource.svg.height ?? 0;
    bodyWidth = Math.min(columnWidth, input.maxBodyWidth ?? columnWidth);
    bodyHeight = iw > 0 && ih > 0 ? bodyWidth * (ih / iw) : bodyWidth * 0.75;
  } else if (resource.kind === 'video') {
    // A video is set as its poster (#454): the column's width, the poster's
    // ratio (else the video's, else 16:9). Posters are screen-sized, so
    // they fill the measure like an SVG rather than keep their pixel size.
    const poster = resource.video?.poster;
    fileId = poster?.fileId;
    format = poster?.format;
    const iw = poster?.width ?? resource.video?.width ?? 0;
    const ih = poster?.height ?? resource.video?.height ?? 0;
    bodyWidth = Math.min(columnWidth, input.maxBodyWidth ?? columnWidth);
    bodyHeight = iw > 0 && ih > 0 ? bodyWidth * (ih / iw) : bodyWidth * (9 / 16);
  } else if (resource.kind === 'table' && resource.table) {
    const ts = tableStyle;
    const bodyFontPx = dimensionToPx(ts.bodyFontSize, dpi);
    const headerFontPx = dimensionToPx(ts.headerFontSize, dpi);
    // Header weight/slant: the header's base run is bold (and/or italic) by
    // default; inline markup still toggles relative to that base, mirroring the
    // blockquote/heading italic-flip convention.
    const hWeight = ts.headerBold ? boldWeight : normalWeight;
    const hBase = ts.headerItalic ? 'italic' : 'normal';
    const hFlip = ts.headerItalic ? 'normal' : 'italic';
    const headerTrackingPx = dimensionToPx(ts.headerLetterSpacing, dpi, headerFontPx);
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
        ...(headerTrackingPx !== 0 ? { letterSpacingPx: headerTrackingPx } : {}),
        ...(ts.headerTextTransform === 'uppercase' ? { uppercase: true } : {}),
      },
      borderColor: ts.borderColor.hex,
      borderWidthPx: ts.borders && ts.rules !== 'none'
        ? Math.max(MIN_BORDER_PX, dimensionToPx(ts.borderWidth, dpi))
        : 0,
      cellPaddingPx: dimensionToPx(ts.cellPadding, dpi, bodyFontPx),
      headerBackground: ts.headerBackgroundEnabled ? ts.headerBackground.hex : undefined,
      bodyBackground: ts.bodyBackgroundEnabled ? ts.bodyBackground.hex : undefined,
      bodyAlternateBackground: ts.bodyAlternateBackgroundEnabled ? ts.bodyAlternateBackground.hex : undefined,
      rules: ts.rules,
      listGapPx: dimensionToPx(resolved.unorderedLists.gap, dpi, bodyFontPx),
      palette,
      chips: chipContextOf(resolved),
      annotations: { cjk: resolved.cjk, dpi },
      math: resolved.math,
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
      resource.table.direction,
    );
    // Rounded outer frame: a part of a split table rounds only the ends
    // the table really has — the top on the first part, the bottom on the
    // last.
    const radiusPx = Math.min(dimensionToPx(ts.borderRadius, dpi, bodyFontPx), columnWidth / 2, height / 2);
    const top = slice?.continued ? 0 : radiusPx;
    const bottom = slice?.continues ? 0 : radiusPx;
    table = radiusPx > 0 && (top > 0 || bottom > 0)
      ? { ...layout, frameRadii: [top, top, bottom, bottom] }
      : layout;
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
    const prefixText = captionLabelText(captionPrefix, number, cs);
    // The annotations are resolved on the spans as written, before the
    // style slants the description: a caption set in italics is no
    // emphasis.
    const resolvedSpans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(
        resolveCitationSpans(parseInlineSnippetSpans(captionText, { citations: true }), input.captionCitations?.get(resource.id)?.caption),
        captionFontPx,
        captionLineHeightPx,
        resolved.math,
      ),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    ), palette), chipContextOf(resolved), captionFontPx), { cjk: resolved.cjk, dpi }, captionFontString);
    // Description spans pick up the configured slant on top of their own markup.
    const descSpans: InlineSpan[] = cs.descriptionItalic
      ? resolvedSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : resolvedSpans;
    // A continued table slice: "Table 6-4. Title (cont.)" — the suffix is
    // set in italics after the description, glued to it by a plain space,
    // or solid when it opens with a wide character (表1-1　标题（续）).
    const suffix = slice?.continued ? tableStyle.continuedSuffix.trim() : '';
    const suffixSpans: InlineSpan[] = suffix.length > 0
      ? [{ text: `${descSpans.length > 0 ? suffixJoiner(suffix) : ''}${suffix}`, bold: false, italic: true }]
      : [];
    const allSpans: InlineSpan[] = prefixText.length > 0
      ? [{ text: prefixText, bold: cs.labelBold, italic: cs.labelItalic, captionLabel: true }, ...descSpans, ...suffixSpans]
      : [...descSpans, ...suffixSpans];
    measuredCaption = measureSnippetLines(
      allSpans,
      [captionFontString, captionBoldFontString, captionItalicFontString, captionBoldItalicFontString],
      Math.max(1, (input.captionAside?.width ?? columnWidth) - captionPaddingPx * 2),
      captionLineHeightPx,
      { textAlign: cs.align },
    );
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
    const noteSpans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(
        resolveCitationSpans(parseInlineSnippetSpans(noteText, { citations: true }), input.captionCitations?.get(resource.id)?.note),
        noteFontPx,
        noteLineHeightPx,
        resolved.math,
      ),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    ), palette), chipContextOf(resolved), noteFontPx), { cjk: resolved.cjk, dpi }, noteFontString);
    const slanted: InlineSpan[] = cs.note.italic
      ? noteSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : noteSpans;
    measuredNote = measureSnippetLines(
      slanted,
      [noteFontString, noteBoldFontString, noteItalicFontString, noteBoldItalicFontString],
      Math.max(1, input.captionAside?.width ?? columnWidth),
      noteLineHeightPx,
      { textAlign: cs.note.align },
    );
  }
  const noteHeight = measuredNote.length > 0
    ? measuredNote.length * noteLineHeightPx + noteGapPx
    : 0;

  // --- Continues marker --------------------------------------------------
  // "Continued" under a slice that goes on: the note's typeface and size,
  // italic, flush right — where the note would sit.
  let measuredContinues: VDTLine[] = [];
  const ts = tableStyle;
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

  // A rotated figure must also fit the band's width with its caption and
  // note: scale the image down when the stack would run past it (a table
  // is cut between rows by the placer instead).
  // Intrinsic size and safe area of a picture that may be cropped to make
  // it taller or shorter (#442); `flexRange` gives its body height range at
  // a width.
  const safeArea = resourceSafeArea(resource);
  const intrinsic = resource.kind === 'bitmap' && resource.bitmap
    ? { width: resource.bitmap.width, height: resource.bitmap.height }
    : resource.kind === 'svg' && resource.svg?.width && resource.svg.height
      ? { width: resource.svg.width, height: resource.svg.height }
      : resource.kind === 'video' && resource.video?.poster
        ? { width: resource.video.poster.width, height: resource.video.poster.height }
        : undefined;
  const picture = resource.kind === 'bitmap' || resource.kind === 'svg' || resource.kind === 'video';
  const flexRange = safeArea && intrinsic && intrinsic.width > 0 && intrinsic.height > 0 && !rotate
    ? (w: number) => safeAreaHeightRange(intrinsic.width, intrinsic.height, safeArea, w)
    : undefined;
  // The content area's room for the body, when `fitFiguresToPage` caps it.
  let pageRoom: number | undefined;
  if (rotate && picture) {
    const room = footprintWidth - captionHeight - noteHeight - continuesHeight;
    if (bodyHeight > room && bodyHeight > 0) {
      const k = Math.max(0.01, room) / bodyHeight;
      bodyWidth *= k;
      bodyHeight *= k;
    }
  }
  // Likewise a figure that would stand taller than the content area, when
  // the document asks for it (`layout.fitFiguresToPage`): the image shrinks
  // so image, caption and note fit one page with a line of air to spare.
  if (
    !rotate && !input.captionAside && resolved.layout.fitFiguresToPage
    && picture
  ) {
    const m = resolved.page.margins;
    const areaHeight = dimensionToPx(resolved.page.height, dpi)
      - dimensionToPx(m.top, dpi) - dimensionToPx(m.bottom, dpi);
    const room = areaHeight - captionHeight - noteHeight - continuesHeight - bodyStyle.lineHeightPx;
    // A picture with a safe area is cropped first, keeping its width.
    if (bodyHeight > room && bodyHeight > 0 && room > 0 && flexRange) {
      bodyHeight = Math.max(room, flexRange(bodyWidth).min);
    }
    if (bodyHeight > room && bodyHeight > 0 && room > 0) {
      const k = room / bodyHeight;
      bodyWidth *= k;
      bodyHeight *= k;
    }
    pageRoom = room;
  }

  // A picture with a safe area set taller or shorter than its own ratio:
  // the lever's delta, within what the safe area (and the page) allows.
  let bodySource: ResourceSafeArea | undefined;
  let bodyFlex: { shrink: number; grow: number; delta: number } | undefined;
  if (flexRange && safeArea && intrinsic && !rotate) {
    const range = flexRange(bodyWidth);
    const max = pageRoom !== undefined ? Math.max(range.min, Math.min(range.max, pageRoom)) : range.max;
    const delta = input.bodyHeightDelta ?? 0;
    const before = bodyHeight;
    if (delta !== 0) bodyHeight = Math.max(range.min, Math.min(max, bodyHeight + delta));
    bodySource = safeAreaSource(intrinsic.width, intrinsic.height, safeArea, bodyWidth, bodyHeight);
    bodyFlex = { shrink: Math.max(0, bodyHeight - range.min), grow: Math.max(0, max - bodyHeight), delta: bodyHeight - before };
  }

  // --- Vertical stacking -------------------------------------------------
  // above: [caption band] gap [body] noteGap [note]
  // below: [body] gap [caption band] noteGap [note]
  const aside = input.captionAside;
  const asideBand = aside ? captionBandHeight + noteHeight : 0;
  const captionAbove = !aside && cs.position === 'above' && captionBandHeight > 0;
  const captionBandY = aside
    ? (aside.alignBottom ? Math.max(0, bodyHeight - asideBand) : Math.max(0, aside.offsetY ?? 0))
    : captionAbove ? 0 : bodyHeight + (captionBandHeight > 0 ? captionGapPx : 0);
  const bodyY = captionAbove ? captionHeight : 0;
  const asideDx = aside ? aside.dx : 0;
  // A picture narrower than its slot — shrunk to fit the page or the room
  // left (`layout.fitFiguresToPage`), or a bitmap smaller than the column —
  // sits in the slot per `placement.align`, as a float narrowed by
  // `placement.width` does; the caption and note keep the slot's measure.
  // A turned figure and one with its caption beside it stay flush left.
  const bodyX = !rotate && !aside && picture && bodyWidth < columnWidth
    ? (columnWidth - bodyWidth) * alignFactor(resource.placement?.align ?? resourceType?.defaultPlacement?.align)
    : 0;
  const bodyRect = createBoundingBox(bodyX, bodyY, bodyWidth, bodyHeight);
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
  const captionLines = shiftLines(measuredCaption, asideDx + captionPaddingPx, captionBandY + captionPaddingPx);
  // A table's rules are stroked centred on the cell edges, so its outer
  // frame reaches half a stroke beyond the body on each side; the caption
  // bar spans that same outer extent, or it would read a hair narrower.
  const barOverhang = table ? table.borderWidthPx / 2 : 0;
  const captionBar = cs.backgroundEnabled && captionBandHeight > 0
    ? {
        rect: createBoundingBox(asideDx - barOverhang || 0, captionBandY, (aside?.width ?? columnWidth) + 2 * barOverhang, captionBandHeight),
        background: cs.background.hex,
      }
    : undefined;
  const noteY = aside
    ? captionBandY + captionBandHeight + noteGapPx
    : (captionAbove ? bodyY + bodyHeight : bodyHeight + captionHeight) + noteGapPx;
  const noteLines = shiftLines(measuredNote, asideDx, noteY);
  // The marker takes the note's slot (a continuing slice has no note).
  const continuesLines = shiftLines(measuredContinues, 0, aside ? bodyHeight + noteGapPx : noteY);
  const totalHeight = aside
    ? bodyHeight + continuesHeight
    : bodyHeight + captionHeight + noteHeight + continuesHeight;

  const video = layoutVideo(resource, resolved, bodyWidth, bodyHeight);
  const block: ResolvedResourceBlock = {
    resource,
    kind: resource.kind,
    ...(video ? { video } : {}),
    ...(slice ? { slice } : {}),
    number,
    captionPrefix,
    bodyRect,
    ...(bodySource ? { bodySource } : {}),
    ...(bodyFlex ? { bodyFlex } : {}),
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

  if (rotate) {
    // The inner geometry stays in the upright frame; the placer sets the
    // origin when it positions the block. On the page the block is as tall
    // as the upright frame is wide.
    block.rotation = { direction: rotate, originX: 0, originY: 0, width: columnWidth, height: totalHeight };
    return tableRows ? { block, totalHeight: columnWidth, tableRows } : { block, totalHeight: columnWidth };
  }
  return {
    block,
    totalHeight,
    ...(tableRows ? { tableRows } : {}),
    ...(aside ? { asideHeight: asideBand } : {}),
  };
}


/** The share of its first width an upright picture keeps when its frame
 *  narrows (see `layoutUprightResourceBlock`): it may give up a quarter,
 *  about two caption lines in a full tier. */
const UPRIGHT_MIN_PICTURE_SHARE = 0.75;

/**
 * A resource set upright on a vertical page (see `ResourceLayoutInput.
 * upright`): a counter-clockwise rotated block whose upright frame is as
 * wide as its picture. The frame is first tried `maxLength` wide, which
 * gives the picture its largest size (the caption on the fewest lines). A
 * picture the tier's height shrinks (or a bitmap narrower than that) gives
 * its width back, and the block is laid out again at the picture's width
 * so the caption wraps under it, a few rounds until the width holds. A
 * narrower frame is taken only while it fits the tier and the picture
 * keeps `UPRIGHT_MIN_PICTURE_SHARE` of its first width: a caption that
 * wraps onto more lines at each narrowing would otherwise squeeze the
 * picture to nothing and run the frame past the tier. When the rounds stop
 * short of a frame as wide as the picture, the frame narrows by bisection
 * to the least width at which the picture still keeps that share, and the
 * caption runs wider than the picture. The origin is block-relative
 * (`originX` 0, `originY` the block's height in the flow), as
 * `offsetResourceBlockToAbsolute` expects.
 */
function layoutUprightResourceBlock(input: ResourceLayoutInput, maxLength: number): ReturnType<typeof layoutResourceBlock> {
  const base: ResourceLayoutInput = { ...input, upright: undefined, rotate: 'ccw' };
  const at = (length: number) => layoutResourceBlock({ ...base, rotatedLength: length });
  let length = Math.max(1, maxLength);
  let out = at(length);
  if (input.resource.kind === 'bitmap' || input.resource.kind === 'svg' || input.resource.kind === 'video') {
    const floor = out.block.bodyRect.width * UPRIGHT_MIN_PICTURE_SHARE;
    const holds = (o: ReturnType<typeof layoutResourceBlock>) =>
      o.block.rotation!.height <= input.columnWidth + 0.5 && o.block.bodyRect.width >= floor;
    let settled = false;
    for (let round = 0; round < 4; round++) {
      const used = out.block.bodyRect.width;
      if (!(used > 0) || used >= length - 0.5) {
        settled = true;
        break;
      }
      const next = at(Math.max(1, used));
      if (!holds(next)) break;
      length = Math.max(1, used);
      out = next;
    }
    if (!settled) {
      let lo = Math.max(1, floor);
      let hi = length;
      for (let step = 0; step < 12 && hi - lo > 0.5; step++) {
        const mid = (lo + hi) / 2;
        const o = at(mid);
        if (holds(o)) {
          hi = mid;
          out = o;
        } else {
          lo = mid;
        }
      }
    }
  }
  const rotation = out.block.rotation!;
  rotation.originX = 0;
  rotation.originY = out.totalHeight;
  return out;
}

/** Shift a resolved resource block's geometry right by `dx` (an inline
 *  resource narrower than its column, set per `placement.align`). */
export function shiftResourceBlockX(rb: ResolvedResourceBlock, dx: number): void {
  if (!dx) return;
  rb.bodyRect = createBoundingBox(rb.bodyRect.x + dx, rb.bodyRect.y, rb.bodyRect.width, rb.bodyRect.height);
  for (const ln of [...rb.captionLines, ...rb.noteLines, ...rb.continuesLines]) ln.bbox.x += dx;
  if (rb.captionBar) rb.captionBar.rect.x += dx;
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += dx;
      if (cell.image) cell.image.rect.x += dx;
      for (const cl of cell.lines) cl.bbox.x += dx;
    }
  }
}
