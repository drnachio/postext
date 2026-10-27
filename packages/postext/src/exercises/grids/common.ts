// Number formatting, letter size and ink shared by the grid exercises.
import type { ColorValue } from '../../types.js';
import type { ResolvedExerciseStyle } from '../../defaults/boxes/exercises.js';
import { dimPt } from '../expand.js';

export const r = (n: number): string => String(Math.round(n * 100) / 100);

/** The size of a grid's letters: the style's `grid.fontSize` (an `em` of
 *  the text), else `share` of the cell. */
export function letterSize(style: ResolvedExerciseStyle, bodySizePt: number, cell: number, share: number): number {
  return style.grid.fontSize ? dimPt(style.grid.fontSize, bodySizePt) : cell * share;
}
export const BLACK: ColorValue = { hex: '#000000', model: 'hex' };
