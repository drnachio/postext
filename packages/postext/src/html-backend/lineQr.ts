// A link note's QR code (#1302) in the HTML output: an SVG at its place,
// the link it prints. In a mirrored flow the stylesheet turns every SVG
// back about its own box, so the code reads.
import type { VDTLine, VDTLineQr } from '../vdt.js';
import { lineQrBox, lineQrRuns } from '../paint/lineQr.js';
import { esc } from './textRuns.js';

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/** The code of `line` in its colour or the text's (`color`), linking to the
 *  address it opens. */
export function lineQrHtml(line: VDTLine & { qr: VDTLineQr }, color: string): string {
  const { x, y, side } = lineQrBox(line);
  const d = lineQrRuns(line.qr).map((r) => `M${n(r.x)} ${n(r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z`).join('');
  const href = esc(line.qr.text);
  return (
    `<a class="pt-qr" href="${href}" rel="noopener noreferrer" style="position:absolute;left:${n(x)}px;top:${n(y)}px;width:${n(side)}px;height:${n(side)}px;display:block;">` +
    `<svg role="img" aria-label="${href}" width="${n(side)}" height="${n(side)}" viewBox="0 0 ${n(side)} ${n(side)}" style="display:block;">` +
    `<path d="${d}" fill="${line.qr.color ?? color}" shape-rendering="crispEdges"/></svg></a>`
  );
}
