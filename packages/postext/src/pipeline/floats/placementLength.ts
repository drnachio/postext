/**
 * A resource's width as a length (`placement.width: { value: 95, unit:
 * 'mm' }`, #1461) and the share of a slot it takes.
 *
 * A share (0 < w < 1) is read as before. A length stays a length through
 * the plan and is measured against the slot where the layout sets the
 * resource: the column of an inline embed, the band of a float (its
 * columns, the content area of a page-span float, the side column), the
 * columns of a styled section or of a box, the room beside a caption set
 * inside the slot. A length as wide as its slot or wider takes the whole
 * slot. A turned picture is set at most that wide before it is turned.
 *
 * Only physical units are read (mm, cm, in, pt): a width in px, em or rem
 * is no length here and the resource takes its whole slot.
 */

import type { Dimension, ResourcePlacement } from '../../types.js';
import { dimensionToPx } from '../../units.js';

/** The narrowest share a length is made: a pixel-thin figure is no figure. */
const MIN_SHARE = 0.01;

/** The units a `placement.width` length may be given in. */
export const PLACEMENT_WIDTH_UNITS = ['mm', 'cm', 'in', 'pt'] as const;
export type PlacementWidthUnit = (typeof PLACEMENT_WIDTH_UNITS)[number];

/** Whether a `placement.width` is a length (a positive value in mm, cm,
 *  in or pt) rather than a share. */
export function isWidthLength(width: unknown): width is Dimension & { unit: PlacementWidthUnit } {
  if (typeof width !== 'object' || width === null) return false;
  const d = width as Partial<Dimension>;
  return typeof d.value === 'number' && Number.isFinite(d.value) && d.value > 0
    && (PLACEMENT_WIDTH_UNITS as readonly string[]).includes(d.unit as string);
}

/** Whether a `placement.width` is a share of the slot (0 < w < 1). */
export function isWidthShare(width: unknown): width is number {
  return typeof width === 'number' && Number.isFinite(width) && width > 0 && width < 1;
}

/** The `placement.width` a resource reads: its own, else its type's. A
 *  resource that writes a share over its type's length takes the share. */
export function placementWidthOf(own: ResourcePlacement | undefined, type: ResourcePlacement | undefined): number | Dimension | undefined {
  return own?.width !== undefined ? own.width : type?.width;
}

/** The share of a slot `slotPx` wide that `width` takes, `1` for the whole
 *  slot: a share as written, a length measured against the slot. */
export function widthShareIn(width: unknown, slotPx: number, dpi: number): number {
  if (isWidthShare(width)) return width;
  if (!isWidthLength(width) || !(slotPx > 0)) return 1;
  const px = dimensionToPx(width, dpi);
  if (!(px > 0)) return 1;
  const share = px / slotPx;
  return share >= 1 - 1e-9 ? 1 : Math.max(MIN_SHARE, share);
}

/** What a planned float keeps of its width: a share, or a length. */
export interface FloatWidth {
  widthFraction?: number;
  widthLength?: Dimension;
}

/** The width in px a float takes of a slot `slotPx` wide: its length
 *  (never wider than the slot), else its share, else the whole slot. Equal
 *  to `slotPx * widthFraction` when no length is set, so a layout without
 *  lengths is unchanged. */
export function floatWidthIn(f: FloatWidth, slotPx: number, dpi: number): number {
  if (f.widthLength) {
    const share = widthShareIn(f.widthLength, slotPx, dpi);
    return share < 1 ? Math.min(slotPx, dimensionToPx(f.widthLength, dpi)) : slotPx;
  }
  return f.widthFraction && f.widthFraction < 1 ? slotPx * f.widthFraction : slotPx;
}
