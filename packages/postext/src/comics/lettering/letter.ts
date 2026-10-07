// The lettering of one panel (SPEC D3): every item's text is prepared and
// shaped (text first), a body is built around it, joined balloons of one
// speaker become one unit, the units are placed, and the tails are routed
// last, toward the speakers' mouths (or heads, or the panel border for a
// speaker off the panel). The result is one `ComicBalloonOut` per item, in
// reading order.

import { pointInConvex, pathData, rectOf, boundsOf, add, insetConvex, type PathCmd } from './geom';
import { hasCJK } from '../../measure/cjk';
import { isCjkLanguage } from '../../locale';
import { buildBody, buildNeck, buildTail, dashOf, translateBody, type Body } from './shapes';
import { shapeTextCandidates, styleIsVertical, translateBlock, type ShapedText, type ShapeOptions } from './shape-text';
import { isIsolateControl, prepareText, readLetteringText, type PreparedText } from './text';
import { offPanelPoint, placeUnits, type PlaceUnit, type TargetSpec, type UnitVariant } from './placement';
import type {
  ComicBalloonOut, LetteringEnv, LetteringItem, LetteringPanel, LetteringResult, LetteringStyle, Point, Rect,
} from './types';
import type { VDTDesignTextBlock } from '../../vdt';

/** One item ready to place: its effective style, its text, its shapes
 *  (the preferred one first, then the reshaped ones). */
interface Piece {
  item: LetteringItem;
  style: LetteringStyle;
  prepared: PreparedText;
  shapes: { shaped: ShapedText; body: Body; reshaped: boolean }[];
  vertical: boolean;
  /** How it joins the piece before it in its group. */
  joinPrev?: 'butt' | 'connector';
}

/** What a unit variant is made of, for the output. */
interface VariantMeta {
  pieces: Piece[];
  shapeIndex: number[];
  /** Translation of each piece's local frame (its text block at (0, 0))
   *  into the unit's frame. */
  shifts: Point[];
}

/** The lettering of one panel: its balloons in reading order. */
export function letterPanel(panel: LetteringPanel, items: readonly LetteringItem[], env: LetteringEnv = {}): ComicBalloonOut[] {
  return letterPanelDetailed(panel, items, env).balloons;
}

/** {@link letterPanel} with the diagnostics of balloons that could not be
 *  placed cleanly (warning `comicBalloonOverflow`). */
export function letterPanelDetailed(panel: LetteringPanel, items: readonly LetteringItem[], env: LetteringEnv = {}): LetteringResult {
  const sorted = [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pieces = sorted.map((item) => pieceOf(panel, item, env)).filter((p): p is Piece => p !== undefined);
  const groups = groupPieces(pieces, env);
  const metas = new Map<string, VariantMeta[]>();
  const units: PlaceUnit[] = groups.map((group) => {
    const { variants, meta } = unitVariants(group, panel);
    const first = group[0]!;
    metas.set(first.item.id, meta);
    return {
      id: first.item.id,
      order: first.item.order,
      kind: first.item.kind,
      variants,
      target: targetOf(panel, first),
      ...(first.item.pin ? { pin: first.item.pin } : {}),
      ...((first.item.position ?? (first.style.position && first.style.position !== 'auto' ? first.style.position : undefined))
        ? { position: first.item.position ?? (first.style.position as Exclude<LetteringStyle['position'], 'auto' | undefined>) }
        : {}),
      ...(first.style.butt ? { butt: true } : {}),
      ...(first.item.breakBorder ? { breakBorder: true } : {}),
      sourceStart: first.item.sourceStart,
      sourceEnd: group[group.length - 1]!.item.sourceEnd,
      ...(first.item.kind === 'sfx' ? sfxNear(panel) : {}),
      em: first.style.fontSizePx,
    };
  });
  const { placed, diagnostics } = placeUnits(panel, units, env.passes ?? 3);
  const balloons: ComicBalloonOut[] = [];
  placed.forEach((p, gi) => {
    const meta = metas.get(p.unit.id)![p.variant]!;
    balloons.push(...outputUnit(panel, p.unit, p.unit.variants[p.variant]!, meta, p.at, (env.groupBase ?? 0) + gi));
  });
  balloons.sort((a, b) => a.order - b.order);
  return { balloons, diagnostics };
}

/** Prepare and shape one item; undefined when it sets no text. */
function pieceOf(panel: LetteringPanel, item: LetteringItem, env: LetteringEnv): Piece | undefined {
  const scale = item.sizeScale && item.sizeScale > 0 ? item.sizeScale : 1;
  const own = item.style;
  const panelVertical = panel.writingMode === 'vertical';
  // A line's own writing mode wins over its style's; a column forced in a
  // horizontal book takes the leading columns need.
  const base: LetteringStyle = !item.writingMode ? own : {
    ...own,
    writingMode: item.writingMode,
    ...(item.writingMode === 'vertical' && !panelVertical && item.kind !== 'sfx' && own.lineHeight < 1.4 ? { lineHeight: 1.5 } : {}),
  };
  const style: LetteringStyle = scale === 1 ? base : {
    ...base,
    fontSizePx: base.fontSizePx * scale,
    padding: base.padding * scale,
    ...(base.halo ? { halo: base.halo * scale } : {}),
  };
  const read = readLetteringText(item.text, item.sourceMap);
  // Columns are for Japanese and Chinese: a text with none of their
  // characters (an English subtitle of a sound effect, a Latin word) is
  // set horizontally in a vertical book, as manga sets foreign speech.
  const vertical = styleIsVertical(style, panelVertical) && (style.writingMode === 'vertical' || hasCJK(read.text));
  // A column in a book whose language is set in lines (a Japanese sound
  // effect kept in an English edition) follows its own text's rules.
  const locale = vertical && !isCjkLanguage(panel.locale) && hasCJK(read.text) ? (/[\u3040-\u30ff]/.test(read.text) ? 'ja' : 'zh') : panel.locale;
  const prepared = prepareText(read, style, { locale, vertical });
  if (prepared.text.replace(/\s/g, '').length === 0) return undefined;
  const opts: ShapeOptions = {
    locale,
    vertical,
    dpi: panel.dpi,
    ...(env.cjkLineBreak ? { cjkLineBreak: env.cjkLineBreak } : {}),
    ...(env.cjkRegion ? { cjkRegion: env.cjkRegion } : {}),
    ...(env.mirrored ? { mirrored: true } : {}),
  };
  const shapes: Piece['shapes'] = [];
  const sig = new Set<string>();
  const add1 = (s: ShapedText, reshaped: boolean) => {
    const k = s.lines.map((l) => `${l.start}-${l.end}`).join(',');
    if (sig.has(k)) return;
    sig.add(k);
    shapes.push({ shaped: s, body: buildBody(s.ink, style.fontSizePx, style, item.id), reshaped });
  };
  add1(shapeTextCandidates(prepared, style, opts, 1)[0]!, false);
  // Reshaped fallbacks: a wider and a narrower block (SPEC D3.3 step 5).
  if (item.kind !== 'sfx') {
    const target = style.aspect ?? (vertical ? 1.3 : 1.8);
    add1(shapeTextCandidates(prepared, style, { ...opts, aspect: target * 1.9 }, 1)[0]!, true);
    add1(shapeTextCandidates(prepared, style, { ...opts, aspect: target / 1.9 }, 1)[0]!, true);
  }
  // A balloon too long for its panel along its lines (columns in a short
  // panel, lines in a narrow one) is reshaped to lines that fit it.
  const vis = boundsOf(insetConvex(panel.polygon, panel.insetPx));
  const room = vertical ? vis.height : vis.width;
  const along = (b: Body) => (vertical ? b.bbox.height : b.bbox.width);
  if (shapes.length > 0 && along(shapes[0]!.body) > 0.45 * room) {
    // The whole room first (a narrow cell: as wide as it is, a few words a
    // line, rather than a word a line), then less.
    for (const f of [0.82, 0.7, 0.6, 0.45, 0.33]) {
      const maxLength = f * room - 2 * style.padding;
      if (maxLength > style.fontSizePx) add1(shapeTextCandidates(prepared, style, { ...opts, maxLength }, 1)[0]!, true);
    }
  }
  // Too deep across its lines (many short lines in a low panel, many
  // columns in a narrow one): fewer, longer lines.
  const across = (b: Body) => (vertical ? b.bbox.width : b.bbox.height);
  const roomAcross = vertical ? vis.width : vis.height;
  if (item.kind !== 'sfx' && shapes.length > 0 && across(shapes[0]!.body) > 0.45 * roomAcross) {
    const target = style.aspect ?? (vertical ? 1.3 : 1.8);
    for (const k of [3, 5]) add1(shapeTextCandidates(prepared, style, { ...opts, aspect: target * k }, 1)[0]!, true);
  }
  return { item, style, prepared, shapes, vertical };
}

/** Consecutive balloons of one speaker and one style, joined (butted or
 *  with a connector) unless the item or the book says otherwise. */
function groupPieces(pieces: readonly Piece[], env: LetteringEnv): Piece[][] {
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

function rotateAbout(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** The variants a unit can be placed as: each shape of its pieces, and
 *  for a joined group each arrangement of its bodies. */
function unitVariants(group: readonly Piece[], panel: LetteringPanel): { variants: UnitVariant[]; meta: VariantMeta[] } {
  const variants: UnitVariant[] = [];
  const meta: VariantMeta[] = [];
  const shapeCount = Math.max(...group.map((p) => p.shapes.length));
  const fwd = panel.direction === 'rtl' ? -1 : 1;
  const vertical = group[0]!.vertical;
  // Arrangements of a joined group: the next body below the one before
  // (horizontal text: leaning forward, straight, back) or beside it
  // (forward, back, a little lower); columns go beside first (forward is
  // to the left), then below. The placement keeps the one whose tail runs
  // clear and that fits the panel.
  type Arrangement = { side: boolean; lean: number };
  const arrangements: Arrangement[] = group.length === 1 ? [{ side: false, lean: 0 }]
    : vertical
      ? [{ side: true, lean: 0.18 }, { side: true, lean: 0.45 }, { side: true, lean: -0.1 }, { side: false, lean: 0 }]
      : [{ side: false, lean: 0.28 }, { side: false, lean: 0 }, { side: false, lean: -0.28 }, { side: true, lean: 1 }, { side: true, lean: -1 }];
  for (let k = 0; k < shapeCount; k++) {
    for (const arr of arrangements) {
      const shapeIndex = group.map((p) => Math.min(k, p.shapes.length - 1));
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
      const rot = group[0]!.item.kind === 'sfx' ? (group[0]!.item.rotate ?? group[0]!.style.rotate ?? 0) : 0;
      const rim: Point[] = [];
      const inside: Point[] = [];
      for (const b of bodies) {
        const s = samplesOf(b);
        rim.push(...s.rim.map((q) => rotateAbout(q, b.centre, rot)));
        inside.push(...s.inside.map((q) => rotateAbout(q, b.centre, rot)));
      }
      const bbox = boundsOf(rim);
      // A joined balloon set back against the reading direction reads out
      // of order: beside it, a fault the order alone would not see; below
      // it, a lesser one (the eye still has to step back).
      const back = group.length > 1 && !vertical && arr.lean < 0 ? (arr.side ? 12 : 2.5) : 0;
      // A reshaped text block that parts its text worse than the preferred
      // one (a phrase or a word cut: 猫ちゃ|んに) pays for it.
      const worse = group.reduce((sum, p, i) => sum + Math.max(0, p.shapes[shapeIndex[i]!]!.shaped.breakCost - p.shapes[0]!.shaped.breakCost), 0);
      const cost = back + 0.8 * worse;
      variants.push({ bodies, reshaped: k > 0, bbox, samples: inside, rim, ...(rot ? { rotate: rot } : {}), ...(cost ? { cost } : {}) });
      meta.push({ pieces: [...group], shapeIndex, shifts });
    }
  }
  return { variants, meta };
}

/** Where the tail of a unit's first piece aims (SPEC D1.4, D3.3). */
function targetOf(panel: LetteringPanel, p: Piece): TargetSpec {
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
function speakerFace(panel: LetteringPanel, p: Piece): Rect | undefined {
  if (!p.item.speaker) return undefined;
  return panel.anchors.find((a) => a.id === p.item.speaker)?.face;
}

function sfxNear(panel: LetteringPanel): { near?: Point } {
  const a = panel.anchors.find((x) => x.id === 'sfx');
  return a ? { near: a.mouth } : {};
}

/** The output balloons of one placed unit. */
function outputUnit(
  panel: LetteringPanel,
  unit: PlaceUnit,
  variant: UnitVariant,
  meta: VariantMeta,
  at: Point,
  group: number,
): ComicBalloonOut[] {
  const bodies = variant.bodies.map((b) => translateBody(b, at.x, at.y));
  const first = meta.pieces[0]!;
  const style = first.style;
  const cmds: PathCmd[] = [];
  // Tails from the final position; a burst's tail replaces the spike it
  // grows from in the first body's outline.
  let tailTip: Point | undefined;
  let tailCmds: PathCmd[] = [];
  let firstBody: PathCmd[] | undefined;
  const target = unit.target;
  if (target.kind !== 'none') {
    const centre = bodies[0]!.centre;
    const point = target.kind === 'point' ? target.point : offPanelPoint(panel, centre, target.toward, target.side);
    const tail = buildTail(bodies[0]!, point, style, {
      offPanel: target.kind === 'offPanel',
      strokeWidth: style.strokeWidth,
      bend: centre.x < point.x ? -1 : 1,
      ...(speakerFace(panel, first) ? { face: speakerFace(panel, first)! } : {}),
    });
    if (tail) {
      tailCmds = tail.cmds;
      tailTip = tail.tip;
      firstBody = tail.body;
    }
  }
  bodies.forEach((b, i) => cmds.push(...(i === 0 && firstBody ? firstBody : b.cmds)));
  for (let i = 1; i < bodies.length; i++) {
    if (meta.pieces[i]!.joinPrev === 'connector') cmds.push(...buildNeck(bodies[i - 1]!, bodies[i]!, style.strokeWidth));
  }
  cmds.push(...tailCmds);
  const dash = dashOf(style);
  const shape = style.shape === 'none' || cmds.length === 0 ? undefined : {
    d: pathData(cmds),
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    ...(dash ? { dash } : {}),
    ...(style.double ? { double: { gap: style.doubleGap ?? Math.max(1.5 * style.strokeWidth, 0.2 * style.fontSizePx) } } : {}),
  };
  return meta.pieces.map((piece, i) => {
    const shaped = piece.shapes[meta.shapeIndex[i]!]!.shaped;
    const shift = add(meta.shifts[i]!, at);
    const block = withSource(translateBlock(shaped.block, shift.x, shift.y), piece, shaped);
    const body = bodies[i]!;
    const out: ComicBalloonOut = {
      id: piece.item.id,
      panelIndex: panel.index,
      order: piece.item.order,
      kind: piece.item.kind,
      style: piece.style.id,
      ...(piece.item.speaker ? { speaker: piece.item.speaker } : {}),
      sourceStart: piece.item.sourceStart,
      sourceEnd: piece.item.sourceEnd,
      group,
      ...(i === 0 && shape ? { shape } : {}),
      text: [block, ...(shaped.rubies ?? []).map((r) => translateBlock(r, shift.x, shift.y))],
      bbox: rectOf(body.bbox.x, body.bbox.y, body.bbox.width, body.bbox.height),
      ...(i === 0 && tailTip ? { tailTip } : {}),
      ...(variant.rotate ? { rotate: variant.rotate } : {}),
      ...(piece.style.halo ? { halo: { width: piece.style.halo, color: piece.style.haloColor ?? '#ffffff' } } : {}),
    };
    return out;
  });
}

/** A block with the item's source range and, when the printed lines map
 *  character by character, its source map (click-to-source). */
function withSource(block: VDTDesignTextBlock, piece: Piece, shaped: ShapedText): VDTDesignTextBlock {
  const out: VDTDesignTextBlock = { ...block, sourceStart: piece.item.sourceStart, sourceEnd: piece.item.sourceEnd };
  const p = piece.prepared;
  // The isolate controls print nothing (see `stripIsolates`).
  const kept = (k: number) => !isIsolateControl(p.text[k]!);
  const lines = shaped.lines.map((l) => [...Array(l.end - l.start).keys()].map((i) => l.start + i).filter(kept).map((k) => p.text[k]).join(''));
  const printed = block.lines.map((l) => l.text);
  if (lines.length !== printed.length || lines.some((t, i) => t !== printed[i])) return out;
  const map: number[] = [];
  shaped.lines.forEach((l, i) => {
    for (let k = l.start; k < l.end; k++) if (kept(k)) map.push(p.source[k] ?? -1);
    if (i + 1 < shaped.lines.length) map.push(p.source[shaped.lines[i + 1]!.start] ?? -1);
  });
  if (map.some((m) => m < 0)) return out;
  out.sourceText = lines.join('\n');
  out.sourceMap = map;
  return out;
}

