// The label editor's types: its refs, a label's point, the surface it
// paints on, its options, a pointer, the editor and a drag (#1276: split
// out of labelAnchorEditor.ts).
import type { MutableRefObject, Dispatch } from 'react';
import type { VDTDocument } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { PageLabel } from '../labelAnchorGeometry.js';
import type { MarkShape } from '../labelMarks.js';

export interface LabelAnchorEditorRefs {
  docRef: MutableRefObject<VDTDocument | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  labelsRef?: MutableRefObject<SandboxLabels>;
  /** The book a page was laid out from, for the Markdown a label placed by
   *  percentages is rewritten in (#931). */
  sourceOfPage?: (pageIndex: number) => ComposedBook | null;
}

/** A point on a page of the document, in sheet pixels. */
export interface LabelPoint {
  pageIndex: number;
  x: number;
  y: number;
}

/** Where an editor paints and how big a pixel is there. */
export interface LabelSurface {
  /** Paint the marks of page `pageIndex` as the editor has them, in sheet
   *  px; null: the editor has nothing of its own to show on the page (a
   *  host that paints the label marks itself shows its own). */
  paint(pageIndex: number, shapes: MarkShape[] | null): void;
  /** Sheet px for one CSS px on screen at the page: how near a press must
   *  be to a point to take it, how far it must travel to be a drag. */
  sheetPxPerCssPx(pageIndex: number): number;
  /** The sheet px of one CSS px the marks are drawn at; `sheetPxPerCssPx`
   *  when left out. */
  markScale?(pageIndex: number): number;
}

export interface LabelEditorOptions {
  surface: LabelSurface;
  docRef: MutableRefObject<VDTDocument | null>;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  labelsRef?: MutableRefObject<SandboxLabels>;
  sourceOfPage?: (pageIndex: number) => ComposedBook | null;
  /** Whether labels can be edited now, besides Design mode (which the
   *  editor asks of itself): always, when left out. */
  enabled?: () => boolean;
  /** Pages whose label marks the editor paints at rest (the preview draws
   *  them itself). On any other page it paints only while a label of it is
   *  under the pointer or dragged, and hands the page back to the host's own
   *  marks (null) after. */
  restPages?: readonly number[];
  /** Keep the label last pressed marked (the preview does; the Folio's
   *  pages are repainted for the pointer alone). */
  keepActive?: boolean;
  /** A press the editor took ended (dropped or cancelled): the host frees
   *  its pointer capture. */
  onDragEnd?: (pointerId: number) => void;
}

/** What the editor needs of a pointer event. */
export interface LabelPointer {
  pointerId: number;
  /** `mouse`, `touch` or `pen`; a mouse when left out. */
  pointerType?: string;
  clientX: number;
  clientY: number;
  /** Alt held: the drag sets the label away from its point (#1064). */
  altKey?: boolean;
}

export interface LabelEditor {
  /** A press: true when a label took it (drag begun). */
  pointerDown(ev: LabelPointer, at: LabelPoint): boolean;
  /** The pointer moves without a button: whether a label is under it. */
  hover(at: LabelPoint | null): boolean;
  dragging(): boolean;
  /** The pointer moves while a label is held. */
  dragMove(ev: LabelPointer, at: LabelPoint | null): void;
  /** The press ends: the label is dropped where it was dragged, or its
   *  picture opened when it did not move. */
  pointerUp(ev: LabelPointer, cancelled: boolean): void;
  /** A double click on an anchored label opens its anchor editor. */
  dblclick(at: LabelPoint): boolean;
  /** Leave a drag (Escape). */
  cancel(): void;
  /** The pointer left the pages. */
  leave(): void;
  /** Read the labels again and paint (a relayout, a mode switch). */
  sync(): void;
  /** Paint again with the labels as they are (the label marked changed). */
  repaint(): void;
  dispose(): void;
}

export interface Drag {
  pointerId: number;
  pointerType: string | undefined;
  label: PageLabel;
  pageIndex: number;
  startX: number;
  startY: number;
  startClientX: number;
  startClientY: number;
  started: boolean;
  dx: number;
  dy: number;
  /** The drop writes `labelAt` (#1064). */
  away: boolean;
}
