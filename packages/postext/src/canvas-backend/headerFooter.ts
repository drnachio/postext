import type { VDTHeaderFooterSlot, VDTHeaderFooterTextBlock, VDTRuleBlock } from '../vdt';

function renderTextBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTHeaderFooterTextBlock,
): void {
  ctx.save();
  ctx.fillStyle = block.color;
  ctx.font = block.fontString;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(block.text, block.bbox.x, block.baseline);
  ctx.restore();
}

function renderRuleBlock(ctx: CanvasRenderingContext2D, block: VDTRuleBlock): void {
  ctx.save();
  ctx.fillStyle = block.color;
  ctx.fillRect(block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx);
  ctx.restore();
}

export function renderHeaderFooterSlot(
  ctx: CanvasRenderingContext2D,
  slot: VDTHeaderFooterSlot,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block);
    else renderRuleBlock(ctx, block);
  }
}
