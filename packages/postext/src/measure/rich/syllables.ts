// How a word is split into syllables and joints before it is measured:
// the dictionary's soft hyphens and the author's, the zero-width spaces an
// author typed, web addresses' own joints and the compounds of a text
// (moved out of wordBreaks.ts for #1547, which made the dictionary a
// passage's own).
import type { InlineSpan } from '../../parse/index.js';
import { withoutSlashJoints, hyphenateByDictionary, hyphenateText, softHyphenBreaks } from '../../hyphenation/hyphenate.js';
import { SOFT_HYPHEN } from '../types.js';
import { isBreakingSpace } from '../spaces.js';
import { withoutZeroWidthSpaces, ZERO_WIDTH_SPACE, hasCompound } from '../breakRules.js';
import { joiningScriptIn } from '../rtl/joining.js';

/** A word that is a URL or a bare DOI: never hyphenated by the dictionary,
 *  but breakable at its own joints so a long link cannot force an
 *  unfillable line. */
export const URL_LIKE_RE = /^(?:(?:https?|ftp):\/\/|www\.|10\.\d{4,}\/)\S+$/i;

/** Break opportunities inside a URL, following the usual editorial rule:
 *  after a slash (never inside the `//` of the scheme) or before a dot,
 *  hyphen or query/fragment punctuation, so the punctuation opens the next
 *  line and no hyphen is added. Never within the first few characters. */
export function urlBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 4; i < text.length - 1; i++) {
    const prev = text[i - 1]!;
    const ch = text[i]!;
    if (prev === '/' && ch !== '/' && text[i - 2] !== '/') out.push(i);
    else if ('.?#&=_~%-'.includes(ch) && prev !== '/' && !'.?#&=_~%-'.includes(prev)) out.push(i);
  }
  return out;
}

export interface SoftBreak {
  /** Offset into the word as laid out. */
  index: number;
  /** Typed in the source rather than found by the dictionary. */
  author: boolean;
}

/**
 * A word as laid out (its soft hyphens removed) and the breaks its soft
 * hyphens mark: the dictionary's when `hyphenate` is on, and the author's
 * own — the U+00AD the source carries between two letters or digits
 * (`softHyphenBreaks`), which the dictionary leaves as they are (it does not
 * hyphenate a word that already has them). The zero-width
 * space the dictionary puts after a slash is dropped: the rich breaker does
 * not break there, and it must not reach the line text. `byDictionary`
 * leaves the document's rules out (#699): every point of the patterns.
 */
export function syllabify(word: string, hyphenate: boolean, byDictionary = false): { clean: string; soft: SoftBreak[] } {
  // A word of a joining script is never divided, not even at a soft hyphen
  // its author typed: its letters connect (`measure/rtl/joining.ts`).
  if (joiningScriptIn(word)) return { clean: word.includes(SOFT_HYPHEN) ? word.split(SOFT_HYPHEN).join('') : word, soft: [] };
  const hyphenated = hyphenate ? withoutSlashJoints(word, byDictionary ? hyphenateByDictionary(word) : hyphenateText(word)) : word;
  if (!hyphenated.includes(SOFT_HYPHEN)) return { clean: hyphenated, soft: [] };
  let clean = '';
  const soft: SoftBreak[] = [];
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    // A soft hyphen the dictionary inserted is not the source's character.
    const fromSource = j < word.length && ch === word[j];
    if (fromSource) j++;
    if (ch !== SOFT_HYPHEN) clean += ch;
    // One the author typed at the word's edge or next to punctuation is no
    // break (#700).
    else if (!fromSource || softHyphenBreaks(word, j - 1)) soft.push({ index: clean.length, author: fromSource });
  }
  return { clean, soft };
}

/** {@link withoutZeroWidthSpaces} of a syllabified word: its soft breaks
 *  moved to the text left. */
export function dropZeroWidthSpaces(clean: string, soft: SoftBreak[]): { clean: string; soft: SoftBreak[]; zeroWidth: number[] } {
  const dropped = withoutZeroWidthSpaces(clean);
  if (dropped.text === clean) return { clean, soft, zeroWidth: [] };
  // How many zero-width spaces stand before each offset of `clean`.
  const before: number[] = [];
  let n = 0;
  for (let i = 0; i <= clean.length; i++) {
    before.push(n);
    if (clean[i] === ZERO_WIDTH_SPACE) n++;
  }
  return {
    clean: dropped.text,
    soft: soft.map((s) => ({ ...s, index: s.index - before[s.index]! })),
    zeroWidth: dropped.breaks,
  };
}

/** For each character of the spans' joined text, whether it sits in a
 *  compound: a run of text between breaking spaces with a hyphen between
 *  two letters (see `hasCompound`). */
export function compoundMask(spans: readonly InlineSpan[]): boolean[] {
  const text = spans.map((s) => s.text).join('');
  const mask = new Array<boolean>(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    if (isBreakingSpace(text[i])) { i++; continue; }
    let j = i;
    while (j < text.length && !isBreakingSpace(text[j])) j++;
    if (hasCompound(text.slice(i, j))) mask.fill(true, i, j);
    i = j;
  }
  return mask;
}
