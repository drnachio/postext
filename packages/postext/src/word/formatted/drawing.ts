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
  /** A text box's inked bands (its lines, without the slack around
   *  them), px: what a drawing painted later covers only where it lies on
   *  them. Absent: the whole box. */
  ink?: DisplayRect[];
  /** A picture's graphic as a shape filled with it, written instead when
   *  a shape is later drawn over the picture behind the text
   *  (`shapesOverPictures`). Absent for a turned or flipped picture,
   *  whose fill LibreOffice would not turn. */
  asShape?: (id: number, cx: number, cy: number) => string;
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

/** Whether two boxes share more than a pixel each way. */
function overlaps(a: DisplayRect, b: DisplayRect): boolean {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
}

/** One `w:r` holding a page-anchored drawing around `graphic` (the
 *  `a:graphic` element).
 *
 *  Text boxes stand in front of the text layer; every drawing without
 *  text (a shape, a picture) goes behind it, in paint order among the
 *  others behind (Word and LibreOffice keep `relativeHeight` order there),
 *  unless it lies on the ink of text painted before it (a formula over its
 *  holder, a mark over a word) or on a drawing kept in front for that
 *  reason. LibreOffice imports plain shapes and text boxes as two kinds of
 *  frame, loses their `relativeHeight` order and paints a plain shape in
 *  front over every text box, so a balloon's fill, a chip's ground or a
 *  band in front hid the words written on it (#1406, #1444). */
export function anchorRun(ctx: WriterContext, box: AnchorBox, graphic: (id: number, cx: number, cy: number) => string): string {
  const id = ctx.pkg.nextDrawingId();
  const cx = Math.max(0, emu(box.rect.width, ctx.dpi));
  const cy = Math.max(0, emu(box.rect.height, ctx.dpi));
  const z = Z_BASE + ++ctx.z;
  const body = graphic(id, cx, cy);
  const text = body.includes('txBox="1"');
  const front = (ctx.front ??= []);
  const behind = box.behind ?? (!text && !front.some((r) => overlaps(r, box.rect)));
  if (!behind) front.push(...(text ? (box.ink ?? [box.rect]) : [box.rect]));
  const pictures = (ctx.pictures ??= []);
  if (behind && box.asShape) pictures.push({ rect: box.rect, pic: body, shape: box.asShape(id, cx, cy) });
  else if (behind && !text) for (const p of pictures) if (!p.covered && overlaps(p.rect, box.rect)) p.covered = true;
  const descr = box.descr ? ` descr="${escapeAttr(box.descr)}"` : '';
  return (
    '<w:r><w:rPr><w:noProof/><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr><w:drawing>' +
    `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${z}" behindDoc="${behind ? 1 : 0}" locked="1" layoutInCell="1" allowOverlap="1">` +
    '<wp:simplePos x="0" y="0"/>' +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${emu(box.rect.x, ctx.dpi)}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${emu(box.rect.y, ctx.dpi)}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
    `<wp:docPr id="${id}" name="${escapeAttr(box.name)} ${id}"${descr}/><wp:cNvGraphicFramePr/>` +
    body +
    '</wp:anchor></w:drawing></w:r>'
  );
}

export function xfrm(cx: number, cy: number, rotate?: number, flipH?: boolean, flipV?: boolean): string {
  const rot = rotate ? ` rot="${angle(rotate)}"` : '';
  return `<a:xfrm${rot}${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
}

/** A Word shape (`wps:wsp`) with its `spPr` children, and its text box
 *  and body properties when it holds `text`. A shape with nothing to say
 *  is a plain shape, not an empty text box: Word for the web and Word's
 *  PDF export hand the text of the boxes on every page after the first to
 *  the wrong boxes once empty ones sit among them (chips and callout fills
 *  showed a body column's words, columns stood empty, #1444). */
export function shapeGraphic(spPr: string, text?: { content: string; vert?: 'horz' | 'eaVert' }): string {
  const box = text !== undefined;
  return (
    `<a:graphic><a:graphicData uri="${WPS_URI}"><wps:wsp>` +
    `<wps:cNvSpPr${box ? ' txBox="1"' : ''}/><wps:spPr>${spPr}</wps:spPr>` +
    (box ? `<wps:txbx><w:txbxContent>${text.content}</w:txbxContent></wps:txbx>` : '') +
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

/** The page's runs with every picture a shape covers behind the text
 *  written as a shape filled with the picture. LibreOffice paints the
 *  pictures behind the text over the shapes behind it, whatever their
 *  `relativeHeight` (a balloon or a caption box vanished under its
 *  panel); a shape filled with a picture keeps the order. Pictures nothing
 *  covers stay pictures, which every reader takes. */
export function shapesOverPictures(ctx: WriterContext, runs: string[]): string[] {
  const all = ctx.pictures ?? [];
  ctx.pictures = [];
  // A picture written as a shape would sink under any earlier picture it
  // lies on, so those are written as shapes too, down the stack.
  for (let i = all.length - 1; i >= 0; i--) {
    if (!all[i]!.covered) continue;
    for (let j = 0; j < i; j++) if (overlaps(all[j]!.rect, all[i]!.rect)) all[j]!.covered = true;
  }
  const covered = all.filter((p) => p.covered);
  if (covered.length === 0) return runs;
  return runs.map((r) => {
    for (const p of covered) if (r.includes(p.pic)) return r.replace(p.pic, p.shape);
    return r;
  });
}

export interface BlipRefs {
  blip: string;
  svg?: string;
}

function blipXml(refs: BlipRefs): string {
  const ext = refs.svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="${refs.svg}"/></a:ext></a:extLst>`
    : '';
  return `<a:blip r:embed="${refs.blip}">${ext}</a:blip>`;
}

/** A shape filled with a picture: the crop is a fill rectangle reaching
 *  past the shape (`fillRect`, 1/1000 % of the shape per side), which
 *  LibreOffice honours in a shape's fill where it drops `srcRect`. */
export function pictureShapeGraphic(cx: number, cy: number, refs: BlipRefs, opts: { fillRect?: string }): string {
  return (
    `<a:graphic><a:graphicData uri="${WPS_URI}"><wps:wsp><wps:cNvSpPr/><wps:spPr>` +
    `${xfrm(cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `<a:blipFill rotWithShape="1">${blipXml(refs)}<a:stretch>${opts.fillRect ?? '<a:fillRect/>'}</a:stretch></a:blipFill><a:ln><a:noFill/></a:ln></wps:spPr>` +
    '<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="0"><a:noAutofit/></wps:bodyPr>' +
    '</wps:wsp></a:graphicData></a:graphic>'
  );
}

/** A picture (`pic:pic`) stretched over the box, cropped by `srcRect`
 *  (1/1000 % of the picture per side). */
export function pictureGraphic(id: number, cx: number, cy: number, refs: BlipRefs, opts: { name: string; descr?: string; srcRect?: string; rotate?: number; flipH?: boolean }): string {
  const descr = opts.descr ? ` descr="${escapeAttr(opts.descr)}"` : '';
  return (
    `<a:graphic><a:graphicData uri="${PIC_URI}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="${escapeAttr(opts.name)}"${descr}/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
    `<pic:blipFill>${blipXml(refs)}${opts.srcRect ?? ''}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr>${xfrm(cx, cy, opts.rotate, opts.flipH)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    '</pic:pic></a:graphicData></a:graphic>'
  );
}
