// A link note's QR code (#1302, `VDTLine.qr`): where it is printed and the
// rects of its dark modules, read by every renderer.
import type { VDTLine, VDTLineQr } from '../vdt.js';
import { qrModuleRuns } from '../pipeline/resources/videoOverlay.js';

/** The code's box on the page: its line's top-left corner plus its offset. */
export function lineQrBox(line: VDTLine & { qr: VDTLineQr }): { x: number; y: number; side: number } {
  return { x: line.bbox.x + line.qr.dx, y: line.bbox.y + line.qr.dy, side: line.qr.side };
}

/** The dark modules as horizontal runs, relative to the code's box. */
export function lineQrRuns(qr: VDTLineQr): Array<{ x: number; y: number; w: number; h: number }> {
  return qrModuleRuns(qr);
}
