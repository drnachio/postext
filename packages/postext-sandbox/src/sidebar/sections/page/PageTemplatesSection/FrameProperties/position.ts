// A frame's position in the Frame properties: what it may be anchored to,
// the edges it may take and the anchor change that keeps or resets the edge.
import type { AnchorEdge, Dimension, ElementPlacement, FrameConfig, ResolvedFrame } from 'postext';
import type { SandboxLabels } from '../../../../../types/labels.js';

export const MM0: Dimension = { value: 0, unit: 'mm' };
export const NINE_POINT: AnchorEdge[] = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
export const ELEMENT_EDGES: AnchorEdge[] = ['below', 'above', 'right-of', 'left-of', 'align-top', 'align-bottom', 'align-left', 'align-right'];

/** What createFramePosition takes from the component. */
export interface FramePositionDeps {
  labels: SandboxLabels;
  frame: ResolvedFrame;
  set: (patch: Partial<Record<keyof FrameConfig, unknown>>) => void;
  others: string[];
  groups: string[];
}

export function createFramePosition(deps: FramePositionDeps) {
  const {
    labels, frame, set, others, groups
  } = deps;
  // --- Position ----------------------------------------------------------
  const placement = frame.placement;
  const anchorTo = placement?.anchor.to ?? 'none';
  const anchorOptions = [
    { value: 'none', label: labels.pageTemplatesAnchorWhole },
    { value: 'container', label: labels.pageTemplatesAnchorArea },
    { value: 'page', label: labels.headerFooterAnchorToPage },
    { value: 'bleed', label: labels.headerFooterAnchorToBleed },
    ...others.map((n) => ({ value: `#${n}`, label: labels.pageTemplatesAnchorFrame.replace('__name__', n) })),
    ...groups.map((n) => ({ value: `#${n}`, label: labels.pageTemplatesAnchorGroup.replace('__name__', n) })),
  ];
  if (!anchorOptions.some((o) => o.value === anchorTo)) anchorOptions.push({ value: anchorTo, label: anchorTo });
  const edgeLabel: Record<string, string> = {
    'top-left': labels.headerFooterFrameEdgeTopLeft,
    top: labels.headerFooterFrameEdgeTop,
    'top-right': labels.headerFooterFrameEdgeTopRight,
    left: labels.headerFooterFrameEdgeLeft,
    center: labels.headerFooterFrameEdgeCenter,
    right: labels.headerFooterFrameEdgeRight,
    'bottom-left': labels.headerFooterFrameEdgeBottomLeft,
    bottom: labels.headerFooterFrameEdgeBottom,
    'bottom-right': labels.headerFooterFrameEdgeBottomRight,
    'right-of': labels.headerFooterElementEdgeRightOf,
    'left-of': labels.headerFooterElementEdgeLeftOf,
    below: labels.headerFooterElementEdgeBelow,
    above: labels.headerFooterElementEdgeAbove,
    'align-top': labels.headerFooterElementEdgeAlignTop,
    'align-bottom': labels.headerFooterElementEdgeAlignBottom,
    'align-left': labels.headerFooterElementEdgeAlignLeft,
    'align-right': labels.headerFooterElementEdgeAlignRight,
  };
  const toFrame = anchorTo.startsWith('#');
  const edges = toFrame ? [...ELEMENT_EDGES, ...NINE_POINT] : NINE_POINT;
  const setPlacement = (next: ElementPlacement | undefined) => set({ placement: next });
  const onAnchor = (to: string) => {
    if (to === 'none') return setPlacement(undefined);
    const element = to.startsWith('#');
    // The edge is kept between targets of one kind (frame to frame, area to
    // page); a frame anchored to another starts below it.
    const keep = placement && placement.anchor.to.startsWith('#') === element && (element ? [...ELEMENT_EDGES, ...NINE_POINT] : NINE_POINT).includes(placement.anchor.edge);
    setPlacement({
      ...(placement ?? {}),
      anchor: { to: to as ElementPlacement['anchor']['to'], edge: keep ? placement!.anchor.edge : element ? 'below' : 'top-left' },
      offset: placement?.offset ?? { x: MM0, y: MM0 },
    });
  };
  return {
    placement, anchorTo, anchorOptions, edgeLabel, toFrame, edges, setPlacement, onAnchor
  };
}
