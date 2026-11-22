/**
 * What a cover's design draws on its sheet: the grounds, the picture and
 * the elements as a page template's decoration, the effects, logos and
 * finishes over the frames, pictures cut to an outline, and the mirror
 * bleed past a design margin.
 */

import type { DesignBoxElement, DesignCutElement, DesignElement } from '../types/designElements.js';
import type { ColorValue, Dimension } from '../types/page.js';
import type { Resource } from '../types/resources/resources.js';
import type { CoverConfig, CoverElement, CoverFinish, CoverOutline, CoverPath } from '../types/output/cover.js';
import { contourPolygon } from '../contour/index.js';
import { needsArt, pathData, roundedRectPath, shapeArt } from './shapes.js';
import type { ProductionSheet, SheetRect } from './geometry.js';
import { coverElementRect, outlinePathData } from './coverDesign.js';
import { finite, n3, safeHex, safeId, safePictureHref } from './svgSafe.js';

const mm = (value: number): Dimension => ({ value: Math.round(finite(value) * 1000) / 1000, unit: 'mm' });

/** What the cover adds to a book: every id it gives a resource or a page
 *  template starts with this, so none meets one of the book's. */
export const COVER_ID_PREFIX = 'postext-cover';

/** A picture the mirror bleed draws (see `CoverPageOptions.mirrorPictures`). */
export interface MirrorPicture {
  href: string;
  width: number;
  height: number;
}

export const MIRROR_RESOURCE_ID = `${COVER_ID_PREFIX}-mirror`;

/** The resource id of an effect's picture cut to its outline. */
export const clippedEffectId = (id: string): string => `${COVER_ID_PREFIX}-clip-${safeId(id)}`;

/** An effect's picture cut to its outline, as an SVG the size of its box
 *  (mm): the picture filling the box, cropped to it, inside a clip path of
 *  the outline. */
export function clippedPictureSvg(rect: SheetRect, outline: CoverOutline, picture: MirrorPicture): string | undefined {
  const href = safePictureHref(picture.href);
  if (!href || !(picture.width > 0) || !(picture.height > 0)) return undefined;
  const w = rect.width;
  const h = rect.height;
  const box = { x: 0, y: 0, width: w, height: h };
  const r = coverPictureRect(box, picture.width, picture.height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mmN(w)}mm" height="${mmN(h)}mm" viewBox="0 0 ${mmN(w)} ${mmN(h)}">`
    + `<defs><clipPath id="shape" clipPathUnits="userSpaceOnUse"><path transform="matrix(${mmN(w)} 0 0 ${mmN(h)} 0 0)" d="${outlinePathData(outline)}"/></clipPath></defs>`
    + `<g clip-path="url(#shape)"><image href="${href}" x="${mmN(r.x)}" y="${mmN(r.y)}" width="${mmN(r.width)}" height="${mmN(r.height)}"/></g>`
    + '</svg>';
}

const mmN = n3;

/** A colour as an SVG fill: `#rrggbb` and its opacity. */
function svgFill(color: ColorValue, opacity = 1): string {
  const hex = safeHex(color);
  const alpha = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
  const a = alpha * Math.max(0, Math.min(1, finite(opacity, 1)));
  return `fill="${hex.slice(0, 7)}"${a < 1 ? ` fill-opacity="${mmN(a)}"` : ''}`;
}

/** Where a picture of `w` × `h` px is drawn to cover `area`, centred on
 *  `focus` (fractions of the picture) as far as the area allows. */
function coverPictureRect(area: SheetRect, w: number, h: number, focus = { x: 0.5, y: 0.5 }): SheetRect {
  const s = Math.max(area.width / w, area.height / h);
  const dw = w * s;
  const dh = h * s;
  const x = Math.min(area.x, Math.max(area.x + area.width - dw, area.x + area.width / 2 - focus.x * dw));
  const y = Math.min(area.y, Math.max(area.y + area.height - dh, area.y + area.height / 2 - focus.y * dh));
  return { x, y, width: dw, height: dh };
}

/** The background and movable elements as SVG in sheet mm, as the
 *  decoration draws them: what the mirror bleed folds out; and the
 *  pictures it has no data for (`missing`). */
export function underContentSvg(sheet: ProductionSheet, design: CoverConfig, pictures: Readonly<Record<string, MirrorPicture>>): { content: string; defs: string; missing: string[] } {
  const parts: string[] = [];
  const defs: string[] = [];
  const missing: string[] = [];
  const rect = (r: SheetRect, fill: string) => `<rect x="${mmN(r.x)}" y="${mmN(r.y)}" width="${mmN(r.width)}" height="${mmN(r.height)}" ${fill}/>`;
  const image = (p: MirrorPicture, r: SheetRect) => `<image href="${safePictureHref(p.href)}" x="${mmN(r.x)}" y="${mmN(r.y)}" width="${mmN(r.width)}" height="${mmN(r.height)}"/>`;
  // A picture whose address is no PNG or JPEG data is one the mirror has
  // not got.
  pictures = Object.fromEntries(Object.entries(pictures).filter(([, p]) => safePictureHref(p.href) && p.width > 0 && p.height > 0));
  const whole = { x: 0, y: 0, width: sheet.width, height: sheet.height };
  if (design.background) parts.push(rect(whole, svgFill(design.background)));
  const bg = design.image?.resourceId ? pictures[design.image.resourceId] : undefined;
  if (design.image?.resourceId && !bg) missing.push(design.image.resourceId);
  if (bg && design.image) {
    const front = sheet.zones.find((z) => z.name === 'front');
    const area = design.image.area === 'front' && front ? toBleed(front.rect, sheet) : whole;
    const id = `mc${defs.length}`;
    defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse">${rect(area, '')}</clipPath>`);
    parts.push(`<g clip-path="url(#${id})">${image(bg, coverPictureRect(area, bg.width, bg.height, design.image.focus))}</g>`);
  }
  for (const zone of sheet.zones) {
    const color = design.zones?.[zone.name];
    if (color) parts.push(rect(toBleed(zone.rect, sheet), svgFill(color)));
  }
  for (const el of design.elements ?? []) {
    if (el.bleed === 'own') continue;
    const r = coverElementRect(sheet, el);
    if (!r || r.width <= 0 || r.height <= 0) continue;
    if (el.kind === 'box' && el.color && !el.radius && !el.stroke && !needsArt(el)) parts.push(rect(r, svgFill(el.color, el.opacity)));
    else if (el.kind !== 'image') {
      const path = elementPath(el, r);
      if (path) {
        const drawn = shapeArt(r, path, el.color, el, el.opacity ?? 1, `m-${el.id}`);
        parts.push(drawn.content);
        defs.push(drawn.defs);
      }
    }
    const p = el.kind === 'image' && el.resourceId ? pictures[el.resourceId] : undefined;
    if (p && el.clip) {
      // Cut to its outline, filling its box.
      const id = `mclip${defs.length}`;
      defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path transform="matrix(${mmN(r.width)} 0 0 ${mmN(r.height)} ${mmN(r.x)} ${mmN(r.y)})" d="${outlinePathData(el.clip)}"/></clipPath>`);
      parts.push(`<g clip-path="url(#${id})">${image(p, coverPictureRect(r, p.width, p.height))}</g>`);
    } else if (p) parts.push(image(p, containedRect(r, p.width / p.height)));
    else if (el.kind === 'image' && el.resourceId) missing.push(el.resourceId);
  }
  return { content: parts.join(''), defs: defs.join(''), missing };
}

/** A zone's rectangle run out into the bleed at the sheet's edges. */
function toBleed(r: SheetRect, sheet: ProductionSheet): SheetRect {
  const eps = 0.01;
  const t = sheet.trim;
  const x0 = r.x <= t.x + eps ? 0 : r.x;
  const y0 = r.y <= t.y + eps ? 0 : r.y;
  const x1 = r.x + r.width >= t.x + t.width - eps ? sheet.width : r.x + r.width;
  const y1 = r.y + r.height >= t.y + t.height - eps ? sheet.height : r.y + r.height;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Placed on the sheet: the bleed box's corner is the sheet's. */
export const onSheet = (r: SheetRect) => ({
  anchor: { to: 'bleed' as const, edge: 'top-left' as const },
  offset: { x: mm(r.x), y: mm(r.y) },
  size: { width: mm(r.width), height: mm(r.height) },
});

/** The decoration a design draws under the frames: the sheet's ground, its
 *  picture, each zone's ground, then the movable elements. */
/** An element whose picture is cut to its outline draws the picture of
 *  that cut (`clipped`) instead of its own. */
export const withClip = (el: CoverElement, clipped: ReadonlyMap<string, string>): CoverElement => {
  const own = clipped.get(el.id);
  return own ? { ...el, resourceId: own } : el;
};

export function designElements(sheet: ProductionSheet, design: CoverConfig | undefined, mirrored = false, art: ReadonlyMap<string, SheetRect> = new Map(), clipped: ReadonlyMap<string, string> = new Map()): DesignElement[] {
  if (!design) return [];
  const out: DesignElement[] = [];
  const whole = { x: 0, y: 0, width: sheet.width, height: sheet.height };
  if (design.background) {
    out.push({ kind: 'box', id: 'cover-ground', placement: onSheet(whole), style: { backgroundColor: design.background } } as DesignBoxElement);
  }
  if (design.image?.resourceId) {
    const front = sheet.zones.find((z) => z.name === 'front');
    const area = design.image.area === 'front' && front ? toBleed(front.rect, sheet) : whole;
    out.push({
      kind: 'image',
      id: 'cover-image',
      resourceId: design.image.resourceId,
      decorative: true,
      fit: 'cover',
      ...(design.image.focus ? { focus: design.image.focus } : {}),
      placement: onSheet(area),
    });
  }
  for (const zone of sheet.zones) {
    const color = design.zones?.[zone.name];
    if (!color) continue;
    out.push({ kind: 'box', id: `cover-zone-${zone.name}`, placement: onSheet(toBleed(zone.rect, sheet)), style: { backgroundColor: color } } as DesignBoxElement);
  }
  // Under a mirror, the elements that keep their own bleed go over it.
  for (const el of design.elements ?? []) if (!mirrored || el.bleed !== 'own') out.push(...elementDrawing(sheet, withClip(el, clipped), 'cover-el', false, art));
  return out;
}

/** A colour at an opacity: `#rrggbb` with its alpha. */
function withOpacity(color: ColorValue, opacity: number | undefined): ColorValue {
  if (opacity === undefined || !(opacity < 1)) return color;
  const a = Math.round(Math.max(0, Math.min(1, finite(opacity, 1))) * 255).toString(16).padStart(2, '0');
  return { ...color, hex: safeHex(color).slice(0, 7) + a };
}

/** An element as the decoration draws it: a picture fitted in its box, or
 *  a box of its colour; `over` the text frames or under them. */
export function elementDrawing(sheet: ProductionSheet, el: CoverElement, prefix: string, over: boolean, art: ReadonlyMap<string, SheetRect> = new Map()): DesignElement[] {
  const rect = coverElementRect(sheet, el);
  if (!rect || rect.width <= 0 || rect.height <= 0) return [];
  const id = `${prefix}-${safeId(el.id)}`;
  const above = over ? { over: true } : {};
  if (el.kind === 'image' && el.resourceId) {
    return [{ kind: 'image', id, resourceId: el.resourceId, decorative: true, fit: el.fit ?? 'contain', placement: onSheet(rect), ...above }];
  }
  // With a gradient or a shadow: the picture of itself `art` holds.
  const drawn = art.get(el.id);
  if (drawn) return [{ kind: 'image', id, resourceId: coverArtId(el.id), decorative: true, fit: 'contain', placement: onSheet(drawn), ...above }];
  if (el.kind === 'box' && el.color && !el.radius && !el.stroke) {
    return [{ kind: 'box', id, placement: onSheet(rect), style: { backgroundColor: withOpacity(el.color, el.opacity) }, ...above } as DesignBoxElement];
  }
  const path = elementPath(el, rect);
  if (!path) return [];
  const closed = path.some((p) => p.closed);
  const fill = closed && el.color ? withOpacity(el.color, el.opacity) : undefined;
  const stroke = el.stroke && el.stroke.width > 0 ? el.stroke : undefined;
  if (!fill && !stroke) return [];
  return [{
    kind: 'path',
    id,
    d: pathData(path),
    viewBox: [1, 1],
    preserveAspectRatio: 'none',
    ...(fill ? { fill } : {}),
    ...(stroke ? { stroke: withOpacity(stroke.color, el.opacity), width: mm(stroke.width) } : {}),
    placement: onSheet(rect),
    ...above,
  }];
}

/** The resource id of a box's or shape's picture of itself (its gradient,
 *  its shadow). */
export const coverArtId = (id: string): string => `${COVER_ID_PREFIX}-art-${safeId(id)}`;

/** The shape of a box or a shape element, in fractions of its box `rect`:
 *  its nodes, its traced outline, or its box (corners rounded or not). */
export function elementPath(el: CoverElement, rect: SheetRect): CoverPath | undefined {
  if (el.kind === 'shape') {
    if (el.path?.length) return el.path;
    if (el.outline?.length) return el.outline.map((poly) => ({ closed: true, nodes: poly.map((p) => ({ x: p.x, y: p.y })) }));
    return undefined;
  }
  if (el.kind === 'box') return roundedRectPath(rect.width, rect.height, el.radius ?? 0);
  return undefined;
}

/** Where a picture fitted (`contain`) in a box is drawn, by its aspect. */
function containedRect(rect: SheetRect, aspect: number): SheetRect {
  if (!(aspect > 0)) return rect;
  if (rect.width / rect.height > aspect) {
    const width = rect.height * aspect;
    return { x: rect.x + (rect.width - width) / 2, y: rect.y, width, height: rect.height };
  }
  const height = rect.width / aspect;
  return { x: rect.x, y: rect.y + (rect.height - height) / 2, width: rect.width, height };
}

/** A picture's outline in fractions of it: its contour's polygon, or the
 *  rows of its traced alpha channel (left edges down, right edges up). */
function pictureOutline(resource: Resource | undefined): { x: number; y: number }[] | undefined {
  const polygon = contourPolygon(resource?.contour);
  if (polygon) return polygon;
  const traced = resource?.contour?.traced;
  if (!traced || traced.rows <= 0) return undefined;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let r = 0; r < traced.rows; r++) {
    const lo = traced.spans[2 * r]!;
    const hi = traced.spans[2 * r + 1]!;
    if (lo < 0 || hi < 0) continue;
    const y0 = r / traced.rows;
    const y1 = (r + 1) / traced.rows;
    left.push({ x: lo, y: y0 }, { x: lo, y: y1 });
    right.push({ x: hi, y: y0 }, { x: hi, y: y1 });
  }
  return left.length >= 2 ? [...left, ...right.reverse()] : undefined;
}

/** The default ink of a varnish and of a foil (#1563): a varnish's prints
 *  no colour on screen, a foil's is gold. */
export const COVER_FINISH_INKS: Readonly<Record<'varnish' | 'foil', ColorValue>> = {
  varnish: { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 } } },
  foil: { hex: '#b8962e', model: 'spot', spot: { name: 'Gold foil', cmyk: { c: 0, m: 20, y: 60, k: 25 } } },
};

/** A varnish's or a foil's colour: its spot ink (the finish's own, else
 *  the default), at full tint, overprinting, with the `InkFinish` its
 *  process and sheen make. */
function finishColor(finish: CoverFinish, process: 'varnish' | 'foil'): ColorValue {
  const own = finish.ink?.model === 'spot' && finish.ink.spot && typeof finish.ink.spot.name === 'string' && finish.ink.spot.name.trim() ? finish.ink : undefined;
  const ink = own ?? COVER_FINISH_INKS[process];
  return {
    ...ink,
    hex: safeHex(ink, safeHex(COVER_FINISH_INKS[process])).slice(0, 7),
    spot: { ...ink.spot!, tint: 100, overprint: true, finish: { kind: process, ...(finish.sheen ? { sheen: finish.sheen } : {}) } },
  };
}

/** What draws a finish of `rect`: a varnish or a foil filled with its spot
 *  ink, an emboss or a deboss as a template's cut element of that process
 *  (a relief on the page's technical plates, never painted). `d` is its
 *  shape in a 1 × 1 view box, absent for the whole box. */
function finishElement(finish: CoverFinish, id: string, rect: SheetRect, d?: string): DesignElement {
  const placement = onSheet(rect);
  if (finish.process === 'emboss' || finish.process === 'deboss') {
    const cut: DesignCutElement = { kind: 'cut', id, process: finish.process, placement, ...(d ? { d, viewBox: [1, 1], preserveAspectRatio: 'none' as const } : {}) };
    return cut;
  }
  const fill = finishColor(finish, finish.process === 'foil' ? 'foil' : 'varnish');
  if (d) return { kind: 'path', id, over: true, d, viewBox: [1, 1], preserveAspectRatio: 'none', fill, placement };
  return { kind: 'box', id, over: true, placement, style: { backgroundColor: fill } } as DesignBoxElement;
}

/** The decoration over the text: the effects, the logos, then (after the
 *  barcode, which the caller adds) the finishes. An effect cut to an
 *  outline draws the picture `clipped` makes of it instead of its own. */
export function overElements(sheet: ProductionSheet, design: CoverConfig | undefined, clipped: ReadonlyMap<string, string> = new Map(), art: ReadonlyMap<string, SheetRect> = new Map()): DesignElement[] {
  const out: DesignElement[] = [];
  for (const el of design?.effects ?? []) {
    const own = clipped.get(el.id);
    out.push(...elementDrawing(sheet, own ? { ...el, resourceId: own } : el, 'cover-fx', true, art));
  }
  for (const logo of design?.logos ?? []) out.push(...elementDrawing(sheet, logo, 'cover-logo', true));
  return out;
}

export function finishElements(sheet: ProductionSheet, design: CoverConfig | undefined, resources: readonly Resource[]): DesignElement[] {
  const out: DesignElement[] = [];
  const all = [...(design?.elements ?? []), ...(design?.effects ?? []), ...(design?.logos ?? [])];
  for (const finish of design?.finishes ?? []) {
    if (!['varnish', 'foil', 'emboss', 'deboss'].includes(finish.process) || !finish.shape) continue;
    const id = `cover-finish-${safeId(finish.id)}`;
    if ('outline' in finish.shape) {
      const rect = coverElementRect(sheet, finish.shape.box);
      const d = outlinePathData(finish.shape.outline);
      if (rect && rect.width > 0 && rect.height > 0 && d) out.push(finishElement(finish, id, rect, d));
      continue;
    }
    if ('box' in finish.shape) {
      const rect = coverElementRect(sheet, finish.shape.box);
      if (rect && rect.width > 0 && rect.height > 0) out.push(finishElement(finish, id, rect));
      continue;
    }
    const target = all.find((e) => e.id === (finish.shape as { element: string }).element);
    const rect = target ? coverElementRect(sheet, target) : undefined;
    if (!target || !rect || rect.width <= 0 || rect.height <= 0) continue;
    const own = target.kind === 'image' ? target.clip : undefined;
    const path = target.kind !== 'image' ? elementPath(target, rect) : undefined;
    const shaped = own ? outlinePathData(own) : path ? pathData(path) : '';
    if (shaped) {
      out.push(finishElement(finish, id, rect, shaped));
      continue;
    }
    const resource = target.kind === 'image' ? resources.find((r) => r.id === target.resourceId) : undefined;
    const outline = pictureOutline(resource);
    if (!outline) {
      out.push(finishElement(finish, id, rect));
      continue;
    }
    // The contour, over the picture as it is drawn (fitted in its box).
    const size = resource?.bitmap ?? resource?.svg;
    const drawn = containedRect(rect, size?.width && size?.height ? size.width / size.height : 0);
    out.push(finishElement(finish, id, drawn, outlinePathData([outline])));
  }
  return out;
}
