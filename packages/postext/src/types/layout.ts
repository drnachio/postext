import type { CompositionRule } from './bodyText.js';
import type { ColorValue, ColumnRuleConfig, Dimension, LayoutType, SideColumnRole, SideColumnSide, WritingMode } from './page.js';
import type { FloatShrinkMode, TextWrapConfig } from './resourceTypes.js';

export interface LayoutConfig {
  layoutType?: LayoutType;
  /** `multiple` only: how many equal columns the body runs in, 3 to 8.
   *  Default 3. A value outside that range (or not a whole number) is
   *  clamped to the nearest whole count that is, and reported on
   *  `VDTDocument.configWarnings` (`columnCountClamped`). Every column is
   *  `(content width − (n − 1) × gutterWidth) / n` wide. */
  columnCount?: number;
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
  /** How a bitmap without its own `resolution` takes its natural print
   *  size (#631): `'document'` (default) reads its pixels at `page.dpi`;
   *  a number is the ppi of every such bitmap; `'file'` uses the
   *  resolution read from the file (`Resource.bitmap.fileResolution`),
   *  72 and 96 counting as unset, else `page.dpi`. The column caps the
   *  natural size either way; a smaller picture is never enlarged. */
  bitmapResolution?: BitmapResolution;
  /** The document's default for scaling a floated picture to the room of
   *  its slot (#626): `mode` as `ResourcePlacement.shrink`, `minScale` as
   *  `ResourcePlacement.minScale` (default 0.7). A resource's placement,
   *  then its type's `defaultPlacement`, override it. Default
   *  `{ mode: 'never' }`. Unlike {@link fitFiguresToPage}, a hard cap at
   *  the content area, this looks at the band the float would take. */
  floatShrink?: FloatShrinkConfig;
  /** Text wrap round a resource or a box narrower than its column (#627):
   *  the gap, the narrowest text measure, the fewest lines beside and the
   *  default width (see {@link TextWrapConfig}). A resource opts in with
   *  `placement.wrap`, a box with its `wrap` attribute. */
  wrap?: TextWrapConfig;
  /** The document default of `placement.citingPage` (#633): a `'top'` or
   *  `'auto'` float may head the page or column where its citing line
   *  lands, the text above the reference moving down under it. A
   *  resource's placement, then its type's `defaultPlacement`, override
   *  it. Default `false`: a float takes the first free slot after the line
   *  that cites it. */
  floatsAtCitingPage?: boolean;
  /** The largest share of a column's height, 0 to 1, a float set at the
   *  head of the page or column that cites it (`placement.citingPage`) may
   *  take with the floats already standing there, so the page keeps some
   *  room for its text (LaTeX's `\topfraction`). Default 0.7. */
  maxTopFraction?: number;
  /** On the closing page of a chapter (and of the document), move the
   *  page-wide figures and tables set below the last band of text up to sit
   *  one float gap under it, stacked in their order, instead of at the page
   *  foot — nothing follows them there. Default `true`. `false` keeps them
   *  where their placement put them: a `position: 'bottom'` float ends at
   *  the page foot on the closing page as on every other page. Pages with a
   *  side column never move them. */
  hugClosingFloats?: boolean;
  /** Under a page-span opener (a heading level or style with
   *  `span: 'page'`) set over two or more text columns, the head of the
   *  opener's own column, right under its band, is a slot for a `'top'` or
   *  `'auto'` float, of one column or of several from it, level with the
   *  heads of the other columns of the band (#639): a floated box fenced
   *  right after the opener, or a resource embedded there, sits under the
   *  opener in the first column and the column's text starts under it.
   *  Default `true`. `false` keeps the rule of postext 1.24 and earlier:
   *  the opener's column offers no head slot, so such a float lands from
   *  the second column on. A configuration stored by an earlier version is
   *  read with `false` when it sets a page-span heading (see
   *  `migrateConfig` in `postext/bundle`). */
  floatsUnderOpener?: boolean;
  /** Floats on an opener page (#749): the page a part opens, the page a
   *  heading opens with its own break (`breakBefore`, or a `span: 'page'`
   *  heading that opens a page), and the first page of a document that
   *  starts with a heading. A float is a figure, a table or a comic strip
   *  with a floating placement, or a `:::callout` floated to the head or
   *  foot (`placement: 'top' | 'bottom' | 'auto'`), in a column, across
   *  the page or in the side column; an inline (`'here'`) resource, a
   *  `'fixed'` box and a `span: 'side'` box are not. `'allow'` (the
   *  default) sets floats there as on any page. `'warn'` lays the page out
   *  the same and reports each float on it (an `openerFloat` content
   *  warning). `'avoid'` keeps the opener page clear: a float that would
   *  land there takes the first free slot after it, so the page holds the
   *  opener and text alone. */
  openerFloats?: CompositionRule;
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
  /** Whether `placement.captionSide` acts on a resource set in the text
   *  (`position: 'here'`) as it does on a column float (#729): its caption
   *  and note go to the float-only side column of a `oneAndHalf` layout,
   *  level with the top of the body, and the block in the text column is
   *  as tall as the body alone. Default `true`. `false`: `captionSide`
   *  acts on column floats only, as up to postext 1.27 (a `oneAndHalf`
   *  configuration stored by an earlier version is read with `false` when
   *  its chapters embed a resource, see `migrateConfig` in
   *  `postext/bundle`). */
  inlineCaptionSide?: boolean;
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
  /** `:::columns` groups in the running text and groups that split (#634):
   *  a `:::columns` fence outside a box sets its blocks in sub-columns of
   *  the text column (or, with `span="page"`, across the page), and a
   *  group, in a box or in the text, is cut between its sub-columns when
   *  the box goes on in the next column or page. Default `true`. `false`
   *  keeps the rules of postext 1.24 and earlier: a fence outside a box is
   *  ignored and a box never cuts inside a group. A configuration stored
   *  by an earlier version is read with `false` when its chapters hold a
   *  `:::columns` fence (see `migrateConfig` in `postext/bundle`). */
  flowColumns?: boolean;
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

/** How bitmaps without a resolution of their own are sized (see
 *  `LayoutConfig.bitmapResolution`): `'document'`, `'file'` or a ppi. */
export type BitmapResolution = 'document' | 'file' | number;

/** The document default for scaling floated pictures (see
 *  `LayoutConfig.floatShrink`). */
export interface FloatShrinkConfig {
  mode?: FloatShrinkMode;
  minScale?: number;
}

/** {@link TextWrapConfig} resolved; `gap` absent is one body line. */
export interface ResolvedTextWrapConfig {
  gap?: Dimension;
  minTextWidth: Dimension | number;
  minLinesBeside: number;
  defaultWidth: number;
}

/** Where an inline resource keeps the float gap (see
 *  `LayoutConfig.inlineResourceGap`). */
export type InlineResourceGap = 'around' | 'above';

export interface ResolvedLayoutConfig {
  layoutType: LayoutType;
  /** As written (a `multiple` layout clamps it when it cuts the columns,
   *  see {@link columnCountUsed}). */
  columnCount: number;
  gutterWidth: Dimension;
  sideColumnPercent: number;
  sideColumnRole: SideColumnRole;
  sideColumnSide: SideColumnSide;
  columnRule: { enabled: boolean; color: ColorValue; lineWidth: Dimension };
  fitFiguresToPage: boolean;
  bitmapResolution: BitmapResolution;
  floatShrink: { mode: FloatShrinkMode; minScale: number };
  wrap: ResolvedTextWrapConfig;
  floatsAtCitingPage: boolean;
  maxTopFraction: number;
  hugClosingFloats: boolean;
  floatsUnderOpener: boolean;
  openerFloats: CompositionRule;
  inlineResourceGap: InlineResourceGap;
  inlineCaptionSide: boolean;
  inlineResourceGapInBoxes: boolean;
  flowColumns: boolean;
  boxChildSplitMinLines: number;
  writingMode: WritingMode;
}
