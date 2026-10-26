// The units to place (a balloon or a group of joined balloons, its
// variants and targets) and the scene of one panel: its live polygon,
// faces, figures and avoid zones (#1276: split out of placement.ts).
import { clipToRect, insetConvex, boundsOf, pointInRect } from '../geom.js';
import type { Body } from '../shapes.js';
import type { Rect, Point, PanelSide, LetteringPosition, LetteringPanel, LetteringForeignArt } from '../types.js';

/** One way to lay out a unit (a balloon, or a group of joined balloons):
 *  its bodies relative to the unit's anchor (the first body's centre). */
export interface UnitVariant {
  bodies: Body[];
  /** Whether this variant reshapes the text (a fallback). */
  reshaped: boolean;
  /** Union of the bodies' boxes, relative. */
  bbox: Rect;
  /** Points standing for the bodies (outline and inside), relative. */
  samples: Point[];
  /** Outline points of the bodies, relative (the outside test). */
  rim: Point[];
  /** Rotation of a sound effect, degrees (its box is the rotated one). */
  rotate?: number;
  /** Lean of a sound effect's letters, degrees (applied before `rotate`). */
  skew?: number;
  /** What the variant costs as it reads: a joined balloon set back,
   *  against the reading direction, reads out of order; a reshaped text
   *  that parts its words or phrases worse than the preferred shape. */
  cost?: number;
}

/** Where a unit's tail aims, as placement sees it. */
export type TargetSpec =
  | { kind: 'none' }
  | { kind: 'point'; point: Point }
  | { kind: 'offPanel'; toward?: Point; side?: PanelSide };

/** A unit to place. */
export interface PlaceUnit {
  id: string;
  order: number;
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  variants: UnitVariant[];
  target: TargetSpec;
  pin?: Point;
  position?: LetteringPosition;
  butt?: boolean;
  breakBorder?: boolean;
  /** The item range for diagnostics. */
  sourceStart: number;
  sourceEnd: number;
  /** A point of the art a sound effect goes to (the `sfx` anchor). */
  near?: Point;
  /** The speaker (an anchor id): whose figure the unit may cover at the
   *  lesser cost. */
  speaker?: string;
  em: number;
}

/** The outcome for one unit. */
export interface Placed {
  unit: PlaceUnit;
  variant: number;
  at: Point;
}

export interface Scene {
  panel: LetteringPanel;
  visible: Point[];
  visBox: Rect;
  faces: Rect[];
  avoid: (Rect & { guard?: boolean })[];
  /** Regions better left uncovered (the picture's safe area when the art
   *  marks nothing else): a cost per area covered, never a fault. A
   *  figure's zone (`owner`) costs {@link OTHER_FIGURE} times as much under
   *  a balloon of another speaker, and under every balloon when it touches
   *  another figure's (`contact`: arms around the other one). */
  soft: (Rect & { weight?: number; owner?: string; contact?: boolean })[];
  mouths: Point[];
  fwd: 1 | -1;
  /** The other panels' boxes. */
  neighbours: Rect[];
  /** The panels laid over this one (insets): theirs, not this panel's. */
  over: (readonly Point[])[];
  /** The page's live area. */
  limit?: Rect;
  /** How far a balloon / a sound effect breaking its border on purpose
   *  may run (the trim less the inset; the trim and the panel's bleed). */
  edge?: Rect;
  edgeSfx?: Rect;
  /** Whether the panel runs past the live area (it bleeds): a `break`
   *  balloon of a panel that does not keeps inside the live area. */
  bleeds: boolean;
  /** Other panels' balloons, their tails as drawn, and what the other
   *  panels' pictures protect (#671). */
  foreign: (Rect & { round?: boolean })[];
  foreignTails: (readonly [Point, Point])[];
  foreignArt: LetteringForeignArt[];
  /** Never covered (the fold of a spread). */
  keepOut: Rect[];
  /** The panel's polygon inside the live area (see {@link livePolygon}). */
  live: Point[];
  /** What a butted caption sits flush against: the panel's polygon, inset
   *  by half its border (the caption's outline then lies on the border). */
  buttPoly: Point[];
  /** Multiplier of the height preference (see `HEIGHT_BIASES`). */
  heightBias?: number;
}

/** The part of a panel lettering may use: its polygon, less what runs
 *  past the page's live area (a bleeding panel's art reaches the edge of
 *  the sheet; its lettering stays where the trim cannot cut it). */
export function livePolygon(panel: Pick<LetteringPanel, 'polygon' | 'limit'>): Point[] {
  if (!panel.limit) return panel.polygon.map((p) => ({ ...p }));
  const clipped = clipToRect(panel.polygon, panel.limit);
  return clipped.length >= 3 ? clipped : panel.polygon.map((p) => ({ ...p }));
}

function insetRect(r: Rect, d: number): Rect {
  const dx = Math.min(d, r.width / 2);
  const dy = Math.min(d, r.height / 2);
  return { x: r.x + dx, y: r.y + dy, width: r.width - 2 * dx, height: r.height - 2 * dy };
}

export function sceneOf(panel: LetteringPanel): Scene {
  const live = livePolygon(panel);
  let visible = insetConvex(live, panel.insetPx);
  if (visible.length < 3) visible = live;
  const trim = panel.trim ?? panel.limit;
  return {
    panel,
    visible,
    visBox: boundsOf(visible),
    // A speaker's face and a bystander's (#726) are faces alike.
    faces: [...panel.anchors.filter((a) => a.face).map((a) => a.face!), ...(panel.faces ?? [])],
    avoid: [...(panel.avoid ?? [])],
    soft: figureContacts(panel.softAvoid ?? [], panel.anchors),
    mouths: panel.anchors.filter((a) => a.visible && a.id !== 'sfx').map((a) => a.mouth),
    fwd: panel.direction === 'rtl' ? -1 : 1,
    buttPoly: buttPolygon(panel),
    neighbours: [...(panel.neighbours ?? [])],
    over: [...(panel.over ?? [])],
    ...(panel.limit ? { limit: panel.limit } : {}),
    ...(trim ? { edge: insetRect(trim, panel.insetPx), edgeSfx: panel.sheet ?? trim } : {}),
    bleeds: panel.limit !== undefined && panel.polygon.some((p) => !pointInRect(p, panel.limit!, 0.5)),
    foreign: [...(panel.foreign ?? [])],
    foreignTails: [...(panel.foreignTails ?? [])],
    foreignArt: [...(panel.foreignArt ?? [])],
    keepOut: [...(panel.keepOut ?? [])],
    live,
  };
}

/** Soft zones with `contact` marked on the figures of characters whose
 *  faces all but touch (a hug, cheek to cheek): there the arms of one lie
 *  over the other, and no speaker's own figure is free to cover. Two
 *  figures merely standing side by side are not in contact. */
function figureContacts(zones: readonly (Rect & { weight?: number; owner?: string })[], anchors: LetteringPanel['anchors']): Scene['soft'] {
  const faceOf = (id: string) => anchors.find((a) => a.id === id)?.face;
  const touching = (a: Rect, b: Rect) => {
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width);
    const gy = Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
    return gx <= 0.25 * Math.min(a.width, b.width) && gy <= 0.25 * Math.min(a.height, b.height);
  };
  return zones.map((z) => {
    const f = z.owner !== undefined ? faceOf(z.owner) : undefined;
    const contact = f !== undefined && anchors.some((a) => a.id !== z.owner && a.face !== undefined && touching(f, a.face));
    return contact ? { ...z, contact: true } : { ...z };
  });
}

function buttPolygon(panel: LetteringPanel): Point[] {
  const half = (panel.borderPx ?? 0) / 2;
  const live = livePolygon(panel);
  if (half <= 0) return live;
  const poly = insetConvex(live, half);
  return poly.length >= 3 ? poly : live;
}
