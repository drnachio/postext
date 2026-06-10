import type { Color, PDFFont } from 'pdf-lib';
import type { VDTBlock, VDTLine, VDTLineSegment, MathRender } from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, drawLinePx, drawTextPx, colorFromHex } from './primitives';
import { pickSegmentColor, pickSegmentFont } from './fontHelpers';
import { renderHeaderFooterSlot } from './headerFooter';
import {
  renderResourceBlock,
  type ResourceImageMap,
} from './renderResourceBlock';
import { LinkRegistry } from './links';

/** Per-document context for resource rendering, threaded through `renderBlock`. */
export interface ResourceRenderContext {
  images: ResourceImageMap;
  linkRegistry: LinkRegistry;
}

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

/**
 * Paint a line's segments left to right starting at `startX`. When
 * `justifiedSpaceWidth` is set, spaces advance by it instead of their
 * measured width.
 */
function renderSegments(
  ctx: PageCtx,
  segments: VDTLineSegment[],
  startX: number,
  baseline: number,
  block: VDTBlock,
  blockFont: PDFFont,
  blockSize: number,
  blockColor: Color,
  fontCache: FontCache,
  justifiedSpaceWidth?: number,
): void {
  let x = startX;
  for (const seg of segments) {
    if (seg.kind === 'space') {
      x += justifiedSpaceWidth ?? seg.width;
      continue;
    }
    if (seg.kind === 'math') {
      renderMathSegment(ctx, seg, x, baseline, blockColor);
      x += seg.width;
      continue;
    }
    const fontStr = pickSegmentFont(!!seg.bold, !!seg.italic, block);
    const font = fontCache.get(fontStr) ?? blockFont;
    const size = parseFontString(fontStr)?.sizePx ?? blockSize;
    const colorHex = seg.refResourceId !== undefined && block.refColor
      ? block.refColor
      : pickSegmentColor(!!seg.bold, !!seg.italic, block);
    const color = colorHex === block.color ? blockColor : colorFromHex(colorHex, ctx.colorSpace);
    drawTextPx(ctx, seg.text, x, baseline, font, size, color);
    x += seg.width;
  }
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

  const lineIndent = line.bbox.x - columnX;
  const effectiveWidth = columnWidth - lineIndent;
  const segments = line.segments;

  // Last lines render ragged at natural width — except when overfull:
  // Knuth-Plass may accept a final line wider than the measure on the
  // assumption that its inter-word glue shrinks (TeX glue-setting semantics),
  // so honor that by compressing the spaces to fit the measure exactly.
  if (block.textAlign === 'justify' && segments && segments.length > 0) {
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
      renderSegments(ctx, segments, line.bbox.x, line.baseline, block, blockFont, blockSize, blockColor, fontCache, justifiedSpaceWidth);
      return;
    }
  }

  if (block.textAlign === 'center' && segments) {
    let contentWidth = 0;
    for (const seg of segments) contentWidth += seg.width;
    const startX = line.bbox.x + Math.max(0, (effectiveWidth - contentWidth) / 2);
    renderSegments(ctx, segments, startX, line.baseline, block, blockFont, blockSize, blockColor, fontCache);
    return;
  }

  // Ragged (left-aligned) rendering — also used for last lines of justified
  // blocks. Segments are needed when any of them styles differently from the
  // block (bold/italic/math/ref); otherwise one drawTextPx paints the line.
  if (segments && segments.some((s) => s.bold || s.italic || s.kind === 'math' || s.refResourceId !== undefined)) {
    renderSegments(ctx, segments, line.bbox.x, line.baseline, block, blockFont, blockSize, blockColor, fontCache);
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
  resourceCtx?: ResourceRenderContext,
): void {
  if (block.hidden) return;
  if (block.designOverlay) {
    renderHeaderFooterSlot(ctx, block.designOverlay, fontCache);
    return;
  }
  if (block.type === 'resource') {
    renderResourceBlock(
      ctx,
      block,
      fontCache,
      resourceCtx?.images ?? new Map(),
      resourceCtx?.linkRegistry,
    );
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
