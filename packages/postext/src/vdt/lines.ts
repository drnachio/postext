// A set line: its highlights, marks, anchors and the VDTLine node itself
// (#1276: split out of vdt.ts).
import type { BoundingBox } from './document.js';
import type { VDTLineSegment } from './segments.js';

/** A highlight band (`:mark[…]`, #888) of one line: a rectangle from `x`
 *  (px from the line's `bbox.x`, in the flow frame of the line) `width`
 *  wide, from `y` (px from the baseline, negative up) `height` high,
 *  filled with `color`; `radiusLeft` / `radiusRight` round its left and
 *  right ends (0 where the phrase goes on to the next line). */
export interface VDTLineHighlight {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  radiusLeft: number;
  radiusRight: number;
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
  /** Set on an anchor written in a story that came in from another chapter
   *  (#988): that chapter's place in the book, whose body `sourceStart` is
   *  an offset in. */
  chapter?: number;
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
  /** The word-space ratio (justified over natural, over 3) the line would
   *  have needed to reach the measure, when it was set {@link ragged}
   *  because of it (#732). It marks that fallback and no other: a tabbed
   *  line, a code line and a CJK line are ragged without it. Reported as a
   *  `raggedLine` content warning. */
  raggedSpaceRatio?: number;
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
  /** The line ends in a piece of a word wider than its whole measure,
   *  which the breaker cut to fit (#1150): at one of its syllables, a
   *  hyphen added (`'syllable'`), or, where none fits, between two of its
   *  characters (`'character'`). The build reports a
   *  `wordDividedBySyllable` note or a `wordDividedByCharacter` warning.
   *  Absent otherwise (and for a cut at a no-break space). */
  wordDivided?: 'syllable' | 'character';
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
  /** For justified (non-last) lines: the width every space of the line is
   *  painted at, over the space of the block's regular face (with the
   *  block's tracking). 1.0 means the regular space. The line's
   *  `bbox.width` stays its natural width; painted, the measure the words
   *  leave is shared among the spaces, all set alike whatever face they
   *  come from, and the line ends on the right edge of the measure. The
   *  layout reads this number (the ragged fallback, the runt fix, the
   *  loose-paragraph lever). */
  justifiedSpaceRatio?: number;
  /** The word spacing of the line as the breaker bounds it (#704): 1 plus
   *  the line's slack over its spaces, each counted at its own width, in
   *  regular spaces. That is the number `bodyText.minWordSpacing` and
   *  `maxWordSpacing` limit: a space of an italic or a bold run is narrower
   *  or wider than the regular one, so a line that holds one is painted a
   *  little under or over the limit it was broken within, and
   *  {@link justifiedSpaceRatio} alone would read past it. Present only
   *  when it differs from `justifiedSpaceRatio`; read both through
   *  `lineWordSpacing`. Reports only: no break and no lever reads it. */
  justifiedSpaceLimitRatio?: number;
  /** The Chinese marks set on this line (emphasis dots, proper-name and
   *  book-title lines, #193), for renderers to draw as they are; absent on
   *  a line with none. */
  marks?: VDTLineMark[];
  /** The bands of the highlight marks on this line (`:mark[…]`, #888),
   *  painted under its text; absent on a line with none. */
  highlights?: VDTLineHighlight[];
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
   *  the line there (see {@link lineTextAlign}).
   *  Also set, flagged `wrap`, on a line set short beside a picture that
   *  text wraps round (#627): the span is the line's narrowed measure, and
   *  the line keeps its block's alignment in it. */
  measure?: { x: number; width: number; wrap?: true };
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
   *  a stanza another follows (copied text puts a blank line there).
   *  `spaceRatio` is set on a line a little too wide for the measure whose
   *  word spaces were tightened so it stays on one line: their width as a
   *  share of their natural width (never under `bodyText.minWordSpacing`).
   *  The widths of the line's segments are final (the block is set flush
   *  left): renderers paint them as they are. Absent on any other line. */
  verseLine?: { stanza: number; line: number; turnover: boolean; indent?: number; stanzaEnd?: true; spaceRatio?: number };
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
