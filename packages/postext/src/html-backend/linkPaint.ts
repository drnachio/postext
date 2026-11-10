/**
 * Links in the HTML backend (`links.style`, #1402): set by
 * `renderToHtmlIndexed` for the output it writes (the HTML viewer, an EPUB's
 * fixed pages, a SCORM package's) while it writes one document. Each word
 * of a line is a box of its own, so a CSS underline on the link's `<a>`
 * would not reach them: a link's colour goes on its words, and its
 * underline is drawn from the layout's geometry (`VDTLine.linkUnderlines`),
 * as the canvas and the PDF draw it.
 */

import type { LinkStyleOutput, ResolvedLinksConfig } from '../types.js';
import type { VDTLine, VDTLineSegment } from '../vdt.js';
import { linkStyleFor } from '../defaults/structure/links.js';
import { styledLinkOf } from '../marks/linkUnderline.js';

interface LinkPaint {
  color?: string;
  underline: 'none' | 'solid' | 'dotted' | 'dashed';
  underlineColor?: string;
}

let current: LinkPaint | undefined;

/** Write links with the style `links` sets for `output` until the next
 *  call; returns the previous setting. */
export function setHtmlLinkPaint(links: ResolvedLinksConfig | undefined, output: LinkStyleOutput): LinkPaint | undefined {
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

/** Put back a setting {@link setHtmlLinkPaint} returned. */
export function restoreHtmlLinkPaint(previous: LinkPaint | undefined): void {
  current = previous;
}

/** Whether links get their own line here: an underline's piece under a
 *  link (`VDTLineMark.underLink`) then gives way to it. */
export function htmlLinkUnderlinePainted(): boolean {
  return current !== undefined && current.underline !== 'none';
}

/** The colour of a link segment, or undefined when it is not a link or
 *  the style sets no colour here. */
export function htmlLinkFill(seg: VDTLineSegment): string | undefined {
  return current?.color !== undefined && styledLinkOf(seg) !== undefined ? current.color : undefined;
}

const n = (v: number): string => v.toFixed(3);

/** The underlines of a line's links as markup inside its box ('' when the
 *  style draws none here), hanging from the line's text baseline as its
 *  marks do (`lineMarksHtml`). */
export function lineLinkUnderlinesHtml(line: VDTLine, color: string): string {
  const runs = line.linkUnderlines;
  const paint = current;
  if (!runs || runs.length === 0 || !paint || paint.underline === 'none') return '';
  const ink = paint.underlineColor ?? paint.color ?? color;
  const rules = runs.map((u) =>
    `<span style="position:absolute;left:${n(u.x)}px;top:${n(u.y - u.thickness / 2)}px;width:${n(u.length)}px;height:0;border-top:${n(u.thickness)}px ${paint.underline} ${ink};"></span>`).join('');
  return `<span aria-hidden="true" style="position:absolute;left:0;top:0;white-space:pre;">`
    + `<span style="display:inline-block;position:relative;width:0;height:0;vertical-align:baseline;">${rules}</span></span>`;
}
