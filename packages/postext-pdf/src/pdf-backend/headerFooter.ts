import type {
  VDTDesignSlot,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignBoxStyle,
} from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import {
  type PageCtx,
  colorFromHex,
  drawTextPx,
  fillRectPx,
  pushClipRect,
  popClip,
} from './primitives';

function drawRoundedBox(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  style: VDTDesignBoxStyle,
): void {
  if (wPx <= 0 || hPx <= 0) return;
  const { scale, pageHeightPt } = ctx;
  const radius = Math.max(0, Math.min(style.borderRadiusPx, wPx / 2, hPx / 2));
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  if (radius <= 0) {
    if (style.backgroundColor) {
      ctx.page.drawRectangle({
        x,
        y,
        width,
        height,
        color: colorFromHex(style.backgroundColor, ctx.colorSpace),
      });
    }
    if (style.borderColor && style.borderWidthPx > 0) {
      ctx.page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor: colorFromHex(style.borderColor, ctx.colorSpace),
        borderWidth: style.borderWidthPx * scale,
      });
    }
    return;
  }
  // pdf-lib supports borderRadius on drawRectangle in recent versions; fall
  // back to an SVG path approximation if unavailable.
  const r = radius * scale;
  const drawRectOptions: Record<string, unknown> = {
    x,
    y,
    width,
    height,
  };
  if (style.backgroundColor) {
    drawRectOptions.color = colorFromHex(style.backgroundColor, ctx.colorSpace);
  }
  if (style.borderColor && style.borderWidthPx > 0) {
    drawRectOptions.borderColor = colorFromHex(style.borderColor, ctx.colorSpace);
    drawRectOptions.borderWidth = style.borderWidthPx * scale;
  }
  // SVG path fallback — draws a rounded rect with four arcs.
  const path =
    `M ${x + r} ${y + height}` +
    ` L ${x + width - r} ${y + height}` +
    ` A ${r} ${r} 0 0 0 ${x + width} ${y + height - r}` +
    ` L ${x + width} ${y + r}` +
    ` A ${r} ${r} 0 0 0 ${x + width - r} ${y}` +
    ` L ${x + r} ${y}` +
    ` A ${r} ${r} 0 0 0 ${x} ${y + r}` +
    ` L ${x} ${y + height - r}` +
    ` A ${r} ${r} 0 0 0 ${x + r} ${y + height} Z`;

  if (style.backgroundColor) {
    ctx.page.drawSvgPath(path, {
      color: colorFromHex(style.backgroundColor, ctx.colorSpace),
    });
  }
  if (style.borderColor && style.borderWidthPx > 0) {
    ctx.page.drawSvgPath(path, {
      borderColor: colorFromHex(style.borderColor, ctx.colorSpace),
      borderWidth: style.borderWidthPx * scale,
    });
  }
}

function renderTextBlock(
  ctx: PageCtx,
  block: VDTDesignTextBlock,
  fontCache: FontCache,
): void {
  if (block.box) {
    drawRoundedBox(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
  }
  const font = fontCache.get(block.fontString);
  if (!font) return;
  const size = parseFontString(block.fontString)?.sizePx ?? 0;
  const color = colorFromHex(block.color, ctx.colorSpace);
  const clip = block.clip;
  if (clip) {
    pushClipRect(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height);
  }
  for (const line of block.lines) {
    drawTextPx(
      ctx,
      line.text,
      block.bbox.x + line.xOffset,
      line.baselineY,
      font,
      size,
      color,
    );
  }
  if (clip) popClip(ctx);
}

function renderRuleBlock(ctx: PageCtx, block: VDTDesignRuleBlock): void {
  const color = colorFromHex(block.color, ctx.colorSpace);
  fillRectPx(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx, color);
}

function renderBoxBlock(ctx: PageCtx, block: VDTDesignBoxBlock): void {
  drawRoundedBox(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
}

export function renderHeaderFooterSlot(
  ctx: PageCtx,
  slot: VDTDesignSlot,
  fontCache: FontCache,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block, fontCache);
    else if (block.kind === 'rule') renderRuleBlock(ctx, block);
    else renderBoxBlock(ctx, block);
  }
}

export const renderDesignSlot = renderHeaderFooterSlot;
