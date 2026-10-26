// Callout boxes set in the column (placeCalloutInline).
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type PlannedCallout, pickCalloutStyle, resolveCalloutAttrs, type CalloutLayoutResult } from '../../calloutLayout.js';
import { CUT_START, type CalloutCut, type CalloutFragment, fragmentRange, type CalloutLayouter } from '../../frameLayout.js';
import { currentColumn, bandColumns, currentBand, advanceToNextColumn, placeAtomicBlock, type PlacementCursor } from '../../placement.js';
import { floatColumnCount } from '../../floatPlacement.js';
import { pageIsVertical, type ResolvedConfig, type VDTDocument, type VDTPage, type VDTColumn, type VDTBlock } from '../../../vdt.js';
import { resolveCalloutWrap, type ResolvedWrap } from '../../textWrap.js';
import { balanceKey } from '../../columnBalancing.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { ResolvedCalloutStyleConfig, CalloutSpan } from '../../../types.js';
import type { BandCapZone } from '../../bandCaps.js';
import type { PassState } from './state.js';

/** What createCalloutInline takes from the pass. */
export interface CalloutInlineDeps {
  balanceExtraPx: ReadonlyMap<number, number> | undefined;
  resolved: ResolvedConfig;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  calloutStyles: ResolvedCalloutStyleConfig[];
  multiColumnBand: (page: VDTPage) => boolean;
  enqueueFloatsFor: (blockIdx: number) => void;
  gateBoxCitations: (from: number, to: number) => void;
  releaseBoxCitations: (placedBefore: number) => void;
  enqueueCalloutFloat: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig, L: CalloutLayouter, placement: "auto" | "top" | "bottom", span: CalloutSpan, wrap?: ResolvedWrap) => void;
  acrossWidth: (page: VDTPage, col: VDTColumn, n: number) => number;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  onNewPage: (page: VDTPage) => void;
  calloutsOutOfFlow: Set<number>;
  cursor: PlacementCursor;
  pendingBeforeSelfSnapping: (idx: number) => number;
  uncappedBottoms: Map<VDTColumn, number>;
  addBalanceExtra: (col: VDTColumn, px: number) => void;
  atColumnHead: (col: VDTColumn) => boolean;
  rollbackHeadings: (col: VDTColumn) => VDTBlock[];
  enterBand: (contentIndex: number, part: number) => void;
  proposeTrailingCap: (boundaryIndex: number, zone?: BandCapZone, closeLevel?: boolean) => void;
  isFreeHeading: (b: VDTBlock) => boolean;
  calloutShortMoves: Map<number, number>;
  headingRunMayLeave: (col: VDTColumn, run: number, shortColumn?: boolean) => boolean;
  commitCallout: (result: CalloutLayoutResult, startIdx: number, plan: PlannedCallout, col: VDTColumn, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  makeCalloutLayouter: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig) => CalloutLayouter;
  mirroredOf: (page: VDTPage) => boolean;
  splitCalloutFragment: (L: CalloutLayouter, from: CalloutCut, width: number, roomPx: number, frameId: string, continuation: boolean, minLines: number, mirrored?: boolean) => CalloutFragment | null;
  tallerThanColumn: (result: CalloutLayoutResult) => boolean;
  markFragment: (result: CalloutLayoutResult, part: number, continued: boolean) => void;
  placeCalloutSpan: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig, L: CalloutLayouter, firstFrameId: string) => boolean;
  placeCalloutFixed: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig, layoutAt: (width: number) => CalloutLayoutResult) => void;
  placeCalloutSide: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig) => boolean;
  placeCalloutWrapped: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig, L: CalloutLayouter, frameId: string, wrap: ResolvedWrap) => boolean;
  state: PassState;
}

export function createCalloutInline(deps: CalloutInlineDeps) {
  const {
    balanceExtraPx, resolved, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
    contentBlocks, calloutStyles, multiColumnBand, enqueueFloatsFor, gateBoxCitations,
    releaseBoxCitations, enqueueCalloutFloat, acrossWidth, reservedOf, onNewPage, calloutsOutOfFlow,
    cursor, pendingBeforeSelfSnapping, uncappedBottoms, addBalanceExtra, atColumnHead,
    rollbackHeadings, enterBand, proposeTrailingCap, isFreeHeading, calloutShortMoves,
    headingRunMayLeave, commitCallout, makeCalloutLayouter, mirroredOf, splitCalloutFragment,
    tallerThanColumn, markFragment, placeCalloutSpan, placeCalloutFixed, placeCalloutSide,
    placeCalloutWrapped, state
  } = deps;
  const placeCalloutInline = (startIdx: number, plan: PlannedCallout): number | undefined => {
    const style = pickCalloutStyle(calloutStyles, plan.attrs.type)!;
    const firstFrameId = `block-${state.blockIdCounter++}`;
    const { span, placement } = resolveCalloutAttrs(style, plan.attrs);
    const L = makeCalloutLayouter(startIdx, plan, style);
    const layoutAt = (width: number) => L.layoutRange(CUT_START, L.end, width, firstFrameId, false, mirroredOf(doc.pages[cursor.pageIndex]!));

    // Fixed boxes leave the flow entirely.
    if (placement === 'fixed') {
      placeCalloutFixed(startIdx, plan, style, layoutAt);
      calloutsOutOfFlow.add(startIdx);
      return undefined;
    }
    // Floated boxes leave it too: they take the first free band after
    // this point (the foot of the current page, or the head / foot of a
    // page the flow opens later) and the text after them fills the page.
    // A side box always stacks beside the text it interrupts. A box taller
    // than a full column, which a cut can split, does not float (no band
    // holds it whole): it stays in the flow where it occurs, like a `here`
    // box, and splits there. One no cut can split still floats whole.
    const floating = (placement === 'auto' || placement === 'top' || placement === 'bottom') && span !== 'side';
    if (floating) {
      const page = doc.pages[cursor.pageIndex]!;
      const col = currentColumn(doc, cursor);
      const across = span === 'column' ? (plan.attrs.columns !== undefined ? floatColumnCount(plan.attrs.columns) : style.columns) : 1;
      const width = span === 'page' ? page.contentArea.width : acrossWidth(page, col, across);
      const inFlow = tallerThanColumn(L.layoutRange(CUT_START, L.end, width, 'float-probe', false))
        && splitCalloutFragment(L, CUT_START, width, state.contentArea.height, 'float-probe', false, style.splitMinLines) !== null;
      if (!inFlow) {
        const wrap = pageIsVertical(page) ? undefined : resolveCalloutWrap(plan.attrs, resolved.layout.wrap);
        enqueueCalloutFloat(startIdx, plan, style, L, placement, span, wrap);
        calloutsOutOfFlow.add(startIdx);
        return undefined;
      }
    }
    // A box text wraps round (#627): at its side of the column, the text
    // after it beside it.
    if (placement === 'here' && span === 'column' && !pageIsVertical(doc.pages[cursor.pageIndex]!)) {
      const wrap = resolveCalloutWrap(plan.attrs, resolved.layout.wrap);
      if (wrap && placeCalloutWrapped(startIdx, plan, style, L, firstFrameId, wrap)) {
        calloutsOutOfFlow.add(startIdx);
        return undefined;
      }
    }
    // Page-span boxes split a multi-column page into column bands (stage 1
    // of span blocks).
    {
      const page = doc.pages[cursor.pageIndex]!;
      if (
        span === 'page'
        && (placement === 'here' || floating)
        && multiColumnBand(page)
        && placeCalloutSpan(startIdx, plan, style, L, firstFrameId)
      ) {
        return undefined;
      }
      // Side boxes stack in the float-only side column beside the text
      // (whatever their placement: a side box never floats to a band).
      if (span === 'side' && placeCalloutSide(startIdx, plan, style)) {
        calloutsOutOfFlow.add(startIdx);
        return undefined;
      }
    }

    let from: CalloutCut = CUT_START;
    let part = 0;
    let frameId = firstFrameId;
    /** Times the box left an EMPTY short column (see below) — bounded. */
    let shortColumnMoves = calloutShortMoves.get(startIdx) ?? 0;
    for (;;) {
      // A box (or the rest of a split one) that opens a band applies the
      // band's cap before it measures its room, as a paragraph does: sized
      // against the uncut column, a continuation ran past the cut of a
      // band levelled for a page-span box after it (EF-126).
      enterBand(startIdx, part);
      let curCol = currentColumn(doc, cursor);
      const continuation = part > 0;
      const result = L.layoutRange(from, L.end, curCol.bbox.width, frameId, continuation, mirroredOf(doc.pages[cursor.pageIndex]!));
      // Column balancing: a box closing its column takes the column's gap
      // above it (the trailing-callout lever), so its foot lands on the
      // last grid slot — level with the column beside it. Any fragment
      // qualifies, as long as something sits above it to push down from:
      // text, or the float band at the head of an otherwise empty column.
      const balanceBefore = curCol.blocks.length > 0 || reservedOf(curCol).top > 0
        ? (balanceExtraPx?.get(balanceKey(startIdx, part)) ?? 0)
        : 0;
      const spacing = (atColumnHead(curCol) ? 0 : Math.max(pendingBeforeSelfSnapping(startIdx), result.marginTopPx)) + balanceBefore;
      const roomPx = curCol.availableHeight - spacing;
      let fragment: CalloutFragment | null = null;
      if (result.totalHeight > roomPx + 0.01) {
        // The (rest of the) box does not fit the column: a splittable box
        // leaves the head that fits here — a keep-together one too once
        // no full column could hold it whole…
        const splittable = !style.keepTogether || tallerThanColumn(result);
        if (splittable) fragment = splitCalloutFragment(L, from, curCol.bbox.width, roomPx, frameId, continuation, style.splitMinLines, mirroredOf(doc.pages[cursor.pageIndex]!));
        // …otherwise it moves whole to the next column — also out of an
        // EMPTY column that float bands or a band cap have cut short, when
        // a full column would hold it (bounded, so a run of short columns
        // cannot make it wander forever). Only a box taller than a full
        // column that no cut can split is placed anyway, overflowing (a
        // layout warning says so).
        const shortColumn = shortColumnMoves < 4
          && curCol.bbox.height < state.contentArea.height - baselineGrid
          && result.totalHeight <= state.contentArea.height + 0.01;
        if (!fragment && (curCol.blocks.length > 0 || shortColumn)) {
          if (curCol.blocks.length === 0) shortColumnMoves++;
          // A box that leaves the last column of its band for the next page
          // leaves that column short while the ones before it run full: the
          // band is cut level, as a closing band is, so its columns end
          // together and share the room the box left (keyed by the box —
          // in the capped pass it reaches the cut band and moves on again).
          if (part === 0 && curCol.blocks.length > 0) {
            const page = doc.pages[cursor.pageIndex]!;
            const cols = bandColumns(page, currentBand(page, cursor));
            if (cols[cols.length - 1] === curCol) proposeTrailingCap(startIdx);
          }
          // …otherwise it moves whole to the next column. Keep-with-next: a
          // run of headings at the column's tail travels with the box.
          // Skipped when the column holds nothing else (rolling back again
          // would loop) — the headings stay, orphaned — unless the column is
          // a short one a band cap did not cut (`headingRunMayLeave`); such a
          // move counts against the box's `shortColumnMoves`. Only the head
          // of a box can roll headings back: a continuation always lands in
          // a fresh column.
          let run = 0;
          for (let j = curCol.blocks.length - 1; j >= 0; j--) {
            if (isFreeHeading(curCol.blocks[j]!)) run++;
            else break;
          }
          state.pendingSpacing = 0;
          if (part === 0 && resolved.headings.keepWithNext && headingRunMayLeave(curCol, run, shortColumn && !uncappedBottoms.has(curCol))) {
            const rolledBack = rollbackHeadings(curCol);
            if (run === curCol.blocks.length + rolledBack.length) calloutShortMoves.set(startIdx, shortColumnMoves + 1);
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            return (rolledBack[0]!.contentIndex ?? startIdx - rolledBack.length) - 1;
          }
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          // Try the next column afresh: it may be short too (a float band
          // reserved on the page it opened), or of another width (oneAndHalf).
          continue;
        }
        // An empty column that is still too short: placed anyway, overflowing.
        if (!fragment && curCol.blocks.length === 0 && result.totalHeight > curCol.availableHeight - spacing + 0.01) {
          (doc.warnings ??= []).push({
            kind: 'calloutOverflow',
            pageIndex: cursor.pageIndex,
            columnIndex: cursor.columnIndex,
            sourceStart: contentBlocks[startIdx]!.sourceStart + bodyOffset,
            sourceEnd: contentBlocks[plan.endIdx]!.sourceEnd + bodyOffset,
            overflowPx: result.totalHeight + spacing - curCol.availableHeight,
          });
        }
      }

      // Floats first-referenced inside the box still enqueue in reading order
      // (only once the box is committed, so a keep-with-next replay does not
      // enqueue them twice); those a later part of a split box cites wait
      // for that part.
      if (part === 0) {
        for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
        gateBoxCitations(startIdx + 1, plan.endIdx);
      }
      const placed = fragment ? fragment.result : result;
      const to = fragment ? fragment.to : L.end;
      if (part > 0 || fragment) markFragment(placed, part, fragment !== null);
      const spacingBefore = (atColumnHead(curCol) ? 0 : Math.max(pendingBeforeSelfSnapping(startIdx), placed.marginTopPx)) + balanceBefore;
      if (balanceBefore > 0) {
        addBalanceExtra(curCol, balanceBefore);
        placed.frame.balancing = { levers: ['trailingCallout'], spaceAbove: balanceBefore };
      }
      // Spacing collapses at a column top, so the lever's push under a
      // float band is consumed here: the box then opens that far down.
      if (balanceBefore > 0 && curCol.blocks.length === 0) {
        curCol.availableHeight = Math.max(0, curCol.availableHeight - balanceBefore);
      }
      enterBand(startIdx, part);
      placeAtomicBlock(
        placed.frame, placed.totalHeight, spacingBefore, cursor, doc, state.geomResolved,
        state.contentArea, pageWidthPx, pageHeightPx,
      );
      enterBand(startIdx, part);
      curCol = currentColumn(doc, cursor);
      commitCallout(placed, startIdx, plan, curCol, part > 0 || fragment ? fragmentRange(L, from, to) : undefined);
      releaseBoxCitations(fragment ? L.childBase + to.child : plan.endIdx + 1);
      // Snap the flow after the box to the baseline grid, baking in at least
      // `marginBottom` (grid wins, margin is a minimum — the resource rule).
      // An off-grid style (`snapToGrid: false`) keeps its exact margin
      // instead, as pending spacing that collapses with the next block's
      // top margin: the flow stays off the grid until the next snap point
      // (a snapped heading, a list tail), like after an unsnapped heading.
      if (style.snapToGrid) {
        const usedHeight = curCol.bbox.height - curCol.availableHeight;
        const naturalBottom = usedHeight + placed.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        curCol.availableHeight = Math.max(0, curCol.bbox.height - snappedBottom);
      }
      state.pendingSpacing = style.snapToGrid ? 0 : placed.marginBottomPx;
      if (!fragment) return undefined;
      // The rest continues at the top of the next column.
      from = to;
      part++;
      frameId = `block-${state.blockIdCounter++}`;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
    }
  };
  return {
    placeCalloutInline
  };
}
