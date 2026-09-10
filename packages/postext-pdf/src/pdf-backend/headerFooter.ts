import type {
  VDTDesignSlot,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignBoxStyle,
} from 'postext';
import { setCharacterSpacing } from 'pdf-lib';
import type { ResourceImageMap } from './renderResourceBlock';
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
  const width = wPx * scale;
  const height = hPx * scale;
  if (radius <= 0) {
    const x = xPx * scale;
    const y = pageHeightPt - (yPx + hPx) * scale;
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
  // pdf-lib 1.x has no borderRadius on drawRectangle, so a rounded box is an
  // SVG path. `drawSvgPath` interprets the path in SVG space (y grows
  // downwards) from the origin passed as `x`/`y`, so anchor it at the top-left
  // corner of the page and express the corners in top-down points.
  const r = radius * scale;
  const sx = xPx * scale;
  const sy = yPx * scale;
  const path =
    `M ${sx + r} ${sy}` +
    ` L ${sx + width - r} ${sy}` +
    ` A ${r} ${r} 0 0 1 ${sx + width} ${sy + r}` +
    ` L ${sx + width} ${sy + height - r}` +
    ` A ${r} ${r} 0 0 1 ${sx + width - r} ${sy + height}` +
    ` L ${sx + r} ${sy + height}` +
    ` A ${r} ${r} 0 0 1 ${sx} ${sy + height - r}` +
    ` L ${sx} ${sy + r}` +
    ` A ${r} ${r} 0 0 1 ${sx + r} ${sy} Z`;
  const origin = { x: 0, y: pageHeightPt };

  if (style.backgroundColor) {
    ctx.page.drawSvgPath(path, {
      ...origin,
      color: colorFromHex(style.backgroundColor, ctx.colorSpace),
    });
  }
  if (style.borderColor && style.borderWidthPx > 0) {
    ctx.page.drawSvgPath(path, {
      ...origin,
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
  const tracked = block.letterSpacingPx !== undefined && block.letterSpacingPx > 0;
  if (tracked) ctx.page.pushOperators(setCharacterSpacing(block.letterSpacingPx! * ctx.scale));
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
  if (tracked) ctx.page.pushOperators(setCharacterSpacing(0));
  if (clip) popClip(ctx);
}

function renderRuleBlock(ctx: PageCtx, block: VDTDesignRuleBlock): void {
  const color = colorFromHex(block.color, ctx.colorSpace);
  if (block.direction === 'vertical') {
    fillRectPx(ctx, block.bbox.x, block.bbox.y, block.thicknessPx, block.bbox.height, color);
  } else {
    fillRectPx(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx, color);
  }
}

function renderBoxBlock(ctx: PageCtx, block: VDTDesignBoxBlock): void {
  drawRoundedBox(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
}

/** Image block (e.g. a callout icon): drawn from the preloaded resource
 *  image map, with a neutral placeholder when the image is absent. */
function renderImageBlock(ctx: PageCtx, block: VDTDesignImageBlock, images: ResourceImageMap | undefined): void {
  const { x, y, width, height } = block.bbox;
  if (width <= 0 || height <= 0) return;
  const image = images?.get(block.fileId);
  const { scale, pageHeightPt } = ctx;
  if (image) {
    ctx.page.drawImage(image, {
      x: x * scale,
      y: pageHeightPt - (y + height) * scale,
      width: width * scale,
      height: height * scale,
    });
  } else {
    fillRectPx(ctx, x, y, width, height, colorFromHex('#e8e8e8', ctx.colorSpace));
  }
}

export function renderHeaderFooterSlot(
  ctx: PageCtx,
  slot: VDTDesignSlot,
  fontCache: FontCache,
  images?: ResourceImageMap,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block, fontCache);
    else if (block.kind === 'rule') renderRuleBlock(ctx, block);
    else if (block.kind === 'image') renderImageBlock(ctx, block, images);
    else renderBoxBlock(ctx, block);
  }
}