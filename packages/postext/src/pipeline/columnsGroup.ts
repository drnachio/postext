/**
 * Cutting a `:::columns` group (#634). A group lays its children out in a
 * galley at the sub-column width — one galley for a `flow="snake"` group,
 * one per stream (the runs its `breaks` start) for a `flow="parallel"` one
 * — and sets that galley in N sub-columns. A box (or a main-flow group's
 * frameless box) that splits inside a group needs to know how far the
 * galley goes in a fragment of a given room: {@link fillGalley} fills the
 * sub-columns in turn, cutting between the galley's items or between the
 * lines of a text item, never leaving fewer than the minimum lines of a
 * paragraph on either side of a cut. The fragment that goes on is set
 * with {@link minFillHeight}: the lowest column height that still holds
 * its galley, so its sub-columns end as level as the cuts allow.
 */

/** One item of a galley: a child block (or a nested box) of the group. */
export interface GalleyItem {
  /** Position of the child in the box's children (a nested box's opening
   *  marker). */
  child: number;
  /** Lines of the child set before this item: a paragraph the fragment
   *  opens inside of. */
  lineBase: number;
  /** Top in its galley and height, px. */
  y: number;
  height: number;
  /** A text item that may be cut: the bottom of each of its lines,
   *  relative to `y`. Absent for an item never cut (a figure, a table, a
   *  display formula, a nested box, a one-line paragraph). */
  lineBottoms?: number[];
}

/** Where a galley may be cut: before item `item` (`line` 0), or after the
 *  first `line` lines of it. `endY` is the bottom of what goes before the
 *  cut, `startY` the top of what goes after it (the space between two
 *  items vanishes at a column's head). */
export interface GalleyBreak {
  item: number;
  line: number;
  endY: number;
  startY: number;
}

const EPS = 0.01;

/** The places a galley may be cut, in order (the galley's start and end
 *  are not among them). A cut inside a text item leaves at least
 *  `minLines` of its lines on each side, counted over this galley's part
 *  of it. */
export function galleyBreaks(items: readonly GalleyItem[], minLines: number): GalleyBreak[] {
  const min = Math.max(1, minLines);
  const out: GalleyBreak[] = [];
  items.forEach((it, i) => {
    if (i > 0) {
      const prev = items[i - 1]!;
      out.push({ item: i, line: 0, endY: prev.y + prev.height, startY: it.y });
    }
    const lines = it.lineBottoms;
    if (!lines || lines.length < 2) return;
    for (let l = min; l <= lines.length - min; l++) {
      const y = it.y + lines[l - 1]!;
      out.push({ item: i, line: l, endY: y, startY: y });
    }
  });
  return out;
}

/** How a galley fills `columns` sub-columns of height `height`: the
 *  breaks that end each filled column, in order (the last one is where
 *  the fragment ends, unless `end`), and the tallest column. `end`: the
 *  whole galley fits. A column that cannot take the next item stops the
 *  fill there. */
export interface GalleyFill {
  end: boolean;
  /** Indices into the breaks, one per column the fill closed with a cut. */
  cuts: number[];
  used: number;
}

export function fillGalley(
  items: readonly GalleyItem[],
  breaks: readonly GalleyBreak[],
  columns: number,
  height: number,
): GalleyFill {
  if (items.length === 0) return { end: true, cuts: [], used: 0 };
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const endY = last.y + last.height;
  let colStart = first.y;
  let at = -1;
  let used = 0;
  const cuts: number[] = [];
  for (let c = 0; c < Math.max(1, columns); c++) {
    if (endY - colStart <= height + EPS) {
      used = Math.max(used, endY - colStart);
      return { end: true, cuts, used };
    }
    let best = -1;
    for (let j = at + 1; j < breaks.length; j++) {
      const b = breaks[j]!;
      if (b.endY - colStart > height + EPS) break;
      best = j;
    }
    if (best < 0) break;
    used = Math.max(used, breaks[best]!.endY - colStart);
    cuts.push(best);
    at = best;
    colStart = breaks[best]!.startY;
  }
  return { end: false, cuts, used };
}

/** The lowest column height at which the galley fits `columns`
 *  sub-columns whole (to within a hundredth of a px), or the galley's
 *  height when nothing shorter does. */
export function minFillHeight(items: readonly GalleyItem[], breaks: readonly GalleyBreak[], columns: number): number {
  if (items.length === 0) return 0;
  const total = items[items.length - 1]!.y + items[items.length - 1]!.height - items[0]!.y;
  let lo = total / Math.max(1, columns) - EPS;
  let hi = total;
  if (!fillGalley(items, breaks, columns, hi).end) return total;
  for (let i = 0; i < 40 && hi - lo > EPS; i++) {
    const mid = (lo + hi) / 2;
    if (fillGalley(items, breaks, columns, mid).end) hi = mid;
    else lo = mid;
  }
  return hi;
}
