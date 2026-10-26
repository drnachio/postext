// The running state of parseBlocks its modules share (#1276).
import type { ComposedPageFence } from '../types.js';

/** The bindings parseBlocks reassigns while it reads the lines and that
 *  more than one of its modules reads or writes. */
export interface ParseState {
  pageFence: ComposedPageFence | undefined;
  moduleNames: Set<string>;
  moduleCounts: Map<string, number>;
  nextContainerId: number;
  pageFences: number;
  comicFences: number;
  lastDisplayEnd: number;
  interruptingDisplayAt: number;
  openListItems: readonly number[];
  i: number;
}
