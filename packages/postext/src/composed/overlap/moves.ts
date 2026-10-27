// Covered ink, overruns past a frame's host and the move that clears them.
import type { VDTFrame, ContentWarning, FrameOutsideProposal } from '../../vdt.js';
import type { Dimension } from '../../types.js';
import { physicalEdge } from '../../design/logicalEdges.js';
import { dimensionToPx } from '../../units.js';
import { type Rect, anchorOn } from '../geometry.js';
import { frameContentRect, frameMatrix } from '../paint.js';
import { anchorTarget } from '../templates.js';
import type { ResolvedFrame } from '../types.js';
import type { OverlapCheckInput } from '../overlap.js';
import { type Ink, intersect, ELEMENT_EDGES, mapRect, MIN_EXCESS_MM, r1 } from './ink.js';

/** A covering pair the check found. */
export interface CoverPair {
  under: VDTFrame;
  over: VDTFrame;
  /** px². */
  area: number;
  words?: string;
  picture?: string;
  hitLine: boolean;
  /** The covered frame's ink that is hit, and the covering ink over it. */
  hitBoxes: Rect[];
  hitCovers: Rect[];
}

/** A frame's ink on the sheet: all it paints, and what of it hides what is
 *  under it. */
export interface FrameInk {
  all: Ink[];
  covers: Ink[];
}

/** What the page would be with `moved` shifted by (dx, dy) px (#1075):
 *  `clear`, the pair `target` no longer covers; `outside`, a moved frame
 *  runs further past what holds it; `blockers`, pieces of ink (`m` of a
 *  moved frame, where it lies now; `b` of another) that would cover each
 *  other in a pair no warning names. */
export type MoveTest = (moved: ReadonlySet<string>, dx: number, dy: number, target?: string) => { clear: boolean; outside: boolean; blockers: Array<{ m: Rect; b: Rect }> };

export const pairKey = (under: string, over: string): string => `${under}<${over}`;

/** The cuts of `ink` by `covers` deeper than `depth` on both sides. A
 *  covering picture with a shape (#1123) cuts by its rows: the pieces
 *  under them, deeper than `depth` taken together. */
export function inkCuts(ink: Ink, covers: readonly Ink[], depth: number): Array<{ cut: Rect; c: Ink }> {
  return covers.flatMap((c) => {
    // A line over a picture hides a hairline of it, not the picture:
    // whether the words read on it is the contrast check's matter.
    if (ink.kind === 'picture' && c.kind === 'text') return [];
    const cut = intersect(ink.box, c.box);
    if (!cut || cut.width < depth || cut.height < depth) return [];
    if (!c.shape) return [{ cut, c }];
    const pieces = c.shape.flatMap((r) => intersect(ink.box, r) ?? []);
    if (pieces.length === 0) return [];
    const x0 = Math.min(...pieces.map((p) => p.x));
    const y0 = Math.min(...pieces.map((p) => p.y));
    const x1 = Math.max(...pieces.map((p) => p.x + p.width));
    const y1 = Math.max(...pieces.map((p) => p.y + p.height));
    if (x1 - x0 < depth || y1 - y0 < depth) return [];
    return pieces.map((p) => ({ cut: p, c }));
  });
}

/** The frame or group a frame is anchored inside (a nine-point anchor on
 *  `'#name'` whose point, offset added, lies in that box), and its box as
 *  `hostOf` gives it. An `'allow'` host is not one. */
export function insideHost(rf: ResolvedFrame, input: OverlapCheckInput, hostOf: (name: string) => Rect | undefined, allows: (name: string) => boolean): { target: string; box: Rect } | undefined {
  const target = rf.grid ? undefined : anchorTarget(rf.placement);
  if (!target || !rf.placement) return undefined;
  const edge = physicalEdge(rf.placement.anchor.edge, false);
  if (ELEMENT_EDGES.has(edge)) return undefined;
  const hostBox = hostOf(target);
  if (!hostBox || allows(target)) return undefined;
  const a = anchorOn(edge, hostBox, true);
  const ax = a.x + lengthPx(rf.placement.offset?.x, input.dpi, input.emPx);
  const ay = a.y + lengthPx(rf.placement.offset?.y, input.dpi, input.emPx);
  const eps = 0.5;
  if (ax < hostBox.x - eps || ax > hostBox.x + hostBox.width + eps || ay < hostBox.y - eps || ay > hostBox.y + hostBox.height + eps) return undefined;
  return { target, box: hostBox };
}

/** A frame's box on the sheet: its content box put there by its matrix. */
export function hostRect(f: VDTFrame): Rect {
  return mapRect(frameContentRect(f), frameMatrix(f));
}

const lengthPx = (d: Dimension | undefined, dpi: number, emPx: number): number => (d ? dimensionToPx(d, dpi, emPx) : 0);

interface Overrun {
  top: number;
  right: number;
  bottom: number;
  left: number;
  max: number;
  /** The ink is no wider (`fitsX`) or taller (`fitsY`) than the limit: a
   *  move can bring it in along that axis. */
  fitsX: boolean;
  fitsY: boolean;
}

/** How far the union of `boxes` runs past `limit` on each side, px. */
export function overrun(boxes: readonly Rect[], limit: Rect): Overrun {
  let top = 0;
  let right = 0;
  let bottom = 0;
  let left = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.width);
    y1 = Math.max(y1, b.y + b.height);
    top = Math.max(top, limit.y - b.y);
    left = Math.max(left, limit.x - b.x);
    bottom = Math.max(bottom, b.y + b.height - (limit.y + limit.height));
    right = Math.max(right, b.x + b.width - (limit.x + limit.width));
  }
  return { top, right, bottom, left, max: Math.max(top, right, bottom, left), fitsX: x1 - x0 <= limit.width + 0.5, fitsY: y1 - y0 <= limit.height + 0.5 };
}

export function outsideWarning(
  f: VDTFrame,
  rf: ResolvedFrame,
  past: 'trim' | 'bleed' | 'frame' | 'group',
  target: string | undefined,
  o: Overrun,
  mmPx: number,
  base: (f: VDTFrame) => { template: string; frame: string; fenceIndex: number; configPath: string },
  where: (f: VDTFrame) => { sourceStart?: number; sourceEnd?: number; pageIndex: number },
  locale: { locale?: string },
  byName: ReadonlyMap<string, VDTFrame>,
  /** Whether a shift (px) of the frame lands clear of the page's other
   *  frames (#1075). */
  moveIsClear: (dx: number, dy: number) => boolean,
): ContentWarning {
  const mm = (px: number): number | undefined => (px >= MIN_EXCESS_MM * mmPx ? r1(px / mmPx) : undefined);
  const sides: { top?: number; right?: number; bottom?: number; left?: number } = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const v = mm(o[side]);
    if (v !== undefined) sides[side] = v;
  }
  const proposals: FrameOutsideProposal[] = [];
  // Which side of its box the frame's placement holds: a smaller height
  // brings a frame held by its top in at the foot, half as much one held
  // by its middle, and none held by its foot.
  const pinY = rf.grid || !rf.placement ? 'start' : anchorOn(physicalEdge(rf.placement.anchor.edge, false), { x: 0, y: 0, width: 1, height: 1 }, anchorTarget(rf.placement) !== undefined).pinY;
  const min = MIN_EXCESS_MM * mmPx;
  if (o.bottom >= min && !f.rotate && pinY !== 'end') {
    // The frame held to the room it has: its height less what runs past,
    // in whole millimetres down.
    const room = Math.floor((f.rect.height - (pinY === 'middle' ? 2 : 1) * o.bottom) / mmPx);
    if (room > 0) {
      proposals.push({ kind: 'maxHeight', path: `${f.configPath}/maxHeight`, value: mmDim(room) });
      const holdsText = f.blockIds.length > 1;
      if (holdsText && !rf.overflow.continueIn && !rf.next) proposals.push({ kind: 'continueNextPage', path: `${f.configPath}/overflow/continueIn`, value: 'next-page' });
    }
    // The frame it is anchored inside grown to hold it.
    const host = target !== undefined ? byName.get(target) : undefined;
    if (host && !host.rotate) {
      const need = Math.ceil((host.rect.height + o.bottom) / mmPx);
      proposals.push({ kind: 'minHeight', path: `${host.configPath}/minHeight`, value: mmDim(need), frame: host.name });
    }
  }
  // The shift that brings it in, when only one side of each axis runs
  // past (data only).
  const dx = !o.fitsX ? 0 : o.left >= min && o.right < min ? o.left : o.right >= min && o.left < min ? -o.right : 0;
  const dy = !o.fitsY ? 0 : o.top >= min && o.bottom < min ? o.top : o.bottom >= min && o.top < min ? -o.bottom : 0;
  // Proposed only where it lands clear of the page's other frames (#1075).
  const dxMm = r1(dx / mmPx) + 0;
  const dyMm = r1(dy / mmPx) + 0;
  if ((dx !== 0 || dy !== 0) && moveIsClear(dxMm * mmPx, dyMm * mmPx)) proposals.push({ kind: 'move', frame: f.name, dxMm, dyMm });
  return {
    kind: 'frameOutsideArea',
    ...base(f),
    past,
    ...(target !== undefined ? { target } : {}),
    excessMm: r1(o.max / mmPx),
    sides,
    ...locale,
    proposals,
    ...where(f),
  };
}

const mmDim = (value: number): Dimension => ({ value, unit: 'mm' });

/** Up to this many times a move is pushed on past the frame it would land
 *  on before the direction is given up. */
const MAX_MOVE_STEPS = 8;

/** `mm` rounded away from zero to 0.1 mm: a proposal never falls short. */
const ceil1 = (mm: number): number => Math.ceil(mm * 10 - 1e-6) / 10;

/**
 * The smallest shift of the covering frame along one axis that takes its
 * ink off the covered ink and lands clear (#1075), in mm; undefined when no
 * direction does. Each of the four directions starts at the distance that
 * takes the covering boxes off the covered ones; where `test` finds that the
 * moved frames would come to cover another frame (or be covered by one), the
 * move goes on past that frame's ink and is tested again; a direction stops
 * when the pair is not cleared or a moved frame runs past what holds it.
 */
export function clearingMove(covered: readonly Rect[], covers: readonly Rect[], mmPx: number, test: (dx: number, dy: number) => ReturnType<MoveTest>): { dxMm: number; dyMm: number } | undefined {
  if (covered.length === 0 || covers.length === 0) return undefined;
  const u = (rs: readonly Rect[]): Rect => {
    const x = Math.min(...rs.map((r) => r.x));
    const y = Math.min(...rs.map((r) => r.y));
    return { x, y, width: Math.max(...rs.map((r) => r.x + r.width)) - x, height: Math.max(...rs.map((r) => r.y + r.height)) - y };
  };
  const a = u(covered);
  const c = u(covers);
  /** Each direction: its unit vector, the distance that takes the covers
   *  off the covered ink, and the distance that takes a moved piece `m`
   *  past a piece `b` (px). */
  const directions: Array<{ ux: number; uy: number; start: number; past: (m: Rect, b: Rect) => number }> = [
    { ux: 1, uy: 0, start: a.x + a.width - c.x, past: (m, b) => b.x + b.width - m.x },
    { ux: -1, uy: 0, start: c.x + c.width - a.x, past: (m, b) => m.x + m.width - b.x },
    { ux: 0, uy: 1, start: a.y + a.height - c.y, past: (m, b) => b.y + b.height - m.y },
    { ux: 0, uy: -1, start: c.y + c.height - a.y, past: (m, b) => m.y + m.height - b.y },
  ];
  let best: { mm: number; dxMm: number; dyMm: number } | undefined;
  for (const d of directions) {
    let mm = ceil1(Math.max(0, d.start) / mmPx);
    for (let step = 0; step < MAX_MOVE_STEPS && mm > 0 && (!best || mm < best.mm); step++) {
      const t = test(d.ux * mm * mmPx, d.uy * mm * mmPx);
      if (!t.clear || t.outside) break;
      if (t.blockers.length === 0) {
        best = { mm, dxMm: d.ux * mm, dyMm: d.uy * mm };
        break;
      }
      const next = ceil1(Math.max(...t.blockers.map((p) => d.past(p.m, p.b))) / mmPx);
      if (!(next > mm)) break;
      mm = next;
    }
  }
  // `+ 0` turns a -0 into 0.
  return best ? { dxMm: best.dxMm + 0, dyMm: best.dyMm + 0 } : undefined;
}
