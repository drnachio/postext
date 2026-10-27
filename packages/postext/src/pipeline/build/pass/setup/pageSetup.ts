// The pass's page frame: the baseline grid, the document, its continuation
// and the page and leaf metrics every page is cut from (#1278).
import { computeBaselineGrid, resolvedLocale } from '../../../config.js';
import { createVDTDocument, type ResolvedConfig, type VDTPage, type BoundingBox, pageIsVertical } from '../../../../vdt.js';
import { computePageMetrics, sheetRectToFlow, composedLeafConfig } from '../../../blocks/buildHelpers.js';
import { createPageWithColumns } from '../../../blocks/placement.js';
import { extractFrontmatter, normalizeMetadata } from '../../../../parse/frontmatter.js';
import { numberTitlesFor, headingMarksFor } from '../../../sections/headingStyles.js';
import { tashkilFor } from '../../../text/tashkil.js';
import { literalBreaksFor } from '../../../text/hardBreaks.js';
import { parseMarkdownMemo } from '../../../../parse/index.js';
import { codeParseOptions } from '../../../code/codeBlocks.js';
import type { PostextContent } from '../../../../types.js';
import type { PassState } from '../state.js';
import type { PassSetupState } from '../setupState.js';

/** What createPageSetup takes from the pass. */
export interface PageSetupDeps {
  content: PostextContent;
  state: PassState;
  setup: PassSetupState;
}

export function createPageSetup(deps: PageSetupDeps) {
  const {
    content, state, setup
  } = deps;
  // Compute baseline grid
  const baselineGrid = computeBaselineGrid(setup.resolved);

  // Create document
  const doc = createVDTDocument(setup.resolved, baselineGrid);
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
  const afterPartPage = continuation?.afterPartPage === true && setup.resolved.parts.page;
  if (afterPartPage) doc.afterPartPage = true;
  // The book's page count, when the host knows it (`{bookTotalPages}`).
  const bookPageCount = Math.floor(continuation?.bookPageCount ?? 0);
  if (bookPageCount > 0) doc.bookPageCount = bookPageCount;

  const pageMetrics = computePageMetrics(setup.resolved);
  const { pageWidthPx, pageHeightPx, trimOffset } = pageMetrics;
  // The geometry pages are opened with: the document's, or — inside a
  // styled section with its own margins / layout — the section's.
  state.contentArea = pageMetrics.contentArea;
  state.geomResolved = setup.resolved;
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
  const leafConfig = setup.resolved.composedViewerLeaf;
  const leaf = leafConfig
    ? (() => {
        const leafResolved = composedLeafConfig(setup.resolved)!;
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
  if (setup.resolved.page.binding === 'right') doc.binding = 'right';

  // Create first page
  const firstPage = createPageWithColumns(0, setup.resolved, state.contentArea, pageWidthPx, pageHeightPx, pageIndexOffset);
  doc.pages.push(firstPage);

  // Extract frontmatter, then parse the remaining markdown body
  const { metadata: frontmatterMeta, content: markdownBody, contentOffset: bodyOffset, fieldSources } = extractFrontmatter(content.markdown);
  // Typed YAML values (`title: 1984`, `publishDate: 2026-09-24`) print as
  // text; dates in the document language (a blank `locale` is unset).
  doc.metadata = normalizeMetadata(
    { ...(content.metadata ?? {}), ...frontmatterMeta },
    resolvedLocale(setup.resolved),
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
  const parsedBody = numberTitlesFor(headingMarksFor(tashkilFor(literalBreaksFor(parseMarkdownMemo(markdownBody, codeParseOptions(setup.resolved)), setup.resolved), setup.resolved.bodyText.tashkil), setup.resolved), setup.resolved);
  return {
    baselineGrid, doc, continuation, pageIndexOffset, afterPartPage, pageMetrics, pageWidthPx,
    pageHeightPx, freshPageFlowColumns, designFramesOn, toLeaf, frontmatterMeta, markdownBody,
    bodyOffset, parsedBody
  };
}
