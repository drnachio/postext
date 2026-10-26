// What the steps of placeLines's loop share (#1276).
import type { VDTColumn, VDTBalancing } from '../../../vdt.js';
import type { ResolvedHeadingLevelConfig } from '../../../types.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import type { HeadingClaim } from '../passTypes.js';

export type { StepJump } from './blockIteration.js';

/** One turn of the loop that places a block's lines, a column at a time:
 *  the bindings its steps share. */
export interface LineIteration {
  curCol: VDTColumn;
  isFirstInColumn: boolean;
  openerHead: number | undefined;
  spacingBefore: number;
  balancing: VDTBalancing | undefined;
  effectiveAvailable: number;
  linesPerAvailable: number;
  totalRemainHeight: number;
  effectiveRemainHeight: number;
  lineSpanShift: number;
  headingDesign: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo; claim?: HeadingClaim } | undefined;
  shortColumn: boolean;
}
