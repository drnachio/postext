// Painting caption and cell lines of a resource block.
import type { VDTLine } from '../../vdt.js';
import { verticalPaintActive, fillFlowText } from '../verticalText.js';
import { fillWordsText, fillSegmentText } from '../segmentText.js';
import { lineMarkCuts } from '../../measure/cjk/markCuts.js';
import { hasCJK } from '../../measure/cjk/cjk.js';
import { paintSwatchSegment } from '../swatch.js';
import { paintChip } from '../chip.js';
import { renderMathSegment } from '../blockRender.js';
import { type WordRun, fillSegmentWord } from '../wordRuns.js';
import { paintedSegments } from '../wordPieces.js';
import { paintLineHighlights, paintWarichu, paintRuby, paintKunten, paintLineMarks } from '../annotations.js';
import { setLetterSpacing } from '../contextState.js';
import { fillContextText } from '../contextText.js';

function pickFont(
  bold: boolean,
  italic: boolean,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
): string {
  if (bold && italic) return boldItalicFont;
  if (bold) return boldFont;
  if (italic) return italicFont;
  return font;
}

/** Paint one already-positioned rich-text line (absolute page coords). Used for
 *  both the caption and individual table cells. `:ref` segments are recoloured
 *  to `linkColor`. */
/** A caption, note or cell line. A tracked line (a table header set with
 *  `headerLetterSpacing`) was measured with the tracking in its widths, so
 *  it is painted with the same canvas `letterSpacing`, reset afterwards.
 *  Ruby readings, warichu rows and the marks of the line are painted as
 *  on a body line (#429). */
export function paintLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  color: string,
  linkColor: string,
  labelColor: string = color,
): void {
  const tracking = line.letterSpacing ?? 0;
  // Highlight bands (`:mark[…]`, #888), under the text.
  if (line.highlights) paintLineHighlights(ctx, line);
  if (tracking !== 0) setLetterSpacing(ctx, tracking);
  paintLineRuns(ctx, line, font, boldFont, italicFont, boldItalicFont, color, linkColor, labelColor, tracking);
  if (tracking !== 0) setLetterSpacing(ctx, 0);
}

function paintLineRuns(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string,
  italicFont: string,
  boldItalicFont: string,
  color: string,
  linkColor: string,
  labelColor: string,
  tracking = 0,
): void {
  ctx.textBaseline = 'alphabetic';
  if (line.segments && line.segments.length > 0) {
    let x = line.bbox.x;
    // A line of the CJK composer, or any line down a vertical page, paints
    // each segment through `fillSegmentText`; a line set word by word as
    // the canvas always painted it, its text cut at the marks that meet
    // only when it holds CJK characters (see `renderLine` in
    // blockRender.ts).
    const composed = line.cjkComposed === true || verticalPaintActive();
    const cjk = !composed && hasCJK(line.text);
    // Two marks that meet are painted apart where the line's measurer set
    // them apart (see `fillFlowText`).
    const cuts = lineMarkCuts(line);
    const paint = cjk
      ? (text: string, px: number, py: number): void => fillWordsText(ctx, text, px, py)
      : (text: string, px: number, py: number): void => fillContextText(ctx, text, px, py);
    const runStyle = (run: WordRun): { font: string; fill: string } => ({
      font: pickFont(!!run.bold, !!run.italic, font, boldFont, italicFont, boldItalicFont),
      fill: color,
    });
    // A line holding right-to-left text is painted in its `order`, each
    // right-to-left segment as a right-to-left run (`fillSegmentWord`).
    // The pieces of a word the layout measured whole are painted as that
    // word (#770), and the line's order is the one of what is painted.
    const set = paintedSegments(ctx, line, composed, tracking, (seg) =>
      seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont));
    const segments = set.segments!;
    const order = set.order;
    for (let k = 0; k < segments.length; k++) {
      const seg = segments[order ? order[k]! : k]!;
      if (seg.kind === 'space') {
        x += seg.width;
        continue;
      }
      if (seg.kind === 'math') {
        // An inline formula (#541), in the text's colour; it leaves the
        // canvas font and fill to be set again.
        renderMathSegment(ctx, seg, x, line.baseline, color);
        x += seg.width;
        continue;
      }
      if (seg.kind === 'swatch') {
        paintSwatchSegment(ctx, seg.swatch, x, line.baseline, seg.width, color, seg.rtl === true);
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        paintChip(ctx, seg.chip, x, line.baseline, () => color);
        x += seg.width;
        continue;
      }
      if (composed && seg.warichu) {
        // A warichu note's part: its two rows, not its text (#195, #429).
        paintWarichu(ctx, seg.warichu, x, line.baseline, color);
        x += seg.width;
        continue;
      }
      ctx.font = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
      const fill = seg.refResourceId !== undefined
        ? linkColor
        : seg.captionLabel
          ? labelColor
          : color;
      ctx.fillStyle = fill;
      if (!composed) {
        // A word of a joining script untracked, a word in several styles
        // painted as one shaped word (`fillSegmentWord`).
        fillSegmentWord(ctx, seg, x, line.baseline + (seg.baselineShift ?? 0), tracking, paint, runStyle);
        x += seg.width;
        continue;
      }
      // A justified CJK line spreads its characters per segment.
      if (seg.tracking !== undefined) setLetterSpacing(ctx, tracking + seg.tracking);
      fillSegmentText(ctx, seg, x, line.baseline, cuts);
      if (seg.tracking !== undefined) setLetterSpacing(ctx, tracking);
      // A ruby base's reading (#194, #429).
      if (seg.ruby) paintRuby(ctx, seg.ruby, x, line.baseline, fill);
      // Kanbun marks (#430).
      if (seg.kunten) paintKunten(ctx, seg.kunten, x, line.baseline, fill);
      x += seg.width;
    }
    // Emphasis marks, side lines, the proper-name and book-title lines
    // the layout set on the line (#193, #421, #429).
    if (line.marks) paintLineMarks(ctx, line, color);
    return;
  }
  ctx.font = font;
  ctx.fillStyle = color;
  if (line.cjkComposed || verticalPaintActive()) fillFlowText(ctx, line.text, line.bbox.x, line.baseline, 'fill', undefined, lineMarkCuts(line));
  else if (hasCJK(line.text)) fillWordsText(ctx, line.text, line.bbox.x, line.baseline);
  else fillContextText(ctx, line.text, line.bbox.x, line.baseline);
}
