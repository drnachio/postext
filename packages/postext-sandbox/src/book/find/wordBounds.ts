// Whole-word matching. In scripts written with spaces a word ends where a
// letter, digit or `_` meets something else. Chinese, Japanese, Thai, Lao,
// Khmer and Burmese run their words together, so there the browser's word
// segmenter (Intl.Segmenter) says where words begin and end; without it
// every boundary between two such characters counts as one.

const WORD = /[\p{L}\p{N}\p{M}_]/u;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/** Characters read on each side of an offset by the segmenter. */
const WINDOW = 48;

let segmenter: Intl.Segmenter | null | undefined;

function wordSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;
  }
  return segmenter;
}

function codePointBefore(text: string, i: number): string {
  if (i <= 0) return '';
  const low = text.charCodeAt(i - 1);
  const start = low >= 0xdc00 && low <= 0xdfff && i >= 2 ? i - 2 : i - 1;
  return text.slice(start, i);
}

function codePointAt(text: string, i: number): string {
  if (i >= text.length) return '';
  return String.fromCodePoint(text.codePointAt(i)!);
}

function segmentBoundary(text: string, i: number): boolean {
  const seg = wordSegmenter();
  if (!seg) return true;
  const start = Math.max(0, i - WINDOW);
  const end = Math.min(text.length, i + WINDOW);
  for (const s of seg.segment(text.slice(start, end))) {
    const at = start + s.index;
    if (at === i) return true;
    if (at > i) return false;
  }
  return false;
}

/** Whether a word may start or end at offset `i` of `text`. */
export function wordBoundaryAt(text: string, i: number): boolean {
  const before = codePointBefore(text, i);
  const after = codePointAt(text, i);
  if (!before || !after || !WORD.test(before) || !WORD.test(after)) return true;
  if (UNSPACED.test(before) || UNSPACED.test(after)) return segmentBoundary(text, i);
  return false;
}

/** Whether `[from, to)` of `text` is a whole word (or words). */
export function isWholeWord(text: string, from: number, to: number): boolean {
  return wordBoundaryAt(text, from) && wordBoundaryAt(text, to);
}
