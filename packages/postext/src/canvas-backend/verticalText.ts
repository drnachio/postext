/**
 * Vertical text on the canvas (`VDTPage.flow`).
 *
 * `paintPage` paints a vertical page's flow through the page's frame — the
 * context turned a quarter turn clockwise (`ctx.transform(0, 1, -1, 0, W,
 * 0)`) — and switches the painter here on for as long as it does. Every
 * text painter of the backend calls {@link fillFlowText} instead of
 * `ctx.fillText`: on a horizontal page it IS `ctx.fillText`, with the same
 * arguments; inside a vertical flow it cuts the text into sideways runs
 * (Latin, numbers: painted as they are, which the frame turns sideways) and
 * cells (Han, punctuation, dashes, upright symbols), each cell its length
 * down the line (one em; half an em for the mainland interpunct), the
 * character turned back to stand upright about the cell's centre on the
 * font's central axis (`VDTFlowFrame.centralBaselines`). The runs are the
 * ones the text was measured with (`verticalRuns`), so each segment paints
 * within the width the layout gave it.
 *
 * Punctuation takes the font's vertical form (OpenType `vert`) through a
 * twin face the host registers with {@link registerVerticalAlternates} —
 * the same font file loaded under another family name with
 * `featureSettings: '"vert" 1'`, which Chrome 140+ applies to canvas text.
 * Without a twin, the fallbacks of `verticalOrientation` apply: brackets and
 * quotes turned about the em box's centre, mainland pause and stop marks
 * moved to the upper right of the cell (each by its glyph's `offset`).
 */

import type { CjkRegion } from '../types';
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';
import { forcedVerticalRuns, verticalRuns, CORNER_OFFSET_EM, type ForcedOrientation, type VerticalGlyph } from '../writingMode';
import { graphemeCount, graphemesOf } from '../measure/graphemes';
import { markPieces, type MarkCutRule } from '../measure/markCuts';
import { measureRunWidth } from '../measure/canvas';

/** What the painter needs while a vertical flow paints. */
export interface VerticalPaintState {
  region: CjkRegion;
  /** `VDTFlowFrame.centralBaselines` of the page. */
  axes?: Record<string, number>;
  /** `cjk.uprightDigits`: a number of at most this many digits stands in
   *  one upright cell (as the measurer found it, `verticalRuns`). */
  uprightDigits?: number;
}

let paintState: VerticalPaintState | null = null;

/** Switch vertical painting on (a state) or off (`null`); returns the state
 *  it replaces, for the caller to put back. */
export function setVerticalPaint(state: VerticalPaintState | null): VerticalPaintState | null {
  const previous = paintState;
  paintState = state;
  return previous;
}

/** Whether text painted now is set vertically. */
export function verticalPaintActive(): boolean {
  return paintState !== null;
}

// ---------------------------------------------------------------------------
// Vertical alternates through a twin face
// ---------------------------------------------------------------------------

const twins = new Map<string, string>();
/** The faces {@link loadVerticalAlternates} added for a family's twin. */
const twinFaces = new Map<string, FontFace[]>();
/** Per family, how many times its twin was loaded or dropped: a load that
 *  another one (or an unregister) overtook while it waited is stale. */
const twinGeneration = new Map<string, number>();

/**
 * Paint the vertical forms of `family`'s punctuation (brackets, quotes,
 * mainland pause marks, ellipses) with `twinFamily`: the same font loaded
 * under that name with `featureSettings: '"vert" 1'` (see
 * {@link loadVerticalAlternates}). Hosts that load fonts themselves call
 * this once the twin is ready; without one the painter's fallbacks apply.
 */
export function registerVerticalAlternates(family: string, twinFamily: string): void {
  twins.set(family, twinFamily);
}

function removeFaces(faces: readonly FontFace[] | undefined): void {
  if (!faces || typeof document === 'undefined' || !document.fonts) return;
  for (const ff of faces) {
    try {
      document.fonts.delete(ff);
    } catch {
      // Already gone.
    }
  }
}

/** Forget the twin of `family` (or of every family), removing the faces
 *  {@link loadVerticalAlternates} added for it: the family's font changed
 *  (a file uploaded again under the same name), so its twin must be loaded
 *  again from the new sources. A load still under way for it is dropped. */
export function unregisterVerticalAlternates(family?: string): void {
  const families = family === undefined ? [...new Set([...twins.keys(), ...twinFaces.keys(), ...twinGeneration.keys()])] : [family];
  for (const f of families) {
    twins.delete(f);
    removeFaces(twinFaces.get(f));
    twinFaces.delete(f);
    twinGeneration.set(f, (twinGeneration.get(f) ?? 0) + 1);
  }
}

/** The twin family registered for `family`, if any. */
export function verticalAlternatesOf(family: string): string | undefined {
  return twins.get(family);
}

/** The family name a twin of `family` is registered under by
 *  {@link loadVerticalAlternates}. */
export function verticalTwinName(family: string): string {
  return `${family} postext-vert`;
}

/** One face of a family: its source (a URL or the font bytes) and
 *  descriptors, as `new FontFace` takes them. */
export interface VerticalAlternatesFace {
  source: string | ArrayBuffer;
  weight?: string;
  style?: string;
  unicodeRange?: string;
}

/** Brackets the probe compares: their vertical forms differ from the
 *  horizontal ones in every CJK face. */
const PROBE = '「（《';
/** The characters a twin is loaded for (only these ever paint with it). */
export const VERTICAL_ALTERNATE_SAMPLE = '「」『』（）《》〈〉【】〔〕〖〗［］｛｝，。、：；！？“”‘’…～';

function inkKey(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, font: string, text: string): string {
  ctx.font = font;
  const m = ctx.measureText(text);
  return [m.actualBoundingBoxLeft, m.actualBoundingBoxRight, m.actualBoundingBoxAscent, m.actualBoundingBoxDescent]
    .map((v) => Math.round((v ?? 0) * 10))
    .join(',');
}

/**
 * Load a twin of `family` with its vertical forms on (`featureSettings:
 * '"vert" 1'`) from the same sources, and register it when the browser
 * applies the feature to canvas text — the probe draws 「（《 with both
 * faces and compares their ink. Resolves to whether the twin is in use.
 * Browser only; a no-op (false) elsewhere.
 */
export async function loadVerticalAlternates(family: string, faces: readonly VerticalAlternatesFace[]): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined' || faces.length === 0) return false;
  if (twins.has(family)) return true;
  const generation = (twinGeneration.get(family) ?? 0) + 1;
  twinGeneration.set(family, generation);
  // A family loaded again (after `unregisterVerticalAlternates`) takes a
  // fresh name, so no face or glyph cache of the old file answers for it.
  const twin = generation > 1 ? `${verticalTwinName(family)} ${generation}` : verticalTwinName(family);
  const loaded: FontFace[] = [];
  for (const face of faces) {
    try {
      const src = typeof face.source === 'string' ? `url(${JSON.stringify(face.source)})` : face.source;
      const ff = new FontFace(twin, src, {
        ...(face.weight ? { weight: face.weight } : {}),
        ...(face.style ? { style: face.style } : {}),
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
        featureSettings: '"vert" 1',
      });
      document.fonts.add(ff);
      loaded.push(ff);
    } catch {
      // A face the browser refuses: the others may still cover the marks.
    }
  }
  if (loaded.length === 0) return false;
  const q = (f: string) => JSON.stringify(f);
  const current = () => twinGeneration.get(family) === generation;
  try {
    await Promise.all([
      document.fonts.load(`16px ${q(twin)}`, VERTICAL_ALTERNATE_SAMPLE),
      document.fonts.load(`16px ${q(family)}`, PROBE),
    ]);
  } catch {
    removeFaces(loaded);
    return false;
  }
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  const applied = !!ctx && current() && inkKey(ctx, `100px ${q(twin)}`, PROBE) !== inkKey(ctx, `100px ${q(family)}`, PROBE);
  if (applied) {
    twins.set(family, twin);
    twinFaces.set(family, loaded);
  } else removeFaces(loaded);
  return applied;
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

const SIZE_RE = /(\d*\.?\d+)px(\s*\/\s*[^\s]+)?\s*/;

/** The em (px) and the first family of a CSS font shorthand. */
function parseFont(font: string): { em: number; family: string; prefix: string } {
  const m = SIZE_RE.exec(font);
  if (!m) return { em: 16, family: font.trim(), prefix: '' };
  const prefix = font.slice(0, m.index + m[0].length);
  const rest = font.slice(m.index + m[0].length);
  let first = rest.split(',')[0]!.trim();
  if (first.length >= 2 && /^["']/.test(first) && first.endsWith(first[0]!)) first = first.slice(1, -1);
  return { em: parseFloat(m[1]!), family: first, prefix };
}

/** How text is put on the canvas: filled, stroked (an outline), or both
 *  (outline over the fill). */
export type TextPaintMode = 'fill' | 'stroke' | 'fillStroke';

function put(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mode: TextPaintMode): void {
  if (mode !== 'stroke') ctx.fillText(text, x, y);
  if (mode !== 'fill') ctx.strokeText(text, x, y);
}

/**
 * {@link put} for horizontal text that may hold two CJK marks side by side
 * (`）》`, `”“`, see `cjkMarkCuts`): Chrome would set the first half width
 * in one run, where the layout may have measured each at its own advance.
 * Such text is cut where the layout's measurer cut it (`rule`, see
 * `markCuts`) and painted piece by piece, each piece where the one before
 * ends as the browser sets it (`measureRunWidth`, the context's tracking
 * and word spacing on top) — for a line of the CJK composer, where its
 * characters are. Any other text is one call, as before.
 */
function putHorizontal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mode: TextPaintMode, rule: MarkCutRule): void {
  const pieces = markPieces(text, rule);
  if (pieces.length === 1) {
    put(ctx, text, x, y, mode);
    return;
  }
  const font = ctx.font;
  const spacing = parseFloat(ctx.letterSpacing) || 0;
  const wordSpacing = parseFloat((ctx as { wordSpacing?: string }).wordSpacing ?? '') || 0;
  const widths = pieces.map((piece) => measureRunWidth(piece, font)
    + (spacing === 0 ? 0 : spacing * graphemeCount(piece))
    + (wordSpacing === 0 ? 0 : wordSpacing * (piece.split(' ').length - 1)));
  const align = ctx.textAlign;
  let px = x;
  if (align === 'center' || align === 'right' || align === 'end') {
    const total = widths.reduce((a, b) => a + b, 0);
    px -= align === 'center' ? total / 2 : total;
    ctx.textAlign = 'left';
  }
  for (let i = 0; i < pieces.length; i++) {
    put(ctx, pieces[i]!, px, y, mode);
    px += widths[i]!;
  }
  if (ctx.textAlign !== align) ctx.textAlign = align;
}

/**
 * Paint `text` from `x` on `baseline`, as `ctx.fillText` would (and
 * `ctx.strokeText` for `mode` `'stroke'` / `'fillStroke'`). On a
 * horizontal page it is exactly those calls, except that two CJK marks
 * side by side that the layout measured apart are painted apart (see
 * `putHorizontal`); `cuts` says how the layout measured the text
 * (`MarkCutRule`: whole by default; word by word for a line of a Latin
 * paragraph; character by character for a line of the CJK composer). In a
 * vertical flow (see the module comment) it sets the text vertically:
 * `tracking` (px after every character, default the context's
 * `letterSpacing`) is added after each cell and inside each sideways run.
 * Returns nothing; the caller advances by the width the layout measured.
 */
export function fillFlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  mode: TextPaintMode = 'fill',
  tracking?: number,
  cuts: MarkCutRule = 'text',
  /** The orientation the author gave the text (`VDTLineSegment.tcy` /
   *  `orientation`); vertical text only. */
  orient?: ForcedOrientation,
): void {
  const state = paintState;
  if (!state) {
    putHorizontal(ctx, text, x, baseline, mode, cuts);
    return;
  }
  paintVertical(ctx, state, text, x, baseline, mode, tracking, orient);
}

function paintVertical(
  ctx: CanvasRenderingContext2D,
  state: VerticalPaintState,
  text: string,
  x: number,
  y: number,
  mode: TextPaintMode,
  trackingArg: number | undefined,
  orient?: ForcedOrientation,
): void {
  const font = ctx.font;
  const { em, family, prefix } = parseFont(font);
  const central = (state.axes?.[family] ?? DEFAULT_CENTRAL_BASELINE) * em;
  const spacing = ctx.letterSpacing;
  const tracking = trackingArg ?? (parseFloat(spacing) || 0);
  // A caller centring on `middle` (a list bullet) gives the axis itself.
  const middle = ctx.textBaseline === 'middle';
  const axis = middle ? y : y - central;
  const baseline = axis + central;
  const align = ctx.textAlign;
  if (middle) ctx.textBaseline = 'alphabetic';
  if (align !== 'left' && align !== 'start') ctx.textAlign = 'left';
  const twin = twins.get(family);
  const twinFont = twin ? `${prefix}${JSON.stringify(twin)}` : undefined;
  let cx = x;
  const graphemes = graphemesOf(text);
  const runs = orient ? forcedVerticalRuns(graphemes, orient) : verticalRuns(graphemes, state.region, state.uprightDigits ?? 0);
  for (const run of runs) {
    if (run.cell === undefined) {
      // The frame turns it sideways: painted as it is, the letters tracked.
      put(ctx, run.text, cx, baseline, mode);
      cx += ctx.measureText(run.text).width;
      continue;
    }
    if (run.glyph.orient === 'tcy') {
      cx += paintCombined(ctx, run.text, cx, axis, em, central, mode) + tracking;
      continue;
    }
    cx += paintCell(ctx, run.text, run.glyph, cx, axis, em * run.cell, em, central, mode, twinFont, tracking !== 0) + tracking;
  }
  if (middle) ctx.textBaseline = 'middle';
  if (align !== 'left' && align !== 'start') ctx.textAlign = align;
}

/** Paint one cell (`cell` px along the line: an em, or half of one)
 *  centred on `(x + cell / 2, axis)`; returns its advance. */
function paintCell(
  ctx: CanvasRenderingContext2D,
  g: string,
  glyph: VerticalGlyph,
  x: number,
  axis: number,
  cell: number,
  /** The font's em: the glyph's own box, whole across the column even
   *  where the cell is shorter along it. */
  em: number,
  central: number,
  mode: TextPaintMode,
  twinFont: string | undefined,
  tracked: boolean,
): number {
  const cx = x + cell / 2;
  const spacing = tracked ? ctx.letterSpacing : undefined;
  if (spacing !== undefined) ctx.letterSpacing = '0px';
  let kind: 'upright' | 'rotate' | 'corner' = 'upright';
  let char = g;
  let face: string | undefined;
  if (glyph.orient === 'rotate') kind = 'rotate';
  else if (glyph.orient === 'alternate') {
    if (twinFont) face = twinFont;
    else {
      kind = glyph.fallback === 'corner' ? 'corner' : 'rotate';
      if (glyph.substitute) char = glyph.substitute;
    }
  }
  const baseFont = face ? ctx.font : undefined;
  if (face) ctx.font = face;
  const w = ctx.measureText(char).width;
  ctx.save();
  ctx.translate(cx, axis);
  if (kind === 'rotate') {
    // Turned with the frame, about the em box's centre; a dash stretched
    // to fill its cell.
    if (glyph.stretch && w > 0 && w < cell) ctx.scale(cell / w, 1);
    put(ctx, char, -w / 2, central, mode);
  } else {
    // Stood upright again about the cell's centre.
    ctx.rotate(-Math.PI / 2);
    const offset = kind === 'corner' ? glyph.offset ?? CORNER_OFFSET_EM : undefined;
    const dx = offset ? offset.x * em : 0;
    const dy = offset ? offset.y * em : 0;
    put(ctx, char, -w / 2 + dx, central + dy, mode);
  }
  ctx.restore();
  if (baseFont !== undefined) ctx.font = baseFont;
  if (spacing !== undefined) ctx.letterSpacing = spacing;
  return cell;
}

/** Tate-chu-yoko: `text` side by side in one upright cell of one em
 *  (`em` px along the line) centred on `(x + em / 2, axis)`, squeezed
 *  across to the em when wider; no tracking inside. Returns the cell's
 *  advance. */
function paintCombined(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  axis: number,
  em: number,
  central: number,
  mode: TextPaintMode,
): number {
  const spacing = ctx.letterSpacing;
  const tracked = spacing !== '' && spacing !== '0px';
  if (tracked) ctx.letterSpacing = '0px';
  const w = ctx.measureText(text).width;
  const k = w > em ? em / w : 1;
  ctx.save();
  ctx.translate(x + em / 2, axis);
  ctx.rotate(-Math.PI / 2);
  if (k !== 1) ctx.scale(k, 1);
  put(ctx, text, -w / 2, central, mode);
  ctx.restore();
  if (tracked) ctx.letterSpacing = spacing;
  return em;
}

/**
 * Draw an image (or anything `draw` paints in a `w` × `h` box) inside a
 * box of the current frame: as is on a horizontal page; turned back to
 * stand upright on a vertical one, where the box's `w` runs down the sheet
 * and `h` across it. A box `sized` for that (`VDTDesignImageBlock.upright`:
 * its width is the picture's height) is filled; any other box was sized
 * for the picture's own proportions as if horizontal, which upright keep
 * them: scaled to fit the turned box, centred in it.
 */
export function drawUprightInBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  draw: (x: number, y: number, w: number, h: number) => void,
  sized = false,
): void {
  if (!paintState) {
    draw(x, y, w, h);
    return;
  }
  ctx.save();
  ctx.translate(x, y + h);
  ctx.rotate(-Math.PI / 2);
  // The box on the sheet is `h` wide and `w` tall.
  if (sized) draw(0, 0, h, w);
  else {
    const k = w > 0 && h > 0 ? Math.min(h / w, w / h) : 1;
    const dw = w * k;
    const dh = h * k;
    draw((h - dw) / 2, (w - dh) / 2, dw, dh);
  }
  ctx.restore();
}
