// What the steps of a loop split into modules share (#1276).
import type { VDTPage } from '../../../vdt.js';
import type { PageMetrics } from '../../blocks/buildHelpers.js';
import type { DesignFrames } from '../../../design/layout/primitives.js';
import type { BoundingBox } from '../../../vdt/document.js';
import type { SlotLayoutExtras } from './slotLayout.js';
import type { ResolvedPageTemplate } from '../../../composed/types.js';
import type { ResolvedDesignSlot } from '../../../types/designElements.js';
import type { VDTBlock, VDTColumn } from '../../../vdt/blocks.js';

/** How a step ends its turn of the loop: as `continue` or `break` would, or
 *  by falling through to the next step (undefined). */
export type StepJump = 'continue' | 'break' | undefined;

/** One page's turn of layoutHeadersAndFooters: the bindings its steps share. */
export interface PageFurnitureTurn {
  /** The loop's own variable. */
  page: VDTPage;
  pageMetrics: PageMetrics;
  physicalFrames: DesignFrames;
  contentArea: BoundingBox;
  frames: DesignFrames;
  extras: SlotLayoutExtras;
  sheetArea: BoundingBox;
  recto: boolean;
  sheetExtras: SlotLayoutExtras;
  template: ResolvedPageTemplate | undefined;
  pageAttrs: Record<string, string> | undefined;
  headerSlot: ResolvedDesignSlot;
  footerSlot: ResolvedDesignSlot;
  slotPath: (kind: "header" | "footer") => string | undefined;
  headExtras: SlotLayoutExtras;
  furniture: boolean;
  overlayHeading: (block: VDTBlock, col: VDTColumn | undefined, boxFrames?: DesignFrames) => void;
  overlayTocPart: (block: VDTBlock, boxFrames?: DesignFrames) => void;
}
