// What is drawn over a figure: the placeholder of a missing picture,
// video overlays and figure labels (#1276: split out of renderResourceBlock.ts).
import type { Color } from 'pdf-lib';
import { type ResolvedResourceBlock, type VDTResourceVideo, playMarkTriangle, qrModuleRuns, type VDTBlock, figureLabelLeaderPaths, unmirrorLabelLayout, figureLabelMatrix, labelPlateBox } from 'postext';
import { roundedRectSvgPath, drawRoundedBox } from '../../page/headerFooter.js';
import { renderPathBlock } from '../../vector/pathBlock.js';
import { LinkRegistry, refTarget } from '../../structure/links.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, colorFromHex, fillRectPx, counterFlipPx, pushFrame, popFrame } from '../../primitives.js';
import { tagArtifact } from '../../structure/tagging.js';
import { sheetMatrixToPdf } from '../../page/comic.js';
import type { StructureFlow } from '../../structure/structureFlow.js';
import { type PaintFonts, paintLine } from './lines.js';

export function drawPlaceholder(ctx: PageCtx, rb: ResolvedResourceBlock, x: number, y: number): void {
  // A video with no poster: a dark frame its overlays read on (#454).
  const fill = colorFromHex(rb.kind === 'video' ? '#1f1f1f' : '#eeeeee', ctx.colorSpace);
  fillRectPx(ctx, x, y, rb.bodyRect.width, rb.bodyRect.height, fill);
}

/** The play mark and the QR code of a video's poster (#454) as vectors,
 *  over the body at (`bx`, `by`) px. On a mirrored page they are turned
 *  back about the body, so they sit where they are printed in the other
 *  outputs and the code reads. */
export function drawVideoOverlays(ctx: PageCtx, video: VDTResourceVideo, bx: number, by: number, bw: number): void {
  if (!video.playMark && !video.qr) return;
  const { scale, pageHeightPt } = ctx;
  // `drawSvgPath` reads its path top-down from this origin, in points.
  const origin = { x: 0, y: pageHeightPt };
  const pt = (v: number): string => String(Math.round(v * scale * 1000) / 1000);
  const alpha = (a: number) => (a < 1 ? { opacity: a, borderOpacity: a } : {});
  counterFlipPx(ctx, bx, bw, () => {
    const mark = video.playMark;
    if (mark) {
      const { x, y, width: w, height: h } = mark.rect;
      const ox = bx + x;
      const oy = by + y;
      const tri = playMarkTriangle(mark)
        .map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${pt(ox + px)} ${pt(oy + py)}`)
        .join(' ') + ' Z';
      const color = colorFromHex(mark.color, ctx.colorSpace);
      const background = colorFromHex(mark.background, ctx.colorSpace);
      if (mark.shape === 'triangle') {
        ctx.page.drawSvgPath(tri, {
          ...origin, color, borderColor: background, borderWidth: h * 0.08 * scale,
          ...(mark.backgroundOpacity < 1 ? { borderOpacity: mark.backgroundOpacity } : {}),
        });
      } else {
        if (mark.shape === 'circle') {
          ctx.page.drawEllipse({
            x: (ox + w / 2) * scale, y: pageHeightPt - (oy + h / 2) * scale,
            xScale: (w / 2) * scale, yScale: (h / 2) * scale,
            color: background, ...alpha(mark.backgroundOpacity),
          });
        } else {
          ctx.page.drawSvgPath(roundedRectSvgPath(ctx, ox, oy, w, h, h * 0.24), { ...origin, color: background, ...alpha(mark.backgroundOpacity) });
        }
        ctx.page.drawSvgPath(tri, { ...origin, color });
      }
    }
    const qr = video.qr;
    if (qr) {
      const { x, y, width: w, height: h } = qr.rect;
      const ox = bx + x;
      const oy = by + y;
      const background = colorFromHex(qr.background, ctx.colorSpace);
      if (qr.radius > 0) ctx.page.drawSvgPath(roundedRectSvgPath(ctx, ox, oy, w, h, qr.radius), { ...origin, color: background });
      else fillRectPx(ctx, ox, oy, w, h, background);
      // One path for every dark module: no seams between them.
      const d = qrModuleRuns(qr)
        .map((r) => `M ${pt(ox + r.x)} ${pt(oy + r.y)} h ${pt(r.w)} v ${pt(r.h)} h ${pt(-r.w)} Z`)
        .join(' ');
      if (d) ctx.page.drawSvgPath(d, { ...origin, color: colorFromHex(qr.color, ctx.colorSpace) });
    }
  });
}

/**
 * The labels of a `:::figure` drawn on its picture (#860), its body's
 * top-left corner at (`bx`, `by`): each one through its matrix, its plate
 * and halo as layout artifacts, then its lines. In a tagged render the
 * labels are read after the picture, in the order written: a `Div` beside
 * the figure holding one `P` per label (`figureLabelsElem`).
 */
export function paintFigureLabels(
  ctx: PageCtx,
  block: VDTBlock,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
  fontCache: FontCache,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  structure: StructureFlow | undefined,
): void {
  const drawn = (rb.labels ?? []).filter((l) => l.layout);
  if (drawn.length === 0) return;
  // Their leaders first (#1057), under every label: vector lines, a layout
  // artifact, in the frame the labels' geometry is in.
  for (const path of figureLabelLeaderPaths(rb, bx, by)) {
    tagArtifact(ctx, { type: 'Layout' });
    renderPathBlock(ctx, path);
  }
  const group = structure ? structure.figureLabelsElem(block) : undefined;
  for (const label of drawn) {
    let layout = label.layout!;
    // A vertical label on a mirrored page (#955) is painted from its
    // unmirrored layout, in the frame reflected back about the body: the
    // page's mirror then puts it where its anchor says, its cells running
    // down the column and standing upright.
    const unmirror = layout.mirrored === true && ctx.mirror === true && !rb.rotation;
    if (unmirror) {
      layout = unmirrorLabelLayout(layout, rb.bodyRect.width);
      pushFrame(ctx, sheetMatrixToPdf([-1, 0, 0, 1, 2 * bx + rb.bodyRect.width, 0], ctx.scale, ctx.pageHeightPt));
      ctx.mirror = false;
    }
    const m = figureLabelMatrix(layout, bx, by);
    pushFrame(ctx, sheetMatrixToPdf(m, ctx.scale, ctx.pageHeightPt));
    // A vertical label (#902): the matrix turned its frame a quarter turn,
    // and the vertical painter stands each character upright in its cell.
    const outerVertical = ctx.vertical;
    if (layout.vertical) {
      ctx.vertical = { region: layout.vertical.region, uprightDigits: layout.vertical.uprightDigits, axes: layout.vertical.centralBaselines };
    } else delete ctx.vertical;
    try {
      const fonts: PaintFonts = { normal: layout.fontString, bold: layout.boldFontString, italic: layout.italicFontString, boldItalic: layout.boldItalicFontString };
      const plate = layout.background;
      if (plate) {
        tagArtifact(ctx, { type: 'Layout' });
        const r = plate.rect;
        // A plate with an outline or round corners (#1058), as a design box.
        if (plate.border || plate.radiusPx) drawRoundedBox(ctx, r.x, r.y, r.width, r.height, labelPlateBox(plate));
        else if (plate.color) fillRectPx(ctx, r.x, r.y, r.width, r.height, colorFromHex(plate.color, ctx.colorSpace));
      }
      if (layout.halo && layout.halo.widthPx > 0) {
        // The glyphs stroked hollow under the text: painted once more, an
        // artifact, so the words are read once.
        const halo = colorFromHex(layout.halo.color, ctx.colorSpace);
        tagArtifact(ctx, { type: 'Layout' });
        ctx.textOutline = { color: halo, widthPx: 2 * layout.halo.widthPx, hollow: true };
        try {
          for (const line of layout.lines) paintLine(ctx, line.highlights ? { ...line, highlights: undefined } : line, fonts, fontCache, halo, halo, undefined, () => undefined, halo);
        } finally {
          delete ctx.textOutline;
        }
      }
      // A legend (#1058) is read as a list, one item per row.
      const list = layout.legend ? group?.child('L', { attributes: [{ owner: 'List', entries: { ListNumbering: 'None' } }] }) : undefined;
      const elem = list ? undefined : group?.child('P');
      const color = colorFromHex(layout.color, ctx.colorSpace);
      if (!elem && !list && structure) tagArtifact(ctx, { type: 'Layout' });
      for (const line of layout.lines) paintLine(ctx, line, fonts, fontCache, color, linkColor, linkRegistry, refTarget, color, list ? list.child('LI').child('LBody') : elem);
    } finally {
      popFrame(ctx);
      if (unmirror) {
        popFrame(ctx);
        ctx.mirror = true;
      }
      if (outerVertical) ctx.vertical = outerVertical;
      else delete ctx.vertical;
    }
  }
}
