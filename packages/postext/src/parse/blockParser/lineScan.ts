// What the steps of a loop split into modules share (#1276).

/** How a step ends its turn of the loop: as `continue` or `break` would, or
 *  by falling through to the next step (undefined). */
export type StepJump = 'continue' | 'break' | undefined;

/** One turn of parseBlocks's loop over the source lines: the bindings its
 *  steps share. */
export interface LineScan {
  line: string;
  trimmed: string;
}
