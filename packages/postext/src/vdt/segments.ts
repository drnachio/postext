// What a line is made of: text segments and their marks, chips, swatches,
// inline icons, ruby, kunten and warichu runs (#1276: split out of vdt.ts).
import type { ScoreSystem } from '../music/types.js';
import type { MathRender } from '../math/types.js';
import type { VDTTextDots } from './design.js';

// ---------------------------------------------------------------------------
// Resolved config aggregate (all sub-configs fully resolved to non-optional)
// ---------------------------------------------------------------------------

/** See {@link VDTLineSegment.mark}. */
export interface VDTSegmentMark {
  style: string;
  id: number;
  start?: true;
  end?: true;
  from?: number;
  to?: number;
}

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

/** An inline colour swatch on its line (`VDTLineSegment.swatch`): the
 *  fill (hex; absent when the colour did not resolve), or the inline symbol
 *  that rides its placeholder (#1058). The other fields are set only by a
 *  swatch that writes them (#1104): `side`, the square's side in px when it
 *  is not the segment's whole width (a `size`, or a `gap` after the square,
 *  which takes the rest of the width: on the square's right, on its left
 *  in a right-to-left segment); `borderWidth` (px, 0 for no outline) and
 *  `borderColor` (hex) of the outline, which is otherwise 6 % of the side
 *  in the text colour; `radius`, the corner radius in px. */
export interface VDTSwatch {
  color?: string;
  icon?: VDTInlineIcon;
  side?: number;
  borderWidth?: number;
  borderColor?: string;
  radius?: number;
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
  /** Letters painted as dots to trace, in the runs' colour (the chip
   *  style's `dotted`). Absent = filled. */
  dotted?: VDTTextDots;
  /** The outline is a line under the box, `borderWidth` thick (#1227):
   *  drawn from the box's left to its right at its bottom edge. */
  underline?: 'solid' | 'dotted' | 'dashed';
  /** The runs are laid out but not painted, copied or read (#1227): an
   *  exercise's blank; `blankLabel` is what it reads as. */
  blank?: true;
  blankLabel?: string;
  /** The readings of the chip's ruby words (#1244), placed from the box's
   *  left edge (`dx`) and the line's baseline (`dy`), in the surrounding
   *  text colour: painted on a blank too, so a pupil writes the characters
   *  of 看拼音写词语 under their pinyin. */
  readings?: VDTAnnotationRun[];
  /** The exercise slot the chip stands for (#1230). */
  exercise?: import('../parse/types.js').ExerciseHit;
  /** The order in which renderers advance through `runs` from the box's
   *  start (indices into it), when it is not 0, 1, … n − 1: as
   *  {@link VDTLine.order}, the visual order of the runs (UAX #9 L2 on
   *  the chip's own text, its base direction that of its first strong
   *  letter) in a left-to-right frame, its reverse on a mirrored page.
   *  Absent on a chip with no right-to-left run. */
  order?: number[];
  /** A piece of inline code that a code space continues (#845): the line
   *  pass joins the pieces that share a line into one box. Never left on a
   *  chip of a finished line. */
  joinNext?: boolean;
  /** Where each character of the chip's runs (joined, in logical order)
   *  stands in the source, counted from the chip's leading `:` (#857): add
   *  the source offset of the chip's plain character (its block's
   *  `sourceMap`). Absent when the runs do not read as written (a chip in
   *  small capitals is still mapped; one cut by direction is not). */
  sourceOffsets?: number[];
}

/**
 * An inline symbol (`:icon[alt]{…}`, #1058) as painted: carried by a
 * `'swatch'` segment (`swatch.icon`), whose `width` is its advance. The
 * symbol's box is `widthPx` × `heightPx`, standing on the baseline,
 * `insetPx` in from the segment's left edge (a legend's symbol centred in
 * its column). A painter that does not know icons paints a swatch's empty
 * square in its place.
 */
export interface VDTInlineIcon {
  kind: 'resource' | 'glyph' | 'line';
  /** What it stands for (may be empty). */
  alt: string;
  widthPx: number;
  heightPx: number;
  /** From the segment's left edge to the box's; absent = 0. */
  insetPx?: number;
  /** How far the box reaches below the line's baseline (#1248); absent = 0:
   *  it stands on the baseline. A glyph's own baseline drops with it. */
  dropPx?: number;
  /** Resolved colour (hex): a glyph's or a line's ink, a picture's tint.
   *  Absent: the text's colour (a picture keeps its own). */
  color?: string;
  /** `kind: 'resource'`: the resource and its picture. A resource that is
   *  not known has no `fileId`: an empty outline is painted. */
  resourceId?: string;
  fileId?: string;
  format?: string;
  svg?: boolean;
  /** `kind: 'glyph'`: the characters and the CSS font they are set in. */
  glyph?: string;
  fontString?: string;
  /** `kind: 'line'`: the stroke's pattern and width. */
  line?: 'solid' | 'dashed' | 'dotted';
  strokePx?: number;
}

export interface VDTLineSegment {
  kind: 'text' | 'space' | 'math' | 'swatch' | 'chip' | 'score';
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
  /** The highlight mark (`:mark[text]{style}`, #888) this segment is part
   *  of: its style id (`''` for the first style), the mark's number in its
   *  text (two marks side by side stay apart), and whether the segment
   *  holds the mark's first and last character. `from` / `to` are the
   *  characters of `text` the mark covers when it covers part of it (a
   *  closing full stop glued to the phrase). The band itself is
   *  `VDTLine.highlights`. */
  mark?: VDTSegmentMark;
  /** Present when `kind === 'math'`. The rendered formula. */
  mathRender?: MathRender;
  /** Present when `kind === 'score'` (#1172): the engraved system, drawn
   *  `width` px wide (its own width scaled) in the block's colour. */
  scoreSystem?: ScoreSystem;
  /** Present when `kind === 'swatch'`: an inline colour swatch (`:swatch{…}`),
   *  a square of `width` px filled with `color` (a hex; absent when the
   *  colour did not resolve — the square is then an empty outline), sitting
   *  on the baseline and outlined in the text colour. A swatch with a shape
   *  of its own (#1104) carries it (see {@link VDTSwatch}). */
  swatch?: VDTSwatch;
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
  tab?: { align: import('../types.js').TabStopAlign; at: number };
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
   *  justified CJK line (see `measure/cjk/cjkCompose.ts`). Renderers paint the
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
  /** The script this word is shaped in (ISO 15924), when it has no letter
   *  of its own and its face draws punctuation or digits by script (#725,
   *  `bodyText.scriptContext`): `46.` ending a Latin sentence set in an
   *  Arabic face takes `'Latn'`, the brackets of `(1367)` in an Arabic
   *  sentence `'Arab'`. `width` was measured in that script, and every
   *  renderer shapes the word in it: the canvas and the HTML by setting it
   *  beside a hidden character of the script (`scriptMark`), the PDF by
   *  asking its shaper for it. Left alone, each shaper would choose by a
   *  rule of its own. A piece with no letter of a word that has one
   *  (`10.1006/` of a DOI parted at its joints) says the script it has
   *  inside that word; a doubled ellipsis or dash (`……`, `——`) of a word
   *  with no letter in a Chinese or Japanese document says `'Hani'`, the
   *  forms of Han text. Absent on every other segment, and on every segment
   *  of a face that draws them the same under any script. (The name
   *  `script` is taken by superscripts and subscripts.) */
  scriptContext?: import('../measure/script.js').ScriptContext;
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
   *  them out (`writtenText` in `measure/rtl/kashida.ts`). A tatweel the author
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
