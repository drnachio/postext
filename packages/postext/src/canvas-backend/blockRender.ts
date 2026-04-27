import type { VDTBlock, VDTLine, VDTLineSegment, TextAlign } from '../vdt';
import type { MathRender } from '../math/types';
import { getMathRaster } from '../math/rasterCache';
import { renderDesignSlot } from './headerFooter';

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
  ctx.save();
  ctx.translate(topLeftX, topLeftY);
  ctx.scale(sx, sy);
  ctx.translate(-viewBox.minX, -viewBox.minY);
  for (const path of paths) {
    ctx.fillStyle = path.fill === 'currentColor' ? fallbackColor : path.fill;
    ctx.fill(new Path2D(path.d));
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

function renderLine(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  font: string,
  boldFont: string | undefined,
  italicFont: string | undefined,
  boldItalicFont: string | undefined,
  color: string,
  boldColor: string | undefined,
  italicColor: string | undefined,
  textAlign: TextAlign,
  columnWidth: number,
  columnX: number,
): void {
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';

  const hasRichSegments =
    line.segments && line.segments.some((s) => s.bold || s.italic);

  // Effective width accounts for line-level indent (e.g. first-line or hanging indent)
  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;

  // Justified rendering with per-segment spacing
  if (textAlign === 'justify' && !line.isLastLine && line.segments && line.segments.length > 0) {
    let wordWidth = 0;
    let spaceCount = 0;
    for (const seg of line.segments) {
      if (seg.kind === 'space') spaceCount++;
      else wordWidth += seg.width;
    }

    if (spaceCount > 0) {
      const justifiedSpaceWidth = (effectiveWidth - wordWidth) / spaceCount;
      let x = line.bbox.x;
      for (const seg of line.segments) {
        if (seg.kind === 'space') {
          x += justifiedSpaceWidth;
        } else if (seg.kind === 'math') {
          renderMathSegment(ctx, seg, x, line.baseline, color);
          x += seg.width;
        } else {
          ctx.font = pickSegmentFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
          ctx.fillStyle = pickSegmentColor(!!seg.bold, !!seg.italic, color, boldColor, italicColor);
          ctx.fillText(seg.text, x, line.baseline);
          x += seg.width;
        }
      }
      return;
    }
  }

  // Centred alignment — used by math display blocks. Distribute remaining
  // space equally on either side.
  if (textAlign === 'center' && line.segments) {
    const contentWidth = line.segments.reduce((s, seg) => s + seg.width, 0);
    let x = line.bbox.x + Math.max(0, (effectiveWidth - contentWidth) / 2);
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else if (seg.kind === 'math') {
        renderMathSegment(ctx, seg, x, line.baseline, color);
        x += seg.width;
      } else {
        ctx.font = pickSegmentFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
        ctx.fillStyle = pickSegmentColor(!!seg.bold, !!seg.italic, color, boldColor, italicColor);
        ctx.fillText(seg.text, x, line.baseline);
        x += seg.width;
      }
    }
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified blocks
  // If there are bold/italic segments, render per-segment to apply correct fonts
  const hasMathSegments = line.segments && line.segments.some((s) => s.kind === 'math');
  if ((hasRichSegments || hasMathSegments) && line.segments) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else if (seg.kind === 'math') {
        renderMathSegment(ctx, seg, x, line.baseline, color);
        x += seg.width;
      } else {
        ctx.font = pickSegmentFont(!!seg.bold, !!seg.italic, font, boldFont, italicFont, boldItalicFont);
        ctx.fillStyle = pickSegmentColor(!!seg.bold, !!seg.italic, color, boldColor, italicColor);
        ctx.fillText(seg.text, x, line.baseline);
        x += seg.width;
      }
    }
    return;
  }

  ctx.font = font;
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
    renderDesignSlot(ctx, block.designOverlay);
    return;
  }
  if (block.type === 'listItem') {
    renderBullet(ctx, block);
  }
  for (const line of block.lines) {
    renderLine(
      ctx,
      line,
      block.fontString,
      block.boldFontString,
      block.italicFontString,
      block.boldItalicFontString,
      block.color,
      block.boldColor,
      block.italicColor,
      block.textAlign,
      columnWidth,
      columnX,
    );
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
