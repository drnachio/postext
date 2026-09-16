import { applyTitleBreaks } from '../parse/inlineFormatting';
import type { PostextContent, PostextConfig, Resource, ResourceType, HeadingBreakParity, ResolvedCalloutStyleConfig } from '../types';
import type { ContentBlock, ListKind } from '../parse';
import { dimensionToPx } from '../units';
import {
  createVDTDocument,
  createVDTBlock,
  createBoundingBox,
  type VDTDocument,
  type VDTBlock,
  type VDTColumn,
  type VDTPage,
  type BoundingBox,
  type ResolvedResourceBlock,
} from '../vdt';
import { anchorBox } from '../design/layout';
import { parseMarkdownMemo } from '../parse';
import {
  buildPageLabels,
  computeHeadingNumbers,
  type HeadingTemplates,
  type NumeralStyle,
  type PageNumberSegment,
} from '../numbering';
import { extractFrontmatter } from '../frontmatter';
import { initHyphenator } from '../measure';
import type { MeasurementCache } from '../measure';
import { resolveAllConfig, computeBaselineGrid, buildHeadingLevelMap } from './config';
import { resolveBodyStyle, resolveBlockquoteStyle, type BlockStyle } from './styles';
import {
  computeLevelIndentsPx,
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
} from './lists';
import type { PlacementCursor } from './placement';
import {
  resetLinePositions,
  createPageWithColumns,
  currentColumn,
  advanceToNextColumn,
  advanceToNextPageBoundary,
  enforcePageParity,
  placeBlockInColumn,
  placeAtomicBlock,
  createPartPage,
  pageHasContent,
  pageIsOccupied,
  bandColumns,
  currentBand,
  isBandLevel,
  bandUsedBottom,
  closeBandAndInsertSpan,
} from './placement';
import { chooseParagraphSplit } from './orphanWidow';
import {
  applyStyleAttrs,
  computePageMetrics,
  isMarkerBlock,
  nextNonMarkerBlock,
  prevNonMarkerBlock,
  rollbackTrailingBlocks,
} from './buildHelpers';
import { measureContentBlock, type BlockMeasureContext, type MeasuredContentBlock } from './measureContentBlock';
import { planParagraphContainers } from './paragraphContainers';
import { planParts, derivePartMeasureContext } from './parts';
import {
  layoutCallout,
  offsetCalloutToAbsolute,
  pickCalloutStyle,
  planCallouts,
  resolveCalloutAttrs,
  type CalloutLayoutResult,
  type PlannedCallout,
} from './calloutLayout';
import { layoutResourceBlock, planTableSlice, type TableRowMetrics, type TableSliceSpec } from './resourceLayout';
import {
  computeFloatPlan,
  floatedResourceIds,
  type PlannedFloat,
} from './floatPlacement';
import {
  enumerateCurrentPageSlots,
  measureFloatBand,
  columnHasFloatBand,
  fitsStrict,
  trueBottom,
  type ColumnCapKind,
  type FloatMeasure,
  type FloatSlot,
  type FloatSlotPosition,
} from './floatSlots';
import {
  computeHeadingContext,
  computeResourceNumbering,
  type ResourceNumberingMap,
} from './resourceNumbering';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { buildHeadersAndFooters, measureHeadingAdvancedDesignHeight } from './headerFooter';
import { totalGapLines, proposeBalanceLines, collectColumnGaps, firstDivergentColumn, type LooseBudget, MAX_BALANCING_PASSES, type BalanceState, type BalanceProposal, balanceKey } from './columnBalancing';
import {
  applyBandCap,
  uncapBand,
  columnBottom,
  bandCapLines,
  bandTop,
  resolveBandCaps,
  resolveTrailingCaps,
  type BandCap,
  type BandPassReport,
  bandCapLinesAroundZone,
  type BandCapZone,
} from './bandCaps';
import { raggedLooseLines } from './raggedLines';

/** Tolerance for "does this block fit" checks against a column's free
 *  height, absorbing floating-point drift between grid multiples. */
const FIT_EPS = 0.01;

export interface BuildDocumentOptions {
  /**
   * Cooperative cancellation hook. Called once per top-level content block
   * during placement. Throw (or return a truthy value checked by the caller)
   * to abort. Intended for running `buildDocument` inside a Web Worker where
   * a newer request has superseded this one.
   */
  shouldCancel?: () => boolean;
  /**
   * Progress hook, called as placement advances: once per top-level content
   * block of every pass (the engine re-places the document several times —
   * band caps, column balancing — so `pass` counts up and the block counter
   * restarts). A long build can show a bar from it.
   */
  onProgress?: (progress: BuildProgress) => void;
}

export interface BuildProgress {
  /** 1-based placement pass. */
  pass: number;
  /** Top-level content blocks placed so far in this pass, and how many
   *  there are in the document. */
  blocks: number;
  totalBlocks: number;
  /** Pages opened so far in this pass. */
  pages: number;
}

export class BuildCancelledError extends Error {
  constructor() {
    super('Build cancelled');
    this.name = 'BuildCancelledError';
  }
}

/** Page-number formats accepted by the `::numbering` directive. */
const ALLOWED_PAGE_FORMATS: ReadonlySet<NumeralStyle> = new Set<NumeralStyle>([
  'decimal',
  'lower-roman',
  'upper-roman',
  'lower-alpha',
  'upper-alpha',
]);

/** Cross-pass hints a placement pass consumes. All keyed by content-block
 *  index; every map is optional so the plain first pass carries none. */
export interface PassHints {
  /** Column balancing: extra top spacing (px) per heading / list-end target. */
  balanceExtraPx?: ReadonlyMap<number, number>;
  /** Column balancing: K-P looseness per paragraph re-broken one line longer. */
  balanceLooseness?: ReadonlyMap<number, number>;
  /** Column balancing: shared budget of the loose candidates offered together
   *  (the pass stops loosening a column once it gained what it needs). */
  balanceLooseBudget?: ReadonlyMap<number, LooseBudget>;
  /** Band caps keyed by the span block's content index (see `bandCaps.ts`). */
  bandCaps?: ReadonlyMap<number, BandCap>;
}

export interface PassResult extends BandPassReport {
  doc: VDTDocument;
  /** Pages whose break into the next page was explicit (`:::pagebreak`,
   *  heading `breakBefore`, chapter opener) rather than natural content
   *  overflow — those pages keep their short last column. */
  forcedBreakPages: Set<number>;
  bandCapProposals: Map<number, BandCap>;
  spanPlacedInBand: Set<number>;
  bandCapsApplied: Set<number>;
  /** Column balancing: per loose paragraph tried in this pass, the tracking
   *  (thousandths of an em) that gained its extra line — `null` when no rung
   *  of the ladder did, so the driver can blacklist it. Candidates left
   *  untried because their column's budget was already met are absent. */
  looseOutcome: Map<number, number | null>;
}

/**
 * Column balancing: measure a paragraph asked to run `extraLines` long.
 * Walks the tracking ladder — no tracking first, then a little positive
 * tracking up to `maxTracking` — and keeps the first measurement that gains
 * exactly the requested lines within the word-spacing limit (a rung that
 * gains the line on its own, without needing the looseness target, counts
 * too). Falls back to the plain measurement when no rung works, recording
 * the outcome either way.
 */
function measureLooseParagraph(
  rawBlock: Parameters<typeof measureContentBlock>[0],
  blockIdx: number,
  columnWidth: number,
  ctx: BlockMeasureContext,
  styleOverride: BlockStyle | undefined,
  extraLines: number,
  trackingLadder: readonly number[],
  looseOutcome: Map<number, number | null>,
): MeasuredContentBlock | null {
  const base = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { styleOverride });
  if (!base) return null;
  const target = base.measured.lines.length + extraLines;
  for (const tracking of trackingLadder) {
    const loose = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, {
      styleOverride,
      looseness: extraLines,
      trackingEm: tracking > 0 ? tracking / 1000 : undefined,
    });
    if (loose && loose.measured.lines.length === target) {
      looseOutcome.set(blockIdx, tracking);
      return loose;
    }
  }
  looseOutcome.set(blockIdx, null);
  return base;
}

/**
 * Single placement pass. `hints` carries the cross-pass adjustments: the
 * column-balancing spacing / looseness and the band caps of page-span
 * blocks. Besides the document it reports `forcedBreakPages` (for
 * balancing) and the band-cap bookkeeping the driver in `buildDocument`
 * needs — new cap proposals, the span blocks that landed in their capped
 * band, and the caps that were actually applied.
 *
 * @internal Exposed for tests only; use `buildDocument`.
 */
export function buildDocumentPass(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
  hints: PassHints = {},
): PassResult {
  const { balanceExtraPx, balanceLooseness, balanceLooseBudget, bandCaps } = hints;
  const resolved = resolveAllConfig(config);
  // Tracking rungs a loose paragraph may climb: none, then 5‰ steps up to
  // the cap (`headings.balancing.maxTracking`, thousandths of an em), the
  // cap itself always included. Only the smallest rung that gains the line
  // is ever kept; each rung costs one cached paragraph measurement.
  const balancingCfg = resolved.headings.balancing;
  const trackingLadder: number[] = [0];
  if (balancingCfg.trackParagraphs && balancingCfg.maxTracking > 0) {
    for (let t = 5; t < balancingCfg.maxTracking; t += 5) trackingLadder.push(t);
    trackingLadder.push(balancingCfg.maxTracking);
  }
  const looseOutcome = new Map<number, number | null>();
  // Lines gained so far per column budget group (see `LooseBudget`).
  const looseGained = new Map<number, number>();
  const headingLevelByNumber = buildHeadingLevelMap(resolved);
  const dpi = resolved.page.dpi;

  // Initialize hyphenator if needed (body text, or any justified paragraph
  // style that hyphenates — they share the document locale).
  const needsHyphenator =
    (resolved.bodyText.hyphenation.enabled && resolved.bodyText.textAlign === 'justify')
    || resolved.paragraphStyles.some((s) => s.hyphenation && s.textAlign === 'justify');
  if (needsHyphenator) {
    initHyphenator(resolved.bodyText.hyphenation.locale);
  }

  // Compute baseline grid
  const baselineGrid = computeBaselineGrid(resolved);

  // Create document
  const doc = createVDTDocument(resolved, baselineGrid);
  // A chapter laid out after the pages before it: shift parity and carry the
  // counters over (see `PostextContent.continuation`).
  const continuation = content.continuation;
  const pageIndexOffset = Math.max(0, Math.floor(continuation?.pageIndexOffset ?? 0));
  if (pageIndexOffset > 0) doc.pageIndexOffset = pageIndexOffset;
  if (continuation?.headings && continuation.headings.h1 > 0) doc.chapterOrdinalOffset = continuation.headings.h1;
  // The part the preceding chapters left open: running heads and palette
  // overrides apply from the first page until this document opens its own.
  if (continuation?.part) doc.partStart = continuation.part;

  const pageMetrics = computePageMetrics(resolved);
  const { pageWidthPx, pageHeightPx, trimOffset, contentArea } = pageMetrics;
  // Page/bleed frames for design elements anchored to `'page'` / `'bleed'`.
  const designFrames = { page: pageMetrics.trimBox, bleed: pageMetrics.bleedBox };
  doc.trimOffset = trimOffset;

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
  doc.pages.push(firstPage);

  // Extract frontmatter, then parse the remaining markdown body
  const { metadata: frontmatterMeta, content: markdownBody, contentOffset: bodyOffset } = extractFrontmatter(content.markdown);
  doc.metadata = { ...(content.metadata ?? {}), ...frontmatterMeta };
  const contentBlocks = parseMarkdownMemo(markdownBody);

  const headingTemplates: HeadingTemplates = {};
  for (const lvl of resolved.headings.levels) {
    if (lvl.numberingTemplate && lvl.numberingTemplate.length > 0) {
      headingTemplates[lvl.level as 1 | 2 | 3 | 4 | 5 | 6] = lvl.numberingTemplate;
    }
  }
  const headingStart = continuation?.headings;
  const headingPrefixes = computeHeadingNumbers(
    contentBlocks,
    headingTemplates,
    headingStart ? [headingStart.h1, headingStart.h2, headingStart.h3, headingStart.h4, headingStart.h5, headingStart.h6] : undefined,
  );

  // Resource numbering — computed up front (before the placement loop) so that
  // captions and inline `:ref`s can resolve their rendered number strings
  // before measurement. Numbering follows order of first reference in the
  // document.
  const resourceTypes: ResourceType[] = config?.resourceTypes ?? defaultResourceTypes();
  const resources: Resource[] = content.resources ?? [];
  const headingContext = computeHeadingContext(contentBlocks, headingStart);
  const resourceNumbering: ResourceNumberingMap = computeResourceNumbering(
    contentBlocks,
    resourceTypes,
    resources,
    headingContext,
    continuation ? { counters: continuation.resourceCounters, numbered: continuation.resourceNumbers } : undefined,
  );

  // Lookups threaded into block-kind resolution + measurement.
  const resourceById = new Map<string, Resource>();
  for (const r of resources) resourceById.set(r.id, r);
  const resourceTypeById = new Map<string, ResourceType>();
  for (const t of resourceTypes) resourceTypeById.set(t.id, t);
  const resourceNumberById = new Map<string, string>();
  for (const [id, entry] of Object.entries(resourceNumbering)) {
    resourceNumberById.set(id, entry.number);
  }

  // Resolve styles
  const bodyStyle = resolveBodyStyle(resolved);
  const blockquoteStyle = resolveBlockquoteStyle(resolved);
  const listLevelIndentsPx = computeLevelIndentsPx(resolved, bodyStyle.fontSizePx);
  const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, resolved, bodyStyle.fontSizePx);
  const orderedLevelIndentsPx = computeOrderedLevelIndentsPx(
    resolved,
    bodyStyle.fontSizePx,
    orderedMetrics.maxWidthByDepth,
  );
  // `:::paragraphs{style="…"}` containers, resolved per content-block index.
  const paragraphContainers = planParagraphContainers(contentBlocks, resolved);
  // `:::callout` ranges keyed by their start marker index (same rationale).
  const calloutPlan = planCallouts(contentBlocks);
  // `:::part` ranges: start/end marker indices and the enclosed blocks.
  const partPlan = planParts(contentBlocks);

  // --- Float planning (issue #49 — resources float to page bands) ----------
  // A resource is incorporated by its first reference (an inline `:ref` or a
  // `::resource` directive, whichever comes first in reading order). Floated
  // resources detach from the running text and take the first free slot
  // after that reference (`floatSlots.ts`); the text flows past the
  // reference uninterrupted. `position: 'here'` resources keep inline
  // `::resource` placement and are not floated.
  const floatPlan = computeFloatPlan(contentBlocks, resources, resourceTypes);
  const floatedIds = floatedResourceIds(floatPlan);
  const floatsByFirstBlock = new Map<number, PlannedFloat[]>();
  for (const f of floatPlan) {
    const list = floatsByFirstBlock.get(f.firstBlockIdx);
    if (list) list.push(f);
    else floatsByFirstBlock.set(f.firstBlockIdx, [f]);
  }
  // Floats whose first reference has been passed but which are not yet placed
  // into a page band, in reading order.
  const pendingFloats: PlannedFloat[] = [];
  /** Resource ids already enqueued in this pass — a keep-with-next rewind
   *  replays the loop top for the rolled-back blocks and must not enqueue
   *  (and later place) the same float twice. */
  const enqueuedFloatIds = new Set<string>();
  const enqueueFloatsFor = (blockIdx: number): void => {
    const fl = floatsByFirstBlock.get(blockIdx);
    if (!fl) return;
    for (const f of fl) {
      if (enqueuedFloatIds.has(f.resourceId)) continue;
      enqueuedFloatIds.add(f.resourceId);
      pendingFloats.push(f);
    }
  };
  const floatGapPx = bodyStyle.lineHeightPx;
  const minTextPx = bodyStyle.lineHeightPx * 3;
  /** Fewest body rows the closing slice of a split table carries. */
  const MIN_TAIL_ROWS = 3;

  /** Offset a resolved resource block's caption/table geometry from
   *  block-relative to absolute page coordinates (mirrors inline placement). */
  const offsetResourceBlockToAbsolute = (
    rb: ResolvedResourceBlock,
    ox: number,
    oy: number,
  ): void => {
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

  const layoutFloat = (
    resourceId: string,
    width: number,
    slice?: TableSliceSpec,
  ): { block: ResolvedResourceBlock; totalHeight: number; tableRows?: TableRowMetrics } | null => {
    const resource = resourceById.get(resourceId);
    if (!resource) return null;
    return layoutResourceBlock({
      resource,
      resourceType: resourceTypeById.get(resource.typeId),
      number: resourceNumberById.get(resourceId) ?? '',
      resolved,
      columnWidth: width,
      resourceNumbering,
      resourceTypes,
      resources,
      ...(slice ? { slice } : {}),
    });
  };

  /** Row count of a table resource (0 for anything else). */
  const tableRowCount = (resourceId: string): number =>
    resourceById.get(resourceId)?.table?.model.rows.length ?? 0;

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
  const tableMetrics = (resourceId: string, width: number): TableRowMetrics | null => {
    const key = `${resourceId}:${width.toFixed(2)}`;
    const memo = tableMetricsMemo.get(key);
    if (memo !== undefined) return memo;
    const m = layoutFloat(resourceId, width)?.tableRows ?? null;
    tableMetricsMemo.set(key, m);
    return m;
  };

  /** Height (and caption baseline) of a float at a given width, memoised —
   *  fit checks run for every pending float on every loop iteration. */
  const floatMeasureMemo = new Map<string, FloatMeasure | null>();
  const measureFloat = (resourceId: string, width: number, slice?: TableSliceSpec): FloatMeasure | null => {
    const key = `${resourceId}:${width.toFixed(2)}${sliceKey(slice)}`;
    const memo = floatMeasureMemo.get(key);
    if (memo !== undefined) return memo;
    const laid = layoutFloat(resourceId, width, slice);
    let m: FloatMeasure | null = null;
    if (laid) {
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
      m = {
        height: laid.totalHeight,
        ...(lastBaseline !== undefined ? { lastCaptionBaseline: lastBaseline } : {}),
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
  ): { block: VDTBlock; height: number } | null => {
    const laid = layoutFloat(resourceId, width, slice);
    if (!laid) return null;
    const { block: rb, totalHeight } = laid;
    const id = slice && slice.startRow > 0 ? `float-${resourceId}-cont-${slice.startRow}` : `float-${resourceId}`;
    const blk = createVDTBlock(id, 'resource', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
    blk.resourceBlock = rb;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.bbox = createBoundingBox(x, 0, width, totalHeight);
    blk.lines = [];
    offsetResourceBlockToAbsolute(rb, x, 0);
    return { block: blk, height: totalHeight };
  };

  /** Float bands reserved per column in this pass (the fresh-page flush
   *  sends single-column floats to the least reserved column). */
  const floatReserved = new Map<VDTColumn, { top: number; bottom: number }>();
  const reservedOf = (col: VDTColumn): { top: number; bottom: number } =>
    floatReserved.get(col) ?? { top: 0, bottom: 0 };
  /** Content index of the block that first referenced the latest float
   *  reserved at the head of each column. */
  const topFloatRefOf = new Map<VDTColumn, number>();

  /** Kind of cap the column is under (`undefined` when uncapped). A cap that
   *  cannot be attributed to the active band is treated as a span cap — the
   *  conservative reading, which keeps the column's bottom off the slot list. */
  const capKindOf = (col: VDTColumn): ColumnCapKind => {
    if (!uncappedBottoms.has(col)) return undefined;
    if (activeCap && bandCaps && activeCap.pageIndex === cursor.pageIndex && activeCap.band === (col.band ?? 0)) {
      return bandCaps.get(activeCap.spanIndex)?.kind ?? 'span';
    }
    return 'span';
  };

  /** Outcome of offering a float a slot: placed whole, placed as the first
   *  rows of a split table (the `rest` replaces it in the queue), deferred
   *  to a later slot, or dropped. */
  type PlaceResult = 'placed' | 'defer' | 'skip' | { rest: PlannedFloat };
  /** Floats (or slices) placed so far — the progress signal of the drain
   *  loop, which a split does not shorten the queue for. */
  let floatsPlaced = 0;

  /**
   * The slice of a table float that fits a fresh band of `avail` px, when
   * the whole (rest of the) table does not: the leading rows within the
   * band, cut where `planTableSlice` allows, verified against the band
   * geometry and shrunk row by row until it fits. `tableStyle.overflow`
   * decides what becomes of the rows left over — a rest float to continue
   * on the next page (`'split'`), nothing (`'clip'`) — or, for `'hide'`,
   * that the table is dropped. Returns null for a figure or a table with
   * nothing to cut, which are force-placed like before.
   */
  const splitTableFloat = (
    f: PlannedFloat,
    width: number,
    position: FloatSlotPosition,
    targetCols: readonly VDTColumn[],
    contentArea: BoundingBox,
    avail: number,
  ): { slice: TableSliceSpec; rest?: PlannedFloat } | 'skip' | null => {
    const rowCount = tableRowCount(f.resourceId);
    if (rowCount === 0) return null;
    const overflow = resolved.tableStyle.overflow;
    if (overflow === 'hide') return 'skip';
    const metrics = tableMetrics(f.resourceId, width);
    if (!metrics) return null;
    const startRow = f.startRow ?? 0;
    const firstBody = startRow > 0 ? Math.max(startRow, metrics.headerRowCount) : metrics.headerRowCount;
    if (firstBody >= rowCount) return null;
    // Overhead of a continuing slice at this width — caption, gaps, marker —
    // from a one-row probe; the row heights come from the metrics.
    const probe = layoutFloat(f.resourceId, width, { startRow, endRow: firstBody + 1, continues: true });
    if (!probe) return null;
    const overhead = probe.totalHeight - probe.block.bodyRect.height;
    // A top band rounds up to the grid: the tallest float it holds within
    // `avail` is the grid multiple below it, less the gap.
    const hMax = Math.floor((avail + 0.01) / baselineGrid) * baselineGrid - floatGapPx;
    let end = planTableSlice(metrics, startRow, hMax - overhead);
    // Nothing fits: carry the smallest slice anyway (it overflows, as a
    // dominating figure would) rather than stall the queue.
    const floor = firstBody + 1;
    if (end < floor) end = floor;
    // A last page holding a row or two under a repeated header reads as a
    // stranded tail: give the closing slice at least `MIN_TAIL_ROWS` rows by
    // handing some back from this one (at a breakable edge, not under a
    // group head), when this slice can spare them.
    const tail = rowCount - end;
    if (overflow === 'split' && tail > 0 && tail < MIN_TAIL_ROWS) {
      let e = rowCount - MIN_TAIL_ROWS;
      while (e > floor && (!(metrics.breakableAfter[e - 1] ?? true) || metrics.groupHeaderRow[e - 1])) e--;
      if (e >= floor && e >= end - MIN_TAIL_ROWS) end = e;
    }
    const fits = (slice: TableSliceSpec): boolean => {
      const measure = measureFloat(f.resourceId, width, slice);
      if (!measure) return true;
      const { need } = measureFloatBand(
        position, measure, targetCols, contentArea, baselineGrid, floatGapPx,
        (c) => trueBottom(c, uncappedBottoms),
      );
      return need <= avail + 0.01;
    };
    const sliceFor = (e: number): TableSliceSpec => ({
      startRow,
      endRow: e,
      continues: e < rowCount && overflow === 'split',
    });
    let slice = sliceFor(end);
    // The caption may wrap differently with its suffix, the closing slice
    // carries the note instead of the marker: verify, backing off a row at
    // a time (over breakable edges) when the band still overflows.
    for (let guard = 0; guard < 8 && end > floor && !fits(slice); guard++) {
      do end--; while (end > floor && !(metrics.breakableAfter[end - 1] ?? true));
      slice = sliceFor(end);
    }
    const rest: PlannedFloat | undefined = slice.continues ? { ...f, startRow: end } : undefined;
    return rest ? { slice, rest } : { slice };
  };

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
  ): { need: number; y: number; measure: FloatMeasure; slice: TableSliceSpec | undefined; width: number; xLeft: number } | null => {
    const first = targetCols[0]!;
    const width = pageSpan ? page.contentArea.width : first.bbox.width;
    const xLeft = pageSpan ? page.contentArea.x : first.bbox.x;
    const slice = sliceOf(f);
    const measure = measureFloat(f.resourceId, width, slice);
    if (!measure) return null;
    // A bottom band normally anchors to the column's true foot (under a
    // trailing cap, the page bottom — the closing-page figure). Before a
    // page-span box the cap IS the band's foot: the figure hugs the text
    // and the box follows both.
    const bottomOf = (c: VDTColumn): number =>
      anchorToCap ? c.bbox.y + c.bbox.height : trueBottom(c, uncappedBottoms);
    const { need, y } = measureFloatBand(
      position, measure, targetCols, page.contentArea, baselineGrid, floatGapPx, bottomOf,
    );
    return { need, y, measure, slice, width, xLeft };
  };

  /** Free height `col` keeps for the flow once a float band `probe` is
   *  reserved in it at `position` (mirrors the reservation arithmetic of
   *  `placeFloatInColumns`; a capped column absorbs a bottom band in its
   *  remembered true bottom, so its free height does not change). */
  const availableAfterBand = (
    col: VDTColumn,
    position: FloatSlotPosition,
    probe: { need: number; y: number },
    anchorToCap: boolean,
  ): number => {
    if (position === 'top') return Math.max(0, col.availableHeight - probe.need);
    if (uncappedBottoms.has(col) && !anchorToCap) return col.availableHeight;
    const newHeight = Math.max(0, probe.y - floatGapPx - col.bbox.y);
    return Math.max(0, col.availableHeight - (col.bbox.height - newHeight));
  };

  const placeFloatInColumns = (
    page: VDTPage,
    f: PlannedFloat,
    targetCols: readonly VDTColumn[],
    position: FloatSlotPosition,
    pageSpan: boolean,
    mode: 'fresh' | 'strict',
    anchorToCap = false,
  ): PlaceResult => {
    const first = targetCols[0]!;
    const probe = probeFloatBand(page, f, targetCols, position, pageSpan, anchorToCap);
    if (!probe) return 'skip';
    const { width, xLeft } = probe;
    let { slice, measure, need, y } = probe;
    let rest: PlannedFloat | undefined;

    if (mode === 'fresh') {
      let minAvail = Infinity;
      let anyReserved = false;
      for (const c of targetCols) {
        minAvail = Math.min(minAvail, c.availableHeight);
        const r = reservedOf(c);
        if (r.top > 0 || r.bottom > 0) anyReserved = true;
      }
      if (need > minAvail - minTextPx && anyReserved) return 'defer';
      if (need > minAvail + 0.01) {
        // Dominating the band: a table is cut to it.
        const split = splitTableFloat(f, width, position, targetCols, page.contentArea, minAvail);
        if (split === 'skip') return 'skip';
        if (split) {
          slice = split.slice;
          rest = split.rest;
          const m = measureFloat(f.resourceId, width, slice);
          if (!m) return 'skip';
          measure = m;
          ({ need, y } = measureFloatBand(
            position, measure, targetCols, page.contentArea, baselineGrid, floatGapPx,
            (c) => trueBottom(c, uncappedBottoms),
          ));
        }
      }
    } else {
      for (const c of targetCols) {
        if (position === 'bottom' && uncappedBottoms.has(c) && !anchorToCap) {
          // Trailing cap: the band must lie entirely below the level cut.
          if (y - floatGapPx < c.bbox.y + c.bbox.height - 0.01) return 'defer';
          continue;
        }
        if (!fitsStrict(need, c, columnHasFloatBand(page, c), minTextPx)) return 'defer';
      }
    }

    const built = buildFloatBlock(f.resourceId, xLeft, width, slice);
    if (!built) return 'skip';

    for (const col of targetCols) {
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
          const newHeight = Math.max(0, y - floatGapPx - col.bbox.y);
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

    offsetResourceBlockToAbsolute(built.block.resourceBlock!, 0, y);
    built.block.bbox = createBoundingBox(xLeft, y, width, built.height);
    built.block.pageIndex = page.index;
    built.block.columnIndex = first.index;
    (page.floats ??= []).push(built.block);
    floatsPlaced++;
    return rest ? { rest } : 'placed';
  };

  /** Apply a slot outcome to the queue at `i`: drop a placed float, keep a
   *  deferred one, swap in the rest of a split table. Returns the index to
   *  continue from. */
  const settle = (i: number, r: PlaceResult): number => {
    if (r === 'defer') return i + 1;
    if (typeof r === 'object') {
      pendingFloats[i] = r.rest;
      return i + 1;
    }
    pendingFloats.splice(i, 1);
    return i;
  };

  const positionsFor = (f: PlannedFloat): FloatSlotPosition[] =>
    f.position === 'auto' ? ['top', 'bottom'] : [f.position];

  /** Reserve top/bottom bands on a freshly opened page and position as many
   *  pending floats as fit, shrinking the affected columns so body text flows
   *  around them. Full-width (page-span) floats reserve the outermost bands
   *  first, so a later single-column float nests inside the remaining column
   *  space rather than overlapping a full-width band. A float that does not
   *  fit never holds up the ones behind it: each takes the first slot it
   *  fits (numbering follows first-reference order regardless). */
  const flushFloatsIntoPage = (page: VDTPage): void => {
    if (pendingFloats.length === 0) return;
    const textCols = page.columns.filter((c) => c.kind !== 'span');
    if (textCols.length === 0) return;
    const leastReserved = (): VDTColumn => {
      let best = textCols[0]!;
      for (const c of textCols) {
        const rb = reservedOf(best);
        const rc = reservedOf(c);
        if (rc.top + rc.bottom < rb.top + rb.bottom) best = c;
      }
      return best;
    };
    for (const pageSpanPass of [true, false]) {
      let i = 0;
      while (i < pendingFloats.length) {
        const f = pendingFloats[i]!;
        const isPageSpan = f.span === 'page' && textCols.length > 1;
        if (isPageSpan !== pageSpanPass) { i++; continue; }
        let r: PlaceResult = 'defer';
        for (const pos of positionsFor(f)) {
          const cols = isPageSpan ? textCols : [leastReserved()];
          r = placeFloatInColumns(page, f, cols, pos, isPageSpan, 'fresh');
          if (r !== 'defer') break;
        }
        i = settle(i, r);
      }
    }
  };

  /** The keep-together box content block `idx` opens, when it is one that
   *  lays out inline in a column of the current band (`span: 'column'`,
   *  placement `here`): its height at a column width, so the floats placed
   *  right before it can tell whether a slot would starve it. */
  const keepTogetherBoxAt = (idx: number): { heightAt: (width: number) => number } | null => {
    const b = contentBlocks[idx];
    if (!b || b.type !== 'containerStart' || b.containerName !== 'callout') return null;
    const plan = calloutPlan.get(idx);
    const style = plan ? pickCalloutStyle(resolved.calloutStyles, plan.attrs.type) : undefined;
    if (!plan || !style || !style.keepTogether) return null;
    const { span, placement } = resolveCalloutAttrs(style, plan.attrs);
    if (placement !== 'here') return null;
    const page = doc.pages[cursor.pageIndex]!;
    if (span === 'page' && bandColumns(page, currentBand(page, cursor)).length > 1) return null;
    const L = makeCalloutLayouter(idx, plan, style);
    const heights = new Map<number, number>();
    return {
      heightAt: (width) => {
        const key = Math.round(width * 100);
        let h = heights.get(key);
        if (h === undefined) {
          const r = L.layoutRange(CUT_START, L.end, width, 'probe', false);
          h = r.totalHeight + Math.max(pendingSpacing, r.marginTopPx);
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
    box: { heightAt: (width: number) => number },
    anchorToCap: boolean,
  ): boolean => {
    const cursorCol = page.columns[cursor.columnIndex];
    if (!cursorCol) return false;
    const candidates = bandColumns(page, currentBand(page, cursor))
      .filter((c) => c.kind !== 'span' && c.index >= cursorCol.index && (c === cursorCol || c.blocks.length === 0));
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
   *  slots that would starve it (see `slotStarvesBox`). */
  const tryPlacePendingFloatsOnCurrentPage = (preferTop = false, nextBlockIdx?: number): void => {
    if (pendingFloats.length === 0) return;
    const page = doc.pages[cursor.pageIndex]!;
    const box = nextBlockIdx !== undefined ? keepTogetherBoxAt(nextBlockIdx) : null;
    for (let i = 0; i < pendingFloats.length;) {
      const f = pendingFloats[i]!;
      let r: PlaceResult = 'defer';
      let slots = enumerateCurrentPageSlots(page, cursor.columnIndex, f, capKindOf);
      // A page-span box comes next: the head of an empty column keeps the
      // band cuttable under the float (the box then sits below both the
      // text and the figure), where the referencing column's foot would
      // wall the box off the page. A page-span figure waits for the box
      // itself, which cuts the band under the text and sets the figure
      // there, above the box (`placeSpanFloatsAtCut`) — its only slot here
      // would be the band's foot, under the box.
      if (preferTop && f.span === 'page' && bandColumns(page, currentBand(page, cursor)).length > 1) { i++; continue; }
      if (preferTop) slots = [...slots.filter((s) => s.position === 'top'), ...slots.filter((s) => s.position !== 'top')];
      for (const slot of slots) {
        if (box && slotStarvesBox(page, f, slot, box, preferTop)) continue;
        r = placeFloatInColumns(page, f, slot.cols, slot.position, slot.pageSpan, 'strict', preferTop);
        if (r !== 'defer') break;
      }
      i = settle(i, r);
    }
  };

  /** Reserve floats on each freshly opened content page. Passed only to the
   *  content-flow column advances — parity / force-blank pages never get it. */
  const onNewPage = (page: VDTPage): void => flushFloatsIntoPage(page);

  /** Whether content block `idx` opens a callout that will span the page
   *  in the current (multi-column) band — the floats placed right before
   *  it prefer the head of an empty column. */
  const spanBoxAt = (idx: number): boolean => {
    const b = contentBlocks[idx];
    if (!b || b.type !== 'containerStart' || b.containerName !== 'callout') return false;
    const plan = calloutPlan.get(idx);
    const style = plan ? pickCalloutStyle(resolved.calloutStyles, plan.attrs.type) : undefined;
    if (!style) return false;
    const { span, placement } = resolveCalloutAttrs(style, plan!.attrs);
    if (span !== 'page' || placement === 'fixed') return false;
    const page = doc.pages[cursor.pageIndex]!;
    return bandColumns(page, currentBand(page, cursor)).length > 1;
  };

  /** Chapter barrier: place every pending float before the boundary — in
   *  the current page's free slots, then on fresh pages opened ahead of it
   *  (each force-places at least one float). The cursor is left on the last
   *  float page so the boundary's own page break opens AFTER them. */
  const drainPendingFloats = (): void => {
    tryPlacePendingFloatsOnCurrentPage();
    let guard = 0;
    while (pendingFloats.length > 0 && guard++ < 1000) {
      const before = floatsPlaced;
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
      } while (cursor.pageIndex === startPageIndex);
      if (floatsPlaced === before) break; // safety: no progress
    }
  };

  // Everything per-block measurement needs that is constant for this pass.
  const measureCtx: BlockMeasureContext = {
    resolved,
    bodyStyle,
    blockquoteStyle,
    headingPrefixes,
    listLevelIndentsPx,
    orderedLevelIndentsPx,
    orderedMetrics,
    resourceById,
    resourceTypeById,
    resourceNumberById,
    contentBlocks,
    cache,
    bodyOffset,
    resources,
    resourceTypes,
    resourceNumbering,
    floatedIds,
  };
  // Blocks inside a `:::part` measure with the part body typography.
  const partMeasureCtx: BlockMeasureContext = partPlan.byStart.size > 0
    ? derivePartMeasureContext(measureCtx)
    : measureCtx;

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

  let blockIdCounter = 0;
  let pendingSpacing = 0;

  // Pages whose break into the next page is explicit rather than natural
  // overflow. Column balancing leaves their last column short (a chapter's
  // closing page legitimately ends early).
  const forcedBreakPages = new Set<number>();
  const markForcedBreak = (): void => {
    const curPage = doc.pages[cursor.pageIndex]!;
    if (curPage.columns.some((c) => c.blocks.length > 0)) {
      forcedBreakPages.add(cursor.pageIndex);
    }
  };

  // --- Column bands: opening block + band caps (span blocks, stage 2) ----
  // The band the cursor last placed into, its opening block (content index
  // + part: a paragraph split across pages opens the next page's band with
  // its continuation), and the cap applied to it, if any. `enterBand` runs
  // at every placement site right before a block is offered to the current
  // column: the first block offered to a band is its opening block, and if
  // a cap names it the band's columns are shortened to the cap BEFORE the
  // block is placed, so the fit / split / keep-with-next rules see the
  // capped height. Atomic placements that advance internally re-run it
  // after landing (the cap then trims whatever the block left).
  let registeredBand: { pageIndex: number; band: number } | null = null;
  let bandStart: { contentIndex: number; part: number } | null = null;
  let activeCap: { spanIndex: number; pageIndex: number; band: number } | null = null;
  /** True bottoms of capped columns (restored when the span block cuts). */
  const uncappedBottoms = new Map<VDTColumn, number>();
  /** Column balancing: height (px) the levers added inside each column so
   *  far — extra grid lines above headings / list ends and lines gained by
   *  loose paragraphs. Balancing only ever fills a column's bottom gap, so
   *  a placement rule that needs slack *after* a block (keep-colon-with-
   *  list) must see the column as it was before the levers filled it:
   *  otherwise the block that closed the column in the plain pass moves to
   *  the next column, the flow shifts on every later page, and the pass is
   *  discarded as a regression. */
  const balanceExtraInColumn = new Map<VDTColumn, number>();
  const addBalanceExtra = (col: VDTColumn, px: number): void => {
    if (px > 0) balanceExtraInColumn.set(col, (balanceExtraInColumn.get(col) ?? 0) + px);
  };
  const bandCapProposals = new Map<number, BandCap>();
  const spanPlacedInBand = new Set<number>();
  const bandCapsApplied = new Set<number>();

  const enterBand = (contentIndex: number, part: number): void => {
    const page = doc.pages[cursor.pageIndex]!;
    const band = currentBand(page, cursor);
    if (registeredBand && registeredBand.pageIndex === page.index && registeredBand.band === band) return;
    registeredBand = { pageIndex: page.index, band };
    bandStart = { contentIndex, part };
    activeCap = null;
    if (!bandCaps) return;
    for (const [spanIndex, cap] of bandCaps) {
      if (cap.startContentIndex !== contentIndex || cap.startPart !== part) continue;
      applyBandCap(bandColumns(page, band), cap.lines * baselineGrid, uncappedBottoms, cap.zone, cap.kind === 'trailing');
      activeCap = { spanIndex, pageIndex: page.index, band };
      bandCapsApplied.add(spanIndex);
      break;
    }
  };

  /**
   * Trailing band balance: when the flow reaches a boundary (chapter opener,
   * `:::part`, a chapter-closing fixed box, end of document) with the
   * current band's text columns uneven, propose a cap that cuts them level
   * — `ceil(Σ used / N / grid)` lines — so the next pass re-places the band
   * and its columns end at the same height, the way a compositor sets a
   * short closing page. Keyed by the boundary block's content index
   * (`contentBlocks.length` at EOF). In the capped pass the boundary reports
   * the cap delivered when it is reached inside the capped band (nothing
   * spilled past the cut); the columns are NOT uncapped afterwards, so
   * column balancing does not stretch them back to the page bottom.
   *
   * A chapter-closing fixed box passes the `zone` it will take at the
   * bottom of the band: when the level cut would run into it, the columns
   * under the box are cut at the zone's top instead and the others take
   * the displaced text (see {@link bandCapLinesAroundZone}) — the box then
   * fits on the page, under its columns, rather than opening a page alone.
   */
  const proposeTrailingCap = (boundaryIndex: number, zone?: BandCapZone): void => {
    const balancingCfg = resolved.headings.balancing;
    if (!balancingCfg.enabled || !balancingCfg.trailing) return;
    const page = doc.pages[cursor.pageIndex]!;
    if (page.columns[cursor.columnIndex]?.kind === 'span' || page.partInfo) return;
    const band = currentBand(page, cursor);
    const cols = bandColumns(page, band).filter((c) => c.bbox.height > 0.5);
    if (cols.length < 2 || cols.some((c) => c.forcedBreak)) return;
    if (activeCap && activeCap.spanIndex === boundaryIndex
      && activeCap.pageIndex === page.index && activeCap.band === band) {
      spanPlacedInBand.add(boundaryIndex);
      return;
    }
    // A cap in force for this boundary that did not open the band the
    // boundary is reached in (an earlier cap moved the flow under it, or
    // its own band overflowed) still gets a fresh proposal below: the
    // driver replaces a cap that no longer applies with it, and ignores it
    // while retrying an applied cap a line taller.
    if (activeCap && activeCap.pageIndex === page.index && activeCap.band === band) return;
    if (!cols.some((c) => c.blocks.length > 0)) return;
    if (!bandStart || !registeredBand || registeredBand.pageIndex !== page.index || registeredBand.band !== band) return;
    const bottoms = cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight));
    const aroundZone = zone ? bandCapLinesAroundZone(cols, baselineGrid, zone, (c) => columnBottom(c, uncappedBottoms)) : null;
    if (aroundZone === null && Math.max(...bottoms) - Math.min(...bottoms) <= baselineGrid + 0.5) return;
    // Float bands reserved at the columns' feet are the band's content too:
    // the level cut must leave them room under the text (a figure placed
    // before a span box then anchors to the cut, see `anchorToCap`).
    const footBands = cols.reduce((sum, c) => sum + reservedOf(c).bottom, 0);
    // A figure heading an otherwise empty column keeps its slot: the cut
    // goes no higher than the band it takes, or the capped pass evicts it
    // to a page of its own.
    const top = bandTop(cols);
    const floatHeads = cols
      .filter((c) => c.blocks.length === 0 && reservedOf(c).top > 0)
      .map((c) => Math.ceil((c.bbox.y - top - 0.01) / baselineGrid));
    bandCapProposals.set(boundaryIndex, {
      kind: 'trailing',
      startContentIndex: bandStart.contentIndex,
      startPart: bandStart.part,
      lines: aroundZone ?? Math.max(bandCapLines(cols, baselineGrid, footBands), ...floatHeads),
      retries: 0,
      ...(aroundZone !== null ? { zone } : {}),
    });
  };

  /** Close the flow at a chapter-level boundary (block `boundaryIndex`):
   *  floats take the page's free slots, the closing band is levelled, the
   *  page is marked as an explicit break, and every float still pending is
   *  drained onto pages opened BEFORE the boundary. The caller then opens
   *  the boundary's own page. */
  const closeFlowSegment = (boundaryIndex: number): void => {
    tryPlacePendingFloatsOnCurrentPage();
    proposeTrailingCap(boundaryIndex);
    markForcedBreak();
    drainPendingFloats();
  };

  /** Parity of the page break a closed `:::part` still owes (applied before
   *  the next placed block). */
  let pendingPartBreak: HeadingBreakParity | null = null;

  /** `advanceToNextPageBoundary`, except that an empty part page is left
   *  behind too (its opener design is content). No floats are reserved on
   *  the page opened this way — parity padding may still follow it. */
  const leaveCurrentPage = (): void => {
    const curPage = doc.pages[cursor.pageIndex]!;
    if (curPage.partInfo && !pageHasContent(curPage)) {
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
      } while (cursor.pageIndex === startPageIndex);
      return;
    }
    advanceToNextPageBoundary(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
  };

  // Page-numbering segments. The implicit first segment comes from
  // `cfg.page.pageNumbering`; `:::numbering` directives append more,
  // each applied at the next page boundary.
  // A continued document starts where the previous page left off.
  const pageNumberSegments: PageNumberSegment[] = [
    {
      startPageIndex: 0,
      format: continuation?.pageNumbering?.format ?? resolved.page.pageNumbering.format,
      startAt: continuation?.pageNumbering?.startAt ?? resolved.page.pageNumbering.startAt,
    },
  ];
  let pendingNumberingChange:
    | { format?: NumeralStyle; startAt?: number }
    | null = null;
  let lastSeenPageIndex = 0;

  /** Commits any pending `:::numbering` change once we've crossed into a
   *  new page. Called after every block iteration. */
  const flushPendingNumberingAtBoundary = (): void => {
    if (cursor.pageIndex > lastSeenPageIndex) {
      if (pendingNumberingChange) {
        pageNumberSegments.push({
          startPageIndex: cursor.pageIndex,
          ...pendingNumberingChange,
        });
        pendingNumberingChange = null;
      }
      lastSeenPageIndex = cursor.pageIndex;
    }
  };

  /** Heading blocks that are not part of a callout — the only ones the
   *  keep-with-next rollbacks may pull along (a callout is one unbreakable
   *  unit; its children never leave it). */
  const isFreeHeading = (b: VDTBlock): boolean => b.type === 'heading' && b.containerId === undefined;

  /** Stamp a callout frame's content index and source range: the whole
   *  fence (opening to closing marker) for an unsplit box; for a fragment
   *  of a split box, from the fence start (first fragment) or the first
   *  child it holds, to the fence end (last fragment) or the last child. */
  const stampCalloutSource = (
    frame: VDTBlock,
    startIdx: number,
    plan: PlannedCallout,
    range?: { firstChildIdx: number; lastChildIdx: number },
  ): void => {
    const startBlock = contentBlocks[startIdx]!;
    const endBlock = contentBlocks[plan.endIdx]!;
    frame.contentIndex = startIdx;
    const first = range && range.firstChildIdx > startIdx + 1 ? contentBlocks[range.firstChildIdx]! : startBlock;
    const last = range && range.lastChildIdx < plan.endIdx - 1 ? contentBlocks[range.lastChildIdx]! : endBlock;
    frame.sourceStart = first.sourceStart + bodyOffset;
    frame.sourceEnd = last.sourceEnd + bodyOffset;
  };

  /** Shared tail of callout placement: stamp the frame's source range,
   *  convert the laid-out box to absolute coordinates at the frame's placed
   *  origin, and push frame + children — in that order — to `doc.blocks`
   *  and to the column the frame landed in. */
  const commitCallout = (
    result: CalloutLayoutResult,
    startIdx: number,
    plan: PlannedCallout,
    col: VDTColumn,
    range?: { firstChildIdx: number; lastChildIdx: number },
  ): void => {
    const frame = result.frame;
    stampCalloutSource(frame, startIdx, plan, range);
    offsetCalloutToAbsolute(result, frame.bbox.x, frame.bbox.y);
    doc.blocks.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      col.blocks.push(child);
      doc.blocks.push(child);
    }
  };

  // --- Callout fragments (`keepTogether: false`) ---------------------------
  // A splittable box breaks only BETWEEN its child blocks (a list item or a
  // paragraph is never cut in two): the fragment that fits closes the
  // current column / page, the rest continues in a box of its own — same
  // frame, stripe and marker, no title or icon — on the next one, and may
  // split again. Every
  // fragment's frame shares the fence's `contentIndex` / `containerId` and
  // records its `callout.part` / `callout.continued`.

  /** A position inside a box's children where a fragment starts or ends:
   *  before child `child` (a position in `children`), past its first
   *  `line` text lines. `line: 0` is the child's head; a cut with
   *  `line > 0` falls inside that child, between two of its lines. */
  interface CalloutCut {
    child: number;
    line: number;
  }
  const CUT_START: CalloutCut = { child: 0, line: 0 };

  interface CalloutLayouter {
    /** Content blocks between the fence markers. */
    children: readonly ContentBlock[];
    /** Content index of `children[0]`. */
    childBase: number;
    /** Positions in `children` of the blocks the box lays out (marker
     *  blocks of nested containers and directives are skipped). */
    realAt: readonly number[];
    /** The cut past the last child (the end of the box). */
    end: CalloutCut;
    /** Lay out the children from cut `from` to cut `to` at `width` as one
     *  box — a `continuation` (every fragment after the head) without
     *  title / icon. A cut inside a child keeps only the lines on its side. */
    layoutRange: (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean) => CalloutLayoutResult;
  }

  const makeCalloutLayouter = (
    startIdx: number,
    plan: PlannedCallout,
    style: ResolvedCalloutStyleConfig,
  ): CalloutLayouter => {
    const children = contentBlocks.slice(startIdx + 1, plan.endIdx);
    const realAt: number[] = [];
    children.forEach((c, k) => {
      if (c.type !== 'directive' && !isMarkerBlock(c)) realAt.push(k);
    });
    const layoutRange = (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean) => {
      let n = 0;
      // A cut inside child `to.child` includes that child (its first
      // `to.line` lines); a cut at a child's head excludes it.
      const toChild = to.line > 0 ? to.child + 1 : to.child;
      return layoutCallout({
        style,
        attrs: plan.attrs,
        continuation,
        children: children.slice(from.child, toChild),
        childStartIdx: startIdx + 1 + from.child,
        width,
        ctx: measureCtx,
        resolved,
        containerId: plan.containerId,
        frameId,
        nextChildId: () => `${frameId}-c${n++}`,
        paragraphStyleFor: (idx) => paragraphContainers.byBlock[idx]?.style,
        ...(from.line > 0 ? { lineFrom: from.line } : {}),
        ...(to.line > 0 ? { lineTo: to.line } : {}),
      });
    };
    return { children, childBase: startIdx + 1, realAt, end: { child: children.length, line: 0 }, layoutRange };
  };

  interface CalloutFragment {
    /** The cut the rest of the box starts at. */
    to: CalloutCut;
    result: CalloutLayoutResult;
  }

  /** The longest leading fragment of the box from cut `from` on whose box
   *  is at most `roomPx` tall. Cuts fall between children or between the
   *  lines of a text child, and every fragment keeps at least the style's
   *  `splitMinLines` lines on its side of the cut (a figure or a display
   *  formula counts as one line). The full layout's geometry ranks the
   *  candidates (box bottom = content bottom at the cut + the box's tail
   *  below its last child); the deepest candidate that fits is laid out
   *  for real and taken when it truly fits. `null` when none does. */
  const splitCalloutFragment = (
    L: CalloutLayouter,
    from: CalloutCut,
    width: number,
    roomPx: number,
    frameId: string,
    continuation: boolean,
    minLines: number,
  ): CalloutFragment | null => {
    const full = L.layoutRange(from, L.end, width, frameId, continuation);
    const lastChild = full.children[full.children.length - 1];
    if (!lastChild) return null;
    const tail = full.totalHeight - (lastChild.bbox.y + lastChild.bbox.height);
    const totalLines = full.children.reduce((n, c) => n + Math.max(1, c.lines.length), 0);
    /** Candidate cuts with the head's content bottom and line count. */
    const candidates: { cut: CalloutCut; bottom: number; headLines: number }[] = [];
    let linesBefore = 0;
    for (let i = 0; i < full.children.length; i++) {
      const c = full.children[i]!;
      const k = (c.contentIndex ?? L.childBase) - L.childBase;
      const cuttable = c.type !== 'resource' && c.type !== 'mathDisplay' && c.lines.length > 1;
      // The first laid-out child of a continuation opens after `from.line`
      // lines: cuts inside it are counted from the child's own head.
      const lineBase = k === from.child ? from.line : 0;
      if (cuttable) {
        for (let l = 1; l < c.lines.length; l++) {
          const line = c.lines[l - 1]!;
          candidates.push({ cut: { child: k, line: lineBase + l }, bottom: line.bbox.y + line.bbox.height, headLines: linesBefore + l });
        }
      }
      linesBefore += Math.max(1, c.lines.length);
      if (i < full.children.length - 1) {
        candidates.push({ cut: { child: k + 1, line: 0 }, bottom: c.bbox.y + c.bbox.height, headLines: linesBefore });
      }
    }
    const min = Math.max(1, minLines);
    const viable = candidates
      .filter((c) => c.headLines >= min && totalLines - c.headLines >= min)
      .sort((a, b) => b.bottom - a.bottom);
    for (const c of viable) {
      if (c.bottom + tail > roomPx + 0.01) continue;
      const result = L.layoutRange(from, c.cut, width, frameId, continuation);
      if (result.totalHeight <= roomPx + 0.01) return { to: c.cut, result };
    }
    return null;
  };

  /** Absolute content indices of the children a fragment from cut `from`
   *  to cut `to` of `L` touches, for the fragment's source range. */
  const fragmentRange = (L: CalloutLayouter, from: CalloutCut, to: CalloutCut) =>
    ({ firstChildIdx: L.childBase + from.child, lastChildIdx: L.childBase + (to.line > 0 ? to.child : to.child - 1) });

  const markFragment = (result: CalloutLayoutResult, part: number, continued: boolean): void => {
    if (result.frame.callout) {
      result.frame.callout.part = part;
      result.frame.callout.continued = continued;
    }
  };

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
   * Splitting (`keepTogether: false`): a box that does not fit a level (or
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
    const splittable = !style.keepTogether;
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
     */
    const placeSpanFloatsAtCut = (page: VDTPage, capActiveHere: boolean): boolean => {
      let placedAny = false;
      for (let i = 0; i < pendingFloats.length;) {
        const f = pendingFloats[i]!;
        const cols = bandColumns(page, currentBand(page, cursor));
        if (f.span !== 'page' || cols.length < 2 || !((capActiveHere && !placedAny) || levelForBox(cols))) { i++; continue; }
        const width = page.contentArea.width;
        const slice = sliceOf(f);
        const measure = measureFloat(f.resourceId, width, slice);
        if (!measure) { i++; continue; }
        const cutY = gridUp(page, bandUsedBottom(cols));
        const spacing = cols.some((c) => c.blocks.length > 0) ? floatGapPx : 0;
        const need = needFor(spacing, measure.height, floatGapPx);
        const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
        if (cutY + need > bandBottom + 0.01) { i++; continue; }
        const built = buildFloatBlock(f.resourceId, page.contentArea.x, width, slice);
        if (!built) { i++; continue; }
        if (capActiveHere && !placedAny) {
          uncapBand(cols, uncappedBottoms);
          spanPlacedInBand.add(startIdx);
        }
        closeBandAndInsertSpan(page, cols, cutY, built.block, need, cursor, spacing, built.height);
        // The float was built at (x, 0): move its inner geometry down to
        // where the span column put it.
        offsetResourceBlockToAbsolute(built.block.resourceBlock!, 0, built.block.bbox.y);
        built.block.contentIndex = f.firstBlockIdx;
        doc.blocks.push(built.block);
        floatsPlaced++;
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

    for (;;) {
      let page = doc.pages[cursor.pageIndex]!;
      const continuation = part > 0;
      const layoutAt = (width: number): CalloutLayoutResult =>
        L.layoutRange(from, L.end, width, frameId, continuation);
      const result = layoutAt(page.contentArea.width);

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
        const cutY = gridUp(page, bandUsedBottom(cols));
        const bandHasContent = cols.some((c) => c.blocks.length > 0);
        const spacing = bandHasContent ? Math.max(pendingSpacing, result.marginTopPx) : 0;
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
        && activeCap !== null
        && activeCap.spanIndex === startIdx
        && activeCap.pageIndex === page.index
        && activeCap.band === currentBand(page, cursor);

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
          const first = pendingFloats.find((f) => f.span === 'page');
          if (first && !capActive && cap === undefined && bandStart && registeredBand
            && registeredBand.pageIndex === page.index && registeredBand.band === bandBefore) {
            const cols = bandColumns(page, bandBefore).filter((c) => c.bbox.height > 0.5);
            if (cols.length > 1 && !isBandLevel(cols) && cols.some((c) => c.blocks.length > 0)) {
              const lines = bandCapLines(cols, baselineGrid);
              const capBottom = bandTop(cols) + lines * baselineGrid;
              const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
              const m = measureFloat(first.resourceId, page.contentArea.width, sliceOf(first));
              const figureFits = m !== null && capBottom + needFor(floatGapPx, m.height, floatGapPx) <= bandBottom + 0.01;
              if (figureFits) {
                bandCapProposals.set(startIdx, {
                  kind: 'span',
                  startContentIndex: bandStart.contentIndex,
                  startPart: bandStart.part,
                  lines,
                  retries: 0,
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
      if (!action && forceHere && fit) {
        action = { kind: 'whole', fit, need: fit.need, result };
        (doc.warnings ??= []).push({
          kind: 'calloutOverflow',
          pageIndex: cursor.pageIndex,
          columnIndex: cursor.columnIndex,
          sourceStart: contentBlocks[startIdx]!.sourceStart + bodyOffset,
          sourceEnd: contentBlocks[plan.endIdx]!.sourceEnd + bodyOffset,
          overflowPx: Math.max(0, fit.spacing + result.totalHeight - fit.roomPx),
        });
      }

      if (action) {
        if (capActive) {
          uncapBand(action.fit.cols, uncappedBottoms);
          spanPlacedInBand.add(startIdx);
        }
        const placed = action.kind === 'whole' ? action.result : action.fragment.result;
        const to = action.kind === 'whole' ? L.end : action.fragment.to;
        if (part > 0 || action.kind === 'split') markFragment(placed, part, action.kind === 'split');
        const spanCol = closeBandAndInsertSpan(
          page, action.fit.cols, action.fit.cutY, placed.frame, action.need, cursor, action.fit.spacing, placed.totalHeight,
        );
        commitCallout(placed, startIdx, plan, spanCol, part > 0 || action.kind === 'split' ? fragmentRange(L, from, to) : undefined);
        // Floats first-referenced inside the box enqueue once its head is
        // committed, in reading order (same as the inline path).
        if (part === 0) for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
        // The new band starts on the grid right below the span column; nothing
        // to snap — `need` already bakes in `marginBottom`.
        pendingSpacing = 0;
        if (action.kind === 'whole') return true;
        // The rest opens the next page.
        from = to;
        part++;
        frameId = `block-${blockIdCounter++}`;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        forceHere = true;
        continue;
      }

      // Nothing of the box lands in this band.
      if (part === 0) {
        let proposedSpan = false;
        if (!fit && cap === undefined && bandStart && registeredBand
          && registeredBand.pageIndex === page.index
          && registeredBand.band === currentBand(page, cursor)) {
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
          const spacing = Math.max(pendingSpacing, result.marginTopPx);
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
              startContentIndex: bandStart.contentIndex,
              startPart: bandStart.part,
              lines,
              retries: 0,
            });
            proposedSpan = true;
          }
        }
        if (levelBefore && !capActive && !proposedSpan) {
          // The box leaves an uncapped band: level it behind the box (a
          // trailing cap, resolved after balancing) and keep balancing from
          // stretching its last column to the page bottom meanwhile.
          proposeTrailingCap(startIdx);
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
        pendingSpacing = 0;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
          const style = plan ? pickCalloutStyle(resolved.calloutStyles, plan.attrs.type) : undefined;
          return style?.floatBarrier === true;
        }
        continue;
      }
      if (b.type === 'heading' && b.level) {
        const level = headingLevelByNumber.get(b.level);
        return level?.breakBefore?.enabled === true || level?.span === 'page';
      }
      return false;
    }
    return true;
  };

  const rectsOverlap = (a: BoundingBox, b: BoundingBox): boolean =>
    a.x < b.x + b.width - 0.5 && a.x + a.width > b.x + 0.5
    && a.y < b.y + b.height - 0.5 && a.y + a.height > b.y + 0.5;

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
      const ref = anchor.to === 'page' ? designFrames.page
        : anchor.to === 'bleed' ? designFrames.bleed
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
      pendingSpacing = 0;
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
   * Place a `:::callout` inline at the current column width as one atomic
   * unit: the frame block followed by its children in the same column. The
   * box's `marginTop` collapses with the pending spacing; `marginBottom` is
   * baked into the post-box grid snap. A box that does not fit moves to the
   * next column/page (like a resource), pulling a run of trailing headings
   * along (keep-with-next); a box taller than an empty column is placed
   * anyway and overflows (the sandbox warns). A splittable box
   * (`keepTogether: false`) instead leaves the longest run of its children
   * that fits in the column and continues — in a box of its own, without
   * the title or icon — at the top of the next one, splitting again if needed.
   * Returns the content index to rewind the main loop to when headings
   * were rolled back, else `undefined`.
   *
   * `span: 'page'` boxes in multi-column layouts take the span-block path
   * (`placeCalloutSpan`) instead; `placement: 'top' | 'bottom'` (floating
   * boxes) still fall back to this inline placement for v1 — the frame's
   * `callout.placement` records the request.
   */
  const placeCalloutInline = (startIdx: number, plan: PlannedCallout): number | undefined => {
    const style = pickCalloutStyle(resolved.calloutStyles, plan.attrs.type)!;
    const firstFrameId = `block-${blockIdCounter++}`;
    const { span, placement } = resolveCalloutAttrs(style, plan.attrs);
    const L = makeCalloutLayouter(startIdx, plan, style);
    const layoutAt = (width: number) => L.layoutRange(CUT_START, L.end, width, firstFrameId, false);

    // Fixed boxes leave the flow entirely.
    if (placement === 'fixed') {
      placeCalloutFixed(startIdx, plan, style, layoutAt);
      return undefined;
    }
    // Page-span boxes split a multi-column page into column bands (stage 1
    // of span blocks). Floating placements keep the inline fallback.
    {
      const page = doc.pages[cursor.pageIndex]!;
      if (
        span === 'page'
        && placement === 'here'
        && bandColumns(page, currentBand(page, cursor)).length > 1
        && placeCalloutSpan(startIdx, plan, style, L, firstFrameId)
      ) {
        return undefined;
      }
    }

    const splittable = !style.keepTogether;
    let from: CalloutCut = CUT_START;
    let part = 0;
    let frameId = firstFrameId;
    /** Times the box left an EMPTY short column (see below) — bounded. */
    let shortColumnMoves = 0;
    for (;;) {
      let curCol = currentColumn(doc, cursor);
      const continuation = part > 0;
      const result = L.layoutRange(from, L.end, curCol.bbox.width, frameId, continuation);
      // Column balancing: a box closing its column takes the column's gap
      // above it (the trailing-callout lever), so its foot lands on the
      // last grid slot — level with the column beside it. Any fragment
      // qualifies, as long as something sits above it to push down from:
      // text, or the float band at the head of an otherwise empty column.
      const balanceBefore = curCol.blocks.length > 0 || reservedOf(curCol).top > 0
        ? (balanceExtraPx?.get(balanceKey(startIdx, part)) ?? 0)
        : 0;
      const spacing = (curCol.blocks.length === 0 ? 0 : Math.max(pendingSpacing, result.marginTopPx)) + balanceBefore;
      const roomPx = curCol.availableHeight - spacing;
      let fragment: CalloutFragment | null = null;
      if (result.totalHeight > roomPx + 0.01) {
        // The (rest of the) box does not fit the column: a splittable box
        // leaves the head that fits here…
        if (splittable) fragment = splitCalloutFragment(L, from, curCol.bbox.width, roomPx, frameId, continuation, style.splitMinLines);
        // …otherwise it moves whole to the next column — also out of an
        // EMPTY column that float bands or a band cap have cut short, when
        // a full column would hold it (bounded, so a run of short columns
        // cannot make it wander forever). Only a box taller than a full
        // column is placed anyway, overflowing (a layout warning says so).
        const shortColumn = shortColumnMoves < 4
          && curCol.bbox.height < contentArea.height - baselineGrid
          && result.totalHeight <= contentArea.height + 0.01;
        if (!fragment && (curCol.blocks.length > 0 || shortColumn)) {
          if (curCol.blocks.length === 0) shortColumnMoves++;
          // …otherwise it moves whole to the next column. Keep-with-next: a
          // run of headings at the column's tail travels with the box.
          // Skipped when the column holds nothing else (rolling back again
          // would loop) — the headings stay, orphaned. Only the head of a
          // box can roll headings back: a continuation always lands in a
          // fresh column.
          let run = 0;
          for (let j = curCol.blocks.length - 1; j >= 0; j--) {
            if (isFreeHeading(curCol.blocks[j]!)) run++;
            else break;
          }
          pendingSpacing = 0;
          if (part === 0 && resolved.headings.keepWithNext && run > 0 && run < curCol.blocks.length) {
            const rolledBack = rollbackTrailingBlocks(curCol, doc.blocks, isFreeHeading);
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            return (rolledBack[0]!.contentIndex ?? startIdx - rolledBack.length) - 1;
          }
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
      // enqueue them twice).
      if (part === 0) for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
      const placed = fragment ? fragment.result : result;
      const to = fragment ? fragment.to : L.end;
      if (part > 0 || fragment) markFragment(placed, part, fragment !== null);
      const spacingBefore = (curCol.blocks.length === 0 ? 0 : Math.max(pendingSpacing, placed.marginTopPx)) + balanceBefore;
      if (balanceBefore > 0) addBalanceExtra(curCol, balanceBefore);
      // Spacing collapses at a column top, so the lever's push under a
      // float band is consumed here: the box then opens that far down.
      if (balanceBefore > 0 && curCol.blocks.length === 0) {
        curCol.availableHeight = Math.max(0, curCol.availableHeight - balanceBefore);
      }
      enterBand(startIdx, 0);
      placeAtomicBlock(
        placed.frame, placed.totalHeight, spacingBefore, cursor, doc, resolved,
        contentArea, pageWidthPx, pageHeightPx,
      );
      enterBand(startIdx, 0);
      curCol = currentColumn(doc, cursor);
      commitCallout(placed, startIdx, plan, curCol, part > 0 || fragment ? fragmentRange(L, from, to) : undefined);
      // Snap the flow after the box to the baseline grid, baking in at least
      // `marginBottom` (grid wins, margin is a minimum — the resource rule).
      {
        const usedHeight = curCol.bbox.height - curCol.availableHeight;
        const naturalBottom = usedHeight + placed.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        curCol.availableHeight = Math.max(0, curCol.bbox.height - snappedBottom);
      }
      pendingSpacing = 0;
      if (!fragment) return undefined;
      // The rest continues at the top of the next column.
      from = to;
      part++;
      frameId = `block-${blockIdCounter++}`;
      advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
    }
  };

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
    options?.onProgress?.({ pass: 1, blocks: blockIdx, totalBlocks: contentBlocks.length, pages: doc.pages.length });
    const rawBlock = contentBlocks[blockIdx]!;

    // Floats whose reference landed in an earlier iteration take the first
    // free slot of the current page now — after their reference in reading
    // order. Then enqueue the floats first-referenced in this block, so the
    // next page opened while placing it (or any later block) reserves their
    // band and the next iteration offers them the slots that follow.
    tryPlacePendingFloatsOnCurrentPage(spanBoxAt(blockIdx), blockIdx);
    enqueueFloatsFor(blockIdx);

    // --- Directives ----------------------------------------------------
    if (rawBlock.type === 'directive') {
      const name = rawBlock.directiveName;
      const attrs = rawBlock.directiveAttrs ?? {};
      if (name === 'pagebreak') {
        pendingSpacing = 0;
        markForcedBreak();
        advanceToNextPageBoundary(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        const parity = attrs.parity;
        if (
          parity === 'odd'
          || parity === 'even'
          || parity === 'always-odd'
          || parity === 'always-even'
        ) {
          enforcePageParity(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, parity);
        }
        // Pending floats land on the page that follows the break — after
        // parity padding, so a blank parity page never carries a float.
        flushFloatsIntoPage(doc.pages[cursor.pageIndex]!);
        flushPendingNumberingAtBoundary();
      } else if (name === 'columnbreak') {
        // Explicit column break: end the current column here (its bottom
        // gap is intentional, so balancing skips it) and continue in the
        // next column. A no-op in an empty column, so it never opens a
        // blank column or page.
        pendingSpacing = 0;
        const col = currentColumn(doc, cursor);
        if (col.blocks.length > 0) {
          col.forcedBreak = true;
          const page = doc.pages[cursor.pageIndex]!;
          if (cursor.columnIndex === page.columns.length - 1) markForcedBreak();
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
          flushPendingNumberingAtBoundary();
        }
      } else if (name === 'numbering') {
        const change: { format?: NumeralStyle; startAt?: number } = {};
        const fmt = attrs.format as NumeralStyle | undefined;
        if (fmt && ALLOWED_PAGE_FORMATS.has(fmt)) change.format = fmt;
        if (attrs.startAt !== undefined) {
          const n = Number(attrs.startAt);
          if (Number.isInteger(n) && n >= 1) change.startAt = n;
        }
        if (Object.keys(change).length > 0) pendingNumberingChange = change;
      }
      continue;
    }

    // --- Container markers ---------------------------------------------
    // `:::paragraphs` applies its style's top margin on entry through the
    // pending-spacing mechanism (collapses like any margin, vanishes at a
    // column top). Its bottom margin is normally baked into the last
    // paragraph's grid snap; the pending-spacing fallback covers containers
    // that end with a non-paragraph block. Replaying a marker after a keep-with-next rewind is
    // harmless: the container plan is index-based, and `max` is idempotent.
    // `:::part`: the opener lives on a dedicated single-column page. On
    // entry, break to a fresh page of the configured parity and convert it
    // into a part page; on exit, break again so the following content (and
    // the next chapter's own parity rule) starts clean. A part page counts
    // as content even with an empty body — its opener design fills it — so
    // consecutive parts never share a page.
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockIdx);
      if (plan) {
        pendingSpacing = 0;
        closeFlowSegment(blockIdx);
        leaveCurrentPage();
        enforcePageParity(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, resolved.parts.breakBefore.parity);
        cursor.columnIndex = 0;
        // Map the opener's title back to the `title="…"` attribute of the
        // fence so the editor can place the cursor from a click on the band.
        const fenceStart = rawBlock.sourceStart + bodyOffset;
        const fenceText = markdownBody.slice(rawBlock.sourceStart, rawBlock.sourceEnd);
        const titleAttr = /\btitle\s*=\s*(["'])/.exec(fenceText);
        const titleSourceStart = titleAttr ? fenceStart + titleAttr.index + titleAttr[0].length : fenceStart;
        const titleSourceEnd = titleAttr ? titleSourceStart + plan.title.length : rawBlock.sourceEnd + bodyOffset;
        createPartPage(doc.pages[cursor.pageIndex]!, pageMetrics, resolved, {
          number: plan.number,
          title: plan.title,
          palette: plan.palette,
          titleSourceStart,
          titleSourceEnd,
        }, pageIndexOffset);
        flushPendingNumberingAtBoundary();
        continue;
      }
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerName === 'part') {
      const plan = partPlan.byEnd.get(blockIdx);
      if (plan) {
        pendingSpacing = 0;
        // Deferred until the next placed block so a part that closes the
        // document leaves no trailing empty page behind.
        if (resolved.parts.breakAfter.enabled) pendingPartBreak = resolved.parts.breakAfter.parity;
        continue;
      }
    }
    if (pendingPartBreak !== null) {
      const parity = pendingPartBreak;
      pendingPartBreak = null;
      pendingSpacing = 0;
      closeFlowSegment(blockIdx);
      leaveCurrentPage();
      enforcePageParity(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, parity);
      flushPendingNumberingAtBoundary();
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout') {
      const plan = calloutPlan.get(blockIdx);
      if (plan && pickCalloutStyle(resolved.calloutStyles, plan.attrs.type)) {
        // A float barrier box (e.g. a chapter's closing "key points")
        // takes every pending float first — in the current page's free
        // slots, else on pages opened ahead of it — so no float escapes
        // past it. The page stays balanceable (no forced break).
        // A page-span barrier box drains inside `placeCalloutSpan`, once
        // the page-span figures before it have taken the band cut.
        if (pickCalloutStyle(resolved.calloutStyles, plan.attrs.type)!.floatBarrier && !spanBoxAt(blockIdx)) {
          tryPlacePendingFloatsOnCurrentPage();
          drainPendingFloats();
        }
        // `span: 'page'` boxes in multi-column layouts branch to the
        // span-block path inside; `placement: 'top' | 'bottom'` still
        // falls back to inline placement (floating boxes pending).
        const rewind = placeCalloutInline(blockIdx, plan);
        // Children were laid out inside the box — skip them in the main loop
        // (the for-loop's `++` lands just past the closing marker).
        blockIdx = rewind !== undefined ? rewind : plan.endIdx;
        flushPendingNumberingAtBoundary();
        continue;
      }
    }
    if (rawBlock.type === 'containerStart' || rawBlock.type === 'containerEnd') {
      const pc = rawBlock.containerId !== undefined
        ? paragraphContainers.byId.get(rawBlock.containerId)
        : undefined;
      if (pc) {
        // Margins collapse with the pending spacing; a negative one pulls
        // the flow up past it instead (the container starts inside the
        // space the previous block left, or the next block inside the
        // container's).
        const collapse = (margin: number): number =>
          margin < 0 ? pendingSpacing + margin : Math.max(pendingSpacing, margin);
        if (rawBlock.type === 'containerStart') {
          pendingSpacing = collapse(pc.marginTopPx);
        } else if (contentBlocks[blockIdx - 1]?.type !== 'paragraph') {
          pendingSpacing = collapse(pc.marginBottomPx);
        }
      }
      continue;
    }

    // --- Heading `breakBefore` ----------------------------------------
    if (rawBlock.type === 'heading' && rawBlock.level) {
      const level = headingLevelByNumber.get(rawBlock.level);
      const bb = level?.breakBefore;
      if (bb && bb.enabled) {
        pendingSpacing = 0;
        closeFlowSegment(blockIdx);
        advanceToNextPageBoundary(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        if (bb.parity !== 'any') {
          enforcePageParity(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, bb.parity);
        }
        flushPendingNumberingAtBoundary();
      }
      // `span: 'page'` headings open a chapter band across the full content
      // width. Always start on a fresh page boundary so the band sits at the
      // page top, and reset the cursor to column 0 so all other columns will
      // have their availableHeight reduced symmetrically after placement.
      if (level?.span === 'page') {
        pendingSpacing = 0;
        closeFlowSegment(blockIdx);
        advanceToNextPageBoundary(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        cursor.columnIndex = 0;
        flushPendingNumberingAtBoundary();
      }
    }

    const id = `block-${blockIdCounter++}`;

    // Enclosing `:::paragraphs` container (if any). Its last paragraph — the
    // one directly before the closing marker — carries the tail style and
    // snaps the flow back onto the baseline grid.
    const paragraphContainer = paragraphContainers.byBlock[blockIdx];
    const nextRaw = contentBlocks[blockIdx + 1];
    const isContainerTail = paragraphContainer !== undefined
      && nextRaw?.type === 'containerEnd'
      && nextRaw.containerId === paragraphContainer.id;

    // Measure against the current column width. `null` means there is nothing
    // to place inline (empty text, unknown resource id, floated resource).
    const col = currentColumn(doc, cursor);
    const blockMeasureCtx = partPlan.byBlock[blockIdx] ? partMeasureCtx : measureCtx;
    const styleOverride = paragraphContainer
      ? (isContainerTail ? paragraphContainer.tailStyle : paragraphContainer.style)
      : undefined;
    // Column balancing "run a paragraph long": the loose path is taken only
    // for the paragraphs the driver asked for, so the common case keeps its
    // existing measurement cache keys.
    const looseLines = balanceLooseness?.get(blockIdx);
    const budget = balanceLooseBudget?.get(blockIdx);
    // A candidate already known to have gained its line (from an earlier
    // measurement in this pass) keeps it; one whose column met its budget
    // is left as it is. Others walk the ladder and report their outcome.
    const knownOutcome = looseOutcome.get(blockIdx);
    const budgetMet = budget !== undefined
      && knownOutcome === undefined
      && (looseGained.get(budget.group) ?? 0) >= budget.need;
    const tryLoose = looseLines !== undefined && !budgetMet && knownOutcome !== null;
    const measuredBlock = tryLoose
      ? measureLooseParagraph(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, styleOverride, looseLines, trackingLadder, looseOutcome)
      : measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride });
    if (tryLoose && budget !== undefined && knownOutcome === undefined && typeof looseOutcome.get(blockIdx) === 'number') {
      looseGained.set(budget.group, (looseGained.get(budget.group) ?? 0) + 1);
    }
    if (!measuredBlock) continue;
    const { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender, letterSpacingPx } = measuredBlock;
    const { style, vdtType, headingLevel, numberPrefix, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;

    // --- Resource blocks (image / svg / table + caption) -----------------
    // Placed atomically (kept-together) — no mid-content split for v1.
    if (vdtType === 'resource') {
      const resourceBlock = measuredBlock.resourceBlock!;
      const groupHeight = measured.totalHeight;
      const blk = createVDTBlock(id, 'resource', style.fontString, style.color, style.textAlign);
      blk.contentIndex = blockIdx;
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
      const spacingBefore = pendingSpacing;
      enterBand(blockIdx, 0);
      placeAtomicBlock(
        blk, groupHeight, spacingBefore, cursor, doc, resolved,
        contentArea, pageWidthPx, pageHeightPx,
      );
      enterBand(blockIdx, 0);
      // `placeBlockInColumn` (inside placeAtomicBlock) shifts `blk.lines`; the
      // resource's own caption/table lines live on `resourceBlock` and must be
      // offset to absolute page coordinates here using the placed bbox origin.
      offsetResourceBlockToAbsolute(resourceBlock, blk.bbox.x, blk.bbox.y);
      doc.blocks.push(blk);
      // Snap the flow position after the resource to the baseline grid (the
      // group height is arbitrary), baking in at least marginBottom — same
      // convention as snapped headings — so the following text lands back on
      // the global grid instead of inheriting the resource's offset.
      {
        const rCol = currentColumn(doc, cursor);
        const usedHeight = rCol.bbox.height - rCol.availableHeight;
        const naturalBottom = usedHeight + style.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        rCol.availableHeight = Math.max(0, rCol.bbox.height - snappedBottom);
      }
      pendingSpacing = 0;
      flushPendingNumberingAtBoundary();
      continue;
    }


    const finalizeListItem = (blk: VDTBlock, isFirstPart: boolean) => {
      if (!listBullet) return;
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // Bullet (and its positional metadata) only belongs on the first part of
      // a split list item; continuation parts render without a bullet.
      if (!isFirstPart) return;
      blk.bulletText = listBullet.bulletText;
      blk.bulletFontString = listBullet.bulletFontString;
      blk.bulletColor = listBullet.bulletColor;
      // `bulletXOffsetInColumn` is `indentPx` for unordered/task, and
      // `indentPx + (maxNumberWidth - thisNumberWidth)` for ordered — giving
      // the right-aligned separator.
      blk.bulletOffsetX = blk.bbox.x + bulletXOffsetInColumn;
      if (listBullet.separatorText !== undefined) {
        blk.separatorText = listBullet.separatorText;
        blk.separatorFontString = listBullet.separatorFontString;
        blk.separatorColor = listBullet.separatorColor;
        blk.separatorX = blk.bulletOffsetX + (listBullet.separatorOffsetPx ?? 0);
      }
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size.
      const firstLine = blk.lines[0];
      if (firstLine) {
        blk.bulletY = firstLine.baseline - listBullet.textFontSizePx * 0.3 + listBullet.verticalOffsetPx;
      }
    };

    // Neighbour lookaheads see through container markers.
    const nextBlock = nextNonMarkerBlock(contentBlocks, blockIdx) ?? null;
    const nextIsListItem = nextBlock?.type === 'listItem';

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen. And for the last
    // paragraph of a `:::paragraphs` container, whose leading and spacing
    // are off-grid by design.
    const nextIsHeading = nextBlock?.type === 'heading';
    const shouldSnapToGrid =
      (vdtType === 'heading' && !nextIsHeading) ||
      (vdtType === 'listItem' && !nextIsListItem) ||
      (vdtType === 'paragraph' && isContainerTail) ||
      vdtType === 'mathDisplay';

    // Place block, splitting across columns/pages if needed.
    // List items may split too — orphan/widow protection per-list is gated by
    // `avoidOrphansInLists` / `avoidWidowsInLists`; bullet stays on first part.
    const canSplit = vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem';
    // A justified line the breaker could not fill (a link breaking at its
    // joints, a last word that cannot come up) is set ragged, not stretched.
    let remainingLines = [...raggedLooseLines(measured.lines, style.textAlign)];
    let partIndex = 0;
    /** Times this block left an EMPTY short column (see `shortColumn`) —
     *  bounded so a page whose columns are all short (footnotes, design
     *  bands) cannot make it wander forever. */
    let shortColumnMoves = 0;

    // "Keep with next" for colon-introduced lists: a paragraph ending in `:`
    // followed directly by a list acts as a lead-in title — the colon-bearing
    // line must share a column with the first list item. Only checked for the
    // original, unsplit paragraph (partIndex === 0) on the iteration that is
    // about to place it.
    const endsWithColon = vdtType === 'paragraph'
      && resolved.bodyText.keepColonWithList
      && nextIsListItem
      && /:\s*$/.test(contentBlock.text);

    while (remainingLines.length > 0) {
      enterBand(blockIdx, partIndex);
      const curCol = currentColumn(doc, cursor);
      const isFirstInColumn = curCol.blocks.length === 0;

      // Compute spacing before this block — margin collapsing between
      // consecutive headings: only the larger of marginBottom / marginTop applies
      let spacingBefore = 0;
      if (!isFirstInColumn) {
        spacingBefore = pendingSpacing;
        if (vdtType === 'heading' || vdtType === 'mathDisplay') {
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
          // Column balancing: extra whole grid lines above this heading so
          // the column it sits in ends flush with the page bottom. Applied
          // after margin collapsing — the heading's effective top margin
          // grows by the assigned lines. Suppressed for first-in-column
          // headings (no top margin there), keeping columns starting at the
          // page top.
          if (vdtType === 'heading') {
            const extraPx = balanceExtraPx?.get(blockIdx);
            if (extraPx) {
              spacingBefore += extraPx;
              addBalanceExtra(curCol, extraPx);
            }
          }
        } else if (vdtType === 'listItem') {
          const prevWasList = prevNonMarkerBlock(contentBlocks, blockIdx)?.type === 'listItem';
          if (!prevWasList) {
            spacingBefore = Math.max(spacingBefore, style.marginTopPx);
          }
        }
        // Column balancing: extra grid lines above a non-heading balance
        // target — the first block after a list end. Heading targets are
        // handled inside the heading branch above (after margin collapsing).
        if (vdtType !== 'heading' && vdtType !== 'mathDisplay' && partIndex === 0) {
          const extraPx = balanceExtraPx?.get(blockIdx);
          if (extraPx) {
            spacingBefore += extraPx;
            addBalanceExtra(curCol, extraPx);
          }
        }
      } else if (partIndex === 0 && reservedOf(curCol).top > 0) {
        // Column balancing: extra grid lines between the float band at the
        // head of this column and its first block (the after-float lever).
        const extraPx = balanceExtraPx?.get(blockIdx);
        if (extraPx) {
          spacingBefore += extraPx;
          addBalanceExtra(curCol, extraPx);
        }
      }
      // A loose paragraph's extra line is balancing height too (it lands
      // whole in this column — loose candidates are never split parts).
      if (partIndex === 0 && tryLoose && looseLines !== undefined && typeof looseOutcome.get(blockIdx) === 'number') {
        addBalanceExtra(curCol, looseLines * style.lineHeightPx);
      }

      const effectiveAvailable = curCol.availableHeight - spacingBefore;
      const linesPerAvailable = Math.floor(effectiveAvailable / style.lineHeightPx);
      // Math display blocks carry their natural pixel height on the single
      // VDTLine; text blocks use the uniform body lineHeightPx per line.
      const totalRemainHeight = vdtType === 'mathDisplay'
        ? (remainingLines[0]?.bbox.height ?? style.lineHeightPx)
        : remainingLines.length * style.lineHeightPx;

      // For headings with an enabled advanced-design slot, the rendered
      // overlay may extend below the natural text bottom. Measure the slot's
      // actual content bottom so the reserved block height (and the
      // subsequent marginBottom + grid snap) starts from there.
      let effectiveRemainHeight = totalRemainHeight;
      if (vdtType === 'heading' && headingLevel !== undefined && partIndex === 0) {
        const lvl = headingLevelByNumber.get(headingLevel);
        if (lvl) {
          const full = remainingLines
            .map((ln) => (ln.segments ?? []).map((s) => s.text).join(''))
            .join(' ');
          const pref = numberPrefix ?? '';
          const title = applyTitleBreaks(
            pref && full.startsWith(`${pref} `) ? full.slice(pref.length + 1) : full,
            rawBlock.titleBreaks,
            rawBlock.text.length,
          );
          // Span-page openers lay out across the full content area (both
          // columns); in-column headings use just the column width.
          const pageArea = doc.pages[cursor.pageIndex]!.contentArea;
          const measureWidth = lvl.span === 'page' ? pageArea.width : curCol.bbox.width;
          const designBottom = measureHeadingAdvancedDesignHeight(
            lvl,
            { titleText: title, formattedNumber: pref, chapterNumber: pref, attrs: rawBlock.attrs },
            measureWidth,
            resolved.page.dpi,
            doc.metadata,
            cursor.pageIndex,
            designFrames,
            {
              x: lvl.span === 'page' ? pageArea.x : curCol.bbox.x,
              y: curCol.bbox.y + (curCol.bbox.height - curCol.availableHeight) + spacingBefore,
            },
          );
          if (designBottom > effectiveRemainHeight) effectiveRemainHeight = designBottom;
        }
      }

      // Keep-with-list: if this colon-paragraph would fit but would leave no
      // room for the first list item, split off the colon line (or push the
      // whole paragraph when it is a single line or the split would leave a
      // widow). Only applies to the original paragraph placement — once split,
      // the tail follows the list naturally in the next column.
      if (
        endsWithColon
        && partIndex === 0
        && totalRemainHeight <= effectiveAvailable
        && curCol.blocks.length > 0
      ) {
        const usedHeight = (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
        const paragraphBottom = usedHeight + totalRemainHeight;
        // Slack after the paragraph as the plain pass saw it: the height
        // balancing added above in this column is not room the list lost.
        const availableAfter = curCol.bbox.height - paragraphBottom + (balanceExtraInColumn.get(curCol) ?? 0);
        const nextListKind = (nextBlock as { listKind?: ListKind } | null)?.listKind ?? 'unordered';
        const nextListMarginDim = nextListKind === 'ordered'
          ? resolved.orderedLists.marginTop
          : resolved.unorderedLists.marginTop;
        const nextListMarginTopPx = dimensionToPx(nextListMarginDim, dpi, bodyStyle.fontSizePx);
        const effectiveGap = Math.max(style.marginBottomPx, nextListMarginTopPx);
        const minSpaceForList = effectiveGap + bodyStyle.lineHeightPx;
        if (availableAfter < minSpaceForList) {
          const effectiveWidowMin = resolved.bodyText.avoidWidows
            ? Math.max(1, resolved.bodyText.widowMinLines)
            : 1;
          const splitAt = remainingLines.length - 1;
          if (splitAt >= effectiveWidowMin) {
            if (spacingBefore !== 0) curCol.availableHeight -= spacingBefore;
            const splitLines = remainingLines.slice(0, splitAt);
            const blk = createVDTBlock(id, vdtType, style.fontString, style.color, style.textAlign);
            applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
            blk.contentIndex = blockIdx;
            blk.headingLevel = headingLevel;
            if (numberPrefix) blk.numberPrefix = numberPrefix;
            blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
            blk.dirty = false;
            blk.snappedToGrid = false;
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
            blk.sourceMap = absoluteSourceMap;
            blk.plainPrefixLen = prefixLen;
            placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
            doc.blocks.push(blk);
            remainingLines = remainingLines.slice(splitAt);
            partIndex++;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
          // Can't cleanly split the colon line off — would create a widow.
          // Pushing the whole paragraph keeps the colon+list together, but
          // strands any trailing heading(s) as last-in-column orphans. Roll
          // those along with the paragraph when there's non-heading content
          // before them; if the column contains only heading(s) (fresh after
          // a prior rollback), rolling back again would loop — fall through
          // and place the paragraph here, trading the heading-orphan for a
          // softer colon/list separation.
          let headingRunCount = 0;
          if (resolved.headings.keepWithNext) {
            for (let j = curCol.blocks.length - 1; j >= 0; j--) {
              if (curCol.blocks[j]!.type === 'heading' && curCol.blocks[j]!.containerId === undefined) headingRunCount++;
              else break;
            }
          }
          if (headingRunCount > 0 && headingRunCount < curCol.blocks.length) {
            const popped = curCol.blocks.splice(curCol.blocks.length - headingRunCount);
            for (const p of popped) {
              const idx = doc.blocks.indexOf(p);
              if (idx !== -1) doc.blocks.splice(idx, 1);
              curCol.availableHeight += p.bbox.height;
            }
            // Rewind so the for-loop's blockIdx++ lands on the first
            // rolled-back heading (marker blocks in between are replayed).
            blockIdx = (popped[0]!.contentIndex ?? blockIdx - headingRunCount) - 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
          if (headingRunCount === 0) {
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
          // headingRunCount === curCol.blocks.length: fall through to place.
        }
      }

      // A block opening a column normally stays (no column can take it any
      // better), except in a column at least a line shorter than the content
      // area — the band under a page-span box, or a column cut by a float:
      // a heading that fits there alone, or a block that does not fit there
      // but would fit a full column, opens the next column instead (the move
      // count is bounded besides). A column cut by a band cap is short on
      // purpose — its content is meant to end at the cut.
      const shortColumn = shortColumnMoves < 4
        && !uncappedBottoms.has(curCol)
        && curCol.bbox.height < contentArea.height - baselineGrid;

      // Block fits in current column (a hair of tolerance: a capped column
      // and the grid lines balancing adds above a block differ by floating
      // point noise, which must not push the block over the cut).
      if (effectiveRemainHeight <= effectiveAvailable + FIT_EPS) {
        // Heading keep-with-next: never leave a heading as the last block of a
        // column. If the following (non-heading) block wouldn't have room to
        // place at least its widow-minimum number of lines after this heading,
        // push the heading to the next column so it stays joined to its text.
        // The threshold matches the body's widow penalty so the body doesn't
        // just get pushed whole, leaving the heading orphaned anyway. When a
        // run of consecutive headings ends in a pushed heading, any preceding
        // headings already placed in this column are rolled back and re-placed
        // with it in the next column — otherwise the earlier headings would be
        // left behind as their own orphans.
        if (
          vdtType === 'heading'
          && resolved.headings.keepWithNext
          && !nextIsHeading
          && nextBlock !== null
          && (curCol.blocks.length > 0 || shortColumn)
        ) {
          const wouldUsedHeight =
            (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
          const naturalBottom = wouldUsedHeight + effectiveRemainHeight + style.marginBottomPx;
          const snappedBottom = shouldSnapToGrid
            ? Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid
            : naturalBottom;
          const remainAfterHeading = curCol.bbox.height - snappedBottom;
          const minLinesNeeded = resolved.bodyText.avoidWidows
            ? Math.max(1, resolved.bodyText.widowMinLines)
            : 1;
          const minSpaceAfter = minLinesNeeded * bodyStyle.lineHeightPx;
          if (remainAfterHeading < minSpaceAfter) {
            if (curCol.blocks.length === 0) shortColumnMoves++;
            // Roll back any immediately-preceding heading blocks in this
            // column so they travel with this one.
            const rolledBack = rollbackTrailingBlocks(curCol, doc.blocks, isFreeHeading);
            if (rolledBack.length > 0) {
              // Rewind so the for-loop's blockIdx++ lands on the first
              // rolled-back heading (marker blocks in between are replayed).
              blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
              pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
              break;
            }
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
        }

        // Consume spacing (negative: a container margin pulling the block up)
        if (spacingBefore !== 0) {
          curCol.availableHeight -= spacingBefore;
        }

        const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
        blk.contentIndex = blockIdx;
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
        if (partIndex === 0 && vdtType === 'heading' && rawBlock.attrs) blk.attrs = rawBlock.attrs;
        if (partIndex === 0 && vdtType === 'heading' && rawBlock.attrSources) {
          // Parser ranges are body-relative; VDT source offsets are absolute.
          blk.attrSources = Object.fromEntries(
            Object.entries(rawBlock.attrSources).map(([k, r]) => [k, { start: r.start + bodyOffset, end: r.end + bodyOffset }]),
          );
        }
      if (partIndex === 0 && vdtType === 'heading' && rawBlock.titleBreaks) {
        blk.titleBreaks = rawBlock.titleBreaks;
        blk.titleLength = rawBlock.text.length;
      }
        if (partIndex === 0 && vdtType === 'heading' && rawBlock.titleBreaks) {
          blk.titleBreaks = rawBlock.titleBreaks;
          blk.titleLength = rawBlock.text.length;
        }
        if (vdtType === 'mathDisplay' && mathDisplayRender) {
          blk.mathRender = mathDisplayRender;
          blk.tex = rawBlock.tex;
          // Place the single line using its natural height (not the body lineHeight).
          const mathLine = { ...remainingLines[0]!, bbox: { ...remainingLines[0]!.bbox, y: 0 } };
          blk.lines = [mathLine];
        } else {
          blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
        }
        blk.dirty = false;
        blk.snappedToGrid = shouldSnapToGrid && partIndex === 0;
        if (remainingLines.length > 0) {
          blk.sourceStart = remainingLines[0]!.sourceStart ?? rawBlock.sourceStart + bodyOffset;
          blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd ?? rawBlock.sourceEnd + bodyOffset;
        }
        if (vdtType === 'mathDisplay') {
          blk.sourceStart = rawBlock.sourceStart + bodyOffset;
          blk.sourceEnd = rawBlock.sourceEnd + bodyOffset;
        }
        blk.sourceMap = absoluteSourceMap;
        blk.plainPrefixLen = prefixLen;

        let h = effectiveRemainHeight;
        if (shouldSnapToGrid && partIndex === 0) {
          // Snap using the absolute position in the column so that the block
          // bottom lands on a baseline grid line. This accounts for off-grid
          // starts (e.g. after consecutive unsnapped headings) and bakes in
          // the minimum marginBottom — the grid always wins, but the margin
          // below is guaranteed to be at least marginBottomPx.
          const usedHeight = curCol.bbox.height - curCol.availableHeight;
          const naturalBottom = usedHeight + effectiveRemainHeight + style.marginBottomPx;
          // Tolerance guards against FP drift: if naturalBottom is already on
          // the grid (e.g. marginBottom is an exact multiple of baselineGrid),
          // don't round up to the next line.
          const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
          // A negative margin below a container tail may snap the flow back
          // above the text's own bottom; never below the block's top.
          h = Math.max(0, snappedBottom - usedHeight);
        }
        placeBlockInColumn(blk, h, curCol, cursor);
        finalizeListItem(blk, partIndex === 0);
        doc.blocks.push(blk);
        // Page-spanning heading: reserve the same vertical band in every
        // other column on this page so body text under the opener band
        // starts below it in ALL columns, not just the one it was placed in.
        if (vdtType === 'heading' && headingLevel !== undefined) {
          const lvl = headingLevelByNumber.get(headingLevel);
          if (lvl?.span === 'page') {
            const page = doc.pages[cursor.pageIndex]!;
            for (const otherCol of page.columns) {
              if (otherCol !== curCol) {
                otherCol.availableHeight = Math.max(0, otherCol.availableHeight - h);
              }
            }
          }
        }
        // For snapped headings/list-tails the margin is baked into the snap;
        // for unsnapped ones (consecutive) track it for collapsing
        if (vdtType === 'listItem' && nextIsListItem) {
          pendingSpacing = listBullet!.itemSpacingPx;
        } else {
          pendingSpacing = (shouldSnapToGrid && partIndex === 0) ? 0 : style.marginBottomPx;
        }
        break;
      }

      // Block doesn't fit — try to split (orphan/widow-aware)
      const inList = vdtType === 'listItem';
      const effectiveAvoidOrphans = resolved.bodyText.avoidOrphans
        && (!inList || resolved.bodyText.avoidOrphansInLists);
      const effectiveAvoidWidows = resolved.bodyText.avoidWidows
        && (!inList || resolved.bodyText.avoidWidowsInLists);
      if (canSplit && linesPerAvailable >= 1) {
        const choice = chooseParagraphSplit(remainingLines.length, linesPerAvailable, {
          avoidOrphans: effectiveAvoidOrphans,
          orphanMinLines: resolved.bodyText.orphanMinLines,
          orphanPenalty: resolved.bodyText.orphanPenalty,
          avoidWidows: effectiveAvoidWidows,
          widowMinLines: resolved.bodyText.widowMinLines,
          widowPenalty: resolved.bodyText.widowPenalty,
          slackWeight: resolved.bodyText.slackWeight,
        });
        if (choice.splitAt > 0) {
          // Consume spacing (negative: a container margin pulling the block up)
          if (spacingBefore !== 0) {
            curCol.availableHeight -= spacingBefore;
          }

          const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
          const splitLines = remainingLines.slice(0, choice.splitAt);

          const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
          applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
          blk.contentIndex = blockIdx;
          if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
          blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
          blk.dirty = false;
          blk.snappedToGrid = false;
          if (splitLines.length > 0) {
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
          }
          blk.sourceMap = absoluteSourceMap;
          blk.plainPrefixLen = prefixLen;

          const splitHeight = choice.splitAt * style.lineHeightPx;
          placeBlockInColumn(blk, splitHeight, curCol, cursor);
          finalizeListItem(blk, partIndex === 0);
          doc.blocks.push(blk);

          remainingLines = remainingLines.slice(choice.splitAt);
          partIndex++;
          pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
          continue;
        }
        // choice.splitAt === 0: fall through to push whole paragraph to next column
      }

      // Cannot split — advance to next column if current has content (or
      // the column is a short band that cannot hold the block at all).
      if (curCol.blocks.length > 0 || (shortColumn && effectiveRemainHeight <= contentArea.height)) {
        if (curCol.blocks.length === 0) shortColumnMoves++;
        // Heading keep-with-next (no-fit variant): when a heading can't fit
        // in the current column and the column's tail is a run of headings,
        // pull those headings along so they don't remain stranded as orphans
        // at the column's bottom. Mirrors the rollback inside the "fits" path.
        if (vdtType === 'heading' && resolved.headings.keepWithNext) {
          const rolledBack = rollbackTrailingBlocks(curCol, doc.blocks, isFreeHeading);
          if (rolledBack.length > 0) {
            blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
        }
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column with less than a line of room (a band cap cutting right
      // under a float band, a column swallowed by reservations): nothing can
      // go here — move on. The next column, or a fresh page, has room.
      if (curCol.availableHeight < style.lineHeightPx - 0.01 && totalRemainHeight > curCol.availableHeight + 0.01) {
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
      blk.contentIndex = blockIdx;
      if (partIndex === 0) blk.headingLevel = headingLevel;
      if (partIndex === 0 && vdtType === 'heading' && rawBlock.attrs) blk.attrs = rawBlock.attrs;
        if (partIndex === 0 && vdtType === 'heading' && rawBlock.attrSources) {
          // Parser ranges are body-relative; VDT source offsets are absolute.
          blk.attrSources = Object.fromEntries(
            Object.entries(rawBlock.attrSources).map(([k, r]) => [k, { start: r.start + bodyOffset, end: r.end + bodyOffset }]),
          );
        }
      if (partIndex === 0 && vdtType === 'heading' && rawBlock.titleBreaks) {
        blk.titleBreaks = rawBlock.titleBreaks;
        blk.titleLength = rawBlock.text.length;
      }
      blk.lines = resetLinePositions(remainingLines, style.lineHeightPx);
      blk.dirty = false;
      blk.snappedToGrid = false;
      if (remainingLines.length > 0) {
        blk.sourceStart = remainingLines[0]!.sourceStart;
        blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd;
      }
      blk.sourceMap = absoluteSourceMap;
      blk.plainPrefixLen = prefixLen;

      placeBlockInColumn(blk, totalRemainHeight, curCol, cursor);
      finalizeListItem(blk, partIndex === 0);
      doc.blocks.push(blk);
      if (vdtType === 'listItem') {
        pendingSpacing = nextIsListItem ? listBullet!.itemSpacingPx : style.marginBottomPx;
      } else {
        pendingSpacing = style.marginBottomPx;
      }
      break;
    }

    flushPendingNumberingAtBoundary();
  }

  // End of the document: level the closing band and place any floats still
  // pending (referenced on the last page) on pages appended after it.
  closeFlowSegment(contentBlocks.length);

  // Stamp page-number info onto every page (including blank parity pages).
  const labels = buildPageLabels(doc.pages.length, pageNumberSegments);
  for (let i = 0; i < doc.pages.length; i++) {
    const info = labels[i];
    if (!info) continue;
    const page = doc.pages[i]!;
    page.pageNumberValue = info.value;
    page.pageLabel = info.label;
    page.pageNumberFormat = info.format;
  }

  buildHeadersAndFooters(doc);

  doc.converged = true;
  doc.iterationCount = 1;

  return { doc, forcedBreakPages, bandCapProposals, spanPlacedInBand, bandCapsApplied, looseOutcome };
}

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): VDTDocument {
  // Each pass reports its own progress, numbered in build order.
  let passIndex = 0;
  const onProgress = options?.onProgress;
  const passOptions: BuildDocumentOptions | undefined = onProgress
    ? { ...options, onProgress: (p) => onProgress({ ...p, pass: passIndex }) }
    : options;
  const runPass = (hints?: PassHints): PassResult => {
    passIndex++;
    return buildDocumentPass(content, config, cache, passOptions, hints);
  };

  // --- Band caps (page-span blocks mid-page) -----------------------------
  // A span block that arrived in an uneven band proposes a cap; the driver
  // re-places the document with it (and grows / drops caps whose band
  // overflowed) before balancing runs. Documents without such blocks get
  // their first pass back untouched — no extra pass.
  const bands = resolveBandCaps(runPass(), (bandCaps) => runPass({ bandCaps }));
  let best = bands.result;
  const bandCaps = bands.bandCaps;
  let passCount = bands.passCount;
  best.doc.iterationCount = passCount;
  /** Hints that produced `best` (replayed by the trailing-cap passes). */
  let bestHints: PassHints = { bandCaps };

  // --- Column balancing (vertical justification) ------------------------
  // Iteratively re-place the document with extra grid lines above headings
  // until every balanceable column ends flush with the page bottom (or no
  // further adjustment is possible). Each retry recomputes the remaining
  // gaps on the freshly placed document, so split/keep-with-next decisions
  // that shift under the new spacing are accounted for. The best layout
  // (fewest leftover gap lines) always wins — a retry that regresses is
  // discarded.
  const balancing = best.doc.config.headings.balancing;
  if (!balancing.enabled) return best.doc;

  let bestScore = totalGapLines(best.doc, best.forcedBreakPages);
  let applied: BalanceState = { lines: new Map(), loose: new Map() };
  const failedLoose = new Set<number>();
  const failedLines = new Set<number>();
  let converged = bestScore === 0;

  /**
   * A rejected pass moved content across a column break somewhere (a
   * split paragraph whose head no longer fits, a float that lost its slot,
   * a lead-in that left with its list…): every page after that point is
   * re-flowed, gaps open elsewhere and a span cap may miss its band. The
   * levers are meant to be local, so contain the damage: find the first
   * column whose content changed and blacklist the levers this pass newly
   * applied there (failing that, on its page; failing that, everywhere), so
   * the next proposal keeps the working levers before it and tries again
   * without the one that cascaded. Returns whether anything was blacklisted.
   */
  const containCascade = (next: PassResult, proposal: BalanceProposal): boolean => {
    const div = firstDivergentColumn(best.doc, next.doc);
    if (!div) return false;
    const newLines = [...proposal.lines].filter(([k, n]) => n > (applied.lines.get(k) ?? 0)).map(([k]) => k);
    const newLoose = [...proposal.loose.keys()].filter((k) => !applied.loose.has(k));
    if (newLines.length === 0 && newLoose.length === 0) return false;
    const gaps = collectColumnGaps(best.doc, best.forcedBreakPages);
    const blacklist = (cands: ReadonlySet<number> | null): boolean => {
      let hit = false;
      for (const k of newLines) if (!cands || cands.has(k)) { failedLines.add(k); hit = true; }
      for (const k of newLoose) if (!cands || cands.has(k)) { failedLoose.add(k); hit = true; }
      return hit;
    };
    const inColumn = gaps
      .filter((g) => g.pageIndex === div.pageIndex && g.columnIndex === div.columnIndex)
      .flatMap((g) => g.candidates.map((c) => balanceKey(c.contentIndex, c.part ?? 0)));
    if (blacklist(new Set(inColumn))) return true;
    const onPage = gaps
      .filter((g) => g.pageIndex === div.pageIndex)
      .flatMap((g) => g.candidates.map((c) => balanceKey(c.contentIndex, c.part ?? 0)));
    if (blacklist(new Set(onPage))) return true;
    return blacklist(null);
  };

  const balance = (): void => {
    while (!converged && passCount < MAX_BALANCING_PASSES) {
      const proposal = proposeBalanceLines(best.doc, best.forcedBreakPages, applied, {
        maxLinesPerHeading: balancing.maxLinesPerHeading,
        stretchAfterLists: balancing.stretchAfterLists,
        maxLinesAfterList: balancing.maxLinesAfterList,
        stretchAfterFloats: balancing.stretchAfterFloats,
        maxLinesAfterFloat: balancing.maxLinesAfterFloat,
        looseParagraphs: balancing.looseParagraphs,
        maxLooseParagraphs: balancing.maxLooseParagraphs,
        optimalLineBreaking: best.doc.config.bodyText.optimalLineBreaking,
        failedLoose,
        failedLines,
      });
      if (!proposal.changed) {
        // No stretch point can absorb the remaining gaps — stable.
        converged = true;
        break;
      }
      const extraPx = new Map<number, number>();
      for (const [idx, n] of proposal.lines) extraPx.set(idx, n * best.doc.baselineGrid);
      const hints: PassHints = {
        balanceExtraPx: extraPx,
        balanceLooseness: proposal.loose,
        balanceLooseBudget: proposal.looseBudget,
        bandCaps,
      };
      const next = runPass(hints);
      passCount++;
      // Band caps ride along unchanged; a retry that unsettles one (its span
      // block no longer lands in the capped band, or a levelled closing band
      // spills past its cut) counts as a regression — capped columns without
      // their box are not a layout we may keep.
      const capsDelivered = [...bandCaps.keys()].every((i) => next.spanPlacedInBand.has(i));
      const score = capsDelivered ? totalGapLines(next.doc, next.forcedBreakPages) : Infinity;
      // Loose paragraphs that gained no line at any tracking rung are
      // blacklisted whatever the score did, and never counted as applied.
      // Candidates the pass never tried (their column's budget was met
      // first) stay eligible for a later proposal.
      const newlyLoose = [...proposal.loose.keys()].filter((k) => !applied.loose.has(k));
      const looseFailed = newlyLoose.filter((k) => next.looseOutcome.get(k) === null);
      for (const k of looseFailed) failedLoose.add(k);
      const looseWon = newlyLoose.filter((k) => typeof next.looseOutcome.get(k) === 'number');
      if (score < bestScore) {
        best = next;
        bestHints = hints;
        bestScore = score;
        applied = {
          lines: proposal.lines,
          loose: new Map([...proposal.loose].filter(([k]) => applied.loose.has(k) || looseWon.includes(k))),
        };
        converged = score === 0;
      } else {
        // Plateau or regression. First contain a cascade: a lever that
        // moved content across a column break is blacklisted and the loop
        // retries without it. Otherwise retry when a loose candidate was
        // just blacklisted (the proposer falls through to the next one), or
        // when the new loose paragraphs gained their lines yet the layout
        // did not improve (the gain landed elsewhere — drop them too). A
        // pure spacing plateau means we're done: keep the best layout found
        // so far.
        if (containCascade(next, proposal)) continue;
        if (looseFailed.length > 0 || looseWon.length > 0) {
          for (const k of looseWon) failedLoose.add(k);
          continue;
        }
        break;
      }
    }
  };

  balance();

  // --- Trailing bands (closing columns cut level) -------------------------
  // Once the balancing levers have settled the earlier pages, level the
  // closing band of every chapter / the document with a trailing cap. It is
  // resolved AFTER balancing because a cap is keyed by the block that opens
  // its band, and that block moves whenever an earlier page absorbs extra
  // lines; with the balancing hints frozen the band opens with the same
  // block and the cap applies. A short polish round then lets the levers
  // fill what the cut left short (a column ending a line under the cap).
  if (balancing.trailing) {
    const trailing = resolveTrailingCaps(
      best,
      bandCaps,
      (caps) => runPass({ ...bestHints, bandCaps: caps }),
    );
    passCount += trailing.passCount;
    if (trailing.result !== best) {
      best = trailing.result;
      for (const [i, cap] of trailing.caps) bandCaps.set(i, cap);
      bestHints = { ...bestHints, bandCaps };
      bestScore = totalGapLines(best.doc, best.forcedBreakPages);
      converged = bestScore === 0;
      balance();
    }
  }

  best.doc.iterationCount = passCount;
  best.doc.converged = converged || bestScore === 0;
  return best.doc;
}
