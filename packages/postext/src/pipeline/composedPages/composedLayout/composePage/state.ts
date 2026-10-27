// The running state of composing a page its modules share (#1276).
import type { ComposedPageInput } from '../state.js';

/** The bindings composing a page reassigns and more than one of its modules
 *  reads: fields of one object. */
export interface ComposeState {
  input: ComposedPageInput;
}
