// The ground of a page a design fills with one colour (#1458): a cover's
// dark sheet, a part page in the part's colour, a back cover. Word has no
// page colour for one page alone, and a shaded table stops at the
// margins, so the fill is a picture of one colour drawn behind the text
// at the box's place on the page, edge to edge: Word, Word for the web,
// Google Docs and LibreOffice all draw a page-anchored picture behind
// text. What the design prints on it stays flowing text over it.

import { encodePng } from '../../../util/png.js';
import type { WriterContext } from '../context.js';
import { blockSdt, paragraph, type ParaProps } from '../wml.js';
import type { Box } from './geometry.js';

/** A filled box drawn behind the text: its colour and its place, px. */
export interface Ground {
  fill: string;
  box: Box;
}

/** A PNG of one colour (`RRGGBB`), 8 px square: stretched, it is the fill. */
export function solidPng(rgb: string): Uint8Array {
  const size = 8;
  const pixels = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) for (let k = 0; k < 3; k++) pixels[i * 3 + k] = parseInt(rgb.slice(k * 2, k * 2 + 2), 16);
  return encodePng(size, size, pixels, 3);
}

const fills = new WeakMap<object, Map<string, string>>();

/** The relationship id of the one-colour picture of `fill`, made once. */
function fillRel(ctx: WriterContext, fill: string): string {
  let byFill = fills.get(ctx.pkg);
  if (!byFill) fills.set(ctx.pkg, (byFill = new Map()));
  let rel = byFill.get(fill);
  if (!rel) byFill.set(fill, (rel = ctx.pkg.addMedia(solidPng(fill), 'png')));
  return rel;
}

const emu = (ctx: WriterContext, v: number): number => Math.round((v * 914400) / ctx.units.dpi);

/** One ground as a picture anchored to the page, behind the text. */
export function groundRun(ctx: WriterContext, g: Ground): string {
  const id = ctx.pkg.nextDrawingId();
  const cx = Math.max(1, emu(ctx, g.box.width));
  const cy = Math.max(1, emu(ctx, g.box.height));
  return (
    `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${1 + id}" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">` +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(ctx, g.box.x)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(ctx, g.box.y)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="${id}" name="ground ${g.fill}"/>` +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="ground ${g.fill}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${fillRel(ctx, g.fill)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>'
  );
}

/**
 * The grounds of a page, the first under the others, in an empty
 * paragraph one point tall that keeps with what follows (the first thing
 * the page prints on them).
 */
export function groundParagraph(ctx: WriterContext, grounds: readonly Ground[], first: ParaProps | undefined): string {
  const props: ParaProps = { ...first, keepNext: true, before: 0, after: 0, line: { twips: 20, rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' };
  return blockSdt(ctx.nextSdtId(), 'ptx:design:ground', undefined, paragraph(props, grounds.map((g) => groundRun(ctx, g)).join('')));
}
