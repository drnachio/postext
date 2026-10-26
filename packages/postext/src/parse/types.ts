import type { Dimension } from '../types.js';
import type { ScoreFormat, ScoreSystem } from '../music/types.js';
import type { ComicPageSource } from '../comics/types.js';
import type { FigureLabelNode, SourceRange } from '../composed/types.js';

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'mathDisplay'
  | 'resourceBlock'
  | 'directive'
  | 'containerStart'
  | 'containerEnd'
  /** A code listing (#624): a ```` ``` ```` or `~~~` fence, or indented
   *  code under `codeStyle.indentedCode` (see {@link CodeBlockInfo}). */
  | 'code'
  /** A music score (#1172): a ```` ```abc ```` / ```` ```musicxml ```` /
   *  ```` ```mei ```` / ```` ```humdrum ```` fence (see {@link ScoreBlockInfo}).
   *  The build expands it into one block per engraved system. */
  | 'score';

/** Attributes parsed from a `:::name{key="v" other=bare flag}` directive.
 *  Values are kept as strings; directive consumers validate/coerce. A bare
 *  `flag` becomes `{ flag: '' }`. */
export type DirectiveAttrs = Record<string, string>;

/** A `:::verse` poem. The bayt layout (#378): one bayt per source line,
 *  its hemistichs (the ṣadr, then the ʿajuz) split at `||` (or a spaced
 *  `\\`, the Wikisource convention); a line without one is a single
 *  hemistich, centred. The line layout (#620): one line of verse per
 *  source line, a stanza per run of lines between blank lines, each stanza
 *  a block of its own (see {@link VerseStanza}). */
export interface VerseInfo {
  /** The fence's attributes as written (`gap`, `width`, `align`,
   *  `ornament`, `style`, `dir`, `layout`, `indentStep`, `turnover`,
   *  `stanzaSpace`, `keepStanzas`, …); `pipeline/text/verse.ts` and
   *  `pipeline/text/verseLines.ts` read them. */
  attrs: DirectiveAttrs;
  /** Set on the blocks of a poem in the line layout (#620): which stanza
   *  of which poem the block sets. Unset: the bayt layout, one block. */
  stanza?: VerseStanza;
}

/** One stanza of a poem in the line layout (#620). Its block's text holds
 *  the lines of verse, a line feed (`\n`) between two, mapped to the
 *  source's line end; leading whitespace is not in the text but in
 *  {@link lines}. */
export interface VerseStanza {
  /** The poem, numbered from 0 in the document's order: the stanzas of a
   *  poem share it. */
  poem: number;
  /** The stanza's index in its poem, from 0. */
  index: number;
  /** Whether it is the poem's last stanza. */
  last: boolean;
  /** Poem-wide index of the stanza's first line of verse, from 0. */
  firstLine: number;
  /** The stanza's lines, in order. */
  lines: VerseLineInfo[];
  /** The fence named no layout and the poem has no hemistich separator:
   *  the line layout was picked by `layout="auto"`. A configuration
   *  stored before #620 (`bodyText.verse.layout: 'bayt'`) sets such a
   *  stanza as single hemistichs, as postext 1.22 did. */
  auto?: true;
}

/** A line of verse in the line layout (#620). */
export interface VerseLineInfo {
  /** Its indent in spaces as written: each leading space counts 1, a tab
   *  4, an ideographic space (U+3000) 2. Multiplied by the poem's
   *  `indentStep`. */
  indent: number;
  /** The line was written `+ …`: a stepped line (a line of dramatic verse
   *  shared between speakers), set to start where the line above ended. */
  stepped?: true;
}

/** A code listing (#624): the lines between a ```` ``` ```` or `~~~`
 *  fence and its closing fence (or a run of indented lines), kept as
 *  written: no inline Markdown, no directives, every space and tab. The
 *  block's `text` joins the lines with a line feed, mapped to the source
 *  line end, so the plain text and the source map read the listing as
 *  written. */
/** A music score (#1172): the notation as written in its fence. */
export interface ScoreBlockInfo {
  format: ScoreFormat;
  /** The notation, the fence's indentation taken off. */
  source: string;
  /** The fence's attributes (`{#id style=… alt="…"}`). */
  attrs: DirectiveAttrs;
  /** Present once the build has engraved the score: the system this
   *  block sets, out of `count`. */
  system?: ScoreSystem;
  index?: number;
  count?: number;
  /** The engraver's message when the notation did not load. */
  error?: string;
  /** Read from the notation, for alt text. */
  title?: string;
  composer?: string;
}

export interface CodeBlockInfo {
  /** The first word of the info string (`js`, `python`, `console`),
   *  lower-cased; absent when the fence names none. */
  lang?: string;
  /** The info string as written, after the fence. */
  info: string;
  /** The rest of the info string read in the directive attribute grammar
   *  (`{title="backup.sh" lineNumbers start=12 highlight="3,5-7"}`). */
  attrs: DirectiveAttrs;
  /** The title: the `title` attribute, else a bare second word of the info
   *  string (```` ```console Terminal ````). */
  title?: string;
  /** The listing's lines, the fence's indentation (or the four columns of
   *  indented code) taken off, tabs kept. */
  lines: string[];
  /** Source offset of each line's first kept character. */
  lineStarts: number[];
  /** How the listing was written. */
  fence: '```' | '~~~' | 'indent';
}

/** Recognized directive names. Unknown names are not parsed as directives —
 *  they fall through to the paragraph branch and surface via warnings. */
export type DirectiveName = 'pagebreak' | 'numbering' | 'columnbreak' | 'space' | 'toc' | 'index' | 'bibliography' | 'references' | 'verse' | 'page' | 'strip' | 'figure'
  /** Where an exercise's solutions print (#1229): `:::solutions{scope=…}`. */
  | 'solutions'
  /** An exercise's word bank (#1225): a `::bank[sun | rain]` line inside a
   *  `:::exercise`; its words are added to the bank as distractors. */
  | 'bank';

/** Recognized fenced-container names. A container opens with a
 *  `:::name{attrs}` line and closes with a bare `:::` line; the blocks in
 *  between are parsed as usual and bracketed by a `containerStart` /
 *  `containerEnd` marker pair sharing a `containerId`. */
export type ContainerName = 'callout' | 'paragraphs' | 'part' | 'columns' | 'paper' | 'frame'
  /** An exercise (#1225): `:::exercise{type=…}` … `:::` (see
   *  `exercises/model.ts`), with its `:::solution` and `:::hint` inside. */
  | 'exercise' | 'solution' | 'hint'
  /** A module of a composed page (#1062): `:::module{template="…"
   *  name="…"}` … `:::` inside a page fence (see {@link ComposedModuleFence}). */
  | 'module'
  /** A composed page (#854): `::::page{template=…}` … `::::`, four or
   *  more colons (see {@link ComposedPageFence}). Not in
   *  `KNOWN_CONTAINERS`: a three-colon `:::page` is a comic page. */
  | 'composedPage'
  /** Only named by an `unclosedContainer` issue: a `:::figure` (#854) is
   *  read whole into one `resourceBlock` (see {@link FigureInfo}). */
  | 'figure';

/** The fence of a composed page (#854, DESIGN §3.1), on its
 *  `containerStart` marker: `::::page{template="…" spread …}`. The page's
 *  content is the blocks up to the matching `containerEnd`; a bare fence
 *  of the same number of colons closes it, and a bare `:::` inside never
 *  does. `composedPages()` (`composed/document.ts`) gathers the content by
 *  slot. */
export interface ComposedPageFence {
  /** The `template` attribute as written (`''` when missing). */
  template: string;
  /** The `spread` flag (any value but `false`). */
  spread: boolean;
  /** Every attribute of the fence as written (`template`, `spread`, `id`
   *  and the page's own, read by the template as `{attr.x}`). */
  attrs: DirectiveAttrs;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
  /** Ordinal of the fence in its text, from 0: the same in every locale
   *  when the chapters keep their pages in order. */
  fenceIndex: number;
  /** How many colons open (and close) the page: 4 or more. */
  colons: number;
  /** The page's `:::module` blocks (#1062), in Markdown order, a module
   *  inside a module left out. */
  modules?: ComposedModuleFence[];
}

/** A `:::module{template="…" name="…"}` block of a composed page (#1062,
 *  DESIGN §12.7), on its `containerStart`. The slots its blocks name are
 *  the module's: their `slot.name` is scoped by the instance name
 *  (`<name>.<slot>`), the source range still the value as written. */
export interface ComposedModuleFence extends SourceRange {
  /** The `template` attribute as written (`''` when missing). */
  template: string;
  /** The instance name: `name` as written, else `<template>[n]`, `n` the
   *  module's ordinal among the page's modules of that template (1-based).
   *  `''` for a module inside a module. */
  name: string;
  /** The `name` asked for, when the module could not take it (`taken`: an
   *  earlier module of the page has it; `invalid`: it holds a space, `.`,
   *  `#`, `[` or `]`). */
  rejected?: { name: string; reason: 'taken' | 'invalid' };
  /** A module written inside another module: not laid as a module
   *  (`moduleNested`); its blocks are the outer module's. */
  nested?: true;
  /** Every attribute of the fence as written (#1189): its own, besides
   *  `template` and `name`, are read first by `{attr.x}` in the module's
   *  decoration. */
  attrs: DirectiveAttrs;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
}

/** The `slot="…"` a block names (#854, DESIGN §3.2): a heading's
 *  `{slot=…}`, a `::resource{… slot=…}`, a `:::figure{slot=…}`, a code
 *  fence's or any `:::` container's (a `:::frame{slot=…}` sends its whole
 *  body). Absolute source range of the value. */
export interface BlockSlot extends SourceRange {
  name: string;
}

/** A `::label[TEXT]{at=… style=…}` line of a `:::figure` (#854, DESIGN
 *  §3.3): a short text set at an anchor of the picture (P6 lays it out).
 *  `text` is the plain text of the label's inline Markdown, `spans` its
 *  runs and `sourceMap` the absolute source offset of each character of
 *  `text`. `at` is an anchor name, or `{ x, y }` in fractions of the
 *  picture from `at="62% 48%"`. */
export interface FigureLabel extends FigureLabelNode {
  spans: InlineSpan[];
  sourceMap: number[];
  /** Source range of the bracketed text (between `[` and `]`). */
  textStart: number;
  textEnd: number;
  /** Absolute source range of each attribute's value. */
  attrSources: Record<string, SourceRange>;
  /** The anchor the label is set at, as `resourceId#anchorId` (#857);
   *  absent for a label placed by `at="x% y%"`. */
  anchorRef?: string;
  /** The label's stable id on a composed page (#857):
   *  `cp<fenceIndex>:<slot>:label:<anchor>` (`@<n>`, the label's ordinal in
   *  its figure, for one placed by percentages). The same in every locale.
   *  Absent outside composed pages and for a figure that names no slot. */
  id?: string;
}

/** A `:::figure{resource="…" slot="…"}` … `:::` block (#854): one
 *  resource, set as `::resource` sets it, with labels at its anchors. Its
 *  block is a `resourceBlock` whose `resourceId` is the `resource`
 *  attribute. */
export interface FigureInfo {
  /** The fence's attributes as written. */
  attrs: DirectiveAttrs;
  attrSources: Record<string, SourceRange>;
  labels: FigureLabel[];
  /** The words of this edition (#935): the `alt`, `caption` and `note` the
   *  figure gives in place of its resource's, from the fence's attributes
   *  or from `::alt[…]`, `::caption[…]` and `::note[…]` lines (a line wins
   *  over an attribute). Absent when the figure gives none. */
  words?: Partial<Record<FigureWordKind, FigureWord>>;
}

/** The resource fields a `:::figure` can say in its own words. */
export type FigureWordKind = 'alt' | 'caption' | 'note';

/** One of a figure's own words (#935): the text as written (a caption and
 *  a note keep their inline Markdown, as a resource's do) and the absolute
 *  source range of that text. `text` may be empty: `alt=""` says the
 *  picture is decorative. */
export interface FigureWord extends SourceRange {
  text: string;
}

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
  stop?: import('../types.js').TabStop;
  /** {@link stop} in px, resolved by the pipeline against the paragraph's
   *  size (see `resolveTabStop`). */
  px?: import('../measure/tabs.js').TabStopPx;
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
  mathRender?: import('../math/types.js').MathRender;
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
    cluster: import('../citations/types.js').CitationClusterInput;
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

/** The directional isolate a span belongs to (see
 *  {@link InlineSpan.direction}). */
export interface InlineDirection {
  /** The isolate's direction: `rtl` from `:rtl[…]`, `ltr` from `:ltr[…]`. */
  dir: 'ltr' | 'rtl';
  /** Tells isolates apart: two isolates side by side are two runs. Ids
   *  count from 1 in each parse of a text. */
  id: number;
  /** The language of the isolate's text as written (`{lang=en}`), a BCP 47
   *  tag; unset when the directive names none. Renderers may declare it
   *  (HTML `lang`, PDF `/Lang`). */
  lang?: string;
  /** The isolate this one is nested in. */
  outer?: InlineDirection;
}

/** The side line a span belongs to (see {@link InlineSpan.sideline}). */
export interface InlineSideline {
  /** Tells lines apart: two lines set side by side are two runs. Ids
   *  count from 1 in each parse of a text. */
  id: number;
  /** `solid` (default) a rule, `double` two rules (二重傍線), `wavy` a
   *  wave (波線), `dotted` a row of dots. */
  style?: 'solid' | 'double' | 'wavy' | 'dotted';
  /** `under` or `over` the text in its flow (in vertical text over is the
   *  right side, under the left). Unset: under in horizontal text, over
   *  (right) in vertical text, where Japanese books set 傍線. */
  position?: 'over' | 'under';
}

/** The kanbun reading marks of a character (see {@link InlineSpan.kunten}). */
export interface InlineKunten {
  /** Tells directives apart. Ids count from 1 in each parse of a text. */
  id: number;
  /** The 返り点 as written (`kaeri`): レ, 一 二 三 四, 上 中 下, 甲 乙 丙
   *  丁, 天 地 人, or one of them with レ (一レ, 上レ, 甲レ, 天レ). The
   *  kanbun code points (㆑ ㆒ … ㆟, U+3191–319F) read as the characters
   *  they stand for. Unset: none. */
  kaeri?: string;
  /** The 送り仮名 (`okuri`), small kana right of the character in vertical
   *  text, over it in horizontal text. Unset: none. */
  okuri?: string;
  /** A 竪点 (`tate`): the character is read with the next one as one word,
   *  and a short rule joins them (JIS X 4051 §5.7). */
  tate?: true;
  /** Resolved by the layout before measuring (`cjk.kunten`): the marks'
   *  font (CSS shorthand at their size), colour (hex; unset: the text's)
   *  and where the 返り点 go. */
  fontString?: string;
  color?: string;
  placement?: 'inline' | 'interlinear';
}

/** An emphasis-dot mark: its shape, whether it is filled, and its side. */
export interface EmphasisMark {
  /** `dot` (default) ●, `circle` ○ (open), `sesame` ﹅. */
  style?: 'dot' | 'circle' | 'sesame';
  /** `filled` (default for `dot` and `sesame`) or `open` (default for
   *  `circle`). Unset fields take `cjk.emphasisMark`'s (in Japan the
   *  sesame). */
  fill?: 'filled' | 'open';
  /** `under` or `over` the text in its flow (in vertical text over is the
   *  right side, under the left). Unset: `cjk.emphasisMark.position`,
   *  which in Japan is over; else under in horizontal text, over (right)
   *  in vertical text. */
  position?: 'over' | 'under';
}

/** The ruby of one span (see {@link InlineSpan.ruby}). */
export interface InlineRuby {
  /** The reading as written (a group ruby) or this character's reading (a
   *  mono ruby). */
  text: string;
  /** One reading centred over the whole base, which never breaks. */
  group?: boolean;
  /** Where the reading goes, as written (`pos`); unset follows
   *  `cjk.ruby.position`. `right` sets zhuyin beside each character. */
  position?: 'over' | 'under' | 'right';
  /** The ruby this span belongs to (the characters of a mono ruby share
   *  it). */
  id: number;
  /** Jukugo ruby (熟語ルビ, JLReq §3.3.7, #422): the per-character
   *  readings of one word. Each character keeps its reading while every
   *  reading fits its base; a reading that does not may run onto the next
   *  base of the word, and the word shares its reading as a group ruby
   *  when that is not enough. The word may break between its characters,
   *  each part laid out again. Set by `mode=jukugo`, and in a Japanese
   *  document (`japan` region) on any per-character ruby of two
   *  characters or more that does not say `mode=mono`. */
  jukugo?: true;
  /** `mode=mono` was written: the readings stay per character (モノルビ)
   *  in a Japanese document too. */
  mono?: true;
  /** `align=` as written: where a reading shorter than its base sits
   *  (`center`, `jis` 1:2:1, `start`); unset follows `cjk.ruby.align`. */
  align?: 'center' | 'jis' | 'start';
  /** Resolved by the layout before measuring (`cjk.ruby.overhang`, set
   *  only when it is not the clreq quarter em): what a longer reading may
   *  run onto. */
  overhang?: 'none' | 'kana' | 'any';
  /** Resolved by the layout (`cjk.ruby.smallKana: 'full'`): the reading's
   *  small kana are painted full size (がつこう for がっこう). */
  fullKana?: true;
  /** Resolved by the layout before measuring: the reading's font (CSS
   *  shorthand at the ruby size) and colour (hex; unset: the text's). */
  fontString?: string;
  color?: string;
}

/** The warichu note a span is part of (see {@link InlineSpan.warichu}). */
export interface InlineWarichu {
  id: number;
  /** Brackets for this note as written (`open` / `close`); unset follow
   *  `cjk.warichu`. */
  open?: string;
  close?: string;
  /** Resolved by the layout before measuring: the note's font at the note
   *  size (CSS shorthand) and colour (hex; unset: the text's). */
  fontString?: string;
  color?: string;
}

/** The attributes of a `:swatch{…}` beside its colour (#1104), as
 *  written: lengths as `Dimension`s (em of the text the swatch sits in), the
 *  outline colour as a hex or a palette id. */
export interface SwatchShape {
  /** Side of the square. Default 0.75 em (a capital's height). */
  size?: Dimension;
  /** Width of the outline; 0 draws none. Default 6 % of the side (at
   *  least half a pixel). */
  borderWidth?: Dimension;
  /** Colour of the outline. Default the text's. */
  borderColor?: string;
  /** Corner radius, clamped to half the side. Default square corners. */
  radius?: Dimension;
  /** Room after the square, between it and the words that follow (its
   *  label), part of the swatch's advance. Default none. */
  gap?: Dimension;
}

/** An element of an exercise the digital outputs answer through (#1230):
 *  the exercise's id and the slot's key. */
export interface ExerciseHit {
  ex: number;
  slot: string;
}

/** An answer written into an exercise's text (`[[…]]`, #1225): accepted
 *  answers (`[[colour | color]]`) or an inline choice (`[[go | (goes)]]`,
 *  `choice`, the options in parentheses right). */
export interface ExerciseGap {
  /** Each option's inline Markdown, parentheses of a right one taken off. */
  options: InlineSpan[][];
  /** Each option's plain text. */
  texts: string[];
  /** The right options' indexes: every option when not a choice. */
  correct: number[];
  choice: boolean;
  /** The attributes right after the gap (`[[went]]{width=6}`). */
  attrs?: DirectiveAttrs;
}

/** A {@link SwatchShape} resolved for one swatch: lengths in px, the
 *  outline colour as hex. Only the fields the swatch sets. */
export interface SwatchBox {
  sidePx?: number;
  borderWidthPx?: number;
  borderColor?: string;
  radiusPx?: number;
  gapPx?: number;
}

/** A chip style resolved for one chip in its context: lengths in px (em
 *  read against the chip's font size), colours as hex. */
export interface ChipBox {
  styleId: string;
  /** Unset: the surrounding text's family. */
  fontFamily?: string;
  fontSizePx: number;
  bold: boolean;
  italic: boolean;
  /** Unset: the surrounding text colour. */
  color?: string;
  background?: string;
  /** Unset when the outline is not drawn (zero width). */
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
  paddingXPx: number;
  paddingYPx: number;
  /** The chip's base direction when it has one of its own: inline code
   *  reads left to right (#845). Unset: its first strong letter's. */
  direction?: 'ltr';
  /** Set only when the style sets its own (`paddingTop`); `paddingYPx`
   *  otherwise. */
  paddingTopPx?: number;
  /** Set only when the style sets its own (`paddingBottom`); `paddingYPx`
   *  otherwise. */
  paddingBottomPx?: number;
  gapPx: number;
  /** Letters painted as dots to trace (the style's `dotted`), px. */
  dotted?: { spacingPx: number; sizePx: number };
  /** The outline drawn as a line under the text (the style's `underline`). */
  underline?: 'solid' | 'dotted' | 'dashed';
  /** The narrowest the box is (the style's `minWidth`), px. */
  minWidthPx?: number;
}

/** Convenience discriminants for inline span iteration. */
export type TextSpan = InlineSpan & { math?: undefined };
export type MathSpan = InlineSpan & { math: MathMeta };

export type ListKind = 'unordered' | 'ordered' | 'task';

export type ParseIssueKind = 'unclosedMath' | 'unclosedMathBlock' | 'unclosedContainer' | 'unclosedCodeBlock' | 'strayFence';

interface ParseIssueBase {
  kind: ParseIssueKind;
  delimiter: '$' | '$$' | ':::' | '```' | '~~~';
  /** Absolute source offset of the unmatched opening delimiter. */
  sourceStart: number;
  /** End of the scanned region (usually the line or block end). */
  sourceEnd: number;
}

/** An inline `$…` or display `$$…` formula whose closing delimiter is
 *  missing. */
export interface UnclosedMathIssue extends ParseIssueBase {
  kind: 'unclosedMath' | 'unclosedMathBlock';
  delimiter: '$' | '$$';
  /** Raw TeX captured up to the end of the scanned region, for warning
   *  messages — may be empty. */
  tex: string;
}

/** A `:::name` container fence that was still open at end of input. The
 *  parser auto-closes it; `sourceStart`/`sourceEnd` cover the opening line. */
export interface UnclosedContainerIssue extends ParseIssueBase {
  kind: 'unclosedContainer';
  delimiter: ':::';
  containerName: ContainerName;
  containerId: number;
}

/** A ```` ``` ```` or `~~~` code fence still open at the end of the text
 *  (#624): the listing runs to the end; `sourceStart`/`sourceEnd` cover
 *  the opening fence line. */
export interface UnclosedCodeBlockIssue extends ParseIssueBase {
  kind: 'unclosedCodeBlock';
  delimiter: '```' | '~~~';
  /** The fence's language, when it names one. */
  lang?: string;
}

/** A bare `:::` right after a one-line directive (`:::toc`, `:::index`,
 *  `:::pagebreak`, `:::space`…) with no `:::` container open to close
 *  (#1125): those directives take no closing fence, so the line is
 *  dropped instead of printed. `sourceStart`/`sourceEnd` cover the fence
 *  line. */
export interface StrayFenceIssue extends ParseIssueBase {
  kind: 'strayFence';
  delimiter: ':::';
  /** The directive the fence follows. */
  directiveName: DirectiveName;
}

export type ParseIssue = UnclosedMathIssue | UnclosedContainerIssue | UnclosedCodeBlockIssue | StrayFenceIssue;

/** How a text is read (see `parseMarkdownWithIssues`). */
export interface ParseOptions {
  /** Read ```` ``` ```` / `~~~` fences as code blocks (#624). Default
   *  `true`; `false` reads their lines as Markdown, as postext 1.22 did. */
  fences?: boolean;
  /** Read indented code (four spaces or a tab after a blank line) as a
   *  code block. Default `false`. */
  indentedCode?: boolean;
  /** Read a fence in a notation language (```` ```abc ````, ```` ```musicxml ````,
   *  ```` ```mei ````, ```` ```humdrum ````) as a music score (#1172), not
   *  a listing. Default `true`; a fence with `{listing}` stays code. */
  scores?: boolean;
}

/** What one block of an expanded `:::toc` prints. */
export interface TocBlockInfo {
  /** `'entry'`: a heading (title, number, page label, optional subtitle
   *  line); `'part'`: a part divider row. */
  kind: 'entry' | 'part';
  /** Heading level of an entry (`0` for a part). */
  level: number;
  /** Printed number (`''` when none). */
  number: string;
  numbered: boolean;
  /** Page label of the entry's page; absent while unknown. */
  pageLabel?: string;
  /** Physical index of that page in the book (see `OutlineEntry.pageIndex`). */
  pageIndex?: number;
  /** Subtitle line under the title (an entry's `{author}`), when any. */
  subtitle?: string;
  /** Where the entry's heading starts in its chapter's Markdown body
   *  (`OutlineEntry.headingSource`, #857). */
  headingSource?: number;
  /** A numbered entry: the numbers of every numbered entry of its level in
   *  the same contents (one array the entries share), so the number column
   *  takes the widest of them (`الفصل الحادي عشر`) when it is wider than
   *  the configured `numberWidth`. */
  levelNumbers?: readonly string[];
  /** A part row's title and palette overrides. */
  title?: string;
  palette?: Record<string, string>;
  /** A part row that opens a page of the contents of its own
   *  (`toc.parts.breakBefore`, every part but the first, #996). The running
   *  text takes the break from the `:::pagebreak` row before it; a box,
   *  which ignores directives, cuts there when it can go on. */
  breakBefore?: true;
  /** The block of the contents this row belongs to, when the contents
   *  keeps its blocks together (`toc.groups`, `:::toc{keep}`, #850). */
  group?: TocGroupInfo;
}

/** A row's place in a block of the contents (#850). */
export interface TocGroupInfo {
  /** The block's number, unique in the document. */
  id: number;
  /** `'head'`: the head row; `'member'`: a row under it (an entry, or a
   *  part row right above a heading head, which goes with its block);
   *  `'continuation'`: the head row repeated with the continuation mark,
   *  set only when the column it opens holds the rest of a cut block
   *  (else skipped). */
  role: 'head' | 'member' | 'continuation';
  /** The block's first row, which carries the keep: the head, or a part
   *  row right above it. */
  lead?: true;
  /** The fewest entries a cut block keeps with its head
   *  (`minEntriesAfterHead`). */
  minEntries: number;
  /** The head's title, for the `tocGroupSplit` warning. */
  title: string;
}

/** An index mark (`:index[text]{…}` / `:index{…}`, #165): one term the
 *  back-of-book index lists, at the place it was marked. */
export interface IndexMark {
  /** Name of the index (`index="names"`); `''` for the main index. */
  index: string;
  /** The entry's levels, main term first (`term="Heart!valves"`). Empty
   *  for a mark without a term (it indexes nothing). */
  path: string[];
  /** Sort key of the last level (`sort="…"`), when it differs from it. */
  sort?: string;
  /** Reading of the last level in kana (`yomi="…"`, or `reading="…"`,
   *  #425): a Japanese index files the entry by it, before `sort`; any
   *  other index sorts by it as by `sort`. */
  yomi?: string;
  /** The reading the ruby of a visible mark's text gives that text, when
   *  the text is the last level, carries ruby, and every ruby reading is
   *  kana (`:index[{東京|とう|きょう}]` → とうきょう): a Japanese index's
   *  fallback when the mark has no `yomi`. Absent when a base character
   *  is left without a reading. */
  rubyYomi?: string;
  /** Cross-references: the entry prints *See* / *See also* the target
   *  instead of a page number for this mark. */
  see?: string;
  seeAlso?: string;
  /** The principal reference (`main`): its page number is set bold. */
  main?: boolean;
  /** Opens or closes a page range (`range="start"` / `range="end"`). */
  range?: 'start' | 'end';
  /** Source range of the whole mark in the original markdown. */
  sourceStart: number;
  sourceEnd: number;
  /** Source offset of the character the mark is attached to — the last
   *  one before it on its line (`attach: 'before'`), else the first one
   *  after it; `-1` when there is none. The mark lands on that character's
   *  page. */
  anchor: number;
  attach: 'before' | 'after';
}

/** An anchor set inside a block's text (#261): `:anchor{#id}` (invisible)
 *  or `[text]{#id}` (its text stays). Like an index mark it is taken out
 *  before the block parser runs, so it never changes the layout; the build
 *  finds the page and the line of the character it is attached to. */
export interface AnchorMark {
  /** The identifier a reference names (`:ref{id="…"}`). */
  anchorId: string;
  /** The text of a `[text]{#id}` span, without inline marks. */
  text?: string;
  /** Source range of the whole mark in the original markdown. */
  sourceStart: number;
  sourceEnd: number;
  /** Source offset of the character the anchor is attached to (see
   *  {@link IndexMark.anchor}); `-1` when there is none. */
  anchor: number;
  attach: 'before' | 'after';
}

/** What one block of an expanded `:::index` prints: an entry (a term with
 *  its page numbers), under the letter head of its group when it opens
 *  one. */
export interface IndexBlockInfo {
  /** Entry depth (0 = main entry). */
  level: number;
  /** The entry opens a group of the index (a new first letter) other than
   *  the first: the space above groups applies. */
  groupStart?: boolean;
  /** The letter head printed above the entry, in the same block so it
   *  never ends a column alone. */
  group?: string;
  /** Entries with no page of their own that head this one (a main entry
   *  and its sub-entry above a sub-sub-entry), printed above it in the
   *  same block for the same reason, outermost first. */
  leads?: { level: number; spans: InlineSpan[] }[];
  /** Which group of the index the entry is in (0 for the first), its place
   *  among the entry blocks of that group (0 for the one under the head)
   *  and how many they are: what the keep rule of a group divided between
   *  two columns reads (`index.groups.splitMinEntries`, #712). */
  groupIndex?: number;
  groupPlace?: number;
  groupSize?: number;
}

export interface ContentBlock {
  type: ContentBlockType;
  text: string;
  spans: InlineSpan[];
  level?: number; // heading level 1-6
  /** For `heading` blocks: attributes parsed from a trailing
   *  `{key="value" other=bare}` on the heading line (e.g.
   *  `# Title {author="I. Zango"}`). The braces and their content are
   *  removed from `text`. Absent when the heading carries no attributes. */
  attrs?: DirectiveAttrs;
  /** Absolute source range of each quoted attribute value, so editors can
   *  map text rendered from `{attr.<key>}` back to the markdown. */
  attrSources?: Record<string, { start: number; end: number }>;
  /** Plain-text indices of forced title breaks (`\\` in the source). */
  titleBreaks?: number[];
  /** A paragraph, quotation or list item with forced line breaks (#620): a
   *  backslash ending a source line, or `\\`, which its text holds as
   *  `BREAK_PLACEHOLDER` (U+2028). This is the block as postext 1.22 read
   *  it, every such backslash printed and the lines joined with a space,
   *  which a configuration stored before #620 lays out instead
   *  (`bodyText.hardLineBreaks: false`, see `literalBreaksFor`). Absent on
   *  a block with no forced break. */
  literalBreaks?: { text: string; spans: InlineSpan[]; sourceMap: number[] };
  /** A numbered heading whose level or style sets `numberPosition:
   *  'replace'`: its title is emptied before layout and the generated
   *  number is printed (and listed) as the whole title (#401). */
  numberIsTitle?: true;
  /** Depth (1-based) for listItem blocks. Level 1 = outermost. */
  depth?: number;
  /** Discriminator for listItem blocks. Defaults to 'unordered' when absent. */
  listKind?: ListKind;
  /** First number literal from the source (ordered lists only). */
  startNumber?: number;
  /** Checkbox state for task list items. */
  checked?: boolean;
  /** TeX source for `mathDisplay` blocks. */
  tex?: string;
  /** For `paragraph` blocks: the paragraph continues the one a display
   *  formula interrupted — the formula sits right under that paragraph's
   *  text and this paragraph's first line right under the formula's
   *  closing `$$`, with no blank line on either side — so it is set with no
   *  first-line indent, as TeX sets the text after a display. */
  continuesParagraph?: boolean;
  /** For `paragraph` blocks: the block is the definition of the footnote
   *  with this id (`[^id]: text`, the `[^id]:` left out of `text`). The
   *  layout takes it out of the flow and sets it as a note. */
  footnoteDef?: string;
  /** Set on the paragraphs the layout builds to set a note (`chapterEnd`
   *  placement): the id of the note. */
  footnoteNote?: string;
  /** The block ends with its callout style's end mark (a proof's ∎,
   *  #530), the last character of its text: the layout sets it flush
   *  right on the last line. */
  endMark?: string;
  /** Set on a bibliography entry (#269): the key of the work it lists. The
   *  entry is the anchor `ref-<key>` citations link to. */
  bibEntry?: string;
  /** For `directive` blocks: the directive name (e.g. `'pagebreak'`). */
  directiveName?: DirectiveName;
  /** For `directive` blocks: parsed attributes. */
  directiveAttrs?: DirectiveAttrs;
  /** For a `:::verse` block (#378): the poem's fence attributes. The
   *  block's `type` is `'paragraph'`; its text holds the hemistichs, a tab
   *  (`\t`) where a bayt's two hemistichs meet (the source's `||`) and a
   *  line feed (`\n`) between bayts, so the plain text and the source map
   *  read the poem as written (see `pipeline/text/verse.ts`). A poem in the line
   *  layout (#620) is one such block per stanza, its lines joined by line
   *  feeds (`VerseInfo.stanza`, `pipeline/text/verseLines.ts`). */
  verse?: VerseInfo;
  /** For a `:::page` block (a comic page, #555) or a `:::strip` block (a
   *  comic in the text flow, #566): its split, panels and script, read
   *  whole by `parseComicFence`. The block's `type` is `'directive'` and
   *  its `directiveName` `'page'` or `'strip'`. */
  comic?: ComicPageSource;
  /** For a `:::references` block (#268): its body as written — BibTeX,
   *  CSL-JSON or CSL-YAML — up to the closing `:::`, not parsed as
   *  Markdown. */
  rawBody?: string;
  /** Present on the blocks a `:::toc` directive expands into (see
   *  `pipeline/contents/toc.ts`): what the entry lists. The block's `type` is
   *  `'paragraph'` and its text the entry title, so it flows and maps back
   *  to the directive line like ordinary content. */
  toc?: TocBlockInfo;
  /** Present on the blocks a `:::index` directive expands into (see
   *  `pipeline/contents/indexDirective.ts`). */
  index?: IndexBlockInfo;
  /** The index marks set in this block's text, in source order. */
  indexMarks?: IndexMark[];
  /** The anchors set in this block's text (`:anchor{#id}`, `[text]{#id}`),
   *  in source order (#261). */
  anchorMarks?: AnchorMark[];
  /** For a `code` block (#624): the listing (see {@link CodeBlockInfo}). */
  code?: CodeBlockInfo;
  /** Present on `score` blocks (#1172). */
  score?: ScoreBlockInfo;
  /** The inline code spans (`` `x` ``) of a paragraph, a heading, a
   *  quotation or a list item, as source ranges of their text (between the
   *  backticks, absolute offsets into the markdown), in order: a layout
   *  with `codeStyle.inline` sets the characters mapped into them in the
   *  code face (#624). Absent when the block has none. */
  inlineCode?: Array<{ start: number; end: number }>;
  /** For `resourceBlock` blocks: the referenced `Resource.id`. */
  resourceId?: string;
  /** For a `resourceBlock` written as `:::figure{resource=…}` (#854): the
   *  fence's attributes and its `::label` lines. */
  figure?: FigureInfo;
  /** For the `containerStart` of a composed page (`containerName:
   *  'composedPage'`, #854): its fence. */
  composedPage?: ComposedPageFence;
  /** For the `containerStart` of a `:::module` inside a composed page
   *  (#1062): the module. */
  module?: ComposedModuleFence;
  /** The slot the block names (#854): where a composed page pours it.
   *  Absent when it names none (it goes to the template's flow frame).
   *  Inside a `:::module` (#1062) its `name` is `<module>.<slot>`. */
  slot?: BlockSlot;
  /** For `containerStart` / `containerEnd` marker blocks: the container
   *  name (`'callout'`, `'paragraphs'`, `'part'`). */
  containerName?: ContainerName;
  /** For `containerStart` blocks: attributes parsed from the opening fence.
   *  Always present on a start marker (empty object when the fence carries
   *  no `{…}`). */
  containerAttrs?: DirectiveAttrs;
  /** For `containerStart` blocks with attributes: the absolute source
   *  range of each attribute's value (a `:::frame{label="…"}`'s tab text
   *  maps back to it, #857). */
  containerAttrSources?: Record<string, SourceRange>;
  /** For container marker blocks: identifier shared by the matching
   *  start/end pair. Ids start at 1 and increase per parse. */
  containerId?: number;
  /** The block's base direction when the source sets one (#367): a
   *  heading's own `{dir=ltr}` / `{dir=rtl}`, or that of the `:::`
   *  container it sits in (the innermost that sets one; the container's
   *  start marker carries it too). Absent when nothing sets it: the block
   *  follows the document's `direction`. */
  direction?: 'ltr' | 'rtl';
  /** The language a `:::` container names for its blocks (`lang=en`),
   *  the innermost that names one (#401). Absent when none does: the block
   *  is in the document's language. Its ordered lists number in that
   *  language's digits. */
  lang?: string;
  /** Character offset of the first source character of this block in the original markdown */
  sourceStart: number;
  /** Character offset just past the last source character of this block */
  sourceEnd: number;
  /**
   * Per-plain-character map: sourceMap[i] = absolute source offset (in the
   * original markdown) of the i-th character of `text`. `sourceMap.length`
   * equals `text.length`.
   */
  sourceMap: number[];
}
