import type { Dimension } from '../page.js';
import type { CompositionRule } from './bodyText/options.js';

/** The alignment of a text block. */
export type TextAlign = 'left' | 'justify' | 'center' | 'right';

/**
 * A text alignment as a config writes it (#371): a {@link TextAlign}, or the
 * logical `'start'` / `'end'`. Running text reads its alignment in its own
 * direction: `'left'` and `'start'` are the side a line starts on, `'right'`
 * and `'end'` the side it ends on — the left and the right of an English
 * paragraph, the right and the left of an Arabic one, on a page of either
 * direction (a right-to-left document's pages are mirrored, so its body
 * flow's left is the sheet's right). The last line of a justified paragraph
 * goes to the start side. `'start'` / `'end'` say so explicitly; a resolved
 * config carries `'left'` / `'right'` only.
 */
export type TextAlignKeyword = TextAlign | 'start' | 'end';

/**
 * The figures a text style sets (#1237), from its font's OpenType
 * features: `'oldstyle'` (`onum`, the figures of running text, with
 * ascenders and descenders) or `'lining'` (`lnum`, cap-height figures),
 * `'tabular'` (`tnum`, one width, for columns of numbers) or
 * `'proportional'` (`pnum`), or a form and a width together
 * (`'lining-tabular'` for tables and timetables). `'default'` sets the
 * font's own figures. A font without the feature sets its own figures.
 * Measured with the features, so canvas, HTML and PDF set the same widths.
 * A style that takes its family from another (a paragraph style, a table
 * or a caption from the body) takes its figures too; one that names its own
 * family sets that font's default unless it sets `figureStyle`.
 */
export type FigureStyle =
  | 'default'
  | 'oldstyle'
  | 'lining'
  | 'tabular'
  | 'proportional'
  | 'oldstyle-tabular'
  | 'oldstyle-proportional'
  | 'lining-tabular'
  | 'lining-proportional';

/** The languages with hyphenation patterns. */
export type HyphenationLocale =
  | 'en-us'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'ca'
  | 'nl';

/**
 * A BCP 47 language tag: one of the bundled {@link HyphenationLocale} ids,
 * or any other tag (`'es-ES'`, `'pt-BR'`, `'en-GB'`, `'sv'`). Hyphenation
 * ignores the region, script and variant subtags (`'es-ES'` hyphenates with
 * the `'es'` patterns, every English tag with `'en-us'`); a language with no
 * bundled patterns hyphenates with `'en-us'` and the engine warns once on the
 * console. The tag itself is kept as the PDF's document language.
 */
export type LocaleTag = HyphenationLocale | (string & {});

/** The direction a document's text runs (`PostextConfig.direction`):
 *  `'ltr'` left to right, `'rtl'` right to left (Arabic, Hebrew), `'auto'`
 *  from the script of the document language. */
export type DocumentDirection = 'auto' | 'ltr' | 'rtl';

/** A digit system, named as the Unicode `-u-nu-` keyword names it: `'latn'`
 *  the European digits 0–9, `'arab'` the Arabic-Indic digits ٠–٩ of the
 *  Mashriq (U+0660–0669), `'arabext'` the Extended Arabic-Indic digits
 *  ۰–۹ of Persian and Urdu (U+06F0–06F9). */
export type DigitSystem = 'latn' | 'arab' | 'arabext';

/** The digits a document's generated numbers are written in (see
 *  `PostextConfig.numerals`): a {@link DigitSystem}, or `'auto'` to take
 *  the one of the document language (`defaultNumeralsFor`). */
export type NumeralsSetting = 'auto' | DigitSystem;

/** Whether and how words are hyphenated: language, hyphenation zone,
 *  compounds and exceptions. */
export interface HyphenationConfig {
  enabled?: boolean;
  /** Language of the hyphenation patterns. Defaults to the top-level
   *  `locale`, else `'en-us'`. */
  locale?: LocaleTag;
  /** Also hyphenate ragged text — left, right or centre aligned — within
   *  the {@link zone}. Default `false`: only justified text is hyphenated.
   *  Applies to the body text, blockquotes, and the paragraph styles and
   *  callout bodies whose own hyphenation is on. */
  ragged?: boolean;
  /** Hyphenation zone for ragged text: a word that does not fit the line is
   *  hyphenated only when sending it whole to the next line would leave more
   *  than this much empty space at the end of the line. A wider zone gives
   *  fewer hyphens and a more ragged edge; `0` hyphenates wherever a word
   *  does not fit. `em` is relative to the text's own font size. Default
   *  `3em`. Ignored for justified text. Set line by line, no more than two
   *  lines in a row end on a syllable; broken with Knuth–Plass
   *  (`BodyTextConfig.optimalRagged`), two in a row cost what two hyphens in
   *  a row cost in justified text. */
  zone?: Dimension;
  /** Let the dictionary divide the words of a compound, a word with a
   *  hyphen between two letters ("af-ter-dinner"). Default `true`. `false`
   *  keeps such a word whole but for its own hyphen, where a line may still
   *  end ("after-" | "dinner"): TeX's rule, and the Chicago Manual's advice.
   *  A soft hyphen typed in the word still breaks, and a compound wider than
   *  the whole line is still divided where it must be. Applies wherever the
   *  body's hyphenation does: the running text, headings, lists, blockquotes
   *  and boxes; captions, notes, table cells and the contents keep dividing
   *  compounds. */
  compounds?: boolean;
  /** Words the dictionary must not divide, or may divide only where the
   *  entry says (#699), as in TeX's `\hyphenation{…}`. An entry is one word:
   *  written without a hyphen (`'Alice'`) it is never divided; written with
   *  hyphens (`'You-Tube'`) it is divided only at those points. It matches a
   *  run of letters inside a word as written, so `(Alice,` and `Alice’s`
   *  match `Alice` and a compound is matched part by part; an inflected form
   *  is another entry. An entry in lower case matches the word in any case
   *  (`'blender'` covers `Blender` and `BLENDER`); one with an initial
   *  capital matches only the occurrences that start with a capital, so
   *  `'Rose'` keeps the name whole and leaves `rose` to the dictionary. A
   *  soft hyphen typed in an occurrence still decides that occurrence, and a
   *  word wider than its whole measure is still divided. An entry wins over
   *  {@link minWordLength}, {@link leftMin} and {@link rightMin}. Applies
   *  wherever the dictionary runs: body, headings, lists, boxes, captions,
   *  table cells, notes, running heads and the other design text. Default
   *  none. */
  exceptions?: string[];
  /** The shortest word the dictionary divides, in letters. Unset: the
   *  language's own, 5 (4 in Catalan). */
  minWordLength?: number;
  /** Letters a divided word keeps at least before the break, on its line.
   *  Unset: the language's own (2 in most of the bundled languages). Breaks
   *  next to an apostrophe (`dell’ac-qua`) count the letters the same way. */
  leftMin?: number;
  /** Letters a divided word carries at least after the break, to the next
   *  line. Unset: the language's own (2 or 3, as its patterns have it). */
  rightMin?: number;
  /** Divide capitalised words like any other. Default `true`. `false`: the
   *  dictionary adds no break inside a run of letters that starts with a
   *  capital (`Alice`, `Ámsterdam`, `UNESCO`, the `Alembert` of
   *  `d’Alembert`), the first word of a sentence included: InDesign's
   *  "Hyphenate Capitalized Words" switched off, TeX's `\uchyph=0`. Of no
   *  use in German, which capitalises every noun: name the words in
   *  {@link exceptions}, or keep the cited authors whole with
   *  `citations.hyphenateNames`. An entry of `exceptions` with points still
   *  divides its word there. */
  capitalized?: boolean;
  /** Fewer hyphens or better word spacing, from 0 to 10: each step adds
   *  50 (the cost of one hyphen) to the penalty of every break that ends a
   *  line on a hyphen, the dictionary's or a word's own, so the line
   *  breaker divides a word only where that saves more word spacing. 0, the
   *  default, weighs hyphens as before. Knuth–Plass line breaking only
   *  (`bodyText.optimalLineBreaking`, and `optimalRagged` for ragged text). */
  fewerHyphens?: number;
  /** Hyphen ladders (#1466): more than {@link maxConsecutive} lines in a
   *  row of one paragraph that end on a hyphen. `'allow'` (the default)
   *  leaves the lines as the breaker sets them (two hyphens in a row
   *  already cost 3000 demerits there) and reports nothing. `'warn'` leaves
   *  them too and reports each ladder (a `hyphenLadder` content warning).
   *  `'avoid'` makes each line past the limit cost {@link ladderPenalty} in
   *  the line breaker, which sets the paragraph otherwise where the word
   *  spacing allows, and reports the ladders it kept. Knuth–Plass line
   *  breaking only. */
  ladders?: CompositionRule;
  /** Most lines in a row that may end on a hyphen before `ladders` counts
   *  them: 1 (the default) asks for no two hyphenated lines in a row, as
   *  Spanish typesetting does; 2 or 3 are the usual limits in English. */
  maxConsecutive?: number;
  /** Cost of each line past {@link maxConsecutive} under `ladders:
   *  'avoid'`, in demerits added to the paragraph's (the scale of
   *  `bodyText.stackPenalty`). Default 30000: more than resetting a few
   *  lines within the word-spacing limits costs, less than one line
   *  stretched past them. 0 weighs none. */
  ladderPenalty?: number;
  /** The last word of a paragraph divided (#1466): the line before the
   *  last ends on a hyphen and the last line holds nothing but the rest of
   *  that word (no word space). A last line with more words in it is not
   *  this fault, whatever the line above ends on; a short last line is a
   *  runt (`bodyText.avoidRunts`). `'allow'` (the default) / `'warn'` (a
   *  `lastWordDivided` content warning) / `'avoid'` (costs
   *  {@link lastWordPenalty} in the line breaker, and the ones kept are
   *  reported). Knuth–Plass line breaking only. */
  lastWord?: CompositionRule;
  /** Cost of the last word divided under `lastWord: 'avoid'`, in demerits.
   *  Default 30000. 0 weighs none. */
  lastWordPenalty?: number;
}

/** The limits of {@link HyphenationConfig} the dictionary applies (see
 *  `setHyphenationLimits`); unset ones keep the language's own. */
export interface HyphenationLimits {
  minWordLength?: number;
  leftMin?: number;
  rightMin?: number;
}

/** `HyphenationConfig` with every default filled in. */
export interface ResolvedHyphenationConfig {
  enabled: boolean;
  /** The bundled patterns actually used (see {@link LocaleTag}). */
  locale: HyphenationLocale;
  /** The BCP 47 tag {@link locale} was resolved from, when it is not itself
   *  a bundled id (`'es-ES'` → `'es'`, `'sv'` → `'en-us'`). The PDF backend
   *  declares it as the document language. */
  tag?: string;
  ragged: boolean;
  zone: Dimension;
  compounds: boolean;
  /** The words of `HyphenationConfig.exceptions`, trimmed, checked, without
   *  duplicates and sorted; absent when the document names none. */
  exceptions?: string[];
  /** {@link HyphenationConfig.minWordLength}, `leftMin`, `rightMin`: absent
   *  when unset (the language's own). */
  minWordLength?: number;
  leftMin?: number;
  rightMin?: number;
  capitalized: boolean;
  fewerHyphens: number;
  ladders: CompositionRule;
  maxConsecutive: number;
  ladderPenalty: number;
  lastWord: CompositionRule;
  lastWordPenalty: number;
}

/** `BodyTextConfig.kashida`. */
export type KashidaSetting = 'auto' | 'none';
/** `BodyTextConfig.kashidaPatterns`. */
export type KashidaPatterns = 'auto' | 'naskh' | 'simple' | 'nastaliq';

/** Kashida justification as resolved (see `BodyTextConfig.kashida`). */
export interface ResolvedKashidaConfig {
  patterns: KashidaPatterns;
  perWord: number;
  /** Longest elongation at one join, em. */
  maxLength: number;
}
