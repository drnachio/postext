import { measuringVertically, flowTextWidth } from '../../measure/vertical.js';
import { getMeasureDirection, getMeasureArabicNumbers } from '../../measure/rtl/bidiLines.js';
import { rtlTextWidth } from '../../measure/script.js';
import { markerSetText } from '../../writing/bidi.js';
import { measuresRunsAsPainted } from '../../design/bidiText.js';
import type { ResolvedUnorderedListLevelConfig, ResolvedOrderedListLevelConfig } from '../../types.js';
import type { ContentBlock } from '../../parse/index.js';
import { dimensionToPx } from '../../units.js';
import type { ResolvedConfig, VDTBlock } from '../../vdt.js';
import { buildFontString } from '../../measure/index.js';
import { type BlockStyle, resolveBodyStyle } from '../styles.js';
import { isDrawnTaskBox, taskBoxSize } from '../../paint/taskBox.js';
import { type OrderedRunMetric, levelNumberFontString } from './lists/orderedRuns.js';

export { computeLevelIndentsPx, computeOrderedLevelIndentsPx, formatListNumber, computeOrderedListRunMetrics } from './lists/orderedRuns.js';
export type { OrderedRunMetric, OrderedListMetrics } from './lists/orderedRuns.js';

export interface ListBulletStyle {
  indentPx: number;
  bulletText: string;
  bulletFontString: string;
  bulletColor: string;
  bulletWidthPx: number;
  gapPx: number;
  hangingIndent: boolean;
  itemSpacingPx: number;
  textFontSizePx: number;
  verticalOffsetPx: number;
  /** Set the marker on the first line's baseline instead of centring it on
   *  the x-height (a contents entry's number). */
  onBaseline?: boolean;
  /** Ordered-list separator drawn as its own run (only when its style
   *  differs from the number's). `separatorOffsetPx` is measured from the
   *  bullet's left edge. */
  separatorText?: string;
  separatorFontString?: string;
  separatorColor?: string;
  separatorOffsetPx?: number;
  /** Ordered-list prefix (`（` of （一）) drawn as its own run before the
   *  number, in the separator's style, when the separator is one; else
   *  `bulletText` carries it. `prefixOffsetPx` is measured from the
   *  bullet's left edge (negative: the prefix sits before the number). */
  prefixText?: string;
  prefixOffsetPx?: number;
  /** The box of a task item the renderers draw (`VDTBlock.bulletBox`,
   *  #765): the block then takes it and neither `bulletText` nor
   *  `bulletFontString`, and `bulletWidthPx` is its side. */
  box?: { side: number; stroke: number; checked: boolean };
}

/**
 * The space between two consecutive list items (EF-165): the item spacing
 * of the list the shallower of the two belongs to, so a nested list keeps
 * its parent list's spacing on both sides of it, after its last item as
 * before its first. Between two items of one depth it is the first one's.
 */
/** How the marker of a block whose text runs in `direction` (the frame's
 *  when it names none) is painted, as `directListMarker` then says on the
 *  block: at a right-to-left level, Arabic numbers read as an Arabic-script
 *  document reads them, or undefined for a marker set left to right or
 *  down a column. */
export function markerDirection(direction: 'ltr' | 'rtl' = getMeasureDirection()): 'rtl' | 'rtl-arabic' | undefined {
  if (direction !== 'rtl' || measuringVertically()) return undefined;
  return getMeasureArabicNumbers() ? 'rtl-arabic' : 'rtl';
}

/**
 * The advance of a marker (a bullet, a number, its prefix or separator, a
 * contents number) in `font`, as it is painted (#770).
 *
 * A marker that reads right to left is one text set right to left on the
 * canvas and in the HTML (`markerSetText`), and a document shaped in its
 * own language measures that text so: the browser gives a mark with no
 * letter the forms of the text it stands in, and orders and mirrors it
 * there. Measured left to right, `«الفصل الأول»` in Markazi Text bold at
 * 28.13 px is 126.17 px for 120.32 px painted, its guillemets runs apart;
 * `أ.` 10.92 px for 10.72 px. A marker set left to right or down a
 * column, and every marker of a document that keeps its host's language,
 * is measured as it was.
 */
export function markerTextWidth(text: string, font: string, direction: 'rtl' | 'rtl-arabic' | undefined = markerDirection()): number {
  return direction !== undefined && measuresRunsAsPainted() ? rtlTextWidth(markerSetText(text, direction), font) : flowTextWidth(text, font);
}

export function listItemGapPx(
  prev: { spacingPx: number; depth: number },
  next: { spacingPx: number; depth: number },
): number {
  return next.depth < prev.depth ? next.spacingPx : prev.spacingPx;
}

/** The item spacing (px) of the list a list item belongs to, as
 *  {@link resolveOrderedListItemStyle} and
 *  {@link resolveUnorderedListItemStyle} work it out: its kind's
 *  `itemSpacing`, `em` being the body size. */
export function listItemSpacingPx(item: ContentBlock, resolved: ResolvedConfig): number {
  const lists = item.listKind === 'ordered' ? resolved.orderedLists : resolved.unorderedLists;
  const dpi = resolved.page.dpi;
  return dimensionToPx(lists.itemSpacing, dpi, dimensionToPx(resolved.bodyText.fontSize, dpi));
}

/** Where a list marker is painted, from the item's first line: centred on
 *  the text's x-height (`bulletY` is the em-box midpoint, painted with
 *  `textBaseline = 'middle'`), and, for a marker set as text
 *  (`onBaseline`), also on the line's baseline (`bulletBaselineY`), which
 *  renderers prefer. `bulletY` keeps its meaning for every marker, so a
 *  renderer that predates `bulletBaselineY` paints as it did. */
export function listBulletPosition(
  bullet: Pick<ListBulletStyle, 'textFontSizePx' | 'verticalOffsetPx' | 'onBaseline'>,
  firstLineBaseline: number,
): { bulletY: number; bulletBaselineY?: number } {
  const bulletY = firstLineBaseline - bullet.textFontSizePx * 0.3 + bullet.verticalOffsetPx;
  if (bullet.onBaseline) return { bulletY, bulletBaselineY: firstLineBaseline + bullet.verticalOffsetPx };
  return { bulletY };
}

export interface ListItemResolved {
  text: BlockStyle;
  bullet: ListBulletStyle;
  /** The bullet's left-edge X offset WITHIN the column (for right-aligned ordered numbers). Added to block.bbox.x at finalize time. */
  bulletXOffsetInColumn: number;
  strikethroughText: boolean;
}

export function resolveUnorderedListItemStyle(
  depth: number,
  resolved: ResolvedConfig,
  levelIndentsPx: number[],
  checked: boolean,
  isTask: boolean,
): ListItemResolved {
  const dpi = resolved.page.dpi;
  const bodyStyle = resolveBodyStyle(resolved);
  const lists = resolved.unorderedLists;
  const levelIdx = Math.max(0, Math.min(lists.levels.length - 1, depth - 1));
  const levelConfig: ResolvedUnorderedListLevelConfig = lists.levels[levelIdx]!;

  const bulletFontSizePx = dimensionToPx(levelConfig.fontSize, dpi, bodyStyle.fontSizePx);
  const bulletWeight = levelConfig.fontWeight.toString();
  const bulletStyle = levelConfig.italic ? 'italic' : 'normal';
  const bulletFontString = buildFontString(levelConfig.fontFamily, bulletFontSizePx, bulletWeight, bulletStyle);

  const bulletChar = isTask
    ? checked
      ? lists.taskCheckedChar
      : lists.taskCheckboxChar
    : levelConfig.bulletChar;

  // The default box of a task item is drawn (#765): its side comes from
  // the marker's size, so no font is asked for the character. A character
  // of the author's own, and the default one under `taskBox: 'character'`
  // (postext 1.28), is text, as wide as its face sets it.
  const box = isTask && lists.taskBox !== 'character' && isDrawnTaskBox(bulletChar, checked)
    ? { ...taskBoxSize(bulletFontSizePx, levelConfig.fontWeight), checked }
    : undefined;

  const indentPx = levelIndentsPx[levelIdx] ?? 0;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyStyle.fontSizePx);
  const bulletWidthPx = box ? box.side : markerTextWidth(bulletChar, bulletFontString);
  const itemSpacingPx = dimensionToPx(lists.itemSpacing, dpi, bodyStyle.fontSizePx);
  const verticalOffsetPx = dimensionToPx(levelConfig.verticalOffset, dpi, bodyStyle.fontSizePx);
  const marginTopPx = dimensionToPx(lists.marginTop, dpi, bodyStyle.fontSizePx);
  const marginBottomPx = dimensionToPx(lists.marginBottom, dpi, bodyStyle.fontSizePx);

  const completedMutedColor =
    isTask && checked && lists.taskCompletedColor ? lists.taskCompletedColor.hex : undefined;
  const textColor = completedMutedColor ?? bodyStyle.color;

  const text: BlockStyle = {
    ...bodyStyle,
    color: textColor,
    boldColor: completedMutedColor ? undefined : bodyStyle.boldColor,
    italicColor: completedMutedColor ? undefined : bodyStyle.italicColor,
    marginTopPx,
    marginBottomPx,
    firstLineIndentPx: 0,
    hangingIndent: false,
  };

  const bullet: ListBulletStyle = {
    indentPx,
    bulletText: bulletChar,
    bulletFontString,
    bulletColor: levelConfig.color.hex,
    bulletWidthPx,
    gapPx,
    hangingIndent: lists.hangingIndent,
    itemSpacingPx,
    textFontSizePx: bodyStyle.fontSizePx,
    verticalOffsetPx,
  };
  if (box) bullet.box = box;

  return {
    text,
    bullet,
    bulletXOffsetInColumn: indentPx,
    strikethroughText: isTask && checked && lists.taskCompletedStrikethrough,
  };
}

export function resolveOrderedListItemStyle(
  depth: number,
  resolved: ResolvedConfig,
  levelIndentsPx: number[],
  metric: OrderedRunMetric,
): ListItemResolved {
  const dpi = resolved.page.dpi;
  const bodyStyle = resolveBodyStyle(resolved);
  const lists = resolved.orderedLists;
  const levelIdx = Math.max(0, Math.min(lists.levels.length - 1, depth - 1));
  const levelConfig: ResolvedOrderedListLevelConfig = lists.levels[levelIdx]!;

  const numberFontString = levelNumberFontString(levelConfig, dpi, bodyStyle.fontSizePx);

  const indentPx = levelIndentsPx[levelIdx] ?? 0;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyStyle.fontSizePx);
  const itemSpacingPx = dimensionToPx(lists.itemSpacing, dpi, bodyStyle.fontSizePx);
  const verticalOffsetPx = dimensionToPx(levelConfig.verticalOffset, dpi, bodyStyle.fontSizePx);
  const marginTopPx = dimensionToPx(lists.marginTop, dpi, bodyStyle.fontSizePx);
  const marginBottomPx = dimensionToPx(lists.marginBottom, dpi, bodyStyle.fontSizePx);

  // Right-align: reserve max width so text starts after `indent + maxWidth + gap`.
  // The individual number is drawn at `indent + (maxWidth - thisWidth)`.
  // `numberAlign: 'start'` (#682) draws it at the start of the column
  // instead: the column keeps its width, so the text starts where it did.
  const rightAlignOffsetPx = lists.numberAlign === 'start' ? 0 : Math.max(0, metric.maxNumberWidthPx - metric.numberWidthPx);
  // A distinct separator run follows the (right-aligned) number column, so
  // it lands in the same column for every item of the run.
  const separatorGapPx = metric.separatorGapPx ?? 0;
  const separatorWidthPx = metric.separatorWidthPx ?? 0;
  const hasSeparatorRun = metric.separatorText !== undefined;
  // A prefix run sits before the (right-aligned) number, hugging it.
  const prefixWidthPx = metric.prefixText !== undefined ? metric.prefixWidthPx ?? 0 : 0;
  const markerWidthPx = hasSeparatorRun
    ? prefixWidthPx + metric.maxNumberWidthPx + separatorGapPx + separatorWidthPx
    : metric.maxNumberWidthPx;

  const text: BlockStyle = {
    ...bodyStyle,
    marginTopPx,
    marginBottomPx,
    firstLineIndentPx: 0,
    hangingIndent: false,
  };

  const bullet: ListBulletStyle = {
    indentPx,
    bulletText: metric.numberText,
    bulletFontString: numberFontString,
    bulletColor: levelConfig.color.hex,
    // Report the MAX width so the common text-shift math (`indent + bulletWidth + gap`)
    // still carves out the full numbered column for every item in the run.
    bulletWidthPx: markerWidthPx,
    gapPx,
    hangingIndent: lists.hangingIndent,
    itemSpacingPx,
    textFontSizePx: bodyStyle.fontSizePx,
    verticalOffsetPx,
  };
  if (hasSeparatorRun) {
    bullet.separatorText = metric.separatorText;
    bullet.separatorFontString = metric.separatorFontString;
    bullet.separatorColor = metric.separatorColor;
    bullet.separatorOffsetPx = metric.numberWidthPx + separatorGapPx;
    if (metric.prefixText !== undefined) {
      bullet.prefixText = metric.prefixText;
      bullet.prefixOffsetPx = -prefixWidthPx;
    }
  }

  return {
    text,
    bullet,
    bulletXOffsetInColumn: indentPx + prefixWidthPx + rightAlignOffsetPx,
    strikethroughText: false,
  };
}

/**
 * The marker of a list item set against its frame's direction (#371): an
 * English list in an Arabic book, an Arabic one in an English book. Its text
 * runs from the block's left edge (`measureContentBlock` mirrors the lines),
 * and each run of its marker — the prefix, the number or bullet, the
 * separator — moves to the mirror place in the block's width, so the marker
 * stands on the text's start side, its pieces in that side's reading order:
 * `(1)` keeps its brackets, and right-aligned numbers end up aligned on the
 * edge that faces the text. Call it once the marker positions are set.
 */
/**
 * Says how the marker of `blk` reads (`VDTBlock.bulletDirection`, #664)
 * once it is set: at a right-to-left level when the block's text runs
 * right to left (`direction`: the block's own, else its frame's), as an
 * Arabic-script document reads its numbers when `arabicNumbers` (#665).
 * A left-to-right block, and a marker of vertical text, say nothing.
 */
export function directListMarker(blk: VDTBlock, direction: 'ltr' | 'rtl', arabicNumbers: boolean, vertical = false): void {
  if (!blk.bulletText || blk.bulletOffsetX === undefined) return;
  if (direction === 'rtl' && !vertical) blk.bulletDirection = arabicNumbers ? 'rtl-arabic' : 'rtl';
  else delete blk.bulletDirection;
}

export function mirrorListMarker(blk: VDTBlock): void {
  // A drawn box (#765) moves by its side: it has no text to measure.
  if (blk.bulletOffsetX !== undefined && blk.bulletBox) {
    blk.bulletOffsetX = 2 * blk.bbox.x + blk.bbox.width - blk.bulletOffsetX - blk.bulletBox.side;
    return;
  }
  if (blk.bulletOffsetX === undefined || !blk.bulletText) return;
  const left = blk.bbox.x;
  const right = blk.bbox.x + blk.bbox.width;
  const flip = (x: number, w: number): number => left + right - x - w;
  const bulletFont = blk.bulletFontString ?? blk.fontString;
  const markFont = blk.separatorFontString ?? bulletFont;
  // The block reads against its frame: its marker was measured in the
  // block's own direction.
  const reads = markerDirection(getMeasureDirection() === 'rtl' ? 'ltr' : 'rtl');
  if (blk.separatorText !== undefined && blk.separatorX !== undefined) {
    blk.separatorX = flip(blk.separatorX, markerTextWidth(blk.separatorText, markFont, reads));
  }
  if (blk.prefixText !== undefined && blk.prefixX !== undefined) {
    blk.prefixX = flip(blk.prefixX, markerTextWidth(blk.prefixText, markFont, reads));
  }
  blk.bulletOffsetX = flip(blk.bulletOffsetX, markerTextWidth(blk.bulletText, bulletFont, reads));
}
