// Painting a whole block: list markers, task boxes, drop caps, strikes,
// strip captions, and the upright/vertical entry point.
import type { VDTBlock, VDTDropCap } from '../../vdt.js';
import { renderHeaderFooterSlot } from '../headerFooter.js';
import { renderResourceBlock } from '../renderResourceBlock.js';
import { lineTrailingTracking } from '../../paint/lineInk.js';
import { verticalPaintActive, fillFlowText } from '../verticalText.js';
import { mirroredPaintActive } from '../mirrorFrame.js';
import { paintRunInDirection } from '../runDirection.js';
import { markerSetText } from '../../writing/bidi.js';
import { paintLineHighlights, paintLineMarks } from '../annotations.js';
import { taskBoxTick } from '../../paint/taskBox.js';
import { saveContext, restoreContext, setLetterSpacing } from '../contextState.js';
import { renderLine } from './lines.js';
import type { BlockTextStyle } from './segments.js';

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
