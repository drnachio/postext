// Ellipsis cuts at the end, start or middle of a single rich line
// (#1278: split out of richText.ts).
import type { TextOverflow } from '../../types.js';
import { isBreakingSpace } from '../../measure/spaces.js';
import { hasJoiningScript } from '../../writing/bidi.js';
import { RichMeasurer, type RichLine } from './measure.js';
import { isSpace } from './wrap.js';

// ---------------------------------------------------------------------------
// Truncation with an ellipsis — where the cut falls (shared with the plain
// path in `layout.ts`)
// ---------------------------------------------------------------------------

/** Characters a head cut before an ellipsis drops at its end: spaces,
 *  separators, dashes and opening brackets / quotes ("Rivers, …" →
 *  "Rivers…", "Part one — …" → "Part one…"). */
const DROP_BEFORE_ELLIPSIS = /[\s,;:\-‐‑–—/([{«‹“‘„¿¡]/u;
/** Characters a tail cut after an ellipsis drops at its start: spaces,
 *  separators, dashes, sentence ends and closing brackets / quotes. */
const DROP_AFTER_ELLIPSIS = /[\s,;:.!?…\-‐‑–—/)\]}»›”’]/u;
/** Where a word may end inside a run of letters: after a hyphen, a dash or
 *  a slash. Not after U+2011 NON-BREAKING HYPHEN, which glues its
 *  neighbours like a no-break space ("MS\u2011DOS" is one word). */
const JOINS_WORDS = /[\-\u2010\u2013\u2014/]/u;
// No-break spaces glue their neighbours ("225 000", "37 °C"): never a place
// to cut. `isBreakingSpace` (measure/spaces) already leaves them out (EF-66).

/** Whether `i` is a word boundary of `text[from, to)`: an end of the range,
 *  a (breaking) space on either side, or just after a hyphen, dash or
 *  slash. */
function isWordBoundary(text: string, i: number, from: number, to: number): boolean {
  if (i <= from || i >= to) return true;
  const before = text[i - 1]!;
  return isBreakingSpace(before) || isBreakingSpace(text[i]) || JOINS_WORDS.test(before);
}

/** Whether a cut at `i` falls inside a word of `text[from, to)` written in
 *  a joining script (Arabic): such a word is never cut, whatever is lost
 *  (its letters would lose their joins and read as another word). */
function insideJoiningWord(text: string, i: number, from: number, to: number): boolean {
  if (isWordBoundary(text, i, from, to)) return false;
  let a = i;
  while (a > from && !isWordBoundary(text, a, from, to)) a--;
  let b = i;
  while (b < to && !isWordBoundary(text, b, from, to)) b++;
  return hasJoiningScript(text.slice(a, b));
}

/** The end of a head cut at `cut` once the spaces and joining punctuation
 *  before the ellipsis are dropped. */
function trimHead(text: string, from: number, cut: number): number {
  while (cut > from && DROP_BEFORE_ELLIPSIS.test(text[cut - 1]!)) cut--;
  return cut;
}

/** The start of a tail cut at `cut` once the spaces and punctuation after
 *  the ellipsis are dropped. */
function trimTail(text: string, to: number, cut: number): number {
  while (cut < to && DROP_AFTER_ELLIPSIS.test(text[cut]!)) cut++;
  return cut;
}

/** Where an `ellipsis-end` truncation of `text[from, to)` ends, given `fit`
 *  — the end of the longest head that fits beside the ellipsis. The cut
 *  moves back to the last word boundary, and the spaces and joining
 *  punctuation before the ellipsis are dropped — unless what is left keeps
 *  less than half of what fits (a single long word, a URL): then the word
 *  is cut where it must, except a word of a joining script (Arabic), which
 *  goes whole. Never past `fit`, so the head still fits. */
export function ellipsisEndCut(text: string, from: number, to: number, fit: number): number {
  if (!isWordBoundary(text, fit, from, to)) {
    let b = fit - 1;
    while (b > from && !isWordBoundary(text, b, from, to)) b--;
    // An Arabic word is dropped whole rather than cut, even when that
    // leaves only the ellipsis.
    if (insideJoiningWord(text, fit, from, to)) return trimHead(text, from, b);
    if (b > from) {
      const head = trimHead(text, from, b);
      // The guard counts what is kept, after the trim.
      if (head - from >= (fit - from) / 2) return head;
    }
  }
  return trimHead(text, from, fit);
}

/** Where an `ellipsis-start` truncation of `text[from, to)` starts, given
 *  `fit` — the start of the longest tail that fits beside the ellipsis: the
 *  mirror of `ellipsisEndCut`. Never before `fit`. */
export function ellipsisStartCut(text: string, from: number, to: number, fit: number): number {
  if (!isWordBoundary(text, fit, from, to)) {
    let b = fit + 1;
    while (b < to && !isWordBoundary(text, b, from, to)) b++;
    if (insideJoiningWord(text, fit, from, to)) return trimTail(text, to, b);
    if (b < to) {
      const tail = trimTail(text, to, b);
      if (to - tail >= (to - fit) / 2) return tail;
    }
  }
  return trimTail(text, to, fit);
}

/** An `ellipsis-middle` truncation keeping `text[from, from + left)` and
 *  `text[to - right, to)`, with the spaces that would touch the ellipsis
 *  dropped, and neither side ending inside an Arabic word. */
export function ellipsisMiddleCut(text: string, from: number, to: number, left: number, right: number): { left: number; right: number } {
  // Neither side ends inside an Arabic word.
  while (left > 0 && insideJoiningWord(text, from + left, from, to)) left--;
  while (right > 0 && insideJoiningWord(text, to - right, from, to)) right--;
  while (left > 0 && isSpace(text[from + left - 1])) left--;
  while (right > 0 && isSpace(text[to - right])) right--;
  return { left, right };
}

/** One explicit line `[s, e)` set on a single line: whole, clipped by the
 *  renderer, or truncated with an ellipsis at `mode` (the cut placed by
 *  `ellipsisEndCut` / `ellipsisStartCut` / `ellipsisMiddleCut`). */
export function singleRichLine(m: RichMeasurer, s: number, e: number, maxWidth: number, overflow: TextOverflow): RichLine {
  if (overflow === 'clip' || m.measure(s, e) <= maxWidth) return m.rangeLine(s, e);
  const text = m.rt.text;
  const ell = (style: number) => ({ text: '…', style });
  const len = e - s;
  if (overflow === 'ellipsis-start') {
    // The ellipsis takes the style of the character after it.
    const fitsFrom = (a: number) => m.measure(a, e, ell(m.styleNear(a))) <= maxWidth;
    let a = s;
    while (a <= e && !fitsFrom(a)) a++;
    if (a > e) return m.line([]);
    a = ellipsisStartCut(text, s, e, a);
    // A tail moved on to a word boundary puts the ellipsis beside another
    // character, whose style may be wider: measure again.
    while (a < e && !fitsFrom(a)) a = ellipsisStartCut(text, s, e, a + 1);
    return m.line([ell(m.styleNear(a)), ...m.pieces(a, e)]);
  }
  if (overflow === 'ellipsis-middle') {
    let left = 0;
    let right = 0;
    const fits = (l: number, r: number) => m.measure(s, s + l, ell(m.styleNear(s + l - 1)), ...m.pieces(e - r, e)) <= maxWidth;
    if (!fits(0, 0)) return m.line([]);
    while (left + right < len) {
      if (!fits(left + 1, right)) break;
      left++;
      if (left + right >= len) break;
      if (!fits(left, right + 1)) break;
      right++;
    }
    ({ left, right } = ellipsisMiddleCut(text, s, e, left, right));
    return m.line([...m.pieces(s, s + left), ell(m.styleNear(s + left - 1)), ...m.pieces(e - right, e)]);
  }
  // ellipsis-end: the ellipsis takes the style of the character before it,
  // so a head moved back to a word boundary is measured again in case that
  // style is wider.
  const fitsTo = (b: number) => m.measure(s, b, ell(m.styleNear(b - 1))) <= maxWidth;
  let b = e;
  while (b >= s && !fitsTo(b)) b--;
  if (b < s) return m.line([]);
  let cut = ellipsisEndCut(text, s, e, b);
  while (cut > s && !fitsTo(cut)) cut = ellipsisEndCut(text, s, e, cut - 1);
  return m.line([...m.pieces(s, cut), ell(m.styleNear(cut - 1))]);
}
