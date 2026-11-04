// DrawingML wrappers of the formatted Word export (#1392): every object
// on a page is a `wp:anchor` placed in EMU relative to the page, with no
// wrapping, locked to its anchor paragraph, stacked in paint order
// (`relativeHeight`). Text boxes, shapes and pictures go inside.

import { escapeAttr } from '../xml.js';
import { angle, emu } from './units.js';
import type { DisplayRect } from '../../paint/displayList/types.js';
import type { WriterContext } from './types.js';

const WPS_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';
const PIC_URI = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
/** Lowest `relativeHeight` Word itself hands out. */
const Z_BASE = 251658240;

export interface AnchorBox {
  /** Unrotated box on the page, px. */
  rect: DisplayRect;
  /** Degrees clockwise about the box centre. */
  rotate?: number;
  behind?: boolean;
  name: string;
  descr?: string;
}

/** The point `p` of a frame turned by `deg` clockwise about `c`. */
export function turnPoint(p: { x: number; y: number }, c: { x: number; y: number }, deg: number): { x: number; y: number } {
  if (!deg) return p;
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** A box laid out in an item's unturned frame (turned `deg` about the
 *  item's centre `c`) as Word places it: same size, centred where the
 *  turn carries its centre, turned about its own centre. */
export function turnedBox(rect: DisplayRect, c: { x: number; y: number }, deg: number | undefined): DisplayRect {
  if (!deg) return rect;
  const centre = turnPoint({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, c, deg);
  return { x: centre.x - rect.width / 2, y: centre.y - rect.height / 2, width: rect.width, height: rect.height };
}

/** One `w:r` holding a page-anchored drawing around `graphic` (the
 *  `a:graphic` element). */
export function anchorRun(ctx: WriterContext, box: AnchorBox, graphic: (id: number, cx: number, cy: number) => string): string {
  const id = ctx.pkg.nextDrawingId();
  const cx = Math.max(0, emu(box.rect.width, ctx.dpi));
  const cy = Math.max(0, emu(box.rect.height, ctx.dpi));
  const z = Z_BASE + ++ctx.z;
  const descr = box.descr ? ` descr="${escapeAttr(box.descr)}"` : '';
  return (
    '<w:r><w:rPr><w:noProof/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:drawing>' +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${z}" behindDoc="${box.behind ? 1 : 0}" locked="1" layoutInCell="1" allowOverlap="1">` +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.rect.x, ctx.dpi)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.rect.y, ctx.dpi)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="${id}" name="${escapeAttr(box.name)} ${id}"${descr}/><wp:cNvGraphicFramePr/>` +
    graphic(id, cx, cy) +
    '</wp:anchor></w:drawing></w:r>'
  );
}

export function xfrm(cx: number, cy: number, rotate?: number, flipH?: boolean, flipV?: boolean): string {
  const rot = rotate ? ` rot="${angle(rotate)}"` : '';
  return `<a:xfrm${rot}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
}

/** Body of a shape that holds no text: an empty text box. LibreOffice
 *  imports plain shapes and text boxes as two kinds of frame and loses
 *  their `relativeHeight` order once a document holds many text boxes
 *  (an opener band painted over its own text); one kind keeps it (#1406). */
export const EMPTY_TXBX = '<w:p/>';

/** A Word shape (`wps:wsp`) with its `spPr` children and its text box
 *  (empty when `text` is absent) and body properties. */
export function shapeGraphic(spPr: string, text?: { content: string; vert?: 'horz' | 'eaVert' }): string {
  return (
    `<a:graphic><a:graphicData uri="${WPS_URI}"><wps:wsp>` +
    `<wps:cNvSpPr txBox="1"/><wps:spPr>${spPr}</wps:spPr>` +
    `<wps:txbx><w:txbxContent>${text?.content ?? EMPTY_TXBX}</w:txbxContent></wps:txbx>` +
    `<wps:bodyPr rot="0" vert="${text?.vert ?? 'horz'}" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="0"><a:noAutofit/></wps:bodyPr>` +
    '</wps:wsp></a:graphicData></a:graphic>'
  );
}

/** A text box: no fill, no line, zero insets, no autofit. */
export function textBoxRun(ctx: WriterContext, box: AnchorBox, content: string, vert?: 'horz' | 'eaVert'): string {
  return anchorRun(ctx, box, (_id, cx, cy) =>
    shapeGraphic(`${xfrm(cx, cy, box.rotate)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln>`, { content, ...(vert ? { vert } : {}) }),
  );
}

export interface BlipRefs {
  blip: string;
  svg?: string;
}

/** A picture (`pic:pic`) stretched over the box, cropped by `srcRect`
 *  (1/1000 % of the picture per side). */
export function pictureGraphic(id: number, cx: number, cy: number, refs: BlipRefs, opts: { name: string; descr?: string; srcRect?: string; rotate?: number; flipH?: boolean }): string {
  const ext = refs.svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="${refs.svg}"/></a:ext></a:extLst>`
    : '';
  const descr = opts.descr ? ` descr="${escapeAttr(opts.descr)}"` : '';
  return (
    `<a:graphic><a:graphicData uri="${PIC_URI}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escapeAttr(opts.name)}"${descr}/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${refs.blip}">${ext}</a:blip>${opts.srcRect ?? ''}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr>${xfrm(cx, cy, opts.rotate, opts.flipH)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic>'
  );
}
