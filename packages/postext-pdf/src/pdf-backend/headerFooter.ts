import type {
  VDTDesignSlot,
  VDTDesignTextBlock,
  VDTDesignRuleBlock,
  VDTDesignBoxBlock,
  VDTDesignImageBlock,
  VDTDesignBoxStyle,
} from 'postext';
import { segmentOrientation } from 'postext';
import { drawRightToLeftRun } from './rtlRun';
import { drawEmbeddedResource, figureLayout, type ResourceImageMap } from './renderResourceBlock';
import { tagArtifact, tagContent, type ArtifactSpec, type StructAttrs, type StructElem } from './tagging';

/** How an accessible render tags a design slot: its text goes to the
 *  element `text()` returns (created on first use), or counts as an
 *  artifact when `text` is absent (running headers / footers) or the text
 *  block is pagination furniture (`artifact`: a split callout's repeated
 *  title and continuation marker). A picture with alternative text
 *  (`VDTDesignImageBlock.altText`, #213) is a `Figure` that `figure`
 *  creates — read after the slot's text element, `after`, when the slot
 *  has text; without `figure` (running heads) it stays an artifact. Rules,
 *  boxes and pictures without alternative text are artifacts of class
 *  `artifact`. */
export interface SlotMark {
  text?: () => StructElem;
  artifact: ArtifactSpec;
  figure?: (alt: string, attributes: StructAttrs['attributes'], after: StructElem | undefined) => StructElem;
}

function tagSlotText(ctx: PageCtx, mark: SlotMark | undefined, block: VDTDesignTextBlock): void {
  if (!mark) return;
  if (mark.text && !block.artifact) tagContent(ctx, mark.text());
  else tagArtifact(ctx, mark.artifact);
}
import { parseFontString } from '../fontString';
import { FontCache } from '../fontCache';
import {
  type PageCtx,
  alphaOf,
  colorFromHex,
  drawTextPx,
  setTrackingPx,
  pushFrame,
  popFrame,
  quarterTurnMatrix,
  fillRectPx,
  pushClipOutline,
  pushClipRect,
  popClip,
  type TextOutline,
} from './primitives';

/** pdf-lib drawing options for a translucent fill / stroke (none when opaque). */
const opacity = (alpha: number) => (alpha < 1 ? { opacity: alpha } : {});
const borderOpacity = (alpha: number) => (alpha < 1 ? { borderOpacity: alpha } : {});

/** A rounded rectangle (px, top-down) as an SVG path in top-down points,
 *  for `drawSvgPath` anchored at the page's top-left corner. Clockwise on
 *  the page, or counter-clockwise with `reverse`, so that a filled path
 *  holding both leaves the inner one empty. A radius of 0 gives no arcs. */
export function roundedRectSvgPath(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  radiusPx: number,
  reverse = false,
): string {
  const { scale } = ctx;
  const r = Math.max(0, Math.min(radiusPx, wPx / 2, hPx / 2)) * scale;
  const sx = xPx * scale;
  const sy = yPx * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  const arc = (x: number, y: number) => (r > 0 ? ` A ${r} ${r} 0 0 ${reverse ? 0 : 1} ${x} ${y}` : '');
  if (reverse) {
    return (
      `M ${sx + r} ${sy}` +
      arc(sx, sy + r) +
      ` L ${sx} ${sy + height - r}` +
      arc(sx + r, sy + height) +
      ` L ${sx + width - r} ${sy + height}` +
      arc(sx + width, sy + height - r) +
      ` L ${sx + width} ${sy + r}` +
      arc(sx + width - r, sy) +
      ' Z'
    );
  }
  return (
    `M ${sx + r} ${sy}` +
    ` L ${sx + width - r} ${sy}` +
    arc(sx + width, sy + r) +
    ` L ${sx + width} ${sy + height - r}` +
    arc(sx + width - r, sy + height) +
    ` L ${sx + r} ${sy + height}` +
    arc(sx, sy + height - r) +
    ` L ${sx} ${sy + r}` +
    arc(sx + r, sy) +
    ' Z'
  );
}

/**
 * A box's fill, then its border inside the box (EF-131), as the canvas
 * backend and the HTML output (`box-sizing: border-box`) draw it: the
 * border's outer edge runs along the box edge. A square border is stroked
 * on a path half its width in. A rounded one is filled as the ring between
 * the box's outline and the same outline inset by the border width, its
 * radius less that width and at least 0 (CSS's inner border edge), so the
 * outer corner keeps the box's radius even where that is under half the
 * border width. A border as wide as the box fills it. Up to postext 1.4 the
 * stroke was centred on the edge.
 */
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
  const bw = style.borderColor ? Math.max(0, style.borderWidthPx) : 0;
  const solid = bw > 0 && (bw >= wPx || bw >= hPx);
  const fillHex = solid ? style.borderColor : style.backgroundColor;
  if (radius <= 0) {
    const rect = (x: number, y: number, w: number, h: number) =>
      ({ x: x * scale, y: pageHeightPt - (y + h) * scale, width: w * scale, height: h * scale });
    if (fillHex) {
      const color = colorFromHex(fillHex, ctx.colorSpace);
      ctx.page.drawRectangle({ ...rect(xPx, yPx, wPx, hPx), color, ...opacity(alphaOf(color)) });
    }
    if (bw > 0 && !solid) {
      const borderColor = colorFromHex(style.borderColor!, ctx.colorSpace);
      ctx.page.drawRectangle({
        ...rect(xPx + bw / 2, yPx + bw / 2, wPx - bw, hPx - bw),
        borderColor,
        borderWidth: bw * scale,
        ...borderOpacity(alphaOf(borderColor)),
      });
    }
    return;
  }
  // pdf-lib 1.x has no borderRadius on drawRectangle, so a rounded box is an
  // SVG path. `drawSvgPath` interprets the path in SVG space (y grows
  // downwards) from the origin passed as `x`/`y`, so anchor it at the top-left
  // corner of the page and express the corners in top-down points.
  const origin = { x: 0, y: pageHeightPt };
  if (fillHex) {
    const color = colorFromHex(fillHex, ctx.colorSpace);
    ctx.page.drawSvgPath(roundedRectSvgPath(ctx, xPx, yPx, wPx, hPx, radius), { ...origin, color, ...opacity(alphaOf(color)) });
  }
  if (bw > 0 && !solid) {
    const color = colorFromHex(style.borderColor!, ctx.colorSpace);
    // drawSvgPath fills by the nonzero rule: the inner outline runs the
    // other way round and stays empty.
    let path = roundedRectSvgPath(ctx, xPx, yPx, wPx, hPx, radius);
    if (wPx > 2 * bw && hPx > 2 * bw) path += ` ${roundedRectSvgPath(ctx, xPx + bw, yPx + bw, wPx - 2 * bw, hPx - 2 * bw, radius - bw, true)}`;
    ctx.page.drawSvgPath(path, { ...origin, color, ...opacity(alphaOf(color)) });
  }
}

/** Paint a design text block (its box, then its lines: horizontal, bidi
 *  or vertical), tagged through `mark`. */
export function renderTextBlock(
  ctx: PageCtx,
  block: VDTDesignTextBlock,
  fontCache: FontCache,
  mark: SlotMark | undefined,
): void {
  if (block.box) {
    if (mark) tagArtifact(ctx, mark.artifact);
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
  // Negative tracking tightens the letters (EF-82).
  const tracked = block.letterSpacingPx !== undefined && block.letterSpacingPx !== 0;
  if (tracked) setTrackingPx(ctx, block.letterSpacingPx!);
  const outline: TextOutline | undefined = block.stroke && block.stroke.widthPx > 0
    ? { color: colorFromHex(block.stroke.color, ctx.colorSpace), widthPx: block.stroke.widthPx, hollow: block.stroke.hollow }
    : undefined;
  tagSlotText(ctx, mark, block);
  // A vertical block (`VDTDesignTextBlock.vertical`) paints its lines in
  // its own frame, turned a quarter turn clockwise about the box's top
  // right corner, set down the column.
  const vertical = block.vertical;
  const outerVertical = ctx.vertical;
  if (vertical) {
    pushFrame(ctx, quarterTurnMatrix({ direction: 'cw', originX: block.bbox.x + block.bbox.width, originY: block.bbox.y }, ctx.scale, ctx.pageHeightPt));
    ctx.vertical = { region: vertical.region, uprightDigits: vertical.uprightDigits, axes: vertical.centralBaselines };
    tagSlotText(ctx, mark, block);
  }
  const originX = vertical ? 0 : block.bbox.x;
  for (const line of block.lines) {
    if (!line.runs) {
      drawTextPx(ctx, line.text, originX + line.xOffset, line.baselineY, font, size, color, outline);
      continue;
    }
    // Inline marks, or a line with right-to-left text: each run in its own
    // font and direction, one after another in the line's paint order.
    let x = originX + line.xOffset;
    const order = line.order && line.order.length === line.runs.length ? line.order : undefined;
    for (let k = 0; k < line.runs.length; k++) {
      const run = line.runs[order ? order[k]! : k]!;
      const runFont = fontCache.get(run.fontString) ?? font;
      const runSize = parseFontString(run.fontString)?.sizePx ?? size;
      const y = line.baselineY + (run.baselineShift ?? 0);
      if (run.rtl) drawRightToLeftRun(ctx, run.text, x, y, runFont, runSize, color, outline);
      // A vertical line: the orientation its author gave the run.
      else drawTextPx(ctx, run.text, x, y, runFont, runSize, color, outline, undefined, segmentOrientation(run));
      x += run.width;
    }
  }
  if (vertical) {
    popFrame(ctx);
    if (outerVertical) ctx.vertical = outerVertical;
    else delete ctx.vertical;
  }
  if (tracked) setTrackingPx(ctx, 0);
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
 *  image map, with a neutral placeholder when the image is absent. `tag`
 *  routes the picture in an accessible render (a `Figure`, an artifact):
 *  it runs where the picture is painted, inside the turned frame of a
 *  vertical page, since entering a frame ends the open marked-content
 *  sequence. */
function renderImageBlock(
  ctx: PageCtx,
  block: VDTDesignImageBlock,
  images: ResourceImageMap | undefined,
  tag?: () => void,
): void {
  const { x, y, width, height } = block.bbox;
  const turned = !!ctx.vertical && width > 0 && height > 0;
  if (!turned) tag?.();
  if (width <= 0 || height <= 0) return;
  const embedded = images?.get(block.fileId);
  const draw = (bx: number, by: number, bw: number, bh: number): void => {
    if (embedded) {
      drawEmbeddedResource(ctx, embedded, bx, by, bw, bh);
    } else {
      ctx.onMissingImage?.(block.fileId);
      fillRectPx(ctx, bx, by, bw, bh, colorFromHex('#e8e8e8', ctx.colorSpace));
    }
  };
  if (!ctx.vertical) {
    draw(x, y, width, height);
    return;
  }
  // In a vertical page's flow the picture stands upright on the sheet, as
  // the canvas and the HTML draw it: turned back inside its box, whose
  // `width` runs down the sheet and whose `height` runs across it. A box
  // sized for that (`upright`) is filled; any other picture (a callout
  // icon) is fitted inside it, keeping its proportions.
  pushFrame(ctx, quarterTurnMatrix({ direction: 'ccw', originX: x, originY: y + height }, ctx.scale, ctx.pageHeightPt));
  tag?.();
  if (block.upright) draw(0, 0, height, width);
  else {
    const k = Math.min(height / width, width / height);
    draw((height - width * k) / 2, (width - height * k) / 2, width * k, height * k);
  }
  popFrame(ctx);
}

export function renderHeaderFooterSlot(
  ctx: PageCtx,
  slot: VDTDesignSlot,
  fontCache: FontCache,
  images?: ResourceImageMap,
  mark?: SlotMark,
): void {
  for (const block of slot.blocks) {
    if (block.kind === 'text') {
      renderTextBlock(ctx, block, fontCache, mark);
      continue;
    }
    if (block.kind === 'image' && block.altText && mark?.figure) {
      // A picture that is content: a `Figure` with its alternative text,
      // read after the slot's own text (a chapter's plate after its
      // heading).
      const hasText = !!mark.text && slot.blocks.some((b) => b.kind === 'text' && !b.artifact);
      const { x, y, width, height } = block.bbox;
      const figure = mark.figure(block.altText, figureLayout(ctx, x, y, width, height), hasText ? mark.text!() : undefined);
      renderImageBlock(ctx, block, images, () => tagContent(ctx, figure));
      continue;
    }
    if (block.kind === 'box' && block.clip) {
      // A callout stripe on a rounded frame, clipped to the frame's
      // outline. The clip's graphics state opens first: a marked-content
      // sequence must nest inside it, so the artifact opens after it.
      pushClipOutline(ctx, block.clip);
      if (mark) tagArtifact(ctx, mark.artifact);
      renderBoxBlock(ctx, block);
      popClip(ctx);
      continue;
    }
    if (block.kind === 'image') {
      renderImageBlock(ctx, block, images, mark ? () => tagArtifact(ctx, mark.artifact) : undefined);
      continue;
    }
    if (mark) tagArtifact(ctx, mark.artifact);
    if (block.kind === 'rule') renderRuleBlock(ctx, block);
    else renderBoxBlock(ctx, block);
  }
}