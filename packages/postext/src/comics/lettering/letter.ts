// The lettering of one panel (SPEC D3): every item's text is prepared and
// shaped (text first), a body is built around it, joined balloons of one
// speaker become one unit, the units are placed, and the tails are routed
// last, toward the speakers' mouths (or heads, or the panel border for a
// speaker off the panel). The result is one `ComicBalloonOut` per item, in
// reading order.

import { boundsOf, insetConvex, type PathCmd, pathData, add, rectOf } from './geom.js';
import { hasCJK } from '../../measure/cjk/cjk.js';
import { onTextWidthCacheClear, measureLanguageKey } from '../../measure/canvas.js';
import { getCjkLineBreak } from '../../measure/cjk/cjkClasses.js';
import { getCjkComposition } from '../../measure/cjk/cjkPunctuation.js';
import { getMeasureDirection, getMeasureArabicNumbers } from '../../measure/rtl/bidiLines.js';
import { getMeasureWritingMode, getMeasureRegion, getMeasureUprightDigits } from '../../measure/vertical.js';
import { isCjkLanguage } from '../../hyphenation/locale.js';
import { type Body, buildBody, translateBody, buildTail, buildNeck, dashOf } from './shapes.js';
import { type ShapedText, type ShapeOptions, styleIsVertical, shapeTextCandidates, translateBlock } from './shape-text.js';
import { type PreparedText, readLetteringText, prepareText, isIsolateControl } from './text.js';
import { type PlaceUnit, placeUnits, type UnitVariant, offPanelPoint } from './placement.js';
import type { LetteringItem, LetteringStyle, Point, LetteringPanel, LetteringEnv, ComicBalloonOut, LetteringResult } from './types.js';
import type { VDTDesignTextBlock } from '../../vdt.js';
import { groupPieces, unitVariants, targetOf, sfxNear, spareVariants, speakerFace } from './letter/variants.js';

/** One item ready to place: its effective style, its text, its shapes
 *  (the preferred one first, then the reshaped ones). */
export interface Piece {
  item: LetteringItem;
  style: LetteringStyle;
  prepared: PreparedText;
  shapes: { shaped: ShapedText; body: Body; reshaped: boolean }[];
  /** How many of `shapes` the first search uses (the rest are spares,
   *  added when the panel cannot be lettered cleanly with those). */
  main: number;
  vertical: boolean;
  /** The options it was shaped with. */
  opts: ShapeOptions;
  /** How it joins the piece before it in its group. */
  joinPrev?: 'butt' | 'connector';
}

/** What a unit variant is made of, for the output. */
export interface VariantMeta {
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

/** Panels lettered by earlier builds, by everything their lettering is
 *  worked out from: an edit to one balloon letters its panel again and
 *  takes the others as they were. Dropped when the fonts change. */
const lettered = new Map<string, LetteringResult>();
const LETTERED_MAX = 512;
onTextWidthCacheClear(() => lettered.clear());

/** {@link letterPanel} with the diagnostics of balloons that could not be
 *  placed cleanly (warning `comicBalloonOverflow`). */
export function letterPanelDetailed(panel: LetteringPanel, items: readonly LetteringItem[], env: LetteringEnv = {}): LetteringResult {
  // Lettered with its source offsets counted from its own first one: an
  // edit before the panel moves them all, and changes nothing else.
  const base = offsetBase(items);
  const local = base === 0 ? items : items.map((it) => ({
    ...it,
    sourceStart: it.sourceStart - base,
    sourceEnd: it.sourceEnd - base,
    ...(it.sourceMap ? { sourceMap: it.sourceMap.map((o) => (o < 0 ? o : o - base)) } : {}),
  }));
  const key = JSON.stringify([
    panel, local, env,
    getMeasureWritingMode(), getMeasureRegion(), getMeasureDirection(), getMeasureArabicNumbers(), getMeasureUprightDigits(), getCjkLineBreak(), getCjkComposition(),
    measureLanguageKey(),
  ]);
  let out = lettered.get(key);
  if (out) {
    lettered.delete(key);
  } else {
    out = letterPanelFresh(panel, local, env);
    if (lettered.size >= LETTERED_MAX) lettered.delete(lettered.keys().next().value!);
  }
  lettered.set(key, out);
  return shiftedSource(structuredClone(out), base);
}

/** The least source offset of a panel's items (0 when none is known). */
function offsetBase(items: readonly LetteringItem[]): number {
  let base = Number.POSITIVE_INFINITY;
  for (const it of items) {
    for (const o of [it.sourceStart, it.sourceEnd]) if (o >= 0 && o < base) base = o;
    for (const o of it.sourceMap ?? []) if (o >= 0 && o < base) base = o;
  }
  return Number.isFinite(base) ? base : 0;
}

/** A lettering's source offsets moved on by `by` (in place). */
function shiftedSource(r: LetteringResult, by: number): LetteringResult {
  if (by === 0) return r;
  const shift = (o: number) => (o < 0 ? o : o + by);
  for (const b of r.balloons) {
    b.sourceStart = shift(b.sourceStart);
    b.sourceEnd = shift(b.sourceEnd);
    for (const t of b.text) {
      if (t.sourceStart !== undefined) t.sourceStart = shift(t.sourceStart);
      if (t.sourceEnd !== undefined) t.sourceEnd = shift(t.sourceEnd);
      if (t.sourceMap) t.sourceMap = t.sourceMap.map(shift);
    }
  }
  for (const d of r.diagnostics) {
    d.sourceStart = shift(d.sourceStart);
    d.sourceEnd = shift(d.sourceEnd);
  }
  return r;
}

/** What a reshaped balloon pays, under `strictPlacement`, for each Chinese
 *  word its lines part that its preferred shape does not (#728): more
 *  than the 10 a pair of balloons read out of order counts in a layout's
 *  cost (`W.orderBase` on each of the two), so the search no longer cuts a
 *  word to keep the order. Tried at 5, 8 and 12 on the published comics,
 *  with the same pages each time. */
const WORD_CUT_COST = 12;

function letterPanelFresh(panel: LetteringPanel, items: readonly LetteringItem[], env: LetteringEnv): LetteringResult {
  const wordCut = env.strictPlacement ? WORD_CUT_COST : 0;
  const sorted = [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const pieces = sorted.map((item) => pieceOf(panel, item, env)).filter((p): p is Piece => p !== undefined);
  const groups = groupPieces(pieces, env);
  const metas = new Map<string, VariantMeta[]>();
  const units: PlaceUnit[] = groups.map((group) => {
    const { variants, meta } = unitVariants(group, panel, wordCut);
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
      ...(first.item.speaker ? { speaker: first.item.speaker } : {}),
      em: first.style.fontSizePx,
    };
  });
  // A panel the first search cannot letter cleanly is searched again with
  // spare shapes: shorter lines (more, shorter columns) for each balloon,
  // and joined groups stacked straight with every balloon fitted to the
  // panel's room alike.
  const extend = (): boolean => {
    let added = false;
    groups.forEach((group, gi) => {
      const extra = spareVariants(group, panel, wordCut);
      if (extra.variants.length === 0) return;
      units[gi]!.variants.push(...extra.variants);
      metas.get(group[0]!.item.id)!.push(...extra.meta);
      added = true;
    });
    return added;
  };
  const { placed, diagnostics } = placeUnits(panel, units, env.passes ?? 3, extend);
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
  return { item, style, prepared, shapes, main: shapes.length, vertical, opts };
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
      ...(variant.skew ? { skew: variant.skew } : {}),
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
