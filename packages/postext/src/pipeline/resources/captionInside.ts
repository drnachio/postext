import type { Resource, ResourceType } from '../../types.js';
import { isWidthShare, placementWidthOf, widthShareIn } from '../floats/placementLength.js';

/** The picture's share of its slot when `placement.width` does not give
 *  one, for a caption set beside it inside the column. */
export const DEFAULT_CAPTION_INSIDE_WIDTH = 0.5;

/**
 * A caption set beside its picture inside the slot (`placement.captionSide:
 * 'inside'`, #1106): the share of the slot the picture takes, the caption
 * and note taking the rest after a gutter. `placement.width` (0 < w < 1)
 * gives the share, else {@link DEFAULT_CAPTION_INSIDE_WIDTH}. Undefined when
 * the resource does not ask for it, or is not a picture (bitmap, SVG,
 * video): a table keeps its caption over or under it. The callers keep the
 * slot's whole width for such a resource (they do not narrow it by
 * `placement.width`); the resource layout narrows the picture itself. A
 * turned resource, and one set upright on a vertical page, keep their
 * caption under them and their usual width. A width given as a length
 * (#1461) is measured against the slot when its width `slotPx` (and the
 * `dpi`) are given; without them the default share stands in, which is
 * enough to tell whether the caption goes inside.
 */
export function captionInsideShare(resource: Resource | undefined, type: ResourceType | undefined, slotPx?: number, dpi?: number): number | undefined {
  if (!resource) return undefined;
  const side = resource.placement?.captionSide ?? type?.defaultPlacement?.captionSide;
  if (side !== 'inside') return undefined;
  if (resource.kind !== 'bitmap' && resource.kind !== 'svg' && resource.kind !== 'video') return undefined;
  const raw = placementWidthOf(resource.placement, type?.defaultPlacement);
  if (isWidthShare(raw)) return raw;
  if (slotPx !== undefined && dpi !== undefined) {
    const share = widthShareIn(raw, slotPx, dpi);
    if (share < 1) return share;
  }
  return DEFAULT_CAPTION_INSIDE_WIDTH;
}
