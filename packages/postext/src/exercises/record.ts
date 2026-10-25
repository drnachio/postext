/**
 * What an exercise leaves for the digital outputs (#1230): its slots — the
 * places it is answered on the page — and what each accepts, its key, its
 * worked solution and hints as text. The layout carries one record per
 * exercise laid out (`VDTDocument.exercises`); the HTML and EPUB outputs
 * write them into the page for the exercise script.
 */

import type { ExerciseKind } from './types.js';

/** How a slot is answered. */
export type ExerciseSlotKind =
  /** Typed into a blank; `accept` lists the right answers. */
  | 'gap'
  /** One option (or several, `multiple`) of `options` ticked; `correct`
   *  are the right ones, 1-based in printed order. Its options are the
   *  slots `<key>o<n>`. */
  | 'choice'
  /** A statement: `correct` is `[1]` when true, `[2]` when false; its
   *  boxes the slots `<key>t` and `<key>f` (or itself, typed, in the
   *  bracket look). */
  | 'truefalse'
  /** A word to mark; `correct` `[1]` (a word of the text not to mark has
   *  no slot). */
  | 'mark'
  /** A left item of a match: `correct` is the 1-based printed position of
   *  its partner in the right column; in the letters look, `accept` its
   *  printed label. */
  | 'pair'
  /** An item to number (order): `accept` is its rank. */
  | 'rank'
  /** A word of a sort exercise's bank: `accept` is its category. */
  | 'category'
  /** Text written on an area (open, scramble, sort): `accept` the model
   *  answers, which an open question only shows. */
  | 'text'
  /** A cell of a grid (crossword, operation): `accept` its character. */
  | 'cell'
  /** A word to find in a word search: `accept` its cells, `r,c` each. */
  | 'word';

export interface ExerciseSlot {
  key: string;
  kind: ExerciseSlotKind;
  accept?: string[];
  correct?: number[];
  options?: number;
  multiple?: boolean;
  /** The container id of the drawn box the slot stands on (an area, a
   *  grid): the digital outputs find its frame by it. */
  box?: number;
  /** A cell's place in its grid: row and column from 0. */
  cell?: [number, number];
  /** A writing area's line spacing, points. */
  linePt?: number;
  /** An exercise whose fence says `area=none`: nothing to write (a question
   *  talked over), so no text area on a screen. A style's `area.kind:
   *  'none'` is only an area drawn bare, still written on. */
  bare?: true;
}

/** A grid's geometry, for the digital outputs to place its cells. */
export interface ExerciseGridInfo {
  box: number;
  kind: 'match' | 'wordsearch' | 'crossword' | 'arithmetic';
  rows: number;
  cols: number;
  /** A cell's side over the box's width (the grid starts at the box's top
   *  left, in the flow's direction: its top right on a right-to-left page). */
  cellPt: number;
  /** The grid's left and top inside its box, points. */
  xPt: number;
  yPt: number;
  /** Match: the middle of each row, points from the box's top, and the
   *  left and right dots' x. */
  rowsPt?: number[];
  dotsPt?: [number, number];
  /** A right-to-left page, which paints the grid mirrored (#1244): `xPt`,
   *  the dots' x and the cells' columns are counted from the box's right
   *  edge. */
  rtl?: true;
}

export interface ExerciseRecord {
  /** The fence's container id (the box's `containerId` in the layout). */
  id: number;
  ordinal: number;
  number: string;
  kind: ExerciseKind;
  style: string;
  slots: ExerciseSlot[];
  /** The key as one line of text. */
  key: string;
  /** The worked solution's paragraphs, as text. */
  solution?: string[];
  hints?: string[];
  /** The fence's `{#id}`. */
  anchor?: string;
  /** What a reference to it prints ("Exercise 3"). */
  anchorText?: string;
  /** The fence's `title`. */
  title?: string;
  /** A mark exercise's `mark` (`circle`, `underline`…). */
  mark?: string;
  grids?: ExerciseGridInfo[];
}
