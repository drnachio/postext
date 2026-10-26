// The room a block's lines have in their column: spacing at a column's head,
// opener heads, text wrap, loose tracking, the notes the lines cite and line
// spans.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration, StepJump } from './lineIteration.js';
import type { PassState } from './state.js';
import type { HeadingLevelResolver } from '../../sections/headingStyles.js';
import type { ResolvedConfig, VDTLine, VDTColumn, VDTBlockType } from '../../../vdt.js';
import type { ContentBlock, ListKind } from '../../../parse/index.js';
import type { BlockIteration } from './blockIteration.js';
import { type BlockMeasureContext, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { BlockStyle } from '../../styles.js';
import { prevNonMarkerBlock } from '../../blocks/buildHelpers.js';
import { balanceKey } from '../../columns/columnBalancing.js';
import { columnCursorY, wrapInsetSteps, sameInsetsFrom, insetsBefore, settleColumnWraps } from '../../floats/textWrap.js';
import { raggedLooseLines } from '../../text/raggedLines.js';
import { headingLineSpanBand } from '../../text/lineSpan.js';

/** What createLineRoom takes from around the loop. */
export interface LineRoomDeps {
  state: PassState;
  headingLevels: HeadingLevelResolver;
  resolved: ResolvedConfig;
  baselineGrid: number;
  balanceExtraPx: ReadonlyMap<number, number> | undefined;
  looseOutcome: Map<number, number | null>;
  contentBlocks: ContentBlock[];
  regateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  notesPrefixCost: (col: VDTColumn, lines: readonly VDTLine[]) => number[] | undefined;
  pendingBeforeSelfSnapping: (idx: number) => number;
  addBalanceExtra: (col: VDTColumn, px: number) => void;
  balanceExtraInColumn: Map<VDTColumn, number>;
  underOpenerHeadFloat: (col: VDTColumn) => boolean;
  blockTurn: BlockIteration;
  rawBlock: ContentBlock;
  blockMeasureCtx: BlockMeasureContext;
  styleOverride: BlockStyle | undefined;
  tryLoose: boolean;
  looseLines: number | undefined;
  vdtType: VDTBlockType;
  style: BlockStyle;
  lineSpan: number | undefined;
  listKind: ListKind | undefined;
  wrapsBeside: boolean;
}

export function createLineRoom(deps: LineRoomDeps) {
  const {
    state, headingLevels, resolved, baselineGrid, balanceExtraPx, looseOutcome, contentBlocks,
    regateCitedFloats, reservedOf, notesPrefixCost, pendingBeforeSelfSnapping, addBalanceExtra,
    balanceExtraInColumn, underOpenerHeadFloat, blockTurn, rawBlock, blockMeasureCtx, styleOverride,
    tryLoose, looseLines, vdtType, style, lineSpan, listKind, wrapsBeside
  } = deps;
  /** Works out the room the next lines have and what they need. */
  const measureLineRoom = (lineTurn: LineIteration): StepJump => {
    const {
      curCol, isFirstInColumn, openerHead
    } = lineTurn;
    // (Right under a float at the head of the opener's own column, #639,
    // the block starts as at a column's head: no space above it.)
    if (!isFirstInColumn && !underOpenerHeadFloat(curCol)) {
      lineTurn.spacingBefore = state.pendingSpacing;
      if (vdtType === 'heading' || vdtType === 'mathDisplay') {
        lineTurn.spacingBefore = Math.max(blockTurn.partIndex === 0 ? pendingBeforeSelfSnapping(blockTurn.blockIdx) : lineTurn.spacingBefore, style.marginTopPx);
        // A 行取り band opens on a grid line when its heading snaps to the
        // grid, so its lines are body lines (#424).
        if (lineSpan !== undefined && blockTurn.partIndex === 0 && (headingLevels.forBlock(rawBlock)?.snapToGrid ?? resolved.headings.snapToGrid)) {
          const usedHeight = curCol.bbox.height - curCol.availableHeight;
          lineTurn.spacingBefore = Math.ceil((usedHeight + lineTurn.spacingBefore - 0.01) / baselineGrid) * baselineGrid - usedHeight;
        }
        // Column balancing: extra whole grid lines above this heading so
        // the column it sits in ends flush with the page bottom. Applied
        // after margin collapsing — the heading's effective top margin
        // grows by the assigned lines. Suppressed for first-in-column
        // headings (no top margin there), keeping columns starting at the
        // page top.
        if (vdtType === 'heading') {
          const extraPx = balanceExtraPx?.get(blockTurn.blockIdx);
          if (extraPx) {
            lineTurn.spacingBefore += extraPx;
            addBalanceExtra(curCol, extraPx);
            lineTurn.balancing = { levers: ['heading'], spaceAbove: extraPx };
          }
        }
      } else if (vdtType === 'listItem') {
        const prevWasList = prevNonMarkerBlock(contentBlocks, blockTurn.blockIdx)?.type === 'listItem';
        if (!prevWasList) {
          lineTurn.spacingBefore = Math.max(lineTurn.spacingBefore, style.marginTopPx);
          // `snapTopToGrid` (EF-103): the space above rounds up so the
          // first item lands on the grid, the margin a minimum. Read from
          // the block's own context, since a part or a styled section may
          // override its lists.
          const listsCfg = blockMeasureCtx.resolved;
          const lists = listKind === 'ordered' ? listsCfg.orderedLists : listsCfg.unorderedLists;
          if (blockTurn.partIndex === 0 && lists.snapTopToGrid) {
            const usedHeight = curCol.bbox.height - curCol.availableHeight;
            const top = Math.ceil((usedHeight + lineTurn.spacingBefore - 0.01) / baselineGrid) * baselineGrid;
            lineTurn.spacingBefore = top - usedHeight;
          }
        }
      } else if (vdtType === 'score') {
        // A score's top margin above its first system, the system gap
        // above the others (#1172).
        lineTurn.spacingBefore = Math.max(lineTurn.spacingBefore, style.marginTopPx);
      } else if (rawBlock.verse && blockTurn.partIndex === 0) {
        // A poem: the top margin of the paragraph style its fence names.
        lineTurn.spacingBefore = Math.max(lineTurn.spacingBefore, style.marginTopPx);
      } else if (rawBlock.toc || rawBlock.index) {
        // A part row or an unnumbered entry of the contents: its top
        // margin (`toc.parts.marginTop`, the level's `marginTop`) applies
        // like a heading's.
        lineTurn.spacingBefore = Math.max(lineTurn.spacingBefore, style.marginTopPx);
      }
      // Column balancing: extra grid lines above a non-heading balance
      // target — the first block after a list end. Heading targets are
      // handled inside the heading branch above (after margin collapsing).
      if (vdtType !== 'heading' && vdtType !== 'mathDisplay' && blockTurn.partIndex === 0) {
        const extraPx = balanceExtraPx?.get(blockTurn.blockIdx);
        if (extraPx) {
          lineTurn.spacingBefore += extraPx;
          addBalanceExtra(curCol, extraPx);
          // The block the lever pushes down follows a list's end, or a
          // display formula / box (the two candidates the gap collector
          // offers a non-heading block that does not open its column).
          const prev = curCol.blocks[curCol.blocks.length - 1];
          const afterList = prev?.type === 'listItem' && prev.containerId === undefined;
          lineTurn.balancing = { levers: [afterList ? 'listEnd' : 'afterDisplay'], spaceAbove: extraPx };
        }
      }
    } else if (openerHead !== undefined) {
      // The head of a column under a page-span opener (EF-139).
      lineTurn.spacingBefore = openerHead;
    } else if (reservedOf(curCol).top > 0) {
      // Column balancing: extra grid lines between the float band at the
      // head of this column and its first block (the after-float lever).
      // A paragraph resuming from the column before is levered on its own
      // fragment, so the room lands under the figure and not back at the
      // paragraph's start. A heading there is a heading lever.
      const extraPx = balanceExtraPx?.get(balanceKey(blockTurn.blockIdx, blockTurn.partIndex));
      if (extraPx) {
        lineTurn.spacingBefore += extraPx;
        addBalanceExtra(curCol, extraPx);
        lineTurn.balancing = { levers: [vdtType === 'heading' ? 'heading' : 'afterFloat'], spaceAbove: extraPx };
      }
    }
    // A raised initial (#623) keeps its rise clear above the paragraph,
    // in whole grid lines.
    if (blockTurn.partIndex === 0 && blockTurn.capInfo && blockTurn.capInfo.rise > 0.5) {
      lineTurn.spacingBefore += Math.ceil((blockTurn.capInfo.rise - 0.5) / baselineGrid) * baselineGrid;
    }
    // Text wrap (#627): the lines this block would set beside what text
    // wraps round in this column are broken short of it; the lines it
    // already placed elsewhere keep their breaks. A block that cannot
    // keep them (a break trace of the other measuring path) goes under
    // what it would have run beside instead.
    if (wrapsBeside) {
      const placed = blockTurn.paragraphLines.length - blockTurn.remainingLines.length;
      const y0 = columnCursorY(curCol) + lineTurn.spacingBefore;
      const wanted = wrapInsetSteps(curCol, y0, style.lineHeightPx, placed);
      if (!sameInsetsFrom(blockTurn.wrapInsets, wanted, placed)) {
        const steps = [...insetsBefore(blockTurn.wrapInsets, placed), ...wanted];
        const keepBreaks = placed > 0 && blockTurn.paragraphBreaks && blockTurn.paragraphBreaks.at.length >= placed
          ? { path: blockTurn.paragraphBreaks.path, at: blockTurn.paragraphBreaks.at.slice(0, placed) }
          : undefined;
        const again = placed > 0 && !keepBreaks ? null : measureContentBlock(rawBlock, blockTurn.blockIdx, blockTurn.brokenForWidth, blockMeasureCtx, {
          styleOverride,
          ...(blockTurn.laterWidths.length > 0 ? { restColumnWidths: blockTurn.laterWidths } : {}),
          ...(steps.length > 0 ? { lineInsets: steps } : {}),
          ...(keepBreaks ? { keepBreaks } : {}),
        });
        const lines = again && (placed === 0 || (again.letterSpacingPx ?? 0) === (blockTurn.letterSpacingPx ?? 0))
          ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
          : undefined;
        if (
          lines && lines.length > placed
          && blockTurn.paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated)
        ) {
          blockTurn.wrapInsets = steps;
          blockTurn.paragraphLines = lines;
          blockTurn.paragraphBreaks = again!.measured.breaks;
          blockTurn.remainingLines = lines.slice(placed);
          if (placed === 0) {
            blockTurn.capInfo = again!.dropCap;
            blockTurn.letterSpacingPx = again!.letterSpacingPx;
            blockTurn.runtTracking = again!.runtTracking;
            blockTurn.guardedEnds = [];
            blockTurn.columnEndHyphenRetried = false;
          }
          regateCitedFloats(blockTurn.blockIdx, lines);
        } else if (wanted.length > 0) {
          if (lineTurn.balancing && lineTurn.balancing.spaceAbove > 0) {
            balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - lineTurn.balancing.spaceAbove);
          }
          settleColumnWraps(curCol);
          state.pendingSpacing = 0;
          return 'continue';
        }
      }
    }
    // A loose paragraph's extra line is balancing height too (it lands
    // whole in this column — loose candidates are never split parts).
    const looseTracking = looseOutcome.get(blockTurn.blockIdx);
    if (blockTurn.partIndex === 0 && tryLoose && looseLines !== undefined && typeof looseTracking === 'number') {
      addBalanceExtra(curCol, looseLines * style.lineHeightPx);
      lineTurn.balancing = {
        levers: [...(lineTurn.balancing?.levers ?? []), 'looseParagraph'],
        spaceAbove: lineTurn.balancing?.spaceAbove ?? 0,
        extraLines: looseLines,
        tracking: looseTracking,
      };
    }

    // Footnotes the lines cite take room at the column's foot: the whole
    // block fits when its lines and all their notes do, and a split
    // keeps the lines whose notes fit under them.
    const noteCosts = vdtType === 'mathDisplay' || vdtType === 'score' ? undefined : notesPrefixCost(curCol, blockTurn.remainingLines);
    lineTurn.effectiveAvailable = curCol.availableHeight - lineTurn.spacingBefore - (noteCosts ? noteCosts[noteCosts.length - 1]! : 0);
    // A hair of tolerance: room of exactly N lines (grid arithmetic in
    // floats — a column cut by a band cap, a balancing extra line) must
    // hold N lines, not N - 1.
    lineTurn.linesPerAvailable = Math.floor((curCol.availableHeight - lineTurn.spacingBefore + 0.01) / style.lineHeightPx);
    if (noteCosts) {
      const costOf = (k: number): number => noteCosts[Math.min(k, noteCosts.length - 1)]!;
      while (lineTurn.linesPerAvailable > 0 && lineTurn.linesPerAvailable * style.lineHeightPx + costOf(lineTurn.linesPerAvailable) > curCol.availableHeight - lineTurn.spacingBefore + 0.01) {
        lineTurn.linesPerAvailable--;
      }
    }
    // Math display blocks carry their natural pixel height on the single
    // VDTLine; text blocks use the uniform body lineHeightPx per line.
    const totalRemainHeight = vdtType === 'mathDisplay' || vdtType === 'score'
      ? (blockTurn.remainingLines[0]?.bbox.height ?? style.lineHeightPx)
      : blockTurn.remainingLines.length * style.lineHeightPx;

    // For headings with an enabled advanced-design slot, the rendered
    // overlay may extend below the natural text bottom. Measure the slot's
    // actual content bottom so the reserved block height (and the
    // subsequent marginBottom + grid snap) starts from there.
    lineTurn.effectiveRemainHeight = totalRemainHeight;
    // A paragraph shorter than its drop cap sinks (#623, `'reserve'`):
    // the block keeps the room under the initial.
    if (blockTurn.partIndex === 0 && blockTurn.capInfo && blockTurn.capInfo.minLines > blockTurn.remainingLines.length) {
      lineTurn.effectiveRemainHeight = blockTurn.capInfo.minLines * style.lineHeightPx;
    }
    /** How far the lines of a 行取り heading go down its band (#424). */
    lineTurn.lineSpanShift = 0;
    if (lineSpan !== undefined && blockTurn.partIndex === 0) {
      const bodyBlockStyle = blockMeasureCtx.bodyStyle;
      const band = headingLineSpanBand(
        lineSpan,
        blockTurn.remainingLines.length,
        style.lineHeightPx,
        { font: style.fontString, sizePx: style.fontSizePx },
        { font: bodyBlockStyle.fontString, sizePx: bodyBlockStyle.fontSizePx },
        baselineGrid,
      );
      lineTurn.effectiveRemainHeight = band.height;
      lineTurn.lineSpanShift = band.shift;
    }
    /** The heading's design and the values it is laid out with, kept for
     *  the side-column obstacles once the block is placed (EF-78). */
    lineTurn.headingDesign = undefined;
    lineTurn.totalRemainHeight = totalRemainHeight;
  };
  return { measureLineRoom };
}
