// The blocks the placement loop sets without measuring them as text:
// directives, parts, page and paper breaks, composed pages, comic pages and
// strips, callout and container fences.
// Part of the placement pass (pass.ts), split out of its loop in #1276.
import type { BlockIteration, StepJump } from './blockIteration.js';
import type { PassState } from './state.js';
import { type ResolvedConfig, type VDTDocument, type VDTPage, type VDTComicPage, createVDTColumn } from '../../../vdt.js';
import { type PageMetrics, pageMirrored } from '../../blocks/buildHelpers.js';
import { type ContentBlock, spaceDirectiveLines } from '../../../parse/index.js';
import type { Resource, ResolvedCalloutStyleConfig } from '../../../types.js';
import type { ParagraphContainerPlan } from '../../callouts/paragraphContainers.js';
import { type PlannedCallout, pickCalloutStyle } from '../../callouts/calloutLayout.js';
import type { PartPlan } from '../../sections/parts.js';
import type { PlannedComposedPage } from '../../composedPages/composedLayout.js';
import { type PlacementCursor, currentColumn, advanceToNextPageBoundary, enforcePageParity, advanceToNextColumn, createPartPage } from '../../blocks/placement.js';
import type { ComicPageSource } from '../../../comics/types.js';
import type { ComposedPageFence } from '../../../parse/types.js';
import type { ComicTextFramesInput, ComicTextFramesLayout } from '../../../comics/textPanels.js';
import { transparentToWrap, runsBesideWrap, columnCursorY, openColumnWrap, settleColumnWraps } from '../../floats/textWrap.js';
import { type NumeralStyle, parseNumberFormat } from '../../../numbering.js';
import { resolvedLocale } from '../../config.js';
import { asciiDigits } from '../../../arabicNumerals.js';
import { isComicSpread } from '../../../comics/spread.js';
import { layoutComicPage } from '../../../comics/layoutPage.js';
import { SPAN_EMBED_STYLE_ID, isPageSpanStrip } from '../../floats/spanEmbeds.js';

/** What createBlockDispatch takes from around the loop. */
export interface BlockDispatchDeps {
  state: PassState;
  resolved: ResolvedConfig;
  baselineGrid: number;
  doc: VDTDocument;
  pageIndexOffset: number;
  pageMetrics: PageMetrics;
  pageWidthPx: number;
  pageHeightPx: number;
  bodyOffset: number;
  markdownBody: string;
  contentBlocks: ContentBlock[];
  resourceById: Map<string, Resource>;
  calloutStyles: ResolvedCalloutStyleConfig[];
  paragraphContainers: ParagraphContainerPlan;
  calloutPlan: Map<number, PlannedCallout>;
  partPlan: PartPlan;
  composedPlans: Map<number, PlannedComposedPage>;
  comicTextPlans: Map<number, PlannedComposedPage>;
  floatedIds: Set<string>;
  cursor: PlacementCursor;
  openerPages: Set<VDTPage>;
  multiColumnBand: (page: VDTPage) => boolean;
  centredPages: Set<number>;
  flushFloatsIntoPage: (page: VDTPage) => void;
  onNewPage: (page: VDTPage) => void;
  tryPlacePendingFloatsOnCurrentPage: (preferTop?: boolean, nextBlockIdx?: number, anyPosition?: boolean) => void;
  spanBoxAt: (idx: number) => boolean;
  drainPendingFloats: () => void;
  markForcedBreak: () => void;
  pageTakesNumbering: (page: VDTPage) => boolean;
  closeFlowSegment: (boundaryIndex: number) => void;
  leaveCurrentPage: () => void;
  breakForPaper: (boundaryIndex: number) => void;
  flushPendingNumberingAtBoundary: () => void;
  placeCalloutInline: (startIdx: number, plan: PlannedCallout) => number | undefined;
  placeComicSpread: (source: ComicPageSource, textPlan?: PlannedComposedPage) => void;
  placeComicStrip: (blockIdx: number, source: ComicPageSource) => number | undefined;
  looseStripBoxes: Set<number>;
  placeComposedPage: (planned: PlannedComposedPage, fence: ComposedPageFence) => void;
  placeComicText: (page: VDTPage, comic: VDTComicPage, plan: PlannedComposedPage, extra?: Pick<ComicTextFramesInput, "only" | "avoid">) => ComicTextFramesLayout;
}

export function createBlockDispatch(deps: BlockDispatchDeps) {
  const {
    state, resolved, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
    bodyOffset, markdownBody, contentBlocks, resourceById, calloutStyles, paragraphContainers,
    calloutPlan, partPlan, composedPlans, comicTextPlans, floatedIds, cursor, openerPages,
    multiColumnBand, centredPages, flushFloatsIntoPage, onNewPage,
    tryPlacePendingFloatsOnCurrentPage, spanBoxAt, drainPendingFloats, markForcedBreak,
    pageTakesNumbering, closeFlowSegment, leaveCurrentPage, breakForPaper,
    flushPendingNumberingAtBoundary, placeCalloutInline, placeComicSpread, placeComicStrip,
    looseStripBoxes, placeComposedPage, placeComicText
  } = deps;
  /** Sets the block when it is a fence, a directive or a break, and says
   *  `continue` when that is all its turn takes. */
  const dispatchBlock = (blockTurn: BlockIteration): StepJump => {
    const {
      rawBlock
    } = blockTurn;
    // Text wrap (#627): running text after a wrapped figure takes the band
    // the figure was set in back, and runs beside it; anything else that
    // takes room from the flow goes under what text wraps round first.
    // Markers and the `::resource` line of a floated resource leave it.
    if (!transparentToWrap(rawBlock) && !(rawBlock.type === 'resourceBlock' && rawBlock.resourceId !== undefined && floatedIds.has(rawBlock.resourceId))) {
      const wrapCol = currentColumn(doc, cursor);
      const beside = runsBesideWrap(rawBlock);
      if (state.pendingWrap) {
        const { col, blocks, cursorY, ex } = state.pendingWrap;
        state.pendingWrap = null;
        if (beside && col === wrapCol && col.blocks.length === blocks && Math.abs(columnCursorY(col) - cursorY) < 0.01) {
          // The cursor goes back to the figure's top; the text starts there.
          col.availableHeight += columnCursorY(col) - ex.y;
          state.pendingSpacing = 0;
          state.inlineGapOwed = null;
          openColumnWrap(col, ex, 'top');
        }
      }
      if (!beside && settleColumnWraps(wrapCol)) {
        state.pendingSpacing = 0;
        state.inlineGapOwed = null;
      }
    }

    // --- Directives ----------------------------------------------------
    // (A comic page, `:::page`, and a strip, `:::strip`, are placed below,
    // once a closed part or paper run has taken its page break.)
    if (rawBlock.type === 'directive' && rawBlock.directiveName !== 'page' && rawBlock.directiveName !== 'strip') {
      const name = rawBlock.directiveName;
      const attrs = rawBlock.directiveAttrs ?? {};
      if (name === 'pagebreak') {
        state.pendingSpacing = 0;
        markForcedBreak();
        advanceToNextPageBoundary(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
        const parity = attrs.parity;
        if (
          parity === 'odd'
          || parity === 'even'
          || parity === 'always-odd'
          || parity === 'always-even'
        ) {
          enforcePageParity(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, parity);
        }
        // Pending floats land on the page that follows the break — after
        // parity padding, so a blank parity page never carries a float.
        flushFloatsIntoPage(doc.pages[cursor.pageIndex]!);
        flushPendingNumberingAtBoundary();
        // `:::pagebreak{center}` (ページの左右中央, #424): the text of the page
        // the break opens is centred between the head and the foot of the
        // type area once the pass is done (`centrePageText`).
        if (attrs.center !== undefined && attrs.center.trim().toLowerCase() !== 'false') centredPages.add(cursor.pageIndex);
      } else if (name === 'columnbreak') {
        // Explicit column break: end the current column here (its bottom
        // gap is intentional, so balancing skips it) and continue in the
        // next column. A no-op in an empty column, so it never opens a
        // blank column or page.
        state.pendingSpacing = 0;
        const col = currentColumn(doc, cursor);
        if (col.blocks.length > 0) {
          col.forcedBreak = true;
          const page = doc.pages[cursor.pageIndex]!;
          if (cursor.columnIndex === page.columns.length - 1) markForcedBreak();
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          flushPendingNumberingAtBoundary();
        }
      } else if (name === 'space') {
        // Explicit vertical space (`:::space{lines=N}`), in body lines. It
        // adds to the margin between its neighbours (the pending margin
        // still collapses with the next block's top margin) and, like
        // LaTeX's `\vspace`, is discarded at a break: it vanishes at a
        // column top, and one that does not fit ends the column instead of
        // carrying over.
        const col = currentColumn(doc, cursor);
        if (col.blocks.length > 0) {
          const px = (spaceDirectiveLines(attrs) ?? 1) * baselineGrid;
          col.availableHeight = Math.max(0, col.availableHeight - px);
        }
      } else if (name === 'numbering') {
        const change: { format?: NumeralStyle; startAt?: number } = {};
        // Any spelling of a format (`roman-lower`, `arabic`, `i`…, `一` in
        // the document's script); an unknown one keeps the current format.
        const fmt = parseNumberFormat(attrs.format, resolvedLocale(resolved));
        if (fmt) change.format = fmt;
        if (attrs.startAt !== undefined) {
          const n = Number(asciiDigits(attrs.startAt));
          if (Number.isInteger(n) && n >= 1) change.startAt = n;
        }
        if (Object.keys(change).length > 0) {
          state.pendingNumberingChange = change;
          state.pendingNumberingPage = pageTakesNumbering(doc.pages[cursor.pageIndex]!) ? cursor.pageIndex + 1 : cursor.pageIndex;
        }
      }
      return 'continue';
    }

    // --- Container markers ---------------------------------------------
    // `:::paragraphs` applies its style's top margin on entry through the
    // pending-spacing mechanism (collapses like any margin, vanishes at a
    // column top). Its bottom margin is normally set by the last
    // paragraph (baked into its grid snap, or carried past it with
    // `paragraphContainerSpacing: 'collapse'`); the pending-spacing
    // fallback covers containers that end with a non-paragraph block. Replaying a marker after a keep-with-next rewind is
    // harmless: the container plan is index-based, and `max` is idempotent.
    // `:::part`: the opener lives on a dedicated single-column page. On
    // entry, break to a fresh page of the configured parity and convert it
    // into a part page; on exit, break again so the following content (and
    // the next chapter's own parity rule) starts clean. A part page counts
    // as content even with an empty body — its opener design fills it — so
    // consecutive parts never share a page.
    // `parts.page: false`: a part opens no page and its body is not set —
    // it only takes effect (running heads, palette) from the next content.
    if (state.skipPartUntil !== null) {
      if (blockTurn.blockIdx >= state.skipPartUntil) state.skipPartUntil = null;
      return 'continue';
    }
    if (!resolved.parts.page && rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockTurn.blockIdx);
      if (plan) {
        const end = [...partPlan.byEnd].find(([, p]) => p === plan)?.[0] ?? blockTurn.blockIdx;
        const marks = (doc.partMarks ??= []);
        if (!marks.some((m) => m.afterContentIndex === end)) marks.push({ afterContentIndex: end, number: plan.number, title: plan.title, ...(plan.palette && Object.keys(plan.palette).length > 0 ? { palette: plan.palette } : {}) });
        state.skipPartUntil = end;
        return 'continue';
      }
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockTurn.blockIdx);
      if (plan) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockTurn.blockIdx);
        leaveCurrentPage();
        enforcePageParity(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, resolved.parts.breakBefore.parity);
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
        openerPages.add(doc.pages[cursor.pageIndex]!);
        flushPendingNumberingAtBoundary();
        return 'continue';
      }
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerName === 'part') {
      const plan = partPlan.byEnd.get(blockTurn.blockIdx);
      if (plan) {
        state.pendingSpacing = 0;
        // Deferred until the next placed block so a part that closes the
        // document leaves no trailing empty page behind.
        if (resolved.parts.breakAfter.enabled) state.pendingPartBreak = resolved.parts.breakAfter.parity;
        return 'continue';
      }
    }
    if (state.pendingPartBreak !== null) {
      const parity = state.pendingPartBreak;
      state.pendingPartBreak = null;
      state.pendingSpacing = 0;
      closeFlowSegment(blockTurn.blockIdx);
      leaveCurrentPage();
      enforcePageParity(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, parity);
      flushPendingNumberingAtBoundary();
    }
    // `:::paper`: a paper stock belongs to whole sheets, so its content
    // starts on a fresh page, and so does what follows it. The closing
    // break waits for the next placed block (a run that ends the document
    // leaves no empty page behind). The pages get their `paper` once laid
    // out (`stampPagePaper`).
    if ((rawBlock.type === 'containerStart' || rawBlock.type === 'containerEnd') && rawBlock.containerName === 'paper') {
      if (rawBlock.type === 'containerStart') {
        state.pendingPaperBreak = false;
        breakForPaper(blockTurn.blockIdx);
      } else {
        state.pendingPaperBreak = true;
      }
      return 'continue';
    }
    if (state.pendingPaperBreak) {
      state.pendingPaperBreak = false;
      breakForPaper(blockTurn.blockIdx);
    }
    // A composed page (`::::page{template=…}`, #855): it owns a fresh page,
    // its template's frames filled with its stories (`layoutComposedPage`);
    // nothing flows on it, and what follows starts on the next page. A
    // story whose frame this side lacks, and content no frame takes, are
    // set in the flow there. A page whose template is unknown is set in
    // the flow on pages of its own (`templateUnknown`).
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'composedPage') {
      const planned = composedPlans.get(blockTurn.blockIdx);
      state.pendingComposedBreak = false;
      if (planned && rawBlock.composedPage) placeComposedPage(planned, rawBlock.composedPage);
      else breakForPaper(blockTurn.blockIdx);
      return 'continue';
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerName === 'composedPage') {
      // (Set to `'page'` by `placeComposedPage`, a closure the flow
      // analysis does not follow.)
      if ((state.pendingComposedBreak as false | 'page' | 'flow') !== 'page') state.pendingComposedBreak = 'flow';
      return 'continue';
    }
    const composedBreak = state.pendingComposedBreak as false | 'page' | 'flow';
    if (composedBreak === 'flow') {
      state.pendingComposedBreak = false;
      breakForPaper(blockTurn.blockIdx);
    } else if (composedBreak === 'page') {
      state.pendingComposedBreak = false;
      state.pendingSpacing = 0;
      leaveCurrentPage();
      flushPendingNumberingAtBoundary();
    }
    // `:::page`: a comic page owns a fresh page — its panels, split lines
    // and lettering laid out on the sheet (`layoutComicPage`); nothing
    // flows on it, and what follows starts on the next page.
    if (rawBlock.type === 'directive' && rawBlock.directiveName === 'page') {
      if (rawBlock.comic) {
        state.pendingComicBreak = false;
        state.pendingSpacing = 0;
        closeFlowSegment(blockTurn.blockIdx);
        leaveCurrentPage();
        cursor.columnIndex = 0;
        if (isComicSpread(rawBlock.comic)) placeComicSpread(rawBlock.comic, comicTextPlans.get(blockTurn.blockIdx));
        else {
          const page = doc.pages[cursor.pageIndex]!;
          page.columns = [createVDTColumn(0, page.contentArea)];
          page.comic = layoutComicPage(rawBlock.comic, {
            resolved,
            page,
            trimBox: pageMetrics.physical.trimBox,
            bleedBox: pageMetrics.physical.bleedBox,
            resources: resourceById,
            sourceOffset: bodyOffset,
            mirrorMargins: pageMirrored(resolved, page.index, pageIndexOffset, true),
          });
          const textPlan = comicTextPlans.get(blockTurn.blockIdx);
          if (textPlan) placeComicText(page, page.comic, textPlan);
        }
        state.pendingComicBreak = true;
        flushPendingNumberingAtBoundary();
      }
      return 'continue';
    }
    if (state.pendingComicBreak) {
      state.pendingComicBreak = false;
      state.pendingSpacing = 0;
      leaveCurrentPage();
      flushPendingNumberingAtBoundary();
    }
    // `:::strip`: a comic in the flow, one unbreakable box set here or
    // floated to a band like a figure (`placeComicStrip`).
    if (rawBlock.type === 'directive' && rawBlock.directiveName === 'strip') {
      if (rawBlock.comic) {
        const rewind = placeComicStrip(blockTurn.blockIdx, rawBlock.comic);
        if (rewind !== undefined) {
          blockTurn.blockIdx = rewind;
          return 'continue';
        }
      }
      flushPendingNumberingAtBoundary();
      return 'continue';
    }
    // The box of a page-wide strip set `here` (`wrapPageSpanEmbeds`) cuts a
    // band of several columns; elsewhere the strip is set in the flow as any
    // strip, its box markers passed over.
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout'
      && rawBlock.containerAttrs?.type === SPAN_EMBED_STYLE_ID && isPageSpanStrip(contentBlocks[blockTurn.blockIdx + 1])
      && !multiColumnBand(doc.pages[cursor.pageIndex]!)) {
      looseStripBoxes.add(rawBlock.containerId!);
      return 'continue';
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerId !== undefined && looseStripBoxes.has(rawBlock.containerId)) {
      // What the strip owes below it passes through its box's closing marker.
      // (Set by the strip's placement, in a callback the flow analysis
      // does not follow.)
      const owed = state.inlineGapOwed as { afterIdx: number; pending: number; exact: number; container?: boolean } | null;
      if (owed && owed.afterIdx === blockTurn.blockIdx - 1) state.inlineGapOwed = { ...owed, afterIdx: blockTurn.blockIdx };
      return 'continue';
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout') {
      const plan = calloutPlan.get(blockTurn.blockIdx);
      if (plan && pickCalloutStyle(calloutStyles, plan.attrs.type)) {
        // A float barrier box (e.g. a chapter's closing "key points")
        // takes every pending float first — in the current page's free
        // slots, else on pages opened ahead of it — so no float escapes
        // past it. The page stays balanceable (no forced break).
        // A page-span barrier box drains inside `placeCalloutSpan`, once
        // the page-span figures before it have taken the band cut.
        if (pickCalloutStyle(calloutStyles, plan.attrs.type)!.floatBarrier && !spanBoxAt(blockTurn.blockIdx)) {
          tryPlacePendingFloatsOnCurrentPage();
          drainPendingFloats();
        }
        // `span: 'page'` boxes in multi-column layouts branch to the
        // span-block path inside; `placement: 'top' | 'bottom'` still
        // falls back to inline placement (floating boxes pending).
        const rewind = placeCalloutInline(blockTurn.blockIdx, plan);
        // Children were laid out inside the box — skip them in the main loop
        // (the for-loop's `++` lands just past the closing marker).
        blockTurn.blockIdx = rewind !== undefined ? rewind : plan.endIdx;
        flushPendingNumberingAtBoundary();
        return 'continue';
      }
    }
    if (rawBlock.type === 'containerStart' || rawBlock.type === 'containerEnd') {
      const pc = rawBlock.containerId !== undefined
        ? paragraphContainers.byId.get(rawBlock.containerId)
        : undefined;
      // What a container tail still owes passes through the closing
      // markers right after it (see `inlineGapOwed`).
      const owed: typeof state.inlineGapOwed = rawBlock.type === 'containerEnd' && state.inlineGapOwed?.container
        && state.inlineGapOwed.afterIdx === blockTurn.blockIdx - 1 && state.pendingSpacing === state.inlineGapOwed.pending
        ? state.inlineGapOwed
        : null;
      let owedExact: number = owed?.exact ?? 0;
      if (pc) {
        // Margins collapse with the pending spacing; a negative one pulls
        // the flow up past it instead (the container starts inside the
        // space the previous block left, or the next block inside the
        // container's).
        const collapse = (margin: number): number =>
          margin < 0 ? state.pendingSpacing + margin : Math.max(state.pendingSpacing, margin);
        if (rawBlock.type === 'containerStart') {
          state.pendingSpacing = collapse(pc.marginTopPx);
        } else if (contentBlocks[blockTurn.blockIdx - 1]?.type !== 'paragraph') {
          const margin = pc.marginBottomPx;
          owedExact = margin < 0 ? owedExact + margin : Math.max(owedExact, margin);
          state.pendingSpacing = collapse(margin);
        }
      }
      if (owed) state.inlineGapOwed = { afterIdx: blockTurn.blockIdx, pending: state.pendingSpacing, exact: owedExact, container: true };
      return 'continue';
    }
  };
  return { dispatchBlock };
}
