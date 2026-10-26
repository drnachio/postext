// A block that does not fit whole: split it at the column's foot under the
// orphan and widow rules, or move it on to the next column.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration, StepJump } from './lineIteration.js';
import { type ResolvedConfig, type VDTDocument, type VDTColumn, type VDTLine, type VDTBlock, type VDTPage, type VDTBlockType, createVDTBlock } from '../../../vdt.js';
import type { PassState } from './state.js';
import { type PlacementCursor, columnClosesPage, resetLinePositions, placeBlockInColumn, advanceToNextColumn, bandColumns, currentBand } from '../../blocks/placement.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockIteration } from './blockIteration.js';
import type { BlockMeasureContext, MeasureContentBlockOptions, MeasuredContentBlock } from '../../blocks/measureContentBlock.js';
import type { BlockStyle } from '../../styles.js';
import { chooseParagraphSplit } from '../../blocks/orphanWidow.js';
import { raggedLooseLines } from '../../text/raggedLines.js';
import { sameVerseLine, keepsStanzaWhole } from '../passHelpers.js';
import { applyStyleAttrs } from '../../blocks/buildHelpers.js';

/** What createLineSplit takes from around the loop. */
export interface LineSplitDeps {
  resolved: ResolvedConfig;
  state: PassState;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  uncappedBottoms: Map<VDTColumn, number>;
  cursor: PlacementCursor;
  gateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  regateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  citedLinesPlaced: (blockIdx: number, placed: VDTBlock) => void;
  onNewPage: (page: VDTPage) => void;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  balanceExtraInColumn: Map<VDTColumn, number>;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  trailingHeadingRun: (col: VDTColumn) => number;
  headingRunMayLeave: (col: VDTColumn, run: number, shortColumn?: boolean) => boolean;
  blockTurn: BlockIteration;
  looseLines: number | undefined;
  blockMeasureCtx: BlockMeasureContext;
  rawBlock: ContentBlock;
  id: string;
  prefixLen: number;
  vdtType: VDTBlockType;
  headingLevel: number | undefined;
  numberPrefix: string | undefined;
  numberSeparator: string | undefined;
  absoluteSourceMap: number[];
  style: BlockStyle;
  headingNumber: number | undefined;
  finalizeListItem: (blk: VDTBlock, isFirstPart: boolean) => void;
  canSplit: boolean;
  guardedColumnEnds: (mode: false | "withinPage", splitAt: number, lineCount: number, fullColumn: number, page: VDTPage, columnIndex: number) => number[];
  measureForColumns: (extra: MeasureContentBlockOptions) => MeasuredContentBlock | null;
}

export function createLineSplit(deps: LineSplitDeps) {
  const {
    resolved, state, doc, pageWidthPx, pageHeightPx, uncappedBottoms, cursor, gateCitedFloats,
    regateCitedFloats, citedLinesPlaced, onNewPage, reservedOf, balanceExtraInColumn,
    stampBlockExtras, rollbackHeadings, trailingHeadingRun, headingRunMayLeave, blockTurn,
    looseLines, blockMeasureCtx, rawBlock, id, prefixLen, vdtType, headingLevel, numberPrefix,
    numberSeparator, absoluteSourceMap, style, headingNumber, finalizeListItem, canSplit,
    guardedColumnEnds, measureForColumns
  } = deps;
  /** Splits the lines at the column foot or moves them on; `continue` when
   *  they move on. */
  const splitOrMoveOn = (lineTurn: LineIteration): StepJump => {
    const {
      curCol, totalRemainHeight, shortColumn
    } = lineTurn;
    // Block doesn't fit — try to split (orphan/widow-aware)
    const inList = vdtType === 'listItem';
    const effectiveAvoidOrphans = resolved.bodyText.avoidOrphans
      && (!inList || resolved.bodyText.avoidOrphansInLists);
    const effectiveAvoidWidows = resolved.bodyText.avoidWidows
      && (!inList || resolved.bodyText.avoidWidowsInLists);
    if (canSplit && lineTurn.linesPerAvailable >= 1) {
      let choice = chooseParagraphSplit(blockTurn.remainingLines.length, lineTurn.linesPerAvailable, {
        avoidOrphans: effectiveAvoidOrphans,
        orphanMinLines: resolved.bodyText.orphanMinLines,
        orphanPenalty: resolved.bodyText.orphanPenalty,
        avoidWidows: effectiveAvoidWidows,
        widowMinLines: resolved.bodyText.widowMinLines,
        widowPenalty: resolved.bodyText.widowPenalty,
        slackWeight: resolved.bodyText.slackWeight,
      });
      // The block sits right under a heading: pushing it whole would
      // strand the heading. Keep the most lines that fit under it — at
      // least the widow minimum — that also leave the orphan minimum for
      // the next column (`headings.keepWithNextSplit: 'rules'`, EF-185;
      // `'fill'`, postext 1.4's rule, keeps as many as fit, however few
      // go on). With no such split the heading moves along with the block
      // (the no-fit branch below rolls it back).
      const headingRun = blockTurn.partIndex === 0 ? trailingHeadingRun(curCol) : 0;
      if (choice.splitAt === 0 && headingRun > 0 && headingRun < curCol.blocks.length) {
        // A drop cap's lines stay with it (#623).
        const minKeep = Math.max(effectiveAvoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1, blockTurn.partIndex === 0 && blockTurn.capInfo ? blockTurn.capInfo.sink : 1);
        const minTail = effectiveAvoidOrphans && resolved.headings.keepWithNextSplit === 'rules'
          ? Math.max(1, resolved.bodyText.orphanMinLines)
          : 1;
        let keep = Math.min(lineTurn.linesPerAvailable, blockTurn.remainingLines.length);
        while (keep >= minKeep && keep < blockTurn.remainingLines.length && blockTurn.remainingLines.length - keep < minTail) keep--;
        if (keep >= minKeep) choice = { splitAt: keep, demerit: choice.demerit };
      }
      // An empty column the block cannot leave (a full-height one, or a
      // short one once the moves below are spent) holds as many lines as
      // it can: a paragraph never runs past its column's foot, whatever
      // the orphan and widow rules would rather do (EF-97). Not a column
      // a band cap cut short: there the block runs past the cut, and the
      // driver takes the cut lower, or drops it, so the rules still hold
      // (under a figure heading such a column it moves on instead, see
      // `capShortUnderFloat` below).
      if (choice.splitAt === 0 && curCol.blocks.length === 0 && !shortColumn && !uncappedBottoms.has(curCol)) {
        const maxFit = Math.min(lineTurn.linesPerAvailable, blockTurn.remainingLines.length - 1);
        if (maxFit >= 1) choice = { splitAt: maxFit, demerit: choice.demerit };
      }
      // `bodyText.hyphenateAcrossColumns: false` (EF-86): the lines that
      // close a column must not end on a hyphen. Those are the line that
      // closes this column and the lines later full columns would end on.
      // When one of them ends on a hyphen, the paragraph is broken again,
      // once, with a hyphen at each of them priced out of the breaker; the
      // placement then starts over with its lines. Only a paragraph set
      // from its first line here — its earlier lines are not placed yet —
      // and never one the balancing is running long.
      //
      // `'withinPage'` (#701) guards only the ends that close a page: this
      // column's when no later column of its page takes text, and then
      // one every page of full columns. With none in the paragraph,
      // nothing is measured again.
      const hyphenGuard = resolved.bodyText.hyphenateAcrossColumns;
      if (
        choice.splitAt > 0
        && hyphenGuard !== true
        && !blockTurn.columnEndHyphenRetried
        && blockTurn.partIndex === 0
        && looseLines === undefined
      ) {
        const fullColumn = Math.max(1, Math.floor((state.contentArea.height + 0.01) / style.lineHeightPx));
        const ends = guardedColumnEnds(hyphenGuard, choice.splitAt, blockTurn.remainingLines.length, fullColumn, doc.pages[cursor.pageIndex]!, cursor.columnIndex);
        /** How a setting ends its guarded lines: whether this column's
         *  last line, when it is guarded, is hyphenated, and how many
         *  guarded lines are. */
        const columnEndHyphens = (lines: readonly VDTLine[]) => ({
          first: ends[0] === choice.splitAt && lines[choice.splitAt - 1]?.hyphenated === true,
          count: ends.filter((n) => lines[n - 1]?.hyphenated).length,
        });
        const natural = columnEndHyphens(blockTurn.remainingLines);
        blockTurn.columnEndHyphenRetried = natural.count > 0;
        const again = natural.count > 0
          ? measureForColumns({ avoidHyphenAtLines: ends })
          : undefined;
        // The re-break is kept when it hyphenates fewer guarded lines. The
        // line closing this column counts first: it is the one certain
        // break, while the later ends assume full columns follow.
        const retried = again && again.measured.lines.length > 0 ? columnEndHyphens(again.measured.lines) : undefined;
        if (
          again
          && retried
          && (again.letterSpacingPx ?? 0) === (blockTurn.letterSpacingPx ?? 0)
          && (natural.first !== retried.first ? natural.first : retried.count < natural.count)
        ) {
          blockTurn.remainingLines = [...raggedLooseLines(again.measured.lines, style.textAlign)];
          blockTurn.paragraphLines = blockTurn.remainingLines;
          blockTurn.paragraphBreaks = again.measured.breaks;
          blockTurn.guardedEnds = ends;
          blockTurn.columnEndHyphenPart = 0;
          gateCitedFloats(blockTurn.blockIdx, blockTurn.remainingLines);
          // The pass over this column starts again: the balancing room it
          // recorded above is recorded again then.
          if (lineTurn.balancing && lineTurn.balancing.spaceAbove > 0) {
            balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - lineTurn.balancing.spaceAbove);
          }
          return 'continue';
        }
      }
      // …and again from a later part: the first re-break assumed full
      // columns after this one, and a column that ends elsewhere (a widow
      // kept, a float, a shorter page) can still end on a hyphen. The
      // paragraph is broken again with that end guarded too, the lines
      // already placed kept at their breaks (only the rest is broken
      // again), and the new setting is taken when it puts no hyphen at
      // this column's end (or fewer at the ends still to come). The
      // placed lines are checked again all the same: a break trace from
      // the other measuring path cannot keep them.
      // Under `'withinPage'` only from a column that closes its page.
      if (
        choice.splitAt > 0
        && hyphenGuard !== true
        && blockTurn.partIndex > 0
        && blockTurn.columnEndHyphenPart !== blockTurn.partIndex
        && looseLines === undefined
        && blockTurn.remainingLines[choice.splitAt - 1]?.hyphenated === true
        && (hyphenGuard === false || columnClosesPage(doc.pages[cursor.pageIndex]!, cursor.columnIndex, style.lineHeightPx))
      ) {
        blockTurn.columnEndHyphenPart = blockTurn.partIndex;
        const placed = blockTurn.paragraphLines.length - blockTurn.remainingLines.length;
        const fullColumn = Math.max(1, Math.floor((state.contentArea.height + 0.01) / style.lineHeightPx));
        const later = guardedColumnEnds(hyphenGuard, choice.splitAt, blockTurn.remainingLines.length, fullColumn, doc.pages[cursor.pageIndex]!, cursor.columnIndex)
          .map((n) => placed + n);
        // The ends already placed keep their guard; the later ones the
        // last re-break assumed give way to where the columns now end.
        const ends = [...blockTurn.guardedEnds.filter((n) => n <= placed), ...later];
        const hyphenatedEnds = (lines: readonly VDTLine[]): number => later.filter((n) => lines[n - 1]?.hyphenated).length;
        const keepBreaks = blockTurn.paragraphBreaks && blockTurn.paragraphBreaks.at.length >= placed
          ? { path: blockTurn.paragraphBreaks.path, at: blockTurn.paragraphBreaks.at.slice(0, placed) }
          : undefined;
        const again = measureForColumns({ avoidHyphenAtLines: ends, ...(keepBreaks ? { keepBreaks } : {}) });
        const lines = again && (again.letterSpacingPx ?? 0) === (blockTurn.letterSpacingPx ?? 0)
          ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
          : undefined;
        const keepsPlaced = lines !== undefined && lines.length > placed
          && blockTurn.paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated);
        if (
          lines
          && keepsPlaced
          && (lines[placed + choice.splitAt - 1]?.hyphenated !== true
            || hyphenatedEnds(lines) < hyphenatedEnds(blockTurn.paragraphLines))
        ) {
          blockTurn.paragraphLines = lines;
          blockTurn.paragraphBreaks = again!.measured.breaks;
          blockTurn.guardedEnds = ends;
          blockTurn.remainingLines = lines.slice(placed);
          regateCitedFloats(blockTurn.blockIdx, lines);
          if (lineTurn.balancing && lineTurn.balancing.spaceAbove > 0) {
            balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - lineTurn.balancing.spaceAbove);
          }
          return 'continue';
        }
      }
      // A poem's bayt set staggered over two lines (or more) stays in one
      // column (#378), and so does a line of verse with its turnovers
      // (#620): the cut goes before it — in an empty column, which the
      // poem cannot leave, after its first line at least.
      while (choice.splitAt > (curCol.blocks.length === 0 ? 1 : 0) && sameVerseLine(blockTurn.remainingLines[choice.splitAt - 1], blockTurn.remainingLines[choice.splitAt])) {
        choice = { splitAt: choice.splitAt - 1, demerit: choice.demerit };
      }
      // A paragraph a drop cap opens never breaks before the initial's
      // last line (#623): it moves on whole, unless it is alone in an
      // empty column too short for those lines, where it breaks all the
      // same (and says so).
      if (blockTurn.partIndex === 0 && blockTurn.capInfo && choice.splitAt > 0 && choice.splitAt < Math.min(blockTurn.capInfo.sink, blockTurn.remainingLines.length)) {
        if (curCol.blocks.length > 0) choice = { splitAt: 0, demerit: choice.demerit };
        else blockMeasureCtx.dropCapNotes?.set(blockTurn.blockIdx, { reason: 'split' });
      }
      // A stanza `keepStanzas` covers (a haiku, a tanka) moves on whole,
      // unless the column is empty: it cannot do better anywhere.
      if (choice.splitAt > 0 && blockTurn.partIndex === 0 && curCol.blocks.length > 0 && keepsStanzaWhole(rawBlock, resolved)) {
        choice = { splitAt: 0, demerit: choice.demerit };
      }
      if (choice.splitAt > 0) {
        // Consume spacing (negative: a container margin pulling the block up)
        if (lineTurn.spacingBefore !== 0) {
          curCol.availableHeight -= lineTurn.spacingBefore;
        }

        const partId = blockTurn.partIndex === 0 ? id : `${id}-cont-${blockTurn.partIndex}`;
        const splitLines = blockTurn.remainingLines.slice(0, choice.splitAt);

        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        applyStyleAttrs(blk, style);
          if (blockTurn.letterSpacingPx !== undefined) blk.letterSpacing = blockTurn.letterSpacingPx; if (blockTurn.runtTracking !== undefined) blk.runtFix = { tracking: blockTurn.runtTracking };
        blk.contentIndex = blockTurn.blockIdx;
        stampBlockExtras(blk, rawBlock);
        if (blockTurn.partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; } if (headingNumber !== undefined) blk.headingNumber = headingNumber; }
        blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
        blk.dirty = false;
        blk.snappedToGrid = false;
        if (splitLines.length > 0) {
          blk.sourceStart = splitLines[0]!.sourceStart;
          blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
        }
        blk.sourceMap = absoluteSourceMap;
        blk.plainPrefixLen = prefixLen;
        if (lineTurn.balancing) blk.balancing = lineTurn.balancing;

        const splitHeight = choice.splitAt * style.lineHeightPx;
        placeBlockInColumn(blk, splitHeight, curCol, cursor);
        citedLinesPlaced(blockTurn.blockIdx, blk);
        finalizeListItem(blk, blockTurn.partIndex === 0);
        doc.blocks.push(blk);

        blockTurn.remainingLines = blockTurn.remainingLines.slice(choice.splitAt);
        blockTurn.partIndex++;
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        return 'continue';
      }
      // choice.splitAt === 0: fall through to push whole paragraph to next column
    }

    // An empty column a band cap cut, under a figure at its head: a block
    // that cannot start there — none of its lines stays, by the rules
    // that split it — goes on to the next column of the band, as it does
    // from such a column uncapped. Forced into it, it ran past the cut,
    // and the cut was taken where it ended, however low (EF-116: the
    // columns beside it then ended far above the box under them).
    const capShortUnderFloat = curCol.blocks.length === 0
      && uncappedBottoms.has(curCol)
      && reservedOf(curCol).top > 0
      && (() => {
        const cols = bandColumns(doc.pages[cursor.pageIndex]!, currentBand(doc.pages[cursor.pageIndex]!, cursor));
        const at = cols.indexOf(curCol);
        return at >= 0 && at < cols.length - 1;
      })();

    // Cannot split — advance to next column if current has content (or
    // the column is a short band that cannot hold the block at all). A
    // block that can split moves on from a short band however tall it is:
    // the next, taller column breaks it by the rules (EF-97).
    if (curCol.blocks.length > 0 || capShortUnderFloat || (shortColumn && (lineTurn.effectiveRemainHeight <= state.contentArea.height || canSplit))) {
      if (curCol.blocks.length === 0) blockTurn.shortColumnMoves++;
      // Heading keep-with-next (no-fit variant): when a block can't fit
      // in the current column — a heading, or any block moving on whole
      // (fewer lines than the widow minimum would stay) — and the
      // column's tail is a run of headings, pull those headings along so
      // they don't remain stranded at the column's bottom. Mirrors the
      // rollback inside the "fits" path. A block leaving a column that
      // holds nothing but headings stays put instead (rolling back would
      // loop): the headings then open the next column with it. The same
      // holds for a heading leaving a full-height (or capped) column that
      // holds nothing but headings: the run would open the next column
      // just as it opens this one and fail the same way — a `breakBefore`
      // heading in it would even open a fresh page every round, forever.
      // Only a short column (under a float, a page-span box) lets the run
      // move on to a taller one.
      const headingRun = trailingHeadingRun(curCol);
      const runFillsColumn = headingRun > 0 && !headingRunMayLeave(curCol, headingRun);
      const strands = blockTurn.partIndex === 0 && vdtType !== 'heading'
        && headingRun > 0 && !runFillsColumn;
      const pullsRun = vdtType === 'heading' && (!runFillsColumn || shortColumn);
      if (resolved.headings.keepWithNext && (pullsRun || strands)) {
        const rolledBack = rollbackHeadings(curCol);
        if (rolledBack.length > 0) {
          blockTurn.blockIdx = (rolledBack[0]!.contentIndex ?? blockTurn.blockIdx - rolledBack.length) - 1;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'break';
        }
      }
      state.pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
      return 'continue';
    }

    // Empty column with less than a line of room (a band cap cutting right
    // under a float band, a column swallowed by reservations): nothing can
    // go here — move on. The next column, or a fresh page, has room —
    // unless the page's whole content area is shorter than a line (#1222):
    // no column ever has, and the block is set here, as one taller than
    // the page.
    if (curCol.availableHeight < style.lineHeightPx - 0.01 && totalRemainHeight > curCol.availableHeight + 0.01
      && state.contentArea.height >= style.lineHeightPx - 0.01) {
      state.pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
      return 'continue';
    }
  };
  return { splitOrMoveOn };
}
