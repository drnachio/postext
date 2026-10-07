/**
 * The geometry of the balloon drag of the previews (#571): which balloon
 * lies under the pointer, the balloons that move with it (a joined group),
 * where a drag puts the group's first balloon, and that point written as a
 * pin: fractions of the panel's picture (the inverse of the engine's
 * `comicArtPointToPage`, mirrored art included), or of the cell for a panel
 * without one, so the pin survives crops and splitter drags.
 *
 * Pure: everything is in sheet pixels (`VDTComicPage` coordinates).
 */

import { comicArtPointToPage, comicArtRectToPage, pointInPolygon, type BoundingBox, type Resource, type VDTComicBalloon, type VDTComicPage, type VDTComicPanel, type VDTPoint } from 'postext';

/** The step of an arrow key (percent of the picture, or of the cell). */
export const BALLOON_NUDGE_PERCENT = 1;
/** The step of Shift with an arrow key (percent). */
export const BALLOON_NUDGE_SHIFT_PERCENT = 5;

/** A point turned `deg` degrees (clockwise on the page) about `c`. */
export function rotateAbout(p: VDTPoint, c: VDTPoint, deg: number): VDTPoint {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export const boxCentre = (b: BoundingBox): VDTPoint => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/** Whether a sheet point lies on a balloon: inside its box, turned with the
 *  balloon (a rotated sound effect), grown by `slop` px. */
export function onBalloon(b: VDTComicBalloon, x: number, y: number, slop = 0): boolean {
  const c = boxCentre(b.bbox);
  const p = rotateAbout({ x, y }, c, -(b.rotate ?? 0));
  return p.x >= b.bbox.x - slop && p.x <= b.bbox.x + b.bbox.width + slop && p.y >= b.bbox.y - slop && p.y <= b.bbox.y + b.bbox.height + slop;
}

/** The order the balloons are painted in: the lettering in reading order,
 *  then the sound effects over it. */
export function balloonPaintOrder(comic: VDTComicPage): VDTComicBalloon[] {
  const sfx = (b: VDTComicBalloon) => (b.kind ?? (b.style === 'sfx' ? 'sfx' : 'balloon')) === 'sfx';
  return [...comic.balloons.filter((b) => !sfx(b)), ...comic.balloons.filter(sfx)];
}

/** The balloon under `(x, y)`: the last painted (the one on top). */
export function balloonAt(comic: VDTComicPage, x: number, y: number, slop = 0): VDTComicBalloon | null {
  const order = balloonPaintOrder(comic);
  for (let i = order.length - 1; i >= 0; i--) {
    if (onBalloon(order[i]!, x, y, slop)) return order[i]!;
  }
  return null;
}

/** The balloons of a balloon's join group, in script order (the first
 *  carries the outline and the tail; its line is the one pinned). */
export function balloonGroup(comic: VDTComicPage, b: VDTComicBalloon): VDTComicBalloon[] {
  return comic.balloons
    .filter((o) => o.panelIndex === b.panelIndex && o.group === b.group)
    .sort((p, q) => p.order - q.order);
}

/** The panel a balloon belongs to. */
export function balloonPanel(comic: VDTComicPage, b: Pick<VDTComicBalloon, 'panelIndex'>): VDTComicPanel | null {
  return comic.panels.find((p) => p.index === b.panelIndex) ?? null;
}

/** Where a pin given in fractions lands on the page: on the panel's
 *  picture (mirrored art flips it), else on its cell. The engine's own
 *  reading of `at`. */
export function pinToPage(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, at: { x: number; y: number }): VDTPoint {
  if (panel.art) return comicArtPointToPage(panel.art, at.x, at.y);
  return { x: panel.bbox.x + at.x * panel.bbox.width, y: panel.bbox.y + at.y * panel.bbox.height };
}

/** A sheet point as a pin: fractions of the panel's picture as stored (the
 *  inverse of {@link pinToPage}; a mirrored picture flips `x`), else of
 *  the cell. */
export function pageToPin(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, p: VDTPoint): { x: number; y: number } {
  const box = panel.art?.box ?? panel.bbox;
  const u = box.width > 0 ? (p.x - box.x) / box.width : 0;
  const v = box.height > 0 ? (p.y - box.y) / box.height : 0;
  return { x: panel.art?.mirrored ? 1 - u : u, y: v };
}

/** A pin rounded as it is written (a tenth of a percent). */
export function roundPin(at: { x: number; y: number }): { x: number; y: number } {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { x: r(at.x), y: r(at.y) };
}

/** The centre the drag of a group moves: its pin when the line is pinned
 *  (exact, so a drag back to the start writes what was there), else the
 *  centre of its first balloon's box, which the engine puts on the pin. */
export function balloonGrabCentre(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, first: VDTComicBalloon, pinned?: { x: number; y: number }): VDTPoint {
  return pinned ? pinToPage(panel, pinned) : boxCentre(first.bbox);
}

export interface BalloonDragOptions {
  /** Shift: keep to the axis the pointer travelled further along. */
  axisLock?: boolean;
  /** The box round the moving group: it is kept inside the panel's box
   *  along each axis it fits in. */
  box?: BoundingBox;
}

/** The travel along one axis that keeps `[lo, hi]` (the group) inside
 *  `[min, max]` (the panel), or its centre `c` when the group is larger. */
function clampTravel(d: number, c: number, lo: number, hi: number, min: number, max: number): number {
  if (hi - lo <= max - min) return Math.max(min - lo, Math.min(max - hi, d));
  return Math.max(min - c, Math.min(max - c, d));
}

/** How far a drag moves a balloon: the pointer's travel since the grab,
 *  kept to one axis with `axisLock`, and cut so the group stays inside the
 *  panel's box (its centre, at least). */
export function dragBalloon(centre: VDTPoint, grab: VDTPoint, pointer: VDTPoint, bounds: BoundingBox, opts: BalloonDragOptions = {}): VDTPoint {
  let dx = pointer.x - grab.x;
  let dy = pointer.y - grab.y;
  if (opts.axisLock) {
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;
  }
  const box = opts.box ?? { x: centre.x, y: centre.y, width: 0, height: 0 };
  return {
    x: clampTravel(dx, centre.x, box.x, box.x + box.width, bounds.x, bounds.x + bounds.width),
    y: clampTravel(dy, centre.y, box.y, box.y + box.height, bounds.y, bounds.y + bounds.height),
  };
}

/** How far a sound effect turns when the pointer goes round its centre
 *  `c` from `grab` to `pointer` (degrees, clockwise on the page); Shift
 *  snaps the result (`from` + the turn) to 15°. */
export function turnAngle(c: VDTPoint, grab: VDTPoint, pointer: VDTPoint, from: number, snap = false): number {
  const a0 = Math.atan2(grab.y - c.y, grab.x - c.x);
  const a1 = Math.atan2(pointer.y - c.y, pointer.x - c.x);
  let d = ((a1 - a0) * 180) / Math.PI;
  d = ((d % 360) + 540) % 360 - 180;
  const to = from + d;
  return snap ? Math.round(to / 15) * 15 : Math.round(to);
}

/** The sheet travel of an arrow key: `percent` of the panel's picture (or
 *  cell) along `dir`, on the page (so → moves right on mirrored art too). */
export function nudgeDelta(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, dir: { x: number; y: number }, percent: number): VDTPoint {
  const box = panel.art?.box ?? panel.bbox;
  return { x: (dir.x * percent * box.width) / 100, y: (dir.y * percent * box.height) / 100 };
}

/** The pin a group's first balloon gets when its centre moves by `delta`. */
export function pinAfterMove(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, centre: VDTPoint, delta: VDTPoint): { x: number; y: number } {
  return roundPin(pageToPin(panel, { x: centre.x + delta.x, y: centre.y + delta.y }));
}

/** The subpaths of an outline's path data (`M`/`L`/`C`/`Z`, absolute, as
 *  the lettering writes it) as polygons, each curve cut into `steps`
 *  segments. */
export function flattenPath(d: string, steps = 8): VDTPoint[][] {
  const out: VDTPoint[][] = [];
  let cur: VDTPoint[] = [];
  let at: VDTPoint = { x: 0, y: 0 };
  const re = /([MLCZ])([^MLCZ]*)/gi;
  let m: RegExpExecArray | null;
  const flush = () => {
    if (cur.length > 1) out.push(cur);
    cur = [];
  };
  while ((m = re.exec(d)) !== null) {
    const n = m[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    switch (m[1]!.toUpperCase()) {
      case 'M':
        flush();
        for (let i = 0; i + 1 < n.length; i += 2) {
          at = { x: n[i]!, y: n[i + 1]! };
          cur.push(at);
        }
        break;
      case 'L':
        for (let i = 0; i + 1 < n.length; i += 2) {
          at = { x: n[i]!, y: n[i + 1]! };
          cur.push(at);
        }
        break;
      case 'C':
        for (let i = 0; i + 5 < n.length; i += 6) {
          const p0 = at;
          const p1 = { x: n[i]!, y: n[i + 1]! };
          const p2 = { x: n[i + 2]!, y: n[i + 3]! };
          const p3 = { x: n[i + 4]!, y: n[i + 5]! };
          for (let k = 1; k <= steps; k++) {
            const t = k / steps;
            const s = 1 - t;
            cur.push({
              x: s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
              y: s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
            });
          }
          at = p3;
        }
        break;
      default:
        flush();
    }
  }
  flush();
  return out;
}

/** The corners of a balloon's box, turned with it. */
function boxPolygon(b: VDTComicBalloon): VDTPoint[] {
  const { x, y, width: w, height: h } = b.bbox;
  const c = boxCentre(b.bbox);
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map((p) => rotateAbout(p, c, b.rotate ?? 0));
}

/** The outline of a group moved by `delta`: its compound outline (bodies,
 *  necks and tail), else the boxes of balloons drawn without one (sound
 *  effects, floating text). */
export function balloonGhost(members: readonly VDTComicBalloon[], delta: VDTPoint): VDTPoint[][] {
  const out: VDTPoint[][] = [];
  const move = (p: VDTPoint) => ({ x: p.x + delta.x, y: p.y + delta.y });
  const shaped = members.find((b) => b.shape?.d);
  if (shaped) {
    const c = boxCentre(shaped.bbox);
    for (const poly of flattenPath(shaped.shape!.d)) out.push(poly.map((p) => move(rotateAbout(p, c, shaped.rotate ?? 0))));
  }
  for (const b of members) {
    if (b === shaped || (shaped && !b.shape)) continue;
    out.push(boxPolygon(b).map(move));
  }
  return out;
}

/** The box round a group (the union of its balloons' boxes). */
export function groupBox(members: readonly VDTComicBalloon[]): BoundingBox {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of members) {
    for (const p of boxPolygon(b)) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: 0, height: 0 };
}

// ---------------------------------------------------------------------------
// Tails (#580)
// ---------------------------------------------------------------------------

/** The reach of a tail tip's hit circle (CSS px, whatever the zoom). */
export const TAIL_HIT_SCREEN_PX = 7;

/** The balloon whose tail tip lies within `radius` of `(x, y)` (the one
 *  painted on top when two are that close); null elsewhere. */
export function tailTipAt(comic: VDTComicPage, x: number, y: number, radius: number): VDTComicBalloon | null {
  const order = balloonPaintOrder(comic);
  let best: VDTComicBalloon | null = null;
  let bestD = radius;
  for (let i = order.length - 1; i >= 0; i--) {
    const b = order[i]!;
    if (!b.tailTip) continue;
    const d = Math.hypot(b.tailTip.x - x, b.tailTip.y - y);
    if (d <= bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

/** A tail target as written (`to="x% y%"`): fractions of the panel's
 *  picture (mirrored art flipped, crops included), or of its cell, rounded
 *  to a tenth of a percent and kept on the picture (a target on its
 *  cropped part points the tail at the border, toward it). */
export function pageToTailTarget(panel: Pick<VDTComicPanel, 'art' | 'bbox'>, p: VDTPoint): { x: number; y: number } {
  const at = roundPin(pageToPin(panel, p));
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(at.x), y: clamp(at.y) };
}

/** Where a tail points now, on the page: its written `to`, else the mouth
 *  of its speaker's anchor on the panel's picture, else its tip. */
export function tailTargetNow(
  panel: Pick<VDTComicPanel, 'art' | 'bbox'>,
  tip: VDTPoint,
  to?: { x: number; y: number },
  mouth?: { x: number; y: number },
): VDTPoint {
  if (to) return pinToPage(panel, to);
  if (mouth && panel.art) return comicArtPointToPage(panel.art, mouth.x, mouth.y);
  return tip;
}

/** Where the line from a box's centre to `target` leaves the ellipse the
 *  box holds: the base a tail grows from, near enough for a preview. */
export function ellipseExit(box: BoundingBox, target: VDTPoint): VDTPoint {
  const c = boxCentre(box);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const rx = box.width / 2;
  const ry = box.height / 2;
  const k = rx > 0 && ry > 0 ? Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) : 0;
  if (k <= 1) return target;
  return { x: c.x + dx / k, y: c.y + dy / k };
}

// ---------------------------------------------------------------------------
// Where a dragged balloon would land (#580)
// ---------------------------------------------------------------------------

/** The regions of a panel no balloon should cover, on the page: the faces
 *  its picture marks, a guard over each speaker whose anchor marks none
 *  (the engine's: a few `em` round the mouth, mostly above it), and the
 *  picture's avoid zones. */
export function balloonKeepOut(panel: Pick<VDTComicPanel, 'art'>, resource: Pick<Resource, 'anchors' | 'avoid'> | undefined, em: number): { faces: BoundingBox[]; avoid: BoundingBox[] } {
  const art = panel.art;
  if (!art || !resource) return { faces: [], avoid: [] };
  const faces: BoundingBox[] = [];
  for (const a of resource.anchors ?? []) {
    if (a.face) {
      faces.push(comicArtRectToPage(art, a.face));
      continue;
    }
    if (a.id === 'sfx' || em <= 0) continue;
    const mouth = comicArtPointToPage(art, a.x, a.y);
    const head = a.head ? comicArtPointToPage(art, a.head.x, a.head.y) : mouth;
    const x0 = Math.min(mouth.x, head.x) - 1.6 * em;
    const x1 = Math.max(mouth.x, head.x) + 1.6 * em;
    const y0 = Math.min(mouth.y, head.y) - 2.6 * em;
    const y1 = Math.max(mouth.y, head.y) + 0.7 * em;
    faces.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return { faces, avoid: (resource.avoid ?? []).map((r) => comicArtRectToPage(art, r)) };
}

/** The type size of a balloon's lettering (px), read from its first text
 *  block's font; 0 when it has none. */
export function balloonEm(b: Pick<VDTComicBalloon, 'text'>): number {
  const font = b.text[0]?.fontString ?? '';
  const m = /(\d+(?:\.\d+)?)px/.exec(font);
  return m ? Number(m[1]) : 0;
}

const overlapArea = (a: BoundingBox, b: BoundingBox): number => {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/** How far a point lies outside a polygon (0 inside): its distance to
 *  the nearest edge. */
function outsideBy(poly: readonly VDTPoint[], p: VDTPoint): number {
  if (pointInPolygon(poly, p)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** How far a group moved by `delta` runs out of a panel: the furthest
 *  point of its outline (its boxes, for balloons drawn without one). */
export function groupOutsideBy(members: readonly VDTComicBalloon[], delta: VDTPoint, polygon: readonly VDTPoint[]): number {
  if (polygon.length < 3) return 0;
  let worst = 0;
  for (const poly of balloonGhost(members, delta)) for (const p of poly) worst = Math.max(worst, outsideBy(polygon, p));
  return worst;
}

/** What is wrong with a group dropped `delta` away: its bodies would cover
 *  a face or an avoid zone (more than a sliver: 2 % of the body), or run
 *  out of the panel further than where it was laid out (by more than
 *  `slack` px: a balloon wider than its panel is not flagged for staying
 *  as far out; never for a line written with `break`). */
export interface BalloonDropIssues {
  face: boolean;
  avoid: boolean;
  outside: boolean;
}

export function balloonDropIssues(
  members: readonly VDTComicBalloon[],
  delta: VDTPoint,
  panel: Pick<VDTComicPanel, 'polygon'>,
  keepOut: { faces: readonly BoundingBox[]; avoid: readonly BoundingBox[] },
  opts: { breakBorder?: boolean; slack?: number } = {},
): BalloonDropIssues {
  const slack = opts.slack ?? 1;
  const out: BalloonDropIssues = { face: false, avoid: false, outside: false };
  for (const b of members) {
    const moved = { x: b.bbox.x + delta.x, y: b.bbox.y + delta.y, width: b.bbox.width, height: b.bbox.height };
    const sliver = Math.max(1, moved.width * moved.height * 0.02);
    if (keepOut.faces.some((f) => overlapArea(moved, f) > sliver)) out.face = true;
    if (keepOut.avoid.some((f) => overlapArea(moved, f) > sliver)) out.avoid = true;
  }
  if (!opts.breakBorder) {
    const before = groupOutsideBy(members, { x: 0, y: 0 }, panel.polygon);
    out.outside = groupOutsideBy(members, delta, panel.polygon) > before + slack;
  }
  return out;
}
