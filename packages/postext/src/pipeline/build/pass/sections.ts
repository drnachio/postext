// Styled sections and the cursor: measure contexts per section, block ids,
// pending spacing and column-head keeps.
// Part of the placement pass (pass.ts), split out of it in #1276.
import { type BlockMeasureContext, measureContentBlock } from '../../measureContentBlock.js';
import { derivePartMeasureContext, type PartPlan } from '../../parts.js';
import type { ResolvedHeadingStyleConfig } from '../../../types.js';
import { deriveSectionMeasureContext, deriveSectionGeometryConfig, headingStyleOf, headingIsHidden, type HeadingLevelResolver } from '../../headingStyles.js';
import { computePageMetrics, nextNonMarkerBlock, isMarkerBlock, type PageMetrics } from '../../buildHelpers.js';
import { setMeasureWritingMode } from '../../../measure/vertical.js';
import { pageHasContent, createPageWithColumns, FIT_EPS, type PlacementCursor } from '../../placement.js';
import type { VDTBlock, VDTColumn, ResolvedConfig, VDTDocument } from '../../../vdt.js';
import type { ContentBlock } from '../../../parse/index.js';
import { plainTitleBreaks } from '../../../parse/inlineFormatting.js';
import { withBookTitleBrackets } from '../../annotations.js';
import { scoreInfoOf } from '../../scoreBlocks.js';
import { paragraphStyleIdOf, type ParagraphContainerPlan } from '../../paragraphContainers.js';
import { resolvedDirection } from '../../config.js';
import { tocBlockStamps } from '../../toc.js';
import type { PassState } from './state.js';

/** What createSections takes from the pass. */
export interface SectionsDeps {
  resolved: ResolvedConfig;
  headingLevels: HeadingLevelResolver;
  baselineGrid: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  pageMetrics: PageMetrics;
  pageWidthPx: number;
  pageHeightPx: number;
  contentBlocks: ContentBlock[];
  paragraphContainers: ParagraphContainerPlan;
  partPlan: PartPlan;
  measureCtx: BlockMeasureContext;
  cursor: PlacementCursor;
  forcedBreakPages: Set<number>;
  state: PassState;
}

export function createSections(deps: SectionsDeps) {
  const {
    resolved, headingLevels, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx,
    pageHeightPx, contentBlocks, paragraphContainers, partPlan, measureCtx, cursor, forcedBreakPages,
    state
  } = deps;
  // Blocks inside a `:::part` measure with the part body typography.
  const partMeasureCtx: BlockMeasureContext = partPlan.byStart.size > 0
    ? derivePartMeasureContext(measureCtx)
    : measureCtx;

  // Blocks inside a styled section with a body style measure with it.
  const sectionMeasureCtxs = new Map<ResolvedHeadingStyleConfig, BlockMeasureContext>();
  const sectionMeasureCtx = (style: ResolvedHeadingStyleConfig | undefined): BlockMeasureContext => {
    if (!style?.bodyStyle) return measureCtx;
    let ctx = sectionMeasureCtxs.get(style);
    if (!ctx) {
      ctx = deriveSectionMeasureContext(measureCtx, style);
      sectionMeasureCtxs.set(style, ctx);
    }
    return ctx;
  };
  /** The styled section whose geometry the pages opened from now on take. */
  state.currentSection = undefined;
  const enterSection = (style: ResolvedHeadingStyleConfig | undefined): void => {
    state.currentSection = style;
    state.geomResolved = style ? deriveSectionGeometryConfig(resolved, style) : resolved;
    state.contentArea = state.geomResolved === resolved ? pageMetrics.contentArea : computePageMetrics(state.geomResolved).contentArea;
    setMeasureWritingMode(state.geomResolved.layout.writingMode);
    // A page still empty takes the geometry right away — the document (or
    // a chapter laid out on its own) opening with a styled heading.
    const page = doc.pages[cursor.pageIndex];
    if (
      page && !page.partInfo && !page.comic && !page.composed && cursor.columnIndex === 0
      && !pageHasContent(page) && !(page.floats && page.floats.length > 0)
    ) {
      const fresh = createPageWithColumns(page.index, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
      if (page.blankForParity) fresh.blankForParity = true;
      if (page.blankForForce) fresh.blankForForce = true;
      doc.pages[cursor.pageIndex] = fresh;
    }
  };
  /** Heading-style and contents-row stamps a placed block carries for the
   *  running heads (`computeSectionStyles`) and the contents' part rows. */
  const stampBlockExtras = (blk: VDTBlock, raw: ContentBlock): void => {
    if (raw.type === 'heading') {
      const style = headingStyleOf(raw, resolved);
      if (style) {
        blk.headingStyleId = style.id;
        if (!style.numbered) blk.unnumbered = true;
        if (!style.runningChapter && (raw.level ?? 1) === 1) blk.notRunningChapter = true;
      }
      // A letter-case transform changes what the lines print, not the
      // title: keep it as written for the bookmarks (EF-81). A title citing
      // a resource keeps the printed text, whose `:ref` label the source
      // does not hold.
      if (headingLevels.forBlock(raw)?.textTransform === 'uppercase' && !raw.spans.some((s) => s.ref)) {
        blk.sourceTitle = plainTitleBreaks(withBookTitleBrackets(raw.text, raw.spans, resolved.cjk).text);
      }
    }
    if (raw.footnoteNote !== undefined) blk.footnoteNote = raw.footnoteNote;
    if (raw.bibEntry !== undefined) blk.bibEntry = raw.bibEntry;
    // A score's system (#1172): its place in the score, and the alt text on
    // the first one.
    if (raw.score) blk.score = scoreInfoOf(raw.score);
    // Metadata for other renditions: the paragraph style the text is set
    // in, the level of an index entry.
    const paragraphStyleId = paragraphStyleIdOf(raw, blk.contentIndex !== undefined ? paragraphContainers.byBlock[blk.contentIndex] : undefined, resolved);
    if (paragraphStyleId !== undefined) blk.paragraphStyleId = paragraphStyleId;
    if (raw.index) blk.indexLevel = raw.index.level;
    // A text block whose direction opposes its page frame's, which runs in
    // the document's direction (a right-to-left document's pages are
    // mirrored, #370): an Arabic quotation in an English book, an English
    // one in an Arabic book. Its lines carry their span (`VDTLine.measure`).
    if (blk.type !== 'resource' && raw.direction !== undefined && raw.direction !== resolvedDirection(resolved)) blk.direction = raw.direction;
    Object.assign(blk, tocBlockStamps(raw));
  };

  state.blockIdCounter = 0;
  state.pendingSpacing = 0;
  /** The float gap an inline resource still owes the block right after it
   *  (EF-93), or the space a `:::paragraphs` container still owes the block
   *  after its closing marker (EF-159; `container`, carried through the
   *  closing markers that follow, an enclosing container's included),
   *  measured from the grid line its foot snapped to: `pending` is what it
   *  left in `pendingSpacing`, in whole grid lines so text lands back on the
   *  grid; `exact` is the gap itself, which a block that sets itself off
   *  the grid and snaps the flow after it (a heading, a display formula, a
   *  box) collapses its own space above with instead. */
  state.inlineGapOwed = null;
  /** The pending spacing a heading, a display formula or a box at `idx`
   *  collapses its top margin with (see `inlineGapOwed`). */
  /**
   * What a heading that opens a column keeps of its space above (#706),
   * 0 when it keeps none. `s0` is the space it takes above it after a
   * paragraph of body text, `S` its height plus its bottom margin as the
   * snap reads them, `u` the column's used height:
   *
   *     kept = s0 − (snap(u + s0 + S) − snap(u + S))
   *
   * the whole grid lines the column head saves are dropped and the rest
   * stays. `kept` is less than a grid line and `u + kept + S` never passes
   * `snap(u + S)`, so the box's foot stays on its grid line. A run of
   * headings (the first does not snap because a heading follows it) reads
   * as one block: `S` runs from the first heading's top to the last one's
   * foot plus its bottom margin, the margins between them collapsed as the
   * placement loop collapses them, and `kept` goes above the first. A run
   * with a designed, page-span, hidden or `lineSpan` heading in it, or one
   * whose last heading does not snap, keeps today's placement; so does a
   * heading whose snapped box does not fit the column.
   */
  const columnHeadKept = (
    blockIdx: number,
    rawBlock: ContentBlock,
    usedHeight: number,
    height: number,
    style: { marginTopPx: number; marginBottomPx: number },
    snaps: boolean,
    col: VDTColumn,
    ctx: BlockMeasureContext,
  ): number => {
    let S: number;
    if (snaps) {
      S = height + style.marginBottomPx;
    } else {
      const own = headingLevels.forBlock(rawBlock);
      const ownSnaps = own?.snapToGrid ?? resolved.headings.snapToGrid;
      if (!own || !ownSnaps || own.advancedDesign.enabled || nextNonMarkerBlock(contentBlocks, blockIdx)?.type !== 'heading') return 0;
      let run = height;
      let pending = style.marginBottomPx;
      let closed: number | undefined;
      for (let j = blockIdx + 1; j < contentBlocks.length; j++) {
        const b = contentBlocks[j]!;
        if (isMarkerBlock(b)) continue;
        const lvl = b.type === 'heading' ? headingLevels.forBlock(b) : undefined;
        if (!lvl || lvl.span === 'page' || lvl.advancedDesign.enabled || headingIsHidden(b, lvl)) return 0;
        const m = measureContentBlock(b, j, col.bbox.width, ctx);
        if (!m || m.kind.vdtType !== 'heading' || m.kind.style.lineSpan !== undefined) return 0;
        const st = m.kind.style;
        run += Math.max(pending, st.marginTopPx) + m.measured.lines.length * st.lineHeightPx;
        if (nextNonMarkerBlock(contentBlocks, j)?.type === 'heading') { pending = st.marginBottomPx; continue; }
        if (lvl.snapToGrid ?? resolved.headings.snapToGrid) closed = run + st.marginBottomPx;
        break;
      }
      if (closed === undefined) return 0;
      S = closed;
    }
    const snap = (x: number): number => Math.ceil((x - 0.01) / baselineGrid) * baselineGrid;
    const s0 = Math.max(ctx.bodyStyle.marginBottomPx, style.marginTopPx);
    const foot = snap(usedHeight + S);
    if (foot > col.bbox.height + FIT_EPS) return 0;
    const kept = s0 - (snap(usedHeight + s0 + S) - foot);
    return kept > 0.01 ? kept : 0;
  };

  const pendingBeforeSelfSnapping = (idx: number): number =>
    state.inlineGapOwed && state.inlineGapOwed.afterIdx === idx - 1 && state.pendingSpacing === state.inlineGapOwed.pending
      ? state.inlineGapOwed.exact
      : state.pendingSpacing;
  const markForcedBreak = (): void => {
    const curPage = doc.pages[cursor.pageIndex]!;
    if (curPage.columns.some((c) => c.blocks.length > 0)) {
      forcedBreakPages.add(cursor.pageIndex);
    }
  };
  return {
    partMeasureCtx, sectionMeasureCtx, enterSection, stampBlockExtras, columnHeadKept,
    pendingBeforeSelfSnapping, markForcedBreak
  };
}
