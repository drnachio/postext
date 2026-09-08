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
  /** The break points are bare (a URL / DOI broken after a slash or before
   *  a dot): the line ends without a hyphen and nothing is appended. */
  bareBreaks?: boolean;
  /** When present, this token is an atomic math formula. `text` is a single
   *  `\uFFFC` placeholder and `width` is the math render's widthPx. */
  mathRender?: MathRender;
  /** When present, this token is an inline `:ref{\u2026}` to a resource. `text`
   *  already carries the resolved label; the token is atomic (never wraps
   *  apart) and the id flows onto the segment so renderers can colour/link it. */
  refResourceId?: string;
  /** True when this token belongs to a caption's numbered label. Flows to the
   *  segment so renderers can apply the label colour. */
  captionLabel?: boolean;
}

function pickSpanFont(
  bold: boolean,
  italic: boolean,
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  if (bold && italic) return boldItalicFont;
  if (bold) return boldFont;
  if (italic) return italicFont;
  return normalFont;
}

/**
 * Tokenize inline spans into word/space tokens with bold/italic flags and measured widths.
 */
/** A word that is a URL or a bare DOI: never hyphenated by the dictionary,
 *  but breakable at its own joints so a long link cannot force an
 *  unfillable line. */
const URL_LIKE_RE = /^(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S+$/i;

/** Break opportunities inside a URL, following the usual editorial rule:
 *  after a slash (never inside the `//` of the scheme) or before a dot,
 *  hyphen or query/fragment punctuation, so the punctuation opens the next
 *  line and no hyphen is added. Never within the first few characters. */
export function urlBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 4; i < text.length - 1; i++) {
    const prev = text[i - 1]!;
    const ch = text[i]!;
    if (prev === '/' && ch !== '/' && text[i - 2] !== '/') out.push(i);
    else if ('.?#&=_~%-'.includes(ch) && prev !== '/' && !'.?#&=_~%-'.includes(prev)) out.push(i);
  }
  return out;
}

function tokenizeSpans(
  spans: InlineSpan[],
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  shouldHyphenate: boolean,
  letterSpacingPx = 0,
): RichToken[] {
  const tokens: RichToken[] = [];
  // Tracking: every character (spaces included) advances `letterSpacingPx`
  // more, exactly as canvas `letterSpacing` / CSS `letter-spacing` / PDF `Tc`
  // paint it, so measured widths stay in step with the renderers.
  const track = (text: string): number => letterSpacingPx * text.length;

  for (const span of spans) {
    // Inline `:ref` spans are atomic: the resolved label (already in `text`)
    // is one non-breaking box so it never wraps apart. Kind 'text' keeps the
    // generic layout/renderers treating it like a word; `refResourceId` flows
    // onto the segment for link colouring / PDF link annotations.
    if (span.ref) {
      const refFont = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
      tokens.push({
        text: span.text,
        bold: span.bold,
        italic: span.italic,
        captionLabel: span.captionLabel,
        kind: 'text',
        width: measureTextWidth(span.text, refFont) + track(span.text),
        refResourceId: span.ref.resourceId,
      });
      continue;
    }
    // Math spans are atomic: a single non-breaking box with the render's
    // widthPx. Kind 'text' is correct (not 'space') so trimming trailing
    // spaces from a line doesn't drop the formula.
    if (span.math && span.mathRender) {
      tokens.push({
        text: span.text,
        bold: span.bold,
        italic: span.italic,
        captionLabel: span.captionLabel,
        kind: 'text',
        width: span.mathRender.widthPx,
        mathRender: span.mathRender,
      });
      continue;
    }
    const text = shouldHyphenate ? hyphenateText(span.text) : span.text;
    const font = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);

    // Split on word boundaries while preserving spaces
    const parts = text.match(/\S+|\s+/g);
    if (!parts) continue;

    for (const part of parts) {
      const isSpace = part.trim().length === 0;
      if (!isSpace && URL_LIKE_RE.test(part.replace(/\u00AD/g, ''))) {
        const clean = part.replace(/\u00AD/g, '');
        const breakPoints: RichBreakPoint[] = urlBreakIndices(clean).map((charIndex) => ({
          charIndex,
          widthBefore: measureTextWidth(clean.slice(0, charIndex), font) + letterSpacingPx * charIndex,
        }));
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          kind: 'text',
          width: measureTextWidth(clean, font) + track(clean),
          ...(breakPoints.length > 0 ? { breakPoints, hyphenWidth: 0, bareBreaks: true } : {}),
        });
        continue;
      }
      if (!isSpace && part.includes(SOFT_HYPHEN)) {
        const clean = part.replace(/\u00AD/g, '');
        const cleanWidth = measureTextWidth(clean, font) + track(clean);
        const breakPoints: RichBreakPoint[] = [];
        let priorSoft = 0;
        for (let i = 0; i < part.length; i++) {
          if (part[i] === SOFT_HYPHEN) {
            const cleanIdx = i - priorSoft;
            breakPoints.push({
              charIndex: cleanIdx,
              widthBefore: measureTextWidth(clean.slice(0, cleanIdx), font) + letterSpacingPx * cleanIdx,
            });
            priorSoft++;
          }
        }
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          kind: 'text',
          width: cleanWidth,
          breakPoints,
          hyphenWidth: measureTextWidth('-', font) + letterSpacingPx,
        });
      } else {
        tokens.push({
          text: part,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          kind: isSpace ? 'space' : 'text',
          width: measureTextWidth(part, font) + track(part),
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
  const letterSpacingPx = options?.letterSpacingPx ?? 0;
  const tokens = tokenizeSpans(spans, normalFont, boldFont, italicFont, boldItalicFont, shouldHyphenate, letterSpacingPx);
  const normalSpaceWidth = textAlign === 'justify' ? normalSpaceWidthFor(normalFont) + letterSpacingPx : 0;

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
      looseness: options.looseness ?? 0,
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
        const hyphenW = token.bareBreaks ? 0 : (token.hyphenWidth ?? 0);
        const mark = token.bareBreaks ? '' : '-';
        let chosen: RichBreakPoint | null = null;
        for (const bp of token.breakPoints) {
          if (bp.widthBefore + hyphenW <= remaining) chosen = bp;
          else break;
        }
        if (chosen) {
          lineTokens.push({
            text: token.text.slice(0, chosen.charIndex) + mark,
            bold: token.bold,
            italic: token.italic,
            captionLabel: token.captionLabel,
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
            captionLabel: token.captionLabel,
            kind: 'text',
            width: token.width - chosenWidth,
            ...(residualBreakPoints.length > 0
              ? { breakPoints: residualBreakPoints, hyphenWidth: token.hyphenWidth }
              : {}),
            ...(token.bareBreaks ? { bareBreaks: true } : {}),
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
      ...(t.refResourceId !== undefined ? { refResourceId: t.refResourceId } : {}),
      ...(t.captionLabel ? { captionLabel: true } : {}),
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
