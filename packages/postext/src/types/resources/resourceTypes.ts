import type { ArabicNumeralStyle, EastAsianNumeralStyle } from '../../numerals/numbering.js';
import type { Dimension } from '../page.js';
import type { CaptionStyleConfig } from './tableStyles.js';

/** @deprecated Legacy content-model resource used by the VDT renderer
 *  (`VDTBlock.resource`). The Resources-panel feature uses the newer
 *  `Resource` / `ResourceType` model below. Retained until the renderer
 *  migrates off it. */
export interface PostextResource {
  id: string;
  type: 'image' | 'table' | 'figure' | 'pullQuote';
  src?: string;
  alt?: string;
  caption?: string;
  content?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Resources model (issue #49) — user-managed, typed, numbered resources
// (images, SVGs, HTML tables) that can be referenced inline.
// ---------------------------------------------------------------------------

/** How a counter renders for a given resource type. The East Asian and
 *  Arabic styles keep their CSS names (`simp-chinese-informal`,
 *  `circled-decimal`, `arabic-indic`…). */
export type ResourceCounterFormat =
  | 'decimal'
  | 'roman-lower'
  | 'roman-upper'
  | 'alpha-lower'
  | 'alpha-upper'
  | EastAsianNumeralStyle
  | ArabicNumeralStyle;

/** When the per-type counter resets back to its starting value. `'never'`
 *  yields a single document-wide running count; `'h1'..'h6'` resets the
 *  counter whenever a heading of that level is encountered. */
export type ResourceCounterReset = 'never' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

/** Where a resource floats on the page. `'auto'` (the default) detaches the
 *  resource from the running text and lands it in the first free slot after
 *  its first reference — the bottom of the referencing column, the top or
 *  bottom of the next empty column on the same page, then the bands of the
 *  next page. `'top'` / `'bottom'` restrict the search to top or bottom
 *  slots. `'here'` opts out of floating and embeds the resource inline at
 *  the exact `::resource` directive position. */
export type ResourceFloatPosition = 'auto' | 'top' | 'bottom' | 'here';

/** How wide a floated resource is. `'column'` keeps it within a single column;
 *  `'page'` spans the full content width across all columns (a full-width
 *  float that breaks the column flow). In a single-column layout the two are
 *  equivalent. `'side'` sets the resource in the side column of a
 *  one-and-a-half layout whose side column is reserved for floats
 *  (`layout.sideColumnRole: 'floats'`), stacked beside the paragraph that
 *  first cites it; on a page without such a column it behaves as
 *  `'column'`. */
export type ResourceFloatSpan = 'column' | 'page' | 'side';
/** Rotation of a floated resource on the page, a quarter turn either way:
 *  `'ccw'` turns the resource counter-clockwise — its top faces the left
 *  edge of the page and the reader turns the book clockwise to read it, the
 *  convention for landscape tables in a portrait book; `'cw'` turns it
 *  clockwise, its top facing the right edge. */
export type ResourceRotation = 'ccw' | 'cw';

/** Placement of a resource on the page. Resolved per resource, falling back to
 *  its {@link ResourceType.defaultPlacement} and then the built-in default
 *  (`auto` / `column`). See {@link resolveResourcePlacement}. */
export interface ResourcePlacement {
  position?: ResourceFloatPosition;
  span?: ResourceFloatSpan;
  /** Set the resource turned a quarter turn on the page (a landscape table
   *  in a portrait book). A rotated resource is always a page-span float:
   *  it is laid out along the height of the page's content area, rounded
   *  down to whole lines of the baseline grid and less one body line (the
   *  float gap every float band keeps), takes a whole page (a table too wide for one page continues on the next, cut
   *  between rows like an upright table), and sits flush to the spine when
   *  the margins are mirrored, flush left otherwise. Ignored for an inline
   *  (`position: 'here'`) embed. */
  rotate?: ResourceRotation;
  /** Fraction of the column (or page) width the float — or the inline
   *  embed — takes, `0 < width < 1`: a narrow table centred in its column.
   *  Default: the whole width. */
  width?: number;
  /** Where a resource narrower than its slot sits: a float or embed
   *  narrowed by `width`, and a picture (bitmap or SVG) narrower than its
   *  slot — a bitmap smaller than the column, or one `layout.fitFiguresToPage`
   *  shrank — whose caption and note keep the slot's measure. A turned
   *  figure and one with its caption beside it stay flush left. Default
   *  `'left'` (up to postext 1.4 a narrower picture was always set flush
   *  left). Sides of the body flow, so on a right-to-left document's
   *  mirrored pages `'left'` is the sheet's right; `'start'` / `'end'`
   *  (#371) are the same sides by their logical names. */
  align?: 'left' | 'center' | 'right' | 'start' | 'end';
  /** How many adjacent columns a `span: 'column'` float takes, on a page of
   *  more than one text column: a picture across two of a newspaper's four
   *  columns (#505). A whole number, default 1. The float's measure is
   *  those columns and the gutters between them; it takes the head or foot
   *  of all of them at once, the columns after the first empty on the
   *  current page. As many columns as the page has (or more) is a
   *  `span: 'page'` float. Ignored by `'page'` and `'side'` spans, by a
   *  rotated resource and by an inline (`position: 'here'`) embed. */
  columns?: number;
  /** Set the caption beside the figure, in the float-only side column of
   *  a `oneAndHalf` layout (`layout.sideColumnRole: 'floats'`): the body
   *  keeps its column, the caption goes to the margin level with the
   *  figure's top (its bottom for a bottom float). A page without such a
   *  column keeps the caption under the figure. For a column float, and
   *  for a resource set where its `::resource` line stands (`position:
   *  'here'`, #729, `layout.inlineCaptionSide`): there the caption stands
   *  level with the body's top when the side column is free over its
   *  band, else under the body. Not for a page-span or rotated resource,
   *  one inside a box, or one text wraps round.
   *
   *  `'inside'` (#1106): the caption and note stand beside the picture
   *  within its own slot, in any layout (one column, two, a page-span
   *  float, a resource set in the text, a box, a composed page's frame).
   *  The picture takes `width` of the slot (default 0.5) on its `align`
   *  side (`'center'` reads as `'left'`); the caption takes the rest of
   *  the slot after `layout.gutterWidth`, its first line level with the
   *  picture's top. The block is as tall as the taller of the two, and
   *  moves on whole like any float or embed. Pictures only (bitmap, SVG,
   *  video); a table, a turned resource and one on a vertical page keep
   *  the caption under them. A caption band narrower than a fifth of the
   *  slot goes back under the picture. */
  captionSide?: boolean | 'inside';
  /** Scale a floated picture (bitmap, SVG, a video's poster) down, keeping
   *  its proportions, to the room a slot has, instead of moving it on
   *  (#626). `'never'`: a float either fits a slot at its size or waits
   *  for a later one. `'page'`: a float too tall for the band of a fresh
   *  page — the content area less what already stands there: an opener,
   *  other floats, footnotes, the float gap — shrinks to that band.
   *  `'slot'`: as `'page'`, and a float too tall for a slot of the page it
   *  is cited on (or for a fresh page's band beside another float) shrinks
   *  to it when it fits there at {@link minScale} or more; the slots are
   *  tried in their usual order. A picture with a safe area is cropped
   *  within it first. Tables (which split), floated boxes, comic strips,
   *  rotated floats and inline embeds are never scaled by it. Default:
   *  the type's `defaultPlacement`, then `layout.floatShrink.mode`, then
   *  `'never'`. */
  shrink?: FloatShrinkMode;
  /** The smallest scale {@link shrink} sets a picture at, 0 to 1 (default
   *  0.7, then `layout.floatShrink.minScale`). A slot that needs less is
   *  passed over; on a fresh page, where the float has nowhere else to go,
   *  it is set at this scale and runs past the band. */
  minScale?: number;
  /** The measure of a picture's caption and note when the picture is
   *  narrower than its slot (scaled by {@link shrink} or
   *  `layout.fitFiguresToPage`, or a bitmap smaller than the column):
   *  `'slot'` (the default) keeps the slot's measure; `'body'` sets them
   *  as wide as the picture, under it per {@link align}. */
  captionMeasure?: 'slot' | 'body';
  /** Run the text beside the resource (#627): it sits at this side of its
   *  column, and the lines beside it are set to the measure left over,
   *  {@link wrapGap} clear of its box (caption included), then return to
   *  the full measure under it. `'left'` / `'right'` are sides of the body
   *  flow, as {@link align}'s (on a right-to-left document's mirrored
   *  pages `'left'` is the sheet's right); `'start'` / `'end'` are the
   *  same sides by their logical names. Applies to an inline embed
   *  (`position: 'here'`, the text after the `::resource` line runs beside
   *  it) and to a `span: 'column'` float at the head or foot of one column
   *  (the column's first or last lines run beside it); a page-span float,
   *  a float across several columns, a side-column float, a rotated one
   *  and anything in vertical text keep their whole band. The resource
   *  takes {@link width} of the column, or `layout.wrap.defaultWidth`
   *  when it sets none. Where the text left beside it would be narrower
   *  than `layout.wrap.minTextWidth`, or the resource shorter than
   *  `layout.wrap.minLinesBeside` lines, it takes its band whole and a
   *  `textWrap` warning says so. `'contour'` (#883) runs the text round
   *  the picture's shape instead (`Resource.contour`: a polygon or the
   *  bitmap's alpha channel), the picture at the side {@link align} names
   *  (`'right'` / `'end'`, else the left): each line is set as short as the
   *  shape is wide beside it, plus the contour's margin; a picture whose
   *  shape is not known runs round its box (`textWrap` warning, reason
   *  `noContour`). Default `'none'`. */
  wrap?: ResourceWrap;
  /** The space between a wrapped resource's box (caption included) and
   *  the text beside it, and under it before the text runs full width
   *  again (rounded up to whole grid lines). Default `layout.wrap.gap`,
   *  else one body line, the float gap. */
  wrapGap?: Dimension;
  /** Let a `'top'` or `'auto'` float head the page (a page-span float) or
   *  the column (a column float, across {@link columns} too) where the line
   *  that first cites it lands, as LaTeX's `t` placement does, instead of
   *  the first free slot after that line (#633). The text above the
   *  reference moves down under it. It takes that head only when it fits
   *  there within `layout.maxTopFraction` of the column, when the earlier
   *  floats of its numbering sequence are already set, when the page is
   *  not the first of a chapter or the page after a forced break (an
   *  opener, a part, a `:::pagebreak`), and when nothing spanning the page
   *  (a heading, a box) stands above the citing line; and only when, so
   *  set, the citing line still lands on that page (that column). The
   *  engine settles this over a few extra placement passes; a float that
   *  does not qualify takes its usual slot. Rotated floats, side-column
   *  floats and the rest of a table split across pages never do. Default:
   *  the type's `defaultPlacement`, then `layout.floatsAtCitingPage`, then
   *  `false`. */
  citingPage?: boolean;
}

/** The side of its column a resource or a box sits on with text running
 *  beside it (see `ResourcePlacement.wrap`, #627). */
export type WrapSide = 'none' | 'left' | 'right' | 'start' | 'end';

/** `ResourcePlacement.wrap`: a side, or `'contour'` (#883), the text
 *  running round the picture's shape (`Resource.contour`) rather than its
 *  box, the picture at the side its `align` names (`'right'` / `'end'`;
 *  anything else is the left). */
export type ResourceWrap = WrapSide | 'contour';

/** The document's text wrap settings (`LayoutConfig.wrap`, #627). */
export interface TextWrapConfig {
  /** Default `ResourcePlacement.wrapGap`: the space between a wrapped
   *  picture and the text. Default: one body line (the float gap). */
  gap?: Dimension;
  /** The narrowest measure the text beside a wrapped picture may take: a
   *  length, or a share of the column (`0.3`). Narrower, the picture takes
   *  its band whole (`textWrap` warning). Default 12 em of body text. */
  minTextWidth?: Dimension | number;
  /** The fewest lines of text worth setting beside a picture. A picture
   *  shorter than that (gap included) takes its band whole (`textWrap`
   *  warning). Default 2. */
  minLinesBeside?: number;
  /** The share of the column a wrapped resource takes when its placement
   *  sets no `width`, 0 to 1. Default 0.45. */
  defaultWidth?: number;
}

/** How a floated picture is scaled to the room of a slot (see
 *  `ResourcePlacement.shrink`). */
export type FloatShrinkMode = 'never' | 'page' | 'slot';

/** A user-definable category of resource (e.g. "Figure", "Table"). Drives
 *  numbering, caption prefixes, and inline-reference labels. */
export interface ResourceType {
  /** Stable identifier, referenced by `Resource.typeId`. */
  id: string;
  /** Display name, singular (e.g. "Figure"). */
  name: string;
  /** Optional plural display name (e.g. "Figures"). */
  namePlural?: string;
  /** Compact label used in inline references (e.g. "Fig."). */
  shortLabel: string;
  /** Template for the computed number. Placeholders: `{n}` (the counter),
   *  `{h1}`..`{h6}` (current heading numbers). E.g. `'{h1}.{n}'`. A token
   *  takes the style a heading template's does after a colon (#730):
   *  `'{h1:A}.{n}'` prints "A.1" under a lettered appendix, `'{h1:I}.{n}'`
   *  "II.3", and `{n:i}` wins over `counterFormat` for that token. Without
   *  one a heading number is decimal and `{n}` follows `counterFormat`. `''`
   *  prints no number: the caption reads "Do. Caption" and a reference the
   *  label alone, though the counter still counts. */
  numberingTemplate: string;
  /** When the counter resets. */
  resetOn: ResourceCounterReset;
  /** How the `{n}` counter is formatted. The page and list spellings of a
   *  format are read too (`'lower-roman'`, `'arabic'`…, see
   *  `parseNumberFormat`); an unknown value counts in decimal and is
   *  reported by `collectConfigWarnings`. */
  counterFormat: ResourceCounterFormat;
  /** Prefix prepended to the caption (e.g. "Figure"). The computed number
   *  follows this prefix, then a full stop ("Figure 1.7. "); without a
   *  number the stop follows the prefix, less its end spaces, unless it
   *  ends in `.`, `:`, `!`, `?` or `…` (or a full-width form) already. */
  captionPrefix: string;
  /** Default placement for resources of this type, used when a resource does
   *  not specify its own `placement`. Falls back to `auto` / `column`. */
  defaultPlacement?: ResourcePlacement;
  /** Optional partial caption-style override for resources of this type.
   *  Only the keys set here replace the resolved global `captionStyle`; the
   *  rest is inherited (see `mergeCaptionStyle`). */
  captionStyle?: CaptionStyleConfig;
}

/** The concrete payload kind a `Resource` carries. */
export type ResourceKind = 'bitmap' | 'svg' | 'table' | 'video' | 'score';
