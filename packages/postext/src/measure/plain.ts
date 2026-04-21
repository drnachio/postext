import {
  prepareWithSegments,
  layoutNextLine,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import { hyphenateText } from '../hyphenate';
import {
  pretextSegmentsToItems,
  computeBreakpoints,
  reconstructPretextLines,
} from '../knuthPlass';
import { SOFT_HYPHEN } from './types';
import type { MeasuredBlock, MeasureBlockOptions } from './types';
import { cleanSoftHyphens, normalSpaceWidthFor } from './canvas';

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

export function computeJustifiedSpaceRatio(
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
    const runtPenalty = options.runtPenalty ?? 0;
    const runtMinWidth = runtPenalty > 0
      ? (options.runtMinCharacters ?? 0) * normalSpaceWidth
      : 0;
    const breaks = computeBreakpoints(items, {
      lineWidth: lineWidthFn,
      normalSpaceWidth,
      maxStretchRatio,
      minShrinkRatio,
      runtPenalty,
      runtMinWidth,
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
