// What a resource block is laid out from, and the table slice and row
// measures the slicing passes on (#1276: split out of resourceLayout.ts).
import type { Resource, ResourceType, ResourceRotation } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { MeasurementCache } from '../../../measure/index.js';
import type { ResourceNumberingMap } from '../resourceNumbering.js';
import type { CaptionCitations } from '../../references/citations.js';

export interface ResourceLayoutInput {
  /** Where the caption, the note and the table cells are measured through
   *  (#781): a table is laid out on every pass of every build. */
  cache?: MeasurementCache;
  resource: Resource;
  resourceType: ResourceType | undefined;
  number: string;
  resolved: ResolvedConfig;
  /** Available column width in px — for a rotated block, the width of the
   *  band it takes on the page (the extent its upright height may reach). */
  columnWidth: number;
  /** Set the block turned a quarter turn on the page. Its upright frame is
   *  then laid out `rotatedLength` px wide (the block's extent along the
   *  page's height) and the block reports that length as its height on the
   *  page; the upright height (the footprint's width) is
   *  `block.rotation.height`. See {@link VDTResourceRotation}. */
  rotate?: ResourceRotation;
  /** Upright layout width of a rotated block (px). Defaults to `columnWidth`. */
  rotatedLength?: number;
  /** Full numbering map — lets inline `:ref`s inside the caption resolve. */
  resourceNumbering: ResourceNumberingMap;
  resourceTypes: ResourceType[];
  resources: Resource[];
  /** The formatted citations of resource captions and notes, by resource
   *  id (#529); a citation without one prints as written. */
  captionCitations?: ReadonlyMap<string, CaptionCitations>;
  /** Lay out only these rows of a table (a slice of a table split across
   *  pages). Ignored for figures. */
  slice?: TableSliceSpec;
  /** Set the caption (and note) beside the body instead of under it: in a
   *  band `width` wide whose left edge is `dx` from the block's left (the
   *  side column of a one-and-a-half layout), level with the body's top,
   *  or with its bottom when `alignBottom`. The block's height is then the
   *  body's alone; `asideHeight` reports the caption band's. */
  captionAside?: { dx: number; width: number; alignBottom: boolean; offsetY?: number };
  /** Widest a figure's image (bitmap or SVG) may be set; the caption and
   *  note keep `columnWidth`. Defaults to `columnWidth`. */
  maxBodyWidth?: number;
  /** Tallest a picture's body (bitmap, SVG, video poster) may be set: a
   *  float scaled to the room of its slot (`placement.shrink`, #626). The
   *  picture is cropped within its safe area first (keeping its width),
   *  then scaled, width and height together, never below `minBodyScale`;
   *  the result records the scale (`shrinkScale`). The caption and note
   *  are not counted: the caller takes them off the slot's room. Ignored
   *  for tables and turned blocks. */
  maxBodyHeight?: number;
  /** The smallest scale `maxBodyHeight` sets the picture at (0–1); the
   *  body then stands taller than the cap. Default 0. */
  minBodyScale?: number;
  /** Measure the caption and note at this width instead of the slot's,
   *  set under the picture per `placement.align`: the layout's own rounds
   *  for `placement.captionMeasure: 'body'`. */
  captionWidth?: number;
  /** Make a picture with a safe area (`Resource.safeArea`) this many px
   *  taller (or shorter, when negative) than it would be set, by cropping
   *  outside its safe area; clamped to the range the safe area allows (see
   *  `bodyFlex` in the result). Ignored for pictures without one, tables
   *  and turned blocks. */
  bodyHeightDelta?: number;
  /** Set the block upright on a vertical page (`VDTPage.flow`): laid out
   *  in an upright frame counter-rotated in the flow (`rotation.direction:
   *  'ccw'`, which the page's clockwise frame turns back), so the picture
   *  and its caption read as on a horizontal page. `columnWidth` (the
   *  column's width in the flow: the tier's height on the sheet) bounds
   *  the frame's height; its width is the picture's (a bitmap at its size,
   *  an SVG as tall as the tier leaves room for with its caption), at most
   *  `maxLength` px, and the block reports that width as its height in the
   *  flow. A table is laid out `maxLength` wide, its rows cut to the tier
   *  by the placer. `rotate` and `rotatedLength` are ignored. */
  upright?: { maxLength: number };
}

/** The rows a table slice carries. `startRow > 0` makes it a continuation:
 *  the header rows are repeated above `startRow` and the caption gets the
 *  continued suffix. `continues` sets the marker under the slice (and holds
 *  the note back). */
export interface TableSliceSpec {
  startRow: number;
  /** Exclusive. */
  endRow: number;
  continues: boolean;
}

/** Per-row metrics of a table laid out in full at some width, from which
 *  {@link planTableSlice} decides where a slice can end. Row heights are
 *  exact for any slice at the same width: every row is measured at the same
 *  column edges, and rowspans never straddle a break. */
export interface TableRowMetrics {
  /** Height of each model row in px (rowspan overflow already distributed). */
  rowHeights: number[];
  /** Leading header rows, repeated at the top of every continuation. */
  headerRowCount: number;
  /** Whether a slice may end after row `i` — no rowspan crosses the edge
   *  between `i` and `i + 1`. */
  breakableAfter: boolean[];
  /** Rows that head the rows below them (a single cell across every column,
   *  or all header cells): a slice never ends on one when it can help it. */
  groupHeaderRow: boolean[];
}
