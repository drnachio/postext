/**
 * Links in the PDF (`links.style`, #1402): the colour of a link's words and
 * the lines under them (`VDTLine.linkUnderlines`), when the style lists the
 * PDF among its outputs. The underlines are layout artifacts: the link's
 * words are read, the line under them is not.
 */

import { type Color, LineCapStyle, lineTo, moveTo, popGraphicsState, pushGraphicsState, setDashPattern, setLineCap, setLineWidth, setStrokingColor, stroke } from 'pdf-lib';
import { linkStyleFor, styledLinkOf, type VDTDocument, type VDTLine, type VDTLineSegment } from 'postext';
import { type PageCtx, type PdfLinkPaint, alphaOf, alphaStateOp, colorFromHex } from '../primitives.js';
import { tagArtifact } from '../structure/tagging.js';

/** The style links take in a document's PDF, or undefined. */
export function pdfLinkPaint(doc: VDTDocument): PdfLinkPaint | undefined {
  const style = linkStyleFor(doc.config?.links, 'pdf');
  if (!style) return undefined;
  return {
    ...(style.color ? { color: style.color.hex } : {}),
    underline: style.underline,
    ...(style.underlineColor ? { underlineColor: style.underlineColor.hex } : {}),
  };
}

/** The colour (hex) a link segment is painted in, or undefined when it is
 *  not a link or the style sets no colour in the PDF. */
export function linkFillHex(ctx: PageCtx, seg: VDTLineSegment): string | undefined {
  const color = ctx.links?.color;
  return color !== undefined && styledLinkOf(seg) !== undefined ? color : undefined;
}

/** Draw the underlines of a line's links in the underline colour, else the
 *  link's, else `ink` (the text's). */
export function paintLinkUnderlines(ctx: PageCtx, line: VDTLine, ink: Color): void {
  const runs = line.linkUnderlines;
  const paint = ctx.links;
  if (!runs || runs.length === 0 || !paint || paint.underline === 'none') return;
  const hex = paint.underlineColor ?? paint.color;
  const color = hex ? colorFromHex(hex, ctx.colorSpace) : ink;
  const alpha = alphaOf(color);
  const gs = alpha < 1 ? alphaStateOp(ctx, 1, alpha) : null;
  const { scale, pageHeightPt } = ctx;
  tagArtifact(ctx, { type: 'Layout' });
  for (const u of runs) {
    const w = u.thickness;
    const dash = paint.underline === 'dotted' ? [0.01 * scale, w * 2.2 * scale] : paint.underline === 'dashed' ? [w * 3 * scale, w * 2 * scale] : undefined;
    const x = (line.bbox.x + u.x) * scale;
    const y = pageHeightPt - (line.baseline + u.y) * scale;
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...(gs ? [gs] : []),
      setStrokingColor(color),
      setLineWidth(Math.max(0.01, w * scale)),
      ...(dash ? [setDashPattern(dash, 0)] : []),
      ...(paint.underline === 'dotted' ? [setLineCap(LineCapStyle.Round)] : []),
      moveTo(x, y),
      lineTo(x + u.length * scale, y),
      stroke(),
      popGraphicsState(),
    );
  }
}
