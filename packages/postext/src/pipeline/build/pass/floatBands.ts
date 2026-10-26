// Where a float fits: table floats split across pages, the probe of a band
// for a float, committing the block and shrinking it to the room left.
// Part of the placement pass (pass.ts), split out of it in #1276.
import type { PlannedFloat } from '../../floats/floatPlacement.js';
import { type FloatSlotPosition, measureFloatBand, trueBottom, type SideObstacle, type FloatMeasure, measureSideStack, floatGapAbove, floatGapBelow } from '../../floats/floatSlots.js';
import { type VDTColumn, type BoundingBox, type VDTBlock, type VDTPage, pageIsVertical, createBoundingBox, type VDTDocument, type ResolvedResourceBlock } from '../../../vdt.js';
import { type TableSliceSpec, chooseTableSlice, type TableRowMetrics } from '../../resources/resourceLayout.js';
import { sideColumnOf, sideUsedBottom } from '../../blocks/placement.js';
import { offsetCalloutToAbsolute, type CalloutLayoutResult, type PlannedCallout } from '../../callouts/calloutLayout.js';
import { DEFAULT_FLOAT_MIN_SCALE } from '../../../defaults/layout.js';
import type { FloatRotation, CaptionAside, BodyCap } from './types.js';
import type { TableOverflow } from '../../../types/resources/tableStyles.js';
import type { PassState, PassLate } from './state.js';

/** What createFloatBands takes from the pass. */
export interface FloatBandsDeps {
  captionUnder: ReadonlySet<string> | undefined;
  baselineGrid: number;
  doc: VDTDocument;
  shiftStripLines: (blk: VDTBlock, dx: number, dy: number) => void;
  calloutFloatResults: Map<VDTBlock, { result: CalloutLayoutResult; startIdx: number; plan: PlannedCallout; }>;
  calloutBandPages: Set<VDTPage>;
  floatGapPx: number;
  offsetResourceBlockToAbsolute: (rb: ResolvedResourceBlock, ox: number, oy: number) => void;
  layoutFloat: (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap) => { block: ResolvedResourceBlock; totalHeight: number; tableRows?: TableRowMetrics; asideHeight?: number; } | null;
  rotationFor: (f: PlannedFloat, avail: number, page?: VDTPage) => FloatRotation | undefined;
  tableRowCount: (resourceId: string) => number;
  tableOverflow: (resourceId: string) => TableOverflow;
  sliceOf: (f: PlannedFloat) => TableSliceSpec | undefined;
  tableMetrics: (resourceId: string, width: number, rotated?: FloatRotation) => TableRowMetrics | null;
  measureFloat: (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap) => FloatMeasure | null;
  uncappedBottoms: Map<VDTColumn, number>;
  state: PassState;
  late: PassLate;
}

export function createFloatBands(deps: FloatBandsDeps) {
  const {
    captionUnder, baselineGrid, doc, shiftStripLines, calloutFloatResults, calloutBandPages,
    floatGapPx, offsetResourceBlockToAbsolute, layoutFloat, rotationFor, tableRowCount,
    tableOverflow, sliceOf, tableMetrics, measureFloat, uncappedBottoms, state, late
  } = deps;
  /** Floats (or slices) placed so far — the progress signal of the drain
   *  loop, which a split does not shorten the queue for. */
  state.floatsPlaced = 0;

  /**
   * The slice of a table float that fits a fresh band of `avail` px, when
   * the whole (rest of the) table does not: the leading rows within the
   * band, cut where `planTableSlice` allows, verified against the band
   * geometry and shrunk row by row until it fits. The table style's `overflow`
   * decides what becomes of the rows left over — a rest float to continue
   * on the next page (`'split'`), nothing (`'clip'`) — or, for `'hide'`,
   * that the table is dropped. Returns null for a figure or a table with
   * nothing to cut, which are force-placed like before. In the `'strict'`
   * (current-page) mode nothing is forced: `'none'` when not even the
   * smallest slice fits the slot.
   */
  const splitTableFloat = (
    f: PlannedFloat,
    width: number,
    position: FloatSlotPosition,
    targetCols: readonly VDTColumn[],
    contentArea: BoundingBox,
    avail: number,
    mode: 'fresh' | 'strict',
    rotated?: FloatRotation,
  ): { slice: TableSliceSpec; rest?: PlannedFloat } | 'skip' | 'none' | null => {
    const rowCount = tableRowCount(f.resourceId);
    if (rowCount === 0) return null;
    const overflow = tableOverflow(f.resourceId);
    if (overflow === 'hide') return 'skip';
    const metrics = tableMetrics(f.resourceId, width, rotated);
    if (!metrics) return null;
    const startRow = f.startRow ?? 0;
    const firstBody = startRow > 0 ? Math.max(startRow, metrics.headerRowCount) : metrics.headerRowCount;
    if (firstBody >= rowCount) return null;
    // Overhead of a continuing slice at this width — caption, gaps, marker —
    // from a one-row probe; the row heights come from the metrics.
    const probe = layoutFloat(f.resourceId, width, { startRow, endRow: firstBody + 1, continues: true }, rotated);
    if (!probe) return null;
    // A rotated table's rows run across the page: the room for them is
    // the band's width, less the upright overhead.
    const overhead = (probe.block.rotation ? probe.block.rotation.height : probe.totalHeight) - probe.block.bodyRect.height;
    // A top band rounds up to the grid: the tallest float it holds within
    // `avail` is the grid multiple below it, less the gap.
    const hMax = Math.floor((avail + 0.01) / baselineGrid) * baselineGrid - floatGapPx;
    const fits = (slice: TableSliceSpec): boolean => {
      const measure = measureFloat(f.resourceId, width, slice, rotated);
      if (!measure) return true;
      if (rotated) return (measure.rotatedWidth ?? 0) <= width + 0.01;
      const { need } = measureFloatBand(
        position, measure, targetCols, contentArea, baselineGrid, floatGapPx,
        (c) => trueBottom(c, uncappedBottoms),
      );
      return need <= avail + 0.01;
    };
    // Nothing fits: a fresh page carries the smallest slice anyway (it
    // overflows, as a dominating figure would) rather than stall the
    // queue; a slot of the current page is simply not this table's.
    const slice = chooseTableSlice(metrics, startRow, (rotated ? width : hMax) - overhead, {
      floor: firstBody + 1,
      force: mode === 'fresh',
      split: overflow === 'split',
      fits,
    });
    if (!slice) return 'none';
    const end = slice.endRow;
    const rest: PlannedFloat | undefined = slice.continues ? { ...f, startRow: end } : undefined;
    return rest ? { slice, rest } : { slice };
  };

  /** The heading-design elements standing in each float-only side column
   *  (EF-78), with the heading block whose design paints them: the side
   *  stack sets its figures, tables and boxes clear of them
   *  (`clearSideObstacles`), above them when they fit there. Recorded by
   *  `markSideObstacles`, dropped when their heading is rolled back. */
  const sideObstacles = new WeakMap<VDTColumn, Array<SideObstacle & { owner: VDTBlock }>>();

  /**
   * Reserve a float band on `targetCols` (one column, or every text column
   * of the band for a page-span float) and position the float there.
   * `'fresh'` is the freshly-opened-page rule: keep three lines of text room
   * once a band already holds a float, but force-place a dominating float
   * on an all-text band so the queue always progresses — a table is cut to
   * the band instead and continues on the next page (see
   * {@link splitTableFloat}). `'strict'` is the current-page rule: the band
   * must fit in each column's remaining height (below its content), keeping
   * the text room only next to another band. Only mutates page geometry
   * when it places.
   */
  /** The band a float would take in a slot — its height (`need`) and the
   *  float's `y` — without reserving it. `null` when the float cannot be
   *  measured. */
  const probeFloatBand = (
    page: VDTPage,
    f: PlannedFloat,
    targetCols: readonly VDTColumn[],
    position: FloatSlotPosition,
    pageSpan: boolean,
    anchorToCap: boolean,
    side = false,
    refY?: number,
  ): { need: number; y: number; measure: FloatMeasure; slice: TableSliceSpec | undefined; width: number; xLeft: number; rotated: FloatRotation | undefined; aside?: CaptionAside; sideCol?: VDTColumn } | null => {
    const first = targetCols[0]!;
    const last = targetCols[targetCols.length - 1]!;
    // A float across several columns takes their measure, gutters included.
    const slotWidth = pageSpan ? page.contentArea.width : side ? first.bbox.width : last.bbox.x + last.bbox.width - first.bbox.x;
    const slotX = pageSpan ? page.contentArea.x : first.bbox.x;
    // A narrower float (`placement.width`) sits in its slot per `align`.
    const width = f.widthFraction && f.widthFraction < 1 ? slotWidth * f.widthFraction : slotWidth;
    const alignK = f.align === 'center' ? 0.5 : f.align === 'right' ? 1 : 0;
    const xLeft = slotX + (slotWidth - width) * alignK;
    const slice = sliceOf(f);
    // A side float never turns: it stacks upright in the side column (on a
    // vertical page it is counter-rotated to stand upright there too).
    const rotated = side && !pageIsVertical(page) ? undefined : rotationFor(f, Math.min(...targetCols.map((c) => c.availableHeight)), page);
    // The caption beside the figure, in the band's side column.
    let aside: CaptionAside | undefined;
    let sideCol: VDTColumn | undefined;
    if (f.captionSide && !pageSpan && !side && !rotated && targetCols.length === 1 && !captionUnder?.has(f.resourceId)) {
      const sc = sideColumnOf(page, first.band ?? 0);
      if (sc && sc.bbox.width > 0.5) {
        sideCol = sc;
        aside = { dx: sc.bbox.x - xLeft, width: sc.bbox.width, alignBottom: position === 'bottom' };
      }
    }
    const measure = measureFloat(f.resourceId, width, slice, rotated, aside);
    if (!measure) return null;
    // A side float stacks in the side column beside the citing text.
    if (side) {
      const { need, y } = measureSideStack(measure, first, refY, page.contentArea, baselineGrid, floatGapPx, sideObstacles.get(first));
      return { need, y, measure, slice, width, xLeft, rotated };
    }
    // A bottom band normally anchors to the column's true foot (under a
    // trailing cap, the page bottom — the closing-page figure). Before a
    // page-span box the cap IS the band's foot: the figure hugs the text
    // and the box follows both.
    const bottomOf = (c: VDTColumn): number =>
      anchorToCap ? c.bbox.y + c.bbox.height : trueBottom(c, uncappedBottoms);
    let { need, y } = measureFloatBand(
      position, measure, targetCols, page.contentArea, baselineGrid, floatGapPx, bottomOf,
    );
    // A caption level with a top float's head would overlap what the side
    // column already holds: it drops under the stack instead.
    if (aside && sideCol && position === 'top' && !aside.alignBottom) {
      const used = sideUsedBottom(sideCol);
      if (used > y + 0.5) {
        const shifted: CaptionAside = { ...aside, offsetY: used - y };
        const m2 = measureFloat(f.resourceId, width, slice, rotated, shifted);
        if (m2) {
          aside = shifted;
          ({ need, y } = measureFloatBand(position, m2, targetCols, page.contentArea, baselineGrid, floatGapPx, bottomOf));
          return { need, y, measure: m2, slice, width, xLeft, rotated, aside, sideCol };
        }
      }
    }
    // A bottom float's caption cuts the side column's foot; when the side
    // stack already reaches into that band (a box set beside the text
    // above), or a heading design stands there, the caption goes under the
    // figure instead of behind the box.
    if (aside && sideCol && position === 'bottom' && measure.asideHeight !== undefined) {
      const captionTop = y + measure.height - measure.asideHeight - floatGapPx;
      const standsInBand = (sideObstacles.get(sideCol) ?? []).some((o) => o.bottom > captionTop + 0.5);
      if (sideUsedBottom(sideCol) > captionTop + 0.5 || standsInBand) {
        const plain = measureFloat(f.resourceId, width, slice, rotated);
        if (plain) {
          ({ need, y } = measureFloatBand(position, plain, targetCols, page.contentArea, baselineGrid, floatGapPx, bottomOf));
          return { need, y, measure: plain, slice, width, xLeft, rotated };
        }
      }
    }
    return { need, y, measure, slice, width, xLeft, rotated, ...(aside ? { aside, sideCol } : {}) };
  };

  /** Free height `col` keeps for the flow once a float band `probe` is
   *  reserved in it at `position` (mirrors the reservation arithmetic of
   *  `placeFloatInColumns`; a capped column absorbs a bottom band in its
   *  remembered true bottom, so its free height does not change). */
  const availableAfterBand = (
    col: VDTColumn,
    position: FloatSlotPosition,
    probe: { need: number; y: number; measure: FloatMeasure },
    anchorToCap: boolean,
  ): number => {
    if (position === 'top') return Math.max(0, col.availableHeight - probe.need);
    if (uncappedBottoms.has(col) && !anchorToCap) return col.availableHeight;
    const newHeight = Math.max(0, probe.y - floatGapAbove(probe.measure, floatGapPx) - col.bbox.y);
    return Math.max(0, col.availableHeight - (col.bbox.height - newHeight));
  };

  /** Set a built float at its band position and hand it to the page: a
   *  resource block into `page.floats`, with the content index of the block
   *  that first cites or embeds it (`anchorIdx`, where a tagged PDF reads
   *  it); a floated box's frame and children into `page.floats` and
   *  `doc.blocks`, the way a fixed box goes. */
  const commitFloatBlock = (
    page: VDTPage,
    col: VDTColumn,
    built: { block: VDTBlock; height: number },
    x: number,
    y: number,
    width: number,
    anchorIdx: number,
  ): void => {
    const cf = calloutFloatResults.get(built.block);
    if (cf) {
      calloutFloatResults.delete(built.block);
      const { result, startIdx, plan } = cf;
      const frame = result.frame;
      late.stampCalloutSource(frame, startIdx, plan);
      frame.pageIndex = page.index;
      frame.columnIndex = col.index;
      offsetCalloutToAbsolute(result, x, y);
      const floats = (page.floats ??= []);
      doc.blocks.push(frame);
      floats.push(frame);
      for (const child of result.children) {
        child.pageIndex = frame.pageIndex;
        child.columnIndex = frame.columnIndex;
        doc.blocks.push(child);
        floats.push(child);
      }
      calloutBandPages.add(page);
      return;
    }
    // (A strip's comic is relative to its block; its caption lines are
    // relative to it until now.)
    if (built.block.resourceBlock) offsetResourceBlockToAbsolute(built.block.resourceBlock, 0, y);
    else if (built.block.comic) shiftStripLines(built.block, x, y);
    built.block.bbox = createBoundingBox(x, y, width, built.height);
    built.block.pageIndex = page.index;
    built.block.columnIndex = col.index;
    built.block.contentIndex = anchorIdx;
    (page.floats ??= []).push(built.block);
  };

  /**
   * A picture float scaled to `room` px of a slot instead of moving on
   * (`placement.shrink`, #626): the tallest body that keeps its band
   * within the room. A top band rounds up to the grid, so the float may
   * stand as tall as the grid multiple within the room, less its gap; a
   * bottom band (its caption's last baseline on the grid) and a side
   * stack give the room back px for px. The caption's height may change
   * with the picture's width (`captionMeasure: 'body'`) and a safe area
   * crops before it scales, so the cap is refined over a few rounds. The
   * scale never goes below the float's `minScale`; `fits` is false when
   * even that does not hold the room. Null for a float that does not
   * scale (no `shrink`, not an upright picture, the rest of a table) or
   * already fits.
   */
  const shrinkToRoom = (
    f: PlannedFloat,
    width: number,
    aside: CaptionAside | undefined,
    full: FloatMeasure,
    room: number,
    topBand: boolean,
    bandOf: (m: FloatMeasure) => { need: number; y: number },
  ): { measure: FloatMeasure; need: number; y: number; cap: BodyCap; fits: boolean } | null => {
    if (!f.shrink || !full.body || f.rotate || f.startRow) return null;
    const minScale = f.minScale ?? DEFAULT_FLOAT_MIN_SCALE;
    const excessOf = (m: FloatMeasure, band: { need: number }): number => topBand
      ? m.height + floatGapBelow(m, floatGapPx) - Math.floor((room + 0.01) / baselineGrid) * baselineGrid
      : band.need - room;
    let measure = full;
    let band = bandOf(full);
    let cap: BodyCap | undefined;
    for (let round = 0; round < 4; round++) {
      const excess = excessOf(measure, band);
      if (excess <= 0.01) break;
      const next: BodyCap = { maxBodyHeight: Math.max(0, measure.body!.height - excess), minScale };
      if (cap && next.maxBodyHeight >= cap.maxBodyHeight - 0.01) break;
      cap = next;
      const m = measureFloat(f.resourceId, width, undefined, undefined, aside, cap);
      if (!m?.body) return null;
      measure = m;
      band = bandOf(m);
      if (m.body.scale <= minScale + 1e-6) break;
    }
    if (!cap) return null;
    return { measure, ...band, cap, fits: excessOf(measure, band) <= 0.01 };
  };
  return {
    splitTableFloat, sideObstacles, probeFloatBand, availableAfterBand, commitFloatBlock,
    shrinkToRoom
  };
}
