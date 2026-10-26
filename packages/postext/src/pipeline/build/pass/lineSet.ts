// Setting the part of a block that goes into the column: its VDT block, its
// stamps and its place in the column.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration, StepJump } from './lineIteration.js';
import { type VDTDocument, type VDTBlock, type VDTColumn, type VDTBlockType, createVDTBlock } from '../../../vdt.js';
import type { HeadingLevelResolver } from '../../sections/headingStyles.js';
import type { PassState } from './state.js';
import { type PlacementCursor, resetLinePositions, placeBlockInColumn } from '../../blocks/placement.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { ResolvedHeadingLevelConfig } from '../../../types.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import type { HeadingClaim } from '../passTypes.js';
import type { BlockIteration } from './blockIteration.js';
import type { BlockStyle } from '../../styles.js';
import type { ListBulletStyle } from '../../text/lists.js';
import { applyStyleAttrs } from '../../blocks/buildHelpers.js';
import { shiftLinesDown } from '../passHelpers.js';

/** What createLineSet takes from around the loop. */
export interface LineSetDeps {
  doc: VDTDocument;
  headingLevels: HeadingLevelResolver;
  state: PassState;
  bodyOffset: number;
  cursor: PlacementCursor;
  citedLinesPlaced: (blockIdx: number, placed: VDTBlock) => void;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  reserveOpenerBand: (headingCol: VDTColumn, h: number, opener?: VDTBlock, pending?: number, gridText?: boolean) => void;
  markSideObstacles: (blk: VDTBlock, design: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo; }) => void;
  noteHeadingClaim: (blk: VDTBlock, design: { claim?: HeadingClaim; }) => void;
  blockTurn: BlockIteration;
  id: string;
  rawBlock: ContentBlock;
  prefixLen: number;
  vdtType: VDTBlockType;
  headingLevel: number | undefined;
  numberPrefix: string | undefined;
  numberSeparator: string | undefined;
  absoluteSourceMap: number[];
  style: BlockStyle;
  headingNumber: number | undefined;
  hiddenHeading: boolean;
  finalizeListItem: (blk: VDTBlock, isFirstPart: boolean) => void;
  listBullet: ListBulletStyle | undefined;
  nextIsListItem: boolean;
  itemGapPx: (bullet: NonNullable<ListBulletStyle | undefined>) => number;
}

export function createLineSet(deps: LineSetDeps) {
  const {
    doc, headingLevels, state, bodyOffset, cursor, citedLinesPlaced, stampBlockExtras,
    reserveOpenerBand, markSideObstacles, noteHeadingClaim, blockTurn, id, rawBlock, prefixLen,
    vdtType, headingLevel, numberPrefix, numberSeparator, absoluteSourceMap, style, headingNumber,
    hiddenHeading, finalizeListItem, listBullet, nextIsListItem, itemGapPx
  } = deps;
  /** Sets the part of the block that goes into this column. */
  const setLinePart = (lineTurn: LineIteration): StepJump => {
    const {
      curCol, totalRemainHeight
    } = lineTurn;
    // Empty column but block still doesn't fit (block taller than page) — place anyway
    const partId = blockTurn.partIndex === 0 ? id : `${id}-cont-${blockTurn.partIndex}`;
    const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
    applyStyleAttrs(blk, style);
          if (blockTurn.letterSpacingPx !== undefined) blk.letterSpacing = blockTurn.letterSpacingPx; if (blockTurn.runtTracking !== undefined) blk.runtFix = { tracking: blockTurn.runtTracking };
    blk.contentIndex = blockTurn.blockIdx;
    stampBlockExtras(blk, rawBlock);
    // Stamp the prefix as the other placement branches do: a full-page
    // opener lands here, and paint and running heads read its
    // `{chapterNumber}` from `numberPrefix`, as the measure did (EF-59).
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
    blk.lines = vdtType === 'mathDisplay' || vdtType === 'score'
      ? [{ ...blockTurn.remainingLines[0]!, bbox: { ...blockTurn.remainingLines[0]!.bbox, y: 0 } }]
      : shiftLinesDown(resetLinePositions(blockTurn.remainingLines, style.lineHeightPx), lineTurn.lineSpanShift);
    blk.dirty = false;
    blk.snappedToGrid = false;
    if (blockTurn.remainingLines.length > 0) {
      blk.sourceStart = blockTurn.remainingLines[0]!.sourceStart;
      blk.sourceEnd = blockTurn.remainingLines[blockTurn.remainingLines.length - 1]!.sourceEnd;
    }
    blk.sourceMap = absoluteSourceMap;
    blk.plainPrefixLen = prefixLen;
    if (lineTurn.balancing) blk.balancing = lineTurn.balancing;

    // A heading whose design (or `minHeight`) reaches past the column's
    // foot — a full-page cover, say — claims the rest of its column, and
    // of the page when it spans it: the next block opens the next column
    // or page instead of running on under (or beside) the design. Its
    // block runs down to the column's foot (EF-91), so the design is laid
    // out against the band it claims — elements anchored to the band's
    // middle or foot, or filling it, keep to that band, as they do when
    // the reservation fits — rather than against the height of its text.
    const claimsColumn = vdtType === 'heading' && lineTurn.effectiveRemainHeight > totalRemainHeight;
    const placedHeight = claimsColumn
      ? Math.max(totalRemainHeight, Math.min(lineTurn.effectiveRemainHeight, curCol.availableHeight))
      : totalRemainHeight;
    placeBlockInColumn(blk, placedHeight, curCol, cursor);
    citedLinesPlaced(blockTurn.blockIdx, blk);
    finalizeListItem(blk, blockTurn.partIndex === 0);
    doc.blocks.push(blk);
    if (claimsColumn) {
      curCol.availableHeight = 0;
      if (headingLevels.forBlock(rawBlock)?.span === 'page') reserveOpenerBand(curCol, lineTurn.effectiveRemainHeight, blk, style.marginBottomPx);
    }
    if (lineTurn.headingDesign) { markSideObstacles(blk, lineTurn.headingDesign); noteHeadingClaim(blk, lineTurn.headingDesign); }
    if (vdtType === 'listItem') {
      state.pendingSpacing = nextIsListItem ? itemGapPx(listBullet!) : style.marginBottomPx;
    } else {
      state.pendingSpacing = style.marginBottomPx;
    }
    return 'break';
  };
  return { setLinePart };
}
