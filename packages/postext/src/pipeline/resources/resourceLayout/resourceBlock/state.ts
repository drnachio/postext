// The running state of layoutResourceBlockIn its modules share (#1276).
import type { VDTLine } from '../../../../vdt.js';

/** The bindings a pass reassigns while it places blocks and that more than
 *  one of its modules reads or writes: fields of one object, set where the
 *  pass first sets them. */
export interface ResourceBlockState {
  measuredNote: VDTLine[];
  measuredContinues: VDTLine[];
}
