// The running state of a page's frame editor its modules share (#1276).
import type { Drag } from './shared.js';
import type { Rect } from '../../../templates/frameGeometry.js';

/** The bindings a page's frame editor reassigns and more than one of its
 *  modules reads or writes: fields of one object. */
export interface FrameEditorState {
  question: HTMLElement | null;
  drag: Drag | null;
  pending: Rect | null;
}

/** What a module of the frame editor calls before the editor has made it:
 *  filled as soon as each one exists. */
export interface FrameEditorLate {
  closeQuestion: () => void;
}
