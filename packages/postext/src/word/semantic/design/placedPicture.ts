// A design's pictures in Word (#1444). A picture is set inline, as wide
// as the design draws it (the text area, or the band it is printed on, at
// most) and as tall as the page leaves it once the pieces after it have
// their room. A picture that fills the page (a cover painting under its
// title slip, an endpaper pattern, a full-bleed photograph under a
// headline) is drawn behind the text instead, at its place and size on
// the page, in a paragraph of its own that holds nothing else: Word, Word
// for the web, Google Docs and LibreOffice all draw a page-anchored
// picture behind text.

import type { WriterContext } from '../context.js';
import { pictureRun } from '../media/figures.js';
import { STYLE } from '../styles.js';
import { blockSdt, paragraph, type ParaProps } from '../wml.js';
import type { Box } from './geometry.js';

/** Whether a picture's box fills the page (`page`, px): about its whole
 *  width and most of its height. */
export function fillsPage(box: Box, page: Box): boolean {
  return box.width >= page.width * 0.9 && box.height >= page.height * 0.85;
}

/** A design's picture inline, `maxW` px wide and `maxH` px tall at most. */
export function inlinePicture(ctx: WriterContext, id: string, box: Box, first: ParaProps | undefined, keepNext: boolean, maxW: number, maxH: number): string {
  const pic = ctx.media.get(id)!;
  ctx.usedResources.add(id);
  let w = Math.min(maxW, box.width > 1 ? box.width : pic.widthPx);
  if ((w * pic.heightPx) / pic.widthPx > maxH) w = (maxH * pic.widthPx) / pic.heightPx;
  const scaled = { ...pic, widthPx: w, heightPx: (w * pic.heightPx) / pic.widthPx };
  const alt = ctx.resources.get(id)?.altText ?? '';
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph({ style: STYLE.figure, keepNext: keepNext || undefined, ...first }, pictureRun(ctx, scaled, id, alt, 0)));
}

/** EMUs of `v` px. */
const emu = (ctx: WriterContext, v: number): number => Math.round((v * 914400) / ctx.units.dpi);

/**
 * A page-filling picture drawn behind the text at its box on the page
 * (px from the page's top left corner), in an empty paragraph one point
 * tall that keeps with what follows (the title printed over it).
 */
export function backdropPicture(ctx: WriterContext, id: string, box: Box, first: ParaProps | undefined): string {
  const pic = ctx.media.get(id)!;
  ctx.usedResources.add(id);
  const alt = ctx.resources.get(id)?.altText ?? '';
  const inline = pictureRun(ctx, { ...pic, widthPx: box.width, heightPx: box.height }, id, alt, 0);
  // The z-order: behind the text, under anything drawn later.
  const anchor =
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${1 + ctx.pkg.nextDrawingId()}" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">` +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(ctx, box.x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(ctx, box.y)}</wp:posOffset></wp:positionV>`;
  const run = inline
    .replace('<wp:inline distT="0" distB="0" distL="0" distR="0">', anchor)
    .replace('<wp:effectExtent l="0" t="0" r="0" b="0"/>', '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>')
    .replace('</wp:inline>', '</wp:anchor>');
  const props: ParaProps = { ...first, keepNext: true, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' };
  return blockSdt(ctx.nextSdtId(), `ptx:design:${id}`, undefined, paragraph(props, run));
}
