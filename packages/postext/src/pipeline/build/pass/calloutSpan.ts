// Callout boxes that span the page (placeCalloutSpan).
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type PlannedCallout, type CalloutLayoutResult, pickCalloutStyle } from '../../callouts/calloutLayout.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import { type CalloutLayouter, type CalloutCut, CUT_START, type CalloutFragment, fragmentRange } from '../../callouts/frameLayout.js';
import { type VDTPage, type VDTColumn, pageIsVertical, type BoundingBox, type ResolvedConfig, type VDTDocument, type ResolvedResourceBlock, type VDTBlock } from '../../../vdt.js';
import { isMarkerBlock } from '../../blocks/buildHelpers.js';
import { isBandLevel, bandColumns, currentBand, closeBandAndInsertSpan, pageHasContent, advanceToNextColumn, pageIsOccupied, type PlacementCursor } from '../../blocks/placement.js';
import { columnBottom, uncapBand, bandCapLines, bandTop, type BandCap, type BandCapZone } from '../../columns/bandCaps.js';
import type { HeadingLevelResolver } from '../../sections/headingStyles.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockStyle } from '../../styles.js';
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import type { CompositionRule } from '../../../types/text/bodyText.js';
import type { FloatRotation, CaptionAside, BodyCap } from './types.js';
import type { TableSliceSpec } from '../../resources/resourceLayout.js';
import type { FloatMeasure } from '../../floats/floatSlots.js';
import type { PassState } from './state.js';

/** What createCalloutSpan takes from the pass. */
export interface CalloutSpanDeps {
  bandCaps: ReadonlyMap<number, BandCap> | undefined;
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  baselineGrid: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  bodyStyle: BlockStyle;
  calloutStyles: ResolvedCalloutStyleConfig[];
  calloutPlan: Map<number, PlannedCallout>;
  pendingFloats: PlannedFloat[];
  openerPages: Set<VDTPage>;
  openerFloatRule: CompositionRule;
  noteOpenerFloat: (page: VDTPage, f: PlannedFloat) => void;
  enqueueFloatsFor: (blockIdx: number) => void;
  gateBoxCitations: (from: number, to: number) => void;
  releaseBoxCitations: (placedBefore: number) => void;
  floatGapPx: number;
  offsetResourceBlockToAbsolute: (rb: ResolvedResourceBlock, ox: number, oy: number) => void;
  uprightOn: (page: VDTPage) => FloatRotation;
  sliceOf: (f: PlannedFloat) => TableSliceSpec | undefined;
  measureFloat: (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap) => FloatMeasure | null;
  buildFloatBlock: (resourceId: string, x: number, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, flushEnd?: boolean | number, aside?: CaptionAside, mirrored?: boolean, cap?: BodyCap) => { block: VDTBlock; height: number; } | null;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  capOrigin: (cols: readonly VDTColumn[]) => { at: string; headPx?: number; };
  topFloatRefOf: Map<VDTColumn, number>;
  heldBack: (i: number) => boolean;
  tryPlacePendingFloatsOnCurrentPage: (preferTop?: boolean, nextBlockIdx?: number, anyPosition?: boolean) => void;
  onNewPage: (page: VDTPage) => void;
  drainPendingFloats: () => void;
  cursor: PlacementCursor;
  forcedBreakPages: Set<number>;
  markForcedBreak: () => void;
  uncappedBottoms: Map<VDTColumn, number>;
  bandCapProposals: Map<number, BandCap>;
  spanPlacedInBand: Set<number>;
  proposeTrailingCap: (boundaryIndex: number, zone?: BandCapZone, closeLevel?: boolean) => void;
  commitCallout: (result: CalloutLayoutResult, startIdx: number, plan: PlannedCallout, col: VDTColumn, range?: { firstChildIdx: number; lastChildIdx: number; }) => void;
  mirroredOf: (page: VDTPage) => boolean;
  capClipsLines: (cols: readonly VDTColumn[]) => boolean;
  bandUsedBottomWithSide: (page: VDTPage, cols: readonly VDTColumn[]) => number;
  splitCalloutFragment: (L: CalloutLayouter, from: CalloutCut, width: number, roomPx: number, frameId: string, continuation: boolean, minLines: number, mirrored?: boolean) => CalloutFragment | null;
  tallerThanColumn: (result: CalloutLayoutResult) => boolean;
  markFragment: (result: CalloutLayoutResult, part: number, continued: boolean) => void;
  state: PassState;
}

export function createCalloutSpan(deps: CalloutSpanDeps) {
  const {
    bandCaps, resolved, headingLevels, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
    contentBlocks, bodyStyle, calloutStyles, calloutPlan, pendingFloats, openerPages,
    openerFloatRule, noteOpenerFloat, enqueueFloatsFor, gateBoxCitations, releaseBoxCitations,
    floatGapPx, offsetResourceBlockToAbsolute, uprightOn, sliceOf, measureFloat, buildFloatBlock,
    reservedOf, capOrigin, topFloatRefOf, heldBack, tryPlacePendingFloatsOnCurrentPage, onNewPage,
    drainPendingFloats, cursor, forcedBreakPages, markForcedBreak, uncappedBottoms, bandCapProposals,
    spanPlacedInBand, proposeTrailingCap, commitCallout, mirroredOf, capClipsLines,
    bandUsedBottomWithSide, splitCalloutFragment, tallerThanColumn, markFragment, state
  } = deps;
  /**
   * Place a `span: 'page'` `:::callout` in a multi-column layout as a span
   * block (stage 1): the box is laid out at the page's content width and
   * gets its own full-width `kind: 'span'` column; the text columns of the
   * current band are closed at the cut line and a fresh band of text columns
   * opens below the box, so the flow continues under it in every column.
   *
   * The band must be LEVEL — every column has consumed the same height:
   * the page top, right after a `span: 'page'` opener heading, right after
   * another span block, or right after a top float band — and leave room
   * for the box plus at least the widow minimum of body lines below it.
   * Otherwise the box moves to the top of the next page (a fresh page is
   * trivially level) WITHOUT marking a forced break, so the page it left
   * stays balanceable. Keep-with-next does not apply here: a heading right
   * before a page-span box stays in its text column.
   *
   * Stage 2 — mid-page bands (`bandCaps.ts`): a box arriving in an UNEVEN
   * band with room below proposes a band cap — the band's columns cut
   * level at `ceil(Σ used / N / grid)` lines — and falls back to the next
   * page for this pass; the driver re-runs the pass with the cap, the
   * capped columns fill and overflow naturally (every placement rule still
   * applies), and when the box arrives in the band its cap was applied to
   * it cuts there: the columns above end level (the last one may keep up
   * to a few lines of slack, which balancing absorbs), the box spans the
   * page and the flow resumes in the band below. When the capped band
   * overflowed instead (the box arrives elsewhere), the driver grows or
   * drops the cap.
   *
   * Leaving level (`headings.balancing.beforeSpan`): a box that does not
   * fit even after a level cut proposes a TRAILING cap instead — the band
   * it leaves is cut level, the way a chapter's closing band is, and the
   * page is marked as a forced break in that pass so balancing does not
   * stretch its last column back to the page bottom. The cap is resolved
   * after balancing (`resolveTrailingCaps`); when the box reaches the
   * capped band it counts as delivered whether it fits there or moves on,
   * and the cut columns stay cut (the polish round fills a column ending a
   * line under the cap).
   *
   * Splitting (`keepTogether: false`, or a keep-together box taller than
   * the page's content area): a box that does not fit a level (or
   * capped, or nearly level — within one grid line) band breaks between
   * its children: the longest fragment that fits closes the page flush
   * with the band bottom, the rest opens the next page in a box without
   * the title or icon, and splits again if it is still too tall. Such a box that
   * fits whole only flush with the page bottom (no text below) is placed
   * whole. When the band is uneven, the cap that levels it (span cap when
   * the whole box fits after the cut, trailing cap otherwise) comes first;
   * the fragment is cut in the capped pass.
   *
   * Geometry stays on the baseline grid: the cut line is the band's used
   * bottom snapped UP to the next grid line (anchored at the content-area
   * top, like every column start), and the span column's height is the
   * box plus its collapsed top spacing and `marginBottom`, rounded up to a
   * grid multiple — so the new band's columns start on the grid. Floats
   * stay in the outer page bands: the band inherits the float-reduced top
   * / bottom of the page's columns, so a span column never overlaps a float.
   */
  const placeCalloutSpan = (
    startIdx: number,
    plan: PlannedCallout,
    style: ResolvedCalloutStyleConfig,
    L: CalloutLayouter,
    firstFrameId: string,
  ): boolean => {
    const balancingCfg = resolved.headings.balancing;
    const levelBefore = balancingCfg.enabled && balancingCfg.beforeSpan;
    const minLines = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
    const minRoomPx = minLines * bodyStyle.lineHeightPx;
    const gridUp = (page: VDTPage, v: number): number =>
      page.contentArea.y + Math.ceil((v - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
    const needFor = (spacing: number, height: number, margin: number): number =>
      Math.ceil((spacing + height + margin - 0.01) / baselineGrid) * baselineGrid;
    const nearlyLevel = (cols: readonly VDTColumn[]): boolean => {
      const bottoms = cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight));
      return Math.max(...bottoms) - Math.min(...bottoms) <= baselineGrid + 0.5;
    };
    /** Level for the box: the text columns end level, and a column holding
     *  only a float band (a figure at its head, no text yet) counts as level
     *  when a band cap could not level it either — the figure was first
     *  referenced by the very block before the box, so a cut that spills
     *  that block into the figure's column leaves the figure no slot after
     *  its reference (it would fall off the page, and the box with it). The
     *  box then cuts under the text and the figure alike; a figure
     *  referenced earlier keeps the cap route, which flows text under it. */
    const lastBlockBefore = (): number => {
      let j = startIdx - 1;
      while (j >= 0 && isMarkerBlock(contentBlocks[j])) j--;
      return j;
    };
    const levelForBox = (cols: readonly VDTColumn[]): boolean => {
      if (isBandLevel(cols)) return true;
      const textCols = cols.filter((c) => c.blocks.length > 0);
      const floatOnly = cols.filter((c) => c.blocks.length === 0 && reservedOf(c).top > 0);
      if (textCols.length === 0 || textCols.length + floatOnly.length !== cols.length) return false;
      if (!isBandLevel(textCols)) return false;
      const before = lastBlockBefore();
      // However tall the figure is: the text before the box is all placed,
      // so no cut could level the columns any better — the box goes under
      // both, the slack under the text being the compositor's trade.
      return floatOnly.every((c) => topFloatRefOf.get(c) === before);
    };

    /**
     * A page-span figure referenced before the box takes the cut first: the
     * band is closed level under the text, the figure spans the page right
     * there (where the text ended, as the compositor reads it), and the box
     * goes on below — or to the next page when it no longer fits. Only when
     * the band can be cut for the box (level, or capped for it) and the
     * figure fits between the cut and the band bottom; otherwise the figure
     * stays pending for the ordinary slots. Returns whether any was set.
     * A floated box (`placement` on a `:::callout`) is no figure: it keeps
     * to the head or foot of a page, the bands it was floated to.
     */
    const placeSpanFloatsAtCut = (page: VDTPage, capActiveHere: boolean): boolean => {
      // Not on an opener page that takes no float (#749).
      if (openerFloatRule === 'avoid' && openerPages.has(page)) return false;
      let placedAny = false;
      for (let i = 0; i < pendingFloats.length;) {
        const f = pendingFloats[i]!;
        const cols = bandColumns(page, currentBand(page, cursor));
        if (f.span !== 'page' || f.callout || cols.length < 2 || heldBack(i) || !((capActiveHere && !placedAny) || levelForBox(cols))) { i++; continue; }
        const width = page.contentArea.width;
        const slice = sliceOf(f);
        // On a vertical page the figure stands upright.
        const upright = pageIsVertical(page) ? uprightOn(page) : undefined;
        const measure = measureFloat(f.resourceId, width, slice, upright);
        if (!measure) { i++; continue; }
        const cutY = gridUp(page, bandUsedBottomWithSide(page, cols));
        const spacing = cols.some((c) => c.blocks.length > 0) ? floatGapPx : 0;
        const need = needFor(spacing, measure.height, floatGapPx);
        const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
        if (cutY + need > bandBottom + 0.01) { i++; continue; }
        const built = buildFloatBlock(f.resourceId, page.contentArea.x, width, slice, upright);
        if (!built) { i++; continue; }
        if (capActiveHere && !placedAny) {
          // A band whose content ran past the cut did not deliver its cap
          // (EF-116): the driver takes the cut lower instead.
          const overran = capClipsLines(cols);
          uncapBand(cols, uncappedBottoms);
          if (!overran) spanPlacedInBand.add(startIdx);
        }
        closeBandAndInsertSpan(page, cols, cutY, built.block, need, cursor, spacing, built.height);
        // The float was built at (x, 0): move its inner geometry down to
        // where the span column put it.
        if (built.block.resourceBlock) offsetResourceBlockToAbsolute(built.block.resourceBlock, 0, built.block.bbox.y);
        built.block.contentIndex = f.firstBlockIdx;
        doc.blocks.push(built.block);
        noteOpenerFloat(page, f);
        state.floatsPlaced++;
        placedAny = true;
        pendingFloats.splice(i, 1);
      }
      return placedAny;
    };

    /** Cut the fragment to place starts at, and its 0-based index among
     *  the fragments (0 = the box, or its head). */
    let from: CalloutCut = CUT_START;
    let part = 0;
    let frameId = firstFrameId;
    /** The box already moved to a fresh page (or sits on an empty one):
     *  whatever does not fit there is force-placed and overflows. */
    let forceHere = false;
    /** Times the box left a fresh page whose room the floats flushed onto
     *  it had taken — bounded. */
    let floatPageMoves = 0;

    for (;;) {
      let page = doc.pages[cursor.pageIndex]!;
      const continuation = part > 0;
      const layoutAt = (width: number): CalloutLayoutResult =>
        L.layoutRange(from, L.end, width, frameId, continuation, mirroredOf(page));
      const result = layoutAt(page.contentArea.width);
      // A keep-together box (or the rest of it) taller than a whole page
      // splits like a `keepTogether: false` one instead of overflowing.
      const splittable = !style.keepTogether || tallerThanColumn(result);

      interface SpanFit {
        cols: VDTColumn[];
        cutY: number;
        spacing: number;
        /** Height (grid multiple) the whole box takes with `marginBottom`
         *  below it, and whether that plus the widow minimum of text fits. */
        need: number;
        room: boolean;
        /** Height the whole box takes flush with the band bottom (no margin,
         *  nothing below), and whether that fits. */
        needFlush: number;
        roomFlush: boolean;
        /** Free height between the cut line and the band's true bottom. */
        roomPx: number;
      }
      /** Where the box would cut the current band, and whether it fits (room
       *  is measured against the columns' TRUE bottoms — a capped band keeps
       *  its slack below the cap). Null when the band is not level (or the
       *  cursor sits on a span column with no band below it) and
       *  `requireLevel` is set. */
      const measureBand = (requireLevel: boolean): SpanFit | null => {
        const cols = bandColumns(page, currentBand(page, cursor));
        if (cols.length === 0 || (requireLevel && !levelForBox(cols))) return null;
        const cutY = gridUp(page, bandUsedBottomWithSide(page, cols));
        const bandHasContent = cols.some((c) => c.blocks.length > 0);
        const spacing = bandHasContent ? Math.max(state.pendingSpacing, result.marginTopPx) : 0;
        const need = needFor(spacing, result.totalHeight, result.marginBottomPx);
        const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
        const room = cutY + need + minRoomPx <= bandBottom + 0.01;
        const needFlush = needFor(spacing, result.totalHeight, 0);
        const roomFlush = cutY + needFlush <= bandBottom + 0.01;
        return { cols, cutY, spacing, need, room, needFlush, roomFlush, roomPx: bandBottom - cutY };
      };

      // Is this band capped for this very box? Then it cuts at the band's
      // used bottom (at most the cap) even when the last column is short.
      const cap = part === 0 ? bandCaps?.get(startIdx) : undefined;
      let capActive = cap !== undefined
        && state.activeCap !== null
        && state.activeCap.spanIndex === startIdx
        && state.activeCap.pageIndex === page.index
        && state.activeCap.band === currentBand(page, cursor);

      // A page-span figure referenced before the box cuts the band first
      // and the box measures the fresh band under it. A barrier box then
      // takes every other pending float — the current page's free slots,
      // else pages opened ahead — before it lands.
      if (part === 0) {
        if (placeSpanFloatsAtCut(page, capActive)) capActive = false;
        if (style.floatBarrier && pendingFloats.length > 0) {
          const pageBefore = cursor.pageIndex;
          const bandBefore = currentBand(page, cursor);
          // An uneven, uncapped band the figures are about to leave behind
          // gets the cap that levels it: a span cap when a page-span figure
          // would fit under the level cut — the capped pass sets it there
          // and the box follows — else a trailing cap, the figure and the
          // box moving on and the band ending level like a closing one.
          // Only a page-span figure is planned for here; column figures keep
          // the ordinary slots (their level is the band cap's own business).
          const first = pendingFloats.find((f, i) => f.span === 'page' && !heldBack(i));
          if (first && !capActive && cap === undefined && state.bandStart && state.registeredBand
            && state.registeredBand.pageIndex === page.index && state.registeredBand.band === bandBefore) {
            const cols = bandColumns(page, bandBefore).filter((c) => c.bbox.height > 0.5);
            if (cols.length > 1 && !isBandLevel(cols) && cols.some((c) => c.blocks.length > 0)) {
              const lines = bandCapLines(cols, baselineGrid);
              const capBottom = bandTop(cols) + lines * baselineGrid;
              const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
              // A floated box is never set at the cut (see
              // `placeSpanFloatsAtCut`): it only gets the trailing cap.
              const m = first.callout ? null : measureFloat(first.resourceId, page.contentArea.width, sliceOf(first));
              const figureFits = m !== null && capBottom + needFor(floatGapPx, m.height, floatGapPx) <= bandBottom + 0.01;
              if (figureFits) {
                bandCapProposals.set(startIdx, {
                  kind: 'span',
                  startContentIndex: state.bandStart.contentIndex,
                  startPart: state.bandStart.part,
                  ...(state.bandStart.visit > 0 ? { startVisit: state.bandStart.visit } : {}),
                  lines,
                  retries: 0,
                  ...capOrigin(cols),
                });
              } else {
                proposeTrailingCap(startIdx);
              }
            }
          }
          tryPlacePendingFloatsOnCurrentPage();
          drainPendingFloats();
          if (cursor.pageIndex !== pageBefore || currentBand(doc.pages[cursor.pageIndex]!, cursor) !== bandBefore) {
            // A figure took a page ahead and the box follows it there. A
            // band cut level for it (trailing cap) counts as delivered —
            // the columns stay cut — and balancing never stretches the
            // page's last column back to the bottom. A span cap that could
            // not seat the figure is left undelivered for the driver to
            // grow or drop.
            if (capActive && cap?.kind === 'trailing') spanPlacedInBand.add(startIdx);
            if (doc.pages[pageBefore]!.columns.some((c) => c.blocks.length > 0)) forcedBreakPages.add(pageBefore);
          }
          capActive = false;
        }
        page = doc.pages[cursor.pageIndex]!;
      }

      const fit = forceHere ? (measureBand(true) ?? measureBand(false)) : measureBand(!capActive);

      // What lands in this band: the whole (remaining) box, or its head.
      type Action =
        | { kind: 'whole'; fit: SpanFit; need: number; result: CalloutLayoutResult }
        | { kind: 'split'; fit: SpanFit; need: number; fragment: CalloutFragment };
      let action: Action | null = null;
      if (fit) {
        if (fit.room) action = { kind: 'whole', fit, need: fit.need, result };
        else if (splittable && fit.roomFlush) action = { kind: 'whole', fit, need: fit.needFlush, result };
      }
      if (!action && splittable) {
        // A band uneven by no more than a grid line still takes a fragment
        // cut at its used bottom: balancing fills the line the short column
        // is left under the cut.
        let band = fit;
        if (!band) {
          const cols = bandColumns(page, currentBand(page, cursor));
          if (cols.length > 0 && nearlyLevel(cols)) band = measureBand(false);
        }
        if (band) {
          const fragment = splitCalloutFragment(
            L, from, page.contentArea.width, band.roomPx - band.spacing, frameId, continuation, style.splitMinLines,
          );
          if (fragment) {
            action = { kind: 'split', fit: band, need: needFor(band.spacing, fragment.result.totalHeight, 0), fragment };
          }
        }
      }
      // A fresh page whose room went to the floats flushed onto it (a
      // figure page, a page-span figure standing upright across a vertical
      // page) holds no text to cut: a box a page would hold moves on to the
      // next page rather than overflow this one.
      if (
        !action && forceHere && fit && floatPageMoves < 2
        && fit.spacing + result.totalHeight > fit.roomPx + 0.5
        && result.totalHeight <= state.contentArea.height + 0.01
        && !pageHasContent(page) && (page.floats?.length ?? 0) > 0
      ) {
        floatPageMoves++;
        state.pendingSpacing = 0;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        continue;
      }
      if (!action && forceHere && fit) {
        action = { kind: 'whole', fit, need: fit.need, result };
        // A box that fills its band to the last grid line is not an overflow.
        const overflowPx = Math.max(0, fit.spacing + result.totalHeight - fit.roomPx);
        if (overflowPx > 0.5) {
          (doc.warnings ??= []).push({
            kind: 'calloutOverflow',
            pageIndex: cursor.pageIndex,
            columnIndex: cursor.columnIndex,
            sourceStart: contentBlocks[startIdx]!.sourceStart + bodyOffset,
            sourceEnd: contentBlocks[plan.endIdx]!.sourceEnd + bodyOffset,
            overflowPx,
          });
        }
      }

      if (action) {
        if (capActive) {
          // The box cuts where the band's content ends. When that content
          // ran past the cap's cut (a paragraph tail that could not split
          // over it, force-placed into an empty capped column), the cap is
          // not delivered: the driver takes the cut a line lower rather than
          // keep a cut as low as that one column (EF-116).
          const overran = capClipsLines(action.fit.cols);
          uncapBand(action.fit.cols, uncappedBottoms);
          if (!overran) spanPlacedInBand.add(startIdx);
        }
        const placed = action.kind === 'whole' ? action.result : action.fragment.result;
        const to = action.kind === 'whole' ? L.end : action.fragment.to;
        if (part > 0 || action.kind === 'split') markFragment(placed, part, action.kind === 'split');
        const spanCol = closeBandAndInsertSpan(
          page, action.fit.cols, action.fit.cutY, placed.frame, action.need, cursor, action.fit.spacing, placed.totalHeight,
        );
        commitCallout(placed, startIdx, plan, spanCol, part > 0 || action.kind === 'split' ? fragmentRange(L, from, to) : undefined);
        // Floats first-referenced inside the box enqueue once its head is
        // committed, in reading order (same as the inline path); those its
        // later parts cite wait for them.
        if (part === 0) {
          for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
          gateBoxCitations(startIdx + 1, plan.endIdx);
        }
        releaseBoxCitations(action.kind === 'whole' ? plan.endIdx + 1 : L.childBase + to.child);
        // The new band starts on the grid right below the span column; nothing
        // to snap — `need` already bakes in `marginBottom`.
        state.pendingSpacing = 0;
        if (action.kind === 'whole') return true;
        // The rest opens the next page.
        from = to;
        part++;
        frameId = `block-${state.blockIdCounter++}`;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        forceHere = true;
        continue;
      }

      // Nothing of the box lands in this band.
      if (part === 0) {
        let proposedSpan = false;
        if (!fit && cap === undefined && state.bandStart && state.registeredBand
          && state.registeredBand.pageIndex === page.index
          && state.registeredBand.band === currentBand(page, cursor)) {
          // Uneven band, no cap yet: propose one when a level cut would leave
          // room for the box plus the widow minimum of body lines below it
          // (or, for a splittable box, for the whole box flush with the
          // band bottom).
          const cols = bandColumns(page, currentBand(page, cursor));
          // A column holding only a figure at its head must keep that slot
          // in the capped pass: the cut can go no higher than the band the
          // figure takes, or the figure falls off the page and the box after it.
          const top = bandTop(cols);
          const floatHeads = cols
            .filter((c) => c.blocks.length === 0 && reservedOf(c).top > 0)
            .map((c) => Math.ceil((c.bbox.y - top - 0.01) / baselineGrid));
          const lines = Math.max(bandCapLines(cols, baselineGrid), ...floatHeads);
          const capBottom = top + lines * baselineGrid;
          const spacing = Math.max(state.pendingSpacing, result.marginTopPx);
          const need = needFor(spacing, result.totalHeight, result.marginBottomPx);
          const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
          // A splittable box is worth the cut when its head fits flush with
          // the band bottom, the rest going on to the next page.
          const fitsAfterCut = capBottom + need + minRoomPx <= bandBottom + 0.01
            || (splittable && capBottom + needFor(spacing, result.totalHeight, 0) <= bandBottom + 0.01)
            || (splittable && splitCalloutFragment(
              L, from, page.contentArea.width, bandBottom - capBottom - spacing, frameId, continuation, style.splitMinLines,
            ) !== null);
          if (fitsAfterCut) {
            bandCapProposals.set(startIdx, {
              kind: 'span',
              startContentIndex: state.bandStart.contentIndex,
              startPart: state.bandStart.part,
              ...(state.bandStart.visit > 0 ? { startVisit: state.bandStart.visit } : {}),
              lines,
              retries: 0,
              ...capOrigin(cols),
            });
            proposedSpan = true;
          }
        }
        if (levelBefore && !capActive && !proposedSpan) {
          // The box leaves an uncapped band: level it behind the box (a
          // trailing cap, resolved after balancing) and keep balancing from
          // stretching its last column to the page bottom meanwhile. A band
          // that is level already is closed at its text (#713).
          proposeTrailingCap(startIdx, undefined, true);
          markForcedBreak();
        } else if (capActive && cap?.kind === 'trailing') {
          // Reached inside the band cut level for it: delivered even though
          // the box moves on — the columns stay cut.
          spanPlacedInBand.add(startIdx);
        }
      }

      // Open the next page (flushing pending floats into its bands). A page
      // holding only floats counts as occupied here — its float band is what
      // left no room — but a truly empty page is kept: the box then simply
      // does not fit a page and is force-placed (overflowing, like inline).
      // On a fresh page the whole box is force-placed above whenever the
      // page has a text column to cut; reaching this point there means it
      // has none — leave the box to the inline path (its head, if any, is
      // already committed: `true` keeps the rest from being placed twice).
      if (forceHere) return part > 0;
      const curPage = doc.pages[cursor.pageIndex]!;
      if (pageIsOccupied(curPage)) {
        state.pendingSpacing = 0;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        page = doc.pages[cursor.pageIndex]!;
      }
      // A freshly opened (or empty) page is level; force-place (overflow)
      // when the box is taller than the page.
      if (bandColumns(page, currentBand(page, cursor)).length === 0) return false; // no text column to cut — leave it to the inline path
      forceHere = true;
    }
  };

  /** Whether the flow ends at a chapter-level boundary right after block
   *  `from` (skipping container markers): a chapter opener, a `:::part`, a
   *  float-barrier box, or the end of the document. */
  const nextIsBarrier = (from: number): boolean => {
    for (let i = from; i < contentBlocks.length; i++) {
      const b = contentBlocks[i]!;
      if (b.type === 'containerEnd') continue;
      if (b.type === 'containerStart') {
        if (b.containerName === 'part') return true;
        if (b.containerName === 'callout') {
          const plan = calloutPlan.get(i);
          const style = plan ? pickCalloutStyle(calloutStyles, plan.attrs.type) : undefined;
          return style?.floatBarrier === true;
        }
        continue;
      }
      if (b.type === 'heading' && b.level) {
        const level = headingLevels.forBlock(b);
        // A page-span heading that opens mid-page (`spanBreak: false`,
        // #539) ends no page.
        return level?.breakBefore?.enabled === true || (level?.span === 'page' && level.spanBreak !== false);
      }
      return false;
    }
    return true;
  };

  const rectsOverlap = (a: BoundingBox, b: BoundingBox): boolean =>
    a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5
    && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;
  return {
    placeCalloutSpan, nextIsBarrier, rectsOverlap
  };
}
