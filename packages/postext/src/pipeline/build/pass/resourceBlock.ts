// Resource blocks set in the text: a figure, table or embed placed where it
// is written, moved on whole when it does not fit.
// Part of the placement pass (pass.ts), split out of its loop in #1276.
import type { BlockIteration, StepJump } from './blockIteration.js';
import type { PassState } from './state.js';
import { type ResolvedConfig, type VDTDocument, type ResolvedResourceBlock, type ContentWarning, type BoundingBox, type VDTPage, type VDTExclusionContour, type VDTBlock, type VDTColumn, createVDTBlock, pageIsVertical } from '../../../vdt.js';
import type { BlockStyle } from '../../styles.js';
import { type PlacementCursor, currentColumn, FIT_EPS, advanceToNextColumn, placeAtomicBlock } from '../../blocks/placement.js';
import type { Resource } from '../../../types.js';
import type { ContentBlock } from '../../../parse/index.js';
import { type BlockMeasureContext, type MeasureContentBlockOptions, type MeasuredContentBlock, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { InlineAside } from '../passTypes.js';
import { resolveResourceWrap, wrapGapPx, minTextWidthPx, columnCursorY } from '../../floats/textWrap.js';

/** What createResourceBlock takes from around the loop. */
export interface ResourceBlockDeps {
  state: PassState;
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  bodyStyle: BlockStyle;
  cursor: PlacementCursor;
  floatGapPx: number;
  offsetResourceBlockToAbsolute: (rb: ResolvedResourceBlock, ox: number, oy: number) => void;
  textWrapNotes: ContentWarning[];
  movedNotes: ContentWarning[];
  wrapExclusionWidth: (columnWidth: number, itemWidth: number, gap: number) => number;
  wrapContourOf: (resource: Resource, rb: ResolvedResourceBlock, box: BoundingBox, gapPx: number, page: VDTPage, origin: { x: number; y: number; }, source?: { sourceStart: number; sourceEnd: number; }) => VDTExclusionContour | undefined;
  onAtomicNewPage: (heightPx: number) => (page: VDTPage) => void;
  stampBlockExtras: (blk: VDTBlock, raw: ContentBlock) => void;
  addBalanceExtra: (col: VDTColumn, px: number) => void;
  enterBand: (contentIndex: number, part: number) => void;
  flushPendingNumberingAtBoundary: () => void;
  measureInlineAside: (raw: ContentBlock, blockIdx: number, c: VDTColumn, page: VDTPage, ctx: BlockMeasureContext, base: MeasureContentBlockOptions, spacing: number) => InlineAside | null;
  markInlineAside: (blk: VDTBlock, sideCol: VDTColumn, asideHeight: number) => void;
  placeInlineTableSlices: (raw: ContentBlock, blockIdx: number, blk: VDTBlock, ctx: BlockMeasureContext, styleOverride: BlockStyle | undefined, resource: Resource, wholeHeight: number, spacingBefore: number, asideWanted?: boolean) => "whole" | "dropped" | "placed";
}

export function createResourceBlock(deps: ResourceBlockDeps) {
  const {
    state, resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, bodyStyle,
    cursor, floatGapPx, offsetResourceBlockToAbsolute, textWrapNotes, movedNotes, wrapExclusionWidth,
    wrapContourOf, onAtomicNewPage, stampBlockExtras, addBalanceExtra, enterBand,
    flushPendingNumberingAtBoundary, measureInlineAside, markInlineAside, placeInlineTableSlices
  } = deps;
  /** Places a measured resource block; `continue` once it is placed. */
  const placeResourceBlock = (blockTurn: BlockIteration): StepJump => {
    const {
      rawBlock, id, col, blockMeasureCtx, styleOverride, measureWidth, blockPage, figureGrowPx,
      figureDelta, asideWanted, kind, measured, vdtType, style
    } = blockTurn;
    // --- Resource blocks (image / svg / table + caption) -----------------
    // Placed atomically (kept-together) — no mid-content split for v1.
    if (vdtType === 'resource') {
      let resourceBlock = blockTurn.measuredBlock!.resourceBlock!;
      let groupHeight = measured.totalHeight;
      const blk = createVDTBlock(id, 'resource', style.fontString, style.color, style.textAlign);
      blk.contentIndex = blockTurn.blockIdx;
      stampBlockExtras(blk, rawBlock);
      blk.resourceBlock = resourceBlock;
      blk.dirty = false;
      blk.snappedToGrid = false;
      blk.sourceStart = rawBlock.sourceStart + bodyOffset;
      blk.sourceEnd = rawBlock.sourceEnd + bodyOffset;
      // The single placeholder line carries the group height; caption lines are
      // carried on `resourceBlock` and offset to absolute coords below.
      blk.lines = [{
        text: '',
        bbox: { x: 0, y: 0, width: resourceBlock.bodyRect.width, height: groupHeight },
        baseline: 0,
        hyphenated: false,
        segments: [],
        isLastLine: true,
      }];
      // Text wrap (#627): a picture the text after it may run beside, at
      // its side of the column — unless the text left beside it would be
      // too narrow, or the picture too short to set lines beside.
      const wrapSettings = blockMeasureCtx.resolved.layout.wrap;
      const wrapSpec = kind.resource && !pageIsVertical(blockPage)
        ? resolveResourceWrap(kind.resource, kind.resourceType, wrapSettings)
        : undefined;
      // Vertical text keeps its figures' bands whole (horizontal wrap only).
      if (kind.resource && pageIsVertical(blockPage) && resolveResourceWrap(kind.resource, kind.resourceType, wrapSettings)) {
        textWrapNotes.push({
          kind: 'textWrap', reason: 'verticalText', resourceId: kind.resource.id,
          sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
        });
      }
      let wrapGap = 0;
      let wraps = false;
      if (wrapSpec) {
        wrapGap = wrapGapPx(wrapSpec.gap, dpi, bodyStyle.fontSizePx, floatGapPx);
        const textWidth = col.bbox.width * (1 - wrapSpec.width) - wrapGap;
        const linesBeside = Math.ceil((groupHeight + wrapGap - 0.01) / bodyStyle.lineHeightPx);
        const reason = textWidth + 0.01 < minTextWidthPx(wrapSettings.minTextWidth, col.bbox.width, dpi, bodyStyle.fontSizePx)
          ? 'tooNarrow' as const
          : linesBeside < wrapSettings.minLinesBeside ? 'fewLines' as const : undefined;
        if (reason) {
          textWrapNotes.push({
            kind: 'textWrap', reason, resourceId: kind.resource!.id,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
          });
        } else {
          wraps = true;
        }
      }
      // An inline resource keeps the float gap (a line) above it, as a
      // float would, unless the block before asked for more. A wrapped one
      // stands level with the next line's top instead.
      const spacingBefore = wraps ? state.pendingSpacing : Math.max(state.pendingSpacing, floatGapPx);
      // An inline table that does not fit the room left in its column is
      // cut between rows (#634), by the rules of a floated one.
      const sliced = !wraps && !resourceBlock.rotation && resourceBlock.table && kind.resource
        ? placeInlineTableSlices(rawBlock, blockTurn.blockIdx, blk, blockMeasureCtx, styleOverride, kind.resource, groupHeight, spacingBefore, asideWanted)
        : 'whole';
      if (sliced === 'dropped') {
        flushPendingNumberingAtBoundary();
        return 'continue';
      }
      const columnBefore = col;
      // The room the embed leaves when it moves on (#1151).
      const roomBefore = col.availableHeight;
      const pageBefore = cursor.pageIndex;
      if (sliced === 'whole') {
        enterBand(blockTurn.blockIdx, 0);
        // A side caption is decided where the block is placed (#729): an
        // embed that does not fit its column moves on by the rule of
        // `placeAtomicBlock`, and in each column it reaches its caption
        // goes to the side when the side column is free there, else under
        // the body.
        if (asideWanted) {
          let decidedFor: VDTColumn = col;
          let plain: MeasuredContentBlock | null | undefined = blockTurn.inlineAside ? undefined : blockTurn.measuredBlock;
          for (let guard = 0; ; guard++) {
            const c = currentColumn(doc, cursor);
            if (c !== decidedFor) {
              decidedFor = c;
              blockTurn.inlineAside = measureInlineAside(rawBlock, blockTurn.blockIdx, c, doc.pages[cursor.pageIndex]!, blockMeasureCtx, { styleOverride, ...figureDelta }, spacingBefore);
              if (!blockTurn.inlineAside && plain === undefined) {
                plain = measureContentBlock(rawBlock, blockTurn.blockIdx, measureWidth, blockMeasureCtx, { styleOverride, ...figureDelta });
              }
              const next = blockTurn.inlineAside?.block ?? plain;
              if (next?.resourceBlock) {
                resourceBlock = next.resourceBlock;
                groupHeight = next.measured.totalHeight;
              } else {
                blockTurn.inlineAside = null;
              }
            }
            const available = c.availableHeight - (c.blocks.length === 0 ? 0 : spacingBefore);
            if (groupHeight <= available + FIT_EPS) break;
            if (c.blocks.length === 0 && c.availableHeight >= 0.5 && groupHeight > state.contentArea.height + FIT_EPS) break;
            if (guard >= 8) break;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(groupHeight));
          }
          blk.resourceBlock = resourceBlock;
          blk.lines[0]!.bbox = { x: 0, y: 0, width: resourceBlock.bodyRect.width, height: groupHeight };
        }
        const decidedColumn = currentColumn(doc, cursor);
        placeAtomicBlock(
          blk, groupHeight, spacingBefore, cursor, doc, state.geomResolved,
          state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(groupHeight),
        );
        enterBand(blockTurn.blockIdx, 0);
        // Too tall for the room left in its column, a wrapped picture moved
        // on with its anchor: say so.
        if (wraps && currentColumn(doc, cursor) !== columnBefore && columnBefore.blocks.length > 0) {
          textWrapNotes.push({
            kind: 'textWrap', reason: 'moved', resourceId: kind.resource!.id,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
          });
        } else if (!wraps && currentColumn(doc, cursor) !== columnBefore && columnBefore.blocks.length > 0 && roomBefore >= 2 * baselineGrid - FIT_EPS) {
          // Too tall for the room left, an embed moved on and left the
          // foot of its column empty (#1151): say how much.
          movedNotes.push({
            kind: 'resourceMoved', resourceId: kind.resource!.id,
            emptyPx: Math.round(roomBefore), emptyMm: Math.round((roomBefore * 254) / state.geomResolved.page.dpi) / 10,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: pageBefore,
          });
        }
        // `placeBlockInColumn` (inside placeAtomicBlock) shifts `blk.lines`; the
        // resource's own caption/table lines live on `resourceBlock` and must be
        // offset to absolute page coordinates here using the placed bbox origin.
        offsetResourceBlockToAbsolute(resourceBlock, blk.bbox.x, blk.bbox.y);
        if (blockTurn.inlineAside && blockTurn.inlineAside.block.asideHeight !== undefined && currentColumn(doc, cursor) === decidedColumn) {
          markInlineAside(blk, blockTurn.inlineAside.sideCol, blockTurn.inlineAside.block.asideHeight);
        }
        const grown = figureGrowPx > 0 ? resourceBlock.bodyFlex?.delta ?? 0 : 0;
        if (grown > 0.01) {
          blk.balancing = { levers: ['flexFigure'], spaceAbove: 0, bodyGrowth: grown };
          addBalanceExtra(currentColumn(doc, cursor), grown);
        }
        doc.blocks.push(blk);
        // A wrapped picture (#627): the flow goes on under it and its gap, on
        // a grid line, unless the next block takes the band back to run
        // beside it (see `pendingWrap`).
        if (wraps && wrapSpec) {
          const rCol = currentColumn(doc, cursor);
          const top = blk.bbox.y;
          const bottomRel = Math.ceil((top - rCol.bbox.y + groupHeight + wrapGap - 0.01) / baselineGrid) * baselineGrid;
          rCol.availableHeight = Math.max(0, Math.min(rCol.availableHeight, rCol.bbox.height - bottomRel));
          state.pendingSpacing = 0;
          state.inlineGapOwed = null;
          const exWidth = wrapExclusionWidth(rCol.bbox.width, rCol.bbox.width * wrapSpec.width, wrapGap);
          // A contour wrap (#883): the picture's shape where it was set.
          const slotWidth = rCol.bbox.width * wrapSpec.width;
          const slot = { x: wrapSpec.side === 'left' ? rCol.bbox.x : rCol.bbox.x + rCol.bbox.width - slotWidth, y: top, width: slotWidth, height: groupHeight };
          const contour = wrapSpec.contour
            ? wrapContourOf(kind.resource!, resourceBlock, slot, wrapGap, doc.pages[cursor.pageIndex]!, { x: blk.bbox.x, y: blk.bbox.y }, { sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset })
            : undefined;
          state.pendingWrap = {
            col: rCol,
            blocks: rCol.blocks.length,
            cursorY: columnCursorY(rCol),
            ex: {
              x: wrapSpec.side === 'left' ? rCol.bbox.x : rCol.bbox.x + rCol.bbox.width - exWidth,
              y: top,
              width: exWidth,
              height: rCol.bbox.y + bottomRel - top,
              side: wrapSpec.side,
              gap: exWidth - rCol.bbox.width * wrapSpec.width,
              ownerId: blk.id,
              ...(contour ? { contour } : {}),
            },
          };
          flushPendingNumberingAtBoundary();
          return 'continue';
        }
      }
      // Snap the flow position after the resource to the baseline grid (the
      // group height is arbitrary), baking in at least marginBottom — same
      // convention as snapped headings — so the following text lands back on
      // the global grid instead of inheriting the resource's offset.
      // The white under it then makes up the float gap, as above it (EF-93):
      // what the snap left short of that gap, in whole grid lines, is carried
      // as pending spacing, so it collapses with the next block's own space
      // above — a heading's, a list's or a box's top margin, the next inline
      // resource's float gap — and vanishes at a column foot, where the
      // column is full either way. `layout.inlineResourceGap: 'above'` keeps
      // 1.4's rule, the snap alone.
      {
        const rCol = currentColumn(doc, cursor);
        const usedHeight = rCol.bbox.height - rCol.availableHeight;
        const naturalBottom = usedHeight + style.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        rCol.availableHeight = Math.max(0, rCol.bbox.height - snappedBottom);
        const owed = resolved.layout.inlineResourceGap === 'above'
          ? 0
          : floatGapPx - (snappedBottom - usedHeight);
        state.pendingSpacing = owed > 0.01 ? Math.ceil((owed - 0.01) / baselineGrid) * baselineGrid : 0;
        state.inlineGapOwed = state.pendingSpacing > 0 ? { afterIdx: blockTurn.blockIdx, pending: state.pendingSpacing, exact: owed } : null;
      }
      flushPendingNumberingAtBoundary();
      return 'continue';
    }
  };
  return { placeResourceBlock };
}
