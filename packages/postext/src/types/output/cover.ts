import type { ColorValue, InkSheen } from '../page.js';

/** The zones of a production sheet (#1655), left to right: what each part
 *  of the sheet becomes once it is folded and bound. */
export type CoverZoneName =
  | 'flapBack'
  | 'back'
  | 'jointBack'
  | 'spine'
  | 'jointFront'
  | 'front'
  | 'flapFront'
  | 'pastedown'
  | 'flyleaf'
  | 'hinge';

/** A rectangle on a sheet, mm from its corner (bleed included). */
export interface SheetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoverPoint {
  x: number;
  y: number;
}

/** A node of a path: where it is, and the handles of the curve that comes
 *  into it and of the one that leaves it (absent: a straight side). */
export interface CoverPathNode extends CoverPoint {
  in?: CoverPoint;
  out?: CoverPoint;
}

/** Paths of nodes in fractions of the box (0, 0 its top-left corner; 1, 1
 *  its bottom-right), so the shape stretches with the box; a closed one
 *  joins its last node to its first. */
export type CoverPath = { nodes: CoverPathNode[]; closed: boolean }[];

/** An outline: closed polygons, their points in fractions of the box they
 *  are laid in. Traced from a picture, it keeps its shape for a veil or a
 *  finish. */
export type CoverOutline = CoverPoint[][];

/** The effects of a box or a shape that a page's own box style cannot
 *  draw. A gradient or a shadow makes the element a picture of its own. */
export interface CoverEffects {
  /** A box's corners, rounded to this radius, mm. */
  radius?: number;
  /** A border round it: its colour and width, mm. */
  stroke?: { color: ColorValue; width: number };
  /** A gradient from the element's colour to `to`, at `angle` degrees
   *  (0: left to right; 90: top to bottom). */
  gradient?: { to: ColorValue; angle: number };
  /** A soft shadow under it: its colour and opacity (0 … 1), how far it
   *  falls (mm, right and down) and how soft it is (mm). */
  shadow?: { color: ColorValue; opacity: number; x: number; y: number; blur: number };
}

/** Where an element stands: placed by the zone it stands in, so it moves
 *  with that zone when the spine grows or the binding changes. */
export interface CoverPlacement {
  zone: CoverZoneName;
  /** Its box, mm from the zone's top-left corner; it may run out of the
   *  zone, onto the sheet's other zones or into the bleed. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The size of its zone when it was placed, mm. When the zone is
   *  another size now (the book's format changed, the spine grew), the
   *  element is scaled with it: a box or a shape on each axis, a picture
   *  evenly about where its centre falls, so it keeps its proportions.
   *  Absent: it stays as placed. */
  basis?: { width: number; height: number };
  /** A box or a shape that runs across zones (a band, a ground): its right
   *  edge, mm from the left of the zone it ends in, and that zone's width
   *  when it was placed. Each edge then follows its own zone. */
  to?: { zone: CoverZoneName; x: number; basis?: number };
}

/** A movable element of a cover's design: a picture, a box of colour, a
 *  shape of colour, or the collection's catalogue (#1673): the pictures of
 *  its titles in a grid inside the box, the book's own outlined by
 *  `stroke`. */
export interface CoverElement extends CoverEffects, CoverPlacement {
  /** Letters, digits, `-` and `_`. */
  id: string;
  kind: 'image' | 'box' | 'shape' | 'catalogue';
  /** A catalogue's columns (default: every title in one row). */
  columns?: number;
  /** A catalogue's gap between its pictures, mm (default 3). */
  gap?: number;
  /** A catalogue's first and last titles, by their place in it from 1
   *  (default: all of them). */
  first?: number;
  last?: number;
  /** A shape's outline, in its box (a traced one). */
  outline?: CoverOutline;
  /** A shape drawn by nodes, in its box; over `outline` when both are
   *  there. */
  path?: CoverPath;
  /** An image's picture: a bitmap or SVG resource of the book. */
  resourceId?: string;
  /** A box's or a shape's colour. */
  color?: ColorValue;
  /** Its opacity, 0 … 1 (default 1). A picture keeps its own
   *  transparency. */
  opacity?: number;
  /** How a picture fills its box: whole inside it (`contain`, the
   *  default), or covering it, cropped (`cover`). */
  fit?: 'contain' | 'cover';
  /** A picture cut to an outline (in fractions of its box): an
   *  illustration's own shape, a shine that shows only within it. The
   *  picture then fills the box, cropped to it. */
  clip?: CoverOutline;
  /** Past the design margin of a mirror bleed: `mirror` (the default)
   *  folds it out with the background; `own` paints the element as it is,
   *  over the fold. */
  bleed?: 'mirror' | 'own';
}

/** A logo of the cover (the publisher's, the collection's, a seal): a
 *  picture placed as an element, over the effects, and the clear space
 *  (mm) nothing else should enter round it. */
export interface CoverLogo extends CoverElement {
  kind: 'image';
  clearance: number;
}

/** What a finish of the cover is: a varnish or a foil printed on a spot
 *  plate of its own (an ink with an `InkFinish`, #1563), or an emboss or a
 *  deboss, a relief die on a technical plate that prints nothing. */
export type CoverFinishProcess = 'varnish' | 'foil' | 'emboss' | 'deboss';

/** What a finish covers: a box of its own, placed like an element; the
 *  shape of an element, effect or logo of the design (a picture's contour
 *  when its resource has one); or a saved outline laid in a box of its
 *  own. */
export type CoverFinishShape =
  | { box: CoverPlacement }
  | { element: string }
  | { outline: CoverOutline; box: CoverPlacement };

/** A finish of the cover. */
export interface CoverFinish {
  /** Letters, digits, `-` and `_`. */
  id: string;
  process: CoverFinishProcess;
  /** A varnish's or a foil's ink: a spot colour (`model: 'spot'`), a
   *  palette entry's when it names one. Its finish is set from `process`
   *  and `sheen`. Default: a varnish `Varnish`, a foil `Gold foil`. Not
   *  read for an emboss or a deboss. */
  ink?: ColorValue;
  /** Default `'gloss'`. Not read for an emboss or a deboss. */
  sheen?: InkSheen;
  shape: CoverFinishShape;
}

/** The points a cover text box can be anchored to (#1679): a point of
 *  the nine-point grid of a zone or another box, or, on another box only,
 *  beside it (`right-of`, `left-of`, `below`, `above`). */
export type CoverAnchorEdge =
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'
  | 'right-of' | 'left-of' | 'below' | 'above';

/** Where a text box stands against a zone (its safe area) or another text
 *  box (#1679), as a composed page's frame is anchored to another frame:
 *  `edge` is the point of `to` the box is pinned to, the box's own matching
 *  point on it (`bottom` stands the box on the foot of the zone, centred;
 *  `below` hangs it under the other box, left edges aligned), and `x`, `y`
 *  move it from there, mm. */
export interface CoverTextAnchor {
  /** A zone (`front`, `spine`…) or the name of another text box. */
  to: string;
  edge: CoverAnchorEdge;
  x?: number;
  y?: number;
}

/** A text box of a cover: a frame the cover's Markdown fills by `name`
 *  (`:::frame{slot="name"}`), placed on `rect` (mm on the sheet, from its
 *  bleed's corner), its text laid along it or, with `rotate`, across it
 *  and turned a quarter about its centre (to read up the spine, −90, or
 *  down it, 90). It is a frame of the cover's page template, and the
 *  abilities below are a composed page's frame's (#1679). */
export interface CoverTextFrame {
  /** Letters, digits, `-` and `_`; not a zone's name. */
  name: string;
  /** Its box. With `anchor`, its size is read and its place is worked out
   *  from the anchor (the Sandbox keeps `x` and `y` where it lands). */
  rect: SheetRect;
  rotate?: 90 | -90;
  verticalAlign?: 'top' | 'middle' | 'bottom';
  /** Placed against a zone or another text box, and moved with it: a box
   *  hung under one that grows goes down with it. */
  anchor?: CoverTextAnchor;
  /** The text this box cannot hold continues in this other text box, cut
   *  between lines (a composed page frame's `next`). The box it names
   *  takes no text of its own from the Markdown. */
  next?: string;
  /** The box grows with its text up to this height, mm, before its text
   *  shrinks (the frame's `maxHeight`). It grows away from the point it is
   *  anchored by: down from the top, up from the foot. Not on a turned
   *  box. */
  maxHeight?: number;
  /** How the box's text shrinks when it still does not fit (the frame's
   *  `fit`): `shrinkText: false` keeps its size; `minScale`, above 0 and
   *  at most 1, is the smallest scale (default 0.9). */
  fit?: { shrinkText?: boolean; minScale?: number };
}

/**
 * The design of a book's covers (#1667), shared by every version of the
 * book and by the books of a collection: a ground for the whole sheet, a
 * picture over it and a ground per zone; the movable elements under the
 * text, the effects and logos over it; and the finishes. The text is the
 * cover's Markdown, filled by zone (`:::frame{slot="back"}`); the front
 * and spine the Markdown leaves empty take the book's title, subtitle and
 * author, set in the paragraph styles `cover-title`, `cover-subtitle`,
 * `cover-author` and `cover-spine`.
 */
export interface CoverConfig {
  background?: ColorValue;
  /** A bitmap or SVG resource of the book, filling the whole sheet or
   *  only the front cover, cropped to cover it about `focus`. */
  image?: { resourceId: string; area?: 'sheet' | 'front'; focus?: { x: number; y: number } };
  /** A ground per zone, over the sheet's and its picture. */
  zones?: Partial<Record<CoverZoneName, ColorValue>>;
  /** The movable elements, back to front, over the grounds and under the
   *  text. */
  elements?: CoverElement[];
  /** Effects over the text, back to front: a translucent box, a picture
   *  with transparency of its own. */
  effects?: CoverElement[];
  logos?: CoverLogo[];
  finishes?: CoverFinish[];
  /** Text boxes placed by hand, each a frame of its own over the zones'. */
  textBoxes?: CoverTextFrame[];
  /** Where each zone's text sits in it. Default `'top'`; the spine's is
   *  always centred across it. */
  verticalAlign?: Partial<Record<CoverZoneName, 'top' | 'middle' | 'bottom'>>;
  /** Mirror bleed: the design is drawn this far past the trim, mm (2 at
   *  the least), and beyond it the background and the movable elements
   *  are mirrored out to the sheet's edge. Unset: no mirroring. */
  mirrorMargin?: number;
  /** The barcode's size against nominal, 0.8 … 2. Default 1. */
  barcodeMagnification?: number;
  /** A design of their own for a hardcover's sheets (#1673), each used in
   *  place of this one on its sheet: the case under a jacket, the jacket,
   *  both endpapers or one of them (`endpaperFront`, `endpaperBack`, over
   *  `endpapers`). A sheet without one takes this design. */
  sheets?: Partial<Record<CoverSheetName, CoverSheetDesign>>;
}

/** The sheets of a version a design or a frame of the cover's text may
 *  name: `cover` is the cover of a softcover or the covering of a case. */
export type CoverSheetName = 'cover' | 'case' | 'jacket' | 'endpapers' | 'endpaperFront' | 'endpaperBack';

/** The design of one sheet: a cover design without sheets of its own. */
export type CoverSheetDesign = Omit<CoverConfig, 'sheets'>;
