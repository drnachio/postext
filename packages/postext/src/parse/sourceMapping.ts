import type { InlineSpan } from './types';
import { MATH_PLACEHOLDER } from './inlineMath';

/**
 * Build a per-character map from plain text to absolute source offsets.
 * Greedy matches each plain char against the raw source (delimited by
 * [blockSrcStart, blockSrcEnd)), skipping markdown markers and treating
 * newlines/tabs as spaces for paragraph line joins.
 */
function computeSourceMap(
  markdown: string,
  blockSrcStart: number,
  blockSrcEnd: number,
  plainText: string,
): number[] {
  const map = new Array<number>(plainText.length);
  let r = blockSrcStart;
  for (let p = 0; p < plainText.length; p++) {
    const ch = plainText[p]!;
    // Math placeholder: the plain char represents `$...$` in the markdown.
    // Advance to the opening `$`, map to it, then skip past the closing `$`
    // so subsequent plain chars can keep aligning with the source.
    if (ch === MATH_PLACEHOLDER) {
      while (r < blockSrcEnd && markdown[r] !== '$') r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r + 1;
      while (j < blockSrcEnd) {
        if (markdown[j] === '\\' && markdown[j + 1] === '$') { j += 2; continue; }
        if (markdown[j] === '$') { j++; break; }
        if (markdown[j] === '\n') break;
        j++;
      }
      r = j;
      continue;
    }
    const isSpace = ch === ' ';
    while (r < blockSrcEnd) {
      const rc = markdown[r]!;
      if (rc === ch) break;
      if (isSpace && (rc === '\n' || rc === '\t')) break;
      r++;
    }
    if (r >= blockSrcEnd) {
      map[p] = blockSrcEnd;
    } else {
      map[p] = r;
      r++;
    }
  }
  return map;
}

const COLLAPSIBLE_WS_RE = /[ \t\n\r\f]/;

/**
 * Collapse runs of `[ \t\n\r\f]` to a single space and strip leading/trailing
 * whitespace across spans. Mirrors pretext's `normalizeWhitespaceNormal` so
 * that `spans` and the block's plain text stay aligned with what the layout
 * engine actually renders — otherwise cursor/selection mapping drifts by one
 * character per collapsed whitespace character.
 */
function normalizeWhitespaceInSpans(spans: InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let inSpace = true; // start true to strip leading whitespace
  for (const span of spans) {
    let result = '';
    for (const ch of span.text) {
      if (COLLAPSIBLE_WS_RE.test(ch)) {
        if (!inSpace) {
          result += ' ';
          inSpace = true;
        }
      } else {
        result += ch;
        inSpace = false;
      }
    }
    out.push({ ...span, text: result });
  }
  // Strip trailing space from the last span that contributed content
  for (let i = out.length - 1; i >= 0; i--) {
    const text = out[i]!.text;
    if (text.length === 0) continue;
    if (text.endsWith(' ')) {
      out[i] = { ...out[i]!, text: text.slice(0, -1) };
    }
    break;
  }
  return out.filter((s) => s.text.length > 0);
}

/**
 * Build normalized text, spans, and sourceMap for a block. The plain text is
 * whitespace-normalized to match pretext's internal normalization so that the
 * per-character `sourceMap` aligns with rendered line segments.
 */
export function buildBlockMapping(
  markdown: string,
  blockSrcStart: number,
  blockSrcEnd: number,
  rawSpans: InlineSpan[],
): { text: string; spans: InlineSpan[]; sourceMap: number[] } {
  const rawText = rawSpans.map((s) => s.text).join('');
  const rawSourceMap = computeSourceMap(markdown, blockSrcStart, blockSrcEnd, rawText);

  const spans = normalizeWhitespaceInSpans(rawSpans);
  const text = spans.map((s) => s.text).join('');

  // Walk the raw text building the same normalization, and project each kept
  // normalized character onto the rawSourceMap to obtain the source offset.
  const sourceMap: number[] = [];
  let inSpace = true;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i]!;
    if (COLLAPSIBLE_WS_RE.test(ch)) {
      if (!inSpace) {
        sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
        inSpace = true;
      }
    } else {
      sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
      inSpace = false;
    }
  }
  if (sourceMap.length > text.length) sourceMap.length = text.length;

  return { text, spans, sourceMap };
}
