import type { PostextContent, PostextConfig, Resource, ResourceType } from '../types';
import type { ListKind } from '../parse';
import { dimensionToPx } from '../units';
import {
  createVDTDocument,
  createVDTBlock,
  createBoundingBox,
  type VDTDocument,
  type VDTBlock,
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
  placeResourceBlock,
} from './placement';
import { chooseParagraphSplit } from './orphanWidow';
import {
  applyStyleAttrs,
  computeMeasureViewport,
  computePageMetrics,
  enrichMathSpans,
  rollbackTrailingBlocks,
  stampSourceRanges,
} from './buildHelpers';
import { resolveBlockKind } from './buildBlockKind';
import { runMeasurement } from './buildMeasurement';
import { resolveRefSpans, layoutResourceBlock } from './resourceLayout';
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

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): VDTDocument {
  const resolved = resolveAllConfig(config);
  const headingLevelByNumber = buildHeadingLevelMap(resolved);
  const dpi = resolved.page.dpi;

  // Initialize hyphenator if needed
  if (resolved.bodyText.hyphenation.enabled && resolved.bodyText.textAlign === 'justify') {
    initHyphenator(resolved.bodyText.hyphenation.locale);
  }

  // Compute baseline grid
  const baselineGrid = computeBaselineGrid(resolved);

  // Create document
  const doc = createVDTDocument(resolved, baselineGrid);

  const { pageWidthPx, pageHeightPx, trimOffset, contentArea } = computePageMetrics(resolved);
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
      const width = pageSpan ? contentArea.width : firstCol.bbox.width;
      const xLeft = pageSpan ? contentArea.x : firstCol.bbox.x;

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
        const gridAlignedBottom = contentArea.y
          + Math.floor((bottomLimit - contentArea.y + 0.01) / baselineGrid) * baselineGrid;
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

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

  let blockIdCounter = 0;
  let pendingSpacing = 0;

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

    // --- Heading `breakBefore` ----------------------------------------
    if (rawBlock.type === 'heading' && rawBlock.level) {
      const level = headingLevelByNumber.get(rawBlock.level);
      const bb = level?.breakBefore;
      if (bb && bb.enabled) {
        pendingSpacing = 0;
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
        advanceToNextPageBoundary(doc, cursor, resolved, contentArea, pageWidthPx, pageHeightPx);
        cursor.columnIndex = 0;
        flushPendingNumberingAtBoundary();
      }
    }

    const id = `block-${blockIdCounter++}`;

    const kind = resolveBlockKind(rawBlock, {
      resolved,
      bodyStyle,
      blockquoteStyle,
      headingPrefixes,
      blockIdx,
      listLevelIndentsPx,
      orderedLevelIndentsPx,
      orderedMetrics,
      resourceById,
      resourceTypeById,
      resourceNumberById,
    });
    const { style, vdtType, headingLevel, numberPrefix, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;
    let contentBlock = kind.contentBlock;

    // --- Resource blocks (image / svg / table + caption) -----------------
    // Measured and placed atomically (kept-together) — no mid-content split
    // for v1. An unknown resource id produces no output (warnings handle it).
    if (vdtType === 'resource') {
      if (!kind.resource) {
        flushPendingNumberingAtBoundary();
        continue;
      }
      // Floated resources are not placed inline at their `::resource`
      // directive — the directive is just an anchor (already enqueued above);
      // the float lands in a page band. Only `position: 'here'` resources fall
      // through to inline placement.
      if (floatedIds.has(kind.resource.id)) {
        flushPendingNumberingAtBoundary();
        continue;
      }
      const rCol = currentColumn(doc, cursor);
      const { resourceBlock, measured } = runMeasurement({
        vdtType,
        rawBlock,
        contentBlock,
        style,
        measureMaxWidth: rCol.bbox.width,
        measureOptions: { textAlign: style.textAlign },
        mathEnabled: resolved.math.enabled,
        useRich: false,
        resolved,
        resources,
        resourceTypes,
        resourceNumbering,
        resource: kind.resource,
        resourceType: kind.resourceType,
        resourceNumber: kind.resourceNumber,
      });
      if (!resourceBlock) {
        flushPendingNumberingAtBoundary();
        continue;
      }
      const groupHeight = measured.totalHeight;
      const blk = createVDTBlock(id, 'resource', style.fontString, style.color, style.textAlign);
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
      placeResourceBlock(
        blk, groupHeight, spacingBefore, cursor, doc, resolved,
        contentArea, pageWidthPx, pageHeightPx,
      );
      // `placeBlockInColumn` (inside placeResourceBlock) shifts `blk.lines`; the
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

    // Measure text — use rich measurement for blocks with bold spans
    const col = currentColumn(doc, cursor);

    // Resolve inline math on spans (no-op when the block has no math).
    const mathEnabled = resolved.math.enabled;
    contentBlock = enrichMathSpans(contentBlock, style, resolved);

    // Resolve inline `:ref{…}` spans to their computed label so references
    // print their number in the running text. Each label becomes one atomic,
    // non-breaking token tagged with its `refResourceId` (handled by the
    // rich-text measurer), so we always take the rich path for ref blocks.
    if (contentBlock.spans.some((s) => s.ref)) {
      contentBlock = {
        ...contentBlock,
        spans: resolveRefSpans(contentBlock.spans, resourceNumbering, resourceTypes, resources, {
          bold: bodyStyle.referenceBold ?? true,
          italic: bodyStyle.referenceItalic ?? false,
        }),
      };
    }

    const hasRichSpans = contentBlock.spans.some((s) => s.bold || s.italic || s.mathRender || s.ref);

    // List items reserve horizontal space for indent + bullet + gap.
    const {
      measureMaxWidth,
      lineXShift,
      measureFirstLineIndent,
      measureHangingIndent,
    } = computeMeasureViewport(col.bbox.width, style, listBullet);

    // First-paragraph-after-heading: typographic convention used in many
    // scientific publications and book styles where the paragraph that
    // immediately follows a heading is rendered without first-line indent.
    // Only applies to regular paragraphs without hanging indent; list items
    // and hanging-indent paragraphs are unaffected.
    let effectiveFirstLineIndent = measureFirstLineIndent;
    if (
      vdtType === 'paragraph'
      && !resolved.bodyText.indentAfterHeading
      && !resolved.bodyText.hangingIndent
      && blockIdx > 0
    ) {
      let prevIdx = blockIdx - 1;
      while (prevIdx >= 0 && contentBlocks[prevIdx]!.type === 'directive') prevIdx--;
      if (prevIdx >= 0 && contentBlocks[prevIdx]!.type === 'heading') {
        effectiveFirstLineIndent = 0;
      }
    }

    const runtActive = resolved.bodyText.avoidRunts
      && (vdtType === 'paragraph'
        || (vdtType === 'listItem' && resolved.bodyText.avoidRuntsInLists));
    const measureOptions = {
      textAlign: style.textAlign,
      hyphenate: style.hyphenate,
      firstLineIndentPx: effectiveFirstLineIndent,
      hangingIndent: measureHangingIndent,
      optimal: resolved.bodyText.optimalLineBreaking,
      maxStretchRatio: resolved.bodyText.maxWordSpacing,
      minShrinkRatio: resolved.bodyText.minWordSpacing,
      runtPenalty: runtActive ? resolved.bodyText.runtPenalty : 0,
      runtMinCharacters: runtActive ? resolved.bodyText.runtMinCharacters : 0,
    };
    const useRich = !!(hasRichSpans && style.boldFontString && style.italicFontString && style.boldItalicFontString);

    const { measured, mathDisplayRender } = runMeasurement({
      vdtType, rawBlock, contentBlock, style, measureMaxWidth, measureOptions, mathEnabled, useRich, cache,
    });

    if (measured.lines.length === 0) continue;


    if (lineXShift > 0) {
      for (const line of measured.lines) {
        line.bbox.x += lineXShift;
      }
    }

    // Per-line source-range mapping using the block's plain→source map.
    // Accounts for heading numbering prefix which prepends chars with no source.
    const { prefixLen, absoluteSourceMap } = stampSourceRanges(measured, rawBlock, contentBlock, bodyOffset);

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
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size.
      const firstLine = blk.lines[0];
      if (firstLine) {
        blk.bulletY = firstLine.baseline - listBullet.textFontSizePx * 0.3 + listBullet.verticalOffsetPx;
      }
    };

    const nextIsListItem = blockIdx + 1 < contentBlocks.length && contentBlocks[blockIdx + 1]!.type === 'listItem';

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen.
    const nextBlock = blockIdx + 1 < contentBlocks.length ? contentBlocks[blockIdx + 1] : null;
    const nextIsHeading = nextBlock?.type === 'heading';
    const shouldSnapToGrid =
      (vdtType === 'heading' && !nextIsHeading) ||
      (vdtType === 'listItem' && !nextIsListItem) ||
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
      const curCol = currentColumn(doc, cursor);
      const isFirstInColumn = curCol.blocks.length === 0;

      // Compute spacing before this block — margin collapsing between
      // consecutive headings: only the larger of marginBottom / marginTop applies
      let spacingBefore = 0;
      if (!isFirstInColumn) {
        spacingBefore = pendingSpacing;
        if (vdtType === 'heading' || vdtType === 'mathDisplay') {
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
        } else if (vdtType === 'listItem') {
          const prevWasList = blockIdx > 0 && contentBlocks[blockIdx - 1]!.type === 'listItem';
          if (!prevWasList) {
            spacingBefore = Math.max(spacingBefore, style.marginTopPx);
          }
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
          const title = pref && full.startsWith(`${pref} `) ? full.slice(pref.length + 1) : full;
          // Span-page openers lay out across the full content area (both
          // columns); in-column headings use just the column width.
          const measureWidth = lvl.span === 'page' ? contentArea.width : curCol.bbox.width;
          const designBottom = measureHeadingAdvancedDesignHeight(
            lvl,
            { titleText: title, formattedNumber: pref, chapterNumber: pref },
            measureWidth,
            resolved.page.dpi,
            doc.metadata,
            cursor.pageIndex,
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
              if (curCol.blocks[j]!.type === 'heading') headingRunCount++;
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
            blockIdx -= headingRunCount + 1;
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
            const rollbackCount = rollbackTrailingBlocks(curCol, doc.blocks, (b) => b.type === 'heading');
            if (rollbackCount > 0) {
              // Rewind so the for-loop's blockIdx++ lands on the first
              // rolled-back heading.
              blockIdx -= rollbackCount + 1;
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
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) blk.numberPrefix = numberPrefix; }
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
          const rollbackCount = rollbackTrailingBlocks(curCol, doc.blocks, (b) => b.type === 'heading');
          if (rollbackCount > 0) {
            blockIdx -= rollbackCount + 1;
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
      if (partIndex === 0) blk.headingLevel = headingLevel;
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

  return doc;
}
