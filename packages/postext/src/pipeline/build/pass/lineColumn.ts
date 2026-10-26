// The column the next lines of a block go into: its band, its width (a
// re-break when it differs) and the spacing above them.
// Part of placeLines (placeLines.ts), split out of its loop in #1276.
import type { LineIteration } from './lineIteration.js';
import type { VDTDocument, VDTLine, VDTColumn, VDTBlockType } from '../../../vdt.js';
import { type PlacementCursor, currentColumn } from '../../blocks/placement.js';
import type { BlockIteration } from './blockIteration.js';
import type { ContentBlock } from '../../../parse/index.js';
import { type BlockMeasureContext, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { BlockStyle } from '../../styles.js';
import { raggedLooseLines } from '../../text/raggedLines.js';
import { insetsBefore } from '../../floats/textWrap.js';

/** What createLineColumn takes from around the loop. */
export interface LineColumnDeps {
  doc: VDTDocument;
  cursor: PlacementCursor;
  regateCitedFloats: (blockIdx: number, lines: readonly VDTLine[]) => void;
  openFloatWraps: (col: VDTColumn) => void;
  openerHeadSpacing: (col: VDTColumn, level: boolean) => number | undefined;
  enterBand: (contentIndex: number, part: number) => void;
  blockTurn: BlockIteration;
  rawBlock: ContentBlock;
  blockMeasureCtx: BlockMeasureContext;
  styleOverride: BlockStyle | undefined;
  vdtType: VDTBlockType;
  style: BlockStyle;
  wrapsBeside: boolean;
  rebreaksForColumn: boolean;
}

export function createLineColumn(deps: LineColumnDeps) {
  const {
    doc, cursor, regateCitedFloats, openFloatWraps, openerHeadSpacing, enterBand, blockTurn,
    rawBlock, blockMeasureCtx, styleOverride, vdtType, style, wrapsBeside, rebreaksForColumn
  } = deps;
  /** Finds the column the next lines go into and how much space opens them. */
  const openLineColumn = (lineTurn: LineIteration): void => {
    enterBand(blockTurn.blockIdx, blockTurn.partIndex);
    const curCol = currentColumn(doc, cursor);
    // A wrapped float at the head or foot of this column (#627): running
    // text takes its band back to run beside it.
    if (wrapsBeside) openFloatWraps(curCol);
    // The rest of the block goes into a column of another width than the
    // one it was broken for (EF-157): break it again for this one. Up to
    // postext 1.4 it kept the lines of the column it started in, and a
    // line set for the wide column ran past the narrow one (clipped).
    const restWidth = blockTurn.laterWidths.length > 0 ? blockTurn.laterWidths[blockTurn.laterWidths.length - 1]!.columnWidth : blockTurn.brokenForWidth;
    if (rebreaksForColumn && Math.abs(curCol.bbox.width - restWidth) > 0.5) {
      const placed = blockTurn.paragraphLines.length - blockTurn.remainingLines.length;
      if (placed === 0) {
        // Nothing placed yet: the whole block, for this column.
        const again = measureContentBlock(rawBlock, blockTurn.blockIdx, curCol.bbox.width, blockMeasureCtx, { styleOverride });
        if (again && again.measured.lines.length > 0) {
          blockTurn.capInfo = again.dropCap;
          blockTurn.brokenForWidth = curCol.bbox.width;
          blockTurn.laterWidths = [];
          blockTurn.wrapInsets = [];
          blockTurn.letterSpacingPx = again.letterSpacingPx;
          blockTurn.runtTracking = again.runtTracking;
          blockTurn.remainingLines = [...raggedLooseLines(again.measured.lines, style.textAlign)];
          blockTurn.paragraphLines = blockTurn.remainingLines;
          blockTurn.paragraphBreaks = again.measured.breaks;
          blockTurn.guardedEnds = [];
          blockTurn.columnEndHyphenRetried = false;
          regateCitedFloats(blockTurn.blockIdx, blockTurn.remainingLines);
        }
      } else {
        // The placed lines keep their breaks; the rest is broken for
        // this column. Taken only when the placed lines come out as they
        // were (a break trace from the other measuring path cannot keep
        // them) and with the same tracking.
        const steps = [...blockTurn.laterWidths, { fromLine: placed, columnWidth: curCol.bbox.width }];
        const keepBreaks = blockTurn.paragraphBreaks && blockTurn.paragraphBreaks.at.length >= placed
          ? { path: blockTurn.paragraphBreaks.path, at: blockTurn.paragraphBreaks.at.slice(0, placed) }
          : undefined;
        const keptInsets = insetsBefore(blockTurn.wrapInsets, placed);
        const again = measureContentBlock(rawBlock, blockTurn.blockIdx, blockTurn.brokenForWidth, blockMeasureCtx, {
          styleOverride, restColumnWidths: steps, ...(keepBreaks ? { keepBreaks } : {}),
          ...(keptInsets.length > 0 ? { lineInsets: keptInsets } : {}),
        });
        const lines = again && (again.letterSpacingPx ?? 0) === (blockTurn.letterSpacingPx ?? 0)
          ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
          : undefined;
        if (
          lines && lines.length > placed
          && blockTurn.paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated)
        ) {
          blockTurn.laterWidths = steps;
          blockTurn.wrapInsets = keptInsets;
          blockTurn.paragraphLines = lines;
          blockTurn.paragraphBreaks = again!.measured.breaks;
          blockTurn.remainingLines = lines.slice(placed);
          regateCitedFloats(blockTurn.blockIdx, lines);
        }
      }
    }
    const isFirstInColumn = curCol.blocks.length === 0;
    /** Under a page-span opener: where this column's first block goes. A
     *  heading, a display formula or a contents row keeps level with the
     *  first block under the opener; text starts on the grid. */
    const openerHead = isFirstInColumn
      ? openerHeadSpacing(curCol, vdtType === 'heading' || vdtType === 'mathDisplay' || rawBlock.toc !== undefined)
      : undefined;

    // Compute spacing before this block — margin collapsing between
    // consecutive headings: only the larger of marginBottom / marginTop applies
    lineTurn.spacingBefore = 0;
    /** Column balancing: the levers applied to this placement, stamped
     *  on the block it places (`VDTBlock.balancing`). */
    lineTurn.balancing = undefined;
    lineTurn.curCol = curCol;
    lineTurn.isFirstInColumn = isFirstInColumn;
    lineTurn.openerHead = openerHead;
  };
  return { openLineColumn };
}
