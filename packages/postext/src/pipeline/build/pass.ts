// One placement pass: lays the content blocks out on pages under the hints
// the drivers (drivers.ts, balanced.ts) settle between passes.
import { withBitmapResolutions } from '../../bitmapResolution.js';
import type { PostextContent, PostextConfig, Resource } from '../../types.js';
import { type VDTColumn, type VDTPage } from '../../vdt.js';
import { withFigureWords } from '../resources/figureWords.js';
import { type MeasurementCache, initHyphenator } from '../../measure/index.js';
import { getCjkLineBreak, setCjkLineBreak } from '../../measure/cjk/cjkClasses.js';
import { getSlashBreaks, setSlashBreaks } from '../../measure/breakRules.js';
import { getCjkComposition, setCjkComposition, cjkCompositionOf } from '../../measure/cjk/cjkPunctuation.js';
import { getMeasureWritingMode, getMeasureRegion, getMeasureUprightDigits, setMeasureWritingMode, setMeasureUprightDigits } from '../../measure/vertical.js';
import { resolveAllConfig, resolvedLocale, resolvedDirection, arabicNumbersOf } from '../config.js';
import { getMeasureDirection, getMeasureArabicNumbers, setMeasureArabicNumbers, setMeasureDirection } from '../../measure/rtl/bidiLines.js';
import { getMeasureScriptContext, setMeasureScriptContext, scriptContextOfLocale, hanMarksOfLocale } from '../../measure/script.js';
import { getMeasureLanguage, setMeasureLanguage } from '../../measure/canvas.js';
import { shapingLanguageOf } from '../../hyphenation/locale.js';
import { createHeadingLevelResolver } from '../sections/headingStyles.js';
import { type BuildDocumentOptions, type PassHints, type PassResult, BuildCancelledError } from './passTypes.js';
import { createFloatQueue } from './pass/floats/floatQueue.js';
import { createStrips } from './pass/floats/strips.js';
import { createFloatMeasure } from './pass/floats/floatMeasure.js';
import { createFloatBands } from './pass/floats/floatBands.js';
import { createFloatPlace } from './pass/floats/floatPlace.js';
import { createFloatFlush } from './pass/floats/floatFlush.js';
import { createNotes } from './pass/notes.js';
import { createSections } from './pass/sections.js';
import { createBands } from './pass/bands.js';
import { createBreaks } from './pass/breaks.js';
import { createCalloutCommit } from './pass/callouts/calloutCommit.js';
import { createCalloutSpan } from './pass/callouts/calloutSpan.js';
import { createCalloutSide } from './pass/callouts/calloutSide.js';
import { createCalloutWrapped } from './pass/callouts/calloutWrapped.js';
import { createCalloutInline } from './pass/callouts/calloutInline.js';
import { createShortLists } from './pass/shortLists.js';
import { createComics } from './pass/comics.js';
import { createToc } from './pass/toc.js';
import { createComposed } from './pass/composed.js';
import type { PassState, PassLate } from './pass/state.js';
import type { BlockIteration } from './pass/blocks/blockIteration.js';
import { createBlockDispatch } from './pass/blocks/blockDispatch.js';
import { createBlockMeasure } from './pass/blocks/blockMeasure.js';
import { createResourceBlock } from './pass/blocks/resourceBlock.js';
import { createBlockLines } from './pass/blocks/blockLines.js';
import { createPlaceLines } from './pass/lines/placeLines.js';
import { createPageSetup } from './pass/setup/pageSetup.js';
import { createContentSetup } from './pass/setup/contentSetup.js';
import { createPassFinish } from './pass/setup/passFinish.js';
import type { PassSetupState } from './pass/setupState.js';

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
  const uprightDigits = getMeasureUprightDigits();
  const direction = getMeasureDirection();
  const arabicNumbers = getMeasureArabicNumbers();
  const scriptContext = getMeasureScriptContext();
  const language = getMeasureLanguage();
  const slashBreaks = getSlashBreaks();
  try {
    return placeDocumentPass(content, config, cache, options, hints);
  } finally {
    setSlashBreaks(slashBreaks);
    setMeasureLanguage(language);
    setMeasureScriptContext(scriptContext);
    setMeasureArabicNumbers(arabicNumbers);
    setCjkLineBreak(lineBreak);
    setCjkComposition(composition);
    setMeasureWritingMode(writingMode, region);
    setMeasureUprightDigits(uprightDigits);
    setMeasureDirection(direction);
  }
}

function placeDocumentPass(
  content: PostextContent,
  config: PostextConfig | undefined,
  cache: MeasurementCache | undefined,
  options: BuildDocumentOptions | undefined,
  hints: PassHints,
): PassResult {
  const setup = {} as PassSetupState;
  const state = {} as PassState;
  const late = {} as PassLate;
  const { balanceExtraPx, balanceLooseness, balanceLooseBudget, bandCaps, captionUnder, floatPages, citingPageFloats } = hints;
  const captionUnderProposals = new Set<string>();
  /** Side columns whose foot a figure's side caption has cut, by the figure. */
  const asideCutBy = new WeakMap<VDTColumn, string>();
  /** A side column that does not run the page's whole content height: a
   *  band above (a page-span box, a top float band) or a caption below has
   *  shortened it, so what does not fit it may still fit a full column. */
  const shortSideColumn = (page: VDTPage, col: VDTColumn): boolean => col.bbox.height < page.contentArea.height - 0.5;
  // Rebound once the content is read when it holds exercises (#1227): the
  // config then also carries their chip and paragraph styles.
  setup.resolved = resolveAllConfig(config);
  // Bitmaps sized by the document's `layout.bitmapResolution` carry it as
  // their own `resolution` from here on (#631); under the default policy
  // the content is untouched.
  const stampedResources = content.resources && withBitmapResolutions(content.resources, setup.resolved.layout.bitmapResolution);
  /** The resources as given: whose print size is the author's (#901). */
  const givenResources = content.resources;
  if (stampedResources && stampedResources !== content.resources) content = { ...content, resources: stampedResources as Resource[] };
  // Tracking rungs a loose paragraph may climb: none, then 5‰ steps up to
  // the cap (`headings.balancing.maxTracking`, thousandths of an em), the
  // cap itself always included. Only the smallest rung that gains the line
  // is ever kept; each rung costs one cached paragraph measurement.
  const balancingCfg = setup.resolved.headings.balancing;
  const trackingLadder: number[] = [0];
  if (balancingCfg.trackParagraphs && balancingCfg.maxTracking > 0) {
    for (let t = 5; t < balancingCfg.maxTracking; t += 5) trackingLadder.push(t);
    trackingLadder.push(balancingCfg.maxTracking);
  }
  const looseOutcome = new Map<number, number | null>();
  const looseOffGrid = new Set<number>();
  // Lines gained so far per column budget group (see `LooseBudget`).
  const looseGained = new Map<number, number>();
  // Level configs with heading-style overrides merged in (`{style="…"}`).
  const headingLevels = createHeadingLevelResolver(setup.resolved);
  const dpi = setup.resolved.page.dpi;

  // The document's hyphenation dictionary, set whatever the alignment: every
  // hyphenating text shares it — body text, paragraph styles, callout bodies,
  // design text — and so do the words wider than their measure, divided at a
  // syllable even in ragged text. Left unset, a build would hyphenate with
  // whichever dictionary the previous one (or the default, en-us) chose.
  // With the words the document keeps whole (#699); the names of the
  // authors it cites join them below, once its references are read.
  const hyphenationRules = { exceptions: setup.resolved.bodyText.hyphenation.exceptions, capitalized: setup.resolved.bodyText.hyphenation.capitalized };
  initHyphenator(setup.resolved.bodyText.hyphenation.locale, hyphenationRules);
  // A line may end after a slash between two words wherever rich text is
  // measured (#1164), unless the configuration keeps the breaks of 1.51.
  setSlashBreaks(setup.resolved.bodyText.breakAfterSlashes !== false);
  // CJK text breaks at the document's level wherever it is measured (body,
  // captions, cells, notes, boxes), as it hyphenates in its language.
  setCjkLineBreak(setup.resolved.cjk.lineBreak);
  // And is composed with the document's punctuation widths, hanging and
  // Han–Latin space (along the line in either writing mode), in its
  // language.
  setCjkComposition(cjkCompositionOf(setup.resolved.cjk, setup.resolved.page.dpi, resolvedLocale(setup.resolved)));
  // Characters of a vertical flow that stand in a cell advance by it (half
  // an em for the mainland interpunct).
  setMeasureWritingMode(setup.resolved.layout.writingMode, setup.resolved.cjk.region);
  // Short numbers set in one upright cell (`cjk.uprightDigits`).
  setMeasureUprightDigits(setup.resolved.cjk.uprightDigits);
  // Paragraphs run in the document's direction unless they set their own
  // (`{dir=…}`): an Arabic book's captions, cells and notes too.
  setMeasureDirection(resolvedDirection(setup.resolved));
  // And, in an Arabic-script book, read a number that opens a paragraph as
  // the numbers after its letters (#665).
  setMeasureArabicNumbers(arabicNumbersOf(setup.resolved));
  // A word with no letter is shaped in the script of the text around it,
  // and with no letter near in the script of the document's language (#725).
  // The text is measured in the document's language, the same on a page
  // in any language and in a worker (#764, the default since postext 1.30,
  // #770); in the host's for a configuration that asks for it, as up to
  // postext 1.28.
  setMeasureLanguage(shapingLanguageOf(setup.resolved));
  // A Chinese or Japanese document sets its doubled ellipsis and dash as
  // Han text wherever they are cited.
  setMeasureScriptContext({
    enabled: setup.resolved.bodyText.scriptContext !== false,
    script: scriptContextOfLocale(resolvedLocale(setup.resolved)),
    ...(hanMarksOfLocale(resolvedLocale(setup.resolved)) ? { hanMarks: true } : {}),
  });

  const {
    baselineGrid, doc, continuation, pageIndexOffset, afterPartPage, pageMetrics, pageWidthPx,
    pageHeightPx, freshPageFlowColumns, designFramesOn, toLeaf, frontmatterMeta, markdownBody,
    bodyOffset, parsedBody
  } = createPageSetup({
    content, state, setup
  });
  // A figure's own words (#935): its alt, caption and note replace the
  // resource's in this chapter, for the layout, the references and every
  // output alike.
  if (content.resources) {
    const worded = withFigureWords(content.resources, parsedBody);
    if (worded !== content.resources) content = { ...content, resources: worded };
  }

  const {
    captionCitations, footnoteDefs, footnoteNumbering, chapterEndNotes, anchorRefContext,
    templateSource, codeBoxes, contentBlocks, carried, headingPrefixes, headingNumbers,
    chapterNumberByBlock, resources, resourceTypes, resourceNumbering, stripNumbers, resourceById,
    resourceTypeById, resourceNumberById, figureLabelsById, bodyStyle, calloutStyles,
    calloutResolved, blockquoteStyle, listLevelIndentsPx, orderedMetrics, orderedLevelIndentsPx,
    paragraphContainers, calloutPlan, partPlan, sectionPlan, floatPlan, composedPlans,
    comicTextPlans, floatedIds, floatsByFirstBlock, calloutFloats, cursor, forcedBreakPages,
    uncappedBottoms, openerHeadFloats
  } = createContentSetup({
    content, config, hints, hyphenationRules, doc, continuation, pageMetrics, frontmatterMeta,
    bodyOffset, parsedBody, setup
  });

  const {
    pendingFloats, pendingSideBoxes, openerPages, openerFloatRule, openerFloatNotes, noteOpenerFloat,
    awaitingSideBoxes, multiColumnBand, enqueuedFloatIds, enqueueFloatsFor, citationGates,
    awaitsCitation, releaseStaleCitationGates, gateCitedFloats, regateCitedFloats, gateBoxCitations,
    releaseBoxCitations, citedLinesPlaced
  } = createFloatQueue({
    resolved: setup.resolved, doc, bodyOffset, contentBlocks, floatsByFirstBlock, calloutFloats, cursor, state, late
  });

  const {
    CALLOUT_FLOAT_PREFIX, calloutFloatOf, COMIC_STRIP_PREFIX, comicStripOf, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, shiftStripLines
  } = createStrips({
    cache, resolved: setup.resolved, doc, bodyOffset, contentBlocks, resources, resourceTypes, resourceNumbering,
    stripNumbers, resourceById, resourceTypeById, bodyStyle, calloutFloats, cursor
  });

  const {
    calloutFloatResults, calloutBandPages, enqueueCalloutFloat, acrossWidth, floatGapPx, minTextPx,
    offsetResourceBlockToAbsolute, layoutFloat, rotationFor, uprightOn, tableRowCount, tableOverflow,
    sliceOf, tableMetrics, measureFloat, buildFloatBlock, rotatedFlushEnd, floatReserved,
    centredPages, reservedOf, wrapExclusionWidth, textWrapNotes, movedNotes, wrapContourOf,
    floatWraps, openFloatWraps, floatHeadOf, capOrigin, topFloatRefOf, capKindOf
  } = createFloatMeasure({
    cache, balanceExtraPx, bandCaps, resolved: setup.resolved, dpi, baselineGrid, doc, pageIndexOffset,
    captionCitations, resources, resourceTypes, resourceNumbering, resourceById, resourceTypeById,
    resourceNumberById, figureLabelsById, bodyStyle, pendingFloats, enqueuedFloatIds,
    enqueueFloatsFor, calloutFloats, CALLOUT_FLOAT_PREFIX, calloutFloatOf, comicStripOf,
    stripGeometry, buildComicStripBlock, cursor, uncappedBottoms, state
  });

  const {
    splitTableFloat, sideObstacles, probeFloatBand, availableAfterBand, commitFloatBlock,
    shrinkToRoom
  } = createFloatBands({
    captionUnder, baselineGrid, doc, shiftStripLines, calloutFloatResults, calloutBandPages,
    floatGapPx, offsetResourceBlockToAbsolute, layoutFloat, rotationFor, tableRowCount,
    tableOverflow, sliceOf, tableMetrics, measureFloat, uncappedBottoms, state, late
  });

  const {
    placeFloatInColumns, settle, heldBack, positionsFor
  } = createFloatPlace({
    captionUnderProposals, asideCutBy, shortSideColumn, resolved: setup.resolved, dpi, baselineGrid, bodyOffset,
    contentBlocks, resourceById, bodyStyle, pendingFloats, openerPages, openerFloatRule,
    noteOpenerFloat, awaitsCitation, calloutFloatOf, calloutBandPages, floatGapPx, minTextPx,
    tableOverflow, measureFloat, buildFloatBlock, rotatedFlushEnd, floatReserved, reservedOf,
    wrapExclusionWidth, textWrapNotes, wrapContourOf, floatWraps, topFloatRefOf, splitTableFloat,
    sideObstacles, probeFloatBand, availableAfterBand, commitFloatBlock, shrinkToRoom,
    uncappedBottoms, openerHeadFloats, state, late
  });

  const {
    tryPlacePendingFloatsOnCurrentPage, settleCitingPageFloats, flushFloatsIntoPage, onNewPage,
    onAtomicNewPage, spanBoxAt, drainPendingFloats
  } = createFloatFlush({
    citingPageFloats, resolved: setup.resolved, doc, pageWidthPx, pageHeightPx, contentBlocks, resourceById,
    calloutStyles, calloutPlan, floatPlan, pendingFloats, pendingSideBoxes, multiColumnBand,
    enqueuedFloatIds, citationGates, awaitsCitation, floatGapPx, minTextPx, measureFloat, reservedOf,
    capKindOf, probeFloatBand, availableAfterBand, placeFloatInColumns, settle, heldBack,
    positionsFor, cursor, forcedBreakPages, state, late
  });

  const {
    calloutsOutOfFlow, joiningLetterSpacing, dropCapNotes, measureCtx, notesPrefixCost,
    reserveCitedNotes, reserveLeftoverNotes, dropChapterEndNotes, ruleChapterEndNotes,
    setColumnNotes
  } = createNotes({
    cache, resolved: setup.resolved, headingLevels, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx,
    markdownBody, bodyOffset, captionCitations, footnoteDefs, footnoteNumbering, anchorRefContext,
    contentBlocks, headingPrefixes, headingNumbers, resources, resourceTypes, resourceNumbering,
    resourceById, resourceTypeById, resourceNumberById, bodyStyle, blockquoteStyle,
    listLevelIndentsPx, orderedMetrics, orderedLevelIndentsPx, floatedIds, cursor, uncappedBottoms,
    state
  });
  Object.assign(late, { reserveCitedNotes });

  const {
    partMeasureCtx, sectionMeasureCtx, enterSection, stampBlockExtras, columnHeadKept,
    pendingBeforeSelfSnapping, markForcedBreak
  } = createSections({
    resolved: setup.resolved, headingLevels, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx,
    pageHeightPx, contentBlocks, paragraphContainers, partPlan, measureCtx, cursor, forcedBreakPages,
    state
  });

  const {
    balanceExtraInColumn, addBalanceExtra, opensDefaultOpener, measuredAcrossPage, reserveOpenerBand,
    openerOwnColumn, openerHeadOf, underOpenerHeadFloat, atColumnHead, openerHeadSpacing,
    sideObstacleColumn, headingClaims, noteHeadingClaim, markSideObstacles, spanHeadingOpenedHere,
    openSpanHeadingHere, rollbackHeadings, bandCapProposals, spanPlacedInBand, bandCapsApplied,
    cappedBandColumns, enterBand, proposeTrailingCap
  } = createBands({
    bandCaps, floatPages, resolved: setup.resolved, headingLevels, baselineGrid, doc, designFramesOn, resourceById,
    bodyStyle, partPlan, sectionPlan, pendingFloats, reservedOf, floatHeadOf, capOrigin,
    sideObstacles, partMeasureCtx, cursor, sectionMeasureCtx, uncappedBottoms, openerHeadFloats,
    state, late
  });
  Object.assign(late, { openerHeadOf });

  const {
    closeFlowSegment, leaveCurrentPage, breakForPaper, pageNumberSegments, pageTakesNumbering,
    flushPendingNumberingAtBoundary, headingMayCloseColumn, isFreeHeading, holdsHeadFloat,
    trailingHeadingRun, calloutShortMoves, headingRunMayLeave, rollbackIndexGroup,
    stampCalloutSource
  } = createBreaks({
    resolved: setup.resolved, headingLevels, baselineGrid, doc, continuation, afterPartPage, pageWidthPx,
    pageHeightPx, bodyOffset, contentBlocks, pendingFloats, releaseStaleCitationGates, floatGapPx,
    offsetResourceBlockToAbsolute, tryPlacePendingFloatsOnCurrentPage, drainPendingFloats, cursor,
    markForcedBreak, openerOwnColumn, openerHeadFloats, spanHeadingOpenedHere, rollbackHeadings,
    proposeTrailingCap, state, late
  });
  Object.assign(late, { isFreeHeading, holdsHeadFloat, stampCalloutSource });

  const {
    columnsNotes, commitCallout, framePass, makeCalloutLayouter, mirroredOf, paintedBottom,
    capClipsLines, bandUsedBottomWithSide, splitCalloutFragment, tallerThanColumn, markFragment
  } = createCalloutCommit({
    resolved: setup.resolved, headingLevels, doc, pageIndexOffset, bodyOffset, contentBlocks, chapterNumberByBlock,
    resourceById, calloutResolved, paragraphContainers, partPlan, sectionPlan, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, floatGapPx, measureCtx, partMeasureCtx, cursor,
    sectionMeasureCtx, stampCalloutSource, state
  });
  Object.assign(late, { makeCalloutLayouter, mirroredOf, paintedBottom, bandUsedBottomWithSide });

  const {
    placeCalloutSpan, nextIsBarrier, rectsOverlap
  } = createCalloutSpan({
    bandCaps, resolved: setup.resolved, headingLevels, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
    contentBlocks, bodyStyle, calloutStyles, calloutPlan, pendingFloats, openerPages,
    openerFloatRule, noteOpenerFloat, enqueueFloatsFor, gateBoxCitations, releaseBoxCitations,
    floatGapPx, offsetResourceBlockToAbsolute, uprightOn, sliceOf, measureFloat, buildFloatBlock,
    reservedOf, capOrigin, topFloatRefOf, heldBack, tryPlacePendingFloatsOnCurrentPage, onNewPage,
    drainPendingFloats, cursor, forcedBreakPages, markForcedBreak, uncappedBottoms, bandCapProposals,
    spanPlacedInBand, proposeTrailingCap, commitCallout, mirroredOf, capClipsLines,
    bandUsedBottomWithSide, splitCalloutFragment, tallerThanColumn, markFragment, state
  });

  const {
    placeCalloutFixed, placeCalloutSide, settleAwaitingSideBoxes, flushSideBoxesIntoPage,
    settlePendingSideBoxes
  } = createCalloutSide({
    captionUnderProposals, asideCutBy, shortSideColumn, dpi, baselineGrid, doc, pageWidthPx,
    pageHeightPx, designFramesOn, bodyOffset, contentBlocks, bodyStyle, pendingSideBoxes,
    awaitingSideBoxes, enqueueFloatsFor, floatGapPx, sideObstacles,
    tryPlacePendingFloatsOnCurrentPage, onNewPage, cursor, uncappedBottoms, proposeTrailingCap,
    isFreeHeading, stampCalloutSource, makeCalloutLayouter, mirroredOf, nextIsBarrier, rectsOverlap,
    state
  });
  Object.assign(late, { settleAwaitingSideBoxes, flushSideBoxesIntoPage, settlePendingSideBoxes });

  const {
    placeCalloutWrapped, inlineAsideWanted, measureInlineAside, markInlineAside,
    placeInlineTableSlices
  } = createCalloutWrapped({
    resolved: setup.resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, contentBlocks,
    bodyStyle, floatGapPx, offsetResourceBlockToAbsolute, wrapExclusionWidth, textWrapNotes,
    sideObstacles, onNewPage, onAtomicNewPage, cursor, stampBlockExtras, atColumnHead,
    sideObstacleColumn, enterBand, stampCalloutSource, mirroredOf, state
  });

  const {
    placeCalloutInline
  } = createCalloutInline({
    balanceExtraPx, resolved: setup.resolved, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
    contentBlocks, calloutStyles, multiColumnBand, enqueueFloatsFor, gateBoxCitations,
    releaseBoxCitations, enqueueCalloutFloat, acrossWidth, reservedOf, onNewPage, calloutsOutOfFlow,
    cursor, pendingBeforeSelfSnapping, uncappedBottoms, addBalanceExtra, atColumnHead,
    rollbackHeadings, enterBand, proposeTrailingCap, isFreeHeading, calloutShortMoves,
    headingRunMayLeave, commitCallout, makeCalloutLayouter, mirroredOf, splitCalloutFragment,
    tallerThanColumn, markFragment, placeCalloutSpan, placeCalloutFixed, placeCalloutSide,
    placeCalloutWrapped, state
  });

  const {
    firstListItemStarts, shortListRule, shortListFrom, shortListNeed, citedFootTake, shortListBoxAt,
    shortListWarnings
  } = createShortLists({
    resolved: setup.resolved, doc, bodyOffset, contentBlocks, partPlan, sectionPlan, pendingFloats, openerPages,
    openerFloatRule, citationGates, capKindOf, probeFloatBand, availableAfterBand, partMeasureCtx,
    cursor, sectionMeasureCtx, openerHeadOf, state
  });
  Object.assign(late, { shortListBoxAt });

  const {
    breakToEvenPage, placeComicSpread, looseStripBoxes, placeComicStrip, measureCtxOf
  } = createComics({
    resolved: setup.resolved, dpi, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
    bodyOffset, resourceById, partPlan, sectionPlan, pendingFloats, enqueuedFloatIds,
    COMIC_STRIP_PREFIX, stripGeometry, buildComicStripBlock, withStripPlaceholder, floatGapPx,
    onAtomicNewPage, partMeasureCtx, cursor, sectionMeasureCtx, rollbackHeadings, enterBand,
    trailingHeadingRun, headingRunMayLeave, state, late
  });

  const {
    tocGroupNeed, tocContinuationOpens, headingClaimWarnings, tocGroupWarnings
  } = createToc({
    doc, pageWidthPx, pageHeightPx, bodyOffset, contentBlocks, bodyStyle, onNewPage, cursor,
    forcedBreakPages, headingClaims, measureCtxOf, state
  });

  const {
    composedLaid, composedNotes, fenceEnd, pendingJumps, placeComposedPage, placeComicText,
    placeStripTexts, firstFlowBlockIdx
  } = createComposed({
    content, resolved: setup.resolved, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx, designFramesOn, toLeaf,
    markdownBody, bodyOffset, captionCitations, footnoteDefs, footnoteNumbering, templateSource,
    contentBlocks, carried, headingPrefixes, headingNumbers, chapterNumberByBlock, resourceById,
    resourceTypeById, resourceNumberById, bodyStyle, calloutStyles, calloutResolved,
    orderedLevelIndentsPx, paragraphContainers, partPlan, sectionPlan, composedPlans, comicTextPlans,
    floatedIds, floatGapPx, calloutsOutOfFlow, joiningLetterSpacing, dropCapNotes, cursor,
    closeFlowSegment, leaveCurrentPage, flushPendingNumberingAtBoundary, framePass, mirroredOf,
    breakToEvenPage, state
  });
  Object.assign(late, { placeComicText });


  const { dispatchBlock } = createBlockDispatch({
    state, resolved: setup.resolved, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
    bodyOffset, markdownBody, contentBlocks, resourceById, calloutStyles, paragraphContainers,
    calloutPlan, partPlan, composedPlans, comicTextPlans, floatedIds, cursor, openerPages,
    multiColumnBand, centredPages, flushFloatsIntoPage, onNewPage, tryPlacePendingFloatsOnCurrentPage,
    spanBoxAt, drainPendingFloats, markForcedBreak, pageTakesNumbering, closeFlowSegment,
    leaveCurrentPage, breakForPaper, flushPendingNumberingAtBoundary, placeCalloutInline,
    placeComicSpread, placeComicStrip, looseStripBoxes, placeComposedPage, placeComicText
  });
  const { measureBlock } = createBlockMeasure({
    state, balanceLooseness, balanceLooseBudget, balanceExtraPx, resolved: setup.resolved, trackingLadder,
    looseOutcome, looseOffGrid, looseGained, headingLevels, dpi, doc, pageWidthPx, pageHeightPx,
    contentBlocks, paragraphContainers, partPlan, sectionPlan, cursor, openerPages, floatGapPx,
    uprightOn, onNewPage, partMeasureCtx, sectionMeasureCtx, measuredAcrossPage, atColumnHead,
    openSpanHeadingHere, closeFlowSegment, flushPendingNumberingAtBoundary, inlineAsideWanted,
    measureInlineAside, firstFlowBlockIdx
  });
  const { placeResourceBlock } = createResourceBlock({
    state, resolved: setup.resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, bodyStyle, cursor,
    floatGapPx, offsetResourceBlockToAbsolute, textWrapNotes, movedNotes, wrapExclusionWidth,
    wrapContourOf, onAtomicNewPage, stampBlockExtras, addBalanceExtra, enterBand,
    flushPendingNumberingAtBoundary, measureInlineAside, markInlineAside, placeInlineTableSlices
  });
  const { prepareLines } = createBlockLines({
    resolved: setup.resolved, headingLevels, freshPageFlowColumns, contentBlocks, gateCitedFloats, measuredAcrossPage
  });
  const { placeLines } = createPlaceLines({
    state, balanceExtraPx, resolved: setup.resolved, looseOutcome, headingLevels, dpi, baselineGrid, doc, pageWidthPx,
    pageHeightPx, designFramesOn, bodyOffset, contentBlocks, chapterNumberByBlock, resourceById,
    bodyStyle, cursor, uncappedBottoms, regateCitedFloats, gateCitedFloats, citedLinesPlaced,
    reservedOf, openFloatWraps, onNewPage, notesPrefixCost, columnHeadKept, stampBlockExtras,
    pendingBeforeSelfSnapping, addBalanceExtra, balanceExtraInColumn, opensDefaultOpener,
    reserveOpenerBand, openerHeadSpacing, underOpenerHeadFloat, markSideObstacles, noteHeadingClaim,
    rollbackHeadings, enterBand, headingMayCloseColumn, trailingHeadingRun, headingRunMayLeave,
    rollbackIndexGroup, shortListRule, shortListFrom, shortListNeed, firstListItemStarts,
    citedFootTake, tocGroupNeed
  });

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
    const blockTurn = { blockIdx } as BlockIteration;
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
    options?.onProgress?.({ pass: 1, blocks: blockIdx, totalBlocks: contentBlocks.length, pages: doc.pages.length });
    const rawBlock = contentBlocks[blockIdx]!;
    // Blocks a composed page set in its frames (#855) are done.
    if (composedLaid.has(blockIdx)) continue;

    // The styled section this block sits in: its geometry applies to the
    // pages opened from here (a heading with `breakBefore` opens one).
    const blockSection = sectionPlan.byBlock[blockIdx];
    if (blockSection !== state.currentSection) enterSection(blockSection);

    // The repeat of a contents block's head row (#850): set where a cut
    // block goes on in a fresh column, skipped everywhere else.
    if (rawBlock.toc?.group?.role === 'continuation' && !tocContinuationOpens(blockIdx)) continue;

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

    blockTurn.rawBlock = rawBlock;
    const jump = dispatchBlock(blockTurn);
    blockIdx = blockTurn.blockIdx;
    if (jump === 'continue') continue;

    if (measureBlock(blockTurn) === 'continue') continue;

    if (placeResourceBlock(blockTurn) === 'continue') continue;

    prepareLines(blockTurn);

    placeLines(blockTurn);
    blockIdx = blockTurn.blockIdx;

    flushPendingNumberingAtBoundary();
  }

  // End of the document: level the closing band and place any floats still
  // pending (referenced on the last page) on pages appended after it.
  closeFlowSegment(contentBlocks.length);

  const {
    citingPageProposals, citingPageRefused
  } = createPassFinish({
    config, givenResources, dpi, doc, continuation, bodyOffset, chapterEndNotes, codeBoxes,
    contentBlocks, carried, resourceById, paragraphContainers, calloutFloats, pendingFloats,
    pendingSideBoxes, openerFloatNotes, awaitingSideBoxes, centredPages, reservedOf, textWrapNotes,
    movedNotes, settleCitingPageFloats, joiningLetterSpacing, dropCapNotes, reserveLeftoverNotes,
    dropChapterEndNotes, ruleChapterEndNotes, setColumnNotes, spanPlacedInBand, cappedBandColumns,
    pageNumberSegments, isFreeHeading, columnsNotes, capClipsLines, shortListWarnings,
    headingClaimWarnings, tocGroupWarnings, composedNotes, fenceEnd, pendingJumps, placeStripTexts,
    setup
  });

  return { doc, forcedBreakPages, bandCapProposals, spanPlacedInBand, bandCapsApplied, looseOutcome, looseOffGrid, captionUnderProposals, citingPageProposals, citingPageRefused };
}
