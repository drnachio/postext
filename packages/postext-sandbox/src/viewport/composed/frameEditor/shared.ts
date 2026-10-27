// The frame editor's sizes, colours, refs and drag state, the grip under
// a pointer, SVG elements and a page's template (#1276: split out of
// frameEditor.ts).
import type { MutableRefObject, Dispatch } from 'react';
import { type VDTDocument, type VDTFrame, type PostextConfig, type VDTComposedPage, type ResolvedPageTemplate, resolvePageTemplate } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { Rect, Handle } from '../../../templates/frameGeometry.js';
import type { FrameDragKind } from '../../../templates/frameEvents.js';
import type { FrameAnchorPoint } from '../labelAnchorGeometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** CSS px a pointer may travel before a press becomes a drag. */
export const DRAG_START_CSS_PX = 3;
/** CSS px within which a handle is grabbed and a side snaps. */
export const HANDLE_CSS_PX = 7;
export const SNAP_CSS_PX = 6;
/** Smallest frame drawn, CSS px. */
export const MIN_DRAW_CSS_PX = 8;

export const COLORS = {
  frame: '#2f6fd6',
  frameMuted: 'rgba(47, 111, 214, 0.55)',
  margin: 'rgba(214, 72, 47, 0.7)',
  area: 'rgba(47, 111, 214, 0.35)',
  grid: 'rgba(47, 111, 214, 0.08)',
  gutter: 'rgba(214, 72, 47, 0.18)',
  chain: '#c26a00',
  guide: '#d6482f',
  ghost: 'rgba(47, 111, 214, 0.12)',
  label: '#ffffff',
  // A connector's ends (#1063): its start filled, the ends it goes to open.
  connector: '#b3127a',
  pointer: '#0f766e',
};
/** CSS px from the selected frame's side to its pointer grip, its radius,
 *  and how near an anchor the pointer must be dropped. */
export const GRIP_GAP_CSS_PX = 12;
export const GRIP_CSS_PX = 6;
export const ANCHOR_DROP_CSS_PX = 14;

/** Where the pointer grip of a frame stands (flow px): beside the middle of
 *  its end side, `gap` out. */
export function pointerGripOf(rect: Rect, gap: number): { x: number; y: number } {
  return { x: rect.x + rect.width + gap, y: rect.y + rect.height / 2 };
}

export interface FrameEditorRefs {
  docRef: MutableRefObject<VDTDocument | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  sourceRef: MutableRefObject<ComposedBook | null>;
  pageSourceRef?: MutableRefObject<((pageIndex: number) => ComposedBook | null) | null>;
  labelsRef?: MutableRefObject<SandboxLabels>;
}

export interface Drag {
  pointerId: number;
  kind: 'frame' | 'draw' | 'pointer';
  handle: Handle;
  frame?: VDTFrame;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  started: boolean;
  rect: Rect;
  guideX?: number;
  guideY?: number;
  /** A pointer being drawn (#1064): the pointer on the sheet and the anchor
   *  under it. */
  sheet?: { x: number; y: number };
  target?: FrameAnchorPoint | null;
}

export interface Instance {
  slot: HTMLElement;
  paint(): void;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The template a composed page is set with, resolved for its side. */
export function pageTemplate(config: PostextConfig, composed: VDTComposedPage): ResolvedPageTemplate | undefined {
  return resolvePageTemplate(config, composed.template, { ...(composed.variant ? { parity: composed.variant } : {}), ...(composed.modules ? { modules: composed.modules } : {}) });
}

export const dragKind = (d: { kind: 'frame' | 'draw' | 'pointer'; handle: Handle }): FrameDragKind => (d.kind === 'draw' ? 'draw' : d.handle === 'move' ? 'move' : 'resize');
