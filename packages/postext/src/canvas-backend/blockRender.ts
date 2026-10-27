import type { VDTBlock, VDTDropCap, VDTLine, VDTLineSegment, TextAlign } from '../vdt.js';
import { leaderRuleGeometry, lineTextAlign } from '../vdt.js';
import type { MathRender } from '../math/types.js';
import { getMathRaster } from '../math/rasterCache.js';
import { renderScoreSegment } from './scoreRender.js';
import { renderHeaderFooterSlot } from './headerFooter.js';
import { renderResourceBlock } from './renderResourceBlock.js';
import { paintSwatchSegment } from './swatch.js';
import { paintChip } from './chip.js';
import { lineInkExtent, lineTrailingTracking } from '../paint/lineInk.js';
import { fillFlowText, verticalPaintActive } from './verticalText.js';
import { counterFlipBox, mirroredPaintActive } from './mirrorFrame.js';
import { rasterScaleOf } from './deviceScale.js';
import { paintRunInDirection } from './runDirection.js';
import { markerSetText } from '../writing/bidi.js';
import { fillSegmentText, fillWordsText } from './segmentText.js';
import { lineMarkCuts, type MarkCutRule } from '../measure/cjk/markCuts.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { paintKunten, paintLineHighlights, paintLineMarks, paintRuby, paintSideMarker, paintWarichu } from './annotations.js';
import { fillSegmentWord, paintsSegmentLanguage, type WordRun } from './wordRuns.js';
import { shapedOtherwise } from './trackedText.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { taskBoxTick } from '../paint/taskBox.js';
import { restoreContext, saveContext, setLetterSpacing } from './contextState.js';
import { paintedSegments, paintsAsOneText } from './wordPieces.js';
import { fillContextText } from './contextText.js';

function pickSegmentFont(
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
interface BlockTextStyle {
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
function renderSegments(
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
function segmentIsStyled(s: VDTLineSegment): boolean {
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
function renderComposedSegments(
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
function composedSegmentIsStyled(s: VDTLineSegment): boolean {
  return !!s.bold || !!s.italic || s.kind === 'math' || s.kind === 'score' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined
    || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined || s.tracking !== undefined
    || s.inkOffset !== undefined || s.hangs !== undefined || s.autospace !== undefined || s.tcy !== undefined || s.orientation !== undefined
    || s.ruby !== undefined || s.kunten !== undefined || s.warichu !== undefined || s.labelTab !== undefined || s.sideMarker !== undefined
    // A run in its own language, painted in it (#764).
    || paintsSegmentLanguage(s);
}

/**
 * Paint one line. A line of the CJK composer (`cjkComposed`) and every line
 * down a vertical page go to {@link renderComposedLine}. Any other line was
 * set word by word, and the fields only the composer sets (a segment's
 * `tracking`, `inkOffset`, `inkScale`, `hangs`, `autospace`, `ruby`,
 * `warichu`) are absent from it: it is painted as the canvas painted every
 * line before the CJK features, one `fillText` per segment or per line.
 * Only a line whose text holds CJK characters has its text cut at the
 * marks that meet (`fillWordsText`): the line's `text` holds the text of
 * every segment, except the leader of a contents entry (`tocEntry`, the
 * dots `measureTocBlock` adds), whose segments are each looked at.
 */
function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  style: BlockTextStyle,
  textAlign: TextAlign,
  columnWidth: number,
  columnX: number,
  trailing: number,
  tracking: number,
  tocEntry: boolean,
): void {
  if (line.cjkComposed || verticalPaintActive()) {
    renderComposedLine(ctx, line, style, textAlign, columnWidth, columnX, trailing, tracking);
    return;
  }
  // A leader's text (a contents row's, a tab stop's, #622) is not in the
  // line's text: its segments are looked at.
  const cjk = tocEntry || hasCJK(line.text) || (line.tabbed === true && line.segments?.some((sg) => sg.leader === 'text') === true);
  ctx.textBaseline = 'alphabetic';

  // A line whose block runs against its frame (a right-to-left paragraph on
  // a left-to-right page) carries its span (`measure`): it is justified
  // across it and set ragged from its start side, the right.
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const align = lineTextAlign(line, textAlign);
  // Effective width accounts for line-level indent (e.g. first-line or hanging indent)
  const lineIndent = lineX - columnX;
  const effectiveWidth = span ? span.width : columnWidth - lineIndent;
  const segments = line.segments;
  // Right-to-left runs on the line: painted in `order`, never as one text.
  // A line with none (a Latin line of a mirrored page, whose `order` only
  // turns the flow around) reads the same painted as one text.
  const directed = segments?.some((s) => s.rtl) ?? false;
  // The pieces of a word the layout measured whole are painted as that
  // word (#770), on a line painted segment by segment: asked for there.
  // On a line with an order they are joined too, and the order with them.
  const paintPieces = (x: number, justifiedSpaceWidth?: number): void => {
    const set = paintedSegments(ctx, line, false, tracking, (seg) =>
      seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont));
    renderSegments(ctx, set.segments!, x, line.baseline, style, justifiedSpaceWidth, cjk, tracking, set.order);
  };

  // Justified rendering with per-segment spacing. Last lines render ragged at
  // natural width — except when overfull: Knuth-Plass may accept a final line
  // wider than the measure on the assumption that its inter-word glue shrinks
  // (TeX glue-setting semantics), so honor that by compressing the spaces to
  // fit the measure exactly instead of overflowing into the clip.
  if (textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      paintPieces(lineX, justifiedSpaceWidth);
      return;
    }
  }

  // Centred / right alignment — math display blocks, and paragraph styles
  // set ragged from the left. Distribute the remaining space. The tracking
  // after the last glyph (`trailing`) is advance, not ink: left out, so the
  // letters are centred or end on the edge (EF-153).
  if ((align === 'center' || align === 'right') && segments) {
    let contentWidth = 0;
    for (const seg of segments) contentWidth += seg.width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = lineX + (align === 'center' ? slack / 2 : slack);
    paintPieces(startX);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour), or when a tracked line
  // holds a word of a joining script, which is painted untracked, or when
  // a line of verse tightened its word spaces to fit (#620); otherwise one
  // fillText paints the line.
  if (segments && (directed || line.verseLine?.spaceRatio !== undefined || segments.some(segmentIsStyled) || (tracking !== 0 && joiningScriptIn(line.text)))) {
    paintPieces(lineX);
    return;
  }

  ctx.font = style.font;
  ctx.fillStyle = style.color;
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = lineX + (align === 'right' ? plainSlack : align === 'center' ? plainSlack / 2 : 0);
  // A tracked line that would lose a ligature to the letter-spacing is
  // painted word by word, each as it was measured (#663).
  if (tracking !== 0 && segments && segments.length > 0 && shapedOtherwise(ctx, line.text)) {
    paintPieces(plainX);
    return;
  }
  // One text, where it is as wide as the line's words were measured: the
  // pieces of a plain paragraph's words were measured one by one, and a
  // face that kerns across a cut sets the line shorter; in a line with a
  // Han character the browser draws a word with no letter (a number, a
  // bracketed figure) by other rules than in the string it was measured
  // in (#770).
  if (segments && !paintsAsOneText(ctx, line, tracking, style.font)) {
    paintPieces(plainX);
    return;
  }
  if (cjk) {
    fillWordsText(ctx, line.text, plainX, line.baseline);
    return;
  }
  fillContextText(ctx, line.text, plainX, line.baseline);
}

/** {@link renderLine} for a line of the CJK composer or any line down a
 *  vertical page: hung marks and Han–Latin spaces kept out of the
 *  justification, each segment through {@link renderComposedSegments}. */
function renderComposedLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  style: BlockTextStyle,
  textAlign: TextAlign,
  columnWidth: number,
  columnX: number,
  trailing: number,
  tracking: number,
): void {
  ctx.textBaseline = 'alphabetic';

  const lineIndent = line.bbox.x - columnX;
  // A line beside a wrapped picture (#627) fills its own span.
  const effectiveWidth = line.measure?.wrap ? line.measure.width : columnWidth - lineIndent;
  // A line set word by word down a vertical page: the pieces of a word the
  // layout measured whole are painted as that word (#770,
  // `paintedSegments`), as on a horizontal line and as the HTML sets them.
  // A line of the composer, which measures a Western run whole, and a line
  // that carries an order are painted as they are.
  const segments = verticalPaintActive() && !line.cjkComposed && line.order === undefined && line.segments
    ? paintedSegments(ctx, line, false, tracking, (seg) =>
      seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont)).segments
    : line.segments;
  // A line of the CJK composer was measured character by character, any
  // other word by word: two marks that meet are painted apart where they
  // were measured apart.
  const cuts = lineMarkCuts(line);

  if (textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      // A hung mark is outside the measure; a Han–Latin space keeps its
      // width.
      if (seg.hangs) continue;
      if (seg.kind === 'space' && !seg.autospace) spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderComposedSegments(ctx, segments, line.bbox.x, line.baseline, style, justifiedSpaceWidth, tracking, cuts);
      return;
    }
  }

  // Hung marks stay out of the alignment, as the trailing tracking does.
  if ((textAlign === 'center' || textAlign === 'right') && segments) {
    const contentWidth = lineInkExtent(line, 0).width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = line.bbox.x + (textAlign === 'center' ? slack / 2 : slack);
    renderComposedSegments(ctx, segments, startX, line.baseline, style, undefined, tracking, cuts);
    return;
  }

  // Segment by segment: a line of the composer on a horizontal page always
  // (#770), each segment where the layout put it. Painted as one text, a
  // kana drew up to the mark after it and every character after the pair
  // stood off its place (`fillSegmentText`), and a number among Han
  // characters took other forms than in the string it was measured in
  // (`contextText.ts`). Down a vertical page a line in one style is one
  // call: the vertical painter sets it cell by cell.
  if (segments && segments.length > 0 && (!verticalPaintActive() || segments.some(composedSegmentIsStyled))) {
    renderComposedSegments(ctx, segments, line.bbox.x, line.baseline, style, undefined, tracking, cuts);
    return;
  }

  ctx.font = style.font;
  ctx.fillStyle = style.color;
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = line.bbox.x + (textAlign === 'right' ? plainSlack : textAlign === 'center' ? plainSlack / 2 : 0);
  fillFlowText(ctx, line.text, plainX, line.baseline, 'fill', undefined, cuts);
}

/**
 * The box of a task item (`VDTBlock.bulletBox`, #765): a square outline
 * from `bulletOffsetX`, centred on `bulletY`, its stroke inside the
 * square, and a tick with round ends when the item is done. Paths only:
 * no font draws it. In the flow of a vertical or a right-to-left page the
 * tick's points are turned or mirrored back, so it reads as on any page.
 */
function renderTaskBox(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  const box = block.bulletBox;
  const firstLine = block.lines[0];
  if (!box || block.bulletOffsetX === undefined || !firstLine) return;
  const { side, stroke } = box;
  const cx = block.bulletOffsetX + side / 2;
  const cy = block.bulletY ?? firstLine.baseline;
  saveContext(ctx);
  ctx.strokeStyle = block.bulletColor ?? block.color;
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.rect(cx - (side - stroke) / 2, cy - (side - stroke) / 2, side - stroke, side - stroke);
  ctx.stroke();
  if (box.checked) {
    const tick = taskBoxTick(side, verticalPaintActive() ? 'vertical' : mirroredPaintActive() ? 'mirrored' : undefined);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    tick.forEach(([dx, dy], i) => (i === 0 ? ctx.moveTo(cx + dx, cy + dy) : ctx.lineTo(cx + dx, cy + dy)));
    ctx.stroke();
  }
  restoreContext(ctx);
}

function renderBullet(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (block.bulletBox) {
    renderTaskBox(ctx, block);
    return;
  }
  if (!block.bulletText || !block.bulletFontString || block.bulletOffsetX === undefined) return;
  const firstLine = block.lines[0];
  if (!firstLine) return;
  saveContext(ctx);
  ctx.fillStyle = block.bulletColor ?? block.color;
  // A marker set as text (a contents number) sits on `bulletBaselineY` as
  // its baseline; a list bullet is centred on `bulletY`.
  const onBaseline = block.bulletBaselineY !== undefined;
  ctx.textBaseline = onBaseline ? 'alphabetic' : 'middle';
  ctx.font = block.bulletFontString;
  const y = block.bulletBaselineY ?? block.bulletY ?? firstLine.baseline;
  // A marker of a right-to-left item reads in its direction (#664).
  const put = (text: string, x: number): void => {
    if (block.bulletDirection) fillMarkerRuns(ctx, text, x, y, block.bulletDirection);
    else fillFlowText(ctx, text, x, y);
  };
  put(block.bulletText, block.bulletOffsetX);
  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    ctx.fillStyle = block.separatorColor ?? block.bulletColor ?? block.color;
    ctx.font = block.separatorFontString ?? block.bulletFontString;
    put(block.separatorText, block.separatorX);
    // The prefix run before the number, in the separator's style.
    if (block.prefixText && block.prefixX !== undefined) put(block.prefixText, block.prefixX);
  }
  restoreContext(ctx);
}

/**
 * A marker that reads right to left (`VDTBlock.bulletDirection`, #664) at
 * `x`, its left edge in the flow: one text set right to left
 * (`markerSetText`), which the browser orders and mirrors as it does the
 * HTML's box of the same text; a mirrored flow turns it back once, about
 * its box.
 *
 * Up to postext 1.29 it was painted run by run (`markerRuns`), each run a
 * text of its own, and a run with no letter set alone takes the face's
 * Latin forms where in the marker it takes the ones of the text around
 * it: in Amiri bold at 27.08 px `(١)` is 40.65 px wide as one text, in
 * the layout and in the HTML, and 31.22 px as its three runs; `١.` 24.43
 * against 22.02. A marker whose runs are as wide alone (`1-`, `•`,
 * `الفصل 3`) is painted on the same pixels either way (#770).
 */
function fillMarkerRuns(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, direction: 'rtl' | 'rtl-arabic'): void {
  paintRunInDirection(ctx, true, () => fillFlowText(ctx, markerSetText(text, direction), x, y), text);
}

/** A paragraph's drop cap (#623) on its baseline, and an opening mark
 *  hung before it at text size. */
function renderDropCap(ctx: CanvasRenderingContext2D, cap: VDTDropCap): void {
  saveContext(ctx);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = cap.color;
  ctx.font = cap.fontString;
  fillFlowText(ctx, cap.text, cap.x, cap.baselineY);
  if (cap.hang) {
    ctx.font = cap.hang.fontString;
    fillFlowText(ctx, cap.hang.text, cap.hang.x, cap.hang.baselineY);
  }
  restoreContext(ctx);
}

function renderStrikethrough(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  saveContext(ctx);
  ctx.strokeStyle = block.color;
  ctx.lineWidth = Math.max(1, block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1);
  for (const line of block.lines) {
    // Mid-height of the line box, close to x-height center.
    const y = line.baseline - (line.bbox.height * 0.28);
    ctx.beginPath();
    ctx.moveTo(line.bbox.x, y);
    ctx.lineTo(line.bbox.x + line.bbox.width, y);
    ctx.stroke();
  }
  restoreContext(ctx);
}

/** A strip's caption (`VDTBlock.stripCaption`, #590): the bar behind it,
 *  then its lines in the caption's fonts and colours. */
function renderStripCaption(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  const caption = block.stripCaption;
  if (!caption) return;
  if (caption.bar) {
    const { rect, background } = caption.bar;
    saveContext(ctx);
    ctx.fillStyle = background;
    ctx.fillRect(block.bbox.x + rect.x, block.bbox.y + rect.y, rect.width, rect.height);
    restoreContext(ctx);
  }
  const style: BlockTextStyle = {
    font: block.fontString,
    boldFont: block.boldFontString,
    italicFont: block.italicFontString,
    boldItalicFont: block.boldItalicFontString,
    color: block.color,
    boldColor: undefined,
    italicColor: undefined,
    refColor: block.refColor,
  };
  for (const line of block.lines.slice(caption.firstLine, caption.firstLine + caption.lineCount)) {
    if (line.highlights) paintLineHighlights(ctx, line);
    renderLine(ctx, line, style, block.textAlign, block.bbox.width, block.bbox.x, lineTrailingTracking(line, line.letterSpacing ?? 0), line.letterSpacing ?? 0, false);
    if (line.marks) paintLineMarks(ctx, line, block.color);
  }
}

export function renderBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  /** The document's single ink (`documentInkHex`), null when off. */
  inkHex: string | null = null,
): void {
  if (block.hidden) return;
  // A box printed upside down (#1229): painted turned about its centre.
  if (block.turn) {
    const { cx, cy } = block.turn;
    saveContext(ctx);
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI);
    ctx.translate(-cx, -cy);
    try {
      renderBlockUpright(ctx, block, columnWidth, columnX, inkHex);
    } finally {
      restoreContext(ctx);
    }
    return;
  }
  renderBlockUpright(ctx, block, columnWidth, columnX, inkHex);
}

function renderBlockUpright(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  inkHex: string | null,
): void {
  if (block.designOverlay) {
    renderHeaderFooterSlot(ctx, block.designOverlay, inkHex);
    return;
  }
  if (block.type === 'resource' && !block.comic) {
    renderResourceBlock(ctx, block, inkHex);
    return;
  }
  if (block.comic) {
    // A strip (painted on the sheet with the page's comics): only its
    // caption is the block's, its bar first.
    renderStripCaption(ctx, block);
    return;
  }
  if (block.type === 'listItem') {
    renderBullet(ctx, block);
  }
  if (block.dropCap) renderDropCap(ctx, block.dropCap);
  const style: BlockTextStyle = {
    font: block.fontString,
    boldFont: block.boldFontString,
    italicFont: block.italicFontString,
    boldItalicFont: block.boldItalicFontString,
    color: block.color,
    boldColor: block.boldColor,
    italicColor: block.italicColor,
    refColor: block.refColor,
  };
  // Justify against the block's own measure, not the column: a block inside a
  // callout (or any narrower container) was laid out for its inner width,
  // and the HTML backend already does the same. Flow blocks fill their
  // column, so this is identical for them.
  void columnWidth;
  void columnX;
  // Tracking: the block (column balancing, a runt set short — negative)
  // and each line (justification tracking) were measured with this much
  // extra advance after every glyph, so paint them the same way.
  const tocEntry = block.tocEntry !== undefined;
  for (const line of block.lines) {
    const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
    // Highlight bands (`:mark[…]`, #888), under the text.
    if (line.highlights) paintLineHighlights(ctx, line);
    if (tracking !== 0) setLetterSpacing(ctx, tracking);
    renderLine(ctx, line, style, block.textAlign, block.bbox.width, block.bbox.x, lineTrailingTracking(line, tracking), tracking, tocEntry);
    if (tracking !== 0) setLetterSpacing(ctx, 0);
    // Emphasis dots, proper-name and book-title lines (#193).
    if (line.marks) paintLineMarks(ctx, line, block.color);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
