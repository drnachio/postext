// Composed pages: the configuration of frames and frame groups.
import type { Dimension, ColorValue, ElementPlacement, CalloutPaddingConfig } from '../../types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** A frame size: fixed (a `Dimension`), a percentage of the template's
 *  area (`{ percent: 50 }`), `'auto'` (the content's own size, clamped to
 *  the frame's min/max) or `'fill'` (what is left up to the edge the frame
 *  is anchored to, as in design slots). */
export type FrameSize = Dimension | { percent: number } | 'auto' | 'fill';

export interface FrameGridCell {
  /** 1-based column and row of the template grid. */
  col: number;
  row: number;
  /** Columns and rows the frame spans. Default 1. */
  cols?: number;
  rows?: number;
}

export interface FrameFitConfig {
  /** Shrink the frame's text when nothing else makes it fit. Default true. */
  shrinkText?: boolean;
  /** Smallest text scale, above 0 and at most 1. Default 0.9. */
  minScale?: number;
  /** Scale flexible pictures inside the frame. Default true. */
  scaleImages?: boolean;
  /** Smallest picture scale, above 0 and at most 1. Default 0.8. */
  imageMinScale?: number;
  /** A frame whose `overflow.continueIn` sends content to another page
   *  (`'next-page'`, `'template:<id>'`, `'page:<id>'`) goes on there
   *  before its pictures or its text shrink, so a story keeps one size
   *  from page to page (#920). `false`: shrink first and go on only when
   *  shrinking is not enough. Default true. */
  preferContinue?: boolean;
}

export interface FrameOverflowConfig {
  /** Where content that does not fit goes on: `'#frame'` (another frame of
   *  the same page, as `next`), `'next-page'` (the same frame on a page
   *  added after this one), `'template:<id>'` (a page of that template)
   *  or `'page:<id>'` (#917: a frame of the later page fence
   *  `::::page{id=…}`, the one it leaves empty, or the one named by
   *  `'page:<id>#<frame>'`; `<id>` may be `{attr.name}`, read from the
   *  fence). Unset: nowhere; the frame runs the reflow ladder and warns. */
  continueIn?: string;
  /** Continuation mark at the end of a cut piece; unset = the localized
   *  default; `false` = none. `{page}` is the number of the page the rest
   *  goes on on (#917). */
  mark?: string | false;
  /** Words at the head of the piece that goes on on another page, `{page}`
   *  being the number of the page it comes from (#917): "Continued from
   *  page {page}". The receiving frame's own, else the sending frame's.
   *  Unset: none. */
  fromMark?: string;
}

/** Ruled lines across a frame (#914): an answer space, a writing frame.
 *  One rule at the foot of each line slot of the frame's content box (its
 *  box less its padding), as many as fit its height, so an `'auto'` frame
 *  that receives `:::space{lines=4}` is ruled four times and a frame that
 *  grows gets more. */
export interface FrameRulesConfig {
  /** The pitch: `'line'` (the default), the leading of the frame's text
   *  (its style's body, else the book's), or a length. */
  every?: 'line' | Dimension;
  /** Default: a mid grey. */
  color?: ColorValue;
  /** The rules' thickness. Default 0.5 pt. */
  width?: Dimension;
  /** Room left at both ends of each rule, inside the content box, or per
   *  side. Default 0. */
  inset?: Dimension | { left?: Dimension; right?: Dimension };
}

export interface FrameConfig {
  /** The slot name. Unique per template. */
  name: string;
  /** Anchor, offset and size, in the language of design slots;
   *  `anchor.to` may be `'#frame'` or `'#group'`. Ignored when `grid` is
   *  set. Neither: the frame takes the whole area. */
  placement?: ElementPlacement;
  /** A cell of the template's `grid`. Wins over `placement`; ignored when
   *  the template has no grid. */
  grid?: FrameGridCell;
  /** Default: `placement.size.width`, else `'fill'`. */
  width?: FrameSize;
  /** Default: `placement.size.height`, else `'auto'`. */
  height?: FrameSize;
  minWidth?: Dimension;
  maxWidth?: Dimension;
  minHeight?: Dimension;
  maxHeight?: Dimension;
  /** A `calloutStyles` id. Unset: a frameless box. */
  style?: string;
  /** Paint order. Default 1; decoration is 0; negative paints below it. */
  layer?: number;
  /** Degrees, clockwise. Box and content turn together. Default 0. */
  rotate?: number;
  /** Where the content sits in a frame taller than it. Default `'top'`. */
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'justify';
  /** Default 1. */
  columns?: number;
  columnGap?: Dimension;
  /** Overrides the style's padding, side by side. */
  padding?: CalloutPaddingConfig;
  /** `'push'`: text of other frames wraps around this one. Default `'none'`. */
  exclude?: 'none' | 'push';
  /** What the text of other frames runs round when this frame pushes it
   *  (`exclude: 'push'`, #883): `'box'` (the default), the frame's box;
   *  `'contour'`, the shape of the pictures it holds (`Resource.contour`:
   *  a polygon or the bitmap's alpha channel), each line set as short as
   *  the shape is wide beside it. A frame whose pictures have no known
   *  shape, or a turned frame, pushes with its box. */
  wrap?: 'box' | 'contour';
  /** Receives content that names no slot. */
  flow?: boolean;
  /** Chain: content that does not fit continues in this frame. */
  next?: string;
  /** Receives the first heading of this level that names no slot, or
   *  (`'toc'`, #983) the rows of the page's `:::toc` that name no slot,
   *  laid by the contents' own rules (part rows, leaders, `keep`). */
  takes?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'toc';
  /** Never moves or resizes. */
  pin?: boolean;
  /** Share of a group's spare space this frame takes. Default 0. */
  grow?: number;
  /** Whether (and how much) this frame gives space back in a group. Default 0. */
  shrink?: number;
  /** Lower yields first. Default 0. */
  priority?: number;
  /** The frame grows with the frames laid inside it (#1117): its height is
   *  at least down to the foot of those frames and its bottom padding, so
   *  its fill, border and tab follow captions that run longer, and the
   *  frames under it move down as under any growing box. `'children'`:
   *  the frames and groups anchored to a point of its top side
   *  (`top-left`, `top`, `top-right`, `top-start`, `top-end`) and,
   *  through them, those anchored to these; a list of frame and group
   *  names takes those instead. A frame turned (`rotate`) does not grow.
   *  Unset: the frame's height is its own content's. */
  growWith?: 'children' | string[];
  fit?: FrameFitConfig;
  overflow?: FrameOverflowConfig;
  /** No `slotEmpty` warning when nothing is poured in. */
  optional?: boolean;
  /** On a spread template: the frame may cross the spine band (`gutter`). */
  crossGutter?: boolean;
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  direction?: 'ltr' | 'rtl';
  /** Ruled lines across the frame at a pitch (#914). */
  rules?: FrameRulesConfig;
  /** What this frame changes of its callout style's look (#976): colours,
   *  and the tracking of the body. A book with one box in a dozen tints
   *  keeps one style and writes the tint here. Merged key by key over the
   *  parent's in a patch. */
  look?: FrameLook;
  /** The overlap checks (#1053): `'allow'` leaves the frame out of
   *  `frameCovered`, as the frame painted over another (art meant to sit
   *  over text) and as the one painted under, and out of
   *  `frameOutsideArea` (a badge hung half off its card on purpose).
   *  Default `'check'`. */
  overlap?: 'check' | 'allow';
  /** In a template patch (`extends`, `variants`): drop the inherited frame. */
  remove?: boolean;
}

/** The fields of a callout style a frame may set for itself (#976), named
 *  and nested as in {@link CalloutStyleConfig}. A `background` also turns
 *  the style's fill on. */
export interface FrameLook {
  background?: ColorValue;
  border?: { color?: ColorValue };
  stripe?: { color?: ColorValue };
  icon?: { color?: ColorValue };
  marker?: { color?: ColorValue; rule?: { color?: ColorValue } };
  titleStyle?: { color?: ColorValue };
  /** Colours of the box's text, and its tracking (see
   *  `CalloutBodyStyleConfig.letterSpacing`, #974). */
  body?: { color?: ColorValue; boldColor?: ColorValue; italicColor?: ColorValue; letterSpacing?: Dimension };
  /** The label tab's colours; only on a style that has a tab. */
  label?: { color?: ColorValue; background?: ColorValue; rule?: { color?: ColorValue } };
}

/** A named look (#1089, `PostextConfig.frameLooks`): the fields of a
 *  {@link FrameLook} under an id a `:::frame{slot="…" look="<id>"}` piece
 *  names. The Markdown names the look, the config defines it; it is laid
 *  over the frame's style and the template frame's own `look`, for that
 *  piece only, so the items of a repeating grid can each wear a colour of
 *  their own. */
export interface FrameLookEntry extends FrameLook {
  /** Required, unique among `frameLooks`. */
  id: string;
  /** Shown in the Sandbox only. */
  name?: string;
}

/** The frame set a grid group lays once per content item (#1061, DESIGN
 *  §12.6). */
export interface FrameRepeatConfig {
  /** The frames of the set. The first is the cell's main frame: it takes
   *  the cell's width, and each `:::frame{slot="<main>"}` piece of the page
   *  is one item. The others are laid as the template draws them, anchored
   *  to the main frame or to each other. */
  frames: string[];
  /** The most items the grid takes; the rest goes to the flow frame
   *  (`repeatOverflow`). Unset: no limit. */
  max?: number;
}

export interface FrameGroupConfig {
  /** Unique per template, and distinct from every frame name (anchors
   *  name both as `'#name'`). */
  name: string;
  /** Default `'stack'`. `'grid'` (#1061): cells of `columns` columns,
   *  filled row by row from the start side, each row as tall as its
   *  tallest cell. */
  kind?: 'stack' | 'row' | 'grid';
  /** Order on the page: top to bottom (stack), start to end (row), cell
   *  after cell (grid). A frame belongs to at most one group. A grid that
   *  `repeat`s takes the set's frames instead. */
  frames?: string[];
  /** Grid: the number of columns. Default 1. */
  columns?: number;
  /** Grid: the space between columns, and between rows. Default 0 (a
   *  grid's `gap` is read for both when these are unset). */
  columnGap?: Dimension;
  rowGap?: Dimension;
  /** Grid: where a cell shorter than its row sits: `'stretch'` (the
   *  default) makes its main frame as tall as the row. A modules row or
   *  grid (#1088): where a module shorter than its row sits; `'stretch'`
   *  lays it in a box as tall as the row (its `'fill'` frames grow). */
  rowAlign?: 'start' | 'center' | 'end' | 'stretch';
  /** Grid: the frame set laid once per item of the page's content. */
  repeat?: FrameRepeatConfig;
  /** The group takes the page's `:::module` blocks (#1062, DESIGN §12.7),
   *  in Markdown order, `gap` between them. Its `frames` are not read. A
   *  `'stack'` lays them one under another, each as wide as the group (or
   *  its template's `width`) and as tall as its frames; a `'row'` (#1088)
   *  side by side, start to end, each as wide as its template's `width`
   *  or an equal share of what is left, the row as tall as its tallest
   *  module (`rowAlign`); a `'grid'` (#1088) in `columns` equal columns,
   *  row after row. */
  modules?: boolean;
  /** A modules group laid inside the modules group of this name (#1088):
   *  each run of the page's modules it takes (`templates`), one after
   *  another in Markdown order, is one item of that group, a row or a grid
   *  of its own where the first of the run comes. Only on a modules group,
   *  naming a modules group of the template; groups may lie inside each
   *  other to any depth (#1095), the outermost being the page's modules
   *  group. Inside a stack a run's rows are rows of the stack; inside a
   *  row or a grid a run is one cell (a share of the row). */
  within?: string;
  /** A modules group inside another (`within`, #1088): the module
   *  templates it takes. Unset: every module, unless other groups lie
   *  inside it (#1095): then only theirs. */
  templates?: string[];
  /** A modules group (#1062): where a module that does not fit goes on,
   *  whole (`'next-page'`, `'template:<id>'`). Unset: the module is laid
   *  cut at the group's foot and its frames run the reflow ladder. */
  overflow?: { continueIn?: string };
  /** Default 0. */
  gap?: Dimension;
  /** The group's own box. Neither this nor `grid`: the union of its
   *  frames' declared boxes. */
  placement?: ElementPlacement;
  grid?: FrameGridCell;
  /** Where spare space goes. Default `'start'`. */
  align?: 'start' | 'center' | 'end' | 'space-between';
  /** In a template patch: drop the inherited group. */
  remove?: boolean;
}
