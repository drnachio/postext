// Comic pages (`:::page`): panels, splitters, balloons and their art.
import type { VDTDesignTextBlock } from '../design.js';
import type { BoundingBox } from '../document.js';
import type { VDTFrame } from './composed.js';

// ---------------------------------------------------------------------------
// Comic pages (`:::page`, #555–#563)
// ---------------------------------------------------------------------------

/** A point on the sheet (px). */
export interface VDTPoint {
  x: number;
  y: number;
}

/** The picture of a comic panel (or its pop-out cut-out): the whole picture
 *  is drawn at `box` (page px, uncropped, as `uncroppedPictureBox` gives)
 *  and clipped to the panel's polygon, so only `source` shows. */
export interface VDTComicArt {
  resourceId: string;
  kind: 'bitmap' | 'svg';
  /** The file the renderers draw (`registerResourceImage`). */
  fileId: string;
  /** The bitmap's format, for a bitmap. */
  format?: string;
  /** An SVG's vector print master (`Resource.svg.pdfFileId`): the PDF
   *  embeds its first page in place of the SVG. */
  pdfFileId?: string;
  /** Where the whole picture lands on the sheet (px). Larger than the cell
   *  on the axis a crop cuts; inside it on the axis a letterbox leaves. */
  box: BoundingBox;
  /** The part of the picture that shows, in fractions of the picture as
   *  stored (not flipped, even when `mirrored`). */
  source: BoundingBox;
  /** The picture is drawn flipped left to right inside `box` (a book read
   *  in the other direction than its art, `comics.mirrorArt`). */
  mirrored: boolean;
  /** The picture does not fill the cell: the bands it leaves show the
   *  panel background (`fit: 'contain'`, or a cell whose shape cannot hold
   *  the safe area under a cover crop). */
  letterbox: boolean;
}

/** One panel of a comic page, in reading order. Sheet coordinates (never a
 *  flow frame): a comic page is laid out on the sheet whatever the
 *  document's writing mode or direction. */
export interface VDTComicPanel {
  /** Position in reading order (0-based). */
  index: number;
  /** The panel's `#id`, when it has one. */
  id?: string;
  /** Id of the frame the split generated for the panel (#885,
   *  `VDTComicPage.frames`): `cm<fence>:<name>`, the same in every locale
   *  and across relayouts. */
  frameId?: string;
  /** The panel's source: from its `::panel` line to the end of its last
   *  script line. */
  sourceStart: number;
  sourceEnd: number;
  /** The panel's outline (a convex polygon, clockwise on the sheet), the
   *  gutters already taken off; a bleeding side runs to the bleed box. */
  polygon: VDTPoint[];
  bbox: BoundingBox;
  /** Corner radius (px); 0 for a panel cut by a slanted line. */
  radius: number;
  border: { width: number; color: string; style: 'solid' | 'none' | 'rough' };
  /** Fill under the picture (hex), absent when transparent. */
  background?: string;
  art?: VDTComicArt;
  /** A transparent cut-out drawn over the border (broken-border art), with
   *  the same crop as `art`. */
  pop?: VDTComicArt;
  /** Text alternative of the picture: the panel's `alt`, else the
   *  resource's `altText`. */
  altText?: string;
}

/** A split line of a comic page (a gutter between two cells), as the
 *  Sandbox drags it: dragging moves the line and writes the new
 *  percentage into the `split` attribute (`moveComicSplitLine`). */
export interface VDTComicSplitter {
  /** Tree path of the list the line splits (indices of the items walked
   *  down from the top list; `[]` is the top list). */
  path: number[];
  /** The line between children `boundary` and `boundary + 1`. */
  boundary: number;
  /** `'rows'`: a line across the page (between tiers); `'columns'`: a line
   *  down it. */
  axis: 'rows' | 'columns';
  /** The line's centre, from its start end to its far end (page px). */
  a: VDTPoint;
  b: VDTPoint;
  /** The gutter the line sits in (px). */
  gutter: number;
  /** Bounding box of the cell the list splits: a drag of `d` px along the
   *  axis is `d / parent.height` (rows) or `d / parent.width` (columns) of
   *  it. */
  parent: BoundingBox;
  /** The line's position (cumulative percent of the parent) at its start
   *  end and at its far end; equal for a straight line. */
  startPercent: number;
  endPercent: number;
  /** The range `startPercent` may be moved in (the slant kept) so every
   *  cell keeps at least 5 %. */
  min: number;
  max: number;
  /** The range of the `split` attribute's value in the source. */
  sourceStart: number;
  sourceEnd: number;
}

/** A balloon, caption or sound effect of a comic page, in reading order and
 *  paint order. */
export interface VDTComicBalloon {
  id: string;
  /** Stable id (#885): `cm<fence>:<frame>:b<order>`, the same in every
   *  locale and across relayouts (`id` counts panels of the layout). */
  elementId?: string;
  panelIndex: number;
  order: number;
  /** What the script line is: a speaker's balloon, a caption, a sound
   *  effect or an editor's note (from its key: `caption`, `sfx`, `note`,
   *  else a speaker). Renderers and tagging go by it, not by the style id
   *  (a book may name a sound-effect style anything). */
  kind: 'balloon' | 'caption' | 'sfx' | 'note';
  /** The balloon style id (`speech`, `thought`…). */
  style: string;
  speaker?: string;
  /** The script line(s) it was set from. */
  sourceStart: number;
  sourceEnd: number;
  /** Balloons of one join group share one outline. */
  group: number;
  /** Body and tail(s) as one SVG path (page px), absent for a sound effect
   *  or a style with no outline. */
  shape?: {
    d: string;
    fill?: string;
    stroke?: string;
    strokeWidth: number;
    /** Dash pattern of the outline (a whisper), px. Painted over a solid
     *  stroke in the fill colour 3 × `strokeWidth` wide, so that the gaps
     *  between the dashes read as the balloon's ground, not the art. */
    dash?: number[];
    double?: { gap: number };
  };
  /** The lettering's lines (vertical or bidi text as design text); a ruby
   *  reading is a block of its own after its base's (marked `artifact`). */
  text: VDTDesignTextBlock[];
  bbox: BoundingBox;
  tailTip?: VDTPoint;
  /** Rotation in degrees about the bbox centre (sound effects). */
  rotate?: number;
  /** Lean of the letters in degrees about the bbox centre, applied before
   *  `rotate` (positive: the tops forward, as italic). Painters apply
   *  `translate(c) · rotate(rotate) · [1 −tan(skew); 0 1] · translate(−c)`
   *  (`comicBalloonMatrix`). */
  skew?: number;
  halo?: { width: number; color: string };
}

/** A comic page (`:::page`): its panels, the split lines between them and
 *  the lettering, on the sheet. Also the comic of a strip
 *  (`VDTBlock.comic`, relative to the block's box on the sheet) and each
 *  page of a two-page spread (`spread`: that page's panels clipped to its
 *  side of the spine, its split lines, its balloons, on its own sheet). */
export interface VDTComicPage {
  /** The `:::page` block in the source. */
  sourceStart: number;
  sourceEnd: number;
  /** The box the panels are cut from (the content area, or
   *  `comics.frame.margins`), page px. On a page of a spread, the part of
   *  the spread's frame on this page (from its outer edge to the spine); on
   *  a strip, the block's box (`x = y = 0`). */
  frame: BoundingBox;
  /** The reading direction the page was laid out in. */
  direction: 'ltr' | 'rtl';
  /** The side of a two-page spread (`:::page{spread}`, #567) this page
   *  holds, physical: the left page or the right one of the open book. */
  spread?: 'left' | 'right';
  /** Where the leaf the page was laid out on lies on the page, when it is
   *  not the page itself (`comics.viewerLeaf`: a host whose page is a
   *  screen, such as the Sandbox's HTML viewer, lays comic pages out on a
   *  print leaf scaled to fit it). Absent on paper. */
  leaf?: BoundingBox;
  /** Panels in reading order. */
  panels: VDTComicPanel[];
  splitters: VDTComicSplitter[];
  /** Reading order, paint order. */
  balloons: VDTComicBalloon[];
  /** Stable id of the comic (#885): `cm<n>`, `n` the comic fence's ordinal
   *  in its chapter (`:::page` and `:::strip` counted together). */
  id?: string;
  /** The frames the split generates (#885, DESIGN §7): one per panel, in
   *  panel order, each the panel's box (and `polygon` when slanted), with
   *  the panel's id and source. A text panel's frame (`::panel{text}`)
   *  lists the blocks its Markdown was set in (`blockIds`, in
   *  `page.floats`), which backends paint over the panels, under the
   *  lettering. */
  frames?: VDTFrame[];
}
