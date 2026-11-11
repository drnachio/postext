// Floats at the foot of a column, in reading order (#1437).
//
// A bottom band is placed at the column's foot as it stands, so a second
// float joining the foot of a column went above the first: figure 2 over
// figure 1. Each foot keeps the floats it was given, in the order they
// came (their reading order); when another one joins, the stack is laid
// out again from the column's foot, the last one lowest, and the column
// keeps the room above the topmost.
//
// Only plain bands stack this way: a band beside a side column, under a
// cap, with text wrapping round it, rotated, a comic strip or a box anchored
// to a cap keeps its place and ends the stack of its columns.
//
// The stacks also know which floats stand at each column's foot, stacked
// or not: a row at the foot (`layout.footFloatRow`, floatRows.ts) reads its
// neighbour from here and moves it through here, so the two never disagree
// on where a float stands.
import type { VDTBlock, VDTColumn, VDTPage } from '../../../../vdt.js';
import { type FloatMeasure, measureFloatBand, floatGapAbove } from '../../../floats/floatSlots.js';
import { offsetBlock } from '../../../callouts/calloutLayout/geometry.js';

interface FootEntry {
  /** What the float put on the page (a resource block, or a box frame and
   *  its children). */
  blocks: VDTBlock[];
  measure: FloatMeasure;
  y: number;
}

interface FootStack {
  /** The page and columns of the band: a stack holds one band shape. */
  key: string;
  /** Each column's foot before the first float of the stack. */
  feet: Map<VDTColumn, number>;
  entries: FootEntry[];
}

export interface FootStacks {
  /** Each column's foot before a bottom band is reserved in it. */
  feetOf: (cols: readonly VDTColumn[]) => Map<VDTColumn, number>;
  /** Whether a float stands at the foot of `col`. */
  hasFoot: (col: VDTColumn) => boolean;
  /** The blocks of the float at the foot of `col` when it is the only
   *  one there and set in that column alone. */
  onlyFoot: (col: VDTColumn) => readonly VDTBlock[] | undefined;
  /** Move the only float at the foot of `col` up by `dy` px and end the
   *  column's stack: a float joining that foot later goes above it, where
   *  the column now ends, and never lays it out again from its old place. */
  raise: (col: VDTColumn, dy: number) => void;
  /** Record a bottom float just committed to `cols` and lay out its
   *  stack again. `stackable` false ends the stack of those columns.
   *  Returns the extra room taken from each column (0 when nothing
   *  moved), for the caller's reserved-space bookkeeping. */
  add: (
    page: VDTPage,
    cols: readonly VDTColumn[],
    feet: Map<VDTColumn, number>,
    entry: FootEntry,
    stackable: boolean,
  ) => Map<VDTColumn, number>;
}

export function createFootStacks(
  baselineGrid: number,
  floatGapPx: number,
): FootStacks {
  const stacks = new Map<VDTColumn, FootStack>();
  /** Every float set at each column's foot, and whether its band took
   *  that column alone. */
  const atFoot = new Map<VDTColumn, { entry: FootEntry; alone: boolean }[]>();
  const footOf = (col: VDTColumn): number => col.bbox.y + col.bbox.height;

  const feetOf = (cols: readonly VDTColumn[]): Map<VDTColumn, number> =>
    new Map(cols.map((c) => [c, footOf(c)]));

  /** The stack laid out from its feet, last entry lowest: each entry's y,
   *  and each column's new foot. */
  const layOut = (stack: FootStack, cols: readonly VDTColumn[], page: VDTPage) => {
    const foot = new Map(stack.feet);
    const ys: number[] = new Array(stack.entries.length);
    for (let i = stack.entries.length - 1; i >= 0; i--) {
      const e = stack.entries[i]!;
      const { y } = measureFloatBand('bottom', e.measure, cols, page.contentArea, baselineGrid, floatGapPx, (c) => foot.get(c)!);
      ys[i] = y;
      const top = y - floatGapAbove(e.measure, floatGapPx);
      for (const c of cols) foot.set(c, top);
    }
    return { ys, foot };
  };

  const add: FootStacks['add'] = (page, cols, feet, entry, stackable) => {
    const grown = new Map<VDTColumn, number>();
    for (const c of cols) {
      const list = atFoot.get(c) ?? [];
      list.push({ entry, alone: cols.length === 1 });
      atFoot.set(c, list);
    }
    const key = `${page.index}:${cols.map((c) => c.index).join(',')}`;
    const current = stacks.get(cols[0]!);
    const same = current !== undefined && current.key === key && cols.every((c) => stacks.get(c) === current);
    if (!stackable) {
      for (const c of cols) stacks.delete(c);
      return grown;
    }
    if (!same) {
      const stack: FootStack = { key, feet, entries: [entry] };
      for (const c of cols) stacks.set(c, stack);
      return grown;
    }
    current.entries.push(entry);
    const { ys, foot } = layOut(current, cols, page);
    // The stack in its new order must still leave the column its text:
    // the columns lose at most what they have free.
    for (const c of cols) {
      const more = footOf(c) - foot.get(c)!;
      if (more > c.availableHeight + 0.01) {
        current.entries.pop();
        for (const col of cols) stacks.delete(col);
        return grown;
      }
      grown.set(c, more);
    }
    current.entries.forEach((e, i) => {
      const dy = ys[i]! - e.y;
      if (Math.abs(dy) < 0.001) return;
      for (const b of e.blocks) offsetBlock(b, 0, dy);
      e.y = ys[i]!;
    });
    for (const c of cols) {
      const more = grown.get(c)!;
      c.bbox.height = Math.max(0, foot.get(c)! - c.bbox.y);
      c.availableHeight = Math.max(0, c.availableHeight - more);
    }
    return grown;
  };

  const hasFoot = (col: VDTColumn): boolean => (atFoot.get(col)?.length ?? 0) > 0;

  const only = (col: VDTColumn): FootEntry | undefined => {
    const list = atFoot.get(col);
    return list?.length === 1 && list[0]!.alone ? list[0]!.entry : undefined;
  };

  const raise: FootStacks['raise'] = (col, dy) => {
    const entry = only(col);
    if (!entry) return;
    for (const b of entry.blocks) offsetBlock(b, 0, -dy);
    entry.y -= dy;
    stacks.delete(col);
  };

  return { feetOf, add, hasFoot, onlyFoot: (col) => only(col)?.blocks, raise };
}
