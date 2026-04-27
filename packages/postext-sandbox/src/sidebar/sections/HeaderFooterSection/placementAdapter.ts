import type {
  AnchorEdge,
  Dimension,
  ElementPlacement,
  HAlign,
} from 'postext';

export type SlotKind = 'header' | 'footer' | 'heading';

const ZERO: Dimension = { value: 0, unit: 'pt' };

/** Derive a simple align (left/center/right) from a placement anchor. */
export function alignFromPlacement(placement: ElementPlacement): HAlign {
  const edge = placement.anchor.edge;
  if (edge.endsWith('-left') || edge === 'left') return 'left';
  if (edge.endsWith('-right') || edge === 'right') return 'right';
  return 'center';
}

function edgeFor(slotKind: SlotKind, align: HAlign): AnchorEdge {
  // Heading opener and footer anchor at the top of their container (band
  // grows downward from there); header anchors at the bottom (band grows
  // upward toward the body above).
  const vertical = slotKind === 'header' ? 'bottom' : 'top';
  if (align === 'left') return `${vertical}-left` as AnchorEdge;
  if (align === 'right') return `${vertical}-right` as AnchorEdge;
  return vertical;
}

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
  align: HAlign,
): ElementPlacement {
  const currentMargin = marginFromEdge(placement);
  const signedX: Dimension = align === 'right'
    ? { ...currentMargin, value: -currentMargin.value }
    : align === 'center'
      ? ZERO
      : currentMargin;
  return {
    ...placement,
    anchor: { to: 'container', edge: edgeFor(slotKind, align) },
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
  const signed: Dimension = align === 'right'
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

const ELEMENT_EDGES: AnchorEdge[] = [
  'right-of', 'left-of', 'below', 'above',
  'align-top', 'align-bottom', 'align-left', 'align-right',
];

export function isElementAnchor(placement: ElementPlacement): boolean {
  return placement.anchor.to !== 'container';
}

export function anchorTargetId(placement: ElementPlacement): string {
  const to = placement.anchor.to;
  return to === 'container' ? 'container' : to.slice(1);
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
  const prev = placement.anchor.edge;
  const edge = (ELEMENT_EDGES as string[]).includes(prev) ? (prev as AnchorEdge) : 'right-of';
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
