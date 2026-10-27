// The resolved resource block (figure, table, video, score), its rotation
// on the page, and the labels laid over a figure (#1276: split out of vdt.ts).
import type { VideoSource, ResolvedVideoPlayerOptions, Resource, ResourceSafeArea } from '../types.js';
import type { ScoreSystem } from '../music/types.js';
import type { VDTVerticalText, VDTPathStroke } from './design.js';
import { type BoundingBox, createBoundingBox } from './document.js';
import type { VDTLine } from './lines.js';
import type { VDTTableSlice, VDTResourceTableLayout, VDTCaptionBar } from './resourceTables.js';

/** The resolved, measured content of a resource block. */
/** A resource block set turned a quarter turn on the page (a landscape
 *  table in a portrait book). The block's inner geometry — `bodyRect`, the
 *  table cells, the caption, note and marker lines, the caption bar — is
 *  then expressed in the block's own upright frame (its top-left at
 *  `(0, 0)`, `width` × `height` px), and this record maps that frame onto
 *  the page: the upright origin lands at page point `(originX, originY)`
 *  and, for `'ccw'`, the upright x axis runs up the page and the y axis
 *  runs right (`'cw'`: x down, y left). See {@link resourceBlockToPage} and
 *  {@link resourceBlockToLocal}. An upright block has no `rotation` and its
 *  inner geometry is in page coordinates once placed. */
export interface VDTResourceRotation {
  direction: 'ccw' | 'cw';
  /** Page x of the upright frame's top-left corner. */
  originX: number;
  /** Page y of the upright frame's top-left corner. */
  originY: number;
  /** Width of the upright frame (its extent along the page's height). */
  width: number;
  /** Height of the upright frame (its extent along the page's width). */
  height: number;
}

/** Map a point of a resource block's inner frame to page coordinates: the
 *  identity for an upright block, the rotation for a turned one. */
export function resourceBlockToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  x: number,
  y: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x, y };
  return r.direction === 'ccw'
    ? { x: r.originX + y, y: r.originY - x }
    : { x: r.originX - y, y: r.originY + x };
}

/** Map a page point into a resource block's inner frame (the inverse of
 *  {@link resourceBlockToPage}). */
export function resourceBlockToLocal(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  xPage: number,
  yPage: number,
): { x: number; y: number } {
  const r = rb.rotation;
  if (!r) return { x: xPage, y: yPage };
  return r.direction === 'ccw'
    ? { x: r.originY - yPage, y: xPage - r.originX }
    : { x: yPage - r.originY, y: r.originX - xPage };
}

/** Map an axis-aligned rect of a resource block's inner frame to the page:
 *  a quarter turn keeps it axis-aligned, with width and height swapped. */
export function resourceBlockRectToPage(
  rb: Pick<ResolvedResourceBlock, 'rotation'>,
  rect: BoundingBox,
): BoundingBox {
  if (!rb.rotation) return rect;
  const a = resourceBlockToPage(rb, rect.x, rect.y);
  const b = resourceBlockToPage(rb, rect.x + rect.width, rect.y + rect.height);
  return createBoundingBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
}

/** The play mark printed on a video's poster (#454). `rect` is relative to
 *  the top-left corner of the body (`bodyRect`). */
export interface VDTVideoPlayMark {
  rect: BoundingBox;
  shape: 'circle' | 'rounded' | 'triangle';
  /** The triangle (hex). */
  color: string;
  /** The disc or rectangle behind it (hex); the triangle's outline for the
   *  bare `'triangle'`. */
  background: string;
  backgroundOpacity: number;
}

/** The QR code printed on a video's poster (#454). `rect` is the plate,
 *  quiet zone included, relative to the top-left corner of the body. */
export interface VDTVideoQr {
  rect: BoundingBox;
  /** What the code holds: the address it opens. */
  text: string;
  /** Modules per side, without the quiet zone. */
  size: number;
  /** One string per row, `'1'` for a dark module. */
  rows: string[];
  /** Light modules between the code and the plate's edge. */
  quietZone: number;
  /** Side of one module in px. */
  moduleSize: number;
  color: string;
  background: string;
  /** Corner radius of the plate in px. */
  radius: number;
}

/** A video resource as the outputs need it (#454): where it plays from, the
 *  player options, and the overlays printed on its poster. */
export interface VDTResourceVideo {
  source: VideoSource;
  /** The address a reader is sent to: the YouTube or Vimeo page, or a
   *  self-hosted file's production address. Absent when there is none. */
  link?: string;
  /** The YouTube or Vimeo player's `src` (the player options applied). */
  embedUrl?: string;
  /** A self-hosted file: its out-of-band id. */
  fileId?: string;
  /** A self-hosted video's media type, of its file or of its address alone
   *  (`application/vnd.apple.mpegurl` for an HLS stream, see
   *  `isHlsMimeType`). */
  mimeType?: string;
  /** Play range in seconds. */
  start?: number;
  end?: number;
  player: ResolvedVideoPlayerOptions;
  /** Make the poster a link to {@link link} (`videoStyle.linkPoster`, and
   *  a link to make). */
  linkPoster: boolean;
  /** What the HTML output sets (`videoStyle.html`). */
  html: 'player' | 'poster';
  playMark?: VDTVideoPlayMark;
  qr?: VDTVideoQr;
}

/** A score resource's systems (#1172), each `width` px wide (its own
 *  width scaled) at `y` px from the body's top. */
export interface VDTResourceScore {
  systems: Array<{ system: ScoreSystem; y: number; width: number; height: number }>;
  color: string;
  /** Alt text: the resource's, else the title and composer read from the
   *  notation. */
  alt?: string;
}

export interface ResolvedResourceBlock {
  /** The source resource. */
  resource: Resource;
  kind: 'bitmap' | 'svg' | 'table' | 'video' | 'score';
  /** Present when `kind === 'score'` (#1172): the engraved systems, stacked
   *  down `bodyRect` with `gapPx` between two, in `color`. */
  score?: VDTResourceScore;
  /** Present when `kind === 'video'`: playback and the poster's overlays
   *  (#454). The poster itself is `fileId` / `format`, drawn like a
   *  bitmap. */
  video?: VDTResourceVideo;
  /** Present when the block is one slice of a table split across pages. */
  slice?: VDTTableSlice;
  /** Present when the block is set turned on the page; the inner geometry
   *  is then in the block's upright frame (see {@link VDTResourceRotation}). */
  rotation?: VDTResourceRotation;
  /** Rendered number string (e.g. `"1.7"`) for this resource. */
  number: string;
  /** Caption prefix from the resource type (e.g. `"Figure"`). */
  captionPrefix: string;
  /** Pixel rect of the figure body (image / table area) relative to the block
   *  origin. Caption is laid out below it. */
  bodyRect: BoundingBox;
  /** For bitmap/svg: the part of the picture shown in `bodyRect`, in
   *  fractions of its intrinsic size, when the engine cropped it within its
   *  safe area (`Resource.safeArea`). Absent: the whole picture fills
   *  `bodyRect`. Renderers scale the picture so this rectangle maps onto
   *  `bodyRect` and clip to `bodyRect`. */
  bodySource?: ResourceSafeArea;
  /** For a picture with a safe area: how many px its body could still
   *  shrink or grow from the height it is set at, by cropping outside the
   *  safe area (the room the fit and balancing levers have), and the px
   *  the levers already set it taller (`delta`, negative when shorter). */
  bodyFlex?: { shrink: number; grow: number; delta: number };
  /** For a floated picture scaled to the room of its slot
   *  (`placement.shrink`, #626): the share of its width it keeps, below 1.
   *  Absent when the picture is set at its size (or only cropped within
   *  its safe area). */
  shrinkScale?: number;
  /** For bitmap/svg: the out-of-band binary id to resolve at render time. */
  fileId?: string;
  /** For bitmap: the source format (e.g. `'png'`, `'jpeg'`, `'webp'`). */
  format?: string;
  /** Measured caption lines (bboxes relative to the block origin), already
   *  including the prefix + number. Empty when there is no caption. */
  captionLines: VDTLine[];
  /** Font strings used to render the caption (normal / bold / italic / bold+italic). */
  captionFontString: string;
  captionBoldFontString: string;
  captionItalicFontString: string;
  captionBoldItalicFontString: string;
  /** Caption description text colour (hex). */
  captionColor: string;
  /** Caption numbered-label colour (hex); applied to segments tagged
   *  `captionLabel`. */
  captionLabelColor: string;
  /** Link colour (hex) used for inline `:ref` segments inside the caption. */
  linkColor: string;
  /** Table geometry, present only when `kind === 'table'`. */
  table?: VDTResourceTableLayout;
  /** Bar behind the caption, present when `captionStyle.backgroundEnabled`
   *  and the block has a caption. Painted before the caption lines. */
  captionBar?: VDTCaptionBar;
  /** Measured note lines (`Resource.note`), placed under the body when the
   *  caption sits above, otherwise under the caption. Empty when no note. */
  noteLines: VDTLine[];
  /** Font strings used to render the note (normal / bold / italic / bold+italic). */
  noteFontString: string;
  noteBoldFontString: string;
  noteItalicFontString: string;
  noteBoldItalicFontString: string;
  /** Note text colour (hex). */
  noteColor: string;
  /** "Continued" marker lines of a table slice that goes on on a later page
   *  (`slice.continues`), right-aligned under the slice and painted with the
   *  note fonts and colour. Empty otherwise. */
  continuesLines: VDTLine[];
  /** The `::label` lines of a `:::figure` (#854), in the order written:
   *  their plain text, where they go on the picture and their source. What
   *  outputs that do not draw them read as the figure's text (#862: the
   *  reflowable EPUB's list after the picture, the tagged PDF's `Alt`).
   *  Absent when the figure has none. */
  labels?: VDTFigureLabel[];
}

/** A `::label` of a figure (#854, DESIGN §3.3) as the VDT carries it:
 *  its plain text and anchor. P6 (#860) lays it out on the picture. */
export interface VDTFigureLabel {
  text: string;
  /** An anchor of the resource, or a point in fractions of the picture. */
  at: { anchor: string } | { x: number; y: number };
  style?: string;
  /** The label's text in the source (absolute offsets). */
  sourceStart: number;
  sourceEnd: number;
  /** The source offset of each character of `text` (absolute), when the
   *  text reads as written (#857). */
  sourceMap?: number[];
  /** On a composed page, the label's stable id,
   *  `cp<fence>:<slot>:label:<anchor>` (`@<k>` for the k-th label placed by
   *  percentages): the same in every locale (#857). */
  id?: string;
  /** The anchor it is set at, as `resourceId#anchorId` (#857); absent for
   *  a label placed by percentages. */
  anchorRef?: string;
  /** The source range of the value of its `at` attribute (absolute, the
   *  quotes left out): what a viewer rewrites to move a label placed by
   *  percentages (#931). */
  atSource?: { start: number; end: number };
  /** The inline symbols of its text (`:icon[alt]{…}`, #1058): the index
   *  of each one's placeholder in `text` and what it stands for, so the
   *  outputs that read a label as words read `[alt]` in its place (none
   *  when `alt` is empty). Absent when it has none. */
  icons?: { at: number; alt: string }[];
  /** The label's `leader` attribute (#1057): `true` for `leader` (any
   *  value but `none`), `false` for `leader="none"`. Absent: as its anchor
   *  and style say. */
  leader?: boolean;
  /** Where the label is painted: the upright box round its text (and
   *  background), in the coordinates of the block's own frame (a page's
   *  flow, or the frame of a composed page its block stands in), stamped
   *  once the pages exist (#860). `sourceAt` answers a point inside it
   *  with the label. Absent for a label that is not drawn. */
  rect?: BoundingBox;
  /** The label set on the picture (#860): absent when it is not drawn (its
   *  anchor is unknown, the resource is no picture). */
  layout?: VDTFigureLabelLayout;
}

/**
 * A figure label laid out on its picture (#860, DESIGN §2.6). Everything is
 * in the label's own frame: its origin is the anchor's point and its axes
 * are turned by `rotate` degrees (clockwise) about it. That point is
 * `(x, y)` px from the top-left corner of the picture's body (the block's
 * `bodyRect` as drawn, its crop applied), so the label moves with its
 * block. Painters: `translate(bodyX + x, bodyY + y) · rotate(rotate)`
 * (`figureLabelMatrix`), then the halo, the background and the lines.
 */
export interface VDTFigureLabelLayout {
  x: number;
  y: number;
  /** Degrees, clockwise. Absent = 0. */
  rotate?: number;
  /** The text, as caption lines are (segments, chips, marks, bidi order),
   *  positioned in the label's frame. */
  lines: VDTLine[];
  /** The box of the lines in the label's frame. */
  box: BoundingBox;
  fontString: string;
  boldFontString: string;
  italicFontString: string;
  boldItalicFontString: string;
  /** Hex. */
  color: string;
  /** The glyphs stroked `2 × widthPx` wide in `color` under the text. */
  halo?: { color: string; widthPx: number };
  /** A plate behind the text: `rect` is the box grown by the style's
   *  padding, filled with `color` and outlined by `border` (#1058), its
   *  corners rounded by `radiusPx`. A plate has a fill, a border or both. */
  background?: { color?: string; rect: BoundingBox; border?: { color: string; widthPx: number }; radiusPx?: number };
  /** Set in a `kind: 'legend'` label style (#1058): each line is a row of
   *  the key, the first symbol of each row hung in a column as wide as the
   *  widest (`VDTInlineIcon.insetPx`). Read row by row (a list in the
   *  tagged PDF). */
  legend?: true;
  /** The scale the label was set at to fit its width (`minScale` at
   *  least); absent at 1. */
  scale?: number;
  /** Still wider than its anchor's width at the style's `minScale`. */
  overflow?: true;
  /** The label style it was set in (`labelStyles[].id`). */
  styleId?: string;
  /** Set right to left (its text opens with a right-to-left letter). */
  direction?: 'rtl';
  /** Set in vertical writing (#902, `ResourceAnchor.writingMode`): the
   *  lines are laid out as a vertical page's flow is, in the label's frame
   *  turned a quarter turn clockwise (`rotate` includes it), and painted
   *  with the vertical glyph painter, characters upright in their cells. */
  vertical?: VDTVerticalText;
  /** Set on the layout of a vertical label in the flow of a mirrored
   *  (right-to-left) page (#955): its geometry is the reflection of the
   *  label's about the body's vertical axis, as every label's is there, but
   *  its lines are kept as they were set (cells in text order, no run
   *  order turned), so a painter reflects the frame back about the body,
   *  paints the layout as {@link unmirrorLabelLayout} gives it back and
   *  the label reads down its columns as on any page. */
  mirrored?: true;
  /** The line from the label's box to its anchor's point (#1057): drawn
   *  with the labels, under them, by {@link figureLabelLeaderPath}. */
  leader?: VDTFigureLabelLeader;
}

/**
 * A figure label's leader (#1057, DESIGN §12.4). The point is in the frame
 * of the label's `x` / `y` (px from the top-left corner of the picture's
 * body); the line leaves the label's box (its plate, else its lines' box,
 * `gapPx` out) from the middle of the side that faces the point, so it
 * never crosses the label's own words, and is laid when painted, so a label
 * moved off a spread's spine or mirrored keeps its leader on the point.
 */
export interface VDTFigureLabelLeader {
  x: number;
  y: number;
  routing: 'straight' | 'elbow';
  stroke: VDTPathStroke;
  /** At the label's end. Absent: none. */
  startCap?: 'dot' | 'arrow' | 'ring' | 'bar';
  /** At the point. Absent: none. */
  endCap?: 'dot' | 'arrow' | 'ring' | 'bar';
  capSizePx: number;
  /** The look's `opacity` (#1079), applied to the stroke's colour when the
   *  line is laid (after part palettes recolour it). Absent: opaque. */
  opacity?: number;
  /** Room between the label's box and the line. */
  gapPx: number;
}
