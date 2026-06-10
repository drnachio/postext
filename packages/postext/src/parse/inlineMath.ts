import type { InlineSpan, MathMeta, ParseIssue } from './types';
import { injectPlaceholderSpans } from './injectSpans';

/** Object Replacement Character — atomic plain-text placeholder for a math
 *  span. One code unit per formula so `sourceMap` stays 1-to-1. */
export const MATH_PLACEHOLDER = '\uFFFC';

/** Extract inline `$...$` math spans from a line's text.
 *  - Returns a cleaned text where each match is replaced by `MATH_PLACEHOLDER`.
 *  - Returns the list of math metadata aligned with the order of placeholders.
 *  - Detects unclosed `$` (odd number of unescaped `$` in the text).
 *
 *  `absOffsets[i]` is the absolute source offset of `text[i]` in the original
 *  markdown; used to emit accurate `sourceStart`/`sourceEnd` on each math
 *  span. When the caller cannot provide an exact map (e.g. text has been
 *  reassembled from multiple source lines) it can pass `null` and math
 *  offsets will default to the block's source range.
 */
export function extractInlineMath(
  text: string,
  absOffsets: number[] | null,
  fallbackStart: number,
  fallbackEnd: number,
): { cleaned: string; maths: MathMeta[]; issues: ParseIssue[] } {
  // Fast path: no `$` anywhere means no math and no escapes to unescape.
  if (text.indexOf('$') < 0) {
    return { cleaned: text, maths: [], issues: [] };
  }
  const maths: MathMeta[] = [];
  const issues: ParseIssue[] = [];
  // Cleaned output is assembled from slices of `text` (plus placeholders and
  // unescaped `$`) instead of per-character concatenation. `segStart` marks
  // the beginning of the literal run not yet flushed into `parts`.
  const parts: string[] = [];
  let segStart = 0;
  let i = 0;
  const absAt = (idx: number): number => {
    if (absOffsets && idx < absOffsets.length) return absOffsets[idx]!;
    if (absOffsets && absOffsets.length > 0) return absOffsets[absOffsets.length - 1]! + (idx - (absOffsets.length - 1));
    return fallbackStart + idx;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\' && text[i + 1] === '$') {
      // Escaped dollar sign — keep as literal `$` in output.
      parts.push(text.slice(segStart, i), '$');
      i += 2;
      segStart = i;
      continue;
    }
    if (ch !== '$') {
      i++;
      continue;
    }
    // Found a '$'. Skip display-math `$$` sequences — those are handled at
    // block level, so inside a paragraph we treat `$$` as literal (it stays
    // part of the running literal segment).
    if (text[i + 1] === '$') {
      i += 2;
      continue;
    }
    // Scan for the matching closing `$`, honouring `\$` escapes.
    let j = i + 1;
    let foundClose = -1;
    while (j < text.length) {
      if (text[j] === '\\' && text[j + 1] === '$') {
        j += 2;
        continue;
      }
      if (text[j] === '$') {
        foundClose = j;
        break;
      }
      // Bail on newline — inline math must be on a single line.
      if (text[j] === '\n') break;
      j++;
    }
    if (foundClose < 0) {
      issues.push({
        kind: 'unclosedMath',
        delimiter: '$',
        sourceStart: absAt(i),
        sourceEnd: fallbackEnd,
        tex: text.slice(i + 1),
      });
      // Keep the rest verbatim (covered by the final segment flush).
      break;
    }
    const tex = text.slice(i + 1, foundClose).replace(/\\\$/g, '$');
    maths.push({ tex, sourceStart: absAt(i), sourceEnd: absAt(foundClose) + 1 });
    parts.push(text.slice(segStart, i), MATH_PLACEHOLDER);
    i = foundClose + 1;
    segStart = i;
  }
  if (segStart < text.length) parts.push(text.slice(segStart));
  return { cleaned: parts.join(''), maths, issues };
}

/** Walk an InlineSpan list and attach MathMeta to each `\uFFFC` occurrence
 *  in order. Splits plain-text spans around the placeholder so the math
 *  span is its own entry (carrying the ambient bold/italic). */
export function injectMathSpans(spans: InlineSpan[], maths: MathMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, maths, MATH_PLACEHOLDER, (meta, bold, italic) => ({
    text: MATH_PLACEHOLDER,
    bold,
    italic,
    math: meta,
  }));
}

/** Overwrite `sourceMap[i]` entries corresponding to math placeholders with
 *  the math span's absolute sourceStart. Keeps click-to-focus accurate for
 *  formulas even though the placeholder char has no direct source match. */
export function fixMathSourceMap(text: string, spans: InlineSpan[], sourceMap: number[]): void {
  if (sourceMap.length === 0) return;
  // Walk spans in order, tracking plain-text position. Each math span
  // contributes exactly one placeholder char whose sourceMap entry we
  // overwrite with its span's sourceStart.
  let p = 0;
  for (const span of spans) {
    if (span.math && p < sourceMap.length) {
      sourceMap[p] = span.math.sourceStart;
    }
    p += span.text.length;
    if (p > text.length) break;
  }
}
