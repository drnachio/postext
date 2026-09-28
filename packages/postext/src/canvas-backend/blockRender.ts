import type { VDTBlock, VDTLine, VDTLineSegment, TextAlign } from '../vdt';
import type { MathRender } from '../math/types';
import { getMathRaster } from '../math/rasterCache';
import { renderHeaderFooterSlot } from './headerFooter';
import { renderResourceBlock } from './renderResourceBlock';
import { paintSwatch } from './swatch';
import { paintChip } from './chip';
import { lineInkExtent, lineTrailingTracking } from '../lineInk';
import { fillFlowText } from './verticalText';

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
    ctx.save();
    ctx.fillStyle = render.error ? 'rgba(198, 40, 40, 0.15)' : 'rgba(160, 160, 160, 0.15)';
    ctx.fillRect(topLeftX, topLeftY, widthPx, heightPx);
    ctx.restore();
    return;
  }
  const raster = getMathRaster(render, fallbackColor);
  if (raster) {
    ctx.drawImage(raster, topLeftX, topLeftY, widthPx, heightPx);
    return;
  }
  const sx = widthPx / viewBox.width;
  const sy = heightPx / viewBox.height;
  const path2ds = getMathPaths(render);
  ctx.save();
  ctx.translate(topLeftX, topLeftY);
  ctx.scale(sx, sy);
  ctx.translate(-viewBox.minX, -viewBox.minY);
  for (let i = 0; i < paths.length; i++) {
    ctx.fillStyle = paths[i]!.fill === 'currentColor' ? fallbackColor : paths[i]!.fill;
    ctx.fill(path2ds[i]!);
  }
  ctx.restore();
}

function renderMathSegment(
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
 * Paint a line's segments left to right starting at `startX`. When
 * `justifiedSpaceWidth` is set, spaces advance by it instead of their
 * measured width. Tracks the current canvas font/fillStyle to skip
 * redundant state changes (segments overwhelmingly share styling).
 * `tracking` is the block's and the line's (the context's `letterSpacing`
 * on entry); a segment's own tracking (a justified CJK line) is painted on
 * top of it and the context is left as it was found.
 */
function renderSegments(
  ctx: CanvasRenderingContext2D,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  style: BlockTextStyle,
  justifiedSpaceWidth?: number,
  tracking = 0,
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
    if (seg.kind === 'swatch') {
      paintSwatch(ctx, x, baseline, seg.width, seg.swatch?.color, style.color);
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
      ctx.letterSpacing = `${segSpacing}px`;
      spacing = segSpacing;
    }
    // A compressed CJK mark is painted before its box (`inkOffset`), along
    // the line in either writing mode.
    fillFlowText(ctx, seg.text, x + (seg.inkOffset ?? 0), baseline + (seg.baselineShift ?? 0));
    x += seg.width;
  }
  if (spacing !== tracking) ctx.letterSpacing = `${tracking}px`;
}

/** Whether a segment paints differently from the block's plain text. */
function segmentIsStyled(s: VDTLineSegment): boolean {
  return !!s.bold || !!s.italic || s.kind === 'math' || s.kind === 'swatch' || s.kind === 'chip' || s.refResourceId !== undefined
    || s.fontString !== undefined || s.color !== undefined || s.baselineShift !== undefined || s.tracking !== undefined
    || s.inkOffset !== undefined || s.hangs !== undefined || s.autospace !== undefined;
}

function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  style: BlockTextStyle,
  textAlign: TextAlign,
  columnWidth: number,
  columnX: number,
  trailing = 0,
  tracking = 0,
): void {
  ctx.textBaseline = 'alphabetic';

  // Effective width accounts for line-level indent (e.g. first-line or hanging indent)
  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;
  const segments = line.segments;

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
      // A hung mark is outside the measure; a Han–Latin space keeps its
      // width.
      if (seg.hangs) continue;
      if (seg.kind === 'space' && !seg.autospace) spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && ((!line.isLastLine && !line.ragged) || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderSegments(ctx, segments, line.bbox.x, line.baseline, style, justifiedSpaceWidth, tracking);
      return;
    }
  }

  // Centred / right alignment — math display blocks, and paragraph styles
  // set ragged from the left. Distribute the remaining space. The tracking
  // after the last glyph (`trailing`) is advance, not ink: left out, so the
  // letters are centred or end on the edge (EF-153); so are hung marks.
  if ((textAlign === 'center' || textAlign === 'right') && segments) {
    const contentWidth = lineInkExtent(line, 0).width;
    const slack = Math.max(0, effectiveWidth - (contentWidth - trailing));
    const startX = line.bbox.x + (textAlign === 'center' ? slack / 2 : slack);
    renderSegments(ctx, segments, startX, line.baseline, style, undefined, tracking);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref/own font or colour); otherwise one fillText
  // paints the line.
  if (segments && segments.some(segmentIsStyled)) {
    renderSegments(ctx, segments, line.bbox.x, line.baseline, style, undefined, tracking);
    return;
  }

  ctx.font = style.font;
  ctx.fillStyle = style.color;
  const plainSlack = Math.max(0, effectiveWidth - (line.bbox.width - trailing));
  const plainX = line.bbox.x + (textAlign === 'right' ? plainSlack : textAlign === 'center' ? plainSlack / 2 : 0);
  fillFlowText(ctx, line.text, plainX, line.baseline);
}

function renderBullet(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (!block.bulletText || !block.bulletFontString || block.bulletOffsetX === undefined) return;
  const firstLine = block.lines[0];
  if (!firstLine) return;
  ctx.save();
  ctx.fillStyle = block.bulletColor ?? block.color;
  // A marker set as text (a contents number) sits on `bulletBaselineY` as
  // its baseline; a list bullet is centred on `bulletY`.
  const onBaseline = block.bulletBaselineY !== undefined;
  ctx.textBaseline = onBaseline ? 'alphabetic' : 'middle';
  ctx.font = block.bulletFontString;
  const y = block.bulletBaselineY ?? block.bulletY ?? firstLine.baseline;
  fillFlowText(ctx, block.bulletText, block.bulletOffsetX, y);
  // Ordered-list separator styled apart from the number (own font/colour).
  if (block.separatorText && block.separatorX !== undefined) {
    ctx.fillStyle = block.separatorColor ?? block.bulletColor ?? block.color;
    ctx.font = block.separatorFontString ?? block.bulletFontString;
    fillFlowText(ctx, block.separatorText, block.separatorX, y);
    // The prefix run before the number, in the separator's style.
    if (block.prefixText && block.prefixX !== undefined) fillFlowText(ctx, block.prefixText, block.prefixX, y);
  }
  ctx.restore();
}

function renderStrikethrough(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  ctx.save();
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
  ctx.restore();
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
  if (block.designOverlay) {
    renderHeaderFooterSlot(ctx, block.designOverlay, inkHex);
    return;
  }
  if (block.type === 'resource') {
    renderResourceBlock(ctx, block, inkHex);
    return;
  }
  if (block.type === 'listItem') {
    renderBullet(ctx, block);
  }
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
  for (const line of block.lines) {
    const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
    if (tracking !== 0) ctx.letterSpacing = `${tracking}px`;
    renderLine(ctx, line, style, block.textAlign, block.bbox.width, block.bbox.x, lineTrailingTracking(line, tracking), tracking);
    if (tracking !== 0) ctx.letterSpacing = '0px';
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
