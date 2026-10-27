// The variants a panel's balloon units are tried in: spare shapes, joined
// groups, arrangements, and each unit's target and nearby speaker.
import { boundsOf, insetConvex, pointInConvex } from '../geom.js';
import { buildBody, type Body, translateBody } from '../shapes.js';
import { shapeTextCandidates } from '../shape-text.js';
import type { UnitVariant, TargetSpec } from '../placement.js';
import type { LetteringPanel, LetteringEnv, Point, Rect } from '../types.js';
import type { Piece, VariantMeta } from '../letter.js';

/** Fractions of a balloon's own length its spare shapes keep (more,
 *  shorter lines or columns: a short line in a close-up, set as two
 *  columns over the hair rather than one over the face). */
const SPARE_LENGTHS = [0.7, 0.5, 0.36];
/** Fractions of the panel's room the balloons of a joined group are
 *  fitted to alike in its spare variants (a narrow cell). */
const SPARE_ROOM = [0.82, 0.7, 0.6, 0.45];

/** Spare shape of `p` no longer than `maxLength` px along its lines
 *  (appended to its shapes, deduplicated); its index, or undefined when it
 *  sets the text as one of the shapes it has. */
function spareShape(p: Piece, maxLength: number): number | undefined {
  if (maxLength <= p.style.fontSizePx) return undefined;
  const s = shapeTextCandidates(p.prepared, p.style, { ...p.opts, maxLength }, 1)[0]!;
  const k = s.lines.map((l) => `${l.start}-${l.end}`).join(',');
  const same = p.shapes.findIndex((x) => x.shaped.lines.map((l) => `${l.start}-${l.end}`).join(',') === k);
  if (same >= 0) return same;
  p.shapes.push({ shaped: s, body: buildBody(s.ink, p.style.fontSizePx, p.style, p.item.id), reshaped: true });
  return p.shapes.length - 1;
}

/** The spare variants of a unit (see `extend` in {@link letterPanelDetailed}):
 *  a single balloon in shorter lines; a joined group with every balloon
 *  fitted to the same share of the room, stacked straight (columns side by
 *  side). Empty for sound effects and units that have them already. */
export function spareVariants(group: Piece[], panel: LetteringPanel, wordCut: number): { variants: UnitVariant[]; meta: VariantMeta[] } {
  const first = group[0]!;
  if (first.item.kind === 'sfx' || group.some((p) => p.shapes.length > p.main)) return { variants: [], meta: [] };
  const vertical = first.vertical;
  const along = (b: Body) => (vertical ? b.bbox.height : b.bbox.width);
  const sets: number[][] = [];
  const seen = new Set<string>();
  const add = (set: (number | undefined)[]) => {
    const full = set.map((k) => k ?? 0);
    const key = full.join(',');
    // (A single balloon in a shape it has already is no spare.)
    if ((group.length === 1 && full[0]! < first.main) || seen.has(key)) return;
    seen.add(key);
    sets.push(full);
  };
  if (group.length === 1) {
    const own = along(first.shapes[0]!.body) - 2 * first.style.padding;
    for (const f of SPARE_LENGTHS) add([spareShape(first, f * own)]);
  } else {
    const vis = boundsOf(insetConvex(panel.polygon, panel.insetPx));
    const room = vertical ? vis.height : vis.width;
    for (const f of SPARE_ROOM) {
      add(group.map((p) => (along(p.shapes[0]!.body) > f * room ? spareShape(p, f * room - 2 * p.style.padding) : 0)));
    }
  }
  const arrangements: Arrangement[] = group.length === 1 ? [{ side: false, lean: 0 }]
    : vertical ? [{ side: true, lean: 0.18 }, { side: false, lean: 0 }] : [{ side: false, lean: 0 }, { side: false, lean: 0.12 }];
  const variants: UnitVariant[] = [];
  const meta: VariantMeta[] = [];
  for (const set of sets) {
    for (const arr of arrangements) {
      const built = buildVariant(group, panel, set, arr, true, wordCut);
      variants.push(built.variant);
      meta.push(built.meta);
    }
  }
  return { variants, meta };
}

/** Consecutive balloons of one speaker and one style, joined (butted or
 *  with a connector) unless the item or the book says otherwise. */
export function groupPieces(pieces: readonly Piece[], env: LetteringEnv): Piece[][] {
  const groups: Piece[][] = [];
  for (const p of pieces) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    const mode = prev ? joinMode(prev, p, env) : 'none';
    if (mode !== 'none') last!.push({ ...p, joinPrev: mode });
    else groups.push([p]);
  }
  return groups;
}

function joinMode(prev: Piece, p: Piece, env: LetteringEnv): 'butt' | 'connector' | 'none' {
  if (p.item.kind !== 'balloon' || prev.item.kind !== 'balloon') return 'none';
  if (!p.item.speaker || p.item.speaker !== prev.item.speaker || p.style.id !== prev.style.id) return 'none';
  // A pinned line starts its group (the drag of a joined group pins its
  // first line, #571): the lines after it may still join it.
  if (p.item.pin || p.item.position) return 'none';
  if (p.item.join === false) return 'none';
  if (p.item.join === 'butt' || p.item.join === 'connector') return p.item.join;
  const def = env.joinSameSpeaker ?? 'butt';
  if (p.item.join === true) return def === 'none' ? 'butt' : def;
  return def;
}

/** Rim and inside samples of a body, relative. */
function samplesOf(body: Body): { rim: Point[]; inside: Point[] } {
  const step = Math.max(1, Math.floor(body.hull.length / 36));
  const rim = body.hull.filter((_, i) => i % step === 0);
  const coreStep = Math.max(1, Math.floor(body.core.length / 24));
  const inside: Point[] = body.core.filter((_, i) => i % coreStep === 0);
  const b = body.bbox;
  for (let iy = 1; iy < 6; iy++) {
    for (let ix = 1; ix < 6; ix++) {
      const q = { x: b.x + (ix / 6) * b.width, y: b.y + (iy / 6) * b.height };
      if (pointInConvex(q, body.core)) inside.push(q);
    }
  }
  return { rim, inside };
}

/** `p` leaned by `skew` degrees (positive: the top forward, as italic)
 *  and then turned by `deg` degrees clockwise, both about `c`. */
function rotateAbout(p: Point, c: Point, deg: number, skew = 0): Point {
  if (!deg && !skew) return p;
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x - Math.tan((skew * Math.PI) / 180) * (p.y - c.y);
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** How the bodies of a joined group sit: the next one below the one
 *  before (`side: false`) or beside it, leaning forward (`lean` > 0), straight
 *  or back. */
type Arrangement = { side: boolean; lean: number };

/** The variants a unit can be placed as: each shape of its pieces, and
 *  for a joined group each arrangement of its bodies. */
export function unitVariants(group: readonly Piece[], panel: LetteringPanel, wordCut: number): { variants: UnitVariant[]; meta: VariantMeta[] } {
  const variants: UnitVariant[] = [];
  const meta: VariantMeta[] = [];
  const shapeCount = Math.max(...group.map((p) => p.main));
  const vertical = group[0]!.vertical;
  // Arrangements of a joined group: the next body below the one before
  // (horizontal text: leaning forward, straight, back) or beside it,
  // forward and a little lower; columns go beside first (forward is to
  // the left), then below. Never beside it against the reading direction:
  // the eye would read the second first (a narrow cell stacks the group
  // and lets it run out rather than set it back). The placement keeps the
  // one whose tail runs clear and that fits the panel.
  const arrangements: Arrangement[] = group.length === 1 ? [{ side: false, lean: 0 }]
    : vertical
      ? [{ side: true, lean: 0.18 }, { side: true, lean: 0.45 }, { side: true, lean: -0.1 }, { side: false, lean: 0 }]
      : [{ side: false, lean: 0.28 }, { side: false, lean: 0 }, { side: false, lean: -0.28 }, { side: true, lean: 1 }];
  for (let k = 0; k < shapeCount; k++) {
    for (const arr of arrangements) {
      const built = buildVariant(group, panel, group.map((p) => Math.min(k, p.main - 1)), arr, k > 0, wordCut);
      variants.push(built.variant);
      meta.push(built.meta);
    }
  }
  return { variants, meta };
}

/** One variant of a unit: each piece in its shape `shapeIndex[i]`, the
 *  bodies arranged as `arr`. */
function buildVariant(group: readonly Piece[], panel: LetteringPanel, shapeIndex: number[], arr: Arrangement, reshaped: boolean, wordCut = 0): { variant: UnitVariant; meta: VariantMeta } {
  const fwd = panel.direction === 'rtl' ? -1 : 1;
  const vertical = group[0]!.vertical;
  const bodies: Body[] = [];
  const shifts: Point[] = [];
  group.forEach((p, i) => {
    const local = p.shapes[shapeIndex[i]!]!.body;
    let shift: Point;
    if (i === 0) shift = { x: -local.centre.x, y: -local.centre.y };
    else {
      const prev = bodies[i - 1]!;
      const join = p.joinPrev ?? 'butt';
      const em = p.style.fontSizePx;
      const pw = prev.bbox.width;
      const ph = prev.bbox.height;
      const w = local.bbox.width;
      const h = local.bbox.height;
      let cx: number;
      let cy: number;
      if (!vertical && !arr.side) {
        const overlap = join === 'butt' ? 0.2 * Math.min(ph, h) : -0.9 * em;
        cy = prev.bbox.y + ph - overlap + h / 2;
        cx = prev.centre.x + fwd * arr.lean * Math.min(pw, w) * 1.4;
      } else if (!vertical) {
        const overlap = join === 'butt' ? 0.2 * Math.min(pw, w) : -0.9 * em;
        cx = prev.centre.x + fwd * arr.lean * (pw / 2 + w / 2 - overlap);
        cy = prev.centre.y + 0.45 * Math.min(ph, h);
      } else if (arr.side) {
        const overlap = join === 'butt' ? 0.2 * Math.min(pw, w) : -0.9 * em;
        // Columns read right to left: the next body to the left.
        cx = prev.bbox.x + overlap - w / 2;
        cy = prev.centre.y + arr.lean * Math.min(ph, h);
      } else {
        const overlap = join === 'butt' ? 0.2 * Math.min(ph, h) : -0.9 * em;
        cy = prev.bbox.y + ph - overlap + h / 2;
        cx = prev.centre.x;
      }
      shift = { x: cx - local.centre.x, y: cy - local.centre.y };
    }
    bodies.push(translateBody(local, shift.x, shift.y));
    shifts.push(shift);
  });
  const sfx = group[0]!.item.kind === 'sfx';
  const rot = sfx ? (group[0]!.item.rotate ?? group[0]!.style.rotate ?? 0) : 0;
  // A lean steeper than 60 degrees is not lettering any more.
  const skew = sfx ? Math.max(-60, Math.min(60, group[0]!.item.skew ?? group[0]!.style.skew ?? 0)) : 0;
  const rim: Point[] = [];
  const inside: Point[] = [];
  for (const b of bodies) {
    const s = samplesOf(b);
    rim.push(...s.rim.map((q) => rotateAbout(q, b.centre, rot, skew)));
    inside.push(...s.inside.map((q) => rotateAbout(q, b.centre, rot, skew)));
  }
  const bbox = boundsOf(rim);
  // A joined balloon set back against the reading direction, below the
  // one before, makes the eye step back: a little cost.
  const back = group.length > 1 && !vertical && arr.lean < 0 ? 2.5 : 0;
  // A reshaped text block that parts its text worse than the preferred
  // one (a phrase or a word cut: 猫ちゃ|んに) pays for it.
  const worse = group.reduce((sum, p, i) => sum + Math.max(0, p.shapes[shapeIndex[i]!]!.shaped.breakCost - p.shapes[0]!.shaped.breakCost), 0);
  // With `strictPlacement` (#728), each Chinese word a shape parts that
  // the preferred shape leaves whole costs `WORD_CUT_COST` on top: the
  // break penalties alone priced a cut word (其|实) under a balloon read
  // out of order, so a narrow spare shape that cut one won.
  const cuts = wordCut > 0 ? group.reduce((sum, p, i) => sum + Math.max(0, p.shapes[shapeIndex[i]!]!.shaped.wordCuts - p.shapes[0]!.shaped.wordCuts), 0) : 0;
  const cost = back + 0.8 * worse + wordCut * cuts;
  return {
    variant: { bodies, reshaped, bbox, samples: inside, rim, ...(rot ? { rotate: rot } : {}), ...(skew ? { skew } : {}), ...(cost ? { cost } : {}) },
    meta: { pieces: [...group], shapeIndex, shifts },
  };
}

/** Where the tail of a unit's first piece aims (SPEC D1.4, D3.3). */
export function targetOf(panel: LetteringPanel, p: Piece): TargetSpec {
  const { item, style } = p;
  if (item.kind !== 'balloon' || item.tail === 'none' || style.tail === 'none') return { kind: 'none' };
  const t = item.tailTarget;
  if (t && typeof t === 'object') {
    return pointInConvex(t, panel.polygon) ? { kind: 'point', point: t } : { kind: 'offPanel', toward: t };
  }
  if (typeof t === 'string') return { kind: 'offPanel', side: t };
  if (!item.speaker) return { kind: 'none' };
  const anchor = panel.anchors.find((a) => a.id === item.speaker);
  if (!anchor) return { kind: 'offPanel' };
  const point = style.target === 'head' ? (anchor.head ?? anchor.mouth) : anchor.mouth;
  if (anchor.visible && pointInConvex(point, panel.polygon)) return { kind: 'point', point };
  return { kind: 'offPanel', toward: point };
}

/** The face of a piece's speaker in the panel, if the art marks one. */
export function speakerFace(panel: LetteringPanel, p: Piece): Rect | undefined {
  if (!p.item.speaker) return undefined;
  return panel.anchors.find((a) => a.id === p.item.speaker)?.face;
}

export function sfxNear(panel: LetteringPanel): { near?: Point } {
  const a = panel.anchors.find((x) => x.id === 'sfx');
  return a ? { near: a.mouth } : {};
}
