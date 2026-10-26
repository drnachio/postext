import type { ClosingBoxLever, ColumnBalancingConfig, ColumnHeadSpace, KeepWithNextSplit, StretchAfterWideFloats, TrailingStep } from '../columnBalancing.js';
import type { DesignSlot, ResolvedDesignSlot } from '../designElements.js';
import type { FigureStyle, TextAlign, TextAlignKeyword } from '../text/locale.js';
import type { ColorValue, Dimension } from '../page.js';
import type { ParagraphDropCap } from '../text/paragraphStyles.js';

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

/** Where a heading's generated number stands (see
 *  `HeadingLevelConfig.numberPosition`). */
export type HeadingNumberPosition = 'before' | 'replace';

export interface HeadingLevelConfig {
  level: number;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  fontFamily?: string;
  /** The level's figures (see {@link FigureStyle}). Default: the headings'
   *  `figureStyle`, for the family they set. */
  figureStyle?: FigureStyle;
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
  /** Where the generated number stands. `'before'` (default): before the
   *  title, joined by `numberSeparator`. `'replace'`: the number is the
   *  whole title, and the title written in the source is not printed: a
   *  `# Night` under `الليلة {1:ordinal-feminine}` prints الليلة الثانية,
   *  and its contents row, bookmark and running head read the same. Only
   *  for numbered headings with a template (the level's, or their style's);
   *  any other keeps its title. */
  numberPosition?: HeadingNumberPosition;
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
  /** Whether a `span: 'page'` heading starts a new page. Default `true`:
   *  it opens the next page (and `breakBefore` picks its side). `false`,
   *  with `breakBefore.enabled: false`, opens it where the text reaches
   *  (#539), as a page-span box does: the columns above end level (the
   *  band is balanced, `headings.balancing.trailing`), the heading's band
   *  (its design, or the default opener) is set across the content area
   *  under them, and the text goes on in every column below it — a second
   *  article of a bulletin under the end of the first. When the room left
   *  would not hold the heading and the widow minimum of lines under it,
   *  it opens the next page as before. No effect on a `span: 'column'`
   *  heading. */
  spanBreak?: boolean;
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
  /** 行取り (gyōdori, JLReq §4.1.6): the heading takes exactly this many
   *  lines of the body grid (N × the body line pitch), its text centred in
   *  them, in place of its `marginTop` and `marginBottom` — "3行取り" is
   *  `lineSpan: 3`. The band starts on the grid when the heading snaps to it
   *  (`snapToGrid`), keeps its lines at the head of a column and after
   *  another heading, and holds its text centred across the line in
   *  vertical text too. A heading whose lines need more room than N body
   *  lines takes the next whole number of lines. Not read by a heading set
   *  as a page opener (`span: 'page'`) or from its `advancedDesign`, nor
   *  inside a box. Unset (default): the margins apply. */
  lineSpan?: number;
  /** Indent of the heading's lines from the side lines start on (字下げ:
   *  the top of a vertical line, the left of an English one), in which `em`
   *  is the BODY size, as Japanese books count a heading's indent in body
   *  characters (JLReq §4.1.3: 4, 6 and 8 字 for the levels of a vertical
   *  book). The measure narrows by it; a centred heading centres in what is
   *  left. Default `0`. */
  indent?: Dimension;
  /** Indent of the heading's first line only (#636), measured from
   *  {@link indent} (so the first line starts `indent + firstLineIndent`
   *  in): the lines it wraps onto start at `indent`, as a body paragraph's
   *  turnover lines start at the margin. GB/T 9704 sets every level of
   *  head two cells in with its turnover back at the margin:
   *  `{ value: 2, unit: 'em' }`. `em` is the BODY size, as for `indent`,
   *  so two ems are two cells of the body grid at any heading size. A
   *  numbered heading's number comes after the indent. A centred heading
   *  takes it as a centred body paragraph does: its first line centres in
   *  the room after the indent. A heading overrides it with
   *  `{firstLineIndent=N}` (`0` clears it). Default `0`. */
  firstLineIndent?: Dimension;
  /** 字取り (jidori, JLReq §3.7.3, §4.1): a heading shorter than this many
   *  of its own characters is spaced out evenly to fill exactly that width
   *  (`jidori: 3` sets 序章 as 序　章). Applies to a heading that fits one
   *  line; a longer title is set as it is. A heading overrides it with
   *  `{jidori=N}` (`{jidori=0}` turns it off). Unset (default): no
   *  spacing. */
  jidori?: number;
  /** A drop cap opening the first body paragraph after a heading of this
   *  level or style (#623), found past markers, boxes that left the flow
   *  and floated figures; never a paragraph inside a box. A heading turns
   *  it off with `{dropcap=false}` or sets its lines with `{dropcap=N}`; a
   *  heading style turns its level's off with `false`. Unset: none. */
  dropCap?: ParagraphDropCap | false;
}

export type HeadingTextTransform = 'none' | 'uppercase';

export interface ResolvedHeadingLevelConfig {
  level: number;
  fontSize: Dimension;
  lineHeight: Dimension;
  /** The family with the level's figures (a feature family, see
   *  `withFigureStyle`). */
  fontFamily: string;
  /** A heading style's own `figureStyle`, applied to the family of the
   *  level it is merged over (`createHeadingLevelResolver`). A level
   *  carries its figures in `fontFamily` and leaves it unset. */
  figureStyle?: FigureStyle;
  color: ColorValue;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  numberingTemplate: string;
  /** The level's own separator, else `' '`. */
  numberSeparator: string;
  /** `'replace'` when the number stands for the title; absent for the
   *  default `'before'` on a level. A heading style's overrides carry
   *  `'before'` when the style sets it, to keep the title its level would
   *  replace. */
  numberPosition?: HeadingNumberPosition;
  italic: boolean;
  /** The level's own tracking, else `0`. */
  letterSpacing: Dimension;
  breakBefore: ResolvedHeadingBreakBeforeConfig;
  span: HeadingSpan;
  /** `false` when set so (see {@link HeadingLevelConfig.spanBreak});
   *  absent, the default, is `true`. */
  spanBreak?: boolean;
  advancedDesign: ResolvedHeadingAdvancedDesignConfig;
  textTransform: HeadingTextTransform;
  hidden: boolean;
  /** The level's own value, else `headings.snapToGrid`. */
  snapToGrid: boolean;
  /** Absent unless set (see {@link HeadingLevelConfig.lineSpan}). */
  lineSpan?: number;
  /** Absent unless set (see {@link HeadingLevelConfig.indent}). */
  indent?: Dimension;
  /** Absent unless set (see {@link HeadingLevelConfig.firstLineIndent}). */
  firstLineIndent?: Dimension;
  /** Absent unless set (see {@link HeadingLevelConfig.jidori}). */
  jidori?: number;
  /** Absent unless set (see {@link HeadingLevelConfig.dropCap}); a heading
   *  style's `false` lays an explicit `undefined` over its level's. */
  dropCap?: ParagraphDropCap;
}

export interface HeadingsConfig {
  fontFamily?: string;
  /** The figures of every level (see {@link FigureStyle}); a level's own
   *  `figureStyle` wins. Default: the font's own. */
  figureStyle?: FigureStyle;
  lineHeight?: Dimension;
  color?: ColorValue;
  textAlign?: TextAlignKeyword;
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
  /** With {@link keepWithNext} on, let a heading close the last column of an
   *  even page all the same: its text opens the facing odd page, which the
   *  reader sees beside it in the same spread (JLReq §4.1.7 b allows it in
   *  vertical books; the spread is the same in a left-bound book). Default
   *  `false`. */
  keepWithNextSpread?: boolean;
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
  /** What a heading that snaps to the grid keeps of its space above when
   *  it opens a column (at the page's head, or under a float that heads
   *  the column), where its `marginTop` is dropped (#706):
   *  - `'none'` (default): the whole space is dropped, the heading stands
   *    on the column's first line, level with the head of the column
   *    beside it, and the grid snap gives the part of a line it needs back
   *    under the heading, so its text can stand further from it than
   *    after a paragraph.
   *  - `'remainder'`: the space is dropped in whole grid lines only. The
   *    part of a line that is left stays above the heading, so the text
   *    under it starts at the distance it starts at under the same heading
   *    set after a paragraph. The heading no longer stands on the column's
   *    first line; no line of body text moves. For a book in one column,
   *    where no column head beside it shows the difference.
   *  Any other value reads as `'none'`. `'remainder'` does not apply under
   *  a page-span opener band, nor to a `span: 'page'`, `lineSpan` or hidden
   *  heading, nor to one painted from its `advancedDesign` (its band is
   *  the design's). */
  columnHeadSpace?: ColumnHeadSpace;
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
   *  way, unless its text element reads inline marks (`inlineMarks: true`):
   *  there `{titleText}` keeps the heading's runs (#539). Default `true`; configurations stored earlier whose
   *  headings carry marks are read with `false` (see `migrateConfig` in
   *  `postext/bundle`). */
  inlineMarks?: boolean;
  levels?: HeadingLevelConfig[];
}

export interface ResolvedHeadingsConfig {
  fontFamily: string;
  lineHeight: Dimension;
  color: ColorValue;
  textAlign: TextAlign;
  fontWeight: number;
  marginTop: Dimension;
  marginBottom: Dimension;
  keepWithNext: boolean;
  /** Present (`true`) only when set. */
  keepWithNextSpread?: boolean;
  keepWithNextSplit: KeepWithNextSplit;
  snapToGrid: boolean;
  columnHeadSpace: ColumnHeadSpace;
  inlineMarks: boolean;
  balancing: {
    enabled: boolean;
    maxLinesPerHeading: number;
    maxLinesBeforeLoose: number;
    stretchAfterLists: boolean;
    maxLinesAfterList: number;
    stretchAfterDisplays: boolean;
    stretchAfterFloats: boolean;
    maxLinesAfterFloat: number;
    stretchAfterWideFloats: StretchAfterWideFloats;
    looseParagraphs: boolean;
    maxLooseParagraphs: number;
    trackParagraphs: boolean;
    maxTracking: number;
    fillShortColumns: boolean;
    trailing: boolean;
    trailingStep: TrailingStep;
    beforeSpan: boolean;
    closingBox: ClosingBoxLever;
    /** Present only when `'off'` (#632): every other configuration
     *  resolves as before. */
    gridLines?: 'off';
  };
  levels: ResolvedHeadingLevelConfig[];
}
