import type { VDTHeaderFooterSlot, VDTHeaderFooterTextBlock, VDTRuleBlock } from 'postext';
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import { type PageCtx, colorFromHex, drawTextPx, fillRectPx } from './primitives';

function renderTextBlock(
  ctx: PageCtx,
  block: VDTHeaderFooterTextBlock,
  fontCache: FontCache,
): void {
  const font = fontCache.get(block.fontString);
  if (!font) return;
  const size = parseFontString(block.fontString)?.sizePx ?? 0;
  const color = colorFromHex(block.color, ctx.colorSpace);
  drawTextPx(ctx, block.text, block.bbox.x, block.baseline, font, size, color);
}

function renderRuleBlock(ctx: PageCtx, block: VDTRuleBlock): void {
  const color = colorFromHex(block.color, ctx.colorSpace);
  fillRectPx(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx, color);
}

export function renderHeaderFooterSlot(
  ctx: PageCtx,
  slot: VDTHeaderFooterSlot,
  fontCache: FontCache,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block, fontCache);
    else renderRuleBlock(ctx, block);
  }
}
