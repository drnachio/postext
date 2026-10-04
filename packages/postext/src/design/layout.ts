import { flowTextWidth, getMeasureWritingMode, lineBaselineOffset, withMeasureWritingMode } from '../measure/vertical';
import type {
  AnchorEdge,
  ColorValue,
  DesignTextAlign,
  Dimension,
  ElementBoxStyle,
  ElementPlacement,
  ElementSize,
  PageParity,
  PageRole,
  PageRoleFilter,
  ResolvedDesignBoxElement,
  ResolvedDesignElement,
  ResolvedDesignImageElement,
  ResolvedDesignRuleElement,
  ResolvedDesignSlot,
  ResolvedDesignTextElement,
  Resource,
  TextOverflow,
  VAlign,
} from '../types';
import { dimensionToPx } from '../units';
import { resolveDesignLineHeight } from '../defaults/headerFooter';
import { createBoundingBox, pictureTraits, type BoundingBox } from '../vdt';
import { buildFontString } from '../measure';
import { graphemeCount } from '../measure/graphemes';
import { joiningScriptIn } from '../measure/joining';
import { parseInlineSnippetSpans } from '../parse/inlineSnippet';
import type { InlineSpan } from '../parse/types';
import { hyphenateText, withoutSlashJoints } from '../hyphenate';
import { withLineEndHyphen } from '../measure/geminate';
import { BREAKING_SPACE_RUNS_SPLIT_RE, NO_BREAK_SPACES, isBreakingSpaceRun } from '../measure/spaces';
import {
  resolveDesignResourceId,
  resolveDesignText,
  type DesignPlaceholderContext,
} from './placeholders';
import { hasJoiningScript, joinsWithNext } from '../bidi';
import { designBaseDirection, directRuns } from './bidiText';
import {
  RichMeasurer,
  ellipsisEndCut,
  ellipsisMiddleCut,
  ellipsisStartCut,
  parseRichDesignText,
  singleRichLine,
  wrapRich,
  type DesignTextRun,
  type RichLine,
} from './richText';

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
  padding: ResolvedPadding;
}

/** Resolved geometry for a single element in a design slot. */
export interface ResolvedElementGeometry {
  id: string;
  kind: 'text' | 'rule' | 'box' | 'image';
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
  /** Content box (inside padding) offsets, relative to element x/y. */
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  box?: ResolvedElementBox;
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
    else if (s.swatch || s.footnote) continue;
    else out += s.text;
  }
  return out.replace(PLACEHOLDER_RE, '');
}

/** The alternative text of a resource drawn by a design (#213): its
 *  `altText`, else its caption as plain text (inline formatting read,
 *  a chip by its label, forced line breaks as spaces, placeholders left
 *  out). Captions are not parsed for maths, so a `$` in one is read as
 *  it is printed. Undefined when it has neither. */
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
  | ResolvedImagePrimitive;

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

export interface LayoutIssue {
  kind: 'cyclicAnchor' | 'danglingAnchor';
  elementId: string;
  targetId?: string;
}

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
  /** The slot is painted in the flow of a mirrored (right-to-left) page:
   *  its x axis runs from the sheet's right edge, so the runs of a line go
   *  in the reverse of their visual order (see `design/bidiText.ts`). */
  mirrored?: boolean;
}

function pageMatchesParity(pageIndex: number, parity: PageParity): boolean {
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
  return {
    backgroundColor: style.backgroundColor?.hex,
    borderColor: style.borderColor?.hex,
    borderWidthPx: dimPx(style.borderWidth, dpi, baseFontSizePx),
    borderRadiusPx: dimPx(style.borderRadius, dpi, baseFontSizePx),
    padding: resolvePadding(style.padding, dpi, baseFontSizePx),
  };
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
  return {
    ...style,
    backgroundColor: overrideColor(style.backgroundColor, overrides),
    borderColor: overrideColor(style.borderColor, overrides),
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
  elements: ResolvedDesignElement[],
  issues: LayoutIssue[],
): ResolvedDesignElement[] {
  const byId = new Map<string, ResolvedDesignElement>();
  for (const el of elements) byId.set(el.id, el);

  // Detect dangling
  for (const el of elements) {
    const target = anchorTargetId(el.placement);
    if (target && !byId.has(target)) {
      issues.push({ kind: 'danglingAnchor', elementId: el.id, targetId: target });
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: ResolvedDesignElement[] = [];

  function visit(el: ResolvedDesignElement, path: string[]): void {
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
): { head: string; tail: string } | undefined {
  // Returns a split of the word where head (with trailing hyphen if hyphenated)
  // fits in maxWidth. Returns undefined if no split is possible.
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
    const hy = withoutSlashJoints(word, hyphenateText(word));
    if (hy.includes(SOFT_HYPHEN)) {
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
      if (best) return best;
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
  return { head: word.slice(0, lo), tail: word.slice(lo) };
}

function wrapToWidth(
  text: string,
  measure: TextMeasure,
  maxWidth: number,
  hyphenate: boolean,
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
          remaining = split.tail;
        }
      } else {
        out.push(current.replace(/\s+$/, ''));
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
            remaining = split.tail;
          }
        }
      }
    }
    if (current.length > 0) out.push(current.replace(/\s+$/, ''));
    else out.push('');
  }
  return out.length > 0 ? out : [''];
}

interface TextMeasurement {
  lines: WrappedLine[];
  contentWidth: number;
  contentHeight: number;
  needsClip: boolean;
}

/** Lines stacked from the top of the content box, `lineHeightPx` apart. */
function stackLines(rows: { text: string; width: number; runs?: DesignTextRun[] }[], lineHeightPx: number): WrappedLine[] {
  return rows.map((r, i) => ({
    text: r.text,
    width: r.width,
    topY: i * lineHeightPx,
    baselineY: i * lineHeightPx + lineHeightPx * 0.8,
    height: lineHeightPx,
    ...(r.runs ? { runs: r.runs } : {}),
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
    const lines = wrapToWidth(text, measure, maxContentWidth, hyphenate ?? false);
    const wrapped = stackLines(lines.map((t) => ({ text: t, width: measure(t) })), lineHeightPx);
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
    };
  }
  // ellipsis-*
  const mode: 'start' | 'end' | 'middle' =
    overflow === 'ellipsis-start' ? 'start'
    : overflow === 'ellipsis-middle' ? 'middle'
    : 'end';
  const lines = stackLines(rows.map((t) => {
    const visible = ellipsize(t, measure, maxContentWidth, mode);
    return { text: visible, width: measure(visible) };
  }), lineHeightPx);
  return {
    lines,
    contentWidth: lines.reduce((m, l) => Math.max(m, l.width), 0),
    contentHeight: lines.length * lineHeightPx,
    needsClip: false,
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
  const text = m.rt.text;
  for (const row of text.split('\n')) {
    const end = start + row.length;
    if (overflow === 'wrap') rows.push(...wrapRich(m, start, end, () => maxContentWidth, hyphenate ?? false));
    else rows.push(singleRichLine(m, start, end, maxContentWidth, overflow));
    start = end + 1;
  }
  const lines = stackLines(rows, lineHeightPx);
  const natural = lines.reduce((mx, l) => Math.max(mx, l.width), 0);
  return {
    lines,
    contentWidth: overflow === 'clip' ? Math.min(natural, maxContentWidth) : natural,
    contentHeight: lines.length * lineHeightPx,
    needsClip: overflow === 'clip',
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
  const a = resolveContainerAnchor(edge, ref);
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
  const candidates = slot.elements
    .filter((el) => pageMatchesParity(pageIndex, el.parity) && pageMatchesRole(el.pages, context.pageRole))
    .map((el) => (overrides && Object.keys(overrides).length > 0 ? applyPaletteOverrides(el, overrides) : el));

  // Topologically sort (dependencies first) to resolve geometry; paint
  // order is still the array order (first = back), restored below.
  const ordered = topoSort(candidates, issues);

  // Precompute: resolved text contents (placeholder-expanded), with the
  // `\n` escape of the template and of attribute values turned into a
  // newline before any case transform (which would make it `\N`).
  const textContent = new Map<string, string>();
  for (const el of ordered) {
    if (el.kind === 'text') {
      const text = resolveDesignText(el.content, context.placeholders);
      textContent.set(el.id, el.textTransform === 'uppercase' ? text.toLocaleUpperCase() : text);
    }
  }

  const resolvedGeo = new Map<string, ResolvedPrimitive>();
  // Primitives per element, keyed by the element itself (a text element may
  // emit several: drop cap, rich runs…), emitted in `candidates` order.
  const primsByElement = new Map<ResolvedDesignElement, ResolvedPrimitive[]>();

  for (const el of ordered) {
    const target = anchorTargetId(el.placement);
    let refGeo: AnchorReference = containerRef;
    // Page/bleed anchors use that frame both as the anchor reference and as
    // the bounds for `size: 'fill'` / auto-width clamping, so a band can run
    // edge to edge regardless of the slot container.
    let fillRef: AnchorReference = containerRef;
    let useElementEdge = false;
    const frame = frameFor(el.placement, context.frames);
    if (frame) {
      refGeo = frame;
      fillRef = frame;
    } else if (target) {
      const dep = resolvedGeo.get(target);
      if (dep) {
        refGeo = { x: dep.x, y: dep.y, width: dep.width, height: dep.height };
        useElementEdge = true;
      }
    }
    const anchor = useElementEdge
      ? resolveElementAnchor(el.placement.anchor.edge, refGeo)
      : resolveContainerAnchor(el.placement.anchor.edge, refGeo);

    // A text element's offset may be written in ems of its own size (a
    // running head four characters below the type area).
    const emPx = el.kind === 'text' ? dimPx(el.fontSize, context.dpi) : undefined;
    const offsetX = dimPx(el.placement.offset?.x, context.dpi, emPx);
    const offsetY = dimPx(el.placement.offset?.y, context.dpi, emPx);
    const anchorX = anchor.anchorX + offsetX;
    const anchorY = anchor.anchorY + offsetY;

    if (el.kind === 'text') {
      const pin: AnchorResult = { anchorX, anchorY, pinX: anchor.pinX, pinY: anchor.pinY };
      // A vertical element in a frame whose text is horizontal (a running
      // head on the sheet, a design of a horizontal page); in a vertical
      // flow the text already runs down.
      const prims = el.writingMode === 'vertical-rl' && getMeasureWritingMode() !== 'vertical-rl'
        ? layoutVerticalTextElement(el, textContent.get(el.id) ?? '', pin, fillRef, context.dpi, useElementEdge)
        : layoutTextElement(el, textContent.get(el.id) ?? '', pin, fillRef, context.dpi, useElementEdge, context);
      resolvedGeo.set(el.id, prims[0]!);
      primsByElement.set(el, prims);
    } else if (el.kind === 'rule') {
      const prim = layoutRuleElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(el, [prim]);
    } else if (el.kind === 'image') {
      const prim = layoutImageElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi, context.resourceById, resolveDesignResourceId(el.resourceId, context.placeholders), context.frames?.upright === true);
      if (prim) {
        resolvedGeo.set(el.id, prim);
        primsByElement.set(el, [prim]);
      }
    } else {
      const prim = layoutBoxElement(el, {
        anchorX,
        anchorY,
        pinX: anchor.pinX,
        pinY: anchor.pinY,
      }, fillRef, context.dpi);
      resolvedGeo.set(el.id, prim);
      primsByElement.set(el, [prim]);
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
function wrapWithWidths(text: string, measure: TextMeasure, widthFor: (i: number) => number, hyphenate: boolean, startLine = 0, fill = false): string[] {
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
  const splittable = (i: number): boolean => !pieces[i]!.stacked && !pieces[i - 1]?.stacked && !pieces[i]!.tcy && !pieces[i]!.orientation;
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
  /** The document's direction and the slot's frame (`LayoutContext`). */
  frame: { direction?: 'ltr' | 'rtl'; mirrored?: boolean } = {},
): ResolvedTextPrimitive[] {
  let text = resolvedText;
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
  const measure: TextMeasure = (t) => Math.max(0, flowTextWidth(t, fontString) + letterSpacingPx * graphemeCount(t));
  const measureIn = (t: string, font: string): number => Math.max(0, flowTextWidth(t, font) + letterSpacingPx * graphemeCount(t));
  const box = resolveBox(el.box, dpi, fontSizePx);
  const padding: ResolvedPadding = box?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  // Inline marks: a text that carries any is laid out in runs; one that
  // carries none (only escapes) is plain text with its markers resolved.
  const rich = el.inlineMarks
    ? parseRichDesignText(text, { family: el.fontFamily, sizePx: fontSizePx, weight: el.fontWeight, italic: el.italic })
    : undefined;
  const richM = rich?.hasMarks ? new RichMeasurer(rich, letterSpacingPx) : undefined;
  if (rich && !rich.hasMarks) text = rich.text;
  // The base direction: the element's, `'auto'` from its first strong
  // letter, else the document's. Vertical text is not reordered.
  const vertical = getMeasureWritingMode() === 'vertical-rl';
  const base = vertical ? 'ltr' : designBaseDirection(el.direction, richM ? richM.rt.text : text, frame.direction ?? 'ltr');
  const mirrored = !vertical && frame.mirrored === true;
  const strokeWidthPx = el.stroke ? Math.max(0, dimPx(el.stroke.width, dpi, fontSizePx)) : 0;
  const stroke = el.stroke && strokeWidthPx > 0
    ? { widthPx: strokeWidthPx, color: colorHex(el.stroke.color ?? el.color), ...(el.stroke.hollow ? { hollow: true } : {}) }
    : undefined;

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
      const lines: { text: string; width: number; runs?: DesignTextRun[]; wordSpacingPx?: number }[] = richM
        ? wrapRich(richM, paraRanges[p]![0], paraRanges[p]![1], (i) => maxW - offsetOf(i), el.hyphenate ?? false, fill)
        : wrapWithWidths(para, measure, (i) => maxW - offsetOf(i), el.hyphenate ?? false, 0, fill).map((t) => ({ text: t, width: measure(t) }));
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
        });
        lineNo++;
      });
    });
    const w = wrapped.reduce((mx, l) => Math.max(mx, l.width + (l.xOffset ?? 0)), 0);
    m = { lines: wrapped, contentWidth: w, contentHeight: wrapped.length * lineHeightPx, needsClip: false };
  } else if (richM && contentMax !== undefined) {
    m = layoutRichText(richM, lineHeightPx, el.overflow, contentMax, el.hyphenate);
  } else {
    m = layoutText(text, measure, lineHeightPx, el.overflow, contentMax, el.hyphenate);
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
    for (const line of m.lines) {
      const runs: DesignTextRun[] = line.runs ?? [{ text: line.text, fontString, width: line.width }];
      const spacing = line.wordSpacingPx ?? 0;
      const directed = directRuns(runs, base, mirrored, (r, t) => measureIn(t, r.fontString) + spacing * stretchableSpaces(t));
      if (!directed) continue;
      line.runs = directed.runs;
      if (directed.order) line.order = directed.order;
    }
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
    letterSpacingPx,
    ...(base === 'rtl' ? { direction: 'rtl' as const } : {}),
    ...((base === 'rtl') !== mirrored ? { startRight: true as const } : {}),
    contentX: padding.left,
    contentY: padding.top,
    contentWidth: Math.max(0, elementWidth - padding.left - padding.right),
    contentHeight: Math.max(0, elementHeight - padding.top - padding.bottom),
    box,
    ...(stroke ? { stroke } : {}),
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
  const [main] = withMeasureWritingMode('vertical-rl', () => layoutTextElement(turned, resolvedText, flowPin, flowContainer, dpi, anchoredToElement));
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
  const picW = payload?.width && payload.width > 0 ? payload.width : 1;
  const picH = payload?.height && payload.height > 0 ? payload.height : 1;
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
  // Aspect-fit inside the box, centred.
  const scale = Math.min(boxW / natW, boxH / natH);
  const w = natW * scale;
  const h = natH * scale;
  const boxX = edgeXFromPin(pin.anchorX, pin.pinX, boxW);
  const boxY = edgeYFromPin(pin.anchorY, pin.pinY, boxH);
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
