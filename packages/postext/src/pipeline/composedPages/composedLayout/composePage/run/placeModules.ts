// A run's placing of a group's modules (#1062), each laid as a page of its own.
import type { ResolvedFrameGroup, ResolvedFrame, ResolvedModule, ResolvedPageTemplate } from '../../../../../composed/types.js';
import { groupPlaceable, placeBox, type Rect, unionRect } from '../../../../../composed/geometry.js';
import type { Dimension } from '../../../../../types.js';
import { dimensionToPx } from '../../../../../units.js';
import { nestedChain } from '../../../../../composed/modules.js';
import { composedOrder } from '../../../../../composed/groups.js';
import { heldByFoot } from '../../placedFrames.js';
import type { ComposedPageInput, FitState } from '../../state.js';
import type { ComposeState } from '../state.js';
import type { RunState } from './state.js';

/** What createPlaceModules takes from the pass. */
export interface PlaceModulesDeps {
  pageInput: ComposedPageInput;
  template: ResolvedPageTemplate;
  fit: FitState;
  dpi: number;
  frameIdOf: (name: string) => string;
  state: ComposeState;
  rects: Map<string, Rect>;
  declared: Map<string, Rect>;
  groupRects: Map<string, Rect>;
  groupDeclared: Map<string, Rect>;
  refOf: (name: string) => Rect | undefined;
  pinned: { name: string; rect: Rect }[];
  boxShort: Map<string, number>;
  fitted: Map<string, { placed: Rect; kept: Rect; }>;
  moduleRects: Map<string, Rect>;
  spillWhole: (names: readonly string[], advanced: boolean, lastLaid: string | undefined) => void;
  runStep: (step: ReturnType<typeof composedOrder>[number], filling: boolean) => void;
  runState: RunState;
}

export function createPlaceModules(deps: PlaceModulesDeps) {
  const {
    pageInput, template, fit, dpi, frameIdOf, state, rects, declared, groupRects, groupDeclared,
    refOf, pinned, boxShort, fitted, moduleRects, spillWhole, runStep, runState
  } = deps;
    /** Lay a modules group (#1062): its modules in rows down the group's
     *  box (its own, else the area). A stack gives each module a row of
     *  its own, as wide as the group (or its template's `width`, #1088), a
     *  `'row'` puts them all in one, start to end (each its `width`, else
     *  an equal share of what is left), a `'grid'` `columns` to a row in
     *  equal columns; a run of modules a group inside it takes (`within`)
     *  is laid as that group says where its first module comes: its rows
     *  among a stack's, one cell of a row or a grid (#1095: to any depth).
     *  A row's room past its modules' widths goes by `grow`, what it is
     *  short by comes back by `shrink` (#1095). Rows run from the start side of the page's lines (the flow frame is
     *  mirrored on a right-to-left page, so its left is the start). A
     *  module is placed as its template draws its frames in its box
     *  (`'container'` is the box) and its groups laid in it: first in the
     *  room left, to find how tall it is (the frames held by the box's foot
     *  or middle, or sized by its height, left out), then in a box that
     *  tall, or (`rowAlign` `'stretch'`, a row of several) as tall as its
     *  row, its `'auto'` boxes that end at its foot reaching the row's
     *  (#1095). A row that does not fit is cut at the group's foot (its frames
     *  clipped there), or, when the group goes on to another page
     *  (`FitState.gridsOn`), it and every row after it go on, whole. The
     *  modules' declared boxes follow each other at the heights their
     *  frames declare, so the log tells a module moved by the one before
     *  it. */
    const placeModules = (group: ResolvedFrameGroup, members: readonly ResolvedFrame[]): void => {
      const byMember = new Map(members.map((f) => [f.name, f]));
      const own = groupPlaceable(group);
      const ownBox = own ? placeBox(own, template, pageInput, refOf, () => 0) : undefined;
      const box = ownBox ?? pageInput.areas.area;
      const foot = box.y + box.height;
      const toPx = (d: Dimension): number => dimensionToPx(d, dpi, pageInput.emPx);
      const groupNamed = new Map(template.groups.map((g) => [g.name, g]));
      /** A module, its frames, and the groups inside the page's it lies
       *  in, innermost first (#1095). */
      type Laid = { mod: ResolvedModule; names: string[]; chain: string[] };
      /** An item of a row: a module, or a run of modules of a group inside
       *  the row's group, laid as that group in the cell (#1095). */
      type Cell = { kind: 'module'; l: Laid } | { kind: 'group'; group: ResolvedFrameGroup; list: Laid[] };
      type Row = { cells: Cell[]; xs: number[]; widths: number[]; align: 'start' | 'center' | 'end' | 'stretch'; gapBefore: number };
      const mods: Laid[] = [];
      for (const item of group.items ?? []) {
        const mod = template.modules?.find((m) => m.name === item.module);
        const names = item.frames.filter((n) => byMember.has(n));
        if (mod && names.length > 0) mods.push({ mod, names, chain: nestedChain(template.groups, mod.nested) });
      }
      /** A module's width by its template in a group `width` wide
       *  (`'fill'`: none). */
      const fixedWidth = (l: Laid, width: number): number | undefined => {
        const w = l.mod.width;
        if (w === undefined || w === 'fill') return undefined;
        return 'percent' in w ? (width * w.percent) / 100 : toPx(w);
      };
      /** The cells of `list` in `g`: each module `g` lays itself, and each
       *  run of the modules of a group inside `g`. */
      const cellsOf = (list: readonly Laid[], g: ResolvedFrameGroup): Cell[] => {
        const out: Cell[] = [];
        for (const l of list) {
          const name = l.chain.find((n) => groupNamed.get(n)?.within === g.name);
          const child = name !== undefined ? groupNamed.get(name) : undefined;
          const last = out[out.length - 1];
          if (child && last?.kind === 'group' && last.group === child) last.list.push(l);
          else out.push(child ? { kind: 'group', group: child, list: [l] } : { kind: 'module', l });
        }
        return out;
      };
      const namesOf = (c: Cell): string[] => (c.kind === 'module' ? c.l.names : c.list.flatMap((l) => l.names));
      /** `cells` side by side across `width` from `x`, `gap` between them:
       *  each as wide as its template says, then the room left shared by
       *  `grow` (a `'fill'` module, and a group's cell, 1 at least), or,
       *  when the widths run past the end, given back by `shrink` in
       *  proportion to each width (#1095). */
      const across = (cells: readonly Cell[], gap: number, x: number, width: number): { xs: number[]; widths: number[] } => {
        const fixed = cells.map((c) => (c.kind === 'module' ? fixedWidth(c.l, width) : undefined));
        const taken = fixed.reduce<number>((a, w) => a + (w ?? 0), 0) + gap * Math.max(0, cells.length - 1);
        const spare = width - taken;
        let widths: number[];
        if (spare >= 0) {
          const grows = cells.map((c, k) => (c.kind !== 'module' ? 1 : fixed[k] === undefined ? Math.max(1, c.l.mod.grow ?? 1) : c.l.mod.grow ?? 0));
          const total = grows.reduce((a, g) => a + g, 0);
          widths = fixed.map((w, k) => Math.max(0, total > 0 ? (w ?? 0) + (spare * grows[k]!) / total : w ?? 0));
        } else {
          const weights = cells.map((c, k) => (c.kind === 'module' && fixed[k] !== undefined ? (c.l.mod.shrink ?? 0) * fixed[k]! : 0));
          const total = weights.reduce((a, g) => a + g, 0);
          widths = fixed.map((w, k) => Math.max(0, total > 0 ? (w ?? 0) + (spare * weights[k]!) / total : w ?? 0));
        }
        const xs: number[] = [];
        let at = x;
        for (const w of widths) {
          xs.push(at);
          at += w + gap;
        }
        return { xs, widths };
      };
      /** The rows `list` makes in a group of `g`'s kind across `width`
       *  from `x`, the first `first` after the row before it. A group
       *  inside a stack adds its rows to the stack's; inside a row or a
       *  grid, a run of its modules is one cell. */
      const rowsOf = (list: readonly Laid[], g: ResolvedFrameGroup, x: number, width: number, first: number): Row[] => {
        const gap = toPx(g.gap);
        const align = g.rowAlign ?? 'stretch';
        const cells = cellsOf(list, g);
        if (g.kind === 'row') return [{ cells, ...across(cells, gap, x, width), align, gapBefore: first }];
        if (g.kind === 'grid') {
          const columns = Math.max(1, g.columns ?? 1);
          const colGap = toPx(g.columnGap ?? g.gap);
          const rowGap = toPx(g.rowGap ?? g.gap);
          const colW = Math.max(1, (width - colGap * (columns - 1)) / columns);
          const out: Row[] = [];
          for (let k = 0; k < cells.length; k += columns) {
            const chunk = cells.slice(k, k + columns);
            out.push({ cells: chunk, xs: chunk.map((_, c) => x + c * (colW + colGap)), widths: chunk.map(() => colW), align, gapBefore: k === 0 ? first : rowGap });
          }
          return out;
        }
        // A stack: a row of its own per module, at its width from the
        // start; a group's rows in turn.
        const out: Row[] = [];
        cells.forEach((c, k) => {
          const before = k === 0 ? first : gap;
          if (c.kind === 'module') out.push({ cells: [c], xs: [x], widths: [fixedWidth(c.l, width) ?? width], align: 'start', gapBefore: before });
          else out.push(...rowsOf(c.list, c.group, x, width, before));
        });
        return out;
      };
      const rows = rowsOf(mods, group, box.x, box.width, 0);
      let cursor = box.y;
      let declCursor = box.y;
      let out = false;
      let laidAny = false;
      let lastLaid: string | undefined;
      const boxes: Rect[] = [];
      const declBoxes: Rect[] = [];
      const nestedBoxes = new Map<string, { laid: Rect[]; declared: Rect[] }>();
      const restore = <K, V>(to: Map<K, V>, from: ReadonlyMap<K, V>): void => {
        to.clear();
        for (const [k, v] of from) to.set(k, v);
      };
      const lay = (l: Laid, x: number, y: number, width: number, height: number, filling: boolean): void => {
        const steps = composedOrder({ frames: l.names.map((n) => byMember.get(n)!), groups: template.groups.filter((g) => l.mod.groups.includes(g.name)) });
        state.input = { ...pageInput, areas: { ...pageInput.areas, area: { x, y, width, height: Math.max(0, height) } } };
        try {
          for (const step of steps) runStep(step, filling);
        } finally {
          state.input = pageInput;
        }
      };
      /** How tall a module is at `(x, y)`, `width` wide: its frames placed
       *  in the room left, then everything they set put back. */
      const measure = (l: Laid, x: number, y: number, width: number): number => {
        const kept = { rects: new Map(rects), declared: new Map(declared), groupRects: new Map(groupRects), groupDeclared: new Map(groupDeclared), pinned: pinned.length, boxShort: new Map(boxShort), fitted: new Map(fitted) };
        lay(l, x, y, width, foot - y, false);
        const placed = l.names.filter((n) => rects.has(n));
        const measured = placed.filter((n) => !heldByFoot(byMember.get(n)!));
        const reach = unionRect((measured.length > 0 ? measured : placed).map((n) => rects.get(n)!));
        restore(rects, kept.rects);
        restore(declared, kept.declared);
        restore(groupRects, kept.groupRects);
        restore(groupDeclared, kept.groupDeclared);
        restore(boxShort, kept.boxShort);
        restore(fitted, kept.fitted);
        pinned.length = kept.pinned;
        return reach ? Math.max(0, reach.y + reach.height - y) : 0;
      };
      /** How tall a cell is at `(x, y)`, `width` wide: a module's height,
       *  or a group's rows one after another (#1095). */
      const measureCell = (c: Cell, x: number, y: number, width: number): number => {
        if (c.kind === 'module') return measure(c.l, x, y, width);
        let at = y;
        rowsOf(c.list, c.group, x, width, 0).forEach((row, r) => {
          if (r > 0) at += row.gapBefore;
          at += Math.max(0, ...row.cells.map((d, k) => measureCell(d, row.xs[k]!, at, row.widths[k]!)));
        });
        return at - y;
      };
      /** Lay `row` at `rowTop` (its declared top `declTop`), its cells
       *  `heights` tall: each module in a box that tall (cut at the foot
       *  when the row does not fit), a shorter one placed by `rowAlign`; a
       *  group's cell its rows in turn. The row's foot, laid and declared. */
      const layRow = (row: Row, rowTop: number, declTop: number, heights: readonly number[], fits: boolean): { bottom: number; declBottom: number } => {
        const rowH = Math.max(0, ...heights);
        const several = row.cells.length > 1;
        let rowBottom = rowTop;
        let rowDeclBottom = declTop;
        row.cells.forEach((c, k) => {
          const x = row.xs[k]!;
          const width = row.widths[k]!;
          const spare = rowH - heights[k]!;
          const stretched = fits && several && row.align === 'stretch' && c.kind === 'module';
          const dy = fits && several && spare > 0.01 ? (row.align === 'end' ? spare : row.align === 'center' ? spare / 2 : 0) : 0;
          const y = rowTop + dy;
          if (c.kind === 'group') {
            // A run of a group inside this one (#1095): its rows, from the
            // cell's top.
            const laid = layRows(rowsOf(c.list, c.group, x, width, 0), y, declTop + dy, fits);
            rowBottom = Math.max(rowBottom, laid.bottom);
            rowDeclBottom = Math.max(rowDeclBottom, laid.declBottom);
            return;
          }
          const l = c.l;
          runState.clipFoot = fits ? undefined : foot;
          // Its 'auto' boxes that end at its foot reach the row's (#1095).
          runState.stretchTo = stretched && spare > 0.01 ? { at: y + heights[k]!, foot: y + rowH, names: new Set(l.names) } : undefined;
          try {
            lay(l, x, y, width, fits ? (stretched ? rowH : heights[k]!) : foot - rowTop, true);
          } finally {
            runState.clipFoot = undefined;
            runState.stretchTo = undefined;
          }
          const u = unionRect(l.names.flatMap((n) => (rects.has(n) ? [rects.get(n)!] : [])));
          const bottom = Math.max(stretched ? y + rowH : y, u ? u.y + u.height : y);
          const moduleBox = { x, y, width, height: bottom - y };
          moduleRects.set(l.mod.name, moduleBox);
          boxes.push(moduleBox);
          // Declared: after the rows before it as they declare themselves.
          const shift = declTop - rowTop;
          for (const n of l.names) {
            const d = declared.get(n);
            if (d && Math.abs(shift) > 0.001) declared.set(n, { ...d, y: d.y + shift });
          }
          const declY = declTop + dy;
          const du = unionRect(l.names.flatMap((n) => (declared.has(n) ? [declared.get(n)!] : [])));
          const declBottom = du ? Math.max(declY, du.y + du.height) : declY;
          const declBox = { x, y: declY, width, height: declBottom - declY };
          declBoxes.push(declBox);
          for (const name of l.chain) {
            const n = nestedBoxes.get(name) ?? { laid: [], declared: [] };
            n.laid.push(moduleBox);
            n.declared.push(declBox);
            nestedBoxes.set(name, n);
          }
          rowBottom = Math.max(rowBottom, bottom);
          rowDeclBottom = Math.max(rowDeclBottom, declBottom);
        });
        return { bottom: rowBottom, declBottom: rowDeclBottom };
      };
      /** The rows of a group's cell, one after another from `top`. */
      const layRows = (list: readonly Row[], top: number, declTop: number, fits: boolean): { bottom: number; declBottom: number } => {
        let at = top;
        let declAt = declTop;
        list.forEach((row, r) => {
          if (r > 0) {
            at += row.gapBefore;
            declAt += row.gapBefore;
          }
          const heights = row.cells.map((c, k) => measureCell(c, row.xs[k]!, at, row.widths[k]!));
          const laid = layRow(row, at, declAt, heights, fits);
          at = laid.bottom;
          declAt = laid.declBottom;
        });
        return { bottom: at, declBottom: declAt };
      };
      rows.forEach((row, r) => {
        const names = row.cells.flatMap(namesOf);
        if (out) {
          spillWhole(names, laidAny, lastLaid);
          return;
        }
        if (r > 0) {
          cursor += row.gapBefore;
          declCursor += row.gapBefore;
        }
        const heights = row.cells.map((c, k) => measureCell(c, row.xs[k]!, cursor, row.widths[k]!));
        const rowH = Math.max(0, ...heights);
        const fits = cursor + rowH <= foot + 0.5;
        if (!fits && fit.gridsOn.has(group.name)) {
          // This row and the ones after it go on, whole.
          out = true;
          spillWhole(names, laidAny, lastLaid);
          return;
        }
        const laid = layRow(row, cursor, declCursor, heights, fits);
        laidAny = true;
        lastLaid = frameIdOf(names[names.length - 1]!);
        cursor = laid.bottom;
        declCursor = laid.declBottom;
      });
      // A group inside another (#1088, #1095) is the box of its modules.
      for (const [name, b] of nestedBoxes) {
        groupRects.set(name, unionRect(b.laid)!);
        groupDeclared.set(name, unionRect(b.declared)!);
      }
      groupRects.set(group.name, ownBox ?? unionRect(boxes) ?? { ...box, height: 0 });
      groupDeclared.set(group.name, ownBox ?? unionRect(declBoxes) ?? { ...box, height: 0 });
    };
  return {
    placeModules
  };
}
