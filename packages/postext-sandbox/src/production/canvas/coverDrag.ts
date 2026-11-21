/**
 * Moving and resizing a cover element on the sheet, in millimetres. There
 * is no snapping unless asked for (Alt held): an element goes exactly where
 * it is dragged. Asked for, its edges and centre line up with the sheet's
 * edges, the folds, the zones and their safe areas within a tolerance.
 */

import type { ProductionSheet, SheetRect } from 'postext';
import { dragRect, type Handle } from '../../templates/frameGeometry.js';

/** The smallest an element can be made by dragging, mm. */
const MIN_SIZE_MM = 2;

/** The lines an element lines up with (sheet mm): the bleed's and the
 *  trim's edges, the folds, and each zone's edges, centre and safe area. */
export function coverSnapLines(sheet: ProductionSheet): { xs: number[]; ys: number[] } {
  const xs = new Set<number>([0, sheet.width, sheet.trim.x, sheet.trim.x + sheet.trim.width]);
  const ys = new Set<number>([0, sheet.height, sheet.trim.y, sheet.trim.y + sheet.trim.height]);
  for (const l of sheet.lines) xs.add(l.x);
  for (const z of sheet.zones) {
    xs.add(z.rect.x).add(z.rect.x + z.rect.width / 2).add(z.safe.x).add(z.safe.x + z.safe.width);
    ys.add(z.rect.y + z.rect.height / 2).add(z.safe.y).add(z.safe.y + z.safe.height);
  }
  return { xs: [...xs], ys: [...ys] };
}

/** The shift that brings the nearest of `points` onto a line, within
 *  `tol`; 0 when none is that close. */
function nearest(points: readonly number[], lines: readonly number[], tol: number): number {
  let best = 0;
  let bestAbs = tol;
  for (const p of points) {
    for (const l of lines) {
      const d = l - p;
      if (Math.abs(d) <= bestAbs) {
        best = d;
        bestAbs = Math.abs(d);
      }
    }
  }
  return best;
}

export interface CoverDragOptions {
  /** Line up with the sheet (Alt held). */
  snap?: { xs: number[]; ys: number[]; tol: number };
  /** Keep the proportions of the box the drag started from (Shift held). */
  keepAspect?: boolean;
}

/** `start` dragged by `(dx, dy)` mm with `handle`. */
export function dragCoverRect(start: SheetRect, handle: Handle, dx: number, dy: number, options: CoverDragOptions = {}): SheetRect {
  let r = dragRect(start, handle, dx, dy, MIN_SIZE_MM);
  if (handle !== 'move' && options.keepAspect && start.height > 0) {
    r = withAspect(start, r, handle, start.width / start.height);
  }
  const snap = options.snap;
  if (!snap) return r;
  if (handle === 'move') {
    const sx = nearest([r.x, r.x + r.width / 2, r.x + r.width], snap.xs, snap.tol);
    const sy = nearest([r.y, r.y + r.height / 2, r.y + r.height], snap.ys, snap.tol);
    return { ...r, x: r.x + sx, y: r.y + sy };
  }
  // Only the edges being dragged line up.
  let { x, y, width, height } = r;
  if (handle.includes('w')) {
    const s = nearest([x], snap.xs, snap.tol);
    x += s;
    width -= s;
  }
  if (handle.includes('e')) width += nearest([x + width], snap.xs, snap.tol);
  if (handle.includes('n')) {
    const s = nearest([y], snap.ys, snap.tol);
    y += s;
    height -= s;
  }
  if (handle.includes('s')) height += nearest([y + height], snap.ys, snap.tol);
  return { x, y, width: Math.max(MIN_SIZE_MM, width), height: Math.max(MIN_SIZE_MM, height) };
}

/** `r` brought back to `ratio` (width over height), its opposite corner or
 *  side kept where the drag left it. */
function withAspect(start: SheetRect, r: SheetRect, handle: Exclude<Handle, 'move'>, ratio: number): SheetRect {
  const horizontal = handle.includes('e') || handle.includes('w');
  const vertical = handle.includes('n') || handle.includes('s');
  let width = r.width;
  let height = r.height;
  if (horizontal && vertical) {
    // A corner: the side that moved more leads.
    if (Math.abs(r.width - start.width) / start.width >= Math.abs(r.height - start.height) / start.height) height = width / ratio;
    else width = height * ratio;
  } else if (horizontal) height = width / ratio;
  else width = height * ratio;
  const x = handle.includes('w') ? r.x + r.width - width : horizontal ? r.x : r.x + (r.width - width) / 2;
  const y = handle.includes('n') ? r.y + r.height - height : vertical ? r.y : r.y + (r.height - height) / 2;
  return { x, y, width, height };
}
