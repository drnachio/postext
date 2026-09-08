import { applyTitleBreaks } from '../parse/inlineFormatting';
import type { PostextContent, PostextConfig, Resource, ResourceType, HeadingBreakParity } from '../types';
import type { ListKind } from '../parse';
import { dimensionToPx } from '../units';
import {
  createVDTDocument,
  createVDTBlock,
  createBoundingBox,
  type VDTDocument,
  type VDTBlock,
  type VDTColumn,
  type VDTPage,
  type ResolvedResourceBlock,
} from '../vdt';
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
import { resolveBodyStyle, resolveBlockquoteStyle } from './styles';
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
  nextNonMarkerBlock,
  prevNonMarkerBlock,
  rollbackTrailingBlocks,
} from './buildHelpers';
import { measureContentBlock, type BlockMeasureContext } from './measureContentBlock';
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
import { layoutResourceBlock } from './resourceLayout';
import {
  computeFloatPlan,
  floatedResourceIds,
  type PlannedFloat,
} from './floatPlacement';
import {
  computeHeadingContext,
  computeResourceNumbering,
  type ResourceNumberingMap,
} from './resourceNumbering';
import { defaultResourceTypes } from '../defaults/resourceTypes';
import { buildHeadersAndFooters, measureHeadingAdvancedDesignHeight } from './headerFooter';
import {
  totalGapLines,
  proposeBalanceLines,
  MAX_BALANCING_PASSES,
  type BalanceState,
} from './columnBalancing';
import {
  applyBandCap,
  uncapBand,
  columnBottom,
  bandCapLines,
  resolveBandCaps,
  type BandCap,
  type BandPassReport,
} from './bandCaps';

export interface BuildDocumentOptions {
  /**
   * Cooperative cancellation hook. Called once per top-level content block
   * during placement. Throw (or return a truthy value checked by the caller)
   * to abort. Intended for running `buildDocument` inside a Web Worker where
   * a newer request has superseded this one.
   */
  shouldCancel?: () => boolean;
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
  const { balanceExtraPx, balanceLooseness, bandCaps } = hints;
  const resolved = resolveAllConfig(config);
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

  const pageMetrics = computePageMetrics(resolved);
  const { pageWidthPx, pageHeightPx, trimOffset, contentArea } = pageMetrics;
  // Page/bleed frames for design elements anchored to `'page'` / `'bleed'`.
  const designFrames = { page: pageMetrics.trimBox, bleed: pageMetrics.bleedBox };
  doc.trimOffset = trimOffset;

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx);
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
  const headingPrefixes = computeHeadingNumbers(contentBlocks, headingTemplates);

  // Resource numbering — computed up front (before the placement loop) so that
  // captions and inline `:ref`s can resolve their rendered number strings
  // before measurement. Numbering follows order of first reference in the
  // document.
  const resourceTypes: ResourceType[] = config?.resourceTypes ?? defaultResourceTypes();
  const resources: Resource[] = content.resources ?? [];
  const headingContext = computeHeadingContext(contentBlocks);
  const resourceNumbering: ResourceNumberingMap = computeResourceNumbering(
    contentBlocks,
    resourceTypes,
    resources,
    headingContext,
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
  // resources detach from the running text and reserve a band at the top or
  // bottom of the next page opened after that reference; the text flows past
  // the reference uninterrupted. `position: 'here'` resources keep inline
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
  const floatGapPx = bodyStyle.lineHeightPx;
  const minTextPx = bodyStyle.lineHeightPx * 3;

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
    if (rb.captionBar) { rb.captionBar.rect.x += ox; rb.captionBar.rect.y += oy; }
    if (rb.table) {
      for (const cell of rb.table.cells) {
        cell.rect.x += ox; cell.rect.y += oy;
        for (const cl of cell.lines) { cl.bbox.x += ox; cl.bbox.y += oy; cl.baseline += oy; }
      }
    }
  };

  /** Measure + build a float block at horizontal offset `x` (y = 0), or null
   *  when the resource id is unknown. Caller offsets it to its final `y`. */
  const buildFloatBlock = (
    resourceId: string,
    x: number,
    width: number,
  ): { block: VDTBlock; height: number } | null => {
    const resource = resourceById.get(resourceId);
    if (!resource) return null;
    const { block: rb, totalHeight } = layoutResourceBlock({
      resource,
      resourceType: resourceTypeById.get(resource.typeId),
      number: resourceNumberById.get(resourceId) ?? '',
      resolved,
      columnWidth: width,
      resourceNumbering,
      resourceTypes,
      resources,
    });
    const blk = createVDTBlock(`float-${resourceId}`, 'resource', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
    blk.resourceBlock = rb;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.bbox = createBoundingBox(x, 0, width, totalHeight);
    blk.lines = [];
    offsetResourceBlockToAbsolute(rb, x, 0);
    return { block: blk, height: totalHeight };
  };

  /** Reserve top/bottom bands on a freshly opened page and position as many
   *  pending floats as fit, shrinking the affected columns so body text flows
   *  around them. Preserves reading order: stops at the first float that does
   *  not fit (so figures never reorder relative to their references), except
   *  on a band that is still all-text, where a dominating/oversized float is
   *  force-placed so the queue always makes progress. */
  const flushFloatsIntoPage = (page: VDTPage): void => {
    if (pendingFloats.length === 0) return;
    const topUsed = page.columns.map(() => 0);
    const botUsed = page.columns.map(() => 0);
    const floats: VDTBlock[] = page.floats ?? [];

    /** Try to place one float on this page. Returns whether it was placed,
     *  must be deferred (does not fit), or skipped (unknown id). Only mutates
     *  page geometry when it actually places. */
    const attemptFloat = (f: PlannedFloat): 'placed' | 'defer' | 'skip' => {
      const pageSpan = f.span === 'page' && page.columns.length > 1;
      let targetCols: number[];
      if (pageSpan) {
        targetCols = page.columns.map((_, i) => i);
      } else {
        // Single-column float: pick the column with the most room left.
        let best = 0;
        for (let i = 1; i < page.columns.length; i++) {
          if (topUsed[i]! + botUsed[i]! < topUsed[best]! + botUsed[best]!) best = i;
        }
        targetCols = [best];
      }
      const firstCol = page.columns[targetCols[0]!]!;
      const width = pageSpan ? page.contentArea.width : firstCol.bbox.width;
      const xLeft = pageSpan ? page.contentArea.x : firstCol.bbox.x;

      const built = buildFloatBlock(f.resourceId, xLeft, width);
      if (!built) return 'skip';

      let minAvail = Infinity;
      let anyReserved = false;
      for (const c of targetCols) {
        minAvail = Math.min(minAvail, page.columns[c]!.availableHeight);
        if (topUsed[c]! > 0 || botUsed[c]! > 0) anyReserved = true;
      }

      // Both band kinds are corrected against the baseline grid so the text
      // around them — and the facing page — stays on the global rhythm:
      //  - top: the band pushes the column start (`col.bbox.y`) downward, and
      //    all grid snapping inside the column is anchored at that start. The
      //    band height is rounded up to a grid multiple (growing the gap
      //    below the float) or every line in the displaced column would land
      //    off-grid, visibly misaligned with neighbouring columns.
      //  - bottom: the float is anchored so its visual bottom sits on the
      //    grid — the caption's last line shares its baseline with the last
      //    text line of the other columns (captionless content aligns its
      //    bottom edge to the last grid slot). Pages then end at the same
      //    height across columns and across facing pages.
      let need: number;
      let floatY = 0;
      if (f.position === 'top') {
        const rawNeed = built.height + floatGapPx;
        need = Math.ceil((rawNeed - 0.01) / baselineGrid) * baselineGrid;
      } else {
        const bottomLimit = Math.min(...targetCols.map((c) => {
          const cb = page.columns[c]!.bbox;
          return cb.y + cb.height;
        }));
        const gridAlignedBottom = page.contentArea.y
          + Math.floor((bottomLimit - page.contentArea.y + 0.01) / baselineGrid) * baselineGrid;
        const capLines = built.block.resourceBlock!.captionLines;
        if (capLines.length > 0) {
          // Body baselines sit at 0.2 × grid above each slot bottom; anchor
          // the caption's last baseline there.
          const lastBaseline = capLines[capLines.length - 1]!.baseline; // block-relative
          floatY = gridAlignedBottom - 0.2 * baselineGrid - lastBaseline;
        } else {
          floatY = gridAlignedBottom - built.height;
        }
        need = 0;
        for (const c of targetCols) {
          const col = page.columns[c]!;
          need = Math.max(need, col.bbox.height - (floatY - floatGapPx - col.bbox.y));
        }
      }

      // Keep some text room, unless this band is still all-text (then a
      // dominating / oversized float is force-placed so the queue progresses).
      if (need > minAvail - minTextPx && anyReserved) return 'defer';

      let y = 0;
      for (const c of targetCols) {
        const col = page.columns[c]!;
        if (f.position === 'top') {
          y = col.bbox.y;            // float sits at the current top edge
          col.bbox.y += need;        // push column content below the band
          col.bbox.height = Math.max(0, col.bbox.height - need);
          col.availableHeight = Math.max(0, col.availableHeight - need);
          topUsed[c]! += need;
        } else {
          y = floatY;
          const newHeight = Math.max(0, floatY - floatGapPx - col.bbox.y);
          const reserved = col.bbox.height - newHeight;
          col.bbox.height = newHeight;
          col.availableHeight = Math.max(0, col.availableHeight - reserved);
          botUsed[c]! += reserved;
        }
      }

      offsetResourceBlockToAbsolute(built.block.resourceBlock!, 0, y);
      built.block.bbox = createBoundingBox(xLeft, y, width, built.height);
      built.block.pageIndex = page.index;
      built.block.columnIndex = targetCols[0]!;
      floats.push(built.block);
      return 'placed';
    };

    // Full-width (page-span) floats reserve the outermost bands first, so a
    // later single-column float nests inside the remaining column space rather
    // than overlapping a full-width band. Within each pass, stop at the first
    // float that does not fit to preserve reading order.
    for (const pageSpanPass of [true, false]) {
      let i = 0;
      while (i < pendingFloats.length) {
        const f = pendingFloats[i]!;
        const isPageSpan = f.span === 'page' && page.columns.length > 1;
        if (isPageSpan !== pageSpanPass) { i++; continue; }
        const r = attemptFloat(f);
        if (r === 'placed' || r === 'skip') pendingFloats.splice(i, 1);
        else break; // defer: leave this and the rest of the pass for a later page
      }
    }
    if (floats.length > 0) page.floats = floats;
  };

  /** Drain floats still pending after body placement (referenced on the last
   *  page, or never followed by a content-overflow page break) onto freshly
   *  appended pages. Each new page force-places at least one float. */
  const finalizeFloats = (): void => {
    let guard = 0;
    while (pendingFloats.length > 0 && guard++ < 1000) {
      const before = pendingFloats.length;
      const page = createPageWithColumns(doc.pages.length, resolved, contentArea, pageWidthPx, pageHeightPx);
      doc.pages.push(page);
      flushFloatsIntoPage(page);
      if (pendingFloats.length === before) break; // safety: no progress
    }
  };

  /** Reserve floats on each freshly opened content page. Passed only to the
   *  content-flow column advances — parity / force-blank pages never get it. */
  const onNewPage = (page: VDTPage): void => flushFloatsIntoPage(page);

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
      applyBandCap(bandColumns(page, band), cap.lines * baselineGrid, uncappedBottoms);
      activeCap = { spanIndex, pageIndex: page.index, band };
      bandCapsApplied.add(spanIndex);
      break;
    }
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
  const pageNumberSegments: PageNumberSegment[] = [
    {
      startPageIndex: 0,
      format: resolved.page.pageNumbering.format,
      startAt: resolved.page.pageNumbering.startAt,
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

  /** Shared tail of callout placement: stamp the frame's source range,
   *  convert the laid-out box to absolute coordinates at the frame's placed
   *  origin, and push frame + children — in that order — to `doc.blocks`
   *  and to the column the frame landed in. */
  const commitCallout = (
    result: CalloutLayoutResult,
    startIdx: number,
    plan: PlannedCallout,
    col: VDTColumn,
  ): void => {
    const frame = result.frame;
    const startBlock = contentBlocks[startIdx]!;
    const endBlock = contentBlocks[plan.endIdx]!;
    frame.contentIndex = startIdx;
    frame.sourceStart = startBlock.sourceStart + bodyOffset;
    frame.sourceEnd = endBlock.sourceEnd + bodyOffset;
    offsetCalloutToAbsolute(result, frame.bbox.x, frame.bbox.y);
    doc.blocks.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      col.blocks.push(child);
      doc.blocks.push(child);
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
    layoutAt: (width: number) => CalloutLayoutResult,
  ): boolean => {
    let page = doc.pages[cursor.pageIndex]!;
    let result = layoutAt(page.contentArea.width);
    const minLines = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
    const minRoomPx = minLines * bodyStyle.lineHeightPx;

    interface SpanFit { cols: VDTColumn[]; cutY: number; need: number; spacing: number; room: boolean }
    /** Where the box would cut the current band, and whether it fits (room
     *  is measured against the columns' TRUE bottoms — a capped band keeps
     *  its slack below the cap). Null when the band is not level (or the
     *  cursor sits on a span column with no band below it) and
     *  `requireLevel` is set. */
    const measureBand = (requireLevel: boolean): SpanFit | null => {
      const cols = bandColumns(page, currentBand(page, cursor));
      if (cols.length === 0 || (requireLevel && !isBandLevel(cols))) return null;
      const usedBottom = bandUsedBottom(cols);
      const cutY = page.contentArea.y
        + Math.ceil((usedBottom - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
      const bandHasContent = cols.some((c) => c.blocks.length > 0);
      const spacing = bandHasContent ? Math.max(pendingSpacing, result.marginTopPx) : 0;
      const need = Math.ceil((spacing + result.totalHeight + result.marginBottomPx - 0.01) / baselineGrid) * baselineGrid;
      const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
      const room = cutY + need + minRoomPx <= bandBottom + 0.01;
      return { cols, cutY, need, spacing, room };
    };

    // Is this band capped for this very box? Then it cuts at the band's
    // used bottom (at most the cap) even when the last column is short.
    const cap = bandCaps?.get(startIdx);
    const capActive = cap !== undefined
      && activeCap !== null
      && activeCap.spanIndex === startIdx
      && activeCap.pageIndex === page.index
      && activeCap.band === currentBand(page, cursor);

    let fit = measureBand(!capActive);
    if (fit?.room && capActive) {
      uncapBand(fit.cols, uncappedBottoms);
      spanPlacedInBand.add(startIdx);
    }
    if (!fit && cap === undefined && bandStart && registeredBand
      && registeredBand.pageIndex === page.index
      && registeredBand.band === currentBand(page, cursor)) {
      // Uneven band, no cap yet: propose one when a level cut would leave
      // room for the box plus the widow minimum of body lines below it.
      const cols = bandColumns(page, currentBand(page, cursor));
      const lines = bandCapLines(cols, baselineGrid);
      const capBottom = Math.max(...cols.map((c) => c.bbox.y)) + lines * baselineGrid;
      const spacing = Math.max(pendingSpacing, result.marginTopPx);
      const need = Math.ceil((spacing + result.totalHeight + result.marginBottomPx - 0.01) / baselineGrid) * baselineGrid;
      const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
      if (capBottom + need + minRoomPx <= bandBottom + 0.01) {
        bandCapProposals.set(startIdx, {
          startContentIndex: bandStart.contentIndex,
          startPart: bandStart.part,
          lines,
          retries: 0,
        });
      }
    }
    if (!fit || !fit.room) {
      // Open the next page (flushing pending floats into its bands). A page
      // holding only floats counts as occupied here — its float band is what
      // left no room — but a truly empty page is kept: the box then simply
      // does not fit a page and is force-placed (overflowing, like inline).
      const curPage = doc.pages[cursor.pageIndex]!;
      if (pageHasContent(curPage) || (curPage.floats?.length ?? 0) > 0) {
        pendingSpacing = 0;
        const startPageIndex = cursor.pageIndex;
        do {
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        } while (cursor.pageIndex === startPageIndex);
        page = doc.pages[cursor.pageIndex]!;
        if (Math.abs(page.contentArea.width - result.width) > 0.01) {
          result = layoutAt(page.contentArea.width);
        }
      }
      // A freshly opened page is level; force-place (overflow) when the box
      // is taller than the page.
      fit = measureBand(true) ?? measureBand(false);
      if (!fit) return false; // no text column to cut — leave it to the inline path
    }

    const spanCol = closeBandAndInsertSpan(
      page, fit.cols, fit.cutY, result.frame, fit.need, cursor, fit.spacing, result.totalHeight,
    );
    commitCallout(result, startIdx, plan, spanCol);
    // Floats first-referenced inside the box enqueue once it is committed,
    // in reading order (same as the inline path).
    for (let i = startIdx + 1; i <= plan.endIdx; i++) {
      const fl = floatsByFirstBlock.get(i);
      if (fl) pendingFloats.push(...fl);
    }
    // The new band starts on the grid right below the span column; nothing
    // to snap — `need` already bakes in `marginBottom`.
    pendingSpacing = 0;
    return true;
  };

  /**
   * Place a `:::callout` inline at the current column width as one atomic
   * unit: the frame block followed by its children in the same column. The
   * box's `marginTop` collapses with the pending spacing; `marginBottom` is
   * baked into the post-box grid snap. A box that does not fit moves to the
   * next column/page (like a resource), pulling a run of trailing headings
   * along (keep-with-next); a box taller than an empty column is placed
   * anyway and overflows (the sandbox warns). Returns the content index to
   * rewind the main loop to when headings were rolled back, else `undefined`.
   *
   * `span: 'page'` boxes in multi-column layouts take the span-block path
   * (`placeCalloutSpan`) instead; `placement: 'top' | 'bottom'` (floating
   * boxes) still fall back to this inline placement for v1 — the frame's
   * `callout.placement` records the request.
   */
  const placeCalloutInline = (startIdx: number, plan: PlannedCallout): number | undefined => {
    const style = pickCalloutStyle(resolved.calloutStyles, plan.attrs.type)!;
    const children = contentBlocks.slice(startIdx + 1, plan.endIdx);
    const frameId = `block-${blockIdCounter++}`;
    const { span, placement } = resolveCalloutAttrs(style, plan.attrs);
    const layoutAt = (width: number) => {
      let n = 0;
      return layoutCallout({
        style,
        attrs: plan.attrs,
        children,
        childStartIdx: startIdx + 1,
        width,
        ctx: measureCtx,
        resolved,
        containerId: plan.containerId,
        frameId,
        nextChildId: () => `${frameId}-c${n++}`,
        paragraphStyleFor: (idx) => paragraphContainers.byBlock[idx]?.style,
      });
    };

    // Page-span boxes split a multi-column page into column bands (stage 1
    // of span blocks). Floating placements keep the inline fallback.
    {
      const page = doc.pages[cursor.pageIndex]!;
      if (
        span === 'page'
        && placement === 'here'
        && bandColumns(page, currentBand(page, cursor)).length > 1
        && placeCalloutSpan(startIdx, plan, layoutAt)
      ) {
        return undefined;
      }
    }

    let curCol = currentColumn(doc, cursor);
    let result = layoutAt(curCol.bbox.width);
    if (curCol.blocks.length > 0) {
      const spacingBefore = Math.max(pendingSpacing, result.marginTopPx);
      if (result.totalHeight > curCol.availableHeight - spacingBefore) {
        // Keep-with-next: a run of headings at the column's tail travels
        // with the box. Skipped when the column holds nothing else (rolling
        // back again would loop) — the headings stay, orphaned.
        let run = 0;
        for (let j = curCol.blocks.length - 1; j >= 0; j--) {
          if (isFreeHeading(curCol.blocks[j]!)) run++;
          else break;
        }
        pendingSpacing = 0;
        if (resolved.headings.keepWithNext && run > 0 && run < curCol.blocks.length) {
          const rolledBack = rollbackTrailingBlocks(curCol, doc.blocks, isFreeHeading);
          advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
          return (rolledBack[0]!.contentIndex ?? startIdx - rolledBack.length) - 1;
        }
        advanceToNextColumn(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        curCol = currentColumn(doc, cursor);
        // Columns of different widths (oneAndHalf): re-lay out for the new one.
        if (Math.abs(curCol.bbox.width - result.width) > 0.01 && style.width !== 'auto') {
          result = layoutAt(curCol.bbox.width);
        }
      }
    }

    // Floats first-referenced inside the box still enqueue in reading order
    // (only once the box is committed, so a keep-with-next replay does not
    // enqueue them twice).
    for (let i = startIdx + 1; i <= plan.endIdx; i++) {
      const fl = floatsByFirstBlock.get(i);
      if (fl) pendingFloats.push(...fl);
    }
    const frame = result.frame;
    const spacing = curCol.blocks.length === 0 ? 0 : Math.max(pendingSpacing, result.marginTopPx);
    enterBand(startIdx, 0);
    placeAtomicBlock(
      frame, result.totalHeight, spacing, cursor, doc, resolved,
      contentArea, pageWidthPx, pageHeightPx,
    );
    enterBand(startIdx, 0);
    curCol = currentColumn(doc, cursor);
    commitCallout(result, startIdx, plan, curCol);
    // Snap the flow after the box to the baseline grid, baking in at least
    // `marginBottom` (grid wins, margin is a minimum — the resource rule).
    {
      const usedHeight = curCol.bbox.height - curCol.availableHeight;
      const naturalBottom = usedHeight + result.marginBottomPx;
      const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
      curCol.availableHeight = Math.max(0, curCol.bbox.height - snappedBottom);
    }
    pendingSpacing = 0;
    return undefined;
  };

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
    const rawBlock = contentBlocks[blockIdx]!;

    // Enqueue floats first-referenced in this block so the next page opened
    // while placing it (or any later block) reserves their band. Done before
    // placement so a reference near a column/page boundary still floats onto
    // the page that follows it.
    const floatsHere = floatsByFirstBlock.get(blockIdx);
    if (floatsHere) pendingFloats.push(...floatsHere);

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
        markForcedBreak();
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
          titleSourceStart,
          titleSourceEnd,
        });
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
      markForcedBreak();
      leaveCurrentPage();
      enforcePageParity(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx, parity);
      flushPendingNumberingAtBoundary();
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout') {
      const plan = calloutPlan.get(blockIdx);
      if (plan && pickCalloutStyle(resolved.calloutStyles, plan.attrs.type)) {
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
        if (rawBlock.type === 'containerStart') {
          pendingSpacing = Math.max(pendingSpacing, pc.marginTopPx);
        } else if (contentBlocks[blockIdx - 1]?.type !== 'paragraph') {
          pendingSpacing = Math.max(pendingSpacing, pc.marginBottomPx);
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
        markForcedBreak();
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
        markForcedBreak();
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
    const measuredBlock = measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, {
      // Column balancing "run a paragraph long": stays undefined for the
      // common case so existing measurement cache keys are preserved.
      looseness: balanceLooseness?.get(blockIdx),
      styleOverride: paragraphContainer
        ? (isContainerTail ? paragraphContainer.tailStyle : paragraphContainer.style)
        : undefined,
    });
    if (!measuredBlock) continue;
    const { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender } = measuredBlock;
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
    let remainingLines = [...measured.lines];
    let partIndex = 0;

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
            if (extraPx) spacingBefore += extraPx;
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
          if (extraPx) spacingBefore += extraPx;
        }
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
        const availableAfter = curCol.bbox.height - paragraphBottom;
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
            if (spacingBefore > 0) curCol.availableHeight -= spacingBefore;
            const splitLines = remainingLines.slice(0, splitAt);
            const blk = createVDTBlock(id, vdtType, style.fontString, style.color, style.textAlign);
            applyStyleAttrs(blk, style);
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

      // Block fits in current column
      if (effectiveRemainHeight <= effectiveAvailable) {
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
          && curCol.blocks.length > 0
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

        // Consume spacing
        if (spacingBefore > 0) {
          curCol.availableHeight -= spacingBefore;
        }

        const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
        const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
        applyStyleAttrs(blk, style);
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
          h = snappedBottom - usedHeight;
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
          // Consume spacing
          if (spacingBefore > 0) {
            curCol.availableHeight -= spacingBefore;
          }

          const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
          const splitLines = remainingLines.slice(0, choice.splitAt);

          const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
          applyStyleAttrs(blk, style);
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

      // Cannot split — advance to next column if current has content
      if (curCol.blocks.length > 0) {
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

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      applyStyleAttrs(blk, style);
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

  // Place any floats still pending (referenced on the last page, or never
  // followed by a content-overflow page break) onto freshly appended pages.
  finalizeFloats();

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

  return { doc, forcedBreakPages, bandCapProposals, spanPlacedInBand, bandCapsApplied };
}

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): VDTDocument {
  // --- Band caps (page-span blocks mid-page) -----------------------------
  // A span block that arrived in an uneven band proposes a cap; the driver
  // re-places the document with it (and grows / drops caps whose band
  // overflowed) before balancing runs. Documents without such blocks get
  // their first pass back untouched — no extra pass.
  const bands = resolveBandCaps(
    buildDocumentPass(content, config, cache, options),
    (bandCaps) => buildDocumentPass(content, config, cache, options, { bandCaps }),
  );
  let best = bands.result;
  const bandCaps = bands.bandCaps;
  let passCount = bands.passCount;
  best.doc.iterationCount = passCount;

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
  let converged = bestScore === 0;

  while (!converged && passCount < MAX_BALANCING_PASSES) {
    const proposal = proposeBalanceLines(best.doc, best.forcedBreakPages, applied, {
      maxLinesPerHeading: balancing.maxLinesPerHeading,
      stretchAfterLists: balancing.stretchAfterLists,
      maxLinesAfterList: balancing.maxLinesAfterList,
      looseParagraphs: balancing.looseParagraphs,
      optimalLineBreaking: best.doc.config.bodyText.optimalLineBreaking,
      failedLoose,
    });
    if (!proposal.changed) {
      // No stretch point can absorb the remaining gaps — stable.
      converged = true;
      break;
    }
    const extraPx = new Map<number, number>();
    for (const [idx, n] of proposal.lines) extraPx.set(idx, n * best.doc.baselineGrid);
    const next = buildDocumentPass(content, config, cache, options, {
      balanceExtraPx: extraPx,
      balanceLooseness: proposal.loose,
      bandCaps,
    });
    passCount++;
    // Band caps ride along unchanged; a retry that unsettles one (its span
    // block no longer lands in the capped band) counts as a regression —
    // capped columns without their box are not a layout we may keep.
    const capsDelivered = [...bandCaps.keys()].every((i) => next.spanPlacedInBand.has(i));
    const score = capsDelivered ? totalGapLines(next.doc, next.forcedBreakPages) : Infinity;
    if (score < bestScore) {
      best = next;
      bestScore = score;
      applied = { lines: proposal.lines, loose: proposal.loose };
      converged = score === 0;
    } else {
      // Plateau or regression. When this attempt introduced NEW loose
      // paragraphs, the K-P looseness fallback may simply have failed to
      // gain a line within the stretch limit — blacklist them and retry so
      // the proposer falls through to the next candidate. A pure spacing
      // plateau means we're done: keep the best layout found so far.
      const newlyLoose = [...proposal.loose.keys()].filter((k) => !applied.loose.has(k));
      if (newlyLoose.length > 0) {
        for (const k of newlyLoose) failedLoose.add(k);
        continue;
      }
      break;
    }
  }

  best.doc.iterationCount = passCount;
  best.doc.converged = converged || bestScore === 0;
  return best.doc;
}
