/**
 * Pure helpers used by `buildDocument`. Extracted here purely to keep the
 * main pipeline function readable; no behavior changes.
 */

import type { ContentBlock } from '../parse';
import { dimensionToPx } from '../units';
import {
  createBoundingBox,
  type VDTBlock,
  type BoundingBox,
  type ResolvedConfig,
} from '../vdt';
import type { BlockStyle } from './styles';
import type { MeasuredBlock } from '../measure';
import { renderMath, isMathReady } from '../math';

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

export interface PageMetrics {
  trimWidthPx: number;
  trimHeightPx: number;
  pageWidthPx: number;
  pageHeightPx: number;
  trimOffset: number;
  contentArea: BoundingBox;
}

export function computePageMetrics(resolved: ResolvedConfig): PageMetrics {
  const dpi = resolved.page.dpi;
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

  return { trimWidthPx, trimHeightPx, pageWidthPx, pageHeightPx, trimOffset, contentArea };
}

// ---------------------------------------------------------------------------
// Style attribute copy: every VDTBlock mirrors a subset of BlockStyle fields.
// ---------------------------------------------------------------------------

export function applyStyleAttrs(blk: VDTBlock, style: BlockStyle): void {
  if (style.boldFontString) blk.boldFontString = style.boldFontString;
  if (style.italicFontString) blk.italicFontString = style.italicFontString;
  if (style.boldItalicFontString) blk.boldItalicFontString = style.boldItalicFontString;
  if (style.boldColor) blk.boldColor = style.boldColor;
  if (style.italicColor) blk.italicColor = style.italicColor;
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

  const enrichedSpans = contentBlock.spans.map((s) => {
    if (!s.math) return s;
    if (!mathEnabled) {
      return { text: `$${s.math.tex}$`, bold: s.bold, italic: s.italic };
    }
    const render = isMathReady()
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
}

/** Compute measurement viewport: list items reserve horizontal space for indent + bullet + gap. */
export function computeMeasureViewport(
  columnWidth: number,
  style: BlockStyle,
  listBullet: import('./lists').ListBulletStyle | undefined,
): MeasureViewport {
  let measureMaxWidth = columnWidth;
  let lineXShift = 0;
  let measureFirstLineIndent = style.firstLineIndentPx;
  let measureHangingIndent = style.hangingIndent;

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

  return { measureMaxWidth, lineXShift, measureFirstLineIndent, measureHangingIndent };
}

// ---------------------------------------------------------------------------
// Per-line source-range mapping
// ---------------------------------------------------------------------------

/**
 * Stamps `plainStart` / `plainEnd` / `sourceStart` / `sourceEnd` on every line
 * of `measured`, accounting for any heading-number prefix that prepends chars
 * with no source.
 */
export function stampSourceRanges(
  measured: MeasuredBlock,
  rawBlock: ContentBlock,
  contentBlock: ContentBlock,
  bodyOffset: number,
): { prefixLen: number; absoluteSourceMap: number[] } {
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
  return { prefixLen, absoluteSourceMap };
}

// ---------------------------------------------------------------------------
// Column rollback helper: remove the tail of `curCol.blocks` and also drop
// them from `doc.blocks`, refunding `availableHeight`. Returns the count
// actually popped so callers can compute a `blockIdx` rewind.
// ---------------------------------------------------------------------------

export function rollbackTrailingBlocks(
  curCol: { blocks: VDTBlock[]; availableHeight: number; bbox: BoundingBox },
  docBlocks: VDTBlock[],
  predicate: (b: VDTBlock) => boolean,
): number {
  let count = 0;
  for (let j = curCol.blocks.length - 1; j >= 0; j--) {
    if (predicate(curCol.blocks[j]!)) count++;
    else break;
  }
  if (count === 0) return 0;
  const popped = curCol.blocks.splice(curCol.blocks.length - count);
  for (const p of popped) {
    const idx = docBlocks.indexOf(p);
    if (idx !== -1) docBlocks.splice(idx, 1);
    curCol.availableHeight += p.bbox.height;
  }
  return count;
}

