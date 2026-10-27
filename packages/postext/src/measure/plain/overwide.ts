// Word checks for plain measurement: letterless words, and words or glued
// groups too wide for the line that pretext cannot cut.
import { measureTextWidth, getMeasureLanguage } from '../canvas.js';
import { measuringVertically } from '../vertical.js';
import { WORDS_AND_SPACES_RE, isBreakingSpaceRun } from '../spaces.js';
import { hasCompound, breaksAfterHardHyphen } from '../breakRules.js';
import { joiningScriptIn } from '../rtl/joining.js';
import { isLetterless, wordPieceScript } from '../script.js';

/** Whether a word of `text` (between breaking spaces) has no letter. */
export function holdsLetterlessWord(text: string): boolean {
  const words = text.match(WORDS_AND_SPACES_RE);
  return words !== null && words.some((word) => !isBreakingSpaceRun(word) && isLetterless(word));
}

/** A hyphen or a dash: where a word may part at the end of a line. */
const HYPHEN_OR_DASH_RE = /[-\u2010-\u2015]/;

/** Whether a word of `text` that has a letter parts, after a hyphen or a
 *  dash it carries, into a piece with none (`COVID-19`, `(pre-2001)`,
 *  `2-methyl`): the line may end there, and the piece is then a text of
 *  its own, measured and painted in the script of its word (#725). */
export function holdsLetterlessPiece(text: string): boolean {
  if (!HYPHEN_OR_DASH_RE.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (isBreakingSpaceRun(word) || wordPieceScript(word) === undefined) continue;
    let from = 0;
    for (let at = 0; at < word.length; at++) {
      if (!HYPHEN_OR_DASH_RE.test(word[at]!)) continue;
      if (isLetterless(word.slice(from, at + 1))) return true;
      from = at + 1;
    }
    if (from > 0 && isLetterless(word.slice(from))) return true;
  }
  return false;
}

/** Whether a word of `text` that has a letter and a character with none
 *  (`10.1006/ijhc.2001.0458`) is wider than `widthPx`: cut where its line
 *  ends, it may leave a piece with no letter (#725). */
export function hasOverwideMixedWord(text: string, font: string, widthPx: number): boolean {
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!isBreakingSpaceRun(word) && wordPieceScript(word) !== undefined && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/** Where the text library cuts a word into pieces it measures one by
 *  one: at a soft hyphen (the dictionary's or the author's), after a
 *  hyphen and around a dash. */
const WORD_CUT_RE = /[\u00AD\-\u2010-\u2015]/;

/**
 * Whether a paragraph with no formatting is measured as one with a style
 * in it, word by word, in a document shaped in its own language (#772):
 * when a line may end inside one of its words (`text` is the paragraph
 * with the dictionary's soft hyphens in it).
 *
 * The text library measures each piece of such a word alone, so the word
 * is as wide as its pieces set apart, and is painted so. The word-by-word
 * breaker measures the word whole and its pieces as the word grows by
 * them, so it carries what the face draws across a place a line may end
 * at: the Catalan form of `l·l`, a ligature, a kerned pair. One book then
 * set the same word two ways, by whether its paragraph held a word in
 * italics. Crimson Pro in Catalan at 21 px: `il·luminació,` 107.65 px in a
 * paragraph with no formatting (the dot 0.24 em) and 115.14 px in one with
 * a style (the dot 0.586 em); of the thirteen such words of the Catalan
 * pocket novella seven were set the first way and six the second.
 * Measured in Chrome 154.
 *
 * Such a paragraph now takes the lines a styled one would for the same
 * text, and the two halves of a word broken at a line end are measured as
 * the texts painted (`ownRest` in `measure/rich.ts`). A paragraph no line
 * can end inside a word of keeps the text library, which measures its
 * words whole too. A document that keeps the host's language keeps every
 * width it had, and so does vertical text.
 */
export function measuresWordsWhole(text: string): boolean {
  return getMeasureLanguage() !== undefined && !measuringVertically() && WORD_CUT_RE.test(text);
}

/** The unit squares of `isUnitSquare` (`cjkClasses.ts`). */
export const UNIT_SQUARE_RE = /[\u3371-\u337A\u3380-\u33DF\u33FF]/;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export const FIGURE_SPACE = '\u2007';
/** The no-break spaces pretext glues its neighbours to (EF-66). */
const PRETEXT_GLUE_RE = /[\u00A0\u202F\uFEFF]/;

/**
 * Whether `text` holds a group of words glued by a no-break space that is
 * wider than `widthPx`. Pretext cuts such a group between characters, inside
 * a number ("300 0" / "00 0"); the word-by-word breaker breaks it at its last
 * no-break space first (EF-66), so the paragraph goes there. Only text that
 * holds a no-break space is measured.
 */
export function hasOverwideGluedGroup(text: string, font: string, widthPx: number): boolean {
  if (!PRETEXT_GLUE_RE.test(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (PRETEXT_GLUE_RE.test(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/**
 * Whether `text` holds a word of a joining script (Arabic…) wider than
 * `widthPx`. Pretext would cut it between two letters; the word-by-word
 * breaker never cuts one (`measure/rtl/joining.ts`): it lets it run past the
 * measure and flags the line (`VDTLine.wordOverflow`).
 */
export function hasOverwideJoiningWord(text: string, font: string, widthPx: number): boolean {
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (joiningScriptIn(word) && measureTextWidth(word, font) > widthPx) return true;
  }
  return false;
}

/**
 * Whether `text` holds a compound with a part wider than `widthPx`: a word
 * with a hyphen between two letters, the parts being what lies between its
 * breaks after those hyphens ("counterrevolutionaries-" of
 * "counterrevolutionaries-internationalization"). When the dictionary leaves
 * compounds whole (`hyphenation.compounds: false`) such a part has no soft
 * hyphen, and pretext would cut it between two characters with no hyphen;
 * the word-by-word breaker divides it at the dictionary's syllables, as it
 * does any word wider than the line, so the paragraph goes there.
 */
export function hasOverwideCompoundPart(text: string, font: string, widthPx: number): boolean {
  if (!hasCompound(text)) return false;
  for (const word of text.match(WORDS_AND_SPACES_RE) ?? []) {
    if (!hasCompound(word)) continue;
    let start = 0;
    for (let i = 1; i < word.length - 1; i++) {
      if (word[i] !== '-' || !breaksAfterHardHyphen(word[i - 1], word[i + 1])) continue;
      if (measureTextWidth(word.slice(start, i + 1), font) > widthPx) return true;
      start = i + 1;
    }
    if (measureTextWidth(word.slice(start), font) > widthPx) return true;
  }
  return false;
}

/** Graphemes `from` to `to` (exclusive; to the end when undefined) of a
 *  segment, as pretext counts a cursor's `graphemeIndex`. */
export function graphemeSlice(text: string, from: number, to: number | undefined): string {
  return Array.from(graphemeSegmenter.segment(text), (g) => g.segment).slice(from, to).join('');
}
