import type { InlineSpan } from './types';
import { MATH_PLACEHOLDER } from './inlineMath';
import { BREAK_PLACEHOLDER, CHIP_PLACEHOLDER, FOOTNOTE_PLACEHOLDER, REF_PLACEHOLDER, SMALLCAPS_OPENER, SWATCH_PLACEHOLDER } from './inlineFormatting';
import { sliceSpan } from './links';
import { orientationOpenerAt } from './orientationMarks';
import { annotationSourceSkips } from './annotations';

/** A `:smallcaps[` at `r` that the parser took as markup: its closing `]`
 *  comes later on the same line (an unclosed one stays literal text). */
function isSmallCapsOpenerAt(markdown: string, r: number, end: number): boolean {
  if (!markdown.startsWith(SMALLCAPS_OPENER, r)) return false;
  for (let j = r + SMALLCAPS_OPENER.length; j < end; j++) {
    const c = markdown[j]!;
    if (c === '\n') return false;
    if (c === '\\') { j++; continue; }
    if (c === ']') return j > r + SMALLCAPS_OPENER.length;
  }
  return false;
}

/**
 * Build a per-character map from plain text to absolute source offsets.
 * Greedy matches each plain char against the raw source (delimited by
 * [blockSrcStart, blockSrcEnd)), skipping markdown markers and treating
 * newlines/tabs as spaces for paragraph line joins. Exported so inline
 * snippets (`inlineSnippet.ts`) share the exact same alignment rules.
 */
export function computeSourceMap(
  markdown: string,
  blockSrcStart: number,
  blockSrcEnd: number,
  plainText: string,
): number[] {
  const map = new Array<number>(plainText.length);
  let r = blockSrcStart;
  // The markup of Chinese annotations (`:ruby[`, `]{rt="…"}`, a compact
  // ruby's `|hóng|lóu}`) prints nothing: plain characters never match
  // inside it (#193–#195).
  const skips = annotationSourceSkips(markdown, blockSrcStart, blockSrcEnd);
  let si = 0;
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
    // Ref placeholder: the plain char represents `:ref{…}` in the markdown.
    // Advance to the leading `:`, map to it, then skip past the closing `}`
    // so subsequent plain chars keep aligning with the source.
    if (ch === REF_PLACEHOLDER) {
      while (
        r < blockSrcEnd
        && !(
          markdown[r] === ':'
          && markdown[r + 1] === 'r'
          && markdown[r + 2] === 'e'
          && markdown[r + 3] === 'f'
          && markdown[r + 4] === '{'
        )
      ) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r;
      while (j < blockSrcEnd && markdown[j] !== '}') j++;
      if (j < blockSrcEnd) j++; // consume the closing `}`
      r = j;
      continue;
    }
    // Footnote placeholder: the plain char represents `[^id]`. Map to the
    // `[`, skip past the `]`.
    if (ch === FOOTNOTE_PLACEHOLDER) {
      while (r < blockSrcEnd && !markdown.startsWith('[^', r)) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r + 2;
      while (j < blockSrcEnd && markdown[j] !== ']') j++;
      if (j < blockSrcEnd) j++;
      r = j;
      continue;
    }
    // Swatch placeholder: the plain char represents `:swatch{…}`. Same
    // alignment rule as a ref: map to the leading `:`, skip past the `}`.
    if (ch === SWATCH_PLACEHOLDER) {
      while (r < blockSrcEnd && !markdown.startsWith(':swatch{', r)) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r;
      while (j < blockSrcEnd && markdown[j] !== '}') j++;
      if (j < blockSrcEnd) j++; // consume the closing `}`
      r = j;
      continue;
    }
    // Chip placeholder: the plain char represents `:chip[…]{…}`. Map to the
    // leading `:` and skip past the closing `]` (a `\]` stays inside) and
    // the attribute braces right after it, when present.
    if (ch === CHIP_PLACEHOLDER) {
      while (r < blockSrcEnd && !markdown.startsWith(':chip[', r)) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r + 6;
      while (j < blockSrcEnd && markdown[j] !== ']') j += markdown[j] === '\\' ? 2 : 1;
      if (j < blockSrcEnd) j++; // consume the closing `]`
      if (markdown[j] === '{') {
        const close = markdown.indexOf('}', j);
        if (close >= 0 && close < blockSrcEnd && !markdown.slice(j, close).includes('\n')) j = close + 1;
      }
      r = j;
      continue;
    }
    if (ch === BREAK_PLACEHOLDER) {
      // Forced break: the plain char stands for the `\\` pair in the source
      // (a title, a snippet) — with the spaces and the one newline after it
      // that the break swallowed, but not the next line's indentation — or
      // for a backslash ending a line (a snippet).
      const breakAt = (i: number): number => {
        if (markdown[i] !== '\\') return 0;
        if (markdown[i + 1] === '\\') {
          let j = i + 2;
          while (j < blockSrcEnd && (markdown[j] === ' ' || markdown[j] === '\t')) j++;
          if (markdown[j] === '\r' && markdown[j + 1] === '\n') j += 2;
          else if (markdown[j] === '\n') j++;
          return j - i;
        }
        if (markdown[i + 1] === '\n') return 2;
        if (markdown[i + 1] === '\r' && markdown[i + 2] === '\n') return 3;
        return 0;
      };
      while (r < blockSrcEnd && breakAt(r) === 0) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      r += breakAt(r);
      continue;
    }
    const isSpace = ch === ' ';
    while (r < blockSrcEnd) {
      while (si < skips.length && skips[si]![1] <= r) si++;
      if (si < skips.length && r >= skips[si]![0]) {
        r = skips[si]![1];
        continue;
      }
      const rc = markdown[r]!;
      // The opener of a `:smallcaps[…]` run has no plain character: skip
      // it whole, so its letters never match the text inside.
      if (rc === ':' && isSmallCapsOpenerAt(markdown, r, blockSrcEnd)) {
        r += SMALLCAPS_OPENER.length;
        continue;
      }
      // So has the opener of `:tcy[…]`, `:upright[…]`, `:sideways[…]`.
      const orientationOpener = rc === ':' ? orientationOpenerAt(markdown, r, blockSrcEnd) : 0;
      if (orientationOpener > 0) {
        r += orientationOpener;
        continue;
      }
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

/** Whitespace collapsed by pretext's `normalizeWhitespaceNormal`. A Set
 *  lookup is cheaper than a per-character regex test in these loops. */
const COLLAPSIBLE_WS = new Set([' ', '\t', '\n', '\r', '\f']);

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
    const result: string[] = [];
    // `kept[i]`: characters kept before `span.text[i]` — remaps link ranges.
    const kept: number[] | undefined = span.links ? [] : undefined;
    for (let i = 0; i < span.text.length; i++) {
      const ch = span.text[i]!;
      kept?.push(result.length);
      if (COLLAPSIBLE_WS.has(ch)) {
        if (!inSpace) {
          result.push(' ');
          inSpace = true;
        }
      } else {
        result.push(ch);
        inSpace = false;
      }
    }
    const text = result.join('');
    if (!kept) {
      out.push({ ...span, text });
      continue;
    }
    kept.push(text.length);
    const { links, ...rest } = span;
    const moved = (links ?? [])
      .map((l) => ({ start: kept[l.start]!, end: kept[l.end]!, href: l.href }))
      .filter((l) => l.end > l.start);
    out.push(moved.length > 0 ? { ...rest, text, links: moved } : { ...rest, text });
  }
  // Strip trailing space from the last span that contributed content
  for (let i = out.length - 1; i >= 0; i--) {
    const text = out[i]!.text;
    if (text.length === 0) continue;
    if (text.endsWith(' ')) {
      out[i] = sliceSpan(out[i]!, 0, text.length - 1);
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
    if (COLLAPSIBLE_WS.has(ch)) {
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
