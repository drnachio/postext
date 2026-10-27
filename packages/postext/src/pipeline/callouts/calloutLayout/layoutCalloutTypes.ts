// Types of layoutCallout its modules share (#1276).
import type { VDTBlock } from '../../../vdt.js';
import type { CalloutUnit } from './inputs.js';

/** Stacking state shared by the box and each columns group. */
export interface Stack {
  cursorY: number;
  prevMarginBottom: number;
  /** `prevMarginBottom` comes from a negative `:::paragraphs` margin: it
   *  applies as it is instead of collapsing with the next block's top
   *  margin of zero. */
  pull: boolean;
  prevWasListItem: boolean;
  /** The list item placed last, when `prevWasListItem`: its item spacing
   *  and depth, for the space before the next item (EF-165). */
  prevListItem?: { spacingPx: number; depth: number };
  first: boolean;
  /** A `:::space` before the first child counts (see `addSpace`). */
  keepLeadingSpace: boolean;
}

/** A stacked item of a `:::columns` group: a child block, or a nested
 *  box's blocks (frame first), with the child's position and the lines
 *  of it set before (a paragraph the fragment opens inside of). */
export interface GroupItem { blocks: VDTBlock[]; unit: CalloutUnit; k: number; lineBase: number }

/** A column start in a group's stack: before item `block`, or past its
 *  first `line` lines, at `y` in the stack. */
export interface ColumnCut { y: number; block: number; line: number }
