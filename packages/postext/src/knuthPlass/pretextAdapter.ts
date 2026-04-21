/**
 * Adapter between @chenglou/pretext `PreparedTextWithSegments` and the
 * Knuth-Plass item stream, plus reconstruction of VDT lines from the
 * optimal breakpoint sequence.
 */

import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import type { KPItem } from './types';
import { HYPHEN_PENALTY, KP_INFINITY, MAX_STRETCH, SOFT_HYPHEN } from './constants';
import { cleanSoftHyphens } from './utils';

export function pretextSegmentsToItems(
  prepared: PreparedTextWithSegments,
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
): KPItem[] {
  const items: KPItem[] = [];
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const kinds = (prepared as unknown as { kinds: string[] }).kinds;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let i = 0; i < segments.length; i++) {
    const kind = kinds[i]!;
    const w = widths[i]!;

    switch (kind) {
      case 'text':
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
      case 'space':
      case 'glue':
        items.push({
          type: 'glue',
          width: w,
          stretch: stretchPerSpace,
          shrink: shrinkPerSpace,
          sourceIndex: i,
        });
        break;
      case 'soft-hyphen':
        items.push({
          type: 'penalty',
          width: discretionaryHyphenWidth,
          penalty: HYPHEN_PENALTY,
          flagged: true,
          sourceIndex: i,
        });
        break;
      case 'hard-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: -KP_INFINITY,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'zero-width-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: 0,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'preserved-space':
      case 'tab':
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
      default:
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
    }
  }

  // Final-line glue (infinite stretch) + forced break
  items.push({
    type: 'glue',
    width: 0,
    stretch: MAX_STRETCH,
    shrink: 0,
    sourceIndex: -1,
  });
  items.push({
    type: 'penalty',
    width: 0,
    penalty: -KP_INFINITY,
    flagged: false,
    sourceIndex: -1,
  });

  return items;
}

export function reconstructPretextLines(
  items: KPItem[],
  breaks: number[],
  prepared: PreparedTextWithSegments,
  lineHeightPx: number,
  lineWidthFn: (lineIndex: number) => number,
  lineIndentFn: (lineIndex: number) => number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
): VDTLine[] {
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const lines: VDTLine[] = [];
  let lineStart = 0; // item index where current line content starts

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);

    // Determine if this break is at a penalty (hyphenation)
    const breakItem = items[breakAt]!;
    const hyphenated = breakItem.type === 'penalty' && breakItem.flagged;

    // Collect segments for this line: items from lineStart to breakAt
    // For glue breaks: line content is items lineStart..breakAt-1 (exclude the breaking glue)
    // For penalty breaks: line content is items lineStart..breakAt-1 (exclude the penalty itself)
    const contentEnd = breakItem.type === 'glue' ? breakAt : breakAt;

    const lineSegments: VDTLineSegment[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < contentEnd; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue; // skip synthetic items

      if (it.type === 'box') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        if (seg === SOFT_HYPHEN) continue;
        const cleanText = cleanSoftHyphens(seg);
        lineSegments.push({ kind: 'text', text: cleanText, width: w });
        textParts.push(cleanText);
      } else if (it.type === 'glue') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        lineSegments.push({ kind: 'space', text: seg, width: w });
        textParts.push(seg);
      }
      // Penalties within the line are skipped (they're just potential break points)
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // If hyphenated, append '-' to the last text segment
    if (hyphenated && lineSegments.length > 0) {
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text') {
        lineSegments[lastIdx] = {
          kind: 'text',
          text: last.text + '-',
          width: last.width + discretionaryHyphenWidth,
        };
        textParts[textParts.length - 1] = last.text + '-';
      }
    }

    const lineText = textParts.join('');
    const contentWidth = lineSegments.reduce((s, seg) => s + seg.width, 0);

    // Compute justifiedSpaceRatio
    let justifiedSpaceRatio: number | undefined;
    if (textAlign === 'justify' && !isLastLine && normalSpaceWidth > 0) {
      let wordWidth = 0;
      let spaceCount = 0;
      for (const seg of lineSegments) {
        if (seg.kind === 'space') spaceCount++;
        else wordWidth += seg.width;
      }
      if (spaceCount > 0) {
        const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
        justifiedSpaceRatio = justifiedSpaceWidth / normalSpaceWidth;
      }
    }

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, li * lineHeightPx, contentWidth, lineHeightPx),
      baseline: li * lineHeightPx + lineHeightPx * 0.8,
      hyphenated,
      segments: lineSegments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    // Next line starts after the break
    lineStart = breakAt + 1;
  }

  return lines;
}
