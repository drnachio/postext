// Placing a text block's lines column by column: fit, split, keep rules,
// widows and orphans, column ends and the moves that follow.
// Part of the placement pass (pass.ts), split out of its loop in #1276.
import type { BlockIteration } from './blockIteration.js';
import type { PassState } from './state.js';
import { type ResolvedConfig, type VDTDocument, type VDTPage, type BoundingBox, type VDTColumn, type VDTLine, type VDTBlock } from '../../../vdt.js';
import type { HeadingLevelResolver } from '../../sections/headingStyles.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { Resource, ResolvedHeadingLevelConfig } from '../../../types.js';
import type { BlockStyle } from '../../styles.js';
import { type PlacementCursor } from '../../blocks/placement.js';
import { type BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import type { HeadingClaim } from '../passTypes.js';
import type { CompositionRule } from '../../../types/text/bodyText.js';
import type { LineIteration } from './lineIteration.js';
import { createLineColumn } from './lineColumn.js';
import { createLineRoom } from './lineRoom.js';
import { createLineKeeps } from './lineKeeps.js';
import { createLineFit } from './lineFit.js';
import { createLineSplit } from './lineSplit.js';
import { createLineSet } from './lineSet.js';

/** What createPlaceLines takes from around the loop. */
export interface PlaceLinesDeps {
  state: PassState;
  balanceExtraPx: ReadonlyMap<number, number> | undefined;
  resolved: ResolvedConfig;
  looseOutcome: Map<number, number | null>;
  headingLevels: HeadingLevelResolver;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  designFramesOn: (page: VDTPage | undefined) => { page: BoundingBox; bleed: BoundingBox; upright?: boolean; };
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  chapterNumberByBlock: string[];
  resourceById: Map<string, Resource>;
  bodyStyle: BlockStyle;
  cursor: PlacementCursor;
  uncappedBottoms: Map<VDTColumn, number>;
  regateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  gateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  citedLinesPlaced: (blockIdx: number, placed: VDTBlock) => void;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  openFloatWraps: (col: VDTColumn) => void;
  onNewPage: (page: VDTPage) => void;
  notesPrefixCost: (col: VDTColumn, lines: readonly VDTLine[]) => number[] | undefined;
  columnHeadKept: (blockIdx: number, rawBlock: ContentBlock, usedHeight: number, height: number, style: { marginTopPx: number; marginBottomPx: number; }, snaps: boolean, col: VDTColumn, ctx: BlockMeasureContext) => number;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  pendingBeforeSelfSnapping: (idx: number) => number;
  addBalanceExtra: (col: VDTColumn, px: number) => void;
  balanceExtraInColumn: Map<VDTColumn, number>;
  opensDefaultOpener: (raw: ContentBlock) => boolean;
  reserveOpenerBand: (headingCol: VDTColumn, h: number, opener?: VDTBlock, pending?: number, gridText?: boolean) => void;
  openerHeadSpacing: (col: VDTColumn, level: boolean) => number | undefined;
  underOpenerHeadFloat: (col: VDTColumn) => boolean;
  markSideObstacles: (blk: VDTBlock, design: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo; }) => void;
  noteHeadingClaim: (blk: VDTBlock, design: { claim?: HeadingClaim; }) => void;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  enterBand: (contentIndex: number, part: number) => void;
  headingMayCloseColumn: (col: VDTColumn) => boolean;
  trailingHeadingRun: (col: VDTColumn) => number;
  headingRunMayLeave: (col: VDTColumn, run: number, shortColumn?: boolean) => boolean;
  rollbackIndexGroup: (col: VDTColumn, entry: ContentBlock, min: number) => VDTBlock[];
  shortListRule: CompositionRule;
  shortListFrom: (idx: number) => { items: number[]; } | undefined;
  shortListNeed: (list: { items: number[]; }, width: number, ctx: BlockMeasureContext) => { height: number; lines: VDTLine[]; } | undefined;
  firstListItemStarts: (leadIdx: number, roomPx: number, width: number, ctx: BlockMeasureContext) => boolean;
  citedFootTake: (blockIdx: number, col: VDTColumn, roomAfter: number) => number;
  tocGroupNeed: (idx: number, width: number) => { whole: number; lead: number; } | undefined;
}

export function createPlaceLines(deps: PlaceLinesDeps) {
  const {
    state, balanceExtraPx, resolved, looseOutcome, headingLevels, dpi, baselineGrid, doc,
    pageWidthPx, pageHeightPx, designFramesOn, bodyOffset, contentBlocks, chapterNumberByBlock,
    resourceById, bodyStyle, cursor, uncappedBottoms, regateCitedFloats, gateCitedFloats,
    citedLinesPlaced, reservedOf, openFloatWraps, onNewPage, notesPrefixCost, columnHeadKept,
    stampBlockExtras, pendingBeforeSelfSnapping, addBalanceExtra, balanceExtraInColumn,
    opensDefaultOpener, reserveOpenerBand, openerHeadSpacing, underOpenerHeadFloat,
    markSideObstacles, noteHeadingClaim, rollbackHeadings, enterBand, headingMayCloseColumn,
    trailingHeadingRun, headingRunMayLeave, rollbackIndexGroup, shortListRule, shortListFrom,
    shortListNeed, firstListItemStarts, citedFootTake, tocGroupNeed
  } = deps;
  /** Places the block's lines until none is left. */
  const placeLines = (blockTurn: BlockIteration): void => {
    const {
      rawBlock, id, blockMeasureCtx, collapseTail, styleOverride, looseLines, tryLoose, prefixLen,
      absoluteSourceMap, mathDisplayRender, vdtType, headingLevel, numberPrefix, numberSeparator,
      headingNumber, listBullet, listKind, hiddenHeading, lineSpan, style, finalizeListItem,
      nextBlock, nextIsListItem, itemGapPx, nextIsHeading, shouldSnapToGrid, canSplit,
      guardedColumnEnds, wrapsBeside, rebreaksForColumn, measureForColumns, endsWithColon,
      nextIsVerse
    } = blockTurn;

    const { openLineColumn } = createLineColumn({
      doc, cursor, regateCitedFloats, openFloatWraps, openerHeadSpacing, enterBand, blockTurn, rawBlock,
      blockMeasureCtx, styleOverride, vdtType, style, wrapsBeside, rebreaksForColumn
    });
    const { measureLineRoom } = createLineRoom({
      state, headingLevels, resolved, baselineGrid, balanceExtraPx, looseOutcome, contentBlocks,
      regateCitedFloats, reservedOf, notesPrefixCost, pendingBeforeSelfSnapping, addBalanceExtra,
      balanceExtraInColumn, underOpenerHeadFloat, blockTurn, rawBlock, blockMeasureCtx, styleOverride,
      tryLoose, looseLines, vdtType, style, lineSpan, listKind, wrapsBeside
    });
    const { keepLinesTogether } = createLineKeeps({
      headingLevels, doc, resolved, dpi, baselineGrid, state, chapterNumberByBlock, designFramesOn,
      contentBlocks, pageWidthPx, pageHeightPx, cursor, resourceById, bodyStyle, columnHeadKept,
      citedLinesPlaced, onNewPage, notesPrefixCost, balanceExtraInColumn, stampBlockExtras,
      opensDefaultOpener, underOpenerHeadFloat, rollbackHeadings, shortListRule, shortListFrom,
      trailingHeadingRun, headingRunMayLeave, shortListNeed, firstListItemStarts, citedFootTake,
      tocGroupNeed, blockTurn, rawBlock, blockMeasureCtx, id, prefixLen, vdtType, headingLevel,
      numberPrefix, numberSeparator, absoluteSourceMap, hiddenHeading, headingNumber, style, lineSpan,
      shouldSnapToGrid, nextBlock, endsWithColon, nextIsVerse
    });
    const { fitWholeBlock } = createLineFit({
      state, baselineGrid, resolved, doc, headingLevels, contentBlocks, pageWidthPx, pageHeightPx,
      bodyOffset, uncappedBottoms, cursor, bodyStyle, onNewPage, citedLinesPlaced, stampBlockExtras,
      reserveOpenerBand, headingMayCloseColumn, rollbackHeadings, markSideObstacles, noteHeadingClaim,
      trailingHeadingRun, rollbackIndexGroup, blockTurn, blockMeasureCtx, id, rawBlock, prefixLen,
      collapseTail, vdtType, headingLevel, numberPrefix, numberSeparator, mathDisplayRender,
      absoluteSourceMap, style, headingNumber, hiddenHeading, finalizeListItem, listBullet,
      nextIsHeading, nextBlock, shouldSnapToGrid, nextIsListItem, itemGapPx
    });
    const { splitOrMoveOn } = createLineSplit({
      resolved, state, doc, pageWidthPx, pageHeightPx, uncappedBottoms, cursor, gateCitedFloats,
      regateCitedFloats, citedLinesPlaced, onNewPage, reservedOf, balanceExtraInColumn, stampBlockExtras,
      rollbackHeadings, trailingHeadingRun, headingRunMayLeave, blockTurn, looseLines, blockMeasureCtx,
      rawBlock, id, prefixLen, vdtType, headingLevel, numberPrefix, numberSeparator, absoluteSourceMap,
      style, headingNumber, finalizeListItem, canSplit, guardedColumnEnds, measureForColumns
    });
    const { setLinePart } = createLineSet({
      doc, headingLevels, state, bodyOffset, cursor, citedLinesPlaced, stampBlockExtras,
      reserveOpenerBand, markSideObstacles, noteHeadingClaim, blockTurn, id, rawBlock, prefixLen,
      vdtType, headingLevel, numberPrefix, numberSeparator, absoluteSourceMap, style, headingNumber,
      hiddenHeading, finalizeListItem, listBullet, nextIsListItem, itemGapPx
    });

    while (blockTurn.remainingLines.length > 0) {
      const lineTurn = {} as LineIteration;
      openLineColumn(lineTurn);
      if (measureLineRoom(lineTurn) === 'continue') continue;
      const jump = keepLinesTogether(lineTurn);
      if (jump === 'continue') continue;
      if (jump === 'break') break;

      const jump1 = fitWholeBlock(lineTurn);
      if (jump1 === 'continue') continue;
      if (jump1 === 'break') break;

      const jump2 = splitOrMoveOn(lineTurn);
      if (jump2 === 'continue') continue;
      if (jump2 === 'break') break;

      if (setLinePart(lineTurn) === 'break') break;
    }
  };
  return { placeLines };
}
