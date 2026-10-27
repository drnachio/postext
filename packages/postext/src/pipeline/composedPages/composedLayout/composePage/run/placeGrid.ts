// A run's placing of a group's frames in a grid of rows and columns.
import type { ResolvedFrameGroup, ResolvedFrame, ResolvedPageTemplate } from '../../../../../composed/types.js';
import { type Rect, groupPlaceable, placeBox, framePlaceable, unionRect } from '../../../../../composed/geometry.js';
import { dimensionToPx } from '../../../../../units.js';
import type { Dimension } from '../../../../../types.js';
import { anchorTarget } from '../../../../../composed/templates.js';
import type { FitState } from '../../state.js';
import type { ComposeState } from '../state.js';
import type { Prep } from './types.js';

/** What createPlaceGrid takes from the pass. */
export interface PlaceGridDeps {
  template: ResolvedPageTemplate;
  fit: FitState;
  dpi: number;
  state: ComposeState;
  rects: Map<string, Rect>;
  declared: Map<string, Rect>;
  groupRects: Map<string, Rect>;
  groupDeclared: Map<string, Rect>;
  refOf: (name: string) => Rect | undefined;
  prepare: (frame: ResolvedFrame) => Prep;
  naturalOf: (p: Prep, at?: Rect) => (width: number) => number;
  naturalWidthOf: (p: Prep) => ((room: number) => number) | undefined;
  placeFitted: (frame: ResolvedFrame, placeable: ReturnType<typeof framePlaceable>, ctx: Parameters<typeof placeBox>[2], refs: (n: string) => Rect | undefined, nat: (width: number) => number, natW?: (room: number) => number) => Rect;
}

export function createPlaceGrid(deps: PlaceGridDeps) {
  const {
    template, fit, dpi, state, rects, declared, groupRects, groupDeclared, refOf, prepare, naturalOf,
    naturalWidthOf, placeFitted
  } = deps;
    /** Lay a grid (#1061): its cells fill rows from the start side of the
     *  page's lines (the flow frame is mirrored on a right-to-left page, so
     *  its left is the start), `columns` to a row, `columnGap` and `rowGap`
     *  between them. A cell is one item of a repeated frame set (or one
     *  frame of a grid that repeats none): the main frame takes the cell's
     *  width and its own height rule, the set's other frames are placed as
     *  the template draws them, anchored to the main frame or to each
     *  other (one that anchors to nothing in the set moves with the cell).
     *  A row is as tall as its tallest cell, the set's frames counted;
     *  `rowAlign` places the shorter ones (`'stretch'`: their main frame
     *  grows to the row). The grid runs down its own box, or to the foot of
     *  the area from where the template draws its main frame. A row that
     *  does not fit is clipped at the foot, or, when the grid goes on to
     *  another page (`FitState.gridsOn`), it and every row after it are
     *  left for that page, whole (`spilled`). */
    const placeGrid = (group: ResolvedFrameGroup, members: readonly ResolvedFrame[]): { rects: Map<string, Rect>; spilled: Set<string>; laidAny: boolean; clipped: string[] } => {
      const byMember = new Map(members.map((f) => [f.name, f]));
      const cells = (group.items ?? (group.repeat ? [] : members.map((f) => ({ item: 0, frames: [f.name] }))))
        .map((c) => c.frames.filter((n) => byMember.has(n)))
        .filter((c) => c.length > 0);
      const laidBoxes = new Map<string, Rect>();
      const spilled = new Set<string>();
      const cut: string[] = [];
      const own = groupPlaceable(group);
      const ownBox = own ? placeBox(own, template, state.input, refOf, () => 0) : undefined;
      const area = state.input.areas.area;
      const first = cells[0] ? byMember.get(cells[0][0]!)! : undefined;
      /** Where the template draws a cell's main frame. */
      const drawnOf = (main: ResolvedFrame): Rect => placeBox(framePlaceable(main), template, state.input, refOf, () => 0);
      const drawnFirst = first ? drawnOf(first) : area;
      const box: Rect = ownBox ?? { x: drawnFirst.x, y: drawnFirst.y, width: Math.max(0, area.x + area.width - drawnFirst.x), height: Math.max(0, area.y + area.height - drawnFirst.y) };
      const foot = box.y + box.height;
      const columns = Math.max(1, group.columns ?? 1);
      const colGap = dimensionToPx(group.columnGap ?? group.gap, dpi, state.input.emPx);
      const rowGap = dimensionToPx(group.rowGap ?? group.gap, dpi, state.input.emPx);
      const colW = Math.max(1, (box.width - colGap * (columns - 1)) / columns);
      const xOf = (c: number): number => box.x + c * (colW + colGap);
      const px = (d: Dimension | undefined): number | undefined => (d ? dimensionToPx(d, dpi, state.input.emPx) : undefined);
      /** The main frame's height in a cell `w` wide: its own rule, held
       *  between its minimum and maximum. */
      const mainHeight = (f: ResolvedFrame, w: number): number => {
        const h = f.height;
        let v: number;
        if (h === 'auto') v = naturalOf(prepare(f))(w);
        else if (h === 'fill') v = 0;
        else if ('percent' in h) v = (area.height * h.percent) / 100;
        else v = dimensionToPx(h, dpi, state.input.emPx);
        const min = px(f.minHeight) ?? 0;
        const max = px(f.maxHeight) ?? Infinity;
        return Math.max(min, Math.min(v, max));
      };
      /** The boxes of a cell's frames with its main frame at `(x, y)`,
       *  `h` tall; and the frames that count for the cell's extent. */
      const layCell = (cell: readonly string[], x: number, y: number, h: number): { boxes: Map<string, Rect>; inCell: string[] } => {
        const main = byMember.get(cell[0]!)!;
        const boxes = new Map<string, Rect>([[main.name, { x, y, width: colW, height: h }]]);
        const inCell = [main.name];
        const set = new Set(cell);
        const drawn = drawnOf(main);
        const refs = (n: string): Rect | undefined => boxes.get(n) ?? refOf(n);
        // A frame anchored in the set fills (and takes its percentages of)
        // the cell's column, not the whole area.
        const column = { ...state.input, areas: { ...state.input.areas, area: { x, y: area.y, width: colW, height: area.height } } };
        let todo = cell.slice(1);
        for (let pass = 0; todo.length > 0 && pass <= cell.length; pass++) {
          const later: string[] = [];
          for (const name of todo) {
            const f = byMember.get(name)!;
            const target = f.grid ? undefined : anchorTarget(f.placement);
            // Anchored to a frame of the set not placed yet: next pass.
            if (target !== undefined && set.has(target) && !boxes.has(target) && pass < cell.length) {
              later.push(name);
              continue;
            }
            const p = prepare(f);
            const inSet = target !== undefined && set.has(target);
            const r = placeFitted(f, framePlaceable(f), inSet ? column : state.input, refs, naturalOf(p), naturalWidthOf(p));
            if (target !== undefined && !set.has(target)) {
              // Anchored to a frame outside the set: where it says.
              boxes.set(name, r);
              continue;
            }
            // Anchored in the set, or to nothing in it: with the cell.
            boxes.set(name, target !== undefined ? r : { ...r, x: r.x + x - drawn.x, y: r.y + y - drawn.y });
            inCell.push(name);
          }
          todo = later;
        }
        return { boxes, inCell };
      };
      const stretchable = (f: ResolvedFrame): boolean => f.height === 'auto' || f.height === 'fill';
      let cursor = box.y;
      let laidAny = false;
      let out = false;
      for (let r = 0; r * columns < cells.length; r++) {
        const row = cells.slice(r * columns, (r + 1) * columns);
        if (out) {
          for (const c of row) for (const n of c) spilled.add(n);
          continue;
        }
        // Each cell at the row's top, to see how far it reaches above and
        // below its main frame.
        const measured = row.map((cell, c) => {
          const main = byMember.get(cell[0]!)!;
          const h = mainHeight(main, colW);
          const { boxes, inCell } = layCell(cell, xOf(c), 0, h);
          const u = unionRect(inCell.map((n) => boxes.get(n)!))!;
          return { cell, main, h, above: Math.max(0, -u.y), below: u.y + u.height };
        });
        const above = Math.max(0, ...measured.map((m) => m.above));
        const below = Math.max(0, ...measured.map((m) => m.below));
        const rowH = above + below;
        const fits = cursor + rowH <= foot + 0.5;
        if (!fits && fit.gridsOn.has(group.name)) {
          // This row and the rest go on, whole.
          out = true;
          for (const c of row) for (const n of c) spilled.add(n);
          continue;
        }
        measured.forEach((m, c) => {
          const spare = below - m.below;
          let dy = 0;
          let h = m.h;
          if (spare > 0.01) {
            const align = group.rowAlign ?? 'stretch';
            if (align === 'end') dy = spare;
            else if (align === 'center') dy = spare / 2;
            else if (align === 'stretch' && stretchable(m.main)) h = Math.min(m.h + spare, px(m.main.maxHeight) ?? Infinity);
          }
          const { boxes } = layCell(m.cell, xOf(c), cursor + above + dy, h);
          if (!fits) cut.push(...m.cell);
          for (const [n, b] of boxes) {
            // A row past the grid's foot is cut there: what is cut shows as
            // the frames' overflow.
            const y = Math.min(b.y, foot);
            laidBoxes.set(n, fits ? b : { ...b, y, height: Math.max(0, Math.min(b.y + b.height, foot) - y) });
          }
        });
        laidAny = true;
        cursor += rowH + rowGap;
      }
      for (const [n, b] of laidBoxes) {
        // A grid's cells are its template's drawing: no reflow events.
        declared.set(n, b);
        rects.set(n, b);
      }
      const laidRects = [...laidBoxes.values()];
      const union = ownBox ?? unionRect(laidRects) ?? { ...box, height: 0 };
      groupRects.set(group.name, union);
      groupDeclared.set(group.name, union);
      return { rects: laidBoxes, spilled, laidAny, clipped: cut };
    };
  return {
    placeGrid
  };
}
