// wrapRich: breaks rich text into lines, dividing overlong words
// (#1278: split out of richText.ts).
import { getHyphenationRulesKey, hyphenateText, hyphenateByDictionary } from '../../hyphenation/hyphenate.js';
import { endsInsideGeminate } from '../../measure/geminate.js';
import { isBreakingSpace, NO_BREAK_SPACES } from '../../measure/spaces.js';
import { hasJoiningScript } from '../../writing/bidi.js';
import { RichMeasurer, type RichLine } from './measure.js';

const SOFT_HYPHEN = '­';

/** Where the text of a line ending at the syllable break `k` stops: before
 *  the middle dot of an `l·l`, whose place the hyphen takes. */
function hyphenEnd(text: string, k: number): number {
  return endsInsideGeminate(text.slice(Math.max(0, k - 2), k)) ? k - 1 : k;
}
/** A space the line may break at: a no-break space glues (EF-66). */
export const isSpace = isBreakingSpace;

/** Where to cut a word `[a, b)` that does not fit `maxWidth`: at the last
 *  no-break space that leaves a head that fits (the next line opens after
 *  it, `next`), else at the last syllable break whose head (with its
 *  hyphen) fits, else at the last character that fits (at least one). A
 *  subscript and a superscript set over each other are never parted, as in
 *  the body (EF-80): the cut falls before the pair, or after it when the
 *  pair opens the word. */
function breakWord(m: RichMeasurer, a: number, b: number, maxWidth: number, hyphenate: boolean): { end: number; hyphen: boolean; next?: number; divided?: 'syllable' | 'character' } {
  const text = m.rt.text;
  const pairs = m.stackedRanges(a, b);
  const pairAround = (k: number): [number, number] | undefined => pairs.find(([s, e]) => k > s && k < e);
  for (let k = b - 2; k > a; k--) {
    if (!NO_BREAK_SPACES.includes(text[k]!) || NO_BREAK_SPACES.includes(text[k - 1]!) || pairAround(k)) continue;
    if (m.measure(a, k) <= maxWidth) return { end: k, hyphen: false, next: k + 1 };
  }
  // A word of a joining script (Arabic) is never cut: it runs past the
  // line, whole.
  if (hasJoiningScript(text.slice(a, b))) return { end: b, hyphen: false };
  if (hyphenate) {
    const word = m.rt.text.slice(a, b);
    // A word the document's rules keep whole is divided at the dictionary's
    // syllables when no point of its own fits (#699).
    for (const divide of getHyphenationRulesKey() === '' ? [hyphenateText] : [hyphenateText, hyphenateByDictionary]) {
      const hy = divide(word);
      if (!hy.includes(SOFT_HYPHEN) || hy.replaceAll(SOFT_HYPHEN, '') !== word) continue;
      let best = -1;
      let k = 0;
      for (const part of hy.split(SOFT_HYPHEN).slice(0, -1)) {
        k += part.length;
        if (m.measure(a, hyphenEnd(text, a + k), { text: '-', style: m.styleNear(a + k - 1) }) > maxWidth) break;
        if (!pairAround(a + k)) best = k;
      }
      if (best > 0) return { end: a + best, hyphen: true, divided: 'syllable' };
    }
  }
  let lo = 1;
  let hi = b - a;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m.measure(a, a + mid) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  const pair = pairAround(a + lo);
  if (pair) return { end: pair[0] > a ? pair[0] : pair[1], hyphen: false, divided: 'character' };
  return { end: a + lo, hyphen: false, divided: 'character' };
}

/** How many characters of the word `[a, b)` the line opened at `lineStart`
 *  can take up to a syllable break, with a hyphen, within `maxWidth`: the
 *  longest such head, or 0. A subscript and a superscript set over each
 *  other are never parted. */
function syllableFill(m: RichMeasurer, lineStart: number, a: number, b: number, maxWidth: number): number {
  const word = m.rt.text.slice(a, b);
  if (hasJoiningScript(word)) return 0;
  const hy = hyphenateText(word);
  if (!hy.includes(SOFT_HYPHEN) || hy.replaceAll(SOFT_HYPHEN, '') !== word) return 0;
  const pairs = m.stackedRanges(a, b);
  let best = 0;
  let k = 0;
  for (const part of hy.split(SOFT_HYPHEN).slice(0, -1)) {
    k += part.length;
    if (m.measure(lineStart, hyphenEnd(m.rt.text, a + k), { text: '-', style: m.styleNear(a + k - 1) }) > maxWidth) break;
    if (!pairs.some(([s, e]) => a + k > s && a + k < e)) best = k;
  }
  return best;
}

/** Greedy word wrap of one paragraph `[start, end)` (no newline inside),
 *  line `i` being `widthFor(i)` wide. Leading spaces of the paragraph are
 *  kept, trailing spaces of every line dropped; a word wider than a line
 *  breaks by syllable (with `hyphenate`) or by character. */
export function wrapRich(
  m: RichMeasurer,
  start: number,
  end: number,
  widthFor: (i: number) => number,
  hyphenate: boolean,
  /** A justified text that hyphenates (EF-109): a word that does not fit
   *  the rest of a line is cut at its last syllable break that does. */
  fill = false,
): RichLine[] {
  const text = m.rt.text;
  const out: RichLine[] = [];
  let lineStart = -1; // -1: the line holds nothing yet
  let lineEnd = start;
  let maxW = Math.max(1, widthFor(0));
  const trimmedEnd = (a: number, b: number) => {
    while (b > a && isSpace(text[b - 1])) b--;
    return b;
  };
  const flush = (a: number, b: number, hyphen = false, divided?: 'syllable' | 'character') => {
    const line = m.rangeLine(a, hyphen ? b : trimmedEnd(a, b), hyphen);
    out.push(divided ? { ...line, wordDivided: divided } : line);
    maxW = Math.max(1, widthFor(out.length));
  };
  // A space inside a run the author oriented is not a place to break.
  const breakingSpace = (k: number): boolean => isSpace(text[k]) && !m.insideOriented(k);
  let i = start;
  while (i < end) {
    let j = i + 1;
    const space = breakingSpace(i);
    while (j < end && breakingSpace(j) === space) j++;
    if (space) {
      // A space never breaks a line by itself: the next word decides.
      if (lineStart >= 0 || out.length === 0) {
        if (lineStart < 0) lineStart = i;
        lineEnd = j;
      }
      i = j;
      continue;
    }
    if (lineStart >= 0 && m.measure(lineStart, j) > maxW && trimmedEnd(lineStart, lineEnd) > lineStart) {
      const head = fill && hyphenate ? syllableFill(m, lineStart, i, j, maxW) : 0;
      if (head > 0) {
        // The line takes the word's head and a hyphen; its tail opens the
        // next line.
        flush(lineStart, i + head, true);
        lineStart = -1;
        i += head;
        continue;
      }
      flush(lineStart, lineEnd);
      lineStart = -1;
    } else if (lineStart >= 0 && m.measure(lineStart, j) > maxW) {
      // Only leading spaces on the line: drop them.
      lineStart = -1;
    }
    if (lineStart >= 0) {
      lineEnd = j;
      i = j;
      continue;
    }
    // The word opens a line; cut it while it is wider than the line.
    let a = i;
    while (m.measure(a, j) > maxW) {
      const cut = breakWord(m, a, j, maxW, hyphenate);
      if (cut.end >= j) break;
      flush(a, cut.end, cut.hyphen, cut.divided);
      a = cut.next ?? cut.end;
    }
    lineStart = a;
    lineEnd = j;
    i = j;
  }
  if (lineStart >= 0) flush(lineStart, lineEnd);
  else if (out.length === 0) out.push(m.line([]));
  return out;
}
