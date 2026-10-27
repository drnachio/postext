// Ordered-list runs: each item's formatted number and its width, the
// separator run, the level indents the numbers cascade into, and the list
// number formatter (#1278: split out of lists.ts).
import type { ResolvedOrderedListLevelConfig, Dimension, DigitSystem, OrderedListNumberFormat } from '../../../types.js';
import type { ListKind, ContentBlock } from '../../../parse/index.js';
import { dimensionToPx } from '../../../units.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { buildFontString } from '../../../measure/index.js';
import { parseNumberFormat, formatNumeral } from '../../../numerals/numbering.js';
import { withDigits } from '../../../numerals/arabicNumerals.js';
import { languageOf, defaultNumeralsFor } from '../../../hyphenation/locale.js';
import { resolvedLocale } from '../../config.js';
import { markerTextWidth, markerDirection } from '../lists.js';

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

export function levelNumberFontString(level: ResolvedOrderedListLevelConfig, dpi: number, bodyFontSizePx: number): string {
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
