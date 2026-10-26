import type { BoxSideName, CalloutBodyStyleConfig, CalloutBorderConfig, CalloutFixedConfig, CalloutIconAlign, CalloutIconConfig, CalloutIconCornerSide, CalloutIconKind, CalloutIconPosition, CalloutIconShape, CalloutLabelConfig, CalloutLabelIconKind, CalloutLabelIconPlacement, CalloutLabelPosition, CalloutListStyleConfig, CalloutMarkerConfig, CalloutPaddingConfig, CalloutPlacement, CalloutSideAtColumnEnd, CalloutSpan, CalloutStripeConfig, CalloutStripeSide, CalloutTextTransform, CalloutTitleStyleConfig, CalloutWidth, CornerRadius, IconTint } from './calloutParts.js';
import type { DesignSlot, ResolvedDesignSlot } from '../designElements.js';
import type { ElementAnchor } from '../designPlacement.js';
import type { ColorValue, Dimension } from '../page.js';
import type { TabStop } from '../text/paragraphStyles.js';
import type { ResourceCounterFormat, ResourceCounterReset } from '../resources/resourceTypes.js';

/** A named callout style, selected by `:::callout{type="<id>"}`. */
export interface CalloutStyleConfig {
  id: string;
  /** Human-readable name (editor UI only). Defaults to {@link id}. */
  name?: string;
  /** The id of another style of `calloutStyles` this one is based on
   *  (#905): every field it leaves unset comes from that style (objects
   *  such as `padding`, `titleStyle` or `fixed` key by key; a colour or a
   *  length whole), so a style per place (`placement: 'fixed'`, its
   *  `fixed.offset`) can share the look of one. `id` and `name` are not
   *  inherited. A parent may extend another; an id no style has, or a
   *  loop, leaves the style standing alone (`calloutStyleExtendsUnknown`,
   *  `calloutStyleExtendsCycle`). */
  extends?: string;
  /** Default title text; empty / unset = no title. The fence `title`
   *  attribute overrides it per instance. */
  title?: string;
  /** Default `'column'`. Overridable per instance with the `span` attribute. */
  span?: CalloutSpan;
  /** How many adjacent columns a floated `span: 'column'` box (`placement`
   *  `auto`, `top` or `bottom`) takes, as `ResourcePlacement.columns` does
   *  for a figure: a story's box across two of a newspaper's five columns
   *  (#505). Default 1. Overridable per instance with the `columns`
   *  attribute. A box set in the flow (`here`) keeps to its column. */
  columns?: number;
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
  /** Default `0`. One length, or one per corner (#1059). */
  borderRadius?: CornerRadius;
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
  /** Text of that marker, in the box's body face and size. Defaults to a
   *  split table's marker in the document language (`"Continued"`,
   *  `"Continúa"`, `"À suivre"`, `"次ページへ続く"`…; English for a
   *  language with none, see `defaultTableContinuationStrings`). */
  continuesMarker?: string;
  /** Alignment of the marker in the box's inner width. Default `'right'`. */
  continuesMarkerAlign?: CalloutMarkerTextAlign;
  /** Set the marker in italics. Default `true`. */
  continuesMarkerItalic?: boolean;
  /** Count the boxes of this style as numbered statements — theorems,
   *  lemmas, definitions (#530): each prints its label and number
   *  ("Theorem 2."), and a reference to the fence's `{#id}` prints them
   *  too. Unset: the boxes are not counted. */
  numbering?: CalloutNumberingConfig;
  /** A mark set flush right at the end of the box's last line, as
   *  amsthm's `\qed` ends a proof: `'∎'` or `'□'`. It goes on the last
   *  line when there is room for it after a space, else on a line of its
   *  own. Default `''` (none). */
  endMark?: string;
  /** A design laid out in the box (#1014): the elements of a heading
   *  design (texts, pictures, rules, boxes) in a band under the box title,
   *  across the box's inner width; the box's own content follows the band.
   *  Texts read `{titleText}` (the box title), `{boxText}` and
   *  `{boxText.<n>}` (the box's content, see `setsContent`), `{attr.<key>}`
   *  (the fence's attributes: `:::callout{type="row" picture="cat"}`) and
   *  the document placeholders (`{title}`, `{author}`…); a picture's
   *  `resourceId` may read them too. The band is as tall as the
   *  elements reach, or `minHeight`. A box split across columns or pages
   *  draws it on its first fragment only. Unset or `enabled: false`: no
   *  band. */
  design?: CalloutDesignConfig;
}

/** See {@link CalloutStyleConfig.design}. */
export interface CalloutDesignConfig {
  /** Default `true` once a design is set. */
  enabled?: boolean;
  /** The elements, laid out against the band: `anchor.to: 'container'` is
   *  the band (the box's inner width, from under the title), `'page'` and
   *  `'bleed'` are not read in a box. */
  slot: DesignSlot;
  /** Least height of the band. It is as tall as its elements reach
   *  otherwise; elements with `reserve: false`, and those anchored to the
   *  band's middle or foot, do not count. */
  minHeight?: Dimension;
  /** The design sets the box's content itself: its texts print it with
   *  `{boxText}` (all of it, one paragraph or list item per line) and
   *  `{boxText.<n>}` (the `n`-th, from 1), and the content is not laid out
   *  again under the band. One style then serves every box of the same
   *  shape, each with its own words: a handwriting row whose word is the
   *  box's content, `:::callout{type="practice"}` / `cat` / `:::`. A
   *  picture's `resourceId` may read them too (`trace-{boxText}`). The box
   *  then never splits. Default `false`: the design reads `{boxText}` all
   *  the same, and the content follows the band. */
  setsContent?: boolean;
}

export interface ResolvedCalloutDesignConfig {
  enabled: boolean;
  slot: ResolvedDesignSlot;
  minHeight?: Dimension;
  setsContent: boolean;
}

/** How the boxes of a callout style are counted (#530): the counter they
 *  advance, how its number is written and where the label goes. */
export interface CalloutNumberingConfig {
  /** The word before the number: `'Theorem'`, `'Lemma'`, `'Definition'`. */
  label: string;
  /** The counter the boxes advance. Styles that name one counter share
   *  it, as amsthm's `\newtheorem{lemma}[theorem]` does: Lemma 1, then
   *  Theorem 2. `'equation'` counts with the labelled equations. `false`
   *  prints the label with no number ("Proof."). Default: the style's id. */
  counter?: string | false;
  /** Template of the number: `{n}` (the counter) and `{h1}`..`{h6}`
   *  (heading numbers), as a resource type's, with the same style suffix
   *  (`'{h1:A}.{n}'`, #730). Default `'{n}'`; `'{h1}.{n}'` numbers by
   *  chapter (with `resetOn: 'h1'`). */
  numberingTemplate?: string;
  /** When the counter starts again at 1. Default `'never'`. */
  resetOn?: ResourceCounterReset;
  /** How `{n}` is written. Default `'decimal'`. */
  counterFormat?: ResourceCounterFormat;
  /** Where the label goes: `'runIn'` (default) opens the box's first
   *  paragraph ("**Theorem 2** (Bradley–Terry)**.** Let…"); `'title'`
   *  makes it the box's title, in the title style ("Theorem 2
   *  (Bradley–Terry)"). The fence's `title` follows the number, in
   *  parentheses. */
  placement?: 'runIn' | 'title';
  /** Set the run-in label (and its suffix) in bold. Default `true`. The
   *  `title` in parentheses is set in the regular weight. */
  bold?: boolean;
  /** Set the run-in label in italics, whatever the box's body (an italic
   *  body leaves an upright label upright). Default `false`. */
  italic?: boolean;
  /** Set after the run-in label (and its title). Default `'.'`. */
  suffix?: string;
}

/** {@link CalloutNumberingConfig} with every value resolved; `counter` is
 *  `''` for a label without a number. */
export interface ResolvedCalloutNumberingConfig {
  label: string;
  counter: string;
  numberingTemplate: string;
  resetOn: ResourceCounterReset;
  counterFormat: ResourceCounterFormat;
  placement: 'runIn' | 'title';
  bold: boolean;
  italic: boolean;
  suffix: string;
}

/** Alignment of a split callout's continuation marker. */
export type CalloutMarkerTextAlign = 'left' | 'center' | 'right';

export interface ResolvedCalloutStyleConfig {
  id: string;
  name: string;
  title: string;
  span: CalloutSpan;
  columns: number;
  placement: CalloutPlacement;
  sideAtColumnEnd: CalloutSideAtColumnEnd;
  fixed: { anchor: ElementAnchor; offset: { x: Dimension; y: Dimension } };
  floatBarrier: boolean;
  width: CalloutWidth;
  backgroundEnabled: boolean;
  background: ColorValue;
  border: {
    enabled: boolean;
    color: ColorValue;
    width: Dimension;
    /** Each side with the whole border's values written in (#1059); absent
     *  when the style sets no side. */
    sides?: Record<BoxSideName, { enabled: boolean; color: ColorValue; width: Dimension }>;
  };
  /** A length, or one per corner (#1059). */
  borderRadius: CornerRadius;
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
    /** Present for `kind: 'shape'` (#1120). */
    shape?: CalloutIconShape;
    strokeWidth?: Dimension;
    /** Absent when the picture is painted as it is. */
    tint?: true | ColorValue;
  };
  label?: {
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    color: ColorValue;
    background: ColorValue;
    position: CalloutLabelPosition;
    height: Dimension;
    paddingX: Dimension;
    offset: Dimension;
    inset: Dimension;
    icon: {
      kind: CalloutLabelIconKind;
      resourceId: string;
      width: Dimension;
      gap: Dimension;
      placement: CalloutLabelIconPlacement;
      tint: IconTint;
      /** Present for `kind: 'shape'` (#1120). */
      shape?: CalloutIconShape;
      strokeWidth?: Dimension;
      glyph: string;
      fontFamily: string;
      fontWeight: number;
      scale: number;
      /** Absent: the label's colour, read when the tab is laid out (so a
       *  frame's `look` that recolours the words recolours the glyph). */
      color?: ColorValue;
    };
    rule: { enabled: boolean; color: ColorValue; width: Dimension };
    /** The tab grown out of the box (#1059). */
    joined: boolean;
    /** Absent: the radius of the box's corner the tab hugs. */
    fillet?: Dimension;
    /** Absent: a square tab, or a joined one with the box's corner. */
    borderRadius?: CornerRadius;
    /** Present (`true`) only when set: a joined tab in its own fill. */
    ownBackground?: true;
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
    /** As the icon's (#1120). */
    shape?: CalloutIconShape;
    strokeWidth?: Dimension;
    tint?: true | ColorValue;
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
    /** Absent unless the style sets a non-zero one (#974). */
    letterSpacing?: Dimension;
    textAlign: 'left' | 'justify';
    hyphenation: boolean;
    paragraphSpacing: boolean | Dimension;
    firstLineIndent: Dimension;
    /** Absent when the style sets none. */
    tabStops?: TabStop[];
    tabInterval?: Dimension;
  };
  lists: {
    bulletChar: string;
    color: ColorValue;
    indent: Dimension;
    gap: Dimension;
    itemSpacing: Dimension;
    bulletFontSize?: Dimension;
    bulletFontWeight?: number;
    /** Absent when the style sets none. */
    bulletFontFamily?: string;
    /** Absent unless set: the document's list margins. */
    marginTop?: Dimension;
    marginBottom?: Dimension;
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
  /** Absent when the style counts nothing. */
  numbering?: ResolvedCalloutNumberingConfig;
  endMark: string;
  /** See {@link CalloutStyleConfig.design}; absent without one. */
  design?: ResolvedCalloutDesignConfig;
}
