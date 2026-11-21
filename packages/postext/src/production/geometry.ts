/**
 * The flat sheets of a manufactured book, in millimetres: the cover of a
 * softcover, the case of a hardcover, its dust jacket and its endpapers.
 * Each sheet is a row of named zones (the back cover, the spine, the front
 * cover, the flaps, the joints…) with the folds and scores between them,
 * the area kept clear inside each, and the bleed (or turn-in) round it. A
 * design anchors to the zones, so a change of binding moves it with them.
 */

import type { BindingStyle, TrimMm } from '../types/output/production.js';
import type { ResolvedBindingMeasures } from './measures.js';

/** A rectangle on a sheet, mm, from the top-left corner of the sheet (bleed
 *  or turn-in included). */
export interface SheetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CoverZoneName =
  | 'flapBack'
  | 'back'
  | 'jointBack'
  | 'spine'
  | 'jointFront'
  | 'front'
  | 'flapFront'
  | 'pastedown'
  | 'flyleaf'
  | 'hinge';

export interface SheetZone {
  name: CoverZoneName;
  rect: SheetRect;
  /** Where text and anything that must not be cut or folded can go. */
  safe: SheetRect;
}

/** A line across the sheet: a fold (spine, flap, turn-in), a score (the
 *  hinge of a softcover), a joint of a case, or the glue line of an
 *  endpaper. Vertical, at `x` mm. */
export interface SheetLine {
  x: number;
  kind: 'fold' | 'score' | 'joint' | 'glue';
}

export interface ProductionSheet {
  kind: 'softcover' | 'case' | 'jacket' | 'endpaper' | 'promo';
  /** The whole sheet, bleed or turn-in included, mm. */
  width: number;
  height: number;
  /** The finished piece: the cover as trimmed, the case as covered (to the
   *  outer edges of its boards), the endpaper spread. */
  trim: SheetRect;
  /** Bleed past the trim, mm: the turn-in on a case. On an endpaper, none
   *  at the fold. */
  bleed: number;
  zones: SheetZone[];
  lines: SheetLine[];
  /** Width of the spine zone, mm (0 on an endpaper). */
  spine: number;
}

const inset = (r: SheetRect, left: number, top: number, right: number, bottom: number): SheetRect => ({
  x: r.x + left,
  y: r.y + top,
  width: Math.max(0, r.width - left - right),
  height: Math.max(0, r.height - top - bottom),
});

interface Panel {
  name: CoverZoneName;
  width: number;
  /** Clearance at the panel's left and right edges, beyond the safe
   *  margin (a hinge score, the board a case wraps). */
  clearLeft?: number;
  clearRight?: number;
  /** Safe margin at the left and right edges instead of the sheet's (a
   *  spine, too narrow for it). */
  safeX?: number;
}

/** Safe margin either side inside a spine: 2 mm, 1 mm on spines of 9 mm
 *  or less (IngramSpark). */
export const spineSafeMargin = (spine: number): number => (spine > 9 ? 2 : 1);

/** Lays panels side by side from `x0`, all `height` high from `y0`, with
 *  the given lines between them. */
function row(
  panels: Panel[],
  x0: number,
  y0: number,
  height: number,
  safe: number,
  clearTopBottom: number,
): SheetZone[] {
  let x = x0;
  return panels.map((p) => {
    const rect = { x, y: y0, width: p.width, height };
    x += p.width;
    const vertical = safe + clearTopBottom;
    return {
      name: p.name,
      rect,
      safe: inset(rect, (p.safeX ?? safe) + (p.clearLeft ?? 0), vertical, (p.safeX ?? safe) + (p.clearRight ?? 0), vertical),
    };
  });
}

function lineAt(zones: SheetZone[], after: CoverZoneName, kind: SheetLine['kind']): SheetLine {
  const z = zones.find((zone) => zone.name === after)!;
  return { x: z.rect.x + z.rect.width, kind };
}

/** The cover sheet of a softcover: back, spine and front (and the flaps),
 *  scored at the spine and at the hinges, with bleed all round. */
export function softcoverSheet(trim: TrimMm, spine: number, m: ResolvedBindingMeasures, flaps: boolean): ProductionSheet {
  const b = m.bleed;
  const panelW = flaps ? trim.width - m.flapFoldInset : trim.width;
  const panels: Panel[] = [
    ...(flaps ? [{ name: 'flapBack' as const, width: m.flapWidth }] : []),
    { name: 'back', width: panelW, clearRight: m.hingeScore },
    { name: 'spine', width: spine, safeX: spineSafeMargin(spine) },
    { name: 'front', width: panelW, clearLeft: m.hingeScore },
    ...(flaps ? [{ name: 'flapFront' as const, width: m.flapWidth }] : []),
  ];
  const zones = row(panels, b, b, trim.height, m.safeMargin, 0);
  const lines: SheetLine[] = [];
  if (flaps) lines.push(lineAt(zones, 'flapBack', 'fold'));
  const back = lineAt(zones, 'back', 'fold');
  const front = lineAt(zones, 'spine', 'fold');
  if (m.hingeScore > 0) lines.push({ x: back.x - m.hingeScore, kind: 'score' });
  lines.push(back, front);
  if (m.hingeScore > 0) lines.push({ x: front.x + m.hingeScore, kind: 'score' });
  if (flaps) lines.push(lineAt(zones, 'front', 'fold'));
  const width = panels.reduce((w, p) => w + p.width, 0);
  return {
    kind: 'softcover',
    width: width + 2 * b,
    height: trim.height + 2 * b,
    trim: { x: b, y: b, width, height: trim.height },
    bleed: b,
    zones,
    lines,
    spine,
  };
}

/** Board size of a case for a trim, mm. */
export function caseBoard(trim: TrimMm, m: ResolvedBindingMeasures): TrimMm {
  return { width: trim.width - m.boardSetback + m.square, height: trim.height + 2 * m.square };
}

/** Width of the spine of a case, mm: the block's spine, the two boards
 *  beside it and the allowance, and on a round case the round's own. */
export function caseSpineWidth(blockSpine: number, style: BindingStyle, m: ResolvedBindingMeasures): number {
  const flat = blockSpine + 2 * m.board + m.caseSpineAllowance;
  return style === 'caseRound' ? flat + m.roundSpineAllowance : flat;
}

/** The covering sheet of a case: two boards and the spine with a joint
 *  either side, and the turn-in all round. Text keeps clear of the board
 *  edges by the board's thickness, which the material wraps round. */
export function caseSheet(trim: TrimMm, caseSpine: number, m: ResolvedBindingMeasures): ProductionSheet {
  const t = m.turnIn;
  const board = caseBoard(trim, m);
  const panels: Panel[] = [
    { name: 'back', width: board.width, clearLeft: m.board },
    { name: 'jointBack', width: m.joint },
    { name: 'spine', width: caseSpine, safeX: spineSafeMargin(caseSpine) },
    { name: 'jointFront', width: m.joint },
    { name: 'front', width: board.width, clearRight: m.board },
  ];
  const zones = row(panels, t, t, board.height, m.safeMargin, m.board);
  const width = panels.reduce((w, p) => w + p.width, 0);
  const lines: SheetLine[] = [
    { x: t, kind: 'fold' },
    lineAt(zones, 'back', 'joint'),
    lineAt(zones, 'jointBack', 'joint'),
    lineAt(zones, 'spine', 'joint'),
    lineAt(zones, 'jointFront', 'joint'),
    { x: t + width, kind: 'fold' },
  ];
  return {
    kind: 'case',
    width: width + 2 * t,
    height: board.height + 2 * t,
    trim: { x: t, y: t, width, height: board.height },
    bleed: t,
    zones,
    lines,
    spine: caseSpine,
  };
}

/** The dust jacket of a case: as tall as the boards, its spine the case's,
 *  its panels reaching over the joint to the fore-edge and a little past
 *  it for the board the flap folds round, and its flaps. */
export function jacketSheet(trim: TrimMm, caseSpine: number, m: ResolvedBindingMeasures): ProductionSheet {
  const b = m.jacketBleed;
  const board = caseBoard(trim, m);
  const fa = m.jacketFoldAllowance;
  const panelW = board.width + m.joint + fa;
  const spine = caseSpine;
  const panels: Panel[] = [
    { name: 'flapBack', width: m.jacketFlapWidth },
    { name: 'back', width: panelW },
    { name: 'spine', width: spine, safeX: spineSafeMargin(spine) },
    { name: 'front', width: panelW },
    { name: 'flapFront', width: m.jacketFlapWidth },
  ];
  const zones = row(panels, b, b, board.height, m.safeMargin, 0);
  const width = panels.reduce((w, p) => w + p.width, 0);
  return {
    kind: 'jacket',
    width: width + 2 * b,
    height: board.height + 2 * b,
    trim: { x: b, y: b, width, height: board.height },
    bleed: b,
    zones,
    lines: (['flapBack', 'back', 'spine', 'front'] as const).map((name) => lineAt(zones, name, 'fold')),
    spine,
  };
}

/** One endpaper spread, the size of two pages of the block: the pastedown
 *  glued to the board and the free flyleaf, the fold between them with
 *  its glue strip and the joint kept clear, bleed at head, foot and the
 *  outer edges. `side` is the front or back of the book; `rtl`, a book
 *  bound on the right. */
export function endpaperSheet(
  trim: TrimMm,
  m: ResolvedBindingMeasures,
  side: 'front' | 'back',
  rtl = false,
): ProductionSheet {
  const b = m.endpaperBleed;
  // Opening the front of a left-bound book, the pastedown lies on the left.
  const pastedownLeft = (side === 'front') !== rtl;
  const clear = Math.max(m.endpaperGlueStrip, m.joint);
  const left: Panel = { name: pastedownLeft ? 'pastedown' : 'flyleaf', width: trim.width, clearRight: clear };
  const right: Panel = { name: pastedownLeft ? 'flyleaf' : 'pastedown', width: trim.width, clearLeft: clear };
  const zones = row([left, right], b, b, trim.height, m.safeMargin, 0);
  const fold = b + trim.width;
  zones.push({
    name: 'hinge',
    rect: { x: fold - clear, y: b, width: 2 * clear, height: trim.height },
    safe: { x: fold, y: b, width: 0, height: 0 },
  });
  const glueX = pastedownLeft ? fold + m.endpaperGlueStrip : fold - m.endpaperGlueStrip;
  return {
    kind: 'endpaper',
    width: 2 * trim.width + 2 * b,
    height: trim.height + 2 * b,
    trim: { x: b, y: b, width: 2 * trim.width, height: trim.height },
    bleed: b,
    zones,
    lines: [{ x: fold, kind: 'fold' }, { x: glueX, kind: 'glue' }],
    spine: 0,
  };
}

/** Pictures of the front cover for screens: an EPUB's cover and the usual
 *  social media sizes, in pixels. */
export type PromoFormat = 'epub' | 'square' | 'story' | 'landscape';

export const PROMO_FORMATS: Readonly<Record<PromoFormat, { width: number; height: number }>> = {
  // The cover image most EPUB stores ask for (Apple Books, Kobo, KDP):
  // 1600 × 2560 px, 1 : 1.6.
  epub: { width: 1600, height: 2560 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  // Link previews (Open Graph).
  landscape: { width: 1200, height: 630 },
};

/** The front cover recomposed in a screen format: one zone, the front,
 *  as wide as the trim so its type keeps its size against it, as tall as
 *  the format says; no bleed, no folds. */
export function promoSheet(trim: TrimMm, format: PromoFormat, safeMargin: number): ProductionSheet {
  const px = PROMO_FORMATS[format];
  const width = trim.width;
  const height = (width * px.height) / px.width;
  const rect = { x: 0, y: 0, width, height };
  return {
    kind: 'promo',
    width,
    height,
    trim: rect,
    bleed: 0,
    zones: [{ name: 'front', rect, safe: inset(rect, safeMargin, safeMargin, safeMargin, safeMargin) }],
    lines: [],
    spine: 0,
  };
}
