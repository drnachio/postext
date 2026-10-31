// The content a pass places, read once: parsed blocks, citations, footnotes,
// exercises, numbering, resources and the box, part, section and float plans (#1278).
import { needsCitationContext, bookCitationContexts } from '../../../../citations/context.js';
import { setHyphenationRules } from '../../../../hyphenation/hyphenate.js';
import { citedNames } from '../../../../citations/names.js';
import { applyCitations, processCitations, citationLocale, withBibliographyStyle } from '../../../references/citations.js';
import { resolvedLocale, computeColumnBboxes } from '../../../config.js';
import { needsExerciseExpansion, expandDocumentExercises, withExerciseStyles, exerciseSettingsFor, nameExerciseAnchors } from '../../../../exercises/build.js';
import { exerciseDigitalOf } from '../../../../exercises/digital.js';
import { splitFootnoteDefinitions, numberFootnotes, footnoteFormatOf, appendChapterEndNotes, noteNumberPositionOf, withFootnoteStyle } from '../../../references/footnotes.js';
import { applyLinkNotes } from '../../../references/linkNotes.js';
import { hasAnchorRefs, anchorTargetsOf } from '../../../references/crossRefs.js';
import { hasTocDirective, hasIndexDirective, computeOutline, headingTemplatesOf, headingNumberingOptions } from '../../../contents/outline.js';
import type { AnchorRefContext } from '../../../resources/resourceLayout.js';
import { expandIndexDirectives } from '../../../contents/indexDirective.js';
import { expandTocDirectives } from '../../../contents/toc.js';
import { numberStatements, applyStatementNumbering, outlineLookup } from '../../../text/statementNumbering.js';
import { wrapComposedPages, frameBoxStyle } from '../../../../composed/wrap.js';
import { wrapComicTextPanels, comicTextPanelsSupported, planComicTextPanels } from '../../../../comics/textPanels.js';
import { wrapFlowColumns, flowColumnsStyles } from '../../../columns/flowColumns.js';
import { wrapPageSpanEmbeds, spanEmbedStyle } from '../../../floats/spanEmbeds.js';
import { effectiveResourceTypes, documentLocale } from '../../../../defaults/resources/resourceTypes.js';
import { expandScoreBlocks } from '../../../resources/scoreBlocks.js';
import { wrapCodeBlocks, codeBoxStyle } from '../../../code/codeBlocks.js';
import { importJumps } from '../../../../composed/carry.js';
import { indexWarnings } from '../../warnings.js';
import type { ContentBlock } from '../../../../parse/index.js';
import { headingIsNumbered, planHeadingSections, sectionWritingMode } from '../../../sections/headingStyles.js';
import { computeHeadingNumbering } from '../../../../numerals/numbering.js';
import { chapterNumbersOfContent } from '../../passHelpers.js';
import type { Resource, ResourceType, ResolvedCalloutStyleConfig, PostextContent, PostextConfig } from '../../../../types.js';
import { computeHeadingContext, computeResourceNumberingState, type ResourceNumberingMap } from '../../../resources/resourceNumbering.js';
import type { VDTFigureLabel, ResolvedConfig, VDTColumn } from '../../../../vdt.js';
import { figureLabels } from '../../../blocks/buildMeasurement.js';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../../../styles.js';
import { dimensionToPx } from '../../../../units.js';
import { resolveCalloutStylesConfig } from '../../../../defaults/boxes/calloutStyles.js';
import { relinkToPalette } from '../../../../defaults/shared.js';
import { computeLevelIndentsPx, computeOrderedListRunMetrics, computeOrderedLevelIndentsPx } from '../../../text/lists.js';
import { planParagraphContainers } from '../../../callouts/paragraphContainers.js';
import { planCallouts, type PlannedCallout } from '../../../callouts/calloutLayout.js';
import { planParts } from '../../../sections/parts.js';
import { computeFloatPlan, floatedResourceIds, type PlannedFloat } from '../../../floats/floatPlacement.js';
import { planComposedPages, type PlannedComposedPage, composedPageAt } from '../../../composedPages/composedLayout.js';
import type { CalloutLayouter } from '../../../callouts/frameLayout.js';
import type { PlacementCursor } from '../../../blocks/placement.js';
import type { PassHints } from '../../passTypes.js';
import type { VDTDocument } from '../../../../vdt/document.js';
import type { LayoutContinuation, DocumentMetadata } from '../../../../types/content.js';
import type { PageMetrics } from '../../../blocks/buildHelpers.js';
import type { PassSetupState } from '../setupState.js';

/** What createContentSetup takes from the pass. */
export interface ContentSetupDeps {
  content: PostextContent;
  config: PostextConfig | undefined;
  hints: PassHints;
  hyphenationRules: { exceptions: string[] | undefined; capitalized: boolean; };
  doc: VDTDocument;
  continuation: LayoutContinuation | undefined;
  pageMetrics: PageMetrics;
  frontmatterMeta: DocumentMetadata;
  bodyOffset: number;
  parsedBody: ContentBlock[];
  setup: PassSetupState;
}

export function createContentSetup(deps: ContentSetupDeps) {
  const {
    content, config, hints, hyphenationRules, doc, continuation, pageMetrics, frontmatterMeta,
    bodyOffset, parsedBody, setup
  } = deps;
  const citationContext = content.citations
    ?? (needsCitationContext(parsedBody, frontmatterMeta) ? bookCitationContexts([{ metadata: frontmatterMeta as Record<string, unknown>, blocks: parsedBody }], content.resources)[0] : undefined);
  // `citations.hyphenateNames: false`: the cited authors' names are never
  // divided, in a citation, in the text or in the bibliography (#699).
  if (citationContext && !setup.resolved.citations.hyphenateNames) {
    setHyphenationRules({ ...hyphenationRules, names: citedNames(citationContext.items) });
  }
  const citationsApplied = citationContext
    ? applyCitations(
      parsedBody,
      citationContext,
      processCitations(citationContext, setup.resolved, citationLocale(setup.resolved, resolvedLocale(setup.resolved))),
      setup.resolved,
      resolvedLocale(setup.resolved),
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
      setup.resolved,
      computeColumnBboxes(pageMetrics.contentArea, setup.resolved)[0]?.width ?? pageMetrics.contentArea.width,
      continuation,
      content.outline,
    )
    : undefined;
  if (exerciseExpansion) {
    setup.resolved = withExerciseStyles(setup.resolved);
    // The document's config names the exercises' chip and paragraph
    // styles too: an output that styles its text from the config (a
    // reflowable EPUB, #1231) finds them there.
    doc.config = setup.resolved;
    doc.exercises = exerciseExpansion.records;
    doc.exerciseDigital = exerciseDigitalOf(exerciseSettingsFor(setup.resolved));
  }
  // External links in print (#1302): their addresses in parentheses, or
  // in notes that join the footnotes.
  const linked = applyLinkNotes(exerciseExpansion?.blocks ?? citationsApplied?.blocks ?? parsedBody, setup.resolved.links, setup.resolved.layout.writingMode === 'vertical-rl', setup.resolved.direction === 'rtl');
  const footnoteSplit = splitFootnoteDefinitions(linked);
  const footnoteDefs = footnoteSplit.defs;
  // Numbered by page or column (`numbering: 'page'`), a note takes the
  // number the previous build gave it where it landed; the first build
  // numbers by chapter (see `buildDocumentNumbered`).
  // A decimal note number is written in the document's digits.
  const footnoteNumbering = numberFootnotes(
    footnoteSplit.blocks,
    setup.resolved.footnotes.numbering,
    setup.resolved.footnotes.numbering === 'document' ? Math.max(0, Math.floor(continuation?.footnoteNumber ?? 0)) : 0,
    footnoteFormatOf(setup.resolved.footnotes, setup.resolved.numerals),
    setup.resolved.footnotes.markerTemplate,
  );
  if (hints.footnoteNumbers) {
    for (const [id, number] of hints.footnoteNumbers) {
      if (footnoteNumbering.numbers.has(id)) footnoteNumbering.numbers.set(id, number);
    }
  }
  const chapterEndNotes = setup.resolved.footnotes.placement === 'chapterEnd' && footnoteNumbering.numbers.size > 0;
  const parsedBlocks = chapterEndNotes
    ? appendChapterEndNotes(footnoteSplit.blocks, footnoteNumbering, footnoteDefs, noteNumberPositionOf(setup.resolved.footnotes, setup.resolved.layout.writingMode === 'vertical-rl'), setup.resolved.footnotes.numberGap)
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
      ? nameExerciseAnchors(computeOutline(parsedBlocks, setup.resolved, headingStart, continuation?.statementCounters), exerciseExpansion?.records ?? [])
      : undefined);
  // A story carried in from another chapter (#943) may refer to anchors too.
  const carriedRefs = continuation?.jumps?.some((j) => j.outline) === true;
  const anchorRefContext: AnchorRefContext | undefined = anchorRefs || carriedRefs
    ? { targets: anchorTargetsOf(outline), strings: setup.resolved.crossRefs }
    : undefined;
  const indexExpanded = expandIndexDirectives(expandTocDirectives(parsedBlocks, outline, setup.resolved), outline, setup.resolved);
  // Labelled equations and counted boxes (#530): the numbers go into the
  // formulas (as tags) and the boxes (a run-in label or a title), a
  // reference inside a formula prints the number it names, and a style's
  // end mark closes its boxes.
  const statementNumbering = numberStatements(parsedBlocks, setup.resolved, {
    ...(headingStart ? { headings: headingStart } : {}),
    ...(continuation?.statementCounters ? { counters: continuation.statementCounters } : {}),
  });
  const numberedBlocks = applyStatementNumbering(indexExpanded.blocks, statementNumbering, setup.resolved, outlineLookup(content.outline ? anchorTargetsOf(content.outline) : undefined));
  // An inline `::resource` placed `here` with `span: 'page'` spans the
  // page where it stands (#535): each goes in a frameless page-span box,
  // set by the span-block path like any other.
  // A `:::columns` group in the running text (#634): each in a frameless
  // box the callout machinery places, cuts and splits.
  // Composed pages (#855): each page's content regrouped into the stories
  // its template's frames receive, one frameless box each (set at the
  // page's template, below). Before the main-flow groups: a `:::columns`
  // in a frame is a group of its box.
  const templateSource = { pageTemplates: setup.resolved.pageTemplates, calloutStyles: setup.resolved.calloutStyles };
  const composedWrap = wrapComposedPages(numberedBlocks, templateSource);
  // A comic page's text panels (#885): each panel's Markdown in a story
  // box of the same kind, set in the panel's frame (below).
  const comicText = wrapComicTextPanels(composedWrap.blocks, comicTextPanelsSupported(setup.resolved));
  const flowGroups = setup.resolved.layout.flowColumns ? wrapFlowColumns(comicText.blocks) : { blocks: comicText.blocks, wrapped: false };
  const spanEmbeds = wrapPageSpanEmbeds(flowGroups.blocks, content.resources ?? [], effectiveResourceTypes(config, content.resources ?? []));
  // Code listings (#624): each in a box of the code style, which the
  // callout machinery places and splits.
  // Music scores (#1172): each engraved at the width of the flow's first
  // column, one block per system.
  const scores = expandScoreBlocks(spanEmbeds.blocks, setup.resolved, computeColumnBboxes(pageMetrics.contentArea, setup.resolved)[0]?.width ?? pageMetrics.contentArea.width);
  const codeBoxes = wrapCodeBlocks(scores.blocks, setup.resolved);
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
  const isNumbered = (b: ContentBlock): boolean => headingIsNumbered(b, setup.resolved);

  const { prefixes: headingPrefixes, values: headingNumbers } = computeHeadingNumbering(
    contentBlocks,
    headingTemplatesOf(setup.resolved),
    headingStart ? [headingStart.h1, headingStart.h2, headingStart.h3, headingStart.h4, headingStart.h5, headingStart.h6] : undefined,
    isNumbered,
    headingNumberingOptions(setup.resolved),
  );
  // `{chapterNumber}` at each content block — the current chapter's, as the
  // running heads print it on the block's page (`computeChapterNumbers`
  // runs the same counter over the placed blocks) — so an opener design is
  // measured with the number it is painted with.
  const chapterNumberByBlock = chapterNumbersOfContent(contentBlocks, setup.resolved, headingPrefixes, headingNumbers, doc.chapterOrdinalOffset ?? 0);

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
    setup.resolved.numerals,
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
  const bodyStyle = resolveBodyStyle(setup.resolved);
  // The callout styles, with the frameless box of the page-span embeds
  // when there are any: the float gap (a line) above and below it, as an
  // inline resource keeps in a column.
  // The listings' box (#624) likewise.
  const syntheticBoxes = [
    ...(spanEmbeds.wrapped ? [spanEmbedStyle(bodyStyle.lineHeightPx, setup.resolved.layout.inlineResourceGap !== 'above')] : []),
    ...(codeBoxes.wrapped ? [codeBoxStyle(setup.resolved)] : []),
    // The boxes exercises are set in (#1227).
    ...(exerciseExpansion?.wrapped ? exerciseExpansion.boxes : []),
    // The frameless box of a composed page's story (#855).
    ...(composedWrap.wrapped || comicText.wrapped ? [frameBoxStyle(Math.max(setup.resolved.bodyText.avoidOrphans ? setup.resolved.bodyText.orphanMinLines : 1, setup.resolved.bodyText.avoidWidows ? setup.resolved.bodyText.widowMinLines : 1))] : []),
    // The boxes of main-flow groups: sub-columns a body line apart in the
    // text column, a gutter apart across the page.
    ...(flowGroups.wrapped
      ? flowColumnsStyles(
        bodyStyle.lineHeightPx,
        dimensionToPx(setup.resolved.layout.gutterWidth, setup.resolved.page.dpi, bodyStyle.fontSizePx),
        setup.resolved.bodyText.paragraphSpacing === false ? { value: 0, unit: 'px' } : { value: bodyStyle.marginBottomPx, unit: 'px' },
        Math.max(setup.resolved.bodyText.avoidOrphans ? setup.resolved.bodyText.orphanMinLines : 1, setup.resolved.bodyText.avoidWidows ? setup.resolved.bodyText.widowMinLines : 1),
      )
      : []),
  ];
  const exerciseBoxIds = new Set(exerciseExpansion?.wrapped ? exerciseExpansion.boxes.map((b) => b.id) : []);
  const calloutStyles = syntheticBoxes.length > 0
    ? [...setup.resolved.calloutStyles, ...resolveCalloutStylesConfig(syntheticBoxes, setup.resolved.bodyText, setup.resolved.headings, setup.resolved.unorderedLists, config?.locale)
      // The exercise boxes' defaults (a solutions title, a bank's frame)
      // link to `main-color`: set them to the document's palette.
      .map((s) => (exerciseBoxIds.has(s.id) ? relinkToPalette(s, config?.colorPalette) : s))]
    : setup.resolved.calloutStyles;
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
  const calloutResolved: ResolvedConfig = codeBoxes.wrapped || flowGroups.wrapped || composedWrap.wrapped || comicText.wrapped || exerciseExpansion?.wrapped ? { ...setup.resolved, calloutStyles } : setup.resolved;
  const blockquoteStyle = resolveBlockquoteStyle(setup.resolved);
  const listLevelIndentsPx = computeLevelIndentsPx(setup.resolved, bodyStyle.fontSizePx);
  const orderedMetrics = computeOrderedListRunMetrics(contentBlocks, setup.resolved, bodyStyle.fontSizePx);
  const orderedLevelIndentsPx = computeOrderedLevelIndentsPx(
    setup.resolved,
    bodyStyle.fontSizePx,
    orderedMetrics.maxWidthByDepth,
  );
  // `:::paragraphs{style="…"}` containers, resolved per content-block index.
  let containerStyles = chapterEndNotes ? withFootnoteStyle(setup.resolved) : setup.resolved;
  if (citationsApplied?.bibliography) containerStyles = withBibliographyStyle(containerStyles, citationsApplied.labelChars);
  const paragraphContainers = planParagraphContainers(contentBlocks, containerStyles);
  // `:::callout` ranges keyed by their start marker index (same rationale).
  const calloutPlan = planCallouts(contentBlocks);
  // `:::part` ranges: start/end marker indices and the enclosed blocks.
  const partPlan = planParts(contentBlocks);
  // Styled sections (`{style="…"}` headings): geometry, running heads and
  // body typography per content-block index.
  const sectionPlan = planHeadingSections(contentBlocks, setup.resolved);

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
    (blockIdx) => sectionWritingMode(sectionPlan, setup.resolved, blockIdx) === 'vertical-rl', setup.resolved.layout.floatShrink, setup.resolved.layout.wrap,
    setup.resolved.layout.floatsAtCitingPage);
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
  return {
    captionCitations, footnoteDefs, footnoteNumbering, chapterEndNotes, anchorRefContext,
    templateSource, codeBoxes, contentBlocks, carried, headingPrefixes, headingNumbers,
    chapterNumberByBlock, resources, resourceTypes, resourceNumbering, stripNumbers, resourceById,
    resourceTypeById, resourceNumberById, figureLabelsById, bodyStyle, calloutStyles,
    calloutResolved, blockquoteStyle, listLevelIndentsPx, orderedMetrics, orderedLevelIndentsPx,
    paragraphContainers, calloutPlan, partPlan, sectionPlan, floatPlan, composedPlans,
    comicTextPlans, floatedIds, floatsByFirstBlock, calloutFloats, cursor, forcedBreakPages,
    uncappedBottoms, openerHeadFloats
  };
}
