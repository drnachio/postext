import type {
  ColorPaletteEntry,
  DocumentMetadata,
  PostextResource,
  Resource,
  ResourceSafeArea,
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
  ResolvedVideoStyleConfig,
  ResolvedVideoPlayerOptions,
  VideoSource,
  ResolvedParagraphStyleConfig,
  ResolvedCalloutStyleConfig,
  ResolvedChipStyleConfig,
  CalloutSpan,
  CalloutPlacement,
  ResolvedUnorderedListsConfig,
  ResolvedOrderedListsConfig,
  ResolvedMathConfig,
  ResolvedPdfGenerationConfig,
  ResolvedPrintConfig,
  ResolvedFolioConfig,
  ResolvedDesignSlot,
  ResolvedPartsConfig,
  ResolvedHeadingStyleConfig,
  ResolvedTocConfig,
  ResolvedIndexConfig,
  ResolvedFootnotesConfig,
  ResolvedCrossRefsConfig,
  ResolvedCitationsConfig,
  ResolvedCjkConfig,
  CjkRegion,
  PageRole,
  PartState,
  PostextConfig,
  FolioPaperConfig,
  ResolvedComicsConfig,
  ResolvedLineNumbersConfig,
  ResolvedCodeStyleConfig,
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
  videoStyle: ResolvedVideoStyleConfig;
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
  /** Citations and the bibliography (#270). */
  citations: ResolvedCitationsConfig;
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
  | 'callout'
  /** A line of a code listing (#624): one line per source line, set as
   *  written (see `VDTLine.codeLine`), inside the listing's box. */
  | 'code';

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
  /** Paint this run right to left (its bidi level is odd), as
   *  {@link VDTLineSegment.rtl}: shaped as one run, its brackets mirrored.
   *  The engine cuts a chip's runs where the direction changes. Absent on
   *  left-to-right runs. */
  rtl?: true;
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
  /** The order in which renderers advance through `runs` from the box's
   *  start (indices into it), when it is not 0, 1, … n − 1: as
   *  {@link VDTLine.order}, the visual order of the runs (UAX #9 L2 on
   *  the chip's own text, its base direction that of its first strong
   *  letter) in a left-to-right frame, its reverse on a mirrored page.
   *  Absent on a chip with no right-to-left run. */
  order?: number[];
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
  /** A footnote marker set in the line gap (`footnotes.markerPosition:
   *  'side'`, the interlinear 合印 of JLReq §4.2.3): `text` is the marker
   *  (read in copied text and by assistive technology), but renderers paint
   *  `runs` instead, placed from where the segment starts as a ruby
   *  reading is — over the line (right of a vertical one), ending where
   *  the character before it ends. The segment takes no advance of its own:
   *  its `width` is 0, or the inter-character gap of a justified CJK line
   *  that follows the character it marks. Absent on every other segment. */
  sideMarker?: { runs: VDTAnnotationRun[] };
  /** Set on the second and later segments of one `:ref` painted as several
   *  runs (a label in small capitals: one run per case). Such a segment
   *  continues the previous one's reference: it takes no plain-text char of
   *  its own, and renderers extend that segment's link (one anchor, one
   *  annotation, one `Link` element) instead of opening another. */
  refContinues?: boolean;
  /** A space of a bibliography entry's label column (#290): its width is
   *  set, so renderers paint the line segment by segment. */
  labelTab?: true;
  /** A leader (#622): the dots of a contents row, or of a tab stop in body
   *  text, painted over the room before the text at the stop. `'text'`:
   *  `text` is the run of the leader character, painted like a word;
   *  `'rule'`: a line drawn across the segment's `width` a little under the
   *  baseline (`text` is empty). A leader is no character of the
   *  paragraph: it is not in the line's `text`, copied or extracted text,
   *  search or the source map; the HTML viewer hides it from assistive
   *  technology and the tagged PDF paints it as an artifact. */
  leader?: 'text' | 'rule';
  /** A tab at its stop (#622; the `space` segment flagged `labelTab`, text
   *  `'\t'`): how the stop aligns the text after it and where it stands,
   *  px from the start edge of the measure (the measure being the line's
   *  box less its indent: `bbox.x` is that edge plus the line's indent).
   *  Read by outputs that cannot keep the stops exactly (the reflowable
   *  EPUB). */
  tab?: { align: import('./types').TabStopAlign; at: number };
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
   *  gap cannot be its `tracking`; and on the one-em space after a
   *  Japanese ？ or ！ (`cjk.spaceAfterQuestion`, #418), whose `text` is
   *  empty or the space typed there. */
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
  /** Kanbun reading marks on the segment's last character (訓点,
   *  `:kunten[…]`, #430): 返り点, 送り仮名 and a 竪点, painted from where
   *  the segment starts. The room the marks take after the character
   *  (`cjk.kunten.placement: 'inline'`) is the space segment that follows
   *  (`autospace`), never this segment's width. Absent otherwise. */
  kunten?: VDTKunten;
  /** The segment is the part of a warichu note (双行夹注, #195) set on this
   *  line: its `text` is the upper row then the lower one (so the plain
   *  text, search and the source map read the note once, in order), and
   *  renderers paint the two rows (`runs`) instead of `text`. Its `width`
   *  is the wider row's advance. Absent otherwise. */
  warichu?: VDTWarichu;
  /** Characters the layout added (the 《》 or 『』 of `cjk.bookTitleMark:
   *  'brackets'`, the brackets of a warichu note): painted, and read in
   *  copied text, but no character of the plain text or the source. */
  inserted?: boolean;
  /** Paint this run right to left: its bidi embedding level (UAX #9) is
   *  odd. The segment's `text` stays in logical order; a renderer shapes it
   *  as one right-to-left run, which reverses it and mirrors its brackets
   *  (HarfBuzz applies `rtlm` and the Unicode mirroring pairs). The engine
   *  cuts segments at level boundaries, so a segment never mixes
   *  directions. Absent on left-to-right runs. */
  rtl?: true;
  /** The language of the segment's text when the author named one on the
   *  isolate it is in (`:ltr[…]{lang=en}`, `:rtl[…]{lang=fa}`; the
   *  innermost that names one), a BCP 47 tag as written. Renderers declare
   *  it (HTML `lang`, PDF `/Lang`). Absent otherwise. */
  lang?: string;
  /** The run's UAX #9 embedding level, when it is more than 1 (a number or
   *  a Latin word inside an Arabic phrase inside an English paragraph) or a
   *  renderer needs it for tagging and `/ActualText`. Absent otherwise:
   *  `rtl` gives level 1, its absence level 0. */
  level?: number;
  /** Styled sub-runs of one atomic word: a style change inside an Arabic
   *  word (`كتا**ب**`) must not cut the word, or its letters lose their
   *  joining forms. The segment is painted as one shaped run whose clusters
   *  take each sub-run's style; the runs' texts concatenate to `text`.
   *  Absent on a segment set in one style. */
  runs?: { text: string; bold?: boolean; italic?: boolean; color?: string }[];
  /** The tatweels (U+0640) kashida justification inserted into this word
   *  (`bodyText.kashida`, #375), as offsets into `text`, ascending: they
   *  are painted with the word (the font joins them into its elongation)
   *  and counted in `width`, but they are no character of the source, so
   *  plain text, source maps, links and copied or extracted text leave
   *  them out (`writtenText` in `measure/kashida.ts`). A tatweel the author
   *  typed is not listed. Absent when none was inserted. */
  kashida?: number[];
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
  /** The side line (傍線, `:sideline[…]`, #421) the text belongs to: its
   *  run, how it is drawn and on which side (in the flow frame, as
   *  `dots`). */
  sideline?: { id: number; style: 'solid' | 'double' | 'wavy' | 'dotted'; position: 'over' | 'under' };
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
  /** The annotation the reading belongs to (#422): segments of one line
   *  with the same id are one ruby (a jukugo word, or a mono ruby written
   *  as one), adjacent in `segments`, so a renderer can set them as one
   *  `<ruby>` with a reading per base. Unique within a block (a word cut
   *  by a line break keeps its id on both lines). Set on rubies laid out by
   *  the Japanese rules (`cjk.ruby.overhang` / `align` other than the
   *  clreq defaults, as in every Japanese document, or `mode` / `align`
   *  written on the ruby); absent elsewhere: each segment's reading is an
   *  annotation of its own. */
  id?: number;
  /** One character of a jukugo ruby (熟語ルビ, JLReq §3.3.7, #422): its
   *  reading is its own (`text`), painted by its base or, when the word
   *  shares its reading, as part of the word's. */
  jukugo?: true;
  /** Colour of the reading (hex); unset: the text colour. */
  color?: string;
  /** What is painted: the reading, or its zhuyin symbols one by one; a
   *  Japanese reading spread 1:2:1 one run per character. `dx` is from the
   *  base segment's start and may fall before it or past its width (a
   *  reading running onto a neighbour). */
  runs: VDTAnnotationRun[];
}

/** The kanbun marks of a segment (see {@link VDTLineSegment.kunten}). */
export interface VDTKunten {
  /** The 返り点 and the 送り仮名 as written (the 送り仮名 are read after
   *  the character: accessible and copied text read `學ビテ`); unset when
   *  the directive gives none. */
  kaeri?: string;
  okuri?: string;
  /** The marks' font (CSS shorthand at their size). */
  fontString: string;
  /** Colour of the marks (hex); unset: the text colour. */
  color?: string;
  /** What is painted: the 返り点 (`role: 'kaeri'`, a combined form such as
   *  一レ as two runs) and the 送り仮名 (`role: 'okuri'`), each a vertical
   *  run on a vertical line. */
  runs: (VDTAnnotationRun & { role: 'kaeri' | 'okuri' })[];
  /** The 竪点 joining the character to the next one (JIS X 4051 §5.7): a
   *  thin rule along the line from `dx` (from where the segment starts),
   *  `length` px long, centred `dy` px from the line's baseline (flow
   *  frame, as a run's `dy`), `thickness` px across. */
  tate?: { dx: number; dy: number; length: number; thickness: number };
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
 * A mark the layout set on a line (#193, #421): an emphasis dot, circle or
 * sesame on one character, or a line along a run: the proper-name line,
 * the wavy book-title line, a side line (傍線: `line`, `double`, `wavy`,
 * `dotted`). Geometry is in the flow frame, relative to the line: `x` px
 * along the line from `VDTLine.bbox.x` (where the painted text starts:
 * alignment and justified word spaces included), `y` px from the line's
 * baseline across it (positive: towards the line's foot, the left of
 * vertical text). A sesame's lens is drawn as it stands on the sheet
 * (leaning like ﹅), so a renderer painting a vertical page turns it back
 * against the page's quarter turn.
 */
export interface VDTLineMark {
  kind: 'dot' | 'circle' | 'sesame' | 'line' | 'wavy' | 'double' | 'dotted';
  /** A dot's centre; a line's start (`double`: midway between its two
   *  rules). */
  x: number;
  y: number;
  /** A dot's diameter (a sesame's length; the diameter of each dot of a
   *  `dotted` line). */
  size?: number;
  /** A line's length along the line. */
  length?: number;
  /** `double`: how far apart the centres of its two rules are. `dotted`:
   *  how far apart the centres of its dots are, the first dot touching
   *  `x` and the last `x + length` (the layout sets a pitch that comes out
   *  even). */
  gap?: number;
  /** Stroke width: a line, each rule of a double line, a wave, an open
   *  dot's outline. */
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
  /** The line ends at a forced line break the author typed inside the
   *  paragraph (#620: a backslash ending a source line, or `\\`): it is set
   *  at its natural width like a last line ({@link isLastLine} is set), the
   *  paragraph goes on on the next line, copied text takes a line feed
   *  there, the reflowable EPUB a `<br/>`. Absent otherwise. */
  hardBreak?: true;
  /** The line holds a tab that went to a tab stop (#622): its `space`
   *  segment flagged `labelTab`, `text` `'\t'`, is as wide as the stop asks,
   *  followed, when the stop has a leader, by the leader's segment and the
   *  gap after it (an empty `space`). The widths are final: in a justified
   *  paragraph the line is {@link ragged} and the measurer gave the slack
   *  to the word spaces after the last tab; in a centred or right-aligned
   *  one a last empty `space` fills the line to its measure, so every
   *  renderer sets it from its start side. Absent otherwise. */
  tabbed?: true;
  /** Set ragged inside a justified paragraph: a line a URL made unfillable
   *  (its few word spaces would stretch past the loose-line threshold), a
   *  CJK line flagged {@link cjkLoose}, or a line holding a tab stop
   *  ({@link tabbed}). */
  ragged?: boolean;
  /** A justified CJK line that needed more inter-character spacing than the
   *  cap (½ em, or `bodyText.maxJustifyTracking` when it is set): it is set
   *  with the cap, short of the measure and {@link ragged}, and reported as
   *  a `cjkLooseLine` content warning. Typically the line before a long
   *  Latin word or web address that cannot break. Absent otherwise. */
  cjkLoose?: boolean;
  /** The line holds a word of a joining script (Arabic, Syriac, N'Ko…)
   *  wider than its measure. Such a word is never cut between its letters
   *  (its pieces would lose their joining forms), so it runs past the
   *  measure, and the build reports an `unbreakableWordOverflow` content
   *  warning. Absent otherwise. */
  wordOverflow?: true;
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
  /** How far the ink of the line's words that carry Arabic vowel marks
   *  (ḥarakāt, #376) reaches above (`above`) and below (`below`) its
   *  baseline, px: the marks stack past the letters and may leave the
   *  line's box, and the renderers' column clip takes them in
   *  (`columnClipRect`). Measured from the glyphs' ink when the measurer
   *  gives it, else estimated. Absent on a line with no such mark. */
  markInk?: { above: number; below: number };
  /** Tracking this line takes on top of its block's (`VDTBlock.letterSpacing`),
   *  px after every glyph — negative tightens: a justified line its word
   *  spaces alone would set past `bodyText.maxWordSpacing` or
   *  `minWordSpacing`, within `bodyText.maxJustifyTracking`. Measured into
   *  the widths of its text segments; renderers paint the line with the sum
   *  of both. Absent when the line takes none. */
  letterSpacing?: number;
  /** The order in which renderers advance along the line through
   *  `segments` (indices into it), when it is not 0, 1, … n − 1. The
   *  engine computes it from the paragraph's bidi levels (UAX #9 L1/L2):
   *  the visual order, left to right on the sheet, in a left-to-right
   *  frame; its reverse in a mirrored (right-to-left) frame, which turns
   *  the whole flow. Segments stay in logical order, so copied text, links
   *  and tagging read them as written. Absent on a line with no
   *  right-to-left run. */
  order?: number[];
  /** The span the line's text fills and aligns in, when it is not
   *  `[bbox.x, right edge of the block]`: set on the lines of a block whose
   *  direction opposes its frame's (an English quotation in an Arabic book),
   *  whose indent and ragged edge fall on the other side. Absent
   *  otherwise. Its start side is the right of the span: renderers align
   *  the line there (see {@link lineTextAlign}). */
  measure?: { x: number; width: number };
  /** How many kashidas (tatweels, U+0640) justification inserted into the
   *  line's words, for warnings and overlays. The tatweels themselves are in
   *  the segments' text, and each segment lists where
   *  ({@link VDTLineSegment.kashida}); copied and extracted text leaves them
   *  out. The line's `bbox.width` counts them, and its spaces take only
   *  what they leave of the slack. Absent when there are none. */
  kashida?: number;
  /** A line of a `:::verse` poem (#378): which bayt of the poem it sets
   *  (0-based) and what of it: `'bayt'`, the whole bayt, its ṣadr on the
   *  start side and its ʿajuz on the end side with the gap between them
   *  (a `space` segment flagged `labelTab`, whose `text` is the tab the
   *  plain text has there), each hemistich set to the poem's common width;
   *  `'sadr'` and `'ajuz'`, a bayt too wide for that set staggered on two
   *  lines or more, the ṣadr flush with the start side and the ʿajuz with
   *  the end; `'single'`, a line of one hemistich, centred. The widths of
   *  the line's segments are final (the block is set flush left): renderers
   *  paint them as they are. A column or page never breaks between two
   *  lines of one bayt. Absent on any other line. */
  verse?: { bayt: number; part: 'bayt' | 'sadr' | 'ajuz' | 'single' };
  /** A line of a `:::verse` poem in the line layout (#620): the stanza it
   *  sets (0-based, in its poem), the line of verse (0-based, counted
   *  through the whole poem) and whether it is a turnover, the part of a
   *  line of verse too wide for the measure set on the line after it. A
   *  column or page never breaks between a line and its turnover.
   *  `indent` is the line's indent (px, from the poem's start side: its
   *  leading spaces × `indentStep`, or where a stepped line starts), set
   *  on its first line when not 0. `stanzaEnd` is set on the last line of
   *  a stanza another follows (copied text puts a blank line there). The
   *  widths of the line's segments are final (the block is set flush
   *  left): renderers paint them as they are. Absent on any other line. */
  verseLine?: { stanza: number; line: number; turnover: boolean; indent?: number; stanzaEnd?: true };
  /** A line of a code listing (#624, a `code` block): `line` is the source
   *  line it sets (0-based in the listing), `number` its printed number
   *  when the listing is numbered (never on a continuation), `continued`
   *  a continuation of a wrapped line, `highlight` a line the fence's
   *  `highlight` names, `wrapped` a line that goes on in the next one,
   *  `clipped` a line cut at the box's edge. The segments carry final
   *  widths from the block's left edge (spaces are kept, never
   *  stretched). Absent on any other line. */
  codeLine?: { line: number; number?: string; continued?: true; highlight?: true; wrapped?: true; clipped?: true };
  /** The first line of an entry of a back-of-book index (`:::index`): the
   *  entry's level (0 a main entry, 1 a sub-entry…). A block of the index
   *  may set more than one entry (the page-less entries heading its
   *  sub-entry, see {@link VDTBlock.indexLevel}); its other lines are the
   *  entries' turnover lines, and a line before the first entry is the
   *  group's letter. Absent on any other line. */
  indexLevel?: number;
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
  /** The rules of a `'booktabs'` table (#625), computed by the layout: the
   *  renderers stroke exactly these, in `borderColor`, and skip the
   *  {@link rules} pattern (and the rounded frame). Coordinates are
   *  relative to the table body's top-left corner, like {@link rowEdges};
   *  each stroke is centred on its line. `borderWidthPx` is then the
   *  widest stroke. Absent for the other patterns. */
  strokes?: VDTTableStroke[];
  /** Radii (px) of the outer frame's corners — top-left, top-right,
   *  bottom-right, bottom-left — from `tableStyle.borderRadius`, clamped to
   *  half the table's width and height. The frame is stroked round and the
   *  cell fills are clipped to it. A part of a split table keeps square the
   *  corners where it continues. Absent for a square frame. */
  frameRadii?: [number, number, number, number];
}

/** One rule of a table (`VDTResourceTableLayout.strokes`): a straight
 *  line from `(x1, y1)` to `(x2, y2)`, `widthPx` thick, with butt ends. */
export interface VDTTableStroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  widthPx: number;
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
export interface VDTVerticalFlowFrame {
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

/**
 * The frame a right-to-left page's flow is laid out in (`VDTPage.flow`,
 * a document whose resolved `direction` is `'rtl'`). The engine sets a
 * right-to-left page as the mirror image of a left-to-right one: the flow
 * is laid out exactly as a left-to-right page (first column at the flow's
 * left, list markers and indents at the left, the footnote rule at the
 * left end, page numbers of the contents at the right…) and the frame
 * turns it over the sheet's vertical axis, a flow point `(x, y)` landing
 * at page `(mirror.originX − x, y)` (`originX` = `page.width`). So the
 * first column stands on the right, markers and indents on the right, and
 * a right-bound book's recto, whose spine is on its right, has it on the
 * flow's left, where a left-bound book's recto has it (see
 * `flowPageMirrored` in the pipeline).
 *
 * Renderers paint the flow through the mirror and turn every glyph run,
 * picture and formula back about its own box, so text and images never
 * read mirrored; rules, frames and backgrounds paint mirrored as they
 * are. Within a line the segments advance along the flow's x axis in
 * `VDTLine.order`, which on such a page is the reverse of their visual
 * order on the sheet.
 */
export interface VDTMirroredFlowFrame {
  writingMode: 'horizontal-tb';
  direction: 'rtl';
  mirror: {
    /** Page x the flow's x is measured back from: `page.width`. */
    originX: number;
  };
}

/** The frame a page's flow is laid out in, when it is not the sheet's
 *  own: a vertical page's ({@link VDTVerticalFlowFrame}) or a right-to-left
 *  page's ({@link VDTMirroredFlowFrame}). */
export type VDTFlowFrame = VDTVerticalFlowFrame | VDTMirroredFlowFrame;

/** Where the ideographic em box's centre sits above the alphabetic
 *  baseline, in ems, when the font was not measured: the value of every
 *  Source Han / Noto CJK face (em box from −0.12 to 0.88 em). */
export const DEFAULT_CENTRAL_BASELINE = 0.38;

/** The page's flow frame when the flow is set vertically, else
 *  `undefined`. */
export function verticalFlowOf(page: Pick<VDTPage, 'flow'>): VDTVerticalFlowFrame | undefined {
  const flow = page.flow;
  return flow && flow.writingMode === 'vertical-rl' ? flow : undefined;
}

/** Whether a page's flow is set vertically (`page.flow` is a
 *  `'vertical-rl'` frame). */
export function pageIsVertical(page: Pick<VDTPage, 'flow'>): boolean {
  return page.flow?.writingMode === 'vertical-rl';
}

/** Whether a page's flow is laid out mirrored, right to left
 *  ({@link VDTMirroredFlowFrame}). */
/**
 * The side a line is set from, as the renderers align it (#371): its
 * block's `textAlign`, except on a line with a {@link VDTLine.measure} (a
 * block set against its frame's direction), whose start side is the right
 * of its span: `left` (the start; also the last line of a justified
 * paragraph, `justify` coming back as `right`) is flush right, `right` (the
 * end) flush left, and a centred line stays centred. A justified line that
 * is not its paragraph's last is filled across the span either way.
 */
export function lineTextAlign(line: Pick<VDTLine, 'measure'>, textAlign: TextAlign): TextAlign {
  if (!line.measure) return textAlign;
  return textAlign === 'right' ? 'left' : textAlign === 'center' ? 'center' : 'right';
}

/** A rule leader (`VDTLineSegment.leader: 'rule'`, #622) at a text size of
 *  `fontSizePx`: its centre `dy` px under the baseline and its stroke
 *  `thickness` px, the same on every renderer. */
export function leaderRuleGeometry(fontSizePx: number): { dy: number; thickness: number } {
  return { dy: fontSizePx * 0.1, thickness: Math.max(0.5, fontSizePx * 0.05) };
}

export function pageIsMirrored(page: Pick<VDTPage, 'flow'>): boolean {
  return page.flow?.writingMode === 'horizontal-tb' && page.flow.direction === 'rtl';
}

/** Map a point of a page's flow frame to page coordinates: the identity on
 *  a left-to-right horizontal page, `(page.width − y, x)` on a vertical
 *  one, `(page.width − x, y)` on a right-to-left one. */
export function flowToPage(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const flow = page.flow;
  if (!flow) return { x, y };
  if (flow.writingMode === 'horizontal-tb') return { x: flow.mirror.originX - x, y };
  const r = flow.rotation;
  return { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into the page's flow frame (the inverse of
 *  {@link flowToPage}; the mirror is its own inverse). */
export function pageToFlow(page: Pick<VDTPage, 'flow'>, x: number, y: number): { x: number; y: number } {
  const flow = page.flow;
  if (!flow) return { x, y };
  if (flow.writingMode === 'horizontal-tb') return { x: flow.mirror.originX - x, y };
  const r = flow.rotation;
  return { x: y - r.originY, y: r.originX - x };
}

/** Map an axis-aligned rect of a page's flow frame to the page: width and
 *  height swap on a vertical page; a right-to-left page mirrors it. */
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
export function verticalFlowFrame(width: number, height: number): VDTVerticalFlowFrame {
  return {
    writingMode: 'vertical-rl',
    rotation: { direction: 'cw', originX: width, originY: 0, width: height, height: width },
  };
}

/** The flow frame of a right-to-left page `width` px wide (physical). */
export function mirroredFlowFrame(width: number): VDTMirroredFlowFrame {
  return { writingMode: 'horizontal-tb', direction: 'rtl', mirror: { originX: width } };
}

/** The play mark printed on a video's poster (#454). `rect` is relative to
 *  the top-left corner of the body (`bodyRect`). */
export interface VDTVideoPlayMark {
  rect: BoundingBox;
  shape: 'circle' | 'rounded' | 'triangle';
  /** The triangle (hex). */
  color: string;
  /** The disc or rectangle behind it (hex); the triangle's outline for the
   *  bare `'triangle'`. */
  background: string;
  backgroundOpacity: number;
}

/** The QR code printed on a video's poster (#454). `rect` is the plate,
 *  quiet zone included, relative to the top-left corner of the body. */
export interface VDTVideoQr {
  rect: BoundingBox;
  /** What the code holds: the address it opens. */
  text: string;
  /** Modules per side, without the quiet zone. */
  size: number;
  /** One string per row, `'1'` for a dark module. */
  rows: string[];
  /** Light modules between the code and the plate's edge. */
  quietZone: number;
  /** Side of one module in px. */
  moduleSize: number;
  color: string;
  background: string;
  /** Corner radius of the plate in px. */
  radius: number;
}

/** A video resource as the outputs need it (#454): where it plays from, the
 *  player options, and the overlays printed on its poster. */
export interface VDTResourceVideo {
  source: VideoSource;
  /** The address a reader is sent to: the YouTube or Vimeo page, or a
   *  self-hosted file's production address. Absent when there is none. */
  link?: string;
  /** The YouTube or Vimeo player's `src` (the player options applied). */
  embedUrl?: string;
  /** A self-hosted file: its out-of-band id. */
  fileId?: string;
  /** A self-hosted video's media type, of its file or of its address alone
   *  (`application/vnd.apple.mpegurl` for an HLS stream, see
   *  `isHlsMimeType`). */
  mimeType?: string;
  /** Play range in seconds. */
  start?: number;
  end?: number;
  player: ResolvedVideoPlayerOptions;
  /** Make the poster a link to {@link link} (`videoStyle.linkPoster`, and
   *  a link to make). */
  linkPoster: boolean;
  /** What the HTML output sets (`videoStyle.html`). */
  html: 'player' | 'poster';
  playMark?: VDTVideoPlayMark;
  qr?: VDTVideoQr;
}

export interface ResolvedResourceBlock {
  /** The source resource. */
  resource: Resource;
  kind: 'bitmap' | 'svg' | 'table' | 'video';
  /** Present when `kind === 'video'`: playback and the poster's overlays
   *  (#454). The poster itself is `fileId` / `format`, drawn like a
   *  bitmap. */
  video?: VDTResourceVideo;
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
  /** For bitmap/svg: the part of the picture shown in `bodyRect`, in
   *  fractions of its intrinsic size, when the engine cropped it within its
   *  safe area (`Resource.safeArea`). Absent: the whole picture fills
   *  `bodyRect`. Renderers scale the picture so this rectangle maps onto
   *  `bodyRect` and clip to `bodyRect`. */
  bodySource?: ResourceSafeArea;
  /** For a picture with a safe area: how many px its body could still
   *  shrink or grow from the height it is set at, by cropping outside the
   *  safe area (the room the fit and balancing levers have), and the px
   *  the levers already set it taller (`delta`, negative when shorter). */
  bodyFlex?: { shrink: number; grow: number; delta: number };
  /** For a floated picture scaled to the room of its slot
   *  (`placement.shrink`, #626): the share of its width it keeps, below 1.
   *  Absent when the picture is set at its size (or only cropped within
   *  its safe area). */
  shrinkScale?: number;
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

/**
 * A paragraph's drop cap (#623, {@link VDTBlock.dropCap}), in page
 * coordinates of the flow frame, as a list marker's are. The block's
 * lines do not hold it: its first line starts after it. Its plain text and
 * source range are the paragraph's own, so the block's `sourceMap` and the
 * first line's `plainStart` (which counts past it) read the word whole.
 */
export interface VDTDropCap {
  /** The initial as printed: its letters, with an opening mark set with
   *  the cap (`punctuation: 'with-cap'`). */
  text: string;
  fontString: string;
  /** Hex. */
  color: string;
  /** Left edge of the initial's advance. */
  x: number;
  /** The baseline it stands on: that of the paragraph's line `sink`. */
  baselineY: number;
  /** Its advance width. */
  width: number;
  /** Its size (px) and how many lines it spans and sinks. */
  fontSizePx: number;
  lines: number;
  sink: number;
  /** Source range of the characters it prints (an opening mark hung or set
   *  with it included). */
  sourceStart?: number;
  sourceEnd?: number;
  /** The paragraph's plain-text range it stands for, from 0 (the first
   *  line's `plainStart` counts past it). */
  plainStart: number;
  plainEnd: number;
  /** The whole first word as the paragraph reads it, the initial
   *  included ("Se" of "Se puso"): a tagged PDF gives it as the
   *  `/ActualText` of the initial and the rest of the word. */
  word: string;
  /** How many characters of the first line's text finish that word (the
   *  "e" of "Se"); 0 when the initial is a word of its own. */
  wordRest: number;
  /** An opening mark hung before the initial at text size
   *  (`punctuation: 'hang'`), on the first line's baseline. */
  hang?: { text: string; fontString: string; x: number; baselineY: number; width: number };
}

/** See {@link VDTBlock.stripCaption}. */
export interface VDTStripCaption {
  /** Index of the first caption line in the block's `lines`, and how many
   *  there are (an inline strip's placeholder line is the other one). */
  firstLine: number;
  lineCount: number;
  /** Under the strip or over it (`captionStyle.position`). */
  position: 'above' | 'below';
  /** The resource type the strip is counted in (`type=…`) and its number,
   *  when it is numbered; then also its `id`, when it has one: a `:ref`
   *  naming it links here (renderers set the target, as for a figure). */
  typeId?: string;
  number?: string;
  id?: string;
  /** The bar behind the caption (`captionStyle.backgroundEnabled`): its
   *  rect RELATIVE TO THE BLOCK'S BOX (flow coordinates), and its fill. */
  bar?: VDTCaptionBar;
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
  /** A bibliography entry (#269): the key of the work it lists. */
  bibEntry?: string;
  /** The paragraph style (`paragraphStyles[].id`) the block's text is set
   *  in: a paragraph of a `:::paragraphs{style=…}` container (the innermost
   *  one), a poem whose `:::verse` fence names a style. Every fragment of a
   *  split paragraph carries it. Metadata for other renditions (a
   *  reflowable EPUB); the layout does not read it. */
  paragraphStyleId?: string;
  /** A block of a back-of-book index (`:::index`): the level of the entry
   *  it sets (0 a main entry). The page-less entries heading that entry
   *  are set in the same block, above it; each entry's first line carries
   *  its own level ({@link VDTLine.indexLevel}). */
  indexLevel?: number;
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
  /** Set when the block's `*…*` runs (its segments flagged `italic`) are
   *  set upright with a rule over them (`bodyText.emphasis: 'overline'`,
   *  #376): the layout draws the rules as `VDTLine.marks`. Absent
   *  otherwise. */
  emphasis?: 'overline';
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
  /** A drop cap opening the paragraph (#623), on the fragment that holds
   *  its first line only: renderers paint it beside the lines, which were
   *  set short of it. */
  dropCap?: VDTDropCap;
  /** A code listing's lines (#624, `type: 'code'`): its language as the
   *  fence names it; when its lines are numbered, the numbers' face and
   *  colour and the room between them and the code (they are set in the
   *  page's `lineNumbers` slot, out of the text, right-aligned before the
   *  code); and how its lines were fitted when one was too wide. */
  code?: {
    lang?: string;
    numbers?: { gap: number; fontString: string; color: string };
    fit?: { mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale: number };
  };
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
  /** Base direction of the block's text (its paragraph embedding level),
   *  when it differs from its page frame's: a left-to-right island in a
   *  right-to-left book, an Arabic quotation in a left-to-right one.
   *  Absent when the block runs as its frame does. */
  direction?: 'ltr' | 'rtl';
  /** A comic strip (`:::strip`, #566) on a `type: 'resource'` block with no
   *  `resourceBlock`: its panels, split lines and lettering. Coordinates
   *  are relative to the top-left corner of the block's box ON THE SHEET
   *  (`flowRectToPage(page, block.bbox)`), physical whatever the page's
   *  writing mode or direction; renderers and the Sandbox read it through
   *  `comicBlockOnSheet` / `pageComics`, which move it onto the sheet.
   *  A strip narrower than its measure (`width`, #590) stands inside the
   *  box (`comic.frame` then starts away from the corner). */
  comic?: VDTComicPage;
  /** A strip's caption (`:::strip{caption=…}`, #590): its lines are the
   *  block's own `lines` (`stripCaption.lines` of them, from
   *  `firstLine`), set in the caption style — the block's fonts and colour
   *  are the caption's, and each segment carries its own font and colour
   *  (the label's) — and painted like the lines of any text block, in the
   *  flow. Present only on a strip block whose fence has a caption. */
  stripCaption?: VDTStripCaption;
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
export type BalanceLever = 'trailingCallout' | 'flexFigure' | 'heading' | 'listEnd' | 'afterDisplay' | 'afterFloat' | 'looseParagraph';

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
  /** `flexFigure`: px the picture was set taller, cropped within its safe
   *  area (`Resource.safeArea`); `spaceAbove` is then `0`. */
  bodyGrowth?: number;
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
  /** Paint this run right to left (its bidi level is odd), as
   *  {@link VDTLineSegment.rtl}: shaped as one run, its brackets mirrored,
   *  never tracked. Absent on left-to-right runs. */
  rtl?: true;
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
  /** The order in which renderers advance through `runs` from `xOffset`
   *  (indices into it), when it is not 0, 1, … n − 1. As
   *  {@link VDTLine.order}: the visual order of the runs (UAX #9 L1/L2 on
   *  the line, at the block's base direction) when the block is painted
   *  on the sheet or in a left-to-right flow, its reverse when it is
   *  painted in the flow of a mirrored page (an opener, a heading design,
   *  a contents part row). A line whose text needs the bidi algorithm is
   *  always set in `runs`, cut where the direction changes. Absent on a
   *  line with no right-to-left run. */
  order?: number[];
  /** The line of a wrapping text holds a word of a joining script (Arabic)
   *  wider than the room: such a word is never cut, so it runs past the
   *  box, and the build reports an `unbreakableWordOverflow` warning, as
   *  for {@link VDTLine.wordOverflow}. Absent otherwise. */
  wordOverflow?: true;
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
  /** Characters of `sourceText` printed before the mirrored text (#546): a
   *  heading number the design writes before `{titleText}`, "4. ". They map
   *  to the title's start; a caret or a selection of the title starts
   *  after them. Absent = none. */
  sourcePrefixLen?: number;
  /** Pagination furniture rather than document text — the title a split
   *  callout repeats on a continuation, its "Continued" marker: a tagged
   *  PDF marks it an artifact and the HTML hides it from assistive
   *  technology, so the text is read once. */
  artifact?: boolean;
  /** The base direction of the block's text (`DesignTextElement.direction`,
   *  by default the document's) when it is right to left: its lines'
   *  runs were ordered at that paragraph level, and an HTML line takes
   *  `dir="rtl"`. Absent for left-to-right text. */
  direction?: 'rtl';
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
 *  is set: the CJK region whose punctuation it takes, how many digits a
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

// ---------------------------------------------------------------------------
// Comic pages (`:::page`, #555–#563)
// ---------------------------------------------------------------------------

/** A point on the sheet (px). */
export interface VDTPoint {
  x: number;
  y: number;
}

/** The picture of a comic panel (or its pop-out cut-out): the whole picture
 *  is drawn at `box` (page px, uncropped, as `uncroppedPictureBox` gives)
 *  and clipped to the panel's polygon, so only `source` shows. */
export interface VDTComicArt {
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** The file the renderers draw (`registerResourceImage`). */
  fileId: string;
  /** The bitmap's format, for a bitmap. */
  format?: string;
  /** An SVG's vector print master (`Resource.svg.pdfFileId`): the PDF
   *  embeds its first page in place of the SVG. */
  pdfFileId?: string;
  /** Where the whole picture lands on the sheet (px). Larger than the cell
   *  on the axis a crop cuts; inside it on the axis a letterbox leaves. */
  box: BoundingBox;
  /** The part of the picture that shows, in fractions of the picture as
   *  stored (not flipped, even when `mirrored`). */
  source: BoundingBox;
  /** The picture is drawn flipped left to right inside `box` (a book read
   *  in the other direction than its art, `comics.mirrorArt`). */
  mirrored: boolean;
  /** The picture does not fill the cell: the bands it leaves show the
   *  panel background (`fit: 'contain'`, or a cell whose shape cannot hold
   *  the safe area under a cover crop). */
  letterbox: boolean;
}

/** One panel of a comic page, in reading order. Sheet coordinates (never a
 *  flow frame): a comic page is laid out on the sheet whatever the
 *  document's writing mode or direction. */
export interface VDTComicPanel {
  /** Position in reading order (0-based). */
  index: number;
  /** The panel's `#id`, when it has one. */
  id?: string;
  /** The panel's source: from its `::panel` line to the end of its last
   *  script line. */
  sourceStart: number;
  sourceEnd: number;
  /** The panel's outline (a convex polygon, clockwise on the sheet), the
   *  gutters already taken off; a bleeding side runs to the bleed box. */
  polygon: VDTPoint[];
  bbox: BoundingBox;
  /** Corner radius (px); 0 for a panel cut by a slanted line. */
  radius: number;
  border: { width: number; color: string; style: 'solid' | 'none' | 'rough' };
  /** Fill under the picture (hex), absent when transparent. */
  background?: string;
  art?: VDTComicArt;
  /** A transparent cut-out drawn over the border (broken-border art), with
   *  the same crop as `art`. */
  pop?: VDTComicArt;
  /** Text alternative of the picture: the panel's `alt`, else the
   *  resource's `altText`. */
  altText?: string;
}

/** A split line of a comic page (a gutter between two cells), as the
 *  Sandbox drags it: dragging moves the line and writes the new
 *  percentage into the `split` attribute (`moveComicSplitLine`). */
export interface VDTComicSplitter {
  /** Tree path of the list the line splits (indices of the items walked
   *  down from the top list; `[]` is the top list). */
  path: number[];
  /** The line between children `boundary` and `boundary + 1`. */
  boundary: number;
  /** `'rows'`: a line across the page (between tiers); `'columns'`: a line
   *  down it. */
  axis: 'rows' | 'columns';
  /** The line's centre, from its start end to its far end (page px). */
  a: VDTPoint;
  b: VDTPoint;
  /** The gutter the line sits in (px). */
  gutter: number;
  /** Bounding box of the cell the list splits: a drag of `d` px along the
   *  axis is `d / parent.height` (rows) or `d / parent.width` (columns) of
   *  it. */
  parent: BoundingBox;
  /** The line's position (cumulative percent of the parent) at its start
   *  end and at its far end; equal for a straight line. */
  startPercent: number;
  endPercent: number;
  /** The range `startPercent` may be moved in (the slant kept) so every
   *  cell keeps at least 5 %. */
  min: number;
  max: number;
  /** The range of the `split` attribute's value in the source. */
  sourceStart: number;
  sourceEnd: number;
}

/** A balloon, caption or sound effect of a comic page, in reading order and
 *  paint order. */
export interface VDTComicBalloon {
  id: string;
  panelIndex: number;
  order: number;
  /** What the script line is: a speaker's balloon, a caption, a sound
   *  effect or an editor's note (from its key: `caption`, `sfx`, `note`,
   *  else a speaker). Renderers and tagging go by it, not by the style id
   *  (a book may name a sound-effect style anything). */
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  /** The balloon style id (`speech`, `thought`…). */
  style: string;
  speaker?: string;
  /** The script line(s) it was set from. */
  sourceStart: number;
  sourceEnd: number;
  /** Balloons of one join group share one outline. */
  group: number;
  /** Body and tail(s) as one SVG path (page px), absent for a sound effect
   *  or a style with no outline. */
  shape?: {
    d: string;
    fill?: string;
    stroke?: string;
    strokeWidth: number;
    /** Dash pattern of the outline (a whisper), px. Painted over a solid
     *  stroke in the fill colour 3 × `strokeWidth` wide, so that the gaps
     *  between the dashes read as the balloon's ground, not the art. */
    dash?: number[];
    double?: { gap: number };
  };
  /** The lettering's lines (vertical or bidi text as design text); a ruby
   *  reading is a block of its own after its base's (marked `artifact`). */
  text: VDTDesignTextBlock[];
  bbox: BoundingBox;
  tailTip?: VDTPoint;
  /** Rotation in degrees about the bbox centre (sound effects). */
  rotate?: number;
  /** Lean of the letters in degrees about the bbox centre, applied before
   *  `rotate` (positive: the tops forward, as italic). Painters apply
   *  `translate(c) · rotate(rotate) · [1 −tan(skew); 0 1] · translate(−c)`
   *  (`comicBalloonMatrix`). */
  skew?: number;
  halo?: { width: number; color: string };
}

/** A comic page (`:::page`): its panels, the split lines between them and
 *  the lettering, on the sheet. Also the comic of a strip
 *  (`VDTBlock.comic`, relative to the block's box on the sheet) and each
 *  page of a two-page spread (`spread`: that page's panels clipped to its
 *  side of the spine, its split lines, its balloons, on its own sheet). */
export interface VDTComicPage {
  /** The `:::page` block in the source. */
  sourceStart: number;
  sourceEnd: number;
  /** The box the panels are cut from (the content area, or
   *  `comics.frame.margins`), page px. On a page of a spread, the part of
   *  the spread's frame on this page (from its outer edge to the spine); on
   *  a strip, the block's box (`x = y = 0`). */
  frame: BoundingBox;
  /** The reading direction the page was laid out in. */
  direction: 'ltr' | 'rtl';
  /** The side of a two-page spread (`:::page{spread}`, #567) this page
   *  holds, physical: the left page or the right one of the open book. */
  spread?: 'left' | 'right';
  /** Where the leaf the page was laid out on lies on the page, when it is
   *  not the page itself (`comics.viewerLeaf`: a host whose page is a
   *  screen, such as the Sandbox's HTML viewer, lays comic pages out on a
   *  print leaf scaled to fit it). Absent on paper. */
  leaf?: BoundingBox;
  /** Panels in reading order. */
  panels: VDTComicPanel[];
  splitters: VDTComicSplitter[];
  /** Reading order, paint order. */
  balloons: VDTComicBalloon[];
}

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
   *  the column bboxes. On a vertical or right-to-left page it is in flow coordinates (see
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
   *  rotation that composes with the frame to stand upright. Also present
   *  on every page of a right-to-left document ({@link VDTMirroredFlowFrame}):
   *  the same elements are then in flow coordinates mirrored onto the sheet
   *  (`x` → `page.width − x`), the header, the footer, crop marks and the
   *  background staying physical. Absent on left-to-right horizontal
   *  pages. */
  flow?: VDTFlowFrame;
  /** Page classification (see `PageRole`), stamped after placement by
   *  `classifyPages`. Drives the per-element `pages` filter of design
   *  slots. Absent until headers/footers are built. */
  role?: PageRole;
  /** The page's own paper colour (`#rrggbb`), when a part's or a styled
   *  section's palette overrides the entry `page.backgroundColor` links to:
   *  the salmon pages of a newspaper's business section. Absent on a page
   *  that paints the document's colour. The renderers paint it in place of
   *  `page.backgroundColor` (#506). */
  background?: string;
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
  /** Present on the pages laid out with content from inside a
   *  `:::paper{…}` container: the stock they are printed on, as the fence
   *  wrote it (nested fences merged, the inner one's fields winning), not
   *  resolved — unset fields follow `config.folio.paper`. Only the Folio
   *  viewer reads it; canvas, PDF and HTML ignore it. Absent on every other
   *  page. */
  paper?: FolioPaperConfig;
  /** Present on a comic page (`:::page`, `role: 'comic'`): its panels,
   *  split lines and lettering, in sheet coordinates. The page's columns
   *  are empty: nothing flows on it. */
  comic?: VDTComicPage;
  /** The line numbers printed on the page (`lineNumbers`, #621): one text
   *  block per number, physical like the header and footer, each flagged
   *  `artifact` (a tagged PDF marks it so, the HTML hides it from
   *  assistive technology and from selection). Absent on a page with
   *  none. */
  lineNumbers?: VDTDesignSlot;
  /** The line each block of {@link lineNumbers} labels, in the same order:
   *  for overlays and references. */
  lineNumberMarks?: VDTLineNumberMark[];
}

/** The line a printed line number labels (#621). */
export interface VDTLineNumberMark {
  /** The line's number in the count. */
  number: number;
  /** The number as printed (in `lineNumbers.format`). */
  label: string;
  /** The column the line sits in (`VDTColumn.index`). */
  columnIndex: number;
  /** The line's block (`VDTBlock.id`) and its index in the block's
   *  `lines`. */
  blockId: string;
  lineIndex: number;
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
   *  `columnCountClamped`: a `multiple` layout's `columnCount` outside 3 … 8
   *  or not a whole number (or not a number); the page is cut into `used`
   *  columns instead (#505).
   *  `cjkGridClamped`: a character grid (`cjk.grid`) with more characters
   *  per line or lines per page than the margins leave room for; the grid
   *  is reduced to `used`.
   *  `unknownConfigKey`: a key the heading settings or a paragraph style do
   *  not have (`headings`, `headings.balancing`, a heading level, a heading
   *  style, a paragraph style — and the same under
   *  `htmlViewer.overrides`; the `comics` section and its frame, gutters,
   *  panel styles, lettering, balloon styles and cast), such as a misspelt
   *  `letterSpacng`; the
   *  engine ignores it. `value` is the key, `used` is empty, and
   *  `suggestion` names the key it is closest to, when one is close.
   *  `unknownConfigValue`: a setting that takes one of a few words holding
   *  another (`direction: 'right'`); the engine reads its default, and
   *  `used` is what that came to (`direction`: `ltr` or `rtl`, from the
   *  document language; `bodyText.emphasis`: `italic` or `bold`, from it
   *  too; `bodyText.tashkil`: `keep`; a comics setting — `readingDirection`,
   *  `artDirection`, a panel style's `borderStyle` and `fit`, the
   *  lettering's `writingMode`, `textTransform`, `dropFinalStop` and
   *  `joinSameSpeaker`, a balloon style's `shape`, `tail`, `target`,
   *  `position`, `align` and `textTransform` — the value it resolved to:
   *  the default, or that of the style it is laid over), and `suggestion`
   *  the word it is closest to, when one is close.
   *  `unknownNumerals`: a `numerals` value that is not `'auto'`,
   *  `'latn'`, `'arab'` or `'arabext'`; the digits follow the document
   *  language, and `used` is the digit system that gives.
   *  `lineNumbersUnsupported`: `lineNumbers.enabled` on a vertical
   *  document (#621), which gets no line numbers; `used` is `false`. */
  kind: 'unknownNumberFormat' | 'fontFamilyStack' | 'sideColumnPercentClamped' | 'columnCountClamped' | 'unknownConfigKey' | 'cjkGridClamped' | 'unknownConfigValue' | 'unknownNumerals' | 'lineNumbersUnsupported';
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
  /** `unknownConfigKey`: the known key the unknown one is closest to
   *  (another case, a letter or two apart), when there is one. Also on an
   *  `unknownConfigValue` of a comics setting: the closest of its words. */
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
  /** A citation (`[@key]`) names a work no reference of the book defines
   *  (#268): it prints as written, or without that work. */
  | { kind: 'unknownCitationKey'; key: string }
  /** The text cites works but no citation engine is registered
   *  (`postext-citeproc`): citations print as written. */
  | { kind: 'citationsUnavailable' }
  /** A `:::references` block could not be read (malformed JSON or YAML, or
   *  BibTeX without an engine). */
  | { kind: 'referencesUnreadable'; message: string }
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
  /** A `:::paper{…}` attribute the engine cannot read: an unknown key, a
   *  stock, finish or texture it does not know, a number out of range, a
   *  shade that is neither a hex colour nor a palette id, a `showThrough`
   *  other than true / false. The attribute is dropped; the pages follow
   *  the document's paper for it. */
  | { kind: 'paperAttributeInvalid'; key: string; value: string }
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
  /** An entry of a Japanese index (#425) whose text holds a kanji and that
   *  no mark gives a reading (`yomi`, a kana ruby on the marked text, or a
   *  `sort` key in kana): it files after the kana entries, by code point.
   *  `term` is the entry's levels joined with `!`. Points at the `:::index`
   *  line. */
  | { kind: 'indexReadingMissing'; term: string; index: string }
  /** A heading's `{style}` attribute names no heading style: the heading
   *  and its section keep the level's own settings. */
  | { kind: 'unknownHeadingStyle'; style: string; level: number }
  /** A video resource the text uses has no poster frame (#454): print
   *  outputs show a dark box with the play mark and the QR code. */
  | { kind: 'videoWithoutPoster'; resourceId: string }
  /** A self-hosted video the text uses has no production address
   *  (`video.url`, http or https): the printed poster gets no QR code and
   *  no link, and an HTML or EPUB output without the file cannot play it. */
  | { kind: 'videoWithoutUrl'; resourceId: string }
  /** A YouTube or Vimeo video whose address is not a link to a video of that
   *  platform: no player is embedded (the poster is shown instead), and the
   *  QR code and the link carry the address as written when it is a web
   *  address. */
  | { kind: 'videoUrlInvalid'; resourceId: string; url: string }
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
  /** A word of a joining script (Arabic, Syriac, N'Ko…) wider than its
   *  line: such a word is never divided (its letters connect, and a piece
   *  would lose its joining forms), so it runs past the measure
   *  (`VDTLine.wordOverflow`). `text` is the line's text. Found by the
   *  layout, so `collectContentWarnings` never returns it. */
  | { kind: 'unbreakableWordOverflow'; text: string }
  /** A paragraph or heading whose style sets letter-spacing
   *  (`letterSpacing`) on words of a joining script: they are set without
   *  it, since spacing their letters apart breaks the joins, and only the
   *  other words and the spaces take it. `text` is the block's first
   *  line. Found by the layout. */
  | { kind: 'joiningScriptLetterSpacing'; text: string }
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
  /** A paragraph of kanbun with 送り仮名 (or 返り点 set in the line gap,
   *  `cjk.kunten.placement: 'interlinear'`) whose line gap is narrower than
   *  the marks (#430): they overlap the next line. `gapEm` and `neededEm`
   *  in em of the text. */
  | { kind: 'kuntenExceedsLeading'; text: string; gapEm: number; neededEm: number }
  /** A paragraph of vocalised Arabic (#376) whose vowel marks meet the
   *  ink of the line above or below it in its column: a mark over a word
   *  reaches down-hanging letters or marks of the line above, or a kasra
   *  under a word the marks of the line below. Only words standing over
   *  each other are compared. The line pitch never changes for the marks:
   *  give the paragraph more leading (1.7–1.85 em for partly vocalised
   *  text, 1.9–2.1 for fully vocalised verse). `lineHeightEm` is the
   *  distance between the two baselines and `neededEm` the height the two
   *  lines' ink takes there, in em of the text; `text` is the lower line.
   *  Found by the layout, so `collectContentWarnings` never returns it. */
  | { kind: 'arabicMarksExceedLeading'; text: string; lineHeightEm: number; neededEm: number }
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
  /** A `:tab` in a block set in vertical text (#622): tab stops are set in
   *  horizontal text only, so the tab is a word space. */
  | { kind: 'tabInVerticalText' }
  /** A comic page's `split` attribute the grammar cannot read whole (a
   *  stray character, an unclosed `[`, `/` and `|` mixed in one list, a
   *  bracketed list on its parent's axis): the readable part is used, an
   *  unreadable value is one panel. `message` says what is wrong. */
  | { kind: 'comicSplitSyntax'; message: string }
  /** The sizes of a list of a comic page's `split` add up past 100 %: they
   *  are scaled down (a `*` keeps 5 %). */
  | { kind: 'comicSplitOverflow'; total: number }
  /** A comic page has more panels than its split has cells (`panels` >
   *  `cells`: the extra panels are not set) or fewer (the extra cells are
   *  empty panels). */
  | { kind: 'comicPanelCount'; panels: number; cells: number }
  /** Text in a comic page before its first `::panel` line, or a line of a
   *  panel that is not a script line (`key: text`): it is lettered as a
   *  caption of the panel (the first one, for text before it). */
  | { kind: 'comicStrayText'; text: string }
  /** A script line names a balloon style no style defines
   *  (`ben{wisper}: …`): it takes the default style of its key. */
  | { kind: 'comicUnknownBalloonStyle'; style: string }
  /** A panel's `art` or `pop` names no picture resource (an unknown id, or
   *  a resource that is not a bitmap or an SVG): the panel is set empty. */
  | { kind: 'comicUnknownArt'; resourceId: string }
  /** A panel's cell cannot hold the picture's safe area under a cover
   *  crop: the picture is shown with its safe area whole and the bands
   *  left in the panel background. Found by the layout. */
  | { kind: 'comicPanelLetterbox'; resourceId: string; panel: number }
  /** A picture's anchor (a speaker's mouth) lies outside its safe area: a
   *  crop may cut it off, and the tail then points off the panel. An
   *  authoring hint. Points at the panel's `art`. */
  | { kind: 'comicAnchorOutsideSafeArea'; resourceId: string; anchorId: string }
  /** A balloon of a comic panel could not be placed cleanly (#561): it
   *  still covers a speaker's face, another balloon, an avoid zone or a
   *  mouth, or runs outside its panel, after every fallback (`fallbacks`:
   *  crossing the border, covering avoid zones, reshaping the text). The
   *  lettering never shrinks; a shorter line, a bigger panel or an `at=`
   *  pin fixes it. Found by the layout; points at the script line. */
  | { kind: 'comicBalloonOverflow'; panel: number; reasons: ('face' | 'balloon' | 'outside' | 'avoid' | 'anchor')[]; fallbacks: ('breakBorder' | 'coverAvoid' | 'reshape')[] }
  /** A speaker id that no picture of its comic page marks with an anchor
   *  and no `comics.cast` entry names (a slip in the id, most often): its
   *  tails point off the panel. Only raised on pages whose pictures mark
   *  anchors. Informational. Points at the first line of that speaker. */
  | { kind: 'comicUnknownSpeaker'; speaker: string }
  /** A line number set in the side column (`lineNumbers.position:
   *  'side'`, #621) overlaps a side box, a side caption or another float
   *  of that column: both are painted where they are. Points at the line
   *  it numbers; `number` is the number as printed. */
  | { kind: 'lineNumberOverlap'; number: string }
  /** A paragraph a drop cap opens (#623) that could not take it as
   *  configured. `reason`: `'shortParagraph'`, fewer lines than the
   *  initial sinks (`handling` says what `shortParagraph` did: kept the
   *  room, shrank the initial to `lines`, or left it out); `'split'`, the
   *  paragraph broke before the initial's last line, alone in a column
   *  too short for it; `'joiningScript'`, its first letter joins the next
   *  (Arabic, Syriac, N'Ko) and is not set apart; `'verticalText'`, drop
   *  caps are set in horizontal text only; `'noLetter'`, it opens with no
   *  letter or digit to set large (a reference, a formula, a note mark).
   *  `text` is the paragraph's first line. Found by the layout. */
  | { kind: 'dropCap'; reason: 'shortParagraph' | 'split' | 'joiningScript' | 'verticalText' | 'noLetter'; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number; text: string }
  /** `codeOverflow` (#624): a code listing has lines wider than its box,
   *  fitted as `codeStyle.overflow` says: turned over (`'wrap'`), set
   *  smaller (`'shrink'`, at `scale` of its size; past `minFontScale` its
   *  lines wrap too) or cut at the box's edge (`'clip'`). `lines` counts
   *  the source lines too wide. Found by the layout. */
  | { kind: 'codeOverflow'; mode: 'wrap' | 'shrink' | 'clip'; lines: number; scale?: number; lang?: string }
  /** `floatShrunk` (#626): a floated picture was set smaller than its size
   *  to fit the room of its slot (`placement.shrink`), at `scale` of its
   *  width. `overflowPx`: at its smallest scale (`placement.minScale`) it
   *  still runs this far past the foot of the page's text block, on a page
   *  where it had nowhere else to go. Found by the layout; information
   *  more than a fault, unless it overflows. */
  | { kind: 'floatShrunk'; resourceId: string; scale: number; overflowPx?: number }
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
