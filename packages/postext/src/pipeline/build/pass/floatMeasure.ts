// Measuring floats: rotation, side captions, table slices, the float's block
// and the text wrap around it.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type VDTBlock, type VDTPage, type VDTColumn, type ResolvedResourceBlock, pageIsVertical, pageIsMirrored, createVDTBlock, createBoundingBox, type ContentWarning, type BoundingBox, type VDTExclusionContour, type VDTExclusion, type ResolvedConfig, type VDTDocument, type VDTFigureLabel } from '../../../vdt.js';
import type { CalloutLayoutResult, PlannedCallout } from '../../calloutLayout.js';
import type { ResolvedCalloutStyleConfig, CalloutSpan, ResourceRotation, Resource, ResourceType } from '../../../types.js';
import { type CalloutLayouter, CUT_START } from '../../frameLayout.js';
import { type ResolvedWrap, openColumnWrap, columnCursorY } from '../../textWrap.js';
import { floatColumnCount, type PlannedFloat } from '../../floatPlacement.js';
import { bandColumns, type PlacementCursor } from '../../placement.js';
import { type TableSliceSpec, type TableRowMetrics, layoutResourceBlock } from '../../resourceLayout.js';
import { flexFloatKey } from '../../columnBalancing.js';
import { pickTableStyle } from '../../../defaults/tableStyle.js';
import type { FloatMeasure, FloatSlotPosition, ColumnCapKind } from '../../floatSlots.js';
import { layOutFigureLabels } from '../../../composed/labels.js';
import { flowPageMirrored } from '../../buildHelpers.js';
import { dimensionToPx } from '../../../units.js';
import { contourOnPage } from '../../../contour/index.js';
import { bandTop, bareBandTop, type BandCap } from '../../bandCaps.js';
import type { MeasurementCache } from '../../../measure/index.js';
import type { CaptionCitations } from '../../citations.js';
import type { ResourceNumberingMap } from '../../resourceNumbering.js';
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockStyle } from '../../styles.js';
import type { ComicPageSource } from '../../../comics/types.js';
import type { StripGeometry, FloatRotation, CaptionAside, BodyCap } from './types.js';
import type { PassState } from './state.js';

/** What createFloatMeasure takes from the pass. */
export interface FloatMeasureDeps {
  cache: MeasurementCache | undefined;
  balanceExtraPx: ReadonlyMap<number, number> | undefined;
  bandCaps: ReadonlyMap<number, BandCap> | undefined;
  resolved: ResolvedConfig;
  dpi: number;
  baselineGrid: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  captionCitations: Map<string, CaptionCitations> | undefined;
  resources: Resource[];
  resourceTypes: ResourceType[];
  resourceNumbering: ResourceNumberingMap;
  resourceById: Map<string, Resource>;
  resourceTypeById: Map<string, ResourceType>;
  resourceNumberById: Map<string, string>;
  figureLabelsById: Map<string, { labels: VDTFigureLabel[]; parsed: NonNullable<ContentBlock["figure"]>["labels"]; }>;
  bodyStyle: BlockStyle;
  pendingFloats: PlannedFloat[];
  enqueuedFloatIds: Set<string>;
  enqueueFloatsFor: (blockIdx: number) => void;
  calloutFloats: Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; }>;
  CALLOUT_FLOAT_PREFIX: string;
  calloutFloatOf: (resourceId: string) => { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter; } | undefined;
  comicStripOf: (resourceId: string) => { idx: number; source: ComicPageSource; } | undefined;
  stripGeometry: (blockIdx: number, source: ComicPageSource, measure: number, max: number, vertical: boolean) => StripGeometry;
  buildComicStripBlock: (blockIdx: number, source: ComicPageSource, x: number, width: number, max: number, pageIndex: number, keep?: StripGeometry) => VDTBlock;
  cursor: PlacementCursor;
  uncappedBottoms: Map<VDTColumn, number>;
  state: PassState;
}

export function createFloatMeasure(deps: FloatMeasureDeps) {
  const {
    cache, balanceExtraPx, bandCaps, resolved, dpi, baselineGrid, doc, pageIndexOffset,
    captionCitations, resources, resourceTypes, resourceNumbering, resourceById, resourceTypeById,
    resourceNumberById, figureLabelsById, bodyStyle, pendingFloats, enqueuedFloatIds,
    enqueueFloatsFor, calloutFloats, CALLOUT_FLOAT_PREFIX, calloutFloatOf, comicStripOf,
    stripGeometry, buildComicStripBlock, cursor, uncappedBottoms, state
  } = deps;
  /** Boxes laid out for a band, waiting for the band's `y` (built in
   *  `buildFloatBlock`, committed in `commitFloatBlock`). */
  const calloutFloatResults = new Map<VDTBlock, { result: CalloutLayoutResult; startIdx: number; plan: PlannedCallout }>();
  /** Pages whose head or foot a floated box took (see the gallery rule in
   *  `placeFloatInColumns`). */
  const calloutBandPages = new Set<VDTPage>();
  const enqueueCalloutFloat = (
    startIdx: number,
    plan: PlannedCallout,
    style: ResolvedCalloutStyleConfig,
    L: CalloutLayouter,
    placement: 'auto' | 'top' | 'bottom',
    span: CalloutSpan,
    /** Text wraps round the box (#627): a one-column float at its side. */
    wrap?: ResolvedWrap,
  ): void => {
    const key = `${CALLOUT_FLOAT_PREFIX}${startIdx}`;
    const columns = plan.attrs.columns !== undefined ? floatColumnCount(plan.attrs.columns) : style.columns;
    // A keep-with-next replay passes the fence again: enqueue once.
    if (!enqueuedFloatIds.has(key)) {
      enqueuedFloatIds.add(key);
      calloutFloats.set(startIdx, { plan, style, L });
      const page = doc.pages[cursor.pageIndex];
      const col = page?.columns[cursor.columnIndex];
      pendingFloats.push({
        resourceId: key,
        firstBlockIdx: startIdx,
        position: placement,
        span: span === 'page' ? 'page' : 'column',
        ...(span === 'column' && columns > 1 ? { columns } : {}),
        callout: { startIdx },
        ...(wrap && span === 'column' && columns === 1
          ? { widthFraction: wrap.width, align: wrap.side, wrap: wrap.side, ...(wrap.gap ? { wrapGap: wrap.gap } : {}) }
          : {}),
        ...(col ? { refPageIndex: page!.index, refY: col.bbox.y + (col.bbox.height - col.availableHeight) } : {}),
      });
    }
    // Floats first referenced inside the box enqueue in reading order.
    for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
  };
  /** The measure of `n` adjacent text columns of `col`'s band from `col`
   *  on, gutters included (as many as the band has). */
  const acrossWidth = (page: VDTPage, col: VDTColumn, n: number): number => {
    if (n <= 1) return col.bbox.width;
    const run = bandColumns(page, col.band ?? 0).filter((c) => c.kind !== 'side' && c.kind !== 'span' && c.bbox.x >= col.bbox.x - 0.5).slice(0, n);
    const last = run[run.length - 1] ?? col;
    return last.bbox.x + last.bbox.width - col.bbox.x;
  };
  const floatGapPx = bodyStyle.lineHeightPx;
  const minTextPx = bodyStyle.lineHeightPx * 3;

  /** Offset a resolved resource block's caption/table geometry from
   *  block-relative to absolute page coordinates (mirrors inline placement). */
  const offsetResourceBlockToAbsolute = (
    rb: ResolvedResourceBlock,
    ox: number,
    oy: number,
  ): void => {
    // A rotated block keeps its geometry in the upright frame; only the
    // frame's origin moves on the page.
    if (rb.rotation) {
      rb.rotation.originX += ox;
      rb.rotation.originY += oy;
      return;
    }
    for (const ln of rb.captionLines) {
      ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy;
    }
    for (const ln of rb.noteLines) {
      ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy;
    }
    for (const ln of rb.continuesLines) {
      ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy;
    }
    if (rb.captionBar) { rb.captionBar.rect.x += ox; rb.captionBar.rect.y += oy; }
    if (rb.table) {
      for (const cell of rb.table.cells) {
        cell.rect.x += ox; cell.rect.y += oy;
        if (cell.image) { cell.image.rect.x += ox; cell.image.rect.y += oy; }
        for (const cl of cell.lines) { cl.bbox.x += ox; cl.bbox.y += oy; cl.baseline += oy; }
      }
    }
  };
  const rotationKey = (rotated: FloatRotation | undefined): string =>
    rotated ? `:${rotated.direction}${rotated.length.toFixed(2)}${rotated.upright ? 'u' : ''}` : '';
  const asideKey = (a?: CaptionAside): string => (a ? `:aside${a.dx.toFixed(1)}x${a.width.toFixed(1)}${a.alignBottom ? 'b' : 't'}${(a.offsetY ?? 0).toFixed(1)}` : '');
  const capKey = (cap?: BodyCap): string => (cap ? `:cap${cap.maxBodyHeight.toFixed(2)}@${cap.minScale}` : '');
  const layoutFloat = (
    resourceId: string,
    width: number,
    slice?: TableSliceSpec,
    rotated?: FloatRotation,
    aside?: CaptionAside,
    cap?: BodyCap,
  ): { block: ResolvedResourceBlock; totalHeight: number; tableRows?: TableRowMetrics; asideHeight?: number } | null => {
    const resource = resourceById.get(resourceId);
    if (!resource) return null;
    // Column balancing: a picture with a safe area grown by whole lines
    // (`flexFigure`, #442).
    const flexPx = balanceExtraPx?.get(flexFloatKey(resourceId)) ?? 0;
    return layoutResourceBlock({
      ...(cache ? { cache } : {}),
      resource,
      resourceType: resourceTypeById.get(resource.typeId),
      number: resourceNumberById.get(resourceId) ?? '',
      resolved,
      columnWidth: width,
      resourceNumbering,
      resourceTypes,
      resources,
      ...(captionCitations ? { captionCitations } : {}),
      ...(slice ? { slice } : {}),
      ...(rotated ? (rotated.upright ? { upright: { maxLength: rotated.length } } : { rotate: rotated.direction, rotatedLength: rotated.length }) : {}),
      ...(aside ? { captionAside: aside } : {}),
      ...(flexPx > 0 ? { bodyHeightDelta: flexPx } : {}),
      ...(cap && !rotated ? { maxBodyHeight: cap.maxBodyHeight, minBodyScale: cap.minScale } : {}),
    });
  };

  /** The rotation of a pending float on a band whose columns keep `avail`
   *  px: the upright frame is as long as the grid multiple within that
   *  room, less the float gap, so the band it takes is `avail` at most. */
  const rotationFor = (f: PlannedFloat, avail: number, page?: VDTPage): FloatRotation | undefined =>
    page && pageIsVertical(page)
      ? uprightOn(page)
      : f.rotate
        ? { direction: flowRotation(f.rotate, page), length: Math.max(1, Math.floor((avail + 0.01) / baselineGrid) * baselineGrid - floatGapPx) }
        : undefined;
  /** `placement.rotate` keeps its meaning on the sheet: `'ccw'` turns the
   *  picture's top to the sheet's left. A right-to-left page's flow is the
   *  sheet mirrored, where the same turn on the sheet is the opposite one,
   *  so the flow turns the block the other way (the renderers' frame and
   *  their counter-flip of the picture compose back to the asked turn). */
  const flowRotation = (rotate: ResourceRotation, page?: VDTPage): ResourceRotation =>
    page && pageIsMirrored(page) ? (rotate === 'ccw' ? 'cw' : 'ccw') : rotate;
  /** A resource on a vertical page stands upright: its frame at most as
   *  wide as the page's flow is tall (the content area's width on the
   *  sheet), the float gap kept. */
  const uprightOn = (page: VDTPage): FloatRotation => ({
    direction: 'ccw',
    length: Math.max(1, Math.floor((page.contentArea.height + 0.01) / baselineGrid) * baselineGrid - floatGapPx),
    upright: true,
  });

  /** Row count of a table resource (0 for anything else). */
  const tableRowCount = (resourceId: string): number =>
    resourceById.get(resourceId)?.table?.model.rows.length ?? 0;

  /** What a table resource does when taller than the page — its own
   *  (named) style's `overflow`. */
  const tableOverflow = (resourceId: string) =>
    pickTableStyle(resolved, resourceById.get(resourceId)?.table?.styleId).overflow;

  /** The slice a pending float stands for: the whole resource, or — for the
   *  rest of a split table — its remaining rows, laid out as the closing
   *  slice (no marker; the note). */
  const sliceOf = (f: PlannedFloat): TableSliceSpec | undefined =>
    f.startRow !== undefined && f.startRow > 0
      ? { startRow: f.startRow, endRow: tableRowCount(f.resourceId), continues: false }
      : undefined;

  const sliceKey = (slice: TableSliceSpec | undefined): string =>
    slice ? `:${slice.startRow}-${slice.endRow}${slice.continues ? '+' : ''}` : '';

  /** Row metrics of a table float laid out in full at a width, memoised. */
  const tableMetricsMemo = new Map<string, TableRowMetrics | null>();
  const tableMetrics = (resourceId: string, width: number, rotated?: FloatRotation): TableRowMetrics | null => {
    const key = `${resourceId}:${width.toFixed(2)}${rotationKey(rotated)}`;
    const memo = tableMetricsMemo.get(key);
    if (memo !== undefined) return memo;
    const m = layoutFloat(resourceId, width, undefined, rotated)?.tableRows ?? null;
    tableMetricsMemo.set(key, m);
    return m;
  };

  /** Height (and caption baseline) of a float at a given width, memoised —
   *  fit checks run for every pending float on every loop iteration. */
  const floatMeasureMemo = new Map<string, FloatMeasure | null>();
  const measureFloat = (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside, cap?: BodyCap): FloatMeasure | null => {
    const key = `${resourceId}:${width.toFixed(2)}${sliceKey(slice)}${rotationKey(rotated)}${asideKey(aside)}${capKey(cap)}`;
    const memo = floatMeasureMemo.get(key);
    if (memo !== undefined) return memo;
    const strip = comicStripOf(resourceId);
    if (strip) {
      // A strip: its height at the band's width (its caption's included),
      // never taller than a page keeps for a float band. A caption under
      // it is the last text line a bottom band aligns to the grid.
      const max = state.contentArea.height - 2 * floatGapPx;
      const g = stripGeometry(strip.idx, strip.source, width, max, pageIsVertical(doc.pages[cursor.pageIndex]!));
      const last = g.caption && !g.captionAbove ? g.caption.lines[g.caption.lines.length - 1] : undefined;
      const ms: FloatMeasure = {
        height: g.height,
        ...(last ? { lastCaptionBaseline: g.extent + g.caption!.gapPx + g.caption!.paddingPx + last.baseline } : {}),
      };
      floatMeasureMemo.set(key, ms);
      return ms;
    }
    const cf = calloutFloatOf(resourceId);
    if (cf) {
      // A floated box: its frame at the band's width, title and icon
      // included; no caption baseline to align. Its margins, when wider
      // than the float gap, are the space the band keeps next to it
      // (EF-144), as a box set in the side column keeps its `marginBottom`.
      const r = cf.L.layoutRange(CUT_START, cf.L.end, width, 'float-probe', false);
      const mc: FloatMeasure = {
        height: r.totalHeight,
        ...(r.marginBottomPx > floatGapPx ? { gapBelow: r.marginBottomPx } : {}),
        ...(r.marginTopPx > floatGapPx ? { gapAbove: r.marginTopPx } : {}),
      };
      floatMeasureMemo.set(key, mc);
      return mc;
    }
    const laid = layoutFloat(resourceId, width, slice, rotated, aside, cap);
    let m: FloatMeasure | null = null;
    if (laid && laid.block.rotation) {
      // A rotated block takes its band whole: no caption baseline to align,
      // and its upright height is what must fit the band's width.
      m = { height: laid.totalHeight, rotatedWidth: laid.block.rotation.height };
    } else if (laid) {
      // A bottom band aligns the float's LAST text line to the grid: the
      // caption's (or the note's) last line when it sits under the body. A
      // caption set above the body (caption bars) leaves the body's bottom
      // edge as the visual bottom instead.
      const rb = laid.block;
      const bodyBottom = rb.bodyRect.y + rb.bodyRect.height;
      let lastBaseline: number | undefined;
      for (const ln of [...rb.captionLines, ...rb.noteLines, ...rb.continuesLines]) {
        if (ln.bbox.y < bodyBottom - 0.5) continue;
        if (lastBaseline === undefined || ln.baseline > lastBaseline) lastBaseline = ln.baseline;
      }
      const picture = rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video';
      m = {
        height: laid.totalHeight,
        ...(lastBaseline !== undefined ? { lastCaptionBaseline: lastBaseline } : {}),
        ...(laid.asideHeight !== undefined ? { asideHeight: laid.asideHeight } : {}),
        ...(picture ? { body: { height: rb.bodyRect.height, scale: rb.shrinkScale ?? 1 } } : {}),
      };
    }
    floatMeasureMemo.set(key, m);
    return m;
  };

  /** Measure + build a float block at horizontal offset `x` (y = 0), or null
   *  when the resource id is unknown. Caller offsets it to its final `y`. */
  const buildFloatBlock = (
    resourceId: string,
    x: number,
    width: number,
    slice?: TableSliceSpec,
    rotated?: FloatRotation,
    /** A rotated block sits flush to the band's right edge (the spine of a
     *  verso page) instead of its left; a number is the share of the room
     *  left over set before it (an upright block of a vertical page, set
     *  per `placement.align` along its tier). */
    flushEnd: boolean | number = false,
    aside?: CaptionAside,
    /** The page is a verso of mirrored margins (a floated box's `'outer'`
     *  corner icon hangs on the left there). */
    mirrored = false,
    /** A picture scaled to its slot (`placement.shrink`). */
    cap?: BodyCap,
  ): { block: VDTBlock; height: number } | null => {
    const strip = comicStripOf(resourceId);
    if (strip) {
      const block = buildComicStripBlock(strip.idx, strip.source, x, width, state.contentArea.height - 2 * floatGapPx, cursor.pageIndex);
      return { block, height: block.bbox.height };
    }
    const cf = calloutFloatOf(resourceId);
    if (cf) {
      const startIdx = Number(resourceId.slice(CALLOUT_FLOAT_PREFIX.length));
      const result = cf.L.layoutRange(CUT_START, cf.L.end, width, `block-${state.blockIdCounter++}`, false, mirrored);
      calloutFloatResults.set(result.frame, { result, startIdx, plan: cf.plan });
      return { block: result.frame, height: result.totalHeight };
    }
    const laid = layoutFloat(resourceId, width, slice, rotated, aside, cap);
    if (!laid) return null;
    const { block: rb, totalHeight } = laid;
    const id = slice && slice.startRow > 0 ? `float-${resourceId}-cont-${slice.startRow}` : `float-${resourceId}`;
    const blk = createVDTBlock(id, 'resource', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
    // A floated figure's labels, laid out on its picture as set (#860).
    const figure = figureLabelsById.get(resourceId);
    const labels = figure
      ? layOutFigureLabels(figure.labels, figure.parsed, rb, { resolved, resourceNumbering, resourceTypes, resources, ...(cache ? { cache } : {}) })
      : undefined;
    blk.resourceBlock = labels ? { ...rb, labels } : rb;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.bbox = createBoundingBox(x, 0, width, totalHeight);
    if ((rb.bodyFlex?.delta ?? 0) > 0.01 && balanceExtraPx?.has(flexFloatKey(resourceId))) {
      blk.balancing = { levers: ['flexFigure'], spaceAbove: 0, bodyGrowth: rb.bodyFlex!.delta };
    }
    blk.lines = [];
    if (rb.rotation) {
      // The upright frame's origin: for a counter-clockwise turn the frame's
      // top-left lands at the bottom-left of the block, for a clockwise one
      // at its top-right (see `resourceBlockToPage`).
      const used = Math.min(rb.rotation.height, width);
      const share = typeof flushEnd === 'number' ? flushEnd : flushEnd ? 1 : 0;
      const left = x + (share > 0 ? Math.max(0, width - used) * share : 0);
      rb.rotation.originX = rb.rotation.direction === 'ccw' ? left : left + used;
      rb.rotation.originY = rb.rotation.direction === 'ccw' ? totalHeight : 0;
    } else {
      offsetResourceBlockToAbsolute(rb, x, 0);
    }
    return { block: blk, height: totalHeight };
  };

  /** Whether a rotated float on `page` sits flush to the band's right edge:
   *  with mirrored margins the spine of a page whose spine is on its right
   *  (a verso of a left-bound book, a recto of a right-bound one). */
  const rotatedFlushEnd = (page: VDTPage): boolean => flowPageMirrored(resolved, page, pageIndexOffset);

  /** Float bands reserved per column in this pass (the fresh-page flush
   *  sends single-column floats to the least reserved column). */
  const floatReserved = new Map<VDTColumn, { top: number; bottom: number }>();
  /** Pages a `:::pagebreak{center}` opened (#424). */
  const centredPages = new Set<number>();
  const reservedOf = (col: VDTColumn): { top: number; bottom: number } =>
    floatReserved.get(col) ?? { top: 0, bottom: 0 };
  /** Text wrap (#627): floats set in a band at the head or foot of one
   *  column that text may run beside, per column. The band stays a band
   *  until running text comes to take it back (`openFloatWraps`). */
  /** The room a wrapped item takes from the lines beside it (#627): its
   *  width and gap, in whole characters of the body under a CJK character
   *  grid (`cjk.grid`), so the lines beside it keep to the grid. */
  const wrapExclusionWidth = (columnWidth: number, itemWidth: number, gap: number): number => {
    const w = itemWidth + gap;
    const em = bodyStyle.fontSizePx;
    return Math.min(columnWidth, resolved.cjk.grid.enabled && em > 0 ? Math.ceil((w - 0.01) / em) * em : w);
  };
  /** The `textWrap` warnings of this pass (#627). */
  const textWrapNotes: ContentWarning[] = [];
  /** `resourceMoved` (#1151): resources set in the text that moved on and
   *  left their column's foot empty. */
  const movedNotes: ContentWarning[] = [];
  /** Resources whose contour wrap fell back to the box this pass (#883):
   *  said once each. */
  const contourFallbacks = new Set<string>();
  /** The shape a contour wrap (#883) of `resource`, set as `rb` in the
   *  figure `box`, runs round on `page`: its polygon or traced alpha
   *  channel through the picture's crop and scale, the contour's margin
   *  round it (else the wrap's gap), its insets in whole body characters
   *  under a CJK grid; `rb.bodyRect` is relative to `origin`, `box` is in
   *  page px. `undefined` (and a `noContour` note) when the shape is not
   *  known: the text runs round the box. */
  const wrapContourOf = (
    resource: Resource,
    rb: ResolvedResourceBlock,
    box: BoundingBox,
    gapPx: number,
    page: VDTPage,
    origin: { x: number; y: number },
    source?: { sourceStart: number; sourceEnd: number },
  ): VDTExclusionContour | undefined => {
    const own = resource.contour?.margin;
    const margin = own ? Math.max(0, dimensionToPx(own, dpi, bodyStyle.fontSizePx)) : gapPx;
    const quantum = resolved.cjk.grid.enabled && bodyStyle.fontSizePx > 0 ? bodyStyle.fontSizePx : undefined;
    const c = contourOnPage(resource, rb, box, { margin, mirrored: pageIsMirrored(page), originX: origin.x, originY: origin.y, ...(quantum ? { quantum } : {}) });
    if (c) return c;
    if (!contourFallbacks.has(resource.id)) {
      contourFallbacks.add(resource.id);
      textWrapNotes.push({ kind: 'textWrap', reason: 'noContour', resourceId: resource.id, ...(source ?? {}), pageIndex: page.index });
    }
    return undefined;
  };
  const floatWraps = new Map<VDTColumn, { position: FloatSlotPosition; need: number; ex: VDTExclusion }[]>();
  /** Give the bands of the wrapped floats of `col` back to the flow, as
   *  exclusions the text runs beside: a float at the head of a column the
   *  text has not entered yet, one at its foot the text has not reached. */
  const openFloatWraps = (col: VDTColumn): void => {
    const list = floatWraps.get(col);
    if (!list) return;
    floatWraps.delete(col);
    for (const w of list) {
      const r = { ...reservedOf(col) };
      if (w.position === 'top') {
        // A block already stands under it, or another band between: it
        // keeps its band.
        if (col.blocks.length > 0 || Math.abs(w.ex.y + w.need - col.bbox.y) > 0.5) continue;
        col.bbox.y -= w.need;
        col.bbox.height += w.need;
        col.availableHeight += w.need;
        r.top = Math.max(0, r.top - w.need);
        openColumnWrap(col, w.ex, 'top');
      } else {
        if (uncappedBottoms.has(col) || Math.abs(col.bbox.y + col.bbox.height - w.ex.y) > 0.5 || columnCursorY(col) > w.ex.y + 0.01) continue;
        col.bbox.height += w.need;
        col.availableHeight += w.need;
        r.bottom = Math.max(0, r.bottom - w.need);
        openColumnWrap(col, w.ex, 'bottom');
      }
      floatReserved.set(col, r);
    }
  };
  const floatHeadOf = (col: VDTColumn): number => reservedOf(col).top;
  /** Where a cap proposed on `cols` was measured: `BandCap.at` (the page
   *  and the band's top) and `BandCap.headPx` (how far the float bands every
   *  column holds at its head put the band's top below its bare one). */
  const capOrigin = (cols: readonly VDTColumn[]): { at: string; headPx?: number } => {
    const head = bandTop(cols) - bareBandTop(cols, floatHeadOf);
    const at = `${cursor.pageIndex}:${Math.round(bandTop(cols))}`;
    return head > 0.5 ? { at, headPx: head } : { at };
  };
  /** Content index of the block that first referenced the latest float
   *  reserved at the head of each column. */
  const topFloatRefOf = new Map<VDTColumn, number>();

  /** Kind of cap the column is under (`undefined` when uncapped). A cap that
   *  cannot be attributed to the active band is treated as a span cap — the
   *  conservative reading, which keeps the column's bottom off the slot list. */
  const capKindOf = (col: VDTColumn): ColumnCapKind => {
    if (!uncappedBottoms.has(col)) return undefined;
    if (state.activeCap && bandCaps && state.activeCap.pageIndex === cursor.pageIndex && state.activeCap.band === (col.band ?? 0)) {
      return bandCaps.get(state.activeCap.spanIndex)?.kind ?? 'span';
    }
    return 'span';
  };
  return {
    calloutFloatResults, calloutBandPages, enqueueCalloutFloat, acrossWidth, floatGapPx, minTextPx,
    offsetResourceBlockToAbsolute, layoutFloat, rotationFor, uprightOn, tableRowCount, tableOverflow,
    sliceOf, tableMetrics, measureFloat, buildFloatBlock, rotatedFlushEnd, floatReserved,
    centredPages, reservedOf, wrapExclusionWidth, textWrapNotes, movedNotes, wrapContourOf,
    floatWraps, openFloatWraps, floatHeadOf, capOrigin, topFloatRefOf, capKindOf
  };
}
