import type { ResolvedUnorderedListLevelConfig, ResolvedOrderedListLevelConfig, OrderedListNumberFormat } from '../types';
import type { ContentBlock, ListKind } from '../parse';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import { buildFontString, measureGlyphWidth } from '../measure';
import type { BlockStyle } from './styles';
import { resolveBodyStyle } from './styles';

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
}

export interface ListItemResolved {
  text: BlockStyle;
  bullet: ListBulletStyle;
  /** The bullet's left-edge X offset WITHIN the column (for right-aligned ordered numbers). Added to block.bbox.x at finalize time. */
  bulletXOffsetInColumn: number;
  strikethroughText: boolean;
}

export interface OrderedRunMetric {
  numberText: string;
  numberWidthPx: number;
  maxNumberWidthPx: number;
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

/**
 * Compute the effective indent in px for each unordered list level.
 * User-overridden `indent` is honored directly. Otherwise level 1 falls back to
 * the general indent, and deeper levels cascade from the previous level's
 * text-start position (prev indent + prev bullet width + gap).
 */
export function computeLevelIndentsPx(resolved: ResolvedConfig, bodyFontSizePx: number): number[] {
  const dpi = resolved.page.dpi;
  const lists = resolved.unorderedLists;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyFontSizePx);
  const generalIndentPx = dimensionToPx(lists.indent, dpi, bodyFontSizePx);
  const result: number[] = [];
  for (let i = 0; i < lists.levels.length; i++) {
    const level = lists.levels[i]!;
    let indentPx: number;
    if (level.indent !== undefined) {
      indentPx = dimensionToPx(level.indent, dpi, bodyFontSizePx);
    } else if (i === 0) {
      indentPx = generalIndentPx;
    } else {
      const prev = lists.levels[i - 1]!;
      const prevFontSizePx = dimensionToPx(prev.fontSize, dpi, bodyFontSizePx);
      const prevFontString = buildFontString(
        prev.fontFamily,
        prevFontSizePx,
        prev.fontWeight.toString(),
        prev.italic ? 'italic' : 'normal',
      );
      const prevBulletWidthPx = measureGlyphWidth(prev.bulletChar, prevFontString);
      indentPx = result[i - 1]! + prevBulletWidthPx + gapPx;
    }
    result.push(indentPx);
  }
  return result;
}

/**
 * Same as computeLevelIndentsPx but for ordered lists. The cascade uses the
 * per-depth max number width observed in the document (falling back to a
 * width approximation based on "99." when no runs exist at that depth).
 */
export function computeOrderedLevelIndentsPx(
  resolved: ResolvedConfig,
  bodyFontSizePx: number,
  maxNumberWidthByDepth: Map<number, number>,
): number[] {
  const dpi = resolved.page.dpi;
  const lists = resolved.orderedLists;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyFontSizePx);
  const generalIndentPx = dimensionToPx(lists.indent, dpi, bodyFontSizePx);
  const result: number[] = [];
  for (let i = 0; i < lists.levels.length; i++) {
    const level = lists.levels[i]!;
    let indentPx: number;
    if (level.indent !== undefined) {
      indentPx = dimensionToPx(level.indent, dpi, bodyFontSizePx);
    } else if (i === 0) {
      indentPx = generalIndentPx;
    } else {
      const prevLevel = i; // 1-based depth of previous = i
      const prev = lists.levels[i - 1]!;
      const prevFontSizePx = dimensionToPx(prev.fontSize, dpi, bodyFontSizePx);
      const prevFontString = buildFontString(
        prev.fontFamily,
        prevFontSizePx,
        prev.fontWeight.toString(),
        prev.italic ? 'italic' : 'normal',
      );
      const fallbackWidthPx = measureGlyphWidth('99' + prev.separator, prevFontString);
      const observedMax = maxNumberWidthByDepth.get(prevLevel);
      const prevNumberWidthPx = observedMax ?? fallbackWidthPx;
      indentPx = result[i - 1]! + prevNumberWidthPx + gapPx;
    }
    result.push(indentPx);
  }
  return result;
}

function toRoman(n: number): string {
  if (n <= 0 || n >= 4000) return n.toString();
  const pairs: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of pairs) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

function toAlpha(n: number, upper: boolean): string {
  if (n <= 0) return n.toString();
  const base = upper ? 65 : 97;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(base + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function formatListNumber(n: number, format: OrderedListNumberFormat): string {
  switch (format) {
    case 'arabic': return n.toString();
    case 'lower-alpha': return toAlpha(n, false);
    case 'upper-alpha': return toAlpha(n, true);
    case 'lower-roman': return toRoman(n).toLowerCase();
    case 'upper-roman': return toRoman(n);
  }
}

/**
 * Walks content blocks identifying contiguous ordered-list runs per depth,
 * computes each item's formatted number + width, and the max width per run
 * (for right-align). Also tracks the global max per depth (for level-indent
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

  // Pre-compute per-level font strings (used to measure number widths).
  const levelFontStrings: string[] = lists.levels.map((lvl) => {
    const fontSizePx = dimensionToPx(lvl.fontSize, dpi, bodyFontSizePx);
    return buildFontString(
      lvl.fontFamily,
      fontSizePx,
      lvl.fontWeight.toString(),
      lvl.italic ? 'italic' : 'normal',
    );
  });

  const closeRun = (depth: number): void => {
    const run = runsByDepth.get(depth);
    if (!run || run.kind !== 'ordered' || run.itemIdxs.length === 0) {
      runsByDepth.delete(depth);
      return;
    }
    const levelIdx = Math.max(0, Math.min(levelFontStrings.length - 1, depth - 1));
    const fontString = levelFontStrings[levelIdx]!;
    let maxWidth = 0;
    const widths = new Map<number, number>();
    for (const idx of run.itemIdxs) {
      const entry = perBlock.get(idx);
      if (!entry) continue;
      const w = measureGlyphWidth(entry.numberText, fontString);
      widths.set(idx, w);
      if (w > maxWidth) maxWidth = w;
    }
    for (const idx of run.itemIdxs) {
      const entry = perBlock.get(idx);
      if (!entry) continue;
      entry.numberWidthPx = widths.get(idx) ?? 0;
      entry.maxNumberWidthPx = maxWidth;
    }
    const prevDepthMax = maxWidthByDepth.get(depth) ?? 0;
    if (maxWidth > prevDepthMax) maxWidthByDepth.set(depth, maxWidth);
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
      const numberText = formatListNumber(counter, levelCfg.numberFormat) + levelCfg.separator;
      perBlock.set(i, { numberText, numberWidthPx: 0, maxNumberWidthPx: 0 });
    }
  }
  closeAllRuns();
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

  const indentPx = levelIndentsPx[levelIdx] ?? 0;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyStyle.fontSizePx);
  const bulletWidthPx = measureGlyphWidth(bulletChar, bulletFontString);
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

  const numberFontSizePx = dimensionToPx(levelConfig.fontSize, dpi, bodyStyle.fontSizePx);
  const numberWeight = levelConfig.fontWeight.toString();
  const numberStyle = levelConfig.italic ? 'italic' : 'normal';
  const numberFontString = buildFontString(levelConfig.fontFamily, numberFontSizePx, numberWeight, numberStyle);

  const indentPx = levelIndentsPx[levelIdx] ?? 0;
  const gapPx = dimensionToPx(lists.gap, dpi, bodyStyle.fontSizePx);
  const itemSpacingPx = dimensionToPx(lists.itemSpacing, dpi, bodyStyle.fontSizePx);
  const verticalOffsetPx = dimensionToPx(levelConfig.verticalOffset, dpi, bodyStyle.fontSizePx);
  const marginTopPx = dimensionToPx(lists.marginTop, dpi, bodyStyle.fontSizePx);
  const marginBottomPx = dimensionToPx(lists.marginBottom, dpi, bodyStyle.fontSizePx);

  // Right-align: reserve max width so text starts after `indent + maxWidth + gap`.
  // The individual number is drawn at `indent + (maxWidth - thisWidth)`.
  const rightAlignOffsetPx = Math.max(0, metric.maxNumberWidthPx - metric.numberWidthPx);

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
    bulletWidthPx: metric.maxNumberWidthPx,
    gapPx,
    hangingIndent: lists.hangingIndent,
    itemSpacingPx,
    textFontSizePx: bodyStyle.fontSizePx,
    verticalOffsetPx,
  };

  return {
    text,
    bullet,
    bulletXOffsetInColumn: indentPx + rightAlignOffsetPx,
    strikethroughText: false,
  };
}
