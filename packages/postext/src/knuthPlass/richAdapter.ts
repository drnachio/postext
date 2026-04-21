/**
 * Adapter between the bold/italic/math-aware "rich token" stream produced
 * by the measure pipeline and the Knuth-Plass item stream, plus
 * reconstruction of VDT lines from the optimal breakpoint sequence.
 */

import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { TextAlign } from '../types';
import type { KPItem, RichTokenMeta } from './types';
import { HYPHEN_PENALTY, KP_INFINITY, MAX_STRETCH } from './constants';
import { cleanSoftHyphens } from './utils';

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
  mathRender?: import('../math/types').MathRender;
}

export function richTokensToItems(
  tokens: RichToken[],
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
): KPItem[] {
  const items: KPItem[] = [];
  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    const meta: RichTokenMeta = {
      bold: token.bold,
      italic: token.italic,
      originalTokenIndex: t,
    };

    if (token.kind === 'space') {
      items.push({
        type: 'glue',
        width: token.width,
        stretch: stretchPerSpace,
        shrink: shrinkPerSpace,
        sourceIndex: t,
        meta: { ...meta },
      });
      continue;
    }

    // Text token — may have soft-hyphen break points
    if (token.breakPoints && token.breakPoints.length > 0) {
      const hyphenW = token.hyphenWidth ?? 0;
      let prevCharIndex = 0;
      let prevWidth = 0;

      for (let bp = 0; bp < token.breakPoints.length; bp++) {
        const breakPoint = token.breakPoints[bp]!;
        const fragmentWidth = breakPoint.widthBefore - prevWidth;

        // Box for the fragment before this break point
        items.push({
          type: 'box',
          width: fragmentWidth,
          sourceIndex: t,
          meta: { ...meta, subStart: prevCharIndex, subEnd: breakPoint.charIndex },
        });

        // Penalty at the soft hyphen
        items.push({
          type: 'penalty',
          width: hyphenW,
          penalty: HYPHEN_PENALTY,
          flagged: true,
          sourceIndex: t,
          meta: { ...meta },
        });

        prevCharIndex = breakPoint.charIndex;
        prevWidth = breakPoint.widthBefore;
      }

      // Final fragment after last break point
      items.push({
        type: 'box',
        width: token.width - prevWidth,
        sourceIndex: t,
        meta: { ...meta, subStart: prevCharIndex, subEnd: token.text.length },
      });
    } else {
      // Simple text token without break points
      items.push({
        type: 'box',
        width: token.width,
        sourceIndex: t,
        meta: { ...meta, subStart: 0, subEnd: token.text.length },
      });
    }
  }

  // Final-line glue + forced break
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

export function reconstructRichLines(
  items: KPItem[],
  breaks: number[],
  tokens: RichToken[],
  lineHeightPx: number,
  lineWidthFn: (lineIndex: number) => number,
  lineIndentFn: (lineIndex: number) => number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
): VDTLine[] {
  const lines: VDTLine[] = [];
  let lineStart = 0;

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);

    const breakItem = items[breakAt]!;
    const hyphenated = breakItem.type === 'penalty' && breakItem.flagged;

    const lineSegments: VDTLineSegment[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < breakAt; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue;
      const meta = it.meta as RichTokenMeta | undefined;

      if (it.type === 'box' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        const subText = meta.subStart !== undefined && meta.subEnd !== undefined
          ? token.text.slice(meta.subStart, meta.subEnd)
          : token.text;
        const cleanText = cleanSoftHyphens(subText);
        lineSegments.push({
          kind: token.mathRender ? 'math' : 'text',
          text: cleanText,
          width: it.width,
          bold: meta.bold || undefined,
          italic: meta.italic || undefined,
          ...(token.mathRender ? { mathRender: token.mathRender } : {}),
        });
        textParts.push(cleanText);
      } else if (it.type === 'glue' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        lineSegments.push({
          kind: 'space',
          text: token.text,
          width: it.width,
        });
        textParts.push(token.text);
      }
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // If hyphenated, append '-' to the last text segment
    if (hyphenated && lineSegments.length > 0) {
      const breakMeta = breakItem.meta as RichTokenMeta | undefined;
      const hyphenW = breakMeta
        ? (tokens[breakMeta.originalTokenIndex]?.hyphenWidth ?? 0)
        : 0;
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text') {
        lineSegments[lastIdx] = {
          ...last,
          text: last.text + '-',
          width: last.width + hyphenW,
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

    lineStart = breakAt + 1;
  }

  return lines;
}
