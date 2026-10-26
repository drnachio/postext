// Fixed and side callout boxes, and the side boxes waiting for their band.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type PlannedCallout, type CalloutLayoutResult, offsetCalloutToAbsolute } from '../../callouts/calloutLayout.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import { dimensionToPx } from '../../../units.js';
import type { VDTPage, VDTColumn, BoundingBox, VDTBlock, VDTDocument } from '../../../vdt.js';
import { currentBand, bandColumns, advanceToNextColumn, sideUsedBottom, sideColumnOf, currentColumn, sideColumns, type PlacementCursor } from '../../blocks/placement.js';
import { anchorBox } from '../../../design/layout.js';
import { trueBottom, clearSideObstacles, type SideObstacle } from '../../floats/floatSlots.js';
import { CUT_START, type CalloutLayouter } from '../../callouts/frameLayout.js';
import { setAfterText } from '../warnings.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockStyle } from '../../styles.js';
import type { BandCapZone } from '../../columns/bandCaps.js';
import type { PassState } from './state.js';

/** What createCalloutSide takes from the pass. */
export interface CalloutSideDeps {
  captionUnderProposals: Set<string>;
  asideCutBy: WeakMap<VDTColumn, string>;
  shortSideColumn: (page: VDTPage, col: VDTColumn) => boolean;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  designFramesOn: (page: VDTPage | undefined) => { page: BoundingBox; bleed: BoundingBox; upright?: boolean; };
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  bodyStyle: BlockStyle;
  pendingSideBoxes: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig; pageIndex: number }[];
  awaitingSideBoxes: {
    box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig };
    pageIndex: number;
    band: number;
    column: VDTColumn;
    refY: number;
  }[];
  enqueueFloatsFor: (blockIdx: number) => void;
  floatGapPx: number;
  sideObstacles: WeakMap<VDTColumn, (SideObstacle & { owner: VDTBlock; })[]>;
  tryPlacePendingFloatsOnCurrentPage: (preferTop?: boolean, nextBlockIdx?: number, anyPosition?: boolean) => void;
  onNewPage: (page: VDTPage) => void;
  cursor: PlacementCursor;
  uncappedBottoms: Map<VDTColumn, number>;
  proposeTrailingCap: (boundaryIndex: number, zone?: BandCapZone, closeLevel?: boolean) => void;
  isFreeHeading: (b: VDTBlock) => boolean;
  stampCalloutSource: (frame: VDTBlock, startIdx: number, plan: PlannedCallout, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  makeCalloutLayouter: (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig) => CalloutLayouter;
  mirroredOf: (page: VDTPage) => boolean;
  nextIsBarrier: (from: number) => boolean;
  rectsOverlap: (a: BoundingBox, b: BoundingBox) => boolean;
  state: PassState;
}

export function createCalloutSide(deps: CalloutSideDeps) {
  const {
    captionUnderProposals, asideCutBy, shortSideColumn, dpi, baselineGrid, doc, pageWidthPx,
    pageHeightPx, designFramesOn, bodyOffset, contentBlocks, bodyStyle, pendingSideBoxes,
    awaitingSideBoxes, enqueueFloatsFor, floatGapPx, sideObstacles,
    tryPlacePendingFloatsOnCurrentPage, onNewPage, cursor, uncappedBottoms, proposeTrailingCap,
    isFreeHeading, stampCalloutSource, makeCalloutLayouter, mirroredOf, nextIsBarrier, rectsOverlap,
    state
  } = deps;
  /**
   * Place a `placement: 'fixed'` `:::callout` at page coordinates: the box
   * is anchored (nine-point grid + offset) to the page content area, the
   * trim box or the bleed box of the page where it occurs in the flow, out
   * of the column flow. Text columns whose x-range meets the box give up the
   * zone it covers — cut from the bottom (the zone's centre in the lower
   * half) or from the top (empty columns only) — like a float band. When the
   * zone already meets placed content, a float or a span column, the box
   * moves to the next page and is force-placed there. Frame and children go
   * to `page.floats` (rendered outside the column clip) and `doc.blocks`.
   * A box that closes the chapter first levels the band above it (trailing
   * cap), so the closing columns end at the same height above the box.
   */
  const placeCalloutFixed = (
    startIdx: number,
    plan: PlannedCallout,
    style: ResolvedCalloutStyleConfig,
    layoutAt: (width: number) => CalloutLayoutResult,
  ): void => {
    const anchor = style.fixed.anchor;
    const offset = {
      x: dimensionToPx(style.fixed.offset.x, dpi, bodyStyle.fontSizePx),
      y: dimensionToPx(style.fixed.offset.y, dpi, bodyStyle.fontSizePx),
    };
    const snapDown = (page: VDTPage, v: number): number =>
      page.contentArea.y + Math.floor((v - page.contentArea.y + 0.01) / baselineGrid) * baselineGrid;
    const snapUp = (page: VDTPage, v: number): number =>
      page.contentArea.y + Math.ceil((v - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;

    interface Cut { col: VDTColumn; kind: 'top' | 'bottom'; edge: number }
    interface FixedFit { rect: BoundingBox; result: CalloutLayoutResult; cuts: Cut[] }

    /** The box laid out for `page` and the zone it takes there. */
    const zoneOn = (page: VDTPage) => {
      const ref = anchor.to === 'page' ? designFramesOn(page).page
        : anchor.to === 'bleed' ? designFramesOn(page).bleed
        : page.contentArea;
      const band = cursor.pageIndex === page.index ? currentBand(page, cursor) : 0;
      const cols = bandColumns(page, band).filter((c) => c.bbox.height > 0.5);
      let result = layoutAt(page.contentArea.width);
      if (style.width !== 'auto') {
        // `fill`: as wide as the text column under the anchor point.
        const probe = anchorBox(anchor.edge, ref, result.width, result.totalHeight, offset);
        const mid = probe.x + probe.width / 2;
        const under = cols.find((c) => mid >= c.bbox.x - 0.5 && mid <= c.bbox.x + c.bbox.width + 0.5);
        if (under && Math.abs(under.bbox.width - result.width) > 0.01) result = layoutAt(under.bbox.width);
      }
      const rect = anchorBox(anchor.edge, ref, result.width, result.totalHeight, offset);
      const zoneTop = snapDown(page, rect.y - result.marginTopPx);
      const zoneBottom = snapUp(page, rect.y + rect.height + result.marginBottomPx);
      const meetsX = (col: VDTColumn): boolean =>
        rect.x < col.bbox.x + col.bbox.width - 0.5 && rect.x + rect.width > col.bbox.x + 0.5;
      return { cols, result, rect, zoneTop, zoneBottom, meetsX };
    };

    const attempt = (page: VDTPage, force: boolean): FixedFit | null => {
      const { cols, result, rect, zoneTop, zoneBottom, meetsX } = zoneOn(page);
      const cuts: Cut[] = [];
      for (const col of cols) {
        if (!meetsX(col)) continue;
        const colTop = col.bbox.y;
        const colBottom = trueBottom(col, uncappedBottoms);
        if (zoneTop >= colBottom - 0.5 || zoneBottom <= colTop + 0.5) continue;
        const centre = (zoneTop + zoneBottom) / 2;
        if (centre >= colTop + (colBottom - colTop) / 2) {
          const usedBottom = colTop + (col.bbox.height - col.availableHeight);
          const capBottom = uncappedBottoms.has(col) ? colTop + col.bbox.height : usedBottom;
          if (zoneTop < Math.max(usedBottom, capBottom) - 0.01) {
            if (!force) return null;
            continue;
          }
          cuts.push({ col, kind: 'bottom', edge: zoneTop });
        } else {
          if (col.blocks.length > 0) {
            if (!force) return null;
            continue;
          }
          cuts.push({ col, kind: 'top', edge: zoneBottom });
        }
      }
      if (!force) {
        for (const fb of page.floats ?? []) if (rectsOverlap(rect, fb.bbox)) return null;
        for (const c of page.columns) if (c.kind === 'span' && rectsOverlap(rect, c.bbox)) return null;
      }
      return { rect, result, cuts };
    };

    // A box that closes the chapter levels the columns above it first —
    // around the zone it takes on the current page.
    if (nextIsBarrier(plan.endIdx + 1)) {
      tryPlacePendingFloatsOnCurrentPage();
      const here = zoneOn(doc.pages[cursor.pageIndex]!);
      const columns = here.cols.flatMap((c, i) => (here.meetsX(c) ? [i] : []));
      proposeTrailingCap(startIdx, columns.length > 0 ? { top: here.zoneTop, columns } : undefined);
    }

    let page = doc.pages[cursor.pageIndex]!;
    let fit = attempt(page, false);
    if (!fit) {
      state.pendingSpacing = 0;
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
      } while (cursor.pageIndex === startPageIndex);
      page = doc.pages[cursor.pageIndex]!;
      fit = attempt(page, false) ?? attempt(page, true)!;
    }

    for (const cut of fit.cuts) {
      const col = cut.col;
      if (cut.kind === 'bottom') {
        const capped = uncappedBottoms.get(col);
        if (capped !== undefined) {
          uncappedBottoms.set(col, cut.edge);
        } else {
          const newHeight = Math.max(0, cut.edge - col.bbox.y);
          const reserved = col.bbox.height - newHeight;
          col.bbox.height = newHeight;
          col.availableHeight = Math.max(0, col.availableHeight - reserved);
        }
      } else {
        const shift = Math.max(0, cut.edge - col.bbox.y);
        col.bbox.y += shift;
        col.bbox.height = Math.max(0, col.bbox.height - shift);
        col.availableHeight = Math.max(0, col.availableHeight - shift);
      }
    }

    const { result, rect } = fit;
    const frame = result.frame;
    stampCalloutSource(frame, startIdx, plan);
    frame.pageIndex = page.index;
    frame.columnIndex = fit.cuts[0]?.col.index ?? (cursor.pageIndex === page.index ? cursor.columnIndex : 0);
    offsetCalloutToAbsolute(result, rect.x, rect.y);
    const floats = (page.floats ??= []);
    doc.blocks.push(frame);
    floats.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      doc.blocks.push(child);
      floats.push(child);
    }
    for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
  };

  /**
   * Set a `span: 'side'` box in the side column of the current band: laid
   * out at the side column's width and stacked under what the column holds,
   * no higher than the flow's current position (beside the text it
   * interrupts), consuming the column's free height like a side float. A
   * box the rest of the column cannot hold waits for the side column of the
   * next page the flow opens (`flushSideBoxesIntoPage`), where it is set
   * anyway — overflowing — when even an empty column cannot hold it. The
   * frame and its children leave the flow into `page.floats`, as a fixed
   * box does. Returns false when the page has no side column: the box then
   * lays out inline.
   */
  const trySideBox = (
    page: VDTPage,
    side: VDTColumn,
    box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig },
    refY: number | undefined,
    mode: 'fresh' | 'strict',
  ): boolean => {
    const { startIdx, plan, style } = box;
    const L = makeCalloutLayouter(startIdx, plan, style);
    const frameId = `block-${state.blockIdCounter++}`;
    const result = L.layoutRange(CUT_START, L.end, side.bbox.width, frameId, false, mirroredOf(page));
    const used = sideUsedBottom(side);
    const raw = Math.max(used, refY ?? used);
    const gridUpSide = (v: number): number => page.contentArea.y + Math.ceil((v - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
    const below = Math.max(result.marginBottomPx, floatGapPx);
    // Clear of the heading-design elements standing in the column (EF-78).
    const obstacles = sideObstacles.get(side);
    let y = clearSideObstacles(gridUpSide(raw), result.totalHeight, obstacles, below, gridUpSide);
    let need = y - used + result.totalHeight + below;
    // The gap under the box is owed only to what follows: a box whose foot
    // lands on the column's foot needs none.
    const fits = (): boolean => need <= side.availableHeight + 0.01 || y - used + result.totalHeight <= side.availableHeight + 0.01;
    if (!fits() && refY !== undefined && raw > used + 0.5) {
      // Beside its text the box runs off the column: it slides up — as far
      // as the stack above allows — to the lowest position that fits, its
      // foot on the column's foot (the bottom-aligned marginal box), unless
      // a heading design stands there.
      const foot = side.bbox.y + side.bbox.height;
      const fit = page.contentArea.y + Math.floor((foot - result.totalHeight - page.contentArea.y + 0.01) / baselineGrid) * baselineGrid;
      if (fit >= used - 0.01 && clearSideObstacles(fit, result.totalHeight, obstacles, below, gridUpSide) === fit) {
        y = fit;
        need = y - used + result.totalHeight + below;
      }
    }
    if (!fits()) {
      if (mode === 'strict' || used > side.bbox.y + 0.5 || (obstacles?.length ?? 0) > 0) return false;
      // A box that a full side column would hold waits for one rather than
      // overflowing an empty column a band above has shortened.
      if (shortSideColumn(page, side) && result.totalHeight <= page.contentArea.height + 0.01) return false;
      // Same as a side float: a box that overflows a caption-shortened
      // column asks for that caption to go under its figure.
      const cutBy = asideCutBy.get(side);
      if (cutBy !== undefined) captionUnderProposals.add(cutBy);
      // Taller than an empty side column: set anyway, and reported (#639).
      const overflowPx = y - used + result.totalHeight - side.availableHeight;
      if (overflowPx > 0.5) {
        (doc.warnings ??= []).push({
          kind: 'calloutOverflow',
          pageIndex: page.index,
          columnIndex: side.index,
          sourceStart: contentBlocks[startIdx]!.sourceStart + bodyOffset,
          sourceEnd: contentBlocks[plan.endIdx]!.sourceEnd + bodyOffset,
          overflowPx,
        });
      }
    }
    const frame = result.frame;
    stampCalloutSource(frame, startIdx, plan);
    if (state.drainingAfterText) {
      setAfterText.set(frame, {
        ...(frame.sourceStart !== undefined ? { sourceStart: frame.sourceStart } : {}),
        ...(frame.sourceEnd !== undefined ? { sourceEnd: frame.sourceEnd } : {}),
      });
    }
    frame.pageIndex = page.index;
    frame.columnIndex = side.index;
    offsetCalloutToAbsolute(result, side.bbox.x, y);
    const floats = (page.floats ??= []);
    doc.blocks.push(frame);
    floats.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      doc.blocks.push(child);
      floats.push(child);
    }
    side.availableHeight = Math.max(0, side.availableHeight - need);
    for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
    return true;
  };
  const placeCalloutSide = (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig): boolean => {
    const page = doc.pages[cursor.pageIndex]!;
    const side = sideColumnOf(page, currentBand(page, cursor));
    if (!side) return false;
    const curCol = currentColumn(doc, cursor);
    const refY = curCol.bbox.y + (curCol.bbox.height - curCol.availableHeight) + (curCol.blocks.length > 0 ? state.pendingSpacing : 0);
    // `sideAtColumnEnd: 'after'` (EF-161): the box waits for the text after
    // its fence, and stands beside it when the break rules send that text
    // on to the next page (a column with no room left, a paragraph the
    // widow and orphan rules move whole, a heading kept with its text). A
    // side box fenced while one waits waits too, so the side column keeps
    // their order. A box nothing follows in its chapter stays with the
    // text before it, like any box with `'before'` (postext 1.4's rule).
    // A box fenced again after a keep-with-next rewind is already waiting.
    if (awaitingSideBoxes.some((w) => w.box.startIdx === startIdx)) return true;
    if (awaitingSideBoxes.length > 0 || (style.sideAtColumnEnd === 'after' && !nextIsBarrier(plan.endIdx + 1))) {
      awaitingSideBoxes.push({ box: { startIdx, plan, style }, pageIndex: page.index, band: currentBand(page, cursor), column: curCol, refY });
      return true;
    }
    if (!trySideBox(page, side, { startIdx, plan, style }, refY, 'strict')) {
      pendingSideBoxes.push({ startIdx, plan, style, pageIndex: page.index });
    }
    return true;
  };
  /** The first block after content index `endIdx` that the flow holds in a
   *  column: the first part of the block that follows a side box's fence. */
  const firstFlowBlockAfter = (endIdx: number): VDTBlock | undefined => {
    let first: VDTBlock | undefined;
    for (const b of doc.blocks) {
      const ci = b.contentIndex;
      if (ci === undefined || ci <= endIdx || (first !== undefined && first.contentIndex! <= ci)) continue;
      const col = doc.pages[b.pageIndex]?.columns[b.columnIndex];
      if (!col || col.kind === 'side' || !col.blocks.includes(b)) continue;
      first = b;
    }
    return first;
  };
  /**
   * Set the side boxes waiting for the text after their fence
   * (`awaitingSideBoxes`), in order. Called once the flow holds a block
   * after the last of them that it will not take back — a heading kept
   * with its text can still move on with it — and with `force` where the
   * flow segment ends. A box with `sideAtColumnEnd: 'after'` whose text
   * went on in another column or on a later page stands level with that
   * text's first block, in the side column there; every other box stands
   * at its fence, as it would have been set there. One the side column
   * cannot hold takes the side column of a later page.
   */
  const settleAwaitingSideBoxes = (force: boolean): void => {
    if (awaitingSideBoxes.length === 0) return;
    const lastEnd = awaitingSideBoxes[awaitingSideBoxes.length - 1]!.box.plan.endIdx;
    if (!force) {
      const held = doc.blocks.some((b) => {
        if ((b.contentIndex ?? -1) <= lastEnd || isFreeHeading(b)) return false;
        const col = doc.pages[b.pageIndex]?.columns[b.columnIndex];
        return col !== undefined && col.kind !== 'side' && col.blocks.includes(b);
      });
      if (!held) return;
    }
    for (const w of awaitingSideBoxes.splice(0)) {
      let { pageIndex, band, refY } = w;
      if (w.box.style.sideAtColumnEnd === 'after') {
        const anchor = firstFlowBlockAfter(w.box.plan.endIdx);
        const anchorPage = anchor ? doc.pages[anchor.pageIndex] : undefined;
        const col = anchorPage?.columns[anchor!.columnIndex];
        if (anchorPage && col && col !== w.column && col.kind !== 'span' && sideColumnOf(anchorPage, col.band ?? 0)) {
          pageIndex = anchorPage.index;
          band = col.band ?? 0;
          refY = anchor!.bbox.y;
        }
      }
      const page = doc.pages[pageIndex]!;
      const side = sideColumnOf(page, band);
      if (side && trySideBox(page, side, w.box, refY, 'strict')) continue;
      // The pages the flow has opened since: their side columns, from the
      // top, as `flushSideBoxesIntoPage` would have set it there.
      let placed = false;
      for (let p = pageIndex + 1; p <= cursor.pageIndex && !placed; p++) {
        const later = doc.pages[p]!;
        const laterSide = sideColumnOf(later, 0);
        placed = laterSide !== undefined && trySideBox(later, laterSide, w.box, undefined, 'fresh');
      }
      if (!placed) pendingSideBoxes.push({ ...w.box, pageIndex: cursor.pageIndex });
    }
  };
  /** Set the waiting side boxes in the side column of a freshly opened
   *  page, in order; one that does not fit an empty column is set anyway. */
  const flushSideBoxesIntoPage = (page: VDTPage): void => {
    if (pendingSideBoxes.length === 0) return;
    const side = sideColumnOf(page, 0);
    if (!side) return;
    while (pendingSideBoxes.length > 0) {
      if (!trySideBox(page, side, pendingSideBoxes[0]!, undefined, 'fresh')) break;
      pendingSideBoxes.shift();
    }
  };
  /** Where the text ends (#639): before a waiting side box takes a page
   *  after it, the side columns of the pages the flow opened after its
   *  fence that still hold it whole, in order (the page of the fence had no
   *  room at or under it). A try that sets nothing gives its block id back,
   *  so the ids after it stay what they were. */
  const settlePendingSideBoxes = (): void => {
    while (pendingSideBoxes.length > 0) {
      const box = pendingSideBoxes[0]!;
      let placed = false;
      for (let p = box.pageIndex + 1; p <= cursor.pageIndex && !placed; p++) {
        const page = doc.pages[p]!;
        for (const side of sideColumns(page)) {
          const idBefore = state.blockIdCounter;
          if (trySideBox(page, side, box, undefined, 'strict')) { placed = true; break; }
          state.blockIdCounter = idBefore;
        }
      }
      if (!placed) return;
      pendingSideBoxes.shift();
    }
  };
  return {
    placeCalloutFixed, placeCalloutSide, settleAwaitingSideBoxes, flushSideBoxesIntoPage,
    settlePendingSideBoxes
  };
}
