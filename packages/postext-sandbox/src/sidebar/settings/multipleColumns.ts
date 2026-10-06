import type { LayoutType } from 'postext';

/** The fewest and most columns of a `multiple` layout, as the engine clamps
 *  `layout.columnCount` (its `MULTIPLE_COLUMNS_MIN` / `_MAX`). */
export const MULTIPLE_COLUMNS_MIN = 3;
export const MULTIPLE_COLUMNS_MAX = 8;

/** The column count the engine cuts a `multiple` layout with: a whole
 *  number from 3 to 8 (3 when it is not a number). */
export function columnCountUsed(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return MULTIPLE_COLUMNS_MIN;
  return Math.max(MULTIPLE_COLUMNS_MIN, Math.min(MULTIPLE_COLUMNS_MAX, Math.round(n)));
}

/** How many columns a layout cuts the body into (a one-and-a-half
 *  layout's side column counts). */
export function layoutColumnCount(layout: { layoutType: LayoutType; columnCount?: number }): number {
  if (layout.layoutType === 'single') return 1;
  if (layout.layoutType === 'multiple') return columnCountUsed(layout.columnCount ?? MULTIPLE_COLUMNS_MIN);
  return 2;
}
