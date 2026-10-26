/**
 * Inline symbols in the PDF (`:icon[alt]{…}`, #1058): a `'swatch'` segment
 * that carries one is painted as its picture (from the page's embedded
 * pictures), its glyph or its line sample, where the canvas paints it. In
 * a tagged render a symbol with alternative text is a `Span` whose
 * `/ActualText` is `[alt]`, read in its place among the words; one without
 * is an artifact.
 */

import { LineCapStyle, type Color, type PDFFont } from 'pdf-lib';
import type { VDTLineSegment } from 'postext';
import { hasSwatchShape, iconLineDash, inlineIconBox, swatchGeometry } from 'postext';
import { parseFontString } from '../fontString.js';
import type { FontCache } from '../fontCache.js';
import { type PageCtx, alphaOf, colorFromHex, counterFlipPx, drawShapedSwatchPx, drawSwatchPx, drawTextPx } from './primitives.js';
import { drawEmbeddedResource } from './renderResourceBlock.js';
import { tagArtifact, tagContent, type StructElem } from './tagging.js';

/** A `'swatch'` segment at `x` on `baseline`: its inline symbol when it
 *  carries one, else the colour swatch (tagged in `elem`). `ink` is the
 *  text's colour; `fallbackFont` sets a glyph whose face is not embedded. */
export function paintSwatchSegmentPdf(
  ctx: PageCtx,
  seg: Pick<VDTLineSegment, 'swatch' | 'width' | 'rtl'>,
  x: number,
  baseline: number,
  ink: Color,
  fontCache: FontCache,
  fallbackFont: PDFFont,
  elem: StructElem | undefined,
): void {
  const icon = seg.swatch?.icon;
  if (!icon) {
    tagContent(ctx, elem);
    const swatch = seg.swatch;
    // A swatch with a shape of its own (#1104): the canvas's square.
    if (swatch && hasSwatchShape(swatch)) drawShapedSwatchPx(ctx, swatchGeometry(swatch, x, baseline, seg.width, seg.rtl === true), swatch.color, swatch.borderColor ? colorFromHex(swatch.borderColor, ctx.colorSpace) : ink);
    else drawSwatchPx(ctx, x, baseline, seg.width, swatch?.color, ink);
    return;
  }
  if (ctx.tags) {
    if (elem && icon.alt) tagContent(ctx, elem.child('Span', { actualText: `[${icon.alt}]` }));
    else tagArtifact(ctx, { type: 'Layout' });
  }
  const box = inlineIconBox(icon, x, baseline);
  const color = icon.color ? colorFromHex(icon.color, ctx.colorSpace) : ink;
  if (icon.kind === 'glyph' && icon.glyph && icon.fontString) {
    const font = fontCache.get(icon.fontString) ?? fallbackFont;
    const size = parseFontString(icon.fontString)?.sizePx ?? box.height;
    drawTextPx(ctx, icon.glyph, box.x, box.baseline, font, size, color, undefined, '');
    return;
  }
  const { scale, pageHeightPt } = ctx;
  if (icon.kind === 'line') {
    const dash = iconLineDash(icon);
    const alpha = alphaOf(color);
    ctx.page.drawLine({
      start: { x: box.x * scale, y: pageHeightPt - box.strokeY * scale },
      end: { x: (box.x + box.width) * scale, y: pageHeightPt - box.strokeY * scale },
      color,
      thickness: Math.max(0.01, (icon.strokePx ?? 1) * scale),
      ...(dash ? { dashArray: dash.map((d) => d * scale) } : {}),
      ...(icon.line === 'dotted' ? { lineCap: LineCapStyle.Round } : {}),
      ...(alpha < 1 ? { opacity: alpha } : {}),
    });
    return;
  }
  const embedded = icon.fileId ? ctx.images?.get(icon.fileId) : undefined;
  if (embedded) {
    counterFlipPx(ctx, box.x, box.width, () => drawEmbeddedResource(ctx, embedded, box.x, box.y, box.width, box.height, icon.color));
    return;
  }
  if (icon.fileId) ctx.onMissingImage?.(icon.fileId, icon.resourceId);
  const stroke = Math.max(0.5, box.height * 0.06);
  ctx.page.drawRectangle({
    x: (box.x + stroke / 2) * scale,
    y: pageHeightPt - (box.y + box.height - stroke / 2) * scale,
    width: (box.width - stroke) * scale,
    height: (box.height - stroke) * scale,
    borderColor: ink,
    borderWidth: Math.max(0.01, stroke * scale),
  });
}
