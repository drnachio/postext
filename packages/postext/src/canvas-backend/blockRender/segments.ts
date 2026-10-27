// Painting a line's segments: fonts, colours, maths, rule leaders, and the
// composed (per-word) painter.
import { type VDTLineSegment, leaderRuleGeometry } from '../../vdt.js';
import type { MathRender } from '../../math/types.js';
import { getMathRaster } from '../../math/rasterCache.js';
import { renderScoreSegment } from '../scoreRender.js';
import { paintSwatchSegment } from '../swatch.js';
import { paintChip } from '../chip.js';
import { counterFlipBox } from '../mirrorFrame.js';
import { rasterScaleOf } from '../deviceScale.js';
import { fillWordsText, fillSegmentText } from '../segmentText.js';
import type { MarkCutRule } from '../../measure/cjk/markCuts.js';
import { paintSideMarker, paintWarichu, paintRuby, paintKunten } from '../annotations.js';
import { type WordRun, fillSegmentWord, paintsSegmentLanguage } from '../wordRuns.js';
import { saveContext, restoreContext, setLetterSpacing } from '../contextState.js';
import { fillContextText } from '../contextText.js';

export function pickSegmentFont(
  bold: boolean,
  italic: boolean,
  font: string,
  boldFont: string | undefined,
  italicFont: string | undefined,
  boldItalicFont: string | undefined,
): string {
  if (bold && italic && boldItalicFont) return boldItalicFont;
  if (bold && boldFont) return boldFont;
  if (italic && italicFont) return italicFont;
  return font;
}

function pickSegmentColor(
  bold: boolean,
  italic: boolean,
  color: string,
  boldColor: string | undefined,
  italicColor: string | undefined,
): string {
  if (bold && boldColor) return boldColor;
  if (italic && italicColor) return italicColor;
  return color;
}

/** Parsed Path2D objects per math render, so repeated paints of the same
 *  formula don't re-parse the SVG path data. */
const mathPathCache = new WeakMap<MathRender, Path2D[]>();

function getMathPaths(render: MathRender): Path2D[] {
  let paths = mathPathCache.get(render);
  if (!paths) {
    paths = render.paths.map((p) => new Path2D(p.d));
    mathPathCache.set(render, paths);
  }
  return paths;
}

function renderMathRender(
  ctx: CanvasRenderingContext2D,
  render: MathRender,
  topLeftX: number,
  topLeftY: number,
  fallbackColor: string,
): void {
  const { viewBox, widthPx, heightPx, paths } = render;
  if (!paths.length || viewBox.width <= 0 || viewBox.height <= 0) {
    // Fallback — draw a muted placeholder so the box is still visible.
    saveContext(ctx);
    ctx.fillStyle = render.error ? 'rgba(198, 40, 40, 0.15)' : 'rgba(160, 160, 160, 0.15)';
    ctx.fillRect(topLeftX, topLeftY, widthPx, heightPx);
    restoreContext(ctx);
    return;
  }
  // The bitmap at the size the formula shows at on the device (#674).
  const raster = getMathRaster(render, fallbackColor, rasterScaleOf(ctx));
  if (raster) {
    ctx.drawImage(raster, topLeftX, topLeftY, widthPx, heightPx);
    return;
  }
  const sx = widthPx / viewBox.width;
  const sy = heightPx / viewBox.height;
  const path2ds = getMathPaths(render);
  // Paths are not a run or a picture the mirrored frame turns back on its
  // own (see `mirrorFrame.ts`): the formula asks for it.
  counterFlipBox(ctx, topLeftX, widthPx, () => {
    saveContext(ctx);
    ctx.translate(topLeftX, topLeftY);
    ctx.scale(sx, sy);
    ctx.translate(-viewBox.minX, -viewBox.minY);
    for (let i = 0; i < paths.length; i++) {
      ctx.fillStyle = paths[i]!.fill === 'currentColor' ? fallbackColor : paths[i]!.fill;
      ctx.fill(path2ds[i]!);
    }
    restoreContext(ctx);
  });
}

/** Paint an inline formula segment on its line's baseline (body lines,
 *  and caption, note and cell lines, #541). */
export function renderMathSegment(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  baselineY: number,
  fallbackColor: string,
): void {
  if (!seg.mathRender) return;
  renderMathRender(ctx, seg.mathRender, x, baselineY - seg.mathRender.ascentPx, fallbackColor);
}

/** Per-block text styling shared by every line. Built once in renderBlock. */
export interface BlockTextStyle {
  font: string;
  boldFont: string | undefined;
  italicFont: string | undefined;
  boldItalicFont: string | undefined;
  color: string;
  boldColor: string | undefined;
  italicColor: string | undefined;
  refColor: string | undefined;
}

/**
 * Paint the segments of a line set word by word on a horizontal page (see
 * {@link renderLine}) left to right starting at `startX`. When
 * `justifiedSpaceWidth` is set, spaces advance by it instead of their
 * measured width. Tracks the current canvas font/fillStyle to skip
 * redundant state changes (segments overwhelmingly share styling). `cjk`:
 * the line may hold CJK text, whose marks that meet are painted apart
 * (`fillWordsText`); without it, each segment is one `fillText`.
 * `tracking` is the context's `letterSpacing` on entry: a word of a joining
 * script is painted without it, and a word set in several styles is painted
 * as one shaped word (see `fillSegmentWord`). `order`: the order to advance
 * through the segments in (`VDTLine.order`, a line holding right-to-left
 * text), each right-to-left one painted as a right-to-left run; the spaces
 * go with their words, so justification is unchanged.
 */
export function renderSegments(
  ctx: CanvasRenderingContext2D,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  style: BlockTextStyle,
  justifiedSpaceWidth: number | undefined,
  cjk: boolean,
  tracking = 0,
  order?: readonly number[],
): void {
  let x = startX;
  let currentFont = '';
  let currentFill = '';
  const paint = cjk
    ? (text: string, px: number, py: number): void => fillWordsText(ctx, text, px, py)
    : (text: string, px: number, py: number): void => fillContextText(ctx, text, px, py);
  const runStyle = (run: WordRun): { font: string; fill: string } => ({
    font: pickSegmentFont(!!run.bold, !!run.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont),
    fill: pickSegmentColor(!!run.bold, !!run.italic, style.color, style.boldColor, style.italicColor),
  });
  for (let k = 0; k < segments.length; k++) {
    const seg = segments[order ? order[k]! : k]!;
    if (seg.kind === 'space') {
      x += justifiedSpaceWidth ?? seg.width;
      continue;
    }
    if (seg.leader === 'rule') {
      // A tab stop's rule leader (#622).
      paintRuleLeader(ctx, x, baseline, seg.width, seg.color ?? style.color, style.font);
      currentFill = '';
      x += seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      renderMathSegment(ctx, seg, x, baseline, style.color);
      x += seg.width;
      // Math painting touches canvas state; force re-set on the next text segment.
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.kind === 'score') {
      renderScoreSegment(ctx, seg, x, baseline, style.color);
      x += seg.width;
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.kind === 'swatch') {
      paintSwatchSegment(ctx, seg.swatch, x, baseline, seg.width, style.color, seg.rtl === true);
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      paintChip(ctx, seg.chip, x, baseline, (run) =>
        pickSegmentColor(!!run.bold, !!run.italic, style.color, style.boldColor, style.italicColor));
      x += seg.width;
      // The chip set its own font and fill; force a re-set on the next text.
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap: its run, not its text.
      paintSideMarker(ctx, seg.sideMarker, x, baseline, seg.color ?? style.color);
      x += seg.width;
      currentFont = '';
      currentFill = '';
      continue;
    }
    const font = seg.fontString
      ?? pickSegmentFont(!!seg.bold, !!seg.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont);
    if (font !== currentFont) {
      ctx.font = font;
      currentFont = font;
    }
    const fill = seg.color
      ?? (seg.refResourceId !== undefined && style.refColor
        ? style.refColor
        : pickSegmentColor(!!seg.bold, !!seg.italic, style.color, style.boldColor, style.italicColor));
    if (fill !== currentFill) {
      ctx.fillStyle = fill;
      currentFill = fill;
    }
    fillSegmentWord(ctx, seg, x, baseline + (seg.baselineShift ?? 0), tracking, paint, runStyle);
    x += seg.width;
  }
}

/** Whether a segment of a line set word by word paints differently from
 *  the block's plain text. An orientation mark (`:tcy`, `:upright`,
 *  `:sideways`) keeps its segment apart. */
export function segmentIsStyled(s: VDTLineSegment): boolean {
  return !!s.bold || !!s.italic || s.kind === 'math' || s.kind === 'score' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined
    || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined
    || s.tcy !== undefined || s.orientation !== undefined || s.labelTab !== undefined || s.runs !== undefined || s.sideMarker !== undefined
    // A word with no letter painted in the script of its context (#725).
    || s.leader !== undefined || s.scriptContext !== undefined
    // A word of a run in its own language, painted in it (#764).
    || paintsSegmentLanguage(s);
}

/** A rule leader (#622): a line across `width` px under the baseline, its
 *  geometry from the block's text size (`leaderRuleGeometry`). */
function paintRuleLeader(ctx: CanvasRenderingContext2D, x: number, baseline: number, width: number, color: string, font: string): void {
  // From a number's first digit only (`\D` before it): linear on long digit runs.
  const m = /(?:^|\D)(\d+(?:\.\d+)?|\.\d+)px/.exec(font);
  const { dy, thickness } = leaderRuleGeometry(m ? Number(m[1]) : 16);
  ctx.fillStyle = color;
  ctx.fillRect(x, baseline + dy - thickness / 2, width, thickness);
}

/**
 * {@link renderSegments} for a line of the CJK composer or any line down a
 * vertical page: each text segment through `fillSegmentText` (its
 * `inkOffset`, `inkScale` and orientation, its marks cut by `cuts`), a
 * Han–Latin space at its own width, a warichu note's rows and a ruby
 * reading. `tracking` is the block's and the line's (the context's
 * `letterSpacing` on entry); a segment's own tracking (a justified CJK
 * line) is painted on top of it and the context is left as it was found.
 */
export function renderComposedSegments(
  ctx: CanvasRenderingContext2D,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  style: BlockTextStyle,
  justifiedSpaceWidth?: number,
  tracking = 0,
  /** How the line was measured: two marks that meet are painted apart
   *  where the measurer set them apart (see `fillFlowText`). */
  cuts: MarkCutRule = 'words',
): void {
  let x = startX;
  let currentFont = '';
  let currentFill = '';
  let spacing = tracking;
  for (const seg of segments) {
    if (seg.kind === 'space') {
      // A Han–Latin space keeps the width the composer set.
      x += seg.autospace ? seg.width : justifiedSpaceWidth ?? seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      renderMathSegment(ctx, seg, x, baseline, style.color);
      x += seg.width;
      // Math painting touches canvas state; force re-set on the next text segment.
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.kind === 'score') {
      renderScoreSegment(ctx, seg, x, baseline, style.color);
      x += seg.width;
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.kind === 'swatch') {
      paintSwatchSegment(ctx, seg.swatch, x, baseline, seg.width, style.color, seg.rtl === true);
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      // A chip was measured at the block's tracking, never at the spacing a
      // justified run before it added between its characters: painted with
      // that spacing still set, its words ran into the text after it.
      if (spacing !== tracking) {
        setLetterSpacing(ctx, tracking);
        spacing = tracking;
      }
      paintChip(ctx, seg.chip, x, baseline, (run) =>
        pickSegmentColor(!!run.bold, !!run.italic, style.color, style.boldColor, style.italicColor));
      x += seg.width;
      // The chip set its own font and fill; force a re-set on the next text.
      currentFont = '';
      currentFill = '';
      continue;
    }
    if (seg.warichu) {
      // A warichu note's part: its two rows, not its text (#195).
      paintWarichu(ctx, seg.warichu, x, baseline, style.color);
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap: its run, not its text.
      paintSideMarker(ctx, seg.sideMarker, x, baseline, seg.color ?? style.color);
      x += seg.width;
      currentFont = '';
      currentFill = '';
      continue;
    }
    const font = seg.fontString
      ?? pickSegmentFont(!!seg.bold, !!seg.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont);
    if (font !== currentFont) {
      ctx.font = font;
      currentFont = font;
    }
    const fill = seg.color
      ?? (seg.refResourceId !== undefined && style.refColor
        ? style.refColor
        : pickSegmentColor(!!seg.bold, !!seg.italic, style.color, style.boldColor, style.italicColor));
    if (fill !== currentFill) {
      ctx.fillStyle = fill;
      currentFill = fill;
    }
    const segSpacing = tracking + (seg.tracking ?? 0);
    if (segSpacing !== spacing) {
      setLetterSpacing(ctx, segSpacing);
      spacing = segSpacing;
    }
    // A compressed CJK mark is painted before its box (`inkOffset`), along
    // the line in either writing mode.
    fillSegmentText(ctx, seg, x, baseline, cuts);
    // A ruby base's reading (#194).
    if (seg.ruby) paintRuby(ctx, seg.ruby, x, baseline, fill);
    // Kanbun marks (#430).
    if (seg.kunten) paintKunten(ctx, seg.kunten, x, baseline, fill);
    x += seg.width;
  }
  if (spacing !== tracking) setLetterSpacing(ctx, tracking);
}

/** Whether a segment of a line of the CJK composer, or of a line down a
 *  vertical page, paints differently from the block's plain text. */
export function composedSegmentIsStyled(s: VDTLineSegment): boolean {
  return !!s.bold || !!s.italic || s.kind === 'math' || s.kind === 'score' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined
    || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined || s.tracking !== undefined
    || s.inkOffset !== undefined || s.hangs !== undefined || s.autospace !== undefined || s.tcy !== undefined || s.orientation !== undefined
    || s.ruby !== undefined || s.kunten !== undefined || s.warichu !== undefined || s.labelTab !== undefined || s.sideMarker !== undefined
    // A run in its own language, painted in it (#764).
    || paintsSegmentLanguage(s);
}
