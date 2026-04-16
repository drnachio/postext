import {
  prepareWithSegments,
  layoutNextLine,
  clearCache,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from './vdt';
import { createBoundingBox } from './vdt';
import type { TextAlign, HyphenationLocale } from './types';
import type { InlineSpan } from './parse';
import { hyphenateText, setHyphenationLocale } from './hyphenate';
import {
  pretextSegmentsToItems,
  richTokensToItems,
  computeBreakpoints,
  reconstructPretextLines,
  reconstructRichLines,
} from './knuthPlass';

const SOFT_HYPHEN = '\u00AD';

// ---------------------------------------------------------------------------
// Font string builder
// ---------------------------------------------------------------------------

/**
 * Build a CSS font shorthand string for canvas / pretext.
 * Example: "75px EB Garamond"
 */
export function buildFontString(
  fontFamily: string,
  fontSizePx: number,
  weight: string = 'normal',
  style: string = 'normal',
): string {
  const parts: string[] = [];
  if (style !== 'normal') parts.push(style);
  if (weight !== 'normal') parts.push(weight);
  parts.push(`${fontSizePx}px`);
  parts.push(fontFamily);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Line segment extraction
// ---------------------------------------------------------------------------

function extractSegments(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,
  end: LayoutCursor,
): { segments: VDTLineSegment[]; hyphenated: boolean } {
  const result: VDTLineSegment[] = [];
  let hyphenated = false;

  for (let i = start.segmentIndex; i < end.segmentIndex; i++) {
    const seg = prepared.segments[i]!;
    const w = prepared.widths[i]!;

    if (seg === SOFT_HYPHEN) {
      // If this is the last segment before the break, mark as hyphenated
      if (i === end.segmentIndex - 1) hyphenated = true;
      continue;
    }

    if (seg.trim().length === 0) {
      result.push({ kind: 'space', text: seg, width: w });
    } else {
      result.push({ kind: 'text', text: seg, width: w });
    }
  }

  // Check if the break point is at a soft hyphen
  if (!hyphenated && end.segmentIndex < prepared.segments.length) {
    if (prepared.segments[end.segmentIndex] === SOFT_HYPHEN) {
      hyphenated = true;
    }
  }

  // Trim trailing spaces
  while (result.length > 0 && result[result.length - 1]!.kind === 'space') {
    result.pop();
  }

  return { segments: result, hyphenated };
}

// ---------------------------------------------------------------------------
// Hyphenation initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the hyphenator for a given locale.
 * Must be called before measureBlock is used with hyphenation.
 */
export function initHyphenator(locale: HyphenationLocale): void {
  setHyphenationLocale(locale);
}

/**
 * Clear pretext's internal measurement caches.
 * Call this after fonts finish loading to ensure accurate measurements.
 */
export function clearMeasurementCache(): void {
  clearCache();
}

// ---------------------------------------------------------------------------
// Measured block
// ---------------------------------------------------------------------------

export interface MeasuredBlock {
  lines: VDTLine[];
  totalHeight: number;
}

export interface MeasureBlockOptions {
  textAlign?: TextAlign;
  hyphenate?: boolean;
  firstLineIndentPx?: number;
  hangingIndent?: boolean;
  /** Use Knuth-Plass optimal line breaking instead of greedy. */
  optimal?: boolean;
  /** Max space stretch ratio (for K-P glue model). Default 1.5. */
  maxStretchRatio?: number;
  /** Min space shrink ratio (for K-P glue model). Default 0.8. */
  minShrinkRatio?: number;
}

/** Compute the normal space width for a given font, used to express justified
 *  spacing as a multiplier of the natural space. */
function normalSpaceWidthFor(font: string): number {
  return measureTextWidth(' ', font);
}

/**
 * Measure a text block: break it into lines within maxWidthPx
 * and return VDTLine data with bounding boxes.
 *
 * The returned lines have bbox positions relative to the block origin (0,0).
 * The pipeline will offset them to absolute page coordinates later.
 */
export function measureBlock(
  text: string,
  font: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  if (text.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const textAlign = options?.textAlign ?? 'left';
  const processedText = shouldHyphenate ? hyphenateText(text) : text;

  const prepared = prepareWithSegments(processedText, font);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(font) : 0;

  // Knuth-Plass optimal line breaking path
  if (options?.optimal && textAlign === 'justify') {
    const maxStretchRatio = options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = options.minShrinkRatio ?? 0.8;
    const items = pretextSegmentsToItems(prepared, normalSpaceWidth, maxStretchRatio, minShrinkRatio);
    const lineWidthFn = (li: number) => {
      const isFirst = li === 0;
      const indent = indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
      return maxWidthPx - indent;
    };
    const lineIndentFn = (li: number) => {
      const isFirst = li === 0;
      return indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
    };
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth,
      maxStretchRatio,
      minShrinkRatio,
    });
    if (breaks.length > 0) {
      const kpLines = reconstructPretextLines(
        items, breaks, prepared, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
      );
      return { lines: kpLines, totalHeight: kpLines.length * lineHeightPx };
    }
    // Fallback to greedy if K-P produced no breaks
  }

  const lines: VDTLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;
  let lineIndex = 0;

  while (true) {
    // First line indent: indent line 0 only. Hanging indent: indent all lines except 0.
    const isFirstLine = lineIndex === 0;
    const lineIndent = indentPx > 0
      ? (hanging ? (isFirstLine ? 0 : indentPx) : (isFirstLine ? indentPx : 0))
      : 0;
    const lineMaxWidth = maxWidthPx - lineIndent;

    const line = layoutNextLine(prepared, cursor, lineMaxWidth);
    if (line === null) break;

    const nextCursor = line.end;
    const isLastLine = layoutNextLine(prepared, nextCursor, lineMaxWidth) === null;

    const { segments, hyphenated } = extractSegments(prepared, cursor, nextCursor);

    if (hyphenated) {
      const lastTextIdx = findLastTextSegmentIndex(segments);
      if (lastTextIdx >= 0) {
        const lastSeg = segments[lastTextIdx]!;
        segments[lastTextIdx] = {
          kind: 'text',
          text: lastSeg.text + '-',
          width: lastSeg.width + getHyphenWidth(prepared),
        };
      }
    }

    const justifiedSpaceRatio = computeJustifiedSpaceRatio(
      segments,
      lineMaxWidth,
      normalSpaceWidth,
      textAlign,
      isLastLine,
    );

    lines.push({
      text: hyphenated ? cleanSoftHyphens(line.text) + '-' : cleanSoftHyphens(line.text),
      bbox: createBoundingBox(lineIndent, y, line.width, lineHeightPx),
      baseline: y + lineHeightPx * 0.8,
      hyphenated,
      segments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    cursor = nextCursor;
    y += lineHeightPx;
    lineIndex++;
  }

  return { lines, totalHeight: y };
}

function computeJustifiedSpaceRatio(
  segments: VDTLineSegment[],
  lineMaxWidth: number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
  isLastLine: boolean,
): number | undefined {
  if (textAlign !== 'justify' || isLastLine || normalSpaceWidth <= 0) return undefined;
  let wordWidth = 0;
  let spaceCount = 0;
  for (const s of segments) {
    if (s.kind === 'space') spaceCount++;
    else wordWidth += s.width;
  }
  if (spaceCount === 0) return undefined;
  const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
  return justifiedSpaceWidth / normalSpaceWidth;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findLastTextSegmentIndex(segments: VDTLineSegment[]): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i]!.kind === 'text') return i;
  }
  return -1;
}

function getHyphenWidth(prepared: PreparedTextWithSegments): number {
  // Use discretionaryHyphenWidth from pretext internals
  const core = prepared as unknown as { discretionaryHyphenWidth?: number };
  if (core.discretionaryHyphenWidth && core.discretionaryHyphenWidth > 0) {
    return core.discretionaryHyphenWidth;
  }
  return 5; // fallback
}

function cleanSoftHyphens(text: string): string {
  return text.replace(/\u00AD/g, '');
}

// ---------------------------------------------------------------------------
// Rich text (mixed-weight) measurement
// ---------------------------------------------------------------------------

interface RichBreakPoint {
  charIndex: number;
  widthBefore: number;
}

interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  kind: 'text' | 'space';
  width: number;
  breakPoints?: RichBreakPoint[];
  hyphenWidth?: number;
}

let _measureCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

function getMeasureCtx(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (!_measureCtx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _measureCtx = new OffscreenCanvas(1, 1).getContext('2d')!;
    } else {
      _measureCtx = document.createElement('canvas').getContext('2d')!;
    }
  }
  return _measureCtx;
}

function measureTextWidth(text: string, font: string): number {
  const ctx = getMeasureCtx();
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Measure a short glyph (e.g. a list bullet) in the given font. */
export function measureGlyphWidth(text: string, font: string): number {
  return measureTextWidth(text, font);
}

/**
 * Tokenize inline spans into word/space tokens with bold/italic flags and measured widths.
 */
function tokenizeSpans(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  shouldHyphenate: boolean,
): RichToken[] {
  const tokens: RichToken[] = [];

  for (const span of spans) {
    const text = shouldHyphenate ? hyphenateText(span.text) : span.text;
    const font = span.bold && span.italic
      ? boldItalicFont
      : span.bold
        ? boldFont
        : span.italic
          ? italicFont
          : normalFont;

    // Split on word boundaries while preserving spaces
    const parts = text.match(/\S+|\s+/g);
    if (!parts) continue;

    for (const part of parts) {
      const isSpace = part.trim().length === 0;
      if (!isSpace && part.includes(SOFT_HYPHEN)) {
        const clean = part.replace(/\u00AD/g, '');
        const cleanWidth = measureTextWidth(clean, font);
        const breakPoints: RichBreakPoint[] = [];
        let priorSoft = 0;
        for (let i = 0; i < part.length; i++) {
          if (part[i] === SOFT_HYPHEN) {
            const cleanIdx = i - priorSoft;
            breakPoints.push({
              charIndex: cleanIdx,
              widthBefore: measureTextWidth(clean.slice(0, cleanIdx), font),
            });
            priorSoft++;
          }
        }
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          kind: 'text',
          width: cleanWidth,
          breakPoints,
          hyphenWidth: measureTextWidth('-', font),
        });
      } else {
        tokens.push({
          text: part,
          bold: span.bold,
          italic: span.italic,
          kind: isSpace ? 'space' : 'text',
          width: measureTextWidth(part, font),
        });
      }
    }
  }

  return tokens;
}

/**
 * Measure a rich text block with mixed font weights.
 * Uses canvas measureText for per-token measurement and greedy line-breaking.
 */
export function measureRichBlock(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (plainText.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  const indentPx = options?.firstLineIndentPx ?? 0;
  const hanging = options?.hangingIndent ?? false;
  const textAlign = options?.textAlign ?? 'left';
  const tokens = tokenizeSpans(spans, normalFont, boldFont, italicFont, boldItalicFont, shouldHyphenate);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(normalFont) : 0;

  if (tokens.length === 0) {
    return { lines: [], totalHeight: 0 };
  }

  // Knuth-Plass optimal line breaking path
  if (options?.optimal && textAlign === 'justify') {
    const maxStretchRatio = options.maxStretchRatio ?? 1.5;
    const minShrinkRatio = options.minShrinkRatio ?? 0.8;
    const items = richTokensToItems(tokens, normalSpaceWidth, maxStretchRatio, minShrinkRatio);
    const lineWidthFn = (li: number) => {
      const isFirst = li === 0;
      const indent = indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
      return maxWidthPx - indent;
    };
    const lineIndentFn = (li: number) => {
      const isFirst = li === 0;
      return indentPx > 0
        ? (hanging ? (isFirst ? 0 : indentPx) : (isFirst ? indentPx : 0))
        : 0;
    };
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth,
      maxStretchRatio,
      minShrinkRatio,
    });
    if (breaks.length > 0) {
      const kpLines = reconstructRichLines(
        items, breaks, tokens, lineHeightPx,
        lineWidthFn, lineIndentFn, normalSpaceWidth, textAlign,
      );
      return { lines: kpLines, totalHeight: kpLines.length * lineHeightPx };
    }
    // Fallback to greedy if K-P produced no breaks
  }

  const lines: VDTLine[] = [];
  let y = 0;
  let tokenIdx = 0;
  let lineIndex = 0;

  while (tokenIdx < tokens.length) {
    const isFirstLine = lineIndex === 0;
    const lineIndent = indentPx > 0
      ? (hanging ? (isFirstLine ? 0 : indentPx) : (isFirstLine ? indentPx : 0))
      : 0;
    const lineMaxWidth = maxWidthPx - lineIndent;

    const lineTokens: RichToken[] = [];
    let lineWidth = 0;
    let lineHyphenated = false;

    // Consume leading spaces at line start (skip them)
    while (tokenIdx < tokens.length && tokens[tokenIdx]!.kind === 'space') {
      tokenIdx++;
    }

    // Greedy: add tokens until we overflow
    while (tokenIdx < tokens.length) {
      const token = tokens[tokenIdx]!;

      if (lineWidth + token.width <= lineMaxWidth) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
        continue;
      }

      // Doesn't fit. Try to split at a soft-hyphen.
      if (token.kind === 'text' && token.breakPoints && token.breakPoints.length > 0) {
        const remaining = lineMaxWidth - lineWidth;
        const hyphenW = token.hyphenWidth ?? 0;
        let chosen: RichBreakPoint | null = null;
        for (const bp of token.breakPoints) {
          if (bp.widthBefore + hyphenW <= remaining) chosen = bp;
          else break;
        }
        if (chosen) {
          lineTokens.push({
            text: token.text.slice(0, chosen.charIndex) + '-',
            bold: token.bold,
            italic: token.italic,
            kind: 'text',
            width: chosen.widthBefore + hyphenW,
          });
          lineWidth += chosen.widthBefore + hyphenW;
          lineHyphenated = true;

          const chosenIdx = chosen.charIndex;
          const chosenWidth = chosen.widthBefore;
          const residualBreakPoints = token.breakPoints
            .filter((bp) => bp.charIndex > chosenIdx)
            .map((bp) => ({ charIndex: bp.charIndex - chosenIdx, widthBefore: bp.widthBefore - chosenWidth }));
          tokens[tokenIdx] = {
            text: token.text.slice(chosenIdx),
            bold: token.bold,
            italic: token.italic,
            kind: 'text',
            width: token.width - chosenWidth,
            ...(residualBreakPoints.length > 0
              ? { breakPoints: residualBreakPoints, hyphenWidth: token.hyphenWidth }
              : {}),
          };
          break;
        }
      }

      // No viable split. If line is empty, force-fit this token; else break to next line.
      if (lineTokens.length === 0) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
      }
      break;
    }

    if (lineTokens.length === 0) break;

    // Trim trailing spaces from line tokens
    while (lineTokens.length > 0 && lineTokens[lineTokens.length - 1]!.kind === 'space') {
      lineWidth -= lineTokens[lineTokens.length - 1]!.width;
      lineTokens.pop();
    }

    // Check if this is the last line
    // Skip remaining leading spaces to check if there's more content
    let peekIdx = tokenIdx;
    while (peekIdx < tokens.length && tokens[peekIdx]!.kind === 'space') {
      peekIdx++;
    }
    const isLastLine = peekIdx >= tokens.length;

    // Build segments for justified rendering
    const segments: VDTLineSegment[] = lineTokens.map((t) => ({
      kind: t.kind,
      text: cleanSoftHyphens(t.text),
      width: t.width,
      bold: t.bold || undefined,
      italic: t.italic || undefined,
    }));

    const lineText = lineTokens.map((t) => cleanSoftHyphens(t.text)).join('');
    const contentWidth = lineTokens.reduce((sum, t) => sum + t.width, 0);

    const justifiedSpaceRatio = computeJustifiedSpaceRatio(
      segments,
      lineMaxWidth,
      normalSpaceWidth,
      textAlign,
      isLastLine,
    );

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, y, contentWidth, lineHeightPx),
      baseline: y + lineHeightPx * 0.8,
      hyphenated: lineHyphenated,
      segments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    y += lineHeightPx;
    lineIndex++;
  }

  return { lines, totalHeight: y };
}
