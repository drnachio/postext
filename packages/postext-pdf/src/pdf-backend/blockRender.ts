import type { Color } from 'pdf-lib';
import type { VDTBlock, VDTLine, VDTLineSegment, MathRender } from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, drawLinePx, drawTextPx, colorFromHex } from './primitives';
import { pickSegmentColor, pickSegmentFont } from './fontHelpers';
import { renderDesignSlot } from './headerFooter';

function renderMathRender(
  ctx: PageCtx,
  render: MathRender,
  topLeftXPx: number,
  topLeftYPx: number,
  fallbackColor: Color,
): void {
  if (!render.paths.length || render.viewBox.width <= 0 || render.viewBox.height <= 0) return;
  const { scale: pxToPt, pageHeightPt } = ctx;
  const pxPerVb = render.widthPx / render.viewBox.width;
  const S = pxPerVb * pxToPt;
  const x = topLeftXPx * pxToPt - render.viewBox.minX * S;
  const y = pageHeightPt - topLeftYPx * pxToPt + render.viewBox.minY * S;
  for (const path of render.paths) {
    const color = path.fill === 'currentColor' ? fallbackColor : colorFromHex(path.fill, ctx.colorSpace);
    ctx.page.drawSvgPath(path.d, { x, y, scale: S, color });
  }
}

function renderMathSegment(
  ctx: PageCtx,
  seg: VDTLineSegment,
  xPx: number,
  baselinePx: number,
  fallbackColor: Color,
): void {
  if (!seg.mathRender) return;
  renderMathRender(ctx, seg.mathRender, xPx, baselinePx - seg.mathRender.ascentPx, fallbackColor);
}

function renderLine(
  ctx: PageCtx,
  line: VDTLine,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
): void {
  const blockFont = fontCache.get(block.fontString);
  if (!blockFont) return;
  const blockSize = parseFontString(block.fontString)?.sizePx ?? 0;
  const blockColor = colorFromHex(block.color, ctx.colorSpace);

  const hasRichSegments =
    !!line.segments && line.segments.some((s) => s.bold || s.italic);

  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;

  if (block.textAlign === 'justify' && !line.isLastLine && line.segments && line.segments.length > 0) {
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
          renderMathSegment(ctx, seg, x, line.baseline, blockColor);
          x += seg.width;
        } else {
          const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
          const font = fontCache.get(fontStr) ?? blockFont;
          const size = parseFontString(fontStr)?.sizePx ?? blockSize;
          const colorHex = pickSegmentColor(!!seg.bold, !!seg.italic, block);
          const color = colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace);
          drawTextPx(ctx, seg.text, x, line.baseline, font, size, color);
          x += seg.width;
        }
      }
      return;
    }
  }

  if (block.textAlign === 'center' && line.segments) {
    const contentWidth = line.segments.reduce((s, seg) => s + seg.width, 0);
    let x = line.bbox.x + Math.max(0, (effectiveWidth - contentWidth) / 2);
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else if (seg.kind === 'math') {
        renderMathSegment(ctx, seg, x, line.baseline, blockColor);
        x += seg.width;
      } else {
        const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
        const font = fontCache.get(fontStr) ?? blockFont;
        const size = parseFontString(fontStr)?.sizePx ?? blockSize;
        const colorHex = pickSegmentColor(!!seg.bold, !!seg.italic, block);
        const color = colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace);
        drawTextPx(ctx, seg.text, x, line.baseline, font, size, color);
        x += seg.width;
      }
    }
    return;
  }

  const hasMathSegments = line.segments && line.segments.some((s) => s.kind === 'math');
  if ((hasRichSegments || hasMathSegments) && line.segments) {
    let x = line.bbox.x;
    for (const seg of line.segments) {
      if (seg.kind === 'space') {
        x += seg.width;
      } else if (seg.kind === 'math') {
        renderMathSegment(ctx, seg, x, line.baseline, blockColor);
        x += seg.width;
      } else {
        const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
        const font = fontCache.get(fontStr) ?? blockFont;
        const size = parseFontString(fontStr)?.sizePx ?? blockSize;
        const colorHex = pickSegmentColor(!!seg.bold, !!seg.italic, block);
        const color = colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace);
        drawTextPx(ctx, seg.text, x, line.baseline, font, size, color);
        x += seg.width;
      }
    }
    return;
  }

  drawTextPx(ctx, line.text, line.bbox.x, line.baseline, blockFont, blockSize, blockColor);
}

function renderBullet(ctx: PageCtx, block: VDTBlock, fontCache: FontCache): void {
  if (
    !block.bulletText ||
    !block.bulletFontString ||
    block.bulletOffsetX === undefined
  ) {
    return;
  }
  const firstLine = block.lines[0];
  if (!firstLine) return;
  const font = fontCache.get(block.bulletFontString);
  if (!font) return;
  const size = parseFontString(block.bulletFontString)?.sizePx ?? 0;
  const colorHex = block.bulletColor ?? block.color;
  const color = colorFromHex(colorHex, ctx.colorSpace);

  // Canvas uses `textBaseline='middle'` at bulletY; pdf-lib draws from the
  // alphabetic baseline. Shift the baseline down by ~0.3em so the em-square
  // midline aligns at bulletY, matching canvas placement within hinting tolerance.
  const midY = block.bulletY ?? firstLine.baseline;
  const baselinePx = midY + size * 0.3;
  drawTextPx(ctx, block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);
}

function renderStrikethrough(ctx: PageCtx, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  const color = colorFromHex(block.color, ctx.colorSpace);
  const thickness = Math.max(
    1,
    block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1,
  );
  for (const line of block.lines) {
    const y = line.baseline - line.bbox.height * 0.28;
    drawLinePx(ctx, line.bbox.x, y, line.bbox.x + line.bbox.width, y, color, thickness);
  }
}

export function renderBlock(
  ctx: PageCtx,
  block: VDTBlock,
  columnWidth: number,
  columnX: number,
  fontCache: FontCache,
): void {
  if (block.hidden) return;
  if (block.designOverlay) {
    renderDesignSlot(ctx, block.designOverlay, fontCache);
    return;
  }
  if (block.type === 'listItem') {
    renderBullet(ctx, block, fontCache);
  }
  for (const line of block.lines) {
    renderLine(ctx, line, block, columnWidth, columnX, fontCache);
  }
  if (block.strikethroughText) {
    renderStrikethrough(ctx, block);
  }
}
