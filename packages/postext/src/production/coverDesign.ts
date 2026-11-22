/**
 * The design of a cover sheet, shared by every version of a book: its
 * grounds and picture, the elements placed on it by zone (boxes, shapes,
 * pictures), its logos and its finishes; and where an element stands on a
 * sheet of another size (`coverElementRect`, `placeCoverElement`).
 */

import type { CoverElement, CoverOutline, CoverPlacement, CoverZoneName } from '../types/output/cover.js';
import type { ProductionSheet, SheetRect } from './geometry.js';
import { finite, n4 } from './svgSafe.js';

/** An outline as SVG path data in a 1 × 1 view box. */
export function outlinePathData(outline: CoverOutline): string {
  if (!Array.isArray(outline)) return '';
  return outline
    .filter((poly) => Array.isArray(poly) && poly.length >= 3)
    .map((poly) => poly.map((p, i) => `${i === 0 ? 'M' : 'L'} ${n4(p.x)} ${n4(p.y)}`).join(' ') + ' Z')
    .join(' ');
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
export function coverElementRect(sheet: ProductionSheet, el: CoverPlacement & { kind?: CoverElement['kind'] }): SheetRect | undefined {
  // From a book anyone may have written: a number that is none counts 0.
  el = { ...el, x: finite(el.x), y: finite(el.y), width: Math.max(0, finite(el.width)), height: Math.max(0, finite(el.height)) };
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
