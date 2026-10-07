/**
 * The geometry of the comic page tools of the previews (#568): which
 * splitter or panel lies under the pointer, where a drag puts a split line
 * (clamped, snapped, one end only), how the panels beside it change while
 * it moves, and which of them would then show their art letterboxed.
 *
 * Pure: everything is in sheet pixels (`VDTComicPage` coordinates) and
 * percent of the splitter's parent cell, as the engine writes them.
 */

import {
  COMIC_MIN_CELL_PERCENT,
  comicCropFeasibleRange,
  pointInPolygon,
  polygonBBox,
  type Resource,
  type VDTComicPage,
  type VDTComicPanel,
  type VDTComicSplitter,
  type VDTPoint,
} from 'postext';

/** The least width (screen px) a splitter's hit band has, however thin
 *  its gutter. */
export const SPLITTER_HIT_MIN_SCREEN_PX = 8;
/** The step a Shift drag snaps to (percent). */
export const SPLITTER_SNAP_PERCENT = 5;

/** The distance from `p` to the segment `a → b`, with the position of its
 *  foot along it (0 at `a`, 1 at `b`). */
function segmentDistance(p: VDTPoint, a: VDTPoint, b: VDTPoint): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  const c = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(p.x - (a.x + c * dx), p.y - (a.y + c * dy)), t };
}

/**
 * The splitter whose gutter lies under `(x, y)`: the band around its
 * centre line as wide as the gutter, and at least `minBand` (sheet px)
 * wide. The nearest one when two meet.
 */
export function splitterAt(comic: VDTComicPage, x: number, y: number, minBand: number): VDTComicSplitter | null {
  let best: VDTComicSplitter | null = null;
  let bestD = Infinity;
  let bestInside = -Infinity;
  for (const s of comic.splitters) {
    const { d, t } = segmentDistance({ x, y }, s.a, s.b);
    if (t < 0 || t > 1) continue;
    const half = Math.max(s.gutter, minBand) / 2;
    if (d > half) continue;
    // Where a line ends on another (a T), both are under the pointer: the
    // one it lies along, not at the end of, wins.
    const inside = Math.min(t, 1 - t) * Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
    if (d < bestD - half / 2 || (d < bestD + half / 2 && inside > bestInside)) {
      best = s;
      bestD = d;
      bestInside = inside;
    }
  }
  return best;
}

/** The panel under `(x, y)`: the last in paint order (an inset over its
 *  panel), or null in a gutter. */
export function panelAt(comic: VDTComicPage, x: number, y: number): VDTComicPanel | null {
  for (let i = comic.panels.length - 1; i >= 0; i--) {
    const p = comic.panels[i]!;
    if (pointInPolygon(p.polygon, { x, y })) return p;
  }
  return null;
}

/** The resize cursor of a splitter: a line that runs more across than down
 *  moves up and down (`row-resize`), else sideways (`col-resize`). */
export function splitterCursor(s: Pick<VDTComicSplitter, 'a' | 'b'>): 'row-resize' | 'col-resize' {
  return Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y) ? 'row-resize' : 'col-resize';
}

/** The page's other splitters of the same list: the lines before and after
 *  this one. */
function neighbours(comic: VDTComicPage, s: VDTComicSplitter): { prev?: VDTComicSplitter; next?: VDTComicSplitter } {
  const same = (o: VDTComicSplitter, b: number) => o.boundary === b && o.path.length === s.path.length && o.path.every((v, i) => v === s.path[i]);
  const prev = comic.splitters.find((o) => same(o, s.boundary - 1));
  const next = comic.splitters.find((o) => same(o, s.boundary + 1));
  return { ...(prev ? { prev } : {}), ...(next ? { next } : {}) };
}

/** Whether a splitter's lines count from the right (columns of a page read
 *  right to left). */
function fromRight(comic: VDTComicPage, s: VDTComicSplitter): boolean {
  return s.axis === 'columns' && comic.direction === 'rtl';
}

/** The percent of the parent cell a sheet point sits at, along the
 *  splitter's axis. */
export function percentAt(comic: VDTComicPage, s: VDTComicSplitter, p: VDTPoint): number {
  const { parent } = s;
  if (s.axis === 'rows') return parent.height > 0 ? ((p.y - parent.y) / parent.height) * 100 : 0;
  if (parent.width <= 0) return 0;
  return fromRight(comic, s) ? ((parent.x + parent.width - p.x) / parent.width) * 100 : ((p.x - parent.x) / parent.width) * 100;
}

/** The sheet point at `percent` along the axis, `t` along the cross axis
 *  (0 at the line's start end). */
function pointAt(comic: VDTComicPage, s: VDTComicSplitter, percent: number, t: number): VDTPoint {
  const { parent } = s;
  if (s.axis === 'rows') {
    const x0 = s.a.x;
    const x1 = s.b.x;
    return { x: x0 + t * (x1 - x0), y: parent.y + (percent / 100) * parent.height };
  }
  const x = fromRight(comic, s) ? parent.x + parent.width - (percent / 100) * parent.width : parent.x + (percent / 100) * parent.width;
  return { x, y: s.a.y + t * (s.b.y - s.a.y) };
}

/** Where along the cross axis a sheet point sits (0 at the line's start
 *  end, 1 at its far end). */
function crossAt(s: VDTComicSplitter, p: VDTPoint): number {
  const t = s.axis === 'rows'
    ? (s.b.x !== s.a.x ? (p.x - s.a.x) / (s.b.x - s.a.x) : 0)
    : (s.b.y !== s.a.y ? (p.y - s.a.y) / (s.b.y - s.a.y) : 0);
  return Math.max(0, Math.min(1, t));
}

/** A line position at each end (percent). */
export interface SplitterPosition {
  start: number;
  end: number;
}

/** The range each end of a line may move in, the lines either side of it
 *  each keeping their cell its 5 %. */
export function splitterEndRanges(comic: VDTComicPage, s: VDTComicSplitter): { start: [number, number]; end: [number, number] } {
  const { prev, next } = neighbours(comic, s);
  const m = COMIC_MIN_CELL_PERCENT;
  return {
    start: [(prev?.startPercent ?? 0) + m, (next?.startPercent ?? 100) - m],
    end: [(prev?.endPercent ?? 0) + m, (next?.endPercent ?? 100) - m],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The line moved by `delta` percent, both ends together (its slant kept),
 *  or only the end `only` names; clamped, and snapped to 5 % with `snap`
 *  (the moved end, or the start end of a line moved whole). */
export function nudgeSplitter(
  comic: VDTComicPage,
  s: VDTComicSplitter,
  from: SplitterPosition,
  delta: number,
  opts: { snap?: boolean; only?: 'start' | 'end' } = {},
): SplitterPosition {
  const ranges = splitterEndRanges(comic, s);
  const snapTo = (v: number) => (opts.snap ? Math.round(v / SPLITTER_SNAP_PERCENT) * SPLITTER_SNAP_PERCENT : v);
  if (opts.only === 'start') {
    return { start: round1(clamp(snapTo(from.start + delta), ...ranges.start)), end: from.end };
  }
  if (opts.only === 'end') {
    return { start: from.start, end: round1(clamp(snapTo(from.end + delta), ...ranges.end)) };
  }
  const slant = from.end - from.start;
  // The start end's range with the slant kept (the engine's `min`/`max`
  // for the laid-out slant).
  const lo = Math.max(ranges.start[0], ranges.end[0] - slant);
  const hi = Math.min(ranges.start[1], ranges.end[1] - slant);
  const start = lo <= hi ? clamp(snapTo(from.start + delta), lo, hi) : from.start;
  return { start: round1(start), end: round1(start + slant) };
}

/** The end of a line nearer a sheet point. */
export function nearerEnd(s: VDTComicSplitter, p: VDTPoint): 'start' | 'end' {
  return crossAt(s, p) < 0.5 ? 'start' : 'end';
}

/**
 * Where a drag puts a line: the pointer's travel along the axis since the
 * grab, as percent of the parent cell. `snap` (Shift) snaps to 5 %;
 * `oneEnd` (Alt) moves only the end nearer the grab, slanting the line.
 */
export function dragSplitter(
  comic: VDTComicPage,
  s: VDTComicSplitter,
  grab: VDTPoint,
  pointer: VDTPoint,
  opts: { snap?: boolean; oneEnd?: boolean } = {},
): SplitterPosition {
  const delta = percentAt(comic, s, pointer) - percentAt(comic, s, grab);
  return nudgeSplitter(comic, s, { start: s.startPercent, end: s.endPercent }, delta, {
    ...(opts.snap ? { snap: true } : {}),
    ...(opts.oneEnd ? { only: nearerEnd(s, grab) } : {}),
  });
}

/** The centre line of a splitter at a position (sheet px). */
export function splitterLine(comic: VDTComicPage, s: VDTComicSplitter, pos: SplitterPosition): { a: VDTPoint; b: VDTPoint } {
  return { a: pointAt(comic, s, pos.start, 0), b: pointAt(comic, s, pos.end, 1) };
}

/** The band a splitter's gutter covers, as a polygon (sheet px): at least
 *  `minBand` wide. */
export function splitterBand(s: Pick<VDTComicSplitter, 'a' | 'b' | 'gutter'>, minBand: number): VDTPoint[] {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const half = Math.max(s.gutter, minBand) / 2;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    { x: s.a.x + nx, y: s.a.y + ny },
    { x: s.b.x + nx, y: s.b.y + ny },
    { x: s.b.x - nx, y: s.b.y - ny },
    { x: s.a.x - nx, y: s.a.y - ny },
  ];
}

/**
 * The panels on either side of a moving line, as they would be with the
 * line at `pos`: each point between the previous line (or the parent's
 * edge) and the next is stretched along the axis in proportion, so a panel
 * keeps its place within its cell. Keyed by panel index; panels elsewhere
 * on the page are left out.
 */
export function movedPanels(comic: VDTComicPage, s: VDTComicSplitter, pos: SplitterPosition): Map<number, VDTPoint[]> {
  const out = new Map<number, VDTPoint[]>();
  const { prev, next } = neighbours(comic, s);
  const lineAt = (sp: VDTComicSplitter | undefined, fallback: number, t: number, at?: SplitterPosition) => {
    if (!sp) return fallback;
    const p = at ?? { start: sp.startPercent, end: sp.endPercent };
    return p.start + t * (p.end - p.start);
  };
  const { parent } = s;
  const inParent = (p: VDTPoint) => p.x >= parent.x - 0.5 && p.x <= parent.x + parent.width + 0.5 && p.y >= parent.y - 0.5 && p.y <= parent.y + parent.height + 0.5;
  for (const panel of comic.panels) {
    const c = centroid(panel.polygon);
    if (!inParent(c)) continue;
    const tc = crossAt(s, c);
    const uc = percentAt(comic, s, c);
    if (uc <= lineAt(prev, 0, tc) || uc >= lineAt(next, 100, tc)) continue;
    const moved = panel.polygon.map((p) => {
      const t = crossAt(s, p);
      const u = percentAt(comic, s, p);
      const lp = lineAt(prev, 0, t);
      const ln = lineAt(next, 100, t);
      const l0 = lineAt(s, 50, t);
      const l1 = lineAt(s, 50, t, pos);
      let v = u;
      if (u <= l0) v = l0 - lp > 1e-6 ? lp + ((u - lp) * (l1 - lp)) / (l0 - lp) : u;
      else v = ln - l0 > 1e-6 ? l1 + ((u - l0) * (ln - l1)) / (ln - l0) : u;
      return pointAt(comic, s, v, crossOfPoint(s, p));
    });
    out.set(panel.index, moved);
  }
  return out;
}

/** The cross-axis parameter of a point, unclamped (a panel point may lie
 *  past the line's ends by a bleed). */
function crossOfPoint(s: VDTComicSplitter, p: VDTPoint): number {
  if (s.axis === 'rows') return s.b.x !== s.a.x ? (p.x - s.a.x) / (s.b.x - s.a.x) : 0;
  return s.b.y !== s.a.y ? (p.y - s.a.y) / (s.b.y - s.a.y) : 0;
}

function centroid(poly: readonly VDTPoint[]): VDTPoint {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / Math.max(1, poly.length), y: y / Math.max(1, poly.length) };
}

/** The size of a panel's picture and its safe area, when its resource
 *  has both. */
function pictureOf(resources: readonly Resource[] | null | undefined, panel: VDTComicPanel): { w: number; h: number; safeArea: NonNullable<Resource['safeArea']> } | null {
  const id = panel.art?.resourceId;
  const r = id ? resources?.find((x) => x.id === id) : undefined;
  if (!r?.safeArea) return null;
  const w = r.kind === 'bitmap' ? r.bitmap?.width : r.svg?.width;
  const h = r.kind === 'bitmap' ? r.bitmap?.height : r.svg?.height;
  if (!w || !h) return null;
  return { w, h, safeArea: r.safeArea };
}

/** Whether a cell `box` wide and high lets a cover crop keep the safe
 *  area whole. */
function feasible(pic: { w: number; h: number; safeArea: NonNullable<Resource['safeArea']> }, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return true;
  const { min, max } = comicCropFeasibleRange(pic.w, pic.h, pic.safeArea);
  const aspect = width / height;
  return aspect >= min - 1e-6 && aspect <= max + 1e-6;
}

/**
 * The panels a moved line would make letterbox their art (D9): the cell's
 * aspect leaves the range in which a cover crop keeps the picture's safe
 * area whole. A panel that letterboxes already for another reason (a
 * `contain` fit) is left out.
 */
export function letterboxedPanels(comic: VDTComicPage, moved: ReadonlyMap<number, VDTPoint[]>, resources: readonly Resource[] | null | undefined): number[] {
  const out: number[] = [];
  for (const [index, poly] of moved) {
    const panel = comic.panels[index];
    if (!panel?.art) continue;
    const pic = pictureOf(resources, panel);
    if (!pic) continue;
    const box = polygonBBox(poly);
    if (feasible(pic, box.width, box.height)) continue;
    if (panel.art.letterbox && feasible(pic, panel.bbox.width, panel.bbox.height)) continue;
    out.push(index);
  }
  return out;
}
