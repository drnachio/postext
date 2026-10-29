// Boxes and anchors: padding and box resolution, the anchor dependency
// graph, anchor edges against the container or another element, and fixed
// or filled sizes (#1276: split out of layout.ts).
import { physicalEdge } from '../logicalEdges.js';
import type { Dimension, ElementBoxStyle, ElementPlacement, ResolvedPlacedDesignElement, AnchorEdge, ElementSize } from '../../types.js';
import { dimensionToPx } from '../../units.js';
import { isCornerRadii, uniformRadius, normalizeBoxStyle, cornerRadiiPx, borderSidesPx } from '../boxShape.js';
import { type BoundingBox, createBoundingBox } from '../../vdt.js';
import type { ResolvedPadding, ResolvedElementBox, DesignFrames, LayoutIssue } from './primitives.js';
import { isSizeTo } from './slot.js';

export function dimPx(d: Dimension | undefined, dpi: number, baseFontSizePx?: number): number {
  if (!d) return 0;
  return dimensionToPx(d, dpi, baseFontSizePx);
}

function resolvePadding(
  padding: ElementBoxStyle['padding'],
  dpi: number,
  baseFontSizePx?: number,
): ResolvedPadding {
  return {
    top: dimPx(padding?.top, dpi, baseFontSizePx),
    right: dimPx(padding?.right, dpi, baseFontSizePx),
    bottom: dimPx(padding?.bottom, dpi, baseFontSizePx),
    left: dimPx(padding?.left, dpi, baseFontSizePx),
  };
}

export function resolveBox(
  style: ElementBoxStyle | undefined,
  dpi: number,
  baseFontSizePx?: number,
): ResolvedElementBox | undefined {
  if (!style) return undefined;
  const padding = resolvePadding(style.padding, dpi, baseFontSizePx);
  if (!isCornerRadii(style.borderRadius) && style.borderSides === undefined) {
    return {
      backgroundColor: style.backgroundColor?.hex,
      borderColor: style.borderColor?.hex,
      borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
      borderRadiusPx: dimPx(uniformRadius(style.borderRadius), dpi, baseFontSizePx),
      padding,
    };
  }
  // Corners of their own and a border per side (#1059), folded back to
  // the plain fields where they say no more.
  const toPx = (d: Dimension) => dimPx(d, dpi, baseFontSizePx);
  const whole = { enabled: true, color: style.borderColor, width: style.borderWidth };
  const shape = normalizeBoxStyle({
    backgroundColor: style.backgroundColor?.hex,
    borderColor: style.borderColor?.hex,
    borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
    borderRadiusPx: 0,
    borderRadiiPx: cornerRadiiPx(style.borderRadius, toPx),
    ...(style.borderSides !== undefined ? { borderSides: borderSidesPx(whole, style.borderSides, toPx) } : {}),
  });
  return { ...shape, padding };
}

// ---------------------------------------------------------------------------
// Anchor dependency graph
// ---------------------------------------------------------------------------

export function anchorTargetId(placement: ElementPlacement): string | undefined {
  const to = placement.anchor.to;
  if (to === 'container' || to === 'page' || to === 'bleed' || to === 'outer') return undefined;
  return to.slice(1);
}

/** The elements a placement's sizes run to (`{ to: '#id', edge }`, #928). */
export function sizeTargetIds(placement: ElementPlacement): string[] {
  const size = placement.size;
  if (!size) return [];
  const out: string[] = [];
  for (const v of [size.width, size.height, size.maxWidth, size.minHeight]) {
    if (typeof v === 'object' && v !== null && 'to' in v && typeof v.to === 'string' && v.to.startsWith('#')) out.push(v.to.slice(1));
  }
  return out;
}

/** The page-level frame an element anchors to, or `undefined` for
 *  container / element anchors (and when no frames were supplied). */
export function frameFor(placement: ElementPlacement, frames: DesignFrames | undefined): AnchorReference | undefined {
  if (!frames) return undefined;
  const to = placement.anchor.to;
  if (to === 'page') return frames.page;
  if (to === 'bleed') return frames.bleed;
  if (to === 'outer') return frames.outer;
  return undefined;
}

export function topoSort(
  elements: ResolvedPlacedDesignElement[],
  issues: LayoutIssue[],
  named?: DesignFrames['named'],
): ResolvedPlacedDesignElement[] {
  const byId = new Map<string, ResolvedPlacedDesignElement>();
  for (const el of elements) byId.set(el.id, el);

  // Detect dangling
  for (const el of elements) {
    const target = anchorTargetId(el.placement);
    if (target && !byId.has(target) && !named?.[target]) {
      issues.push({ kind: 'danglingAnchor', elementId: el.id, targetId: target });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: ResolvedPlacedDesignElement[] = [];

  function visit(el: ResolvedPlacedDesignElement, path: string[]): void {
    if (visited.has(el.id)) return;
    if (visiting.has(el.id)) {
      issues.push({ kind: 'cyclicAnchor', elementId: el.id });
      return;
    }
    visiting.add(el.id);
    const target = anchorTargetId(el.placement);
    if (target) {
      const dep = byId.get(target);
      if (dep) visit(dep, [...path, el.id]);
    }
    // An element whose size runs to another's edge (#928) comes after it.
    for (const id of sizeTargetIds(el.placement)) {
      const dep = byId.get(id);
      if (dep && dep !== el) visit(dep, [...path, el.id]);
    }
    visiting.delete(el.id);
    visited.add(el.id);
    out.push(el);
  }

  for (const el of elements) visit(el, []);
  return out;
}

// ---------------------------------------------------------------------------
// Anchor edge resolution — compute (anchorX, anchorY) and which element edge
// sits at that anchor. The element's extent grows from that anchor point.
// ---------------------------------------------------------------------------

export interface AnchorReference {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Pin = 'start' | 'middle' | 'end';

export interface AnchorResult {
  /** Anchor point on the reference (absolute coordinates). */
  anchorX: number;
  anchorY: number;
  /** How the element aligns against the anchor. `start` = anchor is at element's
   *  top/left edge; `end` = anchor at bottom/right; `middle` = centered. */
  pinX: Pin;
  pinY: Pin;
}

export function resolveContainerAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  // Container-relative nine-point grid: pin the corresponding corner of the
  // element to the corresponding point of the container.
  switch (edge) {
    case 'top-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'top':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y, pinX: 'middle', pinY: 'start' };
    case 'top-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height / 2, pinX: 'start', pinY: 'middle' };
    case 'center':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height / 2, pinX: 'middle', pinY: 'middle' };
    case 'right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height / 2, pinX: 'end', pinY: 'middle' };
    case 'bottom-left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'bottom':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height, pinX: 'middle', pinY: 'end' };
    case 'bottom-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height, pinX: 'end', pinY: 'end' };
    default:
      // Fallback when an element-to-element edge was set with anchor.to = 'container'.
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

export const ELEMENT_TO_ELEMENT_EDGES: ReadonlySet<string> = new Set(['right-of', 'left-of', 'below', 'above', 'align-top', 'align-bottom', 'align-left', 'align-right']);

export function resolveElementAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  switch (edge) {
    case 'right-of':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'left-of':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'below':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'start' };
    case 'above':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'end' };
    case 'align-top':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-bottom':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'align-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    default:
      // Fallback when a container edge was set with anchor.to = '#id' — treat
      // as align-top (match target's top-left).
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

// ---------------------------------------------------------------------------
// Size resolution helpers
// ---------------------------------------------------------------------------

export function resolveFixedSize(
  size: ElementSize | undefined,
  dpi: number,
  baseFontSizePx?: number,
): number | 'auto' | 'fill' | undefined {
  if (size === undefined) return undefined;
  if (size === 'auto' || size === 'fill') return size;
  // A `{ to, edge }` size is turned into px before layout (`withSizesTo`).
  if (isSizeTo(size)) return 'fill';
  return dimPx(size, dpi, baseFontSizePx);
}

// Clamp helper — returns x + w bounded by container edge when pin is 'start'
// (element extends to the right/down), etc.
export function fillToContainerEdge(
  anchorX: number,
  pinX: Pin,
  container: AnchorReference,
): number {
  if (pinX === 'start') return container.x + container.width - anchorX;
  if (pinX === 'end') return anchorX - container.x;
  // middle: distance to nearest edge * 2
  const leftDist = anchorX - container.x;
  const rightDist = container.x + container.width - anchorX;
  return Math.min(leftDist, rightDist) * 2;
}

export function fillToContainerEdgeY(
  anchorY: number,
  pinY: Pin,
  container: AnchorReference,
): number {
  if (pinY === 'start') return container.y + container.height - anchorY;
  if (pinY === 'end') return anchorY - container.y;
  const topDist = anchorY - container.y;
  const botDist = container.y + container.height - anchorY;
  return Math.min(topDist, botDist) * 2;
}

/** Box of `width` × `height` pinned to `edge` of `ref` (the container
 *  nine-point grid, plus `offset`). Element-to-element edges fall back to
 *  `top-left`. Shared by design slots and fixed-position callouts. */
export function anchorBox(
  edge: AnchorEdge,
  ref: AnchorReference,
  width: number,
  height: number,
  offset: { x: number; y: number },
): BoundingBox {
  // A fixed box is laid in the page's flow, where the start is the left.
  const a = resolveContainerAnchor(physicalEdge(edge, false), ref);
  return createBoundingBox(
    edgeXFromPin(a.anchorX, a.pinX, width) + offset.x,
    edgeYFromPin(a.anchorY, a.pinY, height) + offset.y,
    width,
    height,
  );
}

export function edgeXFromPin(anchorX: number, pinX: Pin, width: number): number {
  if (pinX === 'start') return anchorX;
  if (pinX === 'end') return anchorX - width;
  return anchorX - width / 2;
}

export function edgeYFromPin(anchorY: number, pinY: Pin, height: number): number {
  if (pinY === 'start') return anchorY;
  if (pinY === 'end') return anchorY - height;
  return anchorY - height / 2;
}
