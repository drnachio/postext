import type { ScoreFormat } from '../music/types.js';
import type { LeaderStyle } from './designElements.js';
import type { ColorValue, Dimension } from './page.js';
import type { ResourceKind, ResourcePlacement } from './resourceTypes.js';
import type { ResourceVideo } from './video.js';

/** Horizontal alignment of a table cell's content. */
export type TableCellAlign = 'left' | 'center' | 'right';

/** A cell's alignment as a table model writes it: a {@link TableCellAlign},
 *  or the logical `'start'` / `'end'` (#371), the side the cell's text
 *  starts or ends on. Cell text reads like body text: `'left'` is the
 *  start side too, the right in a right-to-left table (see
 *  {@link TextAlignKeyword}); the layout keeps only the physical values. */
export type TableCellAlignKeyword = TableCellAlign | 'start' | 'end';

/** Vertical alignment of a table cell's content. */
export type TableCellVerticalAlign = 'top' | 'middle' | 'bottom';

/** Position of a cell within a {@link TableModel} grid (zero-based). */
export interface TableCellPos {
  row: number;
  col: number;
}

/** An image set inside a table cell: a bitmap or SVG resource referenced by
 *  id. The resource is drawn inside the cell — never numbered, floated or
 *  captioned — fitted to the cell's inner width (or a fraction of it) with
 *  its aspect ratio kept, aligned like the cell's text, and any cell text
 *  runs under it. */
export interface TableCellImage {
  /** The `Resource.id` of a `bitmap` / `svg` resource. A table resource, or
   *  an id that matches nothing, leaves the cell text-only. */
  resourceId: string;
  /** Width as a fraction of the cell's inner width, in `(0, 1]`. Default 1
   *  (the full inner width; a bitmap narrower than that keeps its size). */
  width?: number;
}

export interface TableCell {
  /** Cell content (plain text / inline markdown). A newline, or `\\` as in
   *  captions and notes, starts a new paragraph. A paragraph of ordinary
   *  spaces sets nothing; one holding a no-break space (U+00A0) sets a line.
   *  `$…$` is an inline formula, read by Pandoc's rule (#541), and `\$`
   *  prints a dollar sign. */
  content: string;
  /** Optional image drawn inside the cell, above the content. */
  image?: TableCellImage;
  /** Number of columns this cell spans. Default 1. */
  colSpan?: number;
  /** Number of rows this cell spans. Default 1. */
  rowSpan?: number;
  /** When true, render as a header cell (`<th>`). */
  isHeader?: boolean;
  align?: TableCellAlignKeyword;
  verticalAlign?: TableCellVerticalAlign;
  /** Fill colour of this cell, painted instead of the table style's header
   *  / body background. A palette-linked value (`paletteId`) follows the
   *  document palette. Absent: the style's fill (or none) applies. */
  background?: ColorValue;
  /** When set, this cell is covered by a merge whose primary (top-left) cell
   *  is at the referenced position. Hidden cells are skipped during rendering
   *  and restored on unmerge. */
  hiddenBy?: TableCellPos;
}

export interface TableModel {
  /** Row-major grid of cells. */
  rows: TableCell[][];
  /** Number of leading rows that form the table header. Default 0. */
  headerRowCount?: number;
  /** Relative column weights (one per column), normalised at layout time —
   *  `[2, 1, 1]` gives the first column half the width. Unset, a wrong
   *  length, or any non-positive weight falls back to an equal split. */
  columnWidths?: number[];
}

/** A rectangle of a picture in fractions of its intrinsic size: `x` and
 *  `width` of its width, `y` and `height` of its height (0–1, top-left
 *  origin). */
export interface ResourceSafeArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The shape text runs round (`Resource.contour`, #883). */
export interface ResourceContour {
  /** The outline as a polygon, in fractions of the whole picture (0 to 1
   *  across and down from its top-left corner), at least three points.
   *  Wins over the alpha channel. */
  points?: { x: number; y: number }[];
  /** Read the shape from the bitmap's alpha channel: the pixels at least
   *  {@link threshold} opaque. Default `true` (a bitmap with no alpha
   *  channel, a JPEG, has no shape and runs round its box). */
  alpha?: boolean;
  /** The opacity from which a pixel belongs to the shape, 0 to 1. Default
   *  0.5. */
  threshold?: number;
  /** The space kept between the shape and the text, across and above and
   *  below it. Default: the wrap gap (`placement.wrapGap`, then
   *  `layout.wrap.gap`, then one body line). */
  margin?: Dimension;
  /** The alpha channel as the host traced it from the file
   *  (`traceResourceContour`): the layout reads pictures by their size
   *  only, so the shape comes with the resource. A trace of another file or
   *  at another threshold is ignored. Written by the host (the bundle
   *  reader, the Sandbox); never by hand. */
  traced?: ContourTrace;
}

/** A bitmap's alpha channel cut into rows (`ResourceContour.traced`). */
export interface ContourTrace {
  /** The file traced (`bitmap.fileId`). */
  fileId: string;
  /** The threshold it was traced at. */
  threshold: number;
  /** The rows the picture is cut into, top to bottom (at most 256). */
  rows: number;
  /** Two numbers per row: the leftmost and rightmost edge of its opaque
   *  pixels, in fractions of the picture's width (`-1, -1` for a row with
   *  none). */
  spans: number[];
}

/** A point of a picture that the lettering of a comic refers to (#557):
 *  where a speaker's mouth is, so a balloon's tail points at it. Written
 *  once per picture, in fractions of the picture (0–1, top-left origin), so
 *  every translation of a comic reuses it and a crop or a splitter drag
 *  never moves it off the speaker. */
export interface ResourceAnchor {
  /** The speaker id the script names (`ana: Hello`), or any point id. */
  id: string;
  /** The mouth: where a speech balloon's tail points. */
  x: number;
  y: number;
  /** The head: where a thought balloon's bubbles point (style `target:
   *  'head'`). Unset: the mouth. */
  head?: { x: number; y: number };
  /** The face: a region no balloon covers. */
  face?: ResourceSafeArea;
  // Label fields (composed pages, #846): a `::label` set at this anchor
  // takes them unless it says otherwise. Comics ignore them.
  /** The label's measure, a fraction of the picture's width. Unset: the
   *  label's natural width. */
  width?: number;
  /** Which side of the label stands at (x, y): its start, its centre or
   *  its end, in the label's direction. Default `'center'`. */
  align?: 'start' | 'center' | 'end';
  /** Which edge of the label stands at y. Default `'middle'`. */
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Degrees, clockwise, around (x, y). Default 0. */
  rotate?: number;
  /** A `labelStyles` id. */
  style?: string;
  /** `'vertical-rl'` sets the label in vertical writing (#902): its
   *  characters stand upright in cells one under another, columns going
   *  from right to left, as a CJK map or a spine is lettered. Over the
   *  style's `writingMode`. In a vertical label `width` is a fraction of
   *  the picture's height (the column's length), `align` runs along the
   *  column (`start` is its top) and `verticalAlign` across the columns
   *  (`top` is the first, rightmost one); `rotate` turns it on top of the
   *  quarter turn. Default `'horizontal-tb'`. */
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  /** `'allow'` says the label set here may touch the labels beside it: the
   *  source prints it that way (a dense map, two grids of degree figures
   *  printed over each other), so `labelOverlap` is not raised for a pair
   *  it belongs to (#977). Over the style's `overlap`. Default `'check'`. */
  overlap?: 'check' | 'allow';
  /** On a figure across the spine of a spread (#990): `'keep'` slides the
   *  label off the binding band, to the side its point lies on, so the fold
   *  does not cut it; `'cross'` leaves it where the point puts it, a title
   *  set across both pages. Default `'keep'`. */
  gutter?: 'keep' | 'cross';
  /** Where the label set at this anchor stands, away from its point
   *  (#1057): fractions of the whole picture, as `x` / `y`. `align`,
   *  `verticalAlign` and `rotate` place the box about this point; the
   *  anchor's own point stays where a leader and a connector end. Unset:
   *  the label stands at its point. */
  labelAt?: { x: number; y: number };
  /** A line from the label's box to the anchor's point (#1057): `true` in
   *  the label style's `leader` look, an object over that look field by
   *  field, `false` none. Unset: a leader when the label stands away from
   *  its point (`labelAt`) and its style has a `leader`. A label's own
   *  `leader` attribute wins. */
  leader?: boolean | LeaderStyle;
}

/** A user-managed resource instance. Binary payloads (bitmaps, SVGs) are
 *  stored out-of-band (IndexedDB in the sandbox) and referenced by
 *  `fileId`; table resources carry their model inline. */
export interface Resource {
  /** Stable identifier, referenced by inline `ref`s. */
  id: string;
  /** The `ResourceType.id` this resource belongs to. */
  typeId: string;
  kind: ResourceKind;
  /** Optional caption text (the type prefix + number are computed). Inline
   *  formatting and `:ref` marks apply; `\\` — or a backslash ending a line
   *  — starts a new line (a plain newline is a space); inside inline code,
   *  a link destination or a directive's attributes the backslashes stay as
   *  written. */
  caption?: string;
  /** Optional note (source line, credits, footnote-like remark) set in a
   *  smaller run under the resource. Accepts the same inline formatting and
   *  `:ref` marks as the caption, and the same forced line break (`\\`, or
   *  a backslash ending a line): the footnotes of a wide table, one per
   *  line. Styled by `captionStyle.note`. */
  note?: string;
  /** Accessibility alt text. */
  altText?: string;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** Last-modified timestamp (ms since epoch). */
  updatedAt: number;
  /** Present when `kind === 'bitmap'`. */
  bitmap?: {
    fileId: string;
    format: string;
    /** The file's width in pixels (not its print size). */
    width: number;
    /** The file's height in pixels. */
    height: number;
    /** Pixels per inch of the picture at its natural print size (#631):
     *  its natural width in layout px is `width × page.dpi / resolution`
     *  (the height likewise), and the column still caps it. Absent:
     *  `layout.bitmapResolution` decides (by default the pixels are read
     *  at `page.dpi`). */
    resolution?: number;
    /** The resolution stored in the file (PNG `pHYs`, JPEG JFIF / EXIF,
     *  WebP EXIF; a Word picture's printed extent), as the host read it,
     *  horizontal ppi. Used under `layout.bitmapResolution: 'file'`, where
     *  72 and 96 count as unset; shown by the Sandbox. */
    fileResolution?: number;
  };
  /** Present when `kind === 'svg'`. */
  svg?: {
    fileId: string;
    /** Intrinsic width in px (from the SVG's `width`/`height` or `viewBox`),
     *  used to preserve aspect ratio on layout. Absent for SVGs with no
     *  declared size. */
    width?: number;
    /** Intrinsic height in px; see `width`. */
    height?: number;
    /** Optional print master: the `fileId` of a single-page PDF holding the
     *  same figure as vectors (typically the original Illustrator / PDF
     *  export the SVG was derived from). The PDF backend embeds that page
     *  verbatim — fonts, gradients and colour spaces intact — in place of the
     *  SVG; screen backends keep rendering the SVG. Ignored when
     *  `diagramStyle.singleInk` is on, since the recolouring pass only
     *  operates on SVG markup. */
    pdfFileId?: string;
    /** `false` keeps the markup byte-identical when the picture is shown as
     *  an image: no `@font-face` is added for the families its text names
     *  (`diagramStyle.inlineFonts`), for an SVG that carries its faces
     *  already or must stay as it is. Default: the document's
     *  `diagramStyle.inlineFonts` (on). */
    inlineFonts?: boolean;
  };
  /** Present when `kind === 'score'` (#1172): a music example, engraved
   *  at the column's width, numbered and captioned like a figure. */
  score?: {
    format: ScoreFormat;
    /** The notation: ABC, MusicXML, MEI or Humdrum text. */
    source: string;
    /** Id of a named score style (`PostextConfig.scoreStyles`); unset, the
     *  document's `scoreStyle`. */
    styleId?: string;
  };
  /** Present when `kind === 'table'`. */
  table?: {
    model: TableModel;
    /** Id of a named table style (`PostextConfig.tableStyles`) the table is
     *  set in. Unset, or an id no style declares, falls back to the
     *  document's `tableStyle`. */
    styleId?: string;
    /** The direction the table runs in (#371), when it is not the
     *  document's: `'ltr'` for an English data table in an Arabic book,
     *  `'rtl'` for an Arabic one in an English book. Its first column then
     *  sits on the side its text starts on, its cells are read in that
     *  direction and align from that side (`'left'` / `'start'` being the
     *  start). Unset, the table runs with the document (in a right-to-left
     *  document, first column on the right). Its caption and note follow
     *  the document. */
    direction?: 'ltr' | 'rtl';
  };
  /** Present when `kind === 'video'`: a YouTube, Vimeo or self-hosted
   *  video, placed, captioned and numbered like a picture (its type is
   *  usually the built-in `video`, numbered on its own: Video 1.1), printed
   *  as its poster with the `videoStyle` overlays and played by the
   *  interactive outputs. */
  video?: ResourceVideo;
  /** The safe area of a bitmap or SVG: the rectangle of the picture that
   *  holds what matters (a person and part of the landscape). With one, the
   *  engine may show the picture at any aspect ratio between the whole
   *  picture and this rectangle, cropping what lies outside it, to make the
   *  figure taller or shorter where the page needs it (fill a column left
   *  short, fit the room left); the outer margins are cropped in proportion
   *  to their sizes and the safe area always stays in view. Without one the
   *  picture is always shown whole. Ignored for tables. */
  safeArea?: ResourceSafeArea;
  /** The speakers and named points of a comic panel's picture (#557):
   *  balloon tails point at them, thought balloons at their `head`, and no
   *  balloon covers their `face`. Language-independent: every edition of
   *  the comic shares them. Only comic panels (`:::page`) read them. */
  anchors?: ResourceAnchor[];
  /** Regions of a comic panel's picture no balloon covers (a hand, a key
   *  object), in fractions of the picture. Only comic panels read them. */
  avoid?: ResourceSafeArea[];
  /** The faces of people in a comic panel's picture who do not speak
   *  (#726): no balloon covers them, at any fallback, as it covers no
   *  speaker's `face`; a balloon that still does is reported. In fractions
   *  of the picture. Only comic panels read them. */
  faces?: ResourceSafeArea[];
  /** The shape of a bitmap or SVG that text runs round when its placement
   *  says `wrap: 'contour'` (or the frame holding it, `wrap: 'contour'`,
   *  #883): a polygon, or the bitmap's alpha channel. Without one, a
   *  bitmap's alpha channel is read at the default threshold; an SVG with
   *  no polygon runs round its box. */
  contour?: ResourceContour;
  /** Optional per-resource placement override. When unset, the resource's
   *  type default (then `top` / `column`) applies. A `position` of `'top'` or
   *  `'bottom'` floats the resource to a band on the page near its first
   *  reference; `'here'` embeds it inline at its `::resource` directive. */
  placement?: ResourcePlacement;
}
