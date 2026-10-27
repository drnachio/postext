// The running state of the comic editor its modules share (#1276).
import type { VDTComicSplitter, VDTComicPanel, VDTComicBalloon, VDTComicPage, VDTPoint } from 'postext';
import type { DragState, KeyState, TailDrag, BalloonDrag } from './types.js';
import type { TailMove, BalloonMove } from '../comicEdits.js';

/** The bindings the comic editor reassigns and more than one of its modules
 *  reads or writes: fields of one object. */
export interface ComicEditorState {
  disposed: boolean;
  hover: { page: number; splitter?: VDTComicSplitter; panel?: VDTComicPanel; balloons?: VDTComicBalloon[]; tail?: VDTComicBalloon } | null;
  drag: DragState | null;
  key: KeyState | null;
  focused: { page: number; splitter: VDTComicSplitter } | null;
  tdrag: TailDrag | null;
  tkey: TailMove | null;
  tfocused: { page: number; comic: VDTComicPage; balloon: VDTComicBalloon; tip: VDTPoint } | null;
  pfocused: { page: number; panel: VDTComicPanel } | null;
  bdrag: BalloonDrag | null;
  bkey: BalloonMove | null;
  bfocused: { page: number; members: VDTComicBalloon[] } | null;
  lastTap: { key: string; time: number; x: number; y: number } | null;
  lastLetterboxed: number[];
  barPanel: { page: number; panel: VDTComicPanel; comic: VDTComicPage } | null;
  barFromHandle: boolean;
  handlesKey: string;
}

/** What a module of the comic editor calls before the editor has made it:
 *  filled as soon as each one exists. */
export interface ComicEditorLate {
  handles: HTMLDivElement;
}
