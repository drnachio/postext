/**
 * A resource's width as a length (`placement.width: { value: 95, unit:
 * 'mm' }`), turned into the share of its slot the layout reads.
 *
 * Every part of the layout that narrows a resource — an inline embed, a
 * float in its band, a wrap's exclusion, a caption set inside the slot —
 * reads `placement.width` as a share of the slot (0 < w < 1). A length is
 * made that share once, before the layout, against the slot the
 * resource's placement gives it on the chapter's pages: the content area
 * for a page-span or turned float, the side column for a side float, the
 * columns (and their gutters) a column float takes, the column for
 * anything set in the text. A length as wide as its slot or wider takes
 * the whole slot. Pages cut with another layout (a styled section's) keep
 * the share, so the length is exact on the chapter's own pages.
 */

import type { Dimension, Resource, ResourcePlacement, ResourceType } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { createBoundingBox } from '../../vdt.js';
import { computeColumnBboxes, hasFloatSideColumn } from '../config.js';
import { dimensionToPx } from '../../units.js';

/** The narrowest share a length is made: a pixel-thin figure is no figure. */
const MIN_SHARE = 0.01;

/** Whether a `placement.width` is a length rather than a share. */
export function isWidthLength(width: unknown): width is Dimension {
  if (typeof width !== 'object' || width === null) return false;
  const d = width as Partial<Dimension>;
  return typeof d.value === 'number' && Number.isFinite(d.value) && d.value > 0 && typeof d.unit === 'string';
}

/** The share of a slot `slotPx` wide a length takes; `undefined` when it
 *  fills the slot. */
export function lengthShare(width: Dimension, slotPx: number, dpi: number, bodyFontPx: number): number | undefined {
  if (!(slotPx > 0)) return undefined;
  const px = dimensionToPx(width, dpi, bodyFontPx);
  if (!(px > 0)) return undefined;
  const share = px / slotPx;
  return share >= 1 - 1e-9 ? undefined : Math.max(MIN_SHARE, share);
}

/** The slot widths of the chapter's pages: the content area, the first
 *  text column, the gutter, and the side column when the layout keeps one
 *  for floats. Along the flow: a vertical page's measure is its height. */
function slotWidths(resolved: ResolvedConfig): { area: number; column: number; gutter: number; side?: number } {
  const dpi = resolved.page.dpi;
  const m = resolved.page.margins;
  const vertical = resolved.layout.writingMode === 'vertical-rl';
  const width = vertical
    ? dimensionToPx(resolved.page.height, dpi) - dimensionToPx(m.top, dpi) - dimensionToPx(m.bottom, dpi)
    : dimensionToPx(resolved.page.width, dpi) - dimensionToPx(m.left, dpi) - dimensionToPx(m.right, dpi);
  const area = Math.max(0, width);
  const cols = computeColumnBboxes(createBoundingBox(0, 0, area, 1), resolved);
  const side = hasFloatSideColumn(resolved) ? cols[cols.length - 1] : undefined;
  const text = cols.filter((c) => c !== side);
  return {
    area,
    column: text[0]?.width ?? area,
    gutter: dimensionToPx(resolved.layout.gutterWidth, dpi),
    ...(side ? { side: side.width } : {}),
  };
}

/** The width of the slot a placement gives its resource (see the module
 *  comment); `type` fills in what the resource's own placement leaves. */
function slotOf(own: ResourcePlacement | undefined, type: ResourcePlacement | undefined, s: ReturnType<typeof slotWidths>): number {
  const position = own?.position ?? type?.position ?? 'auto';
  const inline = position === 'here';
  const rotate = !inline && (own?.rotate ?? type?.rotate);
  const span = own?.span ?? type?.span ?? 'column';
  if (rotate || span === 'page') return s.area;
  if (inline) return s.column;
  if (span === 'side') return s.side ?? s.column;
  const n = Math.max(1, Math.floor(own?.columns ?? type?.columns ?? 1));
  return Math.min(s.area, n * s.column + (n - 1) * s.gutter);
}

/** `placement` with a length width made its share of `slotPx` (dropped
 *  when it fills the slot); the same object when there is nothing to do. */
function withShare(placement: ResourcePlacement, slotPx: number, dpi: number, bodyFontPx: number): ResourcePlacement {
  if (!isWidthLength(placement.width)) return placement;
  const share = lengthShare(placement.width, slotPx, dpi, bodyFontPx);
  const { width: _width, ...rest } = placement;
  void _width;
  return share === undefined ? rest : { ...rest, width: share };
}

/**
 * `resources` and `resourceTypes` with every length width made a share of
 * its slot (see the module comment). A resource that sets no width of its
 * own and whose type sets a length gets the share for its own placement.
 * The same arrays (and objects) come back when no width is a length.
 */
export function withPlacementLengths(
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
  resolved: ResolvedConfig,
): { resources: Resource[]; resourceTypes: ResourceType[] } {
  const typeLength = resourceTypes.some((t) => isWidthLength(t.defaultPlacement?.width));
  if (!typeLength && !resources.some((r) => isWidthLength(r.placement?.width))) {
    return { resources: resources as Resource[], resourceTypes: resourceTypes as ResourceType[] };
  }
  const s = slotWidths(resolved);
  const dpi = resolved.page.dpi;
  const bodyFontPx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const typeById = new Map(resourceTypes.map((t) => [t.id, t]));
  const outResources = resources.map((r) => {
    const own = r.placement;
    const type = typeById.get(r.typeId)?.defaultPlacement;
    // The type's length, read for this resource's own placement.
    const width = own?.width !== undefined ? own.width : type?.width;
    if (!isWidthLength(width)) return r;
    // A length that fills its slot is written as the whole slot (1), so the
    // type's length is not read again.
    const share = lengthShare(width, slotOf(own, type, s), dpi, bodyFontPx);
    return { ...r, placement: { ...own, width: share ?? 1 } };
  });
  const outTypes = typeLength
    ? resourceTypes.map((t) => {
      const p = t.defaultPlacement;
      if (!p || !isWidthLength(p.width)) return t;
      return { ...t, defaultPlacement: withShare(p, slotOf(undefined, p, s), dpi, bodyFontPx) };
    })
    : (resourceTypes as ResourceType[]);
  return { resources: outResources, resourceTypes: outTypes };
}
