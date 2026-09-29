/**
 * Line ends inside a paragraph between East Asian characters (#181).
 *
 * The lines of a paragraph or a blockquote are joined with a space, and a
 * resource snippet (a caption, a note, a table cell) keeps its line ends as
 * whitespace. Chinese and Japanese are written without spaces, so a line end
 * between two ideographs must vanish instead: CSS Text 3 §4.1.3 ("segment
 * break transformation") removes a segment break when the characters on both
 * sides are East Asian Wide, Fullwidth or Halfwidth and neither is Hangul,
 * and when either side is a zero-width space. Its second rule, for Chinese
 * and Japanese text, also lets either side be an ambiguous-width punctuation
 * mark or symbol (`“`, `”`, `…`, `—`); the parser does not know the
 * document's language, so a run of such marks is looked through to the
 * characters around it (see {@link removesLineEndAt}). Korean keeps its
 * spaces.
 */

import type { InlineSpan } from './types';
import { sliceLinks } from './links';
import { FOOTNOTE_PLACEHOLDER } from './inlineFormatting';

/** Hangul syllables and jamo, in every width. */
function isHangul(cp: number): boolean {
  return (cp >= 0x1100 && cp <= 0x11ff)
    || (cp >= 0x3130 && cp <= 0x318f)
    || (cp >= 0xa960 && cp <= 0xa97f)
    || (cp >= 0xac00 && cp <= 0xd7ff)
    || (cp >= 0xffa0 && cp <= 0xffdc);
}

/** A character of the East Asian scripts whose East Asian Width is Wide,
 *  Fullwidth or Halfwidth (UAX #11), Hangul left out: ideographs and their
 *  radicals and strokes, kana, bopomofo, Yi, CJK punctuation and symbols,
 *  the fullwidth and halfwidth forms, the vertical and small form variants.
 *  Emoji (also Wide) are left out: a line end between two of them in Latin
 *  prose keeps its space. */
export function isEastAsianWide(cp: number): boolean {
  if (cp < 0x2e80) return false;
  if (isHangul(cp)) return false;
  return (cp >= 0x2e80 && cp <= 0x2fdf) // CJK radicals, Kangxi radicals
    || (cp >= 0x2ff0 && cp <= 0x303e) // ideographic description, CJK symbols and punctuation
    || (cp >= 0x3041 && cp <= 0x33ff) // kana, bopomofo, kanbun, strokes, enclosed CJK, compatibility
    || (cp >= 0x3400 && cp <= 0x4dbf) // extension A
    || (cp >= 0x4e00 && cp <= 0x9fff) // unified ideographs
    || (cp >= 0xa000 && cp <= 0xa4cf) // Yi
    || (cp >= 0xf900 && cp <= 0xfaff) // compatibility ideographs
    || (cp >= 0xfe10 && cp <= 0xfe19) // vertical forms
    || (cp >= 0xfe30 && cp <= 0xfe6f) // compatibility and small forms
    || (cp >= 0xff01 && cp <= 0xffee) // fullwidth and halfwidth forms (halfwidth Hangul excluded above)
    || (cp >= 0x16fe0 && cp <= 0x18aff) // ideographic symbols, Tangut
    || (cp >= 0x1b000 && cp <= 0x1b16f) // kana supplement and extensions
    || (cp >= 0x1f200 && cp <= 0x1f2ff) // enclosed ideographic supplement
    || (cp >= 0x20000 && cp <= 0x3fffd); // extensions B and later
}

/** Ambiguous-width punctuation and symbols that Chinese text uses between
 *  its ideographs: curly quotes, dashes, ellipsis, middle dots, reference
 *  marks, degree and section signs, circles, squares and stars. */
const AMBIGUOUS_PUNCTUATION = new Set<number>([
  0x00a7, 0x00b0, 0x00b7, 0x00d7, 0x00f7,
  0x2010, 0x2013, 0x2014, 0x2015, 0x2016, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2020, 0x2021, 0x2022, 0x2025, 0x2026, 0x2027, 0x2030, 0x2032, 0x2033, 0x203b,
  0x2103, 0x2116, 0x2160, 0x2190, 0x2191, 0x2192, 0x2193,
  0x25a0, 0x25a1, 0x25b2, 0x25b3, 0x25c6, 0x25c7, 0x25cb, 0x25ce, 0x25cf, 0x2605, 0x2606,
  0x2e3a, 0x2e3b, // two- and three-em dashes
]);

/** The code point that ends `text` before `index` (a surrogate pair read
 *  whole). */
function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) return undefined;
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index >= 2) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.codePointAt(index - 2);
  }
  return low;
}

/** Whether a line end between the code points `before` and `after` is
 *  removed rather than set as a space (CSS Text 3 §4.1.3). */
export function removesSegmentBreak(before: number | undefined, after: number | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  if (before === 0x200b || after === 0x200b) return true;
  const a = isEastAsianWide(before);
  const b = isEastAsianWide(after);
  if (a && b) return true;
  if (a) return AMBIGUOUS_PUNCTUATION.has(after);
  if (b) return AMBIGUOUS_PUNCTUATION.has(before);
  return false;
}

/** How far a run of ambiguous marks is looked through (a longer run is
 *  read as having nothing beyond it). */
const AMBIGUOUS_RUN_LIMIT = 32;

/** The first code point of `text` walking from `index` in `step` (-1 back,
 *  +1 on) that is neither an ambiguous mark nor `skip`; `undefined` at the
 *  edge of the text or past {@link AMBIGUOUS_RUN_LIMIT} marks. */
function pastAmbiguousRun(text: string, index: number, step: -1 | 1, skip: string | undefined): number | undefined {
  let at = index;
  for (let n = 0; n < AMBIGUOUS_RUN_LIMIT; n++) {
    const cp = step < 0 ? codePointBefore(text, at) : text.codePointAt(at);
    if (cp === undefined) return undefined;
    if (!AMBIGUOUS_PUNCTUATION.has(cp) && (skip === undefined || cp !== skip.charCodeAt(0))) return cp;
    at += step * (cp > 0xffff ? 2 : 1);
  }
  return undefined;
}

/**
 * Whether a line end between `text[…before)` and `text[after…]` is removed.
 * Beside the rules of {@link removesSegmentBreak}, a line end between two
 * ambiguous marks (`”⏎“`, `……⏎“`, `”⏎——`) goes when the nearest character
 * past the marks on either side is East Asian wide and neither is Hangul:
 * `“你好”⏎“再见”` joins, `“hello”⏎“bye”` and `“안녕”⏎“잘 가”` keep their space.
 * `skip` (a placeholder such as a footnote marker's) is looked through too.
 */
export function removesLineEndAt(text: string, before: number, after: number, skip?: string): boolean {
  const a = codePointBefore(text, before);
  const b = text.codePointAt(after);
  if (removesSegmentBreak(a, b)) return true;
  if (a === undefined || b === undefined) return false;
  if (!AMBIGUOUS_PUNCTUATION.has(a) || !AMBIGUOUS_PUNCTUATION.has(b)) return false;
  const left = pastAmbiguousRun(text, before, -1, skip);
  const right = pastAmbiguousRun(text, after, 1, skip);
  if ((left !== undefined && isHangul(left)) || (right !== undefined && isHangul(right))) return false;
  return (left !== undefined && isEastAsianWide(left)) || (right !== undefined && isEastAsianWide(right));
}

/** `spans` with the characters at the sorted offsets `drop` (into their
 *  joined text) taken out; link ranges follow their text and spans left
 *  empty are dropped. */
function dropCharacters(spans: InlineSpan[], drop: readonly number[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let offset = 0;
  let d = 0;
  for (const span of spans) {
    const end = offset + span.text.length;
    const local: number[] = [];
    while (d < drop.length && drop[d]! < end) {
      if (drop[d]! >= offset) local.push(drop[d]! - offset);
      d++;
    }
    offset = end;
    if (local.length === 0) {
      out.push(span);
      continue;
    }
    let text = '';
    let from = 0;
    for (const at of local) {
      text += span.text.slice(from, at);
      from = at + 1;
    }
    text += span.text.slice(from);
    if (text.length === 0) continue;
    const { links, ...rest } = span;
    // `i` less the dropped offsets before it (binary search: a span may
    // hold thousands of links and joined lines).
    const shift = (i: number): number => {
      let lo = 0;
      let hi = local.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (local[mid]! < i) lo = mid + 1;
        else hi = mid;
      }
      return i - lo;
    };
    const moved = (links ?? [])
      .map((l) => ({ start: shift(l.start), end: shift(l.end), href: l.href }))
      .filter((l) => l.end > l.start);
    out.push(moved.length > 0 ? { ...rest, text, ...sliceLinks(moved, 0, text.length) } : { ...rest, text });
  }
  return out;
}

/** A code unit only a text that may lose a line end holds: U+200B, or one
 *  at or past U+2E80, where every East Asian wide character sits
 *  ({@link isEastAsianWide}; a supplementary one's surrogates too). Each
 *  rule of {@link removesLineEndAt} needs one of them. */
const MAY_JOIN_RE = /[\u200B\u2E80-\uFFFF]/;

/**
 * Take out of a paragraph's or blockquote's mapped text the spaces that
 * joined two source lines between East Asian characters. A joining space is
 * one whose source, up to the next character's, holds the line end.
 * Returns `undefined` when nothing changes, so a block without Chinese text
 * keeps its arrays as they are.
 */
export function joinEastAsianLines(
  markdown: string,
  text: string,
  spans: InlineSpan[],
  sourceMap: number[],
): { text: string; spans: InlineSpan[]; sourceMap: number[] } | undefined {
  // Text with no East Asian wide character (a Latin paragraph) keeps every
  // space: one look at it, not one at each space.
  if (!MAY_JOIN_RE.test(text)) return undefined;
  let drop: number[] | undefined;
  for (let k = 1; k < text.length - 1; k++) {
    if (text.charCodeAt(k) !== 0x20) continue;
    // A footnote marker ending the line belongs to the text before it:
    // `他说[^1]⏎然后` joins like `他说⏎然后`.
    let b = k;
    while (b > 1 && text[b - 1] === FOOTNOTE_PLACEHOLDER) b--;
    if (!removesLineEndAt(text, b, k + 1, FOOTNOTE_PLACEHOLDER)) continue;
    const from = sourceMap[k];
    const to = sourceMap[k + 1];
    if (from === undefined || to === undefined) continue;
    let lineEnd = false;
    for (let r = from; r < to && r < markdown.length; r++) {
      if (markdown.charCodeAt(r) === 0x0a) {
        lineEnd = true;
        break;
      }
    }
    if (lineEnd) (drop ??= []).push(k);
  }
  if (!drop) return undefined;
  let joined = '';
  const map: number[] = [];
  let from = 0;
  for (const at of [...drop, text.length]) {
    joined += text.slice(from, at);
    for (let k = from; k < at; k++) map.push(sourceMap[k]!);
    from = at + 1;
  }
  return { text: joined, spans: dropCharacters(spans, drop), sourceMap: map };
}

/** A line end inside a snippet with the spaces and tabs around it (a blank
 *  line is left alone). */
const SNIPPET_LINE_END_RE = /[ \t\r]*\n[ \t]*/g;

/**
 * Take out of a resource snippet's spans (a caption, a note, a table cell)
 * the line ends that fall between East Asian characters, with the spaces
 * and tabs around them. The snippet's own text is the source, so the map
 * built afterwards (`computeSourceMap`) skips them.
 */
export function joinEastAsianSnippetLines(spans: InlineSpan[]): InlineSpan[] {
  if (!spans.some((s) => s.text.includes('\n'))) return spans;
  const text = spans.map((s) => s.text).join('');
  if (!MAY_JOIN_RE.test(text)) return spans;
  let drop: number[] | undefined;
  SNIPPET_LINE_END_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SNIPPET_LINE_END_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (text[end] === '\n' || text[start - 1] === '\n') continue;
    if (!removesLineEndAt(text, start, end)) continue;
    for (let k = start; k < end; k++) (drop ??= []).push(k);
  }
  return drop ? dropCharacters(spans, drop) : spans;
}
