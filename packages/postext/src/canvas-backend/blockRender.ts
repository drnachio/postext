import type { VDTBlock, VDTLine, VDTLineSegment, TextAlign } from '../vdt';
import type { MathRender } from '../math/types';
import { getMathRaster } from '../math/rasterCache';
import { renderHeaderFooterSlot } from './headerFooter';
import { renderResourceBlock } from './renderResourceBlock';

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
 */
function renderSegments(
  ctx: CanvasRenderingContext2D,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  style: BlockTextStyle,
  justifiedSpaceWidth?: number,
): void {
  let x = startX;
  let currentFont = '';
  let currentFill = '';
  for (const seg of segments) {
    if (seg.kind === 'space') {
      x += justifiedSpaceWidth ?? seg.width;
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
    const font = pickSegmentFont(!!seg.bold, !!seg.italic, style.font, style.boldFont, style.italicFont, style.boldItalicFont);
    if (font !== currentFont) {
      ctx.font = font;
      currentFont = font;
    }
    const fill = seg.refResourceId !== undefined && style.refColor
      ? style.refColor
      : pickSegmentColor(!!seg.bold, !!seg.italic, style.color, style.boldColor, style.italicColor);
    if (fill !== currentFill) {
      ctx.fillStyle = fill;
      currentFill = fill;
    }
    ctx.fillText(seg.text, x, baseline);
    x += seg.width;
  }
}

function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  style: BlockTextStyle,
  textAlign: TextAlign,
  columnWidth: number,
  columnX: number,
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
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
      naturalWidth += seg.width;
    }
    if (spaceCount > 0 && (!line.isLastLine || naturalWidth > effectiveWidth)) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      renderSegments(ctx, segments, line.bbox.x, line.baseline, style, justifiedSpaceWidth);
      return;
    }
  }

  // Centred alignment — used by math display blocks. Distribute remaining
  // space equally on either side.
  if (textAlign === 'center' && segments) {
    let contentWidth = 0;
    for (const seg of segments) contentWidth += seg.width;
    const startX = line.bbox.x + Math.max(0, (effectiveWidth - contentWidth) / 2);
    renderSegments(ctx, segments, startX, line.baseline, style);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref); otherwise one fillText paints the line.
  if (segments && segments.some((s) => s.bold || s.italic || s.kind === 'math' || s.refResourceId !== undefined)) {
    renderSegments(ctx, segments, line.bbox.x, line.baseline, style);
    return;
  }

  ctx.font = style.font;
  ctx.fillStyle = style.color;
  ctx.fillText(line.text, line.bbox.x, line.baseline);
}

function renderBullet(ctx: CanvasRenderingContext2D, block: VDTBlock): void {
  if (!block.bulletText || !block.bulletFontString || block.bulletOffsetX === undefined) return;
  const firstLine = block.lines[0];
  if (!firstLine) return;
  ctx.save();
  ctx.fillStyle = block.bulletColor ?? block.color;
  ctx.textBaseline = 'middle';
  ctx.font = block.bulletFontString;
  const y = block.bulletY ?? firstLine.baseline;
  ctx.fillText(block.bulletText, block.bulletOffsetX, y);
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
): void {
  if (block.hidden) return;
  if (block.designOverlay) {
    renderHeaderFooterSlot(ctx, block.designOverlay);
    return;
  }
  if (block.type === 'resource') {
    renderResourceBlock(ctx, block);
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
  for (const line of block.lines) {
    renderLine(ctx, line, style, block.textAlign, columnWidth, columnX);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
