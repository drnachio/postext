// Keep rules before a block's lines are set: heading designs and the text
// they keep with, a colon's list, formulas and verse, contents leads and
// short lists.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration, StepJump } from './lineIteration.js';
import type { HeadingLevelResolver } from '../../sections/headingStyles.js';
import { type VDTDocument, type ResolvedConfig, type VDTPage, type BoundingBox, type VDTColumn, type VDTBlock, type VDTLine, type VDTBlockType, createVDTBlock } from '../../../vdt.js';
import type { PassState } from './state.js';
import type { ContentBlock, ListKind } from '../../../parse/index.js';
import { type PlacementCursor, FIT_EPS, resetLinePositions, placeBlockInColumn, advanceToNextColumn } from '../../blocks/placement.js';
import type { Resource } from '../../../types.js';
import type { BlockStyle } from '../../styles.js';
import { type BlockMeasureContext, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { CompositionRule } from '../../../types/bodyText.js';
import type { BlockIteration } from './blockIteration.js';
import { defaultOpenerTitle, markedTitleFields, measureHeadingDesign, measureDefaultOpenerHeight } from '../../pages/headerFooter.js';
import type { HeadingPlaceholderInfo } from '../../../design/placeholders.js';
import { resolvedLocale } from '../../config.js';
import type { HeadingClaim } from '../passTypes.js';
import { headingSetsOwnBand } from '../passHelpers.js';
import { dimensionToPx } from '../../../units.js';
import { isMarkerBlock, applyStyleAttrs, prevNonMarkerBlock } from '../../blocks/buildHelpers.js';
import { verseMarginTopPx } from '../../blocks/buildBlockKind.js';

/** What createLineKeeps takes from around the loop. */
export interface LineKeepsDeps {
  headingLevels: HeadingLevelResolver;
  doc: VDTDocument;
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  state: PassState;
  chapterNumberByBlock: string[];
  designFramesOn: (page: VDTPage | undefined) => { page: BoundingBox; bleed: BoundingBox; upright?: boolean; };
  contentBlocks: ContentBlock[];
  pageWidthPx: number;
  pageHeightPx: number;
  cursor: PlacementCursor;
  resourceById: Map<string, Resource>;
  bodyStyle: BlockStyle;
  columnHeadKept: (blockIdx: number, rawBlock: ContentBlock, usedHeight: number, height: number, style: { marginTopPx: number; marginBottomPx: number; }, snaps: boolean, col: VDTColumn, ctx: BlockMeasureContext) => number;
  citedLinesPlaced: (blockIdx: number, placed: VDTBlock) => void;
  onNewPage: (page: VDTPage) => void;
  notesPrefixCost: (col: VDTColumn, lines: readonly VDTLine[]) => number[] | undefined;
  balanceExtraInColumn: Map<VDTColumn, number>;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  opensDefaultOpener: (raw: ContentBlock) => boolean;
  underOpenerHeadFloat: (col: VDTColumn) => boolean;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  shortListRule: CompositionRule;
  shortListFrom: (idx: number) => { items: number[]; } | undefined;
  trailingHeadingRun: (col: VDTColumn) => number;
  headingRunMayLeave: (col: VDTColumn, run: number, shortColumn?: boolean) => boolean;
  shortListNeed: (list: { items: number[]; }, width: number, ctx: BlockMeasureContext) => { height: number; lines: VDTLine[]; } | undefined;
  firstListItemStarts: (leadIdx: number, roomPx: number, width: number, ctx: BlockMeasureContext) => boolean;
  citedFootTake: (blockIdx: number, col: VDTColumn, roomAfter: number) => number;
  tocGroupNeed: (idx: number, width: number) => { whole: number; lead: number; } | undefined;
  blockTurn: BlockIteration;
  rawBlock: ContentBlock;
  blockMeasureCtx: BlockMeasureContext;
  id: string;
  prefixLen: number;
  vdtType: VDTBlockType;
  headingLevel: number | undefined;
  numberPrefix: string | undefined;
  numberSeparator: string | undefined;
  absoluteSourceMap: number[];
  hiddenHeading: boolean;
  headingNumber: number | undefined;
  style: BlockStyle;
  lineSpan: number | undefined;
  shouldSnapToGrid: boolean;
  nextBlock: ContentBlock | null;
  endsWithColon: boolean;
  nextIsVerse: boolean;
}

export function createLineKeeps(deps: LineKeepsDeps) {
  const {
    headingLevels, doc, resolved, dpi, baselineGrid, state, chapterNumberByBlock, designFramesOn,
    contentBlocks, pageWidthPx, pageHeightPx, cursor, resourceById, bodyStyle, columnHeadKept,
    citedLinesPlaced, onNewPage, notesPrefixCost, balanceExtraInColumn, stampBlockExtras,
    opensDefaultOpener, underOpenerHeadFloat, rollbackHeadings, shortListRule, shortListFrom,
    trailingHeadingRun, headingRunMayLeave, shortListNeed, firstListItemStarts, citedFootTake,
    tocGroupNeed, blockTurn, rawBlock, blockMeasureCtx, id, prefixLen, vdtType, headingLevel,
    numberPrefix, numberSeparator, absoluteSourceMap, hiddenHeading, headingNumber, style, lineSpan,
    shouldSnapToGrid, nextBlock, endsWithColon, nextIsVerse
  } = deps;
  /** Applies the keep rules; `continue` when they move the lines on. */
  const keepLinesTogether = (lineTurn: LineIteration): StepJump => {
    const {
      curCol, isFirstInColumn, openerHead, totalRemainHeight
    } = lineTurn;
    if (vdtType === 'heading' && headingLevel !== undefined && blockTurn.partIndex === 0 && !hiddenHeading) {
      const lvl = headingLevels.forBlock(rawBlock);
      if (lvl) {
        const pref = numberPrefix ?? '';
        // The lines joined back into the title (EF-162), as the design is
        // painted (`buildHeadersAndFooters`).
        const openerTitle = defaultOpenerTitle(blockTurn.remainingLines, pref, rawBlock.titleBreaks, rawBlock.text.length, lvl.numberSeparator);
        // Span-page openers lay out across the full content area (both
        // columns); in-column headings use just the column width.
        const pageArea = doc.pages[cursor.pageIndex]!.contentArea;
        const measureWidth = lvl.span === 'page' ? pageArea.width : curCol.bbox.width;
        const info: HeadingPlaceholderInfo = { titleText: openerTitle.titleText, ...markedTitleFields(openerTitle, resolved.chipStyles), formattedNumber: pref, numericValue: headingNumber, locale: resolvedLocale(resolved), ...(resolved.numerals ? { numerals: resolved.numerals } : {}), chapterNumber: chapterNumberByBlock[blockTurn.blockIdx] ?? '', attrs: rawBlock.attrs };
        const design = measureHeadingDesign(
          lvl,
          info,
          measureWidth,
          resolved.page.dpi,
          doc.metadata,
          cursor.pageIndex,
          designFramesOn(doc.pages[cursor.pageIndex]),
          {
            x: lvl.span === 'page' ? pageArea.x : curCol.bbox.x,
            y: curCol.bbox.y + (curCol.bbox.height - curCol.availableHeight) + lineTurn.spacingBefore,
          },
          resourceById,
        );
        if (design.height > lineTurn.effectiveRemainHeight) lineTurn.effectiveRemainHeight = design.height;
        // A text anchored to the foot or the middle of the band keeps the
        // box the design is painted in at least as tall as it needs, so it
        // never rises above the heading's top (EF-176). The box of a
        // heading that snaps holds its margin too.
        const textFloor = design.textFloor - (shouldSnapToGrid ? style.marginBottomPx : 0);
        if (textFloor > lineTurn.effectiveRemainHeight) lineTurn.effectiveRemainHeight = textFloor;
        // The default opener sets the title with the design painter, which
        // can take more lines than the heading's own measure (a justified
        // line whose spaces shrink, a forced break, a run it prints plain):
        // the band holds every line it paints (EF-100).
        if (opensDefaultOpener(rawBlock)) {
          const painted = measureDefaultOpenerHeight(
            lvl,
            resolved.headings.textAlign,
            openerTitle,
            pref,
            pageArea.width,
            resolved.page.dpi,
            doc.metadata,
            cursor.pageIndex,
            resolved.chipStyles,
          );
          if (painted > lineTurn.effectiveRemainHeight) lineTurn.effectiveRemainHeight = painted;
        }
        // What sets the design's reservation, for `headingClaimsColumn`
        // (#997): only a design taller than the heading's own lines.
        const claim: HeadingClaim | undefined = lvl.span !== 'page' && design.height > totalRemainHeight
          ? (design.byMinHeight ? {} : design.claimedBy !== undefined ? { element: design.claimedBy } : undefined)
          : undefined;
        lineTurn.headingDesign = { lvl, info, ...(claim ? { claim } : {}) };
      }
    }

    // With `headings.columnHeadSpace: 'remainder'` (#706) a heading that
    // opens a column drops its space above in whole grid lines only: what is
    // left of a line stays above it, so its text starts as far under it
    // as under the same heading set after a paragraph. The foot of its
    // box stays on the grid line the snap puts it on, and no line of body
    // text moves. A heading the grid does not snap, a hidden one, a
    // `lineSpan` band, a page-span opener and a heading painted from its
    // own design (its band is the design's, drawn from the column's head)
    // keep the head of the column; so does the first block of a column
    // under an opener band, which is set level with the first block
    // under the opener (`openerHead`).
    if (
      vdtType === 'heading' && blockTurn.partIndex === 0 && !hiddenHeading && lineSpan === undefined
      && resolved.headings.columnHeadSpace === 'remainder'
      && (isFirstInColumn || underOpenerHeadFloat(curCol)) && openerHead === undefined
      && !headingSetsOwnBand(headingLevels.forBlock(rawBlock))
    ) {
      const usedHeight = curCol.bbox.height - curCol.availableHeight;
      const kept = columnHeadKept(blockTurn.blockIdx, rawBlock, usedHeight, lineTurn.effectiveRemainHeight, style, shouldSnapToGrid, curCol, blockMeasureCtx);
      if (kept > 0) {
        lineTurn.spacingBefore += kept;
        lineTurn.effectiveAvailable -= kept;
      }
    }

    // Keep-with-list: if this colon-paragraph would fit but would leave no
    // room for the first list item, split off the colon line (or push the
    // whole paragraph when it is a single line or the split would leave a
    // widow). Only applies to the original paragraph placement — once split,
    // the tail follows the list naturally in the next column.
    if (
      endsWithColon
      && blockTurn.partIndex === 0
      // The tolerance of the fit check below (#635): a paragraph that
      // fits by a hair of drift is one this rule reads too.
      && totalRemainHeight <= lineTurn.effectiveAvailable + FIT_EPS
      && curCol.blocks.length > 0
    ) {
      const usedHeight = (curCol.bbox.height - curCol.availableHeight) + lineTurn.spacingBefore;
      const paragraphBottom = usedHeight + totalRemainHeight;
      // Slack after the paragraph as the plain pass saw it: the height
      // balancing added above in this column is not room the list lost.
      const availableAfter = curCol.bbox.height - paragraphBottom + (balanceExtraInColumn.get(curCol) ?? 0);
      const nextListKind = (nextBlock as { listKind?: ListKind } | null)?.listKind ?? 'unordered';
      const nextListMarginDim = nextListKind === 'ordered'
        ? resolved.orderedLists.marginTop
        : resolved.unorderedLists.marginTop;
      const nextListMarginTopPx = dimensionToPx(nextListMarginDim, dpi, bodyStyle.fontSizePx);
      let effectiveGap = Math.max(style.marginBottomPx, nextListMarginTopPx);
      // A list that snaps its top (EF-103) opens on the next grid line.
      const nextLists = blockMeasureCtx.resolved;
      if ((nextListKind === 'ordered' ? nextLists.orderedLists : nextLists.unorderedLists).snapTopToGrid) {
        effectiveGap = Math.ceil((paragraphBottom + effectiveGap - 0.01) / baselineGrid) * baselineGrid - paragraphBottom;
      }
      const minSpaceForList = effectiveGap + bodyStyle.lineHeightPx;
      // A short list set whole (`shortListSplit: 'avoid'`, #749) needs
      // all its room under the colon line, when a column can hold the
      // line and the list at all — less what a figure this paragraph
      // cites will take from the column's foot (`citedFootTake`).
      let listIdx = blockTurn.blockIdx + 1;
      while (listIdx < contentBlocks.length && isMarkerBlock(contentBlocks[listIdx])) listIdx++;
      const wholeList = shortListRule === 'avoid' ? shortListFrom(listIdx) : undefined;
      const wholeNeed = wholeList ? shortListNeed(wholeList, curCol.bbox.width, blockMeasureCtx) : undefined;
      const keepsListWhole = wholeNeed !== undefined
        && style.lineHeightPx + effectiveGap + wholeNeed.height <= state.contentArea.height + FIT_EPS;
      // A line of room is not always enough (EF-110): with
      // `colonListRoom: 'item'` the first item has to be able to start
      // there, by the rules that split it — a two-line item the orphan
      // and widow rules keep whole needs both. `'line'` keeps the 1.4
      // check, one line.
      if (
        availableAfter < minSpaceForList - FIT_EPS
        || (resolved.bodyText.colonListRoom === 'item'
          && !firstListItemStarts(blockTurn.blockIdx, availableAfter - effectiveGap, curCol.bbox.width, blockMeasureCtx))
        || (keepsListWhole && availableAfter - effectiveGap - citedFootTake(blockTurn.blockIdx, curCol, availableAfter) < wholeNeed.height - FIT_EPS)
      ) {
        const effectiveWidowMin = resolved.bodyText.avoidWidows
          ? Math.max(1, resolved.bodyText.widowMinLines)
          : 1;
        const splitAt = blockTurn.remainingLines.length - 1;
        if (splitAt >= effectiveWidowMin) {
          if (lineTurn.spacingBefore !== 0) curCol.availableHeight -= lineTurn.spacingBefore;
          const splitLines = blockTurn.remainingLines.slice(0, splitAt);
          const blk = createVDTBlock(id, vdtType, style.fontString, style.color, style.textAlign);
          applyStyleAttrs(blk, style);
          if (blockTurn.letterSpacingPx !== undefined) blk.letterSpacing = blockTurn.letterSpacingPx; if (blockTurn.runtTracking !== undefined) blk.runtFix = { tracking: blockTurn.runtTracking };
          blk.contentIndex = blockTurn.blockIdx;
          stampBlockExtras(blk, rawBlock);
          blk.headingLevel = headingLevel;
          if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; }
          blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
          blk.dirty = false;
          blk.snappedToGrid = false;
          blk.sourceStart = splitLines[0]!.sourceStart;
          blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
          blk.sourceMap = absoluteSourceMap;
          blk.plainPrefixLen = prefixLen;
          if (lineTurn.balancing) blk.balancing = lineTurn.balancing;
          placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
          citedLinesPlaced(blockTurn.blockIdx, blk);
          doc.blocks.push(blk);
          blockTurn.remainingLines = blockTurn.remainingLines.slice(splitAt);
          blockTurn.partIndex++;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'continue';
        }
        // Can't cleanly split the colon line off — would create a widow.
        // Pushing the whole paragraph keeps the colon+list together, but
        // strands any trailing heading(s) as last-in-column orphans. Roll
        // those along with the paragraph when there's non-heading content
        // before them; if the column contains only heading(s) (fresh after
        // a prior rollback), rolling back again would loop — fall through
        // and place the paragraph here, trading the heading-orphan for a
        // softer colon/list separation.
        let headingRunCount = 0;
        if (resolved.headings.keepWithNext) {
          for (let j = curCol.blocks.length - 1; j >= 0; j--) {
            if (curCol.blocks[j]!.type === 'heading' && curCol.blocks[j]!.containerId === undefined) headingRunCount++;
            else break;
          }
        }
        if (headingRunCount > 0 && headingRunCount < curCol.blocks.length) {
          const popped = rollbackHeadings(curCol);
          // Rewind so the for-loop's blockIdx++ lands on the first
          // rolled-back heading (marker blocks in between are replayed).
          blockTurn.blockIdx = (popped[0]!.contentIndex ?? blockTurn.blockIdx - headingRunCount) - 1;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'break';
        }
        if (headingRunCount === 0) {
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'continue';
        }
        // headingRunCount === curCol.blocks.length: fall through to place.
      }
    }

    // Keep a display formula with its lead-in (`math.keepWithLeadIn`,
    // TeX's predisplay penalty, EF-84): when this paragraph — or the part
    // of it left to set — fits the column but the formula after it does
    // not fit under its last line, that line goes on with the formula.
    // The lines left here keep the widow minimum; with fewer, a paragraph
    // that opens here moves on whole, and one already running on from
    // the column before stays (it cannot do better anywhere).
    // A poem (#378) is kept with the paragraph that introduces it the
    // same way: when its first bayts cannot start under the paragraph's
    // last line (by the orphan and widow rules a poem is split by), that
    // line goes on with them.
    const nextIsFormula = resolved.math.keepWithLeadIn && contentBlocks[blockTurn.blockIdx + 1]?.type === 'mathDisplay';
    if (
      (nextIsFormula || nextIsVerse)
      && vdtType === 'paragraph'
      && totalRemainHeight <= lineTurn.effectiveAvailable + FIT_EPS
    ) {
      const usedHeight = (curCol.bbox.height - curCol.availableHeight) + lineTurn.spacingBefore;
      // As the plain pass saw it: room balancing added above is not room
      // the formula lost.
      const availableAfter = curCol.bbox.height - (usedHeight + totalRemainHeight) + (balanceExtraInColumn.get(curCol) ?? 0);
      let goesOn: boolean;
      if (nextIsFormula) {
        const formula = measureContentBlock(contentBlocks[blockTurn.blockIdx + 1]!, blockTurn.blockIdx + 1, curCol.bbox.width, blockMeasureCtx);
        const formulaHeight = formula ? (formula.measured.lines[0]?.bbox.height ?? formula.measured.totalHeight) : 0;
        const gap = Math.max(style.marginBottomPx, formula?.kind.style.marginTopPx ?? 0);
        goesOn = !!formula && formulaHeight > 0 && availableAfter + FIT_EPS < gap + formulaHeight;
      } else {
        // The poem starts under the larger of this paragraph's bottom
        // margin and its own style's top margin.
        const poemGap = Math.max(style.marginBottomPx, verseMarginTopPx(nextBlock?.verse?.attrs.style, resolved));
        goesOn = !firstListItemStarts(blockTurn.blockIdx, availableAfter - poemGap, curCol.bbox.width, blockMeasureCtx);
      }
      if (goesOn) {
        const minKeep = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
        const splitAt = blockTurn.remainingLines.length - 1;
        if (splitAt >= minKeep) {
          if (lineTurn.spacingBefore !== 0) curCol.availableHeight -= lineTurn.spacingBefore;
          const partId = blockTurn.partIndex === 0 ? id : `${id}-cont-${blockTurn.partIndex}`;
          const splitLines = blockTurn.remainingLines.slice(0, splitAt);
          const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
          applyStyleAttrs(blk, style);
          if (blockTurn.letterSpacingPx !== undefined) blk.letterSpacing = blockTurn.letterSpacingPx; if (blockTurn.runtTracking !== undefined) blk.runtFix = { tracking: blockTurn.runtTracking };
          blk.contentIndex = blockTurn.blockIdx;
          stampBlockExtras(blk, rawBlock);
          blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
          blk.dirty = false;
          blk.snappedToGrid = false;
          blk.sourceStart = splitLines[0]!.sourceStart;
          blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
          blk.sourceMap = absoluteSourceMap;
          blk.plainPrefixLen = prefixLen;
          if (lineTurn.balancing) blk.balancing = lineTurn.balancing;
          placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
          citedLinesPlaced(blockTurn.blockIdx, blk);
          doc.blocks.push(blk);
          blockTurn.remainingLines = blockTurn.remainingLines.slice(splitAt);
          blockTurn.partIndex++;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return 'continue';
        }
        if (blockTurn.partIndex === 0 && curCol.blocks.length > 0) {
          // Moving on whole must not strand a heading closing the column.
          const headingRun = trailingHeadingRun(curCol);
          if (resolved.headings.keepWithNext && headingRunMayLeave(curCol, headingRun)) {
            const rolledBack = rollbackHeadings(curCol);
            if (rolledBack.length > 0) {
              blockTurn.blockIdx = (rolledBack[0]!.contentIndex ?? blockTurn.blockIdx - rolledBack.length) - 1;
              state.pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
              return 'break';
            }
          }
          if (headingRun < curCol.blocks.length) {
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            return 'continue';
          }
        }
      }
    }

    // A block of the contents is set whole (`toc.groups.keepTogether`,
    // `:::toc{keep}`, #850): when its rows do not all fit in the room the
    // column has left and a full column would hold them, it opens the
    // next column, with the headings right above it. One taller than a
    // column is cut, but keeps its head with `minEntriesAfterHead`
    // entries. Not a block that opens its column, or stands under
    // nothing but headings: it cannot do better anywhere.
    if (rawBlock.toc?.group?.lead && blockTurn.partIndex === 0 && curCol.blocks.length > 0) {
      const headingRun = trailingHeadingRun(curCol);
      const need = headingRun < curCol.blocks.length ? tocGroupNeed(blockTurn.blockIdx, curCol.bbox.width) : undefined;
      if (need) {
        const room = curCol.availableHeight - lineTurn.spacingBefore;
        const asked = need.whole <= state.contentArea.height + FIT_EPS ? need.whole : need.lead;
        if (asked > room + FIT_EPS) {
          if (resolved.headings.keepWithNext && headingRun > 0) {
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
      }
    }

    // A short list is set whole (`bodyText.shortListSplit: 'avoid'`,
    // #749): when its items do not all fit under what the column holds
    // and an empty column would hold them, the list opens the next
    // column, with the headings right above it. Not a list a colon line
    // introduces: that line already took the list's room into account,
    // and the two stay together. Nor one that opens its column, or
    // stands under nothing but headings: it cannot do better anywhere.
    if (vdtType === 'listItem' && blockTurn.partIndex === 0 && shortListRule === 'avoid' && curCol.blocks.length > 0) {
      const list = shortListFrom(blockTurn.blockIdx);
      const headingRun = trailingHeadingRun(curCol);
      const lead = list ? prevNonMarkerBlock(contentBlocks, blockTurn.blockIdx) : undefined;
      const colonLed = lead?.type === 'paragraph' && resolved.bodyText.keepColonWithList && /[:：︰﹕]\s*$/.test(lead.text);
      const need = list && !colonLed && headingRun < curCol.blocks.length
        ? shortListNeed(list, curCol.bbox.width, blockMeasureCtx)
        : undefined;
      if (need && need.height <= state.contentArea.height + FIT_EPS) {
        const listNotes = notesPrefixCost(curCol, need.lines);
        const room = curCol.availableHeight - lineTurn.spacingBefore - (listNotes ? listNotes[listNotes.length - 1]! : 0);
        if (need.height > room + FIT_EPS) {
          if (resolved.headings.keepWithNext && headingRun > 0) {
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
      }
    }
  };
  return { keepLinesTogether };
}
