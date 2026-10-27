// Video overlays, missing-image placeholders and rounded outline paths.
import type { VDTResourceVideo, RoundedOutline } from '../../vdt.js';
import { playMarkTriangle, qrModuleRuns } from '../../pipeline/resources/videoOverlay.js';
import { mirroredPaintActive } from '../mirrorFrame.js';
import { saveContext, restoreContext } from '../contextState.js';
import { fillContextText } from '../contextText.js';

/** The play mark and the QR code of a video's poster (#454), over the body
 *  at (`bx`, `by`). The positions are physical and the code must not read
 *  mirrored: on a mirrored page they are drawn through a reflection about
 *  the body, which undoes the page's. */
export function paintVideoOverlays(
  ctx: CanvasRenderingContext2D,
  video: VDTResourceVideo,
  bx: number,
  by: number,
  bw: number,
): void {
  if (!video.playMark && !video.qr) return;
  saveContext(ctx);
  if (mirroredPaintActive()) {
    ctx.translate(2 * bx + bw, 0);
    ctx.scale(-1, 1);
  }
  const mark = video.playMark;
  if (mark) {
    const { x, y, width: w, height: h } = mark.rect;
    const ox = bx + x;
    const oy = by + y;
    const tri = playMarkTriangle(mark);
    const trianglePath = (): void => {
      ctx.beginPath();
      tri.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(ox + px, oy + py) : ctx.lineTo(ox + px, oy + py)));
      ctx.closePath();
    };
    if (mark.shape === 'triangle') {
      trianglePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = h * 0.08;
      ctx.globalAlpha = mark.backgroundOpacity;
      ctx.strokeStyle = mark.background;
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      if (mark.shape === 'circle') ctx.ellipse(ox + w / 2, oy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else roundedOutlinePath(ctx, { x: ox, y: oy, width: w, height: h, radii: [h * 0.24, h * 0.24, h * 0.24, h * 0.24] });
      ctx.globalAlpha = mark.backgroundOpacity;
      ctx.fillStyle = mark.background;
      ctx.fill();
      ctx.globalAlpha = 1;
      trianglePath();
    }
    ctx.fillStyle = mark.color;
    ctx.fill();
  }
  const qr = video.qr;
  if (qr) {
    const { x, y, width: w, height: h } = qr.rect;
    const ox = bx + x;
    const oy = by + y;
    ctx.fillStyle = qr.background;
    if (qr.radius > 0) {
      roundedOutlinePath(ctx, { x: ox, y: oy, width: w, height: h, radii: [qr.radius, qr.radius, qr.radius, qr.radius] });
      ctx.fill();
    } else {
      ctx.fillRect(ox, oy, w, h);
    }
    ctx.fillStyle = qr.color;
    ctx.beginPath();
    for (const run of qrModuleRuns(qr)) ctx.rect(ox + run.x, oy + run.y, run.w, run.h);
    ctx.fill();
  }
  restoreContext(ctx);
}

export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
): void {
  saveContext(ctx);
  ctx.fillStyle = 'rgba(160, 160, 160, 0.12)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(160, 160, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = 'rgba(120, 120, 120, 0.8)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(10, Math.min(16, h * 0.1))}px sans-serif`;
  fillContextText(ctx, label, x + w / 2, y + h / 2);
  restoreContext(ctx);
}

/** Trace a rounded outline (per-corner radii) as the current path. */
export function roundedOutlinePath(ctx: CanvasRenderingContext2D, o: RoundedOutline): void {
  const { x, y, width: w, height: h } = o;
  const [tl, tr, br, bl] = o.radii;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}
