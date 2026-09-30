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
 * `featureSettings: '"vert" 1, "fwid" 1'`, which Chrome 140+ applies to
 * canvas text. Without a twin, the fallbacks of `verticalOrientation`
 * apply: brackets and quotes turned about the em box's centre, mainland
 * pause and stop marks moved to the upper right of the cell (each by its
 * glyph's `offset`). A dash, an ellipsis or a wave dash stands in the
 * twin's vertical form when the font has one (Noto CJK's —— needs `fwid`
 * with `vert`: a rule down the middle of the cell), else it is turned
 * with its ink centred on the column's axis.
 */

import type { CjkRegion } from '../types';
import { DEFAULT_CENTRAL_BASELINE } from '../vdt';
import { forcedVerticalRuns, verticalRuns, CORNER_OFFSET_EM, type ForcedOrientation, type VerticalGlyph } from '../writingMode';
import { graphemeCount, graphemesOf } from '../measure/graphemes';
import { markPieces, type MarkCutRule } from '../measure/markCuts';
import { measureRunWidth } from '../measure/canvas';
import { hasCJK } from '../measure/cjk';

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
/** Per family, the faces its twin holds, by source and descriptors
 *  ({@link faceKey}): a later call adds only the others. */
const twinFaceKeys = new Map<string, Set<string>>();
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
  // The host's twin: a later `loadVerticalAlternates` adds nothing to it.
  twinFaceKeys.delete(family);
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
    twinFaceKeys.delete(f);
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

/** The twin's features. `fwid` with `vert`: the full-width forms of
 *  dashes, whose vertical form Noto CJK keys to both; the marks the twin
 *  paints are full-width already. */
const TWIN_FEATURES = '"vert" 1, "fwid" 1';

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

/** A face descriptor's weight as the range it covers (`'400'`, `'bold'`,
 *  a variable face's `'100 900'`). */
function weightRange(weight: string | undefined): [number, number] {
  const w = weight?.trim().toLowerCase();
  if (!w || w === 'normal') return [400, 400];
  if (w === 'bold') return [700, 700];
  const n = w.split(/\s+/).map(Number).filter(Number.isFinite);
  return n.length === 0 ? [400, 400] : [n[0]!, n[1] ?? n[0]!];
}

/** The keyword a face descriptor's style starts with (`'oblique 10deg'`
 *  is `'oblique'`). */
function styleKeyword(style: string | undefined): string {
  const s = style?.trim().toLowerCase().split(/\s+/)[0];
  return s === 'italic' || s === 'oblique' ? s : 'normal';
}

/**
 * The faces the probe draws with, and the font shorthand's weight and
 * style for them: the regular face when the twin holds one (the text face),
 * else the first face given, with every face that shares its weight and
 * style (the files of a face cut into `unicodeRange` slices). A twin of
 * the bold faces alone is probed in bold: drawn at the default weight it
 * would be compared with the regular face and differ from it whatever the
 * feature did (#220).
 */
function probeFaces(faces: readonly VerticalAlternatesFace[]): { prefix: string; faces: VerticalAlternatesFace[] } {
  const regular = faces.find((f) => {
    const [lo, hi] = weightRange(f.weight);
    return styleKeyword(f.style) === 'normal' && lo <= 400 && 400 <= hi;
  });
  const chosen = regular ?? faces[0]!;
  const [lo, hi] = weightRange(chosen.weight);
  const style = styleKeyword(chosen.style);
  const weight = Math.min(hi, Math.max(lo, 400));
  const same = faces.filter((f) => (f.weight ?? '') === (chosen.weight ?? '') && (f.style ?? '') === (chosen.style ?? ''));
  return { prefix: `${style === 'normal' ? '' : `${style} `}${weight} `, faces: same };
}

/** A face by its source and descriptors. Bytes are told apart by
 *  identity: the same buffer passed again is the same face. */
const bufferIds = new WeakMap<ArrayBuffer, number>();
let nextBufferId = 0;
function faceKey(face: VerticalAlternatesFace): string {
  let source: string;
  if (typeof face.source === 'string') source = face.source;
  else {
    let id = bufferIds.get(face.source);
    if (id === undefined) {
      id = nextBufferId++;
      bufferIds.set(face.source, id);
    }
    source = `#${id}`;
  }
  return `${source}|${face.weight ?? ''}|${face.style ?? ''}|${face.unicodeRange ?? ''}`;
}

/** Add `faces` to `document.fonts` under `family`, with `featureSettings`
 *  when given; returns those the browser took. */
function addFaces(family: string, faces: readonly VerticalAlternatesFace[], featureSettings?: string): FontFace[] {
  const added: FontFace[] = [];
  for (const face of faces) {
    try {
      const src = typeof face.source === 'string' ? `url(${JSON.stringify(face.source)})` : face.source;
      const ff = new FontFace(family, src, {
        ...(face.weight ? { weight: face.weight } : {}),
        ...(face.style ? { style: face.style } : {}),
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
        ...(featureSettings ? { featureSettings } : {}),
      });
      document.fonts.add(ff);
      added.push(ff);
    } catch {
      // A face the browser refuses: the others may still cover the marks.
    }
  }
  return added;
}

/**
 * Load a twin of `family` with its vertical forms on (`featureSettings:
 * '"vert" 1'`) from the same sources, and register it when the browser
 * applies the feature to canvas text. The probe draws 「（《 with the twin
 * and with a copy of the same faces loaded without the feature, at the
 * weight and style of the faces the twin holds, and compares their ink; the
 * copy is removed afterwards. A twin whose faces leave the brackets as they
 * are (Chrome before 140 ignores `featureSettings` on canvas text) is not
 * registered, and the painter's fallbacks apply. Resolves to whether the
 * twin is in use. Browser only; a no-op (false) elsewhere.
 */
export async function loadVerticalAlternates(family: string, faces: readonly VerticalAlternatesFace[]): Promise<boolean> {
  if (typeof document === 'undefined' || !document.fonts || typeof FontFace === 'undefined' || faces.length === 0) return false;
  const registered = twins.get(family);
  if (registered !== undefined) {
    // A twin this browser was found to apply the feature to: the faces a
    // later call brings (the bold of a family whose regular face came
    // first) join it, so bold punctuation is not the regular face made
    // heavier. A twin the host registered itself is left to the host.
    const keys = twinFaceKeys.get(family);
    const own = twinFaces.get(family);
    if (!keys || !own) return true;
    const fresh = faces.filter((f) => !keys.has(faceKey(f)));
    if (fresh.length === 0) return true;
    const added = addFaces(registered, fresh, TWIN_FEATURES);
    for (const f of fresh) keys.add(faceKey(f));
    own.push(...added);
    try {
      const probe = probeFaces(fresh);
      await document.fonts.load(`${probe.prefix}16px ${JSON.stringify(registered)}`, VERTICAL_ALTERNATE_SAMPLE);
    } catch {
      // The faces load when first painted.
    }
    return true;
  }
  const generation = (twinGeneration.get(family) ?? 0) + 1;
  twinGeneration.set(family, generation);
  // A family loaded again (after `unregisterVerticalAlternates`) takes a
  // fresh name, so no face or glyph cache of the old file answers for it.
  const twin = generation > 1 ? `${verticalTwinName(family)} ${generation}` : verticalTwinName(family);
  const loaded = addFaces(twin, faces, TWIN_FEATURES);
  if (loaded.length === 0) return false;
  const probe = probeFaces(faces);
  const plainName = `${family} postext-probe ${generation}`;
  const plain = addFaces(plainName, probe.faces);
  const q = (f: string) => JSON.stringify(f);
  const current = () => twinGeneration.get(family) === generation;
  let applied = false;
  try {
    await Promise.all([
      document.fonts.load(`${probe.prefix}16px ${q(twin)}`, VERTICAL_ALTERNATE_SAMPLE),
      document.fonts.load(`${probe.prefix}16px ${q(plainName)}`, PROBE),
    ]);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    applied = !!ctx && plain.length > 0 && current()
      && inkKey(ctx, `${probe.prefix}100px ${q(twin)}`, PROBE) !== inkKey(ctx, `${probe.prefix}100px ${q(plainName)}`, PROBE);
  } catch {
    applied = false;
  }
  removeFaces(plain);
  if (applied) {
    twins.set(family, twin);
    twinFaces.set(family, loaded);
    twinFaceKeys.set(family, new Set(faces.map(faceKey)));
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
    // Text with no CJK is cut only under the composer's rule (see
    // `markCuts`): one call, with no cut to look for.
    if (cuts !== 'composed' && !hasCJK(text)) put(ctx, text, x, baseline, mode);
    else putHorizontal(ctx, text, x, baseline, mode, cuts);
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

/** Whether the twin face (`twin`, a font string) gives `char` a glyph of
 *  its own — a vertical form — where the face (`face`) has the horizontal
 *  one: their ink at 100 px differs. Cached per family pair. */
const formCache = new Map<string, boolean>();
function twinHasForm(ctx: CanvasRenderingContext2D, face: string, twin: string, char: string): boolean {
  const at100 = (font: string) => font.replace(SIZE_RE, '100px ');
  const key = `${at100(face)}|${at100(twin)}|${char}`;
  const hit = formCache.get(key);
  if (hit !== undefined) return hit;
  const saved = ctx.font;
  const plain = inkKey(ctx, at100(face), char);
  const vertical = inkKey(ctx, at100(twin), char);
  ctx.font = saved;
  const differs = plain !== vertical;
  formCache.set(key, differs);
  return differs;
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
  if (glyph.orient === 'rotate') {
    // A dash, an ellipsis, a wave dash: the font's vertical form when the
    // twin has one, else turned.
    if (twinFont && twinHasForm(ctx, ctx.font, twinFont, g)) face = twinFont;
    else kind = 'rotate';
  } else if (glyph.orient === 'alternate') {
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
    // Turned with the frame; a dash stretched to fill its cell. A bracket
    // or a quote turns about the em box's centre, so it hugs the character
    // it belongs to; a dash, an ellipsis, an interpunct is centred on the
    // axis by its ink (Noto's — sits 0.27 em above the baseline, not at the
    // em box's 0.38).
    if (glyph.stretch && w > 0 && w < cell) ctx.scale(cell / w, 1);
    let lift = central;
    if (glyph.orient === 'rotate') {
      const m = ctx.measureText(char);
      const ascent = m.actualBoundingBoxAscent;
      const descent = m.actualBoundingBoxDescent;
      if (Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0) lift = (ascent - descent) / 2;
    }
    put(ctx, char, -w / 2, lift, mode);
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
