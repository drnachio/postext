import type { ColorValue, Dimension } from '../page.js';

/** How a turnover of verse is set (#620): `'hang'` on a line of its own,
 *  indented from the line's start; `'right'` flush with the end side,
 *  behind an opening bracket (`turnoverMark`), the custom of English and
 *  Spanish editions of poetry. */
export type VerseTurnover = 'hang' | 'right';

/** The defaults of `:::verse` poems (#620). A poem's fence names any of
 *  them for itself (`:::verse{indentStep=1em turnover=right}`). */
export interface VerseConfig {
  /** How a poem whose fence names no `layout` is set. `'auto'` (default):
   *  as bayts (#378) when a line carries a hemistich separator (`||`, a
   *  spaced `\\`), line by line otherwise. `'bayt'`: as bayts always, a
   *  poem with no separator as centred single hemistichs, as postext 1.22
   *  set it (configurations stored before #620 are read with it when they
   *  hold such a poem). */
  layout?: 'auto' | 'bayt';
  /** The width of one leading space of a line of verse (a tab counts four,
   *  an ideographic space two); `em` is the poem's size. Default `0.5em`:
   *  two spaces indent a line one em. */
  indentStep?: Dimension;
  /** How a line wider than the measure turns over. Default `'hang'`. */
  turnover?: VerseTurnover;
  /** The indent of a hanging turnover, from its line's own start, when
   *  the poem's paragraph style sets no `hangingIndent`; `em` is the
   *  poem's size. Default `2em`. */
  hang?: Dimension;
  /** The mark before a turnover set flush right (`turnover: 'right'`).
   *  Default `[`. */
  turnoverMark?: string;
  /** The space between two stanzas, in lines of the poem's leading. On
   *  the baseline grid it comes out a whole number of grid lines (a
   *  paragraph style with `snapToGrid: false` keeps it exact). Default
   *  `1`. */
  stanzaSpace?: number;
  /** Keep any stanza of this many lines of verse or fewer whole in one
   *  column (a haiku, a tanka): it moves on whole when it does not fit.
   *  Default `0`, off. */
  keepStanzas?: number;
  /** A line of verse a little wider than the measure tightens its word
   *  spaces, down to `bodyText.minWordSpacing` of their natural width, and
   *  stays on one line; only a line that does not fit even then turns
   *  over. `false`: every line wider than the measure turns over, as
   *  postext 1.23 set them (configurations stored by 1.23 are read with it
   *  when they hold a poem set line by line). Default `true`. */
  tighten?: boolean;
}

export interface ResolvedVerseConfig {
  layout: 'auto' | 'bayt';
  indentStep: Dimension;
  turnover: VerseTurnover;
  hang: Dimension;
  turnoverMark: string;
  stanzaSpace: number;
  keepStanzas: number;
  tighten: boolean;
}

/** What `lineNumbers` counts (#621): `'verse'`, the lines of `:::verse`
 *  poems (a turnover takes no number); `'all'`, every laid-out line of the
 *  body text — paragraphs, list items, quotations and verse. */
export type LineNumbersCount = 'verse' | 'all';
/** Where the line count starts again (#621): never (`'document'`, which
 *  runs on through the chapters of a book), at every level-1 heading
 *  (`'chapter'`), at every level-1 or level-2 heading (`'section'`), on
 *  every page (`'page'`) or at every `:::verse` poem (`'poem'`). */
export type LineNumbersRestart = 'document' | 'chapter' | 'section' | 'page' | 'poem';
/** The side of the text the numbers stand on (#621): the outer margin
 *  (away from the spine: right on a recto, left on a verso), the inner
 *  one, the physical `'left'` or `'right'`, the start or end side of the
 *  document's direction (`'start'` is the right of a right-to-left
 *  book), or the side column of a one-and-a-half layout (`'side'`, set
 *  flush with its edge next to the text). */
export type LineNumbersPosition = 'outer' | 'inner' | 'left' | 'right' | 'start' | 'end' | 'side';
/** Where the numbers of a page of two or more text columns go (#621):
 *  beside every column on the {@link LineNumbersPosition} side (`'each'`),
 *  in the gutters (`'gutter'`: the first column's on its right, the
 *  others' on their left) or on the outer edges of the first and last
 *  columns (`'outer-edges'`, columns between them as `'each'`). */
export type LineNumbersMultiColumn = 'each' | 'gutter' | 'outer-edges';

/** Line numbers in the margin (#621): every Nth line of the text gets its
 *  number beside it, as critical editions, poetry, legal texts and
 *  line-referenced school texts print them. The numbers are painted on
 *  the line's baseline and never move a line. Off unless `enabled`. */
export interface LineNumbersConfig {
  /** Default `false`. */
  enabled?: boolean;
  /** What is counted. Default `'verse'`. */
  count?: LineNumbersCount;
  /** Print the number of every Nth line (the multiples of N). Default
   *  `5`; a `:::verse` fence sets its own with `interval=N`. */
  interval?: number;
  /** Also print the number of the first line after each restart. Default
   *  `false`. */
  numberFirst?: boolean;
  /** Where the count starts again. Default `'poem'` when {@link count} is
   *  `'verse'`, `'page'` when it is `'all'`. `:::numbering{lines=N}`
   *  restarts it anywhere. */
  restart?: LineNumbersRestart;
  /** The number of the first line after a restart. Default `1`. */
  startAt?: number;
  /** Default `'outer'`. */
  position?: LineNumbersPosition;
  /** Pages of two or more text columns. Default `'outer-edges'`. */
  multiColumn?: LineNumbersMultiColumn;
  /** The distance from the column's edge to the number; `em` is the
   *  number's size. Default `1em`. Not used with `position: 'side'`, where
   *  the number stands flush with the side column's edge. */
  gap?: Dimension;
  /** How a number aligns: `'auto'` flush toward the text (right-aligned
   *  in a left margin, left-aligned in a right one), `'left'` or
   *  `'right'` within the width of the widest number of the page. Default
   *  `'auto'`. */
  align?: 'auto' | 'left' | 'right';
  /** Default: the body font family. */
  fontFamily?: string;
  /** Default: 0.8 of the body font size. */
  fontSize?: Dimension;
  /** Default: the body font weight. */
  fontWeight?: number;
  /** Default `false`. */
  italic?: boolean;
  /** Default: the body text colour. A palette-linked colour follows part
   *  and section palettes. */
  color?: ColorValue;
  /** The numbering format, in any spelling a list or a page number takes
   *  (`decimal`, `lower-roman`, `arabic-indic`, `一`…). Default decimal,
   *  in the document's digits (`numerals`). */
  format?: string;
}

export interface ResolvedLineNumbersConfig {
  enabled: boolean;
  count: LineNumbersCount;
  interval: number;
  numberFirst: boolean;
  restart: LineNumbersRestart;
  startAt: number;
  position: LineNumbersPosition;
  multiColumn: LineNumbersMultiColumn;
  gap: Dimension;
  align: 'auto' | 'left' | 'right';
  fontFamily: string;
  fontSize: Dimension;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  /** As written; unset for decimal. */
  format?: string;
}
