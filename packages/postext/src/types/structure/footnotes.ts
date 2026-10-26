import type { NumberFormatStyle } from '../../numerals/numbering.js';
import type { CjkWordBreak } from '../text/cjk.js';
import type { TextAlign, TextAlignKeyword } from '../text/locale.js';
import type { ColorValue, Dimension } from '../page.js';

/** Where footnotes (`[^id]` markers) are set:
 *  - `'column'`: at the foot of the column that holds the line citing the
 *    note, under a separator rule, above the column's bottom float band. In
 *    a one-column layout that is the foot of the page;
 *  - `'chapterEnd'`: every note of the chapter after its last block;
 *  - `'spread'`: sidenotes (傍注) of a vertical book (JLReq §4.2.6): the
 *    notes cited on both pages of a spread are set at the fore-edge end of
 *    its odd page (the left page of a right-bound book: the foot of the
 *    flow, after its last line), under a rule. A note that does not fit
 *    there stays on the even page, at its own fore-edge end; one cited too
 *    late on the odd page goes, with its line, to the next spread. In a
 *    horizontal document the notes are set as `'column'` notes and a
 *    configuration warning (`footnoteSpreadHorizontal`) says so. */
export type FootnotePlacement = 'column' | 'chapterEnd' | 'spread';

/** When the note numbers start again at 1: at each chapter (every level-1
 *  heading, and the start of each document of a book), never within the
 *  document, on every page (`'page'`, the usual
 *  页下注 of a Chinese book), in every column (`'column'`, for books that
 *  set their notes column by column) or on every spread (`'spread'`, the
 *  sidenotes of a Japanese book). `'page'`, `'column'` and `'spread'`
 *  count the notes where the layout sets them, so they apply to notes at
 *  the column foot or on the spread only: with `placement: 'chapterEnd'`
 *  they number by chapter. */
export type FootnoteNumbering = 'chapter' | 'document' | 'page' | 'column' | 'spread';

/** How footnote numbers are written: a numeral style, or `'symbols'`
 *  (* † ‡ § ‖ ¶, then doubled; see {@link FootnotesConfig.symbols}). */
export type FootnoteNumberFormat = NumberFormatStyle | 'symbols';

/** How the marker in the text is set:
 *  - `'superscript'`: raised and reduced, as a superscript (`text¹`);
 *  - `'inline'`: on the baseline at `markerSize` (`text①`), centred in its
 *    cell in vertical text — how Chinese books set circled markers;
 *  - `'side'`: the interlinear marker of Japanese books (合印, JLReq
 *    §4.2.3): small (`markerSize`, default 0.6 em) in the line gap beside
 *    the word it marks, on the side ruby takes (right of a vertical line,
 *    over a horizontal one), its end flush with the end of the word's last
 *    character. It takes no room in the line, and the leading must hold it
 *    as it holds ruby;
 *  - `'right'`: the inline marker of Japanese vertical text (行右小書き):
 *    reduced (`markerSize`, default 0.7 em) and set flush with the right
 *    side of the line, taking its advance. In horizontal text it is a
 *    superscript;
 *  - `'auto'`: inline for `circled-decimal` numbers, else superscript. */
export type FootnoteMarkerPosition = 'auto' | 'superscript' | 'inline' | 'side' | 'right';

/** The rule set between the text and the notes of a column. */
export interface FootnoteSeparatorConfig {
  /** Draw the rule. Default `true`. With `false` the space stays. */
  enabled?: boolean;
  /** Length of the rule as a fraction of the column width (0–1). Default
   *  `0.3`. */
  width?: number;
  /** Thickness. Default `0.5pt`. */
  lineWidth?: Dimension;
  /** Rule colour. Defaults to the notes' text colour. */
  color?: ColorValue;
}

export interface ResolvedFootnoteSeparatorConfig {
  enabled: boolean;
  width: number;
  lineWidth: Dimension;
  color?: ColorValue;
}

/** Footnotes. A Japanese document (`locale: 'ja'`) resolves the fields it
 *  leaves unset after JLReq §4.2: a vertical one sets endnotes after each
 *  chapter (後注: `placement: 'chapterEnd'`, numbered by chapter) with
 *  `（1）` markers at the right of the line (`markerPosition: 'right'`,
 *  `markerTemplate: '（{n}）'`, the digits upright by `cjk.uprightDigits`),
 *  the notes hung 2 note-ems with a full em after the number; a
 *  horizontal one sets them at the column foot numbered per page, with
 *  superscript markers and a rule ⅓ of the measure. `placement: 'spread'`
 *  numbers per spread unless `numbering` says otherwise. Every other
 *  document resolves the defaults given on each field. */
export interface FootnotesConfig {
  /** Default `'column'`. */
  placement?: FootnotePlacement;
  /** Default `'chapter'` (`'spread'` with `placement: 'spread'`). */
  numbering?: FootnoteNumbering;
  /** How the numbers are written, in any spelling of a number format
   *  (`decimal`, `lower-roman`, `circled-decimal` / `①`, `cjk-decimal`…, see
   *  `parseNumberFormat`). Default `'decimal'`. `circled-decimal` writes
   *  numbers past 50 in decimal. `'symbols'` (or `'*'`) marks the notes
   *  with reference symbols, {@link symbols} in turn: * † ‡ § ‖ ¶, then
   *  doubled (** †† …), tripled… (#538); its notes are counted again on
   *  every page unless `numbering` says otherwise. */
  numberFormat?: string;
  /** The sequence `numberFormat: 'symbols'` writes, doubled and then
   *  tripled once it runs out. Default `['*', '†', '‡', '§', '‖', '¶']`.
   *  The Latin files of Google Fonts / Fontsource carry * † § ¶ but not
   *  ‡ or ‖: with such a face, leave those two out or set the notes in a
   *  face that has them. Empty strings are dropped; an empty list keeps
   *  the default. */
  symbols?: string[];
  /** Default `'auto'` (see {@link FootnoteMarkerPosition}). The number
   *  that opens the note itself follows it too: raised, or set at the size
   *  of the note text. */
  markerPosition?: FootnoteMarkerPosition;
  /** Size of an inline, side or right marker in the text, `em` of the
   *  text around it. Default `1em` (`0.6em` for a side marker, `0.7em` for
   *  a right one). No effect on a superscript marker. */
  markerSize?: Dimension;
  /** How a note's number is written, `{n}` standing for it in its number
   *  format and the document's digits: `'({n})'` sets the parentheses of
   *  Arabic books, «(١)» (#376). It writes the marker in the text and the
   *  number that opens the note alike. Default `'{n}'`; a template
   *  without `{n}` is read as the default. */
  markerTemplate?: string;
  /** Where the number that opens the note itself stands: raised
   *  (`'superscript'`) or on the baseline at the note's size
   *  (`'inline'`). Default `'auto'`: as the marker in the text
   *  ({@link markerPosition}). Arabic books raise the marker in the text
   *  and set the note's own «(١)» on the line. */
  noteNumberPosition?: FootnoteMarkerPosition;
  /** `'chapterEnd'` placement: where the notes stand in the columns that
   *  close the chapter. `'foot'` sets them at the foot of the column, the
   *  room left over staying between the text and them (as notes at the
   *  column foot stand); `'text'` sets them right under the text. Default
   *  `'foot'`. */
  chapterEndAlign?: 'foot' | 'text';
  /** Size of the note text. Default `0.8em` of the body size. `em` / `rem`
   *  are relative to the body size. */
  fontSize?: Dimension;
  /** Leading of the note text; `em` / `rem` relative to the note size.
   *  Default `1.25em`. */
  lineHeight?: Dimension;
  /** Note text colour. Defaults to the body colour. */
  color?: ColorValue;
  /** Alignment of the note text. Defaults to the body alignment. */
  textAlign?: TextAlignKeyword;
  /** How the notes break their lines between Chinese, Japanese and Korean
   *  characters (#705). Unset: the document's `cjk.wordBreak`, as on a
   *  paragraph style. `'keep-all'` keeps a run of such characters whole, so
   *  a book whose body breaks between any two characters can keep the
   *  short quotations of its Latin notes whole without word joiners;
   *  `'normal'` breaks the notes of a `keep-all` document between
   *  characters. Notes at the foot of the column, at the end of the
   *  chapter and beside a spread take it. */
  wordBreak?: CjkWordBreak;
  /** Indent of the turnover lines of a note, so they align past its
   *  number. Default `0` (the lines run flush under the number). */
  hangingIndent?: Dimension;
  /** The space between a note's number and its text: an en space (`'en'`,
   *  the default) or a full em of the note size (`'em'`, an ideographic
   *  space in CJK text: JLReq §4.2.4 sets one note-em after the number).
   *  It never stretches or breaks. */
  numberGap?: 'en' | 'em';
  /** Space between two notes. Default `0`. */
  spaceBetween?: Dimension;
  /** Space between the last line of text and the separator rule (or the
   *  first note without a rule). Default `0.5em` of the body size. The
   *  rule sits in the middle of `spaceAbove` + `spaceBelowRule`. */
  spaceAbove?: Dimension;
  /** Space between the rule and the first note. Default `0.4em`. */
  spaceBelowRule?: Dimension;
  separator?: FootnoteSeparatorConfig;
}

export interface ResolvedFootnotesConfig {
  placement: FootnotePlacement;
  numbering: FootnoteNumbering;
  numberFormat: FootnoteNumberFormat;
  /** Set when it is not the default sequence (see
   *  {@link FootnotesConfig.symbols}). */
  symbols?: string[];
  /** `'auto'` resolved against the number format. */
  markerPosition: 'superscript' | 'inline' | 'side' | 'right';
  markerSize: Dimension;
  /** Set when it is not `'{n}'` (and holds `{n}`). */
  markerTemplate?: string;
  /** Set when it is not `'auto'`: the note's own number then stands so,
   *  whatever {@link markerPosition} is. */
  noteNumberPosition?: 'superscript' | 'inline';
  chapterEndAlign: 'foot' | 'text';
  fontSize: Dimension;
  lineHeight: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  /** Set only when the notes take a rule of their own. */
  wordBreak?: CjkWordBreak;
  hangingIndent: Dimension;
  /** Set when it is `'em'`. */
  numberGap?: 'em';
  spaceBetween: Dimension;
  spaceAbove: Dimension;
  spaceBelowRule: Dimension;
  separator: ResolvedFootnoteSeparatorConfig;
}
