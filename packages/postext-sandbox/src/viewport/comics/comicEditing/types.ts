// The comic page tools' types: a mark, a surface, the editor's options and
// handle, and the drag and key state its handlers keep (#1276: split out
// of comicEditing.ts).
import type { MutableRefObject, Dispatch } from 'react';
import type { VDTPoint, VDTDocument, Resource, VDTComicPage, VDTComicSplitter } from 'postext';
import type { SandboxAction } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import type { SandboxLabels } from '../../../types/labels.js';
import type { SplitterPosition } from '../comicDrag.js';
import type { ArtOpacity } from '../comicHit.js';
import type { TextMeasure } from '../balloonText.js';
import type { BalloonMove, TailMove } from '../comicEdits.js';

/** A shape the tools draw over a page (sheet px; `width` and `dash` in
 *  CSS px, whatever the zoom). */
export interface ComicMark {
  points: VDTPoint[];
  closed?: boolean;
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
}

/** Where the tools of one viewer draw and float. */
export interface ComicSurface {
  /** The element the toolbar, the tooltip and the splitter handles go in
   *  (positioned). */
  host: HTMLElement;
  /** The pages whose splitters get keyboard handles now. */
  pages(): number[];
  /** Draw a page's marks (null: take them off). */
  paint(pageIndex: number, marks: ComicMark[] | null): void;
  /** Put a floating element (absolutely positioned in `host`) at a sheet
   *  point of a page; false when the point is not on screen. `counter`
   *  undoes a zoom applied to the host so the element keeps its size. */
  place(el: HTMLElement, pageIndex: number, x: number, y: number): boolean;
  /** Sheet px per CSS px on a page (hit bands and line widths). */
  sheetPxPerCssPx(pageIndex: number): number;
}

export interface ComicEditOptions {
  surface: ComicSurface;
  docRef: MutableRefObject<VDTDocument | null>;
  /** The composed book a page's offsets belong to. */
  sourceOfPage: (pageIndex: number) => ComposedBook | null;
  dispatchRef: MutableRefObject<Dispatch<SandboxAction>>;
  resourcesRef?: MutableRefObject<Resource[] | null>;
  labelsRef: MutableRefObject<SandboxLabels>;
  /** Whether the tools are on now (the Folio: its select mode). */
  enabled: () => boolean;
  /** Whether a press on a balloon's words selects them, a click on a
   *  balloon puts the caret in its line and one on a panel's picture opens
   *  it (the Folio: its select and magnify modes, #797); `enabled` when
   *  left out. */
  textEnabled?: () => boolean;
  /** A drag ended (released, cancelled, Escape): the caller lets the
   *  pointer go. */
  onDragEnd?: (pointerId: number) => void;
  /** Whether a pop-out cut-out shows ink at a point (its opaque pixels
   *  open it); the image registry's pictures when left out. */
  artOpacity?: ArtOpacity;
  /** How the balloon words are measured; a canvas 2D context in the
   *  language the document's text is measured in when left out. */
  measure?: TextMeasure;
}

/** The words of a balloon pressed at a point (#595): the caret's source
 *  offset there, and where a selection dragged from it ends at another
 *  point (held to the same balloon's words). */
export interface BalloonTextPress {
  offset: number;
  head(at: ComicPointer | null): number | null;
}

/** A page point under the pointer. */
export interface ComicPointer {
  pageIndex: number;
  x: number;
  y: number;
}

export interface ComicEditor {
  /** A press: true when it grabbed a splitter, a balloon or a tail tip
   *  (the caller captures the pointer and leaves the text alone). */
  pointerDown(ev: PointerEvent, at: ComicPointer | null): boolean;
  /** A move while nothing is pressed: the resize cursor over a splitter,
   *  `move` over a balloon (`text` over its words), `crosshair` over a
   *  tail tip, `pointer` over a panel's picture (null elsewhere), the
   *  panel toolbar over a panel. */
  hover(ev: PointerEvent, at: ComicPointer | null): string | null;
  /** A move while a splitter, a balloon or a tail tip is held. */
  dragMove(ev: PointerEvent, at: ComicPointer | null): void;
  /** The press ends: the line is written (or not, `cancel`). False when
   *  the press was a plain click on a balloon (it never moved): the click
   *  is then the text's (the caret goes to the balloon's line). A second
   *  click on a pinned balloon right after the first unpins it (the page
   *  gets no `dblclick`: the press's default is prevented). */
  pointerUp(ev: PointerEvent, cancel?: boolean): boolean;
  /** The source offset of the balloon (or tail tip) under a point, for a
   *  click to put the caret there: the character's on its words (#595),
   *  else its script line's; null off them. */
  balloonSourceAt(at: ComicPointer | null): number | null;
  /** The words of a balloon under a point (#595): a press there selects
   *  text instead of dragging the balloon. Null off its glyphs (its body
   *  round them, its tail), or where its words do not map back. */
  balloonText(at: ComicPointer | null): BalloonTextPress | null;
  /** The resource of the panel picture under a point (#594): its art, or
   *  its pop-out cut-out where that shows; null on a balloon, a split
   *  line, a gutter or a panel with no picture. */
  panelArtAt(at: ComicPointer | null): string | null;
  dragging(): boolean;
  /** Whether a splitter lies under a point. */
  onSplitter(at: ComicPointer | null): boolean;
  /** The pointer left the pages. */
  leave(): void;
  /** Rebuild the keyboard handles from the current document. */
  sync(): void;
}

export interface DragState {
  page: number;
  comic: VDTComicPage;
  splitter: VDTComicSplitter;
  grab: VDTPoint;
  pointerId: number;
  pos: SplitterPosition;
  moved: boolean;
}

export interface KeyState {
  page: number;
  /** The fence of the comic the line belongs to (a page, a strip). */
  comicStart: number;
  splitter: VDTComicSplitter;
  pos: SplitterPosition;
}

export interface BalloonDrag extends BalloonMove {
  grab: VDTPoint;
  pointerId: number;
  moved: boolean;
  /** Alt on a sound effect: the drag turns it. */
  turning: boolean;
}

export interface TailDrag extends TailMove {
  grab: VDTPoint;
  pointerId: number;
  moved: boolean;
}
