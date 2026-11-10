// Table fills drawn as shapes behind a formatted table (#1444). Word and
// LibreOffice shade each cell on its own, and two shaded cells side by
// side can leave a hairline of page between them (a white seam through a
// dark header row, light seams across a tinted answer grid). Each run of
// cells with one fill is merged into bands, and every band is drawn as
// one shape behind the table: the cells keep their shading (Google Docs
// sets a floating table in the flow and shows only that), and any seam
// shows the band's colour. A table with a rounded frame cannot be shaded
// by its cells, whose corners are square: its fills are only the bands,
// rounded where they meet the frame's corners, and its outer rules are a
// rounded outline drawn over them.

import type { DisplayItem, DisplayRect } from '../../paint/displayList/types.js';
import type { VDTPathCommand } from '../../vdt/design.js';
import { pathRun } from './shapes.js';
import { wordColor } from './units.js';
import type { WriterContext } from './types.js';

type TableItem = Extract<DisplayItem, { kind: 'table' }>;

const EPS = 0.75;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;

/** Rectangles of one fill merged: side by side in a row, then stacked. */
export function mergeBands(rects: readonly DisplayRect[]): DisplayRect[] {
  let out = rects.map((r) => ({ ...r }));
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i]!;
        const b = out[j]!;
        const sideBySide = near(a.y, b.y) && near(a.height, b.height) && near(a.x + a.width, b.x);
        const stacked = near(a.x, b.x) && near(a.width, b.width) && near(a.y + a.height, b.y);
        if (!sideBySide && !stacked) continue;
        out[i] = sideBySide ? { ...a, width: b.x + b.width - a.x } : { ...a, height: b.y + b.height - a.y };
        out = out.filter((_r, k) => k !== j);
        changed = true;
        break outer;
      }
    }
  }
  return out;
}

/** The outline of `r` with each corner rounded by its radius (top left,
 *  top right, bottom right, bottom left). */
export function roundedOutline(r: DisplayRect, radii: readonly [number, number, number, number]): VDTPathCommand[] {
  const cap = Math.min(r.width, r.height) / 2;
  const [tl, tr, br, bl] = radii.map((v) => Math.max(0, Math.min(cap, v))) as [number, number, number, number];
  // Cubic quarter circles (0.5523 of the radius to the control points).
  const k = 0.5523;
  const x1 = r.x + r.width;
  const y1 = r.y + r.height;
  return [
    { op: 'M', x: r.x + tl, y: r.y },
    { op: 'L', x: x1 - tr, y: r.y },
    ...(tr ? [{ op: 'C' as const, x1: x1 - tr + tr * k, y1: r.y, x2: x1, y2: r.y + tr - tr * k, x: x1, y: r.y + tr }] : []),
    { op: 'L', x: x1, y: y1 - br },
    ...(br ? [{ op: 'C' as const, x1: x1, y1: y1 - br + br * k, x2: x1 - br + br * k, y2: y1, x: x1 - br, y: y1 }] : []),
    { op: 'L', x: r.x + bl, y: y1 },
    ...(bl ? [{ op: 'C' as const, x1: r.x + bl - bl * k, y1: y1, x2: r.x, y2: y1 - bl + bl * k, x: r.x, y: y1 - bl }] : []),
    { op: 'L', x: r.x, y: r.y + tl },
    ...(tl ? [{ op: 'C' as const, x1: r.x, y1: r.y + tl - tl * k, x2: r.x + tl - tl * k, y2: r.y, x: r.x + tl, y: r.y }] : []),
    { op: 'Z' },
  ];
}

/** Whether the table's fills and frame are drawn as rounded shapes. */
export function roundedTable(item: TableItem): boolean {
  return !item.rotate && !!item.frameRadii?.some((v) => v > 0);
}

/** The shapes behind an unturned table: one per band of a fill and, for a
 *  rounded table, its frame. `unshaded` cells have no shading of their
 *  own (they hold chips, whose boxes go between the fill and the text):
 *  their fill is always drawn. */
export function tableFillRuns(ctx: WriterContext, item: TableItem, unshaded: ReadonlySet<TableItem['cells'][number]>): string[] {
  if (item.rotate) return [];
  const rounded = roundedTable(item);
  const byFill = new Map<string, { rects: DisplayRect[]; needed: boolean; covers: boolean }>();
  for (const cell of item.cells) {
    const c = wordColor(cell.background);
    if (!c || c.alpha <= 0) continue;
    const group = byFill.get(cell.background!) ?? { rects: [], needed: rounded, covers: rounded };
    group.rects.push(cell.rect);
    if (unshaded.has(cell)) group.covers = true;
    if (group.covers || group.rects.length > 1) group.needed = true;
    byFill.set(cell.background!, group);
  }
  const t = item.rect;
  const radii = item.frameRadii ?? [0, 0, 0, 0];
  const out: string[] = [];
  // A band under shaded cells only fills their seams: it is drawn inside
  // the table's rules, which LibreOffice sets a hair off the engine's
  // edges (the band showed as a dark line over a header's top rule).
  const inset = Math.max(1, item.borderWidthPx ?? 0);
  for (const [fill, { rects, needed, covers }] of byFill) {
    // A lone shaded cell has no seam to cover.
    if (!needed) continue;
    for (const band of mergeBands(rects)) {
      const b = covers || band.width <= 2 * inset || band.height <= 2 * inset ? band : { x: band.x + inset, y: band.y + inset, width: band.width - 2 * inset, height: band.height - 2 * inset };
      const left = near(band.x, t.x);
      const right = near(band.x + band.width, t.x + t.width);
      const top = near(band.y, t.y);
      const bottom = near(band.y + band.height, t.y + t.height);
      const own: [number, number, number, number] = rounded
        ? [top && left ? radii[0] : 0, top && right ? radii[1] : 0, bottom && right ? radii[2] : 0, bottom && left ? radii[3] : 0]
        : [0, 0, 0, 0];
      out.push(pathRun(ctx, { kind: 'path', bbox: b, subpaths: [roundedOutline(b, own)], fill }));
    }
  }
  const rules = item.rules ?? 'grid';
  if (rounded && item.borderWidthPx && item.borderWidthPx > 0 && (rules === 'grid' || rules === 'outer') && item.borderColor) {
    out.push(pathRun(ctx, { kind: 'path', bbox: t, subpaths: [roundedOutline(t, radii)], stroke: { color: item.borderColor, widthPx: item.borderWidthPx } }));
  }
  return out;
}
