/**
 * The design of a cover sheet, shared by every version of a book: its
 * grounds and picture, the elements placed on it by zone (boxes, shapes,
 * pictures), its logos and its finishes; and where an element stands on a
 * sheet of another size (`coverElementRect`, `placeCoverElement`).
 */

import type { CmykPercent } from '../types/output/print.js';
import type { ColorValue } from '../types/page.js';
import type { CoverEffects, CoverPath } from './shapes.js';
import type { CoverZoneName, ProductionSheet, SheetRect } from './geometry.js';

/** The look of a sheet, shared by every version: a ground for the whole
 *  sheet, a picture over it and a ground for each zone. Grounds and pictures that reach an edge of the sheet run into
 *  its bleed (a case's turn-in). */
export interface CoverDesign {
  background?: ColorValue;
  /** A bitmap or SVG resource of the book, filling the whole sheet or
   *  only the front cover, cropped to cover it about `focus`. */
  image?: { resourceId: string; area?: 'sheet' | 'front'; focus?: { x: number; y: number } };
  /** A ground per zone, over the sheet's and its picture. Endpapers take
   *  their `pastedown` and `flyleaf`. */
  zones?: Partial<Record<CoverZoneName, ColorValue>>;
  /** The movable elements, back to front, over the grounds and under the
   *  text. */
  elements?: CoverElement[];
  /** Effects: elements over the text, back to front — a translucent box
   *  (`opacity`), a picture with transparency of its own. */
  effects?: CoverElement[];
  /** Logos (the publisher's, the collection's, a seal), over the effects,
   *  each with the clear space it keeps round it. */
  logos?: CoverLogo[];
  /** Finishes: each a spot-colour plate that overprints everything, the
   *  shape of a box of its own or of one of the design's elements. */
  finishes?: CoverFinish[];
}

/** A logo of the cover: a picture placed as an element, and the clear
 *  space (mm) nothing else should enter round it. */
export interface CoverLogo extends CoverElement {
  kind: 'image';
  clearance: number;
}

/** The finishes a cover's plates stand for. */
export type CoverFinishKind = 'varnish' | 'lamination' | 'foilGold' | 'foilSilver' | 'emboss' | 'deboss';

/** A finish of the cover: what it is, the ink its plate is named after (as
 *  the printer knows it), and what it covers — a box of its own, placed
 *  like an element, or the shape of an element, effect or logo of the
 *  design (a picture's contour when its resource has one). */
export interface CoverFinish {
  id: string;
  kind: CoverFinishKind;
  ink: string;
  /** A box of its own, an element's shape, or a saved outline laid in a
   *  box of its own. */
  shape:
    | { box: Pick<CoverElement, 'zone' | 'x' | 'y' | 'width' | 'height' | 'basis'> }
    | { element: string }
    | { outline: CoverOutline; box: Pick<CoverElement, 'zone' | 'x' | 'y' | 'width' | 'height' | 'basis'> };
}

/** An outline: closed polygons, their points in fractions of the box they
 *  are laid in (0, 0 its top-left corner; 1, 1 its bottom-right). Traced
 *  from a picture, it keeps its shape for a veil or a finish. */
export type CoverOutline = { x: number; y: number }[][];

/** An outline as SVG path data in a 1 × 1 view box. */
export function outlinePathData(outline: CoverOutline): string {
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return outline
    .filter((poly) => poly.length >= 3)
    .map((poly) => poly.map((p, i) => `${i === 0 ? 'M' : 'L'} ${r(p.x)} ${r(p.y)}`).join(' ') + ' Z')
    .join(' ');
}

/** Each finish's default plate name, the CMYK a composite viewer shows its
 *  ink as, and its colour on screen (where it is drawn translucent). */
export const COVER_FINISH_INKS: Readonly<Record<CoverFinishKind, { ink: string; cmyk: CmykPercent; screen: string }>> = {
  varnish: { ink: 'Varnish', cmyk: { c: 0, m: 0, y: 0, k: 15 }, screen: '#7fb2e5' },
  lamination: { ink: 'Lamination', cmyk: { c: 0, m: 0, y: 0, k: 10 }, screen: '#9ad1c7' },
  foilGold: { ink: 'Gold foil', cmyk: { c: 0, m: 20, y: 60, k: 20 }, screen: '#c9a227' },
  foilSilver: { ink: 'Silver foil', cmyk: { c: 0, m: 0, y: 0, k: 30 }, screen: '#b5b8bd' },
  emboss: { ink: 'Emboss', cmyk: { c: 0, m: 0, y: 0, k: 20 }, screen: '#e07a5f' },
  deboss: { ink: 'Deboss', cmyk: { c: 0, m: 0, y: 0, k: 25 }, screen: '#8d6cab' },
};

/** A movable element of a cover's design: a picture, a box of colour, or
 *  a shape of colour (a box with an outline). Placed by the zone it stands
 *  in, so it moves with that zone when the spine grows or the binding
 *  changes. */
export interface CoverElement extends CoverEffects {
  id: string;
  kind: 'image' | 'box' | 'shape';
  /** A shape's outline, in its box (a traced one). */
  outline?: CoverOutline;
  /** A shape drawn by nodes (a basic shape, edited), in its box; over
   *  `outline` when both are there. */
  path?: CoverPath;
  /** An image's picture: a bitmap or SVG resource of the book. */
  resourceId?: string;
  /** A box's colour. */
  color?: ColorValue;
  zone: CoverZoneName;
  /** The size of its zone when it was placed, mm. When the zone is
   *  another size now (the book's format changed, the spine grew), the
   *  element is scaled with it: a box or a shape on each axis, a picture
   *  evenly, about where its centre falls, so it keeps its proportions.
   *  Absent: it stays as placed. */
  basis?: { width: number; height: number };
  /** A box or a shape that runs across zones (a band, a ground): its
   *  right edge, mm from the left of the zone it ends in, and that zone's
   *  width when it was placed. Each edge then follows its own zone when
   *  the zones change (a spine that grows moves the edge on the front
   *  and stretches the band, not the band on the spine's scale). */
  to?: { zone: CoverZoneName; x: number; basis?: number };
  /** Its box, mm from the zone's top-left corner; it may run out of the
   *  zone, onto the sheet's other zones or into the bleed. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** A box's opacity, 0 … 1 (default 1). A picture keeps its own
   *  transparency. */
  opacity?: number;
  /** How a picture fills its box: whole inside it (`contain`, the
   *  default), or covering it, cropped (`cover`: a page's advertisement,
   *  which must reach every edge). */
  fit?: 'contain' | 'cover';
  /** A picture cut to an outline (in fractions of its box): an
   *  illustration's own shape, a shine or a texture that shows only within
   *  it. The picture then fills the box (cropped to it) rather than
   *  fitting in it. */
  clip?: CoverOutline;
  /** Past the design margin (a case's turn-in, a board's edge): `mirror`
   *  (the default) folds it out with the background; `own` paints the
   *  element as it is, over the fold, for an element whose picture goes on
   *  past the frame or that the fold would make look odd. */
  bleed?: 'mirror' | 'own';
}

/** The zone an element is placed by on a sheet that lacks its own: a flap
 *  or a joint stands next to its board. */
const ZONE_STAND_IN: Partial<Record<CoverZoneName, CoverZoneName>> = {
  flapFront: 'front',
  flapBack: 'back',
  jointFront: 'front',
  jointBack: 'back',
};

/** Where an element stands on the sheet (mm from the sheet's corner, bleed
 *  included), or undefined when the sheet has neither its zone nor the one
 *  that stands in for it. */
export function coverElementRect(sheet: ProductionSheet, el: CoverElement): SheetRect | undefined {
  const zone = sheet.zones.find((z) => z.name === el.zone)
    ?? sheet.zones.find((z) => z.name === ZONE_STAND_IN[el.zone]);
  if (!zone) return undefined;
  const b = el.basis;
  const end = el.to && el.kind !== 'image' ? sheet.zones.find((z) => z.name === el.to!.zone) ?? sheet.zones.find((z) => z.name === ZONE_STAND_IN[el.to!.zone]) : undefined;
  if (end && el.to) {
    // Across zones: each edge with its own zone.
    const sx = b && b.width > 0 ? zone.rect.width / b.width : 1;
    const sy = b && b.height > 0 ? zone.rect.height / b.height : 1;
    const ex = el.to.basis && el.to.basis > 0 ? end.rect.width / el.to.basis : 1;
    const left = zone.rect.x + el.x * sx;
    return { x: left, y: zone.rect.y + el.y * sy, width: Math.max(0, end.rect.x + el.to.x * ex - left), height: el.height * sy };
  }
  if (!b || b.width <= 0 || b.height <= 0 || (Math.abs(b.width - zone.rect.width) < 0.01 && Math.abs(b.height - zone.rect.height) < 0.01)) {
    return { x: zone.rect.x + el.x, y: zone.rect.y + el.y, width: el.width, height: el.height };
  }
  const sx = zone.rect.width / b.width;
  const sy = zone.rect.height / b.height;
  if (el.kind === 'image') {
    // A picture keeps its proportions: scaled evenly, its centre where it was.
    const k = Math.min(sx, sy);
    const cx = (el.x + el.width / 2) * sx;
    const cy = (el.y + el.height / 2) * sy;
    return { x: zone.rect.x + cx - (el.width * k) / 2, y: zone.rect.y + cy - (el.height * k) / 2, width: el.width * k, height: el.height * k };
  }
  return { x: zone.rect.x + el.x * sx, y: zone.rect.y + el.y * sy, width: el.width * sx, height: el.height * sy };
}

/** How far into a zone an element must run to be across it, mm. */
const SLIVER_MM = 3;

/** The element at `rect` (sheet mm) placed by the zone its centre falls in
 *  (the nearest zone when it is off them all); a box or a shape that runs
 *  across zones, by the zone its left edge falls in and the one its right
 *  edge does (`to`). */
export function placeCoverElement(sheet: ProductionSheet, el: CoverElement, rect: SheetRect): CoverElement {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const distance = (r: SheetRect, x: number) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.width), Math.max(r.y - cy, 0, cy - r.y - r.height));
  // The nearest zone; of zones one inside another (a joint in the front
  // cover), the larger.
  const nearest = (x: number) => sheet.zones.reduce((best, z) => {
    const d = distance(z.rect, x) - distance(best.rect, x);
    return d < -1e-9 || (Math.abs(d) <= 1e-9 && z.rect.width * z.rect.height > best.rect.width * best.rect.height) ? z : best;
  }, sheet.zones[0]!);
  const round = (v: number) => Math.round(v * 100) / 100;
  const out = { ...el };
  delete out.to;
  if (el.kind !== 'image') {
    // The zones it runs over, left to right, but a sliver (an edge a few
    // millimetres into the next zone, or into the bleed) does not count.
    const over = sheet.zones
      .map((z) => ({ z, len: Math.min(rect.x + rect.width, z.rect.x + z.rect.width) - Math.max(rect.x, z.rect.x) }))
      .filter((o) => o.len > SLIVER_MM)
      .sort((a, b) => a.z.rect.x - b.z.rect.x);
    const first = over[0]?.z;
    const last = over[over.length - 1]?.z;
    if (first && last && first.name !== last.name) {
      return {
        ...out,
        zone: first.name,
        x: round(rect.x - first.rect.x),
        y: round(rect.y - first.rect.y),
        width: round(rect.width),
        height: round(rect.height),
        basis: { width: round(first.rect.width), height: round(first.rect.height) },
        to: { zone: last.name, x: round(rect.x + rect.width - last.rect.x), basis: round(last.rect.width) },
      };
    }
  }
  const zone = nearest(cx);
  return {
    ...out,
    zone: zone.name,
    x: round(rect.x - zone.rect.x),
    y: round(rect.y - zone.rect.y),
    width: round(rect.width),
    height: round(rect.height),
    basis: { width: round(zone.rect.width), height: round(zone.rect.height) },
  };
}
