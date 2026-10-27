// The running state of a placement pass's setup its modules share (#1278).
import type { ResolvedConfig } from '../../../vdt.js';

/** The bindings a pass reassigns while it places blocks and that more than
 *  one of its modules reads or writes: fields of one object, set where the
 *  pass first sets them. */
export interface PassSetupState {
  resolved: ResolvedConfig;
}
