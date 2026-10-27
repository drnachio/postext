// Painting one text line, plain or composed, with its marks and decorations.
import { type VDTLine, type TextAlign, lineTextAlign } from '../../vdt.js';
import { lineInkExtent } from '../../paint/lineInk.js';
import { verticalPaintActive, fillFlowText } from '../verticalText.js';
import { fillWordsText } from '../segmentText.js';
import { lineMarkCuts } from '../../measure/cjk/markCuts.js';
import { hasCJK } from '../../measure/cjk/cjk.js';
import { shapedOtherwise } from '../trackedText.js';
import { joiningScriptIn } from '../../measure/rtl/joining.js';
import { paintedSegments, paintsAsOneText } from '../wordPieces.js';
import { fillContextText } from '../contextText.js';
import { type BlockTextStyle, pickSegmentFont, renderSegments, segmentIsStyled, renderComposedSegments, composedSegmentIsStyled } from './segments.js';

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
export function renderLine(
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
