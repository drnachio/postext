import type {
  VDTDesignSlot,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignPathBlock,
  VDTDesignBoxStyle,
} from '../vdt.js';
import { pathMarkerOutline } from '../design/pathBlock.js';
import { boxNeedsShape, boxStylePathBlocks } from '../design/boxShape.js';
import { fillTextDots } from './textDots.js';
import { drawResourceImage, roundedOutlinePath } from './renderResourceBlock.js';
import { fillFlowText, drawUprightInBox, setVerticalPaint, verticalPaintActive } from './verticalText.js';
import { segmentOrientation, type ForcedOrientation } from '../writing/writingMode.js';
import { paintRunInDirection, runPaintOrder } from './runDirection.js';
import { fillTrackedWord } from './trackedText.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { markCuts } from '../measure/cjk/markCuts.js';
import { restoreContext, saveContext, setLetterSpacing } from './contextState.js';
import { fillCellRuns } from './cellText.js';
import { paintChip } from './chip.js';

/** Adds a rounded rectangle to the current path, as a closed subpath. */
function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
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

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  traceRoundedRect(ctx, x, y, w, h, r);
}

/**
 * A box's fill, then its border inside the box (EF-131): the border's outer
 * edge runs along the box edge, as CSS `box-sizing: border-box` draws it in
 * the HTML output. A square border is stroked on a path half its width in.
 * A rounded one is filled as the ring between the box's outline (the box's
 * radius) and the same outline inset by the border width, its radius less
 * that width and at least 0, which is CSS's inner border edge; a stroke
 * would lose the outer radius where it is under half the border width. A
 * border as wide as the box fills it. Up to postext 1.4 the stroke was
 * centred on the edge and reached half its width outside the box. Used by
 * design boxes, text-element boxes and callout frames.
 */
export function drawBoxBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: VDTDesignBoxStyle,
): void {
  if (w <= 0 || h <= 0) return;
  // Corners of their own or a border per side (#1059): the shape's fill
  // and border pieces as vectors.
  if (boxNeedsShape(style)) {
    for (const b of boxStylePathBlocks(x, y, w, h, style)) renderPathBlock(ctx, b);
    return;
  }
  if (!style.backgroundColor && !style.borderColor) return;
  const bw = style.borderColor ? Math.max(0, style.borderWidthPx) : 0;
  const solid = bw > 0 && (bw >= w || bw >= h);
  const outerRadius = Math.max(0, Math.min(style.borderRadiusPx, w / 2, h / 2));
  saveContext(ctx);
  if (outerRadius > 0) {
    if (style.backgroundColor || solid) {
      drawRoundedRectPath(ctx, x, y, w, h, outerRadius);
      ctx.fillStyle = solid ? style.borderColor! : style.backgroundColor!;
      ctx.fill();
    }
    if (bw > 0 && !solid) {
      ctx.beginPath();
      traceRoundedRect(ctx, x, y, w, h, outerRadius);
      if (w > 2 * bw && h > 2 * bw) traceRoundedRect(ctx, x + bw, y + bw, w - 2 * bw, h - 2 * bw, outerRadius - bw);
      ctx.fillStyle = style.borderColor!;
      ctx.fill('evenodd');
    }
  } else {
    if (style.backgroundColor || solid) {
      ctx.fillStyle = solid ? style.borderColor! : style.backgroundColor!;
      ctx.fillRect(x, y, w, h);
    }
    if (bw > 0 && !solid) {
      ctx.lineWidth = bw;
      ctx.strokeStyle = style.borderColor!;
      ctx.strokeRect(x + bw / 2, y + bw / 2, w - bw, h - bw);
    }
  }
  restoreContext(ctx);
}

/** Paint one design text block (horizontal, right to left or vertical) as
 *  the design slots do; also used for the lettering of comic balloons. */
export function renderTextBlock(ctx: CanvasRenderingContext2D, block: VDTDesignTextBlock): void {
  if (block.box) {
    drawBoxBackground(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
  }
  saveContext(ctx);
  if (block.clip) {
    ctx.beginPath();
    ctx.rect(block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height);
    ctx.clip();
  }
  ctx.fillStyle = block.color;
  ctx.font = block.fontString;
  ctx.textBaseline = 'alphabetic';
  // Negative tracking tightens the letters (EF-82).
  const tracked = block.letterSpacingPx !== undefined && block.letterSpacingPx !== 0;
  if (tracked) setLetterSpacing(ctx, block.letterSpacingPx!);
  // An outline is stroked over the filled glyphs (or alone, for hollow
  // letters), centred on their edges — as PDF render mode 2 / 1 and CSS
  // `-webkit-text-stroke` do.
  // Letters to trace (#1017) are dots in the fill colour, no outline.
  const dotted = block.dotted && !block.vertical ? block.dotted : undefined;
  const stroke = !dotted && block.stroke && block.stroke.widthPx > 0 ? block.stroke : undefined;
  if (stroke) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.widthPx;
  }
  const mode = stroke?.hollow ? 'stroke' : stroke ? 'fillStroke' : 'fill';
  const put = (text: string, x: number, y: number, orient?: ForcedOrientation): void => {
    if (!dotted || !fillTextDots(ctx, text, x, y, dotted)) fillFlowText(ctx, text, x, y, mode, undefined, 'text', orient);
  };
  // A tracked text keeps its ligatures, as it was measured (#703): one
  // that would lose them to the letter-spacing is painted in pieces
  // (`fillTrackedWord`), fill and outline alike, turned back as one run on
  // a mirrored page. A vertical block's sideways runs do the same in the
  // vertical painter; text whose CJK marks are painted apart stays as it
  // was.
  const paint = (text: string, x: number, y: number, orient?: ForcedOrientation): void => {
    if (!tracked || dotted || verticalPaintActive() || (hasCJK(text) && markCuts(text, 'text').length > 0)) put(text, x, y, orient);
    else fillTrackedWord(ctx, text, x, y, block.letterSpacingPx!, (piece, px, py) => put(piece, px, py, orient));
  };
  // A vertical block (`VDTDesignTextBlock.vertical`) paints its lines in
  // its own frame, turned a quarter turn clockwise about the box's top
  // right corner, with the vertical painter on.
  const vertical = block.vertical;
  let outerPaint: ReturnType<typeof setVerticalPaint> = null;
  if (vertical) {
    ctx.translate(block.bbox.x + block.bbox.width, block.bbox.y);
    ctx.rotate(Math.PI / 2);
    outerPaint = setVerticalPaint({ region: vertical.region, uprightDigits: vertical.uprightDigits, axes: vertical.centralBaselines });
  }
  const originX = vertical ? 0 : block.bbox.x;
  for (const line of block.lines) {
    if (!line.runs) {
      paint(line.text, originX + line.xOffset, line.baselineY);
      continue;
    }
    // Inline marks, or a line with right-to-left text: each run in its own
    // font and direction, one after another in the line's paint order.
    let x = originX + line.xOffset;
    for (const i of runPaintOrder(line.order, line.runs.length)) {
      const run = line.runs[i]!;
      if (run.chip) {
        // A heading title's chip (#1162): its box and its own runs, in
        // the block's colour where the chip style sets none.
        paintChip(ctx, run.chip, x + (run.inkOffset ?? 0), line.baselineY, () => block.color);
        ctx.font = block.fontString;
        ctx.fillStyle = block.color;
        x += run.width;
        continue;
      }
      ctx.font = run.fontString;
      // A run in a colour of its own (a part row's leader, #1121).
      if (run.color) ctx.fillStyle = run.color;
      // A vertical line: the orientation its author gave the run
      // (`:tcy`, `:upright`, `:sideways`).
      // A run whose width is its box (a CJK mark that gave up blank, #637)
      // paints its glyphs `inkOffset` into it.
      const runX = x + (run.inkOffset ?? 0);
      const runY = line.baselineY + (run.baselineShift ?? 0);
      if (run.inkScale === undefined) {
        // A run whose width is its box (`inkOffset`) comes from the CJK
        // composer, which measured its characters one by one: its cells
        // are painted where they were measured (#770, `cellText.ts`).
        const cells = run.inkOffset !== undefined && !run.rtl && !dotted && !verticalPaintActive()
          && fillCellRuns(ctx, run.text, runX, runY, (cell, cx, cy) => put(cell, cx, cy));
        if (!cells) paintRunInDirection(ctx, run.rtl, () => paint(run.text, runX, runY, segmentOrientation(run)), run.text);
      } else {
        // A dash of a 破折号 (#652): stretched along the line from where
        // its glyph starts, and turned with the column down a vertical
        // line, as a body segment's is (`fillSegmentText`).
        saveContext(ctx);
        ctx.translate(runX, runY);
        ctx.scale(run.inkScale, 1);
        paint(run.text, 0, 0, verticalPaintActive() ? 'sideways' : undefined);
        restoreContext(ctx);
      }
      if (run.color) ctx.fillStyle = block.color;
      x += run.width;
    }
    ctx.font = block.fontString;
  }
  if (vertical) setVerticalPaint(outerPaint);
  if (tracked) setLetterSpacing(ctx, 0);
  restoreContext(ctx);
}

function renderRuleBlock(ctx: CanvasRenderingContext2D, block: VDTDesignRuleBlock): void {
  saveContext(ctx);
  ctx.fillStyle = block.color;
  // A vertical rule is `thickness` wide and `bbox.height` tall; a horizontal
  // one is `bbox.width` wide and `thickness` tall.
  if (block.direction === 'vertical') {
    ctx.fillRect(block.bbox.x, block.bbox.y, block.thicknessPx, block.bbox.height);
  } else {
    ctx.fillRect(block.bbox.x, block.bbox.y, block.bbox.width, block.thicknessPx);
  }
  restoreContext(ctx);
}

function renderBoxBlock(ctx: CanvasRenderingContext2D, block: VDTDesignBoxBlock): void {
  const clip = block.clip;
  if (!clip) {
    drawBoxBackground(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
    return;
  }
  // A callout stripe on a rounded frame: clipped to the frame's outline.
  saveContext(ctx);
  roundedOutlinePath(ctx, clip);
  ctx.clip();
  drawBoxBackground(ctx, block.bbox.x, block.bbox.y, block.bbox.width, block.bbox.height, block.box);
  restoreContext(ctx);
}

/** A vector shape (DESIGN §12.1, #1055): its outline traced with plain
 *  path calls, filled, then stroked, then its markers filled on top. */
export function renderPathBlock(ctx: CanvasRenderingContext2D, block: VDTDesignPathBlock): void {
  const stroke = block.stroke && block.stroke.widthPx > 0 ? block.stroke : undefined;
  saveContext(ctx);
  if (block.fill || stroke) {
    ctx.beginPath();
    for (const sp of block.subpaths) {
      for (const c of sp) {
        if (c.op === 'M') ctx.moveTo(c.x, c.y);
        else if (c.op === 'L') ctx.lineTo(c.x, c.y);
        else if (c.op === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        else if (c.op === 'Q') ctx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
        else ctx.closePath();
      }
    }
    if (block.fill) {
      ctx.fillStyle = block.fill;
      ctx.fill(block.fillRule ?? 'nonzero');
    }
    if (stroke) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.widthPx;
      ctx.lineCap = stroke.cap ?? 'butt';
      ctx.lineJoin = stroke.join ?? 'miter';
      ctx.setLineDash(stroke.dash ?? []);
      ctx.stroke();
    }
  }
  for (const m of block.markers ?? []) {
    const o = pathMarkerOutline(m);
    ctx.beginPath();
    if (o.kind === 'ring' || o.kind === 'bar') {
      // A ring or a bar (#1079): stroked solid in the line's width.
      if (o.kind === 'ring') ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
      else {
        ctx.moveTo(o.points[0].x, o.points[0].y);
        ctx.lineTo(o.points[1].x, o.points[1].y);
      }
      ctx.strokeStyle = m.color;
      ctx.lineWidth = o.widthPx;
      ctx.lineCap = 'butt';
      ctx.setLineDash([]);
      ctx.stroke();
      continue;
    }
    if (o.kind === 'dot') {
      ctx.arc(o.cx, o.cy, o.r, 0, Math.PI * 2);
    } else {
      const [a, b, c] = o.points;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
    }
    ctx.fillStyle = m.color;
    ctx.fill();
  }
  restoreContext(ctx);
}

/** Image block (e.g. a callout icon): drawn from the resource image
 *  registry, with a neutral placeholder when the image is not decoded yet. */
function renderImageBlock(ctx: CanvasRenderingContext2D, block: VDTDesignImageBlock, inkHex: string | null): void {
  const { x, y, width, height } = block.bbox;
  if (width <= 0 || height <= 0) return;
  saveContext(ctx);
  // Single ink tints an SVG picture, never a bitmap; a VDT without the
  // kind leaves it to the registry.
  const svg = block.imageKind === undefined ? undefined : block.imageKind === 'svg';
  if (block.crop) {
    // A cover crop (#923): the whole picture over its uncropped box,
    // clipped to the element's; an upright picture of a vertical flow
    // (#946) in its own upright frame, the box turned back.
    const c = block.crop;
    drawUprightInBox(ctx, x, y, width, height, (bx, by, bw, bh) => {
      const w = bw / c.width;
      const h = bh / c.height;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      drawResourceImage(ctx, block.fileId, bx - c.x * w, by - c.y * h, w, h, { inkHex, svg, ...(block.tint ? { tint: block.tint } : {}) });
    }, block.upright === true);
    restoreContext(ctx);
    return;
  }
  // In a vertical flow the picture stands upright in its box.
  drawUprightInBox(ctx, x, y, width, height, (bx, by, bw, bh) => {
    if (!drawResourceImage(ctx, block.fileId, bx, by, bw, bh, { inkHex, svg, ...(block.tint ? { tint: block.tint } : {}) })) {
      ctx.fillStyle = 'rgba(160,160,160,0.12)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = 'rgba(160,160,160,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    }
  }, block.upright === true);
  restoreContext(ctx);
}

export function renderHeaderFooterSlot(
  ctx: CanvasRenderingContext2D,
  slot: VDTDesignSlot,
  /** The document's single ink (`documentInkHex`), null when off. */
  inkHex: string | null = null,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') renderTextBlock(ctx, block);
    else if (block.kind === 'rule') renderRuleBlock(ctx, block);
    else if (block.kind === 'image') renderImageBlock(ctx, block, inkHex);
    else if (block.kind === 'path') renderPathBlock(ctx, block);
    else renderBoxBlock(ctx, block);
  }
}