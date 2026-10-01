import type {
  ColorPaletteEntry,
  DocumentMetadata,
  PostextResource,
  Resource,
  TableCellAlign,
  TableCellVerticalAlign,
  ResolvedPageConfig,
  ResolvedLayoutConfig,
  ResolvedBodyTextConfig,
  ResolvedHeadingsConfig,
  ResolvedTableStyleConfig,
  ResolvedNamedTableStyleConfig,
  TableRules,
  ResolvedCaptionStyleConfig,
  ResolvedDiagramStyleConfig,
  ResolvedParagraphStyleConfig,
  ResolvedCalloutStyleConfig,
  ResolvedChipStyleConfig,
  CalloutSpan,
  CalloutPlacement,
  ResolvedUnorderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedMathConfig,
  ResolvedPdfGenerationConfig,
  ResolvedDesignSlot,
  ResolvedPartsConfig,
  ResolvedHeadingStyleConfig,
  ResolvedTocConfig,
  ResolvedIndexConfig,
  ResolvedFootnotesConfig,
  ResolvedCrossRefsConfig,
  ResolvedCjkConfig,
  CjkRegion,
  PageRole,
  PartState,
  PostextConfig,
} from './types';
import type { NumeralStyle } from './numbering';
import type { MathRender } from './math/types';

// ---------------------------------------------------------------------------
// Bounding box — all values in px, relative to page origin
// ---------------------------------------------------------------------------

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Resolved config aggregate (all sub-configs fully resolved to non-optional)
// ---------------------------------------------------------------------------

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
  paragraphStyles: ResolvedParagraphStyleConfig[];
  calloutStyles: ResolvedCalloutStyleConfig[];
  /** Named chip styles (`:chip[…]{style="…"}`). */
  chipStyles: ResolvedChipStyleConfig[];
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
  /** East Asian typography (`cjk`), with `'auto'` resolved from the
   *  document language. */
  cjk: ResolvedCjkConfig;
  /** The document language (`PostextConfig.locale`) when the config sets
   *  one; `resolvedLocale()` falls back to the hyphenation locale. Spelled-
   *  out heading numbers follow it. */
  locale?: PostextConfig['locale'];
  /** The document's colour palette, kept so per-resource-type caption
   *  overrides (`ResourceType.captionStyle`) can resolve palette colours at
   *  layout time. Absent when the config defines no palette. */
  colorPalette?: ColorPaletteEntry[];
  /** The PDF settings (`PostextConfig.pdfGeneration`), resolved, when the
   *  config sets any. Layout ignores them; `renderToPdf` in postext-pdf
   *  reads them for each setting its own options leave out. */
  pdfGeneration?: ResolvedPdfGenerationConfig;
}

// ---------------------------------------------------------------------------
// VDT node types
// ---------------------------------------------------------------------------

export type VDTBlockType =
  | 'paragraph'
  | 'heading'
  | 'resource'
  | 'blockquote'
  | 'listItem'
  | 'footnoteRef'
  | 'mathDisplay'
  | 'callout';

export type TextAlign = 'left' | 'justify' | 'center' | 'right';

/** One run of a chip's text: its own font (bold / italic / script, at the
 *  chip size) and advance. */
export interface VDTChipRun {
  text: string;
  fontString: string;
  width: number;
  bold?: boolean;
  italic?: boolean;
  /** Script offset off the baseline (px, positive down). */
  baselineShift?: number;
  /** The first of a subscript and a superscript set over each other, as
   *  on {@link VDTLineSegment.stacked}. */
  stacked?: boolean;
}

/** A laid-out inline chip (`:chip[…]`): a box drawn from
 *  `x + marginLeft` (the segment's left edge `x`), `boxWidth` wide, from
 *  `ascent` above the baseline to `descent` below it, with the text runs
 *  set on the line's baseline after the border and `paddingX`. The
 *  segment's width is `marginLeft + boxWidth + marginRight`. */
export interface VDTChip {
  /** The chip style's id. */
  styleId: string;
  runs: VDTChipRun[];
  /** Room kept before / after the box (the style's `gap` beyond an
   *  adjacent word space); zero at a line edge. */
  marginLeft: number;
  marginRight: number;
  boxWidth: number;
  /** Box extent above / below the baseline, padding and border included. */
  ascent: number;
  descent: number;
  paddingX: number;
  borderWidth: number;
  /** Corner radius, already clamped to half the box. */
  borderRadius: number;
  /** Fill / outline (hex); absent when not painted. */
  background?: string;
  borderColor?: string;
  /** Text colour (hex); absent to paint the runs in the surrounding text
   *  colour (bold / italic colours included). */
  color?: string;
}

export interface VDTLineSegment {
  kind: 'text' | 'space' | 'math' | 'swatch' | 'chip';
  text: string;
  width: number;
  bold?: boolean;
  italic?: boolean;
  /** Target of the Markdown link (`[text](url)`) this segment is part of:
   *  an `http:`, `https:`, `mailto:`, `tel:` or `ftp:` URL, or a relative
   *  one. The HTML backend wraps the linked words in an `<a>`, the PDF
   *  backend adds a URI link annotation (absolute URLs only); the canvas
   *  paints them as plain text. A word glued to the link text (its closing
   *  full stop) shares the link. */
  href?: string;
  /** Present when `kind === 'math'`. The rendered formula. */
  mathRender?: MathRender;
  /** Present when `kind === 'swatch'`: an inline colour swatch (`:swatch{…}`),
   *  a square of `width` px filled with `color` (a hex; absent when the
   *  colour did not resolve — the square is then an empty outline), sitting
   *  on the baseline and outlined in the text colour. */
  swatch?: { color?: string };
  /** Present when `kind === 'chip'`: an inline chip (`:chip[…]`), painted
   *  as a box with its own text runs. The segment's `text` is the one-char
   *  plain-text placeholder; the words live in `chip.runs`. */
  chip?: VDTChip;
  /** Present when this segment renders an inline `:ref{…}` to a resource.
   *  Renderers recolour it (link colour) and the PDF backend emits a link
   *  annotation to the resource's named destination. */
  refResourceId?: string;
  /** Set when the reference names an anchor (a heading's `{#id}`, an inline
   *  anchor, a container, #262): `refResourceId` holds the anchor's id and
   *  a link jumps to {@link VDTDocument.anchors}' entry for it. */
  refAnchor?: true;
  /** For a reference to an anchor: the book page index (the documents'
   *  `pageIndexOffset` counted in) the anchor landed on, when known — a host
   *  showing one chapter goes there when the anchor is in another. */
  refPageIndex?: number;
  /** Physical book page index this segment links to: a page number of an
   *  expanded `:::index`. The PDF backend makes it a link to that page (when
   *  the page is in the document), as it does a contents row. */
  pageLink?: number;
  /** Present when this segment is a footnote marker (`[^id]`): the note's
   *  id. The layout sets the note at the foot of the column holding the
   *  line; the PDF backend links the marker to it. */
  footnoteId?: string;
  /** Set on the second and later segments of one `:ref` painted as several
   *  runs (a label in small capitals: one run per case). Such a segment
   *  continues the previous one's reference: it takes no plain-text char of
   *  its own, and renderers extend that segment's link (one anchor, one
   *  annotation, one `Link` element) instead of opening another. */
  refContinues?: boolean;
  /** True when this segment is part of a caption's numbered label, so renderers
   *  paint it in the configured caption-label colour. */
  captionLabel?: boolean;
  /** Font of this segment when it differs from the block's (a contents
   *  entry's page number, leader or subtitle). Renderers paint the segment
   *  with it instead of the block font the bold / italic flags would pick. */
  fontString?: string;
  /** Colour of this segment when it differs from the block's. */
  color?: string;
  /** Superscript / subscript segment (`^…^` / `~…~`): `fontString` carries
   *  the reduced size and `baselineShift` the offset (px, positive down)
   *  renderers add to the line's baseline. */
  script?: 'sup' | 'sub';
  baselineShift?: number;
  /** Set on the first of a subscript and a superscript that touch
   *  (`T~0~^2^`, `T^2^~0~`), which are set one over the other: this segment
   *  advances nothing (`width` 0) and the next one is painted at the same
   *  x, its `width` the pair's advance (the wider of the two). A renderer
   *  that paints segments one after another by their widths sets them
   *  stacked as it is; one that flows text (HTML inline runs) gives this
   *  segment a box that takes no room. */
  stacked?: boolean;
  /** Tracking of this segment alone, px added after every grapheme of its
   *  text and already counted in `width`: the inter-character spacing of a
   *  justified CJK line (see `measure/cjkCompose.ts`). Renderers paint the
   *  segment with it on top of the block's and the line's tracking; a
   *  segment carrying it is never painted with the rest of its line in one
   *  run. Absent on lines that are not CJK. */
  tracking?: number;
  /** Paint-only shift of the segment's glyphs, px. Set on a full-width CJK
   *  mark that gave up blank (see `cjk.punctuationWidth`): its `width` is
   *  narrower than its glyph's advance, so it is always painted on its own,
   *  at `x + inkOffset`. A mark that gave up the blank before its glyph (an
   *  opening bracket at a line start, one compressed after another mark)
   *  is painted that far before its box (negative), so its ink stays inside
   *  `width`; one that gave up only the blank after its glyph has 0. Also
   *  set on a mark Latin text shares with Chinese (“ ” ‘ ’ … — ·) whose
   *  glyph is narrower or wider than the Chinese box it takes in Chinese
   *  text: where its glyph starts in the box (an opening quote at the
   *  box's end, an ellipsis centred), less any blank given up before it —
   *  positive or negative. The layout never reads it. Absent on every other
   *  segment. */
  inkOffset?: number;
  /** Paint-only horizontal scale of the segment's glyph, from `x +
   *  inkOffset`. Set on each dash of a 破折号 (——) in Chinese text whose
   *  glyphs do not fill their two ems (Noto Serif SC's em dash is a
   *  proportional 0.8 em stroke): each dash is stretched over its em, the
   *  two overlapping at the join, so the pair prints as one unbroken
   *  two-em rule. Renderers paint the glyph at its own advance times this
   *  factor; its `width` is unchanged. Down a vertical line the dash is
   *  painted turned with the page's frame (sideways), not in its vertical
   *  form, so the stretch runs down the column; there it is set even when
   *  it is 1. Absent on every other segment. */
  inkScale?: number;
  /** A pause or stop mark hung past the end of its line
   *  (`cjk.hangingPunctuation`): the line's measure and `bbox.width` leave
   *  it out, and the column clip is widened to show it. Painted after the
   *  segment before it like any other. */
  hangs?: boolean;
  /** A space between a Han character and a Latin letter or digit
   *  (`cjk.latinSpacing`), `kind: 'space'`: its `width` is final (the
   *  composer spread or compressed it), and renderers justifying the line's
   *  word spaces leave it as it is. Its `text` is empty, or the space the
   *  author typed there (which it replaces). Also set, with empty `text`,
   *  on the gap a justified CJK line leaves after a ruby base of several
   *  characters (#194): the base is painted at its natural spacing, so the
   *  gap cannot be its `tracking`. */
  autospace?: boolean;
  /** Vertical text: the segment is one tate-chu-yoko cell set by
   *  `:tcy[…]`: its characters side by side in one upright cell, `width`
   *  one em (and the segment's `tracking`, after the cell), squeezed
   *  across when their natural width exceeds the em. Short numbers set in
   *  one cell by `cjk.uprightDigits` carry no flag: the renderers find
   *  them as the measurer does (`verticalRuns`). Absent elsewhere. */
  tcy?: true;
  /** Vertical text: the author's orientation for the segment's text
   *  (`:upright[…]`: every character upright in a one-em cell;
   *  `:sideways[…]`: the whole text turned with the line, at its
   *  horizontal width). Absent elsewhere. */
  orientation?: 'upright' | 'sideways';
  /** The Chinese marks on this segment's text (`:dots`, `:name`, `:book`,
   *  #193): the layout draws them as `VDTLine.marks`; renderers only read
   *  this to give the text its meaning (HTML wraps dotted text in `<em>`).
   *  Absent on unmarked text. */
  cjkMarks?: VDTSegmentMarks;
  /** The segment is a ruby base (#194): its `text` is the base, painted at
   *  `x + inkOffset` when the reading is wider than it, and the reading's
   *  runs follow. Absent otherwise. */
  ruby?: VDTRuby;
  /** The segment is the part of a warichu note (双行夹注, #195) set on this
   *  line: its `text` is the upper row then the lower one (so the plain
   *  text, search and the source map read the note once, in order), and
   *  renderers paint the two rows (`runs`) instead of `text`. Its `width`
   *  is the wider row's advance. Absent otherwise. */
  warichu?: VDTWarichu;
  /** Characters the layout added (the 《》 of `cjk.bookTitleMark:
   *  'brackets'`, the brackets of a warichu note): painted, and read in
   *  copied text, but no character of the plain text or the source. */
  inserted?: boolean;
}

/** The marks of a segment (see {@link VDTLineSegment.cjkMarks}). */
export interface VDTSegmentMarks {
  /** Emphasis dots on each character but punctuation and spaces, on the
   *  side given (in the flow frame: `under` is the left of vertical text,
   *  `over` its right). */
  dots?: { style: 'dot' | 'circle' | 'sesame'; fill: 'filled' | 'open'; position: 'over' | 'under' };
  /** The proper-name run the text belongs to (a straight line under it). */
  properName?: number;
  /** The book-title run the text belongs to (a wavy line under it, when
   *  `cjk.bookTitleMark` is `'wavy'`). */
  bookTitle?: number;
}

/** Text an annotation paints (a ruby reading, a zhuyin symbol, a row of a
 *  warichu note), placed from its segment: `dx` px along the line from
 *  where the segment starts, `dy` px from the line's baseline to the run's
 *  baseline, across the line (positive: towards the line's foot — down in
 *  horizontal text, left in vertical text; both in the flow frame). A run
 *  of a vertical line is painted as vertical text (cells upright, Latin
 *  sideways). */
export interface VDTAnnotationRun {
  text: string;
  dx: number;
  dy: number;
  fontString: string;
  /** Colour (hex); unset: the annotation's. */
  color?: string;
  /** On a vertical line, every character of the run stands upright in a
   *  cell one em of its font long, from `dx`, centred across the line on
   *  `dy` less the font's central axis — the zhuyin tone marks and the
   *  neutral-tone dot, which Unicode would turn sideways (UAX #50 `R`).
   *  Ignored on a horizontal line. */
  upright?: true;
}

/** A ruby base's reading (see {@link VDTLineSegment.ruby}). */
export interface VDTRuby {
  /** The reading. */
  text: string;
  /** Its font (CSS shorthand at the ruby size). */
  fontString: string;
  /** Advance of the base text and of the reading, px. */
  baseWidth: number;
  rtWidth: number;
  /** `over` / `under` the base in the flow frame (over is the right side
   *  of vertical text), or `right`: beside each character inside the line
   *  (zhuyin in horizontal text). */
  position: 'over' | 'under' | 'right';
  /** Group ruby: one reading over the whole base. */
  group?: boolean;
  /** Colour of the reading (hex); unset: the text colour. */
  color?: string;
  /** What is painted: the reading, or its zhuyin symbols one by one. */
  runs: VDTAnnotationRun[];
}

/** One line's part of a warichu note (see {@link VDTLineSegment.warichu}). */
export interface VDTWarichu {
  /** The rows' text: `upper` is read first (in vertical text, the right
   *  one). */
  upper: string;
  lower: string;
  /** The note's font (CSS shorthand at the note size). */
  fontString: string;
  /** Baselines of the rows, px from the line's baseline (flow frame). */
  upperDy: number;
  lowerDy: number;
  /** Colour of the note (hex); unset: the text colour. */
  color?: string;
  /** What is painted: each row in runs of one style. */
  runs: VDTAnnotationRun[];
}

/**
 * A mark the layout set on a line (#193): an emphasis dot, circle or sesame
 * on one character, or the proper-name or wavy book-title line under a run.
 * Geometry is in the flow frame, relative to the line: `x` px along the
 * line from `VDTLine.bbox.x` (where the painted text starts: alignment and
 * justified word spaces included), `y` px from the line's baseline across
 * it (positive: towards the line's foot, the left of vertical text).
 */
export interface VDTLineMark {
  kind: 'dot' | 'circle' | 'sesame' | 'line' | 'wavy';
  /** A dot's centre; a line's start. */
  x: number;
  y: number;
  /** A dot's diameter (a sesame's length). */
  size?: number;
  /** A line's length along the line. */
  length?: number;
  /** Stroke width: a line, a wave, an open dot's outline. */
  thickness: number;
  /** A dot drawn as an outline (`circle`, or `fill="open"`). */
  open?: boolean;
  /** A wave's height, crest to trough, and its period. */
  amplitude?: number;
  wavelength?: number;
  /** Colour (hex); unset: the colour of the block's text. */
  color?: string;
}

/** A located anchor (see {@link VDTDocument.anchors}). */
export interface VDTAnchor {
  /** The identifier (`{#id}`). */
  id: string;
  /** `'heading'`: a heading's `{#id}`; `'anchor'`: an anchor set in the
   *  text or on a container. */
  kind: 'heading' | 'anchor';
  /** Index of its page in `pages`. */
  pageIndex: number;
  /** Top-left of the heading block, or of the line holding the anchor, in
   *  page px. */
  x: number;
  y: number;
  /** Source offset of an inline anchor's mark in the markdown body (front
   *  matter excluded). */
  sourceStart?: number;
}

export interface VDTLine {
  text: string;
  /** Where the line sits and its natural width: the sum of its segments'
   *  widths, spaces at their measured width. A justified line (not the last
   *  of its paragraph, not {@link ragged}, with a word space) is painted
   *  wider: its spaces take the slack (see {@link justifiedSpaceRatio}), so
   *  its text runs from `bbox.x` to the right edge of its block,
   *  `block.bbox.x + block.bbox.width`. So does a last line wider than that
   *  edge, whose spaces are narrowed to fit. An overlay or a hit test on the
   *  painted text widens or narrows such a line to that edge. A justified
   *  CJK line is set to the measure in its segments (their `tracking`, its
   *  word spaces at their final width), so its `width` is the measure. A
   *  mark hung past the line's end (a segment flagged `hangs`) is left out
   *  of `width`. */
  bbox: BoundingBox;
  baseline: number;
  /** The line ends inside a word, or at least not at a space. Mostly the
   *  break added the hyphen it ends with: a dictionary syllable, a soft
   *  hyphen typed in the text, a word divided for being wider than the
   *  line. It is also set where the break adds nothing: after a hyphen the
   *  word carries ({@link hardHyphen}; on the breaker that sets words run by
   *  run, and on Knuth–Plass for ragged text), after an em or en dash set
   *  closed between words (`bodyText.breakAfterDashes`, on every breaker but
   *  pretext's first-fit one; no `hardHyphen`, the line ends on the dash),
   *  at a URL joint. A break next to a CJK character (between ideographs,
   *  before a Latin word in Chinese text) adds nothing and leaves it false,
   *  so the column-end hyphen rules never retry it. Pretext's first-fit breaker (a
   *  heading, a paragraph set line by line without formatting) leaves it
   *  false after a hyphen or a dash of the text. Whether a final `-` is the
   *  text's own is read from `hardHyphen`. */
  hyphenated: boolean;
  /** Set on a {@link hyphenated} line that ends after a hyphen the text
   *  carries ("meta-" | "analyses", or a word wider than the line cut right
   *  after one): the hyphen is part of the text and of the line's source
   *  range, and the break added nothing. Absent otherwise. */
  hardHyphen?: boolean;
  /** The line opens with the hyphen of the compound the line before broke
   *  at, repeated (`bodyText.repeatHyphen`, "vencer-" | "-se"): its `text`
   *  and first segment start with a `-` that is not in the source there,
   *  and `plainStart` / `sourceStart` point past it. The PDF backend paints
   *  it under an `/ActualText` that leaves it out, so text copied or
   *  extracted from the PDF reads the word once ("vencer-se"). Absent
   *  otherwise. */
  repeatedHyphen?: boolean;
  /** Per-segment data for justified rendering */
  segments?: VDTLineSegment[];
  /** Whether this is the last line of the paragraph (ragged even when justified) */
  isLastLine?: boolean;
  /** Set ragged inside a justified paragraph: a line a URL made unfillable
   *  (its few word spaces would stretch past the loose-line threshold), or
   *  a CJK line flagged {@link cjkLoose}. */
  ragged?: boolean;
  /** A justified CJK line that needed more inter-character spacing than the
   *  cap (½ em, or `bodyText.maxJustifyTracking` when it is set): it is set
   *  with the cap, short of the measure and {@link ragged}, and reported as
   *  a `cjkLooseLine` content warning. Typically the line before a long
   *  Latin word or web address that cannot break. Absent otherwise. */
  cjkLoose?: boolean;
  /** Set by the CJK composer (a paragraph set as Chinese, Japanese or
   *  Korean text, `composesAsCjk`): its characters were measured one by
   *  one, so a renderer paints two CJK marks that meet apart — the marks
   *  Latin text shares with Chinese (“ ” ‘ ’ ·) too — whether or not the
   *  line holds a Han character, and HTML turns the browser's punctuation
   *  trimming off on the whole line. Lines of the word-by-word breakers
   *  were measured word by word and are cut word by word (`MarkCutRule`).
   *  Absent otherwise. */
  cjkComposed?: boolean;
  /** Approximate character offset in the original markdown source where this line begins.
   *  A line that opens with a backslash escape (`\$40`) begins at its backslash. */
  sourceStart?: number;
  /** Approximate character offset just past the last source character contributing to this line */
  sourceEnd?: number;
  /** Plain-text start offset within the block's plain text (inclusive) */
  plainStart?: number;
  /** Plain-text end offset within the block's plain text (exclusive) */
  plainEnd?: number;
  /** For justified (non-last) lines: ratio of the applied justified space width
   *  to the normal space width of the block's font. 1.0 means natural spacing.
   *  The line's `bbox.width` stays its natural width; painted, each space
   *  grows by the slack shared among them, and the line ends on the right
   *  edge of the measure. */
  justifiedSpaceRatio?: number;
  /** The Chinese marks set on this line (emphasis dots, proper-name and
   *  book-title lines, #193), for renderers to draw as they are; absent on
   *  a line with none. */
  marks?: VDTLineMark[];
  /** Tracking this line takes on top of its block's (`VDTBlock.letterSpacing`),
   *  px after every glyph — negative tightens: a justified line its word
   *  spaces alone would set past `bodyText.maxWordSpacing` or
   *  `minWordSpacing`, within `bodyText.maxJustifyTracking`. Measured into
   *  the widths of its text segments; renderers paint the line with the sum
   *  of both. Absent when the line takes none. */
  letterSpacing?: number;
}

// ---------------------------------------------------------------------------
// Resolved resource block (issue #49) — a measured, placement-ready embed of a
// `Resource` (bitmap / svg / table) plus its caption. Produced during the
// measurement phase so canvas/PDF renderers can draw it synchronously. All
// geometry is in px, relative to the block origin (`(0,0)` = block top-left),
// and offset to absolute page coordinates at placement time.
// ---------------------------------------------------------------------------

/** A single laid-out table cell: its primary grid position, pixel rect within
 *  the block, alignment, header flag, and the measured rich-text lines of its
 *  content. Cells covered by a merge are omitted (only the primary is kept). */
/** A cell's embedded image (`TableCell.image`), resolved to its payload and
 *  placed inside the cell. */
export interface VDTResourceTableCellImage {
  /** The referenced `Resource.id`. */
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** Out-of-band binary id, resolved at render time like a figure's. */
  fileId: string;
  /** For bitmaps: the source format (e.g. `'png'`, `'jpeg'`). */
  format?: string;
  /** Alternative text of the image (the resource's `altText`, else its
   *  caption), for accessible output. */
  altText?: string;
  /** For an SVG with a print master (`Resource.svg.pdfFileId`): the
   *  master's id, which the PDF backend embeds in place of the SVG. */
  pdfFileId?: string;
  /** Pixel rect of the image, in the same frame as the cell `rect`. */
  rect: BoundingBox;
}

export interface VDTResourceTableCell {
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  isHeader: boolean;
  align: TableCellAlign;
  verticalAlign: TableCellVerticalAlign;
  /** Pixel rect of the cell relative to the resource block origin. */
  rect: BoundingBox;
  /** Measured content lines, with bboxes relative to the cell's text origin. */
  lines: VDTLine[];
  /** The cell's embedded image, when it has one and the resource resolved. */
  image?: VDTResourceTableCellImage;
  /** The cell's own fill (hex, `TableCell.background` resolved through the
   *  palette), painted instead of the table's header / body fill. */
  background?: string;
  /** A body cell on an alternate (even-numbered) body row of a table with
   *  zebra rows: it takes `bodyAlternateBackground` instead of
   *  `bodyBackground`. Set only while the table style enables them. */
  alternate?: boolean;
}

/** Laid-out table geometry for a `kind: 'table'` resource block. */
export interface VDTResourceTableLayout {
  /** Body-cell font strings used for the rich-text line renderer. */
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  /** Body-cell text colour (hex). */
  color: string;
  /** Header-cell font strings. Header cells are measured with these, so the
   *  renderer must paint header cells with the same set. */
  headerFontString: string;
  headerBoldFontString: string;
  headerItalicFontString: string;
  headerBoldItalicFontString: string;
  /** Header-cell text colour (hex). */
  headerColor: string;
  /** Border colour (hex). */
  borderColor: string;
  /** Border thickness in px; `0` means no borders. */
  borderWidthPx: number;
  /** Header background colour (hex), or undefined for no fill. */
  headerBackground?: string;
  /** Body background colour (hex), or undefined for no fill. */
  bodyBackground?: string;
  /** Fill of the alternate body rows (hex, `tableStyle.bodyAlternateBackground`),
   *  painted on the cells marked `alternate`; absent without zebra rows. */
  bodyAlternateBackground?: string;
  cells: VDTResourceTableCell[];
  /** Column x-edges (length = columnCount + 1) relative to block origin. */
  columnEdges: number[];
  /** Row y-edges (length = rowCount + 1) relative to the table's top. */
  rowEdges: number[];
  /** Which rules to stroke with `borderWidthPx` (`'grid'` when absent). */
  rules?: TableRules;
  /** Radii (px) of the outer frame's corners — top-left, top-right,
   *  bottom-right, bottom-left — from `tableStyle.borderRadius`, clamped to
   *  half the table's width and height. The frame is stroked round and the
   *  cell fills are clipped to it. A part of a split table keeps square the
   *  corners where it continues. Absent for a square frame. */
  frameRadii?: [number, number, number, number];
}

/** A rounded outline: a rect and its corner radii (top-left, top-right,
 *  bottom-right, bottom-left). */
export interface RoundedOutline {
  x: number;
  y: number;
  width: number;
  height: number;
  radii: [number, number, number, number];
}

/** The outer frame of a laid-out table whose body starts at `(x, y)` and is
 *  `width` px wide, grown by `outset` px on every side — its radii grow
 *  alike, a square corner stays square. With `outset = 0` it is the line
 *  the frame is stroked along and the fills are clipped to; with half the
 *  border width it is the frame's outer contour. */
export function tableFrameOutline(
  table: Pick<VDTResourceTableLayout, 'rowEdges' | 'frameRadii'>,
  x: number,
  y: number,
  width: number,
  outset = 0,
): RoundedOutline {
  const height = table.rowEdges[table.rowEdges.length - 1] ?? 0;
  const grow = (r: number) => (r > 0 ? r + outset : 0);
  const [tl, tr, br, bl] = table.frameRadii ?? [0, 0, 0, 0];
  return {
    x: x - outset,
    y: y - outset,
    width: width + outset * 2,
    height: height + outset * 2,
    radii: [grow(tl), grow(tr), grow(br), grow(bl)],
  };
}

/** The fill (hex) a table cell is painted with, or undefined for none: the
 *  cell's own `background`, else the header tint for a header cell, else
 *  the alternate body fill on a zebra row, else the body fill. Every
 *  backend paints cells through it. */
export function tableCellFill(
  table: Pick<VDTResourceTableLayout, 'headerBackground' | 'bodyBackground' | 'bodyAlternateBackground'>,
  cell: Pick<VDTResourceTableCell, 'background' | 'isHeader' | 'alternate'>,
): string | undefined {
  if (cell.background !== undefined) return cell.background;
  if (cell.isHeader) return table.headerBackground;
  if (cell.alternate && table.bodyAlternateBackground !== undefined) return table.bodyAlternateBackground;
  return table.bodyBackground;
}

/** One cell fill as {@link tableCellFillRects} paints it. */
export interface TableCellFillRects {
  /** The fill (hex), as {@link tableCellFill} gives it. */
  fill: string;
  /** The cell's rect, then the strips it runs across the edges it shares
   *  with later neighbours. */
  rects: BoundingBox[];
}

/** Cells whose edges are this close (px) share an edge. */
const CELL_EDGE_EPS = 0.01;

/** Whether a fill (`#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa`) is opaque. */
function isOpaqueFill(hex: string): boolean {
  const h = hex.replace(/^#/, '');
  if (h.length === 8) return h.slice(6).toLowerCase() === 'ff';
  if (h.length === 4) return h[3]!.toLowerCase() === 'f';
  return true;
}

/**
 * The cell fills of a laid-out table in paint order, each as the cell's
 * rect followed by a strip across every edge it shares with an opaque
 * neighbour painted after it: along the shared part of the edge, reaching
 * half the narrower cell into each. A renderer that anti-aliases each fill
 * on its own — an HTML page at a fractional device-pixel ratio, a PDF
 * viewer — would otherwise let the page show through where two fills meet
 * inside a pixel: a faint seam between cells of one tint. The strip covers
 * the edge's pixels whole, and the later cell, painted over it, blends its
 * edge into the earlier fill instead of the page. Translucent fills keep
 * to their own cell (the overlap would show). The HTML and PDF backends
 * paint the fills this way; the canvas snaps its fills to device pixels
 * instead.
 */
export function tableCellFillRects(
  table: Pick<VDTResourceTableLayout, 'cells' | 'headerBackground' | 'bodyBackground' | 'bodyAlternateBackground'>,
): TableCellFillRects[] {
  const filled: { rect: BoundingBox; fill: string }[] = [];
  for (const cell of table.cells) {
    const fill = tableCellFill(table, cell);
    if (fill !== undefined) filled.push({ rect: cell.rect, fill });
  }
  return filled.map((a, i) => {
    const rects: BoundingBox[] = [a.rect];
    if (!isOpaqueFill(a.fill)) return { fill: a.fill, rects };
    const ar = a.rect;
    for (let j = i + 1; j < filled.length; j++) {
      const b = filled[j]!;
      if (!isOpaqueFill(b.fill)) continue;
      const br = b.rect;
      const y0 = Math.max(ar.y, br.y);
      const y1 = Math.min(ar.y + ar.height, br.y + br.height);
      const x0 = Math.max(ar.x, br.x);
      const x1 = Math.min(ar.x + ar.width, br.x + br.width);
      // The strip straddles the shared edge (half the narrower cell each
      // side), so the edge's pixels are covered by one shape whatever the
      // renderer does with separate shapes of one colour.
      if (y1 - y0 > CELL_EDGE_EPS) {
        const d = Math.min(ar.width, br.width) / 2;
        const edge = Math.abs(br.x - (ar.x + ar.width)) < CELL_EDGE_EPS ? br.x
          : Math.abs(br.x + br.width - ar.x) < CELL_EDGE_EPS ? ar.x : undefined;
        if (edge !== undefined) rects.push({ x: edge - d, y: y0, width: 2 * d, height: y1 - y0 });
      }
      if (x1 - x0 > CELL_EDGE_EPS) {
        const d = Math.min(ar.height, br.height) / 2;
        const edge = Math.abs(br.y - (ar.y + ar.height)) < CELL_EDGE_EPS ? br.y
          : Math.abs(br.y + br.height - ar.y) < CELL_EDGE_EPS ? ar.y : undefined;
        if (edge !== undefined) rects.push({ x: x0, y: edge - d, width: x1 - x0, height: 2 * d });
      }
    }
    return { fill: a.fill, rects };
  });
}

/** Background bar painted behind a resource caption (issue #49 §7). */
export interface VDTCaptionBar {
  /** Bar rect — block-relative until placement offsets it, like caption lines. */
  rect: BoundingBox;
  /** Fill colour (hex). */
  background: string;
}

/** Which rows of a split table a block carries, and how it links to the
 *  neighbouring slices (see `TableStyleConfig.overflow`). */
export interface VDTTableSlice {
  /** First model row of the slice (header rows excluded — they are repeated
   *  on every continuation regardless). */
  startRow: number;
  /** One past the last model row of the slice. */
  endRow: number;
  /** The slice continues an earlier one: its caption carries the continued
   *  suffix and the header rows are repeated. Anchors / link destinations
   *  belong to the first slice only. */
  continued: boolean;
  /** More rows follow on a later page: the continues marker is set under
   *  the slice and the note is held back for the last one. */
  continues: boolean;
}

/** The resolved, measured content of a resource block. */
/** A resource block set turned a quarter turn on the page (a landscape
 *  table in a portrait book). The block's inner geometry — `bodyRect`, the
 *  table cells, the caption, note and marker lines, the caption bar — is
 *  then expressed in the block's own upright frame (its top-left at
 *  `(0, 0)`, `width` × `height` px), and this record maps that frame onto
 *  the page: the upright origin lands at page point `(originX, originY)`
 *  and, for `'ccw'`, the upright x axis runs up the page and the y axis
 *  runs right (`'cw'`: x down, y left). See {@link resourceBlockToPage} and
 *  {@link resourceBlockToLocal}. An upright block has no `rotation` and its
 *  inner geometry is in page coordinates once placed. */
export interface VDTResourceRotation {
  direction: 'ccw' | 'cw';
  /** Page x of the upright frame's top-left corner. */
  originX: number;
  /** Page y of the upright frame's top-left corner. */
  originY: number;
  /** Width of the upright frame (its extent along the page's height). */
  width: number;
  /** Height of the upright frame (its extent along the page's width). */
  height: number;
}

/** Map a point of a resource block's inner frame to page coordinates: the
 *  identity for an upright block, the rotation for a turned one. */
export function resourceBlockToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  x: number,
  y: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x, y };
  return r.direction === 'ccw'
    ? { x: r.originX + y, y: r.originY - x }
    : { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into a resource block's inner frame (the inverse of
 *  {@link resourceBlockToPage}). */
export function resourceBlockToLocal(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  xPage: number,
  yPage: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x: xPage, y: yPage };
  return r.direction === 'ccw'
    ? { x: r.originY - yPage, y: xPage - r.originX }
    : { x: yPage - r.originY, y: r.originX - xPage };
}

/** Map an axis-aligned rect of a resource block's inner frame to the page:
 *  a quarter turn keeps it axis-aligned, with width and height swapped. */
export function resourceBlockRectToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  rect: BoundingBox,
): BoundingBox {
  if (!rb.rotation) return rect;
  const a = resourceBlockToPage(rb, rect.x, rect.y);
  const b = resourceBlockToPage(rb, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/**
 * The frame a vertical page's flow is laid out in (`VDTPage.flow`). The
 * engine sets a `'vertical-rl'` page as a horizontal page turned a quarter
 * turn clockwise: the flow is laid out in a frame `page.height` wide and
 * `page.width` tall, whose x axis runs down the sheet (the direction of a
 * vertical line) and whose y axis runs leftward (the direction lines
 * advance). `rotation` maps that frame onto the page exactly as a `'cw'`
 * resource rotation does: `{ direction: 'cw', originX: page.width,
 * originY: 0, width: page.height, height: page.width }`, so a flow point
 * `(x, y)` lands at page `(page.width − y, x)` (see {@link flowToPage}).
 */
export interface VDTFlowFrame {
  writingMode: 'vertical-rl';
  rotation: VDTResourceRotation;
  /** Where the ideographic em box's centre sits above the alphabetic
   *  baseline, in ems, per font family (the first family of a font string,
   *  unquoted): the axis upright characters are centred on and turned
   *  about. Measured once per family by the layout, so every renderer
   *  turns a character about the same point. A family missing here takes
   *  {@link DEFAULT_CENTRAL_BASELINE}. */
  centralBaselines?: Record<string, number>;
  /** The horizontal advance, in ems, of each dash the flow stretches to
   *  fill its cell (— – ― ⸺ ⸻ －, `VerticalGlyph.stretch`), per font family
   *  (keyed as {@link centralBaselines}) and dash: what a renderer with no
   *  font metrics of its own (the HTML output) stretches the glyph by, as
   *  the canvas and the PDF do from theirs. Only the dashes the page's flow
   *  sets; absent when it sets none. */
  dashAdvances?: Record<string, Record<string, number>>;
}

/** Where the ideographic em box's centre sits above the alphabetic
 *  baseline, in ems, when the font was not measured: the value of every
 *  Source Han / Noto CJK face (em box from −0.12 to 0.88 em). */
export const DEFAULT_CENTRAL_BASELINE = 0.38;

/** Whether a page's flow is set vertically (`page.flow`). */
export function pageIsVertical(page: Pick<VDTPage, 'flow'>): boolean {
  return page.flow !== undefined;
}

/** Map a point of a page's flow frame to page coordinates: the identity on
 *  a horizontal page, `(page.width − y, x)` on a vertical one. */
export function flowToPage(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const r = page.flow?.rotation;
  if (!r) return { x, y };
  return { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into the page's flow frame (the inverse of
 *  {@link flowToPage}). */
export function pageToFlow(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const r = page.flow?.rotation;
  if (!r) return { x, y };
  return { x: y - r.originY, y: r.originX - x };
}

/** Map an axis-aligned rect of a page's flow frame to the page: width and
 *  height swap on a vertical page. */
export function flowRectToPage(page: Pick<VDTPage, 'flow'>, rect: BoundingBox): BoundingBox {
  if (!page.flow) return rect;
  const a = flowToPage(page, rect.x, rect.y);
  const b = flowToPage(page, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** Map an axis-aligned page rect into the page's flow frame (the inverse
 *  of {@link flowRectToPage}). */
export function pageRectToFlow(page: Pick<VDTPage, 'flow'>, rect: BoundingBox): BoundingBox {
  if (!page.flow) return rect;
  const a = pageToFlow(page, rect.x, rect.y);
  const b = pageToFlow(page, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** The flow frame of a vertical page `width` × `height` px (physical). */
export function verticalFlowFrame(width: number, height: number): VDTFlowFrame {
  return {
    writingMode: 'vertical-rl',
    rotation: { direction: 'cw', originX: width, originY: 0, width: height, height: width },
  };
}

export interface ResolvedResourceBlock {
  /** The source resource. */
  resource: Resource;
  kind: 'bitmap' | 'svg' | 'table';
  /** Present when the block is one slice of a table split across pages. */
  slice?: VDTTableSlice;
  /** Present when the block is set turned on the page; the inner geometry
   *  is then in the block's upright frame (see {@link VDTResourceRotation}). */
  rotation?: VDTResourceRotation;
  /** Rendered number string (e.g. `"1.7"`) for this resource. */
  number: string;
  /** Caption prefix from the resource type (e.g. `"Figure"`). */
  captionPrefix: string;
  /** Pixel rect of the figure body (image / table area) relative to the block
   *  origin. Caption is laid out below it. */
  bodyRect: BoundingBox;
  /** For bitmap/svg: the out-of-band binary id to resolve at render time. */
  fileId?: string;
  /** For bitmap: the source format (e.g. `'png'`, `'jpeg'`, `'webp'`). */
  format?: string;
  /** Measured caption lines (bboxes relative to the block origin), already
   *  including the prefix + number. Empty when there is no caption. */
  captionLines: VDTLine[];
  /** Font strings used to render the caption (normal / bold / italic / bold+italic). */
  captionFontString: string;
  captionBoldFontString: string;
  captionItalicFontString: string;
  captionBoldItalicFontString: string;
  /** Caption description text colour (hex). */
  captionColor: string;
  /** Caption numbered-label colour (hex); applied to segments tagged
   *  `captionLabel`. */
  captionLabelColor: string;
  /** Link colour (hex) used for inline `:ref` segments inside the caption. */
  linkColor: string;
  /** Table geometry, present only when `kind === 'table'`. */
  table?: VDTResourceTableLayout;
  /** Bar behind the caption, present when `captionStyle.backgroundEnabled`
   *  and the block has a caption. Painted before the caption lines. */
  captionBar?: VDTCaptionBar;
  /** Measured note lines (`Resource.note`), placed under the body when the
   *  caption sits above, otherwise under the caption. Empty when no note. */
  noteLines: VDTLine[];
  /** Font strings used to render the note (normal / bold / italic / bold+italic). */
  noteFontString: string;
  noteBoldFontString: string;
  noteItalicFontString: string;
  noteBoldItalicFontString: string;
  /** Note text colour (hex). */
  noteColor: string;
  /** "Continued" marker lines of a table slice that goes on on a later page
   *  (`slice.continues`), right-aligned under the slice and painted with the
   *  note fonts and colour. Empty otherwise. */
  continuesLines: VDTLine[];
}

export interface VDTBlock {
  id: string;
  type: VDTBlockType;
  bbox: BoundingBox;
  lines: VDTLine[];
  resource?: PostextResource;
  /** Resolved resource embed (issue #49). Present only for `type ===
   *  'resource'` blocks; carries the measured image/table + caption layout. */
  resourceBlock?: ResolvedResourceBlock;
  pageIndex: number;
  columnIndex: number;
  dirty: boolean;
  snappedToGrid: boolean;
  headingLevel?: number;
  /** Heading attributes parsed from a trailing `{key="value" …}` on the
   *  heading line (first part of a heading only). Exposed to design slots
   *  as `{attr.key}` placeholders. */
  attrs?: Record<string, string>;
  /** Source range of each quoted heading attribute value. */
  attrSources?: Record<string, { start: number; end: number }>;
  /** Forced title breaks (plain-text indices, prefix excluded) and the parsed
   *  title length, so opener designs can re-insert the line breaks that the
   *  in-column rendering shows as spaces. */
  titleBreaks?: number[];
  titleLength?: number;
  /** The heading's title as written in the source — before its level's
   *  (or style's) `textTransform`, numbering prefix excluded, forced title
   *  breaks as plain text reads them (a space between Latin words, the
   *  ideographic space between two Chinese characters, nothing where a
   *  Chinese character meets Latin text or a digit; `plainTitleBreak`).
   *  Present only when the lines print it otherwise (an
   *  `uppercase` heading) and the title cites no resource (a `:ref` label
   *  is resolved in the lines only), so PDF bookmarks can name the heading
   *  as it was written (EF-81). The `{titleText}` design placeholder is
   *  the title as printed, transform applied. */
  sourceTitle?: string;
  /** Index of the originating content block in the parsed markdown block
   *  list. Stable across layout passes — used by column balancing to key
   *  extra-spacing adjustments to headings. A floated figure or table (in
   *  `page.floats`, or a page-wide one in a span column) carries the index
   *  of the block that first cites or embeds it, which is where a tagged
   *  PDF reads it. */
  contentIndex?: number;
  /** Set on the paragraph a footnote is set as (at a column foot, or after
   *  the chapter's last block): the note's id. */
  footnoteNote?: string;
  /** Id of the heading style (`{style="…"}`) applied to this heading. */
  headingStyleId?: string;
  /** True for a heading whose style has `numbered: false`: it advances no
   *  counter and `{chapterNumber}` is empty on its pages. */
  unnumbered?: boolean;
  /** True for a level-1 heading whose style has `runningChapter: false` (a
   *  plate, a map): the running heads pass over it and keep naming the
   *  chapter in force before it (`{chapterTitle}`, `{chapterNumber}`,
   *  `{attr.<key>}`, the `h1` guide words). */
  notRunningChapter?: boolean;
  /** Present on the part row of an expanded `:::toc`: the row's design is
   *  laid out from `toc.parts.design` with these values (see
   *  `buildHeadersAndFooters`), replacing the block's (empty) line. */
  tocPart?: { number: string; title: string; pageLabel: string; palette?: Record<string, string>; pageIndex?: number };
  /** Present on an entry of an expanded `:::toc`, with the book page index
   *  the entry points at once known (`OutlineEntry.pageIndex`): renderers
   *  make the row a link to it. The contents keep their own rhythm:
   *  entries and part rows neither snap to the baseline grid nor serve as
   *  column-balancing stretch points. */
  tocEntry?: { pageIndex?: number };
  numberPrefix?: string;
  /** What joins {@link numberPrefix} to the title
   *  (`HeadingLevelConfig.numberSeparator`), when it is not one space:
   *  `'　'` or `''` in a Chinese heading. Absent means `' '`. */
  numberSeparator?: string;
  /** A numbered heading's counter: its level's running count (the `3` of
   *  a third chapter, whatever its template prints). Backs `{numberDecimal}`,
   *  `{numberRoman}`, `{numberWords}`… in heading designs. Absent on
   *  unnumbered headings and other blocks. */
  headingNumber?: number;
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  color: string;
  boldColor?: string;
  italicColor?: string;
  /** Colour for inline `:ref` segments (`refResourceId` set). */
  refColor?: string;
  textAlign: TextAlign;
  /** Tracking applied to this block's text (px added after every glyph;
   *  negative tightens). Set by column balancing on a loose paragraph, on
   *  a paragraph set a line short to pull up a runt, and on a heading whose
   *  level or heading style sets `letterSpacing` (EF-83). Renderers paint it
   *  via canvas `letterSpacing`, CSS `letter-spacing` or PDF `Tc`, adding a
   *  line's own `VDTLine.letterSpacing`. */
  letterSpacing?: number;
  /** Column balancing: the levers that fired on this block — space added
   *  above it, the paragraph run a line long — and how much. Absent when
   *  balancing left the block alone. The band caps that cut a band level
   *  are recorded on its columns (`VDTColumn.bandCapped`, `trailingCap`). */
  balancing?: VDTBalancing;
  /** Character offset in the original markdown where the source content for this block starts */
  sourceStart?: number;
  /** Character offset just past the last source character for this block */
  sourceEnd?: number;
  /** Absolute source offsets (in original markdown) per plain-text char of rawBlock.text */
  sourceMap?: number[];
  /** Length of any prepended numbering prefix in the block's plain text (0 if none) */
  plainPrefixLen?: number;
  /** List item nesting depth (1-based), only set for `listItem` blocks */
  listDepth?: number;
  /** Bullet character to render (only for `listItem`) */
  bulletText?: string;
  /** Font string used to render the bullet glyph */
  bulletFontString?: string;
  /** Bullet color (hex) */
  bulletColor?: string;
  /** Absolute page X coordinate where the bullet is drawn */
  bulletOffsetX?: number;
  /** Absolute page Y coordinate for the bullet's vertical midpoint (paired
   *  with textBaseline='middle'): its em box centred on the text's
   *  x-height. Every marker has it, a contents number included, as up to
   *  postext 1.4; a renderer that knows `bulletBaselineY` prefers that. */
  bulletY?: number;
  /** Absolute page Y coordinate of the baseline a marker set as text sits
   *  on — a contents entry's number, which shares the first line's baseline
   *  whatever its face and size. When present, renderers paint the marker
   *  (and its separator) with its alphabetic baseline here instead of
   *  centring it on `bulletY`. Absent for list bullets and numbers. */
  bulletBaselineY?: number;
  /** Ordered-list separator drawn as its own run after the number (only when
   *  its style differs from the number's; otherwise `bulletText` carries it). */
  separatorText?: string;
  /** Font string of the separator run */
  separatorFontString?: string;
  /** Separator colour (hex) */
  separatorColor?: string;
  /** Absolute page X coordinate where the separator run starts (shares the
   *  bullet's `bulletY`, or its `bulletBaselineY` when set) */
  separatorX?: number;
  /** Ordered-list prefix drawn as its own run before the number (`（` of
   *  （一）), in the separator run's font and colour; set only with a
   *  separator run (otherwise `bulletText` carries it). */
  prefixText?: string;
  /** Absolute page X coordinate where the prefix run starts (on the
   *  bullet's `bulletY` / `bulletBaselineY`, as the separator). */
  prefixX?: number;
  /** List kind for `listItem` blocks — drives bullet shape and text decoration. */
  listKind?: 'unordered' | 'ordered' | 'task';
  /** When true, the canvas backend draws a strikethrough through the block's lines (completed tasks). */
  strikethroughText?: boolean;
  /** Present on `mathDisplay` blocks. */
  mathRender?: MathRender;
  /** Original TeX source for math spans/blocks — used for warnings and the
   *  disabled-math fallback rendering. */
  tex?: string;
  /** When true, the block is skipped during rendering but still reserves
   *  its bbox space within the column flow. Used for headings with
   *  `span: 'page'` whose visual output is produced by an opener band, and
   *  for structural headings (`hidden` on their level or style), which
   *  reserve nothing: their lines keep the text (contents, bookmarks,
   *  running heads) but have no height. */
  hidden?: boolean;
  /** Optional in-column design slot rendered in place of the block's default
   *  text content. Populated for heading blocks whose level has
   *  `advancedDesign.enabled` and (for `span: 'column'`) at least one
   *  element. Renderers render this instead of `lines` when present. */
  designOverlay?: VDTDesignSlot;
  /** Present on `type === 'callout'` frame blocks: the resolved callout
   *  geometry. The frame has no text lines of its own — its decoration
   *  (background, stripe, icon, title) is carried on `designOverlay`, and
   *  its content blocks follow it in the column with `containerId` set. */
  callout?: ResolvedCalloutBlock;
  /** Id of the enclosing `:::callout` container (the parser's
   *  `containerId`), set on the frame block and on every block laid out
   *  inside it. Column balancing and keep-with-next rollbacks treat such
   *  blocks as part of one unbreakable unit. */
  containerId?: number;
  /** Inside a nested `:::callout` (a box laid out within another box): the
   *  parser `containerId`s of the nested boxes enclosing the block,
   *  outermost first — the top-level box stays `containerId`. A nested
   *  frame's own id is the last entry of its path. Absent at top level. */
  calloutPath?: number[];
}

/** Resolved geometry of a `:::callout` frame block (see `VDTBlock.callout`). */
export interface ResolvedCalloutBlock {
  /** Id of the `CalloutStyleConfig` that styled the box. */
  styleId: string;
  span: CalloutSpan;
  placement: CalloutPlacement;
  /** Content area inside padding / stripe / icon column, relative to the
   *  frame's `bbox` origin. Children are laid out inside it. */
  innerRect: BoundingBox;
  /** Ids of the child blocks (in reading order). */
  childIds: string[];
  /** `fileId` of the icon resource image when `icon.kind === 'resource'`. */
  iconFileId?: string;
  /** Bitmap format of the icon image (`'png'`, `'jpeg'`, …) when known. */
  iconFormat?: string;
  /** `fileId` of the marker resource image when `marker.kind === 'resource'`. */
  markerFileId?: string;
  /** Bitmap format of the marker image when known. */
  markerFormat?: string;
  /** Set on the frames of a callout split across columns / pages
   *  (`keepTogether: false`): 0-based index of this fragment. Every
   *  fragment shares the fence's `contentIndex` and `containerId`. */
  part?: number;
  /** On a split callout: `true` while another fragment follows this one. */
  continued?: boolean;
}

/** The column-balancing levers (`headings.balancing`), in the order they
 *  are tried on a short column:
 *  - `trailingCallout` — a box closing the column moved down by the room
 *    under its foot (after `afterFloat` with `closingBox: 'last'`, never
 *    with `'off'`);
 *  - `heading` — whole grid lines above a heading;
 *  - `listEnd` — a grid line where a list ends;
 *  - `afterDisplay` — a grid line under a display formula or a box;
 *  - `afterFloat` — a grid line under a float band heading the column;
 *  - `looseParagraph` — a paragraph re-broken a line long (plus tracking
 *    when word spacing alone could not gain the line). */
export type BalanceLever = 'trailingCallout' | 'heading' | 'listEnd' | 'afterDisplay' | 'afterFloat' | 'looseParagraph';

/** What column balancing did to one block (`VDTBlock.balancing`). */
export interface VDTBalancing {
  /** The levers that fired on the block, in the order above. Usually one;
   *  a paragraph after a list can take the list-end line and also run a
   *  line long. */
  levers: BalanceLever[];
  /** Space the spacing levers added above the block, in px: whole grid
   *  lines, or the exact room under a closing box (`trailingCallout`).
   *  `0` when only `looseParagraph` fired — that paragraph grows by its
   *  extra lines instead. */
  spaceAbove: number;
  /** `looseParagraph`: lines the paragraph gained. */
  extraLines?: number;
  /** `looseParagraph`: tracking that gained the line, in thousandths of an
   *  em (`0` when word spacing alone did); the block's `letterSpacing` is
   *  the same value in px. */
  tracking?: number;
}

export interface VDTColumn {
  index: number;
  bbox: BoundingBox;
  blocks: VDTBlock[];
  availableHeight: number;
  baselineOffset: number;
  /** Vertical band this column belongs to when a page is split into
   *  stacked bands (e.g. a full-width span above a multi-column flow).
   *  Absent for the plain single-band layout. */
  band?: number;
  /** `'text'` for a regular flow column, `'span'` for a full-width column
   *  that hosts page-spanning content, `'side'` for the float-only side
   *  column of a one-and-a-half layout (`layout.sideColumnRole: 'floats'`):
   *  body text never flows into it; the `span: 'side'` floats stacked in
   *  it consume its `availableHeight` from the top, so its used height is
   *  the stack's current bottom. Absent means `'text'`. */
  kind?: 'text' | 'span' | 'side';
  /** True when a `:::columnbreak` directive ended this column: its bottom
   *  gap is intentional, so column balancing leaves it alone. */
  forcedBreak?: boolean;
  /** True while a band cap (trailing or before a page-span box) cuts this
   *  column level with the others of its band. */
  bandCapped?: boolean;
  /** True when a trailing band cap cut this column so a closing band ends
   *  level: its bottom is the level cut, and column balancing fills the
   *  column up to it even though the page does not flow on. */
  trailingCap?: boolean;
}

/** The notes set at the foot of one column (`footnotes.placement:
 *  'column'`). The note paragraphs themselves are in `VDTPage.floats` (and
 *  `doc.blocks`), so every renderer paints them as any block; the area
 *  carries what else is painted: the separator rule. */
export interface VDTFootnoteArea {
  /** The column the notes belong to. */
  columnIndex: number;
  /** From the separator's top edge (its space above included) to the last
   *  note's foot. */
  bbox: BoundingBox;
  /** Ids of the notes, in order. */
  noteIds: string[];
  /** The separator rule, when drawn: its left end, the y of its centre
   *  line, its length and thickness (px), and colour. */
  rule?: { x: number; y: number; width: number; lineWidthPx: number; color: string };
}

/** One run of a design text line set with inline marks (`inlineMarks`):
 *  its own font (bold, italic, a script at the reduced size) and advance.
 *  Runs are painted one after another from the line's `xOffset`. */
export interface VDTDesignTextRun {
  text: string;
  fontString: string;
  /** Advance of the run, tracking included. */
  width: number;
  /** Superscript / subscript offset off the baseline (px, positive down). */
  baselineShift?: number;
  /** The first of a subscript and a superscript set over each other, as
   *  on {@link VDTLineSegment.stacked}: width 0, the next run painted at
   *  the same x. */
  stacked?: boolean;
  /** Vertical text: set in one upright cell (`:tcy[…]`), as
   *  {@link VDTLineSegment.tcy}. */
  tcy?: true;
  /** Vertical text: stood upright or turned by its author (`:upright[…]`,
   *  `:sideways[…]`), as {@link VDTLineSegment.orientation}. */
  orientation?: 'upright' | 'sideways';
}

/** Line of wrapped text inside a `VDTDesignTextBlock`. */
export interface VDTDesignTextLine {
  text: string;
  /** X offset of the line's visible content inside the element's content box. */
  xOffset: number;
  /** Y offset of the line baseline relative to the element's y. */
  baselineY: number;
  /** Measured width of the visible text. */
  width: number;
  /** Present when the line mixes fonts (a text with inline marks) or is
   *  justified: paint these runs instead of `text` in the block font, each
   *  at the end of the one before. `text` stays the plain concatenation of
   *  the runs. A justified line is cut after every word space, and each
   *  run's `width` takes its spaces' share of the stretch. */
  runs?: VDTDesignTextRun[];
  /** Present on a justified line (`align: 'justify'`): the px added to every
   *  word space (U+0020 and the no-break space U+00A0), as CSS
   *  `word-spacing` adds it. The runs' widths already include it. */
  wordSpacingPx?: number;
}

/** Outline of the glyphs of a design text block, resolved to px / hex. */
export interface VDTDesignTextStroke {
  widthPx: number;
  color: string;
  /** Paint the outline only, leaving the letters unfilled. */
  hollow?: boolean;
}

/** Rounded-rectangle box style resolved to absolute px / hex values. */
export interface VDTDesignBoxStyle {
  backgroundColor?: string;
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
}

/** Text block rendered inside a design slot (header / footer / heading). */
export interface VDTDesignTextBlock {
  kind: 'text';
  bbox: BoundingBox;
  fontString: string;
  color: string;
  /** Absolute-page-coordinate baselines per line, already offset. */
  lines: VDTDesignTextLine[];
  box?: VDTDesignBoxStyle;
  /** Whether rendering should clip to `bbox`. */
  clip: boolean;
  /** Tracking applied after every glyph, in px (canvas `letterSpacing`,
   *  CSS `letter-spacing`, PDF `Tc`). Absent or 0 = none. */
  letterSpacingPx?: number;
  /** Outline stroked over the glyphs after they are filled (canvas
   *  `strokeText`, CSS `-webkit-text-stroke`, PDF text render mode 1/2).
   *  Absent = none. */
  stroke?: VDTDesignTextStroke;
  /** Source range of the text this block displays when it mirrors document
   *  text (an opener's `{titleText}`), so editors can map clicks on the
   *  band back to the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** The exact title text the block renders (lines joined by `\n`) and its
   *  per-character source offsets, when the text mirrors document text. */
  sourceText?: string;
  sourceMap?: number[];
  /** Pagination furniture rather than document text — the title a split
   *  callout repeats on a continuation, its "Continued" marker: a tagged
   *  PDF marks it an artifact and the HTML hides it from assistive
   *  technology, so the text is read once. */
  artifact?: boolean;
  /** Set vertically on a page or a slot whose text is horizontal
   *  (`DesignTextElement.writingMode: 'vertical-rl'`): the lines are laid
   *  out in the block's own frame, turned a quarter turn clockwise about
   *  its box's top right corner — a line's `xOffset` runs down from the
   *  box's top edge, its `baselineY` leftward from the box's right edge
   *  (0 there) — and painted through that frame with the vertical glyph
   *  painter. `bbox` is where the box stands. Absent on every other
   *  block. */
  vertical?: VDTVerticalText;
}

/** How the text of a vertical design block ({@link VDTDesignTextBlock.vertical})
 *  is set: the Chinese region whose punctuation it takes, how many digits a
 *  number set in one cell may have (`cjk.uprightDigits`), and the central
 *  axis of each family it is set in (em above the baseline, as
 *  {@link VDTFlowFrame.centralBaselines}). */
export interface VDTVerticalText {
  region: CjkRegion;
  uprightDigits: number;
  centralBaselines: Record<string, number>;
}

/** Rendered rule inside a design slot. */
export interface VDTDesignRuleBlock {
  kind: 'rule';
  bbox: BoundingBox;
  color: string;
  thicknessPx: number;
  direction: 'horizontal' | 'vertical';
}

/** Decorative rounded box. */
export interface VDTDesignBoxBlock {
  kind: 'box';
  bbox: BoundingBox;
  box: VDTDesignBoxStyle;
  /** Paint the box clipped to this rounded outline (page coordinates, like
   *  `bbox`): the stripe of a callout whose frame has a `borderRadius`
   *  follows the frame's rounded corners, as CSS clips a `border-left` to
   *  `border-radius`. Absent = no clip. */
  clip?: RoundedOutline;
}

/** Image drawn from the resource image registry (e.g. a callout icon). */
export interface VDTDesignImageBlock {
  kind: 'image';
  bbox: BoundingBox;
  /** Out-of-band binary id resolved at render time (canvas registry, HTML
   *  `resourceImageUrl`, PDF resource image map). */
  fileId: string;
  /** The kind of the resource's picture: whether `diagramStyle.singleInk`
   *  tints it (an SVG) or not (a bitmap). Absent on a VDT built before the
   *  field existed; the canvas and HTML backends then guess from the
   *  registered source or the URL. */
  imageKind?: 'bitmap' | 'svg';
  /** For an SVG with a print master (`Resource.svg.pdfFileId`): the
   *  master's id, which the PDF backend embeds in place of the SVG. */
  pdfFileId?: string;
  /** A picture of a vertical page's flow, sized to stand upright on the
   *  sheet: the box's `width` runs down the sheet and is the picture's
   *  height there, its `height` the picture's width. Renderers draw the
   *  picture turned back upright, filling the box. */
  upright?: true;
  /** The picture's alternative text, for a picture that is content (#213):
   *  its resource's `altText`, else its caption as plain text. HTML gives
   *  it as the `<img>`'s `alt`, a tagged PDF as the `/Alt` of a `Figure`.
   *  Absent for a `decorative` design element, for a resource with neither
   *  text, and for callout icons: such a picture is decoration (`alt=""`,
   *  an artifact). */
  altText?: string;
}

export type VDTDesignBlock =
  | VDTDesignTextBlock
  | VDTDesignRuleBlock
  | VDTDesignBoxBlock
  | VDTDesignImageBlock;

export interface VDTDesignSlot {
  bbox: BoundingBox;
  blocks: VDTDesignBlock[];
}

/** @deprecated Use `VDTDesignSlot`. */
export type VDTHeaderFooterSlot = VDTDesignSlot;
/** @deprecated Use `VDTDesignBlock`. */
export type VDTHeaderFooterBlock = VDTDesignBlock;
/** @deprecated Use `VDTDesignTextBlock`. */
export type VDTHeaderFooterTextBlock = VDTDesignTextBlock;
/** @deprecated Use `VDTDesignRuleBlock`. */
export type VDTRuleBlock = VDTDesignRuleBlock;

/** A column rule resolved to px and hex (see `VDTPage.columnRule`). */
export interface VDTColumnRule {
  enabled: boolean;
  color: string;
  lineWidthPx: number;
}

export interface VDTPage {
  index: number;
  /** The sheet's width and height (px), physical on every page. */
  width: number;
  height: number;
  /** The page's own content area (px, page coordinates): the trim box inset
   *  by the margins, mirrored on even pages when `margins.mirror` is on.
   *  Columns, float bands, header/footer containers and opener bands all
   *  derive from it — renderers read it instead of inferring the area from
   *  the column bboxes. On a vertical page it is in flow coordinates (see
   *  {@link flow}); `flowRectToPage(page, page.contentArea)` is the
   *  physical area. */
  contentArea: BoundingBox;
  /** Present on a page whose flow is set vertically (`layout.writingMode:
   *  'vertical-rl'`): the frame the flow was laid out in. On such a page
   *  `contentArea`, the columns, blocks, lines, floats, margin notes,
   *  footnote areas, the opener band and the design overlays of blocks are
   *  in FLOW coordinates, mapped onto the sheet by `flow.rotation` (see
   *  {@link flowToPage}, {@link flowRectToPage}); `width`, `height`, the
   *  header and the footer are physical, as are crop marks and the page
   *  background. Text painted in the flow is set vertically: upright CJK
   *  characters, Latin turned sideways; resource blocks carry a `'ccw'`
   *  rotation that composes with the frame to stand upright. Absent on
   *  horizontal pages. */
  flow?: VDTFlowFrame;
  /** Page classification (see `PageRole`), stamped after placement by
   *  `classifyPages`. Drives the per-element `pages` filter of design
   *  slots. Absent until headers/footers are built. */
  role?: PageRole;
  /** Present on part-divider pages: the part number and title. Marks the
   *  page as `role: 'part'`. */
  partInfo?: {
    number: string;
    title: string;
    /** Palette entries the part's fence overrides (id → hex), applied to
     *  the design slots of every page of the part. */
    palette?: Record<string, string>;
    titleSourceStart?: number;
    titleSourceEnd?: number;
  };
  columns: VDTColumn[];
  /** The column rule of a page laid out with a heading style's own
   *  `layout` (a styled section's pages) when it differs from the
   *  document's `layout.columnRule`: whether it is drawn, its colour and its
   *  width. Absent on every other page, which takes the document's rule. */
  columnRule?: VDTColumnRule;
  header?: VDTDesignSlot;
  footer?: VDTDesignSlot;
  /** Optional full-width opener band above the column flow, used for
   *  heading-level `span: 'page'` chapter openers. */
  openerBand?: VDTDesignSlot;
  /** Blocks positioned outside the column flow: floated resource blocks
   *  (figures / tables) reserved into a band of a column or of the page, and
   *  `placement: 'fixed'` callouts (frame + children) pinned to page
   *  coordinates. Their zones shrink the columns' usable height; they are
   *  rendered after the columns, clipped to the content area rather than to
   *  a single column so a `span: 'page'` float can cross the gutter. */
  floats?: VDTBlock[];
  marginNotes: VDTBlock[];
  /** Footnote areas at the foot of the page's columns (one per column that
   *  holds notes). */
  footnoteAreas?: VDTFootnoteArea[];
  /** Numeric counter for this page from the active page-numbering sequence.
   *  Always set after placement — defaults to `index + 1` when no explicit
   *  numbering config applies. */
  pageNumberValue: number;
  /** Rendered label for `pageNumberValue` using `pageNumberFormat`
   *  (e.g. `'iv'`, `'1'`, `'A'`). */
  pageLabel: string;
  /** Format active at this page. */
  pageNumberFormat: NumeralStyle;
  /** Marks pages inserted purely to satisfy a parity constraint
   *  (`:::pagebreak{parity=...}` or heading `breakBefore.parity`).
   *  They render empty body content but still consume a page number. */
  blankForParity?: boolean;
  /** Marks the mandatory leading blank page inserted by an `always-odd`
   *  or `always-even` parity mode. Unlike `blankForParity`, a
   *  `blankForForce` page belongs to the *previous* chapter — it serves
   *  as a separator, not as parity padding for the upcoming one. */
  blankForForce?: boolean;
}

/** Something the layout could not set as asked and placed anyway — a box
 *  taller than any column it could go to. Hosts surface these as warnings;
 *  the geometry still describes what was painted. */
export interface CalloutOverflowWarning {
  /** `calloutOverflow`: a `:::callout` box that fits no column was placed
   *  overflowing its column (by `overflowPx`). */
  kind: 'calloutOverflow';
  pageIndex: number;
  columnIndex: number;
  /** Absolute source range of the offending construct in the markdown. */
  sourceStart?: number;
  sourceEnd?: number;
  /** How far past the column's free room the content reaches (px). */
  overflowPx: number;
}

/** A configuration value the engine could not use as written, and what it
 *  used instead. Produced by `collectConfigWarnings` (also on
 *  {@link VDTDocument.configWarnings}); hosts surface these as warnings.
 *  Unlike a {@link LayoutWarning} or a {@link ContentWarning} it belongs to
 *  no page. */
export interface ConfigWarning {
  /** `unknownNumberFormat`: a list `numberFormat`, a page-numbering
   *  `format` or a resource type's `counterFormat` in no spelling the
   *  engine knows; it numbers in decimal.
   *  `fontFamilyStack`: a `fontFamily` (or `…FontFamily`) holding a CSS font
   *  stack; the text is set in the stack's first family.
   *  `sideColumnPercentClamped`: a `oneAndHalf` layout's
   *  `sideColumnPercent` that would leave one of its columns with no width
   *  (or is not a number); the columns are cut at `used` percent instead.
   *  `cjkGridClamped`: a character grid (`cjk.grid`) with more characters
   *  per line or lines per page than the margins leave room for; the grid
   *  is reduced to `used`.
   *  `unknownConfigKey`: a key the heading settings or a paragraph style do
   *  not have (`headings`, `headings.balancing`, a heading level, a heading
   *  style, a paragraph style — and the same under
   *  `htmlViewer.overrides`), such as a misspelt `letterSpacng`; the
   *  engine ignores it. `value` is the key, `used` is empty, and
   *  `suggestion` names the key it is closest to, when one is close. */
  kind: 'unknownNumberFormat' | 'fontFamilyStack' | 'sideColumnPercentClamped' | 'unknownConfigKey' | 'cjkGridClamped';
  /** Where the value sits in the config, e.g.
   *  `orderedLists.levels[1].numberFormat`, `header.elements[0].fontFamily`,
   *  `headingStyles[2].layout.sideColumnPercent`. */
  path: string;
  /** The value as written (the key itself, for `unknownConfigKey`). */
  value: string;
  /** The value the engine used instead (`arabic` / `decimal`, the first
   *  family of the stack, the side column's percent); empty for an
   *  `unknownConfigKey`, which is ignored. */
  used: string;
  /** `unknownConfigKey` only: the known key the unknown one is closest to
   *  (another case, a letter or two apart), when there is one. */
  suggestion?: string;
}

/** Where a content warning points: the source range of the construct in
 *  the markdown given to the build (frontmatter included), and the page it
 *  was placed on. Both are absent when the construct has no place in the
 *  text (a style id set on a resource that is never placed) or put nothing
 *  on a page (an embed of an unknown id). */
interface ContentWarningBase {
  sourceStart?: number;
  sourceEnd?: number;
  pageIndex?: number;
}

/** A reference the build could not resolve, or markup it did not
 *  recognise and set in a fallback: the output is complete but not what the
 *  source asked for. Computed from the source before layout (see
 *  `collectContentWarnings`); the build lists them in
 *  {@link VDTDocument.contentWarnings}. Narrow on `kind` — further kinds may
 *  be added in minor releases. */
export type ContentWarning = ContentWarningBase & (
  /** A `::resource{id}` embed, an inline `:ref{id}` or a table cell's
   *  image names a resource id no resource has: the embed is left out, the
   *  reference prints `?` (or its `text=` label) with no number or link, the
   *  cell stays text-only. `inResource` names the
   *  resource whose caption, note or cell holds the reference. */
  | { kind: 'unknownResourceId'; resourceId: string; usage: 'embed' | 'ref' | 'cellImage'; inResource?: string }
  /** An identifier (`{#id}`, `:anchor{#id}`) set more than once in the
   *  document: references reach its first setting only (#261). */
  | { kind: 'duplicateAnchor'; anchorId: string }
  /** A `:::name` line whose name is neither a directive nor a container:
   *  it is set as text. */
  | { kind: 'unknownDirective'; name: string }
  /** A `::name` line that is not a well-formed embed standing alone —
   *  `::resource{id="…"}` with double quotes and no other attribute, after
   *  a blank line: it is set as text. */
  | { kind: 'malformedEmbed'; name: string }
  /** `:::paragraphs{style}` names no paragraph style: the paragraphs are set
   *  as body text. */
  | { kind: 'unknownParagraphStyle'; style: string }
  /** `:::callout{type}` names none of the configured callout styles: the box
   *  takes the first one. Not raised while `calloutStyles` is unset or
   *  empty (every type is then the built-in plain box). */
  | { kind: 'unknownCalloutType'; type: string }
  /** `:chip[…]{style}` names no chip style: the chip takes the first one.
   *  `inResource` names the resource whose caption, note or cell holds it. */
  | { kind: 'unknownChipStyle'; style: string; inResource?: string }
  /** A footnote marker `[^id]` with no `[^id]: …` definition in the
   *  document: the number prints, the note is empty. Points at the first
   *  such marker. */
  | { kind: 'undefinedFootnote'; id: string }
  /** A footnote definition `[^id]: …` no marker cites: it is not set. */
  | { kind: 'unusedFootnote'; id: string }
  /** An index mark (`:index{…}`) with no term — no `term` attribute and no
   *  bracketed text: it indexes nothing. */
  | { kind: 'indexMarkInvalid' }
  /** A `see` / `seealso` of an index mark names no entry of its index: the
   *  cross-reference still prints. Points at the `:::index` line. */
  | { kind: 'indexSeeUnknown'; target: string; index: string }
  /** A page range of the index opened (`range="start"`) and never closed,
   *  or closed with no opening (`missing: 'start'`): it prints as a single
   *  page. Points at the `:::index` line. */
  | { kind: 'indexRangeUnclosed'; term: string; missing: 'start' | 'end'; index: string }
  /** A heading's `{style}` attribute names no heading style: the heading
   *  and its section keep the level's own settings. */
  | { kind: 'unknownHeadingStyle'; style: string; level: number }
  /** A table resource's `table.styleId` names no `tableStyles` entry: the
   *  table is set in the document's `tableStyle`. */
  | { kind: 'unknownTableStyle'; styleId: string; resourceId: string }
  /** A table's grid is not rectangular once its merges are counted (see
   *  `tableGridIssues`): cells are laid out by their array index, so a cell
   *  left out HTML-style under a `colSpan` / `rowSpan` shifts the cells
   *  after it (`spanOverlap`: a visible cell sits under a merge instead of
   *  carrying `hiddenBy`), or a row ends short and leaves a hole
   *  (`missingCells`). `row` / `col` locate the first issue; `count` is
   *  how many the table has. */
  | { kind: 'raggedTableGrid'; resourceId: string; reason: 'spanOverlap' | 'missingCells'; row: number; col: number; count: number }
  /** A justified line of CJK text that would need more space between its
   *  characters than the cap (½ em, or `bodyText.maxJustifyTracking` when
   *  set) to reach the measure: it is set with the cap and ends short
   *  (`VDTLine.cjkLoose`). Usually the line before a long Latin word or web
   *  address that cannot break. `text` is the line's text. Found by the
   *  layout, so `collectContentWarnings` never returns it. */
  | { kind: 'cjkLooseLine'; text: string }
  /** A paragraph with Chinese marks (emphasis dots, proper-name or
   *  book-title lines, #193) whose line gap is narrower than the marks
   *  need: half an em for marks on one side of the text, five eighths for
   *  marks on both sides (clreq §5.6.1). The line pitch never changes for
   *  them, so they crowd the next line: give the paragraph more leading.
   *  `gapEm` is the gap (line height less the text size) and `neededEm`
   *  what the marks need, in em of the text. */
  | { kind: 'cjkMarksExceedLeading'; text: string; gapEm: number; neededEm: number }
  /** A paragraph with ruby readings over or under its text (#194) whose
   *  line gap is narrower than the readings: they overlap the next line.
   *  `gapEm` and `neededEm` in em of the text. */
  | { kind: 'rubyExceedsLeading'; text: string; gapEm: number; neededEm: number }
  /** Markup typed with fullwidth characters, as a Chinese or Japanese
   *  input method types it: a `：：：` fence, a `＃` heading, a `［＾…］`
   *  footnote marker, `｛…｝` attributes after a fence or heading, or
   *  `＊＊…＊＊` bold. The parser reads only the ASCII forms, so the line
   *  is set as text. `typed` is the markup as written, `ascii` the form
   *  to type (#181). One per line. */
  | { kind: 'fullwidthMarkup'; typed: string; ascii: string }
  /** An attribute key with letters outside ASCII (`作者=曹雪芹`): keys are
   *  ASCII, so the attribute is not read. Points at the key (#181). */
  | { kind: 'attributeKeyInvalid'; key: string }
  /** A resource whose `placement.rotate` asks for a quarter turn, in a
   *  document set vertically (`layout.writingMode: 'vertical-rl'`): every
   *  figure and table of a vertical flow stands upright, so the turn is
   *  not applied, and the resource floats in its own `span` (#188). Points
   *  at its first use. */
  | { kind: 'rotateIgnoredVertical'; resourceId: string }
);

/** What a build reports in `VDTDocument.warnings`: a construct the layout
 *  had to force ({@link CalloutOverflowWarning}), with the shape it has had
 *  since postext 1.4. What the source names wrongly is in
 *  {@link VDTDocument.contentWarnings} instead. */
export type LayoutWarning = CalloutOverflowWarning;

/** Reported by the renderers (canvas, HTML, PDF) through their `onWarning`
 *  option while they paint — never stored in the VDT, since what a host
 *  can supply changes after the layout. */
export interface MissingImageWarning {
  /** `missingImage`: an image (figure, table-cell image, callout icon or
   *  design image) had no picture to draw — nothing registered for it
   *  (canvas), no URL (HTML), no or undecodable bytes (PDF) — and was
   *  painted as a neutral placeholder. */
  kind: 'missingImage';
  /** The payload id the host resolves (`registerResourceImage`,
   *  `resourceImageUrl`, `resourceBytes`). */
  fileId: string;
  /** The resource the image belongs to, when the painter knows it (a
   *  figure or a cell image; not a callout icon or design image). */
  resourceId?: string;
  /** Page of the first placeholder, in its document. */
  pageIndex: number;
  /** Which of the documents given to a multi-document render (a book
   *  rendered to one PDF) the page belongs to. */
  documentIndex?: number;
}

/** Warnings a renderer reports while painting. */
export type RenderWarning = MissingImageWarning;

export interface VDTDocument {
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
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/** What a design image block records of the resource picture `fileId`
 *  (already picked from `resource`): its kind, which decides whether
 *  `diagramStyle.singleInk` tints it, and an SVG's print master. */
export function pictureTraits(
  resource: Resource | undefined,
  fileId: string,
): Pick<VDTDesignImageBlock, 'imageKind' | 'pdfFileId'> {
  if (resource?.bitmap?.fileId === fileId) return { imageKind: 'bitmap' };
  const svg = resource?.svg;
  if (svg?.fileId !== fileId) return {};
  return { imageKind: 'svg', ...(svg.pdfFileId ? { pdfFileId: svg.pdfFileId } : {}) };
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
