// Where the elements of a heading design stand on the page, roughly
// (#1444): enough to read them in order (top to bottom, then from the
// side lines start on) without laying the design out. Each element's box
// follows its anchor (the slot's container, the page, the bleed, another
// element) with its offset and size; a text is as tall as its lines at
// about half an em a letter, a picture as its resource's proportions.

import { physicalPlacement } from '../../../design/logicalEdges.js';
import {
  anchorTargetId,
  edgeXFromPin,
  edgeYFromPin,
  fillToContainerEdge,
  fillToContainerEdgeY,
  resolveContainerAnchor,
  resolveElementAnchor,
  topoSort,
  type AnchorReference,
} from '../../../design/layout/geometry.js';
import type { Dimension, ElementSize, Resource, ResolvedDesignElement, ResolvedPlacedDesignElement } from '../../../types.js';
import { px, type Units } from '../wml.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The frames a design is placed against, px: the trim box (`page`, the
 *  bleed too) and the slot's container (the text area under its top). */
export interface DesignFrames {
  page: Box;
  container: Box;
}

const isDim = (s: ElementSize | undefined): s is Dimension => typeof s === 'object' && s !== null && 'value' in s && 'unit' in s;

/** The resolved text of each text element (to size its box). */
export type TextOf = (id: string) => string;

/** Every placed element's estimated box, by id. */
export function estimateBoxes(
  elements: readonly ResolvedDesignElement[],
  frames: DesignFrames,
  u: Units,
  textOf: TextOf,
  resources: ReadonlyMap<string, Resource>,
  imageId: (el: Extract<ResolvedDesignElement, { kind: 'image' }>) => string | undefined,
  startRight: boolean,
): Map<string, Box> {
  const placed = elements.filter((e): e is ResolvedPlacedDesignElement => e.kind !== 'connector');
  const out = new Map<string, Box>();
  const refOf = (to: string): AnchorReference => {
    if (to === 'page' || to === 'bleed' || to === 'outer') return frames.page;
    if (to.startsWith('#')) return out.get(to.slice(1)) ?? frames.container;
    return frames.container;
  };
  for (const raw of topoSort(placed, [])) {
    const el = { ...raw, placement: physicalPlacement(raw.placement, startRight) } as ResolvedPlacedDesignElement;
    const p = el.placement;
    const ref = refOf(p.anchor.to);
    const target = anchorTargetId(p);
    const a = target && out.has(target) ? resolveElementAnchor(p.anchor.edge, ref) : resolveContainerAnchor(p.anchor.edge, ref);
    const frame = p.anchor.to === 'page' || p.anchor.to === 'bleed' ? frames.page : frames.container;
    const size = p.size ?? {};
    const sizeTo = (s: ElementSize | undefined, axis: 'x' | 'y'): number | undefined => {
      if (typeof s !== 'object' || s === null || !('to' in s)) return undefined;
      const r = refOf(s.to);
      if (axis === 'x') return Math.max(0, (s.edge === 'left' ? r.x : s.edge === 'center' ? r.x + r.width / 2 : r.x + r.width) - a.anchorX);
      return Math.max(0, (s.edge === 'top' ? r.y : s.edge === 'center' ? r.y + r.height / 2 : r.y + r.height) - a.anchorY);
    };
    let width = isDim(size.width) ? px(u, size.width) : size.width === 'fill' ? fillToContainerEdge(a.anchorX, a.pinX, frame) : sizeTo(size.width, 'x');
    let height = isDim(size.height) ? px(u, size.height) : size.height === 'fill' ? fillToContainerEdgeY(a.anchorY, a.pinY, frame) : sizeTo(size.height, 'y');
    if (el.kind === 'text') {
      const fontPx = px(u, el.fontSize) || u.basePx;
      const text = textOf(el.id);
      const lineH = el.lineHeightLength ? px(u, el.lineHeightLength, fontPx) : fontPx * (el.lineHeight || 1.2);
      const longest = Math.max(1, ...text.split('\n').map((l) => l.length));
      width ??= Math.min(frame.width, longest * fontPx * 0.5);
      const w = Math.max(fontPx, width);
      const lines = text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil((l.length * fontPx * 0.5) / w)), 0);
      height ??= lines * lineH;
    } else if (el.kind === 'image') {
      const id = imageId(el);
      const res = id ? resources.get(id) : undefined;
      const natural = res?.bitmap ?? res?.svg;
      const ratio = natural?.width && natural.height ? natural.height / natural.width : 0.66;
      width ??= height !== undefined ? height / ratio : frame.width;
      height ??= width * ratio;
    } else if (el.kind === 'rule') {
      const t = px(u, el.thickness) || 1;
      if (el.direction === 'vertical') {
        width ??= t;
        height ??= frame.height;
      } else {
        width ??= frame.width;
        height ??= t;
      }
    }
    width ??= 0;
    height ??= 0;
    const ox = p.offset?.x ? px(u, p.offset.x, u.basePx) : 0;
    const oy = p.offset?.y ? px(u, p.offset.y, u.basePx) : 0;
    out.set(el.id, { x: edgeXFromPin(a.anchorX, a.pinX, width) + ox, y: edgeYFromPin(a.anchorY, a.pinY, height) + oy, width, height });
  }
  return out;
}

/** Reading order of boxes: top to bottom (tops within a couple of
 *  millimetres read as one line), then from the side the lines start on. */
export function readingOrder<T extends { box: Box }>(items: readonly T[], startRight: boolean, u: Units): T[] {
  const tolerance = (2 * u.dpi) / 25.4;
  return [...items].sort((a, b) => {
    const dy = a.box.y - b.box.y;
    if (Math.abs(dy) > tolerance) return dy;
    return startRight ? b.box.x + b.box.width - (a.box.x + a.box.width) : a.box.x - b.box.x;
  });
}

/** Whether box `inner`'s middle lies inside `outer`. */
export function covers(outer: Box, inner: Box): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height;
}
