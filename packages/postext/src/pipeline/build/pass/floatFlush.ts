// Flushing pending floats into a page, keep-together boxes, floats heading
// their citing page, and what happens when a page opens.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { VDTPage, VDTColumn, ResolvedConfig, VDTDocument } from '../../../vdt.js';
import type { PlannedFloat } from '../../floatPlacement.js';
import { sideColumns, sideColumnOf, currentBand, bandColumns, FIT_EPS, advanceToNextColumn, type PlacementCursor } from '../../placement.js';
import { type FloatSlotPosition, type FloatSlot, enumerateCurrentPageSlots, type FloatMeasure, type ColumnCapKind } from '../../floatSlots.js';
import { pickCalloutStyle, resolveCalloutAttrs, type PlannedCallout } from '../../calloutLayout.js';
import { CUT_START } from '../../frameLayout.js';
import { opensAfterBreak, floatPagesOf } from '../passHelpers.js';
import type { CitingPageSlot, CitingPageRefusal } from '../passTypes.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { Resource, ResolvedCalloutStyleConfig } from '../../../types.js';
import type { TableSliceSpec } from '../../resourceLayout.js';
import type { FloatRotation, CaptionAside, BodyCap, PlaceResult } from './types.js';
import type { PassState, PassLate } from './state.js';

/** What createFloatFlush takes from the pass. */
export interface FloatFlushDeps {
  citingPageFloats: ReadonlyMap<string, CitingPageSlot> | undefined;
  resolved: ResolvedConfig;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  contentBlocks: ContentBlock[];
  resourceById: Map<string, Resource>;
  calloutStyles: ResolvedCalloutStyleConfig[];
  calloutPlan: Map<number, PlannedCallout>;
  floatPlan: PlannedFloat[];
  pendingFloats: PlannedFloat[];
  pendingSideBoxes: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig; pageIndex: number }[];
  multiColumnBand: (page: VDTPage) => boolean;
  enqueuedFloatIds: Set<string>;
  citationGates: Map<string, { blockIdx: number; line: number; }>;
  awaitsCitation: (f: PlannedFloat) => boolean;
  floatGapPx: number;
  minTextPx: number;
  measureFloat: (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap) => FloatMeasure | null;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  capKindOf: (col: VDTColumn) => ColumnCapKind;
  probeFloatBand: (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean, anchorToCap: boolean, side?: boolean, refY?: number) => { need: number; y: number; measure: FloatMeasure; slice: TableSliceSpec | undefined; width: number; xLeft: number; rotated: FloatRotation | undefined; aside?: CaptionAside; sideCol?: VDTColumn; } | null;
  availableAfterBand: (col: VDTColumn, position: FloatSlotPosition, probe: { need: number; y: number; measure: FloatMeasure; }, anchorToCap: boolean) => number;
  placeFloatInColumns: (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean, mode: "fresh" | "strict", anchorToCap?: boolean, side?: boolean, refY?: number) => PlaceResult;
  settle: (i: number, r: PlaceResult) => number;
  heldBack: (i: number) => boolean;
  positionsFor: (f: PlannedFloat) => FloatSlotPosition[];
  cursor: PlacementCursor;
  forcedBreakPages: Set<number>;
  state: PassState;
  late: PassLate;
}

export function createFloatFlush(deps: FloatFlushDeps) {
  const {
    citingPageFloats, resolved, doc, pageWidthPx, pageHeightPx, contentBlocks, resourceById,
    calloutStyles, calloutPlan, floatPlan, pendingFloats, pendingSideBoxes, multiColumnBand,
    enqueuedFloatIds, citationGates, awaitsCitation, floatGapPx, minTextPx, measureFloat, reservedOf,
    capKindOf, probeFloatBand, availableAfterBand, placeFloatInColumns, settle, heldBack,
    positionsFor, cursor, forcedBreakPages, state, late
  } = deps;
  /** Reserve top/bottom bands on a freshly opened page and position as many
   *  pending floats as fit, shrinking the affected columns so body text flows
   *  around them. Full-width (page-span) floats reserve the outermost bands
   *  first, so a later single-column float nests inside the remaining column
   *  space rather than overlapping a full-width band; the passes repeat
   *  while they place something, so a page-span float held back behind a
   *  column float of its sequence still gets the page's foot once that one
   *  is set. A float that does not fit holds up the ones behind it in its
   *  numbering sequence (see `heldBack`), never the other sequence. */
  const flushPendingFloatsIntoPage = (page: VDTPage): void => {
    if (pendingFloats.length === 0) { late.flushSideBoxesIntoPage(page); return; }
    // A floated box heading the page goes first: the figures then take
    // the foot under it (a figure set first would claim the foot and push
    // the box on by the text-room rule). Stable: sequences keep their order.
    const headFirst = (f: PlannedFloat): number => (f.callout && f.position === 'top' ? 0 : 1);
    pendingFloats.sort((a, b) => headFirst(a) - headFirst(b));
    const textCols = page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side');
    if (textCols.length === 0) return;
    const sideCols = sideColumns(page);
    /** A page-span float on a fresh page takes the band of every column,
     *  the side column included. */
    const pageCols = [...textCols, ...sideCols];
    /** The least reserved text column a float may take (the rest of a
     *  split table: only columns after its previous slice on this page). */
    const leastReserved = (f: PlannedFloat): VDTColumn | undefined => {
      const after = f.notBefore && f.notBefore.pageIndex === page.index ? f.notBefore.columnIndex : -1;
      let best: VDTColumn | undefined;
      for (const c of textCols) {
        if (c.index <= after) continue;
        if (!best) { best = c; continue; }
        const rb = reservedOf(best);
        const rc = reservedOf(c);
        if (rc.top + rc.bottom < rb.top + rb.bottom) best = c;
      }
      return best;
    };
    /** The run of `n` adjacent text columns a float across several
     *  columns takes on a fresh page: the least reserved at the head (or
     *  foot) of those whose bands start (or end) level, the leftmost of
     *  equals, after a split table's previous slice. */
    const leastReservedGroup = (f: PlannedFloat, n: number, pos: FloatSlotPosition): VDTColumn[] | undefined => {
      const after = f.notBefore && f.notBefore.pageIndex === page.index ? f.notBefore.columnIndex : -1;
      let best: VDTColumn[] | undefined;
      let bestLoad = Infinity;
      for (let i = 0; i + n <= textCols.length; i++) {
        const group = textCols.slice(i, i + n);
        if (group[0]!.index <= after) continue;
        const edge = (c: VDTColumn): number => (pos === 'top' ? c.bbox.y : c.bbox.y + c.bbox.height);
        if (!group.every((c) => Math.abs(edge(c) - edge(group[0]!)) < 0.5)) continue;
        const load = group.reduce((m, c) => Math.max(m, reservedOf(c).top + reservedOf(c).bottom), 0);
        if (load < bestLoad - 0.5) { best = group; bestLoad = load; }
      }
      return best;
    };
    // Order of the passes: page-span floats take the outer bands; column
    // floats whose caption goes to the side column reserve it before the
    // waiting side boxes and side floats stack there; the rest follow.
    let sideBoxesFlushed = false;
    for (let stage = 0; stage < 3; stage++) {
      // Stage 0: page-span floats alone, until none is left to place (they
      // take the outer bands of every column, the side column included);
      // stage 1: column floats whose caption goes to the side column (they
      // reserve their band there); then the waiting side boxes; stage 2:
      // the side floats and the other column floats.
      const passes = stage === 0 ? (['page'] as const) : stage === 1 ? (['aside'] as const) : (['side', 'column'] as const);
      if (stage === 2 && !sideBoxesFlushed) { late.flushSideBoxesIntoPage(page); sideBoxesFlushed = true; }
    for (let progress = true; progress;) {
      const before = state.floatsPlaced;
      for (const pass of passes) {
        let i = 0;
        while (i < pendingFloats.length) {
          const f = pendingFloats[i]!;
          const across = Math.min(f.columns ?? 1, textCols.length);
          const isPageSpan = (f.span === 'page' || (across > 1 && across === textCols.length)) && (textCols.length > 1 || sideCols.length > 0);
          const isSide = !isPageSpan && f.span === 'side' && sideCols.length > 0;
          const kind = isPageSpan ? 'page' : isSide ? 'side' : f.captionSide && sideCols.length > 0 ? 'aside' : 'column';
          if (kind !== pass || heldBack(i)) { i++; continue; }
          // After the text a side float keeps behind the side boxes fenced
          // before its citation that still wait (#639).
          if (isSide && state.drainingAfterText && pendingSideBoxes.some((b) => b.startIdx < f.firstBlockIdx)) { i++; continue; }
          // A page-span rest never shares the page of its previous slice.
          if (isPageSpan && f.notBefore?.pageIndex === page.index) { i++; continue; }
          let r: PlaceResult = 'defer';
          if (isSide) {
            r = placeFloatInColumns(page, f, [sideCols[0]!], 'top', false, 'fresh', false, true);
          } else {
            for (const pos of positionsFor(f)) {
              if (!isPageSpan && across > 1) {
                const group = leastReservedGroup(f, across, pos);
                if (!group) continue;
                r = placeFloatInColumns(page, f, group, pos, false, 'fresh');
                if (r !== 'defer') break;
                continue;
              }
              const col = isPageSpan ? undefined : leastReserved(f);
              if (!isPageSpan && !col) break;
              const cols = isPageSpan ? pageCols : [col!];
              r = placeFloatInColumns(page, f, cols, pos, isPageSpan, 'fresh');
              if (r !== 'defer') break;
            }
          }
          i = settle(i, r);
        }
      }
      progress = state.floatsPlaced > before;
    }
    }
    if (!sideBoxesFlushed) late.flushSideBoxesIntoPage(page);
  };

  /** The keep-together box content block `idx` opens, when it is one that
   *  lays out inline in a column of the current band (`span: 'column'`,
   *  placement `here`): its height at a column width, so the floats placed
   *  right before it can tell whether a slot would starve it. */
  const keepTogetherBoxAt = (idx: number): { heightAt: (width: number) => number } | null => {
    const b = contentBlocks[idx];
    if (!b || b.type !== 'containerStart' || b.containerName !== 'callout') return null;
    const plan = calloutPlan.get(idx);
    const style = plan ? pickCalloutStyle(calloutStyles, plan.attrs.type) : undefined;
    if (!plan || !style || !style.keepTogether) return null;
    const { span, placement } = resolveCalloutAttrs(style, plan.attrs);
    if (placement !== 'here') return null;
    const page = doc.pages[cursor.pageIndex]!;
    if (span === 'page' && multiColumnBand(page)) return null;
    if (span === 'side' && sideColumnOf(page, currentBand(page, cursor))) return null;
    const L = late.makeCalloutLayouter(idx, plan, style);
    const heights = new Map<number, number>();
    return {
      heightAt: (width) => {
        const key = Math.round(width * 100);
        let h = heights.get(key);
        if (h === undefined) {
          const r = L.layoutRange(CUT_START, L.end, width, 'probe', false);
          h = r.totalHeight + Math.max(state.pendingSpacing, r.marginTopPx);
          heights.set(key, h);
        }
        return h;
      },
    };
  };

  /** Whether reserving float `f` in `slot` would leave the keep-together
   *  box that comes next with no column of the current band to land in —
   *  when, without the float, one of them (the cursor's, or an empty one
   *  after it) still holds it. A float yields to such a box, as a
   *  compositor would: the box stays in flow and the figure takes the next
   *  slot (usually the next page) instead of pushing the box off the page
   *  and leaving the column with the figure alone. */
  const slotStarvesBox = (
    page: VDTPage,
    f: PlannedFloat,
    slot: FloatSlot,
    box: { heightAt: (width: number) => number; stays?: boolean },
    anchorToCap: boolean,
  ): boolean => {
    const cursorCol = page.columns[cursor.columnIndex];
    if (!cursorCol) return false;
    // (A short list set whole stays under what introduces it: only the
    // cursor's column counts for it, #749.)
    const candidates = bandColumns(page, currentBand(page, cursor))
      .filter((c) => c.kind !== 'span' && c.index >= cursorCol.index && (c === cursorCol || (!box.stays && c.blocks.length === 0)));
    const fitsIn = (c: VDTColumn, available: number): boolean => available >= box.heightAt(c.bbox.width) - 0.01;
    if (!candidates.some((c) => fitsIn(c, c.availableHeight))) return false;
    const probe = probeFloatBand(page, f, slot.cols, slot.position, slot.pageSpan, anchorToCap);
    if (!probe) return false;
    const after = (c: VDTColumn): number =>
      slot.cols.includes(c) ? availableAfterBand(c, slot.position, probe, anchorToCap) : c.availableHeight;
    return !candidates.some((c) => fitsIn(c, after(c)));
  };

  /** Offer every pending float the free slots of the current page after the
   *  cursor (bottom of the referencing column, top / bottom of the next
   *  empty columns; the band bottom for page-span floats). Runs before each
   *  block is placed, so a float lands in the first gap after its reference.
   *  `nextBlockIdx` is that block: a keep-together box it opens holds the
   *  slots that would starve it (see `slotStarvesBox`), and so does a
   *  short list set whole (`shortListBoxAt`). */
  const tryPlacePendingFloatsOnCurrentPage = (preferTop = false, nextBlockIdx?: number, anyPosition = false): void => {
    if (pendingFloats.length === 0) return;
    const page = doc.pages[cursor.pageIndex]!;
    const box = nextBlockIdx !== undefined ? (keepTogetherBoxAt(nextBlockIdx) ?? late.shortListBoxAt(nextBlockIdx)) : null;
    for (let i = 0; i < pendingFloats.length;) {
      if (heldBack(i)) { i++; continue; }
      const f = pendingFloats[i]!;
      let r: PlaceResult = 'defer';
      // `anyPosition`: a figure or table may take a slot its position would
      // refuse (a head-of-page float offered the foot of the current page);
      // floated callouts keep their placement.
      const asked = anyPosition && !f.rotate && !f.callout && f.position !== 'auto' ? { ...f, position: 'auto' as const } : f;
      let slots = enumerateCurrentPageSlots(page, cursor.columnIndex, asked, capKindOf, late.openerHeadOf);
      // The rest of a table cut on this page only takes the slots after
      // its previous slice in reading order (never the foot of the column
      // before it; a page-span rest waits for the next page).
      if (f.notBefore && f.notBefore.pageIndex === page.index) {
        const after = f.notBefore.columnIndex;
        slots = slots.filter((s) => !s.pageSpan && s.cols[0]!.index > after);
      }
      // A page-span box comes next: the head of an empty column keeps the
      // band cuttable under the float (the box then sits below both the
      // text and the figure), where the referencing column's foot would
      // wall the box off the page. A page-span figure waits for the box
      // itself, which cuts the band under the text and sets the figure
      // there, above the box (`placeSpanFloatsAtCut`) — its only slot here
      // would be the band's foot, under the box.
      if (preferTop && f.span === 'page' && multiColumnBand(page)) { i++; continue; }
      if (preferTop) slots = [...slots.filter((s) => s.position === 'top'), ...slots.filter((s) => s.position !== 'top')];
      for (const slot of slots) {
        if (slot.side) {
          r = placeFloatInColumns(page, f, slot.cols, slot.position, false, 'strict', false, true, slot.refY);
          if (r !== 'defer') break;
          continue;
        }
        if (box && slotStarvesBox(page, f, slot, box, preferTop)) continue;
        r = placeFloatInColumns(page, f, slot.cols, slot.position, slot.pageSpan, 'strict', preferTop);
        if (r !== 'defer') break;
      }
      i = settle(i, r);
    }
  };

  // --- Floats at the head of the page that cites them (#633) ---------------
  // A float that may head its citing page (`placement.citingPage`) is placed
  // as any other in the first pass; when its citing line lands on a page (a
  // column) whose head it would fit while the float went on to a later one,
  // the pass proposes that head (`settleCitingPageFloats`), and the next
  // pass opens the page with the float there, before any text, the text
  // above the reference moving down under it. The driver keeps the slot
  // while the citing line stays on that page (that column).
  /** The floats `PassHints.citingPageFloats` sets at the head of each page,
   *  in first-reference order (the order of their numbers). */
  const citingHeadsByPage = new Map<number, PlannedFloat[]>();
  if (citingPageFloats && citingPageFloats.size > 0) {
    for (const f of floatPlan) {
      const slot = citingPageFloats.get(f.resourceId);
      if (!slot || !f.citingPage) continue;
      const list = citingHeadsByPage.get(slot.pageIndex);
      if (list) list.push(f);
      else citingHeadsByPage.set(slot.pageIndex, [f]);
    }
  }
  /** The floats this pass set at the head of their citing page. */
  const citingHeadsSet = new Set<string>();
  const floatPlanOrder = new Map(floatPlan.map((f, i) => [f.resourceId, i]));
  /** Whether every float of `f`'s numbering sequence first cited before it
   *  is set already: figure 4 never heads a page while figure 3 waits. */
  const sequenceSetBefore = (f: PlannedFloat): boolean => {
    const typeId = resourceById.get(f.resourceId)?.typeId;
    const at = floatPlanOrder.get(f.resourceId) ?? 0;
    for (let i = 0; i < at; i++) {
      const g = floatPlan[i]!;
      if (resourceById.get(g.resourceId)?.typeId !== typeId) continue;
      if (!enqueuedFloatIds.has(g.resourceId) || pendingFloats.some((p) => p.resourceId === g.resourceId)) return false;
    }
    return true;
  };
  /** The text columns of `page`'s first band (no span block above them). */
  const firstBandTextColumns = (page: VDTPage): VDTColumn[] =>
    page.columns.filter((c) => c.kind !== 'span' && c.kind !== 'side' && (c.band ?? 0) === 0);
  /** Whether a float takes the page's whole width on `page` (as
   *  `flushFloatsIntoPage` reads it). */
  const spansPageOn = (page: VDTPage, f: PlannedFloat, textCols: readonly VDTColumn[]): boolean => {
    const across = Math.min(f.columns ?? 1, textCols.length);
    return (f.span === 'page' || (across > 1 && across === textCols.length)) && (textCols.length > 1 || sideColumns(page).length > 0);
  };
  /** The columns a column float heading its citing column `columnIndex`
   *  takes: that column, or the run of `columns` from it (ending at the
   *  band's last column when fewer follow it). */
  const citingColumnsOf = (f: PlannedFloat, textCols: readonly VDTColumn[], columnIndex: number): VDTColumn[] | undefined => {
    const across = Math.min(f.columns ?? 1, textCols.length);
    const at = textCols.findIndex((c) => c.index === columnIndex);
    if (at < 0) return undefined;
    const from = Math.max(0, Math.min(at, textCols.length - across));
    return textCols.slice(from, from + across);
  };
  /** Set the floats that head `page` (`PassHints.citingPageFloats`), after
   *  the floats the page owes to earlier pages (cited before them, read
   *  before them): each where its citing line lands, when its sequence is
   *  set up to it and it fits within `layout.maxTopFraction` of the column,
   *  the text room kept under it. One that does not is placed as usual. */
  const placeCitingHeads = (page: VDTPage): void => {
    const heads = citingHeadsByPage.get(page.index);
    if (!heads) return;
    if (opensAfterBreak(doc.pages, page.index, forcedBreakPages) || page.openerBand || page.partInfo) return;
    const textCols = firstBandTextColumns(page);
    if (textCols.length === 0 || textCols.some((c) => c.blocks.length > 0)) return;
    const maxTop = resolved.layout.maxTopFraction;
    for (const planned of heads) {
      const id = planned.resourceId;
      if (citingHeadsSet.has(id)) continue;
      const at = pendingFloats.findIndex((p) => p.resourceId === id);
      // Placed already, or queued with its citing line placed (on an
      // earlier page): the usual slots are its.
      if (at >= 0 ? !awaitsCitation(pendingFloats[at]!) : enqueuedFloatIds.has(id)) continue;
      if (!sequenceSetBefore(planned)) continue;
      const pageSpan = spansPageOn(page, planned, textCols);
      const cols = pageSpan ? [...textCols, ...sideColumns(page)] : citingColumnsOf(planned, textCols, citingPageFloats!.get(id)!.columnIndex);
      if (!cols) continue;
      const f: PlannedFloat = { ...planned, refPageIndex: page.index };
      const probe = probeFloatBand(page, f, cols, 'top', pageSpan, false);
      if (!probe) continue;
      const fits = cols.filter((c) => c.kind !== 'side').every((c) => {
        const r = reservedOf(c);
        const full = c.bbox.height + r.top + r.bottom;
        return r.top + probe.need <= maxTop * full + 0.01 && probe.need <= c.availableHeight - minTextPx + 0.01;
      });
      if (!fits) continue;
      // A page opened for a block that cannot split keeps its room.
      if (state.freshPageHold && cols.includes(state.freshPageHold.col)
        && availableAfterBand(state.freshPageHold.col, 'top', probe, false) < state.freshPageHold.px - FIT_EPS) continue;
      const r = placeFloatInColumns(page, f, cols, 'top', pageSpan, 'strict');
      if (r === 'defer' || r === 'skip') continue;
      enqueuedFloatIds.add(id);
      citationGates.delete(id);
      citingHeadsSet.add(id);
      if (at >= 0) pendingFloats.splice(at, 1);
      // A table cut to the head after all goes on as any rest does.
      if (typeof r === 'object') pendingFloats.push(r.rest);
    }
  };
  /**
   * After the pass: the floats that may head their citing page and went on
   * to a later page (or column), with the head their citing line's page
   * (column) offers — proposals for the next pass — and the floats the
   * hints asked to head a page this pass did not keep there. A float is
   * proposed when its citing line lands in the first band of a page that
   * no explicit break opened (no opener, part or `:::pagebreak` above it),
   * as one slice (not a table split across pages), when the earlier floats
   * of its sequence went no later than that page, and when it fits within
   * `layout.maxTopFraction` of the column.
   */
  const settleCitingPageFloats = (): { proposals: Map<string, CitingPageSlot>; refused: Map<string, CitingPageRefusal> } => {
    const proposals = new Map<string, CitingPageSlot>();
    const refused = new Map<string, CitingPageRefusal>();
    const candidates = floatPlan.filter((f) => f.citingPage);
    if (candidates.length === 0) return { proposals, refused };
    const byId = new Map(candidates.map((f) => [f.resourceId, f]));
    // Where each one's citation landed: the first line that cites it, or
    // for a `::resource` directive the first line placed after it.
    const cited = new Map<string, { pageIndex: number; col: VDTColumn }>();
    const directives = candidates.filter((f) => contentBlocks[f.firstBlockIdx]?.type === 'resourceBlock');
    for (const page of doc.pages) {
      for (const col of page.columns) {
        for (const b of col.blocks) {
          for (const f of directives) {
            if (!cited.has(f.resourceId) && b.contentIndex !== undefined && b.contentIndex > f.firstBlockIdx && b.lines.length > 0) {
              cited.set(f.resourceId, { pageIndex: page.index, col });
            }
          }
          for (const l of b.lines) {
            for (const seg of l.segments ?? []) {
              const id = seg.refResourceId;
              if (id !== undefined && byId.has(id) && !cited.has(id)) cited.set(id, { pageIndex: page.index, col });
            }
          }
        }
      }
    }
    const landed = floatPagesOf(doc);
    const landedColumn = new Map<string, { columnIndex: number; slices: number }>();
    for (const page of doc.pages) {
      for (const fb of page.floats ?? []) {
        const id = fb.resourceBlock?.resource.id;
        if (id === undefined || !byId.has(id)) continue;
        const l = landedColumn.get(id);
        if (l) l.slices++;
        else landedColumn.set(id, { columnIndex: fb.columnIndex ?? 0, slices: 1 });
      }
    }
    const positionIn = (cols: readonly VDTColumn[], index: number): number => cols.findIndex((c) => c.index === index);
    for (const f of candidates) {
      const id = f.resourceId;
      const c = cited.get(id);
      const slot = citingPageFloats?.get(id);
      if (slot) {
        // Hinted: kept when it was set at the head and its citing line is
        // still under it, on that page, in a column it heads.
        if (!citingHeadsSet.has(id)) { refused.set(id, 'notSet'); continue; }
        const page = doc.pages[slot.pageIndex];
        let kept = !!page && c !== undefined && c.pageIndex === slot.pageIndex;
        if (kept && page) {
          const textCols = firstBandTextColumns(page);
          if (!spansPageOn(page, f, textCols)) {
            const cols = citingColumnsOf(f, textCols, slot.columnIndex);
            kept = cols !== undefined && cols.includes(c!.col);
          }
        }
        if (!kept) refused.set(id, 'citationMoved');
        continue;
      }
      const l = landedColumn.get(id);
      const landedPage = landed.get(id);
      if (!c || !l || landedPage === undefined || l.slices > 1) continue;
      const page = doc.pages[c.pageIndex]!;
      if (c.col.kind === 'span' || c.col.kind === 'side' || (c.col.band ?? 0) !== 0) continue;
      if (opensAfterBreak(doc.pages, c.pageIndex, forcedBreakPages) || page.openerBand || page.partInfo) continue;
      const textCols = firstBandTextColumns(page);
      const pageSpan = spansPageOn(page, f, textCols);
      const later = landedPage > c.pageIndex
        || (!pageSpan && landedPage === c.pageIndex && positionIn(textCols, l.columnIndex) > positionIn(textCols, c.col.index));
      if (!later) continue;
      // The earlier floats of its sequence went no later than that page.
      const typeId = resourceById.get(id)?.typeId;
      const order = floatPlanOrder.get(id) ?? 0;
      if (floatPlan.slice(0, order).some((g) => resourceById.get(g.resourceId)?.typeId === typeId && (landed.get(g.resourceId) ?? Infinity) > c.pageIndex)) continue;
      // It fits the head within `layout.maxTopFraction` of the column.
      const cols = pageSpan ? textCols : citingColumnsOf(f, textCols, c.col.index);
      if (!cols || cols.length === 0) continue;
      const slotWidth = pageSpan ? page.contentArea.width : cols[cols.length - 1]!.bbox.x + cols[cols.length - 1]!.bbox.width - cols[0]!.bbox.x;
      const width = f.widthFraction && f.widthFraction < 1 ? slotWidth * f.widthFraction : slotWidth;
      const m = measureFloat(id, width);
      if (!m || m.height + floatGapPx > resolved.layout.maxTopFraction * page.contentArea.height + 0.01) continue;
      proposals.set(id, { pageIndex: c.pageIndex, columnIndex: c.col.index });
    }
    return { proposals, refused };
  };

  /** Reserve the floats a freshly opened page owes: those waiting for a
   *  page's bands, then those that head the page citing them (#633). */
  const flushFloatsIntoPage = (page: VDTPage): void => {
    flushPendingFloatsIntoPage(page);
    if (citingHeadsByPage.size > 0) placeCitingHeads(page);
  };

  /** Reserve floats on each freshly opened content page. Passed only to the
   *  content-flow column advances — parity / force-blank pages never get it. */
  const onNewPage = (page: VDTPage): void => flushFloatsIntoPage(page);
  /** The block a page is being opened for, when it cannot split: the
   *  column it goes into and the height it needs there (see
   *  `placeFloatInColumns`). Set only while that page's floats are flushed. */
  state.freshPageHold = null;
  /** `onNewPage` for a page an inline figure or table opens (EF-160): the
   *  floats pending take its bands as on any page the flow opens — up to
   *  postext 1.4 they skipped it and waited for the page after — but never
   *  the room the block needs under or over them. */
  const onAtomicNewPage = (heightPx: number) => (page: VDTPage): void => {
    const col = page.columns.find((c) => c.kind !== 'span' && c.kind !== 'side');
    state.freshPageHold = col ? { col, px: heightPx } : null;
    try {
      flushFloatsIntoPage(page);
    } finally {
      state.freshPageHold = null;
    }
  };

  /** Whether content block `idx` opens a callout that will span the page
   *  in the current (multi-column) band — the floats placed right before
   *  it prefer the head of an empty column. */
  const spanBoxAt = (idx: number): boolean => {
    const b = contentBlocks[idx];
    if (!b || b.type !== 'containerStart' || b.containerName !== 'callout') return false;
    const plan = calloutPlan.get(idx);
    const style = plan ? pickCalloutStyle(calloutStyles, plan.attrs.type) : undefined;
    if (!style) return false;
    const { span, placement } = resolveCalloutAttrs(style, plan!.attrs);
    if (span !== 'page' || placement !== 'here') return false;
    return multiColumnBand(doc.pages[cursor.pageIndex]!);
  };

  /** Chapter barrier: place every pending float before the boundary — in
   *  the current page's free slots, then on fresh pages opened ahead of it
   *  (each force-places at least one float). The cursor is left on the last
   *  float page so the boundary's own page break opens AFTER them. */
  const drainPendingFloats = (): void => {
    tryPlacePendingFloatsOnCurrentPage();
    // A float that would otherwise take a page of its own before the
    // boundary settles for a free slot of the current page — the foot of
    // its closing columns — whatever position it asked for: a chapter's
    // last page with room under its text beats a page holding one table.
    tryPlacePendingFloatsOnCurrentPage(false, undefined, true);
    // So does a waiting side box, for room in a side column of the pages
    // the flow opened after its fence.
    late.settlePendingSideBoxes();
    let guard = 0;
    state.drainingAfterText = true;
    try {
      // A page that sets a side box counts as progress like one that sets
      // a float (#639): up to postext 1.24 the loop stopped after the first
      // page of boxes and the rest of the queue was never set.
      while ((pendingFloats.length > 0 || pendingSideBoxes.length > 0) && guard++ < 1000) {
        const before = state.floatsPlaced;
        const boxesBefore = pendingSideBoxes.length;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        if (state.floatsPlaced === before && pendingSideBoxes.length === boxesBefore) break; // safety: no progress
      }
    } finally {
      state.drainingAfterText = false;
    }
  };
  return {
    tryPlacePendingFloatsOnCurrentPage, settleCitingPageFloats, flushFloatsIntoPage, onNewPage,
    onAtomicNewPage, spanBoxAt, drainPendingFloats
  };
}
