import type { DesignTextAlign, DesignTextRepeat, DesignTextStroke, ElementBoxStyle, ElementPlacement, PageParity, PageRoleFilter, SidePosition, TextDotsStyle, TextOverflow, VAlign } from './designPlacement.js';
import type { FigureStyle } from './locale.js';
import type { ColorValue, Dimension } from './page.js';

export interface DesignTextElement {
  kind: 'text';
  /** Stable, unique within the slot. Anchors reference elements by `#id`. */
  id: string;
  /** Header/footer only; ignored by heading designs. */
  parity?: PageParity;
  /** Page roles this element renders on (see `PageRoleFilter`). Default
   *  `'all'`. */
  /** On a composed page's decoration (#856): anchored to a frame
   *  (`'#frame'`), stay where the template puts that frame even when its
   *  group or its content moves it (art drawn to the page). Default
   *  `false`: the element moves with the frame. Ignored elsewhere. */
  pin?: boolean;
  /** On a composed page's decoration (#1189): paint the text over every
   *  frame of the page instead of with the rest of the decoration, under
   *  the frames. Default: `true` for a text of a module template (a label
   *  on the module's box, which its frames would cover), else `false`.
   *  Ignored elsewhere. */
  over?: boolean;
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves in the text flow. Default `true`. Set `false` on
   *  decoration anchored to the page or the bleed — a seal at the foot, a
   *  frame, a side band — so the text keeps flowing under the heading
   *  instead of starting below the decoration. The element still paints and
   *  can still be an anchor: under the body text in an opener
   *  (`span: 'page'`); an in-column design paints with the heading block
   *  wherever it is placed above the foot of its column — in the margins,
   *  the bleed and the neighbouring columns too — and the column's foot
   *  cuts it. Ignored by header, footer and part designs, which never
   *  reserve room. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** Template with placeholders (see design/placeholders.ts). Use `{{`/`}}`
   *  for literal braces. A newline, or the two characters `\n` written in
   *  the template or in an `{attr.<key>}` value, starts a new line whatever
   *  the `overflow`. Text a placeholder copies from the document (a title,
   *  a frontmatter value) is printed as written. */
  content: string;
  fontFamily?: string;
  /** The element's figures (see {@link FigureStyle}): `'oldstyle'` folios
   *  beside old-style text. Default: those of its family. */
  figureStyle?: FigureStyle;
  fontSize: Dimension;
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Horizontal alignment of the lines within the element's box. Default
   *  `'center'`. `'justify'` stretches the word spaces of every wrapped line
   *  but the last of each paragraph so it fills the box (the lines beside a
   *  drop cap fill the room beside it); with `hyphenate` a word that does not
   *  fit is also cut at a syllable to fill the line. A line with no space,
   *  and a text that does not wrap, is set flush with the start (left for
   *  left-to-right text). `'start'` and `'end'` follow the text's base
   *  direction (`direction`): the right and the left of a right-to-left
   *  text. `'left'` and `'right'` are the box's own sides; in a design laid
   *  out in the flow of a right-to-left page (an opener, a heading design)
   *  the flow is mirrored, so they are its start and end sides, as in the
   *  body text. */
  align?: DesignTextAlign;
  /** Base direction of the text (UAX #9 paragraph level): `'auto'` takes
   *  it from the first strong letter of the resolved text, falling back to
   *  the document's. Default: the document's direction
   *  (`PostextConfig.direction`). Right-to-left runs (Arabic, Hebrew) are
   *  ordered and painted right to left whatever the base; the base decides
   *  where neutral characters go, the order of the runs on a line and the
   *  sides `'start'` / `'end'` mean. A text with Arabic letters is never
   *  tracked (`letterSpacing` is ignored), and its words are never cut
   *  while wrapping or truncating. */
  direction?: 'ltr' | 'rtl' | 'auto';
  /** Vertical alignment within the element's box. */
  verticalAlign?: VAlign;
  /** Leading of the element's lines. A number is a multiplier of
   *  `fontSize` (default `1.2`). A {@link Dimension} is accepted too, the
   *  way every other leading of the config is written: `em` / `rem` is the
   *  same multiplier, and an absolute length (`pt`, `mm`, `px`…) is the
   *  distance between baselines. Any other value (a negative or zero
   *  number, a malformed dimension) sets the default leading. */
  lineHeight?: number | Dimension;
  letterSpacing?: Dimension;
  /** What a line wider than the element's room does (see
   *  {@link TextOverflow}). Unset, the slot decides: `'wrap'` in heading
   *  and part designs, `'ellipsis-end'` in running heads, folios and
   *  contents part rows. */
  overflow?: TextOverflow;
  /** When true, break long words at syllable boundaries while wrapping.
   *  Uses the document's active hyphenation locale. */
  hyphenate?: boolean;
  /** Letter-case transform applied to the resolved text (a part title set
   *  in capitals in the contents). Default `'none'`. */
  textTransform?: 'none' | 'uppercase';
  box?: ElementBoxStyle;
  /** Drop cap: the first letter set large beside the first `lines` lines
   *  of the text (default 2), in its own face, weight and colour (a
   *  palette-linked colour follows the part and section palettes like the
   *  rest of the design); `gap` is the space between the letter and the
   *  text. The letter stands on the baseline of the last line it spans, and
   *  `fontSize` defaults to the size that brings its top level with the
   *  capitals of the first line: the text size plus `lines − 1` line
   *  spacings, capitals taken as 0.72 of the size. A text with a drop cap
   *  wraps whatever its `overflow` (`'clip'` still cuts the lines at the
   *  edge of a box of fixed height). In a heading design the letter
   *  reserves no room below the text's last line. */
  dropCap?: {
    lines?: number;
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: Dimension;
    color?: ColorValue;
    gap?: Dimension;
  };
  /** First-line indent of every paragraph after the first. A newline in
   *  the content (or the two characters `\n`, for attribute values)
   *  separates paragraphs; consecutive newlines count as one. */
  paragraphIndent?: Dimension;
  /** Read the resolved text — placeholder values included — as inline
   *  Markdown: `**bold**`, `*italic*`, `***bold italic***` (and the
   *  underscore forms), `^superscript^` and `~subscript~`. A backslash sets
   *  the marker character itself (`\*`). Bold runs take weight 700 (the
   *  element's own weight when it is heavier); italic runs flip the
   *  element's slant; scripts are set smaller and raised or lowered, as in
   *  the body text. In a heading design, `{titleText}` then keeps the
   *  heading's own bold, italic and script runs (#539). Default `false`:
   *  the text is set exactly as written. */
  inlineMarks?: boolean;
  /** Outline drawn around the glyphs (see `DesignTextStroke`). */
  stroke?: DesignTextStroke;
  /** Paint the letters as dots to trace (see {@link TextDotsStyle}).
   *  Absent: filled. Not on a vertical text. */
  dotted?: TextDotsStyle;
  /** Set a text of one line again after itself, `gap` apart, as many whole
   *  times as its room holds (or `count`), from the start side of its
   *  direction; the copies are one line, aligned as a whole (see
   *  {@link DesignTextRepeat}). A text that wraps to several lines, a
   *  vertical one or one with a drop cap is set once. */
  repeat?: DesignTextRepeat;
  /** `'vertical-rl'`: the text is set vertically, top to bottom, lines
   *  right to left, with the characters upright (a running head down the
   *  fore-edge of a vertical book, a vertical title beside a horizontal
   *  chapter). The element's box stays as placed on the page: its height
   *  is the length of a line, its width the lines side by side; `align`
   *  places the lines along it (`'left'` at the top), `verticalAlign` in
   *  the box across (`'top'` at the right), and `size.maxWidth` caps a
   *  line's length. In the flow of a vertical page text already runs so,
   *  and the setting changes nothing there. Default `'horizontal-tb'`. */
  writingMode?: 'horizontal-tb' | 'vertical-rl';
}

export interface DesignRuleElement {
  kind: 'rule';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  /** On a composed page's decoration (#856): anchored to a frame
   *  (`'#frame'`), stay where the template puts that frame even when its
   *  group or its content moves it (art drawn to the page). Default
   *  `false`: the element moves with the frame. Ignored elsewhere. */
  pin?: boolean;
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** Typed as required, but a JSON configuration may leave it out:
   *  `'horizontal'`. */
  direction: 'horizontal' | 'vertical';
  /** Typed as required, but a JSON configuration may leave it out: black
   *  (`#000000`). */
  color: ColorValue;
  /** Line thickness. Typed as required, but a JSON configuration may leave
   *  it out: `0.5 pt`, the documented default (up to postext 1.4 such a
   *  rule painted nothing). */
  thickness: Dimension;
}

export interface DesignBoxElement {
  kind: 'box';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  /** On a composed page's decoration (#856): anchored to a frame
   *  (`'#frame'`), stay where the template puts that frame even when its
   *  group or its content moves it (art drawn to the page). Default
   *  `false`: the element moves with the frame. Ignored elsewhere. */
  pin?: boolean;
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  style: ElementBoxStyle;
}

/** An image drawn from a resource (a bitmap or SVG `Resource`, e.g. a
 *  publisher logo on a title page). Sized by `placement.size`: with one of
 *  `width` / `height` left `'auto'` the other follows the image's aspect
 *  ratio; with both set the image is fitted inside the box, centred. A
 *  missing resource draws nothing. */
export interface DesignImageElement {
  kind: 'image';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  /** On a composed page's decoration (#856): anchored to a frame
   *  (`'#frame'`), stay where the template puts that frame even when its
   *  group or its content moves it (art drawn to the page). Default
   *  `false`: the element moves with the frame. Ignored elsewhere. */
  pin?: boolean;
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves (see `DesignTextElement.reserve`). Default
   *  `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** `Resource.id` of a bitmap or SVG resource. Takes the placeholders a
   *  design text's `content` takes, so a heading design can draw the
   *  picture each heading names: `resourceId: '{attr.vignette}'` with
   *  `# Chapter I {style="opener" vignette="log"}`. An id that resolves
   *  empty or to no resource draws nothing. */
  resourceId: string;
  /** A picture that is decoration only (an ornament, a band): it carries
   *  no alternative text into the output even when its resource has one.
   *  Otherwise the resource's `altText`, else its caption, becomes the
   *  picture's `alt` in HTML and a `Figure` with `/Alt` in a tagged PDF.
   *  Default `false`. */
  decorative?: boolean;
  /** How the picture fills a box whose width and height are both set
   *  (#923): `'contain'` (the default) fits the whole picture inside it,
   *  centred; `'cover'` fills the box and crops what runs past it, as a
   *  full-bleed photograph. A cover crop keeps the resource's `safeArea`
   *  whole (where the box's shape cannot hold it, the smallest window that
   *  does is shown, and the box is not filled on one axis); `focus` says
   *  which point of the picture to centre. Ignored when a side is
   *  `'auto'`. */
  fit?: 'contain' | 'cover';
  /** The point of the picture a `'cover'` crop centres, in fractions of
   *  the picture (`{ x: 0.5, y: 0.3 }`: a face in the upper third), held
   *  so the safe area stays in view. Default: the safe area's margins
   *  cropped in proportion, else the centre. */
  focus?: { x: number; y: number };
}

/** A vector shape a design draws (DESIGN §12.8, #1060): a bar that runs
 *  into the spine, a ribbon with an arrow head, the chevrons beside a
 *  running head. `d` is SVG path data (`M L H V C S Q T A Z`, absolute and
 *  relative) in the units of `viewBox`, which by default is `[1, 1]`: the
 *  path is written in fractions of the element's own box, so it stretches
 *  with the box. Placed and sized like a box (`placement.size` widths and
 *  heights, `'fill'` and `{ to, edge }` included; a side left out fills to
 *  the container's edge). Path data that cannot be read draws nothing and is
 *  reported as `unknownConfigValue`. */
export interface DesignPathElement {
  kind: 'path';
  id: string;
  parity?: PageParity;
  /** Page roles this element renders on. Default `'all'`. */
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** On a composed page's decoration: anchored to a frame, stay where the
   *  template puts that frame (see `DesignBoxElement.pin`). */
  pin?: boolean;
  /** Heading designs only: whether the element counts toward the height
   *  the heading reserves. Default `true`. */
  reserve?: boolean;
  placement: ElementPlacement;
  /** SVG path data, in `viewBox` units. */
  d: string;
  /** Width and height of the space `d` is written in. Default `[1, 1]`. */
  viewBox?: [number, number];
  /** Fill colour. When neither `fill` nor `stroke` is set the shape is
   *  filled black, as an SVG path is. */
  fill?: ColorValue;
  /** Outline colour; absent: no outline. */
  stroke?: ColorValue;
  /** Outline width, not scaled with the box. Default `0.5pt`. */
  width?: Dimension;
  /** Outline dash pattern (on, off, …), not scaled with the box. */
  dash?: Dimension[];
  /** `'none'` (the default) stretches the `viewBox` to the element's box
   *  on each axis; `'meet'` scales it evenly to fit inside, centred. */
  preserveAspectRatio?: 'none' | 'meet';
}

/** What ends a connector's line (#1056): nothing, a filled dot centred on
 *  the end, a filled arrowhead whose tip is the end, a ring (#1079: a
 *  hollow dot centred on the end, stroked in the line's width, the line
 *  stopping at its edge) or a bar (#1079: a stroke across the line at the
 *  end, in the line's width). */
export type LineCap = 'none' | 'dot' | 'arrow' | 'ring' | 'bar';

/** One end of a connector (#1056): a point on a side of a frame, a group,
 *  an instance of a repeated frame (`'#card[2]'`; `'#card[*]'` in a
 *  connector's `to` is every instance the page has) or another element of
 *  the decoration. */
export interface ConnectorEnd {
  to: `#${string}`;
  /** The side the line leaves or meets the box by; `start` / `end` follow
   *  the page's line direction (the right and the left of a right-to-left
   *  page). Default: the side facing the other end (for a tree's children,
   *  the side facing the parent). */
  side?: 'top' | 'bottom' | 'left' | 'right' | 'start' | 'end';
  /** The point along that side: its start, middle or end, or a fraction
   *  from its start (0…1; a horizontal side starts where the page's lines
   *  start, a vertical one at its top). Default `'center'`. */
  at?: SidePosition;
  /** Room between the box's edge and the line's end. Default 0. */
  gap?: Dimension;
  /** An anchor of the picture the frame holds (#1057, DESIGN §12.4): the
   *  end is that point of the first `:::figure` / `::resource` of the
   *  frame's story whose resource has the anchor, through the picture's
   *  crop, safe area and scale as its labels are, instead of a point of the
   *  frame's side. `side` then says which way the line arrives (default:
   *  from the other end), `at` is not read, and `gap` stops the line short
   *  of the point. An anchor no picture of the frame has: the end is left
   *  out (`labelAnchorUnknown`, with `connector`). */
  anchor?: string;
}

/** The look of a label's leader (#1057, DESIGN §12.4): the line from the
 *  label's box to its anchor point. */
export interface LeaderStyle {
  /** Default: the label's text colour. A colour with an alpha channel
   *  (`#rrggbbaa`) paints the line translucent (#1079). */
  color?: ColorValue;
  /** How opaque the line and its marks are, 0…1 (#1079), times the
   *  colour's own alpha. Default 1. Kept apart from the colour, so a
   *  palette-linked colour stays linked. */
  opacity?: number;
  /** Default 0.75 pt. */
  width?: Dimension;
  dash?: Dimension[];
  /** At the label's end. Default `'none'`. */
  startCap?: LineCap;
  /** At the anchor point. Default `'dot'`. */
  endCap?: LineCap;
  /** The size of a dot or a ring (across), an arrowhead (long) or a bar
   *  (across the line). Default 3 × width. */
  capSize?: Dimension;
  /** `'straight'` (the default): one segment from the middle of the box's
   *  side that faces the point; `'elbow'`: out of that side square, then
   *  along to the point. */
  routing?: 'straight' | 'elbow';
}

/**
 * A line that joins frames on a composed page (#1056, DESIGN §12.3): a
 * tree diagram's branches, an org chart, a timeline's drops, the arrows of
 * a flow chart. A decoration element of page templates only (running heads
 * and heading designs have no frames to join): laid after the frames'
 * final boxes, so it follows a text that grows, a language that is longer,
 * a group that moves its frames; painted under the frames as a vector
 * path, or over them (`over`, #1076; by default a pointer into a picture). An end on a frame the page does not have (collapsed, empty and
 * optional, an instance past the page's items) is dropped and the page's
 * reflow log says so (`connectorDropped`).
 */
export interface DesignConnectorElement {
  kind: 'connector';
  id: string;
  parity?: PageParity;
  pages?: PageRoleFilter;
  /** Running heads and a page template's decoration (#1087): drawn only on
   *  a composed page whose fence sets this attribute (`::::page{template=…
   *  folio}`: a flag, or any value but `false`). A page with no fence sets
   *  none. Ignored in heading, part and box designs. */
  when?: string;
  /** Running heads and a page template's decoration (#1087): not drawn on
   *  a composed page whose fence sets this attribute
   *  (`::::page{template=… frontmatter}`). Ignored in heading, part and box
   *  designs. */
  unless?: string;
  /** Read the frames' boxes as the template declares them (before groups
   *  and content move them). Default `false`. */
  pin?: boolean;
  /** The line's one end; a tree's parent. */
  from: ConnectorEnd;
  /** The other end, or several: one line to each (`straight`, `elbow`) or
   *  the children of a tree. */
  to: ConnectorEnd | ConnectorEnd[];
  /** `'straight'`: one segment. `'elbow'` (default): across, along, across
   *  again between facing sides (an L between a side and one across it).
   *  `'tree'`: a trunk from `from` to a bar, the bar over the children's
   *  points, a drop to each child. */
  routing?: 'straight' | 'elbow' | 'tree';
  /** Corner radius of an elbow's and a tree's bends. Default 0. */
  radius?: Dimension;
  /** Where an elbow's middle run or a tree's bar stands between the ends,
   *  0 (at `from`) … 1 (at the nearest `to`). Default 0.5. */
  trunk?: number;
  /** Default: the document's main colour. Palette-linked colours follow
   *  part and section palettes. A colour with an alpha channel
   *  (`#rrggbbaa`) paints the line translucent (#1079): a pale casing under
   *  a dashed line lets the picture under it show through. */
  color?: ColorValue;
  /** How opaque the line and its marks are, 0…1 (#1079), times the
   *  colour's own alpha. Default 1. Kept apart from the colour, so a
   *  palette-linked colour (the default main colour included) stays
   *  linked. */
  opacity?: number;
  /** Line width. Default `0.75pt`. */
  width?: Dimension;
  /** Dash pattern (on, off, …). Absent: solid. */
  dash?: Dimension[];
  /** Marks at the ends: `startCap` at `from`, `endCap` at every `to`.
   *  Default `'none'`. */
  startCap?: LineCap;
  endCap?: LineCap;
  /** Size of a dot or a ring (across), an arrowhead (long) or a bar
   *  (across the line). Default three times the line width. */
  capSize?: Dimension;
  /** Paint the line over every frame of the page (#1076) instead of with
   *  the rest of the decoration, under the frames. Default: `true` when
   *  an end has an `anchor` (a pointer into a picture, which its frame
   *  would cover), else `false`. */
  over?: boolean;
}

export type DesignElement = DesignTextElement | DesignRuleElement | DesignBoxElement | DesignImageElement | DesignPathElement | DesignConnectorElement;

/** A design element placed by an anchor (every kind but a connector, which
 *  is laid between the boxes it joins). */
export type PlacedDesignElement = Exclude<DesignElement, DesignConnectorElement>;

export interface DesignSlot {
  /** Array order = paint order: first = back, last = front. */
  elements: DesignElement[];
}

// ---------------------------------------------------------------------------
// Resolved design slot — same shape with required-where-necessary fields.
// Resolution mostly normalizes defaults; geometry resolution happens at
// layout time (see design/layout.ts).
// ---------------------------------------------------------------------------

export interface ResolvedDesignTextElement extends Omit<DesignTextElement, 'fontFamily' | 'fontWeight' | 'italic' | 'color' | 'align' | 'verticalAlign' | 'lineHeight' | 'parity' | 'overflow'> {
  parity: PageParity;
  /** The element's own `overflow`, else its slot's default. */
  overflow: TextOverflow;
  fontFamily: string;
  fontWeight: number;
  italic: boolean;
  color: ColorValue;
  align: DesignTextAlign;
  verticalAlign: VAlign;
  /** Leading as a multiplier of `fontSize`. When the element gives an
   *  absolute length (`lineHeightLength`), the equivalent multiplier — what
   *  an editor shows; the layout uses the length. */
  lineHeight: number;
  /** The leading as an absolute length (the element's `lineHeight` written
   *  in `pt`, `mm`, `px`…); wins over `lineHeight` at layout. Absent for a
   *  multiplier. */
  lineHeightLength?: Dimension;
}

export interface ResolvedDesignRuleElement extends Omit<DesignRuleElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignBoxElement extends Omit<DesignBoxElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignImageElement extends Omit<DesignImageElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignPathElement extends Omit<DesignPathElement, 'parity'> {
  parity: PageParity;
}

export interface ResolvedDesignConnectorElement extends Omit<DesignConnectorElement, 'parity'> {
  parity: PageParity;
}

export type ResolvedDesignElement =
  | ResolvedDesignTextElement
  | ResolvedDesignRuleElement
  | ResolvedDesignBoxElement
  | ResolvedDesignImageElement
  | ResolvedDesignPathElement
  | ResolvedDesignConnectorElement;

/** A resolved design element placed by an anchor (see
 *  {@link PlacedDesignElement}). */
export type ResolvedPlacedDesignElement = Exclude<ResolvedDesignElement, ResolvedDesignConnectorElement>;

export interface ResolvedDesignSlot {
  elements: ResolvedDesignElement[];
}
