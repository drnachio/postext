import type { ElementAnchor } from './designPlacement.js';
import type { ColorValue, Dimension } from './page.js';
import type { TabStop } from './paragraphStyles.js';

// ---------------------------------------------------------------------------
// Callout styles — boxed content for `:::callout{type="…"}` containers.
// ---------------------------------------------------------------------------

/** Horizontal extent of a callout: its column, or the full content width. */
/** `'side'` sets the box in the float-only side column of a `oneAndHalf`
 *  layout (`layout.sideColumnRole: 'floats'`), beside the text it
 *  interrupts; on a page without such a column it lays out as `'column'`. */
export type CalloutSpan = 'column' | 'page' | 'side';

/** Where a side box stands when the text after its fence goes on in
 *  another column or on another page (`CalloutStyleConfig.sideAtColumnEnd`). */
export type CalloutSideAtColumnEnd = 'before' | 'after';
/** Where a callout lands: inline in the flow (`'here'`), floated to the
 *  top / bottom band of a page like a resource (`'auto'` takes whichever
 *  band comes first — the foot of the current page before the head of the
 *  next), or at fixed page coordinates (`'fixed'` — anchored through
 *  {@link CalloutFixedConfig}, out of the column flow; text columns it
 *  overlaps are shortened around it). */
export type CalloutPlacement = 'here' | 'auto' | 'top' | 'bottom' | 'fixed';

/** Position of a `placement: 'fixed'` callout on the page where it occurs in
 *  the flow. The anchor's `container` is the page content area (mirrored on
 *  even pages); `page` / `bleed` anchor to the trim / bleed frames. */
export interface CalloutFixedConfig {
  /** Default `{ to: 'container', edge: 'bottom-left' }`. Element-relative
   *  edges are not meaningful here and fall back to `top-left`. */
  anchor?: ElementAnchor;
  /** Offset from the anchored position. Default `0` / `0`. */
  offset?: { x?: Dimension; y?: Dimension };
}
/** `'fill'` spans the available width; `'auto'` shrink-wraps the title
 *  (badge use — children are ignored). */
export type CalloutWidth = 'fill' | 'auto';
/** The edge a callout's stripe runs along. `'left'` / `'right'` are sides
 *  of the body flow (on a right-to-left document's mirrored pages, its left
 *  is the sheet's right); `'start'` / `'end'` (#371) are the box's own: the
 *  side its text starts or ends on, which differs from the flow's in a box
 *  set against the document's direction (`:::callout{dir=ltr}` in an
 *  Arabic book). */
export type CalloutStripeSide = 'left' | 'right' | 'top' | 'start' | 'end';
export type CalloutIconKind = 'none' | 'glyph' | 'resource' | 'shape';
/** A drawn icon (#1120, `kind: 'shape'`): a ring (a circle's outline) or
 *  a dot (a filled circle), drawn by the engine in every backend, no font
 *  or picture asked for. */
export type CalloutIconShape = 'ring' | 'dot';
/** A picture icon painted in one colour (#995, #1120): `true` in the
 *  icon's own colour (a label tab's: its words' colour), a colour to paint
 *  it in that one (a palette colour follows the palette), `false` as the
 *  picture is. */
export type IconTint = boolean | ColorValue;
export type CalloutIconAlign = 'top' | 'center';
/** Where the in-box icon sits: `'inline'` (the default) in a column of its
 *  own left of the title and content (or centred on the side stripe);
 *  `'corner'` as a badge on the box's top-right corner, half over the
 *  border, taking no room from the content (the icon of a marginal box). */
export type CalloutIconPosition = 'inline' | 'corner';
/** Which corner a `position: 'corner'` icon hangs on: `'right'` (the
 *  default) / `'left'` are fixed sides of the body flow; `'outer'` /
 *  `'inner'` follow the page parity when the margins are mirrored (outer =
 *  right on a recto, left on a verso), like the side column of a
 *  `oneAndHalf` layout; `'start'` / `'end'` (#371) the box's own direction
 *  (see {@link CalloutStripeSide}). */
export type CalloutIconCornerSide = 'right' | 'left' | 'outer' | 'inner' | 'start' | 'end';

/** The corner a callout's label tab hugs: `'top-right'` / `'top-left'`
 *  in the body flow's terms, `'top-start'` / `'top-end'` (#371) in the box's
 *  own direction (see {@link CalloutStripeSide}); the `bottom-` forms
 *  (#1059) hang the tab from the box's foot. */
export type CalloutLabelPosition =
  | 'top-right' | 'top-left' | 'top-start' | 'top-end'
  | 'bottom-right' | 'bottom-left' | 'bottom-start' | 'bottom-end';
export type CalloutTextTransform = 'none' | 'uppercase';

/** A side of a box, on the sheet. */
export type BoxSideName = 'top' | 'right' | 'bottom' | 'left';

/** The radius of a box's corners (#1059): one length for all four, or
 *  one per corner (a corner left out is square). Corners are the sheet's,
 *  as a stripe's `left` / `right` are the body flow's. */
export type CornerRadius =
  | Dimension
  | { topLeft?: Dimension; topRight?: Dimension; bottomRight?: Dimension; bottomLeft?: Dimension };

/** One side of a box's border (#1059): each field left out takes the
 *  whole border's value (`enabled`, `color`, `width`). */
export interface BorderSide {
  enabled?: boolean;
  color?: ColorValue;
  width?: Dimension;
}

/** The four sides of a box's border (#1059), each over the whole border's
 *  values. */
export interface BorderSides {
  top?: BorderSide;
  right?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
}

export interface CalloutBorderConfig {
  enabled?: boolean;
  color?: ColorValue;
  width?: Dimension;
  /** Per side (#1059): a box with a border on its top only is
   *  `{ enabled: true, sides: { right: { enabled: false }, bottom: {
   *  enabled: false }, left: { enabled: false } } }`, or `enabled: false`
   *  with `sides: { top: { enabled: true } }`. Unset: every side as the
   *  whole border. */
  sides?: BorderSides;
}

export interface CalloutPaddingConfig {
  top?: Dimension;
  right?: Dimension;
  bottom?: Dimension;
  left?: Dimension;
}

/** Solid band along one edge of the box. A side stripe reduces the inner
 *  width; a top stripe reduces the inner height. */
export interface CalloutStripeConfig {
  enabled?: boolean;
  side?: CalloutStripeSide;
  width?: Dimension;
  color?: ColorValue;
}

/** Icon drawn beside the title/body: a text glyph or a resource image. When
 *  the style has a side stripe the icon is centred over the stripe;
 *  otherwise it reserves its own column (`size` + `titleStyle.gap`). A
 *  resource image is fitted inside the square box keeping its aspect ratio.
 *  An icon taller than the content grows the box to fit it. */
export interface CalloutIconConfig {
  kind?: CalloutIconKind;
  /** Glyph text for `kind: 'glyph'` (e.g. `'!'`, `'✎'`). */
  glyph?: string;
  /** Resource id (bitmap / svg) for `kind: 'resource'`. */
  resourceId?: string;
  /** Glyph font family. Defaults to the headings font. */
  fontFamily?: string;
  fontWeight?: number;
  /** Icon box size (square). Default `1.5em` of the callout body size. */
  size?: Dimension;
  color?: ColorValue;
  align?: CalloutIconAlign;
  /** Default `'inline'`. Ignored by the marker. */
  position?: CalloutIconPosition;
  /** Corner of a `position: 'corner'` icon. Default `'right'`. */
  cornerSide?: CalloutIconCornerSide;
  /** Width of the icon's box when it is not square (a wide strip of
   *  icons): the picture is fitted into `width` x `size`. Default: `size`. */
  width?: Dimension;
  /** The drawn icon of `kind: 'shape'` (#1120), `size` across in `color`.
   *  Default `'ring'`. */
  shape?: CalloutIconShape;
  /** The line of a `ring`. Default: an eighth of `size`. */
  strokeWidth?: Dimension;
  /** A picture icon (`kind: 'resource'`) painted in one colour (#1120):
   *  `true` in `color`, or a colour of its own, so one ring picture serves
   *  every tint. Default `false`. */
  tint?: IconTint;
}

/** A small tab on the box's top edge carrying the fence's `label`
 *  attribute — the number of a numbered box ("RECUADRO 1-1"). It rises
 *  `offset` above the box top (its vertical middle on the edge when
 *  `offset` is half its height), hugs the corner `position` names, and can
 *  carry an `icon` resource on its outer side and a `rule` along the top
 *  edge from the opposite corner up to it. */
/** Where the picture of a label tab stands (#981): beside the tab, past
 *  its edge, or inside it before the words. */
export type CalloutLabelIconPlacement = 'beside' | 'inside';

/** What a label tab's icon is (#1054): a picture resource, or a character
 *  of a font. */
export type CalloutLabelIconKind = 'resource' | 'glyph' | 'shape';

/** The icon of a label tab: a picture (`resourceId`, #981/#995) or a glyph
 *  (#1054). `placement` and `gap` work alike for both; `width` and `tint`
 *  are the picture's, `glyph`, `fontFamily`, `fontWeight`, `scale` and
 *  `color` the glyph's. */
export interface CalloutLabelIconConfig {
  /** Default `'resource'` when `resourceId` is set, `'glyph'` when only
   *  `glyph` is. */
  kind?: CalloutLabelIconKind;
  resourceId?: string;
  /** The picture's width. Default `1em`. */
  width?: Dimension;
  /** Space between the icon and the tab (`beside`) or the words
   *  (`inside`). Default `0.3em`. */
  gap?: Dimension;
  placement?: CalloutLabelIconPlacement;
  /** The picture painted in one colour: `true` in the label's `color`
   *  (#995), or a colour of its own (#1120). */
  tint?: IconTint;
  /** The drawn icon of `kind: 'shape'` (#1120): a ring or a dot as large
   *  as a glyph would be (`scale` of the tab's text size), in `color`.
   *  Default `'ring'`. */
  shape?: CalloutIconShape;
  /** The line of a `ring`. Default: an eighth of its size. */
  strokeWidth?: Dimension;
  /** The character set as the icon (`'◉'`). */
  glyph?: string;
  /** The glyph's font family. Default: the label's. */
  fontFamily?: string;
  /** The glyph's weight. Default: the label's. */
  fontWeight?: number;
  /** The glyph's size, as a factor of the tab's text size. Default `1`. */
  scale?: number;
  /** The glyph's colour. Default: the label's `color`. */
  color?: ColorValue;
}

export interface CalloutLabelConfig {
  /** Defaults to the headings font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  fontWeight?: number;
  color?: ColorValue;
  /** Tab fill. Default: the main colour. */
  background?: ColorValue;
  /** Default `'top-right'`. */
  position?: CalloutLabelPosition;
  /** Tab height. Default `1.4em` of the label size. */
  height?: Dimension;
  /** Horizontal padding on each side of the text. Default `0.6em`. */
  paddingX?: Dimension;
  /** How far the tab's top rises above the box top. Default `0`. */
  offset?: Dimension;
  /** Inset of the tab from the box's side edge. Default `0`. */
  inset?: Dimension;
  /** A picture on the tab. `'beside'` (default) sets it past the tab's
   *  edge, on the side away from the corner: `width` is its width, `gap`
   *  the space to the tab. `'inside'` (#981) sets it in the tab, at its
   *  start before the words (the right end in a right-to-left box),
   *  `gap` away from them: the tab is as wide as the picture, the gap, the
   *  words and the padding, the picture as tall as the tab at most. The
   *  picture keeps the colours it has, so a white ring on a coloured tab
   *  and a coloured ring on a white one are two resources, one to a style;
   *  with `tint` (#995) it is painted in the label's `color` instead (its
   *  silhouette, in the colour of the words), so one ring serves every
   *  tint of a book. With `kind: 'glyph'` (#1054) the icon is a character
   *  of a font instead, a ◉ set in the tab's colour, so a ring needs no
   *  picture resource. */
  icon?: CalloutLabelIconConfig;
  /** A rule along the box's top edge from the far corner to the tab (or
   *  its icon); along the foot for a `bottom-` tab. */
  rule?: { enabled?: boolean; color?: ColorValue; width?: Dimension };
  /** The tab grown out of the box (#1059): box and tab are one outline,
   *  one fill (the box's `background`) and one border running round the
   *  tab, the tab's sides meeting the box's edge in concave fillets. The
   *  tab stands on the edge, outside the box: `offset` must be 0 (another
   *  value is reported and ignored). The tab's own `background` is not
   *  painted. Default `false`. */
  joined?: boolean;
  /** The radius of the concave fillets of a joined tab. Default: the
   *  radius of the box's corner the tab hugs. */
  fillet?: Dimension;
  /** The tab's own corners (#1102): one radius, or one per corner, on the
   *  sheet's corners as the box's `borderRadius`. A tab apart from the box
   *  rounds the corners it names (square by default); a joined tab rounds
   *  its two outer corners (`topLeft` / `topRight` for a tab at the head,
   *  `bottomLeft` / `bottomRight` at the foot), which otherwise copy the
   *  box's corner it hugs. The fillets keep their own radius. */
  borderRadius?: CornerRadius;
  /** A joined tab filled in the label's own `background` (#1102): the
   *  tab and its fillets are painted over the box's fill (or where the box
   *  has none), under the one border. Default `false`: the box's fill. */
  ownBackground?: boolean;
}

/** Vertical rule drawn between a callout marker and its box. */
export interface CalloutMarkerRuleConfig {
  enabled?: boolean;
  /** Default main colour. */
  color?: ColorValue;
  /** Default `0.5pt`. */
  width?: Dimension;
  /** Minimum rule length; the rule always spans at least the box height and
   *  is centred on it (`align: 'center'`) or hangs from its top. Default `0`
   *  (box height). */
  length?: Dimension;
}

/** Marker drawn *outside* the box, in a column on its left: an icon (glyph
 *  or resource, same fields as {@link CalloutIconConfig}) with an optional
 *  vertical rule between it and the box. The frame grows by the marker
 *  column (`size` + rule width + `gap`); the box keeps its own background,
 *  padding and icon. `align` positions the marker, the rule and the box
 *  against each other when their heights differ. */
export interface CalloutMarkerConfig extends Omit<CalloutIconConfig, 'position' | 'cornerSide' | 'width'> {
  /** Space between the marker column (after the rule) and the box. Default
   *  `0.5em`. */
  gap?: Dimension;
  rule?: CalloutMarkerRuleConfig;
}

export interface CalloutTitleStyleConfig {
  /** Defaults to the headings font family. */
  fontFamily?: string;
  /** Defaults to the body font size. */
  fontSize?: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  textTransform?: CalloutTextTransform;
  /** Vertical gap between the title and the first child block (also the
   *  horizontal gap between the icon column and the content). */
  gap?: Dimension;
  /** Tracking after every glyph of the title. Default `0`. */
  letterSpacing?: Dimension;
  /** Extra indent of the title from the box's inner left edge (room for a
   *  corner badge). Default `0`. */
  indent?: Dimension;
  /** Leading of the title's lines; `em` and `rem` count the title's own
   *  size. Its baseline sits 0.8 of the leading down each line, as in
   *  running text, so a title on the body leading keeps a box a whole
   *  number of lines and its baseline on the grid. Default `1.2em`. */
  lineHeight?: Dimension;
}

/** Body typography inside the callout. Every field inherits `bodyText`. */
export interface CalloutBodyStyleConfig {
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  color?: ColorValue;
  /** Colour of bold runs in the box (a key term set off in the box's own
   *  colour). Defaults to `bodyText.boldColor` (the palette's main colour
   *  unless set), palette link included, so it follows `colorPalette`. */
  boldColor?: ColorValue;
  /** Colour of italic runs in the box (a pull quote set in italics in the
   *  box's colour). Defaults to `bodyText.italicColor`. */
  italicColor?: ColorValue;
  /** Weight of the regular text in the box. Defaults to
   *  `bodyText.fontWeight`. */
  fontWeight?: number;
  /** Weight of bold runs in the box. Defaults to `bodyText.boldFontWeight`. */
  boldFontWeight?: number;
  /** Set the box's paragraphs and list items in italics; an italic `*…*`
   *  run flips back to upright. Default `false`. */
  italic?: boolean;
  /** Set the box's paragraphs and list items in small capitals (see
   *  `ParagraphStyleConfig.smallCaps`). Default `false`. */
  smallCaps?: boolean;
  /** Tracking after every glyph of the box's paragraphs and list items
   *  (#974); negative tightens. An `em` value is relative to the body's
   *  `fontSize`. Measured into the lines (a tracked box breaks where its
   *  wider or narrower words put it) and painted the same by canvas, HTML,
   *  PDF and EPUB, as {@link ParagraphStyleConfig.letterSpacing} does. A
   *  paragraph set in a `:::paragraphs{style}` keeps its style's own
   *  tracking; words of a joining script stay untracked. A frame with this
   *  style takes it too. Default `0`. */
  letterSpacing?: Dimension;
  /** `'start'` is `'left'` (see {@link TextAlignKeyword}). */
  textAlign?: 'left' | 'justify' | 'start';
  /** Hyphenate when justified — and, when `bodyText.hyphenation.ragged` is
   *  on, when ragged too. Defaults to the body hyphenation setting. */
  hyphenation?: boolean;
  /** As `bodyText.paragraphSpacing`: `true` is one line of the box's body,
   *  a length is set exactly. Unset: the body's. */
  paragraphSpacing?: boolean | Dimension;
  firstLineIndent?: Dimension;
  /** Tab stops of the box's paragraphs and list items (#622). Unset: the
   *  body's (`bodyText.tabStops`). */
  tabStops?: TabStop[];
  /** Default stops past the last of {@link tabStops}. Unset: the body's. */
  tabInterval?: Dimension;
}

/** List typography inside the callout. Every field inherits
 *  `unorderedLists` (`color`, `indent`, `gap`, `itemSpacing` also apply to
 *  ordered lists). */
export interface CalloutListStyleConfig {
  bulletChar?: string;
  color?: ColorValue;
  indent?: Dimension;
  gap?: Dimension;
  itemSpacing?: Dimension;
  /** Size and weight of the bullet glyph (inherit `unorderedLists`). */
  bulletFontSize?: Dimension;
  bulletFontWeight?: number;
  /** Face of the bullet glyph (#1103), for a bullet set in a symbol or
   *  display face. Unset, each list level keeps its own face
   *  (`unorderedLists.fontFamily` or the level's); a style that sets
   *  {@link bulletFontSize} and inherits the list face from the body sets
   *  its bullets in the box's body face. */
  bulletFontFamily?: string;
  /** Space above and below a list in the box, ordered lists too (#1103).
   *  Unset: the document's (`unorderedLists` / `orderedLists`). */
  marginTop?: Dimension;
  marginBottom?: Dimension;
}
