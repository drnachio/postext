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
  const textAlign = options?.textAlign ?? 'left';
  const processedText = shouldHyphenate ? hyphenateText(text) : text;

  const prepared = prepareWithSegments(processedText, font);
  const lines: VDTLine[] = [];
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
  let y = 0;

  while (true) {
    const line = layoutNextLine(prepared, cursor, maxWidthPx);
    if (line === null) break;

    const nextCursor = line.end;
    const isLastLine = layoutNextLine(prepared, nextCursor, maxWidthPx) === null;

    if (textAlign === 'justify') {
      const { segments, hyphenated } = extractSegments(prepared, cursor, nextCursor);

      // If hyphenated, add the visible hyphen to the last text segment
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

      lines.push({
        text: hyphenated ? cleanSoftHyphens(line.text) + '-' : cleanSoftHyphens(line.text),
        bbox: createBoundingBox(0, y, line.width, lineHeightPx),
        baseline: y + lineHeightPx * 0.8,
        hyphenated,
        segments,
        isLastLine,
      });
    } else {
      lines.push({
        text: cleanSoftHyphens(line.text),
        bbox: createBoundingBox(0, y, line.width, lineHeightPx),
        baseline: y + lineHeightPx * 0.8,
        hyphenated: false,
      });
    }

    cursor = nextCursor;
    y += lineHeightPx;
  }

  return { lines, totalHeight: y };
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

interface RichToken {
  text: string;
  bold: boolean;
  kind: 'text' | 'space';
  width: number;
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

/**
 * Tokenize inline spans into word/space tokens with bold flag and measured widths.
 */
function tokenizeSpans(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  shouldHyphenate: boolean,
): RichToken[] {
  const tokens: RichToken[] = [];

  for (const span of spans) {
    const text = shouldHyphenate && !span.bold ? hyphenateText(span.text) : span.text;
    const font = span.bold ? boldFont : normalFont;

    // Split on word boundaries while preserving spaces
    const parts = text.match(/\S+|\s+/g);
    if (!parts) continue;

    for (const part of parts) {
      const isSpace = part.trim().length === 0;
      tokens.push({
        text: part,
        bold: span.bold,
        kind: isSpace ? 'space' : 'text',
        width: measureTextWidth(part, font),
      });
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
  maxWidthPx: number,
  lineHeightPx: number,
  options?: MeasureBlockOptions,
): MeasuredBlock {
  const plainText = spans.map((s) => s.text).join('');
  if (plainText.trim() === '') {
    return { lines: [], totalHeight: 0 };
  }

  const shouldHyphenate = options?.hyphenate ?? false;
  const tokens = tokenizeSpans(spans, normalFont, boldFont, shouldHyphenate);

  if (tokens.length === 0) {
    return { lines: [], totalHeight: 0 };
  }

  const lines: VDTLine[] = [];
  let y = 0;
  let tokenIdx = 0;

  while (tokenIdx < tokens.length) {
    const lineTokens: RichToken[] = [];
    let lineWidth = 0;

    // Consume leading spaces at line start (skip them)
    while (tokenIdx < tokens.length && tokens[tokenIdx]!.kind === 'space') {
      tokenIdx++;
    }

    // Greedy: add tokens until we overflow
    while (tokenIdx < tokens.length) {
      const token = tokens[tokenIdx]!;

      if (lineWidth + token.width <= maxWidthPx || lineTokens.length === 0) {
        lineTokens.push(token);
        lineWidth += token.width;
        tokenIdx++;
      } else {
        // Doesn't fit — break here (before this token)
        break;
      }
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
    }));

    const lineText = lineTokens.map((t) => cleanSoftHyphens(t.text)).join('');
    const contentWidth = lineTokens.reduce((sum, t) => sum + t.width, 0);

    lines.push({
      text: lineText,
      bbox: createBoundingBox(0, y, contentWidth, lineHeightPx),
      baseline: y + lineHeightPx * 0.8,
      hyphenated: false,
      segments,
      isLastLine,
    });

    y += lineHeightPx;
  }

  return { lines, totalHeight: y };
}
