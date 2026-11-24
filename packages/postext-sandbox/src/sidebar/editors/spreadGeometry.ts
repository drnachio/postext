// The geometry of the page editor's drawing: where the guides of a spread
// lie and what a guide dragged to a point makes of its margin or gutter.
// Pure, in points, in the drawing's own coordinates (PagePreview's
// viewBox: the pages side by side from x = 0, y down from the head).

import type { DimensionUnit, ResolvedLayoutConfig } from 'postext';
import { TO_PT } from '../../controls/inputs/units.js';
import { columnsOf } from '../settings/PagePreview.js';

export type GuidePart = 'top' | 'bottom' | 'inner' | 'outer' | 'gutter';

/** The page in points. `inner`/`outer` are `margins.left`/`right`: the
 *  sides they name when the margins mirror, left and right otherwise. */
export interface SpreadPage {
  width: number;
  height: number;
  top: number;
  bottom: number;
  inner: number;
  outer: number;
  mirror: boolean;
}

/** One guide of the drawing: a segment a pointer can take hold of. */
export interface Guide {
  part: GuidePart;
  /** The page it lies on: its left edge, and whether its spine is there. */
  pageX: number;
  spineLeft: boolean;
  /** `x`: a vertical line at `at`, from `from` to `to` down the page;
   *  `y`: a horizontal one. */
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** The gap between the two pages of the drawn spread (PagePreview's). */
export const spreadGap = (width: number): number => width * 0.04;

/** The pages of the drawing: one whose spine is on its left, or a spread
 *  (the left page's spine on its right). */
export function spreadPages(page: SpreadPage): { x: number; spineLeft: boolean }[] {
  return page.mirror
    ? [{ x: 0, spineLeft: false }, { x: page.width + spreadGap(page.width), spineLeft: true }]
    : [{ x: 0, spineLeft: true }];
}

/** Where the second column starts, from the type area's left edge, with a
 *  gutter of `g` points; null when the layout has one column. */
function secondColumnStart(layout: ResolvedLayoutConfig, tw: number, spineLeft: boolean, g: number): number | null {
  const cols = columnsOf(layout, tw, spineLeft, g);
  return cols.length > 1 ? cols[1]!.x : null;
}

/** The guides of the drawing: four margins a page, and the gutter (the
 *  left edge of each page's second column) when the lines run across
 *  the page in columns. */
export function spreadGuides(page: SpreadPage, layout: ResolvedLayoutConfig): Guide[] {
  const guides: Guide[] = [];
  const vertical = layout.writingMode === 'vertical-rl';
  for (const { x, spineLeft } of spreadPages(page)) {
    const left = spineLeft ? page.inner : page.outer;
    const right = spineLeft ? page.outer : page.inner;
    const common = { pageX: x, spineLeft };
    guides.push({ ...common, part: 'top', axis: 'y', at: page.top, from: x, to: x + page.width });
    guides.push({ ...common, part: 'bottom', axis: 'y', at: page.height - page.bottom, from: x, to: x + page.width });
    guides.push({ ...common, part: 'inner', axis: 'x', at: spineLeft ? x + page.inner : x + page.width - page.inner, from: 0, to: page.height });
    guides.push({ ...common, part: 'outer', axis: 'x', at: spineLeft ? x + page.width - page.outer : x + page.outer, from: 0, to: page.height });
    if (vertical) continue;
    const tw = Math.max(page.width - left - right, 1);
    const start = secondColumnStart(layout, tw, spineLeft, TO_PT[layout.gutterWidth.unit] * layout.gutterWidth.value);
    if (start !== null) guides.push({ ...common, part: 'gutter', axis: 'x', at: x + left + start, from: page.top, to: page.height - page.bottom });
  }
  return guides;
}

/** The least of the page a type area keeps along each side, whatever the
 *  margins dragged. */
const MIN_TYPE_AREA = 0.2;

/** The margin or gutter, in points, that puts `guide` at the pointer
 *  (`px`, `py` in the drawing's coordinates), kept within what leaves a
 *  type area on the page. */
export function dragGuide(guide: Guide, px: number, py: number, page: SpreadPage, layout: ResolvedLayoutConfig): number {
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
  switch (guide.part) {
    case 'top':
      return clamp(py, page.height * (1 - MIN_TYPE_AREA) - page.bottom);
    case 'bottom':
      return clamp(page.height - py, page.height * (1 - MIN_TYPE_AREA) - page.top);
    case 'inner':
      return clamp(guide.spineLeft ? px - guide.pageX : guide.pageX + page.width - px, page.width * (1 - MIN_TYPE_AREA) - page.outer);
    case 'outer':
      return clamp(guide.spineLeft ? guide.pageX + page.width - px : px - guide.pageX, page.width * (1 - MIN_TYPE_AREA) - page.inner);
    case 'gutter': {
      const left = guide.spineLeft ? page.inner : page.outer;
      const right = guide.spineLeft ? page.outer : page.inner;
      const tw = Math.max(page.width - left - right, 1);
      // The second column's start is linear in the gutter: a + b·g.
      const a = secondColumnStart(layout, tw, guide.spineLeft, 0) ?? 0;
      const b = (secondColumnStart(layout, tw, guide.spineLeft, 1) ?? 0) - a;
      if (b === 0) return TO_PT[layout.gutterWidth.unit] * layout.gutterWidth.value;
      return clamp((px - guide.pageX - left - a) / b, tw / 2);
    }
  }
}

/** The step a dragged length snaps to, in its own unit: half a
 *  millimetre, a point, a twentieth of an inch. */
export function dragStep(unit: DimensionUnit): number {
  switch (unit) {
    case 'mm': return 0.5;
    case 'cm': return 0.05;
    case 'in': return 0.05;
    case 'em':
    case 'rem': return 0.1;
    case 'pt':
    case 'px': return 1;
  }
}

/** `points` as a value in `unit`, snapped to the unit's drag step (to a
 *  hundredth of the unit with `fine`). */
export function snapLength(points: number, unit: DimensionUnit, fine = false): number {
  const step = fine ? 0.01 : dragStep(unit);
  const value = Math.round(points / TO_PT[unit] / step) * step;
  return Math.round(value * 100) / 100;
}

/** What the page gives the text: the type area and its columns, in
 *  points, and the lines of `leading` points that fit down it. */
export function typeArea(page: SpreadPage, layout: ResolvedLayoutConfig, leading: number): { width: number; height: number; columns: number; columnWidth: number; lines: number } {
  const width = Math.max(page.width - page.inner - page.outer, 0);
  const height = Math.max(page.height - page.top - page.bottom, 0);
  const vertical = layout.writingMode === 'vertical-rl';
  // Vertical text: the columns are tiers down the type area, the lines
  // run down the page and count across it.
  const cols = columnsOf(layout, vertical ? height : width, true).filter((c) => !c.side);
  const columnWidth = cols[0]?.w ?? (vertical ? height : width);
  const lines = leading > 0 ? Math.floor(((vertical ? width : height) + 0.01) / leading) : 0;
  return { width, height, columns: cols.length, columnWidth, lines };
}
