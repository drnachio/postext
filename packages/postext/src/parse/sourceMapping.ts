import type { InlineSpan } from './types.js';
import { MATH_PLACEHOLDER } from './inlineMath.js';
import { GAP_PLACEHOLDER, gapCloseAt } from './exerciseGaps.js';
import { BREAK_PLACEHOLDER, CHIP_PLACEHOLDER, FOOTNOTE_PLACEHOLDER, MARK_OPENER, REF_PLACEHOLDER, SMALLCAPS_OPENER, SWATCH_PLACEHOLDER, TAB_PLACEHOLDER, extractInlineRefs, readMarkAt } from './inlineFormatting.js';
import { sliceSpan } from './links.js';
import { orientationOpenerAt } from './orientationMarks.js';
import { annotationSourceSkips } from './annotations.js';
import { CITATION_PLACEHOLDER, extractInlineCitations } from './citations.js';

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

/** The markup of the highlight marks (`:mark[`, and `]{…}` after the
 *  text, #888) of `[from, end)`, which prints nothing: `[start, end)`
 *  source offsets in order. One in inline code (`code`) is text. */
function markSourceSkips(markdown: string, from: number, end: number, code: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  // Read in the block's own text (a mark reads forward only), so a block
  // costs its own length, not the document's.
  const block = markdown.slice(from, end);
  for (let k = block.indexOf(MARK_OPENER); k >= 0; k = block.indexOf(MARK_OPENER, k + 1)) {
    const at = from + k;
    if (code.some(([s, e]) => at >= s && at < e)) continue;
    const read = readMarkAt(block, k);
    if (!read) continue;
    const close = at + MARK_OPENER.length + read.inner.length;
    out.push([at, at + MARK_OPENER.length], [close, from + read.end]);
  }
  return out;
}

/** Whether a reference opens at `r`: `:ref{`, or LaTeX's `\ref{` or
 *  `\eqref{` (#530). */
function refOpenerAt(markdown: string, r: number): boolean {
  const c = markdown[r];
  if (c === ':') return markdown.startsWith(':ref{', r);
  if (c === '\\') return markdown.startsWith('\\ref{', r) || markdown.startsWith('\\eqref{', r);
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
  // Inline code spans, which the parser protects: a mark written inside
  // one (`` `:smallcaps[…]` ``, `` `:tcy[…]` ``) is text, its opener
  // printed (#1215).
  const code = roleCodeSpans(markdown, blockSrcStart, blockSrcEnd);
  let ci = 0;
  const annotationSkips = annotationSourceSkips(markdown, blockSrcStart, blockSrcEnd);
  // Looked for in the block only: a search of the whole document made
  // every block cost the document's length (#1395).
  const markSkips = markSourceSkips(markdown, blockSrcStart, blockSrcEnd, code);
  const skips = markSkips.length > 0 ? [...annotationSkips, ...markSkips].sort((a, b) => a[0] - b[0]) : annotationSkips;
  let si = 0;
  // The citations of the block (#1215), read as the parser reads them:
  // each placeholder stands for the next one at or after the cursor.
  const citations = plainText.includes(CITATION_PLACEHOLDER)
    ? extractInlineCitations(markdown.slice(blockSrcStart, blockSrcEnd), blockSrcStart).citations
    : [];
  let cti = 0;
  // So are its references, whose cross-reference forms (`@sec:id`,
  // `[@fig:id]`) have no `:ref{` to look for.
  const refs = plainText.includes(REF_PLACEHOLDER)
    ? extractInlineRefs(markdown.slice(blockSrcStart, blockSrcEnd), blockSrcStart).refs
    : [];
  let rfi = 0;
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
    // LaTeX's `\ref{…}` / `\eqref{…}` (#530) and the cross-references
    // (`@sec:id`, `[@fig:id]`) stand for one too: the next reference of
    // the block at or after the cursor (#1215).
    if (ch === REF_PLACEHOLDER) {
      while (rfi < refs.length && refs[rfi]!.sourceStart < r) rfi++;
      const ref = refs[rfi];
      if (ref) {
        rfi++;
        map[p] = ref.sourceStart;
        r = ref.sourceEnd;
        continue;
      }
      while (r < blockSrcEnd && !refOpenerAt(markdown, r)) r++;
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
    // Citation placeholder: the plain char represents `[@key]`, `@key`
    // or `[-@key]` (#1215). Map to its first character, skip past it.
    if (ch === CITATION_PLACEHOLDER) {
      while (cti < citations.length && citations[cti]!.sourceStart < r) cti++;
      const cite = citations[cti];
      if (!cite) {
        map[p] = blockSrcEnd;
        continue;
      }
      cti++;
      map[p] = cite.sourceStart;
      r = cite.sourceEnd;
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
      // An inline symbol (`:icon[alt]{…}`, #1058) shares the placeholder:
      // its text in brackets is skipped, escapes included, then its braces.
      while (r < blockSrcEnd && !markdown.startsWith(':swatch{', r) && !markdown.startsWith(':icon[', r)) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      let j = r;
      if (markdown.startsWith(':icon[', r)) {
        j = r + ':icon['.length;
        while (j < blockSrcEnd && markdown[j] !== ']') j += markdown[j] === '\\' ? 2 : 1;
      }
      while (j < blockSrcEnd && markdown[j] !== '}') j++;
      if (j < blockSrcEnd) j++; // consume the closing `}`
      r = j;
      continue;
    }
    // An exercise's answer (`[[…]]`, #1225): map to its `[[` and skip past
    // the `]]` and the attribute braces right after it, when present.
    if (ch === GAP_PLACEHOLDER) {
      while (r < blockSrcEnd && !markdown.startsWith('[[', r)) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      const close = gapCloseAt(markdown, r + 2);
      let j = close < 0 ? blockSrcEnd : close + 2;
      if (markdown[j] === '{') {
        const stop = markdown.indexOf('}', j);
        if (stop >= 0 && stop < blockSrcEnd && !markdown.slice(j, stop).includes('\n')) j = stop + 1;
      }
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
    // Tab placeholder (#622): a tab character, or `:tab` with its
    // attributes. Map to it and skip past it.
    if (ch === TAB_PLACEHOLDER) {
      const tabAt = (i: number): number => {
        if (markdown[i] === '\t') {
          // Tabs in a row are one (see `extractInlineTabs`).
          let j = i + 1;
          for (let k = j; k < blockSrcEnd && (markdown[k] === ' ' || markdown[k] === '\t'); k++) if (markdown[k] === '\t') j = k + 1;
          return j - i;
        }
        if (!markdown.startsWith(':tab', i)) return 0;
        let j = i + 4;
        if (markdown[j] === '{') {
          const close = markdown.indexOf('}', j);
          if (close >= 0 && close < blockSrcEnd && !markdown.slice(j, close).includes('\n')) j = close + 1;
        }
        return j - i;
      };
      while (r < blockSrcEnd && tabAt(r) === 0) r++;
      if (r >= blockSrcEnd) {
        map[p] = blockSrcEnd;
        continue;
      }
      map[p] = r;
      r += tabAt(r);
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
    // The tie of `Eq.~\eqref{…}` (#530) is the no-break space before the
    // reference.
    if (ch === '\u00a0' && plainText[p + 1] === REF_PLACEHOLDER) {
      let j = r;
      while (j < blockSrcEnd && markdown[j] !== '\u00a0' && !(markdown[j] === '~' && refOpenerAt(markdown, j + 1))) j++;
      if (j < blockSrcEnd) {
        map[p] = j;
        r = j + 1;
        continue;
      }
    }
    const isSpace = ch === ' ';
    while (r < blockSrcEnd) {
      while (si < skips.length && skips[si]![1] <= r) si++;
      if (si < skips.length && r >= skips[si]![0]) {
        r = skips[si]![1];
        continue;
      }
      const rc = markdown[r]!;
      while (ci < code.length && code[ci]![1] <= r) ci++;
      const inCode = ci < code.length && r >= code[ci]![0];
      // The opener of a `:smallcaps[…]` run has no plain character: skip
      // it whole, so its letters never match the text inside. Not in
      // inline code, where it is printed.
      if (rc === ':' && !inCode && isSmallCapsOpenerAt(markdown, r, blockSrcEnd)) {
        r += SMALLCAPS_OPENER.length;
        continue;
      }
      // So has the opener of `:tcy[…]`, `:upright[…]`, `:sideways[…]`.
      const orientationOpener = rc === ':' && !inCode ? orientationOpenerAt(markdown, r, blockSrcEnd) : 0;
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

/** The inline code spans (`` `…` ``) of `[from, end)` that may hold a
 *  mark (`:name[`), as `[start, end)` source offsets in order; none when
 *  the block has no such mark. */
function roleCodeSpans(markdown: string, from: number, end: number): Array<[number, number]> {
  const slice = markdown.slice(from, end);
  if (!slice.includes('`') || !/:[A-Za-z]+\[/.test(slice)) return [];
  const out: Array<[number, number]> = [];
  const re = /(?<!\\)`[^`\n]+?`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) out.push([from + m.index, from + m.index + m[0].length]);
  return out;
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
    // A tab (#622) takes the spaces around it: the one collapsed before it
    // is dropped, and the ones after it are not kept.
    if (span.tab && span.text === TAB_PLACEHOLDER) {
      dropTrailingSpace(out);
      out.push({ ...span, text: '\t' });
      inSpace = true;
      continue;
    }
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
      .map((l) => ({ ...l, start: kept[l.start]!, end: kept[l.end]! }))
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

/** Drop the space the spans so far end on (collapsed whitespace before a
 *  tab, #622), if any. */
function dropTrailingSpace(out: InlineSpan[]): void {
  for (let i = out.length - 1; i >= 0; i--) {
    const text = out[i]!.text;
    if (text.length === 0) continue;
    if (text.endsWith(' ') && !out[i]!.tab) out[i] = sliceSpan(out[i]!, 0, text.length - 1);
    return;
  }
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
  // Whether the last entry is a collapsed space (a tab drops it, #622).
  let collapsed = false;
  for (let i = 0; i < rawText.length; i++) {
    const ch = rawText[i]!;
    if (ch === TAB_PLACEHOLDER) {
      if (collapsed) sourceMap.pop();
      sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
      inSpace = true;
      collapsed = false;
      continue;
    }
    if (COLLAPSIBLE_WS.has(ch)) {
      if (!inSpace) {
        sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
        inSpace = true;
        collapsed = true;
      }
    } else {
      collapsed = false;
      sourceMap.push(rawSourceMap[i] ?? blockSrcEnd);
      inSpace = false;
    }
  }
  if (sourceMap.length > text.length) sourceMap.length = text.length;

  return { text, spans, sourceMap };
}
