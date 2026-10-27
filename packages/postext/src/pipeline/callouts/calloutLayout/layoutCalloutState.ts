// The running state of layoutCallout its modules share (#1276).
import type { VDTDesignBoxBlock } from '../../../vdt.js';

/** The bindings a pass reassigns while it places blocks and that more than
 *  one of its modules reads or writes: fields of one object, set where the
 *  pass first sets them. */
export interface CalloutState {
  stripeBlock: VDTDesignBoxBlock | undefined;
  iconFileId: string | undefined;
  iconFormat: string | undefined;
  labelRisePx: number;
  labelDropPx: number;
  markerFileId: string | undefined;
  markerFormat: string | undefined;
}
