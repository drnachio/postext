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
  /** The line ends on the character before `charIndex` as it is — a hard
   *  hyphen the word already carries — and no hyphen is added. */
  bare?: boolean;
}

export interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Superscript / subscript token: measured and painted with `scriptFont`
   *  (the span font at the script size) and painted `baselineShift` px
   *  below the baseline (negative: above). */
  script?: 'sup' | 'sub';
  scriptFont?: string;
  baselineShift?: number;
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

/** Superscripts and subscripts are set at this fraction of the text size
 *  and shifted off the baseline by this fraction of it (up for a
 *  superscript, down for a subscript) — the compositor's defaults. */
export const SCRIPT_SIZE_RATIO = 0.583;
export const SCRIPT_SHIFT_RATIO = 0.333;
const FONT_SIZE_RE = /(\d*\.?\d+)px/;

/** The font a script token is measured and painted with (`font` at the
 *  script size) and its baseline shift in px. */
export function scriptMetrics(font: string, script: 'sup' | 'sub'): { font: string; baselineShift: number } {
  const m = FONT_SIZE_RE.exec(font);
  const size = m ? parseFloat(m[1]!) : 0;
  const scaled = m ? font.replace(FONT_SIZE_RE, `${size * SCRIPT_SIZE_RATIO}px`) : font;
  return { font: scaled, baselineShift: (script === 'sup' ? -1 : 1) * size * SCRIPT_SHIFT_RATIO };
}

/** Font a token is measured with: its span font, or the script font of a
 *  superscript / subscript. */
function tokenFont(
  t: { bold: boolean; italic: boolean; scriptFont?: string },
  normalFont: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  return t.scriptFont ?? pickSpanFont(t.bold, t.italic, normalFont, boldFont, italicFont, boldItalicFont);
}

/** The script fields a token derived from another (a split, a hyphenated
 *  head) carries on. */
function scriptOf(t: { script?: 'sup' | 'sub'; scriptFont?: string; baselineShift?: number }): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift'> {
  return t.script ? { script: t.script, scriptFont: t.scriptFont, baselineShift: t.baselineShift } : {};
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

const LETTER_RE = /\p{L}/u;

/** Break opportunities inside a word: after each soft hyphen the dictionary
 *  inserted (a hyphen is added when the line ends there) and after a hard
 *  hyphen between two letters — "enseñanza-aprendizaje" — where the line
 *  ends on the hyphen the word already carries. `part` still holds the
 *  soft hyphens, `clean` is the text as laid out. */
function wordBreakPoints(part: string, clean: string, font: string, letterSpacingPx: number): RichBreakPoint[] {
  const out: RichBreakPoint[] = [];
  const widthBefore = (idx: number): number => measureTextWidth(clean.slice(0, idx), font) + letterSpacingPx * idx;
  let priorSoft = 0;
  for (let i = 0; i < part.length; i++) {
    const ch = part[i]!;
    if (ch === SOFT_HYPHEN) {
      const idx = i - priorSoft;
      if (idx > 0 && idx < clean.length && !out.some((b) => b.charIndex === idx)) out.push({ charIndex: idx, widthBefore: widthBefore(idx) });
      priorSoft++;
    } else if (ch === '-' && i > 0 && i < part.length - 1 && LETTER_RE.test(part[i - 1]!) && LETTER_RE.test(part[i + 1]!)) {
      const idx = i - priorSoft + 1;
      out.push({ charIndex: idx, widthBefore: widthBefore(idx), bare: true });
    }
  }
  return out;
}

/**
 * A word wider than the whole line (a table cell, a narrow column): divide
 * it at the last syllable that fits — the dictionary's, a hyphen added —
 * or, when none does, at the last character that fits, so no word ever
 * runs past its measure. Null when not even one character fits.
 */
function emergencySplit(
  token: RichToken,
  font: string,
  letterSpacingPx: number,
  lineMaxWidth: number,
): { head: RichToken; tail: RichToken } | null {
  const text = token.text;
  if (text.length < 2) return null;
  const hyphenW = measureTextWidth('-', font) + letterSpacingPx;
  const widthBefore = (idx: number): number => measureTextWidth(text.slice(0, idx), font) + letterSpacingPx * idx;
  const fits = (idx: number): boolean => widthBefore(idx) + hyphenW <= lineMaxWidth;
  let at = 0;
  const syllabified = hyphenateText(text);
  let priorSoft = 0;
  for (let i = 0; i < syllabified.length; i++) {
    if (syllabified[i] !== SOFT_HYPHEN) continue;
    const idx = i - priorSoft;
    priorSoft++;
    if (idx > 0 && idx < text.length && fits(idx)) at = idx;
  }
  if (at === 0) {
    for (let idx = text.length - 1; idx >= 1; idx--) {
      if (fits(idx)) { at = idx; break; }
    }
  }
  if (at === 0) return null;
  const flags = { bold: token.bold, italic: token.italic, captionLabel: token.captionLabel, ...scriptOf(token) };
  return {
    head: { ...flags, text: text.slice(0, at) + '-', kind: 'text', width: widthBefore(at) + hyphenW },
    tail: { ...flags, text: text.slice(at), kind: 'text', width: token.width - widthBefore(at) },
  };
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
  /** The script fields of a span's tokens (font at the script size, shift). */
  const scriptFieldsOf = (span: InlineSpan): Pick<RichToken, 'script' | 'scriptFont' | 'baselineShift'> => {
    if (!span.script) return {};
    const base = pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);
    const m = scriptMetrics(base, span.script);
    return { script: span.script, scriptFont: m.font, baselineShift: m.baselineShift };
  };
  const spanFont = (span: InlineSpan): string =>
    scriptFieldsOf(span).scriptFont ?? pickSpanFont(span.bold, span.italic, normalFont, boldFont, italicFont, boldItalicFont);

  for (const span of spans) {
    // Inline `:ref` spans are atomic: the resolved label (already in `text`)
    // is one non-breaking box so it never wraps apart. Kind 'text' keeps the
    // generic layout/renderers treating it like a word; `refResourceId` flows
    // onto the segment for link colouring / PDF link annotations.
    if (span.ref) {
      const refFont = spanFont(span);
      tokens.push({
        text: span.text,
        bold: span.bold,
        italic: span.italic,
        captionLabel: span.captionLabel,
        ...scriptFieldsOf(span),
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
    const font = spanFont(span);
    const scriptFields = scriptFieldsOf(span);

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
          ...scriptFields,
          kind: 'text',
          width: measureTextWidth(clean, font) + track(clean),
          ...(breakPoints.length > 0 ? { breakPoints, hyphenWidth: 0, bareBreaks: true } : {}),
        });
        continue;
      }
      const clean = isSpace ? part : part.replace(/\u00AD/g, '');
      const breakPoints = isSpace ? [] : wordBreakPoints(part, clean, font, letterSpacingPx);
      if (breakPoints.length > 0) {
        tokens.push({
          text: clean,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
          kind: 'text',
          width: measureTextWidth(clean, font) + track(clean),
          breakPoints,
          hyphenWidth: measureTextWidth('-', font) + letterSpacingPx,
        });
      } else {
        tokens.push({
          text: part,
          bold: span.bold,
          italic: span.italic,
          captionLabel: span.captionLabel,
          ...scriptFields,
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

      // Doesn't fit. Try to split at a break point (a soft hyphen, a hard
      // hyphen inside the word, a URL joint).
      if (token.kind === 'text' && token.breakPoints && token.breakPoints.length > 0) {
        const remaining = lineMaxWidth - lineWidth;
        const markW = (bp: RichBreakPoint): number => (token.bareBreaks || bp.bare ? 0 : (token.hyphenWidth ?? 0));
        let chosen: RichBreakPoint | null = null;
        for (const bp of token.breakPoints) {
          if (bp.widthBefore + markW(bp) <= remaining) chosen = bp;
          else break;
        }
        if (chosen) {
          const hyphenW = markW(chosen);
          const mark = token.bareBreaks || chosen.bare ? '' : '-';
          lineTokens.push({
            text: token.text.slice(0, chosen.charIndex) + mark,
            bold: token.bold,
            italic: token.italic,
            captionLabel: token.captionLabel,
            ...scriptOf(token),
            kind: 'text',
            width: chosen.widthBefore + hyphenW,
          });
          lineWidth += chosen.widthBefore + hyphenW;
          lineHyphenated = true;

          const chosenIdx = chosen.charIndex;
          const chosenWidth = chosen.widthBefore;
          const residualBreakPoints = token.breakPoints
            .filter((bp) => bp.charIndex > chosenIdx)
            .map((bp) => ({ ...bp, charIndex: bp.charIndex - chosenIdx, widthBefore: bp.widthBefore - chosenWidth }));
          tokens[tokenIdx] = {
            text: token.text.slice(chosenIdx),
            bold: token.bold,
            italic: token.italic,
            captionLabel: token.captionLabel,
            ...scriptOf(token),
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

      // A word wider than the whole line: divide it rather than let it run
      // past the measure (syllable first, then character).
      if (lineTokens.length === 0 && token.kind === 'text' && !token.mathRender && token.refResourceId === undefined && token.width > lineMaxWidth) {
        const font = tokenFont(token, normalFont, boldFont, italicFont, boldItalicFont);
        const split = emergencySplit(token, font, letterSpacingPx, lineMaxWidth);
        if (split) {
          lineTokens.push(split.head);
          lineWidth += split.head.width;
          lineHyphenated = true;
          tokens[tokenIdx] = split.tail;
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
      ...(t.script ? { script: t.script, fontString: t.scriptFont, baselineShift: t.baselineShift } : {}),
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
