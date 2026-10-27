// A line of a block: its text, trailing tracking, styled segments,
// repeated hyphens and the space at its end (#1276: split out of blockRender.ts).
import type { PDFFont } from 'pdf-lib';
import { type VDTLine, type VDTBlock, lineTextAlign, type VDTLineSegment } from 'postext';
import { parseFontString } from '../../../fontString.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, setTrackingPx, colorFromHex, textAdvancePx, drawMeasuredTextPx, drawTextPx, cellPieces } from '../../primitives.js';
import { pickSegmentFont } from '../../text/fontHelpers.js';
import { LinkRegistry } from '../../structure/links.js';
import { type StructElem, tagContent } from '../../structure/tagging.js';
import { drawShapedTextPx } from '../../text/shapedText.js';
import { needsComplexShaping } from '../../../complexShaping.js';
import { withSegmentLanguage, shapesSegmentLanguages } from '../../../shapingLanguage.js';
import { wordSegments } from '../../text/wordPieces.js';
import type { CapLead } from './markers.js';
import { renderSegments } from './segments.js';

/** Tracking: the block (column balancing; negative for a runt set short)
 *  and the line (justification tracking) were measured with extra advance
 *  after every glyph, so paint the line with the matching character
 *  spacing (`Tc`, in points at the page scale) and reset it afterwards. */
export function renderLine(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
  capLead?: CapLead,
): void {
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  if (tracking !== 0) setTrackingPx(ctx, tracking);
  renderLineText(ctx, line, block, columnWidth, columnX, fontCache, linkRegistry, elem, tracking, trailingTracking(line, tracking), capLead);
  if (tracking !== 0) setTrackingPx(ctx, 0);
}

/** The tracking a line's measured width carries after its last glyph:
 *  `tracking` when the line ends on text, else 0. It is advance, not ink,
 *  so centring and right alignment leave it out (EF-153), as the canvas
 *  and HTML backends do (`lineTrailingTracking` in postext). */
function trailingTracking(line: VDTLine, tracking: number): number {
  if (tracking === 0) return 0;
  const segments = line.segments;
  if (segments && segments.length > 0) {
    let i = segments.length - 1;
    // A mark hung past the line's end is outside it (CJK only).
    while (i > 0 && segments[i]!.hangs) i--;
    const last = segments[i]!;
    return last.kind === 'text' && last.text.length > 0 ? tracking : 0;
  }
  return /\S$/.test(line.text) ? tracking : 0;
}

function renderLineText(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
  tracking: number,
  trailing = 0,
  capLead?: CapLead,
): void {
  const blockFont = fontCache.get(block.fontString);
  if (!blockFont) return;
  const blockSize = parseFontString(block.fontString)?.sizePx ?? 0;
  const blockColor = colorFromHex(block.color, ctx.colorSpace);

  // A line whose block runs against its frame (a right-to-left paragraph
  // on a left-to-right page, an English quotation in an Arabic book)
  // carries its span (`measure`): it is justified across it and set ragged
  // from its start side, the right, as the canvas sets it.
  const span = line.measure;
  const lineX = span ? span.x : line.bbox.x;
  const align = lineTextAlign(line, block.textAlign);
  const lineIndent = lineX - columnX;
  const effectiveWidth = span ? span.width : columnWidth - lineIndent;
  // Only a line of the CJK composer (or down a vertical page) has hung
  // marks and Han–Latin spaces (see `renderSegments`).
  const composed = line.cjkComposed === true || ctx.vertical !== undefined;
  // The pieces of a word the layout measured whole are painted as that
  // word, in a document shaped in its own language (#764).
  const segments = wordSegments(line, composed, (seg, text, sizeOf) => {
    const fontStr = seg.fontString ?? pickSegmentFont(!!seg.bold, !!seg.italic, block);
    return withSegmentLanguage(seg.lang, () => textAdvancePx(fontCache.get(fontStr) ?? blockFont, text, sizeOf(parseFontString(fontStr)?.sizePx ?? blockSize), tracking).advance);
  });

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  if (block.textAlign === 'justify' && segments && segments.length > 0) {
    let wordWidth = 0;
    let naturalWidth = 0;
    let spaceCount = 0;
    for (const seg of segments) {
      // A hung mark is outside the measure; a Han–Latin space keeps its
      // width.
      if (composed && seg.hangs) continue;
      if (seg.kind === 'space' && !(composed && seg.autospace)) spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderSegments(ctx, segments, lineX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, justifiedSpaceWidth, tracking, capLead);
      return;
    }
  }

  if ((align === 'center' || align === 'right') && segments) {
    // Hung marks stay out of the alignment, as trailing tracking does.
    let contentWidth = 0;
    for (const seg of segments) if (!(composed && seg.hangs)) contentWidth += seg.width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = lineX + (align === 'center' ? slack / 2 : slack);
    renderSegments(ctx, segments, startX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, undefined, tracking, capLead);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour), and when one is in a
  // language of its own, which it is shaped in (#764; in a document that
  // keeps the host's language, on a line of the CJK composer only, which
  // names it in Japanese text, #427); otherwise one text object paints the
  // line.
  const ownLanguage = segments !== undefined && (line.cjkComposed === true || shapesSegmentLanguages()) && segments.some((s) => s.lang !== undefined);
  if (segments && (capLead !== undefined || isDirected(line) || ownLanguage || segments.some(composed ? composedSegmentIsStyled : segmentIsStyled))) {
    renderSegments(ctx, segments, lineX, line.baseline, line, block, blockFont, blockSize, blockColor, fontCache, linkRegistry, elem, undefined, tracking, capLead);
    return;
  }

  tagContent(ctx, capLead?.elem ?? elem);
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = lineX + (align === 'right' ? plainSlack : align === 'center' ? plainSlack / 2 : 0);
  // Each word where the layout measured it (EF-137): the embedded face's
  // own widths could differ, most of all for a character it has no glyph
  // for, and would carry the rest of the line along.
  // The hyphen repeated from the line before is painted but not read.
  const actualText = capLead
    ? capLead.prefix + line.text.slice(capLead.rest)
    : line.repeatedHyphen && line.text.startsWith('-') ? line.text.slice(1) : undefined;
  // A line with right-to-left or joining letters and no directions (a VDT
  // from before the engine resolved bidi levels) is set as one text, cut
  // into bidi runs and shaped by HarfBuzz; with fontkit when HarfBuzz is
  // not loaded, which turns the whole line around.
  const complex = needsComplexShaping(line.text);
  if (segments && segments.length > 0 && !complex
    && drawMeasuredTextPx(ctx, measuredPieces(ctx, line, segments, blockFont, blockSize, tracking), plainX, line.baseline, blockFont, blockSize, blockColor, tracking, actualText)) return;
  if (complex && drawShapedTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor, { base: block.direction, actualText })) return;
  drawTextPx(ctx, line.text, plainX, line.baseline, blockFont, blockSize, blockColor, undefined, actualText);
}

/** Whether a segment of a line set word by word paints differently from
 *  the block's plain text, or is linked; an orientation mark (`:tcy`,
 *  `:upright`, `:sideways`) keeps its segment apart. */
function segmentIsStyled(s: VDTLineSegment): boolean {
  return s.bold || s.italic || s.runs !== undefined || s.sideMarker !== undefined || s.kind === 'math' || s.kind === 'score' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined || s.href !== undefined || s.pageLink !== undefined || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined
    || s.tcy !== undefined || s.orientation !== undefined || s.labelTab !== undefined || s.leader !== undefined
    // A word with no letter shaped in the script of its context (#725):
    // its line is painted word by word, each in its script.
    || s.scriptContext !== undefined;
}

/** {@link segmentIsStyled} for a line of the CJK composer or one down a
 *  vertical page, whose segments may carry the composer's fields. */
function composedSegmentIsStyled(s: VDTLineSegment): boolean {
  return segmentIsStyled(s) || s.tracking !== undefined || s.inkOffset !== undefined || s.hangs !== undefined || s.autospace !== undefined || s.ruby !== undefined || s.kunten !== undefined || s.warichu !== undefined;
}

/**
 * The index of the segment that opens with the hyphen repeated from the line
 * before (`VDTLine.repeatedHyphen`, "vencer-" | "-se"), or -1. The PDF paints
 * that segment with an `/ActualText` that leaves the hyphen out, so copying
 * and text extraction read the word once, as written ("vencer-se").
 */
export function repeatedHyphenSegment(line: VDTLine, segments: readonly VDTLineSegment[]): number {
  if (!line.repeatedHyphen) return -1;
  const i = segments.findIndex((s) => s.kind !== 'space');
  const seg = segments[i];
  return seg && seg.kind === 'text' && !seg.chip && seg.text.startsWith('-') ? i : -1;
}

/** The pieces a line painted as one text is set from: its segments
 *  ({@link withLineEndSpace}), and on a line of the CJK composer the
 *  characters of a segment it measured one by one, each a piece of its own
 *  (`cellPieces`, #770). */
function measuredPieces(
  ctx: PageCtx,
  line: VDTLine,
  segments: readonly VDTLineSegment[],
  font: PDFFont,
  sizePx: number,
  tracking: number,
): ReadonlyArray<{ text: string; width: number }> {
  const pieces = withLineEndSpace(segments, line.text);
  if (line.cjkComposed !== true || ctx.vertical) return pieces;
  let cut: Array<{ text: string; width: number }> | undefined;
  pieces.forEach((piece, i) => {
    const cells = cellPieces(font, piece.text, piece.width, sizePx, tracking);
    if (cells) (cut ??= pieces.slice(0, i)).push(...cells);
    else cut?.push(piece);
  });
  return cut ?? pieces;
}

/** A ragged line's segments, plus the space that ends the line when its
 *  text has one and the segments leave it out. The space takes no room
 *  past the line, but it is painted, as it was when the whole text was one
 *  run, so extracted text keeps the words either side of the break apart. */
function withLineEndSpace(segments: readonly VDTLineSegment[], text: string): ReadonlyArray<{ text: string; width: number }> {
  let shown = '';
  for (const seg of segments) shown += seg.text;
  if (text.length <= shown.length || !text.startsWith(shown)) return segments;
  const rest = text.slice(shown.length);
  return /^\s+$/.test(rest) ? [...segments, { text: rest, width: 0 }] : segments;
}

/** Whether a line carries the engine's directions: an order to paint its
 *  segments in, or a right-to-left segment. Absent on every left-to-right
 *  line, which is painted as it always was. */
export function isDirected(line: VDTLine): boolean {
  return line.order !== undefined || (line.segments?.some((s) => s.rtl) ?? false);
}
