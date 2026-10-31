// The VDT document root and what it carries: the resolved config, the
// bounding box every node uses, and the factory functions that create a
// document, page, column and block (#1276: split out of vdt.ts).
import type { ResolvedPageConfig, ResolvedLayoutConfig, ResolvedBodyTextConfig, ResolvedHeadingsConfig, ResolvedTableStyleConfig, ResolvedNamedTableStyleConfig, ResolvedCaptionStyleConfig, ResolvedDiagramStyleConfig, ResolvedScoreStyleConfig, ResolvedNamedScoreStyleConfig, ResolvedVideoStyleConfig, ResolvedParagraphStyleConfig, ResolvedCalloutStyleConfig, ResolvedChipStyleConfig, ResolvedMarkStyleConfig, ResolvedUnorderedListsConfig, ResolvedOrderedListsConfig, ResolvedMathConfig, ResolvedDesignSlot, ResolvedPartsConfig, ResolvedHeadingStyleConfig, ResolvedTocConfig, ResolvedIndexConfig, ResolvedFootnotesConfig, ResolvedCrossRefsConfig, ResolvedCitationsConfig, ResolvedLinksConfig, ResolvedCjkConfig, PostextConfig, ColorPaletteEntry, ResolvedPdfGenerationConfig, ResolvedPrintConfig, ResolvedContrastConfig, ResolvedChecksConfig, ResolvedFolioConfig, ResolvedComicsConfig, ResolvedLineNumbersConfig, ResolvedCodeStyleConfig, PageTemplate, ResolvedLabelStyle, FrameLookEntry, Dimension, PageMargins, DocumentMetadata, PartState } from '../types.js';
import type { StoryJump } from '../composed/carryTypes.js';
import type { VDTBlock, VDTGridBalancing, VDTColumn, VDTBlockType, TextAlign } from './blocks.js';
import type { ContentWarning } from './contentWarnings.js';
import type { VDTAnchor, VDTLine } from './lines.js';
import type { VDTPage } from './pages.js';
import type { LayoutWarning, ConfigWarning } from './warnings.js';

// ---------------------------------------------------------------------------
// Bounding box — all values in px, relative to page origin
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedConfig {
  page: ResolvedPageConfig;
  layout: ResolvedLayoutConfig;
  bodyText: ResolvedBodyTextConfig;
  headings: ResolvedHeadingsConfig;
  tableStyle: ResolvedTableStyleConfig;
  /** Named table styles (`tableStyles`), each already laid over
   *  `tableStyle`; a table picks one with `table.styleId`. */
  tableStyles: ResolvedNamedTableStyleConfig[];
  captionStyle: ResolvedCaptionStyleConfig;
  diagramStyle: ResolvedDiagramStyleConfig;
  /** Music scores (#1173). */
  scoreStyle: ResolvedScoreStyleConfig;
  /** Named score styles, each laid over `scoreStyle`. */
  scoreStyles: ResolvedNamedScoreStyleConfig[];
  videoStyle: ResolvedVideoStyleConfig;
  paragraphStyles: ResolvedParagraphStyleConfig[];
  /** Exercise styles and settings, resolved (#1226): set only when the
   *  config names `exerciseStyles` or `exercises`. */
  exerciseSettings?: import('../defaults/boxes/exercises.js').ExerciseSettings;
  calloutStyles: ResolvedCalloutStyleConfig[];
  /** Named chip styles (`:chip[…]{style="…"}`). */
  chipStyles: ResolvedChipStyleConfig[];
  /** Highlight styles of `:mark[…]` (#888). */
  markStyles: ResolvedMarkStyleConfig[];
  unorderedLists: ResolvedUnorderedListsConfig;
  orderedLists: ResolvedOrderedListsConfig;
  math: ResolvedMathConfig;
  header: ResolvedDesignSlot;
  footer: ResolvedDesignSlot;
  /** Part dividers (`:::part` containers). */
  parts: ResolvedPartsConfig;
  /** Named heading styles (`# Title {style="…"}`). */
  headingStyles: ResolvedHeadingStyleConfig[];
  /** The table of contents `:::toc` prints. */
  toc: ResolvedTocConfig;
  /** The back-of-book index `:::index` prints. */
  index: ResolvedIndexConfig;
  /** Footnotes (`[^id]`): placement, numbering, style. */
  footnotes: ResolvedFootnotesConfig;
  /** Cross-references to headings and anchors (#266). */
  crossRefs: ResolvedCrossRefsConfig;
  /** Citations and the bibliography (#270). */
  citations: ResolvedCitationsConfig;
  /** External links in print (#1302); present only when they print
   *  something (`print` other than `'none'`). */
  links?: ResolvedLinksConfig;
  /** East Asian typography (`cjk`), with `'auto'` resolved from the
   *  document language. */
  cjk: ResolvedCjkConfig;
  /** The document language (`PostextConfig.locale`) when the config sets
   *  one; `resolvedLocale()` falls back to the hyphenation locale. Spelled-
   *  out heading numbers follow it. */
  locale?: PostextConfig['locale'];
  /** The document's base direction, `PostextConfig.direction` resolved
   *  (`'auto'` from the document language): present only when it is
   *  `'rtl'`, so a left-to-right document resolves as it always has. Read
   *  it with `resolvedDirection()`. */
  direction?: 'rtl';
  /** The digits of the generated numbers (`PostextConfig.numerals`, with
   *  `'auto'` resolved from the document language) when they are not the
   *  European ones; absent for `'latn'` (see `documentNumerals`). */
  numerals?: 'arab' | 'arabext';
  /** The document's colour palette, kept so per-resource-type caption
   *  overrides (`ResourceType.captionStyle`) can resolve palette colours at
   *  layout time. Absent when the config defines no palette. */
  colorPalette?: ColorPaletteEntry[];
  /** The PDF settings (`PostextConfig.pdfGeneration`), resolved, when the
   *  config sets any. Layout ignores them; `renderToPdf` in postext-pdf
   *  reads them for each setting its own options leave out. */
  pdfGeneration?: ResolvedPdfGenerationConfig;
  /** Print production (`PostextConfig.print`), resolved, when the config
   *  sets any. Layout ignores it; postext-pdf and the preflight read it. */
  print?: ResolvedPrintConfig;
  /** The contrast check's settings (`PostextConfig.contrast`), resolved,
   *  when the config sets any. Layout ignores them; `contrastDocument`
   *  reads them. */
  contrast?: ResolvedContrastConfig;
  /** The checks of the configuration itself (`PostextConfig.checks`, #849),
   *  resolved, when the config sets any. Layout ignores them. */
  checks?: ResolvedChecksConfig;
  /** The Folio 3D viewer settings (`PostextConfig.folio`), resolved, when
   *  the config sets any. Layout ignores them; `postext-folio` reads them. */
  folio?: ResolvedFolioConfig;
  /** Comic pages (`PostextConfig.comics`), resolved, when the config sets
   *  any; absent otherwise, so a document without comics resolves (and
   *  hashes) as before. Read it with `resolvedComics()`, which falls back
   *  to the defaults of the document language. */
  comics?: ResolvedComicsConfig;
  /** Line numbers (`PostextConfig.lineNumbers`, #621), resolved, when the
   *  config sets the section; absent otherwise (no numbers). */
  lineNumbers?: ResolvedLineNumbersConfig;
  /** Code listings and inline code (`PostextConfig.codeStyle`, #624),
   *  resolved, when the config sets the section; absent otherwise (the
   *  defaults apply, `resolvedCodeStyle`). */
  codeStyle?: ResolvedCodeStyleConfig;
  /** Page templates (`PostextConfig.pageTemplates`, #853) as written, when
   *  the config sets any; absent otherwise, so a document without composed
   *  pages resolves (and hashes) as before. Read one with
   *  `resolvePageTemplate(config, id, { parity })`. */
  pageTemplates?: PageTemplate[];
  /** Label styles (`PostextConfig.labelStyles`, #853), resolved, when the
   *  config sets any. */
  labelStyles?: ResolvedLabelStyle[];
  /** Named frame looks (`PostextConfig.frameLooks`, #1089), with what the
   *  engine cannot use left out, when the config sets any. */
  frameLooks?: FrameLookEntry[];
  /** The leaf composed pages are laid out on (`PostextConfig.composedViewerLeaf`,
   *  #1045), when a host sets one. */
  composedViewerLeaf?: { width: Dimension; height: Dimension; margins: Required<PageMargins> };
}

export interface VDTDocument {
  /** The exercises laid out (#1230): what each asks and answers, for the
   *  digital outputs. Absent when the document has none. */
  exercises?: import('../exercises/record.js').ExerciseRecord[];
  /** What the digital outputs need beside the records (#1230): the words
   *  of the exercise bar, checking and keeping, each style's colours. Set
   *  with `exercises`. */
  exerciseDigital?: import('../exercises/digital.js').ExerciseDigital;
  pages: VDTPage[];
  blocks: VDTBlock[];
  /** `'right'` when the book is bound on its right edge (`page.binding`):
   *  page 1 is still the recto, but the left page of a spread; viewers show
   *  the pairs `[3 | 2]` and turn pages leftward. Absent for a left-bound
   *  book. */
  binding?: 'right';
  /** Layout warnings raised while placing the content: boxes the layout
   *  had to force (see {@link LayoutWarning}). Absent or empty when
   *  everything fit. */
  warnings?: LayoutWarning[];
  /** References and markup the source names wrongly, each set in a
   *  fallback (see {@link ContentWarning}), located on the pages of the
   *  finished layout. Absent when the source is clean. */
  contentWarnings?: ContentWarning[];
  /** Where each index mark (`:index…`) of the document landed: the mark's
   *  source offset in the markdown body (front matter excluded) and the
   *  index of its page in `pages`. Marks whose text reached no page are
   *  left out. Absent when the document has no marks. */
  indexMarks?: { sourceStart: number; pageIndex: number }[];
  /** Where each anchor of the document landed (#261): headings with an
   *  identifier (`{#id}`), inline anchors and containers opened with one.
   *  What a cross-reference links to. Absent when the document sets none. */
  anchors?: VDTAnchor[];
  /** Configuration values the engine replaced (see {@link ConfigWarning});
   *  absent when the config is clean. */
  configWarnings?: ConfigWarning[];
  config: ResolvedConfig;
  baselineGrid: number;
  /** Column balancing on a character grid (#632); absent off the grid. */
  gridBalancing?: VDTGridBalancing;
  /** Pixel offset from canvas edge to trim edge (0 when cutLines disabled) */
  trimOffset: number;
  converged: boolean;
  iterationCount: number;
  metadata: DocumentMetadata;
  /** Source range of each frontmatter field value, so design text set from
   *  `{title}`, `{author}`… can map a click back to the editor. */
  metadataSources?: Record<string, { start: number; end: number }>;
  /** Physical pages before page 0 (`PostextContent.continuation`): shifts
   *  parity everywhere. Absent or 0 for a self-contained document. */
  pageIndexOffset?: number;
  /** Physical pages of the whole book the document belongs to
   *  (`continuation.bookPageCount`), what `{bookTotalPages}` prints. Absent
   *  when the host did not say: the placeholder then counts the pages up
   *  to the end of this document. */
  bookPageCount?: number;
  /** Indices of the pages where a `:::numbering{startAt=…}` directive
   *  restarts the page count, ascending. The pages before the first one
   *  continue the inherited numbering (`continuation.pageNumbering` or
   *  `page.pageNumbering`); a host laying out a book chapter by chapter
   *  tells the two apart when the pages before the chapter shift. Absent
   *  when the count never restarts. */
  pageNumberRestarts?: number[];
  /** Chapters (level-1 headings) before this document, so `{chapterNumber}`
   *  keeps counting without a numbering template. */
  chapterOrdinalOffset?: number;
  /** The part in effect before this document's first page (from
   *  `continuation.part`): `{partTitle}` / `{partNumber}` and the part's
   *  palette overrides apply from page 0 until the document opens a part. */
  partStart?: PartState;
  /** The page before this document is the part page of `partStart`
   *  (`continuation.afterPartPage`): a first page left blank is the part's
   *  verso and takes `parts.versoDesign`. */
  afterPartPage?: boolean;
  /** Parts set without a divider page (`parts.page: false`): each takes
   *  effect on the page of the first block placed after its fence
   *  (`afterContentIndex`, the fence's closing content index). */
  partMarks?: { afterContentIndex: number; number: string; title: string; palette?: Record<string, string> }[];
  /** The number of the last line the document counted (`lineNumbers`,
   *  #621), printed or not; absent when line numbers are off or nothing
   *  was counted. A host laying out a book chapter by chapter hands it to
   *  the next chapter (`continuation.lineNumber`) when lines are counted
   *  through the book. */
  lastLineNumber?: number;
  /** Set when the count of {@link lastLineNumber} started again inside
   *  the document (a restart, a poem's `lineStart`): it does not depend on
   *  the number the document inherited. */
  lineNumberRestarted?: true;
  /** Stories of this chapter that jump to a page fence of a later chapter
   *  (#943, `PostextContent.laterPageIds`): the rest of each, for the host
   *  to hand to that chapter (`LayoutContinuation.jumps`, with `chapter`
   *  set to this chapter's place in the book). Absent when none does. */
  pendingJumps?: StoryJump[];
  /** Where the index marks, anchors and headings written in a story that
   *  came in from another chapter landed here (#988): `chapter` is the
   *  chapter whose file they are in, `sourceStart` their offset in that
   *  chapter's body (the key of the entry the book's outline has for them)
   *  and `pageIndex` the page of this document. A host merges them into
   *  the sender's outline entries (`mergeCarriedOutline`). Absent when no
   *  story came in or it holds none. */
  carriedOutline?: VDTCarriedOutlineEntry[];
}

/** One index mark, anchor or heading of a carried story, located by the
 *  chapter that laid it (`VDTDocument.carriedOutline`). */
export interface VDTCarriedOutlineEntry {
  chapter: number;
  kind: 'indexMark' | 'anchor' | 'heading';
  sourceStart: number;
  pageIndex: number;
  /** An inline anchor: its identifier and where its line stands on the
   *  page (as `VDTAnchor`). */
  anchor?: { id: string; x: number; y: number };
}

export function createBoundingBox(
  x: number,
  y: number,
  width: number,
  height: number,
): BoundingBox {
  return { x, y, width, height };
}

export function createVDTDocument(
  config: ResolvedConfig,
  baselineGrid: number,
): VDTDocument {
  return {
    pages: [],
    blocks: [],
    config,
    baselineGrid,
    trimOffset: 0,
    converged: false,
    iterationCount: 0,
    metadata: {},
  };
}

export function createVDTPage(
  index: number,
  width: number,
  height: number,
  contentArea?: BoundingBox,
): VDTPage {
  return {
    index,
    width,
    height,
    contentArea: contentArea ?? { x: 0, y: 0, width, height },
    columns: [],
    marginNotes: [],
    pageNumberValue: index + 1,
    pageLabel: String(index + 1),
    pageNumberFormat: 'decimal',
  };
}

export function createVDTColumn(
  index: number,
  bbox: BoundingBox,
): VDTColumn {
  return {
    index,
    bbox,
    blocks: [],
    availableHeight: bbox.height,
    baselineOffset: 0,
  };
}

export function createVDTBlock(
  id: string,
  type: VDTBlockType,
  fontString: string,
  color: string,
  textAlign: TextAlign = 'left',
): VDTBlock {
  return {
    id,
    type,
    bbox: { x: 0, y: 0, width: 0, height: 0 },
    lines: [],
    pageIndex: -1,
    columnIndex: -1,
    dirty: true,
    snappedToGrid: false,
    fontString,
    color,
    textAlign,
  };
}

/** Vertical extent actually covered by text on a page: from the top of the
 *  first text line to the bottom of the last, across all columns. Resource
 *  captions count as text — both on inline resource blocks and on floats —
 *  since bottom-band floats anchor their caption baseline to the grid and
 *  the grid should visibly reach it. Hidden blocks and design slots don't
 *  count. Returns `null` for pages with no text (e.g. blank parity pages).
 *  Used to bound debug decorations like the baseline grid. */
export function computePageTextExtent(page: VDTPage): { top: number; bottom: number } | null {
  let top = Infinity;
  let bottom = -Infinity;
  const expand = (lines: VDTLine[]): void => {
    for (const line of lines) {
      if (line.bbox.y < top) top = line.bbox.y;
      const lineBottom = line.bbox.y + line.bbox.height;
      if (lineBottom > bottom) bottom = lineBottom;
    }
  };
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.hidden) continue;
      expand(block.lines);
      if (block.resourceBlock) expand(block.resourceBlock.captionLines);
    }
  }
  for (const fb of page.floats ?? []) {
    if (fb.hidden) continue;
    expand(fb.lines);
    if (fb.resourceBlock) expand(fb.resourceBlock.captionLines);
  }
  return top === Infinity ? null : { top, bottom };
}
