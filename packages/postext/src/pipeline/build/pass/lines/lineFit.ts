// A block whose remaining lines fit the column whole: set them, or move them
// on when a short column or a score asks for it.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration, StepJump } from './lineIteration.js';
import type { PassState } from '../state.js';
import { type ResolvedConfig, type VDTDocument, type VDTColumn, type VDTPage, type VDTBlock, type VDTBlockType, createVDTBlock } from '../../../../vdt.js';
import type { HeadingLevelResolver } from '../../../sections/headingStyles.js';
import type { ContentBlock } from '../../../../parse/index.js';
import { type PlacementCursor, FIT_EPS, advanceToNextColumn, resetLinePositions, placeBlockInColumn } from '../../../blocks/placement.js';
import type { BlockStyle } from '../../../styles.js';
import type { ResolvedHeadingLevelConfig } from '../../../../types.js';
import type { HeadingPlaceholderInfo } from '../../../../design/placeholders.js';
import type { HeadingClaim } from '../../passTypes.js';
import type { BlockIteration } from '../blocks/blockIteration.js';
import type { BlockMeasureContext } from '../../../blocks/measureContentBlock.js';
import type { MathRender } from '../../../../math/types.js';
import type { ListBulletStyle } from '../../../text/lists.js';
import { scoreKeepHeight } from '../../../resources/scoreBlocks.js';
import { dropCapSinkAfter } from '../../../text/dropCap.js';
import { spaceLinesAfter, applyStyleAttrs } from '../../../blocks/buildHelpers.js';
import { shiftLinesDown } from '../../passHelpers.js';

/** What createLineFit takes from around the loop. */
export interface LineFitDeps {
  state: PassState;
  baselineGrid: number;
  resolved: ResolvedConfig;
  doc: VDTDocument;
  headingLevels: HeadingLevelResolver;
  contentBlocks: ContentBlock[];
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  uncappedBottoms: Map<VDTColumn, number>;
  cursor: PlacementCursor;
  bodyStyle: BlockStyle;
  onNewPage: (page: VDTPage) => void;
  citedLinesPlaced: (blockIdx: number, placed: VDTBlock) => void;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  reserveOpenerBand: (headingCol: VDTColumn, h: number, opener?: VDTBlock, pending?: number, gridText?: boolean) => void;
  headingMayCloseColumn: (col: VDTColumn) => boolean;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  markSideObstacles: (blk: VDTBlock, design: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo; }) => void;
  noteHeadingClaim: (blk: VDTBlock, design: { claim?: HeadingClaim; }) => void;
  trailingHeadingRun: (col: VDTColumn) => number;
  rollbackIndexGroup: (col: VDTColumn, entry: ContentBlock, min: number) => VDTBlock[];
  blockTurn: BlockIteration;
  blockMeasureCtx: BlockMeasureContext;
  id: string;
  rawBlock: ContentBlock;
  prefixLen: number;
  collapseTail: boolean;
  vdtType: VDTBlockType;
  headingLevel: number | undefined;
  numberPrefix: string | undefined;
  numberSeparator: string | undefined;
  mathDisplayRender: MathRender | undefined;
  absoluteSourceMap: number[];
  style: BlockStyle;
  headingNumber: number | undefined;
  hiddenHeading: boolean;
  finalizeListItem: (blk: VDTBlock, isFirstPart: boolean) => void;
  listBullet: ListBulletStyle | undefined;
  nextIsHeading: boolean;
  nextBlock: ContentBlock | null;
  shouldSnapToGrid: boolean;
  nextIsListItem: boolean;
  itemGapPx: (bullet: NonNullable<ListBulletStyle | undefined>) => number;
}

export function createLineFit(deps: LineFitDeps) {
  const {
    state, baselineGrid, resolved, doc, headingLevels, contentBlocks, pageWidthPx, pageHeightPx,
    bodyOffset, uncappedBottoms, cursor, bodyStyle, onNewPage, citedLinesPlaced, stampBlockExtras,
    reserveOpenerBand, headingMayCloseColumn, rollbackHeadings, markSideObstacles, noteHeadingClaim,
    trailingHeadingRun, rollbackIndexGroup, blockTurn, blockMeasureCtx, id, rawBlock, prefixLen,
    collapseTail, vdtType, headingLevel, numberPrefix, numberSeparator, mathDisplayRender,
    absoluteSourceMap, style, headingNumber, hiddenHeading, finalizeListItem, listBullet,
    nextIsHeading, nextBlock, shouldSnapToGrid, nextIsListItem, itemGapPx
  } = deps;
  /** Sets the lines whole when they fit; `break` once they are set. */
  const fitWholeBlock = (lineTurn: LineIteration): StepJump => {
    const {
      curCol, totalRemainHeight
    } = lineTurn;
    // A block opening a column normally stays (no column can take it any
    // better), except in a column at least a line shorter than the content
    // area — the band under a page-span box, or a column cut by a float:
    // a heading that fits there alone, or a block that does not fit there
    // but would fit a full column, opens the next column instead (the move
    // count is bounded besides). A column cut by a band cap is short on
    // purpose — its content is meant to end at the cut.
    const shortColumn = blockTurn.shortColumnMoves < 4
      && !uncappedBottoms.has(curCol)
      && curCol.bbox.height < state.contentArea.height - baselineGrid;

    // A score's first systems, and its last ones, go together
    // (`scoreStyle.minSystemsAtBreak`, #1173): its first system opens the
    // next column unless the first few fit here, and the system that
    // opens its last few takes them all along.
    if (vdtType === 'score' && curCol.blocks.length > 0) {
      const keep = scoreKeepHeight(contentBlocks, blockTurn.blockIdx, resolved);
      if (keep !== undefined && keep > lineTurn.effectiveAvailable + FIT_EPS && keep <= state.contentArea.height) {
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        return 'continue';
      }
    }

    // Block fits in current column (a hair of tolerance: a capped column
    // and the grid lines balancing adds above a block differ by floating
    // point noise, which must not push the block over the cut).
    if (lineTurn.effectiveRemainHeight <= lineTurn.effectiveAvailable + FIT_EPS) {
      // Heading keep-with-next: never leave a heading as the last block of a
      // column. If the following (non-heading) block wouldn't have room to
      // place at least its widow-minimum number of lines after this heading,
      // push the heading to the next column so it stays joined to its text.
      // The threshold matches the body's widow penalty so the body doesn't
      // just get pushed whole, leaving the heading orphaned anyway. When a
      // run of consecutive headings ends in a pushed heading, any preceding
      // headings already placed in this column are rolled back and re-placed
      // with it in the next column — otherwise the earlier headings would be
      // left behind as their own orphans. A run that already opens a
      // full-height (or capped) column stays: it would open the next column
      // the same way and be pushed on again, round after round.
      if (
        vdtType === 'heading'
        && resolved.headings.keepWithNext
        && !nextIsHeading
        && nextBlock !== null
        && (curCol.blocks.length > trailingHeadingRun(curCol) || shortColumn)
        && !headingMayCloseColumn(curCol)
      ) {
        const wouldUsedHeight =
          (curCol.bbox.height - curCol.availableHeight) + lineTurn.spacingBefore;
        const naturalBottom = wouldUsedHeight + lineTurn.effectiveRemainHeight + style.marginBottomPx;
        const snappedBottom = shouldSnapToGrid
          ? Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid
          : naturalBottom;
        const remainAfterHeading = curCol.bbox.height - snappedBottom;
        // A drop cap opening the text (#623) needs its lines under it.
        const minLinesNeeded = Math.max(
          resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1,
          dropCapSinkAfter(blockTurn.blockIdx, blockMeasureCtx),
        );
        // A `:::space` between the heading and its text needs room too.
        const minSpaceAfter = minLinesNeeded * bodyStyle.lineHeightPx
          + spaceLinesAfter(contentBlocks, blockTurn.blockIdx) * baselineGrid;
        // The room is a difference of grid sums and the need a product:
        // a head whose text ends on the last line of the column is short
        // by floating-point drift alone (#635), and stays.
        if (remainAfterHeading < minSpaceAfter - FIT_EPS) {
          if (curCol.blocks.length === 0) blockTurn.shortColumnMoves++;
          // Roll back any immediately-preceding heading blocks in this
          // column so they travel with this one.
          const rolledBack = rollbackHeadings(curCol);
          if (rolledBack.length > 0) {
            // Rewind so the for-loop's blockIdx++ lands on the first
            // rolled-back heading (marker blocks in between are replayed).
            blockTurn.blockIdx = (rolledBack[0]!.contentIndex ?? blockTurn.blockIdx - rolledBack.length) - 1;
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            return 'break';
          }
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'continue';
        }
      }

      // Consume spacing (negative: a container margin pulling the block up)
      if (lineTurn.spacingBefore !== 0) {
        curCol.availableHeight -= lineTurn.spacingBefore;
      }

      const partId = blockTurn.partIndex === 0 ? id : `${id}-cont-${blockTurn.partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      applyStyleAttrs(blk, style);
          if (blockTurn.letterSpacingPx !== undefined) blk.letterSpacing = blockTurn.letterSpacingPx; if (blockTurn.runtTracking !== undefined) blk.runtFix = { tracking: blockTurn.runtTracking };
      blk.contentIndex = blockTurn.blockIdx;
      stampBlockExtras(blk, rawBlock);
      if (blockTurn.partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; } if (headingNumber !== undefined) blk.headingNumber = headingNumber; }
      if (hiddenHeading) blk.hidden = true;
      if (blockTurn.partIndex === 0 && vdtType === 'heading' && rawBlock.attrs) blk.attrs = rawBlock.attrs;
      if (blockTurn.partIndex === 0 && vdtType === 'heading' && rawBlock.attrSources) {
        // Parser ranges are body-relative; VDT source offsets are absolute.
        blk.attrSources = Object.fromEntries(
          Object.entries(rawBlock.attrSources).map(([k, r]) => [k, { start: r.start + bodyOffset, end: r.end + bodyOffset }]),
        );
      }
      if (blockTurn.partIndex === 0 && vdtType === 'heading' && rawBlock.titleBreaks) {
        blk.titleBreaks = rawBlock.titleBreaks;
        blk.titleLength = rawBlock.text.length;
      }
      if (vdtType === 'mathDisplay' && mathDisplayRender) {
        blk.mathRender = mathDisplayRender;
        blk.tex = rawBlock.tex;
        // Place the single line using its natural height (not the body lineHeight).
        const mathLine = { ...blockTurn.remainingLines[0]!, bbox: { ...blockTurn.remainingLines[0]!.bbox, y: 0 } };
        blk.lines = [mathLine];
      } else if (vdtType === 'score') {
        // A system keeps its own height (#1172).
        blk.lines = [{ ...blockTurn.remainingLines[0]!, bbox: { ...blockTurn.remainingLines[0]!.bbox, y: 0 } }];
      } else {
        blk.lines = shiftLinesDown(resetLinePositions(blockTurn.remainingLines, style.lineHeightPx), lineTurn.lineSpanShift);
      }
      blk.dirty = false;
      blk.snappedToGrid = shouldSnapToGrid && blockTurn.partIndex === 0;
      if (blockTurn.remainingLines.length > 0) {
        blk.sourceStart = blockTurn.remainingLines[0]!.sourceStart ?? rawBlock.sourceStart + bodyOffset;
        blk.sourceEnd = blockTurn.remainingLines[blockTurn.remainingLines.length - 1]!.sourceEnd ?? rawBlock.sourceEnd + bodyOffset;
      }
      if (vdtType === 'mathDisplay' || vdtType === 'score') {
        blk.sourceStart = rawBlock.sourceStart + bodyOffset;
        blk.sourceEnd = rawBlock.sourceEnd + bodyOffset;
      }
      blk.sourceMap = absoluteSourceMap;
      blk.plainPrefixLen = prefixLen;
      if (lineTurn.balancing) blk.balancing = lineTurn.balancing;

      let h = lineTurn.effectiveRemainHeight;
      /** What a collapsing container tail still owes the next block,
       *  from the grid line its text snapped to (see `collapseTail`). */
      let tailOwed = 0;
      if (shouldSnapToGrid && blockTurn.partIndex === 0) {
        // Snap using the absolute position in the column so that the block
        // bottom lands on a baseline grid line. This accounts for off-grid
        // starts (e.g. after consecutive unsnapped headings) and bakes in
        // the minimum marginBottom — the grid always wins, but the margin
        // below is guaranteed to be at least marginBottomPx. A collapsing
        // container tail snaps under its text alone and carries the rest.
        const usedHeight = curCol.bbox.height - curCol.availableHeight;
        const naturalBottom = usedHeight + lineTurn.effectiveRemainHeight + (collapseTail ? 0 : style.marginBottomPx);
        // Tolerance guards against FP drift: if naturalBottom is already on
        // the grid (e.g. marginBottom is an exact multiple of baselineGrid),
        // don't round up to the next line.
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        // A negative margin below a container tail may snap the flow back
        // above the text's own bottom; never below the block's top.
        h = Math.max(0, snappedBottom - usedHeight);
        if (collapseTail) tailOwed = style.marginBottomPx - (snappedBottom - (usedHeight + lineTurn.effectiveRemainHeight));
      }
      // A design that ends within a line of the column's foot fits, but
      // its margin and grid snap would carry the block past the foot: it
      // takes the rest of the column instead, as a design reaching past
      // the foot does (the text after it opens the next column or page).
      if (vdtType === 'heading' && lineTurn.effectiveRemainHeight > totalRemainHeight && h > curCol.availableHeight + FIT_EPS) {
        h = Math.max(lineTurn.effectiveRemainHeight, curCol.availableHeight);
      }
      // A block whose lines fit, and whose snap would reach the grid line
      // under the column's foot (a foot the notes reserved there took off
      // the grid, or a bottom margin on the column's last line), ends at
      // the foot (#716): its box stays inside its column and the room left
      // reads 0, not a negative height. The space it still owed is dropped,
      // as pending spacing is at any column's end. A column cut by a band
      // cap keeps the overrun: there it is how the block's bottom margin
      // reaches the page-span box under the cut (`bandUsedBottomWithSide`).
      if (
        shouldSnapToGrid && blockTurn.partIndex === 0
        && !uncappedBottoms.has(curCol)
        && h > curCol.availableHeight + FIT_EPS
        && lineTurn.effectiveRemainHeight <= curCol.availableHeight + FIT_EPS
      ) {
        h = Math.max(lineTurn.effectiveRemainHeight, curCol.availableHeight);
        tailOwed = 0;
      }
      placeBlockInColumn(blk, h, curCol, cursor);
      citedLinesPlaced(blockTurn.blockIdx, blk);
      finalizeListItem(blk, blockTurn.partIndex === 0);
      doc.blocks.push(blk);
      // Page-spanning heading: reserve its band in every other column.
      if (vdtType === 'heading' && headingLevel !== undefined) {
        const lvl = headingLevels.forBlock(rawBlock);
        if (lvl?.span === 'page') {
          reserveOpenerBand(
            curCol, h, blk,
            shouldSnapToGrid && blockTurn.partIndex === 0 ? 0 : style.marginBottomPx,
            lvl.snapToGrid ?? resolved.headings.snapToGrid,
          );
        }
      }
      // Its design's elements in the side column hold the side stack off.
      if (lineTurn.headingDesign) { markSideObstacles(blk, lineTurn.headingDesign); noteHeadingClaim(blk, lineTurn.headingDesign); }
      // For snapped headings/list-tails the margin is baked into the snap;
      // for unsnapped ones (consecutive) track it for collapsing
      if (vdtType === 'listItem' && nextIsListItem) {
        state.pendingSpacing = itemGapPx(listBullet!);
      } else {
        state.pendingSpacing = (shouldSnapToGrid && blockTurn.partIndex === 0) ? 0 : style.marginBottomPx;
        // A collapsing container tail: the space the snap did not cover,
        // in whole grid lines, merges with the next block's own space
        // above (a heading's margin collapses with the exact rest).
        if (collapseTail && shouldSnapToGrid && blockTurn.partIndex === 0 && tailOwed > 0.01) {
          state.pendingSpacing = Math.ceil((tailOwed - 0.01) / baselineGrid) * baselineGrid;
          state.inlineGapOwed = { afterIdx: blockTurn.blockIdx, pending: state.pendingSpacing, exact: tailOwed, container: true };
        }
      }
      return 'break';
    }

    // An index entry that leaves the column takes the entries of its
    // group the keep rule does not let stay with it (#712): the roll-back
    // comes before any cut between its own lines.
    if (rawBlock.index && blockTurn.partIndex === 0 && curCol.blocks.length > 0) {
      const rolledBack = rollbackIndexGroup(curCol, rawBlock, blockMeasureCtx.resolved.index.groups.splitMinEntries);
      if (rolledBack.length > 0) {
        blockTurn.blockIdx = (rolledBack[0]!.contentIndex ?? blockTurn.blockIdx - rolledBack.length) - 1;
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        return 'break';
      }
    }
    lineTurn.shortColumn = shortColumn;
  };
  return { fitWholeBlock };
}
