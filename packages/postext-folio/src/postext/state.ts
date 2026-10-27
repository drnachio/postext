// The running state of the document book its modules share (#1276).
import type { VDTDocument } from 'postext';
import type { SweepRun } from './sweep.js';
import type { PagePlayer } from './constants.js';
import type { FolioViewer } from '../viewer/types.js';

/** The bindings the document book reassigns and more than one of its modules
 *  reads or writes: fields of one object. */
export interface FolioDocumentState {
  current: VDTDocument;
  canvases: (HTMLCanvasElement | null)[];
  decorated: (HTMLCanvasElement | null)[];
  painted: Map<number, number>;
  focus: number[];
  idle: number;
  settled: number[];
  sweep: number[];
  sweepFrame: number;
  run: SweepRun | null;
  turning: boolean;
  ready: boolean;
  players: PagePlayer[];
  autoTimer: number;
  sharpFrame: number;
}

/** What a module of the document book calls before the book has made it:
 *  filled as soon as each one exists. */
export interface FolioDocumentLate {
  viewer: FolioViewer;
}
