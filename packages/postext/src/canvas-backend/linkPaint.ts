/**
 * The link style a page is painted with (`links.style`, #1402): set by
 * `renderPageToCanvas` for the output it paints (the Canvas preview or the
 * Folio book) while it paints one page, read by the text painters. Painting
 * a page is synchronous, so one page's style never reaches another's.
 */

import type { LinkStyleOutput, ResolvedLinksConfig } from '../types.js';
import type { VDTLine, VDTLineSegment } from '../vdt.js';
import { linkStyleFor } from '../defaults/structure/links.js';
import { styledLinkOf } from '../marks/linkUnderline.js';
import { chipUnderlineDash } from './chip.js';
import { restoreContext, saveContext } from './contextState.js';

interface LinkPaint {
  color?: string;
  underline: 'none' | 'solid' | 'dotted' | 'dashed';
  underlineColor?: string;
}

let current: LinkPaint | undefined;

/** Paint links with the style `links` sets for `output` (none: as plain
 *  text) until the next call; returns the previous setting. */
export function setLinkPaint(links: ResolvedLinksConfig | undefined, output: LinkStyleOutput): LinkPaint | undefined {
  const previous = current;
  const style = linkStyleFor(links, output);
  current = style
    ? {
      ...(style.color ? { color: style.color.hex } : {}),
      underline: style.underline,
      ...(style.underlineColor ? { underlineColor: style.underlineColor.hex } : {}),
    }
    : undefined;
  return previous;
}

/** Put back a setting {@link setLinkPaint} returned. */
export function restoreLinkPaint(previous: LinkPaint | undefined): void {
  current = previous;
}

/** The colour a link segment is painted in, or undefined when it is not a
 *  link or the style sets no colour here. */
export function linkFill(seg: VDTLineSegment): string | undefined {
  return current?.color !== undefined && styledLinkOf(seg) !== undefined ? current.color : undefined;
}

/** Draw the underlines of a line's links (`VDTLine.linkUnderlines`) when
 *  the style underlines them here: in the underline colour, else the
 *  link's, else `color` (the text's). */
export function paintLinkUnderlines(ctx: CanvasRenderingContext2D, line: VDTLine, color: string): void {
  const runs = line.linkUnderlines;
  const paint = current;
  if (!runs || runs.length === 0 || !paint || paint.underline === 'none') return;
  saveContext(ctx);
  ctx.strokeStyle = paint.underlineColor ?? paint.color ?? color;
  for (const u of runs) {
    const y = line.baseline + u.y;
    const x = line.bbox.x + u.x;
    ctx.lineWidth = u.thickness;
    const dash = chipUnderlineDash(paint.underline, u.thickness);
    ctx.setLineDash(dash ?? []);
    ctx.lineCap = paint.underline === 'dotted' ? 'round' : 'butt';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + u.length, y);
    ctx.stroke();
  }
  restoreContext(ctx);
}
