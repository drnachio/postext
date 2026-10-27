import type {
  AnchorEdge,
  Dimension,
  ElementPlacement,
  HAlign,
} from 'postext';

/** Mirrors the engine's `DesignContextKind`: which placeholder set and
 *  anchor conventions a slot editor works with. `'box'` is a box style's
 *  design (#1014): laid out as a heading design, with the box's content
 *  besides (`{boxText}`). */
export type SlotKind = 'header' | 'footer' | 'heading' | 'part' | 'box';

const ZERO: Dimension = { value: 0, unit: 'pt' };

/** Where an element stands across its container: a side, the centre, or
 *  the page's start or end side (#936: the right of a right-to-left page). */
export type PlacementAlign = HAlign | 'start' | 'end';

/** Derive a simple align (left/center/right, start/end) from a placement anchor. */
export function alignFromPlacement(placement: ElementPlacement): PlacementAlign {
  const edge = placement.anchor.edge;
  if (edge.endsWith('-left') || edge === 'left') return 'left';
  if (edge.endsWith('-right') || edge === 'right') return 'right';
  if (edge.endsWith('-start') || edge === 'start') return 'start';
  if (edge.endsWith('-end') || edge === 'end') return 'end';
  return 'center';
}

function edgeFor(slotKind: SlotKind, align: PlacementAlign): AnchorEdge {
  // Heading opener and footer anchor at the top of their container (band
  // grows downward from there); header anchors at the bottom (band grows
  // upward toward the body above).
  const vertical = slotKind === 'header' ? 'bottom' : 'top';
  if (align === 'center') return vertical;
  return `${vertical}-${align}` as AnchorEdge;
}

/** Whether a margin from the side is measured leftwards (a negative x):
 *  from the right, or from the end side (whose `x` runs from the start). */
const fromFarSide = (align: PlacementAlign): boolean => align === 'right' || align === 'end';

/** Convert marginFromBody (always positive) into a signed y offset. */
export function marginFromBody(placement: ElementPlacement, slotKind: SlotKind): Dimension {
  const y = placement.offset?.y ?? ZERO;
  if (slotKind === 'header') {
    // header anchors to body edge (bottom of slot); offset.y is negative going up
    return { ...y, value: Math.abs(y.value) };
  }
  return { ...y, value: Math.abs(y.value) };
}

/** Convert marginFromEdge (always positive) from signed x offset. */
export function marginFromEdge(placement: ElementPlacement): Dimension {
  const x = placement.offset?.x ?? ZERO;
  return { ...x, value: Math.abs(x.value) };
}

export function applyAlign(
  placement: ElementPlacement,
  slotKind: SlotKind,
  align: PlacementAlign,
): ElementPlacement {
  const currentMargin = marginFromEdge(placement);
  const signedX: Dimension = fromFarSide(align)
    ? { ...currentMargin, value: -currentMargin.value }
    : align === 'center'
      ? ZERO
      : currentMargin;
  return {
    ...placement,
    // Keep a page/bleed frame target; element anchors fall back to the
    // container (align is only meaningful against a frame).
    anchor: {
      to: isElementAnchor(placement) ? 'container' : placement.anchor.to,
      edge: edgeFor(slotKind, align),
    },
    offset: {
      x: signedX,
      y: placement.offset?.y ?? ZERO,
    },
  };
}

export function applyMarginFromBody(
  placement: ElementPlacement,
  slotKind: SlotKind,
  dim: Dimension,
): ElementPlacement {
  const signed: Dimension = slotKind === 'header'
    ? { ...dim, value: -Math.abs(dim.value) }
    : { ...dim, value: Math.abs(dim.value) };
  return {
    ...placement,
    offset: {
      x: placement.offset?.x ?? ZERO,
      y: signed,
    },
  };
}

export function applyMarginFromEdge(
  placement: ElementPlacement,
  dim: Dimension,
): ElementPlacement {
  const align = alignFromPlacement(placement);
  const signed: Dimension = fromFarSide(align)
    ? { ...dim, value: -Math.abs(dim.value) }
    : align === 'center'
      ? ZERO
      : { ...dim, value: Math.abs(dim.value) };
  return {
    ...placement,
    offset: {
      x: signed,
      y: placement.offset?.y ?? ZERO,
    },
  };
}

/** Edges valid when anchoring to another element (`#id`). */
export const ELEMENT_EDGES: AnchorEdge[] = [
  'right-of', 'left-of', 'below', 'above',
  'align-top', 'align-bottom', 'align-left', 'align-right',
];

/** Edges valid when anchoring to a frame (container, page or bleed). */
export const CONTAINER_EDGES: AnchorEdge[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
];

/** The start and end edges a design slot's element may take (#936): the
 *  left of a left-to-right page, the right of a right-to-left or vertical
 *  one, on the sheet. */
export const LOGICAL_CONTAINER_EDGES: AnchorEdge[] = ['top-start', 'start', 'bottom-start', 'top-end', 'end', 'bottom-end'];
export const LOGICAL_ELEMENT_EDGES: AnchorEdge[] = ['align-start', 'align-end'];

/** Anchor targets that are frames rather than sibling elements (`outer`,
 *  the page's outer margin, in header and footer slots only). */
export type FrameTarget = 'container' | 'page' | 'bleed' | 'outer';

export function isFrameTarget(to: string): to is FrameTarget {
  return to === 'container' || to === 'page' || to === 'bleed' || to === 'outer';
}

/** Anchored to a sibling element (`#id`). */
export function isElementAnchor(placement: ElementPlacement): boolean {
  return !isFrameTarget(placement.anchor.to);
}

/** Anchored to the page or bleed frame (edge-to-edge bands). */
export function isPageFrameAnchor(placement: ElementPlacement): boolean {
  const to = placement.anchor.to;
  return to === 'page' || to === 'bleed' || to === 'outer';
}

/** Anchored to the slot's own container — the align / margin controls apply. */
export function isContainerAnchor(placement: ElementPlacement): boolean {
  return placement.anchor.to === 'container';
}

/** Value shown in the anchor-target picker: a frame name or a bare element id. */
export function anchorTargetId(placement: ElementPlacement): string {
  const to = placement.anchor.to;
  return isFrameTarget(to) ? to : to.slice(1);
}

export function applyAnchorTarget(
  placement: ElementPlacement,
  slotKind: SlotKind,
  target: string,
): ElementPlacement {
  if (target === 'container') {
    return {
      ...placement,
      anchor: { to: 'container', edge: edgeFor(slotKind, 'center') },
      offset: { x: ZERO, y: ZERO },
    };
  }
  if (target === 'page' || target === 'bleed' || target === 'outer') {
    // Moving between frames keeps the edge and offsets; coming from an
    // element anchor starts centred on the slot's natural edge.
    const prev = placement.anchor.edge;
    const fromFrame = !isElementAnchor(placement);
    const edge = fromFrame && ([...CONTAINER_EDGES, ...LOGICAL_CONTAINER_EDGES] as string[]).includes(prev)
      ? (prev as AnchorEdge)
      : edgeFor(slotKind, 'center');
    return {
      ...placement,
      anchor: { to: target, edge },
      offset: fromFrame ? (placement.offset ?? { x: ZERO, y: ZERO }) : { x: ZERO, y: ZERO },
    };
  }
  const prev = placement.anchor.edge;
  const edge = ([...ELEMENT_EDGES, ...LOGICAL_ELEMENT_EDGES] as string[]).includes(prev) ? (prev as AnchorEdge) : 'right-of';
  return {
    ...placement,
    anchor: { to: `#${target}`, edge },
    offset: placement.offset ?? { x: ZERO, y: ZERO },
  };
}

export function applyElementEdge(
  placement: ElementPlacement,
  edge: AnchorEdge,
): ElementPlacement {
  return {
    ...placement,
    anchor: { ...placement.anchor, edge },
  };
}

/** Default text alignment implied by an element-to-element anchor edge.
 *  When the element is anchored to the right of its target, text naturally
 *  flows rightward from the anchor — so "left" alignment is implied. When
 *  anchored to the left, text should hug the right edge (nearest to the
 *  target) — so "right" alignment is implied. Returns undefined for edges
 *  that don't imply a horizontal alignment. */
export function alignForElementEdge(edge: AnchorEdge): HAlign | undefined {
  if (edge === 'right-of' || edge === 'align-left') return 'left';
  if (edge === 'left-of' || edge === 'align-right') return 'right';
  return undefined;
}

export function applyOffsetX(placement: ElementPlacement, dim: Dimension): ElementPlacement {
  return { ...placement, offset: { x: dim, y: placement.offset?.y ?? ZERO } };
}

export function applyOffsetY(placement: ElementPlacement, dim: Dimension): ElementPlacement {
  return { ...placement, offset: { x: placement.offset?.x ?? ZERO, y: dim } };
}

export type PlacementSize = NonNullable<ElementPlacement['size']>;

/** Rule element width mode: 'full' when size.width === 'fill'. */
export function widthMode(size: PlacementSize | undefined): 'full' | 'custom' {
  return size?.width === 'fill' ? 'full' : 'custom';
}

export function applyWidthMode(
  size: PlacementSize | undefined,
  mode: 'full' | 'custom',
): PlacementSize {
  const base: PlacementSize = size ?? {};
  if (mode === 'full') return { ...base, width: 'fill' };
  if (typeof base.width === 'object') return base;
  return { ...base, width: { value: 40, unit: 'pt' } };
}
