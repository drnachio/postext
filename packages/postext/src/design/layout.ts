import { flowTextWidth, getMeasureWritingMode, lineBaselineOffset, withMeasureWritingMode } from '../measure/vertical.js';
import { edgeSide, isLogicalEdge, physicalEdge, physicalPlacement, sideFraction } from './logicalEdges.js';
import { bitmapLayoutSize } from '../bitmapResolution.js';
import { comicArtCrop } from '../comics/art.js';
import type {
  AnchorEdge,
  ColorValue,
  DesignTextAlign,
  Dimension,
  ElementBoxStyle,
  ElementPlacement,
  ElementSize,
  ElementSizeTo,
  PageParity,
  PageRole,
  PageRoleFilter,
  ResolvedDesignBoxElement,
  ResolvedDesignConnectorElement,
  ResolvedDesignElement,
  ResolvedDesignImageElement,
  ResolvedDesignPathElement,
  ResolvedDesignRuleElement,
  ResolvedDesignSlot,
  ResolvedPlacedDesignElement,
  ResolvedDesignTextElement,
  ResolvedChipStyleConfig,
  Resource,
  TextOverflow,
  VAlign,
} from '../types.js';
import { dimensionToPx } from '../units.js';
import { borderSidesPx, cornerRadiiPx, isCornerRadii, normalizeBoxStyle, uniformRadius } from './boxShape.js';
import { resolveTextDots } from '../textDots.js';
import { resolveDesignLineHeight } from '../defaults/headerFooter.js';
import { createBoundingBox, pictureTraits, type BoundingBox, type VDTDesignBoxStyle, type VDTPathCommand, type VDTPathMarker, type VDTPathStroke } from '../vdt.js';
import { mapPath, parseSvgPathCached, pathViewBox } from './svgPath.js';
import { buildFontString } from '../measure/index.js';
import { graphemeCount } from '../measure/graphemes.js';
import { joiningScriptIn } from '../measure/joining.js';
import { parseInlineSnippetSpans } from '../parse/inlineSnippet.js';
import type { InlineSpan } from '../parse/types.js';
import { getHyphenationRulesKey, hyphenateByDictionary, hyphenateText, withoutEdgeSoftHyphens, withoutSlashJoints } from '../hyphenate.js';
import { withLineEndHyphen } from '../measure/geminate.js';
import { BREAKING_SPACE_RUNS_SPLIT_RE, NO_BREAK_SPACES, isBreakingSpaceRun } from '../measure/spaces.js';
import {
  LEADER_MARK,
  resolveDesignResourceId,
  resolveDesignText,
  type DesignLeader,
  type DesignPlaceholderContext,
} from './placeholders.js';
import { fitLeader } from '../measure/leader.js';
import { layoutConnector, type ConnectorEndBox } from './connector.js';
import { FENCE_CONDITION_CONTEXTS, fenceConditionMet } from './fenceCondition.js';
import { repeatInstance } from '../composed/templates.js';
import { hasJoiningScript, joinsWithNext } from '../bidi.js';
import { designBaseDirection, directRuns, directedTextWidth, measuresRunsAsPainted, paintedRunWidth } from './bidiText.js';
import { composeCjkDesignParagraph, composesDesignAsCjk, type CjkDesignFonts } from './cjkText.js';
import { getCjkComposition } from '../measure/cjkPunctuation.js';
import {
  RichMeasurer,
  ellipsisEndCut,
  ellipsisMiddleCut,
  ellipsisStartCut,
  parseRichDesignText,
  plainDesignText,
  richDesignSpans,
  richFontSet,
  singleRichLine,
  wrapRich,
  type DesignTextRun,
  type RichLine,
} from './richText.js';

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

function dimPx(d: Dimension | undefined, dpi: number, baseFontSizePx?: number): number {
  if (!d) return 0;
  return dimensionToPx(d, dpi, baseFontSizePx);
}

function resolvePadding(
  padding: ElementBoxStyle['padding'],
  dpi: number,
  baseFontSizePx?: number,
): ResolvedPadding {
  return {
    top: dimPx(padding?.top, dpi, baseFontSizePx),
    right: dimPx(padding?.right, dpi, baseFontSizePx),
    bottom: dimPx(padding?.bottom, dpi, baseFontSizePx),
    left: dimPx(padding?.left, dpi, baseFontSizePx),
  };
}

function resolveBox(
  style: ElementBoxStyle | undefined,
  dpi: number,
  baseFontSizePx?: number,
): ResolvedElementBox | undefined {
  if (!style) return undefined;
  const padding = resolvePadding(style.padding, dpi, baseFontSizePx);
  if (!isCornerRadii(style.borderRadius) && style.borderSides === undefined) {
    return {
      backgroundColor: style.backgroundColor?.hex,
      borderColor: style.borderColor?.hex,
      borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
      borderRadiusPx: dimPx(uniformRadius(style.borderRadius), dpi, baseFontSizePx),
      padding,
    };
  }
  // Corners of their own and a border per side (#1059), folded back to
  // the plain fields where they say no more.
  const toPx = (d: Dimension) => dimPx(d, dpi, baseFontSizePx);
  const whole = { enabled: true, color: style.borderColor, width: style.borderWidth };
  const shape = normalizeBoxStyle({
    backgroundColor: style.backgroundColor?.hex,
    borderColor: style.borderColor?.hex,
    borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
    borderRadiusPx: 0,
    borderRadiiPx: cornerRadiiPx(style.borderRadius, toPx),
    ...(style.borderSides !== undefined ? { borderSides: borderSidesPx(whole, style.borderSides, toPx) } : {}),
  });
  return { ...shape, padding };
}

function colorHex(c: ColorValue | undefined): string {
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

// ---------------------------------------------------------------------------
// Anchor dependency graph
// ---------------------------------------------------------------------------

function anchorTargetId(placement: ElementPlacement): string | undefined {
  const to = placement.anchor.to;
  if (to === 'container' || to === 'page' || to === 'bleed' || to === 'outer') return undefined;
  return to.slice(1);
}

/** The elements a placement's sizes run to (`{ to: '#id', edge }`, #928). */
function sizeTargetIds(placement: ElementPlacement): string[] {
  const size = placement.size;
  if (!size) return [];
  const out: string[] = [];
  for (const v of [size.width, size.height, size.maxWidth]) {
    if (typeof v === 'object' && v !== null && 'to' in v && typeof v.to === 'string' && v.to.startsWith('#')) out.push(v.to.slice(1));
  }
  return out;
}

/** The page-level frame an element anchors to, or `undefined` for
 *  container / element anchors (and when no frames were supplied). */
function frameFor(placement: ElementPlacement, frames: DesignFrames | undefined): AnchorReference | undefined {
  if (!frames) return undefined;
  const to = placement.anchor.to;
  if (to === 'page') return frames.page;
  if (to === 'bleed') return frames.bleed;
  if (to === 'outer') return frames.outer;
  return undefined;
}

function topoSort(
  elements: ResolvedPlacedDesignElement[],
  issues: LayoutIssue[],
  named?: DesignFrames['named'],
): ResolvedPlacedDesignElement[] {
  const byId = new Map<string, ResolvedPlacedDesignElement>();
  for (const el of elements) byId.set(el.id, el);

  // Detect dangling
  for (const el of elements) {
    const target = anchorTargetId(el.placement);
    if (target && !byId.has(target) && !named?.[target]) {
      issues.push({ kind: 'danglingAnchor', elementId: el.id, targetId: target });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: ResolvedPlacedDesignElement[] = [];

  function visit(el: ResolvedPlacedDesignElement, path: string[]): void {
    if (visited.has(el.id)) return;
    if (visiting.has(el.id)) {
      issues.push({ kind: 'cyclicAnchor', elementId: el.id });
      return;
    }
    visiting.add(el.id);
    const target = anchorTargetId(el.placement);
    if (target) {
      const dep = byId.get(target);
      if (dep) visit(dep, [...path, el.id]);
    }
    // An element whose size runs to another's edge (#928) comes after it.
    for (const id of sizeTargetIds(el.placement)) {
      const dep = byId.get(id);
      if (dep && dep !== el) visit(dep, [...path, el.id]);
    }
    visiting.delete(el.id);
    visited.add(el.id);
    out.push(el);
  }

  for (const el of elements) visit(el, []);
  return out;
}

// ---------------------------------------------------------------------------
// Anchor edge resolution — compute (anchorX, anchorY) and which element edge
// sits at that anchor. The element's extent grows from that anchor point.
// ---------------------------------------------------------------------------

interface AnchorReference {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Pin = 'start' | 'middle' | 'end';

interface AnchorResult {
  /** Anchor point on the reference (absolute coordinates). */
  anchorX: number;
  anchorY: number;
  /** How the element aligns against the anchor. `start` = anchor is at element's
   *  top/left edge; `end` = anchor at bottom/right; `middle` = centered. */
  pinX: Pin;
  pinY: Pin;
}

function resolveContainerAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  // Container-relative nine-point grid: pin the corresponding corner of the
  // element to the corresponding point of the container.
  switch (edge) {
    case 'top-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'top':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y, pinX: 'middle', pinY: 'start' };
    case 'top-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height / 2, pinX: 'start', pinY: 'middle' };
    case 'center':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height / 2, pinX: 'middle', pinY: 'middle' };
    case 'right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height / 2, pinX: 'end', pinY: 'middle' };
    case 'bottom-left':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'bottom':
      return { anchorX: ref.x + ref.width / 2, anchorY: ref.y + ref.height, pinX: 'middle', pinY: 'end' };
    case 'bottom-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y + ref.height, pinX: 'end', pinY: 'end' };
    default:
      // Fallback when an element-to-element edge was set with anchor.to = 'container'.
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

const ELEMENT_TO_ELEMENT_EDGES: ReadonlySet<string> = new Set(['right-of', 'left-of', 'below', 'above', 'align-top', 'align-bottom', 'align-left', 'align-right']);

function resolveElementAnchor(
  edge: AnchorEdge,
  ref: AnchorReference,
): AnchorResult {
  switch (edge) {
    case 'right-of':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'left-of':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    case 'below':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'start' };
    case 'above':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'end' };
    case 'align-top':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-bottom':
      return { anchorX: ref.x, anchorY: ref.y + ref.height, pinX: 'start', pinY: 'end' };
    case 'align-left':
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
    case 'align-right':
      return { anchorX: ref.x + ref.width, anchorY: ref.y, pinX: 'end', pinY: 'start' };
    default:
      // Fallback when a container edge was set with anchor.to = '#id' — treat
      // as align-top (match target's top-left).
      return { anchorX: ref.x, anchorY: ref.y, pinX: 'start', pinY: 'start' };
  }
}

// ---------------------------------------------------------------------------
// Text layout — wrap / ellipsis / clip
// ---------------------------------------------------------------------------

/** Width of a run of text in the element's font, tracking included. */
type TextMeasure = (text: string) => number;

/** How far a text's lines move down from the top of its content box
 *  (`contentHeight` tall) for `verticalAlign`. Lines taller than the box
 *  run out on the side the alignment leaves free, as CSS flex alignment
 *  does: upwards for `'bottom'`, both ways for `'middle'` (EF-138; up to
 *  postext 1.4 they always hung from the top). */
export function textVerticalOffset(
  verticalAlign: VAlign,
  contentHeight: number,
  lines: readonly { topY: number; height: number }[],
): number {
  const linesHeight = lines.reduce((s, l) => Math.max(s, l.topY + l.height), 0);
  if (verticalAlign === 'top') return 0;
  if (verticalAlign === 'bottom') return contentHeight - linesHeight;
  return (contentHeight - linesHeight) / 2;
}

/** The tracking a line's measured width carries after its last glyph: the
 *  element's `letterSpacingPx` when the line holds any text. Canvas, CSS and
 *  PDF all add it after every character, the last one included; it is
 *  advance, not ink, so alignment leaves it out (EF-153). */
export function trailingTracking(text: string, letterSpacingPx: number): number {
  return letterSpacingPx !== 0 && text.length > 0 ? letterSpacingPx : 0;
}

function ellipsize(
  text: string,
  measure: TextMeasure,
  maxWidth: number,
  mode: 'start' | 'end' | 'middle',
): string {
  const ellipsis = '…';
  if (measure(text) <= maxWidth) return text;
  const ellipsisWidth = measure(ellipsis);
  if (ellipsisWidth > maxWidth) return '';
  const budget = maxWidth - ellipsisWidth;
  if (mode === 'end') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measure(text.slice(0, mid)) <= budget) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    // At a word boundary, without the space before the ellipsis (EF-76).
    return text.slice(0, ellipsisEndCut(text, 0, text.length, lo)) + ellipsis;
  }
  if (mode === 'start') {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (measure(text.slice(mid)) <= budget) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ellipsis + text.slice(ellipsisStartCut(text, 0, text.length, lo));
  }
  // middle
  let leftLen = 0;
  let rightLen = 0;
  while (true) {
    const candidate = text.slice(0, leftLen + 1) + text.slice(text.length - rightLen);
    if (measure(candidate) + ellipsisWidth > maxWidth) break;
    leftLen++;
    if (leftLen + rightLen >= text.length) break;
    const candidate2 = text.slice(0, leftLen) + text.slice(text.length - (rightLen + 1));
    if (measure(candidate2) + ellipsisWidth > maxWidth) break;
    rightLen++;
    if (leftLen + rightLen >= text.length) break;
  }
  const kept = ellipsisMiddleCut(text, 0, text.length, leftLen, rightLen);
  return text.slice(0, kept.left) + ellipsis + text.slice(text.length - kept.right);
}

const SOFT_HYPHEN = '\u00AD';

function breakWordWithHyphenation(
  word: string,
  measure: TextMeasure,
  maxWidth: number,
  useHyphenation: boolean,
): { head: string; tail: string; divided?: 'syllable' | 'character' } | undefined {
  // Returns a split of the word where head (with trailing hyphen if hyphenated)
  // fits in maxWidth. Returns undefined if no split is possible. `divided`:
  // how the word was cut (#1150), absent for a cut at a no-break space.
  // A group glued by no-break spaces ("Fig. 3") parts at the last of them
  // that leaves a head that fits, before any syllable or character (EF-66).
  for (let i = word.length - 2; i >= 1; i--) {
    if (!NO_BREAK_SPACES.includes(word[i]!) || NO_BREAK_SPACES.includes(word[i - 1]!)) continue;
    if (measure(word.slice(0, i)) <= maxWidth) return { head: word.slice(0, i), tail: word.slice(i + 1) };
  }
  // A word of a joining script (Arabic) is never hyphenated or cut: it runs
  // past the line, whole.
  if (hasJoiningScript(word)) return undefined;
  if (useHyphenation) {
    // Syllables only: the slash joints would ride along into the pieces.
    // A word the document's rules keep whole is divided at the dictionary's
    // syllables when no point of its own fits (#699).
    for (const divide of getHyphenationRulesKey() === '' ? [hyphenateText] : [hyphenateText, hyphenateByDictionary]) {
      // A soft hyphen typed at the word's edge or next to punctuation is no
      // break (#700).
      const hy = withoutEdgeSoftHyphens(word, withoutSlashJoints(word, divide(word)));
      if (!hy.includes(SOFT_HYPHEN)) continue;
      const parts = hy.split(SOFT_HYPHEN);
      let best: { head: string; tail: string } | undefined;
      for (let i = 1; i < parts.length; i++) {
        const headRaw = parts.slice(0, i).join('');
        const tailRaw = parts.slice(i).join('');
        const headWithHyphen = withLineEndHyphen(headRaw);
        if (measure(headWithHyphen) <= maxWidth) {
          best = { head: headWithHyphen, tail: tailRaw };
        } else {
          break;
        }
      }
      if (best) return { ...best, divided: 'syllable' };
    }
  }
  // Last-resort character break so text never overflows when it can't fit.
  let lo = 1;
  let hi = word.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(word.slice(0, mid)) <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo < 1) return undefined;
  return { head: word.slice(0, lo), tail: word.slice(lo), ...(lo < word.length ? { divided: 'character' as const } : {}) };
}

function wrapToWidth(
  text: string,
  measure: TextMeasure,
  maxWidth: number,
  hyphenate: boolean,
  /** Filled by line index: how the line's last word was cut (#1150). */
  cuts?: ('syllable' | 'character' | undefined)[],
): string[] {
  // Greedy word wrap; preserves existing line breaks.
  const paragraphs = text.split('\n');
  const out: string[] = [];
  for (const para of paragraphs) {
    // Words part at breaking spaces only: a no-break space glues (EF-66).
    const words = para.split(BREAKING_SPACE_RUNS_SPLIT_RE);
    let current = '';
    for (const part of words) {
      const test = current + part;
      if (measure(test) <= maxWidth || (current.length === 0 && (part === '' || isBreakingSpaceRun(part)))) {
        current = test;
      } else if (current.length === 0) {
        // Single word doesn't fit — try hyphenation / char break.
        let remaining = part;
        while (remaining.length > 0) {
          if (measure(remaining) <= maxWidth) {
            current = remaining;
            break;
          }
          const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
          if (!split || split.head.length === 0) {
            current = remaining;
            break;
          }
          out.push(split.head);
          if (cuts) cuts[out.length - 1] = split.divided;
          remaining = split.tail;
        }
      } else {
        out.push(current.trimEnd());
        // New line starts with this part; if the part itself doesn't fit, split it.
        const trimmed = part.replace(/^\s+/, '');
        if (measure(trimmed) <= maxWidth) {
          current = trimmed;
        } else {
          let remaining = trimmed;
          current = '';
          while (remaining.length > 0) {
            if (measure(remaining) <= maxWidth) {
              current = remaining;
              break;
            }
            const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
            if (!split || split.head.length === 0) {
              current = remaining;
              break;
            }
            out.push(split.head);
            if (cuts) cuts[out.length - 1] = split.divided;
            remaining = split.tail;
          }
        }
      }
    }
    if (current.length > 0) out.push(current.trimEnd());
    else out.push('');
  }
  return out.length > 0 ? out : [''];
}

interface TextMeasurement {
  lines: WrappedLine[];
  contentWidth: number;
  contentHeight: number;
  needsClip: boolean;
  /** A line lost characters to an ellipsis, or is wider than the room a
   *  clip leaves it. */
  truncated?: boolean;
}

/** How much wider than its room a clipped line may be before it counts as
 *  cut: rounding, not a hidden glyph. */
const CLIP_SLACK_PX = 0.5;

/** Lines stacked from the top of the content box, `lineHeightPx` apart. */
function stackLines(rows: { text: string; width: number; runs?: DesignTextRun[]; wordDivided?: 'syllable' | 'character' }[], lineHeightPx: number): WrappedLine[] {
  return rows.map((r, i) => ({
    text: r.text,
    width: r.width,
    topY: i * lineHeightPx,
    baselineY: i * lineHeightPx + lineHeightPx * 0.8,
    height: lineHeightPx,
    ...(r.runs ? { runs: r.runs } : {}),
    ...(r.wordDivided ? { wordDivided: r.wordDivided } : {}),
  }));
}

/** Lay out a plain text. A newline always starts a new line; `overflow`
 *  decides what happens to a line wider than `maxContentWidth`: wrap onto
 *  more lines, or stay one line that is truncated (`ellipsis-*`) or clipped
 *  by the renderer (`clip`). */
function layoutText(
  text: string,
  measure: TextMeasure,
  lineHeightPx: number,
  overflow: TextOverflow,
  /** When not undefined, constrains text width. Otherwise measure natural. */
  maxContentWidth: number | undefined,
  hyphenate: boolean | undefined,
): TextMeasurement {
  if (maxContentWidth !== undefined && overflow === 'wrap') {
    const cuts: Parameters<typeof wrapToWidth>[4] = [];
    const lines = wrapToWidth(text, measure, maxContentWidth, hyphenate ?? false, cuts);
    const wrapped = stackLines(lines.map((t, i) => ({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) })), lineHeightPx);
    const w = wrapped.reduce((m, l) => Math.max(m, l.width), 0);
    return {
      lines: wrapped,
      contentWidth: w,
      contentHeight: wrapped.length * lineHeightPx,
      needsClip: false,
    };
  }
  const rows = text.split('\n');
  if (maxContentWidth === undefined || overflow === 'clip') {
    // Natural lines (clipped to the box by the renderer for `clip`).
    const lines = stackLines(rows.map((t) => ({ text: t, width: measure(t) })), lineHeightPx);
    const natural = lines.reduce((m, l) => Math.max(m, l.width), 0);
    return {
      lines,
      contentWidth: maxContentWidth === undefined ? natural : Math.min(natural, maxContentWidth),
      contentHeight: lines.length * lineHeightPx,
      needsClip: maxContentWidth !== undefined,
      ...(maxContentWidth !== undefined && natural > maxContentWidth + CLIP_SLACK_PX ? { truncated: true } : {}),
    };
  }
  // ellipsis-*
  const mode: 'start' | 'end' | 'middle' =
    overflow === 'ellipsis-start' ? 'start'
    : overflow === 'ellipsis-middle' ? 'middle'
    : 'end';
  let truncated = false;
  const lines = stackLines(rows.map((t) => {
    const visible = ellipsize(t, measure, maxContentWidth, mode);
    if (visible !== t) truncated = true;
    return { text: visible, width: measure(visible) };
  }), lineHeightPx);
  return {
    lines,
    contentWidth: lines.reduce((m, l) => Math.max(m, l.width), 0),
    contentHeight: lines.length * lineHeightPx,
    needsClip: false,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** The placeholders that mirror text from the document: a title, a
 *  frontmatter value, an attribute, a running mark. */
const MIRRORED_PLACEHOLDER_RE = /\{(?:titleText|chapterTitle|chapterTitleAtTop|partTitle|title|subtitle|author|(?:attr|firstMark|lastMark)\.[^{}]+)\}/g;

/**
 * Where the texts a design text mirrors from the document start and end
 * in the text it prints (#724): offsets into the printed text with its
 * inline marks dropped, the text the composer sets. A number the layout
 * wrote next to such a text (`{number}{titleText}`,
 * `{chapterNumber}{chapterTitle}`, `{numberHan}、{titleText}`) is not half
 * of a number with it, so the rule that sets the 、 of 二、三日 solid does
 * not read across these offsets. Literal text of the template and the
 * inside of one placeholder's value are read as before, and so are two
 * number placeholders side by side.
 *
 * The offset of a placeholder is the length of the template's prefix
 * printed alone (placeholders filled, marks dropped, the case transformed),
 * as `withPrintedTitle` finds `{titleText}`; one the printed text does not
 * hold there (a template whose marks span the placeholder) is left out.
 * Empty when the text holds no 、 or ・.
 */
function mirroredTextSeams(el: ResolvedDesignTextElement, printed: string, placeholders: DesignPlaceholderContext): number[] {
  if (!printed.includes('、') && !printed.includes('・')) return [];
  const upper = el.textTransform === 'uppercase';
  const print = (template: string): string => {
    const resolved = resolveDesignText(template, placeholders, el.inlineMarks === true);
    const plain = el.inlineMarks ? plainDesignText(resolved, placeholders.heading?.chipStyles !== undefined) : resolved;
    return upper ? plain.toLocaleUpperCase() : plain;
  };
  let whole: string | undefined;
  const out = new Set<number>();
  for (const m of el.content.matchAll(MIRRORED_PLACEHOLDER_RE)) {
    whole ??= print(el.content);
    const value = print(m[0]);
    if (value === '') continue;
    const start = print(el.content.slice(0, m.index)).length;
    if (whole.slice(start, start + value.length) !== value) continue;
    if (start > 0) out.add(start);
    if (start + value.length < whole.length) out.add(start + value.length);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Lay out a text some of whose rows (`\n` apart) compose as CJK (#637):
 * those rows are set by the CJK composer (`design/cjkText.ts`), wrapped
 * when `overflow` wraps and set on one line otherwise; the others as
 * `layoutText` (or, with inline marks, `layoutRichText`) sets them.
 * Undefined when a line wider than its room should lose characters to an
 * ellipsis: the caller then sets the text as before.
 */
function layoutCjkRows(
  source: string,
  spansOf: (a: number, b: number) => InlineSpan[],
  fonts: CjkDesignFonts,
  richM: RichMeasurer | undefined,
  measure: TextMeasure,
  measureIn: (text: string, font: string) => number,
  lineHeightPx: number,
  letterSpacingPx: number,
  overflow: TextOverflow,
  maxContentWidth: number | undefined,
  hyphenate: boolean | undefined,
  /** The number seams of a range of `source`, relative to its start (#724). */
  seamsOf: (a: number, b: number) => number[] = () => [],
): TextMeasurement | undefined {
  const wrap = overflow === 'wrap' && maxContentWidth !== undefined;
  const rows: { text: string; width: number; runs?: DesignTextRun[]; xOffset?: number; wordDivided?: 'syllable' | 'character' }[] = [];
  let truncated = false;
  // A line wider than the room of a text that does not wrap: clipped, or
  // left to the ellipsis of the plain path.
  const tooWide = (width: number): boolean => !wrap && maxContentWidth !== undefined && width > maxContentWidth + CLIP_SLACK_PX;
  let start = 0;
  for (const row of source.split('\n')) {
    const end = start + row.length;
    if (composesDesignAsCjk(row)) {
      const lines = composeCjkDesignParagraph(spansOf(start, end), fonts, wrap ? maxContentWidth : undefined, lineHeightPx, letterSpacingPx, measureIn, [], seamsOf(start, end));
      if (lines.some((l) => tooWide(l.width))) {
        if (overflow !== 'clip') return undefined;
        truncated = true;
      }
      if (lines.length === 0) rows.push({ text: '', width: 0 });
      for (const l of lines) rows.push({ text: l.text, width: l.width, ...(l.runs ? { runs: l.runs } : {}), ...(l.xOffset ? { xOffset: l.xOffset } : {}) });
    } else if (wrap) {
      if (richM) rows.push(...wrapRich(richM, start, end, () => maxContentWidth, hyphenate ?? false));
      else {
        const cuts: Parameters<typeof wrapToWidth>[4] = [];
        wrapToWidth(row, measure, maxContentWidth, hyphenate ?? false, cuts).forEach((t, i) => rows.push({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) }));
      }
    } else {
      const line = richM ? richM.rangeLine(start, end) : { text: row, width: measure(row) };
      if (tooWide(line.width)) {
        if (overflow !== 'clip') return undefined;
        truncated = true;
      }
      rows.push(line);
    }
    start = end + 1;
  }
  const lines = stackLines(rows, lineHeightPx);
  rows.forEach((r, i) => {
    if (r.xOffset) lines[i]!.xOffset = r.xOffset;
  });
  const natural = lines.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
  const clip = !wrap && maxContentWidth !== undefined;
  return {
    lines,
    contentWidth: clip ? Math.min(natural, maxContentWidth) : natural,
    contentHeight: lines.length * lineHeightPx,
    needsClip: clip,
    ...(truncated ? { truncated: true } : {}),
  };
}

/** Lay out a text with inline marks: the same rules as `layoutText`, with
 *  every line built from runs. */
function layoutRichText(
  m: RichMeasurer,
  lineHeightPx: number,
  overflow: TextOverflow,
  maxContentWidth: number,
  hyphenate: boolean | undefined,
): TextMeasurement {
  const rows: RichLine[] = [];
  let start = 0;
  let truncated = false;
  const text = m.rt.text;
  for (const row of text.split('\n')) {
    const end = start + row.length;
    if (overflow === 'wrap') rows.push(...wrapRich(m, start, end, () => maxContentWidth, hyphenate ?? false));
    else {
      // `singleRichLine` cuts exactly when the whole line is wider.
      const whole = m.measure(start, end);
      if (whole > maxContentWidth + (overflow === 'clip' ? CLIP_SLACK_PX : 0)) truncated = true;
      rows.push(singleRichLine(m, start, end, maxContentWidth, overflow));
    }
    start = end + 1;
  }
  const lines = stackLines(rows, lineHeightPx);
  const natural = lines.reduce((mx, l) => Math.max(mx, l.width), 0);
  return {
    lines,
    contentWidth: overflow === 'clip' ? Math.min(natural, maxContentWidth) : natural,
    contentHeight: lines.length * lineHeightPx,
    needsClip: overflow === 'clip',
    ...(truncated ? { truncated: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Size resolution helpers
// ---------------------------------------------------------------------------

function resolveFixedSize(
  size: ElementSize | undefined,
  dpi: number,
  baseFontSizePx?: number,
): number | 'auto' | 'fill' | undefined {
  if (size === undefined) return undefined;
  if (size === 'auto' || size === 'fill') return size;
  // A `{ to, edge }` size is turned into px before layout (`withSizesTo`).
  if (isSizeTo(size)) return 'fill';
  return dimPx(size, dpi, baseFontSizePx);
}

// Clamp helper — returns x + w bounded by container edge when pin is 'start'
// (element extends to the right/down), etc.
function fillToContainerEdge(
  anchorX: number,
  pinX: Pin,
  container: AnchorReference,
): number {
  if (pinX === 'start') return container.x + container.width - anchorX;
  if (pinX === 'end') return anchorX - container.x;
  // middle: distance to nearest edge * 2
  const leftDist = anchorX - container.x;
  const rightDist = container.x + container.width - anchorX;
  return Math.min(leftDist, rightDist) * 2;
}

function fillToContainerEdgeY(
  anchorY: number,
  pinY: Pin,
  container: AnchorReference,
): number {
  if (pinY === 'start') return container.y + container.height - anchorY;
  if (pinY === 'end') return anchorY - container.y;
  const topDist = anchorY - container.y;
  const botDist = container.y + container.height - anchorY;
  return Math.min(topDist, botDist) * 2;
}

/** Box of `width` × `height` pinned to `edge` of `ref` (the container
 *  nine-point grid, plus `offset`). Element-to-element edges fall back to
 *  `top-left`. Shared by design slots and fixed-position callouts. */
export function anchorBox(
  edge: AnchorEdge,
  ref: AnchorReference,
  width: number,
  height: number,
  offset: { x: number; y: number },
): BoundingBox {
  // A fixed box is laid in the page's flow, where the start is the left.
  const a = resolveContainerAnchor(physicalEdge(edge, false), ref);
  return createBoundingBox(
    edgeXFromPin(a.anchorX, a.pinX, width) + offset.x,
    edgeYFromPin(a.anchorY, a.pinY, height) + offset.y,
    width,
    height,
  );
}

function edgeXFromPin(anchorX: number, pinX: Pin, width: number): number {
  if (pinX === 'start') return anchorX;
  if (pinX === 'end') return anchorX - width;
  return anchorX - width / 2;
}

function edgeYFromPin(anchorY: number, pinY: Pin, height: number): number {
  if (pinY === 'start') return anchorY;
  if (pinY === 'end') return anchorY - height;
  return anchorY - height / 2;
}

// ---------------------------------------------------------------------------
// Main engine
// ---------------------------------------------------------------------------

/**
 * `anchor` (the point of `edge` on `ref`) moved along the side the edge
 * stands on to `at` (#1055): from the side's start — the left of a top or
 * bottom side, its right when the page starts on the right (`startRight`),
 * the top of a left or right side — a fraction of its length. Along the
 * side the element is centred on that point (a rule's thickness on a
 * frame's middle); across it the edge's pin stays (`below` hangs under the
 * side, `bottom` stands inside on it). `center`, and an `at` that is no
 * side position, leave the anchor as it is.
 */
function alongSide(anchor: AnchorResult, edge: AnchorEdge, at: unknown, ref: AnchorReference, startRight: boolean): AnchorResult {
  const side = edgeSide(edge);
  const f = sideFraction(at);
  if (!side || f === undefined) return anchor;
  if (side === 'left' || side === 'right') return { ...anchor, anchorY: ref.y + f * ref.height, pinY: 'middle' };
  return { ...anchor, anchorX: ref.x + (startRight ? 1 - f : f) * ref.width, pinX: 'middle' };
}

/** A size written as `{ to, edge }` (#928). */
function isSizeTo(size: ElementSize | undefined): size is ElementSizeTo {
  return typeof size === 'object' && size !== null && 'to' in size && 'edge' in size;
}

/** `el` with each size written as `{ to, edge }` (#928) turned into the px
 *  from its anchor point (`pin`) to that edge of the box `refOf` gives:
 *  towards the side the element grows (down for a top pin, up for a foot
 *  pin, both ways from a middle one), 0 when the edge is behind it. A box
 *  that cannot be found, or an edge across the size's axis, reads as
 *  `'fill'`. */
function withSizesTo<T extends ResolvedPlacedDesignElement>(
  el: T,
  pin: AnchorResult,
  refOf: (to: ElementSizeTo['to']) => AnchorReference | undefined,
): T {
  const size = el.placement.size;
  if (!size || (!isSizeTo(size.width) && !isSizeTo(size.height) && !isSizeTo(size.maxWidth))) return el;
  const along = (s: ElementSizeTo, axis: 'x' | 'y'): ElementSize => {
    const ref = refOf(s.to);
    // `center` (#1055): the box's middle on the axis being sized.
    const edges: Record<string, number> = axis === 'x' ? { left: 0, center: 0.5, right: 1 } : { top: 0, center: 0.5, bottom: 1 };
    const side = Object.prototype.hasOwnProperty.call(edges, s.edge) ? edges[s.edge] : undefined;
    if (!ref || side === undefined) return 'fill';
    const at = axis === 'x' ? ref.x + side * ref.width : ref.y + side * ref.height;
    const from = axis === 'x' ? pin.anchorX : pin.anchorY;
    const p = axis === 'x' ? pin.pinX : pin.pinY;
    const room = p === 'start' ? at - from : p === 'end' ? from - at : 2 * Math.abs(at - from);
    return { value: Math.max(0, room), unit: 'px' };
  };
  const out: NonNullable<ElementPlacement['size']> = { ...size };
  if (isSizeTo(size.width)) out.width = along(size.width, 'x');
  if (isSizeTo(size.height)) out.height = along(size.height, 'y');
  if (isSizeTo(size.maxWidth)) out.maxWidth = along(size.maxWidth, 'x');
  return { ...el, placement: { ...el.placement, size: out } };
}

/**
 * A connector (#1056) between the boxes it names: another element of the
 * slot, else a frame or group of the page (`frames.named`, or the declared
 * boxes with `pin`). `#card[*]` in `to` is every instance of `card` the
 * page has, in item order. An end on a box the page does not show (absent
 * from `named`, or in `frames.absent`) is dropped with a
 * `connectorDropped` issue; with no `from` or no `to` left nothing is
 * drawn.
 */
function layoutConnectorElement(
  el: ResolvedDesignConnectorElement,
  resolvedGeo: ReadonlyMap<string, ResolvedPrimitive>,
  frames: DesignFrames,
  issues: LayoutIssue[],
  dpi: number,
  startRight: boolean,
): ResolvedPathPrimitive | undefined {
  const boxes = (el.pin ? frames.declared : undefined) ?? frames.named ?? {};
  const boxOf = (name: string): ConnectorEndBox['box'] | undefined => {
    const dep = resolvedGeo.get(name);
    if (dep) return { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
    if (frames.absent?.has(name)) return undefined;
    return Object.prototype.hasOwnProperty.call(boxes, name) ? boxes[name] : undefined;
  };
  const endOf = (end: unknown): ConnectorEndBox | undefined | null => {
    const to = (end as { to?: unknown } | null | undefined)?.to;
    if (typeof to !== 'string' || !to.startsWith('#')) return null;
    const name = to.slice(1);
    const box = boxOf(name);
    if (!box) {
      issues.push({ kind: 'connectorDropped', elementId: el.id, targetId: name });
      return undefined;
    }
    const anchor = (end as { anchor?: unknown }).anchor;
    if (typeof anchor === 'string' && anchor !== '' && !resolvedGeo.has(name)) {
      // An anchor of the frame's picture (#1057): the end is that point, a
      // box of no size the line arrives at.
      const at = frames.anchorPoint?.(name, anchor) ?? { known: [] };
      if ('hidden' in at) {
        // The point is cut off by its frame (a picture past the frame's
        // foot): nothing to point at on this page.
        issues.push({ kind: 'connectorDropped', elementId: el.id, targetId: name });
        return undefined;
      }
      if (!('x' in at)) {
        issues.push({ kind: 'connectorAnchorUnknown', elementId: el.id, targetId: name, anchor, ...(at.resourceId !== undefined ? { resourceId: at.resourceId } : {}), known: at.known });
        return undefined;
      }
      return { name, box: { x: at.x, y: at.y, width: 0, height: 0 }, end: end as ConnectorEndBox['end'] };
    }
    return { name, box, end: end as ConnectorEndBox['end'] };
  };
  const from = endOf(el.from);
  if (!from) return undefined;
  const written = Array.isArray(el.to) ? el.to : el.to ? [el.to] : [];
  const ends: ConnectorEndBox[] = [];
  for (const end of written) {
    const to = (end as { to?: unknown } | null | undefined)?.to;
    if (typeof to === 'string' && to.endsWith('[*]')) {
      // Every instance of the frame the page has (#1061), in item order.
      const frame = to.slice(1, -3);
      const items = Object.keys(boxes)
        .map((n) => ({ n, at: repeatInstance(n) }))
        .filter((x) => x.at?.frame === frame)
        .sort((a, b) => a.at!.item - b.at!.item);
      for (const { n } of items) {
        const e = endOf({ ...(end as object), to: `#${n}` });
        if (e) ends.push(e);
      }
      continue;
    }
    const e = endOf(end);
    if (e) ends.push(e);
  }
  return layoutConnector(el, from, ends, { dpi, startRight });
}

/** The elements a page's fence lets draw (#1087): a running head's or a
 *  composed page's decoration leaves out an element whose `when` the fence
 *  does not set or whose `unless` it does, and with it every element placed
 *  on it or sized to it (as a frame that takes no room drops what hangs
 *  from it). Other slots (heading, part and box designs) ignore the
 *  condition. The same array when nothing is left out. */
function drawnOnFence<E extends ResolvedDesignElement>(elements: readonly E[], placeholders: DesignPlaceholderContext, own?: ReadonlyMap<string, Readonly<Record<string, string>>>): readonly E[] {
  if (!FENCE_CONDITION_CONTEXTS.has(placeholders.kind)) return elements;
  const dropped = fenceDroppedIds(elements, placeholders.pageAttrs, own);
  return dropped.size === 0 ? elements : elements.filter((el) => !dropped.has(el.id));
}

/** The ids of the elements a page fence with `attrs` leaves out (#1087):
 *  those whose `when` it does not set or whose `unless` it does, and every
 *  element placed on one of them or sized to it. `own` (#1189): the
 *  attributes an element reads first (a module's fence). Empty when
 *  nothing is left out. */
export function fenceDroppedIds(
  elements: readonly ResolvedDesignElement[],
  attrs: Readonly<Record<string, string>> | undefined,
  own?: ReadonlyMap<string, Readonly<Record<string, string>>>,
): Set<string> {
  const dropped = new Set<string>();
  if (!elements.some((el) => el.when !== undefined || el.unless !== undefined)) return dropped;
  for (const el of elements) {
    const first = own?.get(el.id);
    if (!fenceConditionMet(el, first ? { ...attrs, ...first } : attrs)) dropped.add(el.id);
  }
  if (dropped.size === 0) return dropped;
  for (let changed = true; changed; ) {
    changed = false;
    for (const el of elements) {
      if (dropped.has(el.id) || el.kind === 'connector') continue;
      const target = anchorTargetId(el.placement);
      if ((target !== undefined && dropped.has(target)) || sizeTargetIds(el.placement).some((id) => dropped.has(id))) {
        dropped.add(el.id);
        changed = true;
      }
    }
  }
  return dropped;
}

/** Layout one design slot against its container. */
export function layoutDesignSlot(
  slot: ResolvedDesignSlot,
  context: LayoutContext,
  pageIndex: number,
): DesignSlotLayout {
  const issues: LayoutIssue[] = [];
  const containerRef: AnchorReference = {
    x: context.container.x,
    y: context.container.y,
    width: context.container.width,
    height: context.container.height,
  };

  // Filter by parity and page role first; then let the current part's
  // palette overrides recolour the palette-linked colours.
  const overrides = context.placeholders.partPaletteByPageIndex?.[context.placeholders.page.index];
  // A module's elements (#1189) read its fence's attributes first.
  const ownPlaceholders = new Map<string, DesignPlaceholderContext>();
  const placeholdersOf = (el: ResolvedDesignElement): DesignPlaceholderContext => {
    const own = context.elementAttrs?.get(el.id);
    if (!own) return context.placeholders;
    let ctx = ownPlaceholders.get(el.id);
    if (!ctx) {
      ctx = { ...context.placeholders, pageAttrs: { ...context.placeholders.pageAttrs, ...own } };
      ownPlaceholders.set(el.id, ctx);
    }
    return ctx;
  };
  const candidates = drawnOnFence(slot.elements, context.placeholders, context.elementAttrs)
    .filter((el) => pageMatchesParity(pageIndex, el.parity) && pageMatchesRole(el.pages, context.pageRole))
    .map((el) => (overrides && Object.keys(overrides).length > 0 ? applyPaletteOverrides(el, overrides) : el))
    // Start and end edges read as the physical ones of this page (#936).
    .map((el) => (el.kind !== 'connector' && isLogicalEdge(el.placement.anchor.edge) ? { ...el, placement: physicalPlacement(el.placement, context.startRight === true) } : el));
  // Connectors (#1056) are laid after every placed element, between the
  // boxes they join; only where there are frames to join (a composed
  // page's decoration).
  const placed = candidates.filter((el): el is ResolvedPlacedDesignElement => el.kind !== 'connector');

  // Topologically sort (dependencies first) to resolve geometry; paint
  // order is still the array order (first = back), restored below.
  const ordered = topoSort(placed, issues, context.frames?.named);

  // Precompute: resolved text contents (placeholder-expanded), with the
  // `\n` escape of the template and of attribute values turned into a
  // newline before any case transform (which would make it `\N`).
  const textContent = new Map<string, string>();
  for (const el of ordered) {
    if (el.kind === 'text') {
      const text = resolveDesignText(el.content, placeholdersOf(el), el.inlineMarks === true);
      textContent.set(el.id, el.textTransform === 'uppercase' ? text.toLocaleUpperCase() : text);
    }
  }
  // Where a number the layout wrote meets a text mirrored from the
  // document in each printed text (#724): Japanese text only, whose rule
  // for a 、 between two kanji numerals would read across the two.
  const textSeams = new Map<string, number[]>();
  if (getCjkComposition().region === 'japan') {
    for (const el of ordered) {
      if (el.kind !== 'text') continue;
      const seams = mirroredTextSeams(el, textContent.get(el.id) ?? '', placeholdersOf(el));
      if (seams.length > 0) textSeams.set(el.id, seams);
    }
  }

  const resolvedGeo = new Map<string, ResolvedPrimitive>();
  // Primitives per element, keyed by the element itself (a text element may
  // emit several: drop cap, rich runs…), emitted in `candidates` order.
  const primsByElement = new Map<ResolvedDesignElement, ResolvedPrimitive[]>();
  // The chip styles a heading title's chips are set in (#1162).
  const chipStyles = context.placeholders.heading?.chipStyles;
  const textFrame = chipStyles ? { ...context, chipStyles } : context;

  for (const given of ordered) {
    const target = anchorTargetId(given.placement);
    let refGeo: AnchorReference = containerRef;
    // Page/bleed anchors use that frame both as the anchor reference and as
    // the bounds for `size: 'fill'` / auto-width clamping, so a band can run
    // edge to edge regardless of the slot container.
    let fillRef: AnchorReference = containerRef;
    let useElementEdge = false;
    const frame = frameFor(given.placement, context.frames);
    if (frame) {
      refGeo = frame;
      fillRef = frame;
    } else if (target) {
      const dep = resolvedGeo.get(target);
      const outside = dep ? undefined : (given.pin ? context.frames?.declared?.[target] : undefined) ?? context.frames?.named?.[target];
      if (dep) {
        refGeo = { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
        useElementEdge = true;
      } else if (outside) {
        refGeo = { ...outside };
        // A nine-point edge on a frame is that point of its box; an
        // element edge (`below`, `right-of`…) reads as for an element.
        useElementEdge = ELEMENT_TO_ELEMENT_EDGES.has(given.placement.anchor.edge);
        if (!useElementEdge) fillRef = refGeo;
      }
    }
    const onEdge = useElementEdge
      ? resolveElementAnchor(given.placement.anchor.edge, refGeo)
      : resolveContainerAnchor(given.placement.anchor.edge, refGeo);
    // A point along a side of another element, a frame or a group (#1055).
    const anchor = target && !frame && refGeo !== containerRef && given.placement.anchor.at !== undefined
      ? alongSide(onEdge, given.placement.anchor.edge, given.placement.anchor.at, refGeo, context.startRight === true)
      : onEdge;

    // A text element's offset may be written in ems of its own size (a
    // running head four characters below the type area).
    const emPx = given.kind === 'text' ? dimPx(given.fontSize, context.dpi) : undefined;
    const offsetX = dimPx(given.placement.offset?.x, context.dpi, emPx);
    const offsetY = dimPx(given.placement.offset?.y, context.dpi, emPx);
    const anchorX = anchor.anchorX + offsetX;
    const anchorY = anchor.anchorY + offsetY;
    // A size that runs to an edge of another box (#928), in px from here.
    const el = withSizesTo(given, { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY }, (to) => {
      if (to === 'container') return containerRef;
      if (to === 'page' || to === 'bleed' || to === 'outer') return context.frames?.[to] ?? containerRef;
      const id = to.slice(1);
      const dep = resolvedGeo.get(id);
      if (dep) return { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
      return (given.pin ? context.frames?.declared?.[id] : undefined) ?? context.frames?.named?.[id];
    });

    if (el.kind === 'text') {
      const pin: AnchorResult = { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY };
      // A vertical element in a frame whose text is horizontal (a running
      // head on the sheet, a design of a horizontal page); in a vertical
      // flow the text already runs down.
      const content = textContent.get(el.id) ?? '';
      const turned = el.writingMode === 'vertical-rl' && getMeasureWritingMode() !== 'vertical-rl';
      // A contents part row's `{leader}` (#889), on a horizontal line.
      const leader = context.placeholders.leader;
      const leadered = content.includes(LEADER_MARK) && leader && !turned && getMeasureWritingMode() !== 'vertical-rl';
      const text = leadered ? content : content.split(LEADER_MARK).join('');
      const prims = turned
        ? layoutVerticalTextElement(el, text, pin, fillRef, context.dpi, useElementEdge, textSeams.get(el.id), chipStyles)
        : leadered
          ? layoutLeaderTextElement(el, text, leader, pin, fillRef, context.dpi, useElementEdge, context)
          : layoutTextElement(el, text, pin, fillRef, context.dpi, useElementEdge, textFrame, textSeams.get(el.id));
      resolvedGeo.set(el.id, prims[0]!);
      primsByElement.set(given, prims);
      const truncated = prims[0]!.truncated;
      if (truncated) {
        const text = content.split(LEADER_MARK).join('');
        issues.push({ kind: 'textTruncated', elementId: el.id, mode: truncated, text: el.inlineMarks ? plainDesignText(text, chipStyles !== undefined) : text });
      }
    } else if (el.kind === 'rule') {
      const prim = layoutRuleElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(given, [prim]);
    } else if (el.kind === 'path') {
      // Data that cannot be read draws nothing; the box still stands for
      // the elements anchored to it.
      const prim = layoutPathElement(el, { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      if (prim.subpaths.length > 0) primsByElement.set(given, [prim]);
    } else if (el.kind === 'image') {
      const prim = layoutImageElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi, context.resourceById, resolveDesignResourceId(el.resourceId, placeholdersOf(el)), context.frames?.upright === true);
      if (prim) {
        resolvedGeo.set(el.id, prim);
        primsByElement.set(given, [prim]);
      }
    } else {
      const prim = layoutBoxElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(given, [prim]);
    }
  }

  if (context.frames?.named) {
    for (const el of candidates) {
      if (el.kind !== 'connector') continue;
      const prim = layoutConnectorElement(el, resolvedGeo, context.frames, issues, context.dpi, context.startRight === true);
      if (prim) primsByElement.set(el, [prim]);
    }
  }

  const primitives: ResolvedPrimitive[] = [];
  const elementIds: string[] = [];
  for (const el of candidates) {
    for (const prim of primsByElement.get(el) ?? []) {
      primitives.push(prim);
      elementIds.push(el.id);
    }
  }

  return {
    container: context.container,
    primitives,
    elementIds,
    issues,
  };
}

/** A syllable break of `word` whose head, with its hyphen, still fits after
 *  `line` in `maxWidth`: the longest such head, or undefined. Used to fill
 *  a justified line (EF-109). */
function syllableFill(line: string, word: string, measure: TextMeasure, maxWidth: number): { head: string; tail: string } | undefined {
  if (hasJoiningScript(word)) return undefined;
  const hy = withoutSlashJoints(word, hyphenateText(word));
  if (!hy.includes(SOFT_HYPHEN) || hy.split(SOFT_HYPHEN).join('') !== word) return undefined;
  const parts = hy.split(SOFT_HYPHEN);
  let best: { head: string; tail: string } | undefined;
  for (let k = 1; k < parts.length; k++) {
    const head = withLineEndHyphen(parts.slice(0, k).join(''));
    if (measure(line + head) > maxWidth) break;
    best = { head, tail: parts.slice(k).join('') };
  }
  return best;
}

/** Greedy wrap of one paragraph where every line may have its own width
 *  (`widthFor(lineIndex)`), preserving existing line breaks. With `fill`
 *  (a justified text that hyphenates), a word that does not fit the rest
 *  of a line is cut at its last syllable break that does. */
function wrapWithWidths(text: string, measure: TextMeasure, widthFor: (i: number) => number, hyphenate: boolean, startLine = 0, fill = false, cuts?: ('syllable' | 'character' | undefined)[]): string[] {
  const out: string[] = [];
  let i = startLine;
  for (const para of text.split('\n')) {
    // Words part at breaking spaces only: a no-break space glues (EF-66).
    const words = para.split(BREAKING_SPACE_RUNS_SPLIT_RE);
    let current = '';
    let maxWidth = Math.max(1, widthFor(i));
    const flush = () => { out.push(current); current = ''; i++; maxWidth = Math.max(1, widthFor(i)); };
    for (const part of words) {
      const test = current + part;
      if (measure(test) <= maxWidth || (current.length === 0 && (part === '' || isBreakingSpaceRun(part)))) {
        current = test;
      } else if (current.length === 0) {
        let remaining = part;
        while (remaining.length > 0) {
          if (measure(remaining) <= maxWidth) { current = remaining; break; }
          const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
          if (!split || split.head.length === 0) { current = remaining; break; }
          current = split.head; flush();
          if (cuts) cuts[out.length - 1] = split.divided;
          remaining = split.tail;
        }
      } else {
        const word = part.trimStart();
        const cut = fill && hyphenate ? syllableFill(current, word, measure, maxWidth) : undefined;
        if (cut) {
          current += cut.head;
          flush();
          current = cut.tail;
        } else {
          flush();
          current = word;
        }
        if (measure(current) > maxWidth) {
          let remaining = current; current = '';
          while (remaining.length > 0) {
            if (measure(remaining) <= maxWidth) { current = remaining; break; }
            const split = breakWordWithHyphenation(remaining, measure, maxWidth, hyphenate);
            if (!split || split.head.length === 0) { current = remaining; break; }
            current = split.head; flush();
            if (cuts) cuts[out.length - 1] = split.divided;
            remaining = split.tail;
          }
        }
      }
    }
    out.push(current.trimEnd());
    i++;
    maxWidth = Math.max(1, widthFor(i));
  }
  return out;
}

/** The share of a letter's size its capitals take, for a drop cap's
 *  default size (the faces' own cap heights are not measured). */
const CAP_HEIGHT_RATIO = 0.72;

/** The spaces a justified line stretches: those CSS `word-spacing` widens
 *  (U+0020 and the no-break space U+00A0). */
const STRETCHABLE_SPACE_RE = /[ \u00A0]/g;
/** A line cut after each run of stretchable spaces. */
const WORD_WITH_SPACES_RE = /[^ \u00A0]+[ \u00A0]*|[ \u00A0]+/g;

function stretchableSpaces(text: string): number {
  return text.match(STRETCHABLE_SPACE_RE)?.length ?? 0;
}

/**
 * A wrapped line justified to `width` (EF-109): its word spaces stretched
 * by the same amount so the line ends at the right edge of its room. The
 * line is cut into runs after every space, each run's width taking its
 * spaces' share of the stretch, so the canvas and PDF paint it by advancing
 * run by run; `wordSpacingPx` gives the HTML its `word-spacing`. Runs of
 * inline marks are cut the same way, keeping their fonts; a subscript and
 * a superscript set over each other are left whole. A line with no space
 * to stretch, or already as wide as its room, is returned as it is (its
 * trailing spaces dropped).
 */
function justifyLine(
  line: { text: string; width: number; runs?: DesignTextRun[] },
  width: number,
  measure: TextMeasure,
  measureIn: (text: string, font: string) => number,
  font: string,
): { text: string; width: number; runs?: DesignTextRun[]; wordSpacingPx?: number } {
  // Trailing spaces (a plain wrapped line may keep them) are not stretched.
  let runs = line.runs;
  let text = line.text;
  let natural = line.width;
  if (!runs && /[ \u00A0]+$/.test(text)) {
    text = text.replace(/[ \u00A0]+$/, '');
    natural = measure(text);
  }
  const pieces: DesignTextRun[] = runs ?? [{ text, fontString: font, width: natural }];
  // A run the author oriented in vertical text is never cut at its spaces.
  const splittable = (i: number): boolean => !pieces[i]!.stacked && !pieces[i - 1]?.stacked && !pieces[i]!.tcy && !pieces[i]!.orientation && !pieces[i]!.chip;
  let spaces = 0;
  pieces.forEach((r, i) => { if (splittable(i)) spaces += stretchableSpaces(r.text); });
  const room = width - natural;
  if (spaces === 0 || room <= 0.01) return runs ? line : { text, width: natural };
  const extra = room / spaces;
  const out: DesignTextRun[] = [];
  pieces.forEach((r, i) => {
    if (!splittable(i)) { out.push(r); return; }
    const words = r.text.match(WORD_WITH_SPACES_RE) ?? [r.text];
    let sum = 0;
    words.forEach((w, k) => {
      // The last piece keeps what kerning across the cuts leaves, so the
      // run as a whole advances as far as it did.
      const own = k < words.length - 1 ? measureIn(w, r.fontString) : r.width - sum;
      sum += own;
      out.push({ ...r, text: w, width: own + extra * stretchableSpaces(w) });
    });
  });
  runs = out;
  return { text, width: natural + room, runs, wordSpacingPx: extra };
}

/** Distance between the baselines of a design text: its absolute leading
 *  (`lineHeightLength`), else its multiplier times the font size. Read
 *  through `resolveDesignLineHeight` as well, so a slot built by hand (not
 *  resolved) that carries a {@link Dimension} or a malformed value still
 *  lays out — at the default leading when unusable, never NaN. */
function designLineHeightPx(el: ResolvedDesignTextElement, fontSizePx: number, dpi: number): number {
  const leading = resolveDesignLineHeight(el.lineHeightLength ?? el.lineHeight, el.fontSize);
  const px = leading.lineHeightLength ? dimPx(leading.lineHeightLength, dpi) : fontSizePx * leading.lineHeight;
  return Number.isFinite(px) ? px : 0;
}

function layoutTextElement(
  el: ResolvedDesignTextElement,
  resolvedText: string,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  /** The document's direction and the slot's frame (`LayoutContext`),
   *  and the chip styles a heading title's chips are set in (#1162). */
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean; chipStyles?: readonly ResolvedChipStyleConfig[] } = {},
  /** Offsets into the printed text (its inline marks dropped) where a
   *  number the layout wrote meets a text mirrored from the document
   *  (#724, {@link mirroredTextSeams}). */
  seams: readonly number[] = [],
): ResolvedTextPrimitive[] {
  let text = resolvedText;
  const seamsOf = (a: number, b: number): number[] => seams.filter((s) => s > a && s < b).map((s) => s - a);
  const fontSizePx = dimPx(el.fontSize, dpi);
  const weight = el.fontWeight === 400 ? 'normal' : String(el.fontWeight);
  const style = el.italic ? 'italic' : 'normal';
  const fontString = buildFontString(el.fontFamily, fontSizePx, weight, style);
  // Tracking advances every character (spaces included) by `letterSpacingPx`,
  // exactly as canvas `letterSpacing` / CSS `letter-spacing` / PDF `Tc` do.
  // Negative tracking tightens a display title (EF-82); a width never drops
  // below zero, however tight.
  // A text in a joining script (Arabic…) is set untracked: spacing its
  // letters apart breaks the joins (`measure/joining.ts`).
  const trackingPx = dimPx(el.letterSpacing, dpi, fontSizePx);
  const letterSpacingPx = Number.isFinite(trackingPx) && !joiningScriptIn(text) ? trackingPx : 0;
  // In a document shaped in its own language a text is as wide as its
  // runs are painted, each in its own direction (#770,
  // `measuresRunsAsPainted`): wrapping, justification and truncation then
  // read the widths the renderers set. `base`, the direction the runs are
  // resolved at, is read when a text is measured, further down.
  const asPainted = measuresRunsAsPainted();
  const flowIn = (t: string, font: string): number => (asPainted ? directedTextWidth(t, font, base, frame.arabicNumbers === true) : flowTextWidth(t, font));
  const measure: TextMeasure = (t) => Math.max(0, flowIn(t, fontString) + letterSpacingPx * graphemeCount(t));
  const measureIn = (t: string, font: string): number => Math.max(0, flowIn(t, font) + letterSpacingPx * graphemeCount(t));
  const box = resolveBox(el.box, dpi, fontSizePx);
  const padding: ResolvedPadding = box?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // Inline marks: a text that carries any is laid out in runs; one that
  // carries none (only escapes) is plain text with its markers resolved.
  // A heading title's chips (#1162): only a text that reads inline marks,
  // in a design given the document's chip styles, sets them.
  const chips = el.inlineMarks && frame.chipStyles ? { styles: frame.chipStyles, dpi, letterSpacingPx } : undefined;
  const rich = el.inlineMarks
    ? parseRichDesignText(text, { family: el.fontFamily, sizePx: fontSizePx, weight: el.fontWeight, italic: el.italic }, chips)
    : undefined;
  const richM = rich?.hasMarks ? new RichMeasurer(rich, letterSpacingPx, asPainted ? flowIn : undefined) : undefined;
  if (rich && !rich.hasMarks) text = rich.text;
  // The base direction: the element's, `'auto'` from its first strong
  // letter, else the document's. Vertical text is not reordered.
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  const base: 'ltr' | 'rtl' = vertical ? 'ltr' : designBaseDirection(el.direction, richM ? richM.rt.text : text, frame.direction ?? 'ltr');
  const mirrored = !vertical && frame.mirrored === true;
  const strokeWidthPx = el.stroke ? Math.max(0, dimPx(el.stroke.width, dpi, fontSizePx)) : 0;
  const stroke = el.stroke && strokeWidthPx > 0
    ? { widthPx: strokeWidthPx, color: colorHex(el.stroke.color ?? el.color), ...(el.stroke.hollow ? { hollow: true } : {}) }
    : undefined;
  // Dots to trace (#1017), on a horizontal text.
  const dotted = el.dotted && !vertical ? resolveTextDots(el.dotted, dpi, fontSizePx) : undefined;

  const widthSize = resolveFixedSize(el.placement.size?.width, dpi, fontSizePx);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi, fontSizePx);
  const maxWidthSize = resolveFixedSize(el.placement.size?.maxWidth, dpi, fontSizePx);

  // Determine content width budget.
  let contentMax: number | undefined;
  let elementWidth: number | undefined;
  let clampToContainer = false;
  if (widthSize === 'auto' || widthSize === undefined) {
    // Auto width: let the text size itself, but never overflow the container.
    // We compute the distance from the anchor to the container edge and use
    // that as an upper bound for wrapping/ellipsis.
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    // `maxWidth` caps the budget below the container edge: the element keeps
    // sizing to its content, so whatever hangs off it stays attached, and a
    // long text truncates here instead of squeezing those elements out.
    const capW = typeof maxWidthSize === 'number' ? Math.min(fillW, maxWidthSize) : fillW;
    contentMax = Math.max(0, capW - padding.left - padding.right);
    clampToContainer = true;
  } else if (widthSize === 'fill') {
    const fillW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.max(0, fillW);
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  } else {
    elementWidth = widthSize;
    contentMax = Math.max(0, elementWidth - padding.left - padding.right);
  }

  // Paragraphs (a newline, which the `\n` escape of the template or of an
  // attribute value has become) with a first-line indent, and a drop cap on
  // the first: wrapping text only.
  const lineHeightPx = designLineHeightPx(el, fontSizePx, dpi);
  const paraIndentPx = Math.max(0, dimPx(el.paragraphIndent, dpi, fontSizePx));
  // Paragraph ranges of the text laid out (the plain text of a marked one),
  // each trimmed of surrounding whitespace; empty ones are dropped, so
  // consecutive newlines count as one.
  const source = richM ? richM.rt.text : text;
  const paraRanges: [number, number][] = [];
  let rowStart = 0;
  for (const row of source.split('\n')) {
    let a = rowStart;
    let b = rowStart + row.length;
    while (a < b && /\s/.test(source[a]!)) a++;
    while (b > a && /\s/.test(source[b - 1]!)) b--;
    if (b > a) paraRanges.push([a, b]);
    rowStart += row.length + 1;
  }
  const paragraphs = paraRanges.map(([a, b]) => source.slice(a, b));
  // A drop cap makes the text wrap whatever its `overflow` (EF-106): the
  // letter spans lines, so a single truncated line cannot hold it.
  const wraps = el.overflow === 'wrap' || el.dropCap !== undefined;
  const justify = el.align === 'justify' && wraps;
  // A letter joined to the next one (Arabic) is never set apart.
  const dropCap = el.dropCap && wraps && contentMax !== undefined && paragraphs.length > 0 && paragraphs[0]!.length > 1
    && !joinsWithNext(paragraphs[0]!, 0)
    ? el.dropCap
    : undefined;
  // Rows of Chinese or Japanese are set by the CJK composer (#637): the
  // fonts of their inline marks, and the spans of a range of `source`
  // (`plain`, the range's text, when the text has no marks).
  const cjkFonts: CjkDesignFonts = richM
    ? richFontSet({ family: el.fontFamily, sizePx: fontSizePx, weight: el.fontWeight, italic: el.italic })
    : { normal: fontString, bold: fontString, italic: fontString, boldItalic: fontString };
  const spansOf = (a: number, b: number, plain: string): InlineSpan[] =>
    richM ? richDesignSpans(richM.rt, a, b) : [{ text: plain, bold: false, italic: false }];
  let m: TextMeasurement;
  let cap: { text: string; font: string; fontPx: number; width: number; lines: number; color: string } | undefined;
  if ((dropCap || justify || (paraIndentPx > 0 && paragraphs.length > 1)) && wraps && contentMax !== undefined) {
    const maxW = contentMax;
    const wrapped: WrappedLine[] = [];
    let capLines = 0;
    let capRoom = 0;
    if (dropCap) {
      capLines = Math.max(1, Math.round(dropCap.lines ?? 2));
      // The letter stands on the baseline of the last line it spans; by
      // default its capitals reach those of the first line: the text's cap
      // height plus `lines - 1` line spacings, capitals being 0.72 of the
      // size (EF-127).
      const capFontPx = dropCap.fontSize
        ? dimPx(dropCap.fontSize, dpi, fontSizePx)
        : fontSizePx + ((capLines - 1) * lineHeightPx) / CAP_HEIGHT_RATIO;
      const capWeight = (dropCap.fontWeight ?? el.fontWeight) === 400 ? 'normal' : String(dropCap.fontWeight ?? el.fontWeight);
      const capFont = buildFontString(dropCap.fontFamily ?? el.fontFamily, capFontPx, capWeight, 'normal');
      const letter = paragraphs[0]!.slice(0, 1);
      paragraphs[0] = paragraphs[0]!.slice(1).trimStart();
      paraRanges[0]![0] = paraRanges[0]![1] - paragraphs[0].length;
      const capW = flowTextWidth(letter, capFont);
      capRoom = capW + Math.max(0, dimPx(dropCap.gap, dpi, fontSizePx));
      cap = { text: letter, font: capFont, fontPx: capFontPx, width: capW, lines: capLines, color: colorHex(dropCap.color ?? el.color) };
    }
    // Justified lines fill their room by stretching their word spaces, and
    // a word that does not fit may be cut at a syllable to fill (EF-109).
    const fill = justify && (el.hyphenate ?? false);
    let lineNo = 0;
    paragraphs.forEach((para, p) => {
      const offsetOf = (i: number): number => {
        if (p === 0 && i < capLines) return capRoom;
        if (p > 0 && i === 0) return paraIndentPx;
        return 0;
      };
      if (composesDesignAsCjk(para)) {
        // A paragraph of Chinese or Japanese (#637): set by the CJK
        // composer, ragged (its lines are not stretched at word spaces),
        // each line as far in as its offset says (the last entry repeats).
        const indents: number[] = [];
        for (let i = 0; i <= Math.max(capLines, 1); i++) indents.push(offsetOf(i));
        const [a, b] = paraRanges[p]!;
        for (const l of composeCjkDesignParagraph(spansOf(a, b, para), cjkFonts, maxW, lineHeightPx, letterSpacingPx, measureIn, indents, seamsOf(a, b))) {
          wrapped.push({
            text: l.text,
            width: l.width,
            xOffset: l.xOffset,
            topY: lineNo * lineHeightPx,
            baselineY: lineNo * lineHeightPx + lineHeightPx * 0.8,
            height: lineHeightPx,
            ...(l.runs ? { runs: l.runs } : {}),
          });
          lineNo++;
        }
        return;
      }
      const cuts: ('syllable' | 'character' | undefined)[] = [];
      const lines: { text: string; width: number; runs?: DesignTextRun[]; wordSpacingPx?: number; wordDivided?: 'syllable' | 'character' }[] = richM
        ? wrapRich(richM, paraRanges[p]![0], paraRanges[p]![1], (i) => maxW - offsetOf(i), el.hyphenate ?? false, fill)
        : wrapWithWidths(para, measure, (i) => maxW - offsetOf(i), el.hyphenate ?? false, 0, fill, cuts).map((t, i) => ({ text: t, width: measure(t), ...(cuts[i] ? { wordDivided: cuts[i] } : {}) }));
      lines.forEach((l, i) => {
        // The last line of a paragraph is set flush left. The others are
        // stretched until their last glyph ends on the edge: the tracking
        // after it runs past (EF-153).
        const line = justify && i < lines.length - 1
          ? justifyLine(l, maxW - offsetOf(i) + trailingTracking(l.text.trimEnd(), letterSpacingPx), measure, measureIn, fontString)
          : l;
        wrapped.push({
          text: line.text,
          width: line.width,
          xOffset: offsetOf(i),
          topY: lineNo * lineHeightPx,
          baselineY: lineNo * lineHeightPx + lineHeightPx * 0.8,
          height: lineHeightPx,
          ...(line.runs ? { runs: line.runs } : {}),
          ...(line.wordSpacingPx !== undefined ? { wordSpacingPx: line.wordSpacingPx } : {}),
          ...(l.wordDivided ? { wordDivided: l.wordDivided } : {}),
        });
        lineNo++;
      });
    });
    const w = wrapped.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
    m = { lines: wrapped, contentWidth: w, contentHeight: wrapped.length * lineHeightPx, needsClip: false };
  } else {
    const cjk = source.split('\n').some(composesDesignAsCjk)
      ? layoutCjkRows(source, (a, b) => spansOf(a, b, source.slice(a, b)), cjkFonts, richM, measure, measureIn, lineHeightPx, letterSpacingPx, el.overflow, contentMax, el.hyphenate, seamsOf)
      : undefined;
    if (cjk) m = cjk;
    else if (richM && contentMax !== undefined) m = layoutRichText(richM, lineHeightPx, el.overflow, contentMax, el.hyphenate);
    else m = layoutText(text, measure, lineHeightPx, el.overflow, contentMax, el.hyphenate);
  }
  // Set vertically (in a vertical flow, or turned by `writingMode`): each
  // line's characters stand on the middle of its line box, as a vertical
  // line of the body does (`lineBaselineOffset`).
  if (vertical) {
    for (const line of m.lines) line.baselineY = line.topY + lineBaselineOffset(line.height, fontString);
  } else {
    // Right-to-left text: each line's runs cut where the direction
    // changes, flagged and ordered for the frame the slot is painted in.
    // A justified run keeps its spaces' share of the stretch.
    let resized = false;
    for (const line of m.lines) {
      // An Arabic word wider than a wrapping line's room is left whole and
      // runs past it: flagged for a warning.
      if (wraps && contentMax !== undefined && line.width > contentMax - (line.xOffset ?? 0) + 0.5 && joiningScriptIn(line.text)) line.wordOverflow = true;
      const runs: DesignTextRun[] = line.runs ?? [{ text: line.text, fontString, width: line.width }];
      const spacing = line.wordSpacingPx ?? 0;
      const directed = directRuns(
        runs, base, mirrored,
        (r, t, rtl) => (asPainted ? Math.max(0, paintedRunWidth(t, r.fontString, rtl) + letterSpacingPx * graphemeCount(t)) : measureIn(t, r.fontString)) + spacing * stretchableSpaces(t),
        frame.arabicNumbers === true, asPainted,
      );
      if (!directed) continue;
      line.runs = directed.runs;
      if (directed.order) line.order = directed.order;
      if (!asPainted) continue;
      // Each run is now as wide as it is painted (#770): the line is as
      // wide as its runs. A justified line keeps its width, the edge it
      // ends on, and its word spaces take up what the runs moved by.
      const set = directed.runs.reduce((sum, r) => sum + r.width, 0);
      const spaces = spacing === 0 ? 0 : directed.runs.reduce((n, r) => n + (r.stacked || r.tcy || r.orientation ? 0 : stretchableSpaces(r.text)), 0);
      if (spaces > 0) {
        const more = (line.width - set) / spaces;
        for (const r of directed.runs) if (!r.stacked && !r.tcy && !r.orientation) r.width += more * stretchableSpaces(r.text);
        line.wordSpacingPx = spacing + more;
      } else if (Math.abs(set - line.width) > 1e-9) {
        line.width = set;
        resized = true;
      }
    }
    // A chip of a mirrored frame (#1162) advances through its runs along
    // the flow's x axis too: their order turned, as `mirrorFrame` turns a
    // body chip's.
    if (mirrored) {
      for (const line of m.lines) {
        for (const run of line.runs ?? []) {
          const chip = run.chip;
          if (!chip || chip.runs.length < 2) continue;
          const flow = [...(chip.order ?? chip.runs.map((_, i) => i))].reverse();
          const next = { ...chip };
          if (flow.every((v, i) => v === i)) delete next.order;
          else next.order = flow;
          run.chip = next;
        }
      }
    }
    // A text that sizes its own box is as wide as its widest line.
    if (resized) {
      const widest = m.lines.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
      m.contentWidth = m.needsClip && contentMax !== undefined ? Math.min(widest, contentMax) : widest;
    }
  }
  // A text of one line set again after itself (#1017).
  if (el.repeat && !vertical && !cap && m.lines.length === 1 && contentMax !== undefined) {
    const gapPx = el.repeat.gap ? Math.max(0, dimPx(el.repeat.gap, dpi, fontSizePx)) : fontSizePx;
    repeatLine(m, contentMax, gapPx, el.repeat.count, fontString, (base === 'rtl') !== mirrored);
  }
  // The tracking after a line's last glyph is advance, not ink: a box that
  // shrink-wraps its text leaves it out (EF-153), as the alignment of each
  // line does (`textPrimitiveToBlock`), so a tracked title anchored to a
  // corner or a centre sits where its letters are.
  let contentWidth = m.contentWidth;
  if (letterSpacingPx !== 0) {
    const inkWidth = m.lines.reduce((mx, l) => Math.max(mx, (l.xOffset ?? 0) + Math.max(0, l.width - trailingTracking(l.text, letterSpacingPx))), 0);
    contentWidth = m.needsClip && contentMax !== undefined ? Math.min(inkWidth, contentMax) : inkWidth;
  }
  if (elementWidth === undefined) elementWidth = contentWidth + padding.left + padding.right;
  if (clampToContainer) {
    const maxW = fillToContainerEdge(pin.anchorX, pin.pinX, container);
    elementWidth = Math.min(elementWidth, Math.max(0, maxW));
  }

  let elementHeight: number;
  if (heightSize === undefined || heightSize === 'auto') {
    elementHeight = m.contentHeight + padding.top + padding.bottom;
  } else if (heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  // When anchored to another element with auto-sized width, wrapped lines
  // should flow from the anchor side: right-of → left-align, left-of →
  // right-align. This keeps the first character of every wrapped line at the
  // same vertical gutter as the anchor, matching user intent.
  const autoWidth = el.placement.size?.width === undefined || el.placement.size?.width === 'auto';
  const effectiveAlign: DesignTextAlign = anchoredToElement && autoWidth
    ? (pin.pinX === 'start' ? 'left' : pin.pinX === 'end' ? 'right' : el.align)
    : el.align;

  const main: ResolvedTextPrimitive = {
    kind: 'text',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    lines: m.lines,
    fontString,
    fontSizePx,
    color: colorHex(el.color),
    align: effectiveAlign,
    verticalAlign: el.verticalAlign,
    needsClip: m.needsClip || el.overflow === 'clip',
    ...(m.truncated && el.overflow !== 'wrap' ? { truncated: el.overflow } : {}),
    letterSpacingPx,
    ...(base === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...((base === 'rtl') !== mirrored ? { startRight: true as const } : {}),
    contentX: padding.left,
    contentY: padding.top,
    contentWidth: Math.max(0, elementWidth - padding.left - padding.right),
    contentHeight: Math.max(0, elementHeight - padding.top - padding.bottom),
    box,
    ...(stroke ? { stroke } : {}),
    ...(dotted ? { dotted } : {}),
  };
  if (!cap) return [main];
  // The drop cap: its baseline on the baseline of the last line it spans,
  // wherever `verticalAlign` moves those lines in the box.
  const capLineH = cap.fontPx * 1.2;
  const anchorLine = m.lines[Math.min(cap.lines, m.lines.length) - 1];
  const targetBaseline = anchorLine ? anchorLine.baselineY : lineHeightPx * 0.8;
  const linesOffset = textVerticalOffset(el.verticalAlign, main.contentHeight, m.lines);
  const capPrim: ResolvedTextPrimitive = {
    kind: 'text',
    id: `${el.id}-dropcap`,
    x: x + padding.left,
    y: y + padding.top + linesOffset + targetBaseline - capLineH * 0.8,
    width: cap.width,
    height: capLineH,
    lines: [{ text: cap.text, width: cap.width, topY: 0, baselineY: capLineH * 0.8, height: capLineH }],
    fontString: cap.font,
    fontSizePx: cap.fontPx,
    color: cap.color,
    align: 'left',
    verticalAlign: 'top',
    needsClip: false,
    dropCap: true,
    letterSpacingPx: 0,
    contentX: 0,
    contentY: 0,
    contentWidth: cap.width,
    contentHeight: capLineH,
    // The outline takes the cap's own colour unless it sets one.
    ...(stroke ? { stroke: { ...stroke, color: el.stroke?.color ? stroke.color : cap.color } } : {}),
  };
  return [main, capPrim];
}

/**
 * Set the one line of `m` again after itself (`DesignTextElement.repeat`,
 * #1017): as many whole copies as `room` holds, `gap` apart, `count` at
 * most. The copies stay one line, aligned as a whole: its runs are the
 * line's runs once per copy with a run of the gap's width between two
 * (a word space, read as one when the text is copied), and its `order`
 * puts the first copy on the start side (`startRight`).
 */
function repeatLine(m: TextMeasurement, room: number, gap: number, count: number | undefined, fontString: string, startRight: boolean): void {
  const line = m.lines[0]!;
  const w = line.width;
  if (!(w > 0)) return;
  const fits = Math.floor((room - w) / (w + gap) + 1e-9) + 1;
  const n = Math.max(1, Math.min(fits, count !== undefined && count >= 1 ? Math.floor(count) : Infinity));
  if (n < 2) return;
  const base: DesignTextRun[] = line.runs ?? [{ text: line.text, fontString, width: w }];
  const r = base.length;
  const runs: DesignTextRun[] = [];
  for (let k = 0; k < n; k++) {
    for (const run of base) runs.push({ ...run });
    if (k < n - 1) runs.push({ text: ' ', fontString, width: gap });
  }
  // Copy k's runs start at k · (r + 1); the gap after it stands at
  // k · (r + 1) + r.
  const within = line.order ?? base.map((_, i) => i);
  if (line.order || startRight) {
    const order: number[] = [];
    const copies = Array.from({ length: n }, (_, k) => (startRight ? n - 1 - k : k));
    copies.forEach((k, j) => {
      for (const i of within) order.push(k * (r + 1) + i);
      if (j < n - 1) order.push(Math.min(k, copies[j + 1]!) * (r + 1) + r);
    });
    line.order = order;
  }
  line.runs = runs;
  line.text = runs.map((run) => run.text).join('');
  line.width = n * w + (n - 1) * gap;
  m.contentWidth = Math.max(m.contentWidth, line.width + (line.xOffset ?? 0));
}

/**
 * A text element of a contents part row whose text holds `{leader}`
 * (#889): one line, as wide as the room its placement gives it (an `auto`
 * width fills to the container's edge), the text before the mark at the
 * line's start, the text after it at its end, and between them the
 * contents' leader (`toc.leader`): its character repeated over the room
 * left, `gap` from either text, flush with the end so the leaders of the
 * rows line up, as an entry row's are (`pipeline/contents/toc.ts`). The text before
 * the mark gives way when the line is short of room (cut by the element's
 * `overflow`, `'ellipsis-end'` for a wrapping one); fewer than three
 * repeats, or a leader turned off, leave the room blank. A `{leader}`
 * alone keeps `gap` at both ends (#1121): its element sits between a title
 * and a page number set in elements of their own. The dots take the
 * leader's own colour and face when the contents give it one.
 */
function layoutLeaderTextElement(
  el: ResolvedDesignTextElement,
  text: string,
  leader: DesignLeader,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean },
): ResolvedTextPrimitive[] {
  const at = text.indexOf(LEADER_MARK);
  const before = text.slice(0, at).trimEnd();
  const after = text.slice(at + LEADER_MARK.length).split(LEADER_MARK).join('').trimStart();
  const autoWidth = el.placement.size?.width === undefined || el.placement.size.width === 'auto';
  const single = { ...el, overflow: el.overflow === 'wrap' ? 'ellipsis-end' as const : el.overflow, dropCap: undefined, paragraphIndent: undefined };
  // The row's box: the room the placement gives, one line high.
  const [box] = layoutTextElement(
    { ...single, overflow: 'clip', placement: autoWidth ? { ...el.placement, size: { ...el.placement.size, width: 'fill' } } : el.placement },
    `${before} ${after}`.trim() || ' ', pin, container, dpi, anchoredToElement, frame,
  );
  const row = box!;
  const room = row.contentWidth;
  const fontSizePx = row.fontSizePx;
  const gap = Math.max(0, dimPx(leader.gap, dpi, fontSizePx));
  // Each text on its own, as wide as it is set (cut to the room left).
  const part = (t: string, max: number): ResolvedTextPrimitive | undefined => (t
    ? layoutTextElement(
      { ...single, box: undefined, placement: { ...el.placement, size: { width: 'auto', maxWidth: { value: Math.max(0, max), unit: 'px' } } } },
      t, pin, container, dpi, anchoredToElement, frame,
    )[0]
    : undefined);
  const tail = part(after, room);
  const tailW = tail?.lines[0]?.width ?? 0;
  // A `{leader}` alone in its element (#1121) stands between two other
  // elements, a title and a page number set apart: `gap` from either.
  const lone = !before && !after;
  const gapBefore = before || lone ? gap : 0;
  const gapAfter = after || lone ? gap : 0;
  const gaps = gapBefore + gapAfter;
  const head = part(before, room - tailW - gaps);
  const headW = head?.lines[0]?.width ?? 0;
  const free = Math.max(0, room - headW - tailW - gaps);
  const tracking = row.letterSpacingPx;
  // The dots in a face of their own (#1121): the element's, with the
  // leader's family, size (`em` of the element's) and weight over it.
  const ownFace = leader.fontFamily !== undefined || leader.fontSize !== undefined || leader.fontWeight !== undefined;
  const dotsFont = ownFace
    ? buildFontString(
      leader.fontFamily ?? el.fontFamily,
      leader.fontSize ? dimPx(leader.fontSize, dpi, fontSizePx) : fontSizePx,
      (leader.fontWeight ?? el.fontWeight).toString(),
      el.italic ? 'italic' : 'normal',
    )
    : row.fontString;
  const dots = leader.enabled
    ? fitLeader(leader.char, free, (t) => Math.max(0, flowTextWidth(t, dotsFont) + tracking * graphemeCount(t)))
    : null;
  const runsOf = (p: ResolvedTextPrimitive | undefined): { runs: DesignTextRun[]; order?: number[] } => {
    const line = p?.lines[0];
    if (!line || !line.text) return { runs: [] };
    return { runs: line.runs ?? [{ text: line.text, fontString: p.fontString, width: line.width }], ...(line.order ? { order: line.order } : {}) };
  };
  const h = runsOf(head);
  const t = runsOf(tail);
  // The leader: blank room, the run, the gap before the text after it. A
  // blank run is a box as wide as its room (`inkOffset` 0).
  const blank = (width: number): DesignTextRun => ({ text: '', fontString: row.fontString, width, inkOffset: 0, leader: true });
  const fill = blank(gapBefore + free - (dots?.width ?? 0));
  const middle: DesignTextRun[] = dots
    ? [fill, { text: dots.text, fontString: dotsFont, width: dots.width, leader: true, ...(leader.color ? { color: leader.color } : {}) }, blank(gapAfter)]
    : [blank(room - headW - tailW)];
  const runs = [...h.runs, ...middle, ...t.runs];
  // Paint order: the text before the mark at the line's start, which is on
  // the right of a right-to-left row on the sheet and of a left-to-right
  // one in a mirrored flow; each text keeps its own order.
  const startRight = row.startRight === true;
  const ids = (n: number, from: number, order?: number[]) => (order ?? Array.from({ length: n }, (_, i) => i)).map((i) => i + from);
  const headIds = ids(h.runs.length, 0, h.order);
  const middleIds = ids(middle.length, h.runs.length);
  const tailIds = ids(t.runs.length, h.runs.length + middle.length, t.order);
  const order = startRight ? [...tailIds, ...middleIds.reverse(), ...headIds] : [...headIds, ...middleIds, ...tailIds];
  const identity = order.every((v, i) => v === i);
  const first = row.lines[0];
  const line: WrappedLine = {
    text: runs.map((r) => r.text).join(''),
    width: room,
    baselineY: first?.baselineY ?? 0,
    topY: first?.topY ?? 0,
    height: first?.height ?? 0,
    runs,
    ...(identity ? {} : { order }),
  };
  const truncated = head?.truncated ?? tail?.truncated;
  return [{
    ...row,
    lines: [line],
    align: 'left',
    needsClip: el.overflow === 'clip',
    ...(truncated ? { truncated } : { truncated: undefined }),
  }];
}

/**
 * One design text element laid out on its own, its box's top left corner at
 * `(x, y)` and nothing around it to clamp it: the text `text` as given (no
 * placeholders are read; inline marks are when `el.inlineMarks`). Set
 * vertically when `el.writingMode` is `'vertical-rl'` and the text is
 * measured horizontally now. Used by the comics lettering, which chooses
 * every line break itself (newlines) and sets each balloon as design text.
 */
export function layoutTextElementAt(
  el: ResolvedDesignTextElement,
  text: string,
  x: number,
  y: number,
  dpi: number,
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean; arabicNumbers?: boolean } = {},
): ResolvedTextPrimitive {
  const room = 1e6;
  const pin: AnchorResult = { anchorX: x, anchorY: y, pinX: 'start', pinY: 'start' };
  const container: AnchorReference = { x: x - room, y: y - room, width: 2 * room, height: 2 * room };
  const prims = el.writingMode === 'vertical-rl' && getMeasureWritingMode() !== 'vertical-rl'
    ? layoutVerticalTextElement(el, text, pin, container, dpi, false)
    : layoutTextElement(el, text, pin, container, dpi, false, frame);
  return prims[0]!;
}

const flipPin = (p: Pin): Pin => (p === 'start' ? 'end' : p === 'end' ? 'start' : 'middle');

/**
 * A text element set vertically (`writingMode: 'vertical-rl'`): laid out
 * as a horizontal text in the element's own frame turned a quarter turn
 * clockwise — its lines as long as the box is tall, stacked from the right
 * — and measured as vertical text (characters in their cells), then
 * turned back onto the page. A flow point `(fx, fy)` of that frame stands
 * at `(−fy, fx)` on the page, so the anchor, the pins and the container
 * turn with it: the top of the page is the start of a line, its right the
 * top of the frame. A drop cap is not set.
 */
function layoutVerticalTextElement(
  el: ResolvedDesignTextElement,
  resolvedText: string,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  anchoredToElement: boolean,
  seams?: readonly number[],
  chipStyles?: readonly ResolvedChipStyleConfig[],
): ResolvedTextPrimitive[] {
  const flowPin: AnchorResult = { anchorX: pin.anchorY, anchorY: -pin.anchorX, pinX: pin.pinY, pinY: flipPin(pin.pinX) };
  const flowContainer: AnchorReference = { x: container.y, y: -(container.x + container.width), width: container.height, height: container.width };
  const size = el.placement.size;
  const padding = el.box?.padding;
  const turned: ResolvedDesignTextElement = {
    ...el,
    dropCap: undefined,
    placement: {
      ...el.placement,
      size: {
        width: size?.height,
        height: size?.width,
        ...(size?.maxWidth !== undefined ? { maxWidth: size.maxWidth } : {}),
      },
    },
    ...(el.box
      ? { box: { ...el.box, ...(padding ? { padding: { top: padding.right, right: padding.bottom, bottom: padding.left, left: padding.top } } : {}) } }
      : {}),
  };
  const [main] = withMeasureWritingMode('vertical-rl', () => layoutTextElement(turned, resolvedText, flowPin, flowContainer, dpi, anchoredToElement, chipStyles ? { chipStyles } : {}, seams));
  return [{ ...main!, x: -(main!.y + main!.height), y: main!.x, width: main!.height, height: main!.width, vertical: true }];
}

function layoutRuleElement(
  el: ResolvedDesignRuleElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedRulePrimitive {
  const thicknessPx = dimPx(el.thickness, dpi);
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);

  let elementWidth: number;
  let elementHeight: number;
  if (el.direction === 'horizontal') {
    if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
      elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
    } else {
      elementWidth = widthSize;
    }
    elementHeight = typeof heightSize === 'number' ? heightSize : thicknessPx;
  } else {
    if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
      elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
    } else {
      elementHeight = heightSize;
    }
    elementWidth = typeof widthSize === 'number' ? widthSize : thicknessPx;
  }

  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);

  return {
    kind: 'rule',
    id: el.id,
    direction: el.direction,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    color: colorHex(el.color),
    thicknessPx,
  };
}

/** An image element: the resource its `resourceId` names once its
 *  placeholders are filled in (`{attr.<key>}`…), in the box its `placement.size` describes, with an
 *  `'auto'` side following the image's aspect ratio (both auto = the
 *  image's own pixel size) and the image fitted inside a fully sized box,
 *  centred. Nothing without a resolvable resource image. */
function layoutImageElement(
  el: ResolvedDesignImageElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
  resourceById: ReadonlyMap<string, Resource> | undefined,
  /** `el.resourceId` with its placeholders filled in. */
  resourceId: string,
  /** In a vertical flow: the picture stands upright on the sheet, where the
   *  box's width runs down the page, so the box takes the picture's height
   *  as its width and its width as its height. */
  upright = false,
): ResolvedImagePrimitive | undefined {
  const resource = resourceId ? resourceById?.get(resourceId) : undefined;
  const payload = resource?.bitmap ?? resource?.svg;
  const fileId = payload?.fileId;
  if (!fileId) return undefined;
  // A bitmap's own size is its pixels at its resolution (#631).
  const own = resource?.bitmap ? bitmapLayoutSize(resource.bitmap, dpi) : payload;
  const picW = own?.width && own.width > 0 ? own.width : 1;
  const picH = own?.height && own.height > 0 ? own.height : 1;
  const natW = upright ? picH : picW;
  const natH = upright ? picW : picH;
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  const fixedW = typeof widthSize === 'number' ? widthSize
    : widthSize === 'fill' ? Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container)) : undefined;
  const fixedH = typeof heightSize === 'number' ? heightSize
    : heightSize === 'fill' ? Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container)) : undefined;
  let boxW: number;
  let boxH: number;
  if (fixedW !== undefined && fixedH !== undefined) { boxW = fixedW; boxH = fixedH; }
  else if (fixedW !== undefined) { boxW = fixedW; boxH = fixedW * natH / natW; }
  else if (fixedH !== undefined) { boxH = fixedH; boxW = fixedH * natW / natH; }
  else { boxW = natW; boxH = natH; }
  const boxX = edgeXFromPin(pin.anchorX, pin.pinX, boxW);
  const boxY = edgeYFromPin(pin.anchorY, pin.pinY, boxH);
  if (el.fit === 'cover' && fixedW !== undefined && fixedH !== undefined && boxW > 0 && boxH > 0) {
    // Cover (#923): the box filled, the picture cropped, its safe area
    // kept (the comic panel's rule, `comics/art.ts`). An upright picture
    // of a vertical flow (#946) is cropped as the sheet shows it: in its
    // own upright frame, where the box is `boxH` wide and `boxW` tall.
    const cell = upright ? { x: 0, y: 0, width: boxH, height: boxW } : { x: boxX, y: boxY, width: boxW, height: boxH };
    const cut = comicArtCrop({ width: picW, height: picH, cell, fit: 'cover', ...(resource?.safeArea ? { safeArea: resource.safeArea } : {}), ...(el.focus ? { focus: el.focus } : {}) });
    const x0 = Math.max(cell.x, cut.box.x);
    const y0 = Math.max(cell.y, cut.box.y);
    const x1 = Math.min(cell.x + cell.width, cut.box.x + cut.box.width);
    const y1 = Math.min(cell.y + cell.height, cut.box.y + cut.box.height);
    const whole = cut.source.width >= 1 - 1e-6 && cut.source.height >= 1 - 1e-6;
    // The visible part back in the flow: the upright frame's x runs up the
    // flow's y from the box's foot, its y along the flow's x (the quarter
    // turn the backends paint an upright picture with).
    const shown = upright
      ? { x: boxX + y0, y: boxY + boxH - x1, width: Math.max(0, y1 - y0), height: Math.max(0, x1 - x0) }
      : { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
    return {
      kind: 'image',
      id: el.id,
      ...shown,
      fileId,
      ...(resource?.bitmap?.format ? { format: resource.bitmap.format } : {}),
      ...pictureTraits(resource, fileId),
      ...(whole ? {} : { crop: { ...cut.source } }),
      ...(upright ? { upright: true as const } : {}),
      ...altTextOf(el, resource),
    };
  }
  // Aspect-fit inside the box, centred.
  const scale = Math.min(boxW / natW, boxH / natH);
  const w = natW * scale;
  const h = natH * scale;
  return {
    kind: 'image',
    id: el.id,
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    width: w,
    height: h,
    fileId,
    ...(resource?.bitmap?.format ? { format: resource.bitmap.format } : {}),
    ...pictureTraits(resource, fileId),
    ...(upright ? { upright: true as const } : {}),
    ...altTextOf(el, resource),
  };
}

/** The `altText` field of an image primitive: none for a decorative
 *  element (see `DesignImageElement.decorative`). */
function altTextOf(el: ResolvedDesignImageElement, resource: Resource | undefined): { altText?: string } {
  if (el.decorative) return {};
  const altText = designImageAltText(resource);
  return altText ? { altText } : {};
}

/** The black of a path that sets neither a fill nor an outline (an SVG
 *  path's default fill). */
const DEFAULT_PATH_FILL = '#000000';
/** An outline's width when the element gives none: 0.5 pt, a rule's. */
const DEFAULT_PATH_STROKE_WIDTH: Dimension = { value: 0.5, unit: 'pt' };

/** A path element (#1060): its box sized and pinned as a box's, its
 *  `viewBox` stretched to the box (`'none'`) or fitted inside it, centred
 *  (`'meet'`), the outline in page px. Path data that cannot be read, or a
 *  `viewBox` with no area, gives no outline. */
function layoutPathElement(
  el: ResolvedDesignPathElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedPathPrimitive {
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  const width = typeof widthSize === 'number' ? widthSize : Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
  const height = typeof heightSize === 'number' ? heightSize : Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  const x = edgeXFromPin(pin.anchorX, pin.pinX, width);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, height);
  const prim: ResolvedPathPrimitive = { kind: 'path', id: el.id, x, y, width, height, subpaths: [] };
  const vb = pathViewBox(el.viewBox);
  const parsed = typeof el.d === 'string' ? parseSvgPathCached(el.d) : undefined;
  if (!vb || !parsed?.ok) return prim;
  let sx = width / vb[0];
  let sy = height / vb[1];
  let ox = x;
  let oy = y;
  if (el.preserveAspectRatio === 'meet') {
    const k = Math.min(sx, sy);
    ox += (width - vb[0] * k) / 2;
    oy += (height - vb[1] * k) / 2;
    sx = k;
    sy = k;
  }
  prim.subpaths = mapPath(parsed.subpaths, ox, oy, sx, sy);
  const fill = el.fill?.hex ?? (el.stroke ? undefined : DEFAULT_PATH_FILL);
  if (fill) prim.fill = fill;
  if (el.stroke?.hex) {
    const widthPx = dimPx(el.width ?? DEFAULT_PATH_STROKE_WIDTH, dpi);
    const dash = (Array.isArray(el.dash) ? el.dash : []).map((d) => Math.max(0, dimPx(d, dpi)));
    prim.stroke = {
      color: el.stroke.hex,
      widthPx: Math.max(0, widthPx),
      ...(dash.length > 0 && dash.some((v) => v > 0) ? { dash } : {}),
    };
  }
  return prim;
}

function layoutBoxElement(
  el: ResolvedDesignBoxElement,
  pin: AnchorResult,
  container: AnchorReference,
  dpi: number,
): ResolvedBoxPrimitive {
  const widthSize = resolveFixedSize(el.placement.size?.width, dpi);
  const heightSize = resolveFixedSize(el.placement.size?.height, dpi);
  let elementWidth: number;
  let elementHeight: number;
  if (widthSize === undefined || widthSize === 'auto' || widthSize === 'fill') {
    elementWidth = Math.max(0, fillToContainerEdge(pin.anchorX, pin.pinX, container));
  } else {
    elementWidth = widthSize;
  }
  if (heightSize === undefined || heightSize === 'auto' || heightSize === 'fill') {
    elementHeight = Math.max(0, fillToContainerEdgeY(pin.anchorY, pin.pinY, container));
  } else {
    elementHeight = heightSize;
  }
  const x = edgeXFromPin(pin.anchorX, pin.pinX, elementWidth);
  const y = edgeYFromPin(pin.anchorY, pin.pinY, elementHeight);
  const box = resolveBox(el.style, dpi) ?? {
    borderWidthPx: 0,
    borderRadiusPx: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return {
    kind: 'box',
    id: el.id,
    x,
    y,
    width: elementWidth,
    height: elementHeight,
    box,
  };
}
