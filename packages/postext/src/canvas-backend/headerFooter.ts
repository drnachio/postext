import type {
  VDTDesignSlot,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignBoxStyle,
} from '../vdt';

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawBoxBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: VDTDesignBoxStyle,
): void {
  if (w <= 0 || h <= 0) return;
  if (!style.backgroundColor && !style.borderColor) return;
  ctx.save();
  if (style.borderRadiusPx > 0) {
    drawRoundedRectPath(ctx, x, y, w, h, style.borderRadiusPx);
    if (style.backgroundColor) {
      ctx.fillStyle = style.backgroundColor;
      ctx.fill();
    }
    if (style.borderColor && style.borderWidthPx > 0) {
      ctx.lineWidth = style.borderWidthPx;
      ctx.strokeStyle = style.borderColor;
      ctx.stroke();
    }
  } else {
    if (style.backgroundColor) {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(x, y, w, h);
    }
    if (style.borderColor && style.borderWidthPx > 0) {
      ctx.lineWidth = style.borderWidthPx;
      ctx.strokeStyle = style.borderColor;
      ctx.strokeRect(x, y, w, h);
    }
  }
  ctx.restore();
}

function renderTextBlock(ctx: CanvasRenderingContext2D, block: VDTDesignTextBlock): void {
  if (block.box) {
    drawBoxBackground(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
  }
  ctx.save();
  if (block.clip) {
    ctx.beginPath();
    ctx.rect(block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height);
    ctx.clip();
  }
  ctx.fillStyle = block.color;
  ctx.font = block.fontString;
  ctx.textBaseline = 'alphabetic';
  for (const line of block.lines) {
    ctx.fillText(line.text, block.bbox.x + line.xOffset, line.baselineY);
  }
  ctx.restore();
}

function renderRuleBlock(ctx: CanvasRenderingContext2D, block: VDTDesignRuleBlock): void {
  ctx.save();
  ctx.fillStyle = block.color;
  ctx.fillRect(block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx);
  ctx.restore();
}

function renderBoxBlock(ctx: CanvasRenderingContext2D, block: VDTDesignBoxBlock): void {
  drawBoxBackground(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
}

export function renderHeaderFooterSlot(
  ctx: CanvasRenderingContext2D,
  slot: VDTDesignSlot,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block);
    else if (block.kind === 'rule') renderRuleBlock(ctx, block);
    else renderBoxBlock(ctx, block);
  }
}

export const renderDesignSlot = renderHeaderFooterSlot;
