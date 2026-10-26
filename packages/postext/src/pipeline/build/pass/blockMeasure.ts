// Measuring a block for the column it is about to enter: heading claims,
// container tails, loose-paragraph budgets, inline asides and figures fitted
// to the page.
// Part of the placement pass (pass.ts), split out of its loop in #1276.
import type { BlockIteration, StepJump } from './blockIteration.js';
import type { PassState } from './state.js';
import { type LooseBudget, flexFigureKey } from '../../columns/columnBalancing.js';
import { type ResolvedConfig, type VDTDocument, type VDTPage, type VDTColumn, pageIsVertical } from '../../../vdt.js';
import { type HeadingLevelResolver, type HeadingSectionPlan, headingIsHidden } from '../../sections/headingStyles.js';
import type { ContentBlock } from '../../../parse/index.js';
import { type ParagraphContainerPlan, containerStyle } from '../../callouts/paragraphContainers.js';
import type { PartPlan } from '../../sections/parts.js';
import { type PlacementCursor, advanceToNextPageBoundary, enforcePageParity, currentColumn, advanceToNextColumn, FIT_EPS } from '../../blocks/placement.js';
import type { FloatRotation } from './types.js';
import { type BlockMeasureContext, type MeasureContentBlockOptions, measureContentBlock } from '../../blocks/measureContentBlock.js';
import type { ResolvedHeadingStyleConfig } from '../../../types/structure/headingStyles.js';
import type { ResolvedHeadingLevelConfig, Resource, ResourceType } from '../../../types.js';
import { type InlineAside, MIN_INLINE_FIGURE_SCALE } from '../passTypes.js';
import { measureLooseParagraph, headingSetsOwnBand } from '../passHelpers.js';

/** What createBlockMeasure takes from around the loop. */
export interface BlockMeasureDeps {
  state: PassState;
  balanceLooseness: ReadonlyMap<number, number> | undefined;
  balanceLooseBudget: ReadonlyMap<number, LooseBudget> | undefined;
  balanceExtraPx: ReadonlyMap<number, number> | undefined;
  resolved: ResolvedConfig;
  trackingLadder: number[];
  looseOutcome: Map<number, number | null>;
  looseOffGrid: Set<number>;
  looseGained: Map<number, number>;
  headingLevels: HeadingLevelResolver;
  dpi: number;
  doc: VDTDocument;
  pageWidthPx: number;
  pageHeightPx: number;
  contentBlocks: ContentBlock[];
  paragraphContainers: ParagraphContainerPlan;
  partPlan: PartPlan;
  sectionPlan: HeadingSectionPlan;
  cursor: PlacementCursor;
  openerPages: Set<VDTPage>;
  floatGapPx: number;
  uprightOn: (page: VDTPage) => FloatRotation;
  onNewPage: (page: VDTPage) => void;
  partMeasureCtx: BlockMeasureContext;
  sectionMeasureCtx: (style: ResolvedHeadingStyleConfig | undefined) => BlockMeasureContext;
  measuredAcrossPage: (raw: ContentBlock) => boolean;
  atColumnHead: (col: VDTColumn) => boolean;
  openSpanHeadingHere: (blockIdx: number, rawBlock: ContentBlock, level: ResolvedHeadingLevelConfig) => boolean;
  closeFlowSegment: (boundaryIndex: number) => void;
  flushPendingNumberingAtBoundary: () => void;
  inlineAsideWanted: (resource: Resource | undefined, type: ResourceType | undefined, page: VDTPage) => boolean;
  measureInlineAside: (raw: ContentBlock, blockIdx: number, c: VDTColumn, page: VDTPage, ctx: BlockMeasureContext, base: MeasureContentBlockOptions, spacing: number) => InlineAside | null;
  firstFlowBlockIdx: number;
}

export function createBlockMeasure(deps: BlockMeasureDeps) {
  const {
    state, balanceLooseness, balanceLooseBudget, balanceExtraPx, resolved, trackingLadder,
    looseOutcome, looseOffGrid, looseGained, headingLevels, dpi, doc, pageWidthPx, pageHeightPx,
    contentBlocks, paragraphContainers, partPlan, sectionPlan, cursor, openerPages, floatGapPx,
    uprightOn, onNewPage, partMeasureCtx, sectionMeasureCtx, measuredAcrossPage, atColumnHead,
    openSpanHeadingHere, closeFlowSegment, flushPendingNumberingAtBoundary, inlineAsideWanted,
    measureInlineAside, firstFlowBlockIdx
  } = deps;
  /** Measures the block at the width of its column; `continue` when there is
   *  nothing to set. */
  const measureBlock = (blockTurn: BlockIteration): StepJump => {
    const {
      rawBlock
    } = blockTurn;
    // --- Heading `breakBefore` ----------------------------------------
    if (rawBlock.type === 'heading' && rawBlock.level) {
      const level = headingLevels.forBlock(rawBlock);
      const bb = level?.breakBefore;
      /** The heading opens its page (#749): with its own break, or as the
       *  first block of the document. */
      let opensPage = blockTurn.blockIdx === firstFlowBlockIdx;
      if (bb && bb.enabled) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockTurn.blockIdx);
        advanceToNextPageBoundary(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
        if (bb.parity !== 'any') {
          enforcePageParity(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, bb.parity);
        }
        flushPendingNumberingAtBoundary();
        opensPage = true;
      }
      // `span: 'page'` headings open a chapter band across the full content
      // width. Always start on a fresh page boundary so the band sits at the
      // page top, and reset the cursor to column 0 so all other columns will
      // have their availableHeight reduced symmetrically after placement —
      // unless the level opens it where the text reaches (`spanBreak:
      // false`, #539) and the page holds it there.
      if (level?.span === 'page' && !(level.spanBreak === false && !bb?.enabled && openSpanHeadingHere(blockTurn.blockIdx, rawBlock, level))) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockTurn.blockIdx);
        advanceToNextPageBoundary(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx);
        cursor.columnIndex = 0;
        flushPendingNumberingAtBoundary();
        opensPage = true;
      }
      if (opensPage) openerPages.add(doc.pages[cursor.pageIndex]!);
    }

    const id = `block-${state.blockIdCounter++}`;

    // Enclosing `:::paragraphs` container (if any). Its last paragraph — the
    // one directly before the closing marker — carries the tail style and
    // snaps the flow back onto the baseline grid.
    const paragraphContainer = paragraphContainers.byBlock[blockTurn.blockIdx];
    const nextRaw = contentBlocks[blockTurn.blockIdx + 1];
    const isContainerTail = paragraphContainer !== undefined
      && nextRaw?.type === 'containerEnd'
      && nextRaw.containerId === paragraphContainer.id;

    // A page-span box that left no band under it keeps the cursor on its
    // (full) span column. Move on before measuring: a block measured at the
    // span width and placed in the next page's text column would carry
    // lines wider than that column.
    if (currentColumn(doc, cursor).kind === 'span') {
      state.pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
    }
    // Measure against the current column width. `null` means there is nothing
    // to place inline (empty text, unknown resource id, floated resource).
    const col = currentColumn(doc, cursor);
    const blockMeasureCtx = partPlan.byBlock[blockTurn.blockIdx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[blockTurn.blockIdx]);
    /** The space under a container that closes on a paragraph merges with
     *  the next block's own (`bodyText.paragraphContainerSpacing:
     *  'collapse'`, EF-159 / EF-181): it is at least the paragraph spacing
     *  of the text around the container, and a snapped tail carries it as
     *  pending spacing instead of baking it into the snap. A negative
     *  `marginBottom` pulls the flow up as in 1.4. A container that closes
     *  on anything else (a list) is set as in 1.4 under either rule: the
     *  block keeps its own space in its snap, and the container's
     *  `marginBottom` follows as pending spacing from the closing marker. */
    const containerTail = isContainerTail && rawBlock.type === 'paragraph' ? paragraphContainer : undefined;
    // (A paragraph style may set the rule for its own containers, #715.)
    const collapseTail = containerTail !== undefined
      && (containerTail.spacing ?? resolved.bodyText.paragraphContainerSpacing) === 'collapse'
      && containerTail.tailStyle.marginBottomPx >= 0;
    const tailStyle = collapseTail && blockMeasureCtx.bodyStyle.marginBottomPx > containerTail.tailStyle.marginBottomPx
      ? { ...containerTail.tailStyle, marginBottomPx: blockMeasureCtx.bodyStyle.marginBottomPx }
      : containerTail?.tailStyle;
    const styleOverride = paragraphContainer
      ? (paragraphContainer.overBody
        ? containerStyle(paragraphContainer, isContainerTail, blockMeasureCtx.bodyStyle, dpi)
        : isContainerTail ? tailStyle ?? paragraphContainer.tailStyle : paragraphContainer.style)
      : undefined;
    // Column balancing "run a paragraph long": the loose path is taken only
    // for the paragraphs the driver asked for, so the common case keeps its
    // existing measurement cache keys.
    const looseLines = balanceLooseness?.get(blockTurn.blockIdx);
    const budget = balanceLooseBudget?.get(blockTurn.blockIdx);
    // A candidate already known to have gained its line (from an earlier
    // measurement in this pass) keeps it; one whose column met its budget
    // is left as it is. Others walk the ladder and report their outcome.
    const knownOutcome = looseOutcome.get(blockTurn.blockIdx);
    const budgetMet = budget !== undefined
      && knownOutcome === undefined
      && (looseGained.get(budget.group) ?? 0) >= budget.need;
    const tryLoose = looseLines !== undefined && !budgetMet && knownOutcome !== null;
    // A page-span heading is painted across the content area, by the
    // default opener or by its design: measured at that width, its band
    // holds the title as it is painted (EF-100), and a design sets it no
    // taller than the lines it paints (#1224).
    const measureWidth = rawBlock.type === 'heading' && measuredAcrossPage(rawBlock)
      ? doc.pages[cursor.pageIndex]!.contentArea.width
      : col.bbox.width;
    // A resource on a vertical page stands upright, its frame at most as
    // wide as the flow is tall (less the float gap it keeps).
    const blockPage = doc.pages[cursor.pageIndex]!;
    const upright = pageIsVertical(blockPage) && rawBlock.type === 'resourceBlock'
      ? { uprightMaxLength: uprightOn(blockPage).length }
      : {};
    // Column balancing: an inline picture with a safe area grown by whole
    // lines (`flexFigure`, #442).
    const figureGrowPx = rawBlock.type === 'resourceBlock' ? balanceExtraPx?.get(flexFigureKey(blockTurn.blockIdx)) ?? 0 : 0;
    const figureDelta = figureGrowPx > 0 ? { figureHeightDelta: figureGrowPx } : {};
    blockTurn.measuredBlock = tryLoose
      ? measureLooseParagraph(rawBlock, blockTurn.blockIdx, col.bbox.width, blockMeasureCtx, styleOverride, looseLines, trackingLadder, looseOutcome, looseOffGrid)
      : measureContentBlock(rawBlock, blockTurn.blockIdx, measureWidth, blockMeasureCtx, { styleOverride, ...upright, ...figureDelta });
    // A resource set in the text with `captionSide` (#729): its caption and
    // note go to the band's side column when that is free beside it, and
    // the block is as tall as the body alone. Decided again in every
    // column the block is tried in (see the resource branch below).
    const asideWanted = blockTurn.measuredBlock?.kind.vdtType === 'resource' && rawBlock.type === 'resourceBlock'
      && inlineAsideWanted(blockTurn.measuredBlock.kind.resource, blockTurn.measuredBlock.kind.resourceType, blockPage);
    blockTurn.inlineAside = asideWanted
      ? measureInlineAside(rawBlock, blockTurn.blockIdx, col, blockPage, blockMeasureCtx, { styleOverride, ...figureDelta }, Math.max(state.pendingSpacing, floatGapPx))
      : null;
    if (blockTurn.inlineAside) blockTurn.measuredBlock = blockTurn.inlineAside.block;
    const asideOpts = blockTurn.inlineAside?.opts;
    // An inline picture with a safe area a little too tall for the room
    // left in its column is cropped within its safe area to stay there
    // rather than move on and leave the column short (#442).
    if (blockTurn.measuredBlock?.kind.vdtType === 'resource' && blockTurn.measuredBlock.resourceBlock?.bodyFlex) {
      const flex = blockTurn.measuredBlock.resourceBlock.bodyFlex;
      const room = col.availableHeight - (atColumnHead(col) ? 0 : Math.max(state.pendingSpacing, floatGapPx));
      const over = blockTurn.measuredBlock.measured.totalHeight - room;
      if (over > 0.01 && room > 0 && over <= flex.shrink + 0.01) {
        const cropped = measureContentBlock(rawBlock, blockTurn.blockIdx, measureWidth, blockMeasureCtx, {
          styleOverride, ...upright, ...asideOpts, figureHeightDelta: flex.delta - over,
        });
        if (cropped && cropped.measured.totalHeight <= room + 0.01) blockTurn.measuredBlock = cropped;
      }
    }
    // Screen pages (`layout.fitFiguresToPage`): an inline figure a little
    // too tall for the room left in its column — under an opener band, say
    // — is set smaller to stay with its text rather than leave the rest of
    // the page empty. Never below MIN_INLINE_FIGURE_SCALE of its size.
    if (blockTurn.measuredBlock?.kind.vdtType === 'resource' && resolved.layout.fitFiguresToPage) {
      const rb = blockTurn.measuredBlock.resourceBlock;
      const room = col.availableHeight - (atColumnHead(col) ? 0 : Math.max(state.pendingSpacing, floatGapPx));
      if (rb && !rb.table && !rb.rotation && rb.bodyRect.height > 0 && blockTurn.measuredBlock.measured.totalHeight > room + FIT_EPS && room > 0) {
        let width = rb.bodyRect.width;
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = blockTurn.measuredBlock.resourceBlock!;
          const rest = blockTurn.measuredBlock.measured.totalHeight - current.bodyRect.height;
          const scale = (room - rest) / current.bodyRect.height;
          if (!(scale > 0)) break;
          width = current.bodyRect.width * Math.min(scale, 0.99);
          if (width < rb.bodyRect.width * MIN_INLINE_FIGURE_SCALE) break;
          const smaller = measureContentBlock(rawBlock, blockTurn.blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride, ...asideOpts, figureMaxBodyWidth: width });
          if (!smaller) break;
          blockTurn.measuredBlock = smaller;
          if (smaller.measured.totalHeight <= room + FIT_EPS) break;
        }
        // Still too tall at the smallest acceptable size: back to full size
        // and on to the next column, as without the option.
        if (blockTurn.measuredBlock!.measured.totalHeight > room + FIT_EPS) {
          blockTurn.measuredBlock = measureContentBlock(rawBlock, blockTurn.blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride, ...asideOpts });
        }
      }
    }
    // The fits above keep the caption at the side: they work on the body.
    if (blockTurn.inlineAside) blockTurn.inlineAside = blockTurn.measuredBlock?.asideHeight !== undefined ? { ...blockTurn.inlineAside, block: blockTurn.measuredBlock } : null;
    if (tryLoose && budget !== undefined && knownOutcome === undefined && typeof looseOutcome.get(blockTurn.blockIdx) === 'number') {
      looseGained.set(budget.group, (looseGained.get(budget.group) ?? 0) + 1);
    }
    if (!blockTurn.measuredBlock) return 'continue';
    const { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender } = blockTurn.measuredBlock;
    /** The drop cap opening the paragraph (#623): stamped on the fragment
     *  that holds its first line. A paragraph broken again for a column of
     *  another width takes the one of that setting. */
    blockTurn.capInfo = blockTurn.measuredBlock.dropCap;
    /** Tracking the block's lines are set with; a paragraph moved whole into
     *  a column of another width is measured again, and may change it. */
    ({ letterSpacingPx: blockTurn.letterSpacingPx, runtTracking: blockTurn.runtTracking } = blockTurn.measuredBlock);
    const { vdtType, headingLevel, numberPrefix, numberSeparator, headingNumber, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;
    // A structural heading (`hidden`) is placed like any heading — its
    // break, keep-with-next and grid snap apply — but with no line height
    // and no margins: it takes no room, and renderers skip it.
    const hiddenHeading = vdtType === 'heading' && headingIsHidden(rawBlock, headingLevels.forBlock(rawBlock));
    // 行取り (#424): a heading with a `lineSpan` takes that many body grid
    // lines, its text centred in them; the band replaces its margins. Not a
    // heading painted as a page opener or from its own design.
    const lineSpan = vdtType === 'heading' && !hiddenHeading && kind.style.lineSpan !== undefined
      && !headingSetsOwnBand(headingLevels.forBlock(rawBlock))
      ? kind.style.lineSpan
      : undefined;
    const style = hiddenHeading
      ? { ...kind.style, lineHeightPx: 0, marginTopPx: 0, marginBottomPx: 0 }
      : lineSpan !== undefined ? { ...kind.style, marginTopPx: 0, marginBottomPx: 0 } : kind.style;
    blockTurn.id = id;
    blockTurn.paragraphContainer = paragraphContainer;
    blockTurn.isContainerTail = isContainerTail;
    blockTurn.col = col;
    blockTurn.blockMeasureCtx = blockMeasureCtx;
    blockTurn.collapseTail = collapseTail;
    blockTurn.styleOverride = styleOverride;
    blockTurn.looseLines = looseLines;
    blockTurn.tryLoose = tryLoose;
    blockTurn.measureWidth = measureWidth;
    blockTurn.blockPage = blockPage;
    blockTurn.figureGrowPx = figureGrowPx;
    blockTurn.figureDelta = figureDelta;
    blockTurn.asideWanted = asideWanted;
    blockTurn.kind = kind;
    blockTurn.contentBlock = contentBlock;
    blockTurn.measured = measured;
    blockTurn.prefixLen = prefixLen;
    blockTurn.absoluteSourceMap = absoluteSourceMap;
    blockTurn.mathDisplayRender = mathDisplayRender;
    blockTurn.vdtType = vdtType;
    blockTurn.headingLevel = headingLevel;
    blockTurn.numberPrefix = numberPrefix;
    blockTurn.numberSeparator = numberSeparator;
    blockTurn.headingNumber = headingNumber;
    blockTurn.listBullet = listBullet;
    blockTurn.listDepth = listDepth;
    blockTurn.listKind = listKind;
    blockTurn.bulletXOffsetInColumn = bulletXOffsetInColumn;
    blockTurn.strikethroughText = strikethroughText;
    blockTurn.hiddenHeading = hiddenHeading;
    blockTurn.lineSpan = lineSpan;
    blockTurn.style = style;
  };
  return { measureBlock };
}
