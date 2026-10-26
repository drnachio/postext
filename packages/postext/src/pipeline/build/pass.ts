// One placement pass: lays the content blocks out on pages under the hints
// the drivers (drivers.ts, balanced.ts) settle between passes.
import { withBitmapResolutions } from '../../bitmapResolution.js';
import type { PostextContent, PostextConfig, Resource, ResourceType, ResolvedCalloutStyleConfig } from '../../types.js';
import { parseMarkdownMemo, type ContentBlock } from '../../parse/index.js';
import { dimensionToPx } from '../../units.js';
import { type VDTColumn, type VDTPage, createVDTDocument, type ResolvedConfig, type BoundingBox, pageIsVertical, type VDTFigureLabel, type ContentWarning, pageIsMirrored } from '../../vdt.js';
import { figureLabels } from '../blocks/buildMeasurement.js';
import { withFigureWords } from '../resources/figureWords.js';
import { stampFigureLabelRects } from '../../composed/labels.js';
import { computeHeadingNumbering, buildPageLabels } from '../../numerals/numbering.js';
import { extractFrontmatter, normalizeMetadata } from '../../parse/frontmatter.js';
import { type MeasurementCache, initHyphenator } from '../../measure/index.js';
import { setHyphenationRules } from '../../hyphenation/hyphenate.js';
import { citedNames } from '../../citations/names.js';
import { getCjkLineBreak, setCjkLineBreak } from '../../measure/cjk/cjkClasses.js';
import { getSlashBreaks, setSlashBreaks } from '../../measure/breakRules.js';
import { getCjkComposition, setCjkComposition, cjkCompositionOf } from '../../measure/cjk/cjkPunctuation.js';
import { getMeasureWritingMode, getMeasureRegion, getMeasureUprightDigits, setMeasureWritingMode, setMeasureUprightDigits } from '../../measure/vertical.js';
import { stampCentralBaselines } from '../text/verticalMetrics.js';
import { orientLinesToFrames } from '../blocks/mirrorFrame.js';
import { needsExerciseExpansion, expandDocumentExercises, withExerciseStyles, exerciseSettingsFor, nameExerciseAnchors } from '../../exercises/build.js';
import { exerciseDigitalOf } from '../../exercises/digital.js';
import { resolveAllConfig, resolvedLocale, resolvedDirection, arabicNumbersOf, computeBaselineGrid, computeColumnBboxes } from '../config.js';
import { getMeasureDirection, getMeasureArabicNumbers, setMeasureArabicNumbers, setMeasureDirection } from '../../measure/rtl/bidiLines.js';
import { getMeasureScriptContext, setMeasureScriptContext, scriptContextOfLocale, hanMarksOfLocale } from '../../measure/script.js';
import { getMeasureLanguage, setMeasureLanguage } from '../../measure/canvas.js';
import { shapingLanguageOf } from '../../hyphenation/locale.js';
import { createHeadingLevelResolver, numberTitlesFor, headingMarksFor, headingIsNumbered, planHeadingSections, sectionWritingMode } from '../sections/headingStyles.js';
import { applyCitations, processCitations, citationLocale, withBibliographyStyle } from '../references/citations.js';
import { needsCitationContext, bookCitationContexts } from '../../citations/context.js';
import { hasAnchorRefs, anchorTargetsOf } from '../references/crossRefs.js';
import { type AnchorRefContext } from '../resources/resourceLayout.js';
import { numberStatements, applyStatementNumbering, outlineLookup } from '../text/statementNumbering.js';
import { wrapPageSpanEmbeds, spanEmbedStyle } from '../floats/spanEmbeds.js';
import { wrapFlowColumns, flowColumnsStyles } from '../columns/flowColumns.js';
import { wrapComposedPages, frameBoxStyle } from '../../composed/wrap.js';
import { planComposedPages, type PlannedComposedPage, composedPageAt } from '../composedPages/composedLayout.js';
import { importJumps } from '../../composed/carry.js';
import { hasTocDirective, hasIndexDirective, computeOutline, headingTemplatesOf, headingNumberingOptions } from '../contents/outline.js';
import { expandTocDirectives } from '../contents/toc.js';
import { expandIndexDirectives } from '../contents/indexDirective.js';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../styles.js';
import { computeLevelIndentsPx, computeOrderedListRunMetrics, computeOrderedLevelIndentsPx } from '../text/lists.js';
import { createPageWithColumns, type PlacementCursor, pageLayoutOf } from '../blocks/placement.js';
import { wrapComicTextPanels, comicTextPanelsSupported, planComicTextPanels } from '../../comics/textPanels.js';
import { computePageMetrics, sheetRectToFlow, composedLeafConfig } from '../blocks/buildHelpers.js';
import { planParagraphContainers } from '../callouts/paragraphContainers.js';
import { splitFootnoteDefinitions, numberFootnotes, footnoteFormatOf, appendChapterEndNotes, noteNumberPositionOf, withFootnoteStyle } from '../references/footnotes.js';
import { planParts } from '../sections/parts.js';
import { planCallouts, type PlannedCallout } from '../callouts/calloutLayout.js';
import { type CalloutLayouter } from '../callouts/frameLayout.js';
import { computeFloatPlan, floatedResourceIds, type PlannedFloat } from '../floats/floatPlacement.js';
import { computeHeadingContext, computeResourceNumberingState, type ResourceNumberingMap } from '../resources/resourceNumbering.js';
import { effectiveResourceTypes, documentLocale } from '../../defaults/resources/resourceTypes.js';
import { resolveCalloutStylesConfig } from '../../defaults/boxes/calloutStyles.js';
import { relinkToPalette } from '../../defaults/shared.js';
import { codeParseOptions, wrapCodeBlocks, codeBoxStyle } from '../code/codeBlocks.js';
import { expandScoreBlocks } from '../resources/scoreBlocks.js';
import { buildCodeLineNumbers } from '../code/codeLines.js';
import { buildLineNumbers } from '../text/lineNumbers.js';
import { buildHeadersAndFooters } from '../pages/headerFooter.js';
import { flowColorValues } from '../sections/partPalette.js';
import { leadingBoldText } from '../pages/placeholders.js';
import { joiningLetterSpacingWarnings, dropCapWarnings, floatShrinkWarnings, pictureBelowPrintSizeWarnings, emptyCaptionWarnings } from '../contentWarnings.js';
import { literalBreaksFor } from '../text/hardBreaks.js';
import { tashkilFor } from '../text/tashkil.js';
import { paperByBlock, stampPagePaper } from '../pages/paper.js';
import { fillPageMarks, stampCarriedSource, carriedByDoc } from './pageMarks.js';
import { chapterNumbersOfContent, centrePageText } from './passHelpers.js';
import { type BuildDocumentOptions, type PassHints, type PassResult, BuildCancelledError } from './passTypes.js';
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
import type { BlockIteration } from './pass/blockIteration.js';
import { createBlockDispatch } from './pass/blockDispatch.js';
import { createBlockMeasure } from './pass/blockMeasure.js';
import { createResourceBlock } from './pass/resourceBlock.js';
import { createBlockLines } from './pass/blockLines.js';
import { createPlaceLines } from './pass/placeLines.js';

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


  const { dispatchBlock } = createBlockDispatch({
    state, resolved, baselineGrid, doc, pageIndexOffset, pageMetrics, pageWidthPx, pageHeightPx,
    bodyOffset, markdownBody, contentBlocks, resourceById, calloutStyles, paragraphContainers,
    calloutPlan, partPlan, composedPlans, comicTextPlans, floatedIds, cursor, openerPages,
    multiColumnBand, centredPages, flushFloatsIntoPage, onNewPage, tryPlacePendingFloatsOnCurrentPage,
    spanBoxAt, drainPendingFloats, markForcedBreak, pageTakesNumbering, closeFlowSegment,
    leaveCurrentPage, breakForPaper, flushPendingNumberingAtBoundary, placeCalloutInline,
    placeComicSpread, placeComicStrip, looseStripBoxes, placeComposedPage, placeComicText
  });
  const { measureBlock } = createBlockMeasure({
    state, balanceLooseness, balanceLooseBudget, balanceExtraPx, resolved, trackingLadder,
    looseOutcome, looseOffGrid, looseGained, headingLevels, dpi, doc, pageWidthPx, pageHeightPx,
    contentBlocks, paragraphContainers, partPlan, sectionPlan, cursor, openerPages, floatGapPx,
    uprightOn, onNewPage, partMeasureCtx, sectionMeasureCtx, measuredAcrossPage, atColumnHead,
    openSpanHeadingHere, closeFlowSegment, flushPendingNumberingAtBoundary, inlineAsideWanted,
    measureInlineAside, firstFlowBlockIdx
  });
  const { placeResourceBlock } = createResourceBlock({
    state, resolved, dpi, baselineGrid, doc, pageWidthPx, pageHeightPx, bodyOffset, bodyStyle, cursor,
    floatGapPx, offsetResourceBlockToAbsolute, textWrapNotes, movedNotes, wrapExclusionWidth,
    wrapContourOf, onAtomicNewPage, stampBlockExtras, addBalanceExtra, enterBand,
    flushPendingNumberingAtBoundary, measureInlineAside, markInlineAside, placeInlineTableSlices
  });
  const { prepareLines } = createBlockLines({
    resolved, headingLevels, freshPageFlowColumns, contentBlocks, gateCitedFloats, measuredAcrossPage
  });
  const { placeLines } = createPlaceLines({
    state, balanceExtraPx, resolved, looseOutcome, headingLevels, dpi, baselineGrid, doc, pageWidthPx,
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
