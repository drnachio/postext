import { flattenTitleBreaks } from '../parse/inlineFormatting';
import type { PostextContent, PostextConfig, Resource, ResourceType, ResourceRotation, HeadingBreakParity, ResolvedCalloutStyleConfig, ResolvedHeadingLevelConfig, CalloutSpan } from '../types';
import type { HeadingPlaceholderInfo } from '../design/placeholders';
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
  type VDTBalancing,
  type VDTLine,
  type ResolvedConfig,
  type ContentWarning,
} from '../vdt';
import { anchorBox } from '../design/layout';
import { parseMarkdownMemo, spaceDirectiveLines } from '../parse';
import {
  buildPageLabels,
  computeHeadingNumbering,
  parseNumberFormat,
  type NumeralStyle,
  type PageNumberSegment,
} from '../numbering';
import { extractFrontmatter, normalizeMetadata } from '../frontmatter';
import { collectConfigWarnings } from '../configWarnings';
import { initHyphenator } from '../measure';
import { getCjkLineBreak, setCjkLineBreak } from '../measure/cjkClasses';
import { cjkCompositionOf, getCjkComposition, setCjkComposition } from '../measure/cjkPunctuation';
import { getMeasureRegion, getMeasureWritingMode, setMeasureWritingMode } from '../measure/vertical';
import { stampCentralBaselines } from './verticalMetrics';
import type { MeasurementCache } from '../measure';
import { resolveAllConfig, computeBaselineGrid, resolvedLocale } from './config';
import {
  createHeadingLevelResolver,
  deriveSectionGeometryConfig,
  sectionWritingMode,
  deriveSectionMeasureContext,
  headingIsHidden,
  headingIsNumbered,
  headingMarksFor,
  headingStyleOf,
  planHeadingSections,
} from './headingStyles';
import { computeOutline, hasIndexDirective, hasTocDirective, headingNumberingOptions, headingTemplatesOf, outlineFromDoc, sameOutline } from './outline';
import { expandTocDirectives } from './toc';
import { expandIndexDirectives, locateIndexMarks } from './indexDirective';
import type { ResolvedHeadingStyleConfig } from '../types';
import { resolveBodyStyle, resolveBlockquoteStyle, resolveParagraphStyle, type BlockStyle } from './styles';
import {
  computeLevelIndentsPx,
  computeOrderedLevelIndentsPx,
  computeOrderedListRunMetrics,
  listBulletPosition,
  listItemGapPx,
  listItemSpacingPx,
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
  sideColumnOf,
  sideColumns,
  sideUsedBottom,
  pageIsOccupied,
  bandColumns,
  currentBand,
  isBandLevel,
  bandUsedBottom,
  closeBandAndInsertSpan,
  pageLayoutOf,
} from './placement';
import { chooseParagraphSplit } from './orphanWidow';
import {
  applyStyleAttrs,
  computePageMetrics,
  pageMirrored,
  sheetRectToFlow,
  isMarkerBlock,
  nextNonMarkerBlock,
  spaceLinesAfter,
  prevNonMarkerBlock,
  rollbackTrailingBlocks,
} from './buildHelpers';
import { measureContentBlock, type BlockMeasureContext, type MeasureContentBlockOptions, type MeasuredContentBlock } from './measureContentBlock';
import { planParagraphContainers } from './paragraphContainers';
import {
  appendChapterEndNotes,
  footnoteIdsOfLines,
  footnoteParagraphStyle,
  noteContentBlock,
  numberFootnotes,
  splitFootnoteDefinitions,
  withFootnoteStyle,
} from './footnotes';
import { planParts, derivePartMeasureContext } from './parts';
import {
  layoutCallout,
  offsetCalloutToAbsolute,
  pickCalloutStyle,
  planCallouts,
  resolveCalloutAttrs,
  type CalloutLayoutResult,
  type CalloutUnit,
  type PlannedCallout,
  type CalloutLineWidth,
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
  floatGapAbove,
  measureSideStack,
  clearSideObstacles,
  columnHasFloatBand,
  fitsStrict,
  trueBottom,
  type ColumnCapKind,
  type FloatMeasure,
  type FloatSlot,
  type FloatSlotPosition,
  type SideObstacle,
} from './floatSlots';
import {
  computeHeadingContext,
  computeResourceNumbering,
  type ResourceNumberingMap,
} from './resourceNumbering';
import { defaultResourceTypes, documentLocale } from '../defaults/resourceTypes';
import { pickTableStyle } from '../defaults/tableStyle';
import { buildHeadersAndFooters, defaultOpenerTitle, headingDesignBoxes, headingTitleText, measureDefaultOpenerHeight, measureHeadingDesign } from './headerFooter';
import { flowColorValues } from './partPalette';
import { chapterNumberCounter, leadingBoldText } from './placeholders';
import { proposeBalanceLines, collectColumnGaps, firstDivergentColumn, gapLinesIn, boxRoomIn, boxLeverKeys, pageSegments, type LooseBudget, type PageRange, type ColumnGap, MAX_BALANCING_PASSES, MAX_BALANCING_PASSES_PER_DOCUMENT, balanceKey } from './columnBalancing';
import {
  applyBandCap,
  uncapBand,
  columnBottom,
  bandCapLines,
  bandTop,
  bareBandTop,
  resolveBandCapsGen, drainPasses,
  resolveTrailingCapsGen,
  type BandCap,
  type BandPassReport,
  bandCapLinesAroundZone,
  type BandCapZone,
} from './bandCaps';
import { raggedLooseLines } from './raggedLines';
import { cjkLooseLineWarnings, collectContentWarnings, locateContentWarnings } from './contentWarnings';
import { annotateDocument } from '../cjkMarks';
import { withBookTitleBrackets } from './annotations';

/** Tolerance for "does this block fit" checks against a column's free
 *  height, absorbing floating-point drift between grid multiples. */
const FIT_EPS = 0.01;
/** Room (px) under closing boxes a balancing pass must close to be kept on
 *  that ground alone (see `boxRoomIn`). */
const BOX_ROOM_EPS_PX = 0.5;
/** Overflow past a capped column's foot (px) that counts as content the
 *  cut did not hold — a clipped line, not floating-point drift. */
const CAPPED_OVERFLOW_PX = 0.5;
/** Smallest share of its width an inline figure is set at to stay in the
 *  room left in its column (`layout.fitFiguresToPage`). */
const MIN_INLINE_FIGURE_SCALE = 0.5;

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
  /**
   * Called after every placement pass with its wall time — the engine
   * re-places the document several times (band caps, column balancing,
   * contents rounds); dev tooling shows where a build's time went.
   */
  onPass?: (info: BuildPassInfo) => void;
}

/** One placement pass of a build, as reported to {@link BuildDocumentOptions.onPass}. */
export interface BuildPassInfo {
  /** 1-based pass within its contents round. */
  pass: number;
  /** 0-based round of a document laying out its own contents (see `MAX_TOC_ROUNDS`). */
  tocRound: number;
  /** Wall time of the pass in ms. */
  ms: number;
  /** Pages the pass produced. */
  pages: number;
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
  /** Figures (resource ids) whose side caption (`placement.captionSide`)
   *  goes under the figure instead: an earlier pass found the side column
   *  too short for a side box or side float once the caption had taken its
   *  foot, and the box spilled over the caption. */
  captionUnder?: ReadonlySet<string>;
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
  /** Figures whose side caption this pass found in the way of a side box or
   *  side float that had to overflow the side column: candidates for
   *  `PassHints.captionUnder` in the next pass. */
  captionUnderProposals: Set<string>;
}

/** `{chapterNumber}` at each content block: the value of the last level-1
 *  heading at or before it ('' before the first), by the counter the
 *  running heads use over the placed blocks (`computeChapterNumbers`) —
 *  fed the same fields the placed heading blocks will carry. */
function chapterNumbersOfContent(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  prefixes: ReadonlyArray<string | undefined>,
  values: ReadonlyArray<number | undefined>,
  ordinalOffset: number,
): string[] {
  const numberless = new Set(resolved.headingStyles.filter((s) => s.numberingTemplate === '').map((s) => s.id));
  const next = chapterNumberCounter<{ unnumbered?: boolean; contentIndex: number; headingNumber?: number; numberPrefix?: string; styleId?: string }>(
    ordinalOffset,
    (b) => b.styleId !== undefined && numberless.has(b.styleId),
  );
  let current = '';
  return blocks.map((b, i) => {
    if (b.type === 'heading' && (b.level ?? 1) === 1) {
      const style = headingStyleOf(b, resolved);
      const value = next({
        contentIndex: i,
        unnumbered: style ? !style.numbered : false,
        headingNumber: values[i],
        numberPrefix: prefixes[i],
        styleId: style?.id,
      });
      // A plate (`runningChapter: false`) reads its own value; the blocks
      // after it stay in the chapter it interrupts.
      if (style && !style.runningChapter) return value;
      current = value;
    }
    return current;
  });
}

/**
 * Column balancing: measure a paragraph asked to run `extraLines` long.
 * Walks the tracking ladder — no tracking first, then a little positive
 * tracking up to `maxTracking` — and keeps the first measurement that gains
 * exactly the requested lines within the word-spacing limit (a rung that
 * gains the line on its own, without needing the looseness target, counts
 * too). A solution whose extra line is a runt is refused: filling a
 * column's foot is no reason to leave a syllable alone at the end of a
 * paragraph. So is one with a justified line past `bodyText.maxWordSpacing`
 * (EF-129): the breaker keeps a looser line only when no break set stays
 * within the limit, and filling a column is no reason to print one. Falls
 * back to the plain measurement when no rung works, recording the outcome
 * either way.
 *
 * The target counts from the paragraph as placed, which the runt fix may
 * have set a line shorter than the breaker's own optimum; the breaker's
 * looseness counts from that optimum, so such a paragraph asks it for one
 * line less (EF-129: asked for one more, it could only match the target by
 * falling back to its optimum, unchecked).
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
  // The breaker's optimum, before any runt fix (a looseness of 0 skips it).
  const optimum = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, { styleOverride, looseness: 0 });
  const looseness = optimum ? target - optimum.measured.lines.length : extraLines;
  const maxWordSpacing = ctx.resolved.bodyText.maxWordSpacing + 1e-9;
  // A CJK line spread past its tracking cap (`cjkLoose`) is past the
  // limit too.
  const withinLimit = (lines: readonly VDTLine[]): boolean =>
    lines.every((l) => l.isLastLine || ((l.justifiedSpaceRatio === undefined || l.justifiedSpaceRatio <= maxWordSpacing) && !l.cjkLoose));
  for (const tracking of trackingLadder) {
    const loose = measureContentBlock(rawBlock, blockIdx, columnWidth, ctx, {
      styleOverride,
      looseness,
      trackingEm: tracking > 0 ? tracking / 1000 : undefined,
    });
    if (
      loose
      && loose.measured.lines.length === target
      && !loose.measured.lastLineRunt
      && withinLimit(loose.measured.lines)
    ) {
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
  // A pass sets the CJK line-break level, the CJK composition and the
  // writing mode text is measured in for its own measuring; what the caller had in force is put
  // back when it ends, also when it throws (a cancelled build), so text
  // measured outside a build reads as it did before it.
  const lineBreak = getCjkLineBreak();
  const composition = getCjkComposition();
  const writingMode = getMeasureWritingMode();
  const region = getMeasureRegion();
  try {
    return placeDocumentPass(content, config, cache, options, hints);
  } finally {
    setCjkLineBreak(lineBreak);
    setCjkComposition(composition);
    setMeasureWritingMode(writingMode, region);
  }
}

function placeDocumentPass(
  content: PostextContent,
  config: PostextConfig | undefined,
  cache: MeasurementCache | undefined,
  options: BuildDocumentOptions | undefined,
  hints: PassHints,
): PassResult {
  const { balanceExtraPx, balanceLooseness, balanceLooseBudget, bandCaps, captionUnder } = hints;
  const captionUnderProposals = new Set<string>();
  /** Side columns whose foot a figure's side caption has cut, by the figure. */
  const asideCutBy = new WeakMap<VDTColumn, string>();
  /** A side column that does not run the page's whole content height: a
   *  band above (a page-span box, a top float band) or a caption below has
   *  shortened it, so what does not fit it may still fit a full column. */
  const shortSideColumn = (page: VDTPage, col: VDTColumn): boolean => col.bbox.height < page.contentArea.height - 0.5;
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
  // Level configs with heading-style overrides merged in (`{style="…"}`).
  const headingLevels = createHeadingLevelResolver(resolved);
  const dpi = resolved.page.dpi;

  // The document's hyphenation dictionary, set whatever the alignment: every
  // hyphenating text shares it — body text, paragraph styles, callout bodies,
  // design text — and so do the words wider than their measure, divided at a
  // syllable even in ragged text. Left unset, a build would hyphenate with
  // whichever dictionary the previous one (or the default, en-us) chose.
  initHyphenator(resolved.bodyText.hyphenation.locale);
  // CJK text breaks at the document's level wherever it is measured (body,
  // captions, cells, notes, boxes), as it hyphenates in its language.
  setCjkLineBreak(resolved.cjk.lineBreak);
  // And is composed with the document's punctuation widths, hanging and
  // Han–Latin space (along the line in either writing mode), in its
  // language.
  setCjkComposition(cjkCompositionOf(resolved.cjk, resolved.page.dpi, resolvedLocale(resolved)));
  // Characters of a vertical flow that stand in a cell advance by it (half
  // an em for the mainland interpunct).
  setMeasureWritingMode(resolved.layout.writingMode, resolved.cjk.region);

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
  // A part that closed the preceding content: its break is still owed
  // (`pendingPartBreak` below) and a first page left blank is its verso.
  const afterPartPage = continuation?.afterPartPage === true && resolved.parts.page;
  if (afterPartPage) doc.afterPartPage = true;
  // The book's page count, when the host knows it (`{bookTotalPages}`).
  const bookPageCount = Math.floor(continuation?.bookPageCount ?? 0);
  if (bookPageCount > 0) doc.bookPageCount = bookPageCount;

  const pageMetrics = computePageMetrics(resolved);
  const { pageWidthPx, pageHeightPx, trimOffset } = pageMetrics;
  // The geometry pages are opened with: the document's, or — inside a
  // styled section with its own margins / layout — the section's.
  let contentArea = pageMetrics.contentArea;
  let geomResolved = resolved;
  // Page/bleed frames for design elements anchored to `'page'` / `'bleed'`,
  // in the frame of the page's flow: the sheet's, or on a vertical page
  // (`page.flow`) the flow frame, where "the top of the page" is the
  // sheet's right edge.
  const physicalFrames = { page: pageMetrics.physical.trimBox, bleed: pageMetrics.physical.bleedBox };
  const verticalFrames = {
    page: sheetRectToFlow(pageMetrics.physical.trimBox, pageWidthPx),
    bleed: sheetRectToFlow(pageMetrics.physical.bleedBox, pageWidthPx),
    upright: true,
  };
  const designFramesOn = (page: VDTPage | undefined): { page: BoundingBox; bleed: BoundingBox; upright?: boolean } =>
    (page?.flow ? verticalFrames : physicalFrames);
  doc.trimOffset = trimOffset;
  // A right-bound book (`page.binding`): hosts show its spreads mirrored.
  if (resolved.page.binding === 'right') doc.binding = 'right';

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
  doc.pages.push(firstPage);

  // Extract frontmatter, then parse the remaining markdown body
  const { metadata: frontmatterMeta, content: markdownBody, contentOffset: bodyOffset, fieldSources } = extractFrontmatter(content.markdown);
  // Typed YAML values (`title: 1984`, `publishDate: 2026-09-24`) print as
  // text; dates in the document language (a blank `locale` is unset).
  doc.metadata = normalizeMetadata(
    { ...(content.metadata ?? {}), ...frontmatterMeta },
    resolvedLocale(resolved),
  );
  if (fieldSources) doc.metadataSources = fieldSources;
  // A configuration that leaves headings' inline marks off sets their
  // spans plain here, for the outline and the layout alike (EF-122).
  // Footnote definitions (`[^id]: …`) leave the flow; the markers are
  // numbered in citation order. With `placement: 'chapterEnd'` the notes
  // come back as paragraphs after each chapter's last block.
  const footnoteSplit = splitFootnoteDefinitions(headingMarksFor(parseMarkdownMemo(markdownBody), resolved));
  const footnoteDefs = footnoteSplit.defs;
  const footnoteNumbering = numberFootnotes(
    footnoteSplit.blocks,
    resolved.footnotes.numbering,
    resolved.footnotes.numbering === 'document' ? Math.max(0, Math.floor(continuation?.footnoteNumber ?? 0)) : 0,
  );
  const chapterEndNotes = resolved.footnotes.placement === 'chapterEnd' && footnoteNumbering.numbers.size > 0;
  const parsedBlocks = chapterEndNotes
    ? appendChapterEndNotes(footnoteSplit.blocks, footnoteNumbering, footnoteDefs)
    : footnoteSplit.blocks;
  const headingStart = continuation?.headings;
  // `:::toc` expands into the entries of the book's outline — the one the
  // host supplied, else this document's own (page labels unknown on the
  // first pass; `buildDocument` lays the document out again with them).
  // `:::index` expands into the entries of the book's index marks, from
  // the same outline.
  const outline = content.outline
    ?? (hasTocDirective(parsedBlocks) || hasIndexDirective(parsedBlocks) ? computeOutline(parsedBlocks, resolved, headingStart) : undefined);
  const indexExpanded = expandIndexDirectives(expandTocDirectives(parsedBlocks, outline, resolved), outline, resolved);
  const contentBlocks = indexExpanded.blocks;
  if (indexExpanded.warnings.length > 0) indexWarnings.set(doc, indexExpanded.warnings);
  const isNumbered = (b: ContentBlock): boolean => headingIsNumbered(b, resolved);

  const { prefixes: headingPrefixes, values: headingNumbers } = computeHeadingNumbering(
    contentBlocks,
    headingTemplatesOf(resolved),
    headingStart ? [headingStart.h1, headingStart.h2, headingStart.h3, headingStart.h4, headingStart.h5, headingStart.h6] : undefined,
    isNumbered,
    headingNumberingOptions(resolved),
  );
  // `{chapterNumber}` at each content block — the current chapter's, as the
  // running heads print it on the block's page (`computeChapterNumbers`
  // runs the same counter over the placed blocks) — so an opener design is
  // measured with the number it is painted with.
  const chapterNumberByBlock = chapterNumbersOfContent(contentBlocks, resolved, headingPrefixes, headingNumbers, doc.chapterOrdinalOffset ?? 0);

  // Resource numbering — computed up front (before the placement loop) so that
  // captions and inline `:ref`s can resolve their rendered number strings
  // before measurement. Numbering follows order of first reference in the
  // document.
  const resourceTypes: ResourceType[] = config?.resourceTypes ?? defaultResourceTypes(documentLocale(config));
  const resources: Resource[] = content.resources ?? [];
  const headingContext = computeHeadingContext(contentBlocks, headingStart, isNumbered);
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
  const paragraphContainers = planParagraphContainers(contentBlocks, chapterEndNotes ? withFootnoteStyle(resolved) : resolved);
  // `:::callout` ranges keyed by their start marker index (same rationale).
  const calloutPlan = planCallouts(contentBlocks);
  // `:::part` ranges: start/end marker indices and the enclosed blocks.
  const partPlan = planParts(contentBlocks);
  // Styled sections (`{style="…"}` headings): geometry, running heads and
  // body typography per content-block index.
  const sectionPlan = planHeadingSections(contentBlocks, resolved);

  // --- Float planning (issue #49 — resources float to page bands) ----------
  // A resource is incorporated by its first reference (an inline `:ref` or a
  // `::resource` directive, whichever comes first in reading order). Floated
  // resources detach from the running text and take the first free slot
  // after that reference (`floatSlots.ts`); the text flows past the
  // reference uninterrupted. `position: 'here'` resources keep inline
  // `::resource` placement and are not floated. A resource an earlier
  // chapter already numbered (`continuation.resourceNumbers`) was placed
  // there: here it is only referred to, never floated again.
  const incorporated = new Set(Object.keys(continuation?.resourceNumbers ?? {}));
  // A resource first referred to in a vertical flow stands upright: a turn
  // it asks for is not applied there. Decided per block, by the writing
  // mode of the styled section the reference sits in (a horizontal
  // appendix of a vertical book turns its figures as asked).
  const floatPlan = computeFloatPlan(contentBlocks, resources, resourceTypes, incorporated,
    (blockIdx) => sectionWritingMode(sectionPlan, resolved, blockIdx) === 'vertical-rl');
  const floatedIds = floatedResourceIds(floatPlan, incorporated, resources, resourceTypes);
  const floatsByFirstBlock = new Map<number, PlannedFloat[]>();
  for (const f of floatPlan) {
    const list = floatsByFirstBlock.get(f.firstBlockIdx);
    if (list) list.push(f);
    else floatsByFirstBlock.set(f.firstBlockIdx, [f]);
  }
  // Floats whose first reference has been passed but which are not yet placed
  // into a page band, in reading order.
  const pendingFloats: PlannedFloat[] = [];
  /** `span: 'side'` boxes that found no room in the side column of their
   *  page: they take the side column of the next page the flow opens, in
   *  order (see `placeCalloutSide`). */
  const pendingSideBoxes: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig }[] = [];
  /** `span: 'side'` boxes of a style with `sideAtColumnEnd: 'after'`
   *  (EF-161), and the side boxes fenced behind them, waiting for the text
   *  after their fence to land (see `settleAwaitingSideBoxes`). Each keeps
   *  where its fence was: its page, band, text column and the y the text
   *  would have gone on at. */
  const awaitingSideBoxes: {
    box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig };
    pageIndex: number;
    band: number;
    column: VDTColumn;
    refY: number;
  }[] = [];
  /** Whether the band the cursor is in lays out as a multi-column band:
   *  two or more text columns, or one beside a float-only side column — a
   *  page-span block then cuts the band across every column. */
  const multiColumnBand = (page: VDTPage): boolean => {
    const band = currentBand(page, cursor);
    return bandColumns(page, band).length > 1 || sideColumnOf(page, band) !== undefined;
  };
  /** Resource ids already enqueued in this pass — a keep-with-next rewind
   *  replays the loop top for the rolled-back blocks and must not enqueue
   *  (and later place) the same float twice. */
  const enqueuedFloatIds = new Set<string>();
  const enqueueFloatsFor = (blockIdx: number): void => {
    const fl = floatsByFirstBlock.get(blockIdx);
    if (!fl) return;
    const page = doc.pages[cursor.pageIndex];
    const col = page?.columns[cursor.columnIndex];
    for (const f of fl) {
      if (enqueuedFloatIds.has(f.resourceId)) continue;
      enqueuedFloatIds.add(f.resourceId);
      // Where the citing block starts: a side float stacks beside it.
      const stamped: PlannedFloat = col
        ? { ...f, refPageIndex: page!.index, refY: col.bbox.y + (col.bbox.height - col.availableHeight) + (col.blocks.length > 0 ? pendingSpacing : 0) }
        : f;
      pendingFloats.push(stamped);
    }
  };
  /** Floats first cited in a text block that is still being placed, keyed
   *  by resource id: the block and the index, among its measured lines, of
   *  the line that holds the citation. A float is queued when its citing
   *  block starts, but until that line is placed it takes no slot — not the
   *  head of a page the block's earlier lines open, nor that of the page
   *  the whole block moves on to — so it never lands above the line that
   *  cites it (EF-69). Side floats sit beside their text and are not held. */
  const citationGates = new Map<string, { blockIdx: number; line: number }>();
  /** The text block whose lines are being placed, and how many are. */
  const citedLines = { blockIdx: -1, placed: 0 };
  const awaitsCitation = (f: PlannedFloat): boolean => citationGates.has(f.resourceId);
  /** Drop the gates of blocks before `blockIdx` (a block always places all
   *  its lines before the flow moves past it; this only guards against a
   *  gate outliving its block), or every gate at a chapter barrier. */
  const releaseStaleCitationGates = (blockIdx = Infinity): void => {
    for (const [id, gate] of citationGates) if (gate.blockIdx < blockIdx) citationGates.delete(id);
  };
  /** Gate the pending floats first cited in `lines` of text block
   *  `blockIdx`, before its first line is placed. A keep-with-next rewind
   *  that places the headings before it again leaves its gates standing:
   *  they belong to a later block. */
  const gateCitedFloats = (blockIdx: number, lines: readonly VDTLine[]): void => {
    citedLines.blockIdx = blockIdx;
    citedLines.placed = 0;
    const fl = floatsByFirstBlock.get(blockIdx);
    if (!fl) return;
    for (const f of fl) {
      if (f.span === 'side' || !pendingFloats.some((p) => p.resourceId === f.resourceId)) continue;
      const line = lines.findIndex((l) => l.segments?.some((s) => s.refResourceId === f.resourceId));
      if (line >= 0) citationGates.set(f.resourceId, { blockIdx, line });
    }
  };
  /** A paragraph re-broken after some of its lines were placed (the lines
   *  placed are unchanged): the floats it still holds back wait for the
   *  line of the new setting that cites them. */
  const regateCitedFloats = (blockIdx: number, lines: readonly VDTLine[]): void => {
    for (const [id, gate] of citationGates) {
      if (gate.blockIdx !== blockIdx || gate.line === Infinity) continue;
      const line = lines.findIndex((l) => l.segments?.some((s) => s.refResourceId === id));
      if (line >= 0) citationGates.set(id, { blockIdx, line });
    }
  };
  /** Gate the pending floats first cited by the children of a box (content
   *  indices `from`…`to`) until the fragment that holds the citing child
   *  is committed: a box split across pages must not let a figure its
   *  second part cites head the page that part opens (above it). */
  const gateBoxCitations = (from: number, to: number): void => {
    for (let i = from; i <= to; i++) {
      for (const f of floatsByFirstBlock.get(i) ?? []) {
        if (f.span === 'side' || !pendingFloats.some((p) => p.resourceId === f.resourceId)) continue;
        citationGates.set(f.resourceId, { blockIdx: i, line: Infinity });
      }
    }
  };
  /** A box fragment was committed: every child before content index
   *  `placedBefore` is set whole, so the floats they cite may take slots
   *  from here on. */
  const releaseBoxCitations = (placedBefore: number): void => {
    for (const [id, gate] of citationGates) {
      if (gate.line !== Infinity || gate.blockIdx >= placedBefore) continue;
      citationGates.delete(id);
      const at = pendingFloats.findIndex((p) => p.resourceId === id);
      if (at >= 0) pendingFloats[at] = { ...pendingFloats[at]!, refPageIndex: cursor.pageIndex };
    }
  };
  /** The block a free heading at `blockIdx` keeps with: the first one after
   *  it that is not a heading, a directive or a container marker (a box's
   *  opening fence counts: the box is placed there). `undefined` without
   *  keep-with-next, or when nothing follows. */
  const keepWithNextTarget = (blockIdx: number): number | undefined => {
    if (!resolved.headings.keepWithNext) return undefined;
    for (let j = blockIdx + 1; j < contentBlocks.length; j++) {
      const b = contentBlocks[j]!;
      if (b.type === 'containerStart' && b.containerName === 'callout') return j;
      if (b.type === 'heading' || b.type === 'directive' || isMarkerBlock(b)) continue;
      return j;
    }
    return undefined;
  };
  /** `placed`, the part of the block just set in its column, holds its
   *  next lines: release the floats they cite, stamped with the page and
   *  height of the citing line. A free heading's floats wait instead for
   *  the block it keeps with: until that block is placed, a keep-with-next
   *  rollback can still carry the heading to the next column or page, and
   *  a float placed meanwhile would sit above the line that cites it. The
   *  gate moves to that block's first line (`releaseStaleCitationGates`
   *  keeps it; its first `citedLinesPlaced` releases it, or the flow moving
   *  past it does), and a rollback that replays the heading gates it on the
   *  heading again (`gateCitedFloats`). */
  const citedLinesPlaced = (blockIdx: number, placed: VDTBlock): void => {
    reserveCitedNotes(placed);
    // Side boxes waiting for the text after their fence stand beside it
    // before the floats this text cites take the side column.
    settleAwaitingSideBoxes(false);
    if (citedLines.blockIdx !== blockIdx) return;
    const from = citedLines.placed;
    citedLines.placed += placed.lines.length;
    const keeper = placed.type === 'heading' && placed.containerId === undefined
      ? keepWithNextTarget(blockIdx)
      : undefined;
    for (const [id, gate] of citationGates) {
      if (gate.blockIdx !== blockIdx || gate.line >= citedLines.placed) continue;
      if (keeper !== undefined) {
        citationGates.set(id, { blockIdx: keeper, line: 0 });
        continue;
      }
      citationGates.delete(id);
      const at = pendingFloats.findIndex((p) => p.resourceId === id);
      const line = placed.lines[Math.max(0, gate.line - from)];
      if (at >= 0 && line) pendingFloats[at] = { ...pendingFloats[at]!, refPageIndex: cursor.pageIndex, refY: line.bbox.y };
    }
  };
  /** Floated boxes (`placement: 'auto' | 'top' | 'bottom'`, `span` column / page):
   *  a `:::callout` that leaves the flow like a resource and takes the
   *  first free band after the point it occurs at — the foot of the
   *  current page, or the head / foot of a page the flow opens later —
   *  while the text after it fills the page it left. Keyed by the fence's
   *  content index; the pending float carries the synthetic id
   *  `callout:<idx>` (see `calloutFloatOf`). */
  const calloutFloats = new Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter }>();
  const CALLOUT_FLOAT_PREFIX = 'callout:';
  const calloutFloatOf = (resourceId: string) =>
    resourceId.startsWith(CALLOUT_FLOAT_PREFIX) ? calloutFloats.get(Number(resourceId.slice(CALLOUT_FLOAT_PREFIX.length))) : undefined;
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
  ): void => {
    const key = `${CALLOUT_FLOAT_PREFIX}${startIdx}`;
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
        callout: { startIdx },
        ...(col ? { refPageIndex: page!.index, refY: col.bbox.y + (col.bbox.height - col.availableHeight) } : {}),
      });
    }
    // Floats first referenced inside the box enqueue in reading order.
    for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
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

  /** How a rotated float is set: turned `direction`, its upright frame
   *  `length` px wide (its extent along the page's height). `upright`: a
   *  resource of a vertical flow, counter-rotated to stand upright on the
   *  sheet, its frame at most `length` px wide (see
   *  `ResourceLayoutInput.upright`). */
  type FloatRotation = { direction: ResourceRotation; length: number; upright?: boolean };
  const rotationKey = (rotated: FloatRotation | undefined): string =>
    rotated ? `:${rotated.direction}${rotated.length.toFixed(2)}${rotated.upright ? 'u' : ''}` : '';

  /** A caption set beside the figure (`placement.captionSide`): the band
   *  in the side column, relative to the float's left edge. */
  type CaptionAside = { dx: number; width: number; alignBottom: boolean; offsetY?: number };
  const asideKey = (a?: CaptionAside): string => (a ? `:aside${a.dx.toFixed(1)}x${a.width.toFixed(1)}${a.alignBottom ? 'b' : 't'}${(a.offsetY ?? 0).toFixed(1)}` : '');
  const layoutFloat = (
    resourceId: string,
    width: number,
    slice?: TableSliceSpec,
    rotated?: FloatRotation,
    aside?: CaptionAside,
  ): { block: ResolvedResourceBlock; totalHeight: number; tableRows?: TableRowMetrics; asideHeight?: number } | null => {
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
      ...(rotated ? (rotated.upright ? { upright: { maxLength: rotated.length } } : { rotate: rotated.direction, rotatedLength: rotated.length }) : {}),
      ...(aside ? { captionAside: aside } : {}),
    });
  };

  /** The rotation of a pending float on a band whose columns keep `avail`
   *  px: the upright frame is as long as the grid multiple within that
   *  room, less the float gap, so the band it takes is `avail` at most. */
  const rotationFor = (f: PlannedFloat, avail: number, page?: VDTPage): FloatRotation | undefined =>
    page?.flow
      ? uprightOn(page)
      : f.rotate
        ? { direction: f.rotate, length: Math.max(1, Math.floor((avail + 0.01) / baselineGrid) * baselineGrid - floatGapPx) }
        : undefined;
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
  const measureFloat = (resourceId: string, width: number, slice?: TableSliceSpec, rotated?: FloatRotation, aside?: CaptionAside): FloatMeasure | null => {
    const key = `${resourceId}:${width.toFixed(2)}${sliceKey(slice)}${rotationKey(rotated)}${asideKey(aside)}`;
    const memo = floatMeasureMemo.get(key);
    if (memo !== undefined) return memo;
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
    const laid = layoutFloat(resourceId, width, slice, rotated, aside);
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
      m = {
        height: laid.totalHeight,
        ...(lastBaseline !== undefined ? { lastCaptionBaseline: lastBaseline } : {}),
        ...(laid.asideHeight !== undefined ? { asideHeight: laid.asideHeight } : {}),
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
  ): { block: VDTBlock; height: number } | null => {
    const cf = calloutFloatOf(resourceId);
    if (cf) {
      const startIdx = Number(resourceId.slice(CALLOUT_FLOAT_PREFIX.length));
      const result = cf.L.layoutRange(CUT_START, cf.L.end, width, `block-${blockIdCounter++}`, false, mirrored);
      calloutFloatResults.set(result.frame, { result, startIdx, plan: cf.plan });
      return { block: result.frame, height: result.totalHeight };
    }
    const laid = layoutFloat(resourceId, width, slice, rotated, aside);
    if (!laid) return null;
    const { block: rb, totalHeight } = laid;
    const id = slice && slice.startRow > 0 ? `float-${resourceId}-cont-${slice.startRow}` : `float-${resourceId}`;
    const blk = createVDTBlock(id, 'resource', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
    blk.resourceBlock = rb;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.bbox = createBoundingBox(x, 0, width, totalHeight);
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
  const rotatedFlushEnd = (page: VDTPage): boolean => pageMirrored(resolved, page.index, pageIndexOffset);

  /** Float bands reserved per column in this pass (the fresh-page flush
   *  sends single-column floats to the least reserved column). */
  const floatReserved = new Map<VDTColumn, { top: number; bottom: number }>();
  const reservedOf = (col: VDTColumn): { top: number; bottom: number } =>
    floatReserved.get(col) ?? { top: 0, bottom: 0 };
  const floatHeadOf = (col: VDTColumn): number => reservedOf(col).top;
  /** `BandCap.headPx` for a cap proposed on `cols`: how far the float bands
   *  every column holds at its head put the band's top below its bare one. */
  const capHeadPx = (cols: readonly VDTColumn[]): { headPx?: number } => {
    const head = bandTop(cols) - bareBandTop(cols, floatHeadOf);
    return head > 0.5 ? { headPx: head } : {};
  };
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
    let end = planTableSlice(metrics, startRow, (rotated ? width : hMax) - overhead);
    const floor = firstBody + 1;
    if (end < floor) {
      // Nothing fits. A fresh page carries the smallest slice anyway (it
      // overflows, as a dominating figure would) rather than stall the
      // queue; a slot of the current page is simply not this table's.
      if (mode === 'strict') return 'none';
      end = floor;
    }
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
      const measure = measureFloat(f.resourceId, width, slice, rotated);
      if (!measure) return true;
      if (rotated) return (measure.rotatedWidth ?? 0) <= width + 0.01;
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
    if (mode === 'strict' && !fits(slice)) return 'none';
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
    const slotWidth = pageSpan ? page.contentArea.width : first.bbox.width;
    const slotX = pageSpan ? page.contentArea.x : first.bbox.x;
    // A narrower float (`placement.width`) sits in its slot per `align`.
    const width = f.widthFraction && f.widthFraction < 1 ? slotWidth * f.widthFraction : slotWidth;
    const alignK = f.align === 'center' ? 0.5 : f.align === 'right' ? 1 : 0;
    const xLeft = slotX + (slotWidth - width) * alignK;
    const slice = sliceOf(f);
    // A side float never turns: it stacks upright in the side column (on a
    // vertical page it is counter-rotated to stand upright there too).
    const rotated = side && !page.flow ? undefined : rotationFor(f, Math.min(...targetCols.map((c) => c.availableHeight)), page);
    // The caption beside the figure, in the band's side column.
    let aside: CaptionAside | undefined;
    let sideCol: VDTColumn | undefined;
    if (f.captionSide && !pageSpan && !side && !rotated && !captionUnder?.has(f.resourceId)) {
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
      stampCalloutSource(frame, startIdx, plan);
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
    offsetResourceBlockToAbsolute(built.block.resourceBlock!, 0, y);
    built.block.bbox = createBoundingBox(x, y, width, built.height);
    built.block.pageIndex = page.index;
    built.block.columnIndex = col.index;
    built.block.contentIndex = anchorIdx;
    (page.floats ??= []).push(built.block);
  };

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
    const first = targetCols[0]!;
    const probe = probeFloatBand(page, f, targetCols, position, pageSpan, anchorToCap, side, refY);
    if (!probe) return 'skip';
    const { width, xLeft, rotated, aside, sideCol } = probe;
    let { slice, measure, need, y } = probe;
    let rest: PlannedFloat | undefined;
    /** The float was cut to this slot (a table slice). */
    let cut = false;
    /** A rotated block wider than the band (its upright height). */
    const tooWide = (m: FloatMeasure): boolean => m.rotatedWidth !== undefined && m.rotatedWidth > width + 0.01;

    if (side) {
      // The side column's stack: the float goes under what the column holds
      // when the rest of the column takes it; otherwise it waits for the
      // side column of the next page — where it is set anyway, overflowing,
      // when even an empty column cannot hold it (a dominating figure).
      if (need > first.availableHeight + 0.01) {
        // A column that already holds something — a float, a box, or a
        // heading design standing in it — is no empty column to overflow.
        const holds = sideUsedBottom(first) > first.bbox.y + 0.5 || (sideObstacles.get(first)?.length ?? 0) > 0;
        if (mode === 'strict' || holds) return 'defer';
        // An empty column shortened by a band above it (a page-span box,
        // a top float) is no measure of the float: when a full column
        // would hold it, it waits for one instead of overflowing this one.
        if (shortSideColumn(page, first) && measure.height <= page.contentArea.height + 0.01) return 'defer';
        // Overflowing a column a side caption has shortened: the next pass
        // sets that caption under its figure and gives the column back.
        const cutBy = asideCutBy.get(first);
        if (cutBy !== undefined) captionUnderProposals.add(cutBy);
      }
      const built = buildFloatBlock(f.resourceId, xLeft, width, slice, rotated);
      if (!built) return 'skip';
      first.availableHeight = Math.max(0, first.availableHeight - need);
      commitFloatBlock(page, first, built, xLeft, y, width, f.firstBlockIdx);
      floatsPlaced++;
      return 'placed';
    }

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
        if (!gallery) return 'defer';
        galleryFill = true;
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
      for (const c of targetCols) {
        if (position === 'bottom' && uncappedBottoms.has(c) && !anchorToCap) {
          // Trailing cap: the band must lie entirely below the level cut.
          if (y - floatGapAbove(measure, floatGapPx) < c.bbox.y + c.bbox.height - 0.01) return 'defer';
          continue;
        }
        const hasBand = columnHasFloatBand(page, c);
        if (fitsStrict(need, c, hasBand, minTextPx)) continue;
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
    if (mode === 'fresh' && freshPageHold && targetCols.includes(freshPageHold.col)) {
      const after = galleryFill ? 0 : availableAfterBand(freshPageHold.col, position, { need, y, measure }, false);
      if (after < freshPageHold.px - FIT_EPS) return 'defer';
    }
    // The rest goes on after this slice in reading order, never before.
    if (rest) {
      rest = { ...rest, notBefore: { pageIndex: page.index, columnIndex: targetCols[targetCols.length - 1]!.index } };
    }

    // An upright figure of a vertical page stands at the head of its tier
    // (`placement.align`: `left` the top, `center`, `right` the foot).
    const flush = rotated?.upright ? (f.align === 'center' ? 0.5 : f.align === 'right' ? 1 : 0) : rotated ? rotatedFlushEnd(page) : false;
    const built = buildFloatBlock(f.resourceId, xLeft, width, slice, rotated, flush, aside, mirroredOf(page));
    if (!built) return 'skip';

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

    commitFloatBlock(page, first, built, xLeft, y, width, f.firstBlockIdx);
    floatsPlaced++;
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

  /** Reserve top/bottom bands on a freshly opened page and position as many
   *  pending floats as fit, shrinking the affected columns so body text flows
   *  around them. Full-width (page-span) floats reserve the outermost bands
   *  first, so a later single-column float nests inside the remaining column
   *  space rather than overlapping a full-width band; the passes repeat
   *  while they place something, so a page-span float held back behind a
   *  column float of its sequence still gets the page's foot once that one
   *  is set. A float that does not fit holds up the ones behind it in its
   *  numbering sequence (see `heldBack`), never the other sequence. */
  const flushFloatsIntoPage = (page: VDTPage): void => {
    if (pendingFloats.length === 0) { flushSideBoxesIntoPage(page); return; }
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
      if (stage === 2 && !sideBoxesFlushed) { flushSideBoxesIntoPage(page); sideBoxesFlushed = true; }
    for (let progress = true; progress;) {
      const before = floatsPlaced;
      for (const pass of passes) {
        let i = 0;
        while (i < pendingFloats.length) {
          const f = pendingFloats[i]!;
          const isPageSpan = f.span === 'page' && (textCols.length > 1 || sideCols.length > 0);
          const isSide = !isPageSpan && f.span === 'side' && sideCols.length > 0;
          const kind = isPageSpan ? 'page' : isSide ? 'side' : f.captionSide && sideCols.length > 0 ? 'aside' : 'column';
          if (kind !== pass || heldBack(i)) { i++; continue; }
          // A page-span rest never shares the page of its previous slice.
          if (isPageSpan && f.notBefore?.pageIndex === page.index) { i++; continue; }
          let r: PlaceResult = 'defer';
          if (isSide) {
            r = placeFloatInColumns(page, f, [sideCols[0]!], 'top', false, 'fresh', false, true);
          } else {
            for (const pos of positionsFor(f)) {
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
      progress = floatsPlaced > before;
    }
    }
    if (!sideBoxesFlushed) flushSideBoxesIntoPage(page);
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
    if (span === 'page' && multiColumnBand(page)) return null;
    if (span === 'side' && sideColumnOf(page, currentBand(page, cursor))) return null;
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
  const tryPlacePendingFloatsOnCurrentPage = (preferTop = false, nextBlockIdx?: number, anyPosition = false): void => {
    if (pendingFloats.length === 0) return;
    const page = doc.pages[cursor.pageIndex]!;
    const box = nextBlockIdx !== undefined ? keepTogetherBoxAt(nextBlockIdx) : null;
    for (let i = 0; i < pendingFloats.length;) {
      if (heldBack(i)) { i++; continue; }
      const f = pendingFloats[i]!;
      let r: PlaceResult = 'defer';
      // `anyPosition`: a figure or table may take a slot its position would
      // refuse (a head-of-page float offered the foot of the current page);
      // floated callouts keep their placement.
      const asked = anyPosition && !f.rotate && !f.callout && f.position !== 'auto' ? { ...f, position: 'auto' as const } : f;
      let slots = enumerateCurrentPageSlots(page, cursor.columnIndex, asked, capKindOf);
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

  /** Reserve floats on each freshly opened content page. Passed only to the
   *  content-flow column advances — parity / force-blank pages never get it. */
  const onNewPage = (page: VDTPage): void => flushFloatsIntoPage(page);
  /** The block a page is being opened for, when it cannot split: the
   *  column it goes into and the height it needs there (see
   *  `placeFloatInColumns`). Set only while that page's floats are flushed. */
  let freshPageHold: { col: VDTColumn; px: number } | null = null;
  /** `onNewPage` for a page an inline figure or table opens (EF-160): the
   *  floats pending take its bands as on any page the flow opens — up to
   *  postext 1.4 they skipped it and waited for the page after — but never
   *  the room the block needs under or over them. */
  const onAtomicNewPage = (heightPx: number) => (page: VDTPage): void => {
    const col = page.columns.find((c) => c.kind !== 'span' && c.kind !== 'side');
    freshPageHold = col ? { col, px: heightPx } : null;
    try {
      flushFloatsIntoPage(page);
    } finally {
      freshPageHold = null;
    }
  };

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
    let guard = 0;
    while ((pendingFloats.length > 0 || pendingSideBoxes.length > 0) && guard++ < 1000) {
      const before = floatsPlaced;
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
      } while (cursor.pageIndex === startPageIndex);
      if (floatsPlaced === before) break; // safety: no progress
    }
  };

  /** Boxes that left the flow this pass (side column, float band, fixed),
   *  by the content index of their opening marker (see `leftFlow`). */
  const calloutsOutOfFlow = new Set<number>();
  // Everything per-block measurement needs that is constant for this pass.
  const measureCtx: BlockMeasureContext = {
    resolved,
    headingLevels,
    bodyStyle,
    blockquoteStyle,
    headingPrefixes,
    headingNumbers,
    listLevelIndentsPx,
    orderedLevelIndentsPx,
    orderedMetrics,
    resourceById,
    resourceTypeById,
    resourceNumberById,
    contentBlocks,
    cache,
    bodyOffset,
    source: markdownBody,
    resources,
    resourceTypes,
    resourceNumbering,
    floatedIds,
    leftFlow: calloutsOutOfFlow,
    ...(footnoteNumbering.numbers.size > 0 ? { footnoteNumbers: footnoteNumbering.numbers } : {}),
  };

  // --- Footnotes at the column foot (`footnotes.placement: 'column'`) ------
  // A text block placed in a column reserves, at the column's foot, the
  // notes its lines cite for the first time: the column's box shrinks by
  // their height (as a bottom float band shrinks it), so the text above
  // keeps its positions and the grid. The flow counts that height before it
  // places lines (`notesPrefixCost`), so the line citing a note and the note
  // share a column. The notes are set in their reserved room once the pass
  // is placed (`setColumnNotes`).
  const columnNotes = resolved.footnotes.placement === 'column' && footnoteNumbering.numbers.size > 0;
  const noteStyle = columnNotes ? resolveParagraphStyle(footnoteParagraphStyle(resolved), resolved) : bodyStyle;
  const noteSpaceAbovePx = dimensionToPx(resolved.footnotes.spaceAbove, dpi, bodyStyle.fontSizePx);
  const noteSpaceBelowRulePx = dimensionToPx(resolved.footnotes.spaceBelowRule, dpi, bodyStyle.fontSizePx);
  const noteRulePx = resolved.footnotes.separator.enabled ? dimensionToPx(resolved.footnotes.separator.lineWidth, dpi) : 0;
  /** The separator zone above a column's first note. */
  const noteHeadPx = noteSpaceAbovePx + noteRulePx + noteSpaceBelowRulePx;
  /** Space between two notes. */
  const noteGapPx = Math.max(0, noteStyle.marginBottomPx);
  /** Notes set (reserved) in this pass: a note is set once, where it is
   *  first cited. */
  const placedNotes = new Set<string>();
  const noteMeasures = new Map<string, MeasuredContentBlock | null>();
  const measureNote = (id: string, width: number): MeasuredContentBlock | null => {
    const key = `${id}@${width.toFixed(2)}`;
    let m = noteMeasures.get(key);
    if (m === undefined) {
      const number = footnoteNumbering.numbers.get(id) ?? '?';
      m = measureContentBlock(noteContentBlock(footnoteDefs.get(id), id, number), 0, width, measureCtx, { styleOverride: noteStyle });
      noteMeasures.set(key, m);
    }
    return m;
  };
  const noteHeight = (id: string, width: number): number =>
    Math.max(1, measureNote(id, width)?.measured.lines.length ?? 1) * noteStyle.lineHeightPx;
  /** The notes of a column: ids in order, and the room reserved for them,
   *  one slot per reservation (page coordinates). */
  const columnNotesOf = new Map<VDTColumn, { ids: string[]; slots: { top: number; height: number; ids: string[] }[] }>();
  const columnOfNotes = new Map<VDTColumn, VDTPage>();
  /** Height `ids` (not yet set) add to `col`'s foot: the separator zone
   *  when the column has no note yet, the notes and the gaps between. */
  const notesCost = (col: VDTColumn, ids: readonly string[]): number => {
    if (ids.length === 0) return 0;
    const first = !columnNotesOf.has(col);
    let h = first ? noteHeadPx : 0;
    ids.forEach((id, i) => {
      if (!first || i > 0) h += noteGapPx;
      h += noteHeight(id, col.bbox.width);
    });
    return h;
  };
  /** Notes cited by blocks set outside the flow (the paragraphs of a box,
   *  inline, floated or fixed): they wait for the next text the flow
   *  places, and go to the foot of its column, in citation order. */
  const pendingNotes: string[] = [];
  /** How far `doc.blocks` was read for such citations. */
  let notesScanned = 0;
  const collectPendingNotes = (): void => {
    for (; notesScanned < doc.blocks.length; notesScanned++) {
      for (const id of footnoteIdsOfLines(doc.blocks[notesScanned]!.lines)) {
        if (!placedNotes.has(id) && !pendingNotes.includes(id)) pendingNotes.push(id);
      }
    }
  };
  /** `cost[k]`: the notes the first `k` of `lines` cite for the first time
   *  (after the pending ones) would add to `col`'s foot. Undefined when
   *  there are none. */
  const notesPrefixCost = (col: VDTColumn, lines: readonly VDTLine[]): number[] | undefined => {
    if (!columnNotes) return undefined;
    collectPendingNotes();
    const ids: string[] = [...pendingNotes];
    let any = ids.length > 0;
    const cost = [notesCost(col, ids)];
    for (const line of lines) {
      for (const seg of line.segments ?? []) {
        const id = seg.footnoteId;
        if (id !== undefined && !placedNotes.has(id) && !ids.includes(id)) { ids.push(id); any = true; }
      }
      cost.push(notesCost(col, ids));
    }
    return any ? cost : undefined;
  };
  /** Reserve at the placed block's column foot the pending notes and the
   *  ones the block cites first. */
  const reserveCitedNotes = (placed: VDTBlock): void => {
    if (!columnNotes || placed.pageIndex < 0) return;
    collectPendingNotes();
    const cited = footnoteIdsOfLines(placed.lines).filter((id) => !placedNotes.has(id) && !pendingNotes.includes(id));
    if (cited.length === 0 && pendingNotes.length === 0) return;
    const page = doc.pages[placed.pageIndex];
    const col = page?.columns[placed.columnIndex];
    if (!page || !col) return;
    reserveNotes(page, col, [...pendingNotes.splice(0), ...cited], placed.contentIndex ?? 0);
  };
  /** Reserve `ids` at `col`'s foot. */
  const reserveNotes = (page: VDTPage, col: VDTColumn, ids: string[], anchor: number): void => {
    const h = notesCost(col, ids);
    let bottom: number;
    const capped = uncappedBottoms.get(col);
    if (capped !== undefined) {
      // A column a band cap cut: the notes go under the cut, at the true
      // foot, as a bottom float does; the cut moves up only when they reach
      // above it.
      bottom = capped;
      uncappedBottoms.set(col, capped - h);
      const overlap = col.bbox.y + col.bbox.height - (capped - h);
      if (overlap > 0) {
        col.bbox.height = Math.max(0, col.bbox.height - overlap);
        col.availableHeight = Math.max(0, col.availableHeight - overlap);
      }
    } else {
      bottom = col.bbox.y + col.bbox.height;
      col.bbox.height = Math.max(0, col.bbox.height - h);
      col.availableHeight = Math.max(0, col.availableHeight - h);
    }
    let entry = columnNotesOf.get(col);
    if (!entry) {
      entry = { ids: [], slots: [] };
      columnNotesOf.set(col, entry);
      columnOfNotes.set(col, page);
    }
    entry.ids.push(...ids);
    entry.slots.push({ top: bottom - h, height: h, ids });
    for (const id of ids) placedNotes.add(id);
    for (const id of ids) noteAnchor.set(id, anchor);
  };
  /** Notes still pending when the flow ends (a box closes the document):
   *  the foot of the column the flow ended in takes them. */
  const reserveLeftoverNotes = (): void => {
    if (!columnNotes) return;
    collectPendingNotes();
    if (pendingNotes.length === 0) return;
    const page = doc.pages[cursor.pageIndex];
    const col = page?.columns[cursor.columnIndex];
    if (page && col) reserveNotes(page, col, pendingNotes.splice(0), contentBlocks.length - 1);
  };
  /** `chapterEnd`: move the run of note paragraphs that closes a column
   *  down to the column's true foot (under a band cap's cut, above any
   *  bottom float band). */
  const dropChapterEndNotes = (): void => {
    for (const page of doc.pages) {
      for (const col of page.columns) {
        const blocks = col.blocks;
        let first = blocks.length;
        while (first > 0 && blocks[first - 1]!.footnoteNote !== undefined) first--;
        if (first === blocks.length) continue;
        const run = blocks.slice(first);
        const last = run[run.length - 1]!;
        const lastLine = last.lines[last.lines.length - 1];
        const foot = lastLine ? lastLine.bbox.y + lastLine.bbox.height : last.bbox.y + last.bbox.height;
        const d = trueBottom(col, uncappedBottoms) - foot;
        if (d < 0.5) continue;
        for (const b of run) {
          b.bbox = createBoundingBox(b.bbox.x, b.bbox.y + d, b.bbox.width, b.bbox.height);
          for (const line of b.lines) {
            line.bbox = createBoundingBox(line.bbox.x, line.bbox.y + d, line.bbox.width, line.bbox.height);
            line.baseline += d;
          }
        }
      }
    }
  };
  /** `chapterEnd`: the separator rule over the notes of each column, set
   *  in the space above them (`spaceBelowRule` over the first note). */
  const ruleChapterEndNotes = (): void => {
    const sep = resolved.footnotes.separator;
    if (!sep.enabled || sep.width <= 0 || noteRulePx <= 0) return;
    const color = sep.color?.hex ?? resolved.footnotes.color?.hex ?? bodyStyle.color;
    for (const page of doc.pages) {
      for (const col of page.columns) {
        const at = col.blocks.findIndex((b, i) => b.footnoteNote !== undefined && col.blocks[i - 1]?.footnoteNote === undefined);
        if (at < 0) continue;
        const notes = col.blocks.slice(at).filter((b) => b.footnoteNote !== undefined);
        const firstLine = notes[0]!.lines[0];
        if (!firstLine) continue;
        const top = firstLine.bbox.y - noteSpaceBelowRulePx - noteRulePx;
        const last = notes[notes.length - 1]!;
        (page.footnoteAreas ??= []).push({
          columnIndex: col.index,
          bbox: createBoundingBox(col.bbox.x, top, col.bbox.width, last.bbox.y + last.bbox.height - top),
          noteIds: notes.map((b) => b.footnoteNote!),
          rule: { x: col.bbox.x, y: top + noteRulePx / 2, width: col.bbox.width * sep.width, lineWidthPx: noteRulePx, color },
        });
      }
    }
  };
  /** Content index of the block citing each note (reading order). */
  const noteAnchor = new Map<string, number>();
  /** Set the notes in the room reserved for them: the reservations of a
   *  column that touch (the usual case) make one stack in citation order
   *  under the separator; a float band set between two leaves each its own
   *  room. */
  const setColumnNotes = (): void => {
    for (const [col, entry] of columnNotesOf) {
      const page = columnOfNotes.get(col)!;
      const regions: { top: number; bottom: number; ids: string[] }[] = [];
      for (const slot of entry.slots) {
        const last = regions[regions.length - 1];
        if (last && Math.abs(slot.top + slot.height - last.top) < 0.5) {
          last.top = slot.top;
          last.ids.push(...slot.ids);
        } else {
          regions.push({ top: slot.top, bottom: slot.top + slot.height, ids: [...slot.ids] });
        }
      }
      const x = col.bbox.x;
      const width = col.bbox.width;
      regions.forEach((region, r) => {
        let y = region.top;
        if (r === 0) {
          const sep = resolved.footnotes.separator;
          const rule = sep.enabled && sep.width > 0 && noteRulePx > 0
            ? {
                x,
                y: y + noteSpaceAbovePx + noteRulePx / 2,
                width: width * sep.width,
                lineWidthPx: noteRulePx,
                color: sep.color?.hex ?? noteStyle.color,
              }
            : undefined;
          (page.footnoteAreas ??= []).push({
            columnIndex: col.index,
            bbox: createBoundingBox(x, region.top, width, region.bottom - region.top),
            noteIds: entry.ids,
            ...(rule ? { rule } : {}),
          });
          y += noteHeadPx;
        }
        region.ids.forEach((id, i) => {
          if (r > 0 || i > 0) y += noteGapPx;
          const m = measureNote(id, width);
          if (!m) return;
          const blk = createVDTBlock(`fn-${id}`, 'paragraph', noteStyle.fontString, noteStyle.color, noteStyle.textAlign);
          applyStyleAttrs(blk, noteStyle);
          blk.lines = resetLinePositions(raggedLooseLines(m.measured.lines, noteStyle.textAlign), noteStyle.lineHeightPx).map((line) => ({
            ...line,
            bbox: createBoundingBox(line.bbox.x + x, line.bbox.y + y, line.bbox.width, line.bbox.height),
            baseline: line.baseline + y,
          }));
          const h = blk.lines.length * noteStyle.lineHeightPx;
          blk.bbox = createBoundingBox(x, y, width, h);
          blk.pageIndex = page.index;
          blk.columnIndex = col.index;
          blk.contentIndex = noteAnchor.get(id) ?? 0;
          blk.footnoteNote = id;
          blk.dirty = false;
          blk.snappedToGrid = false;
          if (blk.lines.length > 0) {
            blk.sourceStart = blk.lines[0]!.sourceStart;
            blk.sourceEnd = blk.lines[blk.lines.length - 1]!.sourceEnd;
          }
          blk.sourceMap = m.absoluteSourceMap;
          blk.plainPrefixLen = m.prefixLen;
          (page.floats ??= []).push(blk);
          doc.blocks.push(blk);
          y += h;
        });
      });
    }
  };
  // Blocks inside a `:::part` measure with the part body typography.
  const partMeasureCtx: BlockMeasureContext = partPlan.byStart.size > 0
    ? derivePartMeasureContext(measureCtx)
    : measureCtx;

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

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
  let currentSection: ResolvedHeadingStyleConfig | undefined;
  const enterSection = (style: ResolvedHeadingStyleConfig | undefined): void => {
    currentSection = style;
    geomResolved = style ? deriveSectionGeometryConfig(resolved, style) : resolved;
    contentArea = geomResolved === resolved ? pageMetrics.contentArea : computePageMetrics(geomResolved).contentArea;
    setMeasureWritingMode(geomResolved.layout.writingMode);
    // A page still empty takes the geometry right away — the document (or
    // a chapter laid out on its own) opening with a styled heading.
    const page = doc.pages[cursor.pageIndex];
    if (
      page && !page.partInfo && cursor.columnIndex === 0
      && !pageHasContent(page) && !(page.floats && page.floats.length > 0)
    ) {
      const fresh = createPageWithColumns(page.index, geomResolved, contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
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
        blk.sourceTitle = flattenTitleBreaks(withBookTitleBrackets(raw.text, raw.spans, resolved.cjk).text);
      }
    }
    if (raw.footnoteNote !== undefined) blk.footnoteNote = raw.footnoteNote;
    if (raw.toc?.kind === 'entry') {
      blk.tocEntry = raw.toc.pageIndex !== undefined ? { pageIndex: raw.toc.pageIndex } : {};
    }
    if (raw.toc?.kind === 'part') {
      blk.tocPart = {
        number: raw.toc.number,
        title: raw.toc.title ?? '',
        pageLabel: raw.toc.pageLabel ?? '',
        ...(raw.toc.palette ? { palette: raw.toc.palette } : {}),
        ...(raw.toc.pageIndex !== undefined ? { pageIndex: raw.toc.pageIndex } : {}),
      };
    }
  };

  let blockIdCounter = 0;
  let pendingSpacing = 0;
  /** The float gap an inline resource still owes the block right after it
   *  (EF-93), or the space a `:::paragraphs` container still owes the block
   *  after its closing marker (EF-159; `container`, carried through the
   *  closing markers that follow, an enclosing container's included),
   *  measured from the grid line its foot snapped to: `pending` is what it
   *  left in `pendingSpacing`, in whole grid lines so text lands back on the
   *  grid; `exact` is the gap itself, which a block that sets itself off
   *  the grid and snaps the flow after it (a heading, a display formula, a
   *  box) collapses its own space above with instead. */
  let inlineGapOwed: { afterIdx: number; pending: number; exact: number; container?: boolean } | null = null;
  /** The pending spacing a heading, a display formula or a box at `idx`
   *  collapses its top margin with (see `inlineGapOwed`). */
  const pendingBeforeSelfSnapping = (idx: number): number =>
    inlineGapOwed && inlineGapOwed.afterIdx === idx - 1 && pendingSpacing === inlineGapOwed.pending
      ? inlineGapOwed.exact
      : pendingSpacing;

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
  let bandStart: { contentIndex: number; part: number; visit: number } | null = null;
  /** Bands registered so far in this pass per opening block and part
   *  (`contentIndex:part`): the `visit` of the next one (see `enterBand`). */
  const bandVisits = new Map<string, number>();
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
  /** Whether a heading is painted by the default opener: a `span: 'page'`
   *  level (or style) without design elements of its own, that prints
   *  (EF-100). */
  const opensDefaultOpener = (raw: ContentBlock): boolean => {
    const lvl = headingLevels.forBlock(raw);
    return lvl?.span === 'page'
      && !(lvl.advancedDesign.enabled && lvl.advancedDesign.slot.elements.length > 0)
      && !headingIsHidden(raw, lvl);
  };
  /** Page-spanning heading placed in `headingCol`, reserving `h` px from the
   *  top of the page: the same vertical band is reserved in every other
   *  column of the page, so body text under the opener band starts below it
   *  in ALL columns, not just the one it was placed in. A column still
   *  untouched moves its head below the band (as a top float does), so a
   *  float offered that column's head lands under the opener instead of
   *  over it. A text column's head goes to the first grid line at or under
   *  the band's foot, so what it snaps lands on the page's grid, as in the
   *  opener's own column (EF-139); its first block is then placed as
   *  `openerHeadSpacing` says. An `h` at least as tall as the columns
   *  spends them whole. `pending` is the space the opener leaves under it:
   *  its `marginBottom` when it did not snap, 0 when the snap took it in;
   *  `gridText` whether the text under it lands on the page's grid (its
   *  level snaps, or would but for the heading after it). */
  const reserveOpenerBand = (headingCol: VDTColumn, h: number, opener?: VDTBlock, pending = 0, gridText = true): void => {
    const page = doc.pages[cursor.pageIndex]!;
    for (const otherCol of page.columns) {
      if (otherCol === headingCol) continue;
      if (otherCol.blocks.length === 0 && otherCol.availableHeight >= otherCol.bbox.height - 0.01) {
        const foot = otherCol.bbox.y + h;
        const text = otherCol.kind !== 'side' && otherCol.kind !== 'span';
        const reach = (text ? gridUpOnPage(page, foot) : foot) - otherCol.bbox.y;
        const shift = Math.min(reach, otherCol.bbox.height);
        otherCol.bbox.y += shift;
        otherCol.bbox.height -= shift;
        otherCol.availableHeight = Math.max(0, otherCol.availableHeight - reach);
        if (opener && text) {
          const textTop = gridText ? gridUpOnPage(page, foot + pending) : foot + pending;
          openerBandHeads.set(otherCol, { openerCol: headingCol, opener, foot, textTop, floatTop: reservedOf(otherCol).top });
        }
        continue;
      }
      otherCol.availableHeight = Math.max(0, otherCol.availableHeight - h);
    }
  };
  /** The page grid line at or below `y` (absolute px). */
  const gridUpOnPage = (page: VDTPage, y: number): number =>
    page.contentArea.y + Math.ceil((y - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
  /** Columns headed by a page-span opener's band (see `reserveOpenerBand`):
   *  the opener, its column, the band's foot, where text right under the
   *  opener starts and the float band the column held at its head then. */
  const openerBandHeads = new Map<VDTColumn, { openerCol: VDTColumn; opener: VDTBlock; foot: number; textTop: number; floatTop: number }>();
  /**
   * The room above the first block of a column headed by an opener band,
   * relative to the column's head, or undefined for any other column (or
   * one the flow reached after a float took its head). Every column under
   * the band starts as the opener's own column does (EF-139):
   * - text starts where text right under the opener starts: the band's
   *   foot plus the space the opener leaves, taken to the next grid line
   *   when the opener's level snaps (its text lands on the page's grid, as
   *   it does when the opener did not snap only because a heading follows);
   * - a heading (or another block that keeps its top margin, `level`) is
   *   set level with the first visible block under the opener when that
   *   is a heading or a display formula, margins included as there (a
   *   balancing lever above it excepted), else level with the text there.
   *   A hidden heading (`hidden: true`) under the opener does not count:
   *   it prints nothing to line up with. Its own snap then puts the text
   *   after it on the page's grid.
   * The block may sit up to a line above the column's head, which is on
   * the grid; the renderers' column clip takes it in (`columnClipRect`).
   * Up to postext 1.4 the first block of such a column started at the
   * band's foot, off the grid when the band ended between two lines, and a
   * heading there dropped the top margin the first column's kept.
   */
  const openerHeadSpacing = (col: VDTColumn, level: boolean): number | undefined => {
    const head = openerBandHeads.get(col);
    if (!head || col.blocks.length > 0 || reservedOf(col).top !== head.floatTop) return undefined;
    let target = head.textTop;
    if (level) {
      const at = head.openerCol.blocks.indexOf(head.opener);
      const next = at >= 0 ? head.openerCol.blocks.slice(at + 1).find((b) => !b.hidden) : undefined;
      if (next && (next.type === 'heading' || next.type === 'mathDisplay')) {
        target = Math.max(head.foot, next.bbox.y - (next.balancing?.spaceAbove ?? 0));
      }
    }
    return target - col.bbox.y;
  };
  /** The side column each in-column heading marked obstacles in (see
   *  `markSideObstacles`), to drop them when the heading is rolled back. */
  const sideObstacleColumn = new WeakMap<VDTBlock, VDTColumn>();
  /**
   * Keep the float-only side column's stack off the heading design placed
   * as `blk` (EF-78). A design element may be anchored outside the heading's
   * column — a chapter numeral set in the outer margin column of a textbook
   * opener, a section number hung in the margin — where the side stack
   * (`span: 'side'` figures, tables and boxes) would paint over it. Each
   * such element is recorded as an obstacle of the side column: what the
   * stack sets later goes above it when it fits there, else one float gap
   * under it (`clearSideObstacles`). A numeral at the head of the channel
   * thus holds the whole stack under it, while a number hung beside a
   * heading further down the page leaves the head of the channel to the
   * figures the page cites. What the stack already holds is not moved.
   * A page-spanning opener needs none of this: its band is reserved in
   * every column, the side column included (`reserveOpenerBand`).
   */
  const markSideObstacles = (blk: VDTBlock, design: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo }): void => {
    if (design.lvl.span === 'page') return;
    const page = doc.pages[cursor.pageIndex]!;
    const side = sideColumnOf(page, currentBand(page, cursor));
    if (!side || side.bbox.height <= 0.5) return;
    const boxes = headingDesignBoxes(
      design.lvl, design.info, blk.bbox, resolved.page.dpi, doc.metadata, cursor.pageIndex, designFramesOn(page), resourceById,
    );
    const top = side.bbox.y;
    const foot = side.bbox.y + side.bbox.height;
    const left = side.bbox.x;
    const right = side.bbox.x + side.bbox.width;
    const marks: Array<SideObstacle & { owner: VDTBlock }> = [];
    for (const b of boxes) {
      if (b.width <= 0 || b.height <= 0) continue;
      if (b.x + b.width <= left + 0.5 || b.x >= right - 0.5) continue;
      if (b.y + b.height <= top + 0.5 || b.y >= foot - 0.5) continue;
      marks.push({ owner: blk, top: b.y, bottom: b.y + b.height });
    }
    if (marks.length === 0) return;
    const list = sideObstacles.get(side);
    if (list) list.push(...marks);
    else sideObstacles.set(side, marks);
    sideObstacleColumn.set(blk, side);
  };
  /** `rollbackTrailingBlocks` that also drops a rolled-back heading's
   *  side-column obstacles: the heading is set again further on. */
  const rollbackHeadings = (col: VDTColumn): VDTBlock[] => {
    const popped = rollbackTrailingBlocks(col, doc.blocks, isFreeHeading);
    for (const p of popped) {
      const side = sideObstacleColumn.get(p);
      if (!side) continue;
      sideObstacleColumn.delete(p);
      const list = sideObstacles.get(side);
      if (list) sideObstacles.set(side, list.filter((o) => o.owner !== p));
    }
    return popped;
  };
  const bandCapProposals = new Map<number, BandCap>();
  const spanPlacedInBand = new Set<number>();
  const bandCapsApplied = new Set<number>();

  /** Columns of the band each cap was last applied to. */
  const cappedBandColumns = new Map<number, readonly VDTColumn[]>();
  const enterBand = (contentIndex: number, part: number): void => {
    const page = doc.pages[cursor.pageIndex]!;
    const band = currentBand(page, cursor);
    if (registeredBand && registeredBand.pageIndex === page.index && registeredBand.band === band) return;
    registeredBand = { pageIndex: page.index, band };
    // The same block (or part) can be offered to several bands before one
    // takes it: a page a float fills leaves it no room, and it moves on to
    // the next page. Each of those bands is told apart by how many came
    // before it with the same opening block, so a cap lands on the band it
    // was measured in and not on the first one the block passed through,
    // which took nothing (EF-167, EF-189).
    const key = `${contentIndex}:${part}`;
    const visit = bandVisits.get(key) ?? 0;
    bandVisits.set(key, visit + 1);
    bandStart = { contentIndex, part, visit };
    activeCap = null;
    if (!bandCaps) return;
    for (const [spanIndex, cap] of bandCaps) {
      if (cap.startContentIndex !== contentIndex || cap.startPart !== part || (cap.startVisit ?? 0) !== visit) continue;
      // A cap whose last band took nothing (its opening block is taller
      // than the cut — a heading's leading over a one-line cap) would cut
      // the next band just as short, and the flow would open empty pages
      // forever. Leave the band whole: the cap stays undelivered and the
      // driver grows or drops it.
      const prev = cappedBandColumns.get(spanIndex);
      if (prev && prev.every((c) => c.blocks.length === 0)) continue;
      const cols = bandColumns(page, band);
      // The cut is measured from under the float bands the proposing pass
      // had at the band's head, which may not have landed yet.
      const top = Math.max(bandTop(cols), bareBandTop(cols, floatHeadOf) + (cap.headPx ?? 0));
      applyBandCap(cols, cap.lines * baselineGrid, uncappedBottoms, cap.zone, cap.kind === 'trailing', top);
      cappedBandColumns.set(spanIndex, cols);
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
    // before a span box then anchors to the cut, see `anchorToCap`). A band
    // every column reserves alike — a page-span table at the page foot —
    // stays where it is under the level cut and counts for nothing: adding
    // it would push the cut down by the table's height, the capped pass
    // could no longer seat the table below the cut, and the text would
    // fill a cap far taller than its level (EMP ch. 24 p. 279).
    const feet = cols.map((c) => reservedOf(c).bottom);
    const shared = Math.min(...feet);
    const footBands = feet.reduce((sum, b) => sum + (b - shared), 0);
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
      ...(bandStart.visit > 0 ? { startVisit: bandStart.visit } : {}),
      lines: aroundZone ?? Math.max(bandCapLines(cols, baselineGrid, footBands), ...floatHeads),
      retries: 0,
      ...(aroundZone !== null ? { zone } : {}),
      ...capHeadPx(cols),
    });
  };

  /** Close the flow at a chapter-level boundary (block `boundaryIndex`):
   *  floats take the page's free slots, the closing band is levelled, the
   *  page is marked as an explicit break, and every float still pending is
   *  drained onto pages opened BEFORE the boundary. The caller then opens
   *  the boundary's own page.
   *
   *  The floats the boundary block itself cites first — a `breakBefore`
   *  heading that names a figure, the first paragraph after a part — were
   *  queued at the top of its iteration, but their citation is set on the
   *  page the boundary opens: they sit the drain out and stay pending (with
   *  no reference stamp, which the citing line sets), so they land after
   *  the line that cites them, in the new segment (EF-69). */
  const closeFlowSegment = (boundaryIndex: number): void => {
    settleAwaitingSideBoxes(true);
    releaseStaleCitationGates();
    const ownFloats: PlannedFloat[] = [];
    for (let i = pendingFloats.length - 1; i >= 0; i--) {
      const f = pendingFloats[i]!;
      if (f.firstBlockIdx !== boundaryIndex || f.callout) continue;
      const unstamped: PlannedFloat = { ...f };
      delete unstamped.refPageIndex;
      delete unstamped.refY;
      ownFloats.unshift(unstamped);
      pendingFloats.splice(i, 1);
    }
    tryPlacePendingFloatsOnCurrentPage();
    proposeTrailingCap(boundaryIndex);
    markForcedBreak();
    hugClosingText();
    drainPendingFloats();
    pendingFloats.push(...ownFloats);
  };

  /** On the closing page of a chapter nothing follows the page-span floats
   *  set at the foot of its last band: they move up to sit right under the
   *  band's text (one float gap below its grid-rounded bottom, stacked in
   *  their order) instead of leaving a gap between the text and a table at
   *  the page foot. `layout.hugClosingFloats: false` leaves them where their
   *  placement put them (EF-94). */
  const hugClosingText = (): void => {
    if (!resolved.layout.hugClosingFloats) return;
    const page = doc.pages[cursor.pageIndex]!;
    const floats = page.floats ?? [];
    // A side column holds its own band under a page-span float: leave it.
    if (floats.length === 0 || page.partInfo || sideColumns(page).length > 0) return;
    const cols = bandColumns(page, currentBand(page, cursor)).filter((c) => c.kind !== 'span' && c.kind !== 'side' && c.bbox.height > 0.5);
    if (cols.length === 0 || !cols.some((c) => c.blocks.length > 0)) return;
    const textBottom = Math.max(...cols.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight)));
    const spanWidth = page.contentArea.width - 0.5;
    const below = floats.filter((b) => b.bbox.y >= textBottom - 0.5).sort((a, b) => a.bbox.y - b.bbox.y);
    let nextY = page.contentArea.y + Math.ceil((textBottom - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid + floatGapPx;
    for (const b of below) {
      const rb = b.resourceBlock;
      // Only resource floats across the page move; anything else below the
      // text (a fixed or floated box) keeps its place and ends the run.
      if (!rb || rb.rotation || b.bbox.width < spanWidth) break;
      const dy = nextY - b.bbox.y;
      if (dy < -0.5) {
        b.bbox.y += dy;
        offsetResourceBlockToAbsolute(rb, 0, dy);
      }
      nextY = b.bbox.y + b.bbox.height + floatGapPx;
    }
  };

  /** Parity of the page break a closed `:::part` still owes (applied before
   *  the next placed block) — from the start when the part closed the
   *  preceding content (`continuation.afterPartPage`). */
  let pendingPartBreak: HeadingBreakParity | null = afterPartPage && resolved.parts.breakAfter.enabled
    ? resolved.parts.breakAfter.parity
    : null;
  /** Content index of the closing fence of a part set without a page
   *  (`parts.page: false`): blocks up to it are skipped. */
  let skipPartUntil: number | null = null;

  /** `advanceToNextPageBoundary`, except that an empty part page is left
   *  behind too (its opener design is content). No floats are reserved on
   *  the page opened this way — parity padding may still follow it. */
  const leaveCurrentPage = (): void => {
    const curPage = doc.pages[cursor.pageIndex]!;
    if (curPage.partInfo && !pageHasContent(curPage)) {
      const startPageIndex = cursor.pageIndex;
      do {
        advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx);
      } while (cursor.pageIndex === startPageIndex);
      return;
    }
    advanceToNextPageBoundary(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx);
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
  /** The earliest page a pending change may number: the page the directive
   *  was met on while still empty, else the page after it. */
  let pendingNumberingPage = 0;
  /** A page holding something the reader sees: column content, a float, a
   *  part opener. A parity blank is not one. */
  const pageTakesNumbering = (page: VDTPage): boolean =>
    pageHasContent(page) || (page.floats?.length ?? 0) > 0 || page.partInfo !== undefined;

  /** Commits a pending `:::numbering` change to the first page from the
   *  directive on that receives content: the page the directive opens (the
   *  head of a chapter, right after a page break) or, when that page was
   *  already written on, the next one — never a blank page padding parity
   *  in between. Called after every block iteration and page advance. */
  const flushPendingNumberingAtBoundary = (): void => {
    if (!pendingNumberingChange) return;
    if (cursor.pageIndex < pendingNumberingPage) return;
    const page = doc.pages[cursor.pageIndex]!;
    if (!pageTakesNumbering(page)) return;
    // A change already recorded for this page is replaced.
    const last = pageNumberSegments[pageNumberSegments.length - 1]!;
    if (last.startPageIndex === cursor.pageIndex && pageNumberSegments.length > 1) pageNumberSegments.pop();
    pageNumberSegments.push({
      startPageIndex: cursor.pageIndex,
      ...pendingNumberingChange,
    });
    pendingNumberingChange = null;
  };

  /** Heading blocks that are not part of a callout — the only ones the
   *  keep-with-next rollbacks may pull along (a callout is one unbreakable
   *  unit; its children never leave it). */
  const isFreeHeading = (b: VDTBlock): boolean => b.type === 'heading' && b.containerId === undefined;
  /** Free headings closing `col` (its trailing run), 0 unless keep-with-next
   *  is on: the headings a block moving on would strand. */
  const trailingHeadingRun = (col: VDTColumn): number => {
    if (!resolved.headings.keepWithNext) return 0;
    let n = 0;
    for (let j = col.blocks.length - 1; j >= 0 && isFreeHeading(col.blocks[j]!); j--) n++;
    return n;
  };

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
    /** For a cut inside a child (`line > 0`): the box widths that child's
     *  lines up to `line` were counted at, from line `fromLine` on (see
     *  `CalloutLayoutInput.lineWidths`). A box that goes on in a column of
     *  another width breaks the child again from them. */
    widths?: readonly CalloutLineWidth[];
  }
  /** The widths a child's lines are counted at in a fragment `width` wide
   *  that opens `from` (see `CalloutCut.widths`). */
  const cutWidths = (from: CalloutCut, width: number): readonly CalloutLineWidth[] => {
    const before = from.line > 0 ? from.widths : undefined;
    if (!before || before.length === 0) return [{ fromLine: 0, width }];
    const last = before[before.length - 1]!;
    return Math.abs(last.width - width) <= 0.5 ? before : [...before, { fromLine: from.line, width }];
  };
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
    /** `:::columns` groups among the children ([start, end] marker
     *  positions): no cut falls inside one. */
    groups: readonly [number, number][];
    /** Lay out the children from cut `from` to cut `to` at `width` as one
     *  box — a `continuation` (every fragment after the head) without
     *  title / icon. A cut inside a child keeps only the lines on its side. */
    layoutRange: (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean, mirrored?: boolean) => CalloutLayoutResult;
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
    // `:::columns` groups among the children, as [start marker, end marker]
    // positions: a split never cuts inside one.
    const groups: [number, number][] = [];
    children.forEach((c, k) => {
      if (c.type === 'containerStart' && c.containerName === 'columns') {
        let e = k + 1;
        while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerName === 'columns' && children[e]!.containerId === c.containerId)) e++;
        groups.push([k, e]);
      }
    });
    const layoutRange = (from: CalloutCut, to: CalloutCut, width: number, frameId: string, continuation: boolean, mirrored = false) => {
      let n = 0;
      // A cut inside child `to.child` includes that child (its first
      // `to.line` lines); a cut at a child's head excludes it.
      const toChild = to.line > 0 ? to.child + 1 : to.child;
      // Nested boxes still open at `from` (their closing markers leading
      // the range close them): the fragment opens inside them.
      const open: { idx: number; block: ContentBlock }[] = [];
      for (let k = 0; k < from.child; k++) {
        const c = children[k]!;
        if (c.containerName !== 'callout') continue;
        if (c.type === 'containerStart') open.push({ idx: startIdx + 1 + k, block: c });
        else if (c.type === 'containerEnd') open.pop();
      }
      for (let k = from.child; k < children.length && open.length > 0; k++) {
        const c = children[k]!;
        if (c.type !== 'containerEnd' || c.containerId !== open[open.length - 1]!.block.containerId) break;
        open.pop();
      }
      return layoutCallout({
        style,
        attrs: plan.attrs,
        continuation,
        // Any range short of the box's end is a fragment that goes on.
        ...(to.child < children.length || to.line > 0 ? { continues: true } : {}),
        children: children.slice(from.child, toChild),
        childStartIdx: startIdx + 1 + from.child,
        width,
        ctx: measureCtx,
        resolved,
        containerId: plan.containerId,
        frameId,
        nextChildId: () => `${frameId}-c${n++}`,
        paragraphContainers,
        ...(from.line > 0 ? { lineFrom: from.line } : {}),
        ...(from.line > 0 && from.widths ? { lineWidths: from.widths } : {}),
        ...(to.line > 0 ? { lineTo: to.line } : {}),
        ...(open.length > 0 ? { openNested: open } : {}),
        mirrored,
      });
    };
    return { children, childBase: startIdx + 1, realAt, end: { child: children.length, line: 0 }, layoutRange, groups };
  };
  /** Whether a page swaps its mirrored margins (a verso of a left-bound
   *  book, a recto of a right-bound one: an `'outer'` corner icon hangs on
   *  the left there). A vertical page has no outer side: a box's outer
   *  corner stays where the style puts it. */
  const mirroredOf = (page: VDTPage): boolean =>
    !page.flow && pageMirrored(resolved, page.index, pageIndexOffset);
  /** Where a block's paint ends: its last line's foot (a list tail's box
   *  bakes its bottom margin in and may reach past a cut with every line
   *  inside it), else its box's. */
  const paintedBottom = (b: VDTBlock): number => {
    const last = b.lines[b.lines.length - 1];
    return last ? last.bbox.y + last.bbox.height : b.bbox.y + b.bbox.height;
  };
  /** Whether a band cut by a cap holds a block painted past the cut: one
   *  that could not split across it (a paragraph tail the orphan and widow
   *  minimums keep whole, a keep-together box) was force-placed into an
   *  empty capped column and ran past its foot. */
  const capClipsLines = (cols: readonly VDTColumn[]): boolean => cols.some((c) =>
    c.bandCapped && c.blocks.some((b) => !b.hidden && paintedBottom(b) > c.bbox.y + c.bbox.height + CAPPED_OVERFLOW_PX));
  /** Used bottom of a band, the float-only side column's stack included:
   *  a span block cuts under the side boxes already set there. */
  const bandUsedBottomWithSide = (page: VDTPage, cols: readonly VDTColumn[]): number => {
    const side = sideColumnOf(page, cols[0]?.band ?? 0);
    const withSide = side && sideUsedBottom(side) > side.bbox.y + 0.5 ? [...cols, side] : cols;
    return bandUsedBottom(withSide);
  };

  interface CalloutFragment {
    /** The cut the rest of the box starts at. */
    to: CalloutCut;
    result: CalloutLayoutResult;
  }

  /** The longest leading fragment of the box from cut `from` on whose box
   *  is at most `roomPx` tall. Cuts fall between children or between the
   *  lines of a text child. `splitMinLines` guards text: a cut between
   *  children leaves on each side at least that many text lines or at least
   *  one indivisible block (a figure, table, display formula or nested
   *  box); a cut inside a text child counts every line on its side, a block
   *  as one line, and leaves at least `layout.boxChildSplitMinLines` lines
   *  of that child on each side (two by default, `splitMinLines` when that
   *  is lower; EF-115). A nested box that may split
   *  itself (`keepTogether: false`, or taller than a full column) offers the cuts
   *  inside it too, by its own `splitMinLines` over its own children; the
   *  fragments on both sides redraw its frame. The full layout's geometry
   *  ranks the candidates (box bottom = content bottom at the cut + the
   *  tails of the boxes closed below it); the deepest candidate that fits
   *  is laid out for real and taken when it truly fits. `null` when none
   *  does. */
  const splitCalloutFragment = (
    L: CalloutLayouter,
    from: CalloutCut,
    width: number,
    roomPx: number,
    frameId: string,
    continuation: boolean,
    minLines: number,
    mirrored = false,
  ): CalloutFragment | null => {
    const full = L.layoutRange(from, L.end, width, frameId, continuation, mirrored);
    /** Figures, tables and display formulas: never cut, not text lines. */
    const indivisible = (c: VDTBlock): boolean => c.type === 'resource' || c.type === 'mathDisplay';
    const unitBottom = (u: CalloutUnit): number => {
      const b = u.kind === 'block' ? u.block.bbox : u.box.result.frame.bbox;
      return b.y + b.height;
    };
    /** Room a box keeps under its last item (padding, border, icon growth). */
    const tailOf = (r: CalloutLayoutResult): number => {
      const last = r.units[r.units.length - 1];
      return last ? r.frame.bbox.y + r.totalHeight - unitBottom(last) : 0;
    };
    if (full.units.length === 0) return null;
    // A head that goes on also carries the style's continuation marker.
    const tail = tailOf(full) + full.continuesMarkerPx;
    /** Candidate cuts with the head's content bottom. */
    const candidates: { cut: CalloutCut; bottom: number }[] = [];
    /** Collect the cuts among `units` (one box's items; `below` = the tails
     *  of the nested boxes around them), each side of a cut holding enough
     *  by the box's `min` lines: a block counts as one line, a nested box
     *  as one indivisible block. */
    const collect = (units: readonly CalloutUnit[], minLines: number, below: number): void => {
      const min = Math.max(1, minLines);
      const lineCount = (u: CalloutUnit): number => (u.kind === 'block' ? Math.max(1, u.block.lines.length) : 1);
      const isBlock = (u: CalloutUnit): boolean => u.kind === 'box' || indivisible(u.block);
      const totalLines = units.reduce((n, u) => n + lineCount(u), 0);
      const totalBlocks = units.filter(isBlock).length;
      /** A side of a cut holds enough: `lines` (blocks included) of which
       *  `blocks` are indivisible. Between children, one block suffices or
       *  the text lines alone meet the minimum; inside a text child, the
       *  lines do. */
      const holds = (lines: number, blocks: number, betweenChildren: boolean): boolean =>
        betweenChildren ? blocks > 0 || lines - blocks >= min : lines >= min;
      const bothHold = (lines: number, blocks: number, betweenChildren: boolean): boolean =>
        holds(lines, blocks, betweenChildren) && holds(totalLines - lines, totalBlocks - blocks, betweenChildren);
      let linesBefore = 0;
      let blocksBefore = 0;
      units.forEach((u, i) => {
        let next: number | undefined;
        if (u.kind === 'block') {
          const c = u.block;
          const k = (c.contentIndex ?? L.childBase) - L.childBase;
          next = k + 1;
          if (!indivisible(c) && c.lines.length > 1) {
            // The first laid-out child of a continuation opens after
            // `from.line` lines: cuts inside it are counted from the
            // child's own head. Each side of the box still counts all its
            // lines against `min`, and a cut inside a child leaves at least
            // `layout.boxChildSplitMinLines` lines of it on each side (2 by
            // default, so no lone line: EF-115), or `min` when that is
            // lower. The count is of this fragment's part of the child,
            // since a part left behind already passed the test.
            const childMin = Math.min(min, resolved.layout.boxChildSplitMinLines);
            const lineBase = k === from.child ? from.line : 0;
            for (let l = childMin; l <= c.lines.length - childMin; l++) {
              const line = c.lines[l - 1]!;
              if (bothHold(linesBefore + l, blocksBefore, false)) {
                candidates.push({
                  cut: { child: k, line: lineBase + l, widths: k === from.child ? cutWidths(from, width) : [{ fromLine: 0, width }] },
                  bottom: line.bbox.y + line.bbox.height + below,
                });
              }
            }
          }
        } else {
          const { box } = u;
          if (box.endIdx !== undefined) next = box.endIdx + 1 - L.childBase;
          if (!box.style.keepTogether || tallerThanColumn(box.result)) {
            collect(box.result.units, box.style.splitMinLines, below + tailOf(box.result));
          }
        }
        linesBefore += lineCount(u);
        if (isBlock(u)) blocksBefore++;
        if (i < units.length - 1 && next !== undefined && bothHold(linesBefore, blocksBefore, true)) {
          candidates.push({ cut: { child: next, line: 0 }, bottom: unitBottom(u) + below });
        }
      });
    };
    collect(full.units, minLines, 0);
    const insideGroup = (cut: CalloutCut): boolean =>
      L.groups.some(([gs, ge]) => (cut.line === 0 ? gs < cut.child && cut.child <= ge : gs < cut.child && cut.child < ge));
    const viable = candidates
      .filter((c) => !insideGroup(c.cut))
      .sort((a, b) => b.bottom - a.bottom);
    for (const c of viable) {
      if (c.bottom + tail > roomPx + 0.01) continue;
      const result = L.layoutRange(from, c.cut, width, frameId, continuation, mirrored);
      if (result.totalHeight <= roomPx + 0.01) return { to: c.cut, result };
    }
    return null;
  };

  /** Absolute content indices of the children a fragment from cut `from`
   *  to cut `to` of `L` touches, for the fragment's source range. */
  const fragmentRange = (L: CalloutLayouter, from: CalloutCut, to: CalloutCut) =>
    ({ firstChildIdx: L.childBase + from.child, lastChildIdx: L.childBase + (to.line > 0 ? to.child : to.child - 1) });

  /** The (rest of the) box is taller than an empty, full-height column —
   *  a whole page's content area for a page-span box: no column could
   *  hold it, so even a keep-together box splits (with the rules of a
   *  `keepTogether: false` one) rather than overflow. */
  const tallerThanColumn = (result: CalloutLayoutResult): boolean =>
    result.totalHeight > contentArea.height + 0.01;

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
   * Splitting (`keepTogether: false`, or a keep-together box taller than
   * the page's content area): a box that does not fit a level (or
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
     * A floated box (`placement` on a `:::callout`) is no figure: it keeps
     * to the head or foot of a page, the bands it was floated to.
     */
    const placeSpanFloatsAtCut = (page: VDTPage, capActiveHere: boolean): boolean => {
      let placedAny = false;
      for (let i = 0; i < pendingFloats.length;) {
        const f = pendingFloats[i]!;
        const cols = bandColumns(page, currentBand(page, cursor));
        if (f.span !== 'page' || f.callout || cols.length < 2 || heldBack(i) || !((capActiveHere && !placedAny) || levelForBox(cols))) { i++; continue; }
        const width = page.contentArea.width;
        const slice = sliceOf(f);
        // On a vertical page the figure stands upright.
        const upright = page.flow ? uprightOn(page) : undefined;
        const measure = measureFloat(f.resourceId, width, slice, upright);
        if (!measure) { i++; continue; }
        const cutY = gridUp(page, bandUsedBottomWithSide(page, cols));
        const spacing = cols.some((c) => c.blocks.length > 0) ? floatGapPx : 0;
        const need = needFor(spacing, measure.height, floatGapPx);
        const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
        if (cutY + need > bandBottom + 0.01) { i++; continue; }
        const built = buildFloatBlock(f.resourceId, page.contentArea.x, width, slice, upright);
        if (!built) { i++; continue; }
        if (capActiveHere && !placedAny) {
          // A band whose content ran past the cut did not deliver its cap
          // (EF-116): the driver takes the cut lower instead.
          const overran = capClipsLines(cols);
          uncapBand(cols, uncappedBottoms);
          if (!overran) spanPlacedInBand.add(startIdx);
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
        L.layoutRange(from, L.end, width, frameId, continuation, mirroredOf(page));
      const result = layoutAt(page.contentArea.width);
      // A keep-together box (or the rest of it) taller than a whole page
      // splits like a `keepTogether: false` one instead of overflowing.
      const splittable = !style.keepTogether || tallerThanColumn(result);

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
        const cutY = gridUp(page, bandUsedBottomWithSide(page, cols));
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
          const first = pendingFloats.find((f, i) => f.span === 'page' && !heldBack(i));
          if (first && !capActive && cap === undefined && bandStart && registeredBand
            && registeredBand.pageIndex === page.index && registeredBand.band === bandBefore) {
            const cols = bandColumns(page, bandBefore).filter((c) => c.bbox.height > 0.5);
            if (cols.length > 1 && !isBandLevel(cols) && cols.some((c) => c.blocks.length > 0)) {
              const lines = bandCapLines(cols, baselineGrid);
              const capBottom = bandTop(cols) + lines * baselineGrid;
              const bandBottom = Math.min(...cols.map((c) => columnBottom(c, uncappedBottoms)));
              // A floated box is never set at the cut (see
              // `placeSpanFloatsAtCut`): it only gets the trailing cap.
              const m = first.callout ? null : measureFloat(first.resourceId, page.contentArea.width, sliceOf(first));
              const figureFits = m !== null && capBottom + needFor(floatGapPx, m.height, floatGapPx) <= bandBottom + 0.01;
              if (figureFits) {
                bandCapProposals.set(startIdx, {
                  kind: 'span',
                  startContentIndex: bandStart.contentIndex,
                  startPart: bandStart.part,
                  ...(bandStart.visit > 0 ? { startVisit: bandStart.visit } : {}),
                  lines,
                  retries: 0,
                  ...capHeadPx(cols),
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
        // A box that fills its band to the last grid line is not an overflow.
        const overflowPx = Math.max(0, fit.spacing + result.totalHeight - fit.roomPx);
        if (overflowPx > 0.5) {
          (doc.warnings ??= []).push({
            kind: 'calloutOverflow',
            pageIndex: cursor.pageIndex,
            columnIndex: cursor.columnIndex,
            sourceStart: contentBlocks[startIdx]!.sourceStart + bodyOffset,
            sourceEnd: contentBlocks[plan.endIdx]!.sourceEnd + bodyOffset,
            overflowPx,
          });
        }
      }

      if (action) {
        if (capActive) {
          // The box cuts where the band's content ends. When that content
          // ran past the cap's cut (a paragraph tail that could not split
          // over it, force-placed into an empty capped column), the cap is
          // not delivered: the driver takes the cut a line lower rather than
          // keep a cut as low as that one column (EF-116).
          const overran = capClipsLines(action.fit.cols);
          uncapBand(action.fit.cols, uncappedBottoms);
          if (!overran) spanPlacedInBand.add(startIdx);
        }
        const placed = action.kind === 'whole' ? action.result : action.fragment.result;
        const to = action.kind === 'whole' ? L.end : action.fragment.to;
        if (part > 0 || action.kind === 'split') markFragment(placed, part, action.kind === 'split');
        const spanCol = closeBandAndInsertSpan(
          page, action.fit.cols, action.fit.cutY, placed.frame, action.need, cursor, action.fit.spacing, placed.totalHeight,
        );
        commitCallout(placed, startIdx, plan, spanCol, part > 0 || action.kind === 'split' ? fragmentRange(L, from, to) : undefined);
        // Floats first-referenced inside the box enqueue once its head is
        // committed, in reading order (same as the inline path); those its
        // later parts cite wait for them.
        if (part === 0) {
          for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
          gateBoxCitations(startIdx + 1, plan.endIdx);
        }
        releaseBoxCitations(action.kind === 'whole' ? plan.endIdx + 1 : L.childBase + to.child);
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
          advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
              ...(bandStart.visit > 0 ? { startVisit: bandStart.visit } : {}),
              lines,
              retries: 0,
              ...capHeadPx(cols),
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
          advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
        const level = headingLevels.forBlock(b);
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
      const ref = anchor.to === 'page' ? designFramesOn(page).page
        : anchor.to === 'bleed' ? designFramesOn(page).bleed
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
        advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
   * Set a `span: 'side'` box in the side column of the current band: laid
   * out at the side column's width and stacked under what the column holds,
   * no higher than the flow's current position (beside the text it
   * interrupts), consuming the column's free height like a side float. A
   * box the rest of the column cannot hold waits for the side column of the
   * next page the flow opens (`flushSideBoxesIntoPage`), where it is set
   * anyway — overflowing — when even an empty column cannot hold it. The
   * frame and its children leave the flow into `page.floats`, as a fixed
   * box does. Returns false when the page has no side column: the box then
   * lays out inline.
   */
  const trySideBox = (
    page: VDTPage,
    side: VDTColumn,
    box: { startIdx: number; plan: PlannedCallout; style: ResolvedCalloutStyleConfig },
    refY: number | undefined,
    mode: 'fresh' | 'strict',
  ): boolean => {
    const { startIdx, plan, style } = box;
    const L = makeCalloutLayouter(startIdx, plan, style);
    const frameId = `block-${blockIdCounter++}`;
    const result = L.layoutRange(CUT_START, L.end, side.bbox.width, frameId, false, mirroredOf(page));
    const used = sideUsedBottom(side);
    const raw = Math.max(used, refY ?? used);
    const gridUpSide = (v: number): number => page.contentArea.y + Math.ceil((v - page.contentArea.y - 0.01) / baselineGrid) * baselineGrid;
    const below = Math.max(result.marginBottomPx, floatGapPx);
    // Clear of the heading-design elements standing in the column (EF-78).
    const obstacles = sideObstacles.get(side);
    let y = clearSideObstacles(gridUpSide(raw), result.totalHeight, obstacles, below, gridUpSide);
    let need = y - used + result.totalHeight + below;
    // The gap under the box is owed only to what follows: a box whose foot
    // lands on the column's foot needs none.
    const fits = (): boolean => need <= side.availableHeight + 0.01 || y - used + result.totalHeight <= side.availableHeight + 0.01;
    if (!fits() && refY !== undefined && raw > used + 0.5) {
      // Beside its text the box runs off the column: it slides up — as far
      // as the stack above allows — to the lowest position that fits, its
      // foot on the column's foot (the bottom-aligned marginal box), unless
      // a heading design stands there.
      const foot = side.bbox.y + side.bbox.height;
      const fit = page.contentArea.y + Math.floor((foot - result.totalHeight - page.contentArea.y + 0.01) / baselineGrid) * baselineGrid;
      if (fit >= used - 0.01 && clearSideObstacles(fit, result.totalHeight, obstacles, below, gridUpSide) === fit) {
        y = fit;
        need = y - used + result.totalHeight + below;
      }
    }
    if (!fits()) {
      if (mode === 'strict' || used > side.bbox.y + 0.5 || (obstacles?.length ?? 0) > 0) return false;
      // A box that a full side column would hold waits for one rather than
      // overflowing an empty column a band above has shortened.
      if (shortSideColumn(page, side) && result.totalHeight <= page.contentArea.height + 0.01) return false;
      // Same as a side float: a box that overflows a caption-shortened
      // column asks for that caption to go under its figure.
      const cutBy = asideCutBy.get(side);
      if (cutBy !== undefined) captionUnderProposals.add(cutBy);
    }
    const frame = result.frame;
    stampCalloutSource(frame, startIdx, plan);
    frame.pageIndex = page.index;
    frame.columnIndex = side.index;
    offsetCalloutToAbsolute(result, side.bbox.x, y);
    const floats = (page.floats ??= []);
    doc.blocks.push(frame);
    floats.push(frame);
    for (const child of result.children) {
      child.pageIndex = frame.pageIndex;
      child.columnIndex = frame.columnIndex;
      doc.blocks.push(child);
      floats.push(child);
    }
    side.availableHeight = Math.max(0, side.availableHeight - need);
    for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
    return true;
  };
  const placeCalloutSide = (startIdx: number, plan: PlannedCallout, style: ResolvedCalloutStyleConfig): boolean => {
    const page = doc.pages[cursor.pageIndex]!;
    const side = sideColumnOf(page, currentBand(page, cursor));
    if (!side) return false;
    const curCol = currentColumn(doc, cursor);
    const refY = curCol.bbox.y + (curCol.bbox.height - curCol.availableHeight) + (curCol.blocks.length > 0 ? pendingSpacing : 0);
    // `sideAtColumnEnd: 'after'` (EF-161): the box waits for the text after
    // its fence, and stands beside it when the break rules send that text
    // on to the next page (a column with no room left, a paragraph the
    // widow and orphan rules move whole, a heading kept with its text). A
    // side box fenced while one waits waits too, so the side column keeps
    // their order. A box nothing follows in its chapter stays with the
    // text before it, like any box with `'before'` (postext 1.4's rule).
    // A box fenced again after a keep-with-next rewind is already waiting.
    if (awaitingSideBoxes.some((w) => w.box.startIdx === startIdx)) return true;
    if (awaitingSideBoxes.length > 0 || (style.sideAtColumnEnd === 'after' && !nextIsBarrier(plan.endIdx + 1))) {
      awaitingSideBoxes.push({ box: { startIdx, plan, style }, pageIndex: page.index, band: currentBand(page, cursor), column: curCol, refY });
      return true;
    }
    if (!trySideBox(page, side, { startIdx, plan, style }, refY, 'strict')) {
      pendingSideBoxes.push({ startIdx, plan, style });
    }
    return true;
  };
  /** The first block after content index `endIdx` that the flow holds in a
   *  column: the first part of the block that follows a side box's fence. */
  const firstFlowBlockAfter = (endIdx: number): VDTBlock | undefined => {
    let first: VDTBlock | undefined;
    for (const b of doc.blocks) {
      const ci = b.contentIndex;
      if (ci === undefined || ci <= endIdx || (first !== undefined && first.contentIndex! <= ci)) continue;
      const col = doc.pages[b.pageIndex]?.columns[b.columnIndex];
      if (!col || col.kind === 'side' || !col.blocks.includes(b)) continue;
      first = b;
    }
    return first;
  };
  /**
   * Set the side boxes waiting for the text after their fence
   * (`awaitingSideBoxes`), in order. Called once the flow holds a block
   * after the last of them that it will not take back — a heading kept
   * with its text can still move on with it — and with `force` where the
   * flow segment ends. A box with `sideAtColumnEnd: 'after'` whose text
   * went on in another column or on a later page stands level with that
   * text's first block, in the side column there; every other box stands
   * at its fence, as it would have been set there. One the side column
   * cannot hold takes the side column of a later page.
   */
  const settleAwaitingSideBoxes = (force: boolean): void => {
    if (awaitingSideBoxes.length === 0) return;
    const lastEnd = awaitingSideBoxes[awaitingSideBoxes.length - 1]!.box.plan.endIdx;
    if (!force) {
      const held = doc.blocks.some((b) => {
        if ((b.contentIndex ?? -1) <= lastEnd || isFreeHeading(b)) return false;
        const col = doc.pages[b.pageIndex]?.columns[b.columnIndex];
        return col !== undefined && col.kind !== 'side' && col.blocks.includes(b);
      });
      if (!held) return;
    }
    for (const w of awaitingSideBoxes.splice(0)) {
      let { pageIndex, band, refY } = w;
      if (w.box.style.sideAtColumnEnd === 'after') {
        const anchor = firstFlowBlockAfter(w.box.plan.endIdx);
        const anchorPage = anchor ? doc.pages[anchor.pageIndex] : undefined;
        const col = anchorPage?.columns[anchor!.columnIndex];
        if (anchorPage && col && col !== w.column && col.kind !== 'span' && sideColumnOf(anchorPage, col.band ?? 0)) {
          pageIndex = anchorPage.index;
          band = col.band ?? 0;
          refY = anchor!.bbox.y;
        }
      }
      const page = doc.pages[pageIndex]!;
      const side = sideColumnOf(page, band);
      if (side && trySideBox(page, side, w.box, refY, 'strict')) continue;
      // The pages the flow has opened since: their side columns, from the
      // top, as `flushSideBoxesIntoPage` would have set it there.
      let placed = false;
      for (let p = pageIndex + 1; p <= cursor.pageIndex && !placed; p++) {
        const later = doc.pages[p]!;
        const laterSide = sideColumnOf(later, 0);
        placed = laterSide !== undefined && trySideBox(later, laterSide, w.box, undefined, 'fresh');
      }
      if (!placed) pendingSideBoxes.push(w.box);
    }
  };
  /** Set the waiting side boxes in the side column of a freshly opened
   *  page, in order; one that does not fit an empty column is set anyway. */
  const flushSideBoxesIntoPage = (page: VDTPage): void => {
    if (pendingSideBoxes.length === 0) return;
    const side = sideColumnOf(page, 0);
    if (!side) return;
    while (pendingSideBoxes.length > 0) {
      if (!trySideBox(page, side, pendingSideBoxes[0]!, undefined, 'fresh')) break;
      pendingSideBoxes.shift();
    }
  };

  /**
   * Place a `:::callout` inline at the current column width as one atomic
   * unit: the frame block followed by its children in the same column. The
   * box's `marginTop` collapses with the pending spacing; `marginBottom` is
   * baked into the post-box grid snap (or, with `snapToGrid: false`, left
   * exact as pending spacing). A box that does not fit moves to the
   * next column/page (like a resource), pulling a run of trailing headings
   * along (keep-with-next). A splittable box (`keepTogether: false`, or a
   * keep-together one taller than a full column) instead leaves the
   * longest run of its children that fits in the column and continues — in
   * a box of its own, without the title or icon — at the top of the next
   * one, splitting again if needed; only a box no cut can split is placed
   * anyway in an empty column, overflowing (the sandbox warns).
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
    const layoutAt = (width: number) => L.layoutRange(CUT_START, L.end, width, firstFrameId, false, mirroredOf(doc.pages[cursor.pageIndex]!));

    // Fixed boxes leave the flow entirely.
    if (placement === 'fixed') {
      placeCalloutFixed(startIdx, plan, style, layoutAt);
      calloutsOutOfFlow.add(startIdx);
      return undefined;
    }
    // Floated boxes leave it too: they take the first free band after
    // this point (the foot of the current page, or the head / foot of a
    // page the flow opens later) and the text after them fills the page.
    // A side box always stacks beside the text it interrupts. A box taller
    // than a full column, which a cut can split, does not float (no band
    // holds it whole): it stays in the flow where it occurs, like a `here`
    // box, and splits there. One no cut can split still floats whole.
    const floating = (placement === 'auto' || placement === 'top' || placement === 'bottom') && span !== 'side';
    if (floating) {
      const page = doc.pages[cursor.pageIndex]!;
      const width = span === 'page' ? page.contentArea.width : currentColumn(doc, cursor).bbox.width;
      const inFlow = tallerThanColumn(L.layoutRange(CUT_START, L.end, width, 'float-probe', false))
        && splitCalloutFragment(L, CUT_START, width, contentArea.height, 'float-probe', false, style.splitMinLines) !== null;
      if (!inFlow) {
        enqueueCalloutFloat(startIdx, plan, style, L, placement, span);
        calloutsOutOfFlow.add(startIdx);
        return undefined;
      }
    }
    // Page-span boxes split a multi-column page into column bands (stage 1
    // of span blocks).
    {
      const page = doc.pages[cursor.pageIndex]!;
      if (
        span === 'page'
        && (placement === 'here' || floating)
        && multiColumnBand(page)
        && placeCalloutSpan(startIdx, plan, style, L, firstFrameId)
      ) {
        return undefined;
      }
      // Side boxes stack in the float-only side column beside the text
      // (whatever their placement: a side box never floats to a band).
      if (span === 'side' && placeCalloutSide(startIdx, plan, style)) {
        calloutsOutOfFlow.add(startIdx);
        return undefined;
      }
    }

    let from: CalloutCut = CUT_START;
    let part = 0;
    let frameId = firstFrameId;
    /** Times the box left an EMPTY short column (see below) — bounded. */
    let shortColumnMoves = 0;
    for (;;) {
      // A box (or the rest of a split one) that opens a band applies the
      // band's cap before it measures its room, as a paragraph does: sized
      // against the uncut column, a continuation ran past the cut of a
      // band levelled for a page-span box after it (EF-126).
      enterBand(startIdx, part);
      let curCol = currentColumn(doc, cursor);
      const continuation = part > 0;
      const result = L.layoutRange(from, L.end, curCol.bbox.width, frameId, continuation, mirroredOf(doc.pages[cursor.pageIndex]!));
      // Column balancing: a box closing its column takes the column's gap
      // above it (the trailing-callout lever), so its foot lands on the
      // last grid slot — level with the column beside it. Any fragment
      // qualifies, as long as something sits above it to push down from:
      // text, or the float band at the head of an otherwise empty column.
      const balanceBefore = curCol.blocks.length > 0 || reservedOf(curCol).top > 0
        ? (balanceExtraPx?.get(balanceKey(startIdx, part)) ?? 0)
        : 0;
      const spacing = (curCol.blocks.length === 0 ? 0 : Math.max(pendingBeforeSelfSnapping(startIdx), result.marginTopPx)) + balanceBefore;
      const roomPx = curCol.availableHeight - spacing;
      let fragment: CalloutFragment | null = null;
      if (result.totalHeight > roomPx + 0.01) {
        // The (rest of the) box does not fit the column: a splittable box
        // leaves the head that fits here — a keep-together one too once
        // no full column could hold it whole…
        const splittable = !style.keepTogether || tallerThanColumn(result);
        if (splittable) fragment = splitCalloutFragment(L, from, curCol.bbox.width, roomPx, frameId, continuation, style.splitMinLines, mirroredOf(doc.pages[cursor.pageIndex]!));
        // …otherwise it moves whole to the next column — also out of an
        // EMPTY column that float bands or a band cap have cut short, when
        // a full column would hold it (bounded, so a run of short columns
        // cannot make it wander forever). Only a box taller than a full
        // column that no cut can split is placed anyway, overflowing (a
        // layout warning says so).
        const shortColumn = shortColumnMoves < 4
          && curCol.bbox.height < contentArea.height - baselineGrid
          && result.totalHeight <= contentArea.height + 0.01;
        if (!fragment && (curCol.blocks.length > 0 || shortColumn)) {
          if (curCol.blocks.length === 0) shortColumnMoves++;
          // A box that leaves the last column of its band for the next page
          // leaves that column short while the ones before it run full: the
          // band is cut level, as a closing band is, so its columns end
          // together and share the room the box left (keyed by the box —
          // in the capped pass it reaches the cut band and moves on again).
          if (part === 0 && curCol.blocks.length > 0) {
            const page = doc.pages[cursor.pageIndex]!;
            const cols = bandColumns(page, currentBand(page, cursor));
            if (cols[cols.length - 1] === curCol) proposeTrailingCap(startIdx);
          }
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
            const rolledBack = rollbackHeadings(curCol);
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            return (rolledBack[0]!.contentIndex ?? startIdx - rolledBack.length) - 1;
          }
          advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
      // enqueue them twice); those a later part of a split box cites wait
      // for that part.
      if (part === 0) {
        for (let i = startIdx + 1; i <= plan.endIdx; i++) enqueueFloatsFor(i);
        gateBoxCitations(startIdx + 1, plan.endIdx);
      }
      const placed = fragment ? fragment.result : result;
      const to = fragment ? fragment.to : L.end;
      if (part > 0 || fragment) markFragment(placed, part, fragment !== null);
      const spacingBefore = (curCol.blocks.length === 0 ? 0 : Math.max(pendingBeforeSelfSnapping(startIdx), placed.marginTopPx)) + balanceBefore;
      if (balanceBefore > 0) {
        addBalanceExtra(curCol, balanceBefore);
        placed.frame.balancing = { levers: ['trailingCallout'], spaceAbove: balanceBefore };
      }
      // Spacing collapses at a column top, so the lever's push under a
      // float band is consumed here: the box then opens that far down.
      if (balanceBefore > 0 && curCol.blocks.length === 0) {
        curCol.availableHeight = Math.max(0, curCol.availableHeight - balanceBefore);
      }
      enterBand(startIdx, part);
      placeAtomicBlock(
        placed.frame, placed.totalHeight, spacingBefore, cursor, doc, geomResolved,
        contentArea, pageWidthPx, pageHeightPx,
      );
      enterBand(startIdx, part);
      curCol = currentColumn(doc, cursor);
      commitCallout(placed, startIdx, plan, curCol, part > 0 || fragment ? fragmentRange(L, from, to) : undefined);
      releaseBoxCitations(fragment ? L.childBase + to.child : plan.endIdx + 1);
      // Snap the flow after the box to the baseline grid, baking in at least
      // `marginBottom` (grid wins, margin is a minimum — the resource rule).
      // An off-grid style (`snapToGrid: false`) keeps its exact margin
      // instead, as pending spacing that collapses with the next block's
      // top margin: the flow stays off the grid until the next snap point
      // (a snapped heading, a list tail), like after an unsnapped heading.
      if (style.snapToGrid) {
        const usedHeight = curCol.bbox.height - curCol.availableHeight;
        const naturalBottom = usedHeight + placed.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        curCol.availableHeight = Math.max(0, curCol.bbox.height - snappedBottom);
      }
      pendingSpacing = style.snapToGrid ? 0 : placed.marginBottomPx;
      if (!fragment) return undefined;
      // The rest continues at the top of the next column.
      from = to;
      part++;
      frameId = `block-${blockIdCounter++}`;
      advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
    }
  };

  /**
   * `bodyText.keepColonWithList` with `colonListRoom: 'item'` (EF-110):
   * whether the first item of the list after the lead-in paragraph
   * `leadIdx` can start in `roomPx` of column under it — it fits whole, or
   * the orphan and widow rules for lists would leave some of its lines
   * there, as they do when it is set.
   */
  const firstListItemStarts = (leadIdx: number, roomPx: number, width: number, ctx: BlockMeasureContext): boolean => {
    let idx = leadIdx + 1;
    while (idx < contentBlocks.length && isMarkerBlock(contentBlocks[idx]!)) idx++;
    const raw = contentBlocks[idx];
    if (!raw || raw.type !== 'listItem') return true;
    const item = measureContentBlock(raw, idx, width, ctx);
    if (!item) return true;
    const lines = item.measured.lines.length;
    const fit = Math.floor((roomPx + FIT_EPS) / item.kind.style.lineHeightPx);
    if (lines <= fit) return true;
    if (fit < 1) return false;
    const body = resolved.bodyText;
    return chooseParagraphSplit(lines, fit, {
      avoidOrphans: body.avoidOrphans && body.avoidOrphansInLists,
      orphanMinLines: body.orphanMinLines,
      orphanPenalty: body.orphanPenalty,
      avoidWidows: body.avoidWidows && body.avoidWidowsInLists,
      widowMinLines: body.widowMinLines,
      widowPenalty: body.widowPenalty,
      slackWeight: body.slackWeight,
    }).splitAt > 0;
  };

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
    options?.onProgress?.({ pass: 1, blocks: blockIdx, totalBlocks: contentBlocks.length, pages: doc.pages.length });
    const rawBlock = contentBlocks[blockIdx]!;

    // The styled section this block sits in: its geometry applies to the
    // pages opened from here (a heading with `breakBefore` opens one).
    const blockSection = sectionPlan.byBlock[blockIdx];
    if (blockSection !== currentSection) enterSection(blockSection);

    // Floats whose reference landed in an earlier iteration take the first
    // free slot of the current page now — after their reference in reading
    // order. Then enqueue the floats first-referenced in this block, so the
    // next page opened while placing it (or any later block) reserves their
    // band and the next iteration offers them the slots that follow. A text
    // block holds its floats back until the line citing them is placed
    // (`gateCitedFloats`).
    settleAwaitingSideBoxes(false);
    releaseStaleCitationGates(blockIdx);
    tryPlacePendingFloatsOnCurrentPage(spanBoxAt(blockIdx), blockIdx);
    enqueueFloatsFor(blockIdx);

    // --- Directives ----------------------------------------------------
    if (rawBlock.type === 'directive') {
      const name = rawBlock.directiveName;
      const attrs = rawBlock.directiveAttrs ?? {};
      if (name === 'pagebreak') {
        pendingSpacing = 0;
        markForcedBreak();
        advanceToNextPageBoundary(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx);
        const parity = attrs.parity;
        if (
          parity === 'odd'
          || parity === 'even'
          || parity === 'always-odd'
          || parity === 'always-even'
        ) {
          enforcePageParity(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, parity);
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
          advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
          const n = Number(attrs.startAt);
          if (Number.isInteger(n) && n >= 1) change.startAt = n;
        }
        if (Object.keys(change).length > 0) {
          pendingNumberingChange = change;
          pendingNumberingPage = pageTakesNumbering(doc.pages[cursor.pageIndex]!) ? cursor.pageIndex + 1 : cursor.pageIndex;
        }
      }
      continue;
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
    if (skipPartUntil !== null) {
      if (blockIdx >= skipPartUntil) skipPartUntil = null;
      continue;
    }
    if (!resolved.parts.page && rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockIdx);
      if (plan) {
        const end = [...partPlan.byEnd].find(([, p]) => p === plan)?.[0] ?? blockIdx;
        const marks = (doc.partMarks ??= []);
        if (!marks.some((m) => m.afterContentIndex === end)) marks.push({ afterContentIndex: end, number: plan.number, title: plan.title, ...(plan.palette && Object.keys(plan.palette).length > 0 ? { palette: plan.palette } : {}) });
        skipPartUntil = end;
        continue;
      }
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockIdx);
      if (plan) {
        pendingSpacing = 0;
        closeFlowSegment(blockIdx);
        leaveCurrentPage();
        enforcePageParity(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, resolved.parts.breakBefore.parity);
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
      enforcePageParity(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, parity);
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
      // What a container tail still owes passes through the closing
      // markers right after it (see `inlineGapOwed`).
      const owed: typeof inlineGapOwed = rawBlock.type === 'containerEnd' && inlineGapOwed?.container
        && inlineGapOwed.afterIdx === blockIdx - 1 && pendingSpacing === inlineGapOwed.pending
        ? inlineGapOwed
        : null;
      let owedExact: number = owed?.exact ?? 0;
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
          const margin = pc.marginBottomPx;
          owedExact = margin < 0 ? owedExact + margin : Math.max(owedExact, margin);
          pendingSpacing = collapse(margin);
        }
      }
      if (owed) inlineGapOwed = { afterIdx: blockIdx, pending: pendingSpacing, exact: owedExact, container: true };
      continue;
    }

    // --- Heading `breakBefore` ----------------------------------------
    if (rawBlock.type === 'heading' && rawBlock.level) {
      const level = headingLevels.forBlock(rawBlock);
      const bb = level?.breakBefore;
      if (bb && bb.enabled) {
        pendingSpacing = 0;
        closeFlowSegment(blockIdx);
        advanceToNextPageBoundary(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx);
        if (bb.parity !== 'any') {
          enforcePageParity(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, bb.parity);
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
        advanceToNextPageBoundary(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx);
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

    // A page-span box that left no band under it keeps the cursor on its
    // (full) span column. Move on before measuring: a block measured at the
    // span width and placed in the next page's text column would carry
    // lines wider than that column.
    if (currentColumn(doc, cursor).kind === 'span') {
      pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
    }
    // Measure against the current column width. `null` means there is nothing
    // to place inline (empty text, unknown resource id, floated resource).
    const col = currentColumn(doc, cursor);
    const blockMeasureCtx = partPlan.byBlock[blockIdx] ? partMeasureCtx : sectionMeasureCtx(sectionPlan.byBlock[blockIdx]);
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
    const collapseTail = containerTail !== undefined
      && resolved.bodyText.paragraphContainerSpacing === 'collapse'
      && containerTail.tailStyle.marginBottomPx >= 0;
    const tailStyle = collapseTail && blockMeasureCtx.bodyStyle.marginBottomPx > containerTail.tailStyle.marginBottomPx
      ? { ...containerTail.tailStyle, marginBottomPx: blockMeasureCtx.bodyStyle.marginBottomPx }
      : containerTail?.tailStyle;
    const styleOverride = paragraphContainer
      ? (isContainerTail ? tailStyle ?? paragraphContainer.tailStyle : paragraphContainer.style)
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
    // A page-span heading without a design of its own is painted by the
    // default opener across the content area: measured at that width, its
    // band holds the title as it is painted (EF-100). A designed opener
    // keeps the column-width measure: its design sets the band.
    const measureWidth = rawBlock.type === 'heading' && opensDefaultOpener(rawBlock)
      ? doc.pages[cursor.pageIndex]!.contentArea.width
      : col.bbox.width;
    // A resource on a vertical page stands upright, its frame at most as
    // wide as the flow is tall (less the float gap it keeps).
    const blockPage = doc.pages[cursor.pageIndex]!;
    const upright = blockPage.flow && rawBlock.type === 'resourceBlock'
      ? { uprightMaxLength: uprightOn(blockPage).length }
      : {};
    let measuredBlock = tryLoose
      ? measureLooseParagraph(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, styleOverride, looseLines, trackingLadder, looseOutcome)
      : measureContentBlock(rawBlock, blockIdx, measureWidth, blockMeasureCtx, { styleOverride, ...upright });
    // Screen pages (`layout.fitFiguresToPage`): an inline figure a little
    // too tall for the room left in its column — under an opener band, say
    // — is set smaller to stay with its text rather than leave the rest of
    // the page empty. Never below MIN_INLINE_FIGURE_SCALE of its size.
    if (measuredBlock?.kind.vdtType === 'resource' && resolved.layout.fitFiguresToPage) {
      const rb = measuredBlock.resourceBlock;
      const room = col.availableHeight - (col.blocks.length === 0 ? 0 : Math.max(pendingSpacing, floatGapPx));
      if (rb && !rb.table && !rb.rotation && rb.bodyRect.height > 0 && measuredBlock.measured.totalHeight > room && room > 0) {
        let width = rb.bodyRect.width;
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = measuredBlock.resourceBlock!;
          const rest = measuredBlock.measured.totalHeight - current.bodyRect.height;
          const scale = (room - rest) / current.bodyRect.height;
          if (!(scale > 0)) break;
          width = current.bodyRect.width * Math.min(scale, 0.99);
          if (width < rb.bodyRect.width * MIN_INLINE_FIGURE_SCALE) break;
          const smaller = measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride, figureMaxBodyWidth: width });
          if (!smaller) break;
          measuredBlock = smaller;
          if (smaller.measured.totalHeight <= room) break;
        }
        // Still too tall at the smallest acceptable size: back to full size
        // and on to the next column, as without the option.
        if (measuredBlock!.measured.totalHeight > room) {
          measuredBlock = measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride });
        }
      }
    }
    if (tryLoose && budget !== undefined && knownOutcome === undefined && typeof looseOutcome.get(blockIdx) === 'number') {
      looseGained.set(budget.group, (looseGained.get(budget.group) ?? 0) + 1);
    }
    if (!measuredBlock) continue;
    const { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender } = measuredBlock;
    /** Tracking the block's lines are set with; a paragraph moved whole into
     *  a column of another width is measured again, and may change it. */
    let { letterSpacingPx } = measuredBlock;
    const { vdtType, headingLevel, numberPrefix, numberSeparator, headingNumber, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;
    // A structural heading (`hidden`) is placed like any heading — its
    // break, keep-with-next and grid snap apply — but with no line height
    // and no margins: it takes no room, and renderers skip it.
    const hiddenHeading = vdtType === 'heading' && headingIsHidden(rawBlock, headingLevels.forBlock(rawBlock));
    const style = hiddenHeading ? { ...kind.style, lineHeightPx: 0, marginTopPx: 0, marginBottomPx: 0 } : kind.style;

    // --- Resource blocks (image / svg / table + caption) -----------------
    // Placed atomically (kept-together) — no mid-content split for v1.
    if (vdtType === 'resource') {
      const resourceBlock = measuredBlock.resourceBlock!;
      const groupHeight = measured.totalHeight;
      const blk = createVDTBlock(id, 'resource', style.fontString, style.color, style.textAlign);
      blk.contentIndex = blockIdx;
      stampBlockExtras(blk, rawBlock);
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
      // An inline resource keeps the float gap (a line) above it, as a
      // float would, unless the block before asked for more.
      const spacingBefore = Math.max(pendingSpacing, floatGapPx);
      enterBand(blockIdx, 0);
      placeAtomicBlock(
        blk, groupHeight, spacingBefore, cursor, doc, geomResolved,
        contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(groupHeight),
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
      // The white under it then makes up the float gap, as above it (EF-93):
      // what the snap left short of that gap, in whole grid lines, is carried
      // as pending spacing, so it collapses with the next block's own space
      // above — a heading's, a list's or a box's top margin, the next inline
      // resource's float gap — and vanishes at a column foot, where the
      // column is full either way. `layout.inlineResourceGap: 'above'` keeps
      // 1.4's rule, the snap alone.
      {
        const rCol = currentColumn(doc, cursor);
        const usedHeight = rCol.bbox.height - rCol.availableHeight;
        const naturalBottom = usedHeight + style.marginBottomPx;
        const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
        rCol.availableHeight = Math.max(0, rCol.bbox.height - snappedBottom);
        const owed = resolved.layout.inlineResourceGap === 'above'
          ? 0
          : floatGapPx - (snappedBottom - usedHeight);
        pendingSpacing = owed > 0.01 ? Math.ceil((owed - 0.01) / baselineGrid) * baselineGrid : 0;
        inlineGapOwed = pendingSpacing > 0 ? { afterIdx: blockIdx, pending: pendingSpacing, exact: owed } : null;
      }
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
        if (listBullet.prefixText !== undefined) {
          blk.prefixText = listBullet.prefixText;
          blk.prefixX = blk.bulletOffsetX + (listBullet.prefixOffsetPx ?? 0);
        }
      }
      if (strikethroughText) blk.strikethroughText = true;
      // Bullet Y = x-height midpoint of the item's first text line.
      // Pairs with `textBaseline='middle'` at render so the bullet stays
      // visually centered on the text regardless of its own font size. A
      // contents number sits on the line's baseline instead.
      const firstLine = blk.lines[0];
      if (firstLine) {
        const at = listBulletPosition(listBullet, firstLine.baseline);
        blk.bulletY = at.bulletY;
        if (at.bulletBaselineY !== undefined) blk.bulletBaselineY = at.bulletBaselineY;
      }
    };

    // Neighbour lookaheads see through container markers.
    const nextBlock = nextNonMarkerBlock(contentBlocks, blockIdx) ?? null;
    const nextIsListItem = nextBlock?.type === 'listItem';
    /** The space before the next item of the list (EF-165): the item
     *  spacing of the shallower list, so the item after a nested list
     *  takes its own list's spacing, not the nested one's. */
    const itemGapPx = (bullet: NonNullable<typeof listBullet>): number => (nextBlock?.type === 'listItem'
      ? listItemGapPx(
          { spacingPx: bullet.itemSpacingPx, depth: listDepth ?? 1 },
          { spacingPx: listItemSpacingPx(nextBlock, blockMeasureCtx.resolved), depth: nextBlock.depth ?? 1 },
        )
      : bullet.itemSpacingPx);

    // For headings, only snap to baseline grid if the next block is NOT a heading.
    // Consecutive headings flow without grid snapping; the last heading in the
    // group snaps so that the following body text realigns with the grid.
    // Same rule for list items: the LAST item of a list snaps so that text
    // after the list realigns with the baseline grid, even when non-grid
    // spacings (itemSpacing, marginTop/Bottom) were chosen. And for the last
    // paragraph of a `:::paragraphs` container, whose leading and spacing
    // are off-grid by design.
    const nextIsHeading = nextBlock?.type === 'heading';
    // The contents (`:::toc`) keep their own rhythm: an entry set as a list
    // item is not a list tail to realign the text after it. A heading snaps
    // per its level (or style), which inherits `headings.snapToGrid`.
    const shouldSnapToGrid = rawBlock.toc === undefined && rawBlock.index === undefined && (
      (vdtType === 'heading' && !nextIsHeading
        && (headingLevels.forBlock(rawBlock)?.snapToGrid ?? resolved.headings.snapToGrid)) ||
      (vdtType === 'listItem' && !nextIsListItem) ||
      (vdtType === 'paragraph' && isContainerTail && paragraphContainer?.snapToGrid !== false) ||
      vdtType === 'mathDisplay'
    );

    // Place block, splitting across columns/pages if needed.
    // List items may split too — orphan/widow protection per-list is gated by
    // `avoidOrphansInLists` / `avoidWidowsInLists`; bullet stays on first part.
    const canSplit = vdtType === 'paragraph' || vdtType === 'blockquote' || vdtType === 'listItem';
    // A justified line the breaker could not fill (a link breaking at its
    // joints, a last word that cannot come up) is set ragged, not stretched.
    let remainingLines = [...raggedLooseLines(measured.lines, style.textAlign)];
    let partIndex = 0;
    // The floats this block cites wait for the line that cites them.
    gateCitedFloats(blockIdx, remainingLines);
    /** Times this block left an EMPTY short column (see `shortColumn`) —
     *  bounded so a page whose columns are all short (footnotes, design
     *  bands) cannot make it wander forever. */
    let shortColumnMoves = 0;
    /** Whether the paragraph was already re-broken to keep a hyphen off
     *  the last line of a column (`bodyText.hyphenateAcrossColumns`). */
    let columnEndHyphenRetried = false;
    /** `hyphenateAcrossColumns: false`: the paragraph's lines as set now
     *  (a re-break replaces them) and where the breaker broke them, the
     *  lines (1-based) its last re-break kept a hyphen off, and the part
     *  last re-broken from. */
    let paragraphLines = remainingLines;
    let paragraphBreaks = measured.breaks;
    let guardedEnds: readonly number[] = [];
    let columnEndHyphenPart = -1;
    /** The column width the block was broken for, and the columns of other
     *  widths its later lines were broken for since (EF-157). A text block
     *  that goes on into a column of another width — a one-and-a-half
     *  layout with text in both columns, a styled section with its own
     *  margins — is broken again there: its placed lines stay, the rest is
     *  broken for the new column. Not the loose paragraphs balancing runs
     *  long (placed whole where they were measured), nor a heading the
     *  default opener paints across the page. */
    let brokenForWidth = measureWidth;
    let laterWidths: { fromLine: number; columnWidth: number }[] = [];
    const rebreaksForColumn = !tryLoose && rawBlock.toc === undefined && rawBlock.index === undefined
      && (canSplit || (vdtType === 'heading' && !opensDefaultOpener(rawBlock)));
    /** Measure the block again for the columns it is set in (see
     *  `laterWidths`), with `extra` options. */
    const measureForColumns = (extra: MeasureContentBlockOptions) =>
      measureContentBlock(rawBlock, blockIdx, brokenForWidth, blockMeasureCtx, {
        styleOverride,
        ...(laterWidths.length > 0 ? { restColumnWidths: laterWidths } : {}),
        ...extra,
      });

    // "Keep with next" for colon-introduced lists: a paragraph ending in `:`
    // (or the full-width `：` of Chinese text and its presentation forms `︰`
    // `﹕`, #211) followed directly by a list acts as a lead-in title — the colon-bearing
    // line must share a column with the first list item. Only checked for the
    // original, unsplit paragraph (partIndex === 0) on the iteration that is
    // about to place it.
    const endsWithColon = vdtType === 'paragraph'
      && resolved.bodyText.keepColonWithList
      && nextIsListItem
      && /[:：︰﹕]\s*$/.test(contentBlock.text);

    while (remainingLines.length > 0) {
      enterBand(blockIdx, partIndex);
      const curCol = currentColumn(doc, cursor);
      // The rest of the block goes into a column of another width than the
      // one it was broken for (EF-157): break it again for this one. Up to
      // postext 1.4 it kept the lines of the column it started in, and a
      // line set for the wide column ran past the narrow one (clipped).
      const restWidth = laterWidths.length > 0 ? laterWidths[laterWidths.length - 1]!.columnWidth : brokenForWidth;
      if (rebreaksForColumn && Math.abs(curCol.bbox.width - restWidth) > 0.5) {
        const placed = paragraphLines.length - remainingLines.length;
        if (placed === 0) {
          // Nothing placed yet: the whole block, for this column.
          const again = measureContentBlock(rawBlock, blockIdx, curCol.bbox.width, blockMeasureCtx, { styleOverride });
          if (again && again.measured.lines.length > 0) {
            brokenForWidth = curCol.bbox.width;
            laterWidths = [];
            letterSpacingPx = again.letterSpacingPx;
            remainingLines = [...raggedLooseLines(again.measured.lines, style.textAlign)];
            paragraphLines = remainingLines;
            paragraphBreaks = again.measured.breaks;
            guardedEnds = [];
            columnEndHyphenRetried = false;
            regateCitedFloats(blockIdx, remainingLines);
          }
        } else {
          // The placed lines keep their breaks; the rest is broken for
          // this column. Taken only when the placed lines come out as they
          // were (a break trace from the other measuring path cannot keep
          // them) and with the same tracking.
          const steps = [...laterWidths, { fromLine: placed, columnWidth: curCol.bbox.width }];
          const keepBreaks = paragraphBreaks && paragraphBreaks.at.length >= placed
            ? { path: paragraphBreaks.path, at: paragraphBreaks.at.slice(0, placed) }
            : undefined;
          const again = measureContentBlock(rawBlock, blockIdx, brokenForWidth, blockMeasureCtx, {
            styleOverride, restColumnWidths: steps, ...(keepBreaks ? { keepBreaks } : {}),
          });
          const lines = again && (again.letterSpacingPx ?? 0) === (letterSpacingPx ?? 0)
            ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
            : undefined;
          if (
            lines && lines.length > placed
            && paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated)
          ) {
            laterWidths = steps;
            paragraphLines = lines;
            paragraphBreaks = again!.measured.breaks;
            remainingLines = lines.slice(placed);
            regateCitedFloats(blockIdx, lines);
          }
        }
      }
      const isFirstInColumn = curCol.blocks.length === 0;
      /** Under a page-span opener: where this column's first block goes. A
       *  heading, a display formula or a contents row keeps level with the
       *  first block under the opener; text starts on the grid. */
      const openerHead = isFirstInColumn
        ? openerHeadSpacing(curCol, vdtType === 'heading' || vdtType === 'mathDisplay' || rawBlock.toc !== undefined)
        : undefined;

      // Compute spacing before this block — margin collapsing between
      // consecutive headings: only the larger of marginBottom / marginTop applies
      let spacingBefore = 0;
      /** Column balancing: the levers applied to this placement, stamped
       *  on the block it places (`VDTBlock.balancing`). */
      let balancing: VDTBalancing | undefined;
      if (!isFirstInColumn) {
        spacingBefore = pendingSpacing;
        if (vdtType === 'heading' || vdtType === 'mathDisplay') {
          spacingBefore = Math.max(partIndex === 0 ? pendingBeforeSelfSnapping(blockIdx) : spacingBefore, style.marginTopPx);
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
              balancing = { levers: ['heading'], spaceAbove: extraPx };
            }
          }
        } else if (vdtType === 'listItem') {
          const prevWasList = prevNonMarkerBlock(contentBlocks, blockIdx)?.type === 'listItem';
          if (!prevWasList) {
            spacingBefore = Math.max(spacingBefore, style.marginTopPx);
            // `snapTopToGrid` (EF-103): the space above rounds up so the
            // first item lands on the grid, the margin a minimum. Read from
            // the block's own context, since a part or a styled section may
            // override its lists.
            const listsCfg = blockMeasureCtx.resolved;
            const lists = listKind === 'ordered' ? listsCfg.orderedLists : listsCfg.unorderedLists;
            if (partIndex === 0 && lists.snapTopToGrid) {
              const usedHeight = curCol.bbox.height - curCol.availableHeight;
              const top = Math.ceil((usedHeight + spacingBefore - 0.01) / baselineGrid) * baselineGrid;
              spacingBefore = top - usedHeight;
            }
          }
        } else if (rawBlock.toc || rawBlock.index) {
          // A part row or an unnumbered entry of the contents: its top
          // margin (`toc.parts.marginTop`, the level's `marginTop`) applies
          // like a heading's.
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
        }
        // Column balancing: extra grid lines above a non-heading balance
        // target — the first block after a list end. Heading targets are
        // handled inside the heading branch above (after margin collapsing).
        if (vdtType !== 'heading' && vdtType !== 'mathDisplay' && partIndex === 0) {
          const extraPx = balanceExtraPx?.get(blockIdx);
          if (extraPx) {
            spacingBefore += extraPx;
            addBalanceExtra(curCol, extraPx);
            // The block the lever pushes down follows a list's end, or a
            // display formula / box (the two candidates the gap collector
            // offers a non-heading block that does not open its column).
            const prev = curCol.blocks[curCol.blocks.length - 1];
            const afterList = prev?.type === 'listItem' && prev.containerId === undefined;
            balancing = { levers: [afterList ? 'listEnd' : 'afterDisplay'], spaceAbove: extraPx };
          }
        }
      } else if (openerHead !== undefined) {
        // The head of a column under a page-span opener (EF-139).
        spacingBefore = openerHead;
      } else if (reservedOf(curCol).top > 0) {
        // Column balancing: extra grid lines between the float band at the
        // head of this column and its first block (the after-float lever).
        // A paragraph resuming from the column before is levered on its own
        // fragment, so the room lands under the figure and not back at the
        // paragraph's start. A heading there is a heading lever.
        const extraPx = balanceExtraPx?.get(balanceKey(blockIdx, partIndex));
        if (extraPx) {
          spacingBefore += extraPx;
          addBalanceExtra(curCol, extraPx);
          balancing = { levers: [vdtType === 'heading' ? 'heading' : 'afterFloat'], spaceAbove: extraPx };
        }
      }
      // A loose paragraph's extra line is balancing height too (it lands
      // whole in this column — loose candidates are never split parts).
      const looseTracking = looseOutcome.get(blockIdx);
      if (partIndex === 0 && tryLoose && looseLines !== undefined && typeof looseTracking === 'number') {
        addBalanceExtra(curCol, looseLines * style.lineHeightPx);
        balancing = {
          levers: [...(balancing?.levers ?? []), 'looseParagraph'],
          spaceAbove: balancing?.spaceAbove ?? 0,
          extraLines: looseLines,
          tracking: looseTracking,
        };
      }

      // Footnotes the lines cite take room at the column's foot: the whole
      // block fits when its lines and all their notes do, and a split
      // keeps the lines whose notes fit under them.
      const noteCosts = vdtType === 'mathDisplay' ? undefined : notesPrefixCost(curCol, remainingLines);
      const effectiveAvailable = curCol.availableHeight - spacingBefore - (noteCosts ? noteCosts[noteCosts.length - 1]! : 0);
      // A hair of tolerance: room of exactly N lines (grid arithmetic in
      // floats — a column cut by a band cap, a balancing extra line) must
      // hold N lines, not N - 1.
      let linesPerAvailable = Math.floor((curCol.availableHeight - spacingBefore + 0.01) / style.lineHeightPx);
      if (noteCosts) {
        const costOf = (k: number): number => noteCosts[Math.min(k, noteCosts.length - 1)]!;
        while (linesPerAvailable > 0 && linesPerAvailable * style.lineHeightPx + costOf(linesPerAvailable) > curCol.availableHeight - spacingBefore + 0.01) {
          linesPerAvailable--;
        }
      }
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
      /** The heading's design and the values it is laid out with, kept for
       *  the side-column obstacles once the block is placed (EF-78). */
      let headingDesign: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo } | undefined;
      if (vdtType === 'heading' && headingLevel !== undefined && partIndex === 0 && !hiddenHeading) {
        const lvl = headingLevels.forBlock(rawBlock);
        if (lvl) {
          const pref = numberPrefix ?? '';
          // The lines joined back into the title (EF-162), as the design is
          // painted (`buildHeadersAndFooters`).
          const title = headingTitleText(remainingLines, pref, rawBlock.titleBreaks, rawBlock.text.length, lvl.numberSeparator);
          // Span-page openers lay out across the full content area (both
          // columns); in-column headings use just the column width.
          const pageArea = doc.pages[cursor.pageIndex]!.contentArea;
          const measureWidth = lvl.span === 'page' ? pageArea.width : curCol.bbox.width;
          const info: HeadingPlaceholderInfo = { titleText: title, formattedNumber: pref, numericValue: headingNumber, locale: resolvedLocale(resolved), chapterNumber: chapterNumberByBlock[blockIdx] ?? '', attrs: rawBlock.attrs };
          const design = measureHeadingDesign(
            lvl,
            info,
            measureWidth,
            resolved.page.dpi,
            doc.metadata,
            cursor.pageIndex,
            designFramesOn(doc.pages[cursor.pageIndex]),
            {
              x: lvl.span === 'page' ? pageArea.x : curCol.bbox.x,
              y: curCol.bbox.y + (curCol.bbox.height - curCol.availableHeight) + spacingBefore,
            },
            resourceById,
          );
          if (design.height > effectiveRemainHeight) effectiveRemainHeight = design.height;
          // A text anchored to the foot or the middle of the band keeps the
          // box the design is painted in at least as tall as it needs, so it
          // never rises above the heading's top (EF-176). The box of a
          // heading that snaps holds its margin too.
          const textFloor = design.textFloor - (shouldSnapToGrid ? style.marginBottomPx : 0);
          if (textFloor > effectiveRemainHeight) effectiveRemainHeight = textFloor;
          // The default opener sets the title with the design painter, which
          // can take more lines than the heading's own measure (a justified
          // line whose spaces shrink, a forced break, a run it prints plain):
          // the band holds every line it paints (EF-100).
          if (opensDefaultOpener(rawBlock)) {
            const painted = measureDefaultOpenerHeight(
              lvl,
              resolved.headings.textAlign,
              defaultOpenerTitle(remainingLines, pref, rawBlock.titleBreaks, rawBlock.text.length, lvl.numberSeparator),
              pref,
              pageArea.width,
              resolved.page.dpi,
              doc.metadata,
              cursor.pageIndex,
            );
            if (painted > effectiveRemainHeight) effectiveRemainHeight = painted;
          }
          headingDesign = { lvl, info };
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
        let effectiveGap = Math.max(style.marginBottomPx, nextListMarginTopPx);
        // A list that snaps its top (EF-103) opens on the next grid line.
        const nextLists = blockMeasureCtx.resolved;
        if ((nextListKind === 'ordered' ? nextLists.orderedLists : nextLists.unorderedLists).snapTopToGrid) {
          effectiveGap = Math.ceil((paragraphBottom + effectiveGap - 0.01) / baselineGrid) * baselineGrid - paragraphBottom;
        }
        const minSpaceForList = effectiveGap + bodyStyle.lineHeightPx;
        // A line of room is not always enough (EF-110): with
        // `colonListRoom: 'item'` the first item has to be able to start
        // there, by the rules that split it — a two-line item the orphan
        // and widow rules keep whole needs both. `'line'` keeps the 1.4
        // check, one line.
        if (
          availableAfter < minSpaceForList
          || (resolved.bodyText.colonListRoom === 'item'
            && !firstListItemStarts(blockIdx, availableAfter - effectiveGap, curCol.bbox.width, blockMeasureCtx))
        ) {
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
            stampBlockExtras(blk, rawBlock);
            blk.headingLevel = headingLevel;
            if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; }
            blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
            blk.dirty = false;
            blk.snappedToGrid = false;
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
            blk.sourceMap = absoluteSourceMap;
            blk.plainPrefixLen = prefixLen;
            if (balancing) blk.balancing = balancing;
            placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
            citedLinesPlaced(blockIdx, blk);
            doc.blocks.push(blk);
            remainingLines = remainingLines.slice(splitAt);
            partIndex++;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
            const popped = rollbackHeadings(curCol);
            // Rewind so the for-loop's blockIdx++ lands on the first
            // rolled-back heading (marker blocks in between are replayed).
            blockIdx = (popped[0]!.contentIndex ?? blockIdx - headingRunCount) - 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
          if (headingRunCount === 0) {
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
          // headingRunCount === curCol.blocks.length: fall through to place.
        }
      }

      // Keep a display formula with its lead-in (`math.keepWithLeadIn`,
      // TeX's predisplay penalty, EF-84): when this paragraph — or the part
      // of it left to set — fits the column but the formula after it does
      // not fit under its last line, that line goes on with the formula.
      // The lines left here keep the widow minimum; with fewer, a paragraph
      // that opens here moves on whole, and one already running on from
      // the column before stays (it cannot do better anywhere).
      if (
        resolved.math.keepWithLeadIn
        && vdtType === 'paragraph'
        && contentBlocks[blockIdx + 1]?.type === 'mathDisplay'
        && totalRemainHeight <= effectiveAvailable + FIT_EPS
      ) {
        const formula = measureContentBlock(contentBlocks[blockIdx + 1]!, blockIdx + 1, curCol.bbox.width, blockMeasureCtx);
        const formulaHeight = formula ? (formula.measured.lines[0]?.bbox.height ?? formula.measured.totalHeight) : 0;
        const gap = Math.max(style.marginBottomPx, formula?.kind.style.marginTopPx ?? 0);
        const usedHeight = (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
        // As the plain pass saw it: room balancing added above is not room
        // the formula lost.
        const availableAfter = curCol.bbox.height - (usedHeight + totalRemainHeight) + (balanceExtraInColumn.get(curCol) ?? 0);
        if (formula && formulaHeight > 0 && availableAfter + FIT_EPS < gap + formulaHeight) {
          const minKeep = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
          const splitAt = remainingLines.length - 1;
          if (splitAt >= minKeep) {
            if (spacingBefore !== 0) curCol.availableHeight -= spacingBefore;
            const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
            const splitLines = remainingLines.slice(0, splitAt);
            const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
            applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
            blk.contentIndex = blockIdx;
            stampBlockExtras(blk, rawBlock);
            blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
            blk.dirty = false;
            blk.snappedToGrid = false;
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
            blk.sourceMap = absoluteSourceMap;
            blk.plainPrefixLen = prefixLen;
            if (balancing) blk.balancing = balancing;
            placeBlockInColumn(blk, splitAt * style.lineHeightPx, curCol, cursor);
            citedLinesPlaced(blockIdx, blk);
            doc.blocks.push(blk);
            remainingLines = remainingLines.slice(splitAt);
            partIndex++;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
          if (partIndex === 0 && curCol.blocks.length > 0) {
            // Moving on whole must not strand a heading closing the column.
            const headingRun = trailingHeadingRun(curCol);
            if (resolved.headings.keepWithNext && headingRun > 0 && headingRun < curCol.blocks.length) {
              const rolledBack = rollbackHeadings(curCol);
              if (rolledBack.length > 0) {
                blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
                pendingSpacing = 0;
                advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
                break;
              }
            }
            if (headingRun < curCol.blocks.length) {
              pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
              continue;
            }
          }
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
        // left behind as their own orphans. A run that already opens a
        // full-height (or capped) column stays: it would open the next column
        // the same way and be pushed on again, round after round.
        if (
          vdtType === 'heading'
          && resolved.headings.keepWithNext
          && !nextIsHeading
          && nextBlock !== null
          && (curCol.blocks.length > trailingHeadingRun(curCol) || shortColumn)
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
          // A `:::space` between the heading and its text needs room too.
          const minSpaceAfter = minLinesNeeded * bodyStyle.lineHeightPx
            + spaceLinesAfter(contentBlocks, blockIdx) * baselineGrid;
          if (remainAfterHeading < minSpaceAfter) {
            if (curCol.blocks.length === 0) shortColumnMoves++;
            // Roll back any immediately-preceding heading blocks in this
            // column so they travel with this one.
            const rolledBack = rollbackHeadings(curCol);
            if (rolledBack.length > 0) {
              // Rewind so the for-loop's blockIdx++ lands on the first
              // rolled-back heading (marker blocks in between are replayed).
              blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
              pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
              break;
            }
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
        stampBlockExtras(blk, rawBlock);
        if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; } if (headingNumber !== undefined) blk.headingNumber = headingNumber; }
        if (hiddenHeading) blk.hidden = true;
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
        if (balancing) blk.balancing = balancing;

        let h = effectiveRemainHeight;
        /** What a collapsing container tail still owes the next block,
         *  from the grid line its text snapped to (see `collapseTail`). */
        let tailOwed = 0;
        if (shouldSnapToGrid && partIndex === 0) {
          // Snap using the absolute position in the column so that the block
          // bottom lands on a baseline grid line. This accounts for off-grid
          // starts (e.g. after consecutive unsnapped headings) and bakes in
          // the minimum marginBottom — the grid always wins, but the margin
          // below is guaranteed to be at least marginBottomPx. A collapsing
          // container tail snaps under its text alone and carries the rest.
          const usedHeight = curCol.bbox.height - curCol.availableHeight;
          const naturalBottom = usedHeight + effectiveRemainHeight + (collapseTail ? 0 : style.marginBottomPx);
          // Tolerance guards against FP drift: if naturalBottom is already on
          // the grid (e.g. marginBottom is an exact multiple of baselineGrid),
          // don't round up to the next line.
          const snappedBottom = Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid;
          // A negative margin below a container tail may snap the flow back
          // above the text's own bottom; never below the block's top.
          h = Math.max(0, snappedBottom - usedHeight);
          if (collapseTail) tailOwed = style.marginBottomPx - (snappedBottom - (usedHeight + effectiveRemainHeight));
        }
        // A design that ends within a line of the column's foot fits, but
        // its margin and grid snap would carry the block past the foot: it
        // takes the rest of the column instead, as a design reaching past
        // the foot does (the text after it opens the next column or page).
        if (vdtType === 'heading' && effectiveRemainHeight > totalRemainHeight && h > curCol.availableHeight) {
          h = Math.max(effectiveRemainHeight, curCol.availableHeight);
        }
        placeBlockInColumn(blk, h, curCol, cursor);
        citedLinesPlaced(blockIdx, blk);
        finalizeListItem(blk, partIndex === 0);
        doc.blocks.push(blk);
        // Page-spanning heading: reserve its band in every other column.
        if (vdtType === 'heading' && headingLevel !== undefined) {
          const lvl = headingLevels.forBlock(rawBlock);
          if (lvl?.span === 'page') {
            reserveOpenerBand(
              curCol, h, blk,
              shouldSnapToGrid && partIndex === 0 ? 0 : style.marginBottomPx,
              lvl.snapToGrid ?? resolved.headings.snapToGrid,
            );
          }
        }
        // Its design's elements in the side column hold the side stack off.
        if (headingDesign) markSideObstacles(blk, headingDesign);
        // For snapped headings/list-tails the margin is baked into the snap;
        // for unsnapped ones (consecutive) track it for collapsing
        if (vdtType === 'listItem' && nextIsListItem) {
          pendingSpacing = itemGapPx(listBullet!);
        } else {
          pendingSpacing = (shouldSnapToGrid && partIndex === 0) ? 0 : style.marginBottomPx;
          // A collapsing container tail: the space the snap did not cover,
          // in whole grid lines, merges with the next block's own space
          // above (a heading's margin collapses with the exact rest).
          if (collapseTail && shouldSnapToGrid && partIndex === 0 && tailOwed > 0.01) {
            pendingSpacing = Math.ceil((tailOwed - 0.01) / baselineGrid) * baselineGrid;
            inlineGapOwed = { afterIdx: blockIdx, pending: pendingSpacing, exact: tailOwed, container: true };
          }
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
        let choice = chooseParagraphSplit(remainingLines.length, linesPerAvailable, {
          avoidOrphans: effectiveAvoidOrphans,
          orphanMinLines: resolved.bodyText.orphanMinLines,
          orphanPenalty: resolved.bodyText.orphanPenalty,
          avoidWidows: effectiveAvoidWidows,
          widowMinLines: resolved.bodyText.widowMinLines,
          widowPenalty: resolved.bodyText.widowPenalty,
          slackWeight: resolved.bodyText.slackWeight,
        });
        // The block sits right under a heading: pushing it whole would
        // strand the heading. Keep the most lines that fit under it — at
        // least the widow minimum — that also leave the orphan minimum for
        // the next column (`headings.keepWithNextSplit: 'rules'`, EF-185;
        // `'fill'`, postext 1.4's rule, keeps as many as fit, however few
        // go on). With no such split the heading moves along with the block
        // (the no-fit branch below rolls it back).
        const headingRun = partIndex === 0 ? trailingHeadingRun(curCol) : 0;
        if (choice.splitAt === 0 && headingRun > 0 && headingRun < curCol.blocks.length) {
          const minKeep = effectiveAvoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
          const minTail = effectiveAvoidOrphans && resolved.headings.keepWithNextSplit === 'rules'
            ? Math.max(1, resolved.bodyText.orphanMinLines)
            : 1;
          let keep = Math.min(linesPerAvailable, remainingLines.length);
          while (keep >= minKeep && keep < remainingLines.length && remainingLines.length - keep < minTail) keep--;
          if (keep >= minKeep) choice = { splitAt: keep, demerit: choice.demerit };
        }
        // An empty column the block cannot leave (a full-height one, or a
        // short one once the moves below are spent) holds as many lines as
        // it can: a paragraph never runs past its column's foot, whatever
        // the orphan and widow rules would rather do (EF-97). Not a column
        // a band cap cut short: there the block runs past the cut, and the
        // driver takes the cut lower, or drops it, so the rules still hold
        // (under a figure heading such a column it moves on instead, see
        // `capShortUnderFloat` below).
        if (choice.splitAt === 0 && curCol.blocks.length === 0 && !shortColumn && !uncappedBottoms.has(curCol)) {
          const maxFit = Math.min(linesPerAvailable, remainingLines.length - 1);
          if (maxFit >= 1) choice = { splitAt: maxFit, demerit: choice.demerit };
        }
        // `bodyText.hyphenateAcrossColumns: false` (EF-86): the lines that
        // close a column must not end on a hyphen. Those are the line that
        // closes this column and the lines later full columns would end on.
        // When one of them ends on a hyphen, the paragraph is broken again,
        // once, with a hyphen at each of them priced out of the breaker; the
        // placement then starts over with its lines. Only a paragraph set
        // from its first line here — its earlier lines are not placed yet —
        // and never one the balancing is running long.
        if (
          choice.splitAt > 0
          && !resolved.bodyText.hyphenateAcrossColumns
          && !columnEndHyphenRetried
          && partIndex === 0
          && looseLines === undefined
        ) {
          const fullColumn = Math.max(1, Math.floor((contentArea.height + 0.01) / style.lineHeightPx));
          const ends: number[] = [];
          for (let n = choice.splitAt; n < remainingLines.length; n += fullColumn) ends.push(n);
          /** How a setting ends its guarded lines: whether this column's
           *  last line is hyphenated, and how many guarded lines are. */
          const columnEndHyphens = (lines: readonly VDTLine[]) => ({
            first: lines[choice.splitAt - 1]?.hyphenated === true,
            count: ends.filter((n) => lines[n - 1]?.hyphenated).length,
          });
          const natural = columnEndHyphens(remainingLines);
          columnEndHyphenRetried = natural.count > 0;
          const again = natural.count > 0
            ? measureForColumns({ avoidHyphenAtLines: ends })
            : undefined;
          // The re-break is kept when it hyphenates fewer guarded lines. The
          // line closing this column counts first: it is the one certain
          // break, while the later ends assume full columns follow.
          const retried = again && again.measured.lines.length > 0 ? columnEndHyphens(again.measured.lines) : undefined;
          if (
            again
            && retried
            && (again.letterSpacingPx ?? 0) === (letterSpacingPx ?? 0)
            && (natural.first !== retried.first ? natural.first : retried.count < natural.count)
          ) {
            remainingLines = [...raggedLooseLines(again.measured.lines, style.textAlign)];
            paragraphLines = remainingLines;
            paragraphBreaks = again.measured.breaks;
            guardedEnds = ends;
            columnEndHyphenPart = 0;
            gateCitedFloats(blockIdx, remainingLines);
            // The pass over this column starts again: the balancing room it
            // recorded above is recorded again then.
            if (balancing && balancing.spaceAbove > 0) {
              balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - balancing.spaceAbove);
            }
            continue;
          }
        }
        // …and again from a later part: the first re-break assumed full
        // columns after this one, and a column that ends elsewhere (a widow
        // kept, a float, a shorter page) can still end on a hyphen. The
        // paragraph is broken again with that end guarded too, the lines
        // already placed kept at their breaks (only the rest is broken
        // again), and the new setting is taken when it puts no hyphen at
        // this column's end (or fewer at the ends still to come). The
        // placed lines are checked again all the same: a break trace from
        // the other measuring path cannot keep them.
        if (
          choice.splitAt > 0
          && !resolved.bodyText.hyphenateAcrossColumns
          && partIndex > 0
          && columnEndHyphenPart !== partIndex
          && looseLines === undefined
          && remainingLines[choice.splitAt - 1]?.hyphenated === true
        ) {
          columnEndHyphenPart = partIndex;
          const placed = paragraphLines.length - remainingLines.length;
          const fullColumn = Math.max(1, Math.floor((contentArea.height + 0.01) / style.lineHeightPx));
          const later: number[] = [];
          for (let n = choice.splitAt; n < remainingLines.length; n += fullColumn) later.push(placed + n);
          // The ends already placed keep their guard; the later ones the
          // last re-break assumed give way to where the columns now end.
          const ends = [...guardedEnds.filter((n) => n <= placed), ...later];
          const hyphenatedEnds = (lines: readonly VDTLine[]): number => later.filter((n) => lines[n - 1]?.hyphenated).length;
          const keepBreaks = paragraphBreaks && paragraphBreaks.at.length >= placed
            ? { path: paragraphBreaks.path, at: paragraphBreaks.at.slice(0, placed) }
            : undefined;
          const again = measureForColumns({ avoidHyphenAtLines: ends, ...(keepBreaks ? { keepBreaks } : {}) });
          const lines = again && (again.letterSpacingPx ?? 0) === (letterSpacingPx ?? 0)
            ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
            : undefined;
          const keepsPlaced = lines !== undefined && lines.length > placed
            && paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated);
          if (
            lines
            && keepsPlaced
            && (lines[placed + choice.splitAt - 1]?.hyphenated !== true
              || hyphenatedEnds(lines) < hyphenatedEnds(paragraphLines))
          ) {
            paragraphLines = lines;
            paragraphBreaks = again!.measured.breaks;
            guardedEnds = ends;
            remainingLines = lines.slice(placed);
            regateCitedFloats(blockIdx, lines);
            if (balancing && balancing.spaceAbove > 0) {
              balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - balancing.spaceAbove);
            }
            continue;
          }
        }
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
          stampBlockExtras(blk, rawBlock);
          if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; } if (headingNumber !== undefined) blk.headingNumber = headingNumber; }
          blk.lines = resetLinePositions(splitLines, style.lineHeightPx);
          blk.dirty = false;
          blk.snappedToGrid = false;
          if (splitLines.length > 0) {
            blk.sourceStart = splitLines[0]!.sourceStart;
            blk.sourceEnd = splitLines[splitLines.length - 1]!.sourceEnd;
          }
          blk.sourceMap = absoluteSourceMap;
          blk.plainPrefixLen = prefixLen;
          if (balancing) blk.balancing = balancing;

          const splitHeight = choice.splitAt * style.lineHeightPx;
          placeBlockInColumn(blk, splitHeight, curCol, cursor);
          citedLinesPlaced(blockIdx, blk);
          finalizeListItem(blk, partIndex === 0);
          doc.blocks.push(blk);

          remainingLines = remainingLines.slice(choice.splitAt);
          partIndex++;
          pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
          continue;
        }
        // choice.splitAt === 0: fall through to push whole paragraph to next column
      }

      // An empty column a band cap cut, under a figure at its head: a block
      // that cannot start there — none of its lines stays, by the rules
      // that split it — goes on to the next column of the band, as it does
      // from such a column uncapped. Forced into it, it ran past the cut,
      // and the cut was taken where it ended, however low (EF-116: the
      // columns beside it then ended far above the box under them).
      const capShortUnderFloat = curCol.blocks.length === 0
        && uncappedBottoms.has(curCol)
        && reservedOf(curCol).top > 0
        && (() => {
          const cols = bandColumns(doc.pages[cursor.pageIndex]!, currentBand(doc.pages[cursor.pageIndex]!, cursor));
          const at = cols.indexOf(curCol);
          return at >= 0 && at < cols.length - 1;
        })();

      // Cannot split — advance to next column if current has content (or
      // the column is a short band that cannot hold the block at all). A
      // block that can split moves on from a short band however tall it is:
      // the next, taller column breaks it by the rules (EF-97).
      if (curCol.blocks.length > 0 || capShortUnderFloat || (shortColumn && (effectiveRemainHeight <= contentArea.height || canSplit))) {
        if (curCol.blocks.length === 0) shortColumnMoves++;
        // Heading keep-with-next (no-fit variant): when a block can't fit
        // in the current column — a heading, or any block moving on whole
        // (fewer lines than the widow minimum would stay) — and the
        // column's tail is a run of headings, pull those headings along so
        // they don't remain stranded at the column's bottom. Mirrors the
        // rollback inside the "fits" path. A block leaving a column that
        // holds nothing but headings stays put instead (rolling back would
        // loop): the headings then open the next column with it. The same
        // holds for a heading leaving a full-height (or capped) column that
        // holds nothing but headings: the run would open the next column
        // just as it opens this one and fail the same way — a `breakBefore`
        // heading in it would even open a fresh page every round, forever.
        // Only a short column (under a float, a page-span box) lets the run
        // move on to a taller one.
        const headingRun = trailingHeadingRun(curCol);
        const runFillsColumn = headingRun > 0 && headingRun === curCol.blocks.length;
        const strands = partIndex === 0 && vdtType !== 'heading'
          && headingRun > 0 && !runFillsColumn;
        const pullsRun = vdtType === 'heading' && (!runFillsColumn || shortColumn);
        if (resolved.headings.keepWithNext && (pullsRun || strands)) {
          const rolledBack = rollbackHeadings(curCol);
          if (rolledBack.length > 0) {
            blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
            pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
        }
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column with less than a line of room (a band cap cutting right
      // under a float band, a column swallowed by reservations): nothing can
      // go here — move on. The next column, or a fresh page, has room.
      if (curCol.availableHeight < style.lineHeightPx - 0.01 && totalRemainHeight > curCol.availableHeight + 0.01) {
        pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, geomResolved, contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
      blk.contentIndex = blockIdx;
      stampBlockExtras(blk, rawBlock);
      // Stamp the prefix as the other placement branches do: a full-page
      // opener lands here, and paint and running heads read its
      // `{chapterNumber}` from `numberPrefix`, as the measure did (EF-59).
      if (partIndex === 0) { blk.headingLevel = headingLevel; if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; } if (headingNumber !== undefined) blk.headingNumber = headingNumber; }
      if (hiddenHeading) blk.hidden = true;
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
      if (balancing) blk.balancing = balancing;

      // A heading whose design (or `minHeight`) reaches past the column's
      // foot — a full-page cover, say — claims the rest of its column, and
      // of the page when it spans it: the next block opens the next column
      // or page instead of running on under (or beside) the design. Its
      // block runs down to the column's foot (EF-91), so the design is laid
      // out against the band it claims — elements anchored to the band's
      // middle or foot, or filling it, keep to that band, as they do when
      // the reservation fits — rather than against the height of its text.
      const claimsColumn = vdtType === 'heading' && effectiveRemainHeight > totalRemainHeight;
      const placedHeight = claimsColumn
        ? Math.max(totalRemainHeight, Math.min(effectiveRemainHeight, curCol.availableHeight))
        : totalRemainHeight;
      placeBlockInColumn(blk, placedHeight, curCol, cursor);
      citedLinesPlaced(blockIdx, blk);
      finalizeListItem(blk, partIndex === 0);
      doc.blocks.push(blk);
      if (claimsColumn) {
        curCol.availableHeight = 0;
        if (headingLevels.forBlock(rawBlock)?.span === 'page') reserveOpenerBand(curCol, effectiveRemainHeight, blk, style.marginBottomPx);
      }
      if (headingDesign) markSideObstacles(blk, headingDesign);
      if (vdtType === 'listItem') {
        pendingSpacing = nextIsListItem ? itemGapPx(listBullet!) : style.marginBottomPx;
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
  // The notes, in the room the flow reserved for them.
  reserveLeftoverNotes();
  setColumnNotes();
  // After the chapter (`chapterEnd`), the notes that close a column drop
  // to its foot: the room left over stays between the text and them.
  if (chapterEndNotes && resolved.footnotes.chapterEndAlign === 'foot') dropChapterEndNotes();
  if (chapterEndNotes) ruleChapterEndNotes();

  // A band that is still cut at the end of the pass (a trailing cap: the
  // closing band of a chapter or of the document) must hold what it took,
  // under the same rules as an uncut one. Two ways a cut too low breaks
  // them, and in both the cap is not delivered, so the driver grows it a
  // line (or drops it and keeps the uncut layout):
  //  - a block that cannot split across the cut — a paragraph tail the
  //    orphan and widow minimums keep whole, a keep-together box — is
  //    force-placed into an empty capped column and runs past its foot; the
  //    renderers clip the column to its box, so its last lines would never
  //    be painted (EF-55, EF-72). What counts is what is painted: a list
  //    tail's box bakes its bottom margin in and may reach past the cut
  //    with every line inside it;
  //  - a keep-with-next heading opening an empty capped column stays there
  //    (a column-opening heading is never pushed on) while its text goes to
  //    the next column of the band: the heading closes its column (EF-61).
  const capStrandsHeading = (cols: readonly VDTColumn[]): boolean => {
    if (!resolved.headings.keepWithNext) return false;
    return cols.some((c, i) => {
      const last = c.blocks[c.blocks.length - 1];
      return c.bandCapped && last !== undefined && isFreeHeading(last) && !last.hidden
        && cols.slice(i + 1).some((next) => next.blocks.length > 0);
    });
  };
  for (const [capIndex, cols] of cappedBandColumns) {
    if (!spanPlacedInBand.has(capIndex)) continue;
    if (capClipsLines(cols) || capStrandsHeading(cols)) spanPlacedInBand.delete(capIndex);
  }

  // A styled section's pages draw the column rule of its own layout where
  // that differs from the document's (EF-112); the renderers take the
  // document's on every other page.
  const docRule = resolved.layout.columnRule;
  const docRuleWidthPx = dimensionToPx(docRule.lineWidth, dpi);
  for (const page of doc.pages) {
    const layout = pageLayoutOf(page);
    if (!layout || layout === resolved.layout || page.partInfo) continue;
    const rule = layout.columnRule;
    const lineWidthPx = dimensionToPx(rule.lineWidth, dpi);
    const same = rule.enabled === docRule.enabled
      && (!rule.enabled || (rule.color.hex === docRule.color.hex && lineWidthPx === docRuleWidthPx));
    if (!same) page.columnRule = { enabled: rule.enabled, color: rule.color.hex, lineWidthPx };
  }

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
  const restarts = pageNumberSegments
    .filter((s, i) => i > 0 && s.startAt !== undefined && s.startPageIndex < doc.pages.length)
    .map((s) => s.startPageIndex);
  if (restarts.length > 0) doc.pageNumberRestarts = restarts;

  buildHeadersAndFooters(doc, resourceById, {
    // Where two palette entries share a base value, each kind of flow
    // colour follows its own settings under a part or section palette.
    // (The default resource types set no caption style of their own.)
    flowColorValues: (overrides) => flowColorValues(config, overrides, config?.resourceTypes),
    // `{firstMark.<style>}` / `{lastMark.<style>}`: a paragraph of a
    // `:::paragraphs` container marks the page with its leading bold run.
    paragraphMark: (idx) => {
      const styleId = paragraphContainers.byBlock[idx]?.styleId;
      const block = contentBlocks[idx];
      if (styleId === undefined || block?.type !== 'paragraph') return undefined;
      const text = leadingBoldText(block.spans);
      return text.length > 0 ? { styleId, text } : undefined;
    },
  });

  // Vertical pages: the axis each font's upright characters turn about.
  if (doc.pages.some((p) => p.flow)) stampCentralBaselines(doc);

  doc.converged = true;
  doc.iterationCount = 1;

  return { doc, forcedBreakPages, bandCapProposals, spanPlacedInBand, bandCapsApplied, looseOutcome, captionUnderProposals };
}

/** Passes a document printing its own contents gets at most, beyond the
 *  first, for the page labels it prints to settle. */
const MAX_TOC_ROUNDS = 3;

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): VDTDocument {
  return drainPasses(buildDocumentGen(content, config, cache, options));
}

/** Let the event loop turn: `scheduler.yield()` where it exists, else a
 *  message-channel hop (a `setTimeout(0)` is clamped to 4 ms once nested). */
export function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * {@link buildDocument}, yielding to the event loop between placement
 * passes. A build is several passes (band caps, column balancing, contents
 * rounds), each a synchronous re-placement of the document; in a worker
 * this lets a `cancel` posted mid-build be observed at the next pass
 * boundary — `shouldCancel` is polled there as well as inside a pass —
 * instead of after the whole build.
 */
export async function buildDocumentAsync(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions & { yieldBetweenPasses?: () => Promise<void> },
): Promise<VDTDocument> {
  const gen = buildDocumentGen(content, config, cache, options);
  const pause = options?.yieldBetweenPasses ?? yieldToEventLoop;
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
    await pause();
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
  }
}

/** The build as a generator: one `yield` after every placement pass. */
export function* buildDocumentGen(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): Generator<void, VDTDocument, void> {
  const doc = yield* buildDocumentRounds(content, config, cache, options);
  // References and markup the source names wrongly: read from the source
  // once, located on the pages of the finished layout. Kept apart from
  // `doc.warnings`, whose entries keep their postext 1.4 shape.
  const found = [...collectContentWarnings(content.markdown, config, content.resources ?? []), ...(indexWarnings.get(doc) ?? [])];
  const located = found.length > 0 ? locateContentWarnings(doc, found) : [];
  // Justified CJK lines the composer could not fill within its tracking cap.
  const loose = cjkLooseLineWarnings(doc);
  // Chinese marks placed where the lines are painted (#193), and the
  // paragraphs whose leading is too tight for their marks or readings.
  const annotations = annotateDocument(doc, doc.config?.cjk);
  if (located.length > 0 || loose.length > 0 || annotations.length > 0) doc.contentWarnings = [...located, ...loose, ...annotations];
  // Config values the build replaced (an unknown number format, a font
  // stack, a side column no column width can take): walked once per build,
  // not per pass — they belong to no page.
  const configWarnings = collectConfigWarnings(config);
  if (configWarnings.length > 0) doc.configWarnings = configWarnings;
  return doc;
}

/** Warnings the last pass's `:::index` raised, per document (read with
 *  the content warnings once the build is done). */
const indexWarnings = new WeakMap<VDTDocument, ContentWarning[]>();

/** `doc` with the page of each of its index marks (`doc.indexMarks`). */
function withIndexMarks(doc: VDTDocument, content: PostextContent): VDTDocument {
  if (!content.markdown.includes(':index')) return doc;
  const { content: body, contentOffset } = extractFrontmatter(content.markdown);
  const marks = locateIndexMarks(doc, parseMarkdownMemo(body), contentOffset);
  if (marks) doc.indexMarks = marks;
  return doc;
}

/** {@link buildDocumentGen} before the document-wide warnings: the
 *  contents rounds around the balanced build. */
function* buildDocumentRounds(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): Generator<void, VDTDocument, void> {
  // A document printing its own table of contents (`:::toc` with no
  // host-supplied outline) is laid out with the page labels of the previous
  // build until they no longer change: the contents' own length moves what
  // follows, and a numbering restart after the front matter usually settles
  // it in one extra round.
  if (content.outline === undefined) {
    const parsed = parseMarkdownMemo(extractFrontmatter(content.markdown).content);
    if (hasTocDirective(parsed) || hasIndexDirective(parsed)) {
      let outline = computeOutline(parsed, resolveAllConfig(config), content.continuation?.headings);
      let doc = withIndexMarks(yield* buildDocumentBalanced({ ...content, outline }, config, cache, options, 0), content);
      for (let round = 0; round < MAX_TOC_ROUNDS; round++) {
        const after = outlineFromDoc(doc, outline);
        if (sameOutline(after, outline)) break;
        outline = after;
        doc = withIndexMarks(yield* buildDocumentBalanced({ ...content, outline }, config, cache, options, round + 1), content);
      }
      return doc;
    }
  }
  return withIndexMarks(yield* buildDocumentBalanced(content, config, cache, options), content);
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function* buildDocumentBalanced(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
  tocRound = 0,
): Generator<void, VDTDocument, void> {
  // Each pass reports its own progress, numbered in build order.
  let passIndex = 0;
  const onProgress = options?.onProgress;
  const onPass = options?.onPass;
  const passOptions: BuildDocumentOptions | undefined = onProgress
    ? { ...options, onProgress: (p) => onProgress({ ...p, pass: passIndex }) }
    : options;
  // Side captions moved under their figure (see `PassHints.captionUnder`):
  // once a pass asks for one, every later pass keeps it.
  const captionUnder = new Set<string>();
  const runPass = (hints?: PassHints): PassResult => {
    passIndex++;
    const started = onPass ? now() : 0;
    const result = buildDocumentPass(content, config, cache, passOptions, { ...hints, captionUnder });
    for (const id of result.captionUnderProposals) captionUnder.add(id);
    onPass?.({ pass: passIndex, tocRound, ms: now() - started, pages: result.doc.pages.length });
    return result;
  };
  // The first pass is a pass too: let a cancel land before the caps run.
  let initial = runPass();
  yield;
  // A side box or side float spilled over a figure's side caption: place
  // again with that caption under the figure (a moved caption can free or
  // crowd another side column, hence the short loop).
  for (let round = 0; round < 3 && initial.captionUnderProposals.size > 0; round++) {
    const before = captionUnder.size;
    initial = runPass();
    yield;
    if (captionUnder.size === before) break;
  }

  // --- Band caps (page-span blocks mid-page) -----------------------------
  // A span block that arrived in an uneven band proposes a cap; the driver
  // re-places the document with it (and grows / drops caps whose band
  // overflowed) before balancing runs. Documents without such blocks get
  // their first pass back untouched — no extra pass.
  const bands = yield* resolveBandCapsGen(initial, (bandCaps) => runPass({ bandCaps }));
  let best = bands.result;
  const bandCaps = bands.bandCaps;
  let passCount = bands.passCount;
  best.doc.iterationCount = passCount;

  // --- Column balancing (vertical justification) ------------------------
  // Iteratively re-place the document with extra grid lines above headings
  // (and the other levers) until every balanceable column ends flush with
  // the page bottom, or no further adjustment is possible. Each retry
  // recomputes the remaining gaps on the freshly placed document, so
  // split / keep-with-next decisions that shift under the new spacing are
  // accounted for. The best layout (fewest leftover gap lines) always wins
  // — a retry that regresses is discarded.
  //
  // The pages between explicit breaks (chapter openers, `:::pagebreak`)
  // are laid out independently of one another — nothing flows across such
  // a break, so a lever inside one run of pages cannot move a line of any
  // other. The loop therefore judges every run (a *segment*, see
  // `pageSegments`) on its own: a pass places the whole document, but each
  // segment keeps or rejects its share of the levers by its own score,
  // blacklists its own cascades, plateaus on its own and spends its own
  // budget of attempts; a rejected segment gets its pages back from the
  // best pass it had (`spliceSegments`). A book of thirty chapters thus
  // balances exactly as its chapters would one by one, instead of one
  // cascade anywhere costing every page of the book a pass.
  const balancing = best.doc.config.headings.balancing;
  if (!balancing.enabled) return best.doc;

  interface Segment {
    range: PageRange;
    /** Fewest empty grid lines seen over its columns. */
    bestScore: number;
    /** Passes in which the segment tried new levers. */
    attempts: number;
    /** Nothing more to do: flush, out of levers, plateaued or out of attempts. */
    done: boolean;
    /** Flush, or no lever left to propose (the loop's notion of converged). */
    stable: boolean;
    failedLoose: Set<number>;
    failedLines: Set<number>;
  }

  /** Levers accepted so far, over every segment (keyed by content index /
   *  `balanceKey`; each key belongs to exactly one segment). */
  const applied = { lines: new Map<number, number>(), loose: new Map<number, number>() };
  let segments: Segment[] = [];
  /** (Re)derive the segments of the current best layout, keeping the
   *  attempts and blacklists of the segment at the same position. */
  const resetSegments = (): void => {
    const gaps = collectColumnGaps(best.doc, best.forcedBreakPages);
    const prev = segments;
    segments = pageSegments(best.doc.pages.length, best.forcedBreakPages).map((range, i) => {
      const score = gapLinesIn(gaps, range);
      const old = prev[i];
      return {
        range,
        bestScore: score,
        attempts: old?.attempts ?? 0,
        done: score === 0 && boxRoomIn(gaps, range) <= BOX_ROOM_EPS_PX,
        stable: score === 0,
        failedLoose: old?.failedLoose ?? new Set<number>(),
        failedLines: old?.failedLines ?? new Set<number>(),
      };
    });
  };

  const hintsFrom = (
    lines: ReadonlyMap<number, number>,
    loose: ReadonlyMap<number, number>,
    looseBudget?: ReadonlyMap<number, LooseBudget>,
  ): PassHints => {
    const extraPx = new Map<number, number>();
    for (const [idx, n] of lines) if (n > 0) extraPx.set(idx, n * best.doc.baselineGrid);
    return {
      balanceExtraPx: extraPx,
      balanceLooseness: loose,
      ...(looseBudget ? { balanceLooseBudget: looseBudget } : {}),
      bandCaps,
    };
  };

  const segmentAt = (pageIndex: number): number =>
    segments.findIndex((s) => pageIndex >= s.range.from && pageIndex <= s.range.to);
  /** Segment owning each lever key of the current best layout. */
  const keyOwners = (gaps: readonly ColumnGap[]): Map<number, number> => {
    const owner = new Map<number, number>();
    for (const g of gaps) {
      const si = segmentAt(g.pageIndex);
      if (si < 0) continue;
      for (const c of g.candidates) owner.set(balanceKey(c.contentIndex, c.part ?? 0), si);
    }
    return owner;
  };
  /** First page each content index was placed on. */
  const pageOfContent = (doc: VDTDocument): Map<number, number> => {
    const m = new Map<number, number>();
    for (const b of doc.blocks) {
      if (b.contentIndex !== undefined && b.pageIndex !== undefined && !m.has(b.contentIndex)) m.set(b.contentIndex, b.pageIndex);
    }
    return m;
  };
  const inRange = (r: PageRange, p: number | undefined): boolean => p !== undefined && p >= r.from && p <= r.to;

  /** Whether the explicit breaks before / around a segment fell on the same
   *  pages in `next` as in the best layout — the segment's pages then line
   *  up and can be compared or spliced. `before` checks only the pages
   *  ahead of it (an earlier segment's cascade shifts everything after). */
  const breaksMatch = (next: PassResult, upTo: number): boolean => {
    for (let p = 0; p < upTo; p++) {
      if (best.forcedBreakPages.has(p) !== next.forcedBreakPages.has(p)) return false;
    }
    return true;
  };
  const startIntact = (next: PassResult, s: Segment): boolean => breaksMatch(next, s.range.from);
  const wholeIntact = (next: PassResult, s: Segment, last: boolean): boolean => {
    if (!breaksMatch(next, s.range.to + 1)) return false;
    if (next.doc.pages.length <= s.range.to) return false;
    return !last || next.doc.pages.length === best.doc.pages.length;
  };

  /**
   * The best layout with the pages of `ranges` taken from `next` (whose
   * breaks line up with it there): pages, the blocks and warnings on them,
   * and the pass report entries whose block sits on them.
   */
  const spliceSegments = (next: PassResult, ranges: readonly PageRange[]): PassResult => {
    const taken = (p: number | undefined): boolean => ranges.some((r) => inRange(r, p));
    const pages = best.doc.pages.map((pg, i) => (taken(i) ? next.doc.pages[i]! : pg));
    const blocks = [
      ...best.doc.blocks.filter((b) => !taken(b.pageIndex)),
      ...next.doc.blocks.filter((b) => taken(b.pageIndex)),
    ].sort((a, b) => (a.pageIndex ?? -1) - (b.pageIndex ?? -1));
    const warnings = [
      ...(best.doc.warnings ?? []).filter((w) => !taken(w.pageIndex)),
      ...(next.doc.warnings ?? []).filter((w) => taken(w.pageIndex)),
    ].sort((a, b) => (a.pageIndex ?? -1) - (b.pageIndex ?? -1));
    const doc: VDTDocument = { ...best.doc, pages, blocks, ...(warnings.length > 0 ? { warnings } : { warnings: undefined }) };
    const pageBest = pageOfContent(best.doc);
    const pageNext = pageOfContent(next.doc);
    const mergeMap = <V,>(a: ReadonlyMap<number, V>, b: ReadonlyMap<number, V>): Map<number, V> => {
      const out = new Map<number, V>();
      for (const [k, v] of a) if (!taken(pageBest.get(k))) out.set(k, v);
      for (const [k, v] of b) if (taken(pageNext.get(k))) out.set(k, v);
      return out;
    };
    const mergeSet = (a: ReadonlySet<number>, b: ReadonlySet<number>): Set<number> => {
      const out = new Set<number>();
      for (const k of a) if (!taken(pageBest.get(k))) out.add(k);
      for (const k of b) if (taken(pageNext.get(k))) out.add(k);
      return out;
    };
    return {
      doc,
      forcedBreakPages: best.forcedBreakPages,
      bandCapProposals: mergeMap(best.bandCapProposals, next.bandCapProposals),
      spanPlacedInBand: mergeSet(best.spanPlacedInBand, next.spanPlacedInBand),
      bandCapsApplied: mergeSet(best.bandCapsApplied, next.bandCapsApplied),
      looseOutcome: mergeMap(best.looseOutcome, next.looseOutcome),
      captionUnderProposals: new Set([...best.captionUnderProposals, ...next.captionUnderProposals]),
    };
  };

  /**
   * A rejected segment moved content across a column break somewhere in
   * its pages (a split paragraph whose head no longer fits, a float that
   * lost its slot, a lead-in that left with its list…): the pages after
   * that point re-flow, gaps open elsewhere and a span cap may miss its
   * band. The levers are meant to be local, so contain the damage: find
   * the first column of the segment whose content changed and blacklist
   * the levers this pass newly applied there (failing that, on its page;
   * failing that, in the whole segment), so the next proposal keeps the
   * working levers before it and tries again without the one that
   * cascaded. Returns whether anything was blacklisted.
   */
  const containCascade = (
    next: PassResult,
    s: Segment,
    newLines: readonly number[],
    newLoose: readonly number[],
    gaps: readonly ColumnGap[],
  ): boolean => {
    const div = firstDivergentColumn(best.doc, next.doc, s.range);
    if (!div) return false;
    if (newLines.length === 0 && newLoose.length === 0) return false;
    const blacklist = (cands: ReadonlySet<number> | null): boolean => {
      let hit = false;
      for (const k of newLines) if (!cands || cands.has(k)) { s.failedLines.add(k); hit = true; }
      for (const k of newLoose) if (!cands || cands.has(k)) { s.failedLoose.add(k); hit = true; }
      return hit;
    };
    const keysOf = (pick: (g: ColumnGap) => boolean): Set<number> =>
      new Set(gaps.filter(pick).flatMap((g) => g.candidates.map((c) => balanceKey(c.contentIndex, c.part ?? 0))));
    if (blacklist(keysOf((g) => g.pageIndex === div.pageIndex && g.columnIndex === div.columnIndex))) return true;
    if (blacklist(keysOf((g) => g.pageIndex === div.pageIndex))) return true;
    return blacklist(null);
  };

  let balancingPasses = 0;
  function* balance(): Generator<void, void, void> {
    while (balancingPasses < MAX_BALANCING_PASSES_PER_DOCUMENT) {
      const active = segments.filter((s) => !s.done);
      if (active.length === 0) break;
      const gaps = collectColumnGaps(best.doc, best.forcedBreakPages);
      const owner = keyOwners(gaps);
      const failedLoose = new Set<number>();
      const failedLines = new Set<number>();
      for (const s of segments) {
        for (const k of s.failedLoose) failedLoose.add(k);
        for (const k of s.failedLines) failedLines.add(k);
      }
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
        closingBox: balancing.closingBox,
      });
      // The levers newly proposed, by segment; those of a segment that is
      // done (plateaued, out of attempts) are withdrawn from the pass.
      const newLines: number[] = [];
      const newLoose: number[] = [];
      for (const [k, n] of proposal.lines) {
        const cur = applied.lines.get(k) ?? 0;
        if (n <= cur) continue;
        const si = owner.get(k);
        if (si === undefined || segments[si]!.done) {
          if (cur > 0) proposal.lines.set(k, cur);
          else proposal.lines.delete(k);
          continue;
        }
        newLines.push(k);
      }
      for (const k of [...proposal.loose.keys()]) {
        if (applied.loose.has(k)) continue;
        const si = owner.get(k);
        if (si === undefined || segments[si]!.done) {
          proposal.loose.delete(k);
          proposal.looseBudget.delete(k);
          continue;
        }
        newLoose.push(k);
      }
      const trying = new Set<number>([...newLines, ...newLoose].map((k) => owner.get(k)!));
      if (trying.size === 0) {
        // No stretch point can absorb the remaining gaps — stable.
        for (const s of active) { s.done = true; s.stable = true; }
        break;
      }
      for (const si of trying) segments[si]!.attempts++;
      const next = runPass(hintsFrom(proposal.lines, proposal.loose, proposal.looseBudget));
      passCount++;
      balancingPasses++;
      yield;
      const nextGaps = collectColumnGaps(next.doc, next.forcedBreakPages);
      const capPage = pageOfContent(best.doc);
      const accepted: PageRange[] = [];
      const boxKeys = boxLeverKeys(gaps);
      for (const si of trying) {
        const s = segments[si]!;
        // An earlier segment's cascade shifted this one's pages: the pass
        // says nothing about its levers. They are offered again once the
        // culprit is blacklisted.
        if (!startIntact(next, s)) { s.attempts--; continue; }
        const keysLines = newLines.filter((k) => owner.get(k) === si);
        const keysLoose = newLoose.filter((k) => owner.get(k) === si);
        // Band caps ride along unchanged; a retry that unsettles one of the
        // segment's (its span block no longer lands in the capped band, or
        // a levelled closing band spills past its cut) is a regression —
        // capped columns without their box are not a layout we may keep.
        const capsDelivered = [...bandCaps.keys()].every((i) => !inRange(s.range, capPage.get(i)) || next.spanPlacedInBand.has(i));
        const score = capsDelivered && wholeIntact(next, s, si === segments.length - 1)
          ? gapLinesIn(nextGaps, s.range)
          : Infinity;
        // Loose paragraphs that gained no line at any tracking rung are
        // blacklisted whatever the score did, and never counted as applied.
        // Candidates the pass never tried (their column's budget was met
        // first) stay eligible for a later proposal.
        const looseFailed = keysLoose.filter((k) => next.looseOutcome.get(k) === null);
        for (const k of looseFailed) s.failedLoose.add(k);
        const looseWon = keysLoose.filter((k) => typeof next.looseOutcome.get(k) === 'number');
        // A box closing its column that moves down onto the column's last
        // grid slot (or level with the column beside it) closes less than a
        // line, which the score does not count. On its own — no other new
        // lever in the segment — such a pass is kept when it holds the
        // score, moves nothing across a column and closes room under a box
        // (EF-70).
        const boxesOnly = keysLines.length > 0 && keysLoose.length === 0 && keysLines.every((k) => boxKeys.has(k));
        if (score < s.bestScore) {
          for (const k of keysLines) applied.lines.set(k, proposal.lines.get(k)!);
          for (const k of looseWon) applied.loose.set(k, proposal.loose.get(k)!);
          s.bestScore = score;
          if (score === 0) { s.done = true; s.stable = true; }
          accepted.push(s.range);
        } else if (
          boxesOnly && score === s.bestScore
          && firstDivergentColumn(best.doc, next.doc, s.range) === null
          && boxRoomIn(nextGaps, s.range) < boxRoomIn(gaps, s.range) - BOX_ROOM_EPS_PX
        ) {
          for (const k of keysLines) applied.lines.set(k, proposal.lines.get(k)!);
          accepted.push(s.range);
        } else if (!containCascade(next, s, keysLines, keysLoose, gaps)) {
          // Plateau or regression without a cascade to contain: retry when
          // a loose candidate was just blacklisted (the proposer falls
          // through to the next one), or when the new loose paragraphs
          // gained their lines yet the segment did not improve (the gain
          // landed elsewhere — drop them too). A pure spacing plateau means
          // the segment is done: it keeps the best layout found so far —
          // unless a closing box rode along with the levers that bought
          // nothing: those are dropped and the box is tried on its own.
          const boxes = keysLines.filter((k) => boxKeys.has(k));
          if (boxes.length > 0 && !boxesOnly) {
            for (const k of keysLines) if (!boxKeys.has(k)) s.failedLines.add(k);
            for (const k of keysLoose) s.failedLoose.add(k);
          } else if (looseFailed.length > 0 || looseWon.length > 0) {
            for (const k of looseWon) s.failedLoose.add(k);
          } else {
            s.done = true;
          }
        }
        if (!s.done && s.attempts >= MAX_BALANCING_PASSES) s.done = true;
      }
      if (accepted.length > 0) best = spliceSegments(next, accepted);
    }
  }

  resetSegments();
  yield* balance();

  // --- Trailing bands (closing columns cut level) -------------------------
  // Once the balancing levers have settled the earlier pages, level the
  // closing band of every chapter / the document with a trailing cap. It is
  // resolved AFTER balancing because a cap is keyed by the block that opens
  // its band, and that block moves whenever an earlier page absorbs extra
  // lines; with the balancing hints frozen the band opens with the same
  // block and the cap applies. A short polish round then lets the levers
  // fill what the cut left short (a column ending a line under the cap).
  if (balancing.trailing) {
    const frozen = hintsFrom(applied.lines, applied.loose);
    const trailing = yield* resolveTrailingCapsGen(
      best,
      bandCaps,
      (caps) => runPass({ ...frozen, bandCaps: caps }),
    );
    passCount += trailing.passCount;
    if (trailing.result !== best) {
      best = trailing.result;
      for (const [i, cap] of trailing.caps) bandCaps.set(i, cap);
      // The capped layout is a new problem: the polish round gets its own
      // pass budget and fresh segments — the first round may have spent
      // every attempt, or blacklisted the very lever (a heading, a formula)
      // that now fills the line the cut left short.
      balancingPasses = 0;
      segments = [];
      resetSegments();
      yield* balance();
    }
  }

  best.doc.iterationCount = passCount;
  best.doc.converged = segments.every((s) => s.stable || s.bestScore === 0);
  return best.doc;
}
