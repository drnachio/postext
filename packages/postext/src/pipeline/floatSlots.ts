/**
 * Float slots — the pure geometry half of first-available-slot placement.
 *
 * A pending float (a figure / table incorporated by its first reference) is
 * offered the slots of the CURRENT page in reading order after the cursor:
 * the top of the referencing column when it is still empty, its bottom, then
 * the top and bottom of every later empty text column of the same band. A
 * page-span float on a multi-column band gets one slot: the band's bottom.
 * What does not fit on the current page waits for the next page opened by
 * the flow (`flushFloatsIntoPage` in `build.ts`). `'top'` / `'bottom'`
 * positions restrict the search to that kind of slot; `'auto'` takes both.
 *
 * The build pipeline owns the mutation (shrinking columns, pushing the block
 * into `page.floats`); this module only enumerates and measures.
 */

import type { BoundingBox, VDTColumn, VDTPage } from '../vdt';
import { bandColumns, currentBand } from './placement';
import { columnBottom } from './bandCaps';
import type { PlannedFloat } from './floatPlacement';

export type FloatSlotPosition = 'top' | 'bottom';

/** One candidate slot: the columns whose band it reserves (one column for a
 *  column-span float, every text column of the band for a page-span one). */
export interface FloatSlot {
  cols: VDTColumn[];
  position: FloatSlotPosition;
  pageSpan: boolean;
}

/** Kind of band cap a column is currently under, if any (`undefined` when
 *  uncapped). A `'span'` cap means a page-span block will cut the band at
 *  the cap, so the column's bottom is not a slot; a `'trailing'` cap only
 *  levels the closing band and leaves the true bottom free. */
export type ColumnCapKind = 'span' | 'trailing' | undefined;

/** Candidate slots on the current page, in reading order after the cursor. */
export function enumerateCurrentPageSlots(
  page: VDTPage,
  cursorColumnIndex: number,
  f: PlannedFloat,
  capKindOf: (col: VDTColumn) => ColumnCapKind,
): FloatSlot[] {
  const cursorCol = page.columns[cursorColumnIndex];
  if (!cursorCol || cursorCol.kind === 'span' || page.partInfo) return [];
  const band = currentBand(page, { pageIndex: page.index, columnIndex: cursorColumnIndex });
  const cols = bandColumns(page, band).filter((c) => c.bbox.height > 0.5);
  if (cols.length === 0) return [];

  const wantsTop = f.position !== 'bottom';
  const wantsBottom = f.position !== 'top';
  const bottomFree = (col: VDTColumn): boolean => capKindOf(col) !== 'span';

  if (f.span === 'page' && cols.length > 1) {
    if (!wantsBottom) return [];
    if (!cols.every(bottomFree)) return [];
    return [{ cols, position: 'bottom', pageSpan: true }];
  }

  const slots: FloatSlot[] = [];
  const start = cols.findIndex((c) => c.index === cursorCol.index);
  if (start < 0) return [];
  for (let i = start; i < cols.length; i++) {
    const col = cols[i]!;
    const empty = col.blocks.length === 0;
    if (i > start && !empty) continue;
    if (wantsTop && empty) slots.push({ cols: [col], position: 'top', pageSpan: false });
    if (wantsBottom && bottomFree(col)) slots.push({ cols: [col], position: 'bottom', pageSpan: false });
  }
  return slots;
}

/** What `measureFloatBand` needs to know about the laid-out float. */
export interface FloatMeasure {
  height: number;
  /** Block-relative baseline of the caption's last line, when captioned. */
  lastCaptionBaseline?: number;
}

/** Band geometry for one slot. Both kinds are corrected against the baseline
 *  grid so the surrounding text — and the facing page — keeps the rhythm:
 *  - top: the band height is rounded up to a grid multiple (growing the gap
 *    below the float), so every line of the displaced column stays on grid;
 *  - bottom: the float is anchored so its visual bottom sits on the grid —
 *    the caption's last baseline shares the last text baseline of the other
 *    columns (captionless content aligns its bottom edge to the last slot).
 *  Returns the band height to reserve (`need`) and the float's `y`. */
export function measureFloatBand(
  position: FloatSlotPosition,
  built: FloatMeasure,
  cols: readonly VDTColumn[],
  contentArea: BoundingBox,
  baselineGrid: number,
  gapPx: number,
  trueBottomOf: (col: VDTColumn) => number,
): { need: number; y: number } {
  if (position === 'top') {
    const rawNeed = built.height + gapPx;
    const need = Math.ceil((rawNeed - 0.01) / baselineGrid) * baselineGrid;
    return { need, y: cols[0]!.bbox.y };
  }
  const bottomLimit = Math.min(...cols.map(trueBottomOf));
  const gridAlignedBottom = contentArea.y
    + Math.floor((bottomLimit - contentArea.y + 0.01) / baselineGrid) * baselineGrid;
  // Body baselines sit at 0.2 × grid above each slot bottom; anchor the
  // caption's last baseline there.
  const y = built.lastCaptionBaseline !== undefined
    ? gridAlignedBottom - 0.2 * baselineGrid - built.lastCaptionBaseline
    : gridAlignedBottom - built.height;
  let need = 0;
  for (const col of cols) need = Math.max(need, trueBottomOf(col) - (y - gapPx));
  return { need, y };
}

/** Whether `col` already holds a float band (x-overlap with a float on the
 *  page). Used to keep a minimum of text room when stacking bands. */
export function columnHasFloatBand(page: VDTPage, col: VDTColumn): boolean {
  if (!page.floats) return false;
  const left = col.bbox.x;
  const right = col.bbox.x + col.bbox.width;
  return page.floats.some((fb) => fb.bbox.x < right - 0.5 && fb.bbox.x + fb.bbox.width > left + 0.5);
}

/** Strict fit for a slot on the current page: the band must fit in the
 *  column's remaining height, keeping `minTextPx` of text room when the
 *  column already holds another float band. */
export function fitsStrict(
  need: number,
  col: VDTColumn,
  hasBand: boolean,
  minTextPx: number,
): boolean {
  return need <= col.availableHeight - (hasBand ? minTextPx : 0) + 0.01;
}

/** True bottom of a column for slot geometry: the remembered one while a
 *  band cap trims it. */
export function trueBottom(col: VDTColumn, uncappedBottoms: ReadonlyMap<VDTColumn, number>): number {
  return columnBottom(col, uncappedBottoms);
}
