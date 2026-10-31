// A link note's QR code (#1302) in the PDF: vector modules, a link to the
// address it opens and, in a tagged render, a figure read as that address.
import { type VDTLine, type VDTLineQr, qrModuleRuns } from 'postext';
import { type PageCtx, colorFromHex, counterFlipPx } from '../../primitives.js';
import { LinkRegistry, pdfUri } from '../../structure/links.js';
import { type StructElem, tagContent, tagArtifact } from '../../structure/tagging.js';
import { sheetRect } from './segments.js';

/** The code of `line` in its colour or the block's (`blockColor`). On a
 *  mirrored page it is turned back about its own box: a code must never
 *  read mirrored. The marked content open before it is open again after. */
export function paintLineQr(
  ctx: PageCtx,
  line: VDTLine & { qr: VDTLineQr },
  blockColor: string,
  linkRegistry: LinkRegistry | undefined,
  elem: StructElem | undefined,
): void {
  const x = line.bbox.x + line.qr.dx;
  const y = line.bbox.y + line.qr.dy;
  const side = line.qr.side;
  const { scale, pageHeightPt } = ctx;
  const pt = (v: number): string => String(Math.round(v * scale * 1000) / 1000);
  const open = ctx.tags?.current ?? null;
  const link = elem?.child('Link');
  const figure = link?.child('Figure', { alt: line.qr.text });
  if (figure) tagContent(ctx, figure);
  else tagArtifact(ctx, { type: 'Layout' });
  counterFlipPx(ctx, x, side, () => {
    const d = qrModuleRuns(line.qr)
      .map((r) => `M ${pt(x + r.x)} ${pt(y + r.y)} h ${pt(r.w)} v ${pt(r.h)} h ${pt(-r.w)} Z`)
      .join(' ');
    if (d) ctx.page.drawSvgPath(d, { x: 0, y: pageHeightPt, color: colorFromHex(line.qr.color ?? blockColor, ctx.colorSpace) });
  });
  ctx.tags?.resume(open);
  const uri = pdfUri(line.qr.text);
  if (uri && linkRegistry) {
    const rect = sheetRect(ctx, [x * scale, pageHeightPt - (y + side) * scale, (x + side) * scale, pageHeightPt - y * scale]);
    linkRegistry.addUriLink(ctx.page, rect, uri, link ? { elem: link, contents: line.qr.text } : undefined);
  }
}
