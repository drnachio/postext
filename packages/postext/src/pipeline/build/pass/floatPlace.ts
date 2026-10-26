// Placing a float in the columns of a page (placeFloatInColumns).
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { VDTPage, VDTColumn, VDTExclusion, ResolvedConfig, VDTBlock, ContentWarning, ResolvedResourceBlock, BoundingBox, VDTExclusionContour } from '../../../vdt.js';
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import { type FloatSlotPosition, type FloatMeasure, measureFloatBand, trueBottom, measureSideStack, columnHasFloatBand, floatGapAbove, fitsStrict, type SideObstacle } from '../../floats/floatSlots.js';
import { columnCursorY, wrapGapPx, minTextWidthPx } from '../../floats/textWrap.js';
import { sideUsedBottom, FIT_EPS } from '../../blocks/placement.js';
import { setAfterText } from '../warnings.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { Resource, ResolvedCalloutStyleConfig } from '../../../types.js';
import type { BlockStyle } from '../../styles.js';
import type { CompositionRule } from '../../../types/bodyText.js';
import type { PlannedCallout } from '../../callouts/calloutLayout.js';
import type { CalloutLayouter } from '../../callouts/frameLayout.js';
import type { TableOverflow } from '../../../types/tableStyles.js';
import type { TableSliceSpec } from '../../resources/resourceLayout.js';
import type { FloatRotation, CaptionAside, BodyCap, PlaceResult } from './types.js';
import type { PassState, PassLate } from './state.js';

/** What createFloatPlace takes from the pass. */
export interface FloatPlaceDeps {
  captionUnderProposals: Set<string>;
  asideCutBy: WeakMap<VDTColumn, string>;
  shortSideColumn: (page: VDTPage, col: VDTColumn) => boolean;
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  bodyOffset: number;
  contentBlocks: ContentBlock[];
  resourceById: Map<string, Resource>;
  bodyStyle: BlockStyle;
  pendingFloats: PlannedFloat[];
  openerPages: Set<VDTPage>;
  openerFloatRule: CompositionRule;
  noteOpenerFloat: (page: VDTPage, f: PlannedFloat) => void;
  awaitsCitation: (f: PlannedFloat) => boolean;
  calloutFloatOf: (resourceId: string) => { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; } | undefined;
  calloutBandPages: Set<VDTPage>;
  floatGapPx: number;
  minTextPx: number;
  tableOverflow: (resourceId: string) => TableOverflow;
  measureFloat: (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap) => FloatMeasure | null;
  buildFloatBlock: (resourceId: string, x: number, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, flushEnd?: boolean | number, aside?: CaptionAside, mirrored?: boolean, cap?: BodyCap) => { block: VDTBlock; height: number; } | null;
  rotatedFlushEnd: (page: VDTPage) => boolean;
  floatReserved: Map<VDTColumn, { top: number; bottom: number; }>;
  reservedOf: (col: VDTColumn) => { top: number; bottom: number; };
  wrapExclusionWidth: (columnWidth: number, itemWidth: number, gap: number) => number;
  textWrapNotes: ContentWarning[];
  wrapContourOf: (resource: Resource, rb: ResolvedResourceBlock, box: BoundingBox, gapPx: number, page: VDTPage, origin: { x: number; y: number; }, source?: { sourceStart: number; sourceEnd: number; }) => VDTExclusionContour | undefined;
  floatWraps: Map<VDTColumn, { position: FloatSlotPosition; need: number; ex: VDTExclusion; }[]>;
  topFloatRefOf: Map<VDTColumn, number>;
  splitTableFloat: (f: PlannedFloat, width: number, position: FloatSlotPosition, targetCols: readonly VDTColumn[], contentArea: BoundingBox, avail: number, mode: "fresh" | "strict", rotated?: FloatRotation) => { slice: TableSliceSpec; rest?: PlannedFloat; } | "skip" | "none" | null;
  sideObstacles: WeakMap<VDTColumn, (SideObstacle & { owner: VDTBlock; })[]>;
  probeFloatBand: (page: VDTPage, f: PlannedFloat, targetCols: readonly VDTColumn[], position: FloatSlotPosition, pageSpan: boolean, anchorToCap: boolean, side?: boolean, refY?: number) => { need: number; y: number; measure: FloatMeasure; slice: TableSliceSpec | undefined; width: number; xLeft: number; rotated: FloatRotation | undefined; aside?: CaptionAside; sideCol?: VDTColumn; } | null;
  availableAfterBand: (col: VDTColumn, position: FloatSlotPosition, probe: { need: number; y: number; measure: FloatMeasure; }, anchorToCap: boolean) => number;
  commitFloatBlock: (page: VDTPage, col: VDTColumn, built: { block: VDTBlock; height: number; }, x: number, y: number, width: number, anchorIdx: number) => void;
  shrinkToRoom: (f: PlannedFloat, width: number, aside: CaptionAside | undefined, full: FloatMeasure, room: number, topBand: boolean, bandOf: (m: FloatMeasure) => { need: number; y: number; }) => { measure: FloatMeasure; need: number; y: number; cap: BodyCap; fits: boolean; } | null;
  uncappedBottoms: Map<VDTColumn, number>;
  openerHeadFloats: Map<VDTColumn, number>;
  state: PassState;
  late: PassLate;
}

export function createFloatPlace(deps: FloatPlaceDeps) {
  const {
    captionUnderProposals, asideCutBy, shortSideColumn, resolved, dpi, baselineGrid, bodyOffset,
    contentBlocks, resourceById, bodyStyle, pendingFloats, openerPages, openerFloatRule,
    noteOpenerFloat, awaitsCitation, calloutFloatOf, calloutBandPages, floatGapPx, minTextPx,
    tableOverflow, measureFloat, buildFloatBlock, rotatedFlushEnd, floatReserved, reservedOf,
    wrapExclusionWidth, textWrapNotes, wrapContourOf, floatWraps, topFloatRefOf, splitTableFloat,
    sideObstacles, probeFloatBand, availableAfterBand, commitFloatBlock, shrinkToRoom,
    uncappedBottoms, openerHeadFloats, state, late
  } = deps;
  const placeFloatInColumns = (
    page: VDTPage,
    f: PlannedFloat,
    targetCols: readonly VDTColumn[],
    position: FloatSlotPosition,
    pageSpan: boolean,
    mode: 'fresh' | 'strict',
    anchorToCap = false,
    side = false,
    refY?: number,
  ): PlaceResult => {
    // An opener page takes no float (`layout.openerFloats: 'avoid'`, #749):
    // it waits for the page the flow opens next.
    if (openerFloatRule === 'avoid' && openerPages.has(page)) return 'defer';
    const first = targetCols[0]!;
    const probe = probeFloatBand(page, f, targetCols, position, pageSpan, anchorToCap, side, refY);
    if (!probe) return 'skip';
    const { width, xLeft, rotated, aside, sideCol } = probe;
    let { slice, measure, need, y } = probe;
    let rest: PlannedFloat | undefined;
    /** A picture scaled to this slot (`placement.shrink`, #626). */
    let cap: BodyCap | undefined;
    const bandOf = (m: FloatMeasure) => measureFloatBand(
      position, m, targetCols, page.contentArea, baselineGrid, floatGapPx,
      (c) => (anchorToCap ? c.bbox.y + c.bbox.height : trueBottom(c, uncappedBottoms)),
    );
    /** The float was cut to this slot (a table slice). */
    let cut = false;
    /** A rotated block wider than the band (its upright height). */
    const tooWide = (m: FloatMeasure): boolean => m.rotatedWidth !== undefined && m.rotatedWidth > width + 0.01;
    /** The columns of the slot that hold a page-span opener and nothing
     *  after it (#639), with the y of their head under the opener's band:
     *  there the band is taken from the flow under the opener — the column
     *  keeps its box, the opener stands in it — where an empty column's
     *  head moves down under the band. */
    const openerHeads = new Map<VDTColumn, number>();
    if (position === 'top' && mode === 'strict' && !pageSpan && !side) {
      for (const c of targetCols) {
        const top = late.openerHeadOf(c);
        if (top !== undefined) openerHeads.set(c, top);
      }
    }
    /** What such a column loses above the band: from the flow's position
     *  under the opener down to the grid line the band starts on. */
    const leadOf = (c: VDTColumn): number => {
      const top = openerHeads.get(c);
      return top === undefined ? 0 : Math.max(0, top - columnCursorY(c));
    };

    if (side) {
      // The side column's stack: the float goes under what the column holds
      // when the rest of the column takes it; otherwise it waits for the
      // side column of the next page — where it is set anyway, overflowing,
      // when even an empty column cannot hold it (a dominating figure).
      let cap: BodyCap | undefined;
      if (need > first.availableHeight + 0.01) {
        // A column that already holds something — a float, a box, or a
        // heading design standing in it — is no empty column to overflow.
        const holds = sideUsedBottom(first) > first.bbox.y + 0.5 || (sideObstacles.get(first)?.length ?? 0) > 0;
        // An empty column shortened by a band above it (a page-span box,
        // a top float) is no measure of the float: when a full column
        // would hold it, it waits for one instead of overflowing this one.
        const waitsForFull = shortSideColumn(page, first) && measure.height <= page.contentArea.height + 0.01;
        const lastResort = mode === 'fresh' && !holds && !waitsForFull;
        // A picture scaled to the room the column keeps (#626): any slot
        // with `'slot'`, when it holds it at its smallest scale or more;
        // the empty column it would overflow with `'page'` too, at its
        // smallest scale if need be.
        if (f.shrink === 'slot' || (f.shrink && lastResort)) {
          const s = shrinkToRoom(f, width, undefined, measure, first.availableHeight, false,
            (m) => measureSideStack(m, first, refY, page.contentArea, baselineGrid, floatGapPx, sideObstacles.get(first)));
          if (s && (s.fits || lastResort)) ({ measure, need, y, cap } = s);
        }
        if (need > first.availableHeight + 0.01) {
          if (!lastResort) return 'defer';
          // Overflowing a column a side caption has shortened: the next pass
          // sets that caption under its figure and gives the column back.
          const cutBy = asideCutBy.get(first);
          if (cutBy !== undefined) captionUnderProposals.add(cutBy);
        }
      }
      const built = buildFloatBlock(f.resourceId, xLeft, width, slice, rotated, false, undefined, false, cap);
      if (!built) return 'skip';
      first.availableHeight = Math.max(0, first.availableHeight - need);
      commitFloatBlock(page, first, built, xLeft, y, width, f.firstBlockIdx);
      noteOpenerFloat(page, f);
      if (state.drainingAfterText && !calloutFloatOf(f.resourceId)) {
        const citing = contentBlocks[f.firstBlockIdx];
        setAfterText.set(built.block, {
          resourceId: f.resourceId,
          ...(citing ? { sourceStart: citing.sourceStart + bodyOffset, sourceEnd: citing.sourceEnd + bodyOffset } : {}),
        });
      }
      state.floatsPlaced++;
      return 'placed';
    }

    /** A column of a closing band cut level (a trailing cap) that a band
     *  at its head takes to the cut, give or take a line: the cut was taken
     *  under this float (`proposeTrailingCap`: a figure heading an
     *  otherwise empty column keeps its slot), so no text comes under it
     *  and the room kept for text between two float bands has nothing to
     *  keep (#681). Asked for there, with another float at the page's
     *  foot, the float found no slot above its own cut: the cap was
     *  retried a line lower until three lines were left, which put that
     *  much ruled, empty column under the picture, or was dropped when
     *  the retries ran out. */
    const fillsCappedColumn = (c: VDTColumn, bandNeed: number): boolean =>
      position === 'top' && c.trailingCap === true && c.blocks.length === 0
      && bandNeed <= c.availableHeight + 0.01 && c.availableHeight - bandNeed <= baselineGrid + 0.01;

    /** Gallery page (see below): the band takes the columns' whole room. */
    let galleryFill = false;
    if (mode === 'fresh') {
      let minAvail = Infinity;
      let anyReserved = false;
      for (const c of targetCols) {
        minAvail = Math.min(minAvail, c.availableHeight);
        const r = reservedOf(c);
        if (r.top > 0 || r.bottom > 0) anyReserved = true;
      }
      if (need > minAvail - minTextPx && anyReserved) {
        // Gallery page: a float cited on an earlier page that arrives
        // under a floated box heading this page takes the rest of the
        // page — the compositor's box-plus-figure page — rather than
        // waiting for the next one and leaving a line or two stranded
        // between the bands. Only a float that fits whole.
        const gallery = need <= minAvail + 0.01
          && f.refPageIndex !== undefined && f.refPageIndex < page.index
          && calloutBandPages.has(page) && !calloutFloatOf(f.resourceId);
        if (gallery) {
          galleryFill = true;
        } else {
          // A picture that scales to any slot (#626) takes the room left
          // beside the other band, the text room kept, when it holds it
          // at its smallest scale or more.
          const s = f.shrink === 'slot' ? shrinkToRoom(f, width, aside, measure, minAvail - minTextPx, position === 'top', bandOf) : null;
          if (!s?.fits) return 'defer';
          ({ measure, need, y, cap } = s);
        }
      }
      // Dominating the band: a picture that scales (`'page'` or `'slot'`,
      // #626) takes the band's room, at its smallest scale if need be —
      // then it runs past the band, as any dominating float does.
      if (need > minAvail + 0.01 && f.shrink && !rotated) {
        const s = shrinkToRoom(f, width, aside, measure, minAvail, position === 'top', bandOf);
        if (s) ({ measure, need, y, cap } = s);
      }
      if (need > minAvail + 0.01 || tooWide(measure)) {
        // Dominating the band: a table is cut to it (a rotated table, to
        // the band's width).
        const split = splitTableFloat(f, width, position, targetCols, page.contentArea, minAvail, 'fresh', rotated);
        if (split === 'skip') return 'skip';
        if (split && split !== 'none') {
          slice = split.slice;
          rest = split.rest;
          cut = true;
          const m = measureFloat(f.resourceId, width, slice, rotated);
          if (!m) return 'skip';
          measure = m;
          ({ need, y } = measureFloatBand(
            position, measure, targetCols, page.contentArea, baselineGrid, floatGapPx,
            (c) => trueBottom(c, uncappedBottoms),
          ));
        }
      }
    } else {
      // A rotated block takes a page of its own: it never shares the
      // current page's foot, and waits for a fresh page to be cut to when
      // too wide.
      if (f.rotate || tooWide(measure)) return 'defer';
      // A picture that scales to any slot (#626) takes this one when it
      // holds it at its smallest scale or more (the text room kept next
      // to another band, as `fitsStrict` keeps it); the loop below checks
      // the band as for any float.
      if (f.shrink === 'slot' && measure.body && !rotated) {
        const room = Math.min(...targetCols.map((c) => c.availableHeight - leadOf(c) - (columnHasFloatBand(page, c) ? minTextPx : 0)));
        if (need > room + 0.01) {
          const s = shrinkToRoom(f, width, aside, measure, room, position === 'top', bandOf);
          if (!s?.fits) return 'defer';
          ({ measure, need, y, cap } = s);
        }
      }
      for (const c of targetCols) {
        if (position === 'bottom' && uncappedBottoms.has(c) && !anchorToCap) {
          // Trailing cap: the band must lie entirely below the level cut.
          if (y - floatGapAbove(measure, floatGapPx) < c.bbox.y + c.bbox.height - 0.01) return 'defer';
          continue;
        }
        const hasBand = columnHasFloatBand(page, c);
        if (fitsStrict(need + leadOf(c), c, hasBand, minTextPx)) continue;
        if (fillsCappedColumn(c, need + leadOf(c))) continue;
        // The head of an empty column: a splittable table is cut to the
        // column and continues in the next slot — the compositor sets a
        // long table beside the text that cites it, not pages later. A
        // table that clips or hides when too tall keeps to fresh pages.
        if (position !== 'top' || pageSpan || c.blocks.length > 0) return 'defer';
        if (tableOverflow(f.resourceId) !== 'split') return 'defer';
        const split = splitTableFloat(
          f, width, position, targetCols, page.contentArea,
          c.availableHeight - (hasBand ? minTextPx : 0), 'strict', rotated,
        );
        if (!split || split === 'none' || split === 'skip') return 'defer';
        slice = split.slice;
        rest = split.rest;
        cut = true;
        const m = measureFloat(f.resourceId, width, slice, rotated);
        if (!m) return 'skip';
        measure = m;
        ({ need, y } = measureFloatBand(
          position, measure, targetCols, page.contentArea, baselineGrid, floatGapPx,
          (cc) => trueBottom(cc, uncappedBottoms),
        ));
        if (!fitsStrict(need, c, hasBand, minTextPx)) return 'defer';
      }
    }

    // A slice cut to the head of a column takes the column whole when the
    // rows leave less than the text minimum under it: a line or two of
    // body text stranded under a table reads worse than an empty foot.
    if (cut && position === 'top') {
      const minAvail = Math.min(...targetCols.map((c) => c.availableHeight));
      if (minAvail - need < minTextPx) need = Math.max(need, minAvail);
    }
    // A page opened for a block that cannot split (an inline figure or
    // table, see `onAtomicNewPage`): a float takes its head or foot only
    // when the block still fits the column beside it; otherwise it waits
    // for the next page, as it did before the block took the flush.
    if (mode === 'fresh' && state.freshPageHold && targetCols.includes(state.freshPageHold.col)) {
      const after = galleryFill ? 0 : availableAfterBand(state.freshPageHold.col, position, { need, y, measure }, false);
      if (after < state.freshPageHold.px - FIT_EPS) return 'defer';
    }
    // The rest goes on after this slice in reading order, never before.
    if (rest) {
      rest = { ...rest, notBefore: { pageIndex: page.index, columnIndex: targetCols[targetCols.length - 1]!.index } };
    }

    // An upright figure of a vertical page stands at the head of its tier
    // (`placement.align`: `left` the top, `center`, `right` the foot).
    const flush = rotated?.upright ? (f.align === 'center' ? 0.5 : f.align === 'right' ? 1 : 0) : rotated ? rotatedFlushEnd(page) : false;
    const built = buildFloatBlock(f.resourceId, xLeft, width, slice, rotated, flush, aside, late.mirroredOf(page), cap);
    if (!built) return 'skip';
    // Under an opener in its own column the band starts at that column's
    // head, the grid line the heads beside it stand on.
    y = openerHeads.get(first) ?? y;

    // The caption beside the figure takes its band of the side column: a
    // top float's caption is consumed from the stack's head (when the
    // stack is still above it), a bottom float's cuts the column's foot.
    if (aside && sideCol && measure.asideHeight !== undefined) {
      const bandH = measure.asideHeight + floatGapPx;
      if (position === 'top') {
        const used = sideUsedBottom(sideCol);
        const bottom = y + (aside.offsetY ?? 0) + bandH;
        if (bottom > used) sideCol.availableHeight = Math.max(0, sideCol.availableHeight - (bottom - used));
      } else {
        const cut = Math.max(0, sideCol.bbox.y + sideCol.bbox.height - (y + built.height - measure.asideHeight - floatGapPx));
        sideCol.bbox.height = Math.max(0, sideCol.bbox.height - cut);
        sideCol.availableHeight = Math.max(0, sideCol.availableHeight - cut);
        if (cut > 0.5) asideCutBy.set(sideCol, f.resourceId);
      }
    }

    // Text wrap (#627): a one-column float at the head or foot of its
    // column, which running text may take back to run beside it — unless
    // the text left beside it would be too narrow, or the float too short
    // for lines beside it.
    const wrapGap = wrapGapPx(f.wrapGap, dpi, bodyStyle.fontSizePx, floatGapPx);
    const wraps = f.wrap !== undefined && !pageSpan && !side && targetCols.length === 1 && !rotated && !aside && !cut && !galleryFill
      && !(position === 'bottom' && uncappedBottoms.has(first));
    const wrapRefused = !wraps ? undefined
      : first.bbox.width - width - wrapGap + 0.01 < minTextWidthPx(resolved.layout.wrap.minTextWidth, first.bbox.width, dpi, bodyStyle.fontSizePx)
        ? 'tooNarrow' as const
        : Math.round(need / bodyStyle.lineHeightPx) < resolved.layout.wrap.minLinesBeside ? 'fewLines' as const : undefined;

    for (const col of targetCols) {
      if (openerHeads.has(col)) {
        // The band is taken from the flow under the opener: the column
        // keeps its box (a trailing cap measures the band from the opener's
        // top in every column) and records where the band ends, which is
        // where its rule starts (`columnRuleSegments`). A float text wraps
        // round records nothing: the text placed next takes its band back
        // (see below) and the rule runs beside both.
        col.availableHeight = Math.max(0, col.availableHeight - leadOf(col) - need);
        if (!(wraps && !wrapRefused)) col.headFloatFoot = columnCursorY(col);
        openerHeadFloats.set(col, columnCursorY(col));
        // What the opener left under it went into the band's gap.
        state.pendingSpacing = 0;
        state.inlineGapOwed = null;
        continue;
      }
      const r = { ...reservedOf(col) };
      if (position === 'top') {
        col.bbox.y += need;
        col.bbox.height = Math.max(0, col.bbox.height - need);
        col.availableHeight = Math.max(0, col.availableHeight - need);
        r.top += need;
        topFloatRefOf.set(col, Math.max(topFloatRefOf.get(col) ?? -1, f.firstBlockIdx));
      } else {
        const capped = uncappedBottoms.get(col);
        if (capped !== undefined && !anchorToCap) {
          uncappedBottoms.set(col, capped - need);
        } else {
          const newHeight = Math.max(0, y - floatGapAbove(measure, floatGapPx) - col.bbox.y);
          const reserved = col.bbox.height - newHeight;
          col.bbox.height = newHeight;
          col.availableHeight = Math.max(0, col.availableHeight - reserved);
          // Anchored to a cap: the band is the column's content down to
          // the cut; the true bottom shrinks by it too, so a span box
          // measuring its room never cuts across the figure.
          if (capped !== undefined) uncappedBottoms.set(col, capped - need);
        }
        r.bottom += need;
      }
      floatReserved.set(col, r);
    }

    // A gallery page keeps no text room between its bands.
    if (galleryFill) for (const col of targetCols) col.availableHeight = 0;

    if (wraps && f.wrap) {
      if (wrapRefused) {
        textWrapNotes.push({ kind: 'textWrap', reason: wrapRefused, resourceId: f.resourceId, pageIndex: page.index });
      } else {
        const exWidth = wrapExclusionWidth(first.bbox.width, width, wrapGap);
        const underOpener = openerHeads.has(first);
        const exY = underOpener ? y : position === 'top' ? first.bbox.y - need : first.bbox.y + first.bbox.height;
        const ex: VDTExclusion = {
          x: f.wrap === 'left' ? first.bbox.x : first.bbox.x + first.bbox.width - exWidth,
          y: exY,
          width: exWidth,
          height: need,
          side: f.wrap,
          gap: exWidth - width,
          ownerId: built.block.id,
        };
        // A contour wrap (#883): the picture's shape where its block is
        // set (`commitFloatBlock` puts it at `xLeft`, `y`).
        const fRes = f.contour ? resourceById.get(f.resourceId) : undefined;
        const fRb = built.block.resourceBlock;
        if (fRes && fRb) {
          const c = wrapContourOf(fRes, fRb, { x: xLeft, y, width, height: built.height }, wrapGap, page, { x: xLeft, y });
          if (c) ex.contour = c;
        }
        if (underOpener) {
          // The band was taken from the flow: the text placed next takes
          // it back and runs beside the float, as it does beside an inline
          // figure that wraps (`pendingWrap`).
          state.pendingWrap = { col: first, blocks: first.blocks.length, cursorY: columnCursorY(first), ex };
        } else {
          const list = floatWraps.get(first) ?? [];
          list.push({ position, need, ex });
          floatWraps.set(first, list);
        }
      }
    }

    commitFloatBlock(page, first, built, xLeft, y, width, f.firstBlockIdx);
    noteOpenerFloat(page, f);
    state.floatsPlaced++;
    return rest ? { rest } : 'placed';
  };

  /** Apply a slot outcome to the queue at `i`: drop a placed float, keep a
   *  deferred one, swap in the rest of a split table (offered the next slot
   *  right away, so a table cut to one column goes on in the column beside
   *  it). Returns the index to continue from. */
  const settle = (i: number, r: PlaceResult): number => {
    if (r === 'defer') return i + 1;
    if (typeof r === 'object') {
      pendingFloats[i] = r.rest;
      return i;
    }
    pendingFloats.splice(i, 1);
    return i;
  };

  /** Whether the pending float at `i` must wait: an earlier float of the
   *  same numbering sequence (resource type) is still pending. Figures and
   *  tables are numbered in first-reference order, and the reader must
   *  meet them in that order too — table 3 never lands after table 4, even
   *  when 4 would fit a slot 3 does not. Sequences do not hold each other
   *  up: a waiting table lets a later figure through. A float whose citing
   *  line is not placed yet waits too (see `citationGates`), and holds back
   *  its sequence. */
  const heldBack = (i: number): boolean => {
    if (awaitsCitation(pendingFloats[i]!)) return true;
    const typeId = resourceById.get(pendingFloats[i]!.resourceId)?.typeId;
    for (let j = 0; j < i; j++) {
      if (resourceById.get(pendingFloats[j]!.resourceId)?.typeId === typeId) return true;
    }
    return false;
  };

  /** A rotated float takes its page from the top. */
  const positionsFor = (f: PlannedFloat): FloatSlotPosition[] =>
    f.rotate ? ['top'] : f.position === 'auto' ? ['top', 'bottom'] : [f.position];
  return {
    placeFloatInColumns, settle, heldBack, positionsFor
  };
}
