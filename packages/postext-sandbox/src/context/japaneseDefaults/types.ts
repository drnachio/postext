// The rows of the Japanese defaults list, the two kinds of book and the
// options and result of `japaneseDefaults` (#1276: split out of
// japaneseDefaults.ts).
import type { CjkConfig, Dimension, TextAlign, WritingMode, ResolvedFootnotesConfig, FootnoteNumbering, PostextConfig } from 'postext';

/** One row of the review list, in the order the list shows them. */
export type JapaneseDefaultId =
  | 'locale'
  | 'writingMode'
  | 'binding'
  | 'bodyFont'
  | 'headingFont'
  | 'designFonts'
  | 'lineHeight'
  | 'grid'
  | 'firstLineIndent'
  | 'indentAfterHeading'
  | 'paragraphSpacing'
  | 'textAlign'
  | 'hyphenation'
  | 'cjkRules'
  | 'resourceTypes'
  | 'captionLabel'
  | 'chapterNumbering'
  | 'headingLayout'
  | 'listNumbers'
  | 'footnotes'
  | 'folio';

/** The two kinds of book the list sets up: vertical (縦組, a bunko or
 *  tankōbon novel) and horizontal (横組, a technical book). */
export type JapaneseBook = 'vertical' | 'horizontal';

/** The `cjk` settings the `cjkRules` row returns to Auto (the japan
 *  region's values), in the order the East Asian typography section shows
 *  them. */
export const JAPANESE_RULE_FIELDS = [
  'region',
  'lineBreak',
  'punctuationWidth',
  'compressAdjacent',
  'trimLineStart',
  'hangingPunctuation',
  'paragraphStartBracket',
  'latinSpacingEdge',
  'spaceAfterQuestion',
  'emphasis',
  'emphasisMark',
  'bookTitleMark',
  'bookTitleBrackets',
] as const satisfies readonly (keyof CjkConfig)[];
export type JapaneseRuleField = (typeof JAPANESE_RULE_FIELDS)[number];

/** A value as the review list shows it. Words the interface translates
 *  (on/off, alignments, directions, language names, setting names) stay
 *  typed; the rest is text shown as written (typefaces, samples such as
 *  第一章, 42字 × 16行). */
export type JapaneseDefaultValue =
  | { kind: 'locale'; tag: string }
  | { kind: 'text'; text: string }
  | { kind: 'switch'; on: boolean }
  | { kind: 'dimension'; value: Dimension }
  | { kind: 'align'; value: TextAlign }
  | { kind: 'writingMode'; value: WritingMode; binding: 'left' | 'right' }
  | { kind: 'binding'; value: 'left' | 'right'; auto?: boolean }
  | { kind: 'footnotes'; marker: string; position: ResolvedFootnotesConfig['markerPosition']; numbering: FootnoteNumbering }
  /** Settings the row names (by their `cjk` keys). */
  | { kind: 'cjkFields'; fields: JapaneseRuleField[] }
  /** Auto, which in a Japanese book follows the japan region. */
  | { kind: 'japanAuto' }
  /** Headings spaced by their margins (no 行取り, no 字下げ). */
  | { kind: 'headingMargins' }
  | { kind: 'none' };

export interface JapaneseDefaultChange {
  id: JapaneseDefaultId;
  from: JapaneseDefaultValue;
  to: JapaneseDefaultValue;
  /** The author set this to a value of their own (neither the engine's
   *  default nor a Japanese default of either kind of book, nor a Chinese
   *  default): unticked unless `include` names it. */
  customised: boolean;
  /** Part of the language and direction chosen (or, for hyphenation,
   *  something the language switches off by itself): always applied. */
  required: boolean;
  /** Whether `config` carries it. */
  applied: boolean;
}

export interface JapaneseDefaultsOptions {
  /** Default `'vertical'`. */
  book?: JapaneseBook;
  /** The optional rows to apply. Unset: every row the author has not
   *  customised. Required rows apply whatever it says. */
  include?: Iterable<JapaneseDefaultId>;
  /** The language of a document that names none (the interface's). */
  fallbackLocale?: string;
  /** The Fontsource subsets of a family (`japanese`, `latin`…), as the
   *  font picker lists them; undefined for a family it does not know (an
   *  uploaded face). Decides which design texts are set in a face with no
   *  kana. Without it only the engine's own design faces (Open Sans, EB
   *  Garamond) count as lacking them. */
  fontSubsets?: (family: string) => readonly string[] | undefined;
}

export interface JapaneseDefaultsResult {
  /** The document language the book gets. */
  locale: string;
  changes: JapaneseDefaultChange[];
  config: PostextConfig;
}
