/**
 * Graphemes: what canvas `letterSpacing` and CSS `letter-spacing` space
 * apart. Tracking is counted per grapheme, not per UTF-16 unit, so a
 * supplementary-plane ideograph (𠺕), an emoji or a letter with a combining
 * accent takes one share of it, as the renderers paint it.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Text whose graphemes are not one UTF-16 unit each: combining marks,
 *  joiners and variation selectors, surrogate pairs, CR LF and conjoining
 *  Hangul jamo. Anything else counts its length. */
const COMPLEX_RE = /[\p{M}\u200D\uFE00-\uFE0F\u1100-\u11FF\u{10000}-\u{10FFFF}\uD800-\uDFFF]|\r\n/u;

/** How many graphemes `text` holds. */
export function graphemeCount(text: string): number {
  if (!COMPLEX_RE.test(text)) return text.length;
  let n = 0;
  const it = segmenter.segment(text)[Symbol.iterator]();
  while (!it.next().done) n++;
  return n;
}

/** The graphemes of `text`, in order. */
export function graphemesOf(text: string): string[] {
  if (!COMPLEX_RE.test(text)) return Array.from(text);
  return Array.from(segmenter.segment(text), (g) => g.segment);
}

/** The last grapheme of `text` ('' when empty). */
export function lastGrapheme(text: string): string {
  if (text.length === 0) return '';
  const tail = text.length > 24 ? text.slice(-24) : text;
  if (!COMPLEX_RE.test(tail)) return text[text.length - 1]!;
  const all = graphemesOf(tail);
  return all[all.length - 1] ?? '';
}
