/**
 * Line ends inside a paragraph between East Asian characters (#181).
 *
 * The lines of a paragraph or a blockquote are joined with a space, and a
 * resource snippet (a caption, a note, a table cell) keeps its line ends as
 * whitespace. Chinese and Japanese are written without spaces, so a line end
 * between two ideographs must vanish instead: CSS Text 3 §4.1.3 ("segment
 * break transformation") removes a segment break when the characters on both
 * sides are East Asian Wide, Fullwidth or Halfwidth and neither is Hangul,
 * when one side is such a character and the other an ambiguous-width
 * punctuation mark or symbol (`“`, `”`, `…`, `—`), and when either side is a
 * zero-width space. Korean keeps its spaces.
 */

import type { InlineSpan } from './types';
import { sliceLinks } from './links';

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
    const shift = (i: number): number => i - local.filter((at) => at < i).length;
    const moved = (links ?? [])
      .map((l) => ({ start: shift(l.start), end: shift(l.end), href: l.href }))
      .filter((l) => l.end > l.start);
    out.push(moved.length > 0 ? { ...rest, text, ...sliceLinks(moved, 0, text.length) } : { ...rest, text });
  }
  return out;
}

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
  let drop: number[] | undefined;
  for (let k = 1; k < text.length - 1; k++) {
    if (text.charCodeAt(k) !== 0x20) continue;
    if (!removesSegmentBreak(codePointBefore(text, k), text.codePointAt(k + 1))) continue;
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
  const dropped = new Set(drop);
  let joined = '';
  const map: number[] = [];
  for (let k = 0; k < text.length; k++) {
    if (dropped.has(k)) continue;
    joined += text[k];
    map.push(sourceMap[k]!);
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
  let drop: number[] | undefined;
  SNIPPET_LINE_END_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SNIPPET_LINE_END_RE.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (text[end] === '\n' || text[start - 1] === '\n') continue;
    if (!removesSegmentBreak(codePointBefore(text, start), text.codePointAt(end))) continue;
    for (let k = start; k < end; k++) (drop ??= []).push(k);
  }
  return drop ? dropCharacters(spans, drop) : spans;
}
