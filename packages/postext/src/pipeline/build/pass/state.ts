// The running state of a placement pass its modules share (#1276).
import type { BoundingBox, ResolvedConfig, VDTColumn, VDTExclusion, VDTBlock, VDTPage, VDTComicPage } from '../../../vdt.js';
import type { ResolvedHeadingStyleConfig, HeadingBreakParity, ResolvedCalloutStyleConfig } from '../../../types.js';
import type { NumeralStyle } from '../../../numbering.js';
import type { PlannedCallout } from '../../calloutLayout.js';
import type { CalloutLayouter } from '../../frameLayout.js';
import type { PlannedComposedPage } from '../../composedLayout.js';
import type { ComicTextFramesInput, ComicTextFramesLayout } from '../../../comics/textPanels.js';

/** The bindings a pass reassigns while it places blocks and that more than
 *  one of its modules reads or writes: fields of one object, set where the
 *  pass first sets them. */
export interface PassState {
  contentArea: BoundingBox;
  geomResolved: ResolvedConfig;
  drainingAfterText: boolean;
  floatsPlaced: number;
  freshPageHold: { col: VDTColumn; px: number } | null;
  currentSection: ResolvedHeadingStyleConfig | undefined;
  blockIdCounter: number;
  pendingSpacing: number;
  inlineGapOwed: { afterIdx: number; pending: number; exact: number; container?: boolean } | null;
  registeredBand: { pageIndex: number; band: number } | null;
  bandStart: { contentIndex: number; part: number; visit: number } | null;
  activeCap: { spanIndex: number; pageIndex: number; band: number } | null;
  pendingWrap: { col: VDTColumn; blocks: number; cursorY: number; ex: VDTExclusion } | null;
  pendingPartBreak: HeadingBreakParity | null;
  skipPartUntil: number | null;
  pendingPaperBreak: boolean;
  pendingComposedBreak: false | 'page' | 'flow';
  pendingComicBreak: boolean;
  pendingNumberingChange: | { format?: NumeralStyle; startAt?: number }
    | null;
  pendingNumberingPage: number;
}

/** What a module calls before the pass has made it: filled as soon as each
 *  one exists, read only once the blocks are placed. */
export interface PassLate {
  reserveCitedNotes: (placed: VDTBlock) => void;
  openerHeadOf: (col: VDTColumn) => number | undefined;
  isFreeHeading: (b: VDTBlock) => boolean;
  holdsHeadFloat: (col: VDTColumn, b: VDTBlock) => boolean;
  stampCalloutSource: (frame: VDTBlock, startIdx: number, plan: PlannedCallout, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  makeCalloutLayouter: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig) => CalloutLayouter;
  mirroredOf: (page: VDTPage) => boolean;
  paintedBottom: (b: VDTBlock) => number;
  bandUsedBottomWithSide: (page: VDTPage, cols: readonly VDTColumn[]) => number;
  settleAwaitingSideBoxes: (force: boolean) => void;
  flushSideBoxesIntoPage: (page: VDTPage) => void;
  settlePendingSideBoxes: () => void;
  shortListBoxAt: (idx: number) => { heightAt: (width: number) => number; stays: boolean; } | null;
  placeComicText: (page: VDTPage, comic: VDTComicPage, plan: PlannedComposedPage, extra?: Pick<ComicTextFramesInput, "only" | "avoid">) => ComicTextFramesLayout;
}
