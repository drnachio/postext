// The segments of a horizontal line, word by word or as the CJK composer
// set them (#1276: split out of html-backend.ts).
import { type VDTLine, type VDTBlock, lineTextAlign, type VDTLineSegment } from '../vdt.js';
import { lineTrailingTracking, lineInkExtent } from '../paint/lineInk.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { cellsOf } from '../paint/wordPieces.js';
import { sideMarkerHtml, lineMarksHtml, warichuHtml, rubyHtml, kuntenHtml } from './htmlAnnotations.js';
import { leaderHtml, renderSwatchSegment, renderChip } from './lines.js';
import { type HtmlPaint, ownShaping } from './render.js';
import { lineEndHtml, linkRuns, wordSegmentsOf, pickSegmentColor, renderWordTextSegment, segmentHref, copyTextHtml, renderMathSegmentSvg, scoreSegmentSvg, renderRefRuns, refLinks, refKey, renderTextSegment, rubyRuns } from './segmentText.js';
import { type TextDirection, dirAttr, pickSegmentFont, quoteFontString, ligaturesDecl, segmentBox, lineCjkDecl, segmentCjk, PLAIN_BOX } from './styles.js';
import { wordsHtml } from './textRuns.js';

/**
 * The segments of a horizontal line. A line of the CJK composer goes to
 * {@link renderComposedSegments}. Any other line was set word by word and
 * carries none of the composer's fields (a segment's `tracking`,
 * `inkOffset`, `inkScale`, `hangs`, `autospace`, `ruby`, `warichu`): its
 * markup is the one every line had before the CJK features, the browser's
 * punctuation spacing turned off on each segment that holds CJK text. Only
 * a line whose text holds CJK characters has its segments looked into: the
 * line's `text` holds the text of every segment, except the leader of a
 * contents entry (`tocEntry`).
 */
export function renderSegments(
  line: VDTLine,
  block: VDTBlock,
  targets?: ReadonlySet<string>,
  rootDir: TextDirection = 'ltr',
  rootLang?: string,
  /** What a copy puts after the line (see {@link lineEndText}). */
  end = '',
  /** Where the line's inline pictures come from (#1249). */
  paint?: HtmlPaint,
): string {
  if (line.cjkComposed) return renderComposedSegments(line, block, targets, rootDir, end, paint);
  // The tracking after the last glyph is advance, not ink: centring and
  // right alignment leave it out (EF-153), as the canvas does.
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, tracking);
  // A line of a block set against its frame's direction aligns in its span
  // (`VDTLine.measure`) from that span's right, its start side (#371).
  const span = line.measure;
  const align = lineTextAlign(line, block.textAlign);
  // Where the span starts inside the line's box (0 but for such a line).
  const origin = span ? span.x - line.bbox.x : 0;
  if (!line.segments || line.segments.length === 0) {
    const plainIndent = span ? span.x - block.bbox.x : line.bbox.x - block.bbox.x;
    const room = span ? span.width : block.bbox.width - plainIndent;
    const plainWidth = line.bbox.width - trailing;
    const plainLeft = origin + (align === 'right'
      ? Math.max(0, room - plainWidth)
      : align === 'center'
        ? Math.max(0, (room - plainWidth) / 2)
        : 0);
    const plainDir = dirAttr(block.direction ?? rootDir, rootDir);
    return `<span${plainDir} style="position:absolute;left:${plainLeft.toFixed(3)}px;top:0;white-space:pre;">${wordsHtml(line.text)}</span>` + lineEndHtml(end, plainLeft + plainWidth);
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = span ? span.x - block.bbox.x : line.bbox.x - block.bbox.x;
  const effectiveWidth = span ? span.width : block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    if (seg.kind === 'space') spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = line.segments.reduce((s, seg) => s + seg.width, 0);

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  const useJustify =
    block.textAlign === 'justify' && spaceCount > 0 &&
    !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred / right alignment — math display blocks, ragged-left paragraph
  // styles. Distribute the leading gap. A justified line fills its span.
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  const leadingGap = origin + (useJustify ? 0 : align === 'center' ? slack / 2 : align === 'right' ? slack : 0);

  const parts: string[] = [];
  const links = linkRuns();
  let x = leadingGap;
  // The pieces of a word the layout measured whole are one box (#770).
  const set = wordSegmentsOf(line, tracking, (seg) => pickSegmentFont(seg, block));
  const segs = set.segments!;
  // Segments advance along the line in its order when it has one (a
  // line with right-to-left runs, or any line of a mirrored page): their
  // x are taken in that order; the markup stays in logical order, so the
  // text copies as written.
  const at = set.order ? orderedOffsets(segs, set.order, leadingGap, useJustify ? justifiedSpaceWidth : undefined) : undefined;
  const cjk = block.tocEntry !== undefined || hasCJK(line.text) || (line.tabbed === true && segs.some((sg) => sg.leader === 'text'));
  const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};${tracking !== 0 ? ligaturesDecl() : ''}` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
    return renderWordTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, color, cjk && hasCJK(seg.text), segmentBox(seg, rootDir, rootLang, tracking, font, color, (probe) => ({ font: quoteFontString(pickSegmentFont(probe, block)), color: pickSegmentColor(probe, block) })));
  };
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    if (at) x = at[i]!;
    if (seg.kind === 'space') {
      // The space as text, for copying (#403).
      parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
      parts.push(copyTextHtml(seg.text, x, useJustify ? justifiedSpaceWidth - seg.width : 0));
      x += useJustify ? justifiedSpaceWidth : seg.width;
      continue;
    }
    if (seg.leader) {
      // A leader (#622): painted, hidden from assistive technology and
      // left out of a selection.
      parts.push(leaderHtml(seg, x, line.baseline - line.bbox.y, block));
      x += seg.width;
      continue;
    }
    parts.push(links.at(segmentHref(seg)));
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'score') {
      parts.push(scoreSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, quoteFontString(block.fontString), block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block), rootDir));
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap (JLReq §4.2.3).
      parts.push(sideMarkerHtml(seg.sideMarker, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
      const group = renderRefRuns(segs, i, x, pickSegmentColor(seg, block), (run, runX) => paintText(run, runX, true), refLinks(refKey(seg), targets), {
        gap: (space) => (useJustify ? justifiedSpaceWidth : space.width),
        ...(at ? { at } : {}),
      });
      parts.push(group.html);
      x = group.x;
      i = group.end - 1;
      continue;
    }
    parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
    x += seg.width;
  }
  parts.push(links.end());
  parts.push(lineEndHtml(end, x));
  // Emphasis dots, proper-name and book-title lines (#193).
  if (line.marks) parts.push(lineMarksHtml(line, block.color));
  return parts.join('');
}

/** The x of each segment (by index) of a line whose segments advance in
 *  `order` from `start`, spaces taking `spaceWidth` when the line is
 *  justified. */
export function orderedOffsets(segs: readonly VDTLineSegment[], order: readonly number[], start: number, spaceWidth: number | undefined): number[] {
  const out = new Array<number>(segs.length).fill(start);
  let x = start;
  for (const i of order) {
    const seg = segs[i];
    if (!seg) continue;
    out[i] = x;
    x += seg.kind === 'space' && spaceWidth !== undefined ? spaceWidth : seg.width;
  }
  return out;
}

/** {@link renderSegments} for a line of the CJK composer: hung marks and
 *  Han–Latin spaces kept out of the justification, each segment with its
 *  own tracking, ink offset and scale, warichu notes and ruby readings. */
function renderComposedSegments(line: VDTLine, block: VDTBlock, targets?: ReadonlySet<string>, rootDir: TextDirection = 'ltr', end = '', paint?: HtmlPaint): string {
  // The tracking after the last glyph is advance, not ink: centring and
  // right alignment leave it out (EF-153), as the canvas does.
  const lineTracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  const trailing = lineTrailingTracking(line, lineTracking);
  // A line beside a wrapped picture (#627) fills its own span.
  const wrapRoom = line.measure?.wrap ? line.measure.width : undefined;
  if (!line.segments || line.segments.length === 0) {
    const plainIndent = line.bbox.x - block.bbox.x;
    const plainWidth = line.bbox.width - trailing;
    const plainRoom = wrapRoom ?? block.bbox.width - plainIndent;
    const plainLeft = block.textAlign === 'right'
      ? Math.max(0, plainRoom - plainWidth)
      : block.textAlign === 'center'
        ? Math.max(0, (plainRoom - plainWidth) / 2)
        : 0;
    return `<span style="position:absolute;left:${plainLeft.toFixed(3)}px;top:0;white-space:pre;">${wordsHtml(line.text)}</span>` + lineEndHtml(end, plainLeft + plainWidth);
  }

  // Match canvas justification: stretch inter-word spaces to fill effective width.
  const lineIndent = line.bbox.x - block.bbox.x;
  const effectiveWidth = wrapRoom ?? block.bbox.width - lineIndent;

  let wordWidth = 0;
  let spaceCount = 0;
  for (const seg of line.segments) {
    // A hung mark is outside the measure; a Han–Latin space keeps its
    // width.
    if (seg.hangs) continue;
    if (seg.kind === 'space' && !seg.autospace) spaceCount++;
    else wordWidth += seg.width;
  }
  const contentWidth = lineInkExtent(line, 0).width;

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  const useJustify =
    block.textAlign === 'justify' && spaceCount > 0 &&
    !line.tabbed && ((!line.isLastLine && !line.ragged) || contentWidth > effectiveWidth);
  const justifiedSpaceWidth = useJustify
    ? (effectiveWidth - wordWidth) / spaceCount
    : 0;

  // Centred / right alignment — math display blocks, ragged-left paragraph
  // styles. Distribute the leading gap.
  const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
  const leadingGap = block.textAlign === 'center' ? slack / 2 : block.textAlign === 'right' ? slack : 0;

  const parts: string[] = [];
  const links = linkRuns();
  let x = leadingGap;
  const segs = line.segments;
  const lineDecl = lineCjkDecl(line);
  const paintText = (seg: VDTLineSegment, at: number, inLink = false): string => {
    const font = quoteFontString(pickSegmentFont(seg, block));
    const color = pickSegmentColor(seg, block);
    const fontDecl = font !== quoteFontString(block.fontString) ? `font:${font};` : '';
    const colorDecl = color !== block.color ? `color:${color};` : '';
    const top = seg.baselineShift ? `${seg.baselineShift.toFixed(3)}px` : '0';
    // The composer sets left-to-right text: in a right-to-left document
    // its boxes say so (#379).
    const dir = dirAttr(seg.rtl ? 'rtl' : 'ltr', rootDir);
    // A Western word of a tracked line in the canvas's pieces (#770): the
    // cells of the line hold no ligature and are asked nothing.
    const segTracking = lineTracking + (seg.tracking ?? 0);
    const tracked = ownShaping && segTracking !== 0 && !cellsOf(seg.text) && !joiningScriptIn(seg.text)
      ? { font, tracking: segTracking, ...(seg.lang !== undefined ? { lang: seg.lang } : {}) } : undefined;
    return renderTextSegment(inLink ? { ...seg, refResourceId: undefined } : seg, at, top, fontDecl, colorDecl, color, lineTracking, segmentCjk(seg, lineDecl), dir || tracked ? { attrs: dir, decl: '', ...(tracked ? { tracked } : {}) } : PLAIN_BOX);
  };
  // The `<ruby>` open across the bases of one annotation (#428).
  const ruby = rubyRuns();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    parts.push(ruby.before(seg));
    if (seg.kind === 'space') {
      // The space as text, for copying (#403): a Han–Latin gap only where
      // the author typed one (its `text`).
      const gap = useJustify && !seg.autospace ? justifiedSpaceWidth : seg.width;
      parts.push(links.space(segs[i + 1] && segmentHref(segs[i + 1]!)));
      parts.push(copyTextHtml(seg.text, x, gap - seg.width));
      x += gap;
      continue;
    }
    if (seg.leader) {
      // A leader (#622): painted, hidden from assistive technology and
      // left out of a selection.
      parts.push(leaderHtml(seg, x, line.baseline - line.bbox.y, block));
      x += seg.width;
      continue;
    }
    parts.push(links.at(segmentHref(seg)));
    if (seg.kind === 'math') {
      parts.push(renderMathSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'score') {
      parts.push(scoreSegmentSvg(seg, x, line, block));
      x += seg.width;
      continue;
    }
    if (seg.kind === 'swatch') {
      parts.push(renderSwatchSegment(seg.swatch, x, line.baseline - line.bbox.y, seg.width, block.color, paint, seg.rtl === true));
      x += seg.width;
      continue;
    }
    if (seg.chip) {
      parts.push(renderChip(seg.chip, x, line.baseline - line.bbox.y, quoteFontString(block.fontString), block.color, (run) =>
        pickSegmentColor({ kind: 'text', text: run.text, width: run.width, bold: run.bold, italic: run.italic }, block), rootDir));
      x += seg.width;
      continue;
    }
    if (seg.warichu) {
      // A warichu note's part: its two rows (#195).
      parts.push(warichuHtml(seg.warichu, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.sideMarker) {
      // A footnote marker in the line gap (JLReq §4.2.3).
      parts.push(sideMarkerHtml(seg.sideMarker, x, pickSegmentColor(seg, block), quoteFontString));
      x += seg.width;
      continue;
    }
    if (seg.refResourceId !== undefined && segs[i + 1]?.refContinues) {
      const group = renderRefRuns(segs, i, x, pickSegmentColor(seg, block), (run, at) => paintText(run, at, true), refLinks(refKey(seg), targets), {
        gap: (space) => (useJustify && !space.autospace ? justifiedSpaceWidth : space.width),
      });
      parts.push(group.html);
      x = group.x;
      i = group.end - 1;
      continue;
    }
    // A ruby base and its reading (#194), in a `<ruby>` (#428).
    if (seg.ruby) parts.push(ruby.open(seg));
    parts.push(paintText(seg, x, seg.refResourceId !== undefined && !refLinks(refKey(seg), targets)));
    if (seg.ruby) parts.push(rubyHtml(seg.ruby, x, pickSegmentColor(seg, block), quoteFontString), ruby.after(seg));
    if (seg.kunten) {
      // Kanbun marks (#430), after the character's `<ruby>`; the 送り仮名
      // read and copy after their character, as transparent text.
      parts.push(ruby.end(), kuntenHtml(seg.kunten, x, pickSegmentColor(seg, block), quoteFontString));
      if (seg.kunten.okuri) parts.push(lineEndHtml(seg.kunten.okuri, x + seg.width));
    }
    x += seg.width;
  }
  parts.push(ruby.end(), links.end());
  parts.push(lineEndHtml(end, x));
  // Emphasis dots, proper-name and book-title lines (#193).
  if (line.marks) parts.push(lineMarksHtml(line, block.color));
  return parts.join('');
}
