// The vertical-flow painter: paint state, sideways runs and upright cells.
import type { CjkRegion } from '../../types.js';
import { DEFAULT_CENTRAL_BASELINE } from '../../vdt.js';
import { verticalRuns, type ForcedOrientation, forcedVerticalRuns, type VerticalGlyph, CORNER_OFFSET_EM } from '../../writing/writingMode.js';
import { graphemesOf, graphemeCount } from '../../measure/graphemes.js';
import { type MarkCutRule, markPieces } from '../../measure/cjk/markCuts.js';
import { withMeasureLanguage, measureRunWidth } from '../../measure/canvas.js';
import { baseFontFamily } from '../../fonts/figureStyle.js';
import { hasCJK } from '../../measure/cjk/cjk.js';
import { fillTrackedWord } from '../trackedText.js';
import { letterSpacingOf, languageOf, setLetterSpacing, saveContext, restoreContext } from '../contextState.js';
import { contextTextWidth, fillContextText, strokeContextText, measureContextText } from '../contextText.js';
import { twins, inkKey } from './alternates.js';

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

/**
 * How far the pen moves down the line for `text` painted now in the
 * context's font, as the layout measured it (`verticalTextWidth`): each
 * sideways run at the advance the context gives it, each cell at its
 * length in ems, `tracking` px after every character and every cell.
 * The context's `letterSpacing` is 0 (the tracking is counted here).
 * Undefined on a horizontal page.
 */
export function verticalFlowAdvance(ctx: CanvasRenderingContext2D, text: string, tracking: number): number | undefined {
  const state = paintState;
  if (!state) return undefined;
  const em = parseFont(ctx.font).em;
  let width = 0;
  for (const run of verticalRuns(graphemesOf(text), state.region, state.uprightDigits ?? 0)) {
    width += run.cell === undefined
      ? contextTextWidth(ctx, run.text) + (tracking === 0 ? 0 : tracking * graphemeCount(run.text))
      : em * run.cell + tracking;
  }
  return width;
}

// ---------------------------------------------------------------------------
// The painter
// ---------------------------------------------------------------------------

/** The size of a CSS font shorthand (`12px`, `12.5px`, `.5px`, with any
 *  `/line-height` and the spaces after), in group 2; group 1 is what comes
 *  before the number (nothing or one character that is no digit), so a
 *  match starts at a number's first digit only and a long run of digits
 *  stays linear. */
const SIZE_RE = /(^|\D)(\d+(?:\.\d+)?|\.\d+)px(\s*\/\s*[^\s]+)?\s*/;

/** The em (px) and the first family of a CSS font shorthand. */
function parseFont(font: string): { em: number; family: string; prefix: string } {
  const m = SIZE_RE.exec(font);
  if (!m) return { em: 16, family: font.trim(), prefix: '' };
  const prefix = font.slice(0, m.index + m[0].length);
  const rest = font.slice(m.index + m[0].length);
  let first = rest.split(',')[0]!.trim();
  if (first.length >= 2 && /^["']/.test(first) && first.endsWith(first[0]!)) first = first.slice(1, -1);
  return { em: parseFloat(m[2]!), family: first, prefix };
}

/** How text is put on the canvas: filled, stroked (an outline), or both
 *  (outline over the fill). */
export type TextPaintMode = 'fill' | 'stroke' | 'fillStroke';

function put(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mode: TextPaintMode): void {
  if (mode !== 'stroke') fillContextText(ctx, text, x, y);
  if (mode !== 'fill') strokeContextText(ctx, text, x, y);
}

/**
 * {@link put} for horizontal text that may hold two CJK marks side by side
 * (`）》`, `”“`, see `cjkMarkCuts`): Chrome would set the first half width
 * in one run, where the layout may have measured each at its own advance.
 * Such text is cut where the layout's measurer cut it (`rule`, see
 * `markCuts`) and painted piece by piece, each piece where the one before
 * ends as the browser sets it (`measureRunWidth`, the tracking the backend
 * set on the context on top; it sets no word spacing) — for a line of the
 * CJK composer, where its characters are. Any other text is one call, as
 * before.
 */
function putHorizontal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, mode: TextPaintMode, rule: MarkCutRule): void {
  const pieces = markPieces(text, rule);
  if (pieces.length === 1) {
    put(ctx, text, x, y, mode);
    return;
  }
  const font = ctx.font;
  const spacing = letterSpacingOf(ctx);
  // Measured in the language the context paints in (#764), where the
  // layout measured them.
  const widths = withMeasureLanguage(languageOf(ctx), () => pieces.map((piece) => measureRunWidth(piece, font)
    + (spacing === 0 ? 0 : spacing * graphemeCount(piece))));
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
 * `tracking` (px after every character, default the letter-spacing the
 * backend set on the context, `letterSpacingOf`) is added after each cell
 * and inside each sideways run.
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
  const tracking = trackingArg ?? letterSpacingOf(ctx);
  // A caller centring on `middle` (a list bullet) gives the axis itself.
  const middle = ctx.textBaseline === 'middle';
  const axis = middle ? y : y - central;
  const baseline = axis + central;
  const align = ctx.textAlign;
  if (middle) ctx.textBaseline = 'alphabetic';
  if (align !== 'left' && align !== 'start') ctx.textAlign = 'left';
  // A feature family (a style's figures, #1237) paints its vertical forms
  // with its base family's twin.
  const twin = twins.get(family) ?? twins.get(baseFontFamily(family));
  const twinFont = twin ? `${prefix}${JSON.stringify(twin)}` : undefined;
  let cx = x;
  const graphemes = graphemesOf(text);
  const runs = orient ? forcedVerticalRuns(graphemes, orient, state.region) : verticalRuns(graphemes, state.region, state.uprightDigits ?? 0);
  for (const run of runs) {
    if (run.cell === undefined) {
      // The frame turns it sideways: painted as it is, the letters tracked.
      // A run that would lose its ligatures to the tracking keeps them, in
      // pieces, and the pen moves by the width it was measured at: its
      // natural width and the tracking after each letter (#703). Painted
      // whole it was wider than its place, and so was the pen's move.
      const spaced = letterSpacingOf(ctx);
      const advance = spaced !== 0
        ? fillTrackedWord(ctx, run.text, cx, baseline, spaced, (piece, px, py) => put(ctx, piece, px, py, mode))
        : (put(ctx, run.text, cx, baseline, mode), undefined);
      cx += advance ?? contextTextWidth(ctx, run.text);
      continue;
    }
    if (run.glyph.orient === 'tcy') {
      cx += paintCombined(ctx, run.glyph.paintAs ?? run.text, cx, axis, em, central, mode) + tracking;
      continue;
    }
    cx += paintCell(ctx, run.text, run.glyph, cx, axis, em * run.cell, em, central, mode, twinFont) + tracking;
  }
  if (middle) ctx.textBaseline = 'middle';
  if (align !== 'left' && align !== 'start') ctx.textAlign = align;
}

/** Whether the twin face (`twin`, a font string) gives `char` a glyph of
 *  its own — a vertical form — where the face (`face`) has the horizontal
 *  one: their ink at 100 px differs. Cached per family pair. */
const formCache = new Map<string, boolean>();
function twinHasForm(ctx: CanvasRenderingContext2D, face: string, twin: string, char: string): boolean {
  const at100 = (font: string) => font.replace(SIZE_RE, (_size, before: string) => `${before}100px `);
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
): number {
  const cx = x + cell / 2;
  // A cell is one character: painted with no letter-spacing, which is
  // put back for the sideways runs of the line.
  const spacing = letterSpacingOf(ctx);
  if (spacing !== 0) setLetterSpacing(ctx, 0);
  let kind: 'upright' | 'rotate' | 'corner' = 'upright';
  // What is painted: a Japanese “ as 〝, whose vertical form is looked for.
  let char = glyph.paintAs ?? g;
  let face: string | undefined;
  if (glyph.orient === 'rotate') {
    // A dash, an ellipsis, a wave dash: the font's vertical form when the
    // twin has one, else turned.
    if (twinFont && twinHasForm(ctx, ctx.font, twinFont, char)) face = twinFont;
    else kind = 'rotate';
  } else if (glyph.orient === 'alternate') {
    // The twin's vertical form. A mark or a small kana moved in its cell
    // without one takes it only when the twin has one for the character (a
    // face with no `vert` for a small kana draws it as the plain face
    // does, where it must move up and right).
    if (twinFont && (glyph.fallback !== 'corner' || twinHasForm(ctx, ctx.font, twinFont, char))) face = twinFont;
    else {
      kind = glyph.fallback === 'corner' ? 'corner' : 'rotate';
      if (glyph.substitute) char = glyph.substitute;
    }
  }
  const baseFont = face ? ctx.font : undefined;
  if (face) ctx.font = face;
  const w = contextTextWidth(ctx, char);
  saveContext(ctx);
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
      const m = measureContextText(ctx, char);
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
  restoreContext(ctx);
  if (baseFont !== undefined) ctx.font = baseFont;
  if (spacing !== 0) setLetterSpacing(ctx, spacing);
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
  const spacing = letterSpacingOf(ctx);
  const tracked = spacing !== 0;
  if (tracked) setLetterSpacing(ctx, 0);
  const w = contextTextWidth(ctx, text);
  const k = w > em ? em / w : 1;
  saveContext(ctx);
  ctx.translate(x + em / 2, axis);
  ctx.rotate(-Math.PI / 2);
  if (k !== 1) ctx.scale(k, 1);
  put(ctx, text, -w / 2, central, mode);
  restoreContext(ctx);
  if (tracked) setLetterSpacing(ctx, spacing);
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
  saveContext(ctx);
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
  restoreContext(ctx);
}
