// Types of a page's run its modules share (#1276).
import type { ResolvedFrame } from '../../../../../composed/types.js';
import type { StoryState } from '../../state.js';

  /** Where a frame's story stands when the frame is reached. */
  export interface Prep {
    frame: ResolvedFrame;
    st: StoryState | undefined;
    before: string | undefined;
    holds: boolean;
    continuation: boolean;
    blockId: string;
    /** "Continued from page …" at its head (#917). */
    fromMark?: string;
  }
