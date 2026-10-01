import type { EastAsianNumeralStyle, NumberFormatStyle, NumeralStyle } from './numbering';

/** @deprecated Legacy content-model resource used by the VDT renderer
 *  (`VDTBlock.resource`). The Resources-panel feature uses the newer
 *  `Resource` / `ResourceType` model below. Retained until the renderer
 *  migrates off it. */
export interface PostextResource {
  id: string;
  type: 'image' | 'table' | 'figure' | 'pullQuote';
  src?: string;
  alt?: string;
  caption?: string;
  content?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Resources model (issue #49) — user-managed, typed, numbered resources
// (images, SVGs, HTML tables) that can be referenced inline.
// ---------------------------------------------------------------------------

/** How a counter renders for a given resource type. The East Asian styles
 *  keep their CSS names (`simp-chinese-informal`, `circled-decimal`…). */
export type ResourceCounterFormat =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'alpha-lower'
  | 'alpha-upper'
  | EastAsianNumeralStyle;

/** When the per-type counter resets back to its starting value. `'never'`
 *  yields a single document-wide running count; `'h1'..'h6'` resets the
 *  counter whenever a heading of that level is encountered. */
export type ResourceCounterReset = 'never' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Where a resource floats on the page. `'auto'` (the default) detaches the
 *  resource from the running text and lands it in the first free slot after
 *  its first reference — the bottom of the referencing column, the top or
 *  bottom of the next empty column on the same page, then the bands of the
 *  next page. `'top'` / `'bottom'` restrict the search to top or bottom
 *  slots. `'here'` opts out of floating and embeds the resource inline at
 *  the exact `::resource` directive position. */
export type ResourceFloatPosition = 'auto' | 'top' | 'bottom' | 'here';

/** How wide a floated resource is. `'column'` keeps it within a single column;
 *  `'page'` spans the full content width across all columns (a full-width
 *  float that breaks the column flow). In a single-column layout the two are
 *  equivalent. `'side'` sets the resource in the side column of a
 *  one-and-a-half layout whose side column is reserved for floats
 *  (`layout.sideColumnRole: 'floats'`), stacked beside the paragraph that
 *  first cites it; on a page without such a column it behaves as
 *  `'column'`. */
export type ResourceFloatSpan = 'column' | 'page' | 'side';
/** Rotation of a floated resource on the page, a quarter turn either way:
 *  `'ccw'` turns the resource counter-clockwise — its top faces the left
 *  edge of the page and the reader turns the book clockwise to read it, the
 *  convention for landscape tables in a portrait book; `'cw'` turns it
 *  clockwise, its top facing the right edge. */
export type ResourceRotation = 'ccw' | 'cw';

/** Placement of a resource on the page. Resolved per resource, falling back to
 *  its {@link ResourceType.defaultPlacement} and then the built-in default
 *  (`auto` / `column`). See {@link resolveResourcePlacement}. */
export interface ResourcePlacement {
  position?: ResourceFloatPosition;
  span?: ResourceFloatSpan;
  /** Set the resource turned a quarter turn on the page (a landscape table
   *  in a portrait book). A rotated resource is always a page-span float:
   *  it is laid out along the height of the page's content area, rounded
   *  down to whole lines of the baseline grid and less one body line (the
   *  float gap every float band keeps), takes a whole page (a table too wide for one page continues on the next, cut
   *  between rows like an upright table), and sits flush to the spine when
   *  the margins are mirrored, flush left otherwise. Ignored for an inline
   *  (`position: 'here'`) embed. */
  rotate?: ResourceRotation;
  /** Fraction of the column (or page) width the float — or the inline
   *  embed — takes, `0 < width < 1`: a narrow table centred in its column.
   *  Default: the whole width. */
  width?: number;
  /** Where a resource narrower than its slot sits: a float or embed
   *  narrowed by `width`, and a picture (bitmap or SVG) narrower than its
   *  slot — a bitmap smaller than the column, or one `layout.fitFiguresToPage`
   *  shrank — whose caption and note keep the slot's measure. A turned
   *  figure and one with its caption beside it stay flush left. Default
   *  `'left'` (up to postext 1.4 a narrower picture was always set flush
   *  left). */
  align?: 'left' | 'center' | 'right';
  /** Set the caption beside the figure, in the float-only side column of
   *  a `oneAndHalf` layout (`layout.sideColumnRole: 'floats'`): the body
   *  keeps its column, the caption goes to the margin level with the
   *  figure's top (its bottom for a bottom float). A page without such a
   *  column keeps the caption under the figure. Column floats only. */
  captionSide?: boolean;
}

/** A user-definable category of resource (e.g. "Figure", "Table"). Drives
 *  numbering, caption prefixes, and inline-reference labels. */
export interface ResourceType {
  /** Stable identifier, referenced by `Resource.typeId`. */
  id: string;
  /** Display name, singular (e.g. "Figure"). */
  name: string;
  /** Optional plural display name (e.g. "Figures"). */
  namePlural?: string;
  /** Compact label used in inline references (e.g. "Fig."). */
  shortLabel: string;
  /** Template for the computed number. Placeholders: `{n}` (the counter),
   *  `{h1}`..`{h6}` (current heading numbers). E.g. `'{h1}.{n}'`. `''`
   *  prints no number: the caption reads "Do. Caption" and a reference the
   *  label alone, though the counter still counts. */
  numberingTemplate: string;
  /** When the counter resets. */
  resetOn: ResourceCounterReset;
  /** How the `{n}` counter is formatted. The page and list spellings of a
   *  format are read too (`'lower-roman'`, `'arabic'`…, see
   *  `parseNumberFormat`); an unknown value counts in decimal and is
   *  reported by `collectConfigWarnings`. */
  counterFormat: ResourceCounterFormat;
  /** Prefix prepended to the caption (e.g. "Figure"). The computed number
   *  follows this prefix, then a full stop ("Figure 1.7. "); without a
   *  number the stop follows the prefix, less its end spaces, unless it
   *  ends in `.`, `:`, `!`, `?` or `…` (or a full-width form) already. */
  captionPrefix: string;
  /** Default placement for resources of this type, used when a resource does
   *  not specify its own `placement`. Falls back to `auto` / `column`. */
  defaultPlacement?: ResourcePlacement;
  /** Optional partial caption-style override for resources of this type.
   *  Only the keys set here replace the resolved global `captionStyle`; the
   *  rest is inherited (see `mergeCaptionStyle`). */
  captionStyle?: CaptionStyleConfig;
}

/** The concrete payload kind a `Resource` carries. */
export type ResourceKind = 'bitmap' | 'svg' | 'table';

/** Horizontal alignment of a table cell's content. */
export type TableCellAlign = 'left' | 'center' | 'right';

/** Vertical alignment of a table cell's content. */
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

/** Position of a cell within a {@link TableModel} grid (zero-based). */
export interface TableCellPos {
  row: number;
  col: number;
}

/** An image set inside a table cell: a bitmap or SVG resource referenced by
 *  id. The resource is drawn inside the cell — never numbered, floated or
 *  captioned — fitted to the cell's inner width (or a fraction of it) with
 *  its aspect ratio kept, aligned like the cell's text, and any cell text
 *  runs under it. */
export interface TableCellImage {
  /** The `Resource.id` of a `bitmap` / `svg` resource. A table resource, or
   *  an id that matches nothing, leaves the cell text-only. */
  resourceId: string;
  /** Width as a fraction of the cell's inner width, in `(0, 1]`. Default 1
   *  (the full inner width; a bitmap narrower than that keeps its size). */
  width?: number;
}

export interface TableCell {
  /** Cell content (plain text / inline markdown). A newline, or `\\` as in
   *  captions and notes, starts a new paragraph. A paragraph of ordinary
   *  spaces sets nothing; one holding a no-break space (U+00A0) sets a line.
   *  `\$` prints a dollar sign (cells are not parsed for maths). */
  content: string;
  /** Optional image drawn inside the cell, above the content. */
  image?: TableCellImage;
  /** Number of columns this cell spans. Default 1. */
  colSpan?: number;
  /** Number of rows this cell spans. Default 1. */
  rowSpan?: number;
  /** When true, render as a header cell (`<th>`). */
  isHeader?: boolean;
  align?: TableCellAlign;
  verticalAlign?: TableCellVerticalAlign;
  /** Fill colour of this cell, painted instead of the table style's header
   *  / body background. A palette-linked value (`paletteId`) follows the
   *  document palette. Absent: the style's fill (or none) applies. */
  background?: ColorValue;
  /** When set, this cell is covered by a merge whose primary (top-left) cell
   *  is at the referenced position. Hidden cells are skipped during rendering
   *  and restored on unmerge. */
  hiddenBy?: TableCellPos;
}

export interface TableModel {
  /** Row-major grid of cells. */
  rows: TableCell[][];
  /** Number of leading rows that form the table header. Default 0. */
  headerRowCount?: number;
  /** Relative column weights (one per column), normalised at layout time —
   *  `[2, 1, 1]` gives the first column half the width. Unset, a wrong
   *  length, or any non-positive weight falls back to an equal split. */
  columnWidths?: number[];
}

/** A user-managed resource instance. Binary payloads (bitmaps, SVGs) are
 *  stored out-of-band (IndexedDB in the sandbox) and referenced by
 *  `fileId`; table resources carry their model inline. */
export interface Resource {
  /** Stable identifier, referenced by inline `ref`s. */
  id: string;
  /** The `ResourceType.id` this resource belongs to. */
  typeId: string;
  kind: ResourceKind;
  /** Optional caption text (the type prefix + number are computed). Inline
   *  formatting and `:ref` marks apply; `\\` — or a backslash ending a line
   *  — starts a new line (a plain newline is a space); inside inline code,
   *  a link destination or a directive's attributes the backslashes stay as
   *  written. */
  caption?: string;
  /** Optional note (source line, credits, footnote-like remark) set in a
   *  smaller run under the resource. Accepts the same inline formatting and
   *  `:ref` marks as the caption, and the same forced line break (`\\`, or
   *  a backslash ending a line): the footnotes of a wide table, one per
   *  line. Styled by `captionStyle.note`. */
  note?: string;
  /** Accessibility alt text. */
  altText?: string;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** Last-modified timestamp (ms since epoch). */
  updatedAt: number;
  /** Present when `kind === 'bitmap'`. */
  bitmap?: {
    fileId: string;
    format: string;
    width: number;
    height: number;
  };
  /** Present when `kind === 'svg'`. */
  svg?: {
    fileId: string;
    /** Intrinsic width in px (from the SVG's `width`/`height` or `viewBox`),
     *  used to preserve aspect ratio on layout. Absent for SVGs with no
     *  declared size. */
    width?: number;
    /** Intrinsic height in px; see `width`. */
    height?: number;
    /** Optional print master: the `fileId` of a single-page PDF holding the
     *  same figure as vectors (typically the original Illustrator / PDF
     *  export the SVG was derived from). The PDF backend embeds that page
     *  verbatim — fonts, gradients and colour spaces intact — in place of the
     *  SVG; screen backends keep rendering the SVG. Ignored when
     *  `diagramStyle.singleInk` is on, since the recolouring pass only
     *  operates on SVG markup. */
    pdfFileId?: string;
  };
  /** Present when `kind === 'table'`. */
  table?: {
    model: TableModel;
    /** Id of a named table style (`PostextConfig.tableStyles`) the table is
     *  set in. Unset, or an id no style declares, falls back to the
     *  document's `tableStyle`. */
    styleId?: string;
  };
  /** Optional per-resource placement override. When unset, the resource's
   *  type default (then `top` / `column`) applies. A `position` of `'top'` or
   *  `'bottom'` floats the resource to a band on the page near its first
   *  reference; `'here'` embeds it inline at its `::resource` directive. */
  placement?: ResourcePlacement;
}

/** A footnote, endnote or margin note. Not implemented yet: the engine does
 *  not read `PostextContent.notes` (see there). */
export interface PostextNote {
  id: string;
  type: 'footnote' | 'endnote' | 'marginNote';
  content: string;
  marker?: string;
}

/** Document metadata: the frontmatter merged over `PostextContent.metadata`.
 *  On a built document (`VDTDocument.metadata`) the four printed fields are
 *  always text — typed YAML values (`title: 1984`, a date, a list) are
 *  coerced by `metadataText`. */
export interface DocumentMetadata {
  title?: string;
  subtitle?: string;
  author?: string;
  publishDate?: string;
  [key: string]: unknown;
}

export interface PostextContent {
  markdown: string;
  metadata?: DocumentMetadata;
  /** User-managed resources (issue #49) embedded via `::resource{id=…}` and
   *  referenced inline via `:ref{id=…}`. Binary payloads (bitmaps, SVGs) are
   *  resolved out-of-band by the renderer; table resources carry their model
   *  inline. */
  resources?: Resource[];
  /** Not implemented yet: accepted, but no stage of the pipeline reads it —
   *  notes are neither laid out, numbered nor rendered, and the markdown has
   *  no note-reference syntax. Set notes as text for now (a superscript
   *  `^1^` marker and a `:::paragraphs` block of notes; see the docs). */
  notes?: PostextNote[];
  /** Counters carried over from content laid out before this document — a
   *  book chapter laid out on its own continues the numbering of the
   *  chapters before it. Omit for a self-contained document. */
  continuation?: LayoutContinuation;
  /** The book's outline — every heading and part the `:::toc` directive
   *  lists and every index mark `:::index` lists, with the page label each
   *  one landed on. A chapter laid out on its own gets the whole book's
   *  outline from its host; when absent, the engine derives it from the
   *  document itself, laying it out again until the page labels the
   *  contents and the index print no longer change. */
  outline?: OutlineEntry[];
}

/** An index mark as the book outline carries it (see
 *  {@link OutlineEntry.indexMark}). */
export interface OutlineIndexMark {
  /** Name of the index; `''` for the main one. */
  index: string;
  /** The entry's levels, main term first. */
  path: string[];
  sort?: string;
  see?: string;
  seeAlso?: string;
  main?: boolean;
  range?: 'start' | 'end';
  /** Source offset of the mark in its chapter's markdown body (front
   *  matter excluded): identifies the mark within the chapter. */
  sourceStart: number;
}

/** One line of a book's outline: a heading of a listed level, a part
 *  divider or an index mark. Produced from the parsed markdown (page labels
 *  unknown) or from a laid-out document (page labels known); consumed by
 *  `:::toc` and `:::index`. */
export interface OutlineEntry {
  /** `'indexMark'`: an index mark (`:index…`), listed by `:::index`, never
   *  by `:::toc` (`listed` is false). */
  kind: 'heading' | 'part' | 'indexMark';
  /** Heading level (1–6); `0` for a part. */
  level: number;
  /** Title as plain text (forced title breaks flattened to spaces). */
  title: string;
  /** Inline runs of the title (bold / italic), so a title set in italics
   *  keeps its emphasis in the contents. Absent for a part. */
  spans?: { text: string; bold: boolean; italic: boolean }[];
  /** Printed number: the level's `numberingTemplate` output, else the
   *  chapter ordinal for a level-1 heading; the part's `number` as written.
   *  Empty for an unnumbered heading. */
  number: string;
  /** A numbered heading's counter: its level's running count, restarted by
   *  a `startAt` attribute (the `3` of a third chapter, whatever `number`
   *  prints). Absent for a part and an unnumbered heading. */
  counter?: number;
  /** False for a heading whose style has `numbered: false`. */
  numbered: boolean;
  /** Id of the heading style (`{style="…"}`), when the heading has one. */
  styleId?: string;
  /** Heading attributes (`{author="…"}`), for the contents' subtitle line. */
  attrs?: Record<string, string>;
  /** Palette overrides of a part (`palette="band=#…"`), so its row in the
   *  contents takes the part's colours. */
  palette?: Record<string, string>;
  /** Label of the page the entry starts on; absent until laid out. */
  pageLabel?: string;
  /** 0-based physical index of that page in the book (the document's
   *  `pageIndexOffset` counted in); absent until laid out. What a link on
   *  the entry jumps to. */
  pageIndex?: number;
  /** Whether the entry appears in the contents (a heading style's `toc`
   *  or a `{toc="false"}` attribute may exclude it). */
  listed: boolean;
  /** The mark of an `'indexMark'` entry. */
  indexMark?: OutlineIndexMark;
  /** The page-number format of the entry's page, once laid out (an index
   *  merges consecutive pages of one format into a range). */
  pageFormat?: string;
}

/** Heading counters (1-indexed by level) in effect at a point in a document. */
export interface HeadingCounters {
  h1: number;
  h2: number;
  h3: number;
  h4: number;
  h5: number;
  h6: number;
}

/** A numbered resource: its rendered number, type and the heading counters
 *  at its first reference. */
export interface ResourceNumberEntry {
  number: string;
  typeId: string;
  heading: HeadingCounters;
}

/** What a document laid out after other content inherits from it. Every
 *  field is optional; a missing one means "nothing precedes". Obtain it
 *  with `continuationAfter()` (counters) and the previous layout's page
 *  count (pages). */
export interface LayoutContinuation {
  /** Physical pages before this document's first page. Shifts page parity
   *  (recto/verso, mirrored margins, odd/even header elements) and marks the
   *  document as continued, so a leading heading's `breakBefore` pads
   *  parity as it would mid-book. */
  pageIndexOffset?: number;
  /** Page numbering in effect on the first page, overriding
   *  `page.pageNumbering` (the value the previous page would be followed
   *  by, in its format). */
  pageNumbering?: { format?: NumeralStyle; startAt?: number };
  /** Heading counters at the end of the preceding content: the next `#`
   *  becomes chapter `h1 + 1`. */
  headings?: HeadingCounters;
  /** Per resource-type counter state at the end of the preceding content
   *  (the `{n}` counter and the heading counters of the last numbered
   *  resource, which decide `resetOn`). */
  resourceCounters?: Record<string, { counter: number; heading: HeadingCounters }>;
  /** Resources already numbered by the preceding content, so a later
   *  reference keeps the number of its first mention. The preceding
   *  content placed them too: this document only refers to them — a
   *  floated resource listed here is not floated again, and a
   *  `::resource` embed of one is just another reference. */
  resourceNumbers?: Record<string, ResourceNumberEntry>;
  /** The last footnote number the preceding content printed, so notes
   *  numbered through the book (`footnotes.numbering: 'document'`) go on
   *  from it. */
  footnoteNumber?: number;
  /** The `:::part` in effect at the end of the preceding content — the last
   *  part opened, whether or not its fence has closed — so a chapter laid
   *  out on its own keeps `{partTitle}` / `{partNumber}` and the part's
   *  palette overrides on every page until it opens a part of its own. */
  part?: PartState;
  /** True when the preceding content ends by closing a `:::part` (nothing
   *  follows its fence) and parts open a divider page: the part's pages are
   *  the last before this document. The part's `breakAfter` is then still
   *  owed — applied before this document's first block, as it would be in
   *  one document — and a first page left blank is the back of the part
   *  page, painted with `parts.versoDesign`. `continuationAfter` sets it;
   *  it moves page breaks only when `parts.breakAfter.parity` asks for a
   *  side. */
  afterPartPage?: boolean;
  /** Physical pages of the whole book this document is part of — every
   *  chapter, blank pages included — when the host knows them: what
   *  `{bookTotalPages}` prints. Omitted, the placeholder counts the pages up
   *  to the end of this document (`pageIndexOffset` plus its own pages),
   *  which is the whole book for a self-contained document and for the
   *  last chapter. It only feeds running heads and design text, never the
   *  page breaks, so a host can take it from a layout of the same book. */
  bookPageCount?: number;
}

/** A part (section) as the running heads see it: number and title as
 *  written on the fence, plus the colour-palette entries the fence
 *  overrides (`palette="band=#f6c297"`), applied to every design slot laid
 *  out on the part's pages. */
export interface PartState {
  number: string;
  title: string;
  /** Palette id → hex colour. */
  palette?: Record<string, string>;
}

export type ColorModel = 'hex' | 'rgb' | 'cmyk' | 'hsl';

export interface ColorValue {
  hex: string;
  model: ColorModel;
  /** The `colorPalette` entry this colour follows, wherever it sits in the
   *  configuration (designs, callout labels and the `:ref` colour
   *  included): the entry's `hex` / `model` win, and the ones stored here
   *  are the fallback when the palette has no such entry. */
  paletteId?: string;
}

export interface ColorPaletteEntry {
  id: string;
  name: string;
  value: ColorValue;
}

export type DimensionUnit = 'cm' | 'mm' | 'in' | 'pt' | 'px' | 'em' | 'rem';

export interface Dimension {
  value: number;
  unit: DimensionUnit;
}

export type PageSizePreset = '11x17' | '12x19' | '17x24' | '21x28' | 'custom';

export interface PageMargins {
  top?: Dimension;
  bottom?: Dimension;
  /** Inner (spine-side) margin when `mirror` is on; left margin otherwise. */
  left?: Dimension;
  /** Outer margin when `mirror` is on; right margin otherwise. */
  right?: Dimension;
  /** Mirrored (facing-page) margins: `left` is the inner margin and `right`
   *  the outer one. Odd pages (page 1 = odd) keep them as written; even
   *  pages swap them so the inner margin always faces the spine. In a
   *  right-bound book (`page.binding`) it is the other way round: the
   *  recto (odd) is the left page of the spread, its spine on its right,
   *  so odd pages swap and even pages keep the margins as written — `left`
   *  is still the inner margin. Default `false`. */
  mirror?: boolean;
}

/** The baseline grid: lines one body line height apart from the top of
 *  the content area. The layout uses it whether or not it is drawn
 *  (headings, list ends, boxes, figures and display formulas snap the flow
 *  back onto it, unless their own `snapToGrid` is off); this config only
 *  draws it. */
export interface BaselineGridConfig {
  /** Draw the grid lines over the pages (canvas and PDF renderers, the
   *  Sandbox views). Only the drawing: the layout is the same either way. */
  enabled: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}

/** Bleed and crop marks. When enabled, the sheet grows by
 *  `bleed + markOffset + markLength` on every side, with the trimmed page
 *  in its middle (see `cropMarkSegments`). */
export interface CutLinesConfig {
  enabled: boolean;
  /** How far art may run past the trim. Default 3 mm. */
  bleed?: Dimension;
  /** Length of each crop mark. Default 5 mm. */
  markLength?: Dimension;
  /** Gap between the trim edge and the start of each crop mark. A mark
   *  never starts inside the bleed: when `bleed` is wider, it starts at
   *  the bleed edge. Default 3 mm. */
  markOffset?: Dimension;
  /** Stroke width of the marks. Default 0.25 pt. */
  markWidth?: Dimension;
  /** Colour of the marks on the canvas and in RGB or grayscale PDFs. A
   *  CMYK PDF paints them in registration colour (the `/All`
   *  separation), so they print on every plate. Default black. */
  color?: ColorValue;
}

export type PageNumberFormat =
  | 'decimal'
  | 'lower-roman'
  | 'upper-roman'
  | 'lower-alpha'
  | 'upper-alpha'
  | EastAsianNumeralStyle;

export interface PageNumberingConfig {
  /** Format for page labels. Default: `'decimal'`. The list and resource
   *  spellings of a format are read too (`'arabic'`, `'roman-lower'`,
   *  `'i'`…, see `parseNumberFormat`); an unknown value numbers in decimal
   *  and is reported by `collectConfigWarnings`. */
  format?: PageNumberFormat;
  /** Numeric starting value assigned to the first page of the document,
   *  regardless of format. `format: 'lower-roman', startAt: 1` yields
   *  `i, ii, iii, ...`. Default: 1. */
  startAt?: number;
}

export interface ResolvedPageNumberingConfig {
  format: PageNumberFormat;
  startAt: number;
}

/** The edge a book is bound on (see `PageConfig.binding`). */
export type PageBinding = 'auto' | 'left' | 'right';

export interface PageConfig {
  backgroundColor?: ColorValue;
  sizePreset?: PageSizePreset;
  width?: Dimension;
  height?: Dimension;
  margins?: PageMargins;
  dpi?: number;
  cutLines?: CutLinesConfig;
  baselineGrid?: BaselineGridConfig;
  pageNumbering?: PageNumberingConfig;
  /** The edge the book is bound on. `'left'`: pages turn right to left, as
   *  in any Western book. `'right'`: the book is bound on its right edge,
   *  as vertical Chinese and Japanese books are (clreq §7.1.1.1): page 1 is
   *  still the recto (odd), but it is the LEFT page of a spread, its inner
   *  margin is on its right, and viewers show the pairs `[3 | 2]`. With
   *  mirrored margins the recto therefore swaps `left` and `right`: `left`
   *  stays the inner margin. `'auto'` (the default) is `'right'` when
   *  `layout.writingMode` is `'vertical-rl'`, else `'left'`. Book-level:
   *  a heading style's own `layout` never changes it. */
  binding?: PageBinding;
}

export interface ResolvedPageConfig {
  backgroundColor: ColorValue;
  sizePreset: PageSizePreset;
  width: Dimension;
  height: Dimension;
  margins: Required<PageMargins>;
  dpi: number;
  cutLines: { enabled: boolean; bleed: Dimension; markLength: Dimension; markOffset: Dimension; markWidth: Dimension; color: ColorValue };
  baselineGrid: { enabled: boolean; color: ColorValue; lineWidth: Dimension };
  pageNumbering: ResolvedPageNumberingConfig;
  /** `binding` resolved: `'auto'` is `'right'` in a vertical document. */
  binding: 'left' | 'right';
}

export type LayoutType = 'single' | 'double' | 'oneAndHalf';

/** The direction lines run in (see `LayoutConfig.writingMode`). */
export type WritingMode = 'horizontal-tb' | 'vertical-rl';

/** What the narrow column of a `oneAndHalf` layout carries. `'text'` (the
 *  default): body text flows into it after the main column, as into any
 *  column. `'floats'`: it is a side channel that never takes body text —
 *  the flow stays in the main column and the side column receives the
 *  resources and callouts placed with `span: 'side'`, stacked beside the
 *  paragraph that first references them (the marginal figures and key
 *  boxes of a textbook). */
export type SideColumnRole = 'text' | 'floats';

/** Which edge of the content area the side column of a `oneAndHalf` layout
 *  sits at. `'right'` (the default) and `'left'` are fixed; `'outer'` /
 *  `'inner'` follow the page parity when the margins are mirrored — the
 *  outer edge is the right edge of a recto (odd page) and the left edge of
 *  a verso. Without mirrored margins `'outer'` is `'right'` and `'inner'`
 *  is `'left'`. */
export type SideColumnSide = 'right' | 'left' | 'outer' | 'inner';

export interface ColumnRuleConfig {
  enabled?: boolean;
  color?: ColorValue;
  lineWidth?: Dimension;
}

export interface LayoutConfig {
  layoutType?: LayoutType;
  gutterWidth?: Dimension;
  /** `oneAndHalf` only: width of the side column, in percent of the content
   *  width; the main column takes what is left after the gutter. Default
   *  33. Any value that leaves both columns at least 1 % of the content
   *  width is used as written; one that does not (0 or below, or so wide
   *  the main column vanishes) is clamped to the nearest that does, and
   *  reported on `VDTDocument.configWarnings` (`sideColumnPercentClamped`). */
  sideColumnPercent?: number;
  /** `oneAndHalf` only. Default `'text'`. */
  sideColumnRole?: SideColumnRole;
  /** `oneAndHalf` only. Default `'right'`. */
  sideColumnSide?: SideColumnSide;
  columnRule?: ColumnRuleConfig;
  /** Shrink a figure (bitmap or SVG) whose image, caption and note would
   *  stand taller than the content area until the stack fits it. The shrunk
   *  image sits in its slot per `placement.align`. Off by default — print
   *  pages are sized for their figures; the HTML viewer, whose pages are as
   *  tall as the screen, turns it on. */
  fitFiguresToPage?: boolean;
  /** On the closing page of a chapter (and of the document), move the
   *  page-wide figures and tables set below the last band of text up to sit
   *  one float gap under it, stacked in their order, instead of at the page
   *  foot — nothing follows them there. Default `true`. `false` keeps them
   *  where their placement put them: a `position: 'bottom'` float ends at
   *  the page foot on the closing page as on every other page. Pages with a
   *  side column never move them. */
  hugClosingFloats?: boolean;
  /** Where an inline resource (`placement.position: 'here'`, embedded with
   *  `::resource`) keeps the float gap, a line: `'around'` keeps it above
   *  and below the resource, and the text after it goes back onto the
   *  baseline grid under that gap (the default since postext 1.5);
   *  `'above'` keeps it above only, and the text after it resumes at the
   *  next grid line, however close that is to the resource (postext 1.4).
   *  A configuration stored by an earlier version is read with `'above'`
   *  when its chapters embed a resource (see `migrateConfig` in
   *  `postext/bundle`). */
  inlineResourceGap?: InlineResourceGap;
  /** Whether an inline resource inside a box (`:::callout`) keeps the gap
   *  {@link inlineResourceGap} sets, a line of the box's own text: above
   *  the resource, and below it with `'around'`, the larger of it and the
   *  next block's own space applying. At the top or foot of the box, or of
   *  a split box's fragment, the padding sets the resource off instead.
   *  Default `true` (since postext 1.5). `false` sets the resource right
   *  under the text before it and the text after it right under the
   *  resource, as postext 1.4 did. A configuration stored by an earlier
   *  version is read with `false` when its chapters embed a resource (see
   *  `migrateConfig` in `postext/bundle`). */
  inlineResourceGapInBoxes?: boolean;
  /** Fewest lines of a paragraph or list item that a cut inside it leaves
   *  on each side when a box splits (see `CalloutStyleConfig.splitMinLines`,
   *  which still counts every line on each side of the cut). A whole number,
   *  at least 1; default 2 (since postext 1.5), so a cut never leaves a lone
   *  line of a paragraph or item at a column's foot or at the next one's
   *  head. A box style whose `splitMinLines` is lower sets the limit instead
   *  (1 allows a lone line). 1 lets any box cut leave one line of the
   *  paragraph or item on a side, as postext 1.4 did. A configuration stored
   *  by an earlier version is read with 1 when its chapters hold a box (see
   *  `migrateConfig` in `postext/bundle`). */
  boxChildSplitMinLines?: number;
  /** How lines run. `'horizontal-tb'` (the default): left to right, lines
   *  stacked top to bottom. `'vertical-rl'`: Chinese and Japanese vertical
   *  setting — characters top to bottom, lines advancing right to left
   *  (clreq §2.1.2). The flow is laid out as a horizontal page turned a
   *  quarter turn clockwise: columns become tiers (栏) stacked top to
   *  bottom, a top float sits at the right edge where reading starts,
   *  footnotes at the left end of each tier. Figures, tables and images stay
   *  upright; running heads, folios, crop marks and the page background stay
   *  physical. See `VDTPage.flow`. A heading style's `layout` inherits the
   *  document's writing mode unless it sets its own. */
  writingMode?: WritingMode;
}

/** Where an inline resource keeps the float gap (see
 *  `LayoutConfig.inlineResourceGap`). */
export type InlineResourceGap = 'around' | 'above';

export interface ResolvedLayoutConfig {
  layoutType: LayoutType;
  gutterWidth: Dimension;
  sideColumnPercent: number;
  sideColumnRole: SideColumnRole;
  sideColumnSide: SideColumnSide;
  columnRule: { enabled: boolean; color: ColorValue; lineWidth: Dimension };
  fitFiguresToPage: boolean;
  hugClosingFloats: boolean;
  inlineResourceGap: InlineResourceGap;
  inlineResourceGapInBoxes: boolean;
  boxChildSplitMinLines: number;
  writingMode: WritingMode;
}

export type TextAlign = 'left' | 'justify' | 'center' | 'right';

export type HyphenationLocale =
  | 'en-us'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'ca'
  | 'nl';

/**
 * A BCP 47 language tag: one of the bundled {@link HyphenationLocale} ids,
 * or any other tag (`'es-ES'`, `'pt-BR'`, `'en-GB'`, `'sv'`). Hyphenation
 * ignores the region, script and variant subtags (`'es-ES'` hyphenates with
 * the `'es'` patterns, every English tag with `'en-us'`); a language with no
 * bundled patterns hyphenates with `'en-us'` and the engine warns once on the
 * console. The tag itself is kept as the PDF's document language.
 */
export type LocaleTag = HyphenationLocale | (string & {});

export interface HyphenationConfig {
  enabled?: boolean;
  /** Language of the hyphenation patterns. Defaults to the top-level
   *  `locale`, else `'en-us'`. */
  locale?: LocaleTag;
  /** Also hyphenate ragged text — left, right or centre aligned — within
   *  the {@link zone}. Default `false`: only justified text is hyphenated.
   *  Applies to the body text, blockquotes, and the paragraph styles and
   *  callout bodies whose own hyphenation is on. */
  ragged?: boolean;
  /** Hyphenation zone for ragged text: a word that does not fit the line is
   *  hyphenated only when sending it whole to the next line would leave more
   *  than this much empty space at the end of the line. A wider zone gives
   *  fewer hyphens and a more ragged edge; `0` hyphenates wherever a word
   *  does not fit. `em` is relative to the text's own font size. Default
   *  `3em`. Ignored for justified text. Set line by line, no more than two
   *  lines in a row end on a syllable; broken with Knuth–Plass
   *  (`BodyTextConfig.optimalRagged`), two in a row cost what two hyphens in
   *  a row cost in justified text. */
  zone?: Dimension;
  /** Let the dictionary divide the words of a compound, a word with a
   *  hyphen between two letters ("af-ter-dinner"). Default `true`. `false`
   *  keeps such a word whole but for its own hyphen, where a line may still
   *  end ("after-" | "dinner"): TeX's rule, and the Chicago Manual's advice.
   *  A soft hyphen typed in the word still breaks, and a compound wider than
   *  the whole line is still divided where it must be. Applies wherever the
   *  body's hyphenation does: the running text, headings, lists, blockquotes
   *  and boxes; captions, notes, table cells and the contents keep dividing
   *  compounds. */
  compounds?: boolean;
}

export interface ResolvedHyphenationConfig {
  enabled: boolean;
  /** The bundled patterns actually used (see {@link LocaleTag}). */
  locale: HyphenationLocale;
  /** The BCP 47 tag {@link locale} was resolved from, when it is not itself
   *  a bundled id (`'es-ES'` → `'es'`, `'sv'` → `'en-us'`). The PDF backend
   *  declares it as the document language. */
  tag?: string;
  ragged: boolean;
  zone: Dimension;
  compounds: boolean;
}

export interface BodyTextConfig {
  /** One family, as every `fontFamily` field: a CSS font stack is set in
   *  its first family (see `primaryFontFamily`) and reported by
   *  `collectConfigWarnings`. */
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  paragraphSpacing?: boolean;
  color?: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Colour of inline `:ref` reference labels (e.g. "Fig. 1.7"). Defaults to
   *  {@link boldColor} (the emphasis colour). */
  referenceColor?: ColorValue;
  /** Whether reference labels are rendered in the bold font. Default `true`. */
  referenceBold?: boolean;
  /** Whether reference labels are rendered italic. Default `false`. */
  referenceItalic?: boolean;
  textAlign?: TextAlign;
  fontWeight?: number;
  boldFontWeight?: number;
  hyphenation?: HyphenationConfig;
  firstLineIndent?: Dimension;
  hangingIndent?: boolean;
  /** When `false`, the first paragraph immediately following a heading (or
   *  a `:::space` line) is rendered without first-line indent. A common typographic convention in
   *  scientific publications and many book styles ("indent run-in" style).
   *  Default `true` — every paragraph receives the indent. */
  indentAfterHeading?: boolean;
  /** Max word-spacing when justifying, as a multiplier of the normal space width.
   *  Knuth–Plass keeps every line within it that the paragraph allows,
   *  hyphenating or spreading the slack over neighbouring lines first; a
   *  line no break sequence can set within it stretches past it at a cost
   *  that jumps past the bound and grows with the square of the adjustment
   *  ratio, and one past 3× the normal
   *  space is set ragged. `maxJustifyTracking` lets such a line take a
   *  little tracking instead. Default 2. */
  maxWordSpacing?: number;
  /** Min word-spacing when justifying, as a multiplier of the normal space width. */
  minWordSpacing?: number;
  /** Most tracking a justified line may take, in thousandths of an em
   *  either way (the InDesign unit: 10 = 0.01 em per character), when its
   *  word spaces alone would set it past `maxWordSpacing` or
   *  `minWordSpacing`: the part of the adjustment beyond the limit goes into
   *  the letters, so a loose line's spaces come back to `maxWordSpacing` and
   *  a tight one fits at `minWordSpacing`. Lines within the limits, a
   *  paragraph's last line (unless it runs over) and a line of one word
   *  take none, nor does a line holding a chip. Knuth–Plass weighs it (it
   *  is taken only where word spacing alone would pass its limits), so it
   *  needs `optimalLineBreaking`. 0 (the default) turns it off. */
  maxJustifyTracking?: number;
  /** Use Knuth-Plass optimal line breaking instead of greedy first-fit. Default true. */
  optimalLineBreaking?: boolean;
  /** Break ragged paragraphs with Knuth–Plass too: body text, blockquotes
   *  and list items set left, right or centred, and ragged paragraph styles,
   *  box bodies and the bodies of parts and section styles. Word spaces keep
   *  their width; the breaker weighs how far each line falls short of the
   *  measure (3 em short costs what a justified line at `maxWordSpacing`
   *  does), so the edge comes out more even, and the runt rules
   *  (`avoidRunts`, `tightenRunts`) and `hyphenateAcrossColumns` work as on
   *  justified text. A line may end after a hyphen the text carries between
   *  two letters, as line by line. With `hyphenation.ragged` the zone still
   *  decides which syllables may end a line; two syllable ends in a row are
   *  discouraged rather than refused.
   *  Ragged headings, captions, table cells and the contents are still set
   *  line by line. Needs `optimalLineBreaking`. Default `true`; `false` sets ragged text
   *  line by line, as up to postext 1.4 (configurations stored before
   *  `configVersion` 7 whose text can be ragged read with it, see
   *  `pinLegacyRaggedBreaking` in `postext/bundle`). */
  optimalRagged?: boolean;
  /** Let a line end after an em or en dash set closed between words
   *  ("say—that’s", "riddles.—I", "Hamburg–Berlin"), in Knuth–Plass as well
   *  as line by line. Never after a dash that opens an aside or a line of
   *  dialogue ("—dijo", `said "—Hola`: a space, or a space and a quotation
   *  mark, before the dash; a quote that closes a word still lets the line
   *  end, "\"no\"—and", German "„nein“—und", French "« non »—et"), before
   *  punctuation ("él—,"), before a quotation
   *  mark or a bracket ("thinking—\" and", "says—“no”"), inside a run of
   *  dashes, or inside a range of numbers set with an en dash
   *  ("1914–1918"). A dash that ends a run before a word in another style
   *  ("see—*and*") counts too. The line ends on the dash and nothing is
   *  added. Default
   *  `true`; `false` keeps postext 1.4's breaks: Knuth–Plass never breaks
   *  there, and the line-by-line breaker of formatted or hyphenated ragged
   *  text only between two letters (configurations stored before
   *  `configVersion` 7 whose text sets such a dash read with it, see
   *  `pinLegacyDashBreaks`). Applies to the running text, headings, lists,
   *  blockquotes and boxes; captions, table cells and the contents keep the
   *  1.4 breaks, and a plain ragged paragraph set line by line follows
   *  pretext's own rules either way. */
  breakAfterDashes?: boolean;
  /** Let a line end after the hyphen of a compound, a hyphen between two
   *  letters ("well-" | "known", "vencer-" | "se"), in every paragraph
   *  broken with Knuth–Plass. The line ends on the hyphen and nothing is
   *  added. Never after a hyphen next to a digit or a sign ("COVID-19",
   *  "-5 °C"). A justified paragraph without inline formatting breaks there
   *  only with two letters on each side of the hyphen, so no line ends on
   *  "e-" of "e-mail". Default `true`. `false` keeps postext 1.4's breaks: a
   *  justified paragraph with no inline formatting never breaks there,
   *  while one with a bold or italic word anywhere, a ragged paragraph and
   *  one set line by line do (configurations stored before `configVersion`
   *  8 whose text sets a compound read with it, see
   *  `pinLegacyHyphenBreaks`). Applies to the running text, headings, lists,
   *  blockquotes and boxes. */
  breakAfterHyphens?: boolean;
  /** Start the line after a break at a compound's hyphen with a hyphen too:
   *  "vencer-" | "-se", as Portuguese spelling and the Spanish Academy's
   *  2010 rules ask ("léxico-" | "-semántico"), so the reader knows the
   *  hyphen is part of the word. The repeated hyphen is measured with its
   *  line and painted, and left out of the line's source range (see
   *  `VDTLine.repeatedHyphen`); the PDF paints it under an `/ActualText`
   *  that leaves it out, so extracted text reads the word once. A web
   *  address never gets one. Default
   *  `false`. Applies to the running text, headings, lists, blockquotes and
   *  boxes; with it on, a paragraph without formatting that holds a
   *  compound is broken the way a formatted one is. */
  repeatHyphen?: boolean;
  /** How Markdown blockquotes (`> …`) are set. Unset fields keep the look
   *  postext 1.4 gave them: grey (`#666666`), italic, the body's first-line
   *  indent and no side indent. */
  blockquote?: BlockquoteConfig;
  /** When true, discourage a paragraph from ending with fewer than `orphanMinLines`
   *  lines at the top of the next column. Soft (penalty-based). Default true. */
  avoidOrphans?: boolean;
  /** Minimum lines required at the top of the next column when a paragraph is split.
   *  Only effective when `avoidOrphans` is true. Default 2. */
  orphanMinLines?: number;
  /** Demerit added when an orphan constraint is violated. Higher = stronger
   *  avoidance. 0 effectively disables the penalty. Default 1000 — chosen so
   *  orphan avoidance normally wins over slack (slackWeight·slack²) unless
   *  pushing the paragraph would leave ≳10 lines of whitespace. */
  orphanPenalty?: number;
  /** When true, list items also receive orphan protection (not just paragraphs).
   *  Only effective when `avoidOrphans` is true. Default true. */
  avoidOrphansInLists?: boolean;
  /** When true, discourage a paragraph from starting with fewer than `widowMinLines`
   *  lines at the bottom of the current column. Soft (penalty-based). Default true. */
  avoidWidows?: boolean;
  /** Minimum lines required at the bottom of the current column when a paragraph is
   *  split. Only effective when `avoidWidows` is true. Default 2. */
  widowMinLines?: number;
  /** Demerit added when a widow constraint is violated. Default 1000 (same
   *  scale as `orphanPenalty`). */
  widowPenalty?: number;
  /** When true, list items also receive widow protection (not just paragraphs).
   *  Only effective when `avoidWidows` is true. Default true. */
  avoidWidowsInLists?: boolean;
  /** Weight applied to the squared "unused column space" cost. Higher values make
   *  the layout prefer filling columns tightly; 0 disables the slack pressure.
   *  Default 10. */
  slackWeight?: number;
  /** When true, discourage paragraphs from ending with a very short last line
   *  (a "runt" — e.g. a single short word alone). Soft (Knuth-Plass penalty),
   *  so ragged text takes it only when `optimalRagged` breaks it with
   *  Knuth–Plass. A Chinese, Japanese or Korean paragraph does not end on a
   *  line holding one character, alone or with its closing marks (孤字): the
   *  line above gives it its last character when that line can still be
   *  justified within the tracking cap. Default true. */
  avoidRunts?: boolean;
  /** Approximate minimum character count for the last line of a paragraph.
   *  Interpreted internally as `runtMinCharacters * normalSpaceWidth` pixels, so
   *  the real test is "is the last line visually shorter than N characters'
   *  worth of space-width content". Default 20. */
  runtMinCharacters?: number;
  /** Equivalent-badness added to the last line when it is shorter than the
   *  runt threshold. Feeds into the Knuth–Plass squared demerit on the same
   *  scale as line `badness` (which saturates at 10000). Default 1000 —
   *  dominates alternatives up to roughly r≈2.15 word-spacing stretch. */
  runtPenalty?: number;
  /** Scale the runt penalty by how short the last line falls: a last line
   *  of width `w` under the threshold `t` costs `runtPenalty × (1 − w / t)`
   *  instead of the whole `runtPenalty`, so a two-word ending costs less
   *  than a one-word one and the breaker takes it when a line above can
   *  give a word up. Off by default (every runt costs the same). */
  gradedRuntPenalty?: boolean;
  /** When true, list items also receive the runt penalty (not just paragraphs).
   *  Only effective when `avoidRunts` is true. Default true. */
  avoidRuntsInLists?: boolean;
  /** When the penalty above could not keep a paragraph from ending in a
   *  runt, set the paragraph one line shorter instead — the compositor's
   *  fix: the spaces of every line tighten (never past `minWordSpacing`)
   *  and, when that alone does not carry the line, a little negative
   *  tracking joins in, up to `maxRuntTracking`. A shorter setting is no
   *  fix, and the runt stays, when it would stretch a justified line past
   *  `maxWordSpacing` or, when the paragraph already has a looser
   *  justified line, past that line; or when it would set more lines
   *  ragged (past 3× the normal space) than the paragraph had. The word
   *  spaces of ragged text keep their width, so there only the tracking
   *  takes part. Needs `optimalLineBreaking` and `avoidRunts` (and
   *  `optimalRagged` for ragged text). Default true. */
  tightenRunts?: boolean;
  /** Most tracking a runt fix may take, in thousandths of an em (the
   *  InDesign unit: 10 = 0.01 em per character), applied as a tightening.
   *  0 leaves the fix to word spacing alone. Default 10. */
  maxRuntTracking?: number;
  /** When true, a paragraph ending with a colon that directly introduces a
   *  list is kept joined to the list: if placing the paragraph would leave no
   *  room for the first list item in the same column/page, the colon-bearing
   *  last line is moved to the next column together with the list (or the
   *  whole paragraph, if it is a single line). How much room counts as
   *  enough is `colonListRoom`. Default true. */
  keepColonWithList?: boolean;
  /** The room `keepColonWithList` asks for under the colon line:
   *  - `'item'` (default): what the orphan and widow rules for lists would
   *    leave of the first item there, a line when it may split, all of it
   *    when they keep it whole (a two-line item, say);
   *  - `'line'`: one line, as up to postext 1.4. A first item those rules
   *    keep whole then goes on to the next column alone and leaves the
   *    colon line at the foot. Configurations stored before
   *    `configVersion` 6 read with it (see `pinLegacyColonListRoom` in
   *    `postext/bundle`). */
  colonListRoom?: ColonListRoom;
  /** Let a column or a page end on a hyphenated word (InDesign's "Hyphenate
   *  Across Column"). Default `true`. `false` re-breaks a paragraph whose
   *  last line in a column would end on a hyphen, so that line ends on a
   *  whole word instead — the word spaces of the lines above take the
   *  difference, within `maxWordSpacing` and `minWordSpacing`; when no
   *  break inside those limits avoids it, the hyphen stays. It covers the
   *  first column break of a paragraph and the later ones that fall where
   *  a full column ends; a later one that falls elsewhere (a widow kept, a
   *  band cut level) gets a second re-break from its column, which keeps
   *  the lines already placed at their breaks and breaks only the rest.
   *  A ragged paragraph set with `optimalRagged` is broken again the same
   *  way; its word spaces keep their width, so only its line ends move.
   *  Needs `optimalLineBreaking` (and `optimalRagged` for ragged text).
   *  Running text only (not box bodies). */
  hyphenateAcrossColumns?: boolean;
  /** The space under a `:::paragraphs` container that closes on a
   *  paragraph, between that paragraph and the block after it:
   *  - `'collapse'` (default): the larger of the style's `spaceBetween` and
   *    `marginBottom` and the paragraph spacing of the text around the
   *    container (a line with `paragraphSpacing`, in a box its body's),
   *    merged with the space the next block keeps above itself (a
   *    heading's `marginTop`, a list's), as between two paragraphs of
   *    running text. The flow still snaps back to the baseline grid under
   *    the container, the space being a minimum;
   *  - `'add'`: as up to postext 1.4, the style's space alone is set under
   *    the last line before the grid snap, the next block's own space above
   *    is added under it, and the paragraph spacing is left out.
   *    Configurations stored before `configVersion` 8 read with it (see
   *    `pinLegacyParagraphContainerSpacing` in `postext/bundle`).
   *  A negative `marginBottom` pulls the next block up either way. A
   *  container that closes on a list is set as in 1.4 under both rules: the
   *  list keeps its own space in its snap, and `marginBottom` follows. */
  paragraphContainerSpacing?: ParagraphContainerSpacing;
}

/** The room kept for a list under the colon line that introduces it
 *  (`BodyTextConfig.colonListRoom`). */
export type ColonListRoom = 'item' | 'line';

/** How the space under a `:::paragraphs` container is worked out
 *  (`BodyTextConfig.paragraphContainerSpacing`). */
export type ParagraphContainerSpacing = 'collapse' | 'add';

/** How Markdown blockquotes (`> …`) are set (`BodyTextConfig.blockquote`).
 *  They take the body's family, size, leading, weights, alignment and
 *  hyphenation. */
export interface BlockquoteConfig {
  /** Text colour. Default `#666666`. A colour linked to a palette entry
   *  (`paletteId`) follows that entry, as everywhere. */
  color?: ColorValue;
  /** Set the text in italics; a `*…*` run inside turns back to upright.
   *  Default `true`. */
  italic?: boolean;
  /** Indent of every line from the left edge of the column or box, the
   *  first-line indent counted from it. `em` is the body's size. Default
   *  `0`. */
  indent?: Dimension;
  /** Indent of the first line of each quoted paragraph, from {@link indent}
   *  (with the body's `hangingIndent`, of every line but the first). Unset:
   *  the body's `firstLineIndent`. */
  firstLineIndent?: Dimension;
}

export interface ResolvedBlockquoteConfig {
  color: ColorValue;
  italic: boolean;
  indent: Dimension;
  /** Unset: the body's `firstLineIndent`. */
  firstLineIndent?: Dimension;
}

export interface ResolvedBodyTextConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  paragraphSpacing: boolean;
  color: ColorValue;
  boldColor?: ColorValue;
  italicColor?: ColorValue;
  /** Resolved colour for inline `:ref` labels (defaults to the bold colour). */
  referenceColor: ColorValue;
  /** Whether reference labels use the bold font. */
  referenceBold: boolean;
  /** Whether reference labels are italic. */
  referenceItalic: boolean;
  textAlign: TextAlign;
  fontWeight: number;
  boldFontWeight: number;
  hyphenation: ResolvedHyphenationConfig;
  firstLineIndent: Dimension;
  hangingIndent: boolean;
  indentAfterHeading: boolean;
  maxWordSpacing: number;
  minWordSpacing: number;
  maxJustifyTracking: number;
  optimalLineBreaking: boolean;
  optimalRagged: boolean;
  breakAfterDashes: boolean;
  breakAfterHyphens: boolean;
  repeatHyphen: boolean;
  blockquote: ResolvedBlockquoteConfig;
  avoidOrphans: boolean;
  orphanMinLines: number;
  orphanPenalty: number;
  avoidOrphansInLists: boolean;
  avoidWidows: boolean;
  widowMinLines: number;
  widowPenalty: number;
  avoidWidowsInLists: boolean;
  slackWeight: number;
  avoidRunts: boolean;
  runtMinCharacters: number;
  runtPenalty: number;
  gradedRuntPenalty: boolean;
  avoidRuntsInLists: boolean;
  tightenRunts: boolean;
  maxRuntTracking: number;
  keepColonWithList: boolean;
  colonListRoom: ColonListRoom;
  hyphenateAcrossColumns: boolean;
  paragraphContainerSpacing: ParagraphContainerSpacing;
  /** Set only in the derived config a callout lays its children out with
   *  (a style's `body.italic` / `body.smallCaps`): the running text of a
   *  document is always upright, in lowercase. */
  italic?: boolean;
  smallCaps?: boolean;
}

// ---------------------------------------------------------------------------
// Table & caption styling (resource figures/tables)
// ---------------------------------------------------------------------------

/** User-facing styling for embedded `kind: 'table'` resources. Every field is
 *  optional; unset fields inherit body-text defaults (font family, size,
 *  colour) so a document with no table config looks the same as before this
 *  config existed. See {@link ResolvedTableStyleConfig}. */
export interface TableStyleConfig {
  /** Body-cell font family. Defaults to the body-text family. */
  bodyFontFamily?: string;
  /** Body-cell font size. Defaults to the body-text size. */
  bodyFontSize?: Dimension;
  /** Body-cell text colour. Defaults to the body-text colour. */
  bodyColor?: ColorValue;
  /** Header-cell font family. Defaults to the body-text family. */
  headerFontFamily?: string;
  /** Header-cell font size. Defaults to the body-text size. */
  headerFontSize?: Dimension;
  /** Header-cell text colour. Defaults to the body-text colour. */
  headerColor?: ColorValue;
  /** Render header cells bold. Default `true`. */
  headerBold?: boolean;
  /** Render header cells italic. Default `false`. */
  headerItalic?: boolean;
  /** Tracking after every character of a header cell (spaces included),
   *  as CSS `letter-spacing`: positive spreads the letters (capitals set
   *  with {@link headerTextTransform} usually want a little), negative
   *  tightens them. An `em` value is relative to {@link headerFontSize}.
   *  Measured into the header lines, so they wrap and align with it, and
   *  painted the same by canvas, HTML and PDF. Applies to every header
   *  cell: the header rows and a cell marked `isHeader`. Default `0`. */
  headerLetterSpacing?: Dimension;
  /** Letter case of the header cells: `'uppercase'` sets their text in
   *  capitals. The transform keeps the text's length, so the editor's
   *  source map stays exact: a letter whose capital is longer (`ß` → `SS`)
   *  is left as it is. Resource references keep their label. Default
   *  `'none'`. */
  headerTextTransform?: TableTextTransform;
  /** Fill header cells with {@link headerBackground}. Default `true`. */
  headerBackgroundEnabled?: boolean;
  /** Header-cell fill colour. Default light grey. */
  headerBackground?: ColorValue;
  /** Fill body cells with {@link bodyBackground}. Default `false`. */
  bodyBackgroundEnabled?: boolean;
  /** Body-cell fill colour. Default white. */
  bodyBackground?: ColorValue;
  /** Zebra rows: fill every second body row with
   *  {@link bodyAlternateBackground}. Counting starts at the first row
   *  after the header rows, which keeps `bodyBackground` (or no fill); a
   *  merged cell takes the stripe of its first row, header cells keep the
   *  header fill and a cell's own `background` wins over both. A table
   *  split across pages keeps each row's stripe. Default `false`. */
  bodyAlternateBackgroundEnabled?: boolean;
  /** Fill of the alternate body rows. Default a light grey (`#f2f2f2`). */
  bodyAlternateBackground?: ColorValue;
  /** Draw cell borders. Default `true`. */
  borders?: boolean;
  /** Border colour. Defaults to the body-text colour. */
  borderColor?: ColorValue;
  /** Border thickness. Default `0.75pt` (≈1px at 96dpi). */
  borderWidth?: Dimension;
  /** Inner padding inside each cell. Default `0.375em`. */
  cellPadding?: Dimension;
  /** Which rules to stroke when {@link borders} is on. Default `'grid'`. */
  rules?: TableRules;
  /** Corner radius of the table's outer frame. Default `0` (square). The
   *  cell fills are clipped to the rounded frame, whatever the rules (with
   *  `'none'` the fills alone show the rounded shape); the inner rules stay
   *  straight. A table split across pages rounds the top corners of its
   *  first part and the bottom corners of its last. */
  borderRadius?: Dimension;
  /** What happens to a table taller than the space a page offers: continue
   *  it on the following pages (`'split'`, the default), keep only the rows
   *  that fit (`'clip'`), or leave it out (`'hide'`). See {@link TableOverflow}. */
  overflow?: TableOverflow;
  /** Suffix appended to the caption of every continuation slice of a split
   *  table (e.g. "Table 6-4. Title *(cont.)*"). Defaults to `"(cont.)"`. */
  continuedSuffix?: string;
  /** Set a marker under every slice that continues on the next page.
   *  Default `true`. */
  continuesMarkerEnabled?: boolean;
  /** Text of that marker, set right-aligned under the slice in the note
   *  style. Defaults to `"Continued"` (`"Continúa"` for Spanish documents). */
  continuesMarker?: string;
}

/** A named table style (`PostextConfig.tableStyles`), picked per table by
 *  `Resource.table.styleId`. Every field left unset inherits the document's
 *  {@link TableStyleConfig} (`tableStyle`), and through it the body text —
 *  so a style only states what sets its tables apart. */
export interface NamedTableStyleConfig extends TableStyleConfig {
  /** Identifier a table resource references with `table.styleId`. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
}

export interface ResolvedNamedTableStyleConfig extends ResolvedTableStyleConfig {
  id: string;
  name: string;
}

/** Letter case of a table's header cells (`TableStyleConfig.headerTextTransform`). */
export type TableTextTransform = 'none' | 'uppercase';

/** Rule pattern of a table: the full cell grid, horizontal rules only (top
 *  and bottom edge of every row), the outer frame only, or none. */
export type TableRules = 'grid' | 'horizontal' | 'outer' | 'none';

/** Behaviour of a table taller than the page: `'split'` breaks it between
 *  rows and continues on the following pages, repeating the header rows and
 *  suffixing the caption; `'clip'` keeps the leading rows that fit and drops
 *  the rest; `'hide'` leaves the table out entirely. */
export type TableOverflow = 'split' | 'clip' | 'hide';

export interface ResolvedTableStyleConfig {
  bodyFontFamily: string;
  bodyFontSize: Dimension;
  bodyColor: ColorValue;
  headerFontFamily: string;
  headerFontSize: Dimension;
  headerColor: ColorValue;
  headerBold: boolean;
  headerItalic: boolean;
  headerLetterSpacing: Dimension;
  headerTextTransform: TableTextTransform;
  headerBackgroundEnabled: boolean;
  headerBackground: ColorValue;
  bodyBackgroundEnabled: boolean;
  bodyBackground: ColorValue;
  bodyAlternateBackgroundEnabled: boolean;
  bodyAlternateBackground: ColorValue;
  borders: boolean;
  borderColor: ColorValue;
  borderWidth: Dimension;
  cellPadding: Dimension;
  rules: TableRules;
  borderRadius: Dimension;
  overflow: TableOverflow;
  continuedSuffix: string;
  continuesMarkerEnabled: boolean;
  continuesMarker: string;
}

/** Where a resource caption sits relative to the figure body. */
export type CaptionPosition = 'above' | 'below';

/** Styling of the optional resource note (`Resource.note`) — a smaller run
 *  set under the resource (source line, credits). Inherits the caption
 *  typeface; every field is optional. */
export interface CaptionNoteStyleConfig {
  /** Note font size. Default 0.85 × the caption size. */
  fontSize?: Dimension;
  /** Note text colour. Defaults to the caption {@link CaptionStyleConfig.color}. */
  color?: ColorValue;
  /** Render the note italic. Default `false`. */
  italic?: boolean;
  /** Gap between the note and what precedes it (body or caption). Default `0.35em`. */
  gap?: Dimension;
  /** Horizontal alignment of the note. Default `'left'`. */
  align?: TextAlign;
}

export interface ResolvedCaptionNoteStyleConfig {
  fontSize: Dimension;
  color: ColorValue;
  italic: boolean;
  gap: Dimension;
  align: TextAlign;
}

/** User-facing styling for resource captions (the numbered label such as
 *  "Figure 1." plus the description text). The label and description share one
 *  typeface and size (the caption is measured as a single wrapped run); they
 *  differ in weight, slant, and colour. Every field is optional and inherits
 *  body-text defaults. See {@link ResolvedCaptionStyleConfig}. */
export interface CaptionStyleConfig {
  /** Caption font family (label + description). Defaults to the body family. */
  fontFamily?: string;
  /** Caption font size (label + description). Defaults to the body size. */
  fontSize?: Dimension;
  /** Description text colour. Defaults to the body-text colour. */
  color?: ColorValue;
  /** Horizontal alignment of caption text. Default `'left'`. */
  align?: TextAlign;
  /** Gap between the figure body and the caption. Default `0.75em`. */
  gap?: Dimension;
  /** Render the numbered label bold. Default `true`. */
  labelBold?: boolean;
  /** Render the numbered label italic. Default `false`. */
  labelItalic?: boolean;
  /** Numbered-label colour. Defaults to {@link color}. */
  labelColor?: ColorValue;
  /** Render the description italic. Default `false`. */
  descriptionItalic?: boolean;
  /** Caption placement: under the figure body (`'below'`, default) or on top
   *  of it (`'above'`), as a table heading. */
  position?: CaptionPosition;
  /** Paint a bar behind the caption spanning the block width. Default `false`. */
  backgroundEnabled?: boolean;
  /** Bar colour. Defaults to the document's main palette colour. */
  background?: ColorValue;
  /** Inner padding between the bar edge and the caption text. Default `0.35em`. */
  padding?: Dimension;
  /** Styling of the optional resource note (`Resource.note`). */
  note?: CaptionNoteStyleConfig;
  /** What stands between the label and the number: in the caption
   *  ("Figure 1.7") and in an inline `:ref` ("Fig. 1.7"). Default a no-break
   *  space (U+00A0); `''` sets them solid, as Chinese does (图1-1). */
  labelNumberGap?: string;
  /** What follows the number in the caption, before the description.
   *  Default `'. '` ("Figure 1.7. A caption"); Chinese sets an ideographic
   *  space (`'　'`: 图1-1　标题). A label without a number keeps its own rule
   *  (a stop unless the prefix ends in one). */
  labelSeparator?: string;
}

export interface ResolvedCaptionStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  align: TextAlign;
  gap: Dimension;
  labelBold: boolean;
  labelItalic: boolean;
  labelColor: ColorValue;
  descriptionItalic: boolean;
  position: CaptionPosition;
  backgroundEnabled: boolean;
  background: ColorValue;
  padding: Dimension;
  note: ResolvedCaptionNoteStyleConfig;
  labelNumberGap: string;
  labelSeparator: string;
}

/** Styling for embedded SVG diagrams (`kind: 'svg'` resources). When
 *  {@link singleInk} is on, every colour in the SVG is remapped to a tint of
 *  {@link inkColor} by luminance — light fills become light tints, dark
 *  strokes and text approach the full ink — so figures reproduce faithfully
 *  when a document is printed with a single spot colour. */
export interface DiagramStyleConfig {
  /** Recolour diagrams to tints of a single ink. Default `false`. */
  singleInk?: boolean;
  /** The ink. Defaults to the document's main palette colour. */
  inkColor?: ColorValue;
}

export interface ResolvedDiagramStyleConfig {
  singleInk: boolean;
  inkColor: ColorValue;
}

/** A named paragraph style, applied to the paragraphs inside a
 *  `:::paragraphs{style="<id>"}` container. Every typographic field is
 *  optional and inherits the body text when unset, so a style only needs to
 *  spell out what differs from running text. See
 *  {@link ResolvedParagraphStyleConfig}. */
export interface ParagraphStyleConfig {
  /** Identifier referenced from `:::paragraphs{style="…"}`. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Defaults to the body font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  /** Leading. `em`/`rem` are relative to the style's own font size.
   *  Defaults to the body line height. */
  lineHeight?: Dimension;
  /** Defaults to the body text colour. */
  color?: ColorValue;
  /** Defaults to the body alignment. `'center'` and `'right'` set every
   *  line ragged from the other side (a dedication, a signature block). */
  textAlign?: TextAlign;
  /** Colour of bold runs. Defaults to `bodyText.boldColor`. */
  boldColor?: ColorValue;
  /** Colour of italic (`*…*`) runs — in an {@link italic} style, the runs
   *  that flip back to upright. Defaults to `bodyText.italicColor` (not to
   *  {@link color}: set it to the style's colour to keep italics in it). */
  italicColor?: ColorValue;
  /** Weight of the regular text. Defaults to `bodyText.fontWeight`. */
  fontWeight?: number;
  /** Weight of bold (`**…**`) runs. Defaults to `bodyText.boldFontWeight`. */
  boldFontWeight?: number;
  /** Set the paragraphs in italics (stage directions, an epigraph); an
   *  italic `*…*` run inside them flips back to upright, as in a
   *  blockquote. Default `false`. */
  italic?: boolean;
  /** Set the paragraphs in small capitals: lowercase letters become
   *  capitals at `SMALL_CAPS_SIZE_RATIO` (0.7) of the size, capitals keep
   *  the full size. Synthesised the same way on every backend. Default
   *  `false`. */
  smallCaps?: boolean;
  /** Hyphenate when justified — and, when `bodyText.hyphenation.ragged` is
   *  on, when ragged too. Defaults to the body hyphenation setting. */
  hyphenation?: boolean;
  /** Indent of every line of the paragraphs from the left edge of the
   *  column (or box), `em` being the style's own size. The first-line and
   *  hanging indents are measured from there, so an indented line of verse
   *  can hang its turnover deeper than its own start: `indent: 1.5em` with
   *  `hangingIndent: 2.5em` sets the line at 1.5 em and its turnover at
   *  4 em. Default `0`; a negative value counts as `0`. */
  indent?: Dimension;
  /** Defaults to the body first-line indent. Ignored when
   *  {@link hangingIndent} is non-zero. */
  firstLineIndent?: Dimension;
  /** Indent applied to every line except the first (bibliographies,
   *  glossaries), from {@link indent}. Non-zero replaces
   *  {@link firstLineIndent}. Default `0`. */
  hangingIndent?: Dimension;
  /** Vertical gap between consecutive paragraphs in the container. Default
   *  `0` — entries abut, off the baseline grid until the container closes. */
  spaceBetween?: Dimension;
  /** Space above the container's first block. Default `0`. */
  marginTop?: Dimension;
  /** Minimum space below the container's last block; the flow snaps back
   *  to the baseline grid after it (see {@link snapToGrid}). How it meets
   *  the space of the block after the container is
   *  `bodyText.paragraphContainerSpacing`. Default `0`. */
  marginBottom?: Dimension;
  /** Snap the flow back onto the baseline grid under the container, the
   *  space below being a minimum. `false` keeps the exact space, so the
   *  text after the container stays off the grid until the next block that
   *  snaps (a heading, the end of a list, display maths): for a document
   *  that runs off the grid, or a group whose leading is its own. Inside a
   *  callout, which has no grid, it changes nothing. Default `true`. */
  snapToGrid?: boolean;
  /** Letter case of the paragraphs: `'uppercase'` sets them in capitals,
   *  the words of a chip and the label of a `:ref` included.
   *  Length-preserving, so source maps stay 1:1: a character whose capital
   *  is longer (`ß` → `SS`) is left as it is. Maths is left alone. Default
   *  `'none'`. */
  textTransform?: ParagraphTextTransform;
}

export type ParagraphTextTransform = 'none' | 'uppercase';

export interface ResolvedParagraphStyleConfig {
  id: string;
  name: string;
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  boldColor?: ColorValue;
  /** Absent when the style sets none (italics take `bodyText.italicColor`). */
  italicColor?: ColorValue;
  fontWeight: number;
  boldFontWeight: number;
  italic: boolean;
  smallCaps: boolean;
  hyphenation: boolean;
  indent: Dimension;
  firstLineIndent: Dimension;
  hangingIndent: Dimension;
  spaceBetween: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  snapToGrid: boolean;
  textTransform: ParagraphTextTransform;
}

// ---------------------------------------------------------------------------
// Callout styles — boxed content for `:::callout{type="…"}` containers.
// ---------------------------------------------------------------------------

/** Horizontal extent of a callout: its column, or the full content width. */
/** `'side'` sets the box in the float-only side column of a `oneAndHalf`
 *  layout (`layout.sideColumnRole: 'floats'`), beside the text it
 *  interrupts; on a page without such a column it lays out as `'column'`. */
export type CalloutSpan = 'column' | 'page' | 'side';

/** Where a side box stands when the text after its fence goes on in
 *  another column or on another page (`CalloutStyleConfig.sideAtColumnEnd`). */
export type CalloutSideAtColumnEnd = 'before' | 'after';
/** Where a callout lands: inline in the flow (`'here'`), floated to the
 *  top / bottom band of a page like a resource (`'auto'` takes whichever
 *  band comes first — the foot of the current page before the head of the
 *  next), or at fixed page coordinates (`'fixed'` — anchored through
 *  {@link CalloutFixedConfig}, out of the column flow; text columns it
 *  overlaps are shortened around it). */
export type CalloutPlacement = 'here' | 'auto' | 'top' | 'bottom' | 'fixed';

/** Position of a `placement: 'fixed'` callout on the page where it occurs in
 *  the flow. The anchor's `container` is the page content area (mirrored on
 *  even pages); `page` / `bleed` anchor to the trim / bleed frames. */
export interface CalloutFixedConfig {
  /** Default `{ to: 'container', edge: 'bottom-left' }`. Element-relative
   *  edges are not meaningful here and fall back to `top-left`. */
  anchor?: ElementAnchor;
  /** Offset from the anchored position. Default `0` / `0`. */
  offset?: { x?: Dimension; y?: Dimension };
}
/** `'fill'` spans the available width; `'auto'` shrink-wraps the title
 *  (badge use — children are ignored). */
export type CalloutWidth = 'fill' | 'auto';
export type CalloutStripeSide = 'left' | 'right' | 'top';
export type CalloutIconKind = 'none' | 'glyph' | 'resource';
export type CalloutIconAlign = 'top' | 'center';
/** Where the in-box icon sits: `'inline'` (the default) in a column of its
 *  own left of the title and content (or centred on the side stripe);
 *  `'corner'` as a badge on the box's top-right corner, half over the
 *  border, taking no room from the content (the icon of a marginal box). */
export type CalloutIconPosition = 'inline' | 'corner';
/** Which corner a `position: 'corner'` icon hangs on: `'right'` (the
 *  default) / `'left'` are fixed; `'outer'` / `'inner'` follow the page
 *  parity when the margins are mirrored (outer = right on a recto, left on
 *  a verso), like the side column of a `oneAndHalf` layout. */
export type CalloutIconCornerSide = 'right' | 'left' | 'outer' | 'inner';
export type CalloutTextTransform = 'none' | 'uppercase';

export interface CalloutBorderConfig {
  enabled?: boolean;
  color?: ColorValue;
  width?: Dimension;
}

export interface CalloutPaddingConfig {
  top?: Dimension;
  right?: Dimension;
  bottom?: Dimension;
  left?: Dimension;
}

/** Solid band along one edge of the box. A side stripe reduces the inner
 *  width; a top stripe reduces the inner height. */
export interface CalloutStripeConfig {
  enabled?: boolean;
  side?: CalloutStripeSide;
  width?: Dimension;
  color?: ColorValue;
}

/** Icon drawn beside the title/body: a text glyph or a resource image. When
 *  the style has a side stripe the icon is centred over the stripe;
 *  otherwise it reserves its own column (`size` + `titleStyle.gap`). A
 *  resource image is fitted inside the square box keeping its aspect ratio.
 *  An icon taller than the content grows the box to fit it. */
export interface CalloutIconConfig {
  kind?: CalloutIconKind;
  /** Glyph text for `kind: 'glyph'` (e.g. `'!'`, `'✎'`). */
  glyph?: string;
  /** Resource id (bitmap / svg) for `kind: 'resource'`. */
  resourceId?: string;
  /** Glyph font family. Defaults to the headings font. */
  fontFamily?: string;
  fontWeight?: number;
  /** Icon box size (square). Default `1.5em` of the callout body size. */
  size?: Dimension;
  color?: ColorValue;
  align?: CalloutIconAlign;
  /** Default `'inline'`. Ignored by the marker. */
  position?: CalloutIconPosition;
  /** Corner of a `position: 'corner'` icon. Default `'right'`. */
  cornerSide?: CalloutIconCornerSide;
  /** Width of the icon's box when it is not square (a wide strip of
   *  icons): the picture is fitted into `width` x `size`. Default: `size`. */
  width?: Dimension;
}

/** A small tab on the box's top edge carrying the fence's `label`
 *  attribute — the number of a numbered box ("RECUADRO 1-1"). It rises
 *  `offset` above the box top (its vertical middle on the edge when
 *  `offset` is half its height), hugs the corner `position` names, and can
 *  carry an `icon` resource on its outer side and a `rule` along the top
 *  edge from the opposite corner up to it. */
export interface CalloutLabelConfig {
  /** Defaults to the headings font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  fontWeight?: number;
  color?: ColorValue;
  /** Tab fill. Default: the main colour. */
  background?: ColorValue;
  /** Default `'top-right'`. */
  position?: 'top-right' | 'top-left';
  /** Tab height. Default `1.4em` of the label size. */
  height?: Dimension;
  /** Horizontal padding on each side of the text. Default `0.6em`. */
  paddingX?: Dimension;
  /** How far the tab's top rises above the box top. Default `0`. */
  offset?: Dimension;
  /** Inset of the tab from the box's side edge. Default `0`. */
  inset?: Dimension;
  /** A picture set beside the tab (on the side away from the corner):
   *  `width` is its width, `gap` the space to the tab. */
  icon?: { resourceId?: string; width?: Dimension; gap?: Dimension };
  /** A rule along the box's top edge from the far corner to the tab (or
   *  its icon). */
  rule?: { enabled?: boolean; color?: ColorValue; width?: Dimension };
}

/** Vertical rule drawn between a callout marker and its box. */
export interface CalloutMarkerRuleConfig {
  enabled?: boolean;
  /** Default main colour. */
  color?: ColorValue;
  /** Default `0.5pt`. */
  width?: Dimension;
  /** Minimum rule length; the rule always spans at least the box height and
   *  is centred on it (`align: 'center'`) or hangs from its top. Default `0`
   *  (box height). */
  length?: Dimension;
}

/** Marker drawn *outside* the box, in a column on its left: an icon (glyph
 *  or resource, same fields as {@link CalloutIconConfig}) with an optional
 *  vertical rule between it and the box. The frame grows by the marker
 *  column (`size` + rule width + `gap`); the box keeps its own background,
 *  padding and icon. `align` positions the marker, the rule and the box
 *  against each other when their heights differ. */
export interface CalloutMarkerConfig extends Omit<CalloutIconConfig, 'position' | 'cornerSide' | 'width'> {
  /** Space between the marker column (after the rule) and the box. Default
   *  `0.5em`. */
  gap?: Dimension;
  rule?: CalloutMarkerRuleConfig;
}

export interface CalloutTitleStyleConfig {
  /** Defaults to the headings font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  textTransform?: CalloutTextTransform;
  /** Vertical gap between the title and the first child block (also the
   *  horizontal gap between the icon column and the content). */
  gap?: Dimension;
  /** Tracking after every glyph of the title. Default `0`. */
  letterSpacing?: Dimension;
  /** Extra indent of the title from the box's inner left edge (room for a
   *  corner badge). Default `0`. */
  indent?: Dimension;
  /** Leading of the title's lines; `em` and `rem` count the title's own
   *  size. Its baseline sits 0.8 of the leading down each line, as in
   *  running text, so a title on the body leading keeps a box a whole
   *  number of lines and its baseline on the grid. Default `1.2em`. */
  lineHeight?: Dimension;
}

/** Body typography inside the callout. Every field inherits `bodyText`. */
export interface CalloutBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  /** Colour of bold runs in the box (a key term set off in the box's own
   *  colour). Defaults to `bodyText.boldColor` (the palette's main colour
   *  unless set), palette link included, so it follows `colorPalette`. */
  boldColor?: ColorValue;
  /** Colour of italic runs in the box (a pull quote set in italics in the
   *  box's colour). Defaults to `bodyText.italicColor`. */
  italicColor?: ColorValue;
  /** Weight of the regular text in the box. Defaults to
   *  `bodyText.fontWeight`. */
  fontWeight?: number;
  /** Weight of bold runs in the box. Defaults to `bodyText.boldFontWeight`. */
  boldFontWeight?: number;
  /** Set the box's paragraphs and list items in italics; an italic `*…*`
   *  run flips back to upright. Default `false`. */
  italic?: boolean;
  /** Set the box's paragraphs and list items in small capitals (see
   *  `ParagraphStyleConfig.smallCaps`). Default `false`. */
  smallCaps?: boolean;
  textAlign?: 'left' | 'justify';
  /** Hyphenate when justified — and, when `bodyText.hyphenation.ragged` is
   *  on, when ragged too. Defaults to the body hyphenation setting. */
  hyphenation?: boolean;
  paragraphSpacing?: boolean;
  firstLineIndent?: Dimension;
}

/** List typography inside the callout. Every field inherits
 *  `unorderedLists` (`color`, `indent`, `gap`, `itemSpacing` also apply to
 *  ordered lists). */
export interface CalloutListStyleConfig {
  bulletChar?: string;
  color?: ColorValue;
  indent?: Dimension;
  gap?: Dimension;
  itemSpacing?: Dimension;
  /** Size and weight of the bullet glyph (inherit `unorderedLists`). */
  bulletFontSize?: Dimension;
  bulletFontWeight?: number;
}

/** A named callout style, selected by `:::callout{type="<id>"}`. */
export interface CalloutStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Default title text; empty / unset = no title. The fence `title`
   *  attribute overrides it per instance. */
  title?: string;
  /** Default `'column'`. Overridable per instance with the `span` attribute. */
  span?: CalloutSpan;
  /** Default `'here'`. Overridable per instance with the `placement` attribute. */
  placement?: CalloutPlacement;
  /** Where a side box (`span: 'side'`) stands when the text after its
   *  fence does not go on in the fence's column: the column has no room
   *  left for it, or the break rules send it on (a paragraph the widow and
   *  orphan rules move whole, a heading kept with its text):
   *  - `'before'` (default): at the fence, on its page, beside the text
   *    before it. Where it does not fit below the fence it slides up, its
   *    foot on the column's foot. Suits a gloss written after the passage
   *    it explains. Every side box was set this way up to postext 1.4.
   *  - `'after'`: level with the first line of the text after the fence,
   *    in the side column of the page where that text goes on. Suits a
   *    mark written before the line it belongs to: a line number, a
   *    marginal heading.
   *  When the text goes on in the same column both set the box at its
   *  fence. A box nothing follows in its chapter stays with the text before
   *  it either way. Side boxes fenced one after another keep their order. */
  sideAtColumnEnd?: CalloutSideAtColumnEnd;
  /** Anchor and offset used when the placement is `'fixed'`. */
  fixed?: CalloutFixedConfig;
  /** Pending floats (figures / tables referenced earlier) are placed before
   *  this box — in the current page's free slots or on pages opened ahead of
   *  it — so no float escapes past a chapter's closing box. Default `false`.
   *  Chapter openers, `:::part` and the end of the document always act as
   *  barriers. */
  floatBarrier?: boolean;
  /** Default `'fill'`. */
  width?: CalloutWidth;
  /** Default `true`. */
  backgroundEnabled?: boolean;
  /** Default `#f4f4f4`. */
  background?: ColorValue;
  /** Default off, `#cccccc`, `0.5pt`. */
  border?: CalloutBorderConfig;
  /** Default `0`. */
  borderRadius?: Dimension;
  /** Default `0.75em` on every side. */
  padding?: CalloutPaddingConfig;
  /** Default off, `left`, `1.5em`, main colour. */
  stripe?: CalloutStripeConfig;
  /** Default `kind: 'none'`. */
  icon?: CalloutIconConfig;
  /** The label tab a fence's `label` attribute prints (unset: no tab even
   *  when the attribute is given). */
  label?: CalloutLabelConfig;
  /** Gap between the columns of a `:::columns` group inside the box.
   *  Default `1.5em`. */
  columnGap?: Dimension;
  /** Default `kind: 'none'` (no marker column). */
  marker?: CalloutMarkerConfig;
  titleStyle?: CalloutTitleStyleConfig;
  body?: CalloutBodyStyleConfig;
  lists?: CalloutListStyleConfig;
  /** Space above the box. Default `0.75em`. */
  marginTop?: Dimension;
  /** Minimum space below the box; the flow snaps back to the baseline grid
   *  after it (exact space with `snapToGrid: false`). Default `0.75em`. */
  marginBottom?: Dimension;
  /** When `true` (default) the flow after an in-flow box snaps back to the
   *  baseline grid, so the space under it is `marginBottom` rounded up to
   *  whole grid lines. When `false` the box keeps its exact `marginBottom`
   *  (collapsing with the next block's top margin, so two such boxes sit
   *  exactly `max(marginBottom, marginTop)` apart) and the text after it
   *  may sit off the grid until the next snap point (a snapped heading, a
   *  list tail) — like `headings.snapToGrid: false`. Page-span boxes in a
   *  multi-column layout, floated, fixed and side boxes keep the grid:
   *  column bands and float zones are laid out on it. */
  snapToGrid?: boolean;
  /** When `true` (default) the box is kept whole: a callout that does not
   *  fit the remaining space moves whole to the next column or page. Only
   *  a box (or the rest of one) taller than an empty, full column — a whole
   *  page for a `span: 'page'` box — splits, by the `false` rules below,
   *  rather than overflow; a floated one that tall stays in the flow where
   *  it occurs. When `false` any box may break between child blocks or between the lines of a
   *  paragraph or list item — leaving at least `splitMinLines` lines on
   *  each side of the cut — the part that fits closes the current column
   *  (or, for a `span: 'page'` box, the page) and the rest continues on the
   *  next one in a box of its own without the title or icon (stripe, border
   *  and background stay; the text keeps the icon's column, empty, so the
   *  box has one measure on every page). */
  keepTogether?: boolean;
  /** Fewest text lines a fragment of a split box may carry, on either side
   *  of the cut (`keepTogether: false`, or a keep-together box taller than
   *  a full column). Default 2: a box never breaks
   *  leaving a lone line at the foot of a column or the head of the next.
   *  It guards text only: a side holding a figure, table, display formula
   *  or nested box is acceptable whatever its line count. A cut inside a
   *  paragraph or list item still counts every line on each side, and also
   *  leaves at least `layout.boxChildSplitMinLines` lines of that paragraph
   *  or item on each side (two by default; this value when it is lower, so
   *  1 allows one): by default a two- or three-line item never splits. A
   *  nested box splits by its own style's `keepTogether` / `splitMinLines`. */
  splitMinLines?: number;
  /** Repeat the title at the head of every continuation fragment of a
   *  split box, followed by {@link continuedSuffix} — "Key points (cont.)",
   *  a screenplay's "HAMLET (CONT'D)". The repeat takes the title style
   *  (its `textTransform` applies to the suffix too); the icon and label tab
   *  stay on the head. Default `false`: continuations carry no title. */
  repeatTitle?: boolean;
  /** Suffix set after the repeated title of a continuation (with
   *  `repeatTitle`). Defaults to `"(cont.)"`, the table default, in the
   *  document language. */
  continuedSuffix?: string;
  /** Set a marker at the foot of every fragment that continues on the next
   *  column or page ("Continued", a screenplay's "(MORE)"), inside the box
   *  under its last line. Default `false`. */
  continuesMarkerEnabled?: boolean;
  /** Text of that marker, in the box's body face and size. Defaults to
   *  `"Continued"` (`"Continúa"` for Spanish documents), like a split
   *  table's marker. */
  continuesMarker?: string;
  /** Alignment of the marker in the box's inner width. Default `'right'`. */
  continuesMarkerAlign?: CalloutMarkerTextAlign;
  /** Set the marker in italics. Default `true`. */
  continuesMarkerItalic?: boolean;
}

/** Alignment of a split callout's continuation marker. */
export type CalloutMarkerTextAlign = 'left' | 'center' | 'right';

export interface ResolvedCalloutStyleConfig {
  id: string;
  name: string;
  title: string;
  span: CalloutSpan;
  placement: CalloutPlacement;
  sideAtColumnEnd: CalloutSideAtColumnEnd;
  fixed: { anchor: ElementAnchor; offset: { x: Dimension; y: Dimension } };
  floatBarrier: boolean;
  width: CalloutWidth;
  backgroundEnabled: boolean;
  background: ColorValue;
  border: { enabled: boolean; color: ColorValue; width: Dimension };
  borderRadius: Dimension;
  padding: { top: Dimension; right: Dimension; bottom: Dimension; left: Dimension };
  stripe: { enabled: boolean; side: CalloutStripeSide; width: Dimension; color: ColorValue };
  icon: {
    kind: CalloutIconKind;
    glyph: string;
    resourceId: string;
    fontFamily: string;
    fontWeight: number;
    size: Dimension;
    color: ColorValue;
    align: CalloutIconAlign;
    position: CalloutIconPosition;
    cornerSide: CalloutIconCornerSide;
    width?: Dimension;
  };
  label?: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    color: ColorValue;
    background: ColorValue;
    position: 'top-right' | 'top-left';
    height: Dimension;
    paddingX: Dimension;
    offset: Dimension;
    inset: Dimension;
    icon: { resourceId: string; width: Dimension; gap: Dimension };
    rule: { enabled: boolean; color: ColorValue; width: Dimension };
  };
  columnGap: Dimension;
  marker: {
    kind: CalloutIconKind;
    glyph: string;
    resourceId: string;
    fontFamily: string;
    fontWeight: number;
    size: Dimension;
    color: ColorValue;
    align: CalloutIconAlign;
    gap: Dimension;
    rule: { enabled: boolean; color: ColorValue; width: Dimension; length: Dimension };
  };
  titleStyle: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    textTransform: CalloutTextTransform;
    gap: Dimension;
    letterSpacing: Dimension;
    indent: Dimension;
    lineHeight: Dimension;
  };
  body: {
    fontFamily: string;
    fontSize: Dimension;
    lineHeight: Dimension;
    color: ColorValue;
    boldColor?: ColorValue;
    italicColor?: ColorValue;
    fontWeight: number;
    boldFontWeight: number;
    italic: boolean;
    smallCaps: boolean;
    textAlign: 'left' | 'justify';
    hyphenation: boolean;
    paragraphSpacing: boolean;
    firstLineIndent: Dimension;
  };
  lists: {
    bulletChar: string;
    color: ColorValue;
    indent: Dimension;
    gap: Dimension;
    itemSpacing: Dimension;
    bulletFontSize?: Dimension;
    bulletFontWeight?: number;
    /** `true` when the style sets `lists.color` itself. The colour then
     *  reaches the numbers of the box's ordered lists even when it equals
     *  `unorderedLists.color` (the value an unset field inherits). Absent
     *  when the field is inherited; a resolved style built without the flag
     *  falls back to "the numbers take it when it differs from
     *  `unorderedLists.color`". */
    colorSet?: boolean;
  };
  marginTop: Dimension;
  marginBottom: Dimension;
  snapToGrid: boolean;
  keepTogether: boolean;
  splitMinLines: number;
  repeatTitle: boolean;
  continuedSuffix: string;
  continuesMarkerEnabled: boolean;
  continuesMarker: string;
  continuesMarkerAlign: CalloutMarkerTextAlign;
  continuesMarkerItalic: boolean;
}

/**
 * A named chip style, selected by the inline `:chip[text]{style="<id>"}`
 * (a chip without `style`, or with an id no style declares, takes the first
 * style). A chip is a boxed run of text — a word of a word bank, a key, a
 * tag — that flows with the line as one unbreakable unit.
 *
 * Its advance is the text plus the horizontal padding and border on both
 * sides. The box is a band around the baseline (0.8 em above, 0.25 em
 * below at the chip's font size) grown by the vertical padding and border;
 * the vertical padding paints outside the line box and never changes the
 * line height, so the baseline grid holds. A box taller than the line pitch
 * would touch the chips of the next line (the sandbox warns).
 *
 * Em dimensions of the box (`paddingX`, `paddingY`, `paddingTop`,
 * `paddingBottom`, `borderRadius`, `borderWidth`, `gap`) are relative to
 * the chip's font size; an em
 * `fontSize` is relative to the surrounding text.
 */
export interface ChipStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Paint the box fill. Default `true`. */
  backgroundEnabled?: boolean;
  /** Box fill. Default a pale blue (`#e8eef7`). */
  background?: ColorValue;
  /** Box outline colour. Default the main palette colour. */
  borderColor?: ColorValue;
  /** Box outline width; `0` draws none. Default `0.5pt`. */
  borderWidth?: Dimension;
  /** Corner radius, clamped to half the box height. Default `0.3em`. */
  borderRadius?: Dimension;
  /** Room between the outline and the text, left and right. Default `0.3em`. */
  paddingX?: Dimension;
  /** Room above and below the text band. Paints outside the line box.
   *  Default `0.1em`. */
  paddingY?: Dimension;
  /** Room above the text band, in place of {@link paddingY}. The band
   *  runs 0.8 em above the baseline and 0.25 em below it, so its middle
   *  sits 0.275 em above the baseline, lower than the middle of a capital
   *  (about 0.35 em in most faces): a top padding larger than the bottom
   *  one by twice the difference (`paddingTop: 0.2em`, `paddingBottom:
   *  0.05em`) centres a capital or a figure in a round chip. Default
   *  `paddingY`. */
  paddingTop?: Dimension;
  /** Room below the text band, in place of {@link paddingY}. Default
   *  `paddingY`. */
  paddingBottom?: Dimension;
  /** Chip text family. Default the surrounding text's. */
  fontFamily?: string;
  /** Chip text size (em = the surrounding text). Default the surrounding
   *  text's. */
  fontSize?: Dimension;
  /** Chip text colour. Default the surrounding text's (bold runs keep the
   *  bold colour). */
  color?: ColorValue;
  /** Set the chip text bold / italic (on top of its own markup). Default
   *  `false`. */
  bold?: boolean;
  italic?: boolean;
  /** Minimum room kept between the box and a neighbouring word or chip
   *  across a word space: a narrower space is widened to it (the extra is
   *  not stretched by justification). Nothing is added at a line edge or
   *  against glued punctuation. Default `0.25em`. */
  gap?: Dimension;
}

export interface ResolvedChipStyleConfig {
  id: string;
  name: string;
  backgroundEnabled: boolean;
  background: ColorValue;
  borderColor: ColorValue;
  borderWidth: Dimension;
  borderRadius: Dimension;
  paddingX: Dimension;
  paddingY: Dimension;
  /** Unset: `paddingY`. */
  paddingTop?: Dimension;
  /** Unset: `paddingY`. */
  paddingBottom?: Dimension;
  /** Unset: the surrounding text's. */
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  bold: boolean;
  italic: boolean;
  gap: Dimension;
}

/** Parity constraint for a forced page break.
 *
 *  - `'any'` — no constraint; the break just opens a new page.
 *  - `'odd'` / `'even'` — ensure the new page falls on the requested
 *    side of the spread. If the natural next page already matches, no
 *    blank is inserted; otherwise one blank page is inserted.
 *  - `'always-odd'` / `'always-even'` — guarantee at least one blank
 *    page between the previous content and the new page, then enforce
 *    parity. The leading blank is attributed to the *previous* chapter;
 *    any subsequent parity-padding blanks belong to the *new* chapter.
 *    Useful for books where every chapter must start a fresh spread. */
export type HeadingBreakParity = 'any' | 'odd' | 'even' | 'always-odd' | 'always-even';

export interface HeadingBreakBeforeConfig {
  /** When true, force a page break before every heading of this level. A
   *  `:::pagebreak` right before the heading does not replace it: the
   *  heading still applies its `parity` after the page the directive
   *  opened (which may add a blank page). A heading style inherits its
   *  level's break field by field; set `enabled: false` on a style meant to
   *  start where a manual page break leaves it. */
  enabled?: boolean;
  /** Optional parity constraint on the page the heading opens on.
   *  `'odd'` / `'even'` inserts a blank padding page when needed. Default:
   *  `'any'`. */
  parity?: HeadingBreakParity;
}

export interface ResolvedHeadingBreakBeforeConfig {
  enabled: boolean;
  parity: HeadingBreakParity;
}

/** Whether a heading occupies the single column it sits in, or spans the
 *  full page content width. `'page'` only takes effect on headings that
 *  start a new page (via `breakBefore.enabled`). */
export type HeadingSpan = 'column' | 'page';

/** Advanced design configuration for a heading level. When `enabled: true`
 *  the heading is rendered from `slot` and the inline typography fields
 *  (`fontFamily`, `fontSize`, `fontWeight`, `color`, `italic`,
 *  `numberingTemplate`-as-prefix) on `HeadingLevelConfig` are ignored. The
 *  heading's own text is carried via the `{titleText}` placeholder. */
export interface HeadingAdvancedDesignConfig {
  enabled: boolean;
  slot: DesignSlot;
  /** Minimum height reserved for the heading in the column flow. The
   *  heading takes `max(design content bottom, minHeight)`, then its
   *  `marginBottom` under it (from its heading style, its level or
   *  `headings.marginBottom`; 0.5 em of the heading's size by default), and
   *  the sum is rounded up to the baseline grid when headings snap: a band
   *  exactly `minHeight` tall needs that `marginBottom` at 0 and a
   *  `minHeight` of whole grid lines. So an opener can push body text
   *  down even when its elements are short (or anchored to the page/bleed
   *  frames above the heading). The design
   *  content bottom counts every element except those with
   *  `reserve: false` and those that follow the reserved band itself
   *  (anchored to the container's middle or bottom, or with a `'fill'`
   *  height against it). */
  minHeight?: Dimension;
}

export interface ResolvedHeadingAdvancedDesignConfig {
  enabled: boolean;
  slot: ResolvedDesignSlot;
  minHeight?: Dimension;
}

export interface HeadingLevelConfig {
  level: number;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  /** Template of the level's automatic number: `{1}`…`{6}` print the
   *  counters, optionally formatted (`{1:I}`, `{1:a}`, `{1:01}`, spelled out
   *  with `{1:words}` / `{1:ordinal}` — see `numberingTemplate` in the
   *  configuration docs). Default `''`: no number. */
  numberingTemplate?: string;
  /** What stands between the number and the title (`第一回` + `'　'` +
   *  `甄士隱夢幻識通靈`): in the column, in the default opener of a
   *  `span: 'page'` level, in the running heads that print the heading
   *  line and in the PDF bookmarks; level 1's also joins a part's number
   *  and title in the default part page and contents row. Default `' '`;
   *  Chinese sets U+3000 (`'　'`) or nothing (`''`). The contents keep
   *  their own number column (`toc.levels[].numberGap`). */
  numberSeparator?: string;
  italic?: boolean;
  /** Tracking after every glyph of the heading (spaces and the numbering
   *  prefix included), as CSS `letter-spacing`: positive spreads the
   *  letters — capitals set with `textTransform: 'uppercase'` usually want
   *  a little — negative tightens a display size. An `em` value is relative
   *  to the level's `fontSize`. Measured into the heading's lines and
   *  painted the same by canvas, HTML and PDF. A level rendered from its
   *  `advancedDesign` ignores it, like the other inline typography fields:
   *  each design text element has its own `letterSpacing`. Default `0`. */
  letterSpacing?: Dimension;
  /** Force a page break before every heading of the level. Merged field by
   *  field over the level's default (H1: `{ enabled: true, parity:
   *  'always-odd' }`, the others `{ enabled: false, parity: 'any' }`), so
   *  setting only `parity` keeps the break on. */
  breakBefore?: HeadingBreakBeforeConfig;
  /** Column vs full-page span. Default `'column'`. A `'page'` heading
   *  without a design of its own is painted by a default opener across the
   *  content area, in the level's typography and leading, with its bold,
   *  italic and script runs (`headings.inlineMarks`); its band holds every
   *  line that opener paints, even where the heading's own measure fits the
   *  title on fewer (a justified title, a forced break). */
  span?: HeadingSpan;
  /** When enabled, the heading renders as a design slot. */
  advancedDesign?: HeadingAdvancedDesignConfig;
  /** Letter-case transform applied to the heading title (after any
   *  numbering prefix, which is kept as written). Length-preserving so the
   *  editor's source map stays 1:1 — characters whose upper-case form
   *  expands (`ß` → `SS`) are left unchanged. Default `'none'`. */
  textTransform?: HeadingTextTransform;
  /** A structural heading: it prints nothing and takes no room in the
   *  column, but still does everything else a heading does — its
   *  `breakBefore`, the section a heading style opens, the numbering, the
   *  contents (`:::toc`), `{chapterTitle}` running heads and the PDF
   *  bookmarks. For a dedication or a colophon that must be listed but not
   *  titled on the page. A heading overrides it with `{hidden="true"}` /
   *  `{hidden="false"}`. Default `false`. */
  hidden?: boolean;
  /** Whether the flow snaps back onto the baseline grid under a heading of
   *  this level (its `marginBottom` rounded up to whole grid lines) — the
   *  per-level form of {@link HeadingsConfig.snapToGrid}, which it inherits
   *  when unset. `false` keeps the exact margin, so an H2 can sit a line and
   *  a half above its text while an H3 stays on the grid. A heading style
   *  may set it too. */
  snapToGrid?: boolean;
}

export type HeadingTextTransform = 'none' | 'uppercase';

export interface ResolvedHeadingLevelConfig {
  level: number;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  numberingTemplate: string;
  /** The level's own separator, else `' '`. */
  numberSeparator: string;
  italic: boolean;
  /** The level's own tracking, else `0`. */
  letterSpacing: Dimension;
  breakBefore: ResolvedHeadingBreakBeforeConfig;
  span: HeadingSpan;
  advancedDesign: ResolvedHeadingAdvancedDesignConfig;
  textTransform: HeadingTextTransform;
  hidden: boolean;
  /** The level's own value, else `headings.snapToGrid`. */
  snapToGrid: boolean;
}

export interface HeadingsConfig {
  fontFamily?: string;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  fontWeight?: number;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  /** When true, a heading is never placed as the last element of a column/page.
   *  If the following block would not have at least one line of room after the
   *  heading, the heading is pushed to the next column/page so it stays joined
   *  to its text. A closing band cut level by `balancing.trailing` keeps the
   *  rule too: the cut is taken lower (or dropped) rather than leave a
   *  heading closing a column while its text opens the next. Default true. */
  keepWithNext?: boolean;
  /** How a paragraph that does not fit under a heading at a column's foot
   *  is split, when pushing it whole would leave the heading behind
   *  (`keepWithNext`):
   *  - `'rules'` (default): the most lines that fit, as long as at least
   *    `bodyText.widowMinLines` stay under the heading and at least
   *    `bodyText.orphanMinLines` go on to the next column; when no split
   *    does both, the heading moves on with its paragraph (column
   *    balancing fills the room it leaves). `avoidWidows` and `avoidOrphans`
   *    off drop their side of the rule.
   *  - `'fill'`: as many lines as fit, at least `widowMinLines`, however few
   *    go on (a four-line paragraph with room for three splits 3 + 1). The
   *    rule up to postext 1.4: configurations stored before
   *    `configVersion` 8 read with it (see `pinLegacyHeadingSplit`). */
  keepWithNextSplit?: KeepWithNextSplit;
  /** When true (the default) the flow snaps back onto the baseline grid
   *  under a heading, so its `marginBottom` is rounded up to whole grid
   *  lines. `false` keeps the exact margin: the text under the heading may
   *  sit off the grid until the next snap point (a list's end, a container's
   *  tail, display math). A level overrides it with
   *  {@link HeadingLevelConfig.snapToGrid}. */
  snapToGrid?: boolean;
  /** Vertical column balancing — editorial bottom alignment. When a column
   *  ends short of its bottom, extra baseline-grid lines are added above the
   *  column's headings so every column ends flush with the page bottom.
   *  Extra lines are distributed across the column's headings, favouring the
   *  most important (lowest-level) heading. Default enabled. */
  balancing?: ColumnBalancingConfig;
  /** Whether a heading reads its inline marks: `*italic*`, `**bold**`,
   *  `^superscript^`, `~subscript~`, `:smallcaps[…]` and links, as a
   *  paragraph does. An italic run flips the heading's slant (upright in an
   *  italic heading) and a bold run takes the body's bold weight, or the
   *  heading's own when it is heavier. The contents keep the bold and
   *  italic runs; running heads and PDF bookmarks print the text only.
   *  `false` prints the marked text in the heading's plain style, with the
   *  markers dropped, as up to postext 1.4. The default opener of a
   *  `span: 'page'` heading without a design sets the bold, italic and
   *  script runs too; a heading design (a designed opener band, an
   *  in-column `advancedDesign`) prints `{titleText}` as plain text either
   *  way. Default `true`; configurations stored earlier whose
   *  headings carry marks are read with `false` (see `migrateConfig` in
   *  `postext/bundle`). */
  inlineMarks?: boolean;
  levels?: HeadingLevelConfig[];
}

export interface ColumnBalancingConfig {
  enabled?: boolean;
  /** Maximum extra grid lines that may be added above a single heading. */
  maxLinesPerHeading?: number;
  /** Allow extra grid lines where a list/enumeration ends, when the column's
   *  headings cannot absorb the whole gap. Default true. */
  stretchAfterLists?: boolean;
  /** Maximum extra grid lines after a single list end. Default 1. */
  maxLinesAfterList?: number;
  /** Allow extra grid lines between a top float (figure / table band) and
   *  the text under it in the same column, after headings and list ends
   *  have been tried. Never on a page that does not flow on (a chapter's
   *  closing page) nor in a closing band cut level by `trailing`: there the
   *  column heads stay level and the last column may end a line short (a
   *  heading or a callout box opening a column under the float stays at its
   *  head too, whatever this says). The first block under the float may be
   *  the rest of a paragraph begun on the page before: it moves down all
   *  the same, by the line the break rules left free at the column's foot
   *  (a line the widow rule kept empty, or a paragraph space with no room
   *  for text after it); `false` keeps it right under the float. Default
   *  true. */
  stretchAfterFloats?: boolean;
  /** Maximum extra grid lines under a single float band. Default 1. */
  maxLinesAfterFloat?: number;
  /** Last resort: re-break one paragraph per short column one line looser
   *  (TeX \looseness=+1), within the configured `bodyText.maxWordSpacing`.
   *  Requires `bodyText.optimalLineBreaking`. Default true. */
  looseParagraphs?: boolean;
  /** How many paragraphs of one short column may be run a line long (one
   *  extra line each, longest paragraphs first). Default 2. */
  maxLooseParagraphs?: number;
  /** Let a loose paragraph also take a little positive tracking (letter
   *  spacing) when word spacing alone cannot gain the line — the compositor's
   *  classic fix. Only the smallest tracking that gains the line is used, and
   *  never more than `maxTracking`. Default true. */
  trackParagraphs?: boolean;
  /** Maximum tracking for a loose paragraph, in thousandths of an em (the
   *  InDesign unit: 10 = 0.01 em per character). Default 10. */
  maxTracking?: number;
  /** Balance the closing band of a chapter / the document: when the flow
   *  ends before the page is full and its columns are uneven, they are cut
   *  level (via a band cap) so the last columns end at the same height, the
   *  way a compositor sets a short closing page. The cut keeps the rules an
   *  uncut band keeps: when a block that cannot split across it (a paragraph
   *  tail the orphan and widow minimums keep whole, a keep-together box)
   *  would run past it and lose its last lines, or — with
   *  {@link HeadingsConfig.keepWithNext} — a heading would close a column
   *  while its text opens the next, the cut is taken a line lower, up to
   *  three times, and otherwise dropped. Columns whose feet differ by one
   *  grid line or less are left as they are: a last column a line short is
   *  the usual finish of a closing band. Default true. */
  trailing?: boolean;
  /** Balance the band a page-span block leaves behind: when a `span: 'page'`
   *  callout does not fit under the current columns and has to move to the
   *  next page (or split, see `CalloutStyleConfig.keepTogether`), the
   *  columns it interrupts are cut level instead of leaving the last one
   *  short — the flow ends at the same height in every column and the box
   *  (or the part of it that fits) sits under them. Default true. */
  beforeSpan?: boolean;
  /** When a callout box that closes a short column takes the room under
   *  its foot as space above it (the `trailingCallout` lever), so that its
   *  foot lands on the column's last grid slot:
   *  - `'first'` (default, the 1.4 order): before any other lever, so the
   *    box takes the whole gap, even several lines, and the headings above
   *    it get nothing;
   *  - `'last'`: after the heading, list-end, after-display and after-float
   *    levers, which take whole lines first; the box then takes only what
   *    they leave, usually a fraction of a line, and stays closer to the
   *    text it annotates;
   *  - `'off'`: never; the room under the box stays unless the other levers
   *    take it (in whole lines).
   *  On a closing page the box is the only lever that moves it level with
   *  the last line of the column beside it; `'off'` leaves it where it is
   *  there too. Any other value reads as `'first'`. */
  closingBox?: ClosingBoxLever;
}

/** Where the column-balancing lever of a box closing a column runs
 *  (`ColumnBalancingConfig.closingBox`). */
export type ClosingBoxLever = 'first' | 'last' | 'off';

/** How a paragraph kept with the heading above it splits at a column's foot
 *  (`HeadingsConfig.keepWithNextSplit`). */
export type KeepWithNextSplit = 'rules' | 'fill';

export interface ResolvedHeadingsConfig {
  fontFamily: string;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  keepWithNext: boolean;
  keepWithNextSplit: KeepWithNextSplit;
  snapToGrid: boolean;
  inlineMarks: boolean;
  balancing: {
    enabled: boolean;
    maxLinesPerHeading: number;
    stretchAfterLists: boolean;
    maxLinesAfterList: number;
    stretchAfterFloats: boolean;
    maxLinesAfterFloat: number;
    looseParagraphs: boolean;
    maxLooseParagraphs: number;
    trackParagraphs: boolean;
    maxTracking: number;
    trailing: boolean;
    beforeSpan: boolean;
    closingBox: ClosingBoxLever;
  };
  levels: ResolvedHeadingLevelConfig[];
}

export interface UnorderedListLevelConfig {
  level: number;
  bulletChar?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. Accepts negative values. */
  verticalOffset?: Dimension;
}

export interface ResolvedUnorderedListLevelConfig {
  level: number;
  bulletChar: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. When undefined, the renderer cascades:
   *  level 1 → general indent; level N>1 → previous level's text-start (indent + bullet width + gap). */
  indent?: Dimension;
  verticalOffset: Dimension;
}

export interface UnorderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  bulletChar?: string;
  bulletFontSize?: Dimension;
  gap?: Dimension;
  /** Base indent step — level N defaults to `indent * N` unless the level overrides `indent`. Use 0 to pin bullets to the column edge. */
  indent?: Dimension;
  /** Fine-tune bullet vertical position. Negative = up, positive = down. */
  bulletVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  /** Round the space above the list up so its first item sits on the
   *  baseline grid, as the text after a heading does; `marginTop` is then a
   *  minimum. The list's end snaps the flow back onto the grid either way;
   *  this snaps its start too, so with no `itemSpacing` every item lines up
   *  with the text in the column beside it. Lists in callout boxes, whose
   *  interiors are off the grid, are left alone. Default false (1.4 set the
   *  top margin exactly, so a margin that is not a whole number of lines
   *  left the items off the grid until the list ended). */
  snapTopToGrid?: boolean;
  hangingIndent?: boolean;
  levels?: UnorderedListLevelConfig[];
  /** GFM task list rendering. The bullet glyph is replaced with a checkbox. */
  taskCheckboxChar?: string;
  taskCheckedChar?: string;
  taskCompletedStrikethrough?: boolean;
  /** Optional color for the text of completed tasks. When undefined, body color is used. */
  taskCompletedColor?: ColorValue;
}

export interface ResolvedUnorderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  bulletChar: string;
  bulletFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  bulletVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  snapTopToGrid: boolean;
  hangingIndent: boolean;
  levels: ResolvedUnorderedListLevelConfig[];
  taskCheckboxChar: string;
  taskCheckedChar: string;
  taskCompletedStrikethrough: boolean;
  /** Undefined => inherit body text color at render time. */
  taskCompletedColor?: ColorValue;
}

export type OrderedListNumberFormat =
  | 'arabic'
  | 'lower-alpha'
  | 'upper-alpha'
  | 'lower-roman'
  | 'upper-roman'
  | EastAsianNumeralStyle;

export interface OrderedListLevelConfig {
  level: number;
  /** Number style of this level (see `OrderedListsConfig.numberFormat`). */
  numberFormat?: OrderedListNumberFormat;
  /** Text before this level's number (see `OrderedListsConfig.prefix`). */
  prefix?: string;
  separator?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  indent?: Dimension;
  verticalOffset?: Dimension;
  /** Separator run styling for this level; each field inherits the level's
   *  number style (or the list-wide separator setting) when unset. */
  separatorFontFamily?: string;
  separatorFontWeight?: number;
  separatorItalic?: boolean;
  separatorColor?: ColorValue;
  separatorGap?: Dimension;
}

export interface ResolvedOrderedListLevelConfig {
  level: number;
  numberFormat: OrderedListNumberFormat;
  prefix: string;
  separator: string;
  fontFamily: string;
  fontSize: Dimension;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  /** User-overridden indent for this level. Undefined => pipeline cascades. */
  indent?: Dimension;
  verticalOffset: Dimension;
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}

export interface OrderedListsConfig {
  fontFamily?: string;
  color?: ColorValue;
  fontWeight?: number;
  italic?: boolean;
  /** Number style. Default `'arabic'`. The page and resource spellings of a
   *  format are read too (`'decimal'`, `'roman-lower'`, `'i'`…, see
   *  `parseNumberFormat`) and resolve to the list spelling; an unknown
   *  value numbers in arabic and is reported by `collectConfigWarnings`. */
  numberFormat?: OrderedListNumberFormat;
  /** Text set before the number, styled like the separator: with
   *  `prefix: '（'` and `separator: '）'` a Chinese list reads （一）（二）.
   *  Default `''`. A level may set its own. */
  prefix?: string;
  separator?: string;
  numberFontSize?: Dimension;
  gap?: Dimension;
  indent?: Dimension;
  numberVerticalOffset?: Dimension;
  marginTop?: Dimension;
  marginBottom?: Dimension;
  itemSpacing?: Dimension;
  /** Round the space above the list up so its first item sits on the
   *  baseline grid (see `UnorderedListsConfig.snapTopToGrid`). Default
   *  false. */
  snapTopToGrid?: boolean;
  /** How wide the number column of an item is, which sets where its text
   *  starts (numbers are set flush right in it):
   *  - `'run'` (default): the widest number of the item's own run, the
   *    items of one depth with nothing but deeper items between them. A
   *    list broken by a figure, a paragraph or a box starts a new run, so
   *    `ii)` after a table can start its text further right than `i)`
   *    before it;
   *  - `'level'`: the widest number at the item's depth in the whole
   *    document (the chapter, in a book), so every list and every part of
   *    an interrupted one starts its text at the same place, as the
   *    indents of the deeper levels already do. */
  numberWidth?: OrderedListNumberWidth;
  hangingIndent?: boolean;
  levels?: OrderedListLevelConfig[];
  /** Font family of the separator run. Inherits the number's `fontFamily`. */
  separatorFontFamily?: string;
  /** Weight of the separator run. Inherits the number's `fontWeight`. */
  separatorFontWeight?: number;
  /** Italic separator run. Inherits the number's `italic`. */
  separatorItalic?: boolean;
  /** Colour of the separator run. Inherits the number's `color`. */
  separatorColor?: ColorValue;
  /** Space between the number and the separator. Default `0em`. */
  separatorGap?: Dimension;
}

/** The number column of an ordered list item
 *  (`OrderedListsConfig.numberWidth`). */
export type OrderedListNumberWidth = 'run' | 'level';

export interface ResolvedOrderedListsConfig {
  fontFamily: string;
  color: ColorValue;
  fontWeight: number;
  italic: boolean;
  numberFormat: OrderedListNumberFormat;
  prefix: string;
  separator: string;
  numberFontSize: Dimension;
  gap: Dimension;
  indent: Dimension;
  numberVerticalOffset: Dimension;
  marginTop: Dimension;
  marginBottom: Dimension;
  itemSpacing: Dimension;
  snapTopToGrid: boolean;
  numberWidth: OrderedListNumberWidth;
  hangingIndent: boolean;
  levels: ResolvedOrderedListLevelConfig[];
  separatorFontFamily: string;
  separatorFontWeight: number;
  separatorItalic: boolean;
  separatorColor: ColorValue;
  separatorGap: Dimension;
}

export interface SyncIndicatorConfig {
  enabled: boolean;
  color?: ColorValue;
}

export interface LooseLineHighlightConfig {
  enabled: boolean;
  color?: ColorValue;
  /** Threshold as a multiplier of the normal space width. Lines whose
   *  justified space ratio exceeds this are highlighted. */
  threshold?: number;
}

export interface WarningsToggleConfig {
  missingFont?: boolean;
  looseLines?: boolean;
  headingHierarchy?: boolean;
  consecutiveHeadings?: boolean;
  listAfterHeading?: boolean;
  designIssues?: boolean;
}

export interface ResolvedWarningsToggleConfig {
  missingFont: boolean;
  looseLines: boolean;
  headingHierarchy: boolean;
  consecutiveHeadings: boolean;
  listAfterHeading: boolean;
  designIssues: boolean;
}

export interface DebugConfig {
  cursorSync?: SyncIndicatorConfig;
  selectionSync?: SyncIndicatorConfig;
  looseLineHighlight?: LooseLineHighlightConfig;
  pageNegative?: { enabled: boolean };
  warnings?: WarningsToggleConfig;
}

export interface ResolvedDebugConfig {
  cursorSync: { enabled: boolean; color: ColorValue };
  selectionSync: { enabled: boolean; color: ColorValue };
  looseLineHighlight: { enabled: boolean; color: ColorValue; threshold: number };
  pageNegative: { enabled: boolean };
  warnings: ResolvedWarningsToggleConfig;
}

/** Partial document config that applies to the HTML viewer only (see
 *  `HtmlViewerConfig.overrides`). */
export type HtmlViewerOverrides = Omit<PostextConfig, 'htmlViewer'>;

export interface HtmlViewerConfig {
  /** Target column width in characters — drives the measured width of the
   *  single or multi-column layout in the HTML viewer. */
  maxCharsPerLine?: number;
  /** Horizontal gap between columns in multi-column mode, in pixels. */
  columnGap?: number;
  /** Use Knuth-Plass optimal line breaking in the HTML viewer. When false,
   *  overrides `bodyText.optimalLineBreaking` only for HTML rendering to
   *  favour performance. Default false. */
  optimalLineBreaking?: boolean;
  /** Screen-only alternative to parts of the document config. The HTML
   *  viewer merges it over the document config before laying out (see
   *  `applyHtmlViewerOverrides`); canvas and PDF ignore it. Objects merge
   *  recursively; a `levels` array (headings, lists) merges entry by entry
   *  on `level`; every other array — a design slot's `elements`,
   *  `calloutStyles`, `colorPalette`… — replaces the base array wholesale.
   *  Typical use: a chapter opener without the print bands, a part page
   *  whose title wraps against the number instead of a fixed trim-box
   *  width. */
  overrides?: HtmlViewerOverrides;
}

export interface ResolvedHtmlViewerConfig {
  maxCharsPerLine: number;
  columnGap: number;
  optimalLineBreaking: boolean;
  /** Carried through unchanged; absent when the config sets none. */
  overrides?: HtmlViewerOverrides;
}

export interface MathConfig {
  /** Enable LaTeX rendering. When false, `$...$` / `$$...$$` spans are
   *  still parsed (so warnings track unclosed delimiters) but rendered as
   *  their literal TeX source. */
  enabled?: boolean;
  /** Scale applied to the surrounding text's font size when rendering math:
   *  one em of the formula's TeX font is that size × this factor — the body
   *  size for display formulas and for inline maths in body text, the
   *  enclosing block's size for inline maths in a heading, a paragraph
   *  style, a caption or a callout body. 1.0 = match the surrounding text
   *  (since postext 1.5; up to 1.4 formulas came out about 13% larger, and
   *  1.131 reproduces that size. The display margins in `em` follow the
   *  formula's size, so 1.4's pages also need them divided by 1.131:
   *  `pinLegacyMathSize` in `postext/bundle` does both, and configurations
   *  stored by 1.4 are read through it). Range: typically 0.5–2.0. */
  fontSizeScale?: number;
  /** Formula colour. If omitted, inherits the body colour. */
  color?: ColorValue;
  /** Top margin for display math blocks. */
  marginTop?: Dimension;
  /** Bottom margin for display math blocks. Baseline grid snap uses this
   *  as the *minimum* bottom gap (the grid always wins). */
  marginBottom?: Dimension;
  /** Indent the first line of a paragraph that follows a display formula,
   *  as any other paragraph. Default `true`. `false` sets every paragraph
   *  right after a display formula flush, as the continuation of the
   *  sentence the formula interrupted ("where …"). A formula written inside
   *  a paragraph — no blank line above it nor below it — is always followed
   *  flush: the text under its closing `$$` continues that paragraph,
   *  whatever this says. */
  indentAfterDisplay?: boolean;
  /** Keep a display formula in the column of the line that leads into it
   *  (TeX's predisplay penalty): when the formula does not fit under the
   *  last line of the paragraph before it, that line goes to the next
   *  column or page with the formula — the whole paragraph when the lines
   *  left behind would break the widow rule (fewer than `widowMinLines`,
   *  when `avoidWidows` is on). The carried line stands alone at the head
   *  of the next column. Default `false`: the formula alone moves on. */
  keepWithLeadIn?: boolean;
}

export interface ResolvedMathConfig {
  enabled: boolean;
  fontSizeScale: number;
  color?: ColorValue;
  marginTop: Dimension;
  marginBottom: Dimension;
  indentAfterDisplay: boolean;
  keepWithLeadIn: boolean;
}

/** Where footnotes (`[^id]` markers) are set:
 *  - `'column'`: at the foot of the column that holds the line citing the
 *    note, under a separator rule, above the column's bottom float band. In
 *    a one-column layout that is the foot of the page;
 *  - `'chapterEnd'`: every note of the chapter after its last block. */
export type FootnotePlacement = 'column' | 'chapterEnd';

/** When the note numbers start again at 1: at each chapter (a heading
 *  that opens a page, `breakBefore`, and the start of each document of a
 *  book), never within the document, on every page (`'page'`, the usual
 *  页下注 of a Chinese book) or in every column (`'column'`, for books that
 *  set their notes column by column). `'page'` and `'column'` count the
 *  notes where the layout sets them, so they apply to notes at the column
 *  foot only: with `placement: 'chapterEnd'` they number by chapter. */
export type FootnoteNumbering = 'chapter' | 'document' | 'page' | 'column';

/** How the marker in the text is set:
 *  - `'superscript'`: raised and reduced, as a superscript (`text¹`);
 *  - `'inline'`: on the baseline at `markerSize` (`text①`), centred in its
 *    cell in vertical text — how Chinese books set circled markers;
 *  - `'auto'`: inline for `circled-decimal` numbers, else superscript. */
export type FootnoteMarkerPosition = 'auto' | 'superscript' | 'inline';

/** The rule set between the text and the notes of a column. */
export interface FootnoteSeparatorConfig {
  /** Draw the rule. Default `true`. With `false` the space stays. */
  enabled?: boolean;
  /** Length of the rule as a fraction of the column width (0–1). Default
   *  `0.3`. */
  width?: number;
  /** Thickness. Default `0.5pt`. */
  lineWidth?: Dimension;
  /** Rule colour. Defaults to the notes' text colour. */
  color?: ColorValue;
}

export interface ResolvedFootnoteSeparatorConfig {
  enabled: boolean;
  width: number;
  lineWidth: Dimension;
  color?: ColorValue;
}

/** Footnotes: `[^id]` in the text cites the note `[^id]: text` defined in a
 *  paragraph of its own anywhere in the chapter. The marker prints as a
 *  superscript number (or inline, see `markerPosition`); the note prints at the foot of the column (see
 *  {@link FootnotePlacement}), in citation order. */
export interface FootnotesConfig {
  /** Default `'column'`. */
  placement?: FootnotePlacement;
  /** Default `'chapter'`. */
  numbering?: FootnoteNumbering;
  /** How the numbers are written, in any spelling of a number format
   *  (`decimal`, `lower-roman`, `circled-decimal` / `①`, `cjk-decimal`…, see
   *  `parseNumberFormat`). Default `'decimal'`. `circled-decimal` writes
   *  numbers past 50 in decimal. */
  numberFormat?: string;
  /** Default `'auto'` (see {@link FootnoteMarkerPosition}). The number
   *  that opens the note itself follows it too: raised, or set at the size
   *  of the note text. */
  markerPosition?: FootnoteMarkerPosition;
  /** Size of an inline marker in the text, `em` of the text around it.
   *  Default `1em`. No effect on a superscript marker. */
  markerSize?: Dimension;
  /** `'chapterEnd'` placement: where the notes stand in the columns that
   *  close the chapter. `'foot'` sets them at the foot of the column, the
   *  room left over staying between the text and them (as notes at the
   *  column foot stand); `'text'` sets them right under the text. Default
   *  `'foot'`. */
  chapterEndAlign?: 'foot' | 'text';
  /** Size of the note text. Default `0.8em` of the body size. `em` / `rem`
   *  are relative to the body size. */
  fontSize?: Dimension;
  /** Leading of the note text; `em` / `rem` relative to the note size.
   *  Default `1.25em`. */
  lineHeight?: Dimension;
  /** Note text colour. Defaults to the body colour. */
  color?: ColorValue;
  /** Alignment of the note text. Defaults to the body alignment. */
  textAlign?: TextAlign;
  /** Indent of the turnover lines of a note, so they align past its
   *  number. Default `0` (the lines run flush under the number). */
  hangingIndent?: Dimension;
  /** Space between two notes. Default `0`. */
  spaceBetween?: Dimension;
  /** Space between the last line of text and the separator rule (or the
   *  first note without a rule). Default `0.5em` of the body size. The
   *  rule sits in the middle of `spaceAbove` + `spaceBelowRule`. */
  spaceAbove?: Dimension;
  /** Space between the rule and the first note. Default `0.4em`. */
  spaceBelowRule?: Dimension;
  separator?: FootnoteSeparatorConfig;
}

export interface ResolvedFootnotesConfig {
  placement: FootnotePlacement;
  numbering: FootnoteNumbering;
  numberFormat: NumberFormatStyle;
  /** `'auto'` resolved against the number format. */
  markerPosition: 'superscript' | 'inline';
  markerSize: Dimension;
  chapterEndAlign: 'foot' | 'text';
  fontSize: Dimension;
  lineHeight: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  hangingIndent: Dimension;
  spaceBetween: Dimension;
  spaceAbove: Dimension;
  spaceBelowRule: Dimension;
  separator: ResolvedFootnoteSeparatorConfig;
}

/** The conventions Chinese text follows, after the regions clreq
 *  describes: `mainland` (China and Singapore: simplified characters,
 *  GB/T 15834—2011), `taiwan` and `hongkong` (traditional characters). */
export type CjkRegion = 'mainland' | 'taiwan' | 'hongkong';

/** How strictly lines of CJK text avoid starting or ending with a mark
 *  (clreq §6.1.1):
 *  - `none`: a line may break between any two characters (Taiwan and Hong
 *    Kong newspapers);
 *  - `basic`: no line starts with a pause or stop mark (、，；：。！？), a
 *    closing bracket or quote, a connector (– ～, a single —), an
 *    interpunct (·) or an iteration mark (々), and none ends with an
 *    opening bracket or quote;
 *  - `gb`: `basic`, and the solidus (/ ／) at neither end (GB/T
 *    15834—2011 §5.1.9);
 *  - `strict`: `gb`, and no line starts with a two-em dash (——) or an
 *    ellipsis (……).
 *  At every level —— and …… never split, a number keeps its signs and its
 *  unit (¥5,999, 50%), a Latin word stays whole unless it is wider than the
 *  line, and a footnote marker stays with the character it follows. */
export type CjkLineBreak = 'none' | 'basic' | 'gb' | 'strict';

/** East Asian typography: how Chinese, Japanese and Korean text is
 *  composed. Every field is optional; `'auto'` follows the region of the
 *  document language (`locale`). A paragraph is composed this way when it
 *  holds more CJK characters than word spaces; a Latin paragraph quoting a
 *  few characters keeps Knuth–Plass, with a break allowed next to them. */
export interface CjkConfig {
  /** The regional conventions to follow. `'auto'` (the default) reads them
   *  from `locale`: `zh`, `zh-Hans`, `zh-CN` and `zh-SG` → `mainland`;
   *  `zh-Hant` and `zh-TW` → `taiwan`; `zh-HK` and `zh-MO` → `hongkong`;
   *  any other language → `mainland`. */
  region?: 'auto' | CjkRegion;
  /** Where lines may break (see {@link CjkLineBreak}). `'auto'` (the
   *  default): `gb` for the mainland, `basic` for Taiwan and Hong Kong. */
  lineBreak?: 'auto' | CjkLineBreak;
  /** How wide the full-width marks are set (see
   *  {@link CjkPunctuationWidth}). `'auto'` (the default): `kaiming` for
   *  the mainland, `fullwidth` for Taiwan and Hong Kong. */
  punctuationWidth?: 'auto' | CjkPunctuationWidth;
  /** Two marks that meet (`。」`, `》（`, `：“`) give up the half em of
   *  blank between them, so the pair takes 1.5 em instead of 2 (clreq
   *  §6.3.2.2). `'auto'` (the default): on for the mainland and Hong
   *  Kong, off for Taiwan. */
  compressAdjacent?: 'auto' | boolean;
  /** An opening bracket or quote that starts a line gives up its leading
   *  half em, so its ink lines up with the text edge, and a closing one
   *  that ends a line its trailing half (clreq §6.3.2.3). `'auto'` (the
   *  default): on for the mainland and Hong Kong, off for Taiwan. */
  trimLineStart?: 'auto' | boolean;
  /** Whether a pause or stop mark may hang past the end of the line
   *  (clreq §6.1.3). `'none'` (the default): never. `'allow'`: one of
   *  、，。． (on the mainland also ；：？！) hangs when it would otherwise
   *  open the next line and compressing the line cannot take it in; never
   *  in horizontal Taiwan and Hong Kong text. `'force'`: such a mark hangs
   *  whenever it ends a line (but the paragraph's last). Never after or
   *  before another mark. */
  hangingPunctuation?: CjkHangingPunctuation;
  /** The space set between a Han character (or kana) and a Latin letter or
   *  a European digit next to it (`用 iPhone 拍照`), in em of the CJK
   *  text's size or any length. Default `{ value: 0.25, unit: 'em' }`; `0`
   *  turns it off. None at a line start or end, none next to a Chinese
   *  mark or inside Chinese brackets; a space the author typed there is
   *  replaced, not added to. On a justified line it grows up to ½ em
   *  before characters are spread, and shrinks down to ⅛ em when the line
   *  takes one more character. */
  latinSpacing?: Dimension;
  /** Tate-chu-yoko (縱中橫) in vertical text: a number of at most this many
   *  ASCII digits is set side by side in one upright cell (`2026年9月28日`:
   *  `9` and `28` upright, `2026` sideways). `0` turns it off; default
   *  `2`. The whole number or none of it: under `2` a three-digit number
   *  stays sideways. A number touching a Latin letter (`A4`, `mp3`) or
   *  written with a decimal point or digit grouping (`3.14`, `10,000`)
   *  stays sideways. `:tcy[…]`, `:upright[…]` and `:sideways[…]` set a
   *  run apart by hand. No effect in horizontal text. */
  uprightDigits?: 0 | 2 | 3 | 4;
  /** The character grid (字格): a type area authored in characters per line
   *  and lines per page (see {@link CjkGridConfig}). Off by default. */
  grid?: CjkGridConfig;
  /** What Markdown emphasis (`*…*`) does to Chinese characters: `'dots'`
   *  sets emphasis dots (着重号) under them, as `:dots[…]` does, and Latin
   *  letters inside the same emphasis keep their italics; `'italic'` slants
   *  them as any text (a CJK face has no italic, so the slant is
   *  synthesised). `'auto'` (the default): `'dots'` when the document
   *  language (`locale`) is Chinese, `'italic'` otherwise (#193). */
  emphasis?: 'auto' | CjkEmphasis;
  /** What a book title marked `:book[…]` prints (#193): `'brackets'` sets
   *  《》 around it (〈〉 for a title inside another), as text the lines
   *  are broken with; `'wavy'` draws the wavy book-title line (书名号甲式)
   *  under it (left of it in vertical text); `'none'` prints the bare
   *  title. `'auto'` (the default): brackets for the mainland, the wavy
   *  line for Taiwan and Hong Kong (`region`). */
  bookTitleMark?: 'auto' | CjkBookTitleMark;
  /** Colour of the emphasis dots and of the proper-name and book-title
   *  lines. Unset: the colour of the text they mark (#193). The default of
   *  the ruby and warichu colours too. */
  annotationColor?: ColorValue;
  /** Ruby: how readings (pinyin, zhuyin) set with `:ruby[…]{rt="…"}` or
   *  `{紅樓|hóng|lóu}` look (see {@link CjkRubyConfig}, #194). */
  ruby?: CjkRubyConfig;
  /** Warichu (双行夹注): how the two-row notes of `:warichu[…]` look (see
   *  {@link CjkWarichuConfig}, #195). */
  warichu?: CjkWarichuConfig;
}

/** See {@link CjkConfig.emphasis}. */
export type CjkEmphasis = 'italic' | 'dots';

/** See {@link CjkConfig.bookTitleMark}. */
export type CjkBookTitleMark = 'brackets' | 'wavy' | 'none';

/** Where a ruby reading goes: over the base (in vertical text: to its
 *  right), under it (to its left), or right of each character inside the
 *  line (zhuyin in horizontal text; the same as `over` in vertical text). */
export type CjkRubyPosition = 'over' | 'under' | 'right';

/** `cjk.ruby`: the look of ruby readings. Readings live in the line gap,
 *  whose height never changes: a paragraph with readings over or under it
 *  needs a line height of at least its size plus the reading's
 *  (`rubyExceedsLeading` reports one that is tighter). */
export interface CjkRubyConfig {
  /** Face of the readings. Unset: the text's own face. Pinyin often reads
   *  better in a sans face with a single-storey a and g. */
  fontFamily?: string;
  /** Size of the readings, in em of the text they annotate (or any
   *  length). Default `{ value: 0.5, unit: 'em' }`. Zhuyin is set at 60 %
   *  of it (0.3 em by default), as clreq asks. */
  fontSize?: Dimension;
  /** Colour of the readings. Unset: `cjk.annotationColor`, else the text
   *  colour. */
  color?: ColorValue;
  /** Where readings go when `pos` does not say (see
   *  {@link CjkRubyPosition}). `'auto'` (the default): zhuyin (bopomofo)
   *  right of each character, anything else (pinyin) over the base in
   *  horizontal text and right of it in vertical text. */
  position?: 'auto' | CjkRubyPosition;
}

/** `cjk.warichu`: the look of warichu notes (双行夹注). */
export interface CjkWarichuConfig {
  /** Size of the note's characters, in em of the text (or any length);
   *  the two rows together take the line's em. Default
   *  `{ value: 0.5, unit: 'em' }`. */
  fontSize?: Dimension;
  /** Colour of the notes and their brackets (a commentary set in
   *  vermilion). Unset: `cjk.annotationColor`, else the text colour. */
  color?: ColorValue;
  /** Brackets set at the text size before the first row and after the
   *  last one (`〔` `〕`, `（` `）`). Default: none. A note's own
   *  `open` / `close` attributes win. */
  open?: string;
  close?: string;
}

export interface ResolvedCjkRubyConfig {
  fontFamily?: string;
  fontSize: Dimension;
  color?: ColorValue;
  position: 'auto' | CjkRubyPosition;
}

export interface ResolvedCjkWarichuConfig {
  fontSize: Dimension;
  color?: ColorValue;
  open: string;
  close: string;
}

/** Punctuation width styles (clreq §6.3.2.1): each full-width mark is
 *  half a glyph and half an em of blank that may be set or removed.
 *  - `fullwidth` (全角式): every mark one em; only a pair of adjacent marks
 *    (`compressAdjacent`) and a bracket at a line edge (`trimLineStart`)
 *    lose blank;
 *  - `kaiming` (开明式): 。？！ one em (half at a line end), ，、；：,
 *    brackets and quotes half an em;
 *  - `lineEndHalf` (行末半角): one em inside the line, half at its end
 *    (GB/T 15834—2011 §5.1.10 read literally);
 *  - `halfwidth` (半角式): every mark half an em (dictionaries).
 *  Marks set in the middle of their box (Taiwan, Hong Kong: 。，、；：) lose
 *  a quarter em on each side; ？！ stay one em in horizontal Taiwan and
 *  Hong Kong text. */
export type CjkPunctuationWidth = 'fullwidth' | 'kaiming' | 'lineEndHalf' | 'halfwidth';

/** See {@link CjkConfig.hangingPunctuation}. */
export type CjkHangingPunctuation = 'none' | 'allow' | 'force';

/** The character grid of `cjk.grid`: the type area is derived from the
 *  body size, not authored as margins. Each column is `charsPerLine` ems
 *  wide and holds `linesPerPage` lines of the body's line height; with two
 *  columns the gutter is rounded to a whole number of ems (at least one).
 *  The grid is centred inside the configured margins, which act as
 *  minimums; a grid that does not fit is reduced to what fits and reported
 *  (`cjkGridClamped`). In vertical text (`layout.writingMode:
 *  'vertical-rl'`) characters run down the page and lines across it. */
export interface CjkGridConfig {
  /** Default `false`. */
  enabled?: boolean;
  /** Characters per line of one column. Unset: as many as the margins
   *  leave room for. */
  charsPerLine?: number;
  /** Lines per column. Unset: as many as the margins leave room for. */
  linesPerPage?: number;
  /** Draw the grid (稿纸) over the type area on screen. Default `false`. */
  show?: boolean;
}

export interface ResolvedCjkGridConfig {
  enabled: boolean;
  /** The characters per line in use (after the pre-pass: what the
   *  margins leave room for when unset or too many); 0 when off. */
  charsPerLine: number;
  /** The lines per column in use; 0 when off. */
  linesPerPage: number;
  show: boolean;
}

export interface ResolvedCjkConfig {
  region: CjkRegion;
  lineBreak: CjkLineBreak;
  punctuationWidth: CjkPunctuationWidth;
  compressAdjacent: boolean;
  trimLineStart: boolean;
  hangingPunctuation: CjkHangingPunctuation;
  latinSpacing: Dimension;
  uprightDigits: 0 | 2 | 3 | 4;
  grid: ResolvedCjkGridConfig;
  emphasis: CjkEmphasis;
  bookTitleMark: CjkBookTitleMark;
  annotationColor?: ColorValue;
  ruby: ResolvedCjkRubyConfig;
  warichu: ResolvedCjkWarichuConfig;
}

export type PdfColorSpace = 'rgb' | 'cmyk' | 'grayscale';

/** How postext-pdf writes the file. Layout ignores it; the VDT carries it
 *  (`doc.config.pdfGeneration`), and `renderToPdf` takes each setting from
 *  its own options first, then from here (the first document's, for a
 *  book), then from the defaults. */
export interface PdfGenerationConfig {
  /** Emit PDF outlines (bookmarks) so readers can jump between headings. */
  outlines?: boolean;
  /** When true, convert every colour in the rendered PDF to `colorSpace`. */
  forceColorSpace?: boolean;
  /** Target colour space when `forceColorSpace` is true. */
  colorSpace?: PdfColorSpace;
  /** Emit an accessible, tagged PDF (PDF/UA-1 oriented): a logical structure
   *  tree (headings, paragraphs, lists, tables, figures with alt text,
   *  formulas, links), the document language and title, and every purely
   *  decorative mark (backgrounds, rules, running headers and footers, cut
   *  marks) flagged as an artifact so assistive technology skips it.
   *  Defaults to true. */
  accessible?: boolean;
}

export interface ResolvedPdfGenerationConfig {
  outlines: boolean;
  forceColorSpace: boolean;
  colorSpace: PdfColorSpace;
  accessible: boolean;
}

export type CustomFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';
export type CustomFontStyle = 'normal' | 'italic';

export interface CustomFontVariant {
  /** CSS font-weight (100..900). */
  weight: number;
  style: CustomFontStyle;
  /** Identifier of the binary stored out-of-band (IndexedDB). */
  fileId: string;
  format: CustomFontFormat;
  /** Original filename of the uploaded binary. Shown in the sandbox UI
   *  so the user can tell variants apart at a glance. Optional for
   *  backward compatibility with configs saved before this field was
   *  introduced. */
  fileName?: string;
}

export interface CustomFontFamily {
  /** Family name — used anywhere a Google Font family name would be used. */
  name: string;
  variants: CustomFontVariant[];
  /** False when the family's files may be used to set this document but not
   *  copied out of it — a licensed typeface a bundle is allowed to show but
   *  not to hand on. Rendering and PDF embedding are unaffected; what honours
   *  the flag is whoever writes the files back out (the sandbox's bundle
   *  export drops the family's files and its `fonts[]` entry). Defaults to
   *  true. */
  redistributable?: boolean;
}

export type PageParity = 'all' | 'odd' | 'even';
export type HeaderFooterHAlign = 'left' | 'center' | 'right';

/** Classification of a laid-out page, computed after placement
 *  (`pipeline/pageRoles.ts`):
 *  - `'blank'` — parity / force-blank padding, or a page with no content;
 *  - `'part'` — a part-divider page (`partInfo` set);
 *  - `'opener'` — the first block in reading order is a heading whose level
 *    spans the page or forces a page break before it (a chapter opener);
 *  - `'body'` — everything else. */
export type PageRole = 'body' | 'opener' | 'part' | 'blank';

/** Which page roles a design element renders on. `'all'` (default) renders
 *  on every page the parity filter admits. */
export type PageRoleFilter = 'all' | PageRole;

// ---------------------------------------------------------------------------
// Unified design slot primitives — shared by header, footer, and advanced
// heading designs. Each element is placed by an anchor (container-relative
// nine-point grid or element-to-element), with optional offset and size.
// Paint order is strictly array order (first = back, last = front).
// ---------------------------------------------------------------------------

export type HAlign = 'left' | 'center' | 'right';
/** Alignment of a design text's lines: an {@link HAlign}, or `'justify'`
 *  (see `DesignTextElement.align`). */
export type DesignTextAlign = HAlign | 'justify';
export type VAlign = 'top' | 'middle' | 'bottom';

export type AnchorEdge =
  // Container-relative (nine-point grid)
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'
  // Element-to-element (requires anchor.to = '#elementId')
  | 'right-of' | 'left-of' | 'below' | 'above'
  | 'align-top' | 'align-bottom' | 'align-left' | 'align-right';

export interface ElementAnchor {
  /** `'container'` (the slot's own container), `'page'` (the trim box),
   *  `'bleed'` (the trim box expanded by `cutLines.bleed` when cut lines are
   *  enabled, otherwise the trim box) or `'#elementId'` — a reference to
   *  another element in the slot. Page/bleed anchoring also makes that frame
   *  the reference for `size: 'fill'` and auto-width clamping, so a band can
   *  run edge to edge regardless of the page margins. `'outer'` (header
   *  and footer only) is the outer margin of the page — between the type
   *  area and the trim edge on the side away from the spine, from the type
   *  area's head to its foot — on the right of a recto and the left of a
   *  verso in a left-bound book, the other way round in a right-bound one
   *  (`page.binding`), so one element serves both pages of a spread: a
   *  running head down the fore-edge. Elsewhere it reads as `'container'`. */
  to: 'container' | 'page' | 'bleed' | 'outer' | `#${string}`;
  edge: AnchorEdge;
}

export type ElementSize = 'auto' | 'fill' | Dimension;

export interface ElementPlacement {
  anchor: ElementAnchor;
  offset?: { x?: Dimension; y?: Dimension };
  size?: {
    width?: ElementSize;
    height?: ElementSize;
    /** Cap for an `'auto'` width (text elements): the element still sizes to
     *  its content, so elements anchored to it stay attached, but never
     *  grows past this — the text wraps or ellipsizes there. Lets a running
     *  head reserve room for the label that hangs off it. */
    maxWidth?: ElementSize;
  };
}

export interface ElementBoxStyle {
  backgroundColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: Dimension;
  borderRadius?: Dimension;
  padding?: { top?: Dimension; right?: Dimension; bottom?: Dimension; left?: Dimension };
}

/** What a design text does with a line wider than its room: `'wrap'` onto
 *  more lines; truncate with `…` at the end, the start or the middle; or
 *  `'clip'` to the box. `'ellipsis-end'` / `'ellipsis-start'` cut at a word
 *  boundary, and no space or joining punctuation touches the ellipsis —
 *  mid-word only when what the boundary leaves, that punctuation dropped,
 *  is less than half of what fits (a long word, a URL). A no-break space
 *  or hyphen (U+2011) is no boundary. `'ellipsis-middle'` cuts anywhere but
 *  drops the spaces beside it. */
export type TextOverflow = 'wrap' | 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip';

/** Outline drawn around the glyphs of a design text (a hollow display
 *  number, a title that stands off a photograph). */
export interface DesignTextStroke {
  /** Line width of the outline, centred on the glyph edges: half of it
   *  falls inside the letters, half outside. The measured text width does
   *  not grow with it. `0` draws no outline. */
  width: Dimension;
  /** Outline colour. Default: the text colour. */
  color?: ColorValue;
  /** Leave the inside of the letters unpainted, so only the outline shows.
   *  Default `false` (the letters are filled, then outlined). */
  hollow?: boolean;
}

export interface DesignTextElement {
  kind: 'text';
  /** Stable, unique within the slot. Anchors reference elements by `#id`. */
  id: string;
  /** Header/footer only; ignored by heading designs. */
  parity?: PageParity;
  /** Page roles this element renders on (see `PageRoleFilter`). Default
   *  `'all'`. */
  pages?: PageRoleFilter;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves in the text flow. Default `true`. Set `false` on
   *  decoration anchored to the page or the bleed — a seal at the foot, a
   *  frame, a side band — so the text keeps flowing under the heading
   *  instead of starting below the decoration. The element still paints and
   *  can still be an anchor: under the body text in an opener
   *  (`span: 'page'`); an in-column design paints with the heading block
   *  wherever it is placed above the foot of its column — in the margins,
   *  the bleed and the neighbouring columns too — and the column's foot
   *  cuts it. Ignored by header, footer and part designs, which never
   *  reserve room. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** Template with placeholders (see design/placeholders.ts). Use `{{`/`}}`
   *  for literal braces. A newline, or the two characters `\n` written in
   *  the template or in an `{attr.<key>}` value, starts a new line whatever
   *  the `overflow`. Text a placeholder copies from the document (a title,
   *  a frontmatter value) is printed as written. */
  content: string;
  fontFamily?: string;
  fontSize: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Horizontal alignment of the lines within the element's box. Default
   *  `'center'`. `'justify'` stretches the word spaces of every wrapped line
   *  but the last of each paragraph so it fills the box (the lines beside a
   *  drop cap fill the room beside it); with `hyphenate` a word that does not
   *  fit is also cut at a syllable to fill the line. A line with no space,
   *  and a text that does not wrap, is set flush left. */
  align?: DesignTextAlign;
  /** Vertical alignment within the element's box. */
  verticalAlign?: VAlign;
  /** Leading of the element's lines. A number is a multiplier of
   *  `fontSize` (default `1.2`). A {@link Dimension} is accepted too, the
   *  way every other leading of the config is written: `em` / `rem` is the
   *  same multiplier, and an absolute length (`pt`, `mm`, `px`…) is the
   *  distance between baselines. Any other value (a negative or zero
   *  number, a malformed dimension) sets the default leading. */
  lineHeight?: number | Dimension;
  letterSpacing?: Dimension;
  overflow: TextOverflow;
  /** When true, break long words at syllable boundaries while wrapping.
   *  Uses the document's active hyphenation locale. */
  hyphenate?: boolean;
  /** Letter-case transform applied to the resolved text (a part title set
   *  in capitals in the contents). Default `'none'`. */
  textTransform?: 'none' | 'uppercase';
  box?: ElementBoxStyle;
  /** Drop cap: the first letter set large beside the first `lines` lines
   *  of the text (default 2), in its own face, weight and colour (a
   *  palette-linked colour follows the part and section palettes like the
   *  rest of the design); `gap` is the space between the letter and the
   *  text. The letter stands on the baseline of the last line it spans, and
   *  `fontSize` defaults to the size that brings its top level with the
   *  capitals of the first line: the text size plus `lines − 1` line
   *  spacings, capitals taken as 0.72 of the size. A text with a drop cap
   *  wraps whatever its `overflow` (`'clip'` still cuts the lines at the
   *  edge of a box of fixed height). In a heading design the letter
   *  reserves no room below the text's last line. */
  dropCap?: {
    lines?: number;
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: Dimension;
    color?: ColorValue;
    gap?: Dimension;
  };
  /** First-line indent of every paragraph after the first. A newline in
   *  the content (or the two characters `\n`, for attribute values)
   *  separates paragraphs; consecutive newlines count as one. */
  paragraphIndent?: Dimension;
  /** Read the resolved text — placeholder values included — as inline
   *  Markdown: `**bold**`, `*italic*`, `***bold italic***` (and the
   *  underscore forms), `^superscript^` and `~subscript~`. A backslash sets
   *  the marker character itself (`\*`). Bold runs take weight 700 (the
   *  element's own weight when it is heavier); italic runs flip the
   *  element's slant; scripts are set smaller and raised or lowered, as in
   *  the body text. Default `false`: the text is set exactly as written. */
  inlineMarks?: boolean;
  /** Outline drawn around the glyphs (see `DesignTextStroke`). */
  stroke?: DesignTextStroke;
  /** `'vertical-rl'`: the text is set vertically, top to bottom, lines
   *  right to left, with the characters upright (a running head down the
   *  fore-edge of a vertical book, a vertical title beside a horizontal
   *  chapter). The element's box stays as placed on the page: its height
   *  is the length of a line, its width the lines side by side; `align`
   *  places the lines along it (`'left'` at the top), `verticalAlign` in
   *  the box across (`'top'` at the right), and `size.maxWidth` caps a
   *  line's length. In the flow of a vertical page text already runs so,
   *  and the setting changes nothing there. Default `'horizontal-tb'`. */
  writingMode?: 'horizontal-tb' | 'vertical-rl';
}

export interface DesignRuleElement {
  kind: 'rule';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** Typed as required, but a JSON configuration may leave it out:
   *  `'horizontal'`. */
  direction: 'horizontal' | 'vertical';
  /** Typed as required, but a JSON configuration may leave it out: black
   *  (`#000000`). */
  color: ColorValue;
  /** Line thickness. Typed as required, but a JSON configuration may leave
   *  it out: `0.5 pt`, the documented default (up to postext 1.4 such a
   *  rule painted nothing). */
  thickness: Dimension;
}

export interface DesignBoxElement {
  kind: 'box';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  style: ElementBoxStyle;
}

/** An image drawn from a resource (a bitmap or SVG `Resource`, e.g. a
 *  publisher logo on a title page). Sized by `placement.size`: with one of
 *  `width` / `height` left `'auto'` the other follows the image's aspect
 *  ratio; with both set the image is fitted inside the box, centred. A
 *  missing resource draws nothing. */
export interface DesignImageElement {
  kind: 'image';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** `Resource.id` of a bitmap or SVG resource. Takes the placeholders a
   *  design text's `content` takes, so a heading design can draw the
   *  picture each heading names: `resourceId: '{attr.vignette}'` with
   *  `# Chapter I {style="opener" vignette="log"}`. An id that resolves
   *  empty or to no resource draws nothing. */
  resourceId: string;
  /** A picture that is decoration only (an ornament, a band): it carries
   *  no alternative text into the output even when its resource has one.
   *  Otherwise the resource's `altText`, else its caption, becomes the
   *  picture's `alt` in HTML and a `Figure` with `/Alt` in a tagged PDF.
   *  Default `false`. */
  decorative?: boolean;
}

export type DesignElement = DesignTextElement | DesignRuleElement | DesignBoxElement | DesignImageElement;

export interface DesignSlot {
  /** Array order = paint order: first = back, last = front. */
  elements: DesignElement[];
}

// ---------------------------------------------------------------------------
// Resolved design slot — same shape with required-where-necessary fields.
// Resolution mostly normalizes defaults; geometry resolution happens at
// layout time (see design/layout.ts).
// ---------------------------------------------------------------------------

export interface ResolvedDesignTextElement extends Omit<DesignTextElement, 'fontFamily' | 'fontWeight' | 'italic' | 'color' | 'align' | 'verticalAlign' | 'lineHeight' | 'parity'> {
  parity: PageParity;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  align: DesignTextAlign;
  verticalAlign: VAlign;
  /** Leading as a multiplier of `fontSize`. When the element gives an
   *  absolute length (`lineHeightLength`), the equivalent multiplier — what
   *  an editor shows; the layout uses the length. */
  lineHeight: number;
  /** The leading as an absolute length (the element's `lineHeight` written
   *  in `pt`, `mm`, `px`…); wins over `lineHeight` at layout. Absent for a
   *  multiplier. */
  lineHeightLength?: Dimension;
}

export interface ResolvedDesignRuleElement extends Omit<DesignRuleElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignBoxElement extends Omit<DesignBoxElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignImageElement extends Omit<DesignImageElement, 'parity'> {
  parity: PageParity;
}

export type ResolvedDesignElement =
  | ResolvedDesignTextElement
  | ResolvedDesignRuleElement
  | ResolvedDesignBoxElement
  | ResolvedDesignImageElement;

export interface ResolvedDesignSlot {
  elements: ResolvedDesignElement[];
}

// ---------------------------------------------------------------------------
// Header/footer — the unified model. `HeaderFooterSlot` and friends are
// type aliases on top of the design primitives, kept for naming
// back-compat.
// ---------------------------------------------------------------------------

export type HeaderFooterElement = DesignElement;
export type HeaderFooterSlot = DesignSlot;

export type ResolvedHeaderFooterElement = ResolvedDesignElement;
export type ResolvedHeaderFooterSlot = ResolvedDesignSlot;

// ---------------------------------------------------------------------------
// Legacy header/footer types — retained solely so the migrator can
// recognize pre-migration configs and convert them to DesignSlot.
// ---------------------------------------------------------------------------

export interface LegacyHeaderFooterTextElement {
  kind: 'text';
  align: HeaderFooterHAlign;
  content: string;
  parity: PageParity;
  /** Absolute distance between the element's body-facing edge and the body
   *  edge. Elements are independent — two with the same `marginFromBody`
   *  overlap rather than stacking. In a header, gap from element bottom to
   *  body top; in a footer, gap from element top to body bottom. */
  marginFromBody?: Dimension;
  /** Horizontal inset from the aligned content edge. When `align` is
   *  `'left'`, offset from the left content edge; when `'right'`, from the
   *  right. Ignored when `align` is `'center'`. */
  marginFromEdge?: Dimension;
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
}

export interface LegacyHeaderFooterRuleElement {
  kind: 'rule';
  color: ColorValue;
  thickness: Dimension;
  width: Dimension | 'full';
  align: HeaderFooterHAlign;
  marginFromBody?: Dimension;
  marginFromEdge?: Dimension;
  parity: PageParity;
}

export type LegacyHeaderFooterElement = LegacyHeaderFooterTextElement | LegacyHeaderFooterRuleElement;

export interface LegacyHeaderFooterSlot {
  elements: LegacyHeaderFooterElement[];
}

/** @deprecated Use `DesignTextElement`. Kept as alias for legacy API exports. */
export type HeaderFooterTextElement = DesignTextElement;
/** @deprecated Use `DesignRuleElement`. */
export type HeaderFooterRuleElement = DesignRuleElement;
/** @deprecated Use `ResolvedDesignTextElement`. */
export type ResolvedHeaderFooterTextElement = ResolvedDesignTextElement;
/** @deprecated Use `ResolvedDesignRuleElement`. */
export type ResolvedHeaderFooterRuleElement = ResolvedDesignRuleElement;

// ---------------------------------------------------------------------------
// Parts — `:::part{number="…" title="…"}` dividers. A part opens a dedicated
// single-column page whose opener design is laid out against the full trim
// box; the blocks inside the fence (typically the chapter list) flow in that
// column with their own typography.
// ---------------------------------------------------------------------------

export interface PartsBreakBeforeConfig {
  /** Parity of the page the part opens on. Default `'odd'`. */
  parity?: HeadingBreakParity;
}

export interface PartsBreakAfterConfig {
  /** Whether the content after the part moves to a fresh page. Default `true`. */
  enabled?: boolean;
  /** Parity of that fresh page. Default `'any'` — the next chapter's own
   *  `breakBefore.parity` then decides whether a blank verso follows. */
  parity?: HeadingBreakParity;
}

/** Typography of the blocks inside a `:::part` container. Every field
 *  inherits `bodyText` / the list configs when unset. */
export interface PartsBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlign;
  /** Bullet colour of unordered lists inside the part. */
  bulletColor?: ColorValue;
  /** Number colour of ordered lists inside the part (numbers are set bold). */
  numberColor?: ColorValue;
  /** Partial overrides applied on top of the document's `unorderedLists`
   *  inside the part (after `bulletColor`). */
  unorderedLists?: UnorderedListsConfig;
  /** Partial overrides applied on top of the document's `orderedLists`
   *  inside the part (after `numberColor` and the bold weight). */
  orderedLists?: OrderedListsConfig;
}

export interface PartsConfig {
  /** Whether a `:::part` opens a divider page (default `true`). When
   *  `false` no page is opened and the fence's body is not set: the part's
   *  number, title and palette take effect from the next content on
   *  (running heads, palette-linked colours), with no break of their own.
   *  Typical use: `htmlViewer.overrides.parts.page: false`, a screen
   *  edition without section dividers. */
  page?: boolean;
  breakBefore?: PartsBreakBeforeConfig;
  breakAfter?: PartsBreakAfterConfig;
  /** Body area of the part page. Defaults to the page margins (`mirror`
   *  honoured). */
  margins?: PageMargins;
  /** Opener design. Its container is the page trim box, so `'page'` /
   *  `'bleed'` anchors and container anchors coincide. Purely decorative —
   *  it never reserves body space; raise `margins.top` to leave room for
   *  it. When empty, `{number} {titleText}` is synthesised from the H1
   *  typography, joined with the H1's `numberSeparator`. */
  design?: DesignSlot;
  /** Design of the blank verso that follows a part page (the back of the
   *  divider leaf). Same container and placeholders as `design`; when
   *  empty the verso stays plain. */
  versoDesign?: DesignSlot;
  bodyStyle?: PartsBodyStyleConfig;
}

export interface ResolvedPartsBreakBeforeConfig {
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBreakAfterConfig {
  enabled: boolean;
  parity: HeadingBreakParity;
}

export interface ResolvedPartsBodyStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  bulletColor: ColorValue;
  numberColor: ColorValue;
  /** Kept partial: applied on top of the resolved document lists inside parts. */
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
}

export interface ResolvedPartsConfig {
  page: boolean;
  breakBefore: ResolvedPartsBreakBeforeConfig;
  breakAfter: ResolvedPartsBreakAfterConfig;
  margins: Required<PageMargins>;
  design: ResolvedDesignSlot;
  versoDesign: ResolvedDesignSlot;
  bodyStyle: ResolvedPartsBodyStyleConfig;
}

// ---------------------------------------------------------------------------
// Heading styles — `# Title {style="…"}`. A style overrides the heading's
// level typography and design and, for the section it opens (its pages up
// to the next heading of the same or a higher level), the running heads,
// the page geometry, the body typography and the palette.
// ---------------------------------------------------------------------------

/** Typography of the body blocks in a section opened by a styled heading.
 *  Same shape as a part's body style. */
export type SectionBodyStyleConfig = PartsBodyStyleConfig;
export type ResolvedSectionBodyStyleConfig = ResolvedPartsBodyStyleConfig;

export interface HeadingStyleConfig extends Omit<HeadingLevelConfig, 'level' | 'numberingTemplate'> {
  /** Identifier referenced from `{style="…"}` on a heading line. */
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** Template the style's headings are numbered with, in place of their
   *  level's `numberingTemplate` (same tokens): `'Appendix {1:A}'` letters
   *  appendices that share the chapter counter — restart it with a
   *  `{startAt=1}` attribute on the first one. `''` prints no number while
   *  the heading still counts. Unset = the level's template. */
  numberingTemplate?: string;
  /** Whether the heading counts: advances the level's counter and the
   *  chapter ordinal (`{chapterNumber}`), and is numbered in the contents.
   *  `false` for a preface, an authors list, an index. Default `true`. */
  numbered?: boolean;
  /** Whether the heading is listed by `:::toc`. Default `true`; a heading
   *  may override it with `{toc="false"}` / `{toc="true"}`. */
  toc?: boolean;
  /** Whether the style's level-1 headings become the running chapter: the
   *  chapter that `{chapterTitle}`, `{chapterNumber}`, `{attr.<key>}`, the
   *  `…AtTop` variants and the `h1` guide words name on the heading's page
   *  and the pages after it. `false` for a plate, a map or a cover set as a
   *  level-1 heading inside a chapter: the running heads keep naming the
   *  chapter it interrupts. The heading still counts when `numbered` (its
   *  own design reads its own number) and is still listed by `:::toc` when
   *  `toc`. The style still opens a section of its own until the next
   *  level-1 heading (its running-head slots, margins, columns, body style
   *  and palette, or the document's where it sets none), as every heading
   *  style does. No effect on headings of other levels. Default `true`. */
  runningChapter?: boolean;
  /** Running heads of the section's pages, replacing the document's
   *  `header` / `footer` there (element `pages` / `parity` filters still
   *  apply). Unset = the document's own. */
  header?: HeaderFooterSlot;
  footer?: HeaderFooterSlot;
  /** Body area of the section's pages. Each side inherits the page margin
   *  when unset. Takes effect on the pages the section opens, so pair it
   *  with `breakBefore`. */
  margins?: PageMargins;
  /** Column layout of the section's pages (a single wide column for a
   *  preface set in a two-column book). Set, it replaces the document's
   *  `layout`: each field it leaves out takes the static default, except
   *  `columnRule`, whose unset fields (`enabled`, `color`, `lineWidth`)
   *  come from the document's `layout.columnRule` (since postext 1.5).
   *  Only its page geometry is read from it (`layoutType`, `gutterWidth`,
   *  the side column, `columnRule`), plus its `fitFiguresToPage` when a
   *  figure could move from an empty column cut short to a whole one;
   *  `inlineResourceGap`, `inlineResourceGapInBoxes`,
   *  `boxChildSplitMinLines` and `hugClosingFloats` stay the document's,
   *  and so does the `fitFiguresToPage` that shrinks figures.
   *  Unset, the section uses the document's `layout`. */
  layout?: LayoutConfig;
  /** Typography of the body blocks in the section. */
  bodyStyle?: SectionBodyStyleConfig;
  /** Palette overrides (palette id → hex) for the section's pages, applied
   *  like a part's `palette` attribute and on top of it. Not only the design
   *  slots of those pages (running heads, the opener: every colour linked
   *  to an overridden id) follow them, but the text flow too, as under a
   *  part: every flow colour equal to the base value of an overridden entry
   *  — headings, bold, italic and reference colours, bullets and list
   *  numbers, captions and caption bars, table text, rules and fills
   *  (header, body, zebra rows, a cell's own fill), callout boxes
   *  (background, border, stripe, title) and chips (fill, outline, text) —
   *  takes the section's value. Inline swatches keep theirs. Where two
   *  entries share a base value and the section gives them different
   *  values, each flow colour takes the value its own settings link to: a
   *  block's text, bold, italic, reference, marker and separator colours
   *  apart, each heading level and heading style, each part of each
   *  callout frame, each colour of each table, chip and caption style.
   *  Settings in different places that set the same colour of a block
   *  (`bodyText.color` and a callout style's `body.color`) are still told
   *  apart by value only; see the configuration docs. */
  palette?: Record<string, string>;
}

/** The level fields a heading style may override, resolved. `breakBefore`
 *  here is the style's break resolved on its own (unset fields as for a
 *  level without a break), kept for compatibility: headings merge
 *  {@link ResolvedHeadingStyleConfig.breakBefore} over their level's break
 *  instead. */
export type ResolvedHeadingStyleOverrides = Partial<Omit<ResolvedHeadingLevelConfig, 'level' | 'numberingTemplate'>>;

export interface ResolvedHeadingStyleConfig {
  id: string;
  name: string;
  numbered: boolean;
  toc: boolean;
  /** See {@link HeadingStyleConfig.runningChapter}. */
  runningChapter: boolean;
  /** Level fields the style sets; merged over the heading's level config. */
  overrides: ResolvedHeadingStyleOverrides;
  /** The `breakBefore` fields the style sets, as written: merged field by
   *  field over the break of the heading's level, so a style that only
   *  sets `parity` keeps the level's `enabled`. Unset = the level's. */
  breakBefore?: HeadingBreakBeforeConfig;
  /** The style's own numbering template (see
   *  {@link HeadingStyleConfig.numberingTemplate}); unset = the level's. */
  numberingTemplate?: string;
  header?: ResolvedDesignSlot;
  footer?: ResolvedDesignSlot;
  margins?: Required<PageMargins>;
  layout?: ResolvedLayoutConfig;
  bodyStyle?: ResolvedSectionBodyStyleConfig;
  palette: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Table of contents — what `:::toc` prints.
// ---------------------------------------------------------------------------

/** Typography of one kind of contents entry. Every field inherits the body
 *  text (or the `toc`-wide value) when unset. */
export interface TocEntryStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  /** Leading of the entry's lines (title and subtitle alike). Defaults to
   *  the body line height so the contents sit on the baseline grid. */
  lineHeight?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Left indent of the whole entry. Default `0`. */
  indent?: Dimension;
  /** Width of the number column: the title starts after it plus
   *  `numberGap`; numbers are right-aligned in it, on the baseline of the
   *  title's first line whatever their face and size. Default `2em`. */
  numberWidth?: Dimension;
  /** Gap between the number column and the title. Default `0.5em`. */
  numberGap?: Dimension;
  numberFontFamily?: string;
  numberFontSize?: Dimension;
  numberFontWeight?: number;
  numberColor?: ColorValue;
  /** Space above / below the entry (subtitle included). Default `0`. */
  marginTop?: Dimension;
  marginBottom?: Dimension;
}

export interface TocLevelConfig extends TocEntryStyleConfig {
  /** Heading level (1–6). */
  level: number;
}

export interface TocConfig {
  /** Heading levels listed, each with its entry typography. Default: level
   *  1 only. */
  levels?: TocLevelConfig[];
  /** Entry typography of headings whose style has `numbered: false`
   *  (a preface). They print no number and start flush at the level's
   *  `indent`. Inherits the level's style. */
  unnumbered?: TocEntryStyleConfig;
  /** The page number at the right edge of an entry. */
  pageNumber?: {
    fontFamily?: string;
    fontSize?: Dimension;
    fontWeight?: number;
    italic?: boolean;
    color?: ColorValue;
    /** Width reserved for the number at the right edge. Default `2em`. */
    width?: Dimension;
  };
  /** Leader between the title and the page number. */
  leader?: {
    /** Default `true`. */
    enabled?: boolean;
    /** Repeated across the gap, right-aligned so dots line up. Default `'.'`;
     *  `'. '` spaces them out. The run holds as many as fit when measured
     *  whole, so a face that kerns the character against itself gets fewer. */
    char?: string;
    /** Minimum gap between the title and the leader / page number. Default
     *  `0.5em`. */
    gap?: Dimension;
  };
  /** A second line under the entry taken from a heading attribute — the
   *  chapter authors (`{author="…"}`). Absent when unset. */
  subtitle?: {
    /** Attribute name, e.g. `'author'`. Default `'author'`. */
    attr?: string;
    /** Default `false`. */
    enabled?: boolean;
    fontFamily?: string;
    fontSize?: Dimension;
    fontWeight?: number;
    italic?: boolean;
    color?: ColorValue;
    /** Extra indent beyond the title's. Default `0`. */
    indent?: Dimension;
  };
  /** Part dividers get a row of their own. */
  parts?: {
    /** Default `true`. */
    enabled?: boolean;
    /** Open a fresh page before every part row but the first, so each
     *  part's chapters are listed on a page of their own. Default `false`. */
    breakBefore?: boolean;
    /** Row design; its container is the row (column width × `height`).
     *  Placeholders: `{number}`, `{numberRoman}`…, `{titleText}` and
     *  `{pageNumber}` (the part page's label). Palette-linked colours take
     *  the part's own palette. When empty, `{number} {titleText}` (joined
     *  with the H1's `numberSeparator`) and the page number are set in the
     *  level-1 entry typography. */
    design?: DesignSlot;
    /** Row height; `em` is the body text size. Default `2em`, twice the
     *  body size (a row one or two body lines tall, depending on the
     *  leading). */
    height?: Dimension;
    marginTop?: Dimension;
    marginBottom?: Dimension;
  };
}

export interface ResolvedTocEntryStyleConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  indent: Dimension;
  numberWidth: Dimension;
  numberGap: Dimension;
  numberFontFamily: string;
  numberFontSize: Dimension;
  numberFontWeight: number;
  numberColor: ColorValue;
  marginTop: Dimension;
  marginBottom: Dimension;
}

export interface ResolvedTocLevelConfig extends ResolvedTocEntryStyleConfig {
  level: number;
}

export interface ResolvedTocConfig {
  levels: ResolvedTocLevelConfig[];
  /** Overrides applied on top of the level's entry style for unnumbered headings. */
  unnumbered: Partial<ResolvedTocEntryStyleConfig>;
  pageNumber: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    width: Dimension;
  };
  leader: { enabled: boolean; char: string; gap: Dimension };
  subtitle: {
    enabled: boolean;
    attr: string;
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    indent: Dimension;
  };
  parts: {
    enabled: boolean;
    breakBefore: boolean;
    design: ResolvedDesignSlot;
    height: Dimension;
    marginTop: Dimension;
    marginBottom: Dimension;
  };
}

// ---------------------------------------------------------------------------
// Back-of-book index — what `:::index` prints (#165).
// ---------------------------------------------------------------------------

/** The letter heads of an index: the first letter of each group of
 *  entries, set above them. */
export interface IndexGroupsConfig {
  /** Print a letter head above each group. Default `true`. */
  enabled?: boolean;
  fontFamily?: string;
  fontSize?: Dimension;
  /** Default `700`. */
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Space above each group (letter head or not), except at the top of a
   *  column. Default one body line. */
  marginTop?: Dimension;
  /** Head of the entries that start with a symbol. Default `Symbols` /
   *  `Símbolos` in the document language. */
  symbolsLabel?: string;
  /** Head of the entries that start with a digit. Default `0–9`. */
  numbersLabel?: string;
}

export interface IndexConfig {
  /** Entry typography; every field inherits the body text when unset. */
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  fontWeight?: number;
  color?: ColorValue;
  /** Indent of each sub-entry level. Default `1em`. */
  indent?: Dimension;
  /** Extra indent of an entry's wrapped lines (turnover lines), beyond its
   *  deepest level. Default `2em`. */
  turnoverIndent?: Dimension;
  /** Space above each main entry. Default `0`. */
  entrySpacing?: Dimension;
  /** Between the term and its first page number. Default `', '`. */
  separator?: string;
  /** Between two page numbers. Default `', '`. */
  locatorSeparator?: string;
  /** Between the ends of a page range. Default `'–'` (en dash). */
  rangeSeparator?: string;
  /** Join consecutive pages into a range (`12, 13, 14` → `12–14`).
   *  Default `true`. */
  mergeRanges?: boolean;
  /** How the second number of a range is written: `'full'` (`234–237`)
   *  or `'chicago'` (`234–37`, *The Chicago Manual of Style* 9.64).
   *  Default `'full'`. */
  rangeFormat?: 'full' | 'chicago';
  /** Style of the principal page number (`main` on a mark). Default
   *  bold. */
  main?: { bold?: boolean; italic?: boolean };
  /** Cross-references. The labels default to `See` / `See also` (Spanish
   *  `Véase` / `Véase también`), in italics. */
  see?: { label?: string; alsoLabel?: string; italic?: boolean };
  /** Language whose alphabetical order sorts the entries (a BCP 47 tag).
   *  Default: the document language. */
  locale?: string;
  /** What the group heads are (#182):
   *  - `'letter'`: the first letter of the sort key (up to postext 1.8 the
   *    only grouping);
   *  - `'pinyin'`: an entry starting with a Han character files under the
   *    Latin initial of its pinyin reading (A–Z; 贾宝玉 under J), a Latin
   *    sort key under its letter, after the Han entries (`sort="jia mu"`
   *    ends J); a Han key read as wanted sorts in place (`sort="崇阳"`
   *    for 重阳);
   *  - `'stroke'`: under the stroke count of its first character (一畫,
   *    二畫 …; 一画 … in Simplified Chinese);
   *  - `'none'`: no heads; symbols, numbers and words are set apart by the
   *    groups' `marginTop` only;
   *  - `'auto'` (default): `'pinyin'` in Simplified Chinese (`zh`,
   *    `zh-Hans`, `zh-CN`), `'stroke'` in Traditional Chinese (`zh-Hant`,
   *    `zh-TW`, `zh-HK`), `'letter'` in any other language.
   *
   *  The entries sort in the collation the heads come from (a
   *  `zh-Hant` index grouped by pinyin sorts by pinyin). A browser without
   *  Chinese collation data sets a pinyin or stroke index with no heads. */
  groupBy?: IndexGroupBy;
  groups?: IndexGroupsConfig;
}

/** See {@link IndexConfig.groupBy}. */
export type IndexGroupBy = 'auto' | 'letter' | 'pinyin' | 'stroke' | 'none';

export interface ResolvedIndexConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontWeight: number;
  color: ColorValue;
  indent: Dimension;
  turnoverIndent: Dimension;
  entrySpacing: Dimension;
  separator: string;
  locatorSeparator: string;
  rangeSeparator: string;
  mergeRanges: boolean;
  rangeFormat: 'full' | 'chicago';
  main: { bold: boolean; italic: boolean };
  /** Unset labels follow the document language. */
  see: { label?: string; alsoLabel?: string; italic: boolean };
  locale?: string;
  groupBy: IndexGroupBy;
  groups: {
    enabled: boolean;
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    marginTop: Dimension;
    symbolsLabel?: string;
    numbersLabel?: string;
  };
}

export interface PostextConfig {
  page?: PageConfig;
  layout?: LayoutConfig;
  bodyText?: BodyTextConfig;
  headings?: HeadingsConfig;
  /** Styling for embedded table resources. */
  tableStyle?: TableStyleConfig;
  /** Named table styles a table resource selects with `table.styleId`;
   *  unset fields inherit {@link tableStyle}. Tables without a (known)
   *  style id keep `tableStyle`. */
  tableStyles?: NamedTableStyleConfig[];
  /** Styling for resource captions (numbered label + description). */
  captionStyle?: CaptionStyleConfig;
  /** Styling for embedded SVG diagrams (single-ink reproduction). */
  diagramStyle?: DiagramStyleConfig;
  /** Named paragraph styles for `:::paragraphs{style="…"}` containers. */
  paragraphStyles?: ParagraphStyleConfig[];
  /** Named callout styles for `:::callout{type="…"}` containers. Defaults
   *  to a single neutral `note` style when unset. */
  calloutStyles?: CalloutStyleConfig[];
  /** Named chip styles for the inline `:chip[text]{style="…"}`. Defaults
   *  to a single `chip` style when unset. */
  chipStyles?: ChipStyleConfig[];
  /** Part dividers (`:::part` containers): page breaks, body area,
   *  opener design and body typography. */
  parts?: PartsConfig;
  /** Named heading styles applied with `# Title {style="…"}`: a front
   *  matter chapter, an unnumbered appendix, a preface with its own running
   *  heads and page geometry. */
  headingStyles?: HeadingStyleConfig[];
  /** The table of contents a `:::toc` directive prints. */
  toc?: TocConfig;
  /** The back-of-book index a `:::index` directive prints from the
   *  document's `:index` marks. */
  index?: IndexConfig;
  unorderedLists?: UnorderedListsConfig;
  orderedLists?: OrderedListsConfig;
  math?: MathConfig;
  /** Footnotes (`[^id]` markers and `[^id]: …` definitions). */
  footnotes?: FootnotesConfig;
  /** East Asian typography: line breaking and justification of Chinese,
   *  Japanese and Korean text (see {@link CjkConfig}). */
  cjk?: CjkConfig;
  header?: HeaderFooterSlot;
  footer?: HeaderFooterSlot;

  /** Document language, a BCP 47 tag (see {@link LocaleTag}). The fallback
   *  hyphenation locale when `bodyText.hyphenation.locale` is not explicitly
   *  set, the language of the table continuation strings
   *  (`tableStyle.continuedSuffix` / `continuesMarker`) when those are not
   *  set, and of the built-in resource types (Figure / Table) when
   *  {@link resourceTypes} is not set. Built-in strings exist for the
   *  bundled hyphenation languages; any other language gets the English
   *  ones. Defaults to `'en-us'`. */
  locale?: LocaleTag;

  debug?: DebugConfig;

  htmlViewer?: HtmlViewerConfig;

  pdfGeneration?: PdfGenerationConfig;

  colorPalette?: ColorPaletteEntry[];

  /** User-provided font families. Referenced the same way as Google Fonts:
   *  set `bodyText.fontFamily` (or any other font-family field) to the
   *  family's `name`. Custom fonts take precedence over a same-named
   *  Google Font. Binary data is stored out-of-band (IndexedDB in the
   *  sandbox) and referenced by `fileId`. */
  customFonts?: CustomFontFamily[];

  /** User-definable resource categories (figures, tables, etc.) that drive
   *  typed numbering, caption prefixes, and inline references. Defaults to
   *  the built-in 'figure' and 'table' types when unset, localised to the
   *  document language (`defaultResourceTypes(locale)`, where the language is
   *  {@link locale}, else `bodyText.hyphenation.locale`, else English). */
  resourceTypes?: ResourceType[];
}
