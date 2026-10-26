// One placement pass: lays the content blocks out on pages under the hints
// the drivers (drivers.ts, balanced.ts) settle between passes.
import { withBitmapResolutions } from '../../bitmapResolution.js';
import type { PostextContent, PostextConfig, Resource, ResourceType, ResolvedCalloutStyleConfig, ResolvedHeadingLevelConfig } from '../../types.js';
import type { HeadingPlaceholderInfo } from '../../design/placeholders.js';
import { parseMarkdownMemo, type ContentBlock, spaceDirectiveLines, type ListKind } from '../../parse/index.js';
import { dimensionToPx } from '../../units.js';
import { type VDTColumn, type VDTPage, createVDTDocument, type ResolvedConfig, type BoundingBox, pageIsVertical, type VDTFigureLabel, type ContentWarning, type VDTLine, type VDTBlock, createVDTBlock, pageIsMirrored, createVDTColumn, type VDTBalancing } from '../../vdt.js';
import { figureLabels } from '../buildMeasurement.js';
import { withFigureWords } from '../figureWords.js';
import { stampFigureLabelRects } from '../../composed/labels.js';
import { computeHeadingNumbering, type NumeralStyle, parseNumberFormat, buildPageLabels } from '../../numbering.js';
import { extractFrontmatter, normalizeMetadata } from '../../frontmatter.js';
import { type MeasurementCache, initHyphenator } from '../../measure/index.js';
import { setHyphenationRules } from '../../hyphenate.js';
import { citedNames } from '../../citations/names.js';
import { getCjkLineBreak, setCjkLineBreak } from '../../measure/cjkClasses.js';
import { getSlashBreaks, setSlashBreaks } from '../../measure/breakRules.js';
import { getCjkComposition, setCjkComposition, cjkCompositionOf } from '../../measure/cjkPunctuation.js';
import { getMeasureWritingMode, getMeasureRegion, getMeasureUprightDigits, setMeasureWritingMode, setMeasureUprightDigits, measuringVertically } from '../../measure/vertical.js';
import { stampCentralBaselines } from '../verticalMetrics.js';
import { orientLinesToFrames } from '../mirrorFrame.js';
import { verseMarginTopPx } from '../buildBlockKind.js';
import { versesLineByLine } from '../verseLines.js';
import { needsExerciseExpansion, expandDocumentExercises, withExerciseStyles, exerciseSettingsFor, nameExerciseAnchors } from '../../exercises/build.js';
import { exerciseDigitalOf } from '../../exercises/digital.js';
import { resolveAllConfig, resolvedLocale, resolvedDirection, arabicNumbersOf, computeBaselineGrid, computeColumnBboxes } from '../config.js';
import { asciiDigits } from '../../arabicNumerals.js';
import { getMeasureDirection, getMeasureArabicNumbers, setMeasureArabicNumbers, setMeasureDirection } from '../../measure/bidiLines.js';
import { getMeasureScriptContext, setMeasureScriptContext, scriptContextOfLocale, hanMarksOfLocale } from '../../measure/script.js';
import { getMeasureLanguage, setMeasureLanguage } from '../../measure/canvas.js';
import { shapingLanguageOf } from '../../locale.js';
import { createHeadingLevelResolver, numberTitlesFor, headingMarksFor, headingIsNumbered, planHeadingSections, sectionWritingMode, headingIsHidden } from '../headingStyles.js';
import { applyCitations, processCitations, citationLocale, withBibliographyStyle } from '../citations.js';
import { needsCitationContext, bookCitationContexts } from '../../citations/context.js';
import { hasAnchorRefs, anchorTargetsOf } from '../crossRefs.js';
import { type AnchorRefContext } from '../resourceLayout.js';
import { numberStatements, applyStatementNumbering, outlineLookup } from '../statementNumbering.js';
import { wrapPageSpanEmbeds, spanEmbedStyle, SPAN_EMBED_STYLE_ID, isPageSpanStrip } from '../spanEmbeds.js';
import { wrapFlowColumns, flowColumnsStyles } from '../flowColumns.js';
import { wrapComposedPages, frameBoxStyle } from '../../composed/wrap.js';
import { planComposedPages, type PlannedComposedPage, composedPageAt } from '../composedLayout.js';
import { importJumps } from '../../composed/carry.js';
import { hasTocDirective, hasIndexDirective, computeOutline, headingTemplatesOf, headingNumberingOptions } from '../outline.js';
import { expandTocDirectives } from '../toc.js';
import { expandIndexDirectives } from '../indexDirective.js';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../styles.js';
import { computeLevelIndentsPx, computeOrderedListRunMetrics, computeOrderedLevelIndentsPx, listItemGapPx, listItemSpacingPx, mirrorListMarker, directListMarker, listBulletPosition } from '../lists.js';
import { createPageWithColumns, currentBand, bandColumns, FIT_EPS, advanceToNextColumn, resetLinePositions, type PlacementCursor, currentColumn, advanceToNextPageBoundary, placeBlockInColumn, placeAtomicBlock, enforcePageParity, createPartPage, flowColumnsAfter, columnClosesPage, pageLayoutOf } from '../placement.js';
import { chooseParagraphSplit } from '../orphanWidow.js';
import { layoutComicPage } from '../../comics/layoutPage.js';
import { isComicSpread } from '../../comics/spread.js';
import { wrapComicTextPanels, comicTextPanelsSupported, planComicTextPanels } from '../../comics/textPanels.js';
import { computePageMetrics, sheetRectToFlow, composedLeafConfig, isMarkerBlock, applyStyleAttrs, nextNonMarkerBlock, prevNonMarkerBlock, pageMirrored, spaceLinesAfter } from '../buildHelpers.js';
import { type MeasuredContentBlock, measureContentBlock, type MeasureContentBlockOptions } from '../measureContentBlock.js';
import { planParagraphContainers, containerStyle } from '../paragraphContainers.js';
import { splitFootnoteDefinitions, numberFootnotes, footnoteFormatOf, appendChapterEndNotes, noteNumberPositionOf, withFootnoteStyle } from '../footnotes.js';
import { planParts } from '../parts.js';
import { planCallouts, type PlannedCallout, pickCalloutStyle } from '../calloutLayout.js';
import { type CalloutLayouter } from '../frameLayout.js';
import { computeFloatPlan, floatedResourceIds, type PlannedFloat } from '../floatPlacement.js';
import { computeHeadingContext, computeResourceNumberingState, type ResourceNumberingMap } from '../resourceNumbering.js';
import { effectiveResourceTypes, documentLocale } from '../../defaults/resourceTypes.js';
import { resolveCalloutStylesConfig } from '../../defaults/calloutStyles.js';
import { relinkToPalette } from '../../defaults/shared.js';
import { codeParseOptions, wrapCodeBlocks, codeBoxStyle } from '../codeBlocks.js';
import { expandScoreBlocks, scoreKeepHeight } from '../scoreBlocks.js';
import { buildCodeLineNumbers } from '../codeLines.js';
import { buildLineNumbers } from '../lineNumbers.js';
import { defaultOpenerTitle, measureHeadingDesign, markedTitleFields, measureDefaultOpenerHeight, buildHeadersAndFooters } from '../headerFooter.js';
import { flowColorValues } from '../partPalette.js';
import { leadingBoldText } from '../placeholders.js';
import { balanceKey, flexFigureKey } from '../columnBalancing.js';
import { raggedLooseLines } from '../raggedLines.js';
import { joiningLetterSpacingWarnings, dropCapWarnings, floatShrinkWarnings, pictureBelowPrintSizeWarnings, emptyCaptionWarnings } from '../contentWarnings.js';
import { dropCapSinkAfter } from '../dropCap.js';
import { literalBreaksFor } from '../hardBreaks.js';
import { tashkilFor } from '../tashkil.js';
import { paperByBlock, stampPagePaper } from '../paper.js';
import { headingLineSpanBand } from '../lineSpan.js';
import { openColumnWrap, columnCursorY, wrapGapPx, minTextWidthPx, settleColumnWraps, resolveResourceWrap, transparentToWrap, runsBesideWrap, insetsBefore, wrapInsetSteps, sameInsetsFrom } from '../textWrap.js';
import { lineInsetsAt, type LineInsetStep } from '../../measure/types.js';
import { fillPageMarks, stampCarriedSource, carriedByDoc } from './pageMarks.js';
import { chapterNumbersOfContent, measureLooseParagraph, headingSetsOwnBand, verseSnaps, shiftLinesDown, sameVerseLine, keepsStanzaWhole, centrePageText } from './passHelpers.js';
import { type BuildDocumentOptions, type PassHints, type PassResult, type HeadingClaim, type InlineAside, BuildCancelledError, MIN_INLINE_FIGURE_SCALE } from './passTypes.js';
import { indexWarnings, unplacedByDoc, joiningSpacingWarnings, dropCapWarningsByDoc, floatShrinkWarningsByDoc, textWrapWarningsByDoc, composedWarningsByDoc, compositionWarningsByDoc } from './warnings.js';
import { createFloatQueue } from './pass/floatQueue.js';
import { createStrips } from './pass/strips.js';
import { createFloatMeasure } from './pass/floatMeasure.js';
import { createFloatBands } from './pass/floatBands.js';
import { createFloatPlace } from './pass/floatPlace.js';
import { createFloatFlush } from './pass/floatFlush.js';
import { createNotes } from './pass/notes.js';
import { createSections } from './pass/sections.js';
import { createBands } from './pass/bands.js';
import { createBreaks } from './pass/breaks.js';
import { createCalloutCommit } from './pass/calloutCommit.js';
import { createCalloutSpan } from './pass/calloutSpan.js';
import { createCalloutSide } from './pass/calloutSide.js';
import { createCalloutWrapped } from './pass/calloutWrapped.js';
import { createCalloutInline } from './pass/calloutInline.js';
import { createShortLists } from './pass/shortLists.js';
import { createComics } from './pass/comics.js';
import { createToc } from './pass/toc.js';
import { createComposed } from './pass/composed.js';
import type { PassState, PassLate } from './pass/state.js';

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
  let resolved = resolveAllConfig(config);
  // Bitmaps sized by the document's `layout.bitmapResolution` carry it as
  // their own `resolution` from here on (#631); under the default policy
  // the content is untouched.
  const stampedResources = content.resources && withBitmapResolutions(content.resources, resolved.layout.bitmapResolution);
  /** The resources as given: whose print size is the author's (#901). */
  const givenResources = content.resources;
  if (stampedResources && stampedResources !== content.resources) content = { ...content, resources: stampedResources as Resource[] };
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
  const looseOffGrid = new Set<number>();
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
  // With the words the document keeps whole (#699); the names of the
  // authors it cites join them below, once its references are read.
  const hyphenationRules = { exceptions: resolved.bodyText.hyphenation.exceptions, capitalized: resolved.bodyText.hyphenation.capitalized };
  initHyphenator(resolved.bodyText.hyphenation.locale, hyphenationRules);
  // A line may end after a slash between two words wherever rich text is
  // measured (#1164), unless the configuration keeps the breaks of 1.51.
  setSlashBreaks(resolved.bodyText.breakAfterSlashes !== false);
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
  // Short numbers set in one upright cell (`cjk.uprightDigits`).
  setMeasureUprightDigits(resolved.cjk.uprightDigits);
  // Paragraphs run in the document's direction unless they set their own
  // (`{dir=…}`): an Arabic book's captions, cells and notes too.
  setMeasureDirection(resolvedDirection(resolved));
  // And, in an Arabic-script book, read a number that opens a paragraph as
  // the numbers after its letters (#665).
  setMeasureArabicNumbers(arabicNumbersOf(resolved));
  // A word with no letter is shaped in the script of the text around it,
  // and with no letter near in the script of the document's language (#725).
  // The text is measured in the document's language, the same on a page
  // in any language and in a worker (#764, the default since postext 1.30,
  // #770); in the host's for a configuration that asks for it, as up to
  // postext 1.28.
  setMeasureLanguage(shapingLanguageOf(resolved));
  // A Chinese or Japanese document sets its doubled ellipsis and dash as
  // Han text wherever they are cited.
  setMeasureScriptContext({
    enabled: resolved.bodyText.scriptContext !== false,
    script: scriptContextOfLocale(resolvedLocale(resolved)),
    ...(hanMarksOfLocale(resolvedLocale(resolved)) ? { hanMarks: true } : {}),
  });

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
  state.contentArea = pageMetrics.contentArea;
  state.geomResolved = resolved;
  /** How many columns of a fresh page take body text, in the geometry
   *  pages are opened with now (`hyphenateAcrossColumns: 'withinPage'`,
   *  #701: every that many column ends, a page ends). */
  let freshFlowColumnsOf: ResolvedConfig | undefined;
  let freshFlowColumns = 1;
  const freshPageFlowColumns = (): number => {
    if (freshFlowColumnsOf !== state.geomResolved) {
      freshFlowColumnsOf = state.geomResolved;
      const fresh = createPageWithColumns(doc.pages.length, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
      freshFlowColumns = Math.max(1, fresh.columns.filter((c) => c.kind !== 'side').length);
    }
    return freshFlowColumns;
  };
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
  // A right-to-left page's flow is the sheet mirrored, and the trim and
  // bleed boxes, centred on the sheet, are their own mirror images: the
  // physical frames serve it unchanged.
  // The leaf composed pages are laid out on in a host whose page is not
  // one (`composedViewerLeaf`, #1045): the print page's size and margins,
  // with no cut marks. A composed page set there takes the leaf's size,
  // content area and frames (`leafPages`).
  const leafConfig = resolved.composedViewerLeaf;
  const leaf = leafConfig
    ? (() => {
        const leafResolved = composedLeafConfig(resolved)!;
        const metrics = computePageMetrics(leafResolved);
        return {
          resolved: leafResolved,
          metrics,
          physical: { page: metrics.physical.trimBox, bleed: metrics.physical.bleedBox },
          vertical: { page: sheetRectToFlow(metrics.physical.trimBox, metrics.pageWidthPx), bleed: sheetRectToFlow(metrics.physical.bleedBox, metrics.pageWidthPx), upright: true },
        };
      })()
    : undefined;
  const leafPages = new WeakSet<VDTPage>();
  const designFramesOn = (page: VDTPage | undefined): { page: BoundingBox; bleed: BoundingBox; upright?: boolean } => {
    if (leaf && page && leafPages.has(page)) return pageIsVertical(page) ? leaf.vertical : leaf.physical;
    return page && pageIsVertical(page) ? verticalFrames : physicalFrames;
  };
  /** Give a fresh page the leaf's geometry (when a host sets one), for a
   *  composed page to be laid on it. */
  const toLeaf = (page: VDTPage): void => {
    if (!leaf || leafPages.has(page)) return;
    const { metrics } = leaf;
    const shaped = createPageWithColumns(page.index, leaf.resolved, metrics.contentArea, metrics.pageWidthPx, metrics.pageHeightPx, pageIndexOffset);
    page.width = shaped.width;
    page.height = shaped.height;
    page.contentArea = shaped.contentArea;
    page.columns = shaped.columns;
    if (shaped.flow) page.flow = shaped.flow;
    else delete page.flow;
    leafPages.add(page);
  };
  doc.trimOffset = trimOffset;
  // A right-bound book (`page.binding`): hosts show its spreads mirrored.
  if (resolved.page.binding === 'right') doc.binding = 'right';

  // Create first page
  const firstPage = createPageWithColumns(0, resolved, state.contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
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
  // Citations (#268): formatted against the book's references (or set as
  // notes under a note style) before the notes leave the flow; the
  // bibliography takes `:::bibliography`'s place or follows the text.
  // Arabic vowel marks out of the text when `bodyText.tashkil` says so
  // (#376), for the outline and the layout alike.
  // A configuration stored before #620 prints the backslashes of forced
  // line breaks (`bodyText.hardLineBreaks: false`).
  // Code fences (#624) as `codeStyle` reads them: a configuration stored
  // before #624 reads their lines as Markdown (`codeStyle.blocks: false`).
  const parsedBody = numberTitlesFor(headingMarksFor(tashkilFor(literalBreaksFor(parseMarkdownMemo(markdownBody, codeParseOptions(resolved)), resolved), resolved.bodyText.tashkil), resolved), resolved);
  // A figure's own words (#935): its alt, caption and note replace the
  // resource's in this chapter, for the layout, the references and every
  // output alike.
  if (content.resources) {
    const worded = withFigureWords(content.resources, parsedBody);
    if (worded !== content.resources) content = { ...content, resources: worded };
  }
  const citationContext = content.citations
    ?? (needsCitationContext(parsedBody, frontmatterMeta) ? bookCitationContexts([{ metadata: frontmatterMeta as Record<string, unknown>, blocks: parsedBody }], content.resources)[0] : undefined);
  // `citations.hyphenateNames: false`: the cited authors' names are never
  // divided, in a citation, in the text or in the bibliography (#699).
  if (citationContext && !resolved.citations.hyphenateNames) {
    setHyphenationRules({ ...hyphenationRules, names: citedNames(citationContext.items) });
  }
  const citationsApplied = citationContext
    ? applyCitations(
      parsedBody,
      citationContext,
      processCitations(citationContext, resolved, citationLocale(resolved, resolvedLocale(resolved))),
      resolved,
      resolvedLocale(resolved),
    )
    : undefined;
  // The citations of resource captions and notes (#529), formatted with
  // the text's.
  const captionCitations = citationsApplied && citationsApplied.captions.size > 0 ? citationsApplied.captions : undefined;
  // Exercises (#1227): each set as a box of ordinary blocks, its solutions
  // where the book prints them.
  const exerciseExpansion = needsExerciseExpansion(citationsApplied?.blocks ?? parsedBody)
    ? expandDocumentExercises(
      citationsApplied?.blocks ?? parsedBody,
      resolved,
      computeColumnBboxes(pageMetrics.contentArea, resolved)[0]?.width ?? pageMetrics.contentArea.width,
      continuation,
      content.outline,
    )
    : undefined;
  if (exerciseExpansion) {
    resolved = withExerciseStyles(resolved);
    // The document's config names the exercises' chip and paragraph
    // styles too: an output that styles its text from the config (a
    // reflowable EPUB, #1231) finds them there.
    doc.config = resolved;
    doc.exercises = exerciseExpansion.records;
    doc.exerciseDigital = exerciseDigitalOf(exerciseSettingsFor(resolved));
  }
  const footnoteSplit = splitFootnoteDefinitions(exerciseExpansion?.blocks ?? citationsApplied?.blocks ?? parsedBody);
  const footnoteDefs = footnoteSplit.defs;
  // Numbered by page or column (`numbering: 'page'`), a note takes the
  // number the previous build gave it where it landed; the first build
  // numbers by chapter (see `buildDocumentNumbered`).
  // A decimal note number is written in the document's digits.
  const footnoteNumbering = numberFootnotes(
    footnoteSplit.blocks,
    resolved.footnotes.numbering,
    resolved.footnotes.numbering === 'document' ? Math.max(0, Math.floor(continuation?.footnoteNumber ?? 0)) : 0,
    footnoteFormatOf(resolved.footnotes, resolved.numerals),
    resolved.footnotes.markerTemplate,
  );
  if (hints.footnoteNumbers) {
    for (const [id, number] of hints.footnoteNumbers) {
      if (footnoteNumbering.numbers.has(id)) footnoteNumbering.numbers.set(id, number);
    }
  }
  const chapterEndNotes = resolved.footnotes.placement === 'chapterEnd' && footnoteNumbering.numbers.size > 0;
  const parsedBlocks = chapterEndNotes
    ? appendChapterEndNotes(footnoteSplit.blocks, footnoteNumbering, footnoteDefs, noteNumberPositionOf(resolved.footnotes, resolved.layout.writingMode === 'vertical-rl'), resolved.footnotes.numberGap)
    : footnoteSplit.blocks;
  const headingStart = continuation?.headings;
  // `:::toc` expands into the entries of the book's outline — the one the
  // host supplied, else this document's own (page labels unknown on the
  // first pass; `buildDocument` lays the document out again with them).
  // `:::index` expands into the entries of the book's index marks, from
  // the same outline.
  // A reference naming an anchor (#262) reads its number, title and page
  // from the same outline.
  const resourceIds = new Set((content.resources ?? []).map((r) => r.id));
  const anchorRefs = hasAnchorRefs(parsedBlocks, resourceIds);
  const outline = content.outline
    ?? (hasTocDirective(parsedBlocks) || hasIndexDirective(parsedBlocks) || anchorRefs
      // A reference to an exercise prints its name (#1225).
      ? nameExerciseAnchors(computeOutline(parsedBlocks, resolved, headingStart, continuation?.statementCounters), exerciseExpansion?.records ?? [])
      : undefined);
  // A story carried in from another chapter (#943) may refer to anchors too.
  const carriedRefs = continuation?.jumps?.some((j) => j.outline) === true;
  const anchorRefContext: AnchorRefContext | undefined = anchorRefs || carriedRefs
    ? { targets: anchorTargetsOf(outline), strings: resolved.crossRefs }
    : undefined;
  const indexExpanded = expandIndexDirectives(expandTocDirectives(parsedBlocks, outline, resolved), outline, resolved);
  // Labelled equations and counted boxes (#530): the numbers go into the
  // formulas (as tags) and the boxes (a run-in label or a title), a
  // reference inside a formula prints the number it names, and a style's
  // end mark closes its boxes.
  const statementNumbering = numberStatements(parsedBlocks, resolved, {
    ...(headingStart ? { headings: headingStart } : {}),
    ...(continuation?.statementCounters ? { counters: continuation.statementCounters } : {}),
  });
  const numberedBlocks = applyStatementNumbering(indexExpanded.blocks, statementNumbering, resolved, outlineLookup(content.outline ? anchorTargetsOf(content.outline) : undefined));
  // An inline `::resource` placed `here` with `span: 'page'` spans the
  // page where it stands (#535): each goes in a frameless page-span box,
  // set by the span-block path like any other.
  // A `:::columns` group in the running text (#634): each in a frameless
  // box the callout machinery places, cuts and splits.
  // Composed pages (#855): each page's content regrouped into the stories
  // its template's frames receive, one frameless box each (set at the
  // page's template, below). Before the main-flow groups: a `:::columns`
  // in a frame is a group of its box.
  const templateSource = { pageTemplates: resolved.pageTemplates, calloutStyles: resolved.calloutStyles };
  const composedWrap = wrapComposedPages(numberedBlocks, templateSource);
  // A comic page's text panels (#885): each panel's Markdown in a story
  // box of the same kind, set in the panel's frame (below).
  const comicText = wrapComicTextPanels(composedWrap.blocks, comicTextPanelsSupported(resolved));
  const flowGroups = resolved.layout.flowColumns ? wrapFlowColumns(comicText.blocks) : { blocks: comicText.blocks, wrapped: false };
  const spanEmbeds = wrapPageSpanEmbeds(flowGroups.blocks, content.resources ?? [], effectiveResourceTypes(config, content.resources ?? []));
  // Code listings (#624): each in a box of the code style, which the
  // callout machinery places and splits.
  // Music scores (#1172): each engraved at the width of the flow's first
  // column, one block per system.
  const scores = expandScoreBlocks(spanEmbeds.blocks, resolved, computeColumnBboxes(pageMetrics.contentArea, resolved)[0]?.width ?? pageMetrics.contentArea.width);
  const codeBoxes = wrapCodeBlocks(scores.blocks, resolved);
  const contentBlocks = codeBoxes.blocks;
  // Stories of earlier chapters that jump into a page of this one (#943):
  // appended past the chapter's blocks by the composed pages' layout, with
  // the notes they cite numbered as their chapter numbered them.
  const carried = continuation?.jumps && continuation.jumps.length > 0 ? importJumps(continuation.jumps, contentBlocks.length, bodyOffset) : undefined;
  for (const note of carried?.footnotes ?? []) {
    footnoteNumbering.numbers.set(note.id, note.number);
    if (note.def) footnoteDefs.set(note.id, note.def);
  }
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
  const resources: Resource[] = content.resources ?? [];
  const resourceTypes: ResourceType[] = effectiveResourceTypes(config, resources);
  const headingContext = computeHeadingContext(contentBlocks, headingStart, isNumbered);
  const numberingState = computeResourceNumberingState(
    contentBlocks,
    resourceTypes,
    resources,
    headingContext,
    continuation ? { counters: continuation.resourceCounters, numbered: continuation.resourceNumbers } : undefined,
    resolved.numerals,
    documentLocale(config),
  );
  const resourceNumbering: ResourceNumberingMap = numberingState.map;
  /** The numbers of the strips counted in a resource type (#590). */
  const stripNumbers = numberingState.strips;

  // Lookups threaded into block-kind resolution + measurement.
  const resourceById = new Map<string, Resource>();
  for (const r of resources) resourceById.set(r.id, r);
  const resourceTypeById = new Map<string, ResourceType>();
  for (const t of resourceTypes) resourceTypeById.set(t.id, t);
  const resourceNumberById = new Map<string, string>();
  for (const [id, entry] of Object.entries(resourceNumbering)) {
    resourceNumberById.set(id, entry.number);
  }
  // The labels of each `:::figure` (#862), by resource: a figure that
  // floats is laid out by its id alone.
  const figureLabelsById = new Map<string, { labels: VDTFigureLabel[]; parsed: NonNullable<ContentBlock['figure']>['labels'] }>();
  for (const b of contentBlocks) {
    const labels = b.resourceId !== undefined && !figureLabelsById.has(b.resourceId) ? figureLabels(b, bodyOffset) : undefined;
    if (labels) figureLabelsById.set(b.resourceId!, { labels, parsed: b.figure!.labels });
  }

  // Resolve styles
  const bodyStyle = resolveBodyStyle(resolved);
  // The callout styles, with the frameless box of the page-span embeds
  // when there are any: the float gap (a line) above and below it, as an
  // inline resource keeps in a column.
  // The listings' box (#624) likewise.
  const syntheticBoxes = [
    ...(spanEmbeds.wrapped ? [spanEmbedStyle(bodyStyle.lineHeightPx, resolved.layout.inlineResourceGap !== 'above')] : []),
    ...(codeBoxes.wrapped ? [codeBoxStyle(resolved)] : []),
    // The boxes exercises are set in (#1227).
    ...(exerciseExpansion?.wrapped ? exerciseExpansion.boxes : []),
    // The frameless box of a composed page's story (#855).
    ...(composedWrap.wrapped || comicText.wrapped ? [frameBoxStyle(Math.max(resolved.bodyText.avoidOrphans ? resolved.bodyText.orphanMinLines : 1, resolved.bodyText.avoidWidows ? resolved.bodyText.widowMinLines : 1))] : []),
    // The boxes of main-flow groups: sub-columns a body line apart in the
    // text column, a gutter apart across the page.
    ...(flowGroups.wrapped
      ? flowColumnsStyles(
        bodyStyle.lineHeightPx,
        dimensionToPx(resolved.layout.gutterWidth, resolved.page.dpi, bodyStyle.fontSizePx),
        resolved.bodyText.paragraphSpacing === false ? { value: 0, unit: 'px' } : { value: bodyStyle.marginBottomPx, unit: 'px' },
        Math.max(resolved.bodyText.avoidOrphans ? resolved.bodyText.orphanMinLines : 1, resolved.bodyText.avoidWidows ? resolved.bodyText.widowMinLines : 1),
      )
      : []),
  ];
  const exerciseBoxIds = new Set(exerciseExpansion?.wrapped ? exerciseExpansion.boxes.map((b) => b.id) : []);
  const calloutStyles = syntheticBoxes.length > 0
    ? [...resolved.calloutStyles, ...resolveCalloutStylesConfig(syntheticBoxes, resolved.bodyText, resolved.headings, resolved.unorderedLists, config?.locale)
      // The exercise boxes' defaults (a solutions title, a bank's frame)
      // link to `main-color`: set them to the document's palette.
      .map((s) => (exerciseBoxIds.has(s.id) ? relinkToPalette(s, config?.colorPalette) : s))]
    : resolved.calloutStyles;
  // The exercises' frames, banks and solutions boxes are named in the
  // document's config too, as their chips are: an output that styles its
  // boxes from it (a reflowable EPUB) finds them (#1244). Drawn boxes are
  // pictures there.
  if (exerciseExpansion?.wrapped) {
    const own = calloutStyles.filter((s) => exerciseBoxIds.has(s.id) && !s.design?.enabled);
    if (own.length > 0) doc.config = { ...doc.config, calloutStyles: [...doc.config.calloutStyles, ...own] };
  }
  // A box nested in another looks its style up in the configuration it is
  // laid out with: the listings' box among them.
  const calloutResolved: ResolvedConfig = codeBoxes.wrapped || flowGroups.wrapped || composedWrap.wrapped || comicText.wrapped || exerciseExpansion?.wrapped ? { ...resolved, calloutStyles } : resolved;
  const blockquoteStyle = resolveBlockquoteStyle(resolved);
  const listLevelIndentsPx = computeLevelIndentsPx(resolved, bodyStyle.fontSizePx);
  const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, resolved, bodyStyle.fontSizePx);
  const orderedLevelIndentsPx = computeOrderedLevelIndentsPx(
    resolved,
    bodyStyle.fontSizePx,
    orderedMetrics.maxWidthByDepth,
  );
  // `:::paragraphs{style="…"}` containers, resolved per content-block index.
  let containerStyles = chapterEndNotes ? withFootnoteStyle(resolved) : resolved;
  if (citationsApplied?.bibliography) containerStyles = withBibliographyStyle(containerStyles, citationsApplied.labelChars);
  const paragraphContainers = planParagraphContainers(contentBlocks, containerStyles);
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
    (blockIdx) => sectionWritingMode(sectionPlan, resolved, blockIdx) === 'vertical-rl', resolved.layout.floatShrink, resolved.layout.wrap,
    resolved.layout.floatsAtCitingPage);
  // A composed page's pictures are set in its frames: a `::resource` a
  // story holds does not float. A reference in a frame to a picture set
  // elsewhere floats from the page's end, to the pages after it.
  const composedPlans = planComposedPages(contentBlocks, calloutPlan, templateSource);
  // A comic page's text panels (#885) likewise.
  const comicTextPlans = comicText.wrapped ? planComicTextPanels(contentBlocks, calloutPlan) : new Map<number, PlannedComposedPage>();
  if (composedPlans.size > 0 || comicTextPlans.size > 0) {
    for (let k = floatPlan.length - 1; k >= 0; k--) {
      const f = floatPlan[k]!;
      const page = composedPageAt(composedPlans, f.firstBlockIdx) ?? composedPageAt(comicTextPlans, f.firstBlockIdx);
      if (!page) continue;
      const raw = contentBlocks[f.firstBlockIdx];
      if (raw?.type === 'resourceBlock' && raw.resourceId === f.resourceId && page.storyAt(f.firstBlockIdx)) floatPlan.splice(k, 1);
      else f.firstBlockIdx = page.endIdx;
    }
  }
  const floatedIds = floatedResourceIds(floatPlan, incorporated, resources, resourceTypes);
  const floatsByFirstBlock = new Map<number, PlannedFloat[]>();
  for (const f of floatPlan) {
    const list = floatsByFirstBlock.get(f.firstBlockIdx);
    if (list) list.push(f);
    else floatsByFirstBlock.set(f.firstBlockIdx, [f]);
  }
  /** Floated boxes (`placement: 'auto' | 'top' | 'bottom'`, `span` column / page):
   *  a `:::callout` that leaves the flow like a resource and takes the
   *  first free band after the point it occurs at — the foot of the
   *  current page, or the head / foot of a page the flow opens later —
   *  while the text after it fills the page it left. Keyed by the fence's
   *  content index; the pending float carries the synthetic id
   *  `callout:<idx>` (see `calloutFloatOf`). */
  const calloutFloats = new Map<number, { plan: PlannedCallout; style: ResolvedCalloutStyleConfig; L: CalloutLayouter }>();

  // Placement cursor
  const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };

  // Pages whose break into the next page is explicit rather than natural
  // overflow. Column balancing leaves their last column short (a chapter's
  // closing page legitimately ends early).
  const forcedBreakPages = new Set<number>();
  /** True bottoms of capped columns (restored when the span block cuts). */
  const uncappedBottoms = new Map<VDTColumn, number>();
  /** The opener's own columns a float took the head of, under the opener:
   *  where the float's band ends, the flow's position right after it. */
  const openerHeadFloats = new Map<VDTColumn, number>();

  const {
    pendingFloats, pendingSideBoxes, openerPages, openerFloatRule, openerFloatNotes, noteOpenerFloat,
    awaitingSideBoxes, multiColumnBand, enqueuedFloatIds, enqueueFloatsFor, citationGates,
    awaitsCitation, releaseStaleCitationGates, gateCitedFloats, regateCitedFloats, gateBoxCitations,
    releaseBoxCitations, citedLinesPlaced
  } = createFloatQueue({
    resolved, doc, bodyOffset, contentBlocks, floatsByFirstBlock, calloutFloats, cursor, state, late
  });

  const {
    CALLOUT_FLOAT_PREFIX, calloutFloatOf, COMIC_STRIP_PREFIX, comicStripOf, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, shiftStripLines
  } = createStrips({
    cache, resolved, doc, bodyOffset, contentBlocks, resources, resourceTypes, resourceNumbering,
    stripNumbers, resourceById, resourceTypeById, bodyStyle, calloutFloats, cursor
  });

  const {
    calloutFloatResults, calloutBandPages, enqueueCalloutFloat, acrossWidth, floatGapPx, minTextPx,
    offsetResourceBlockToAbsolute, layoutFloat, rotationFor, uprightOn, tableRowCount, tableOverflow,
    sliceOf, tableMetrics, measureFloat, buildFloatBlock, rotatedFlushEnd, floatReserved,
    centredPages, reservedOf, wrapExclusionWidth, textWrapNotes, movedNotes, wrapContourOf,
    floatWraps, openFloatWraps, floatHeadOf, capOrigin, topFloatRefOf, capKindOf
  } = createFloatMeasure({
    cache, balanceExtraPx, bandCaps, resolved, dpi, baselineGrid, doc, pageIndexOffset,
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
    captionUnderProposals, asideCutBy, shortSideColumn, resolved, dpi, baselineGrid, bodyOffset,
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
    citingPageFloats, resolved, doc, pageWidthPx, pageHeightPx, contentBlocks, resourceById,
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
    cache, resolved, headingLevels, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx,
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
    resolved, headingLevels, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx,
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
    bandCaps, floatPages, resolved, headingLevels, baselineGrid, doc, designFramesOn, resourceById,
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
    resolved, headingLevels, baselineGrid, doc, continuation, afterPartPage, pageWidthPx,
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
    resolved, headingLevels, doc, pageIndexOffset, bodyOffset, contentBlocks, chapterNumberByBlock,
    resourceById, calloutResolved, paragraphContainers, partPlan, sectionPlan, stripGeometry,
    buildComicStripBlock, withStripPlaceholder, floatGapPx, measureCtx, partMeasureCtx, cursor,
    sectionMeasureCtx, stampCalloutSource, state
  });
  Object.assign(late, { makeCalloutLayouter, mirroredOf, paintedBottom, bandUsedBottomWithSide });

  const {
    placeCalloutSpan, nextIsBarrier, rectsOverlap
  } = createCalloutSpan({
    bandCaps, resolved, headingLevels, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
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
    resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, contentBlocks,
    bodyStyle, floatGapPx, offsetResourceBlockToAbsolute, wrapExclusionWidth, textWrapNotes,
    sideObstacles, onNewPage, onAtomicNewPage, cursor, stampBlockExtras, atColumnHead,
    sideObstacleColumn, enterBand, stampCalloutSource, mirroredOf, state
  });

  const {
    placeCalloutInline
  } = createCalloutInline({
    balanceExtraPx, resolved, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset,
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
    resolved, doc, bodyOffset, contentBlocks, partPlan, sectionPlan, pendingFloats, openerPages,
    openerFloatRule, citationGates, capKindOf, probeFloatBand, availableAfterBand, partMeasureCtx,
    cursor, sectionMeasureCtx, openerHeadOf, state
  });
  Object.assign(late, { shortListBoxAt });

  const {
    breakToEvenPage, placeComicSpread, looseStripBoxes, placeComicStrip, measureCtxOf
  } = createComics({
    resolved, dpi, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
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
    content, resolved, dpi, doc, pageIndexOffset, pageWidthPx, pageHeightPx, designFramesOn, toLeaf,
    markdownBody, bodyOffset, captionCitations, footnoteDefs, footnoteNumbering, templateSource,
    contentBlocks, carried, headingPrefixes, headingNumbers, chapterNumberByBlock, resourceById,
    resourceTypeById, resourceNumberById, bodyStyle, calloutStyles, calloutResolved,
    orderedLevelIndentsPx, paragraphContainers, partPlan, sectionPlan, composedPlans, comicTextPlans,
    floatedIds, floatGapPx, calloutsOutOfFlow, joiningLetterSpacing, dropCapNotes, cursor,
    closeFlowSegment, leaveCurrentPage, flushPendingNumberingAtBoundary, framePass, mirroredOf,
    breakToEvenPage, state
  });
  Object.assign(late, { placeComicText });

  for (let blockIdx = 0; blockIdx < contentBlocks.length; blockIdx++) {
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
    if (state.skipPartUntil !== null) {
      if (blockIdx >= state.skipPartUntil) state.skipPartUntil = null;
      continue;
    }
    if (!resolved.parts.page && rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockIdx);
      if (plan) {
        const end = [...partPlan.byEnd].find(([, p]) => p === plan)?.[0] ?? blockIdx;
        const marks = (doc.partMarks ??= []);
        if (!marks.some((m) => m.afterContentIndex === end)) marks.push({ afterContentIndex: end, number: plan.number, title: plan.title, ...(plan.palette && Object.keys(plan.palette).length > 0 ? { palette: plan.palette } : {}) });
        state.skipPartUntil = end;
        continue;
      }
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'part') {
      const plan = partPlan.byStart.get(blockIdx);
      if (plan) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockIdx);
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
        continue;
      }
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerName === 'part') {
      const plan = partPlan.byEnd.get(blockIdx);
      if (plan) {
        state.pendingSpacing = 0;
        // Deferred until the next placed block so a part that closes the
        // document leaves no trailing empty page behind.
        if (resolved.parts.breakAfter.enabled) state.pendingPartBreak = resolved.parts.breakAfter.parity;
        continue;
      }
    }
    if (state.pendingPartBreak !== null) {
      const parity = state.pendingPartBreak;
      state.pendingPartBreak = null;
      state.pendingSpacing = 0;
      closeFlowSegment(blockIdx);
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
        breakForPaper(blockIdx);
      } else {
        state.pendingPaperBreak = true;
      }
      continue;
    }
    if (state.pendingPaperBreak) {
      state.pendingPaperBreak = false;
      breakForPaper(blockIdx);
    }
    // A composed page (`::::page{template=…}`, #855): it owns a fresh page,
    // its template's frames filled with its stories (`layoutComposedPage`);
    // nothing flows on it, and what follows starts on the next page. A
    // story whose frame this side lacks, and content no frame takes, are
    // set in the flow there. A page whose template is unknown is set in
    // the flow on pages of its own (`templateUnknown`).
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'composedPage') {
      const planned = composedPlans.get(blockIdx);
      state.pendingComposedBreak = false;
      if (planned && rawBlock.composedPage) placeComposedPage(planned, rawBlock.composedPage);
      else breakForPaper(blockIdx);
      continue;
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerName === 'composedPage') {
      // (Set to `'page'` by `placeComposedPage`, a closure the flow
      // analysis does not follow.)
      if ((state.pendingComposedBreak as false | 'page' | 'flow') !== 'page') state.pendingComposedBreak = 'flow';
      continue;
    }
    const composedBreak = state.pendingComposedBreak as false | 'page' | 'flow';
    if (composedBreak === 'flow') {
      state.pendingComposedBreak = false;
      breakForPaper(blockIdx);
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
        closeFlowSegment(blockIdx);
        leaveCurrentPage();
        cursor.columnIndex = 0;
        if (isComicSpread(rawBlock.comic)) placeComicSpread(rawBlock.comic, comicTextPlans.get(blockIdx));
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
          const textPlan = comicTextPlans.get(blockIdx);
          if (textPlan) placeComicText(page, page.comic, textPlan);
        }
        state.pendingComicBreak = true;
        flushPendingNumberingAtBoundary();
      }
      continue;
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
        const rewind = placeComicStrip(blockIdx, rawBlock.comic);
        if (rewind !== undefined) {
          blockIdx = rewind;
          continue;
        }
      }
      flushPendingNumberingAtBoundary();
      continue;
    }
    // The box of a page-wide strip set `here` (`wrapPageSpanEmbeds`) cuts a
    // band of several columns; elsewhere the strip is set in the flow as any
    // strip, its box markers passed over.
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout'
      && rawBlock.containerAttrs?.type === SPAN_EMBED_STYLE_ID && isPageSpanStrip(contentBlocks[blockIdx + 1])
      && !multiColumnBand(doc.pages[cursor.pageIndex]!)) {
      looseStripBoxes.add(rawBlock.containerId!);
      continue;
    }
    if (rawBlock.type === 'containerEnd' && rawBlock.containerId !== undefined && looseStripBoxes.has(rawBlock.containerId)) {
      // What the strip owes below it passes through its box's closing marker.
      // (Set by the strip's placement, in a callback the flow analysis
      // does not follow.)
      const owed = state.inlineGapOwed as { afterIdx: number; pending: number; exact: number; container?: boolean } | null;
      if (owed && owed.afterIdx === blockIdx - 1) state.inlineGapOwed = { ...owed, afterIdx: blockIdx };
      continue;
    }
    if (rawBlock.type === 'containerStart' && rawBlock.containerName === 'callout') {
      const plan = calloutPlan.get(blockIdx);
      if (plan && pickCalloutStyle(calloutStyles, plan.attrs.type)) {
        // A float barrier box (e.g. a chapter's closing "key points")
        // takes every pending float first — in the current page's free
        // slots, else on pages opened ahead of it — so no float escapes
        // past it. The page stays balanceable (no forced break).
        // A page-span barrier box drains inside `placeCalloutSpan`, once
        // the page-span figures before it have taken the band cut.
        if (pickCalloutStyle(calloutStyles, plan.attrs.type)!.floatBarrier && !spanBoxAt(blockIdx)) {
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
      const owed: typeof state.inlineGapOwed = rawBlock.type === 'containerEnd' && state.inlineGapOwed?.container
        && state.inlineGapOwed.afterIdx === blockIdx - 1 && state.pendingSpacing === state.inlineGapOwed.pending
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
        } else if (contentBlocks[blockIdx - 1]?.type !== 'paragraph') {
          const margin = pc.marginBottomPx;
          owedExact = margin < 0 ? owedExact + margin : Math.max(owedExact, margin);
          state.pendingSpacing = collapse(margin);
        }
      }
      if (owed) state.inlineGapOwed = { afterIdx: blockIdx, pending: state.pendingSpacing, exact: owedExact, container: true };
      continue;
    }

    // --- Heading `breakBefore` ----------------------------------------
    if (rawBlock.type === 'heading' && rawBlock.level) {
      const level = headingLevels.forBlock(rawBlock);
      const bb = level?.breakBefore;
      /** The heading opens its page (#749): with its own break, or as the
       *  first block of the document. */
      let opensPage = blockIdx === firstFlowBlockIdx;
      if (bb && bb.enabled) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockIdx);
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
      if (level?.span === 'page' && !(level.spanBreak === false && !bb?.enabled && openSpanHeadingHere(blockIdx, rawBlock, level))) {
        state.pendingSpacing = 0;
        closeFlowSegment(blockIdx);
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
      state.pendingSpacing = 0;
      advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
    const figureGrowPx = rawBlock.type === 'resourceBlock' ? balanceExtraPx?.get(flexFigureKey(blockIdx)) ?? 0 : 0;
    const figureDelta = figureGrowPx > 0 ? { figureHeightDelta: figureGrowPx } : {};
    let measuredBlock = tryLoose
      ? measureLooseParagraph(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, styleOverride, looseLines, trackingLadder, looseOutcome, looseOffGrid)
      : measureContentBlock(rawBlock, blockIdx, measureWidth, blockMeasureCtx, { styleOverride, ...upright, ...figureDelta });
    // A resource set in the text with `captionSide` (#729): its caption and
    // note go to the band's side column when that is free beside it, and
    // the block is as tall as the body alone. Decided again in every
    // column the block is tried in (see the resource branch below).
    const asideWanted = measuredBlock?.kind.vdtType === 'resource' && rawBlock.type === 'resourceBlock'
      && inlineAsideWanted(measuredBlock.kind.resource, measuredBlock.kind.resourceType, blockPage);
    let inlineAside: InlineAside | null = asideWanted
      ? measureInlineAside(rawBlock, blockIdx, col, blockPage, blockMeasureCtx, { styleOverride, ...figureDelta }, Math.max(state.pendingSpacing, floatGapPx))
      : null;
    if (inlineAside) measuredBlock = inlineAside.block;
    const asideOpts = inlineAside?.opts;
    // An inline picture with a safe area a little too tall for the room
    // left in its column is cropped within its safe area to stay there
    // rather than move on and leave the column short (#442).
    if (measuredBlock?.kind.vdtType === 'resource' && measuredBlock.resourceBlock?.bodyFlex) {
      const flex = measuredBlock.resourceBlock.bodyFlex;
      const room = col.availableHeight - (atColumnHead(col) ? 0 : Math.max(state.pendingSpacing, floatGapPx));
      const over = measuredBlock.measured.totalHeight - room;
      if (over > 0.01 && room > 0 && over <= flex.shrink + 0.01) {
        const cropped = measureContentBlock(rawBlock, blockIdx, measureWidth, blockMeasureCtx, {
          styleOverride, ...upright, ...asideOpts, figureHeightDelta: flex.delta - over,
        });
        if (cropped && cropped.measured.totalHeight <= room + 0.01) measuredBlock = cropped;
      }
    }
    // Screen pages (`layout.fitFiguresToPage`): an inline figure a little
    // too tall for the room left in its column — under an opener band, say
    // — is set smaller to stay with its text rather than leave the rest of
    // the page empty. Never below MIN_INLINE_FIGURE_SCALE of its size.
    if (measuredBlock?.kind.vdtType === 'resource' && resolved.layout.fitFiguresToPage) {
      const rb = measuredBlock.resourceBlock;
      const room = col.availableHeight - (atColumnHead(col) ? 0 : Math.max(state.pendingSpacing, floatGapPx));
      if (rb && !rb.table && !rb.rotation && rb.bodyRect.height > 0 && measuredBlock.measured.totalHeight > room + FIT_EPS && room > 0) {
        let width = rb.bodyRect.width;
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = measuredBlock.resourceBlock!;
          const rest = measuredBlock.measured.totalHeight - current.bodyRect.height;
          const scale = (room - rest) / current.bodyRect.height;
          if (!(scale > 0)) break;
          width = current.bodyRect.width * Math.min(scale, 0.99);
          if (width < rb.bodyRect.width * MIN_INLINE_FIGURE_SCALE) break;
          const smaller = measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride, ...asideOpts, figureMaxBodyWidth: width });
          if (!smaller) break;
          measuredBlock = smaller;
          if (smaller.measured.totalHeight <= room + FIT_EPS) break;
        }
        // Still too tall at the smallest acceptable size: back to full size
        // and on to the next column, as without the option.
        if (measuredBlock!.measured.totalHeight > room + FIT_EPS) {
          measuredBlock = measureContentBlock(rawBlock, blockIdx, col.bbox.width, blockMeasureCtx, { styleOverride, ...asideOpts });
        }
      }
    }
    // The fits above keep the caption at the side: they work on the body.
    if (inlineAside) inlineAside = measuredBlock?.asideHeight !== undefined ? { ...inlineAside, block: measuredBlock } : null;
    if (tryLoose && budget !== undefined && knownOutcome === undefined && typeof looseOutcome.get(blockIdx) === 'number') {
      looseGained.set(budget.group, (looseGained.get(budget.group) ?? 0) + 1);
    }
    if (!measuredBlock) continue;
    const { kind, contentBlock, measured, prefixLen, absoluteSourceMap, mathDisplayRender } = measuredBlock;
    /** The drop cap opening the paragraph (#623): stamped on the fragment
     *  that holds its first line. A paragraph broken again for a column of
     *  another width takes the one of that setting. */
    let capInfo = measuredBlock.dropCap;
    /** Tracking the block's lines are set with; a paragraph moved whole into
     *  a column of another width is measured again, and may change it. */
    let { letterSpacingPx, runtTracking } = measuredBlock;
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

    // --- Resource blocks (image / svg / table + caption) -----------------
    // Placed atomically (kept-together) — no mid-content split for v1.
    if (vdtType === 'resource') {
      let resourceBlock = measuredBlock.resourceBlock!;
      let groupHeight = measured.totalHeight;
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
      // Text wrap (#627): a picture the text after it may run beside, at
      // its side of the column — unless the text left beside it would be
      // too narrow, or the picture too short to set lines beside.
      const wrapSettings = blockMeasureCtx.resolved.layout.wrap;
      const wrapSpec = kind.resource && !pageIsVertical(blockPage)
        ? resolveResourceWrap(kind.resource, kind.resourceType, wrapSettings)
        : undefined;
      // Vertical text keeps its figures' bands whole (horizontal wrap only).
      if (kind.resource && pageIsVertical(blockPage) && resolveResourceWrap(kind.resource, kind.resourceType, wrapSettings)) {
        textWrapNotes.push({
          kind: 'textWrap', reason: 'verticalText', resourceId: kind.resource.id,
          sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
        });
      }
      let wrapGap = 0;
      let wraps = false;
      if (wrapSpec) {
        wrapGap = wrapGapPx(wrapSpec.gap, dpi, bodyStyle.fontSizePx, floatGapPx);
        const textWidth = col.bbox.width * (1 - wrapSpec.width) - wrapGap;
        const linesBeside = Math.ceil((groupHeight + wrapGap - 0.01) / bodyStyle.lineHeightPx);
        const reason = textWidth + 0.01 < minTextWidthPx(wrapSettings.minTextWidth, col.bbox.width, dpi, bodyStyle.fontSizePx)
          ? 'tooNarrow' as const
          : linesBeside < wrapSettings.minLinesBeside ? 'fewLines' as const : undefined;
        if (reason) {
          textWrapNotes.push({
            kind: 'textWrap', reason, resourceId: kind.resource!.id,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
          });
        } else {
          wraps = true;
        }
      }
      // An inline resource keeps the float gap (a line) above it, as a
      // float would, unless the block before asked for more. A wrapped one
      // stands level with the next line's top instead.
      const spacingBefore = wraps ? state.pendingSpacing : Math.max(state.pendingSpacing, floatGapPx);
      // An inline table that does not fit the room left in its column is
      // cut between rows (#634), by the rules of a floated one.
      const sliced = !wraps && !resourceBlock.rotation && resourceBlock.table && kind.resource
        ? placeInlineTableSlices(rawBlock, blockIdx, blk, blockMeasureCtx, styleOverride, kind.resource, groupHeight, spacingBefore, asideWanted)
        : 'whole';
      if (sliced === 'dropped') {
        flushPendingNumberingAtBoundary();
        continue;
      }
      const columnBefore = col;
      // The room the embed leaves when it moves on (#1151).
      const roomBefore = col.availableHeight;
      const pageBefore = cursor.pageIndex;
      if (sliced === 'whole') {
        enterBand(blockIdx, 0);
        // A side caption is decided where the block is placed (#729): an
        // embed that does not fit its column moves on by the rule of
        // `placeAtomicBlock`, and in each column it reaches its caption
        // goes to the side when the side column is free there, else under
        // the body.
        if (asideWanted) {
          let decidedFor: VDTColumn = col;
          let plain: MeasuredContentBlock | null | undefined = inlineAside ? undefined : measuredBlock;
          for (let guard = 0; ; guard++) {
            const c = currentColumn(doc, cursor);
            if (c !== decidedFor) {
              decidedFor = c;
              inlineAside = measureInlineAside(rawBlock, blockIdx, c, doc.pages[cursor.pageIndex]!, blockMeasureCtx, { styleOverride, ...figureDelta }, spacingBefore);
              if (!inlineAside && plain === undefined) {
                plain = measureContentBlock(rawBlock, blockIdx, measureWidth, blockMeasureCtx, { styleOverride, ...figureDelta });
              }
              const next = inlineAside?.block ?? plain;
              if (next?.resourceBlock) {
                resourceBlock = next.resourceBlock;
                groupHeight = next.measured.totalHeight;
              } else {
                inlineAside = null;
              }
            }
            const available = c.availableHeight - (c.blocks.length === 0 ? 0 : spacingBefore);
            if (groupHeight <= available + FIT_EPS) break;
            if (c.blocks.length === 0 && c.availableHeight >= 0.5 && groupHeight > state.contentArea.height + FIT_EPS) break;
            if (guard >= 8) break;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(groupHeight));
          }
          blk.resourceBlock = resourceBlock;
          blk.lines[0]!.bbox = { x: 0, y: 0, width: resourceBlock.bodyRect.width, height: groupHeight };
        }
        const decidedColumn = currentColumn(doc, cursor);
        placeAtomicBlock(
          blk, groupHeight, spacingBefore, cursor, doc, state.geomResolved,
          state.contentArea, pageWidthPx, pageHeightPx, onAtomicNewPage(groupHeight),
        );
        enterBand(blockIdx, 0);
        // Too tall for the room left in its column, a wrapped picture moved
        // on with its anchor: say so.
        if (wraps && currentColumn(doc, cursor) !== columnBefore && columnBefore.blocks.length > 0) {
          textWrapNotes.push({
            kind: 'textWrap', reason: 'moved', resourceId: kind.resource!.id,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: cursor.pageIndex,
          });
        } else if (!wraps && currentColumn(doc, cursor) !== columnBefore && columnBefore.blocks.length > 0 && roomBefore >= 2 * baselineGrid - FIT_EPS) {
          // Too tall for the room left, an embed moved on and left the
          // foot of its column empty (#1151): say how much.
          movedNotes.push({
            kind: 'resourceMoved', resourceId: kind.resource!.id,
            emptyPx: Math.round(roomBefore), emptyMm: Math.round((roomBefore * 254) / state.geomResolved.page.dpi) / 10,
            sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset, pageIndex: pageBefore,
          });
        }
        // `placeBlockInColumn` (inside placeAtomicBlock) shifts `blk.lines`; the
        // resource's own caption/table lines live on `resourceBlock` and must be
        // offset to absolute page coordinates here using the placed bbox origin.
        offsetResourceBlockToAbsolute(resourceBlock, blk.bbox.x, blk.bbox.y);
        if (inlineAside && inlineAside.block.asideHeight !== undefined && currentColumn(doc, cursor) === decidedColumn) {
          markInlineAside(blk, inlineAside.sideCol, inlineAside.block.asideHeight);
        }
        const grown = figureGrowPx > 0 ? resourceBlock.bodyFlex?.delta ?? 0 : 0;
        if (grown > 0.01) {
          blk.balancing = { levers: ['flexFigure'], spaceAbove: 0, bodyGrowth: grown };
          addBalanceExtra(currentColumn(doc, cursor), grown);
        }
        doc.blocks.push(blk);
        // A wrapped picture (#627): the flow goes on under it and its gap, on
        // a grid line, unless the next block takes the band back to run
        // beside it (see `pendingWrap`).
        if (wraps && wrapSpec) {
          const rCol = currentColumn(doc, cursor);
          const top = blk.bbox.y;
          const bottomRel = Math.ceil((top - rCol.bbox.y + groupHeight + wrapGap - 0.01) / baselineGrid) * baselineGrid;
          rCol.availableHeight = Math.max(0, Math.min(rCol.availableHeight, rCol.bbox.height - bottomRel));
          state.pendingSpacing = 0;
          state.inlineGapOwed = null;
          const exWidth = wrapExclusionWidth(rCol.bbox.width, rCol.bbox.width * wrapSpec.width, wrapGap);
          // A contour wrap (#883): the picture's shape where it was set.
          const slotWidth = rCol.bbox.width * wrapSpec.width;
          const slot = { x: wrapSpec.side === 'left' ? rCol.bbox.x : rCol.bbox.x + rCol.bbox.width - slotWidth, y: top, width: slotWidth, height: groupHeight };
          const contour = wrapSpec.contour
            ? wrapContourOf(kind.resource!, resourceBlock, slot, wrapGap, doc.pages[cursor.pageIndex]!, { x: blk.bbox.x, y: blk.bbox.y }, { sourceStart: rawBlock.sourceStart + bodyOffset, sourceEnd: rawBlock.sourceEnd + bodyOffset })
            : undefined;
          state.pendingWrap = {
            col: rCol,
            blocks: rCol.blocks.length,
            cursorY: columnCursorY(rCol),
            ex: {
              x: wrapSpec.side === 'left' ? rCol.bbox.x : rCol.bbox.x + rCol.bbox.width - exWidth,
              y: top,
              width: exWidth,
              height: rCol.bbox.y + bottomRel - top,
              side: wrapSpec.side,
              gap: exWidth - rCol.bbox.width * wrapSpec.width,
              ownerId: blk.id,
              ...(contour ? { contour } : {}),
            },
          };
          flushPendingNumberingAtBoundary();
          continue;
        }
      }
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
        state.pendingSpacing = owed > 0.01 ? Math.ceil((owed - 0.01) / baselineGrid) * baselineGrid : 0;
        state.inlineGapOwed = state.pendingSpacing > 0 ? { afterIdx: blockIdx, pending: state.pendingSpacing, exact: owed } : null;
      }
      flushPendingNumberingAtBoundary();
      continue;
    }


    const finalizeListItem = (blk: VDTBlock, isFirstPart: boolean) => {
      // The drop cap (#623) stands on the baseline of the line it sinks to,
      // beside the first fragment only.
      const capLine = blk.lines[0];
      if (isFirstPart && capInfo && capLine) {
        const cap = capInfo;
        blk.dropCap = {
          text: cap.text,
          fontString: cap.fontString,
          color: cap.color,
          x: blk.bbox.x + cap.x,
          baselineY: capLine.baseline + (cap.sink - 1) * style.lineHeightPx,
          width: cap.width,
          fontSizePx: cap.fontSizePx,
          lines: cap.lines,
          sink: cap.sink,
          ...(cap.sourceStart !== undefined ? { sourceStart: cap.sourceStart, sourceEnd: cap.sourceEnd } : {}),
          plainStart: cap.plainStart,
          plainEnd: cap.plainEnd,
          word: cap.word,
          wordRest: cap.wordRest,
          ...(cap.hang ? { hang: { text: cap.hang.text, fontString: cap.hang.fontString, x: blk.bbox.x + cap.hang.x, baselineY: capLine.baseline, width: cap.hang.width } } : {}),
        };
        // The block's source range starts at the initial.
        if (cap.sourceStart !== undefined && (blk.sourceStart === undefined || cap.sourceStart < blk.sourceStart)) blk.sourceStart = cap.sourceStart;
      }
      if (!listBullet) return;
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // Bullet (and its positional metadata) only belongs on the first part of
      // a split list item; continuation parts render without a bullet.
      if (!isFirstPart) return;
      // A task item's drawn box (#765) stands for its character and face.
      if (listBullet.box) blk.bulletBox = listBullet.box;
      else {
        blk.bulletText = listBullet.bulletText;
        blk.bulletFontString = listBullet.bulletFontString;
      }
      blk.bulletColor = listBullet.bulletColor;
      // `bulletXOffsetInColumn` is `indentPx` for unordered/task, and
      // `indentPx + (maxNumberWidth - thisNumberWidth)` for ordered — giving
      // the right-aligned separator.
      // Beside a wrapped picture on the left (#627) the marker stands past
      // it, with its text.
      blk.bulletOffsetX = blk.bbox.x + bulletXOffsetInColumn + lineInsetsAt(wrapInsets, 0).start;
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
      // A list set against the document's direction: its marker on the
      // other side, with its text (#371).
      if (rawBlock.direction !== undefined && rawBlock.direction !== resolvedDirection(resolved)) mirrorListMarker(blk);
      // And reads in its item's direction (#664).
      directListMarker(blk, rawBlock.direction ?? resolvedDirection(resolved), arabicNumbersOf(resolved), measuringVertically());
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
      // A poem, like a container of one block: its own leading and the
      // margins of its style are off the grid, the text after it is not.
      // A stanza between two of a poem in the line layout snaps too, so the
      // space between stanzas is whole grid lines (#620); one of a poem set
      // as single hemistichs (a configuration stored before #620) does not,
      // as the one block postext 1.22 set it in did not.
      (vdtType === 'paragraph' && rawBlock.verse !== undefined && verseSnaps(rawBlock.verse.attrs.style, resolved)
        && (rawBlock.verse.stanza === undefined || rawBlock.verse.stanza.last || versesLineByLine(rawBlock, resolved))) ||
      vdtType === 'mathDisplay' ||
      // A score's last system: the text after it goes back on the grid.
      (vdtType === 'score' && (rawBlock.score?.index ?? 0) === (rawBlock.score?.count ?? 1) - 1)
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
    /** The lines (1-based, counted from the first line still to place) the
     *  guard keeps a hyphen off: the line the split falls after and one
     *  every full column after it, or, under `'withinPage'` (#701), those
     *  of them that close a page — the j-th column end from here does when
     *  the `rest` columns left on this page that still take a line of this
     *  text are used up and a whole number of fresh pages, of `perPage`
     *  flow columns each, has gone by. */
    const guardedColumnEnds = (mode: false | 'withinPage', splitAt: number, lineCount: number, fullColumn: number, page: VDTPage, columnIndex: number): number[] => {
      const ends: number[] = [];
      const rest = mode === false ? 0 : flowColumnsAfter(page, columnIndex, style.lineHeightPx);
      const perPage = mode === false ? 1 : freshPageFlowColumns();
      for (let n = splitAt, j = 0; n < lineCount; n += fullColumn, j++) {
        if (j >= rest && (j - rest) % perPage === 0) ends.push(n);
      }
      return ends;
    };
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
     *  long (placed whole where they were measured), nor a page-span
     *  heading, painted across the page. */
    let brokenForWidth = measureWidth;
    let laterWidths: { fromLine: number; columnWidth: number }[] = [];
    /** Text wrap (#627): the lines of the block set short beside what text
     *  wraps round, as its lines are now set (paragraph line numbers). */
    let wrapInsets: LineInsetStep[] = [];
    const wrapsBeside = canSplit && runsBesideWrap(rawBlock);
    const rebreaksForColumn = !tryLoose && rawBlock.toc === undefined && rawBlock.index === undefined
      && (canSplit || (vdtType === 'heading' && !measuredAcrossPage(rawBlock)));
    /** Measure the block again for the columns it is set in (see
     *  `laterWidths`), with `extra` options. */
    const measureForColumns = (extra: MeasureContentBlockOptions) =>
      measureContentBlock(rawBlock, blockIdx, brokenForWidth, blockMeasureCtx, {
        styleOverride,
        ...(laterWidths.length > 0 ? { restColumnWidths: laterWidths } : {}),
        ...(wrapInsets.length > 0 ? { lineInsets: wrapInsets } : {}),
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
    // A poem (#378) after this paragraph, which introduces it («فأنشد
    // يقول:»): see the lead-in rule below.
    const nextIsVerse = vdtType === 'paragraph' && contentBlock.verse === undefined
      && nextBlock?.type === 'paragraph' && nextBlock.verse !== undefined;

    while (remainingLines.length > 0) {
      enterBand(blockIdx, partIndex);
      const curCol = currentColumn(doc, cursor);
      // A wrapped float at the head or foot of this column (#627): running
      // text takes its band back to run beside it.
      if (wrapsBeside) openFloatWraps(curCol);
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
            capInfo = again.dropCap;
            brokenForWidth = curCol.bbox.width;
            laterWidths = [];
            wrapInsets = [];
            letterSpacingPx = again.letterSpacingPx;
            runtTracking = again.runtTracking;
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
          const keptInsets = insetsBefore(wrapInsets, placed);
          const again = measureContentBlock(rawBlock, blockIdx, brokenForWidth, blockMeasureCtx, {
            styleOverride, restColumnWidths: steps, ...(keepBreaks ? { keepBreaks } : {}),
            ...(keptInsets.length > 0 ? { lineInsets: keptInsets } : {}),
          });
          const lines = again && (again.letterSpacingPx ?? 0) === (letterSpacingPx ?? 0)
            ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
            : undefined;
          if (
            lines && lines.length > placed
            && paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated)
          ) {
            laterWidths = steps;
            wrapInsets = keptInsets;
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
      // (Right under a float at the head of the opener's own column, #639,
      // the block starts as at a column's head: no space above it.)
      if (!isFirstInColumn && !underOpenerHeadFloat(curCol)) {
        spacingBefore = state.pendingSpacing;
        if (vdtType === 'heading' || vdtType === 'mathDisplay') {
          spacingBefore = Math.max(partIndex === 0 ? pendingBeforeSelfSnapping(blockIdx) : spacingBefore, style.marginTopPx);
          // A 行取り band opens on a grid line when its heading snaps to the
          // grid, so its lines are body lines (#424).
          if (lineSpan !== undefined && partIndex === 0 && (headingLevels.forBlock(rawBlock)?.snapToGrid ?? resolved.headings.snapToGrid)) {
            const usedHeight = curCol.bbox.height - curCol.availableHeight;
            spacingBefore = Math.ceil((usedHeight + spacingBefore - 0.01) / baselineGrid) * baselineGrid - usedHeight;
          }
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
        } else if (vdtType === 'score') {
          // A score's top margin above its first system, the system gap
          // above the others (#1172).
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
        } else if (rawBlock.verse && partIndex === 0) {
          // A poem: the top margin of the paragraph style its fence names.
          spacingBefore = Math.max(spacingBefore, style.marginTopPx);
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
      // A raised initial (#623) keeps its rise clear above the paragraph,
      // in whole grid lines.
      if (partIndex === 0 && capInfo && capInfo.rise > 0.5) {
        spacingBefore += Math.ceil((capInfo.rise - 0.5) / baselineGrid) * baselineGrid;
      }
      // Text wrap (#627): the lines this block would set beside what text
      // wraps round in this column are broken short of it; the lines it
      // already placed elsewhere keep their breaks. A block that cannot
      // keep them (a break trace of the other measuring path) goes under
      // what it would have run beside instead.
      if (wrapsBeside) {
        const placed = paragraphLines.length - remainingLines.length;
        const y0 = columnCursorY(curCol) + spacingBefore;
        const wanted = wrapInsetSteps(curCol, y0, style.lineHeightPx, placed);
        if (!sameInsetsFrom(wrapInsets, wanted, placed)) {
          const steps = [...insetsBefore(wrapInsets, placed), ...wanted];
          const keepBreaks = placed > 0 && paragraphBreaks && paragraphBreaks.at.length >= placed
            ? { path: paragraphBreaks.path, at: paragraphBreaks.at.slice(0, placed) }
            : undefined;
          const again = placed > 0 && !keepBreaks ? null : measureContentBlock(rawBlock, blockIdx, brokenForWidth, blockMeasureCtx, {
            styleOverride,
            ...(laterWidths.length > 0 ? { restColumnWidths: laterWidths } : {}),
            ...(steps.length > 0 ? { lineInsets: steps } : {}),
            ...(keepBreaks ? { keepBreaks } : {}),
          });
          const lines = again && (placed === 0 || (again.letterSpacingPx ?? 0) === (letterSpacingPx ?? 0))
            ? [...raggedLooseLines(again.measured.lines, style.textAlign)]
            : undefined;
          if (
            lines && lines.length > placed
            && paragraphLines.slice(0, placed).every((l, i) => lines[i]!.text === l.text && lines[i]!.hyphenated === l.hyphenated)
          ) {
            wrapInsets = steps;
            paragraphLines = lines;
            paragraphBreaks = again!.measured.breaks;
            remainingLines = lines.slice(placed);
            if (placed === 0) {
              capInfo = again!.dropCap;
              letterSpacingPx = again!.letterSpacingPx;
              runtTracking = again!.runtTracking;
              guardedEnds = [];
              columnEndHyphenRetried = false;
            }
            regateCitedFloats(blockIdx, lines);
          } else if (wanted.length > 0) {
            if (balancing && balancing.spaceAbove > 0) {
              balanceExtraInColumn.set(curCol, (balanceExtraInColumn.get(curCol) ?? 0) - balancing.spaceAbove);
            }
            settleColumnWraps(curCol);
            state.pendingSpacing = 0;
            continue;
          }
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
      const noteCosts = vdtType === 'mathDisplay' || vdtType === 'score' ? undefined : notesPrefixCost(curCol, remainingLines);
      let effectiveAvailable = curCol.availableHeight - spacingBefore - (noteCosts ? noteCosts[noteCosts.length - 1]! : 0);
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
      const totalRemainHeight = vdtType === 'mathDisplay' || vdtType === 'score'
        ? (remainingLines[0]?.bbox.height ?? style.lineHeightPx)
        : remainingLines.length * style.lineHeightPx;

      // For headings with an enabled advanced-design slot, the rendered
      // overlay may extend below the natural text bottom. Measure the slot's
      // actual content bottom so the reserved block height (and the
      // subsequent marginBottom + grid snap) starts from there.
      let effectiveRemainHeight = totalRemainHeight;
      // A paragraph shorter than its drop cap sinks (#623, `'reserve'`):
      // the block keeps the room under the initial.
      if (partIndex === 0 && capInfo && capInfo.minLines > remainingLines.length) {
        effectiveRemainHeight = capInfo.minLines * style.lineHeightPx;
      }
      /** How far the lines of a 行取り heading go down its band (#424). */
      let lineSpanShift = 0;
      if (lineSpan !== undefined && partIndex === 0) {
        const bodyBlockStyle = blockMeasureCtx.bodyStyle;
        const band = headingLineSpanBand(
          lineSpan,
          remainingLines.length,
          style.lineHeightPx,
          { font: style.fontString, sizePx: style.fontSizePx },
          { font: bodyBlockStyle.fontString, sizePx: bodyBlockStyle.fontSizePx },
          baselineGrid,
        );
        effectiveRemainHeight = band.height;
        lineSpanShift = band.shift;
      }
      /** The heading's design and the values it is laid out with, kept for
       *  the side-column obstacles once the block is placed (EF-78). */
      let headingDesign: { lvl: ResolvedHeadingLevelConfig; info: HeadingPlaceholderInfo; claim?: HeadingClaim } | undefined;
      if (vdtType === 'heading' && headingLevel !== undefined && partIndex === 0 && !hiddenHeading) {
        const lvl = headingLevels.forBlock(rawBlock);
        if (lvl) {
          const pref = numberPrefix ?? '';
          // The lines joined back into the title (EF-162), as the design is
          // painted (`buildHeadersAndFooters`).
          const openerTitle = defaultOpenerTitle(remainingLines, pref, rawBlock.titleBreaks, rawBlock.text.length, lvl.numberSeparator);
          // Span-page openers lay out across the full content area (both
          // columns); in-column headings use just the column width.
          const pageArea = doc.pages[cursor.pageIndex]!.contentArea;
          const measureWidth = lvl.span === 'page' ? pageArea.width : curCol.bbox.width;
          const info: HeadingPlaceholderInfo = { titleText: openerTitle.titleText, ...markedTitleFields(openerTitle, resolved.chipStyles), formattedNumber: pref, numericValue: headingNumber, locale: resolvedLocale(resolved), ...(resolved.numerals ? { numerals: resolved.numerals } : {}), chapterNumber: chapterNumberByBlock[blockIdx] ?? '', attrs: rawBlock.attrs };
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
              openerTitle,
              pref,
              pageArea.width,
              resolved.page.dpi,
              doc.metadata,
              cursor.pageIndex,
              resolved.chipStyles,
            );
            if (painted > effectiveRemainHeight) effectiveRemainHeight = painted;
          }
          // What sets the design's reservation, for `headingClaimsColumn`
          // (#997): only a design taller than the heading's own lines.
          const claim: HeadingClaim | undefined = lvl.span !== 'page' && design.height > totalRemainHeight
            ? (design.byMinHeight ? {} : design.claimedBy !== undefined ? { element: design.claimedBy } : undefined)
            : undefined;
          headingDesign = { lvl, info, ...(claim ? { claim } : {}) };
        }
      }

      // With `headings.columnHeadSpace: 'remainder'` (#706) a heading that
      // opens a column drops its space above in whole grid lines only: what is
      // left of a line stays above it, so its text starts as far under it
      // as under the same heading set after a paragraph. The foot of its
      // box stays on the grid line the snap puts it on, and no line of body
      // text moves. A heading the grid does not snap, a hidden one, a
      // `lineSpan` band, a page-span opener and a heading painted from its
      // own design (its band is the design's, drawn from the column's head)
      // keep the head of the column; so does the first block of a column
      // under an opener band, which is set level with the first block
      // under the opener (`openerHead`).
      if (
        vdtType === 'heading' && partIndex === 0 && !hiddenHeading && lineSpan === undefined
        && resolved.headings.columnHeadSpace === 'remainder'
        && (isFirstInColumn || underOpenerHeadFloat(curCol)) && openerHead === undefined
        && !headingSetsOwnBand(headingLevels.forBlock(rawBlock))
      ) {
        const usedHeight = curCol.bbox.height - curCol.availableHeight;
        const kept = columnHeadKept(blockIdx, rawBlock, usedHeight, effectiveRemainHeight, style, shouldSnapToGrid, curCol, blockMeasureCtx);
        if (kept > 0) {
          spacingBefore += kept;
          effectiveAvailable -= kept;
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
        // The tolerance of the fit check below (#635): a paragraph that
        // fits by a hair of drift is one this rule reads too.
        && totalRemainHeight <= effectiveAvailable + FIT_EPS
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
        // A short list set whole (`shortListSplit: 'avoid'`, #749) needs
        // all its room under the colon line, when a column can hold the
        // line and the list at all — less what a figure this paragraph
        // cites will take from the column's foot (`citedFootTake`).
        let listIdx = blockIdx + 1;
        while (listIdx < contentBlocks.length && isMarkerBlock(contentBlocks[listIdx])) listIdx++;
        const wholeList = shortListRule === 'avoid' ? shortListFrom(listIdx) : undefined;
        const wholeNeed = wholeList ? shortListNeed(wholeList, curCol.bbox.width, blockMeasureCtx) : undefined;
        const keepsListWhole = wholeNeed !== undefined
          && style.lineHeightPx + effectiveGap + wholeNeed.height <= state.contentArea.height + FIT_EPS;
        // A line of room is not always enough (EF-110): with
        // `colonListRoom: 'item'` the first item has to be able to start
        // there, by the rules that split it — a two-line item the orphan
        // and widow rules keep whole needs both. `'line'` keeps the 1.4
        // check, one line.
        if (
          availableAfter < minSpaceForList - FIT_EPS
          || (resolved.bodyText.colonListRoom === 'item'
            && !firstListItemStarts(blockIdx, availableAfter - effectiveGap, curCol.bbox.width, blockMeasureCtx))
          || (keepsListWhole && availableAfter - effectiveGap - citedFootTake(blockIdx, curCol, availableAfter) < wholeNeed.height - FIT_EPS)
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
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx; if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
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
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
          if (headingRunCount === 0) {
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
      // A poem (#378) is kept with the paragraph that introduces it the
      // same way: when its first bayts cannot start under the paragraph's
      // last line (by the orphan and widow rules a poem is split by), that
      // line goes on with them.
      const nextIsFormula = resolved.math.keepWithLeadIn && contentBlocks[blockIdx + 1]?.type === 'mathDisplay';
      if (
        (nextIsFormula || nextIsVerse)
        && vdtType === 'paragraph'
        && totalRemainHeight <= effectiveAvailable + FIT_EPS
      ) {
        const usedHeight = (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
        // As the plain pass saw it: room balancing added above is not room
        // the formula lost.
        const availableAfter = curCol.bbox.height - (usedHeight + totalRemainHeight) + (balanceExtraInColumn.get(curCol) ?? 0);
        let goesOn: boolean;
        if (nextIsFormula) {
          const formula = measureContentBlock(contentBlocks[blockIdx + 1]!, blockIdx + 1, curCol.bbox.width, blockMeasureCtx);
          const formulaHeight = formula ? (formula.measured.lines[0]?.bbox.height ?? formula.measured.totalHeight) : 0;
          const gap = Math.max(style.marginBottomPx, formula?.kind.style.marginTopPx ?? 0);
          goesOn = !!formula && formulaHeight > 0 && availableAfter + FIT_EPS < gap + formulaHeight;
        } else {
          // The poem starts under the larger of this paragraph's bottom
          // margin and its own style's top margin.
          const poemGap = Math.max(style.marginBottomPx, verseMarginTopPx(nextBlock?.verse?.attrs.style, resolved));
          goesOn = !firstListItemStarts(blockIdx, availableAfter - poemGap, curCol.bbox.width, blockMeasureCtx);
        }
        if (goesOn) {
          const minKeep = resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1;
          const splitAt = remainingLines.length - 1;
          if (splitAt >= minKeep) {
            if (spacingBefore !== 0) curCol.availableHeight -= spacingBefore;
            const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
            const splitLines = remainingLines.slice(0, splitAt);
            const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
            applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx; if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
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
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
          if (partIndex === 0 && curCol.blocks.length > 0) {
            // Moving on whole must not strand a heading closing the column.
            const headingRun = trailingHeadingRun(curCol);
            if (resolved.headings.keepWithNext && headingRunMayLeave(curCol, headingRun)) {
              const rolledBack = rollbackHeadings(curCol);
              if (rolledBack.length > 0) {
                blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
                state.pendingSpacing = 0;
                advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
                break;
              }
            }
            if (headingRun < curCol.blocks.length) {
              state.pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
              continue;
            }
          }
        }
      }

      // A block of the contents is set whole (`toc.groups.keepTogether`,
      // `:::toc{keep}`, #850): when its rows do not all fit in the room the
      // column has left and a full column would hold them, it opens the
      // next column, with the headings right above it. One taller than a
      // column is cut, but keeps its head with `minEntriesAfterHead`
      // entries. Not a block that opens its column, or stands under
      // nothing but headings: it cannot do better anywhere.
      if (rawBlock.toc?.group?.lead && partIndex === 0 && curCol.blocks.length > 0) {
        const headingRun = trailingHeadingRun(curCol);
        const need = headingRun < curCol.blocks.length ? tocGroupNeed(blockIdx, curCol.bbox.width) : undefined;
        if (need) {
          const room = curCol.availableHeight - spacingBefore;
          const asked = need.whole <= state.contentArea.height + FIT_EPS ? need.whole : need.lead;
          if (asked > room + FIT_EPS) {
            if (resolved.headings.keepWithNext && headingRun > 0) {
              const rolledBack = rollbackHeadings(curCol);
              if (rolledBack.length > 0) {
                blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
                state.pendingSpacing = 0;
                advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
                break;
              }
            }
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
          }
        }
      }

      // A short list is set whole (`bodyText.shortListSplit: 'avoid'`,
      // #749): when its items do not all fit under what the column holds
      // and an empty column would hold them, the list opens the next
      // column, with the headings right above it. Not a list a colon line
      // introduces: that line already took the list's room into account,
      // and the two stay together. Nor one that opens its column, or
      // stands under nothing but headings: it cannot do better anywhere.
      if (vdtType === 'listItem' && partIndex === 0 && shortListRule === 'avoid' && curCol.blocks.length > 0) {
        const list = shortListFrom(blockIdx);
        const headingRun = trailingHeadingRun(curCol);
        const lead = list ? prevNonMarkerBlock(contentBlocks, blockIdx) : undefined;
        const colonLed = lead?.type === 'paragraph' && resolved.bodyText.keepColonWithList && /[:：︰﹕]\s*$/.test(lead.text);
        const need = list && !colonLed && headingRun < curCol.blocks.length
          ? shortListNeed(list, curCol.bbox.width, blockMeasureCtx)
          : undefined;
        if (need && need.height <= state.contentArea.height + FIT_EPS) {
          const listNotes = notesPrefixCost(curCol, need.lines);
          const room = curCol.availableHeight - spacingBefore - (listNotes ? listNotes[listNotes.length - 1]! : 0);
          if (need.height > room + FIT_EPS) {
            if (resolved.headings.keepWithNext && headingRun > 0) {
              const rolledBack = rollbackHeadings(curCol);
              if (rolledBack.length > 0) {
                blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
                state.pendingSpacing = 0;
                advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
                break;
              }
            }
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            continue;
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
        && curCol.bbox.height < state.contentArea.height - baselineGrid;

      // A score's first systems, and its last ones, go together
      // (`scoreStyle.minSystemsAtBreak`, #1173): its first system opens the
      // next column unless the first few fit here, and the system that
      // opens its last few takes them all along.
      if (vdtType === 'score' && curCol.blocks.length > 0) {
        const keep = scoreKeepHeight(contentBlocks, blockIdx, resolved);
        if (keep !== undefined && keep > effectiveAvailable + FIT_EPS && keep <= state.contentArea.height) {
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          continue;
        }
      }

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
          && !headingMayCloseColumn(curCol)
        ) {
          const wouldUsedHeight =
            (curCol.bbox.height - curCol.availableHeight) + spacingBefore;
          const naturalBottom = wouldUsedHeight + effectiveRemainHeight + style.marginBottomPx;
          const snappedBottom = shouldSnapToGrid
            ? Math.ceil((naturalBottom - 0.01) / baselineGrid) * baselineGrid
            : naturalBottom;
          const remainAfterHeading = curCol.bbox.height - snappedBottom;
          // A drop cap opening the text (#623) needs its lines under it.
          const minLinesNeeded = Math.max(
            resolved.bodyText.avoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1,
            dropCapSinkAfter(blockIdx, blockMeasureCtx),
          );
          // A `:::space` between the heading and its text needs room too.
          const minSpaceAfter = minLinesNeeded * bodyStyle.lineHeightPx
            + spaceLinesAfter(contentBlocks, blockIdx) * baselineGrid;
          // The room is a difference of grid sums and the need a product:
          // a head whose text ends on the last line of the column is short
          // by floating-point drift alone (#635), and stays.
          if (remainAfterHeading < minSpaceAfter - FIT_EPS) {
            if (curCol.blocks.length === 0) shortColumnMoves++;
            // Roll back any immediately-preceding heading blocks in this
            // column so they travel with this one.
            const rolledBack = rollbackHeadings(curCol);
            if (rolledBack.length > 0) {
              // Rewind so the for-loop's blockIdx++ lands on the first
              // rolled-back heading (marker blocks in between are replayed).
              blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
              state.pendingSpacing = 0;
              advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
              break;
            }
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx; if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
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
        } else if (vdtType === 'score') {
          // A system keeps its own height (#1172).
          blk.lines = [{ ...remainingLines[0]!, bbox: { ...remainingLines[0]!.bbox, y: 0 } }];
        } else {
          blk.lines = shiftLinesDown(resetLinePositions(remainingLines, style.lineHeightPx), lineSpanShift);
        }
        blk.dirty = false;
        blk.snappedToGrid = shouldSnapToGrid && partIndex === 0;
        if (remainingLines.length > 0) {
          blk.sourceStart = remainingLines[0]!.sourceStart ?? rawBlock.sourceStart + bodyOffset;
          blk.sourceEnd = remainingLines[remainingLines.length - 1]!.sourceEnd ?? rawBlock.sourceEnd + bodyOffset;
        }
        if (vdtType === 'mathDisplay' || vdtType === 'score') {
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
        if (vdtType === 'heading' && effectiveRemainHeight > totalRemainHeight && h > curCol.availableHeight + FIT_EPS) {
          h = Math.max(effectiveRemainHeight, curCol.availableHeight);
        }
        // A block whose lines fit, and whose snap would reach the grid line
        // under the column's foot (a foot the notes reserved there took off
        // the grid, or a bottom margin on the column's last line), ends at
        // the foot (#716): its box stays inside its column and the room left
        // reads 0, not a negative height. The space it still owed is dropped,
        // as pending spacing is at any column's end. A column cut by a band
        // cap keeps the overrun: there it is how the block's bottom margin
        // reaches the page-span box under the cut (`bandUsedBottomWithSide`).
        if (
          shouldSnapToGrid && partIndex === 0
          && !uncappedBottoms.has(curCol)
          && h > curCol.availableHeight + FIT_EPS
          && effectiveRemainHeight <= curCol.availableHeight + FIT_EPS
        ) {
          h = Math.max(effectiveRemainHeight, curCol.availableHeight);
          tailOwed = 0;
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
        if (headingDesign) { markSideObstacles(blk, headingDesign); noteHeadingClaim(blk, headingDesign); }
        // For snapped headings/list-tails the margin is baked into the snap;
        // for unsnapped ones (consecutive) track it for collapsing
        if (vdtType === 'listItem' && nextIsListItem) {
          state.pendingSpacing = itemGapPx(listBullet!);
        } else {
          state.pendingSpacing = (shouldSnapToGrid && partIndex === 0) ? 0 : style.marginBottomPx;
          // A collapsing container tail: the space the snap did not cover,
          // in whole grid lines, merges with the next block's own space
          // above (a heading's margin collapses with the exact rest).
          if (collapseTail && shouldSnapToGrid && partIndex === 0 && tailOwed > 0.01) {
            state.pendingSpacing = Math.ceil((tailOwed - 0.01) / baselineGrid) * baselineGrid;
            state.inlineGapOwed = { afterIdx: blockIdx, pending: state.pendingSpacing, exact: tailOwed, container: true };
          }
        }
        break;
      }

      // An index entry that leaves the column takes the entries of its
      // group the keep rule does not let stay with it (#712): the roll-back
      // comes before any cut between its own lines.
      if (rawBlock.index && partIndex === 0 && curCol.blocks.length > 0) {
        const rolledBack = rollbackIndexGroup(curCol, rawBlock, blockMeasureCtx.resolved.index.groups.splitMinEntries);
        if (rolledBack.length > 0) {
          blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
          break;
        }
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
          // A drop cap's lines stay with it (#623).
          const minKeep = Math.max(effectiveAvoidWidows ? Math.max(1, resolved.bodyText.widowMinLines) : 1, partIndex === 0 && capInfo ? capInfo.sink : 1);
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
        //
        // `'withinPage'` (#701) guards only the ends that close a page: this
        // column's when no later column of its page takes text, and then
        // one every page of full columns. With none in the paragraph,
        // nothing is measured again.
        const hyphenGuard = resolved.bodyText.hyphenateAcrossColumns;
        if (
          choice.splitAt > 0
          && hyphenGuard !== true
          && !columnEndHyphenRetried
          && partIndex === 0
          && looseLines === undefined
        ) {
          const fullColumn = Math.max(1, Math.floor((state.contentArea.height + 0.01) / style.lineHeightPx));
          const ends = guardedColumnEnds(hyphenGuard, choice.splitAt, remainingLines.length, fullColumn, doc.pages[cursor.pageIndex]!, cursor.columnIndex);
          /** How a setting ends its guarded lines: whether this column's
           *  last line, when it is guarded, is hyphenated, and how many
           *  guarded lines are. */
          const columnEndHyphens = (lines: readonly VDTLine[]) => ({
            first: ends[0] === choice.splitAt && lines[choice.splitAt - 1]?.hyphenated === true,
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
        // Under `'withinPage'` only from a column that closes its page.
        if (
          choice.splitAt > 0
          && hyphenGuard !== true
          && partIndex > 0
          && columnEndHyphenPart !== partIndex
          && looseLines === undefined
          && remainingLines[choice.splitAt - 1]?.hyphenated === true
          && (hyphenGuard === false || columnClosesPage(doc.pages[cursor.pageIndex]!, cursor.columnIndex, style.lineHeightPx))
        ) {
          columnEndHyphenPart = partIndex;
          const placed = paragraphLines.length - remainingLines.length;
          const fullColumn = Math.max(1, Math.floor((state.contentArea.height + 0.01) / style.lineHeightPx));
          const later = guardedColumnEnds(hyphenGuard, choice.splitAt, remainingLines.length, fullColumn, doc.pages[cursor.pageIndex]!, cursor.columnIndex)
            .map((n) => placed + n);
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
        // A poem's bayt set staggered over two lines (or more) stays in one
        // column (#378), and so does a line of verse with its turnovers
        // (#620): the cut goes before it — in an empty column, which the
        // poem cannot leave, after its first line at least.
        while (choice.splitAt > (curCol.blocks.length === 0 ? 1 : 0) && sameVerseLine(remainingLines[choice.splitAt - 1], remainingLines[choice.splitAt])) {
          choice = { splitAt: choice.splitAt - 1, demerit: choice.demerit };
        }
        // A paragraph a drop cap opens never breaks before the initial's
        // last line (#623): it moves on whole, unless it is alone in an
        // empty column too short for those lines, where it breaks all the
        // same (and says so).
        if (partIndex === 0 && capInfo && choice.splitAt > 0 && choice.splitAt < Math.min(capInfo.sink, remainingLines.length)) {
          if (curCol.blocks.length > 0) choice = { splitAt: 0, demerit: choice.demerit };
          else blockMeasureCtx.dropCapNotes?.set(blockIdx, { reason: 'split' });
        }
        // A stanza `keepStanzas` covers (a haiku, a tanka) moves on whole,
        // unless the column is empty: it cannot do better anywhere.
        if (choice.splitAt > 0 && partIndex === 0 && curCol.blocks.length > 0 && keepsStanzaWhole(rawBlock, resolved)) {
          choice = { splitAt: 0, demerit: choice.demerit };
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
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx; if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
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
          state.pendingSpacing = 0;
          advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
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
      if (curCol.blocks.length > 0 || capShortUnderFloat || (shortColumn && (effectiveRemainHeight <= state.contentArea.height || canSplit))) {
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
        const runFillsColumn = headingRun > 0 && !headingRunMayLeave(curCol, headingRun);
        const strands = partIndex === 0 && vdtType !== 'heading'
          && headingRun > 0 && !runFillsColumn;
        const pullsRun = vdtType === 'heading' && (!runFillsColumn || shortColumn);
        if (resolved.headings.keepWithNext && (pullsRun || strands)) {
          const rolledBack = rollbackHeadings(curCol);
          if (rolledBack.length > 0) {
            blockIdx = (rolledBack[0]!.contentIndex ?? blockIdx - rolledBack.length) - 1;
            state.pendingSpacing = 0;
            advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
            break;
          }
        }
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column with less than a line of room (a band cap cutting right
      // under a float band, a column swallowed by reservations): nothing can
      // go here — move on. The next column, or a fresh page, has room —
      // unless the page's whole content area is shorter than a line (#1222):
      // no column ever has, and the block is set here, as one taller than
      // the page.
      if (curCol.availableHeight < style.lineHeightPx - 0.01 && totalRemainHeight > curCol.availableHeight + 0.01
        && state.contentArea.height >= style.lineHeightPx - 0.01) {
        state.pendingSpacing = 0;
        advanceToNextColumn(doc, cursor, state.geomResolved, state.contentArea, pageWidthPx, pageHeightPx, onNewPage);
        continue;
      }

      // Empty column but block still doesn't fit (block taller than page) — place anyway
      const partId = partIndex === 0 ? id : `${id}-cont-${partIndex}`;
      const blk = createVDTBlock(partId, vdtType, style.fontString, style.color, style.textAlign);
      applyStyleAttrs(blk, style);
            if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx; if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
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
      blk.lines = vdtType === 'mathDisplay' || vdtType === 'score'
        ? [{ ...remainingLines[0]!, bbox: { ...remainingLines[0]!.bbox, y: 0 } }]
        : shiftLinesDown(resetLinePositions(remainingLines, style.lineHeightPx), lineSpanShift);
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
      if (headingDesign) { markSideObstacles(blk, headingDesign); noteHeadingClaim(blk, headingDesign); }
      if (vdtType === 'listItem') {
        state.pendingSpacing = nextIsListItem ? itemGapPx(listBullet!) : style.marginBottomPx;
      } else {
        state.pendingSpacing = style.marginBottomPx;
      }
      break;
    }

    flushPendingNumberingAtBoundary();
  }

  // End of the document: level the closing band and place any floats still
  // pending (referenced on the last page) on pages appended after it.
  closeFlowSegment(contentBlocks.length);
  // Nothing leaves the layout unseen (#639): a box or a float still in a
  // queue here is on no page, and the build says so.
  const unplaced: ContentWarning[] = [];
  const sourceOf = (from: number, to: number): { sourceStart?: number; sourceEnd?: number } => {
    const first = contentBlocks[from];
    const last = contentBlocks[to];
    return first && last ? { sourceStart: first.sourceStart + bodyOffset, sourceEnd: last.sourceEnd + bodyOffset } : {};
  };
  for (const box of [...awaitingSideBoxes.map((w) => w.box), ...pendingSideBoxes]) {
    unplaced.push({ kind: 'unplaced', ...sourceOf(box.startIdx, box.plan.endIdx) });
  }
  for (const f of pendingFloats) {
    const box = f.callout ? calloutFloats.get(f.callout.startIdx) : undefined;
    unplaced.push(box
      ? { kind: 'unplaced', ...sourceOf(f.callout!.startIdx, box.plan.endIdx) }
      : { kind: 'unplaced', resourceId: f.resourceId, ...sourceOf(f.firstBlockIdx, f.firstBlockIdx) });
  }
  if (unplaced.length > 0) unplacedByDoc.set(doc, unplaced);
  // The notes, in the room the flow reserved for them.
  reserveLeftoverNotes();
  setColumnNotes();
  // After the chapter (`chapterEnd`), the notes that close a column drop
  // to its foot: the room left over stays between the text and them.
  if (chapterEndNotes && resolved.footnotes.chapterEndAlign === 'foot') dropChapterEndNotes();
  if (chapterEndNotes) ruleChapterEndNotes();
  for (const index of centredPages) {
    const page = doc.pages[index];
    if (page) centrePageText(page, reservedOf);
  }
  // The text panels of the strips, where the strips stand now (#959).
  placeStripTexts();

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

  // The paper stock of the pages set from inside a `:::paper` run.
  const paperOfBlock = paperByBlock(contentBlocks, resolved.colorPalette);
  if (paperOfBlock.some((p) => p !== undefined)) stampPagePaper(doc.pages, paperOfBlock);

  // Stamp page-number info onto every page (including blank parity pages).
  const labels = buildPageLabels(doc.pages.length, pageNumberSegments, resolved.numerals);
  for (let i = 0; i < doc.pages.length; i++) {
    const info = labels[i];
    if (!info) continue;
    const page = doc.pages[i]!;
    page.pageNumberValue = info.value;
    page.pageLabel = info.label;
    page.pageNumberFormat = info.format;
  }
  // Continuation marks with a page number (#917): the page the rest goes
  // on on, or comes from, now that pages are numbered.
  fillPageMarks(doc.pages);
  const restarts = pageNumberSegments
    .filter((s, i) => i > 0 && s.startAt !== undefined && s.startPageIndex < doc.pages.length)
    .map((s) => s.startPageIndex);
  if (restarts.length > 0) doc.pageNumberRestarts = restarts;

  // Line numbers (#621): the lines of this pass counted where they landed,
  // before the running heads (whose palettes recolour them).
  buildLineNumbers(doc, contentBlocks, continuation);

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
  // The line numbers of code listings (#624), in the same slot, after the
  // margin numbers' palette pass: they keep `codeStyle.lineNumberColor`.
  if (codeBoxes.wrapped) buildCodeLineNumbers(doc);

  // Vertical pages: the axis each font's upright characters turn about.
  if (doc.pages.some((p) => pageIsVertical(p) || p.composed?.frames.some((f) => f.writingMode === 'vertical-rl'))) stampCentralBaselines(doc);
  // Right-to-left pages: lines advance through the mirrored flow in the
  // reverse of their visual order.
  if (doc.pages.some((p) => pageIsMirrored(p))) orientLinesToFrames(doc);
  // Figure labels (#860): where each one is painted, for the source map.
  stampFigureLabelRects(doc);

  doc.converged = true;
  doc.iterationCount = 1;
  if (joiningLetterSpacing.size > 0) joiningSpacingWarnings.set(doc, joiningLetterSpacingWarnings(doc, joiningLetterSpacing));
  if (dropCapNotes.size > 0 || doc.blocks.some((b) => b.dropCap)) dropCapWarningsByDoc.set(doc, dropCapWarnings(doc, dropCapNotes));
  // Pictures scaled to the room of their slot (#626), at the block citing them.
  const shrunk = floatShrinkWarnings(doc, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  // Pictures whose column holds them under half their print size (#901).
  const belowPrint = pictureBelowPrintSizeWarnings(doc, givenResources, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  // Resources whose caption prints the label alone (#1151).
  const lonely = emptyCaptionWarnings(doc, (idx) => {
    const b = contentBlocks[idx];
    return b ? { start: b.sourceStart + bodyOffset, end: b.sourceEnd + bodyOffset } : undefined;
  });
  if (shrunk.length > 0 || belowPrint.length > 0 || lonely.length > 0) floatShrinkWarningsByDoc.set(doc, [...shrunk, ...belowPrint, ...lonely]);
  if (textWrapNotes.length > 0 || columnsNotes.length > 0 || movedNotes.length > 0) textWrapWarningsByDoc.set(doc, [...textWrapNotes, ...columnsNotes, ...movedNotes]);
  // Composed pages (#855): frames whose content does not fit.
  if (composedNotes.length > 0) composedWarningsByDoc.set(doc, composedNotes);
  if (pendingJumps.length > 0) doc.pendingJumps = pendingJumps;
  if (carried) {
    stampCarriedSource(doc, carried, fenceEnd);
    carriedByDoc.set(doc, { carried, bodyOffset });
  }
  // The composition rules (#749): short lists cut, floats on opener pages.
  const ruleNotes = [...shortListWarnings(), ...openerFloatNotes, ...tocGroupWarnings(), ...headingClaimWarnings()];
  if (ruleNotes.length > 0) compositionWarningsByDoc.set(doc, ruleNotes);

  const { proposals: citingPageProposals, refused: citingPageRefused } = settleCitingPageFloats();

  return { doc, forcedBreakPages, bandCapProposals, spanPlacedInBand, bandCapsApplied, looseOutcome, looseOffGrid, captionUnderProposals, citingPageProposals, citingPageRefused };
}
