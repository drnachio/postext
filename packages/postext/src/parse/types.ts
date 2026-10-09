import type { ComicPageSource } from '../comics/types';

export type ContentBlockType =
  | 'heading'
  | 'paragraph'
  | 'blockquote'
  | 'listItem'
  | 'mathDisplay'
  | 'resourceBlock'
  | 'directive'
  | 'containerStart'
  | 'containerEnd';

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
   *  `stanzaSpace`, `keepStanzas`, …); `pipeline/verse.ts` and
   *  `pipeline/verseLines.ts` read them. */
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

/** Recognized directive names. Unknown names are not parsed as directives —
 *  they fall through to the paragraph branch and surface via warnings. */
export type DirectiveName = 'pagebreak' | 'numbering' | 'columnbreak' | 'space' | 'toc' | 'index' | 'bibliography' | 'references' | 'verse' | 'page' | 'strip';

/** Recognized fenced-container names. A container opens with a
 *  `:::name{attrs}` line and closes with a bare `:::` line; the blocks in
 *  between are parsed as usual and bracketed by a `containerStart` /
 *  `containerEnd` marker pair sharing a `containerId`. */
export type ContainerName = 'callout' | 'paragraphs' | 'part' | 'columns' | 'paper';

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
export interface InlineLink {
  start: number;
  end: number;
  href: string;
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
  /** A numbered bibliography entry's label column (#290): `'gap'` is the
   *  space after the label, widened when the entry is measured so the text
   *  starts at the column's edge (`MeasureBlockOptions.labelColumnPx`);
   *  `'lead'` is a space before the label that pushes it against the gap
   *  (a right-aligned label). Neither breaks nor stretches. Set by the
   *  pipeline. */
  labelTab?: 'lead' | 'gap';
  /** Marks this span as a resource caption's numbered label (e.g. "Figure 1.")
   *  so renderers can paint it in the configured label colour. Flows span →
   *  token → segment, mirroring {@link ref}. */
  captionLabel?: boolean;
  /** Present when this span carries an inline math formula. The `text` is
   *  a single `\uFFFC` placeholder that layout treats atomically. */
  math?: MathMeta;
  /** Resolved math render — populated by the pipeline before measurement
   *  so the parser remains free of MathJax dependencies. */
  mathRender?: import('../math/types').MathRender;
  /** Present when this span is an inline `:swatch{color="…"}` — a small
   *  filled square set on the baseline, the key of a colour legend (a
   *  table note explaining its cell fills). The `text` is a single
   *  placeholder char that layout treats atomically. `color` is a hex
   *  colour or the id of a document palette entry, resolved to a hex by the
   *  pipeline before measurement; unresolved, the square is drawn as an
   *  empty outline. */
  swatch?: {
    color: string;
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
    cluster: import('../citations/types').CitationClusterInput;
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
  /** Set only when the style sets its own (`paddingTop`); `paddingYPx`
   *  otherwise. */
  paddingTopPx?: number;
  /** Set only when the style sets its own (`paddingBottom`); `paddingYPx`
   *  otherwise. */
  paddingBottomPx?: number;
  gapPx: number;
}

/** Convenience discriminants for inline span iteration. */
export type TextSpan = InlineSpan & { math?: undefined };
export type MathSpan = InlineSpan & { math: MathMeta };

export type ListKind = 'unordered' | 'ordered' | 'task';

export type ParseIssueKind = 'unclosedMath' | 'unclosedMathBlock' | 'unclosedContainer';

interface ParseIssueBase {
  kind: ParseIssueKind;
  delimiter: '$' | '$$' | ':::';
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

export type ParseIssue = UnclosedMathIssue | UnclosedContainerIssue;

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
  /** A numbered entry: the numbers of every numbered entry of its level in
   *  the same contents (one array the entries share), so the number column
   *  takes the widest of them (`الفصل الحادي عشر`) when it is wider than
   *  the configured `numberWidth`. */
  levelNumbers?: readonly string[];
  /** A part row's title and palette overrides. */
  title?: string;
  palette?: Record<string, string>;
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
   *  read the poem as written (see `pipeline/verse.ts`). A poem in the line
   *  layout (#620) is one such block per stanza, its lines joined by line
   *  feeds (`VerseInfo.stanza`, `pipeline/verseLines.ts`). */
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
   *  `pipeline/toc.ts`): what the entry lists. The block's `type` is
   *  `'paragraph'` and its text the entry title, so it flows and maps back
   *  to the directive line like ordinary content. */
  toc?: TocBlockInfo;
  /** Present on the blocks a `:::index` directive expands into (see
   *  `pipeline/indexDirective.ts`). */
  index?: IndexBlockInfo;
  /** The index marks set in this block's text, in source order. */
  indexMarks?: IndexMark[];
  /** The anchors set in this block's text (`:anchor{#id}`, `[text]{#id}`),
   *  in source order (#261). */
  anchorMarks?: AnchorMark[];
  /** For `resourceBlock` blocks: the referenced `Resource.id`. */
  resourceId?: string;
  /** For `containerStart` / `containerEnd` marker blocks: the container
   *  name (`'callout'`, `'paragraphs'`, `'part'`). */
  containerName?: ContainerName;
  /** For `containerStart` blocks: attributes parsed from the opening fence.
   *  Always present on a start marker (empty object when the fence carries
   *  no `{…}`). */
  containerAttrs?: DirectiveAttrs;
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
