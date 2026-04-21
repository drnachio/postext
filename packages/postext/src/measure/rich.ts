import type { VDTLine, VDTLineSegment } from '../vdt';
import { createBoundingBox } from '../vdt';
import type { MathRender } from '../math/types';
import type { InlineSpan } from '../parse';
import { hyphenateText } from '../hyphenate';
import {
  richTokensToItems,
  computeBreakpoints,
  reconstructRichLines,
} from '../knuthPlass';
import { SOFT_HYPHEN } from './types';
import type { MeasuredBlock, MeasureBlockOptions } from './types';
import { cleanSoftHyphens, measureTextWidth, normalSpaceWidthFor } from './canvas';
import { computeJustifiedSpaceRatio } from './plain';

export interface RichBreakPoint {
  charIndex: number;
  widthBefore: number;
}

export interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  kind: 'text' | 'space';
  width: number;
  breakPoints?: RichBreakPoint[];
  hyphenWidth?: number;
  /** When present, this token is an atomic math formula. `text` is a single
   *  `\uFFFC` placeholder and `width` is the math render's widthPx. */
  mathRender?: MathRender;
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
    // Math spans are atomic: a single non-breaking box with the render's
    // widthPx. Kind 'text' is correct (not 'space') so trimming trailing
    // spaces from a line doesn't drop the formula.
    if (span.math && span.mathRender) {
      tokens.push({
        text: span.text,
        bold: span.bold,
        italic: span.italic,
        kind: 'text',
        width: span.mathRender.widthPx,
        mathRender: span.mathRender,
      });
      continue;
    }
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
      kind: t.mathRender ? ('math' as const) : t.kind,
      text: cleanSoftHyphens(t.text),
      width: t.width,
      bold: t.bold || undefined,
      italic: t.italic || undefined,
      ...(t.mathRender ? { mathRender: t.mathRender } : {}),
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
