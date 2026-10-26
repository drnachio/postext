// InlineSpan, a run of styled text, with its maths, tabs, links, icons and
// reference styles (#1276: split out of types.ts).
import type { ChipBox, SwatchShape, SwatchBox, ExerciseHit, ExerciseGap, EmphasisMark, InlineRuby, InlineWarichu, InlineDirection, InlineSideline, InlineKunten } from './spanMarks.js';

/** Letter-case transform applied to the computed label of an inline `:ref`
 *  (never to the number, never to a `text=` override). */
export type RefCase = 'lower' | 'upper' | 'capitalize';
/** How an inline `:ref` prints its target (see `InlineSpan.ref.style`). */
export type RefStyle = 'default' | 'number' | 'full' | 'title' | 'page' | 'pageNumber';

/** Metadata attached to an `InlineSpan` when it represents a math formula.
 *  The span's `text` is a single `\uFFFC` (object replacement character)
 *  acting as a one-char-wide atomic placeholder in the plain text. */
export interface MathMeta {
  tex: string;
  /** Absolute source offset of the opening `$` in the original markdown. */
  sourceStart: number;
  /** Absolute source offset just past the closing `$`. */
  sourceEnd: number;
}

/** A Markdown link inside an inline span: the characters `[start, end)` of
 *  the span's `text`, pointing at `href` (see {@link InlineSpan.links}). */
/** A tab of the text (see {@link InlineSpan.tab}). */
export interface InlineTab {
  /** A tab character of the source (not `:tab`). */
  literal?: true;
  /** Tab characters in a row (with nothing but spaces between them): one
   *  character of the plain text, which goes on this many stops. Read as
   *  a word space, they are one, as collapsed whitespace always was. */
  count?: number;
  /** The one-off stop of `:tab{at=…}`: the tab goes there, whatever the
   *  paragraph's own stops. */
  stop?: import('../../types.js').TabStop;
  /** {@link stop} in px, resolved by the pipeline against the paragraph's
   *  size (see `resolveTabStop`). */
  px?: import('../../measure/tabs.js').TabStopPx;
}

export interface InlineLink {
  start: number;
  end: number;
  /** The link target; `''` on a highlight mark. */
  href: string;
  /** Present on a highlight mark (`:mark[text]{style="…"}`, #888), which
   *  rides on the link ranges so that every pass that cuts, joins or moves
   *  spans keeps it: the style id (`''` when the mark names none) and the
   *  mark's number in the text. Such a range is no link. */
  mark?: { style: string; id: number };
}

/** An inline symbol (`:icon[alt]{…}`, #1058, DESIGN §12.5), read in the
 *  text of figure labels and of captions and notes: a small picture (a
 *  bitmap or SVG resource), a glyph set in a face of its own, or a sample
 *  of a line (solid, dashed, dotted), the key of a map's legend. Exactly
 *  one of `resource`, `glyph` and `line` is set (the first of them
 *  written, in that order). */
export interface InlineIcon {
  /** The bracketed text: what the symbol stands for, read in its place
   *  (alternative text, the tagged PDF). May be empty. */
  alt: string;
  /** The id of a bitmap or SVG resource, fitted to the icon's height. */
  resource?: string;
  /** One or a few characters, set in `font` (default: the text's face). */
  glyph?: string;
  /** A font family for `glyph`. */
  font?: string;
  /** A stroke drawn across the icon's box at half its height. */
  line?: 'solid' | 'dashed' | 'dotted';
  /** The icon's height in ems of the text around it; default the height of
   *  a capital (0.75 em, as a swatch's side). A glyph is set at the size
   *  whose capitals are that high. */
  size?: number;
  /** How far the box reaches below the baseline, in ems of the text around
   *  it; default 0 (it stands on the baseline). Set by the pipeline for an
   *  exercise icon beside a shaped number (#1248), which shares its band. */
  drop?: number;
  /** Set by the pipeline for a `resource` icon: the picture to draw and
   *  its width over its height. Absent when the resource is unknown. */
  picture?: { fileId: string; format?: string; svg: boolean; aspect: number };
}

export interface InlineSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Superscript (`^text^`) or subscript (`~text~`): set smaller and
   *  raised / lowered off the baseline (an exponent, a chemical index). */
  script?: 'sup' | 'sub';
  /** Small capitals (`:smallcaps[text]`, or a paragraph / callout body
   *  style with `smallCaps`): lowercase letters are set as capitals at a
   *  reduced size (see `SMALL_CAPS_SIZE_RATIO`), capitals keep the full
   *  size. */
  smallCaps?: boolean;
  /** Set by the measurer on the Arabic words of a run whose face is
   *  slanted even when not italic (a style whose base face is italic):
   *  measured and painted in that face with the slant taken off
   *  (`uprightArabic.ts`). */
  upright?: true;
  /** Tate-chu-yoko (`:tcy[12]`): in vertical text
   *  (`layout.writingMode: 'vertical-rl'`) the span's characters are set
   *  side by side in one upright cell of one em, squeezed across when
   *  wider. No effect in horizontal text. */
  combineUpright?: boolean;
  /** How the span's characters stand in vertical text: `'upright'`
   *  (`:upright[GDP]`), each in an upright cell of its own; `'sideways'`
   *  (`:sideways[12]`), the whole run turned with the line. No effect in
   *  horizontal text. */
  orientation?: 'upright' | 'sideways';
  /** A space of the span's own width that a line neither breaks at nor
   *  stretches or shrinks when it is justified: the gap after a footnote's
   *  number, which keeps one width in every note. Set by the pipeline. */
  fixedSpace?: boolean;
  /** One of a chip's own words set in the face of the text around the chip,
   *  not the chip's: the Arabic, Hebrew or CJK characters of inline code
   *  (#845), which code faces do not carry. Set by the pipeline. */
  textFace?: boolean;
  /** A space inside inline code set in the code face (#845), between two
   *  pieces of it: the line may break there, but the space neither
   *  stretches nor shrinks, and on one line the pieces around it are one
   *  box. `box` is the code's. Set by the pipeline. */
  codeSpace?: ChipBox;
  /** A numbered bibliography entry's label column (#290): `'gap'` is the
   *  space after the label, widened when the entry is measured so the text
   *  starts at the column's edge (`MeasureBlockOptions.labelColumnPx`);
   *  `'lead'` is a space before the label that pushes it against the gap
   *  (a right-aligned label). Neither breaks nor stretches. Set by the
   *  pipeline. */
  labelTab?: 'lead' | 'gap';
  /** A tab (#622): `:tab` or `:tab{at=… align=… leader=…}`, or a tab
   *  character inside a line of a paragraph, a list item or a quotation
   *  (`literal`). The span's `text` is `'\t'`, one character of the plain
   *  text, and the spaces around the tab are taken into it. A literal tab
   *  stays a tab only in a paragraph whose style sets tab stops; elsewhere
   *  the pipeline sets it back as the word space it always was
   *  (`pipeline/text/tabs.ts`). */
  tab?: InlineTab;
  /** Marks this span as a resource caption's numbered label (e.g. "Figure 1.")
   *  so renderers can paint it in the configured label colour. Flows span →
   *  token → segment, mirroring {@link ref}. */
  captionLabel?: boolean;
  /** Present when this span carries an inline math formula. The `text` is
   *  a single `\uFFFC` placeholder that layout treats atomically. */
  math?: MathMeta;
  /** Resolved math render — populated by the pipeline before measurement
   *  so the parser remains free of MathJax dependencies. */
  mathRender?: import('../../math/types.js').MathRender;
  /** Present when this span is an inline `:swatch{color="…"}` — a small
   *  filled square set on the baseline, the key of a colour legend (a
   *  table note explaining its cell fills). The `text` is a single
   *  placeholder char that layout treats atomically. `color` is a hex
   *  colour or the id of a document palette entry, resolved to a hex by the
   *  pipeline before measurement; unresolved, the square is drawn as an
   *  empty outline. */
  swatch?: {
    color: string;
    /** Set when the span is an inline symbol (`:icon[alt]{…}`, #1058)
     *  rather than a colour swatch: it rides the swatch's placeholder, so
     *  every pass that keeps a swatch whole keeps it whole. `color` is then
     *  the icon's tint as written (`''` when it has none). */
    icon?: InlineIcon;
    /** The square's size, outline, corners and gap as written
     *  (`:swatch{size=… border=… radius=… gap=…}`, #1104); unset: a square
     *  the size of a capital outlined in the text colour. */
    shape?: SwatchShape;
    /** {@link shape} resolved by the pipeline for the text the swatch sits
     *  in: lengths in px, the outline colour as hex. */
    box?: SwatchBox;
  };
  /** Present when this span is an inline chip (`:chip[text]{style="…"}`):
   *  a boxed run of text set as one unbreakable unit. The `text` is a single
   *  placeholder char; the chip's words, with their own inline marks, are in
   *  `spans`. `box` is the resolved style, filled in by the pipeline before
   *  measurement (a chip without it is measured as bare text). */
  chip?: {
    /** Style id as written; unset selects the first chip style. */
    style?: string;
    spans: InlineSpan[];
    box?: ChipBox;
    /** The box is as wide as this text would be in the chip's face, when
     *  that is wider than its own text (#1227): a blank as wide as the
     *  exercise's longest answer, so none gives its own away. */
    widthText?: string;
    /** The chip's text is laid out but not painted, copied or read (#1227):
     *  a blank holding its answer, sized by it. Read as {@link blankLabel}. */
    blank?: true;
    /** What a blank is read as (`'blank'`, `'hueco'`). */
    blankLabel?: string;
    /** The chip's words stand upright in slanted text (#1244): an
     *  exercise's number under an italic instruction. */
    upright?: true;
    /** Where an exercise answers (#1230): the exercise's id and the slot the
     *  chip stands for (`g3`, `q1o2`, `tf2t`…), for the digital outputs. */
    exercise?: ExerciseHit;
    /** Present when the chip is an answer written into an exercise's text
     *  (`[[…]]`, #1225): what it asks. Its `spans` are the first right
     *  answer. */
    gap?: ExerciseGap;
    /** A piece of inline code that goes on after a space of its own
     *  (`codeSpace`, #845): on one line the two pieces are one box. */
    joinNext?: boolean;
    /** Where each character of the chip's words (`spans` joined) stands in
     *  the source, counted from the chip's leading `:` (#857): the chip's
     *  own source map, relative so a cached measurement stays right where
     *  the same chip is written elsewhere. Absent when it cannot be read. */
    sourceOffsets?: number[];
  };
  /** Markdown links (`[text](url)`) inside this span, as ranges of its
   *  `text`. A link never splits a span — the spans are those of the text
   *  without the link syntax, so layout does not change — and a link whose
   *  text crosses emphasis spreads over the spans it crosses. The measurer
   *  stamps the target on the segments of the linked words
   *  (`VDTLineSegment.href`). Only safe targets are kept: `http:`,
   *  `https:`, `mailto:`, `tel:`, `ftp:` and relative URLs. */
  links?: InlineLink[];
  /** Present when this span is a citation (`[@id, p. 3]`, `@id`, #268):
   *  the `text` is a single placeholder char until the pipeline formats the
   *  citation (or prints `raw` back when it cannot). */
  citation?: {
    cluster: import('../../citations/types.js').CitationClusterInput;
    /** The citation as written. */
    raw: string;
  };
  /** Present when this span is a footnote marker (`[^id]`): the `text` is a
   *  single placeholder char until the pipeline replaces it with the note's
   *  number, set as a superscript (`script: 'sup'`) or on the baseline. */
  footnote?: {
    /** The note's id as written between `[^` and `]`. */
    id: string;
    /** An inline marker's size relative to the text around it
     *  (`footnotes.markerSize`), set by the pipeline. Unset: full size. */
    scale?: number;
    /** Where the pipeline sets the marker apart from the line's text
     *  (`footnotes.markerPosition`): `'side'` in the line gap beside the
     *  text before it, taking no advance; `'right'` (vertical text only)
     *  flush with the right side of the line. Unset: on the line, as
     *  `scale` and `script` say. */
    place?: 'side' | 'right';
  };
  /** Present when this span is an inline reference to a `Resource`. The
   *  `text` carries placeholder/fallback content; the pipeline resolves the
   *  reference to its computed number/label. */
  ref?: {
    /** The referenced `Resource.id`, or the identifier of an anchor
     *  (`{#id}`, #262) — see {@link anchor}. */
    resourceId: string;
    /** Rendering style: `'default'` uses the type short label + number,
     *  `'number'` is the bare number, `'full'` is the full caption prefix +
     *  number. For an anchor: `'title'` prints the heading's title or the
     *  anchor's text, `'page'` "p. 112", `'pageNumber'` "112" (#263). */
    style?: RefStyle;
    /** Set when the reference resolved to an anchor (a heading, an inline
     *  anchor, a container) rather than a resource; `resourceId` then holds
     *  the anchor's identifier. */
    anchor?: true;
    /** For an anchor: the book page index it landed on, once laid out —
     *  what a host jumps to when the anchor lies in another chapter. */
    pageIndex?: number;
    /** Optional override text to display instead of the computed label. */
    text?: string;
    /** Optional letter-case transform for the label part (`Fig.` /
     *  `Figure`) of the computed label. Ignored when `text` is set. */
    case?: RefCase;
    /** Set by the pipeline once the label is resolved (#702): the label is
     *  words (a `text` override, the title of a heading, an anchor or a
     *  box) with a space between two of them, so a line may break there
     *  (`crossRefs.breakLabels`). A label with a number or a page never
     *  is, and a number in a label of words keeps to the word before it. */
    breakable?: true;
  };
  /** Emphasis dots (着重号, `:dots[text]{style fill pos}`, #193): one mark
   *  under each character in horizontal text, to its right in vertical
   *  text, never on punctuation or spaces. Each field left unset takes its
   *  default (a filled dot, on the side the writing mode gives). Also set
   *  on the Chinese characters of `*…*` under `cjk.emphasis: 'dots'`. */
  emphasisMark?: EmphasisMark;
  /** Proper-name mark (专名号, `:name[text]`, #193): a straight line under
   *  the text (left of it in vertical text). The number tells the runs
   *  apart, so two names set side by side keep two lines. */
  properName?: number;
  /** Book-title mark (书名号, `:book[text]`, #193): the title's run and
   *  how deep it is nested in other titles (1 for the outermost). What it
   *  prints follows `cjk.bookTitleMark`: the `cjk.bookTitleBrackets`
   *  around the title (《》 and 〈〉 nested; 『』 and 「」 in Japan), a wavy
   *  line under it, or nothing. */
  bookTitle?: { id: number; depth: number };
  /** Ruby (`:ruby[base]{rt="…"}` or `{base|reading}`, #194): the reading
   *  set over the base text (beside it for zhuyin). A mono ruby is one
   *  span per base character, each with its own reading; a group ruby one
   *  span for the whole base. */
  ruby?: InlineRuby;
  /** Warichu (双行夹注, `:warichu[note]{open close}`, #195): the span is part
   *  of a two-row note set inside the line at a smaller size. Every span of
   *  one note shares the object. */
  warichu?: InlineWarichu;
  /** A directional isolate (`:rtl[…]` / `:ltr[…]`, #367): the span is
   *  part of a run set in its own direction, isolated from the text around
   *  it (UAX #9 RLI/LRI … PDI), so an English title inside Arabic, or an
   *  Arabic name inside English, keeps its own order and never reorders
   *  its neighbours. Every span of one isolate shares the object; an
   *  isolate inside another names it as `outer`. `bidi.ts`
   *  (`resolveSpans`) reads it when a line's order is resolved. */
  direction?: InlineDirection;
  /** Side line (傍線, `:sideline[text]{style pos}`, #421): a line along
   *  the text, under it in horizontal text and right of it in vertical
   *  text unless `pos` says otherwise. Unlike emphasis dots it runs on
   *  across every character of the run, punctuation and spaces included,
   *  in any script. Every span of one line shares the object. */
  sideline?: InlineSideline;
  /** Kanbun reading marks (訓点, `:kunten[字]{kaeri okuri tate}`, #430):
   *  the 返り点 and 送り仮名 (and a 竪点 to the next character) that go
   *  with the span's last character, in the line gap and the space after
   *  it as JIS X 4051 §5 sets them. Every span of one directive shares the
   *  object; the marks go with the last character of the last one. */
  kunten?: InlineKunten;
  /** Characters the layout added that the source does not hold: the
   *  brackets `cjk.bookTitleMark: 'brackets'` sets around a title and the
   *  brackets of a warichu note. They are measured and painted, and never
   *  take a character of the plain text or the source map. */
  inserted?: boolean;
}

/** Convenience discriminants for inline span iteration. */
export type TextSpan = InlineSpan & { math?: undefined };
export type MathSpan = InlineSpan & { math: MathMeta };
