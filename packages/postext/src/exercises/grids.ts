/**
 * The exercises drawn on a grid (#1228): two columns with dots to join, a
 * word search, a crossword and operations in columns. Each is generated
 * here — seeded, so it is the same in every output — and drawn as a box
 * design (`designs.ts`). The teacher's edition draws the answers in place.
 */

import type { ContentBlock } from '../parse/index.js';
import type { DigitSystem, CalloutStyleConfig } from '../types.js';
import type { ResolvedExerciseStyle } from '../defaults/boxes/exercises.js';
import type { ExerciseModel } from './types.js';
import type { ExerciseSlot, ExerciseGridInfo } from './record.js';
import { type Run, runOf } from './text.js';
import { arithmeticBox } from './grids/arithmetic.js';
import { crosswordBox } from './grids/crossword.js';
import { matchBox } from './grids/match.js';
import { wordSearchBox } from './grids/wordSearch.js';

export interface GridBoxInput {
  kind: 'match' | 'wordsearch' | 'crossword' | 'arithmetic';
  id: string;
  style: ResolvedExerciseStyle;
  bodySizePt: number;
  lineHeightPt: number;
  measurePt: number;
  teacher?: boolean;
  seed?: number;
  exercise?: ExerciseModel;
  blocks?: readonly ContentBlock[];
  /** Match: the left items, the right column in printed order, the right
   *  position each left item joins (a teacher's edition) and the labels. */
  left?: string[];
  right?: string[];
  links?: number[];
  labels?: string[];
  /** A right-to-left page: the engine mirrors the drawing. */
  rtl?: boolean;
  /** The text's font family, for the letters drawn. */
  font?: string;
  /** The words of the document language (a crossword's clue headings),
   *  and what separates two entries of a list (`, `, `، `, `、`). */
  words?: { across: string; down: string; comma?: string };
  /** The document's digits, when they are not the European ones. */
  digits?: DigitSystem;
  /** A number in the document's digits (a crossword's cells and clues). */
  num?: (n: number) => string;
}

export type GridBox = CalloutStyleConfig & {
  slots?: ExerciseSlot[];
  key?: string[];
  clues?: Array<{ label: string; clue?: Run; heading?: boolean }>;
  words?: string[];
  info?: Omit<ExerciseGridInfo, 'box'>;
  /** Words a crossword or word search could not place. */
  unplaced?: string[];
};

export function gridBox(input: GridBoxInput): GridBox {
  switch (input.kind) {
    case 'match': return matchBox(input);
    case 'wordsearch': return wordSearchBox(input);
    case 'crossword': return crosswordBox(input);
    case 'arithmetic': return arithmeticBox(input);
  }
}

/** The plain text of a block (for keys). */
export function blockText(b: ContentBlock): string {
  return runOf(b).text;
}
