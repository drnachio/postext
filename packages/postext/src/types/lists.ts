import type { ArabicNumeralStyle, EastAsianNumeralStyle } from '../numbering.js';
import type { ColorValue, Dimension } from './page.js';

export interface UnorderedListLevelConfig {
  level: number;
  bulletChar?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. Accepts negative values. */
  verticalOffset?: Dimension;
}

export interface ResolvedUnorderedListLevelConfig {
  level: number;
  bulletChar: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. When undefined, the renderer cascades:
   *  level 1 → general indent; level N>1 → previous level's text-start (indent + bullet width + gap). */
  indent?: Dimension;
  verticalOffset: Dimension;
}

export interface UnorderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  bulletChar?: string;
  bulletFontSize?: Dimension;
  gap?: Dimension;
  /** Base indent step — level N defaults to `indent * N` unless the level overrides `indent`. Use 0 to pin bullets to the column edge. */
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. */
  bulletVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  /** Round the space above the list up so its first item sits on the
   *  baseline grid, as the text after a heading does; `marginTop` is then a
   *  minimum. The list's end snaps the flow back onto the grid either way;
   *  this snaps its start too, so with no `itemSpacing` every item lines up
   *  with the text in the column beside it. Lists in callout boxes, whose
   *  interiors are off the grid, are left alone. Default false (1.4 set the
   *  top margin exactly, so a margin that is not a whole number of lines
   *  left the items off the grid until the list ended). */
  snapTopToGrid?: boolean;
  hangingIndent?: boolean;
  levels?: UnorderedListLevelConfig[];
  /** GFM task list rendering. The bullet glyph is replaced with a checkbox.
   *  The default characters, ☐ for an open item and ☑ for a done one, are
   *  not set as text: the engine draws the box, and its tick, itself
   *  (#765; see `taskBox`). A character of the author's own (`✗`, `[ ]`)
   *  is set as text in the level's face, which then has to hold it. */
  taskCheckboxChar?: string;
  taskCheckedChar?: string;
  /**
   * How the default box of a task item is set (#765). `'drawn'` (default):
   * the engine draws a square outline, with a tick when the item is done.
   * Its side is 0.6 em of the marker's size (the level's `fontSize`), and
   * that is the room it takes before the list's `gap`; it is centred where
   * a bullet is, so at the text's size it stands on the first line's
   * baseline; its stroke follows the level's `fontWeight` and its colour
   * the level's `color`. No font is asked for it, so it is the same on
   * every machine, on the canvas, in the PDF, in the HTML and in the EPUB;
   * assistive technology reads ☐ or ☑. `'character'`: ☐ and ☑ are set as
   * text in the level's face, as up to postext 1.28: a face that lacks
   * them leaves the browser to pick a font of the system, and the item's
   * text starts after the width that font gives. A configuration stored
   * before version 13 reads with `'character'`
   * (`pinLegacyTaskBox`). A character of the author's own is text either
   * way.
   */
  taskBox?: 'drawn' | 'character';
  taskCompletedStrikethrough?: boolean;
  /** Optional color for the text of completed tasks. When undefined, body color is used. */
  taskCompletedColor?: ColorValue;
}

export interface ResolvedUnorderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  bulletChar: string;
  bulletFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  bulletVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  snapTopToGrid: boolean;
  hangingIndent: boolean;
  levels: ResolvedUnorderedListLevelConfig[];
  taskCheckboxChar: string;
  taskCheckedChar: string;
  /** Present only when the default box is set as a character
   *  (`'character'`); absent when the engine draws it. */
  taskBox?: 'character';
  taskCompletedStrikethrough: boolean;
  /** Undefined => inherit body text color at render time. */
  taskCompletedColor?: ColorValue;
}

export type OrderedListNumberFormat =
  | 'arabic'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | EastAsianNumeralStyle
  | ArabicNumeralStyle;

export interface OrderedListLevelConfig {
  level: number;
  /** Number style of this level (see `OrderedListsConfig.numberFormat`). */
  numberFormat?: OrderedListNumberFormat;
  /** Text before this level's number (see `OrderedListsConfig.prefix`). */
  prefix?: string;
  separator?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  verticalOffset?: Dimension;
  /** Separator run styling for this level; each field inherits the level's
   *  number style (or the list-wide separator setting) when unset. */
  separatorFontFamily?: string;
  separatorFontWeight?: number;
  separatorItalic?: boolean;
  separatorColor?: ColorValue;
  separatorGap?: Dimension;
}

export interface ResolvedOrderedListLevelConfig {
  level: number;
  numberFormat: OrderedListNumberFormat;
  prefix: string;
  separator: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. Undefined => pipeline cascades. */
  indent?: Dimension;
  verticalOffset: Dimension;
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}

export interface OrderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  /** Number style. Default `'arabic'`. The page and resource spellings of a
   *  format are read too (`'decimal'`, `'roman-lower'`, `'i'`…, see
   *  `parseNumberFormat`) and resolve to the list spelling; an unknown
   *  value numbers in arabic and is reported by `collectConfigWarnings`. */
  numberFormat?: OrderedListNumberFormat;
  /** Text set before the number, styled like the separator: with
   *  `prefix: '（'` and `separator: '）'` a Chinese list reads （一）（二）.
   *  Default `''`. A level may set its own. */
  prefix?: string;
  separator?: string;
  numberFontSize?: Dimension;
  gap?: Dimension;
  indent?: Dimension;
  numberVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  /** Round the space above the list up so its first item sits on the
   *  baseline grid (see `UnorderedListsConfig.snapTopToGrid`). Default
   *  false. */
  snapTopToGrid?: boolean;
  /** How wide the number column of an item is, which sets where its text
   *  starts (numbers are set flush right in it):
   *  - `'run'` (default): the widest number of the item's own run, the
   *    items of one depth with nothing but deeper items between them. A
   *    list broken by a figure, a paragraph or a box starts a new run, so
   *    `ii)` after a table can start its text further right than `i)`
   *    before it;
   *  - `'level'`: the widest number at the item's depth in the whole
   *    document (the chapter, in a book), so every list and every part of
   *    an interrupted one starts its text at the same place, as the
   *    indents of the deeper levels already do;
   *  - `'item'` (#722): the item's own number, so the text of each item
   *    starts one `gap` after its own label and 第九條 and 第十一條 are
   *    each followed by the same space, their texts starting at different
   *    places (the articles of a law in the Japanese Official Gazette).
   *    Turnover lines follow `hangingIndent`: `false` returns them to the
   *    list's indent, `true` hangs them under the item's own text. The
   *    indent of a deeper level stays one value per level. */
  numberWidth?: OrderedListNumberWidth;
  /** How a number sits in its column (#682):
   *  - `'end'` (default): against the text, so `9.` and `10.` end
   *    together;
   *  - `'start'`: at the start of the column (the left on a left-to-right
   *    page, the right on a right-to-left one, the head of the line in
   *    vertical text), so 第九條 and 第十一條 begin together. The column
   *    keeps its width ({@link numberWidth}): the text of the items still
   *    starts at one place.
   *
   *  Under `numberWidth: 'item'` the column is the number itself, so the
   *  two values set the same list. */
  numberAlign?: OrderedListNumberAlign;
  hangingIndent?: boolean;
  levels?: OrderedListLevelConfig[];
  /** Font family of the separator run. Inherits the number's `fontFamily`. */
  separatorFontFamily?: string;
  /** Weight of the separator run. Inherits the number's `fontWeight`. */
  separatorFontWeight?: number;
  /** Italic separator run. Inherits the number's `italic`. */
  separatorItalic?: boolean;
  /** Colour of the separator run. Inherits the number's `color`. */
  separatorColor?: ColorValue;
  /** Space between the number and the separator. Default `0em`. */
  separatorGap?: Dimension;
}

/** The number column of an ordered list item
 *  (`OrderedListsConfig.numberWidth`). */
export type OrderedListNumberWidth = 'run' | 'level' | 'item';

/** Where a number stands in the number column of an ordered list
 *  (`OrderedListsConfig.numberAlign`). */
export type OrderedListNumberAlign = 'end' | 'start';

export interface ResolvedOrderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  numberFormat: OrderedListNumberFormat;
  prefix: string;
  separator: string;
  numberFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  numberVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  snapTopToGrid: boolean;
  numberWidth: OrderedListNumberWidth;
  numberAlign: OrderedListNumberAlign;
  hangingIndent: boolean;
  levels: ResolvedOrderedListLevelConfig[];
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}
