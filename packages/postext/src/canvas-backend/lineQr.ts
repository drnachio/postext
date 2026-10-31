// A link note's QR code (#1302) on the canvas.
import type { VDTLine, VDTLineQr } from '../vdt.js';
import { lineQrBox, lineQrRuns } from '../paint/lineQr.js';
import { mirroredPaintActive } from './mirrorFrame.js';
import { saveContext, restoreContext } from './contextState.js';

/** The code of `line`, in its colour or the text's (`color`). On a
 *  mirrored page it is drawn through a reflection about its own box, which
 *  undoes the page's: a code must never read mirrored. */
export function paintLineQr(ctx: CanvasRenderingContext2D, line: VDTLine & { qr: VDTLineQr }, color: string): void {
  const { x, y, side } = lineQrBox(line);
  saveContext(ctx);
  if (mirroredPaintActive()) {
    ctx.translate(2 * x + side, 0);
    ctx.scale(-1, 1);
  }
  ctx.fillStyle = line.qr.color ?? color;
  ctx.beginPath();
  for (const run of lineQrRuns(line.qr)) ctx.rect(x + run.x, y + run.y, run.w, run.h);
  ctx.fill();
  restoreContext(ctx);
}
