import type { BorderSides, CornerRadius } from './boxes/calloutParts.js';
import type { ColorValue, Dimension } from './page.js';

export type PageParity = 'all' | 'odd' | 'even';
export type HeaderFooterHAlign = 'left' | 'center' | 'right';

/** Classification of a laid-out page, computed after placement
 *  (`pipeline/pages/pageRoles.ts`):
 *  - `'blank'` — parity / force-blank padding, or a page with no content;
 *  - `'part'` — a part-divider page (`partInfo` set);
 *  - `'opener'` — the first block in reading order is a heading whose level
 *    spans the page or forces a page break before it (a chapter opener);
 *  - `'comic'` — a comic page (`:::page`, `VDTPage.comic` set);
 *  - `'composed'` — a composed page (`::::page{template}`, `VDTPage.composed`
 *    set, #855);
 *  - `'body'` — everything else. */
export type PageRole = 'body' | 'opener' | 'part' | 'blank' | 'comic' | 'composed';

/** Which page roles a design element renders on. `'all'` (default) renders
 *  on every page the parity filter admits. */
export type PageRoleFilter = 'all' | PageRole;

// ---------------------------------------------------------------------------
// Unified design slot primitives — shared by header, footer, and advanced
// heading designs. Each element is placed by an anchor (container-relative
// nine-point grid or element-to-element), with optional offset and size.
// Paint order is strictly array order (first = back, last = front).
// ---------------------------------------------------------------------------

export type HAlign = 'left' | 'center' | 'right';
/** Alignment of a design text's lines: an {@link HAlign}, `'justify'`, or
 *  `'start'` / `'end'`, the sides its base direction reads from and to
 *  (see `DesignTextElement.align`). */
export type DesignTextAlign = HAlign | 'justify' | 'start' | 'end';
export type VAlign = 'top' | 'middle' | 'bottom';

export type AnchorEdge =
  // Container-relative (nine-point grid)
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'center' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right'
  // The side the page's lines start from (#936): the left of a
  // left-to-right page; on the sheet of a right-to-left or vertical page
  // (running heads, a template's decoration) the right. A frame is laid in
  // the page's flow, where the start is always its left. With these edges
  // the offset's `x` runs from the start side to the end side.
  | 'top-start' | 'start' | 'bottom-start'
  | 'top-end' | 'end' | 'bottom-end'
  // Element-to-element (requires anchor.to = '#elementId')
  | 'right-of' | 'left-of' | 'below' | 'above'
  | 'align-top' | 'align-bottom' | 'align-left' | 'align-right'
  | 'align-start' | 'align-end';

export interface ElementAnchor {
  /** `'container'` (the slot's own container), `'page'` (the trim box),
   *  `'bleed'` (the trim box expanded by `cutLines.bleed` when cut lines are
   *  enabled, otherwise the trim box) or `'#elementId'` — a reference to
   *  another element in the slot. Page/bleed anchoring also makes that frame
   *  the reference for `size: 'fill'` and auto-width clamping, so a band can
   *  run edge to edge regardless of the page margins. `'outer'` (header
   *  and footer only) is the outer margin of the page — between the type
   *  area and the trim edge on the side away from the spine, from the type
   *  area's head to its foot — on the right of a recto and the left of a
   *  verso in a left-bound book, the other way round in a right-bound one
   *  (`page.binding`), so one element serves both pages of a spread: a
   *  running head down the fore-edge. Elsewhere it reads as `'container'`. */
  to: 'container' | 'page' | 'bleed' | 'outer' | `#${string}`;
  edge: AnchorEdge;
  /** The point along the side `edge` names, on another element, a frame or
   *  a group (`'#name'`, #1055): `'start'`, `'center'`, `'end'` or a
   *  fraction of the side (0 at its start, 1 at its end; outside 0…1 it is
   *  held there). A horizontal side (`top`, `bottom`, `below`, `above`,
   *  `align-top`, `align-bottom` and the `top-*` / `bottom-*` corners, read
   *  as their side) starts where the page's lines start (the left, or the
   *  right of a page that starts on the right); a vertical one (`left`,
   *  `right`, `right-of`, `left-of`, `align-left`, `align-right`, `start`,
   *  `end`) at its top. Along the side the element is centred on that point
   *  (a vertical rule's thickness on a frame's middle); across it the edge
   *  keeps its pin (`below` hangs under the side, `bottom` stands on it
   *  inside the box). Absent: the edge's own point. Ignored on
   *  `'container'`, `'page'`, `'bleed'`, `'outer'` and on `center`. */
  at?: SidePosition;
}

/** A point along a side of a box (#1055): its start, middle or end, or a
 *  fraction of it from the start (0…1). */
export type SidePosition = 'start' | 'center' | 'end' | number;

/** A size that runs from the element's anchor point to an edge of another
 *  box (#928): `to` names it as an anchor does (`'container'`, `'page'`,
 *  `'bleed'`, `'outer'`, `'#id'` of another element or, on a composed
 *  page's decoration, of a frame or group) and `edge` which of its edges:
 *  `'top'` / `'bottom'` for a height, `'left'` / `'right'` for a width,
 *  `'center'` for its middle on either axis (#1055). A
 *  ground from the foot of a band down to the bleed:
 *  `height: { to: 'bleed', edge: 'bottom' }`; it follows the band when the
 *  band moves. The other side's edge (a width to `'top'`) reads as
 *  `'fill'`; an edge behind the anchor point gives 0. */
export interface ElementSizeTo {
  to: ElementAnchor['to'];
  /** `'center'` (#1055): the middle of the box on the axis being sized —
   *  its horizontal centre for a width, its vertical centre for a height. */
  edge: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

export type ElementSize = 'auto' | 'fill' | Dimension | ElementSizeTo;

export interface ElementPlacement {
  anchor: ElementAnchor;
  offset?: { x?: Dimension; y?: Dimension };
  size?: {
    width?: ElementSize;
    height?: ElementSize;
    /** Cap for an `'auto'` width (text elements): the element still sizes to
     *  its content, so elements anchored to it stay attached, but never
     *  grows past this — the text wraps or ellipsizes there. Lets a running
     *  head reserve room for the label that hangs off it. */
    maxWidth?: ElementSize;
  };
}

export interface ElementBoxStyle {
  backgroundColor?: ColorValue;
  borderColor?: ColorValue;
  borderWidth?: Dimension;
  /** One length, or one per corner (#1059). */
  borderRadius?: CornerRadius;
  /** The border per side (#1059), each over `borderColor` / `borderWidth`
   *  (a side is on when it has a colour and a width, unless `enabled:
   *  false`). Unset: the whole border on every side. */
  borderSides?: BorderSides;
  padding?: { top?: Dimension; right?: Dimension; bottom?: Dimension; left?: Dimension };
}

/** What a design text does with a line wider than its room: `'wrap'` onto
 *  more lines; truncate with `…` at the end, the start or the middle; or
 *  `'clip'` to the box. `'ellipsis-end'` / `'ellipsis-start'` cut at a word
 *  boundary, and no space or joining punctuation touches the ellipsis —
 *  mid-word only when what the boundary leaves, that punctuation dropped,
 *  is less than half of what fits (a long word, a URL). A no-break space
 *  or hyphen (U+2011) is no boundary. `'ellipsis-middle'` cuts anywhere but
 *  drops the spaces beside it.
 *
 *  An element that sets none takes its slot's default (#628): `'wrap'` in a
 *  heading design (`advancedDesign.slot`, an opener or an in-column title)
 *  and on a part page (`parts.design`, `parts.versoDesign`), where a long
 *  title should break onto more lines; `'ellipsis-end'` in a running head
 *  or folio (`header`, `footer`, a heading style's own) and in a contents
 *  part row (`toc.parts.design`, whose row has a fixed height). A line cut
 *  by an ellipsis, or clipped with ink past the box, is reported as a
 *  `designTextTruncated` content warning. */
export type TextOverflow = 'wrap' | 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip';

/**
 * Letters painted as round dots along the middle of their strokes, for a
 * child to trace (a handwriting workbook, #1017): the text is laid out as
 * it would be filled (same face, same widths) and only its ink changes.
 * The dots follow the face as the browser shapes it, so a joined school
 * script keeps its joins and an Arabic word its forms; a mark too small
 * for a row (the dot of an i, an accent, a vowel sign) becomes one dot.
 * Any weight works; the thinnest weight of a face gives the most even
 * rows. The PDF keeps the text, invisible, under the dots (search, copy,
 * tagging). The dots take the text colour.
 */
export interface TextDotsStyle {
  /** Distance between the centres of two dots along a stroke (em = the
   *  text size). Default `0.1em`. */
  spacing?: Dimension;
  /** Diameter of a dot. Default `0.05em`. */
  size?: Dimension;
}

/** A design text set again after itself along its line (#1017): a row of
 *  copies of a word to trace, a band of a repeated name. */
export interface DesignTextRepeat {
  /** Room between two copies. Default `1em`. */
  gap?: Dimension;
  /** At most this many copies, the first included. Default: as many whole
   *  copies as fit in the element's room. */
  count?: number;
}

/** Outline drawn around the glyphs of a design text (a hollow display
 *  number, a title that stands off a photograph). */
export interface DesignTextStroke {
  /** Line width of the outline, centred on the glyph edges: half of it
   *  falls inside the letters, half outside. The measured text width does
   *  not grow with it. `0` draws no outline. */
  width: Dimension;
  /** Outline colour. Default: the text colour. */
  color?: ColorValue;
  /** Leave the inside of the letters unpainted, so only the outline shows.
   *  Default `false` (the letters are filled, then outlined). */
  hollow?: boolean;
}
