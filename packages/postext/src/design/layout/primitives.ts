// What a laid-out design slot is made of: the resolved primitives, slot
// layout, issues and layout context, image alt text, page parity and role
// tests, and palette overrides (#1276: split out of layout.ts).
import type { DesignTextAlign, VAlign, Resource, PageRole, PageParity, PageRoleFilter, ColorValue, ElementBoxStyle, ResolvedDesignElement } from '../../types.js';
import type { VDTDesignBoxStyle, VDTPathCommand, VDTPathStroke, VDTPathMarker } from '../../vdt.js';
import { parseInlineSnippetSpans } from '../../parse/inlineSnippet.js';
import type { InlineSpan } from '../../parse/types.js';
import type { DesignPlaceholderContext } from '../placeholders.js';
import type { DesignTextRun } from '../richText.js';

/** A line of wrapped text with its measured width and baseline offset. */
export interface WrappedLine {
  text: string;
  width: number;
  /** Extra left offset of the line inside the content box (a paragraph's
   *  first-line indent, the room a drop cap takes). Default 0. */
  xOffset?: number;
  /** Vertical offset of the baseline from the top of the text content box. */
  baselineY: number;
  /** Y offset of the line top within the element's content box. */
  topY: number;
  /** Line-box height (lineHeight * fontSize). */
  height: number;
  /** Present when the line mixes fonts (inline marks) or is justified: the
   *  runs painted one after another from the line's start instead of
   *  `text`. */
  runs?: DesignTextRun[];
  /** A justified line: the px added to each of its word spaces (the runs'
   *  widths include it). */
  wordSpacingPx?: number;
  /** The order to paint `runs` in, when it is not their own (see
   *  `VDTDesignTextLine.order`). */
  order?: number[];
  /** A word of a joining script wider than the room runs past it (see
   *  `VDTDesignTextLine.wordOverflow`). */
  wordOverflow?: true;
  /** The line ends in a piece of a word wider than the room, cut at a
   *  syllable or between two characters (`VDTDesignTextLine.wordDivided`,
   *  #1150). */
  wordDivided?: 'syllable' | 'character';
}

export interface ResolvedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ResolvedElementBox {
  backgroundColor?: string;
  borderColor?: string;
  borderWidthPx: number;
  borderRadiusPx: number;
  /** One radius per corner (#1059), when the corners differ. */
  borderRadiiPx?: [number, number, number, number];
  /** The border per side (#1059), when the sides differ. */
  borderSides?: VDTDesignBoxStyle['borderSides'];
  padding: ResolvedPadding;
}

/** Resolved geometry for a single element in a design slot. */
export interface ResolvedElementGeometry {
  id: string;
  kind: 'text' | 'rule' | 'box' | 'image' | 'path';
  /** Absolute page-space rectangle (the element's outer box). */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ResolvedTextPrimitive extends ResolvedElementGeometry {
  kind: 'text';
  lines: WrappedLine[];
  fontString: string;
  fontSizePx: number;
  color: string;
  align: DesignTextAlign;
  verticalAlign: VAlign;
  /** Whether the element needs a clip rect during rendering. */
  needsClip: boolean;
  /** The drop cap of a text element (a primitive of its own, after the
   *  text's): in a heading design its box reserves nothing below the text's
   *  (EF-108). */
  dropCap?: boolean;
  /** Tracking after every glyph, in px; 0 when the element sets none. */
  letterSpacingPx: number;
  /** The text's base direction when it is right to left (see
   *  `VDTDesignTextBlock.direction`). */
  direction?: 'rtl';
  /** The text starts on the right of its box: a right-to-left text on the
   *  sheet, or a left-to-right one in a mirrored flow. `'start'`, `'end'`
   *  and the flush last line of `'justify'` follow it. */
  startRight?: true;
  /** Outline stroked over the glyphs; absent when the element sets none. */
  stroke?: { widthPx: number; color: string; hollow?: boolean };
  /** Letters painted as dots to trace; absent when the element sets none. */
  dotted?: { spacingPx: number; sizePx: number };
  /** Content box (inside padding) offsets, relative to element x/y. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  box?: ResolvedElementBox;
  /** A line was cut to fit: by an ellipsis, or clipped with ink wider than
   *  the box (#628). Absent when every line shows whole. */
  truncated?: TextTruncation;
  /** Set vertically (`DesignTextElement.writingMode: 'vertical-rl'`): `x`,
   *  `y`, `width`, `height` are the box as it stands, every other number
   *  (the lines, the content box) is in the box's own frame turned a
   *  quarter turn clockwise, where a line runs along `width` = the box's
   *  height and its baselines are measured from the box's right edge. */
  vertical?: true;
}

export interface ResolvedRulePrimitive extends ResolvedElementGeometry {
  kind: 'rule';
  direction: 'horizontal' | 'vertical';
  color: string;
  thicknessPx: number;
}

export interface ResolvedBoxPrimitive extends ResolvedElementGeometry {
  kind: 'box';
  box: ResolvedElementBox;
}

/** A path element laid on its box (#1060): the outline in page px. Its
 *  `x`/`y`/`width`/`height` are the element's box (what other elements
 *  anchor to and what a heading design reserves), not the ink's. */
export interface ResolvedPathPrimitive extends ResolvedElementGeometry {
  kind: 'path';
  subpaths: VDTPathCommand[][];
  fill?: string;
  stroke?: VDTPathStroke;
  /** A connector's end marks (#1056). */
  markers?: VDTPathMarker[];
  /** A connector painted over the frames (#1076). */
  over?: true;
}

/** An image element resolved to its resource payload. Only emitted when
 *  the resource exists and carries a bitmap / SVG file. */
export interface ResolvedImagePrimitive extends ResolvedElementGeometry {
  kind: 'image';
  /** Out-of-band binary id of the resource image. */
  fileId: string;
  /** Bitmap format when known (`'png'`, `'jpeg'`, …). */
  format?: string;
  /** Bitmap or SVG, and an SVG's print master (see `pictureTraits`). */
  imageKind?: 'bitmap' | 'svg';
  pdfFileId?: string;
  /** Laid out in a vertical flow: the box's width runs down the sheet, and
   *  it was sized for the picture turned back upright (see
   *  `DesignFrames.upright`). */
  upright?: true;
  /** The picture's alternative text: its resource's `altText`, else its
   *  caption as plain text; absent for a `decorative` element or a
   *  resource with neither. */
  altText?: string;
  /** The part of the picture shown (a `fit: 'cover'` crop, #923). */
  crop?: { x: number; y: number; width: number; height: number };
}

/** Placeholder characters the snippet parser leaves in span text (private
 *  use, the object replacement character, the invisible separator and
 *  plus of references and swatches): nothing a reader can read. */
const PLACEHOLDER_RE = /[\uE000-\uF8FF\uFFFC\u2063\u2064]/g;

/** The words of caption spans as a reader reads them: a chip's label, a
 *  reference's own text (`:ref{… text="…"}`; its number is not known
 *  here), nothing for a swatch or a note marker. */
function spansReadText(spans: readonly InlineSpan[]): string {
  let out = '';
  for (const s of spans) {
    if (s.chip) out += spansReadText(s.chip.spans);
    else if (s.ref) out += s.ref.text ?? '';
    // A formula reads as its TeX, between its dollars (#541).
    else if (s.math) out += `$${s.math.tex}$`;
    else if (s.swatch || s.footnote) continue;
    else out += s.text;
  }
  return out.replace(PLACEHOLDER_RE, '');
}

/** The alternative text of a resource drawn by a design (#213): its
 *  `altText`, else its caption as plain text (inline formatting read,
 *  a chip by its label, forced line breaks as spaces, placeholders left
 *  out, a formula as its TeX between dollars). Undefined when it has
 *  neither. */
export function designImageAltText(resource: Resource | undefined): string | undefined {
  const alt = resource?.altText?.trim();
  if (alt) return alt;
  const caption = resource?.caption?.trim();
  if (!caption) return undefined;
  // Runs of breaking whitespace become one space; an ideographic space
  // stays.
  const text = spansReadText(parseInlineSnippetSpans(caption))
    .replace(/\u2028/g, ' ').replace(/[^\S\u3000]+/g, ' ').trim();
  return text || undefined;
}

export type ResolvedPrimitive =
  | ResolvedTextPrimitive
  | ResolvedRulePrimitive
  | ResolvedBoxPrimitive
  | ResolvedImagePrimitive
  | ResolvedPathPrimitive;

export interface DesignSlotLayout {
  /** Container bbox passed in (absolute page coordinates). */
  container: { x: number; y: number; width: number; height: number };
  primitives: ResolvedPrimitive[];
  /** Id of the element each primitive comes from (a text element's drop
   *  cap is a primitive of its own), parallel to `primitives`. */
  elementIds: string[];
  /** Elements flagged with cyclic anchor graph or dangling references. */
  issues: LayoutIssue[];
}

/** How a design text lost part of a line (#628): cut with an ellipsis, or
 *  clipped with ink past its box. */
export type TextTruncation = 'ellipsis-start' | 'ellipsis-end' | 'ellipsis-middle' | 'clip';

export type LayoutIssue =
  | { kind: 'cyclicAnchor' | 'danglingAnchor'; elementId: string; targetId?: string }
  /** A text element did not fit its width and was cut (`mode`); `text` is
   *  the whole text it was given (placeholders filled). */
  | { kind: 'textTruncated'; elementId: string; mode: TextTruncation; text: string }
  /** A connector's end (#1056) on a box the page does not have (`targetId`,
   *  a frame collapsed, empty and optional, or missing): left out, and
   *  with `from` or every `to` gone the connector is not drawn. */
  | { kind: 'connectorDropped'; elementId: string; targetId: string }
  /** A connector's end (#1057) at an anchor no picture of its frame has:
   *  left out. `resourceId` is the frame's first picture (absent: it holds
   *  none) and `known` that picture's anchors. */
  | { kind: 'connectorAnchorUnknown'; elementId: string; targetId: string; anchor: string; resourceId?: string; known: string[] };

/** Page-level reference frames (absolute page px) that elements may anchor
 *  to instead of the slot container: `page` is the trim box, `bleed` the
 *  trim box grown by the bleed (equal to `page` when cut lines are off). */
export interface DesignFrames {
  page: { x: number; y: number; width: number; height: number };
  bleed: { x: number; y: number; width: number; height: number };
  /** The page's outer margin, for `anchor.to: 'outer'` (header and footer
   *  slots): between the type area and the trim edge away from the spine,
   *  from the type area's head to its foot. */
  outer?: { x: number; y: number; width: number; height: number };
  /** The frames of a vertical page's flow (`VDTPage.flow`): a picture
   *  stands upright on the sheet, so its box in the flow is sized with the
   *  picture's width and height swapped (`ResolvedImagePrimitive.upright`). */
  upright?: boolean;
  /** Boxes outside the slot an element may anchor to as `'#name'`, with
   *  the element-to-element edges: the frames of a composed page for its
   *  template's decoration (#855). An element of the slot with the same id
   *  wins. */
  named?: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
  /** The same frames' boxes as their template declares them, before
   *  groups and content move them (#856): an element with `pin` anchors
   *  here. Absent: `named`. */
  declared?: Readonly<Record<string, { x: number; y: number; width: number; height: number }>>;
  /** Frames in `named` the page shows nothing of (#1056): collapsed, or
   *  empty and optional. A connector's end on one is dropped. */
  absent?: ReadonlySet<string>;
  /** The point of anchor `anchor` of the picture frame `frame` holds
   *  (#1057), on the sheet as `named` is: the first figure of the frame's
   *  blocks whose resource has it; `hidden` when the frame cuts that point
   *  off. When none has it, what the frame holds instead (its first
   *  picture and that picture's anchors). */
  anchorPoint?: (frame: string, anchor: string) => { x: number; y: number } | { hidden: true } | { resourceId?: string; known: string[] };
}

export interface LayoutContext {
  container: { x: number; y: number; width: number; height: number };
  dpi: number;
  placeholders: DesignPlaceholderContext;
  /** Page/bleed frames for `anchor.to: 'page' | 'bleed'`. When absent those
   *  anchors fall back to the container. */
  frames?: DesignFrames;
  /** Role of the page being laid out, for the per-element `pages` filter.
   *  When absent every element passes the filter. */
  pageRole?: PageRole;
  /** Resources by id, for `kind: 'image'` elements. Without it (or for an
   *  unknown id) an image element is skipped. */
  resourceById?: ReadonlyMap<string, Resource>;
  /** The document's base direction (`ResolvedConfig.direction`), the
   *  default of every text element's. Absent: left to right. */
  direction?: 'ltr' | 'rtl';
  /** Start and end edges (`top-start`, `align-end`…, #936) read the start
   *  on the right: a slot laid on the sheet of a right-to-left or vertical
   *  page. Absent: on the left (a left-to-right page, or a slot laid in a
   *  page's flow, which is mirrored or turned already). */
  startRight?: boolean;
  /** The slot is painted in the flow of a mirrored (right-to-left) page:
   *  its x axis runs from the sheet's right edge, so the runs of a line go
   *  in the reverse of their visual order (see `design/bidiText.ts`). */
  mirrored?: boolean;
  /** The document is set right to left in the Arabic script
   *  (`arabicNumbersOf`): a number that opens a text reads as an Arabic
   *  one (`BidiOptions.arabicNumbers`, #665). */
  arabicNumbers?: boolean;
  /** Attributes some elements read before the page fence's, by element id
   *  (#1189): a module's elements read its `:::module` fence, for
   *  `{attr.x}` and `when` / `unless`. */
  elementAttrs?: ReadonlyMap<string, Readonly<Record<string, string>>>;
}

export function pageMatchesParity(pageIndex: number, parity: PageParity): boolean {
  if (parity === 'all') return true;
  const pageNumber = pageIndex + 1;
  const isOdd = pageNumber % 2 === 1;
  return parity === 'odd' ? isOdd : !isOdd;
}

/** Whether an element with page filter `filter` renders on a page of role
 *  `role`. An unknown role (not yet classified) admits everything. */
export function pageMatchesRole(filter: PageRoleFilter | undefined, role: PageRole | undefined): boolean {
  if (filter === undefined || filter === 'all') return true;
  if (role === undefined) return true;
  return filter === role;
}

export function colorHex(c: ColorValue | undefined): string {
  return c?.hex ?? '#000000';
}

/** `c` with its hex replaced when its `paletteId` is overridden. */
function overrideColor(c: ColorValue | undefined, overrides: Record<string, string>): ColorValue | undefined {
  if (!c?.paletteId) return c;
  const hex = overrides[c.paletteId];
  return hex ? { ...c, hex } : c;
}

function overrideBoxStyle(style: ElementBoxStyle | undefined, overrides: Record<string, string>): ElementBoxStyle | undefined {
  if (!style) return style;
  const sides = style.borderSides;
  return {
    ...style,
    backgroundColor: overrideColor(style.backgroundColor, overrides),
    borderColor: overrideColor(style.borderColor, overrides),
    // Each side's own colour too (#1059).
    ...(sides && typeof sides === 'object'
      ? {
          borderSides: Object.fromEntries(
            Object.entries(sides).map(([k, v]) => [k, v && typeof v === 'object' && v.color ? { ...v, color: overrideColor(v.color, overrides) } : v]),
          ) as ElementBoxStyle['borderSides'],
        }
      : {}),
  };
}

/** The element with every palette-linked colour (text colour, rule colour,
 *  box background / border, outline, drop cap) that a `:::part` overrides taking the part's
 *  value — how a section recolours the running heads and opener bands of
 *  its pages without a second design. */
export function applyPaletteOverrides(el: ResolvedDesignElement, overrides: Record<string, string>): ResolvedDesignElement {
  switch (el.kind) {
    case 'text':
      return {
        ...el,
        color: overrideColor(el.color, overrides) ?? el.color,
        box: overrideBoxStyle(el.box, overrides),
        ...(el.stroke ? { stroke: { ...el.stroke, color: overrideColor(el.stroke.color, overrides) } } : {}),
        // The drop cap's own colour follows the palette too (EF-107).
        ...(el.dropCap?.color ? { dropCap: { ...el.dropCap, color: overrideColor(el.dropCap.color, overrides) } } : {}),
      };
    case 'rule':
      return { ...el, color: overrideColor(el.color, overrides) ?? el.color };
    case 'box':
      return { ...el, style: overrideBoxStyle(el.style, overrides) ?? el.style };
    case 'path':
      return {
        ...el,
        ...(el.fill ? { fill: overrideColor(el.fill, overrides) } : {}),
        ...(el.stroke ? { stroke: overrideColor(el.stroke, overrides) } : {}),
      };
    case 'connector':
      return { ...el, color: overrideColor(el.color, overrides) ?? el.color };
    default:
      return el;
  }
}
