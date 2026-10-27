// Figure labels and the resource block entry point.
import { paintScoreBody } from '../scoreRender.js';
import type { ResolvedResourceBlock, VDTFigureLabelLayout, VDTBlock } from '../../vdt.js';
import { setVerticalPaint } from '../verticalText.js';
import { uncroppedPictureBox } from '../../pipeline/resources/safeArea.js';
import { figureLabelLeaderPaths, unmirrorLabelLayout, figureLabelMatrix, labelPlateBox } from '../../composed/labels.js';
import { renderPathBlock, drawBoxBackground } from '../headerFooter.js';
import { mirroredPaintActive, paintUnmirrored } from '../mirrorFrame.js';
import { saveContext, restoreContext } from '../contextState.js';
import { strokeContextText } from '../contextText.js';
import { drawResourceImage } from './images.js';
import { drawPlaceholder, paintVideoOverlays } from './overlays.js';
import { renderTable } from './table.js';
import { paintLine } from './text.js';

/** A context that strokes what the painters fill (`fillText` →
 *  `strokeText`) in one colour: a label's halo painted by the same line
 *  painter as its text. */
function haloContext(ctx: CanvasRenderingContext2D, color: string, widthPx: number): CanvasRenderingContext2D {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2 * widthPx;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  return new Proxy(ctx, {
    get(target, key) {
      if (key === 'fillText') return (text: string, x: number, y: number) => strokeContextText(target, text, x, y);
      const value = (target as unknown as Record<PropertyKey, unknown>)[key];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
    set(target, key, value) {
      // The painters' colours give way to the halo's.
      if (key === 'fillStyle' || key === 'strokeStyle') return true;
      (target as unknown as Record<PropertyKey, unknown>)[key] = value;
      return true;
    },
  });
}

/** The labels of a `:::figure` drawn on its picture (#860), its body's
 *  top-left corner at (`bx`, `by`): each one through its matrix, its
 *  plate, its halo, then its lines. */
export function paintFigureLabels(ctx: CanvasRenderingContext2D, rb: ResolvedResourceBlock, bx: number, by: number): void {
  // Their leaders first (#1057), under every label, in the frame the
  // labels' geometry is in (a mirrored page's leader is mirrored with it).
  for (const path of figureLabelLeaderPaths(rb, bx, by)) renderPathBlock(ctx, path);
  for (const label of rb.labels ?? []) {
    const layout = label.layout;
    if (!layout) continue;
    // A vertical label on a mirrored page (#955) is painted from its
    // unmirrored layout, in the frame reflected back about the body.
    if (layout.mirrored && mirroredPaintActive() && !rb.rotation) {
      paintUnmirrored(ctx, bx, rb.bodyRect.width, () => paintFigureLabel(ctx, rb, unmirrorLabelLayout(layout, rb.bodyRect.width), bx, by));
    } else paintFigureLabel(ctx, rb, layout, bx, by);
  }
}

function paintFigureLabel(ctx: CanvasRenderingContext2D, rb: ResolvedResourceBlock, layout: VDTFigureLabelLayout, bx: number, by: number): void {
  const m = figureLabelMatrix(layout, bx, by);
  saveContext(ctx);
  ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  ctx.textAlign = 'left';
  const plate = layout.background;
  if (plate && (plate.border || plate.radiusPx)) {
    // A plate with an outline or round corners (#1058), as a design box.
    const r = plate.rect;
    drawBoxBackground(ctx, r.x, r.y, r.width, r.height, labelPlateBox(plate));
  } else if (plate?.color) {
    const r = plate.rect;
    ctx.fillStyle = plate.color;
    ctx.fillRect(r.x, r.y, r.width, r.height);
  }
  const { fontString: f, boldFontString: b, italicFontString: i, boldItalicFontString: bi, color } = layout;
  // A vertical label (#902) is painted as a vertical page's flow is: its
  // frame was turned a quarter turn by the matrix, and the vertical
  // painter stands each character upright in its cell.
  const vertical = layout.vertical;
  const outerPaint = vertical ? setVerticalPaint({ region: vertical.region, uprightDigits: vertical.uprightDigits, axes: vertical.centralBaselines }) : null;
  if (layout.halo && layout.halo.widthPx > 0) {
    saveContext(ctx);
    const halo = haloContext(ctx, layout.halo.color, layout.halo.widthPx);
    for (const line of layout.lines) paintLine(halo, line.highlights ? { ...line, highlights: undefined } : line, f, b, i, bi, layout.halo.color, layout.halo.color);
    restoreContext(ctx);
  }
  for (const line of layout.lines) paintLine(ctx, line, f, b, i, bi, color, rb.linkColor);
  if (vertical) setVerticalPaint(outerPaint);
  restoreContext(ctx);
}

export function renderResourceBlock(
  ctx: CanvasRenderingContext2D,
  block: VDTBlock,
  /** The document's single ink (`documentInkHex`), null when off. */
  inkHex: string | null = null,
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  // A rotated block: its geometry is in the upright frame, painted through
  // the quarter-turn transform that lands the frame on the page.
  const rot = rb.rotation;
  // Inside a turned block the text reads along the block's own frame: on
  // a vertical page that is the upright figure, set horizontally.
  const outerVertical = rot ? setVerticalPaint(null) : null;
  if (rot) {
    saveContext(ctx);
    ctx.translate(rot.originX, rot.originY);
    ctx.rotate(rot.direction === 'ccw' ? -Math.PI / 2 : Math.PI / 2);
  }
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;

  if (rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video') {
    // A picture cropped within its safe area (#442): the whole picture is
    // drawn at its uncropped box, clipped to the body. A video draws its
    // poster the same way (#454).
    const src = rb.bodySource;
    let full = src ? uncroppedPictureBox(bx, by, bw, bh, src) : null;
    // On a mirrored page `drawImage` turns the picture back about its own
    // box: reflect that box about the body so the same part shows.
    if (full && mirroredPaintActive()) full = { ...full, x: 2 * bx + bw - full.x - full.width };
    if (full) {
      saveContext(ctx);
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
    }
    const drawn = rb.fileId
      ? drawResourceImage(ctx, rb.fileId, full?.x ?? bx, full?.y ?? by, full?.width ?? bw, full?.height ?? bh, { inkHex, svg: rb.kind === 'svg' }, rb.resource.id)
      : false;
    if (full) restoreContext(ctx);
    if (!drawn && rb.kind === 'video') {
      // No poster (or not loaded yet): a dark frame the overlays read on.
      saveContext(ctx);
      ctx.fillStyle = '#1f1f1f';
      ctx.fillRect(bx, by, bw, bh);
      restoreContext(ctx);
    } else if (!drawn) {
      drawPlaceholder(ctx, bx, by, bw, bh, rb.kind === 'svg' ? 'SVG' : 'Image');
    }
    if (rb.video) paintVideoOverlays(ctx, rb.video, bx, by, bw);
    // A figure's labels, over the picture (#860).
    if (rb.labels) paintFigureLabels(ctx, rb, bx, by);
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, bx, by, inkHex);
  } else if (rb.kind === 'score') {
    if (rb.score && rb.score.systems.length > 0) paintScoreBody(ctx, rb.score, bx, by, bw);
    else drawPlaceholder(ctx, bx, by, bw, bh, 'Score');
  }

  // Caption bar (behind the caption lines), then caption + note lines — all
  // already positioned in absolute page coords during placement.
  saveContext(ctx);
  if (rb.captionBar) {
    const { rect, background } = rb.captionBar;
    ctx.fillStyle = background;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  ctx.textAlign = 'left';
  for (const line of rb.captionLines) {
    paintLine(
      ctx, line,
      rb.captionFontString, rb.captionBoldFontString, rb.captionItalicFontString, rb.captionBoldItalicFontString,
      rb.captionColor, rb.linkColor, rb.captionLabelColor,
    );
  }
  // Note, or the "continued" marker of a table slice that goes on (same
  // typeface and colour, right-aligned at layout time).
  for (const line of [...rb.noteLines, ...(rb.continuesLines ?? [])]) {
    paintLine(
      ctx, line,
      rb.noteFontString, rb.noteBoldFontString, rb.noteItalicFontString, rb.noteBoldItalicFontString,
      rb.noteColor, rb.linkColor,
    );
  }
  restoreContext(ctx);
  if (rot) {
    restoreContext(ctx);
    setVerticalPaint(outerVertical);
  }
}
