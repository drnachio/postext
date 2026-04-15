import type { PostextContent, PostextConfig, ResolvedHeadingLevelConfig, ResolvedUnorderedListLevelConfig, ResolvedOrderedListLevelConfig, OrderedListNumberFormat, TextAlign } from './types';
import type { ContentBlock, ListKind } from './parse';
import {
  resolvePageConfig,
  resolveLayoutConfig,
  resolveBodyTextConfig,
  resolveHeadingsConfig,
  resolveUnorderedListsConfig,
  resolveOrderedListsConfig,
  applyPaletteToConfig,
} from './defaults';
import { dimensionToPx } from './units';
import {
  createBoundingBox,
  createVDTDocument,
  createVDTPage,
  createVDTColumn,
  createVDTBlock,
  type BoundingBox,
  type ResolvedConfig,
  type VDTDocument,
  type VDTBlock,
  type VDTLine,
  type VDTPage,
  type VDTColumn,
} from './vdt';
import { parseMarkdown } from './parse';
import { computeHeadingNumbers, type HeadingTemplates } from './numbering';
import { extractFrontmatter } from './frontmatter';
import { buildFontString, measureBlock, measureRichBlock, measureGlyphWidth, initHyphenator } from './measure';

// ---------------------------------------------------------------------------
// Config resolution helpers
// ---------------------------------------------------------------------------

function resolveAllConfig(rawConfig?: PostextConfig): ResolvedConfig {
  const config = applyPaletteToConfig(rawConfig);
  const bodyText = resolveBodyTextConfig(config?.bodyText);
  return {
    page: resolvePageConfig(config?.page),
    layout: resolveLayoutConfig(config?.layout),
    bodyText,
    headings: resolveHeadingsConfig(config?.headings),
    unorderedLists: resolveUnorderedListsConfig(config?.unorderedLists, bodyText),
    orderedLists: resolveOrderedListsConfig(config?.orderedLists, bodyText),
  };
}

// ---------------------------------------------------------------------------
// Baseline grid computation
// ---------------------------------------------------------------------------

function computeBaselineGrid(resolved: ResolvedConfig): number {
  const dpi = resolved.page.dpi;
  const bodyFontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightDim = resolved.bodyText.lineHeight;

  // em/rem: multiplier of font size; pt/px/cm/etc: absolute
  if (lineHeightDim.unit === 'em' || lineHeightDim.unit === 'rem') {
    return bodyFontSizePx * lineHeightDim.value;
  }
  return dimensionToPx(lineHeightDim, dpi, bodyFontSizePx);
}

// ---------------------------------------------------------------------------
// Column layout computation
// ---------------------------------------------------------------------------

function computeColumnBboxes(
  contentArea: BoundingBox,
  resolved: ResolvedConfig,
): BoundingBox[] {
  const { layoutType, gutterWidth, sideColumnPercent } = resolved.layout;
  const dpi = resolved.page.dpi;

  if (layoutType === 'single') {
    return [createBoundingBox(contentArea.x, contentArea.y, contentArea.width, contentArea.height)];
  }

  const gutterPx = dimensionToPx(gutterWidth, dpi);

  if (layoutType === 'double') {
    const colWidth = (contentArea.width - gutterPx) / 2;
    return [
      createBoundingBox(contentArea.x, contentArea.y, colWidth, contentArea.height),
      createBoundingBox(contentArea.x + colWidth + gutterPx, contentArea.y, colWidth, contentArea.height),
    ];
  }

  // oneAndHalf
  const sideWidth = contentArea.width * (sideColumnPercent / 100);
  const mainWidth = contentArea.width - sideWidth - gutterPx;
  return [
    createBoundingBox(contentArea.x, contentArea.y, mainWidth, contentArea.height),
    createBoundingBox(contentArea.x + mainWidth + gutterPx, contentArea.y, sideWidth, contentArea.height),
  ];
}

// ---------------------------------------------------------------------------
// Style resolution for blocks
// ---------------------------------------------------------------------------

interface BlockStyle {
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  fontSizePx: number;
  lineHeightPx: number;
  color: string;
  textAlign: TextAlign;
  hyphenate: boolean;
  marginTopPx: number;
  marginBottomPx: number;
  firstLineIndentPx: number;
  hangingIndent: boolean;
}

interface ListBulletStyle {
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

function resolveBodyStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const weight = resolved.bodyText.fontWeight.toString();
  const fontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight);
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  const boldFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight);
  const italicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'italic');
  const boldItalicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'italic');
  const textAlign = resolved.bodyText.textAlign;
  const hyphenate = resolved.bodyText.hyphenation.enabled && textAlign === 'justify';
  const firstLineIndentPx = dimensionToPx(resolved.bodyText.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = resolved.bodyText.hangingIndent;
  const marginBottomPx = resolved.bodyText.paragraphSpacing ? lineHeightPx : 0;
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: resolved.bodyText.color.hex, textAlign, hyphenate, marginTopPx: 0, marginBottomPx, firstLineIndentPx, hangingIndent };
}

function resolveHeadingStyle(
  level: number,
  resolved: ResolvedConfig,
): BlockStyle {
  const dpi = resolved.page.dpi;
  const headingConfig: ResolvedHeadingLevelConfig =
    resolved.headings.levels.find((l) => l.level === level) ?? resolved.headings.levels[0]!;

  const fontSizePx = dimensionToPx(headingConfig.fontSize, dpi);
  const lineHeightDim = headingConfig.lineHeight;
  let lineHeightPx: number;
  if (lineHeightDim.unit === 'em' || lineHeightDim.unit === 'rem') {
    lineHeightPx = fontSizePx * lineHeightDim.value;
  } else {
    lineHeightPx = dimensionToPx(lineHeightDim, dpi, fontSizePx);
  }

  const weight = headingConfig.fontWeight.toString();
  const baseItalic = headingConfig.italic ? 'italic' : 'normal';
  const flipItalic = headingConfig.italic ? 'normal' : 'italic';
  const fontString = buildFontString(headingConfig.fontFamily, fontSizePx, weight, baseItalic);
  const boldFontString = fontString;
  const italicFontString = buildFontString(headingConfig.fontFamily, fontSizePx, weight, flipItalic);
  const boldItalicFontString = italicFontString;
  const textAlign = resolved.headings.textAlign;
  const marginTopPx = dimensionToPx(headingConfig.marginTop, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(headingConfig.marginBottom, dpi, fontSizePx);
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: headingConfig.color.hex, textAlign, hyphenate: false, marginTopPx, marginBottomPx, firstLineIndentPx: 0, hangingIndent: false };
}

function resolveBlockquoteStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const weight = resolved.bodyText.fontWeight.toString();
  const fontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'italic');
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  const boldFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'italic');
  // Inside a blockquote (already italic), `*text*` flips back to upright.
  const italicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'normal');
  const boldItalicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'normal');
  const textAlign = resolved.bodyText.textAlign;
  const hyphenate = resolved.bodyText.hyphenation.enabled && textAlign === 'justify';
  const firstLineIndentPx = dimensionToPx(resolved.bodyText.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = resolved.bodyText.hangingIndent;
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: '#666666', textAlign, hyphenate, marginTopPx: 0, marginBottomPx: 0, firstLineIndentPx, hangingIndent };
}

/**
 * Compute the effective indent in px for each unordered list level.
 * User-overridden `indent` is honored directly. Otherwise level 1 falls back to
 * the general indent, and deeper levels cascade from the previous level's
 * text-start position (prev indent + prev bullet width + gap).
 */
function computeLevelIndentsPx(resolved: ResolvedConfig, bodyFontSizePx: number): number[] {
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
function computeOrderedLevelIndentsPx(
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

interface OrderedRunMetric {
  numberText: string;
  numberWidthPx: number;
  maxNumberWidthPx: number;
}

interface OrderedListMetrics {
  perBlock: Map<number, OrderedRunMetric>;
  maxWidthByDepth: Map<number, number>;
}

interface OpenRun {
  kind: ListKind;
  counter: number;
  itemIdxs: number[];
}

/**
 * Walks content blocks identifying contiguous ordered-list runs per depth,
 * computes each item's formatted number + width, and the max width per run
 * (for right-align). Also tracks the global max per depth (for level-indent
 * cascade in ordered lists).
 */
function computeOrderedListRunMetrics(
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

interface ListItemResolved {
  text: BlockStyle;
  bullet: ListBulletStyle;
  /** The bullet's left-edge X offset WITHIN the column (for right-aligned ordered numbers). Added to block.bbox.x at finalize time. */
  bulletXOffsetInColumn: number;
  strikethroughText: boolean;
}

function resolveUnorderedListItemStyle(
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
    marginTopPx,
    marginBottomPx,
    firstLineIndentPx: 0,
    hangingIndent: false,
    textAlign: 'left',
    hyphenate: false,
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

function resolveOrderedListItemStyle(
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
    textAlign: 'left',
    hyphenate: false,
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

// ---------------------------------------------------------------------------
// Line position reset (for split blocks)
// ---------------------------------------------------------------------------

function resetLinePositions(
  lines: VDTLine[],
  lineHeightPx: number,
): VDTLine[] {
  return lines.map((line, i) => ({
    ...line,
    bbox: createBoundingBox(line.bbox.x, i * lineHeightPx, line.bbox.width, lineHeightPx),
    baseline: i * lineHeightPx + lineHeightPx * 0.8,
  }));
}

// ---------------------------------------------------------------------------
// Page creation with columns
// ---------------------------------------------------------------------------

function createPageWithColumns(
  pageIndex: number,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
): VDTPage {
  const page = createVDTPage(pageIndex, pageWidthPx, pageHeightPx);
  const colBboxes = computeColumnBboxes(contentArea, resolved);
  for (let i = 0; i < colBboxes.length; i++) {
    page.columns.push(createVDTColumn(i, colBboxes[i]!));
  }
  return page;
}

// ---------------------------------------------------------------------------
// Block placement
// ---------------------------------------------------------------------------

interface PlacementCursor {
  pageIndex: number;
  columnIndex: number;
}

function currentColumn(doc: VDTDocument, cursor: PlacementCursor): VDTColumn {
  return doc.pages[cursor.pageIndex]!.columns[cursor.columnIndex]!;
}

function advanceToNextColumn(
  doc: VDTDocument,
  cursor: PlacementCursor,
  resolved: ResolvedConfig,
  contentArea: BoundingBox,
  pageWidthPx: number,
  pageHeightPx: number,
): void {
  const page = doc.pages[cursor.pageIndex]!;
  if (cursor.columnIndex < page.columns.length - 1) {
    cursor.columnIndex++;
  } else {
    // New page
    const newPage = createPageWithColumns(
      doc.pages.length,
      resolved,
      contentArea,
      pageWidthPx,
      pageHeightPx,
    );
    doc.pages.push(newPage);
    cursor.pageIndex = newPage.index;
    cursor.columnIndex = 0;
  }
}

function placeBlockInColumn(
  block: VDTBlock,
  blockHeight: number,
  col: VDTColumn,
  cursor: PlacementCursor,
): void {
  const y = col.bbox.y + (col.bbox.height - col.availableHeight);
  block.bbox = createBoundingBox(col.bbox.x, y, col.bbox.width, blockHeight);
  block.pageIndex = cursor.pageIndex;
  block.columnIndex = cursor.columnIndex;

  // Offset all line bboxes to absolute page coordinates
  for (const line of block.lines) {
    line.bbox.x += col.bbox.x;
    line.bbox.y += y;
    line.baseline += y;
  }

  col.blocks.push(block);
  col.availableHeight -= blockHeight;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
): VDTDocument {
  const resolved = resolveAllConfig(config);
  const dpi = resolved.page.dpi;

  // Initialize hyphenator if needed
  if (resolved.bodyText.hyphenation.enabled && resolved.bodyText.textAlign === 'justify') {
    initHyphenator(resolved.bodyText.hyphenation.locale);
  }

  // Compute baseline grid
  const baselineGrid = computeBaselineGrid(resolved);

  // Create document
  const doc = createVDTDocument(resolved, baselineGrid);

  // Page dimensions in px (trim size)
  const trimWidthPx = dimensionToPx(resolved.page.width, dpi);
  const trimHeightPx = dimensionToPx(resolved.page.height, dpi);

  // Cut lines expansion: canvas grows to fit bleed + mark offset + mark length
  let trimOffset = 0;
  if (resolved.page.cutLines.enabled) {
    const bleedPx = dimensionToPx(resolved.page.cutLines.bleed, dpi);
    const markOffsetPx = dimensionToPx(resolved.page.cutLines.markOffset, dpi);
    const markLengthPx = dimensionToPx(resolved.page.cutLines.markLength, dpi);
    trimOffset = bleedPx + markOffsetPx + markLengthPx;
  }

  const pageWidthPx = trimWidthPx + trimOffset * 2;
  const pageHeightPx = trimHeightPx + trimOffset * 2;

  // Margins in px
  const marginTop = dimensionToPx(resolved.page.margins.top, dpi);
  const marginBottom = dimensionToPx(resolved.page.margins.bottom, dpi);
  const marginLeft = dimensionToPx(resolved.page.margins.left, dpi);
  const marginRight = dimensionToPx(resolved.page.margins.right, dpi);

  // Content area (offset by trimOffset so content sits inside the trim area)
  const contentArea = createBoundingBox(
    marginLeft + trimOffset,
    marginTop + trimOffset,
    trimWidthPx - marginLeft - marginRight,
    trimHeightPx - marginTop - marginBottom,
  );

  doc.trimOffset = trimOffset;

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx);
  doc.pages.push(firstPage);

  // Extract frontmatter, then parse the remaining markdown body
  const { metadata: frontmatterMeta, content: markdownBody, contentOffset: bodyOffset } = extractFrontmatter(content.markdown);
  doc.metadata = { ...(content.metadata ?? {}), ...frontmatterMeta };
  const contentBlocks = parseMarkdown(markdownBody);

  const headingTemplates: HeadingTemplates = {};
  for (const lvl of resolved.headings.levels) {
    if (lvl.numberingTemplate && lvl.numberingTemplate.length > 0) {
      headingTemplates[lvl.level as 1 | 2 | 3 | 4 | 5 | 6] = lvl.numberingTemplate;
    }
  }
  const headingPrefixes = computeHeadingNumbers(contentBlocks, headingTemplates);

  // Resolve styles
  const bodyStyle = resolveBodyStyle(resolved);
  const blockquoteStyle = resolveBlockquoteStyle(resolved);
  const listLevelIndentsPx = computeLevelIndentsPx(resolved, bodyStyle.fontSizePx);
  const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, resolved, bodyStyle.fontSizePx);
  const orderedLevelIndentsPx = computeOrderedLevelIndentsPx(
    resolved,
    bodyStyle.fontSizePx,
    orderedMetrics.maxWidthByDepth,
  );

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

  let blockIdCounter = 0;
  let pendingSpacing = 0;

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    const rawBlock = contentBlocks[blockIdx]!;
    const id = `block-${blockIdCounter++}`;

    let style: BlockStyle;
    let vdtType: VDTBlock['type'];
    let headingLevel: number | undefined;
    let numberPrefix: string | undefined;
    let contentBlock = rawBlock;
    let listBullet: ListBulletStyle | undefined;
    let listDepth: number | undefined;
    let listKind: ListKind | undefined;
    let bulletXOffsetInColumn = 0;
    let strikethroughText = false;

    switch (rawBlock.type) {
      case 'heading': {
        style = resolveHeadingStyle(rawBlock.level ?? 1, resolved);
        vdtType = 'heading';
        headingLevel = rawBlock.level;
        numberPrefix = headingPrefixes[blockIdx];
        if (numberPrefix) {
          const sep = `${numberPrefix} `;
          const firstSpan = rawBlock.spans[0];
          const newSpans = firstSpan
            ? [{ text: sep + firstSpan.text, bold: firstSpan.bold, italic: firstSpan.italic }, ...rawBlock.spans.slice(1)]
            : [{ text: sep, bold: false, italic: false }];
          contentBlock = { ...rawBlock, text: sep + rawBlock.text, spans: newSpans };
        }
        break;
      }
      case 'blockquote':
        style = blockquoteStyle;
        vdtType = 'blockquote';
        break;
      case 'listItem': {
        const depth = rawBlock.depth ?? 1;
        const kind: ListKind = rawBlock.listKind ?? 'unordered';
        let resolvedList: ListItemResolved;
        if (kind === 'ordered') {
          const metric =
            orderedMetrics.perBlock.get(blockIdx) ??
            { numberText: '', numberWidthPx: 0, maxNumberWidthPx: 0 };
          resolvedList = resolveOrderedListItemStyle(depth, resolved, orderedLevelIndentsPx, metric);
        } else {
          resolvedList = resolveUnorderedListItemStyle(
            depth,
            resolved,
            listLevelIndentsPx,
            rawBlock.checked ?? false,
            kind === 'task',
          );
        }
        style = resolvedList.text;
        listBullet = resolvedList.bullet;
        listDepth = depth;
        listKind = kind;
        bulletXOffsetInColumn = resolvedList.bulletXOffsetInColumn;
        strikethroughText = resolvedList.strikethroughText;
        vdtType = 'listItem';
        break;
      }
      default:
        style = bodyStyle;
        vdtType = 'paragraph';
        break;
    }

    // Measure text — use rich measurement for blocks with bold spans
    const col = currentColumn(doc, cursor);
    const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic);

    // List items reserve horizontal space for indent + bullet + gap.
    let measureMaxWidth = col.bbox.width;
    let lineXShift = 0;
    let measureFirstLineIndent = style.firstLineIndentPx;
    let measureHangingIndent = style.hangingIndent;
    if (listBullet) {
      const textGap = listBullet.bulletWidthPx + listBullet.gapPx;
      if (listBullet.hangingIndent) {
        measureMaxWidth = Math.max(1, col.bbox.width - listBullet.indentPx - textGap);
        lineXShift = listBullet.indentPx + textGap;
        measureFirstLineIndent = 0;
        measureHangingIndent = false;
      } else {
        measureMaxWidth = Math.max(1, col.bbox.width - listBullet.indentPx);
        lineXShift = listBullet.indentPx;
        measureFirstLineIndent = textGap;
        measureHangingIndent = false;
      }
    }
    const measureOptions = {
      textAlign: style.textAlign,
      hyphenate: style.hyphenate,
      firstLineIndentPx: measureFirstLineIndent,
      hangingIndent: measureHangingIndent,
    };
    const measured = hasRichSpans && style.boldFontString && style.italicFontString && style.boldItalicFontString
      ? measureRichBlock(
          contentBlock.spans,
          style.fontString,
          style.boldFontString,
          style.italicFontString,
          style.boldItalicFontString,
          measureMaxWidth,
          style.lineHeightPx,
          measureOptions,
        )
      : measureBlock(
          contentBlock.text,
          style.fontString,
          measureMaxWidth,
          style.lineHeightPx,
          measureOptions,
        );

    if (measured.lines.length === 0) continue;

    if (lineXShift > 0) {
      for (const line of measured.lines) {
        line.bbox.x += lineXShift;
      }
    }

    // Per-line source-range mapping using the block's plain→source map.
    // Accounts for heading numbering prefix which prepends chars with no source.
    const blockSrcStart = rawBlock.sourceStart + bodyOffset;
    const blockSrcEnd = rawBlock.sourceEnd + bodyOffset;
    const srcMap = rawBlock.sourceMap;
    const prefixLen = contentBlock.text.length - rawBlock.text.length;
    const plainToSrc = (p: number): number => {
      const idx = p - prefixLen;
      if (idx <= 0) return blockSrcStart;
      if (idx >= srcMap.length) return blockSrcEnd;
      return srcMap[idx]! + bodyOffset;
    };
    let cumPlain = 0;
    const lastLineIdx = measured.lines.length - 1;
    for (let li = 0; li < measured.lines.length; li++) {
      const line = measured.lines[li]!;
      // If segments are present, prefer their aggregate text length for a more
      // accurate plain-char count (excludes trailing hyphen for hyphenated lines).
      let lineLen: number;
      if (line.segments && line.segments.length > 0) {
        lineLen = line.segments.reduce((s, seg) => s + seg.text.length, 0);
        if (line.hyphenated) {
          const last = line.segments[line.segments.length - 1]!;
          if (last.text.endsWith('-')) lineLen -= 1;
        }
      } else {
        lineLen = line.text.length - (line.hyphenated ? 1 : 0);
      }
      line.plainStart = cumPlain;
      line.plainEnd = cumPlain + lineLen;
      // Advance past the separator space that was consumed to break the line
      // (skip when hyphenated — break was at a soft hyphen — or on the last line).
      const skipSeparator = !line.hyphenated && li !== lastLineIdx ? 1 : 0;
      cumPlain = line.plainEnd + skipSeparator;
      line.sourceStart = plainToSrc(line.plainStart);
      line.sourceEnd = plainToSrc(line.plainEnd);
    }

    const absoluteSourceMap = srcMap.map((o) => o + bodyOffset);

    const finalizeListItem = (blk: VDTBlock) => {
      if (!listBullet) return;
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      blk.bulletText = listBullet.bulletText;
      blk.bulletFontString = listBullet.bulletFontString;
      blk.bulletColor = listBullet.bulletColor;
      // `bulletXOffsetInColumn` is `indentPx` for unordered/task, and
      // `indentPx + (maxNumberWidth - thisNumberWidth)` for ordered — giving
      // the right-aligned separator.
      blk.bulletOffsetX = blk.bbox.x + bulletXOffsetInColumn;
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size.
      const firstLine = blk.lines[0];
      if (firstLine) {
        blk.bulletY = firstLine.baseline - listBullet.textFontSizePx * 0.3 + listBullet.verticalOffsetPx;
      }
    };

    const nextIsListItem = blockIdx + 1 < contentBlocks.length && contentBlocks[blockIdx + 1]!.type === 'listItem';

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen.
    const nextBlock = blockIdx + 1 < contentBlocks.length ? contentBlocks[blockIdx + 1] : null;
    const nextIsHeading = nextBlock?.type === 'heading';
    const shouldSnapToGrid =
      (vdtType === 'heading' && !nextIsHeading) ||
      (vdtType === 'listItem' && !nextIsListItem);

    // Place block, splitting across columns/pages if needed
    const canSplit = vdtType === 'paragraph' || vdtType === 'blockquote';
    let remainingLines = [...measured.lines];
    let partIndex = 0;

    while (remainingLines.length > 0) {
      const curCol = currentColumn(doc, cursor);
      const isFirstInColumn = curCol.blocks.length === 0;

      // Compute spacing before this block — margin collapsing between
      // consecutive headings: only the larger of marginBottom / marginTop applies
      let spacingBefore = 0;
      if (!isFirstInColumn) {
        spacingBefore = pendingSpacing;
        if (vdtType === 'heading') {
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
        } else if (vdtType === 'listItem') {
          const prevWasList = blockIdx > 0 && contentBlocks[blockIdx - 1]!.type === 'listItem';
          if (!prevWasList) {
            spacingBefore = Math.max(spacingBefore, style.marginTopPx);
          }
        }
      }

      const effectiveAvailable = curCol.availableHeight - spacingBefore;
      const linesPerAvailable = Math.floor(effectiveAvailable / style.lineHeightPx);
      const totalRemainHeight = remainingLines.length * style.lineHeightPx;

      // Block fits in current column
      if (totalRemainHeight <= effectiveAvailable) {
        // Consume spacing
        if (spacingBefore > 0) {
          curCol.availableHeight -= spacingBefore;
        }

        const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        if (style.boldFontString) blk.boldFontString = style.boldFontString;
        if (style.italicFontString) blk.italicFontString = style.italicFontString;
        if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
        blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
        blk.dirty = false;
        blk.snappedToGrid = shouldSnapToGrid && partIndex === 0;
        if (remainingLines.length > 0) {
          blk.sourceStart = remainingLines[0]!.sourceStart;
          blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd;
        }
        blk.sourceMap = absoluteSourceMap;
        blk.plainPrefixLen = prefixLen;

        let h = totalRemainHeight;
        if (shouldSnapToGrid && partIndex === 0) {
          // Snap using the absolute position in the column so that the block
          // bottom lands on a baseline grid line. This accounts for off-grid
          // starts (e.g. after consecutive unsnapped headings) and bakes in
          // the minimum marginBottom — the grid always wins, but the margin
          // below is guaranteed to be at least marginBottomPx.
          const usedHeight = curCol.bbox.height - curCol.availableHeight;
          const naturalBottom = usedHeight + totalRemainHeight + style.marginBottomPx;
          const snappedBottom = Math.ceil(naturalBottom / baselineGrid) * baselineGrid;
          h = snappedBottom - usedHeight;
        }
        placeBlockInColumn(blk, h, curCol, cursor);
        finalizeListItem(blk);
        doc.blocks.push(blk);
        // For snapped headings/list-tails the margin is baked into the snap;
        // for unsnapped ones (consecutive) track it for collapsing
        if (vdtType === 'listItem' && nextIsListItem) {
          pendingSpacing = listBullet!.itemSpacingPx;
        } else {
          pendingSpacing = (shouldSnapToGrid && partIndex === 0) ? 0 : style.marginBottomPx;
        }
        break;
      }

      // Block doesn't fit — try to split
      if (canSplit && linesPerAvailable >= 2) {
        // Consume spacing
        if (spacingBefore > 0) {
          curCol.availableHeight -= spacingBefore;
        }

        const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
        const splitLines = remainingLines.slice(0, linesPerAvailable);

        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        if (style.boldFontString) blk.boldFontString = style.boldFontString;
        if (style.italicFontString) blk.italicFontString = style.italicFontString;
        if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
        blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
        blk.dirty = false;
        blk.snappedToGrid = false;
        if (splitLines.length > 0) {
          blk.sourceStart = splitLines[0]!.sourceStart;
          blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
        }
        blk.sourceMap = absoluteSourceMap;
        blk.plainPrefixLen = prefixLen;

        const splitHeight = linesPerAvailable * style.lineHeightPx;
        placeBlockInColumn(blk, splitHeight, curCol, cursor);
        doc.blocks.push(blk);

        remainingLines = remainingLines.slice(linesPerAvailable);
        partIndex++;
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        continue;
      }

      // Cannot split — advance to next column if current has content
      if (curCol.blocks.length > 0) {
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        continue;
      }

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      if (style.boldFontString) blk.boldFontString = style.boldFontString;
      if (style.italicFontString) blk.italicFontString = style.italicFontString;
      if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
      if (partIndex === 0) blk.headingLevel = headingLevel;
      blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
      blk.dirty = false;
      blk.snappedToGrid = false;
      if (remainingLines.length > 0) {
        blk.sourceStart = remainingLines[0]!.sourceStart;
        blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd;
      }
      blk.sourceMap = absoluteSourceMap;
      blk.plainPrefixLen = prefixLen;

      placeBlockInColumn(blk, totalRemainHeight, curCol, cursor);
      finalizeListItem(blk);
      doc.blocks.push(blk);
      if (vdtType === 'listItem') {
        pendingSpacing = nextIsListItem ? listBullet!.itemSpacingPx : style.marginBottomPx;
      } else {
        pendingSpacing = style.marginBottomPx;
      }
      break;
    }
  }

  doc.converged = true;
  doc.iterationCount = 1;

  return doc;
}
