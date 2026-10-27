// A heading design drawn on the leaf, set on the viewer's page: the leaf's
// geometry, turned leaves, plates, scaled dimensions and the slot rebased
// to the band that stands for the leaf's top (#1276: split out of
// configOverride.ts).
import { type Dimension, type DesignSlot, dimensionToPx } from 'postext';

/** The leaf a heading design was drawn on: its size and the margins that
 *  place the design's container (the band under the text block's top-left
 *  corner) on it, in px at the viewer's DPI. */
export interface LeafGeometry {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

/** A design element as the override reads it: the placement fields it
 *  touches, typed loosely (every element kind shares them); the rest is
 *  carried through untouched. */
interface LooseElement {
  kind?: string;
  placement?: {
    anchor?: { to?: string; edge?: string };
    offset?: { x?: Dimension; y?: Dimension };
    size?: { width?: Dimension | 'fill' | 'auto'; height?: Dimension | 'fill' | 'auto' };
  };
  [key: string]: unknown;
}

/** A leaf as the flow of a vertical page sees it: x runs down the page,
 *  so the leaf's height is the frame's width and its width the frame's
 *  height, and y runs leftward from the right edge, so the right margin is
 *  the frame's top, the foot its right and the left margin its bottom. */
export function turnedLeaf(leaf: LeafGeometry): LeafGeometry {
  const m = leaf.margins;
  return {
    width: leaf.height,
    height: leaf.width,
    margins: { top: m.right, right: m.bottom, bottom: m.left, left: m.top },
  };
}

/** Whether any element of `value` anchors to the leaf itself. Such a slot
 *  is laid out against the page or bleed box on paper — a cover panel
 *  filling the trim, a band bleeding off the edge — so the viewer gives it
 *  the top of a leaf to live in (see {@link viewerHeadingDesign}). */
export function anchorsToLeaf(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(anchorsToLeaf);
  if (value === null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  if ((obj.to === 'page' || obj.to === 'bleed') && 'edge' in obj) return true;
  return Object.values(obj).some(anchorsToLeaf);
}

/** Whether the slot carries a plate: an image at least half the leaf wide
 *  (a photo opener, not a logo in a band). A box or a rule stretches with
 *  the frame it fills; a plate keeps its measure, so on a page wider than
 *  the leaf it stops short of the fills beside it. */
export function hasPlate(slot: DesignSlot, leafWidth: number, dpi: number): boolean {
  return (slot.elements as unknown as LooseElement[]).some((el) => {
    if (el.kind !== 'image') return false;
    const w = el.placement?.size?.width;
    if (w === 'fill') return true;
    return Boolean(w) && typeof w === 'object' && dimensionToPx(w, dpi) >= leafWidth / 2;
  });
}

/** Multiply every absolute dimension in `value` — offsets, sizes, type
 *  sizes, rule thicknesses, an absolute leading — by `k`, units untouched.
 *  A length in `em` / `rem` is left as it is: a design resolves it against
 *  the element's type size, which is scaled already, so scaling it too
 *  would shrink it twice (a design text's `lineHeight: { value: 1.3, unit:
 *  'em' }` would tighten its leading). Plain numbers (a line height, a
 *  font weight) and everything else are left alone. */
export function scaleDimensions(value: unknown, k: number): unknown {
  if (k === 1) return value;
  if (Array.isArray(value)) return value.map((v) => scaleDimensions(v, k));
  if (value === null || typeof value !== 'object') return value;
  const obj = value as Record<string, unknown>;
  if (typeof obj.value === 'number' && typeof obj.unit === 'string') {
    if (obj.unit === 'em' || obj.unit === 'rem') return value;
    return { ...obj, value: obj.value * k };
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) out[key] = scaleDimensions(v, k);
  return out;
}

export const px = (value: number): Dimension => ({ value, unit: 'px' });

/** How far right of its container's left edge, at most, a slot draws:
 *  the widest `offset.x + width` among its sized elements. The slot's
 *  measure on paper, which the viewer's page may be narrower than. */
export function slotExtentPx(slot: DesignSlot, dpi: number): number {
  let extent = 0;
  for (const el of slot.elements as unknown as LooseElement[]) {
    const size = el.placement?.size?.width;
    if (!size || typeof size !== 'object') continue;
    const x = el.placement?.offset?.x ? dimensionToPx(el.placement.offset.x, dpi) : 0;
    extent = Math.max(extent, x + dimensionToPx(size, dpi));
  }
  return extent;
}

/** Id of the invisible box {@link rebaseToBand} spans the band with. */
const BAND_ID = 'htmlViewerBand';

/** Re-anchor a leaf-drawn slot to the band that stands for the leaf's top
 *  on screen. The viewer's page is not a leaf — it is as wide as the
 *  measure asks and as tall as the screen or the text — so the `page` and
 *  `bleed` frames would put a cover plate or an opener panel far from the
 *  words it belongs to. The band is drawn as the top `band.height` px of
 *  the leaf: page and bleed anchors keep their offsets (a leaf's top-left
 *  is the band's), container anchors travel by the margins that placed the
 *  container on the leaf, and `fill` sizes take the frame they reached on
 *  paper. Offsets become px so the margins can be added to them.
 *
 *  Bottom anchors cannot use the container: a heading's container is its
 *  text block, measured with no floor at all, so a credit line pinned to
 *  the foot of a cover would sink the heading's reserved height past any
 *  page. They are aligned instead with the bottom of an invisible box as
 *  tall as the band. */
export function rebaseToBand(
  slot: DesignSlot,
  leaf: LeafGeometry,
  band: { height: number; container: number; fillWidth: number },
  dpi: number,
): DesignSlot {
  const { margins: m } = leaf;
  const containerW = leaf.width - m.left - m.right;
  let usesBandBox = false;
  const elements = (slot.elements as unknown as LooseElement[]).map((el) => {
    const placement = el.placement;
    if (!placement?.anchor) return el;
    const to = placement.anchor.to;
    if (to !== 'page' && to !== 'bleed' && to !== 'container') return el;
    const onLeaf = to !== 'container';
    const edge: string = placement.anchor.edge ?? 'top-left';
    const offX = placement.offset?.x ? dimensionToPx(placement.offset.x, dpi) : 0;
    const offY = placement.offset?.y ? dimensionToPx(placement.offset.y, dpi) : 0;
    const size = { ...(placement.size ?? {}) };
    // What runs past the trim on paper (a plate sized for the bleed) is cut
    // there by the guillotine; on screen it would overhang the panel it
    // sits on, so it stops at the leaf's edge.
    if (onLeaf && size.width && typeof size.width === 'object' && offX >= 0) {
      const w = dimensionToPx(size.width, dpi);
      if (offX + w > leaf.width) size.width = px(Math.max(0, leaf.width - offX));
    }
    if (size.width === 'fill') size.width = px(onLeaf ? band.fillWidth : containerW);
    if (size.height === 'fill') size.height = px(onLeaf ? band.height : band.container);
    // Where the frame's anchor point sits in the band: the leaf's is the
    // band's own; the container's lies in by the margins.
    const dx = onLeaf ? 0
      : edge.includes('left') ? m.left : edge.includes('right') ? -m.right : (m.left - m.right) / 2;
    const dy = onLeaf ? 0
      : edge.startsWith('top') ? m.top
      : edge.startsWith('bottom') ? m.top + band.container - band.height
      : m.top + band.container / 2 - band.height / 2;
    if (edge.startsWith('bottom')) {
      usesBandBox = true;
      const frameW = onLeaf ? leaf.width : containerW;
      const w = size.width && typeof size.width === 'object' ? dimensionToPx(size.width, dpi) : 0;
      // `align-bottom` pins the element's left edge to the band's; the
      // horizontal part of the edge is folded into the offset.
      const x0 = onLeaf ? 0 : m.left;
      const x = edge.includes('right') ? x0 + frameW - w : edge === 'bottom' ? x0 + (frameW - w) / 2 : x0;
      return {
        ...el,
        placement: {
          ...placement,
          anchor: { to: `#${BAND_ID}`, edge: 'align-bottom' },
          offset: { x: px(x + offX), y: px(offY + (onLeaf ? 0 : m.top + band.container - band.height)) },
          size,
        },
      };
    }
    return {
      ...el,
      placement: { ...placement, anchor: { to: 'container', edge }, offset: { x: px(offX + dx), y: px(offY + dy) }, size },
    };
  });
  if (usesBandBox) {
    elements.unshift({
      kind: 'box',
      id: BAND_ID,
      placement: {
        anchor: { to: 'container', edge: 'top-left' },
        offset: { x: px(0), y: px(0) },
        size: { width: px(leaf.width), height: px(band.height) },
      },
    });
  }
  return { ...slot, elements } as unknown as DesignSlot;
}
