/**
 * Pure helpers used by `buildDocument`. Extracted here purely to keep the
 * main pipeline function readable; no behavior changes.
 */

import type { ContentBlock } from '../../parse/index.js';
import { spaceDirectiveLines } from '../../parse/attrs.js';
import { dimensionToPx } from '../../units.js';
import {
  createBoundingBox,
  pageIsMirrored,
  type VDTBlock,
  type VDTPage,
  type BoundingBox,
  type ResolvedConfig,
} from '../../vdt.js';
import type { BlockStyle } from '../styles.js';
import { renderMath, isMathReady, noteMathWithoutEngine } from '../../math/index.js';
import { passSideTable } from '../build/passTape.js';

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

export interface PageMetrics {
  trimWidthPx: number;
  trimHeightPx: number;
  /** The sheet (trim plus the cut-lines band on every side), physical. */
  pageWidthPx: number;
  pageHeightPx: number;
  trimOffset: number;
  /** Content area of an odd (recto) page — the trim box inset by the
   *  margins as written, in the flow frame (see `vertical`). Use
   *  `contentAreaForPage` for a specific page so mirrored margins swap on
   *  the pages that face the other way. */
  contentArea: BoundingBox;
  /** The trim box (the final page after cutting) in flow px. */
  trimBox: BoundingBox;
  /** The trim box expanded by `cutLines.bleed` on every side when cut lines
   *  are enabled; equals `trimBox` otherwise. Design elements anchored to
   *  `'bleed'` run to this frame. In flow px. */
  bleedBox: BoundingBox;
  /** Whether the flow is set vertically (`layout.writingMode:
   *  'vertical-rl'`): `contentArea`, `trimBox` and `bleedBox` are then in
   *  the flow frame (`flowWidthPx` = the sheet's height, `flowHeightPx` =
   *  its width; see `VDTPage.flow`), and `physical` holds them on the
   *  sheet. On a horizontal page the two frames are one. */
  vertical: boolean;
  /** Whether the flow is laid out mirrored (a right-to-left document,
   *  `resolvedDirection()`; see `VDTMirroredFlowFrame`): `contentArea`,
   *  `trimBox` and `bleedBox` are then the sheet's rects turned over its
   *  vertical axis (`x` → `pageWidthPx − x`), and `physical` holds them on
   *  the sheet. Never set together with `vertical`, which wins. */
  mirrored: boolean;
  flowWidthPx: number;
  flowHeightPx: number;
  physical: { contentArea: BoundingBox; trimBox: BoundingBox; bleedBox: BoundingBox };
}

/** A sheet rect in the flow frame of a vertical page `sheetWidthPx` wide
 *  (see `pageRectToFlow`): `(x, y, w, h)` → `(y, W − x − w, h, w)`. */
export function sheetRectToFlow(rect: BoundingBox, sheetWidthPx: number): BoundingBox {
  return createBoundingBox(rect.y, sheetWidthPx - (rect.x + rect.width), rect.height, rect.width);
}

/** A sheet rect in the flow frame a page of `metrics` lays its flow out in
 *  (see `pageRectToFlow`): turned on a vertical page, mirrored on a
 *  right-to-left one, as it is otherwise. */
export function sheetRectToPageFlow(
  rect: BoundingBox,
  metrics: Pick<PageMetrics, 'pageWidthPx'> & Partial<Pick<PageMetrics, 'vertical' | 'mirrored'>>,
): BoundingBox {
  if (metrics.vertical) return sheetRectToFlow(rect, metrics.pageWidthPx);
  if (metrics.mirrored) return mirrorContentArea(rect, metrics.pageWidthPx);
  return rect;
}

/** The config a composed page is laid out with on a host's leaf
 *  (`composedViewerLeaf`, #1045): the document's, with the leaf's size and
 *  margins and no cut marks. Undefined without a leaf. */
export function composedLeafConfig(resolved: ResolvedConfig): ResolvedConfig | undefined {
  const leaf = resolved.composedViewerLeaf;
  if (!leaf) return undefined;
  return {
    ...resolved,
    page: { ...resolved.page, width: leaf.width, height: leaf.height, margins: leaf.margins, cutLines: { ...resolved.page.cutLines, enabled: false } },
  };
}

/** Whether `page` was laid out on the host's leaf (`composedViewerLeaf`,
 *  #1045): a composed page of a document that has one. */
export function onComposedLeaf(resolved: ResolvedConfig, page: { composed?: unknown; comic?: unknown }): boolean {
  return resolved.composedViewerLeaf !== undefined && page.composed !== undefined && page.comic === undefined;
}

export function computePageMetrics(resolved: ResolvedConfig): PageMetrics {
  const dpi = resolved.page.dpi;
  const trimWidthPx = dimensionToPx(resolved.page.width, dpi);
  const trimHeightPx = dimensionToPx(resolved.page.height, dpi);

  // Cut lines expansion: canvas grows to fit bleed + mark offset + mark length
  let trimOffset = 0;
  let bleedPx = 0;
  if (resolved.page.cutLines.enabled) {
    bleedPx = dimensionToPx(resolved.page.cutLines.bleed, dpi);
    const markOffsetPx = dimensionToPx(resolved.page.cutLines.markOffset, dpi);
    const markLengthPx = dimensionToPx(resolved.page.cutLines.markLength, dpi);
    trimOffset = bleedPx + markOffsetPx + markLengthPx;
  }

  const pageWidthPx = trimWidthPx + trimOffset * 2;
  const pageHeightPx = trimHeightPx + trimOffset * 2;

  const marginTop = dimensionToPx(resolved.page.margins.top, dpi);
  const marginBottom = dimensionToPx(resolved.page.margins.bottom, dpi);
  const marginLeft = dimensionToPx(resolved.page.margins.left, dpi);
  const marginRight = dimensionToPx(resolved.page.margins.right, dpi);

  const contentArea = createBoundingBox(
    marginLeft + trimOffset,
    marginTop + trimOffset,
    trimWidthPx - marginLeft - marginRight,
    trimHeightPx - marginTop - marginBottom,
  );

  const trimBox = createBoundingBox(trimOffset, trimOffset, trimWidthPx, trimHeightPx);
  const bleedBox = createBoundingBox(
    trimOffset - bleedPx,
    trimOffset - bleedPx,
    trimWidthPx + bleedPx * 2,
    trimHeightPx + bleedPx * 2,
  );

  const physical = { contentArea, trimBox, bleedBox };
  if (resolved.layout.writingMode === 'vertical-rl') {
    // The flow is a horizontal page turned a quarter turn clockwise: its
    // width is the sheet's height, its top the sheet's right edge.
    return {
      trimWidthPx, trimHeightPx, pageWidthPx, pageHeightPx, trimOffset,
      contentArea: sheetRectToFlow(contentArea, pageWidthPx),
      trimBox: sheetRectToFlow(trimBox, pageWidthPx),
      bleedBox: sheetRectToFlow(bleedBox, pageWidthPx),
      vertical: true,
      mirrored: false,
      flowWidthPx: pageHeightPx,
      flowHeightPx: pageWidthPx,
      physical,
    };
  }
  if (resolved.direction === 'rtl') {
    // A right-to-left flow is a left-to-right page turned over the sheet's
    // vertical axis: the margin written `left` (the inner one of a recto)
    // lands on the flow's right, and the trim and bleed boxes, centred on
    // the sheet, stay where they are.
    return {
      trimWidthPx, trimHeightPx, pageWidthPx, pageHeightPx, trimOffset,
      contentArea: mirrorContentArea(contentArea, pageWidthPx),
      trimBox: mirrorContentArea(trimBox, pageWidthPx),
      bleedBox: mirrorContentArea(bleedBox, pageWidthPx),
      vertical: false,
      mirrored: true,
      flowWidthPx: pageWidthPx,
      flowHeightPx: pageHeightPx,
      physical,
    };
  }
  return {
    trimWidthPx, trimHeightPx, pageWidthPx, pageHeightPx, trimOffset, contentArea, trimBox, bleedBox,
    vertical: false, mirrored: false, flowWidthPx: pageWidthPx, flowHeightPx: pageHeightPx, physical,
  };
}

/** Mirror a content area horizontally about the page's vertical centre line:
 *  the inner margin becomes the outer one and vice versa. Vertical extent is
 *  unchanged. */
export function mirrorContentArea(area: BoundingBox, pageWidthPx: number): BoundingBox {
  return createBoundingBox(
    pageWidthPx - (area.x + area.width),
    area.y,
    area.width,
    area.height,
  );
}

/** Mirror an area of a page's flow frame about the sheet's vertical centre
 *  line (`pageWidthPx` = the physical sheet width): a horizontal flip on a
 *  horizontal page, a flip of the flow's y axis on a vertical one (the
 *  flow's y runs across the sheet). */
export function mirrorFlowArea(area: BoundingBox, pageWidthPx: number, vertical: boolean): BoundingBox {
  if (!vertical) return mirrorContentArea(area, pageWidthPx);
  return createBoundingBox(area.x, pageWidthPx - (area.y + area.height), area.width, area.height);
}

/** Whether the page at `pageIndex` (position in `doc.pages`; its number is
 *  `pageIndex + pageIndexOffset + 1`) sets its mirrored margins swapped:
 *  with `margins.mirror`, the pages whose spine is on their left in the
 *  book's binding — the even pages of a left-bound book, the odd ones
 *  (rectos, the left pages of a spread) of a right-bound one. */
export function pageMirrored(
  resolved: Pick<ResolvedConfig, 'page'>,
  pageIndex: number,
  pageIndexOffset = 0,
  mirror = resolved.page.margins.mirror,
): boolean {
  if (!mirror) return false;
  const isEvenPage = (pageIndex + pageIndexOffset + 1) % 2 === 0;
  return isEvenPage !== (resolved.page.binding === 'right');
}

/** Whether `page` swaps its mirrored margins as seen from its flow: the
 *  parity the rules keyed to a page's spine side read (a callout's
 *  `'outer'` corner icon, an `'outer'` side column, the flush end of a
 *  turned float, a floated box's outer side). On a left-to-right page it
 *  is {@link pageMirrored}. A right-to-left page's flow is turned over the
 *  sheet (`VDTMirroredFlowFrame`), which puts the spine of a page whose
 *  spine is on its right on the flow's left: there the flow parity is the
 *  physical one inverted, so a right-bound right-to-left book behaves, in
 *  its flow, as a left-bound left-to-right one. Without mirrored margins
 *  no page swaps, in either direction. */
export function flowPageMirrored(
  resolved: Pick<ResolvedConfig, 'page'>,
  page: Pick<VDTPage, 'index' | 'flow'>,
  pageIndexOffset = 0,
  mirror = resolved.page.margins.mirror,
): boolean {
  const physical = pageMirrored(resolved, page.index, pageIndexOffset, mirror);
  if (!pageIsMirrored(page)) return physical;
  return mirror ? !physical : false;
}

/** Content area for the page at `pageIndex` (position in `doc.pages`). With
 *  `margins.mirror`, the pages {@link pageMirrored} names swap the inner and
 *  outer margins so the inner margin always faces the spine. The area is in
 *  the page's flow frame (vertical when `resolved.layout.writingMode` is). */
export function contentAreaForPage(
  metrics: Pick<PageMetrics, 'contentArea' | 'pageWidthPx'>,
  resolved: ResolvedConfig,
  pageIndex: number,
  pageIndexOffset = 0,
): BoundingBox {
  if (pageMirrored(resolved, pageIndex, pageIndexOffset)) {
    return mirrorFlowArea(metrics.contentArea, metrics.pageWidthPx, resolved.layout.writingMode === 'vertical-rl');
  }
  return createBoundingBox(
    metrics.contentArea.x,
    metrics.contentArea.y,
    metrics.contentArea.width,
    metrics.contentArea.height,
  );
}

// ---------------------------------------------------------------------------
// Style attribute copy: every VDTBlock mirrors a subset of BlockStyle fields.
// ---------------------------------------------------------------------------

/** The end indent of a block's style (`endIndent`, #424), by block: its
 *  box stops that far short of the column's (or box's) end side, so the
 *  renderers, which align and justify a line against its block's box, set
 *  it there. Kept off the VDT: the box width says it. */
const blockEndIndents = passSideTable('blockEndIndents', new WeakMap<VDTBlock, number>());

/** `width` less the end indent of `blk`, never under 1 px. */
export function widthLessEndIndent(blk: VDTBlock, width: number): number {
  const end = blockEndIndents.get(blk);
  return end === undefined ? width : Math.max(1, width - end);
}

/** Give `to`, a copy of `from`, the end indent `from` was set with. */
export function copyBlockEndIndent(from: VDTBlock, to: VDTBlock): void {
  const end = blockEndIndents.get(from);
  if (end !== undefined) blockEndIndents.set(to, end);
}

export function applyStyleAttrs(blk: VDTBlock, style: BlockStyle): void {
  if (style.endIndentPx !== undefined && style.endIndentPx > 0) blockEndIndents.set(blk, style.endIndentPx);
  if (style.boldFontString) blk.boldFontString = style.boldFontString;
  if (style.italicFontString) blk.italicFontString = style.italicFontString;
  if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
  if (style.boldColor) blk.boldColor = style.boldColor;
  if (style.italicColor) blk.italicColor = style.italicColor;
  if (style.referenceColor) blk.refColor = style.referenceColor;
  if (style.emphasis === 'overline') blk.emphasis = 'overline';
}

// ---------------------------------------------------------------------------
// Math-span enrichment
// ---------------------------------------------------------------------------

/**
 * Resolve inline math in a parsed block: calls `renderMath` on every `span.math`
 * and attaches `mathRender` metadata. When math is disabled, drops the math
 * metadata so spans fall back to the raw TeX (visible as literal `$...$`).
 */
export function enrichMathSpans(
  contentBlock: ContentBlock,
  style: BlockStyle,
  resolved: ResolvedConfig,
): ContentBlock {
  if (!contentBlock.spans.some((s) => s.math)) return contentBlock;

  const mathEnabled = resolved.math.enabled;
  const mathFontSizePx = style.fontSizePx * resolved.math.fontSizeScale;
  const mathColor = resolved.math.color?.hex ?? style.color;

  const mathReady = isMathReady();
  if (mathEnabled && !mathReady) noteMathWithoutEngine();
  const enrichedSpans = contentBlock.spans.map((s) => {
    if (!s.math) return s;
    if (!mathEnabled) {
      return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
    }
    const render = mathReady
      ? renderMath(s.math.tex, false, mathFontSizePx, { lineBoxPx: style.lineHeightPx, color: mathColor })
      : undefined;
    return { ...s, mathRender: render };
  });

  return { ...contentBlock, spans: enrichedSpans };
}

// ---------------------------------------------------------------------------
// Measurement-viewport adjustments for list items
// ---------------------------------------------------------------------------

export interface MeasureViewport {
  measureMaxWidth: number;
  lineXShift: number;
  measureFirstLineIndent: number;
  measureHangingIndent: boolean;
  /** Each line's indent (`MeasureBlockOptions.lineIndentsPx`) when the
   *  style pairs a first-line indent with a hanging one (#620). */
  measureLineIndents?: number[];
}

/** Compute measurement viewport: list items reserve horizontal space for indent + bullet + gap. */
export function computeMeasureViewport(
  columnWidth: number,
  style: BlockStyle,
  listBullet: import('../text/lists.js').ListBulletStyle | undefined,
): MeasureViewport {
  let measureMaxWidth = columnWidth;
  let lineXShift = 0;
  let measureFirstLineIndent = style.firstLineIndentPx;
  let measureHangingIndent = style.hangingIndent;

  // A paragraph style's `indent`: every line shifts right and the measure
  // narrows by it; the first-line or hanging indent counts from there.
  if (!listBullet && style.indentPx !== undefined && style.indentPx > 0) {
    const indentPx = Math.min(style.indentPx, Math.max(0, columnWidth - 1));
    measureMaxWidth = Math.max(1, columnWidth - indentPx);
    lineXShift = indentPx;
  }
  // A paragraph style's `endIndent` (地からN字上げ, #424): the measure
  // narrows from the end side; the lines keep their start.
  if (!listBullet && style.endIndentPx !== undefined && style.endIndentPx > 0) {
    measureMaxWidth = Math.max(1, measureMaxWidth - Math.min(style.endIndentPx, Math.max(0, measureMaxWidth - 1)));
  }

  if (listBullet) {
    const textGap = listBullet.bulletWidthPx + listBullet.gapPx;
    if (listBullet.hangingIndent) {
      measureMaxWidth = Math.max(1, columnWidth - listBullet.indentPx - textGap);
      lineXShift = listBullet.indentPx + textGap;
      measureFirstLineIndent = 0;
      measureHangingIndent = false;
    } else {
      measureMaxWidth = Math.max(1, columnWidth - listBullet.indentPx);
      lineXShift = listBullet.indentPx;
      measureFirstLineIndent = textGap;
      measureHangingIndent = false;
    }
  }

  // A first-line indent paired with a hanging one (#620).
  const measureLineIndents = !listBullet && style.hangingIndentPx !== undefined
    ? [Math.max(0, style.firstLineIndentPx), Math.max(0, style.hangingIndentPx)]
    : undefined;
  return { measureMaxWidth, lineXShift, measureFirstLineIndent, measureHangingIndent, ...(measureLineIndents ? { measureLineIndents } : {}) };
}

// Per-line source-range mapping: `sourceRanges.ts`.
export { stampSourceRanges } from './sourceRanges.js';

// ---------------------------------------------------------------------------
// Column rollback helper: remove the tail of `curCol.blocks` and also drop
// them from `doc.blocks`, refunding `availableHeight`. Returns the popped
// blocks (in column order) so callers can rewind `blockIdx` to the first
// one's `contentIndex`.
// ---------------------------------------------------------------------------

export function rollbackTrailingBlocks(
  curCol: { blocks: VDTBlock[]; availableHeight: number; bbox: BoundingBox },
  docBlocks: VDTBlock[],
  predicate: (b: VDTBlock) => boolean,
): VDTBlock[] {
  let count = 0;
  for (let j = curCol.blocks.length - 1; j >= 0; j--) {
    if (predicate(curCol.blocks[j]!)) count++;
    else break;
  }
  if (count === 0) return [];
  const popped = curCol.blocks.splice(curCol.blocks.length - count);
  for (const p of popped) {
    const idx = docBlocks.indexOf(p);
    if (idx !== -1) docBlocks.splice(idx, 1);
    curCol.availableHeight += p.bbox.height;
  }
  return popped;
}

// ---------------------------------------------------------------------------
// Neighbour lookups that see through container markers. `containerStart` /
// `containerEnd` carry no text and must not break heading runs, list runs,
// keep-with-next, or the "first paragraph after a heading" rule.
// ---------------------------------------------------------------------------

export function isMarkerBlock(block: ContentBlock | undefined): boolean {
  return block?.type === 'containerStart' || block?.type === 'containerEnd';
}

/** The next non-marker block after `idx`, or `undefined` at the end. */
export function nextNonMarkerBlock(blocks: readonly ContentBlock[], idx: number): ContentBlock | undefined {
  for (let i = idx + 1; i < blocks.length; i++) {
    if (!isMarkerBlock(blocks[i])) return blocks[i];
  }
  return undefined;
}

/** Body lines of the `:::space` directives right after `idx` (through
 *  container markers and other directives, up to the next content block) —
 *  the room keep-with-next must leave between a heading and its text. */
export function spaceLinesAfter(blocks: readonly ContentBlock[], idx: number): number {
  let lines = 0;
  for (let i = idx + 1; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (isMarkerBlock(b)) continue;
    if (b.type !== 'directive') break;
    if (b.directiveName === 'space') lines += spaceDirectiveLines(b.directiveAttrs) ?? 1;
  }
  return lines;
}

/** The previous non-marker block before `idx`, or `undefined` at the start. */
export function prevNonMarkerBlock(blocks: readonly ContentBlock[], idx: number): ContentBlock | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    if (!isMarkerBlock(blocks[i])) return blocks[i];
  }
  return undefined;
}

