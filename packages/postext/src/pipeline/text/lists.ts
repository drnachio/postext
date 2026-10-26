import { flowTextWidth, measuringVertically } from '../../measure/vertical.js';
import { getMeasureArabicNumbers, getMeasureDirection } from '../../measure/rtl/bidiLines.js';
import { rtlTextWidth } from '../../measure/script.js';
import { markerSetText } from '../../writing/bidi.js';
import { measuresRunsAsPainted } from '../../design/bidiText.js';
import type { ResolvedUnorderedListLevelConfig, ResolvedOrderedListLevelConfig, OrderedListNumberFormat, Dimension, DigitSystem } from '../../types.js';
import type { ContentBlock, ListKind } from '../../parse/index.js';
import { dimensionToPx } from '../../units.js';
import type { ResolvedConfig, VDTBlock } from '../../vdt.js';
import { buildFontString } from '../../measure/index.js';
import { formatNumeral, parseNumberFormat } from '../../numerals/numbering.js';
import { withDigits } from '../../numerals/arabicNumerals.js';
import { defaultNumeralsFor, languageOf } from '../../hyphenation/locale.js';
import { resolvedLocale } from '../config.js';
import type { BlockStyle } from '../styles.js';
import { resolveBodyStyle } from '../styles.js';
import { isDrawnTaskBox, taskBoxSize } from '../../paint/taskBox.js';

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
function markerDirection(direction: 'ltr' | 'rtl' = getMeasureDirection()): 'rtl' | 'rtl-arabic' | undefined {
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

export interface OrderedRunMetric {
  /** Formatted number; includes the separator unless a distinct separator
   *  run exists (`separatorText` set). */
  numberText: string;
  numberWidthPx: number;
  maxNumberWidthPx: number;
  /** Distinct separator run (style differs from the number's). */
  separatorText?: string;
  separatorFontString?: string;
  separatorColor?: string;
  separatorGapPx?: number;
  separatorWidthPx?: number;
  /** Prefix drawn as a run of its own (with the separator run). */
  prefixText?: string;
  prefixWidthPx?: number;
}

/** Style of the separator run when it must be drawn apart from the number. */
interface SeparatorRunStyle {
  fontString: string;
  color: string;
  gapPx: number;
}

function levelNumberFontString(level: ResolvedOrderedListLevelConfig, dpi: number, bodyFontSizePx: number): string {
  const fontSizePx = dimensionToPx(level.fontSize, dpi, bodyFontSizePx);
  return buildFontString(
    level.fontFamily,
    fontSizePx,
    level.fontWeight.toString(),
    level.italic ? 'italic' : 'normal',
  );
}

/**
 * The separator becomes its own run only when its resolved style differs
 * from the number's (font, colour or a positive gap). With the defaults the
 * marker stays a single `number + separator` text run.
 */
function resolveSeparatorRun(
  level: ResolvedOrderedListLevelConfig,
  numberFontString: string,
  dpi: number,
  bodyFontSizePx: number,
): SeparatorRunStyle | undefined {
  if (level.separator.length === 0) return undefined;
  const fontSizePx = dimensionToPx(level.fontSize, dpi, bodyFontSizePx);
  const fontString = buildFontString(
    level.separatorFontFamily,
    fontSizePx,
    level.separatorFontWeight.toString(),
    level.separatorItalic ? 'italic' : 'normal',
  );
  const gapPx = dimensionToPx(level.separatorGap, dpi, bodyFontSizePx);
  const color = level.separatorColor.hex;
  if (fontString === numberFontString && color === level.color.hex && gapPx === 0) return undefined;
  return { fontString, color, gapPx };
}

export interface OrderedListMetrics {
  perBlock: Map<number, OrderedRunMetric>;
  maxWidthByDepth: Map<number, number>;
}

interface OpenRun {
  kind: ListKind;
  counter: number;
  itemIdxs: number[];
}

/** Shared shape of list-level configs consumed by the indent cascade. */
interface IndentCascadeLevel {
  indent?: Dimension;
  fontFamily: string;
  fontSize: Dimension;
  fontWeight: number;
  italic: boolean;
}

/**
 * Compute the effective indent in px for each list level. User-overridden
 * `indent` is honored directly. Otherwise level 1 falls back to the general
 * indent, and deeper levels cascade from the previous level's text-start
 * position (prev indent + prev marker width + gap). The marker width is
 * supplied by `prevMarkerWidthPx` so unordered (bullet glyph) and ordered
 * (number column) lists share the cascade.
 */
function computeIndentCascade<T extends IndentCascadeLevel>(
  levels: T[],
  generalIndentPx: number,
  gapPx: number,
  dpi: number,
  bodyFontSizePx: number,
  prevMarkerWidthPx: (prev: T, prevFontString: string, prevIndex: number) => number,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    let indentPx: number;
    if (level.indent !== undefined) {
      indentPx = dimensionToPx(level.indent, dpi, bodyFontSizePx);
    } else if (i === 0) {
      indentPx = generalIndentPx;
    } else {
      const prev = levels[i - 1]!;
      const prevFontSizePx = dimensionToPx(prev.fontSize, dpi, bodyFontSizePx);
      const prevFontString = buildFontString(
        prev.fontFamily,
        prevFontSizePx,
        prev.fontWeight.toString(),
        prev.italic ? 'italic' : 'normal',
      );
      indentPx = result[i - 1]! + prevMarkerWidthPx(prev, prevFontString, i - 1) + gapPx;
    }
    result.push(indentPx);
  }
  return result;
}

/** Indent cascade for unordered list levels (marker = bullet glyph). */
export function computeLevelIndentsPx(resolved: ResolvedConfig, bodyFontSizePx: number): number[] {
  const dpi = resolved.page.dpi;
  const lists = resolved.unorderedLists;
  return computeIndentCascade(
    lists.levels,
    dimensionToPx(lists.indent, dpi, bodyFontSizePx),
    dimensionToPx(lists.gap, dpi, bodyFontSizePx),
    dpi,
    bodyFontSizePx,
    (prev, prevFontString) => markerTextWidth(prev.bulletChar, prevFontString),
  );
}

/**
 * Indent cascade for ordered list levels. The marker width is the per-depth
 * max number width observed in the document (falling back to a width
 * approximation based on "99." when no runs exist at that depth).
 */
export function computeOrderedLevelIndentsPx(
  resolved: ResolvedConfig,
  bodyFontSizePx: number,
  maxNumberWidthByDepth: Map<number, number>,
): number[] {
  const dpi = resolved.page.dpi;
  const lists = resolved.orderedLists;
  return computeIndentCascade(
    lists.levels,
    dimensionToPx(lists.indent, dpi, bodyFontSizePx),
    dimensionToPx(lists.gap, dpi, bodyFontSizePx),
    dpi,
    bodyFontSizePx,
    // 1-based depth of the previous level = prevIndex + 1.
    (prev, prevFontString, prevIndex) => {
      const measured = maxNumberWidthByDepth.get(prevIndex + 1);
      if (measured !== undefined) return measured;
      const sep = resolveSeparatorRun(prev, prevFontString, dpi, bodyFontSizePx);
      const sample = withDigits('99', resolved.numerals);
      if (!sep) return markerTextWidth(prev.prefix + sample + prev.separator, prevFontString);
      return (prev.prefix ? markerTextWidth(prev.prefix, sep.fontString) : 0)
        + markerTextWidth(sample, prevFontString) + sep.gapPx + markerTextWidth(prev.separator, sep.fontString);
    },
  );
}

/** The digits a list item numbers in: the document's, unless the
 *  container it sits in names another language (`:::paragraphs{dir=ltr
 *  lang=en}` in an Arabic book), whose own digits it takes (#401). */
function listDigits(block: ContentBlock, resolved: ResolvedConfig): DigitSystem | undefined {
  if (!block.lang || languageOf(block.lang) === languageOf(resolvedLocale(resolved))) return resolved.numerals;
  return defaultNumeralsFor(block.lang);
}

/** An ordered-list item's number in its level's format, by the shared
 *  numeral formatter. Lists keep two edges of their own: a number below 1
 *  (a Markdown list may start at `0.`) prints in digits, and so does a roman
 *  numeral from 4000 up. The resolver hands over the list spelling; a part's
 *  partial override is applied after it, so any spelling is read here too
 *  (unknown → arabic). Decimal numbers, and those digits, are written in
 *  the document's `digits`. */
export function formatListNumber(n: number, format: OrderedListNumberFormat, digits?: DigitSystem): string {
  const style = parseNumberFormat(format) ?? 'decimal';
  if (n < 0 || (n === 0 && !OWN_ZERO.has(style))) return withDigits(n.toString(), digits);
  if ((style === 'lower-roman' || style === 'upper-roman') && n >= 4000) return withDigits(n.toString(), digits);
  return formatNumeral(n, style, digits);
}

/** The styles with a zero of their own (零, 〇, ⓪, ０, ٠, ۰); an item
 *  numbered 0 in them prints it. The kana series have none. */
const OWN_ZERO = new Set<string>(['simp-chinese-informal', 'trad-chinese-informal', 'simp-chinese-formal', 'trad-chinese-formal', 'japanese-informal', 'japanese-formal', 'cjk-decimal', 'circled-decimal', 'fullwidth-decimal', 'arabic-indic', 'persian']);

/**
 * Walks content blocks identifying contiguous ordered-list runs per depth,
 * computes each item's formatted number + width, and the max width per run
 * (for right-align; per depth instead with `orderedLists.numberWidth:
 * 'level'`, the item's own with `'item'`). Also tracks the global max per depth (for level-indent
 * cascade in ordered lists).
 */
export function computeOrderedListRunMetrics(
  contentBlocks: ContentBlock[],
  resolved: ResolvedConfig,
  bodyFontSizePx: number,
): OrderedListMetrics {
  const dpi = resolved.page.dpi;
  const lists = resolved.orderedLists;
  const perBlock = new Map<number, OrderedRunMetric>();
  const maxWidthByDepth = new Map<number, number>();
  const runsByDepth = new Map<number, OpenRun>();
  /** The widest number (separator run left out) per depth, and each
   *  item's depth, for `numberWidth: 'level'` (EF-171). */
  const maxNumberByDepth = new Map<number, number>();
  const depthOf = new Map<number, number>();

  // Pre-compute per-level font strings (used to measure number widths) and
  // the separator run style when it differs from the number's.
  const levelFontStrings: string[] = lists.levels.map((lvl) => levelNumberFontString(lvl, dpi, bodyFontSizePx));
  const levelSeparatorRuns: Array<SeparatorRunStyle | undefined> = lists.levels.map((lvl, i) =>
    resolveSeparatorRun(lvl, levelFontStrings[i]!, dpi, bodyFontSizePx),
  );

  const closeRun = (depth: number): void => {
    const run = runsByDepth.get(depth);
    if (!run || run.kind !== 'ordered' || run.itemIdxs.length === 0) {
      runsByDepth.delete(depth);
      return;
    }
    const levelIdx = Math.max(0, Math.min(levelFontStrings.length - 1, depth - 1));
    const fontString = levelFontStrings[levelIdx]!;
    const sepRun = levelSeparatorRuns[levelIdx];
    const separator = lists.levels[levelIdx]!.separator;
    const prefix = lists.levels[levelIdx]!.prefix;
    // The separator (and prefix) is the same string in the same font for
    // the whole run.
    // The run's markers read as its first item does (a list set against
    // its frame's direction says so on every item).
    const reads = markerDirection(contentBlocks[run.itemIdxs[0] ?? -1]?.direction);
    const separatorWidthPx = sepRun ? markerTextWidth(separator, sepRun.fontString, reads) : 0;
    const prefixWidthPx = sepRun && prefix ? markerTextWidth(prefix, sepRun.fontString, reads) : 0;
    let maxWidth = 0;
    const widths = new Map<number, number>();
    for (const idx of run.itemIdxs) {
      const entry = perBlock.get(idx);
      if (!entry) continue;
      const w = markerTextWidth(entry.numberText, fontString, markerDirection(contentBlocks[idx]?.direction));
      widths.set(idx, w);
      if (w > maxWidth) maxWidth = w;
    }
    for (const idx of run.itemIdxs) {
      const entry = perBlock.get(idx);
      if (!entry) continue;
      entry.numberWidthPx = widths.get(idx) ?? 0;
      entry.maxNumberWidthPx = maxWidth;
      if (sepRun) entry.separatorWidthPx = separatorWidthPx;
      if (entry.prefixText !== undefined) entry.prefixWidthPx = prefixWidthPx;
    }
    // Marker column = right-aligned numbers (+ gap + separator when split,
    // and the prefix before them).
    const markerWidth = sepRun ? prefixWidthPx + maxWidth + sepRun.gapPx + separatorWidthPx : maxWidth;
    const prevDepthMax = maxWidthByDepth.get(depth) ?? 0;
    if (markerWidth > prevDepthMax) maxWidthByDepth.set(depth, markerWidth);
    if (maxWidth > (maxNumberByDepth.get(depth) ?? 0)) maxNumberByDepth.set(depth, maxWidth);
    for (const idx of run.itemIdxs) depthOf.set(idx, depth);
    runsByDepth.delete(depth);
  };

  const closeAllRuns = (): void => {
    for (const depth of Array.from(runsByDepth.keys())) closeRun(depth);
  };

  const closeDeeperRuns = (depth: number): void => {
    for (const d of Array.from(runsByDepth.keys())) {
      if (d > depth) closeRun(d);
    }
  };

  for (let i = 0; i < contentBlocks.length; i++) {
    const block = contentBlocks[i]!;
    if (block.type !== 'listItem') {
      closeAllRuns();
      continue;
    }
    const depth = block.depth ?? 1;
    const kind: ListKind = block.listKind ?? 'unordered';
    closeDeeperRuns(depth);

    const existing = runsByDepth.get(depth);
    if (!existing || existing.kind !== kind) {
      if (existing) closeRun(depth);
      runsByDepth.set(depth, { kind, counter: 0, itemIdxs: [] });
    }
    const run = runsByDepth.get(depth)!;

    if (kind === 'ordered') {
      // Honor the literal MD number for every item — authors can type `1. 2. 10.`
      // to get `1. 2. 10.` in the render. Falls back to an auto-increment when
      // the parser didn't attach a number (defensive; always set in practice).
      const counter = block.startNumber ?? run.counter + 1;
      run.counter = counter;
      run.itemIdxs.push(i);
      const levelIdx = Math.max(0, Math.min(lists.levels.length - 1, depth - 1));
      const levelCfg = lists.levels[levelIdx]!;
      const sepRun = levelSeparatorRuns[levelIdx];
      const number = formatListNumber(counter, levelCfg.numberFormat, listDigits(block, resolved));
      perBlock.set(i, sepRun
        ? {
            numberText: number,
            numberWidthPx: 0,
            maxNumberWidthPx: 0,
            separatorText: levelCfg.separator,
            separatorFontString: sepRun.fontString,
            separatorColor: sepRun.color,
            separatorGapPx: sepRun.gapPx,
            separatorWidthPx: 0,
            ...(levelCfg.prefix ? { prefixText: levelCfg.prefix, prefixWidthPx: 0 } : {}),
          }
        : { numberText: levelCfg.prefix + number + levelCfg.separator, numberWidthPx: 0, maxNumberWidthPx: 0 });
    }
  }
  closeAllRuns();
  // `numberWidth: 'level'`: every item's number column is the widest at
  // its depth in the document, so all of them start their text alike.
  if (lists.numberWidth === 'level') {
    for (const [idx, entry] of perBlock) {
      const widest = maxNumberByDepth.get(depthOf.get(idx) ?? 1);
      if (widest !== undefined) entry.maxNumberWidthPx = widest;
    }
  }
  // `numberWidth: 'item'` (#722): the column of an item is its own
  // number, so its text starts one gap after its own label. The indents
  // of the deeper levels keep the widest number of the level above
  // (`maxWidthByDepth`).
  if (lists.numberWidth === 'item') {
    for (const entry of perBlock.values()) entry.maxNumberWidthPx = entry.numberWidthPx;
  }
  return { perBlock, maxWidthByDepth };
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
