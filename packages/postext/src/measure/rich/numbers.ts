// Numbers as the line breaker sees them (#1549): a figure in a cell
// narrower than it is never divided as a word is.
import { measureTextWidth } from '../canvas.js';
import { WORDS_AND_SPACES_RE, isBreakingSpaceRun } from '../spaces.js';

/**
 * A number as one word of the text: what may open it (brackets and quotes,
 * a sign, a currency sign), digits of any script with the marks that group
 * and part them (`.` `,` `'` `’`, the no-break, narrow and thin spaces, the
 * Arabic separators U+066B and U+066C), an exponent, then a unit joined to
 * it — directly or by a no-break space — of up to six letters (`kg`,
 * `km/h`, `m²`, `°C`, `%`, the `s` of `1990s`), and the punctuation that
 * may close it. A word with a letter before its first digit (`COVID-19`)
 * or a hyphen between its digits (a date, a range) is not one.
 */
const NUMBER_WORD_RE = /^[([{"'«“‘‹„]*[+\-−±~≈<>≤≥]?\p{Sc}?\p{Nd}[\p{Nd}.,'’    ٫٬]*(?:[eE][+\-−]?\p{Nd}+)?(?:[  ]?(?:[%‰‱′″\p{Sc}]|°[CFK]?|[\p{L}µΩ][\p{L}µΩ²³/·]{0,5}))?$/u;

/** The punctuation that may close a number. It is taken off by
 *  `isNumberWord` before the pattern runs: as a last `[…]*` of the pattern
 *  it shared `.` `,` `'` `’` with the digit groups, and a long run of them
 *  made the match backtrack over every way of splitting it (CodeQL
 *  js/polynomial-redos). */
const CLOSING = new Set([...')]}"\'»”’›.,;:!?']);

/**
 * Whether `word` (text between breaking spaces, as the breaker holds it)
 * is a number: `3,600`, `-12.5`, `1.2e-3`, `37 °C`, `(€1,250.00)`,
 * `١٢٬٥`. The overlong-word fallback divides a word wider than its line at
 * a syllable or between two characters, and a hyphen marks the cut;
 * `3,60-` | `0` reads as two numbers, so a number is left whole and runs
 * past its measure instead, unless a no-break space between its groups
 * gives a place to part it (`300 000` | `000`, EF-66), where nothing is
 * added.
 */
export function isNumberWord(word: string): boolean {
  if (word.length < 2) return false;
  let end = word.length;
  while (end > 0 && CLOSING.has(word[end - 1]!)) end--;
  return NUMBER_WORD_RE.test(word.slice(0, end));
}

/**
 * Whether `text` holds a number wider than `widthPx`. Pretext would cut
 * it between two digits with nothing to show the cut; the word-by-word
 * breaker leaves it whole and flags its line (`VDTLine.numberOverflow`),
 * so the paragraph goes there.
 */
export function hasOverwideNumber(text: string, font: string, widthPx: number): boolean {
  if (!/\p{Nd}/u.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!isBreakingSpaceRun(word) && isNumberWord(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}
