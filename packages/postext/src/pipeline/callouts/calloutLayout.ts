/**
 * `:::callout{type="…"}` containers — boxed content (notes, tips, warnings,
 * objectives) styled by a `CalloutStyleConfig`.
 *
 * `layoutCallout` lays out one callout — decoration frame, optional title
 * and the child blocks — against a given width, in block-relative
 * coordinates (frame origin = `(0,0)`). It is pure in `width`, so the
 * placement code can re-run it when a callout lands in a column of a
 * different width, and the pagination phase (`spanBlocks`) can run it at
 * page width for `span: 'page'` boxes. `offsetCalloutToAbsolute` then moves
 * the whole result to its final page position.
 *
 * Children are measured with the ordinary per-block measurer against a
 * *derived* resolved config (`deriveCalloutResolvedConfig`) whose body text
 * and list sections carry the style's `body` / `lists` overrides, so the
 * existing style resolvers produce the callout typography unchanged.
 *
 * A style's `marker` adds a column *outside* the box on its left — an icon
 * with an optional vertical rule — so the frame is `[marker][rule][gap][box]`
 * and as tall as the tallest of the three; the box keeps its own icon,
 * background and padding.
 *
 * A style with `keepTogether: false` may be split by the placement code
 * between its children; every fragment is laid out here as a box of its own
 * (`continuation` drops the title and icon of the later ones).
 *
 * A `:::callout` fence inside a box is a box of its own: laid out
 * recursively with its own style at the parent's inner width, it stacks
 * as one child of the parent (its `marginTop` / `marginBottom` collapse
 * with its neighbours like a paragraph's). Its `span` and `placement` are
 * ignored — it always flows inside its parent. Its frame and children join
 * the parent's flat child list (frame first) and keep the top-level box's
 * `containerId`, so placement and balancing still see one unit;
 * `calloutPath` records the nesting. A fragment of a split box that opens
 * or ends inside a nested box (`openNested`, an unclosed nested fence)
 * redraws the nested frame too, as a continuation when it opens inside it.
 *
 * Limit: `width: 'auto'` shrink-wraps the title only and ignores the
 * children.
 */

import { scoreInfoOf } from '../resources/scoreBlocks.js';
import { flowTextWidth, lineBaselineOffset, measuringVertically } from '../../measure/vertical.js';
import { getMeasureLanguage, onTextWidthCacheClear, measureLanguageKey } from '../../measure/canvas.js';
import { designLineOf } from '../../design/cjkText.js';
import type { ContentBlock, DirectiveAttrs } from '../../parse/index.js';
import { suffixJoiner } from '../../parse/inlineFormatting.js';
import { spaceDirectiveLines } from '../../parse/attrs.js';
import type {
  CalloutPlacement,
  CalloutSpan,
  ColorValue,
  Dimension,
  ResolvedCalloutDesignConfig,
  ResolvedCalloutStyleConfig,
} from '../../types.js';
import { dimensionToPx } from '../../units.js';
import {
  type BoundingBox,
  createBoundingBox,
  createVDTBlock,
  pictureTraits,
  type ResolvedConfig,
  type VDTLine,
  type ResolvedResourceBlock,
  type VDTBlock,
  type VDTDesignBlock,
  type VDTDesignBoxBlock,
  type VDTDesignSlot,
  type VDTDesignTextBlock,
  type VDTExclusionContour,
} from '../../vdt.js';
import { contourInsetSteps, shiftContour } from '../../contour/index.js';
import { buildFontString, measureBlock, measureRichBlock } from '../../measure/index.js';
import { graphemeCount } from '../../measure/graphemes.js';
import { applyStyleAttrs, isMarkerBlock, widthLessEndIndent } from '../blocks/buildHelpers.js';
import { resetLinePositions } from '../blocks/placement.js';
import { raggedLooseLines } from '../text/raggedLines.js';
import { resolveBodyStyle, resolveBlockquoteStyle } from '../styles.js';
import { computeLevelIndentsPx, computeOrderedLevelIndentsPx, directListMarker, listBulletPosition, listItemGapPx, mirrorListMarker } from '../text/lists.js';
import { measureContentBlock, type BlockMeasureContext, type MeasureContentBlockOptions } from '../blocks/measureContentBlock.js';
import { measureBlockMemo, type MeasureMemo } from '../composedPages/measureMemo.js';
import { uppercasePreservingLength } from '../blocks/buildBlockKind.js';
import { headingIsHidden, headingStyleOf } from '../sections/headingStyles.js';
import { tocBlockStamps } from '../contents/toc.js';
import { directDesignTextBlock } from '../../design/bidiText.js';
import { arabicNumbersOf } from '../config.js';
import { containerStyle, paragraphStyleIdOf, restyleContainerFor, type ParagraphContainerPlan } from './paragraphContainers.js';
import { joiningScriptIn } from '../../measure/joining.js';
import { getMeasureArabicNumbers, getMeasureDirection, shiftLineX } from '../../measure/bidiLines.js';
import { resolvedCodeStyle } from '../../defaults/codeStyle.js';
import { parseLengthText } from '../../defaults/tabStops.js';
import { isFlowColumnsStyle } from '../columns/flowColumns.js';
import { FRAME_STYLE_ID } from '../../composed/wrap.js';
import { fillGalley, galleyBreaks, minFillHeight, type GalleyItem } from '../columns/columnsGroup.js';
import type { LineInsetStep } from '../../measure/types.js';
import type { CalloutLineWidth, GroupPos } from '../columns/cutTypes.js';
import { offsetPathBlock } from '../../design/pathBlock.js';
import { iconShapeBlock } from '../../design/iconShape.js';
import { borderSidesPx, boxOutline, cornerRadiiPx, isCornerRadii, normalizeBoxStyle, shapePathBlocks, SHAPE_SIDES, tabRegionOutline, uniformRadius, type ShapeBorder, type ShapeTab } from '../../design/boxShape.js';
export type { CalloutLineWidth, GroupPos } from '../columns/cutTypes.js';

// ---------------------------------------------------------------------------
// Pre-pass: callout ranges keyed by the start marker's content-block index.
// ---------------------------------------------------------------------------

export interface PlannedCallout {
  /** Index of the matching `containerEnd` marker. */
  endIdx: number;
  /** Attributes parsed from the opening fence. */
  attrs: DirectiveAttrs;
  /** Parser `containerId` shared by the marker pair. */
  containerId: number;
}

/** Map every `containerStart{callout}` index to its range. Resolved up front
 *  (like `:::paragraphs`) because keep-with-next rollbacks rewind the
 *  placement loop and replay blocks. Unclosed containers are auto-closed by
 *  the parser, so every start has an end. */
export function planCallouts(contentBlocks: readonly ContentBlock[]): Map<number, PlannedCallout> {
  const plan = new Map<number, PlannedCallout>();
  const openByIdx = new Map<number, number>(); // containerId → startIdx
  for (let i = 0; i < contentBlocks.length; i++) {
    const b = contentBlocks[i]!;
    if (b.containerName !== 'callout' || b.containerId === undefined) continue;
    if (b.type === 'containerStart') {
      openByIdx.set(b.containerId, i);
    } else if (b.type === 'containerEnd') {
      const startIdx = openByIdx.get(b.containerId);
      if (startIdx === undefined) continue;
      openByIdx.delete(b.containerId);
      const start = contentBlocks[startIdx]!;
      plan.set(startIdx, { endIdx: i, attrs: start.containerAttrs ?? {}, containerId: b.containerId });
    }
  }
  return plan;
}

/** The style a `:::callout{type="…"}` selects: the matching id, else the
 *  first configured style (`collectContentWarnings` reports an unknown type
 *  in `doc.contentWarnings`). */
export function pickCalloutStyle(
  styles: readonly ResolvedCalloutStyleConfig[],
  type: string | undefined,
): ResolvedCalloutStyleConfig | undefined {
  if (styles.length === 0) return undefined;
  if (type) {
    const match = styles.find((s) => s.id === type);
    if (match) return match;
  }
  // The build's own boxes (page-span embeds, code listings) are no style
  // an unknown type falls back to.
  return styles.find((s) => !s.id.startsWith('__postext-'));
}

// ---------------------------------------------------------------------------
// Derived config: body/list overrides folded into the resolved config.
// ---------------------------------------------------------------------------

/** Shallow copy of `resolved` whose `bodyText`, `unorderedLists` and
 *  `orderedLists` carry the callout style's `body` / `lists` overrides, so
 *  `resolveBodyStyle`, the list item resolvers and the indent cascade yield
 *  the callout typography without any callout-specific branches (the
 *  body's `italic` / `smallCaps` ride on `bodyText` for that). Child
 *  headings (rare) keep the normal heading styles. */
export function deriveCalloutResolvedConfig(
  resolved: ResolvedConfig,
  style: ResolvedCalloutStyleConfig,
): ResolvedConfig {
  // A main-flow group's box (#634) lends its blocks nothing: they are set
  // as the text around them.
  if (isFlowColumnsStyle(style.id)) return resolved;
  const { body, lists } = style;
  const ul = resolved.unorderedLists;
  const ol = resolved.orderedLists;
  // Level-specific bullets/colours only follow the override when it actually
  // differs from the general value they were resolved from — a style that
  // inherits keeps the document's per-level bullets intact (and so does one
  // that repeats the document's bullet or colour: its nested levels keep
  // their dashes).
  const bulletOverride = lists.bulletChar !== ul.bulletChar;
  const colorOverride = lists.color.hex !== ul.color.hex;
  // The numbers of ordered lists take the box's colour whenever the style
  // sets it, also to the document's bullet colour (EF-92): the ordered lists
  // have a colour of their own, which an unset `lists.color` leaves alone.
  // A resolved style without the flag (built by hand) keeps the old rule.
  const numberColorOverride = lists.colorSet === true || colorOverride;
  // The bullet's face (#1103): the style's own, else the level's. A bullet
  // size of its own sets a level whose face was only the body's in the
  // box's body face, as before; a list or level face of its own (a symbol
  // face) is kept.
  const bulletFamily = (levelFamily: string): string | undefined =>
    lists.bulletFontFamily
      ?? (lists.bulletFontSize && levelFamily === resolved.bodyText.fontFamily ? body.fontFamily : undefined);
  // List margins of the box's own (#1103), on ordered lists too; unset,
  // the document's.
  const listMargins = {
    ...(lists.marginTop ? { marginTop: lists.marginTop } : {}),
    ...(lists.marginBottom ? { marginBottom: lists.marginBottom } : {}),
  };
  // A paragraph style's unset type fields take the box's body (#1119):
  // the face, size, leading, weights and colour the style leaves to the
  // body text are the box's here. A configuration that pins the rule of
  // postext 1.51 (`paragraphStylesInBoxes: 'document'`) keeps the
  // document's.
  const boxBody = {
    fontFamily: body.fontFamily,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    fontWeight: body.fontWeight,
    boldFontWeight: body.boldFontWeight,
    color: body.color,
  };
  const paragraphStyles = resolved.bodyText.paragraphStylesInBoxes === 'document'
    || !resolved.paragraphStyles.some((s) => s.inheritsBody)
    ? resolved.paragraphStyles
    : resolved.paragraphStyles.map((s) => (s.inheritsBody
      ? { ...s, ...Object.fromEntries(s.inheritsBody.map((f) => [f, boxBody[f]])) }
      : s));
  return {
    ...resolved,
    paragraphStyles,
    bodyText: {
      ...resolved.bodyText,
      fontFamily: body.fontFamily,
      fontSize: body.fontSize,
      lineHeight: body.lineHeight,
      color: body.color,
      boldColor: body.boldColor ?? body.color,
      ...(body.italicColor ? { italicColor: body.italicColor } : {}),
      fontWeight: body.fontWeight,
      boldFontWeight: body.boldFontWeight,
      ...(body.italic ? { italic: true } : {}),
      ...(body.smallCaps ? { smallCaps: true } : {}),
      ...(body.letterSpacing ? { letterSpacing: body.letterSpacing } : {}),
      textAlign: body.textAlign,
      hyphenation: { ...resolved.bodyText.hyphenation, enabled: body.hyphenation },
      paragraphSpacing: body.paragraphSpacing,
      firstLineIndent: body.firstLineIndent,
      // The box's own tab stops replace the body's (#622).
      ...(body.tabStops ? { tabStops: body.tabStops } : {}),
      ...(body.tabInterval ? { tabInterval: body.tabInterval } : {}),
    },
    unorderedLists: {
      ...ul,
      bulletChar: lists.bulletChar,
      color: lists.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      ...listMargins,
      levels: ul.levels.map((l) => {
        const fontFamily = bulletFamily(l.fontFamily);
        return {
          ...l,
          bulletChar: bulletOverride ? lists.bulletChar : l.bulletChar,
          color: colorOverride ? lists.color : l.color,
          ...(lists.bulletFontSize ? { fontSize: lists.bulletFontSize } : {}),
          ...(fontFamily ? { fontFamily } : {}),
          ...(lists.bulletFontWeight !== undefined ? { fontWeight: lists.bulletFontWeight } : {}),
        };
      }),
    },
    orderedLists: {
      ...ol,
      color: numberColorOverride ? lists.color : ol.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
      ...listMargins,
      levels: ol.levels.map((l) => ({ ...l, color: numberColorOverride ? lists.color : l.color })),
    },
  };
}

/** Measurement context for the children: the derived config plus the body
 *  / blockquote styles and list indents recomputed from it. Ordered-list run
 *  metrics (number widths) are kept from the document context — they were
 *  measured with the document's list font, a close-enough approximation. */
export function deriveCalloutMeasureContext(
  ctx: BlockMeasureContext,
  style: ResolvedCalloutStyleConfig,
): BlockMeasureContext {
  // A main-flow group's box and a composed page's frameless story (#855)
  // lend their children nothing: they are set as the text around them.
  if (isFlowColumnsStyle(style.id) || style.id === FRAME_STYLE_ID) return ctx;
  const resolved = deriveCalloutResolvedConfig(ctx.resolved, style);
  const bodyStyle = resolveBodyStyle(resolved);
  return {
    ...ctx,
    resolved,
    bodyStyle,
    blockquoteStyle: resolveBlockquoteStyle(resolved),
    listLevelIndentsPx: computeLevelIndentsPx(resolved, bodyStyle.fontSizePx),
    orderedLevelIndentsPx: computeOrderedLevelIndentsPx(
      resolved,
      bodyStyle.fontSizePx,
      ctx.orderedMetrics.maxWidthByDepth,
    ),
  };
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface CalloutLayoutInput {
  style: ResolvedCalloutStyleConfig;
  /** Fence attributes (`type`, `title`, `span`, `placement`). */
  attrs: DirectiveAttrs;
  /** Content blocks between the markers (marker blocks of nested containers
   *  are skipped). */
  children: readonly ContentBlock[];
  /** Content-block index of `children[0]` — children keep their real index
   *  so neighbour lookups (indent-after-heading, list runs) work. */
  childStartIdx: number;
  /** Frame width to lay out against (column or page width). */
  width: number;
  ctx: BlockMeasureContext;
  resolved: ResolvedConfig;
  /** Parser `containerId` of the fence pair, stamped on the frame and children. */
  containerId: number;
  /** Block ids: the frame's own id and a generator for the children. */
  frameId: string;
  nextChildId: () => string;
  /** The document's `:::paragraphs` containers (see
   *  `planParagraphContainers`): a child inside one is set in its style,
   *  and the container's margins are applied around it as in running text. */
  paragraphContainers?: ParagraphContainerPlan;
  /** Source offset of the markdown body inside the original document. */
  bodyOffset?: number;
  /** Lay out a continuation fragment of a split box (`keepTogether:
   *  false`): the frame keeps its background, border, stripe and marker but
   *  drops the title and the in-box icon — the head already carries them
   *  (a style with `repeatTitle` repeats the title with its
   *  `continuedSuffix`). */
  continuation?: boolean;
  /** The fragment is followed by another one (a split box's head or middle
   *  part): a style with `continuesMarkerEnabled` sets its marker under
   *  the last line. */
  continues?: boolean;
  /** Line-level cuts of a split box: skip the first `lineFrom` text lines
   *  of the first child (a continuation opening inside a paragraph — its
   *  bullet, if a list item, stays with the head), and keep only the first
   *  `lineTo` lines of the last child (a head cut inside a paragraph).
   *  Ignored for children that are not text runs (figures, display math). */
  lineFrom?: number;
  lineTo?: number;
  /** The box widths (as `width`) the first child's lines up to `lineFrom`
   *  were counted at, in line order: from line `fromLine` on, at `width`.
   *  Set when a split box goes on in a column of another width than the
   *  fragments before it (a one-and-a-half layout with text in both
   *  columns): the first child is broken again as they set it, its lines
   *  from `lineFrom` on for this `width`, so no text is lost or repeated
   *  at the cut. Without it the child is measured at `width` alone. */
  lineWidths?: readonly CalloutLineWidth[];
  /** The box lands on a verso of mirrored margins: an `'outer'` corner icon
   *  hangs on the left corner there. */
  mirrored?: boolean;
  /** The box's own direction (its fence's `{dir}`, or one it sits in:
   *  `ContentBlock.direction` of the opening marker). Against the
   *  document's, its `'start'` / `'end'` stripe, corner and label tab
   *  turn to the other side (#371). */
  direction?: 'ltr' | 'rtl';
  /** Nested boxes a continuation fragment opens inside, outermost first:
   *  their opening markers are not among `children`, which start inside
   *  the innermost one. Each is redrawn as a continuation box around the
   *  children up to its closing marker (or the end of `children`). */
  openNested?: readonly OpenNestedCallout[];
  /** `calloutPath` of the box's frame and children: set when the box is
   *  itself nested (see `VDTBlock.calloutPath`). */
  nestPath?: readonly number[];
  /** The fragment opens inside the `:::columns` group whose opening marker
   *  is `children[0]` (#634): each of its streams (one for a `'snake'`
   *  group) from its position, positions counted in `children`. */
  groupFrom?: readonly GroupPos[];
  /** The fragment ends inside the group whose closing marker is the last
   *  of `children`: each stream up to its position (exclusive). */
  groupTo?: readonly GroupPos[];
  /** Lays out a comic strip among the children (`:::strip`, the one a
   *  page-wide strip's box holds, #590): its block `width` wide, its lines
   *  relative to its box, or undefined to leave it out. Without it strips
   *  are left out, as other directives are. */
  stripBlock?: (raw: ContentBlock, blockIdx: number, width: number) => VDTBlock | undefined;
  /** The measurements of the layout this box is part of (a composed
   *  page's, #953): a child measured at a width already measured is
   *  not measured again. */
  measureMemo?: MeasureMemo;
  /** A frame of a composed page (#855): the block's exact height (its tab
   *  included). The box is drawn this tall; content shorter than it sits
   *  as `verticalAlign` says, content taller runs past the box's foot
   *  (`CalloutLayoutResult.overflowPx`, clipped by the backends). */
  boxHeight?: number;
  /** Where the content sits in a `boxHeight` taller than it. Default
   *  `'top'`; `'justify'` spreads the space between the box's items. */
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'justify';
  /** Rectangles, in the block's coordinates (its origin at the top-left of
   *  its marker column and tab), that the box's text runs round (#855,
   *  `exclude: 'push'` frames): a line meeting one is set short on the
   *  side the rectangle covers. Applied to the text children that open in
   *  the range laid out; a figure or a formula is not moved. One with a
   *  `contour` (#883, in the same coordinates) sets each line short by the
   *  shape's width beside it instead. */
  exclusions?: readonly BoxExclusion[];
  /** A frame of a composed page whose pictures the reflow ladder scales
   *  (#858, `fit.imageMinScale`): each bitmap, SVG or video poster among
   *  the children is set at this share of the width it would take, below
   *  1. */
  pictureScale?: number;
  /** A frame set in a vertical mode on a horizontal page (#960), which
   *  the page turns a quarter turn: its pictures are laid out upright in
   *  a frame counter-rotated against it (`ResourceLayoutInput.upright`),
   *  at most this wide on the page (the frame's extent across its lines),
   *  so that they and their captions read as on any page. */
  uprightMaxLength?: number;
  /** The room a heading's own design takes in the box (#906): the
   *  `advancedDesign` of its level or heading style, laid out against the
   *  heading's box `width` wide, as in a page column. Answers the height
   *  the design reserves below the heading's top, or `undefined` when the
   *  heading has no design (its lines alone then set its height). The
   *  heading keeps at least that height; the design itself is laid out
   *  over the placed block after placement (`buildHeadersAndFooters`).
   *  Absent: headings in boxes reserve nothing for a design. */
  headingDesign?: BoxHeadingDesign;
  /** A continuation fragment that opens on another page than the piece
   *  before it (#917, a frame's `overflow.fromMark`): words set at its
   *  head, in the box's body face as the continuation marker is, before
   *  the first child ("Continued from page 47"). */
  continuedMark?: string;
  /** The style's design (#1014, `ResolvedCalloutStyleConfig.design`),
   *  measured and laid out in a band under the title. Absent: a style's
   *  design draws nothing. */
  boxDesign?: BoxDesign;
  /** The whole box's content as its design reads it (`boxTextOf`), when
   *  `children` is not all of it. Absent: read from `children`. */
  boxText?: readonly string[];
}

/** What a box's design reads (see `CalloutLayoutInput.boxDesign`): the
 *  title the box prints and the fence's attributes. */
export interface BoxDesignInfo {
  titleText: string;
  attrs: Readonly<Record<string, string>>;
  /** The box's content as plain text, a paragraph or list item each. */
  boxText: readonly string[];
}

/** The box's own content as a box design reads it (`{boxText}`, #1014):
 *  the plain text of each paragraph and list item, in order, a nested
 *  box's included; blank ones left out. */
export function boxTextOf(children: readonly ContentBlock[]): string[] {
  const out: string[] = [];
  for (const c of children) {
    if (c.type !== 'paragraph' && c.type !== 'listItem') continue;
    const text = c.text.trim();
    if (text.length > 0) out.push(text);
  }
  return out;
}

/** Measures and lays out a box style's design (#1014): `measure` answers
 *  the height of the band the design takes `width` wide (its `minHeight`
 *  included), `layout` its blocks laid out against `band`, box-relative.
 *  `rtl` / `mirrored`: the box's text is right-to-left, painted in a
 *  mirrored flow (as the box's own title is). */
export interface BoxDesign {
  measure(design: ResolvedCalloutDesignConfig, info: BoxDesignInfo, width: number): number;
  layout(
    design: ResolvedCalloutDesignConfig,
    info: BoxDesignInfo,
    band: { x: number; y: number; width: number; height: number },
    flow: { rtl: boolean; mirrored: boolean },
  ): VDTDesignBlock[];
}

/** See `CalloutLayoutInput.headingDesign`. `lines` are the heading's
 *  measured lines (the title is joined back from them, as in a column). */
export type BoxHeadingDesign = (
  raw: ContentBlock,
  blockIdx: number,
  heading: { lines: readonly VDTLine[]; numberPrefix: string; headingNumber?: number },
  width: number,
) => number | undefined;

/** The headings of boxes laid out with their own design (#906): their
 *  lines are not painted (the design replaces them), so a box never cuts
 *  between them. */
const designedBoxHeadings = new WeakSet<VDTBlock>();
/** Whether `block` is a heading of a box set with its own design (see
 *  `CalloutLayoutInput.headingDesign`). */
export const isDesignedBoxHeading = (block: VDTBlock): boolean => designedBoxHeadings.has(block);
/** Mark `to`, a copy of `from`, as a designed heading when `from` is one. */
export const copyDesignedBoxHeading = (from: VDTBlock, to: VDTBlock): void => {
  if (designedBoxHeadings.has(from)) designedBoxHeadings.add(to);
};

/** The measures of `layoutCallout`'s first child across widths (see
 *  `CalloutLayoutInput.lineWidths`), per resolved configuration and
 *  content block: a build lays a split box out again on every pass. */
let acrossWidthsMemo = new WeakMap<ResolvedConfig, WeakMap<ContentBlock, Map<string, ReturnType<typeof measureContentBlock> | undefined>>>();
// Measures: dropped with the widths when faces change (#629).
onTextWidthCacheClear(() => {
  acrossWidthsMemo = new WeakMap();
});


/** An enclosing nested fence a fragment opens inside (see `openNested`). */
export interface OpenNestedCallout {
  /** Content index of its opening marker. */
  idx: number;
  block: ContentBlock;
}

/** A nested box laid out inside its parent (see {@link CalloutUnit}). */
export interface NestedCalloutLayout {
  result: CalloutLayoutResult;
  style: ResolvedCalloutStyleConfig;
  /** Content index of the nested fence's opening marker. */
  startIdx: number;
  /** Content index of its closing marker; `undefined` when the laid-out
   *  range ends inside the box. */
  endIdx?: number;
}

/** A direct item of a laid-out box: a child block, or a nested box (whose
 *  frame and blocks also sit in the flat `children`). */
export type CalloutUnit =
  | { kind: 'block'; block: VDTBlock }
  | { kind: 'box'; box: NestedCalloutLayout };

export interface CalloutLayoutResult {
  /** The frame block (`type: 'callout'`); decoration on `designOverlay`. */
  frame: VDTBlock;
  /** Content blocks in reading order, block-relative to the frame origin —
   *  a nested box's frame followed by its own blocks, recursively. */
  children: VDTBlock[];
  /** The box's direct items in reading order (the split code walks them). */
  units: CalloutUnit[];
  /** Frame width actually used (`width`, or the shrink-wrapped width for
   *  `width: 'auto'`). */
  width: number;
  totalHeight: number;
  /** Top margin in px (applied by the caller through pending spacing). */
  marginTopPx: number;
  /** Bottom margin in px (baked into the post-callout grid snap). */
  marginBottomPx: number;
  /** Height the style's continuation marker adds to a fragment that goes
   *  on (`continuesMarkerEnabled`); 0 without one. The split code ranks its
   *  cuts with it. */
  continuesMarkerPx: number;
  /** With `boxHeight`: the height of the content that runs past the box's
   *  foot (0 when it fits). */
  overflowPx?: number;
  /** The `:::columns` groups among the box's own children (not a nested
   *  box's), as laid out: where a fragment may cut inside them (#634). */
  groups?: CalloutGroupLayout[];
}


/** A `:::columns` group as a box laid it out (see
 *  `CalloutLayoutResult.groups`). */
export interface CalloutGroupLayout {
  /** Positions in the box's children of its opening and closing markers. */
  open: number;
  close: number;
  /** `'parallel'` only with streams (`breaks`). */
  flow: 'snake' | 'parallel';
  columns: number;
  columnWidth: number;
  /** The group's top in the box (frame-relative px). */
  top: number;
  /** The galley of each stream (one for a snake group), from where this
   *  layout starts it; each galley's `y` from 0 at its first item. */
  streams: GalleyItem[][];
  /** Where each stream ends: the position of the next stream's first
   *  child, the closing marker's for the last. */
  ends: number[];
  /** Content index of the opening marker. */
  contentIndex: number;
  /** The sub-columns are narrower than six ems of the box's text. */
  narrow?: true;
}

/** The attributes of a `:::columns` fence (#634). */
export interface ColumnsSpec {
  count: number;
  gapPx: number;
  rule: boolean;
  flow: 'snake' | 'parallel';
  breaks?: number[];
  /** The space the fence asks for above and under the group (`marginTop`,
   *  `marginBottom`, #714). Absent: none of its own. */
  marginTopPx?: number;
  marginBottomPx?: number;
}

/** A `marginTop` / `marginBottom` of a `:::columns` fence (#714): a length
 *  as `gap` writes it, in pixels. A value that does not parse, or a
 *  negative one, is ignored. */
export function fenceMarginPx(value: string | undefined, emPx: number, dpi: number): number | undefined {
  const d = value !== undefined ? parseLengthText(value) : undefined;
  if (!d) return undefined;
  const v = dimensionToPx(d, dpi, emPx);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Read a `:::columns` fence: `count` (2 by default, at most 6), `gap` (a
 *  length; else `defaultGapPx`), `rule` (a rule down each gutter), `breaks`
 *  (the children that open each column after the first) and `flow`
 *  (`'parallel'` by default with `breaks`, `'snake'` without; an unknown
 *  value takes the default), and the space above and under the group
 *  (`marginTop`, `marginBottom`, #714). */
export function columnsSpecOf(attrs: DirectiveAttrs, defaultGapPx: number, emPx: number, dpi: number): ColumnsSpec {
  const count = Number.parseInt(attrs.count ?? '2', 10);
  const breaks = (attrs.breaks ?? '').split(',').map((v) => Number.parseInt(v.trim(), 10)).filter((v) => Number.isFinite(v) && v > 1);
  const gap = attrs.gap !== undefined ? parseLengthText(attrs.gap) : undefined;
  const gapPx = gap ? dimensionToPx(gap, dpi, emPx) : defaultGapPx;
  const flow = attrs.flow === 'snake' || attrs.flow === 'parallel' ? attrs.flow : breaks.length > 0 ? 'parallel' : 'snake';
  const marginTopPx = fenceMarginPx(attrs.marginTop, emPx, dpi);
  const marginBottomPx = fenceMarginPx(attrs.marginBottom, emPx, dpi);
  return {
    count: Number.isFinite(count) ? count : 2,
    gapPx: Number.isFinite(gapPx) && gapPx >= 0 ? gapPx : defaultGapPx,
    rule: attrs.rule !== undefined && attrs.rule !== 'false',
    flow,
    ...(breaks.length > 0 ? { breaks } : {}),
    ...(marginTopPx !== undefined ? { marginTopPx } : {}),
    ...(marginBottomPx !== undefined ? { marginBottomPx } : {}),
  };
}

const VALID_SPANS: ReadonlySet<string> = new Set(['column', 'page', 'side']);
const VALID_PLACEMENTS: ReadonlySet<string> = new Set(['here', 'auto', 'top', 'bottom', 'fixed']);

/** Per-instance span / placement: fence attribute when valid, else the style. */
export function resolveCalloutAttrs(
  style: ResolvedCalloutStyleConfig,
  attrs: DirectiveAttrs,
): { span: CalloutSpan; placement: CalloutPlacement; title: string; label: string } {
  const span = attrs.span !== undefined && VALID_SPANS.has(attrs.span)
    ? (attrs.span as CalloutSpan)
    : style.span;
  const placement = attrs.placement !== undefined && VALID_PLACEMENTS.has(attrs.placement)
    ? (attrs.placement as CalloutPlacement)
    : style.placement;
  const title = attrs.title !== undefined ? attrs.title : style.title;
  const label = attrs.label ?? '';
  return { span, placement, title, label };
}

/** Shift a resolved resource block's caption/table geometry by `(ox, oy)`. */
function offsetResourceBlock(rb: ResolvedResourceBlock, ox: number, oy: number): void {
  // A block set upright in a turned frame (#960) keeps its geometry in its
  // own frame; only that frame's origin moves.
  if (rb.rotation) {
    rb.rotation.originX += ox;
    rb.rotation.originY += oy;
    return;
  }
  for (const ln of rb.captionLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  for (const ln of rb.noteLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  for (const ln of rb.continuesLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  if (rb.captionBar) { rb.captionBar.rect.x += ox; rb.captionBar.rect.y += oy; }
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += ox; cell.rect.y += oy;
      if (cell.image) { cell.image.rect.x += ox; cell.image.rect.y += oy; }
      for (const cl of cell.lines) { cl.bbox.x += ox; cl.bbox.y += oy; cl.baseline += oy; }
    }
  }
}

/** Shift one block (lines, bullet, resource geometry) by `(ox, oy)`. */
export function offsetBlock(blk: VDTBlock, ox: number, oy: number): void {
  blk.bbox.x += ox;
  blk.bbox.y += oy;
  for (const line of blk.lines) {
    shiftLineX(line, ox);
    line.bbox.y += oy;
    line.baseline += oy;
  }
  if (blk.bulletOffsetX !== undefined) blk.bulletOffsetX += ox;
  if (blk.separatorX !== undefined) blk.separatorX += ox;
  if (blk.prefixX !== undefined) blk.prefixX += ox;
  if (blk.bulletY !== undefined) blk.bulletY += oy;
  if (blk.bulletBaselineY !== undefined) blk.bulletBaselineY += oy;
  if (blk.dropCap) {
    blk.dropCap.x += ox;
    blk.dropCap.baselineY += oy;
    if (blk.dropCap.hang) {
      blk.dropCap.hang.x += ox;
      blk.dropCap.hang.baselineY += oy;
    }
  }
  if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, ox, oy);
  // A nested box's frame carries its decoration on the overlay.
  if (blk.designOverlay) {
    blk.designOverlay.bbox.x += ox;
    blk.designOverlay.bbox.y += oy;
    for (const b of blk.designOverlay.blocks) offsetDesignBlock(b, ox, oy);
  }
}

/** Shift one block of a design slot by `(ox, oy)`. */
export function offsetDesignBlock(b: VDTDesignBlock, ox: number, oy: number): void {
  // A vector shape (#1055): its box, outline and markers.
  if (b.kind === 'path') {
    offsetPathBlock(b, ox, oy);
    return;
  }
  b.bbox.x += ox;
  b.bbox.y += oy;
  if (b.kind === 'text') {
    for (const line of b.lines) line.baselineY += oy;
  }
  if (b.kind === 'box' && b.clip) {
    b.clip.x += ox;
    b.clip.y += oy;
  }
}

/** Move a laid-out callout from frame-relative to absolute page coordinates
 *  with the frame's top-left at `(x, y)`. */
export function offsetCalloutToAbsolute(result: CalloutLayoutResult, x: number, y: number): void {
  const { frame } = result;
  frame.bbox = createBoundingBox(x, y, result.width, result.totalHeight);
  if (frame.designOverlay) {
    frame.designOverlay.bbox.x += x;
    frame.designOverlay.bbox.y += y;
    for (const b of frame.designOverlay.blocks) offsetDesignBlock(b, x, y);
  }
  for (const child of result.children) offsetBlock(child, x, y);
}

/**
 * Reads a box's `'start'` / `'end'` sides (#371) as flow sides: `'left'` /
 * `'right'` for a box that runs with the document, the other way round for
 * one set against it (`direction`, the box's own). Any other side is kept.
 */
function logicalSides(direction: 'ltr' | 'rtl' | undefined): <T extends string>(side: T | 'start' | 'end') => Exclude<T, 'start' | 'end'> | 'left' | 'right' {
  const turned = direction !== undefined && direction !== getMeasureDirection();
  return <T extends string>(side: T | 'start' | 'end') => {
    if (side === 'start') return turned ? 'right' : 'left';
    if (side === 'end') return turned ? 'left' : 'right';
    return side as Exclude<T, 'start' | 'end'>;
  };
}

/**
 * Lay out one callout at `width`. Everything is frame-relative; see
 * {@link offsetCalloutToAbsolute}.
 */
export function layoutCallout(input: CalloutLayoutInput): CalloutLayoutResult {
  const { style, attrs, childStartIdx, ctx, containerId, frameId } = input;
  // A design that sets the box's content (#1014) prints it in its band:
  // the children are not laid out again.
  const designSetsContent = !!input.boxDesign && !!style.design?.enabled && style.design.setsContent
    && style.design.slot.elements.length > 0;
  const children = designSetsContent ? [] : input.children;
  const dpi = input.resolved.page.dpi;
  const derivedCtx = deriveCalloutMeasureContext(ctx, style);
  const bodyStyle = derivedCtx.bodyStyle;
  // The document's `:::paragraphs` containers as this box sets them: a
  // style's unset type fields in the box's body (#1119).
  const restyleContainer = restyleContainerFor(derivedCtx.resolved, input.resolved.paragraphStyles);
  const em = bodyStyle.fontSizePx;
  const px = (d: Dimension): number => dimensionToPx(d, dpi, em);

  const { span, placement, title: rawTitle, label: labelText } = resolveCalloutAttrs(style, attrs);
  const isAuto = style.width === 'auto';
  /** The frameless box of a `:::columns` group in the running text. */
  const flowGroupBox = isFlowColumnsStyle(style.id);
  // The title, the continuation marker and the label are design text set
  // here by hand: in a right-to-left document their lines are ordered at
  // that base direction, for the mirrored flow the box is painted in.
  const rtlDocument = input.resolved.direction === 'rtl';
  const mirroredFlow = rtlDocument && input.resolved.layout.writingMode !== 'vertical-rl';
  const directText = (block: VDTDesignTextBlock, trackingPx = 0): VDTDesignTextBlock => {
    directDesignTextBlock(block, rtlDocument ? 'rtl' : 'ltr', mirroredFlow, trackingPx, arabicNumbersOf(input.resolved));
    return block;
  };

  // --- Marker column (outside the box, on its left) --------------------------
  const hasMarker = iconPresent(style.marker);
  const markerSize = hasMarker ? px(style.marker.size) : 0;
  const ruleOn = hasMarker && style.marker.rule.enabled;
  const ruleW = ruleOn ? px(style.marker.rule.width) : 0;
  const markerColumn = hasMarker ? markerSize + ruleW + px(style.marker.gap) : 0;

  // --- Box geometry ------------------------------------------------------------
  // Everything below is box-relative (box origin = `(0,0)`); the marker
  // column shifts the box right (and down, when the marker is taller) at
  // the end.
  const padT = px(style.padding.top);
  const padR = px(style.padding.right);
  const padB = px(style.padding.bottom);
  const padL = px(style.padding.left);
  // `'start'` / `'end'` sides are the box's own (#371): the flow's left
  // and right, turned over in a box set against the document's direction.
  const boxSide = logicalSides(input.direction);
  const stripeSide = boxSide(style.stripe.side);
  const stripeOn = style.stripe.enabled;
  const stripeW = stripeOn ? px(style.stripe.width) : 0;
  const sideStripe = stripeOn && stripeSide !== 'top';
  const stripeLeft = sideStripe && stripeSide === 'left';
  const stripeRight = sideStripe && stripeSide === 'right';
  const topStripe = stripeOn && stripeSide === 'top';

  // The icon is drawn on the head only (`hasIcon`), but its geometry is
  // the box's on every fragment.
  const iconOn = iconPresent(style.icon);
  const hasIcon = !input.continuation && iconOn;
  const iconSize = iconOn ? px(style.icon.size) : 0;
  const iconBoxW = iconOn && style.icon.width ? Math.max(iconSize, px(style.icon.width)) : iconSize;
  const gapPx = px(style.titleStyle.gap);
  // The icon takes its own column only when there is no side stripe to sit
  // over. A continuation keeps that column, empty (EF-114): a box has one
  // measure in columns of one width, and a continuation that opens inside a
  // paragraph (`lineFrom`) wraps its text as the head counted it, line
  // `lineFrom` on, nothing lost or doubled. In a column of another width
  // the paragraph is broken again as the fragments before counted it
  // (`lineWidths`).
  const cornerIcon = style.icon.position === 'corner';
  // A corner badge hangs on the top-right corner — or the left one, for an
  // `'outer'` badge on a verso of mirrored margins (`'inner'` on a recto).
  const cornerSide = boxSide(style.icon.cornerSide);
  const cornerRight = cornerSide === 'right'
    || (cornerSide === 'outer' && !input.mirrored)
    || (cornerSide === 'inner' && !!input.mirrored);
  const iconColumnKept = iconOn && !sideStripe && !cornerIcon;
  const iconColumn = iconColumnKept ? iconBoxW + gapPx : 0;
  // A corner badge is centred on its corner by the width it is drawn at: a
  // wide strip (`icon.width`) hangs half its width past the border, not
  // half its height (EF-142).
  const cornerIconW = cornerIcon && iconOn ? iconFootprintWidth(style.icon, iconSize, iconBoxW, ctx) : iconSize;

  const innerX = (stripeLeft ? stripeW : 0) + padL + iconColumn;
  const innerTop = (topStripe ? stripeW : 0) + padT;
  // The label tab's rise (see "Label tab" below), known here so a frame's
  // exclusions and exact height (#855) are read in box coordinates.
  // A `bottom-` tab (#1059) hangs from the foot instead; a joined tab
  // stands on the edge, out of the box by its whole height.
  const labelShown = !!style.label && !input.continuation && labelText.trim().length > 0;
  const labelAtFoot = labelShown && typeof style.label!.position === 'string' && style.label!.position.startsWith('bottom-');
  const labelJoined = labelShown && style.label!.joined === true;
  const labelOut = !labelShown ? 0
    : labelJoined ? dimensionToPx(style.label!.height, dpi, dimensionToPx(style.label!.fontSize, dpi, em))
      : Math.max(0, px(style.label!.offset));
  const riseAhead = labelShown && !labelAtFoot ? labelOut : 0;
  const dropAhead = labelAtFoot ? labelOut : 0;
  const exclusions = (input.exclusions ?? []).map((e): BoxExclusion => ({
    x: e.x - markerColumn, y: e.y - riseAhead, width: e.width, height: e.height,
    ...(e.contour ? { contour: shiftContour(e.contour, -markerColumn, -riseAhead) } : {}),
  }));

  // --- Title -----------------------------------------------------------------
  // A continuation repeats the title, with its suffix, only when the style
  // asks for it (`repeatTitle`); the repeat is pagination furniture.
  const repeatedTitle = !!input.continuation && style.repeatTitle && rawTitle.trim().length > 0;
  const suffix = repeatedTitle ? style.continuedSuffix.trim() : '';
  const shownTitle = suffix.length > 0 ? `${rawTitle}${suffixJoiner(suffix)}${suffix}` : rawTitle;
  const titleText = style.titleStyle.textTransform === 'uppercase'
    ? uppercasePreservingLength(shownTitle)
    : shownTitle;
  const titleFontPx = dimensionToPx(style.titleStyle.fontSize, dpi, em);
  const titleFont = buildFontString(
    style.titleStyle.fontFamily,
    titleFontPx,
    style.titleStyle.fontWeight.toString(),
    style.titleStyle.italic ? 'italic' : 'normal',
  );
  // The title's leading (EF-182): `em` / `rem` count its own size; 1.2 em
  // unless the style sets one.
  const titleLh = style.titleStyle.lineHeight ?? { value: 1.2, unit: 'em' as const };
  const titleLineHeight = titleLh.unit === 'em' || titleLh.unit === 'rem'
    ? titleFontPx * titleLh.value
    : dimensionToPx(titleLh, dpi, titleFontPx);
  // A title in a joining script (Arabic…) is set untracked: spacing its
  // letters apart breaks the joins (`measure/joining.ts`). A negative
  // tracking tightens the title (#1098), as it does a heading.
  const titleTrackingRaw = dimensionToPx(style.titleStyle.letterSpacing, dpi, titleFontPx);
  const titleTrackingPx = joiningScriptIn(titleText) || !Number.isFinite(titleTrackingRaw) ? 0 : titleTrackingRaw;
  // A corner badge on the left hangs half over the title's side: the title
  // starts past it (its inner half plus the icon gap), at least — a
  // configured `indent` only adds beyond that room.
  const cornerLeftRoom = hasIcon && cornerIcon && !cornerRight ? Math.max(0, cornerIconW / 2 + gapPx - padL) : 0;
  const titleIndentPx = Math.max(cornerLeftRoom, dimensionToPx(style.titleStyle.indent, dpi, titleFontPx));
  const hasTitle = (!input.continuation || repeatedTitle) && titleText.trim().length > 0;
  const titleWidthOf = (t: string): number => flowTextWidth(t, titleFont) + titleTrackingPx * graphemeCount(t);

  // Box width: `fill` uses the given width less the marker column; `auto`
  // shrink-wraps the title.
  let boxWidth = input.width - markerColumn;
  let innerWidth: number;
  if (isAuto) {
    const titleW = hasTitle ? titleWidthOf(titleText) + titleIndentPx : 0;
    innerWidth = Math.max(1, titleW);
    boxWidth = innerX + innerWidth + padR + (stripeRight ? stripeW : 0);
  } else {
    innerWidth = Math.max(1, boxWidth - innerX - padR - (stripeRight ? stripeW : 0));
  }

  let cursorY = innerTop;
  const overlayBlocks: VDTDesignBlock[] = [];
  let titleBlock: VDTDesignTextBlock | undefined;
  if (hasTitle) {
    const titleW = Math.max(1, innerWidth - titleIndentPx);
    // Tracking only changes line widths on the rich path: the plain breaker
    // would fit an untracked line and a tracked title would overrun the box
    // (or, tightened, break earlier than it needs to).
    const measured = titleTrackingPx !== 0
      ? measureRichBlock(
        [{ text: titleText, bold: false, italic: false }],
        titleFont, titleFont, titleFont, titleFont, titleW, titleLineHeight,
        { textAlign: 'left', letterSpacingPx: titleTrackingPx },
      )
      : measureBlock(titleText, titleFont, titleW, titleLineHeight, { textAlign: 'left' });
    const lines = measured.lines.length > 0
      ? measured.lines
      : [{ text: titleText, bbox: createBoundingBox(0, 0, titleW, titleLineHeight), baseline: lineBaselineOffset(titleLineHeight, titleFont), hyphenated: false }];
    const titleHeight = lines.length * titleLineHeight;
    // A line the CJK composer set carries what it spaced in its segments:
    // a Han–Latin space, a mark that gave up blank. A design line with no
    // runs is painted at its glyphs' own advances, so the line was as
    // wide as the composer made it and its text ended short of that: the
    // title `Sandboxでやってみよう` at 31.25 px, 360.91 px wide, was
    // painted 353.09 px, the quarter em between `Sandbox` and `で` gone.
    // Such a line takes the runs a design text has (`designLineOf`), each
    // with its box, as a heading design with the same text does (#770).
    // In a document shaped in its own language; one that keeps its host's
    // keeps the lines it had.
    const titleFonts = { normal: titleFont, bold: titleFont, italic: titleFont, boldItalic: titleFont };
    const composedRuns = getMeasureLanguage() !== undefined
      ? (ln: VDTLine) => (ln.cjkComposed ? designLineOf(ln, titleFonts, (t, font) => flowTextWidth(t, font) + titleTrackingPx * graphemeCount(t)).runs : undefined)
      : () => undefined;
    titleBlock = directText({
      kind: 'text',
      bbox: createBoundingBox(innerX + titleIndentPx, cursorY, titleW, titleHeight),
      fontString: titleFont,
      color: style.titleStyle.color.hex,
      lines: lines.map((ln, i) => {
        const runs = composedRuns(ln as VDTLine);
        return {
          text: ln.text,
          xOffset: 0,
          baselineY: cursorY + i * titleLineHeight + lineBaselineOffset(titleLineHeight, titleFont),
          width: ln.bbox.width,
          ...(runs ? { runs } : {}),
        };
      }),
      clip: false,
      ...(titleTrackingPx !== 0 ? { letterSpacingPx: titleTrackingPx } : {}),
      ...(repeatedTitle ? { artifact: true } : {}),
    }, titleTrackingPx);
    cursorY += titleHeight;
  }
  // "Continued from …" at the head of a piece that opens on another page
  // (#917): pagination furniture, as the "Continued" marker is.
  const fromText = input.continuation ? (input.continuedMark ?? '').trim() : '';
  let fromBlock: VDTDesignTextBlock | undefined;
  if (fromText.length > 0) {
    const font = buildFontString(style.body.fontFamily, em, style.body.fontWeight.toString(), style.continuesMarkerItalic ? 'italic' : 'normal');
    const lh = bodyStyle.lineHeightPx;
    const { lines } = measureRichBlock([{ text: fromText, bold: false, italic: false }], font, font, font, font, innerWidth, lh, { textAlign: 'left' });
    if (lines.length > 0) {
      const top = cursorY;
      const align = style.continuesMarkerAlign;
      fromBlock = directText({
        kind: 'text',
        bbox: createBoundingBox(innerX, top, innerWidth, lines.length * lh),
        fontString: font,
        color: bodyStyle.color,
        lines: lines.map((ln, i) => {
          const slack = Math.max(0, innerWidth - ln.bbox.width);
          return { text: ln.text, xOffset: align === 'right' ? slack : align === 'center' ? slack / 2 : 0, baselineY: top + i * lh + lineBaselineOffset(lh, font), width: ln.bbox.width };
        }),
        clip: false,
        artifact: true,
      });
      cursorY += lines.length * lh;
    }
  }

  // --- Design band (#1014) ---------------------------------------------------
  // The style's design takes a band across the inner width under the
  // title (the title's gap between them), on the box's first fragment
  // only; the children follow it, the gap again before the first.
  const design = !input.continuation && input.boxDesign && style.design?.enabled && style.design.slot.elements.length > 0
    ? style.design
    : undefined;
  let designBlocks: VDTDesignBlock[] = [];
  let banded = false;
  if (design) {
    const info: BoxDesignInfo = { titleText: shownTitle, attrs, boxText: input.boxText ?? boxTextOf(input.children) };
    const bandH = input.boxDesign!.measure(design, info, innerWidth);
    if (bandH > 0) {
      const top = cursorY + (hasTitle ? gapPx : 0);
      designBlocks = input.boxDesign!.layout(
        design,
        info,
        { x: innerX, y: top, width: innerWidth, height: bandH },
        { rtl: rtlDocument, mirrored: mirroredFlow },
      );
      cursorY = top + bandH;
      banded = true;
    }
  }

  // --- Children --------------------------------------------------------------
  // The children stack under the title; a `:::columns{count=N}` group among
  // them lays its own children out in N columns of equal width, cut at
  // the line boundaries that level the columns best, and takes the height
  // of the tallest column.
  const childBlocks: VDTBlock[] = [];
  const units: CalloutUnit[] = [];
  /** The `:::columns` groups among the box's own children, as laid out
   *  (#634), and the rules down their gutters. */
  const groupLayouts: CalloutGroupLayout[] = [];
  const groupRules: VDTDesignBlock[] = [];
  /** The lines of the box's code listing a fence highlights (#624),
   *  box-relative. */
  const highlights: { y: number; height: number }[] = [];
  const nestPath = input.nestPath && input.nestPath.length > 0 ? input.nestPath : undefined;
  const columnGapPx = px(style.columnGap);
  /** Stacking state shared by the box and each columns group. */
  interface Stack {
    cursorY: number;
    prevMarginBottom: number;
    /** `prevMarginBottom` comes from a negative `:::paragraphs` margin: it
     *  applies as it is instead of collapsing with the next block's top
     *  margin of zero. */
    pull: boolean;
    prevWasListItem: boolean;
    /** The list item placed last, when `prevWasListItem`: its item spacing
     *  and depth, for the space before the next item (EF-165). */
    prevListItem?: { spacingPx: number; depth: number };
    first: boolean;
    /** A `:::space` before the first child counts (see `addSpace`). */
    keepLeadingSpace: boolean;
  }
  /** A `:::space` between children: body lines of the box's own type.
   *  Before the first child it is dropped, like at the top of a column —
   *  the padding already sets the content off the frame — unless it opens
   *  the head of a box under its title, or the box holds nothing else (an
   *  answer box sized by its space); at the top of a `:::columns` group or
   *  of a split box's continuation it always vanishes. */
  const addSpace = (raw: ContentBlock, st: Stack): void => {
    if (raw.type !== 'directive' || raw.directiveName !== 'space') return;
    if (st.first && !st.keepLeadingSpace) return;
    st.cursorY += (spaceDirectiveLines(raw.directiveAttrs) ?? 1) * bodyStyle.lineHeightPx;
  };
  /** The gap an inline resource keeps in the box (`layout.inlineResourceGapInBoxes`):
   *  a line of the box's text, above it and, with `inlineResourceGap:
   *  'around'`, below it. None when off (postext 1.4). */
  const resourceGapPx = input.resolved.layout.inlineResourceGapInBoxes ? bodyStyle.lineHeightPx : 0;
  const resourceGapBelow = input.resolved.layout.inlineResourceGap !== 'above';
  const isFirstRealOf = (k: number): boolean => children.slice(0, k).every((c) => c.type === 'directive' || isMarkerBlock(c));
  const isLastRealOf = (k: number): boolean => children.slice(k + 1).every((c) => c.type === 'directive' || isMarkerBlock(c));
  /** The widths of `lineWidths` as a child's measure: a child set `width`
   *  wide in a box `input.width` wide is that much narrower at every box
   *  width (the box's padding, stripe, icon and marker columns stay). */
  const childWidthAt = (boxWidth: number, width: number): number => Math.max(1, width - (input.width - boxWidth));
  /** The first child of a continuation that goes on in a column of another
   *  width than the fragments before it (`lineWidths`), measured as they
   *  counted its lines and, from `lineFrom` on, for this box: the lines
   *  the earlier fragments placed keep their breaks. `undefined` when the
   *  child is measured at `width` alone: no width changed, the child is
   *  not the first one or opens at its head, or its placed lines cannot
   *  be set again as they were (then it is sliced from a measure at
   *  `width`, as before). */
  const measureFirstChildAcrossWidths = (
    raw: ContentBlock,
    blockIdx: number,
    k: number,
    width: number,
    styleOverride: MeasureContentBlockOptions['styleOverride'],
  ) => {
    const history = input.lineWidths;
    const lineFrom = input.lineFrom ?? 0;
    if (!history || history.length === 0 || lineFrom <= 0 || !isFirstRealOf(k)) return undefined;
    if (history.every((h) => Math.abs(h.width - input.width) <= 0.5)) return undefined;
    // Every fragment's measure: the head's, then each one after it, which
    // keeps the lines the fragments before it placed and breaks the rest
    // for its own width. The one this fragment is set from is the last.
    const last = history[history.length - 1]!;
    const widths = Math.abs(last.width - input.width) <= 0.5
      ? history
      : [...history, { fromLine: lineFrom, width: input.width }];
    return measureAcrossSteps(raw, blockIdx, styleOverride, lineFrom, widths.map((h) => ({ fromLine: h.fromLine, columnWidth: childWidthAt(h.width, width) })));
  };
  /** A child set from line `lineFrom` on, its lines measured at the widths
   *  of `steps` (the child's own measures, in line order), the lines placed
   *  before kept as they were: see `measureFirstChildAcrossWidths`. A
   *  paragraph of a `:::columns` group that goes on in sub-columns of
   *  another width uses it too (#634). */
  const measureAcrossSteps = (
    raw: ContentBlock,
    blockIdx: number,
    styleOverride: MeasureContentBlockOptions['styleOverride'],
    lineFrom: number,
    steps: readonly { fromLine: number; columnWidth: number }[],
  ) => {
    // A split tries many cuts from the same start, and these measures are
    // not cached by the measurement cache (they break at several widths).
    let perBlock = acrossWidthsMemo.get(input.resolved);
    if (!perBlock) acrossWidthsMemo.set(input.resolved, (perBlock = new WeakMap()));
    let memo = perBlock.get(raw);
    if (!memo) perBlock.set(raw, (memo = new Map()));
    const styleAt = input.resolved.calloutStyles.indexOf(style);
    const base = steps[0]!.columnWidth;
    let prev: ReturnType<typeof measureContentBlock> | undefined;
    for (let i = 0; i < steps.length; i++) {
      const key = `${measureLanguageKey()}${styleAt}|${blockIdx}|${steps.slice(0, i + 1).map((st) => `${st.fromLine}:${st.columnWidth}`).join(',')}`;
      if (memo.has(key)) {
        prev = memo.get(key);
        if (!prev) return undefined;
        continue;
      }
      let next: ReturnType<typeof measureContentBlock> | undefined;
      if (i === 0) {
        next = measureContentBlock(raw, blockIdx, base, derivedCtx, { styleOverride }) ?? undefined;
      } else if (prev) {
        const keep = steps[i]!.fromLine;
        const breaks = prev.measured.breaks;
        const keepBreaks = breaks && breaks.at.length >= keep ? { path: breaks.path, at: breaks.at.slice(0, keep) } : undefined;
        const again = measureContentBlock(raw, blockIdx, base, derivedCtx, {
          styleOverride,
          restColumnWidths: steps.slice(1, i + 1),
          ...(keepBreaks ? { keepBreaks } : {}),
          // No shorter setting for a runt: its tracking would part the
          // lines kept from the ones placed before.
          looseness: 0,
        });
        const a = again?.measured.lines ?? [];
        const b = prev.measured.lines;
        next = again && (again.letterSpacingPx ?? 0) === (prev.letterSpacingPx ?? 0) && a.length > keep && b.length >= keep
          && b.slice(0, keep).every((l, j) => a[j]!.text === l.text && a[j]!.hyphenated === l.hyphenated)
          ? again
          : undefined;
      }
      memo.set(key, next);
      if (!next) return undefined;
      prev = next;
    }
    return prev && prev.measured.lines.length > lineFrom ? prev : undefined;
  };
  /** A comic strip the box lays out (see `stripBlock`). */
  const isStripChild = (raw: ContentBlock): boolean =>
    input.stripBlock !== undefined && raw.type === 'directive' && raw.directiveName === 'strip' && raw.comic !== undefined;
  /** Lay out a comic strip child at `width` from `x`: an atomic block with
   *  the gap of an inline resource around it, as in running text. */
  const placeStripChild = (raw: ContentBlock, k: number, width: number, x: number, st: Stack, into: VDTBlock[], unitsInto: CalloutUnit[]): VDTBlock | undefined => {
    const blk = input.stripBlock!(raw, childStartIdx + k, width);
    if (!blk) return undefined;
    const marginTopPx = resourceGapPx;
    const marginBottomPx = resourceGapBelow ? resourceGapPx : 0;
    st.cursorY += st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, marginTopPx);
    const height = blk.bbox.height;
    blk.containerId = containerId;
    if (nestPath) blk.calloutPath = [...nestPath];
    blk.bbox = createBoundingBox(x, st.cursorY, width, height);
    for (const line of blk.lines) {
      shiftLineX(line, x);
      line.bbox.y += st.cursorY;
      line.baseline += st.cursorY;
    }
    into.push(blk);
    unitsInto.push({ kind: 'block', block: blk });
    st.cursorY += height;
    st.prevMarginBottom = marginBottomPx;
    st.pull = false;
    st.prevWasListItem = false;
    st.prevListItem = undefined;
    st.first = false;
    return blk;
  };
  /** Lay out one child at `width` from `x`, appending it to `into` and
   *  advancing the stack. `lineCut`: the lines of the child to keep, in
   *  place of the box's own line cuts — a paragraph of a `:::columns` group
   *  a fragment opens (`from`) or ends (`to`) inside (#634); `widths` are
   *  the sub-column widths its lines before `from` were set at. */
  const placeChild = (
    raw: ContentBlock,
    k: number,
    width: number,
    x: number,
    st: Stack,
    into: VDTBlock[],
    unitsInto: CalloutUnit[],
    lineCut?: { from: number; to?: number; widths?: readonly CalloutLineWidth[] },
  ): VDTBlock | undefined => {
    if (isStripChild(raw)) return placeStripChild(raw, k, width, x, st, into, unitsInto);
    // The repeat of a contents block's head row (#850): set where the
    // fragment goes on in a cut block, skipped everywhere else (#983), as
    // the running text sets it only at the head of a fresh column.
    if (raw.toc?.group?.role === 'continuation' && !isFirstRealOf(k)) return undefined;
    const blockIdx = childStartIdx + k;
    // Inside a `:::paragraphs` container: its style, and for the block that
    // closes it the tail style, which carries the container's bottom margin.
    const container = restyleContainer(input.paragraphContainers?.byBlock[blockIdx]);
    const next = children[k + 1];
    const isContainerTail = container !== undefined && next?.type === 'containerEnd' && next.containerId === container.id;
    const styleOverride = container ? containerStyle(container, isContainerTail, bodyStyle, derivedCtx.resolved.page.dpi) : undefined;
    const groupWidths = lineCut?.widths;
    const acrossGroup = lineCut && lineCut.from > 0 && groupWidths && groupWidths.some((h) => Math.abs(h.width - width) > 0.5)
      ? measureAcrossSteps(raw, blockIdx, styleOverride, lineCut.from, [
        ...groupWidths.map((h) => ({ fromLine: h.fromLine, columnWidth: h.width })),
        ...(Math.abs(groupWidths[groupWidths.length - 1]!.width - width) > 0.5 ? [{ fromLine: lineCut.from, columnWidth: width }] : []),
      ])
      : undefined;
    let measuredBlock = acrossGroup
      ?? (lineCut ? undefined : measureFirstChildAcrossWidths(raw, blockIdx, k, width, styleOverride))
      ?? (input.uprightMaxLength !== undefined && raw.type === 'resourceBlock'
        // A turned frame's picture takes room across the page along the
        // box's stacking axis: what the box has left, the gaps kept. Only
        // the gaps the box sets (#1078): none above the box's first block,
        // none below its last, as the spacing below and the box's height
        // count them; else a frame as tall as its picture needs would set
        // the picture smaller than it measured it. A resource block is
        // never kept in the measure memo.
        ? measureContentBlock(raw, blockIdx, width, derivedCtx, {
          styleOverride,
          uprightMaxLength: Math.max(1, input.uprightMaxLength - (st.cursorY - innerTop)
            - (st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, resourceGapPx))
            - (resourceGapBelow && !isLastRealOf(k) ? resourceGapPx : 0)),
        })
        : input.measureMemo
          ? measureBlockMemo(input.measureMemo, ctx, style, derivedCtx, raw, blockIdx, width, styleOverride)
          : measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride }));
    if (!measuredBlock) return undefined;
    // A picture the reflow ladder scales (#858): set again at that share of
    // its width.
    const pictureScale = input.pictureScale;
    const picture = measuredBlock.resourceBlock;
    if (pictureScale !== undefined && pictureScale > 0 && pictureScale < 1 && picture && picture.kind !== 'table' && !picture.rotation) {
      const smaller = measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride, figureMaxBodyWidth: picture.bodyRect.width * pictureScale });
      if (smaller) measuredBlock = smaller;
    }
    const { kind, mathDisplayRender, resourceBlock, code } = measuredBlock;
    let { measured, prefixLen, absoluteSourceMap, letterSpacingPx, runtTracking } = measuredBlock;
    const { vdtType, headingLevel, numberPrefix, numberSeparator, headingNumber, listBullet, listDepth, listKind, bulletXOffsetInColumn, strikethroughText } = kind;
    // A structural heading (`hidden`) keeps its lines' text but prints
    // nothing and takes no room: no line height, no margins, and the
    // spacing around it collapses as if it were not there.
    const hiddenHeading = vdtType === 'heading' && headingIsHidden(
      raw,
      derivedCtx.headingLevels?.forBlock(raw) ?? derivedCtx.resolved.headings.levels.find((l) => l.level === raw.level),
    );
    const bs = hiddenHeading ? { ...kind.style, lineHeightPx: 0, marginTopPx: 0, marginBottomPx: 0 } : kind.style;
    // An inline resource keeps the gap as in running text (EF-117): a line
    // of the box's text above it, and below it with `'around'`.
    const inlineResource = vdtType === 'resource' && !!resourceBlock;
    const marginTopPx = inlineResource ? Math.max(bs.marginTopPx, resourceGapPx) : bs.marginTopPx;
    const marginBottomPx = inlineResource && resourceGapBelow ? Math.max(bs.marginBottomPx, resourceGapPx) : bs.marginBottomPx;

    // Spacing above: margin collapsing, list-item spacing inside a run. A
    // pull (a negative container margin) applies as it is, unless the
    // block has a top margin of its own — as in running text.
    let spacing: number;
    if (hiddenHeading) {
      spacing = 0;
    } else if (st.first) {
      spacing = st.prevMarginBottom;
    } else if (st.pull && marginTopPx <= 0) {
      spacing = st.prevMarginBottom;
    } else if (vdtType === 'listItem' && st.prevWasListItem) {
      // The shallower list's spacing, as in running text (EF-165).
      const here = { spacingPx: listBullet ? listBullet.itemSpacingPx : 0, depth: listDepth ?? 1 };
      spacing = st.prevListItem ? listItemGapPx(st.prevListItem, here) : here.spacingPx;
    } else {
      spacing = Math.max(st.prevMarginBottom, marginTopPx);
    }
    st.cursorY += spacing;
    // A frame's text runs round the frames that push it (#855): set again
    // with its lines short beside them. A child the range opens inside
    // keeps the lines it was counted with.
    const opensInside = lineCut ? lineCut.from > 0 : isFirstRealOf(k) && (input.lineFrom ?? 0) > 0;
    // A drop cap (#623) in a composed page's frame (#922): on the piece
    // that holds the paragraph's first line, its rise kept clear above.
    const cap = measuredBlock.dropCap && !opensInside ? measuredBlock.dropCap : undefined;
    if (cap && cap.rise > 0.5) st.cursorY += cap.rise;
    if (exclusions.length > 0 && !opensInside && !(vdtType === 'resource' && resourceBlock) && !(vdtType === 'mathDisplay' && mathDisplayRender) && vdtType !== 'score') {
      const lineInsets = exclusionInsets(exclusions, x, width, st.cursorY, kind.style.lineHeightPx);
      if (lineInsets.length > 0) {
        const again = measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride, lineInsets });
        if (again) ({ measured, prefixLen, absoluteSourceMap, letterSpacingPx, runtTracking } = again);
      }
    }

    const blk = createVDTBlock(input.nextChildId(), vdtType, bs.fontString, bs.color, bs.textAlign);
    applyStyleAttrs(blk, bs);
    // The tracking the lines were measured with (a runt set one line
    // shorter, a heading level's `letterSpacing`): painted as measured,
    // as in the flow (EF-111).
    if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
    if (runtTracking !== undefined) blk.runtFix = { tracking: runtTracking };
    blk.contentIndex = blockIdx;
    blk.containerId = containerId;
    const paragraphStyleId = paragraphStyleIdOf(raw, container, derivedCtx.resolved);
    if (paragraphStyleId !== undefined) blk.paragraphStyleId = paragraphStyleId;
    blk.dirty = false;
    blk.snappedToGrid = false;
    blk.headingLevel = headingLevel;
    if (nestPath) blk.calloutPath = [...nestPath];
    if (numberPrefix) { blk.numberPrefix = numberPrefix; if (numberSeparator !== undefined) blk.numberSeparator = numberSeparator; }
    if (headingNumber !== undefined) blk.headingNumber = headingNumber;
    if (hiddenHeading) blk.hidden = true;
    // A row of the contents (#983): the page it links to, or the values of
    // its part row's design.
    if (raw.toc) Object.assign(blk, tocBlockStamps(raw));
    blk.sourceMap = absoluteSourceMap;
    blk.plainPrefixLen = prefixLen;

    // Line-level cut of the first / last child (split boxes): the kept
    // run of lines, and whether this child opens after its first line
    // (no bullet then — the head carries it).
    const isTextRun = !(vdtType === 'resource' && resourceBlock) && !(vdtType === 'mathDisplay' && mathDisplayRender) && vdtType !== 'score';
    const isFirstReal = isFirstRealOf(k);
    const isLastReal = isLastRealOf(k);
    const lineFrom = !isTextRun ? 0 : lineCut ? Math.max(0, lineCut.from) : isFirstReal ? Math.max(0, input.lineFrom ?? 0) : 0;
    const cutTo = lineCut ? lineCut.to : isLastReal ? input.lineTo : undefined;
    const lineTo = isTextRun && cutTo !== undefined
      ? Math.max(lineFrom + 1, Math.min(cutTo, measured.lines.length))
      : measured.lines.length;
    // A justified line the breaker could not fill is set ragged, as in the
    // running text (EF-104): a box's narrow measure is where it happens most.
    const textLines = isTextRun ? raggedLooseLines(measured.lines, bs.textAlign) : measured.lines;
    const keptLines = isTextRun ? textLines.slice(Math.min(lineFrom, textLines.length - 1), lineTo) : measured.lines;
    const openedMidRun = lineFrom > 0;

    let height: number;
    if (vdtType === 'resource' && resourceBlock) {
      height = measured.totalHeight;
      blk.resourceBlock = resourceBlock;
      blk.lines = [{
        text: '',
        bbox: createBoundingBox(0, 0, resourceBlock.bodyRect.width, height),
        baseline: 0,
        hyphenated: false,
        segments: [],
        isLastLine: true,
      }];
      blk.sourceStart = raw.sourceStart + (input.bodyOffset ?? ctx.bodyOffset);
      blk.sourceEnd = raw.sourceEnd + (input.bodyOffset ?? ctx.bodyOffset);
    } else if (vdtType === 'mathDisplay' && mathDisplayRender) {
      blk.mathRender = mathDisplayRender;
      blk.tex = raw.tex;
      const mathLine = { ...measured.lines[0]!, bbox: { ...measured.lines[0]!.bbox, y: 0 } };
      blk.lines = [mathLine];
      height = mathLine.bbox.height;
      blk.sourceStart = raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = raw.sourceEnd + ctx.bodyOffset;
    } else if (vdtType === 'score') {
      // A score system in a box (#1172): its own height, never cut.
      const systemLine = { ...measured.lines[0]!, bbox: { ...measured.lines[0]!.bbox, y: 0 } };
      blk.lines = [systemLine];
      height = systemLine.bbox.height;
      if (raw.score) blk.score = scoreInfoOf(raw.score);
      blk.sourceStart = raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = raw.sourceEnd + ctx.bodyOffset;
    } else {
      blk.lines = resetLinePositions(keptLines, bs.lineHeightPx);
      height = blk.lines.length * bs.lineHeightPx;
      blk.sourceStart = keptLines[0]!.sourceStart ?? raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = keptLines[keptLines.length - 1]!.sourceEnd ?? raw.sourceEnd + ctx.bodyOffset;
      // A short paragraph keeps the room under its initial (`'reserve'`).
      if (cap && cutTo === undefined) height = Math.max(height, cap.minLines * bs.lineHeightPx);
    }

    // A heading with a design of its own (#906): the box keeps the room
    // the design takes, as a page column does. A heading opened after its
    // first line has no design to draw.
    const blockWidth = widthLessEndIndent(blk, width);
    if (vdtType === 'heading' && !hiddenHeading && !openedMidRun && isTextRun && input.headingDesign) {
      const reserve = input.headingDesign(raw, blockIdx, { lines: measured.lines, numberPrefix: numberPrefix ?? '', ...(headingNumber !== undefined ? { headingNumber } : {}) }, blockWidth);
      if (reserve !== undefined) {
        designedBoxHeadings.add(blk);
        if (Number.isFinite(reserve) && reserve > height) height = reserve;
        const offset = input.bodyOffset ?? ctx.bodyOffset;
        const styleId = headingStyleOf(raw, input.resolved)?.id;
        blk.boxDesign = {
          ...(styleId !== undefined ? { styleId } : {}),
          ...(raw.attrs ? { attrs: raw.attrs } : {}),
          ...(raw.attrSources ? { attrSources: Object.fromEntries(Object.entries(raw.attrSources).map(([k, r]) => [k, { start: r.start + offset, end: r.end + offset }])) } : {}),
          ...(raw.titleBreaks ? { titleBreaks: raw.titleBreaks, titleLength: raw.text.length } : {}),
        };
      }
    }

    // Relocate to the inner rect (box-relative).
    blk.bbox = createBoundingBox(x, st.cursorY, blockWidth, height);
    for (const line of blk.lines) {
      shiftLineX(line, x);
      line.bbox.y += st.cursorY;
      line.baseline += st.cursorY;
    }
    if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, x, st.cursorY);
    const capLine = blk.lines[0];
    if (cap && capLine && isTextRun) {
      // As the flow stamps it (`build.ts`): on the baseline of the line it
      // sinks to.
      blk.dropCap = {
        text: cap.text,
        fontString: cap.fontString,
        color: cap.color,
        x: blk.bbox.x + cap.x,
        baselineY: capLine.baseline + (cap.sink - 1) * bs.lineHeightPx,
        width: cap.width,
        fontSizePx: cap.fontSizePx,
        lines: cap.lines,
        sink: cap.sink,
        ...(cap.sourceStart !== undefined ? { sourceStart: cap.sourceStart, sourceEnd: cap.sourceEnd } : {}),
        plainStart: cap.plainStart,
        plainEnd: cap.plainEnd,
        word: cap.word,
        wordRest: cap.wordRest,
        ...(cap.hang ? { hang: { text: cap.hang.text, fontString: cap.hang.fontString, x: blk.bbox.x + cap.hang.x, baselineY: capLine.baseline, width: cap.hang.width } } : {}),
      };
      if (cap.sourceStart !== undefined && (blk.sourceStart === undefined || cap.sourceStart < blk.sourceStart)) blk.sourceStart = cap.sourceStart;
    }
    // A code listing (#624): its language, numbers and fit; the lines a
    // fence highlights get a band across the box.
    if (code) {
      blk.code = code;
      if (measuredBlock.direction) blk.direction = measuredBlock.direction;
      for (const line of blk.lines) if (line.codeLine?.highlight) highlights.push({ y: line.bbox.y, height: line.bbox.height });
    }

    if (listBullet && !openedMidRun) {
      blk.listDepth = listDepth;
      blk.listKind = listKind;
      // A task item's drawn box (#765) stands for its character and face.
      if (listBullet.box) blk.bulletBox = listBullet.box;
      else {
        blk.bulletText = listBullet.bulletText;
        blk.bulletFontString = listBullet.bulletFontString;
      }
      blk.bulletColor = listBullet.bulletColor;
      blk.bulletOffsetX = x + bulletXOffsetInColumn;
      if (listBullet.separatorText !== undefined) {
        blk.separatorText = listBullet.separatorText;
        blk.separatorFontString = listBullet.separatorFontString;
        blk.separatorColor = listBullet.separatorColor;
        blk.separatorX = blk.bulletOffsetX + (listBullet.separatorOffsetPx ?? 0);
        if (listBullet.prefixText !== undefined) {
          blk.prefixText = listBullet.prefixText;
          blk.prefixX = blk.bulletOffsetX + (listBullet.prefixOffsetPx ?? 0);
        }
      }
      // A list set against the document's direction (#371).
      if (raw.direction !== undefined && raw.direction !== getMeasureDirection()) mirrorListMarker(blk);
      // And reads in its item's direction (#664).
      directListMarker(blk, raw.direction ?? getMeasureDirection(), getMeasureArabicNumbers(), measuringVertically());
      if (strikethroughText) blk.strikethroughText = true;
      const firstLine = blk.lines[0];
      if (firstLine) {
        const at = listBulletPosition(listBullet, firstLine.baseline);
        blk.bulletY = at.bulletY;
        if (at.bulletBaselineY !== undefined) blk.bulletBaselineY = at.bulletBaselineY;
      }
    } else if (listBullet) {
      blk.listDepth = listDepth;
      blk.listKind = listKind;
    }

    into.push(blk);
    unitsInto.push({ kind: 'block', block: blk });
    st.cursorY += height;
    if (!hiddenHeading) {
      st.prevMarginBottom = marginBottomPx;
      // A negative container bottom margin pulls the next block up.
      st.pull = isContainerTail && bs.marginBottomPx < 0;
      st.prevWasListItem = vdtType === 'listItem';
      st.prevListItem = vdtType === 'listItem' ? { spacingPx: listBullet ? listBullet.itemSpacingPx : 0, depth: listDepth ?? 1 } : undefined;
      st.first = false;
    }
    return blk;
  };

  /** A `:::paragraphs` fence among the children: the container's top margin
   *  on entry, and its bottom margin on exit when the block before is not a
   *  paragraph (a closing paragraph carries it in its tail style). Each
   *  collapses with the spacing already there, as in running text; a
   *  negative one pulls (see `Stack.pull`). At the top of the box it
   *  vanishes, as at the top of a column. Under a closing paragraph the
   *  space is at least the box's paragraph spacing, as between two
   *  paragraphs of its text (`bodyText.paragraphContainerSpacing:
   *  'collapse'`, EF-181). */
  const containerMargin = (raw: ContentBlock, k: number, st: Stack): void => {
    if ((raw.type !== 'containerStart' && raw.type !== 'containerEnd') || raw.containerId === undefined) return;
    const pc = restyleContainer(input.paragraphContainers?.byId.get(raw.containerId));
    if (!pc || st.first) return;
    if (raw.type === 'containerEnd' && children[k - 1]?.type === 'paragraph') {
      // (The container's style may set the rule itself, #715.)
      if ((pc.spacing ?? input.resolved.bodyText.paragraphContainerSpacing) === 'collapse' && !st.pull && bodyStyle.marginBottomPx > st.prevMarginBottom) {
        st.prevMarginBottom = bodyStyle.marginBottomPx;
      }
      return;
    }
    const margin = raw.type === 'containerStart' ? pc.marginTopPx : pc.marginBottomPx;
    if (margin < 0) {
      st.prevMarginBottom += margin;
      st.pull = true;
    } else if (margin > st.prevMarginBottom) {
      st.prevMarginBottom = margin;
      st.pull = false;
    }
  };

  /** Lay out the nested box whose fence opens with `open` (content index
   *  `openIdx`) over `children[k0 … k1 - 1]` — `k1` is its closing marker's
   *  position, or `children.length` when the range ends inside it — at
   *  `width` from `x`, appending its frame and blocks to `into` (one unit)
   *  and advancing the stack. `reopened` marks a box the fragment opens
   *  inside: a continuation of it, holding the line cut `lineFrom` and the
   *  boxes `openRest` it opens inside in turn. Returns the blocks, frame
   *  first, or `undefined` when no style applies (then the caller flattens). */
  const placeNested = (
    open: ContentBlock,
    openIdx: number,
    k0: number,
    k1: number,
    width: number,
    x: number,
    st: Stack,
    into: VDTBlock[],
    unitsInto: CalloutUnit[],
    reopened?: { openRest: readonly OpenNestedCallout[] },
  ): VDTBlock[] | undefined => {
    const nestedStyle = pickCalloutStyle(input.resolved.calloutStyles, open.containerAttrs?.type);
    if (!nestedStyle || open.containerId === undefined) return undefined;
    const closed = k1 < children.length;
    const nested = layoutCallout({
      style: nestedStyle,
      attrs: open.containerAttrs ?? {},
      ...(open.direction ? { direction: open.direction } : {}),
      children: children.slice(k0, k1),
      childStartIdx: childStartIdx + k0,
      width,
      ctx,
      resolved: input.resolved,
      containerId,
      frameId: input.nextChildId(),
      nextChildId: input.nextChildId,
      ...(input.paragraphContainers ? { paragraphContainers: input.paragraphContainers } : {}),
      ...(input.bodyOffset !== undefined ? { bodyOffset: input.bodyOffset } : {}),
      continuation: !!reopened,
      // Cut before its closing marker, the nested box goes on in the next
      // fragment too.
      ...(!closed ? { continues: true } : {}),
      ...(reopened && input.lineFrom !== undefined ? { lineFrom: input.lineFrom } : {}),
      // The nested box is `input.width - width` narrower at every width.
      ...(reopened && input.lineWidths
        ? { lineWidths: input.lineWidths.map((h) => ({ fromLine: h.fromLine, width: childWidthAt(h.width, width) })) }
        : {}),
      ...(!closed && input.lineTo !== undefined ? { lineTo: input.lineTo } : {}),
      ...(reopened && reopened.openRest.length > 0 ? { openNested: reopened.openRest } : {}),
      mirrored: input.mirrored,
      nestPath: [...(nestPath ?? []), open.containerId],
      ...(input.headingDesign ? { headingDesign: input.headingDesign } : {}),
      ...(input.boxDesign ? { boxDesign: input.boxDesign } : {}),
      ...(input.measureMemo ? { measureMemo: input.measureMemo } : {}),
    });
    // Spacing above: as a paragraph's (margin collapsing, none at the top
    // of the box beyond the title gap).
    const spacing = st.first ? st.prevMarginBottom : Math.max(st.prevMarginBottom, nested.marginTopPx);
    st.cursorY += spacing;
    const { frame } = nested;
    frame.contentIndex = openIdx;
    // The box always flows inside its parent.
    if (frame.callout) { frame.callout.span = 'column'; frame.callout.placement = 'here'; }
    const bodyOff = input.bodyOffset ?? ctx.bodyOffset;
    const firstRaw = reopened ? children[k0] : open;
    const lastRaw = closed ? children[k1] : children[k1 - 1];
    if (firstRaw) frame.sourceStart = firstRaw.sourceStart + bodyOff;
    if (lastRaw) frame.sourceEnd = lastRaw.sourceEnd + bodyOff;
    offsetCalloutToAbsolute(nested, x, st.cursorY);
    const blocks = [frame, ...nested.children];
    into.push(...blocks);
    unitsInto.push({
      kind: 'box',
      box: { result: nested, style: nestedStyle, startIdx: openIdx, ...(closed ? { endIdx: childStartIdx + k1 } : {}) },
    });
    st.cursorY += nested.totalHeight;
    st.prevMarginBottom = nested.marginBottomPx;
    st.pull = false;
    st.prevWasListItem = false;
    st.first = false;
    return blocks;
  };
  /** Position of the marker closing the nested fence `id` opened before
   *  position `from`, or `children.length` when the range ends inside it. */
  const closeOf = (id: number | undefined, from: number): number => {
    let e = from;
    while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerId === id)) e++;
    return e;
  };

  /** The tail of a text block cut at line `l`: a block of its own with the
   *  lines from `l` on (no bullet — the head keeps it), at y = 0. */
  const tailOf = (blk: VDTBlock, l: number): VDTBlock => {
    const lh = blk.lines[0]?.bbox.height ?? 0;
    const tail: VDTBlock = { ...blk, id: input.nextChildId(), lines: resetLinePositions(blk.lines.slice(l), lh) };
    delete tail.bulletText; delete tail.bulletFontString; delete tail.bulletColor; delete tail.bulletBox;
    delete tail.bulletOffsetX; delete tail.bulletY; delete tail.bulletBaselineY;
    delete tail.separatorText; delete tail.separatorFontString; delete tail.separatorColor; delete tail.separatorX;
    delete tail.prefixText; delete tail.prefixX; delete tail.bulletDirection;
    tail.bbox = createBoundingBox(blk.bbox.x, 0, blk.bbox.width, tail.lines.length * lh);
    tail.sourceStart = tail.lines[0]?.sourceStart ?? blk.sourceStart;
    return tail;
  };

  /** A stacked item of a `:::columns` group: a child block, or a nested
   *  box's blocks (frame first), with the child's position and the lines
   *  of it set before (a paragraph the fragment opens inside of). */
  interface GroupItem { blocks: VDTBlock[]; unit: CalloutUnit; k: number; lineBase: number }
  /** Lay children `kFrom … kTo - 1` of a group out in one galley at the
   *  sub-column `width` (a nested box is one item: never cut, moved
   *  whole). `open` / `close`: the position a fragment opens / ends at,
   *  inside a paragraph when its `line` is past 0 (#634). */
  const stackGroup = (kFrom: number, kTo: number, kEnd: number, width: number, open?: GroupPos, close?: GroupPos): GroupItem[] & { end?: number } => {
    const gst: Stack = { cursorY: 0, prevMarginBottom: 0, pull: false, prevWasListItem: false, first: true, keepLeadingSpace: false };
    const stack: GroupItem[] = [];
    for (let k = kFrom; k < kTo; k++) {
      const raw = children[k]!;
      const into: VDTBlock[] = [];
      const unitsInto: CalloutUnit[] = [];
      if (raw.type === 'containerStart' && raw.containerName === 'callout') {
        const e = closeOf(raw.containerId, k + 1);
        if (placeNested(raw, childStartIdx + k, k + 1, Math.min(e, kEnd), width, innerX, gst, into, unitsInto)) {
          stack.push({ blocks: into, unit: unitsInto[0]!, k, lineBase: 0 });
          k = e;
          continue;
        }
      }
      addSpace(raw, gst);
      containerMargin(raw, k, gst);
      if ((raw.type === 'directive' && !isStripChild(raw)) || isMarkerBlock(raw)) continue;
      const from = open && open.child === k && open.line > 0 ? open.line : 0;
      const to = close && close.child === k && close.line > 0 ? close.line : undefined;
      const lineCut = from > 0 || to !== undefined
        ? { from, ...(to !== undefined ? { to } : {}), ...(from > 0 && open?.widths ? { widths: open.widths } : {}) }
        : undefined;
      if (placeChild(raw, k, width, innerX, gst, into, unitsInto, lineCut)) stack.push({ blocks: into, unit: unitsInto[0]!, k, lineBase: from });
    }
    // Where the stack ends, a `:::space` after its last item included.
    return Object.assign(stack, { end: gst.cursorY });
  };
  /** The galley of stacked items, for the split code (see `columnsGroup.ts`).
   *  A heading is never cut, and under `headings.keepWithNext` no cut
   *  follows it: it goes to the next column with what it heads (#1019). */
  const galleyOf = (stack: readonly GroupItem[]): GalleyItem[] => stack.map((it) => {
    const blk = it.blocks[0]!;
    const heading = it.unit.kind === 'block' && blk.type === 'heading';
    const cuttable = it.unit.kind === 'block' && !heading && blk.type !== 'resource' && blk.type !== 'mathDisplay' && blk.type !== 'score' && blk.lines.length > 1 && !blk.mathRender;
    return {
      child: it.k,
      lineBase: it.lineBase,
      y: blk.bbox.y,
      height: blk.bbox.height,
      ...(cuttable ? { lineBottoms: blk.lines.map((l) => l.bbox.y + l.bbox.height - blk.bbox.y) } : {}),
      ...(heading && input.resolved.headings.keepWithNext ? { keepWithNext: true } : {}),
    };
  });
  /** A column start in a group's stack: before item `block`, or past its
   *  first `line` lines, at `y` in the stack. */
  interface ColumnCut { y: number; block: number; line: number }
  /** Balanced cuts (#934): the cuts at which the galley fills `cols`
   *  columns with the tallest as short as it can be, as a group that goes
   *  on is cut (`minFillHeight`). A cut inside a paragraph leaves at least
   *  the body's widow lines at the foot of a column and its orphan lines
   *  at the head of the next (`bodyText.avoidWidows` / `widowMinLines`,
   *  `avoidOrphans` / `orphanMinLines`), and the space before an item
   *  vanishes at a column's head, so a paragraph boundary beats a line
   *  cut that leaves a lone line. */
  const balancedCuts = (stack: readonly GroupItem[], cols: number): ColumnCut[] => {
    if (stack.length === 0) return [];
    const body = input.resolved.bodyText;
    const galley = galleyOf(stack);
    const breaks = galleyBreaks(
      galley,
      body.avoidWidows ? Math.max(1, body.widowMinLines) : 1,
      body.avoidOrphans ? Math.max(1, body.orphanMinLines) : 1,
    );
    const fill = fillGalley(galley, breaks, cols, minFillHeight(galley, breaks, cols));
    return fill.cuts.map((j) => ({ y: breaks[j]!.startY, block: breaks[j]!.item, line: breaks[j]!.line }));
  };
  /** The stack indices `breaks` starts columns at (`breaks="3"`: the third
   *  child opens the second column), at most `cols - 1` of them, rising. */
  const breakStarts = (stack: readonly GroupItem[], cols: number, breaks: readonly number[]): number[] => {
    const out: number[] = [];
    let prevY = 0;
    for (const b of breaks.slice(0, cols - 1)) {
      const i = b - 1;
      if (i <= 0 || i >= stack.length) continue;
      const y = stack[i]!.blocks[0]!.bbox.y;
      if (y <= prevY + 0.01) continue;
      out.push(i);
      prevY = y;
    }
    return out;
  };
  /** Set a stack in columns at its cuts, the first at `groupTop`; a cut
   *  inside a text block leaves its head behind and opens the next column
   *  with the tail (a block of its own, bullet-less). Returns the height
   *  the columns take. */
  const distributeGroup = (stack: GroupItem[], cuts: readonly ColumnCut[], colW: number, gap: number, groupTop: number): number => {
    const columns: { blocks: VDTBlock[]; unit: CalloutUnit }[][] = [[]];
    const columnStarts: number[] = [stack[0]?.blocks[0]?.bbox.y ?? 0];
    let cutIdx = 0;
    for (let i = 0; i < stack.length; i++) {
      let item: { blocks: VDTBlock[]; unit: CalloutUnit } = stack[i]!;
      while (cutIdx < cuts.length && cuts[cutIdx]!.block === i && cuts[cutIdx]!.line === 0) {
        columns.push([]); columnStarts.push(cuts[cutIdx]!.y); cutIdx++;
      }
      let consumed = 0;
      while (cutIdx < cuts.length && cuts[cutIdx]!.block === i && cuts[cutIdx]!.line > 0) {
        const blk = item.blocks[0]!;
        const cut = cuts[cutIdx]!;
        const l = cut.line - consumed;
        cutIdx++;
        if (l <= 0 || l >= blk.lines.length) continue;
        const lh = blk.lines[0]?.bbox.height ?? 0;
        const tail = tailOf(blk, l);
        blk.lines = blk.lines.slice(0, l);
        blk.bbox = createBoundingBox(blk.bbox.x, blk.bbox.y, blk.bbox.width, l * lh);
        columns[columns.length - 1]!.push(item);
        offsetBlock(tail, 0, cut.y);
        columns.push([]); columnStarts.push(cut.y);
        consumed += l;
        item = { blocks: [tail], unit: { kind: 'block', block: tail } };
      }
      columns[columns.length - 1]!.push(item);
    }
    let groupHeight = 0;
    columns.forEach((items, c) => {
      const shiftX = c * (colW + gap);
      const shiftY = groupTop - (columnStarts[c] ?? 0);
      for (const item of items) {
        for (const blk of item.blocks) {
          offsetBlock(blk, shiftX, shiftY);
          childBlocks.push(blk);
          groupHeight = Math.max(groupHeight, blk.bbox.y + blk.bbox.height - groupTop);
        }
        units.push(item.unit);
      }
    });
    return groupHeight;
  };

  /** A `:::columns{count=N}` group: children `k0 … k1 - 1` in N columns
   *  (`spec`). Set whole, its stack is cut where the columns balance best,
   *  or at its `breaks`. A fragment that opens or ends inside it (#634,
   *  `cut`) sets the part of the galley between its positions: a
   *  `'snake'` group that goes on fills its columns as level as the cuts
   *  allow, the closing part balances as a whole group does; a
   *  `'parallel'` group sets each stream from its own position in its own
   *  column, top-aligned. The galley this layout starts with is recorded
   *  in `groupLayouts` for the split code. */
  const placeColumnsGroup = (k0: number, k1: number, spec: ColumnsSpec, st: Stack, cut: { from?: readonly GroupPos[]; to?: readonly GroupPos[] } = {}): void => {
    const cols = Math.max(1, Math.min(6, spec.count));
    const gap = spec.gapPx;
    const colW = Math.max(1, (innerWidth - gap * (cols - 1)) / cols);
    // Spacing above the group: as a block with no margin of its own, or
    // with the one its fence asks for (`marginTop`, #714: merged with the
    // space pending, none when the group opens the box; a part of a group
    // that goes on from an earlier fragment takes none).
    const ownTop = cut.from || st.first ? 0 : spec.marginTopPx ?? 0;
    const groupTop = st.cursorY + Math.max(st.prevMarginBottom, ownTop);
    const childMin = Math.min(Math.max(1, style.splitMinLines), input.resolved.layout.boxChildSplitMinLines);
    const parallel = spec.flow === 'parallel' && (spec.breaks?.length ?? 0) > 0;
    let groupHeight = 0;
    let streams: GalleyItem[][] = [];
    /** Where each stream ends: the next one's first child, the last at the
     *  closing marker. */
    let ends: number[] = [k1];
    if (!cut.from && !cut.to) {
      // The whole group (as before #634).
      const stack = stackGroup(k0, k1, k1, colW);
      if (stack.length === 0) return;
      const starts = spec.breaks && spec.breaks.length > 0 ? breakStarts(stack, cols, spec.breaks) : undefined;
      const galley = galleyOf(stack);
      if (parallel && starts) {
        const bounds = [0, ...starts, stack.length];
        ends = [...starts.map((i) => stack[i]!.k), k1];
        streams = bounds.slice(0, -1).map((b, s) => {
          const part = galley.slice(b, bounds[s + 1]);
          const y0 = part[0]?.y ?? 0;
          return part.map((g) => ({ ...g, y: g.y - y0 }));
        });
      } else {
        streams = [galley];
      }
      const cuts = starts
        ? starts.map((i) => ({ y: stack[i]!.blocks[0]!.bbox.y, block: i, line: 0 }))
        : balancedCuts(stack, cols);
      groupHeight = distributeGroup(stack, cuts, colW, gap, groupTop);
    } else if (!parallel) {
      // A snake group cut across fragments: the part of its galley between
      // the fragment's positions.
      const a = cut.from?.[0];
      const b = cut.to?.[0];
      const kTo = b ? Math.min(k1, b.line > 0 ? b.child + 1 : b.child) : k1;
      const stack = stackGroup(a ? Math.max(k0, a.child) : k0, kTo, k1, colW, a, b);
      if (stack.length === 0) return;
      const galley = galleyOf(stack);
      streams = [galley];
      let cuts: ColumnCut[];
      if (b) {
        const breaks = galleyBreaks(galley, childMin);
        const fill = fillGalley(galley, breaks, cols, minFillHeight(galley, breaks, cols));
        cuts = fill.cuts.map((j) => ({ y: breaks[j]!.startY, block: breaks[j]!.item, line: breaks[j]!.line }));
      } else {
        cuts = balancedCuts(stack, cols);
      }
      groupHeight = distributeGroup(stack, cuts, colW, gap, groupTop);
    } else {
      // A parallel group cut across fragments: its streams are the runs
      // its breaks start in the whole group; each goes on from its own
      // position, in its own column.
      const whole = stackGroup(k0, k1, k1, colW);
      if (whole.length === 0) return;
      const starts = [0, ...breakStarts(whole, cols, spec.breaks!)];
      const startChild = starts.map((i) => whole[i]!.k);
      ends = [...startChild.slice(1), k1];
      startChild.forEach((sk, s) => {
        const ek = startChild[s + 1] ?? k1;
        const a = cut.from?.[s];
        const b = cut.to?.[s];
        const kFrom = Math.max(sk, a?.child ?? sk);
        const kTo = Math.min(ek, b ? (b.line > 0 ? b.child + 1 : b.child) : ek);
        const stack = kFrom < kTo ? stackGroup(kFrom, kTo, k1, colW, a, b) : [];
        streams.push(galleyOf(stack));
        if (stack.length === 0) return;
        const y0 = stack[0]!.blocks[0]!.bbox.y;
        for (const item of stack) {
          for (const blk of item.blocks) {
            offsetBlock(blk, s * (colW + gap), groupTop - y0);
            childBlocks.push(blk);
            groupHeight = Math.max(groupHeight, blk.bbox.y + blk.bbox.height - groupTop);
          }
          units.push(item.unit);
        }
      });
    }
    groupLayouts.push({
      open: k0 - 1,
      close: k1,
      flow: parallel ? 'parallel' : 'snake',
      columns: cols,
      columnWidth: colW,
      top: groupTop,
      streams,
      ends,
      contentIndex: childStartIdx + k0 - 1,
      ...(colW < 6 * em ? { narrow: true as const } : {}),
    });
    // A rule down each gutter (`rule`), the page's column rule.
    if (spec.rule && cols > 1 && groupHeight > 0) {
      const ruleSpec = input.resolved.layout.columnRule;
      const w = Math.max(0.25, px(ruleSpec.lineWidth));
      for (let c = 1; c < cols; c++) {
        const x = innerX + c * (colW + gap) - gap / 2;
        groupRules.push({
          kind: 'rule',
          bbox: createBoundingBox(x - w / 2, groupTop, w, groupHeight),
          color: ruleSpec.color.hex,
          thicknessPx: w,
          direction: 'vertical',
        });
      }
    }
    st.cursorY = groupTop + groupHeight;
    // The fence's `marginBottom` is the space pending after the group
    // (#714): it merges with the next block's own and is dropped at the
    // box's foot, like any last child's. A part that goes on leaves none.
    st.prevMarginBottom = cut.to ? 0 : spec.marginBottomPx ?? 0;
    st.pull = false;
    st.prevWasListItem = false;
    st.first = false;
  };

  const holdsContent = children.some((c) => (c.type !== 'directive' || isStripChild(c)) && !isMarkerBlock(c));
  const st: Stack = {
    cursorY,
    prevMarginBottom: hasTitle || banded ? gapPx : 0,
    pull: false,
    prevWasListItem: false,
    first: true,
    keepLeadingSpace: !input.continuation && (hasTitle || !holdsContent),
  };
  if (!isAuto) {
    let k0 = 0;
    // A continuation opening inside a nested box redraws it (and the boxes
    // it opens inside in turn) around the children up to its closing marker.
    const [reopen, ...openRest] = input.openNested ?? [];
    if (reopen) {
      const e = closeOf(reopen.block.containerId, 0);
      placeNested(reopen.block, reopen.idx, 0, e, innerWidth, innerX, st, childBlocks, units, { openRest });
      k0 = e + 1;
    }
    for (let k = k0; k < children.length; k++) {
      const raw = children[k]!;
      if (raw.type === 'containerStart' && raw.containerName === 'callout') {
        const e = closeOf(raw.containerId, k + 1);
        if (placeNested(raw, childStartIdx + k, k + 1, e, innerWidth, innerX, st, childBlocks, units)) {
          k = e;
          continue;
        }
      }
      if (raw.type === 'containerStart' && raw.containerName === 'columns') {
        let e = k + 1;
        while (e < children.length && !(children[e]!.type === 'containerEnd' && children[e]!.containerName === 'columns' && children[e]!.containerId === raw.containerId)) e++;
        // A fragment that opens inside the group (it is then the first
        // child) or ends inside it (the last) sets its part (#634).
        // (The margins of a main-flow group's fence are its synthetic
        // box's, returned below: the group does not take them again, #714.)
        const groupSpec = columnsSpecOf(raw.containerAttrs ?? {}, columnGapPx, em, dpi);
        if (flowGroupBox) {
          delete groupSpec.marginTopPx;
          delete groupSpec.marginBottomPx;
        }
        placeColumnsGroup(k + 1, e, groupSpec, st, {
          ...(k === 0 && input.groupFrom ? { from: input.groupFrom } : {}),
          ...(e === children.length - 1 && input.groupTo ? { to: input.groupTo } : {}),
        });
        k = e;
        continue;
      }
      addSpace(raw, st);
      containerMargin(raw, k, st);
      if ((raw.type === 'directive' && !isStripChild(raw)) || isMarkerBlock(raw)) continue;
      placeChild(raw, k, innerWidth, innerX, st, childBlocks, units);
    }
  }

  // --- Continuation marker ---------------------------------------------------
  // "Continued" under the last line of a fragment that goes on, in the box's
  // body face and size, aligned in the inner width; like the repeated title
  // it is pagination furniture.
  const continuesText = style.continuesMarkerEnabled && !isAuto ? style.continuesMarker.trim() : '';
  let continuesBlock: VDTDesignTextBlock | undefined;
  let continuesMarkerPx = 0;
  if (continuesText.length > 0) {
    const font = buildFontString(
      style.body.fontFamily,
      em,
      style.body.fontWeight.toString(),
      style.continuesMarkerItalic ? 'italic' : 'normal',
    );
    const lh = bodyStyle.lineHeightPx;
    const { lines } = measureRichBlock(
      [{ text: continuesText, bold: false, italic: false }],
      font, font, font, font, innerWidth, lh,
      { textAlign: 'left' },
    );
    continuesMarkerPx = lines.length * lh;
    if (input.continues && lines.length > 0) {
      const top = st.cursorY;
      const align = style.continuesMarkerAlign;
      continuesBlock = directText({
        kind: 'text',
        bbox: createBoundingBox(innerX, top, innerWidth, continuesMarkerPx),
        fontString: font,
        color: bodyStyle.color,
        lines: lines.map((ln, i) => {
          const slack = Math.max(0, innerWidth - ln.bbox.width);
          return {
            text: ln.text,
            xOffset: align === 'right' ? slack : align === 'center' ? slack / 2 : 0,
            baselineY: top + i * lh + lineBaselineOffset(lh, font),
            width: ln.bbox.width,
          };
        }),
        clip: false,
        artifact: true,
      });
      st.cursorY += continuesMarkerPx;
    }
  }
  cursorY = st.cursorY;

  // An icon taller than the content grows the inner area to fit it; with
  // `align: 'center'` the title and children are centred on the icon.
  let contentBottom = cursorY;
  const contentH = contentBottom - innerTop;
  if (hasIcon && !cornerIcon && iconSize > contentH) {
    const extra = iconSize - contentH;
    if (style.icon.align === 'center') {
      if (titleBlock) offsetDesignBlock(titleBlock, 0, extra / 2);
      for (const b of designBlocks) offsetDesignBlock(b, 0, extra / 2);
      if (fromBlock) offsetDesignBlock(fromBlock, 0, extra / 2);
      if (continuesBlock) offsetDesignBlock(continuesBlock, 0, extra / 2);
      for (const blk of childBlocks) offsetBlock(blk, 0, extra / 2);
      for (const r of groupRules) offsetDesignBlock(r, 0, extra / 2);
      for (const g of groupLayouts) g.top += extra / 2;
    }
    contentBottom += extra;
  }
  // A frame's exact height (#855): the box is drawn that tall, the
  // content placed in it as `verticalAlign` says; content taller than the
  // room runs past the foot.
  let overflowPx: number | undefined;
  if (input.boxHeight !== undefined) {
    const room = Math.max(innerTop, input.boxHeight - riseAhead - dropAhead - padB);
    if (contentBottom < room - 0.01) {
      const extra = room - contentBottom;
      const align = input.verticalAlign ?? 'top';
      if (align === 'middle' || align === 'bottom') {
        const dy = align === 'middle' ? extra / 2 : extra;
        for (const blk of childBlocks) offsetBlock(blk, 0, dy);
        for (const r of groupRules) offsetDesignBlock(r, 0, dy);
        for (const g of groupLayouts) g.top += dy;
        if (continuesBlock) offsetDesignBlock(continuesBlock, 0, dy);
      } else if (align === 'justify' && units.length > 1) {
        units.forEach((u, i) => {
          const dy = (extra * i) / (units.length - 1);
          if (dy <= 0) return;
          const moved = u.kind === 'block' ? [u.block] : [u.box.result.frame, ...u.box.result.children];
          for (const blk of moved) offsetBlock(blk, 0, dy);
        });
      }
    } else if (contentBottom > room + 0.01) {
      overflowPx = contentBottom - room;
    }
    contentBottom = room;
  }
  const boxHeight = contentBottom + padB;
  const innerRect = createBoundingBox(innerX, innerTop, innerWidth, Math.max(0, contentBottom - innerTop));

  // --- Box decoration (paint order: background, stripe, icon, title) ---------
  const borderOn = style.border.enabled;
  // Corners of their own and a border per side (#1059); a style with one
  // radius and one border paints as it always has.
  const shaped = isCornerRadii(style.borderRadius) || style.border.sides !== undefined;
  const radii = cornerRadiiPx(style.borderRadius, px);
  const sides: ShapeBorder | undefined = style.border.sides
    ? borderSidesPx({ enabled: borderOn, color: style.border.color, width: style.border.width }, style.border.sides, px)
    : undefined;
  const boxShapeAt = overlayBlocks.length;
  if (style.backgroundEnabled || borderOn || (sides && SHAPE_SIDES.some((side) => sides[side]))) {
    overlayBlocks.push({
      kind: 'box',
      bbox: createBoundingBox(0, 0, boxWidth, boxHeight),
      box: shaped
        ? normalizeBoxStyle({
            backgroundColor: style.backgroundEnabled ? style.background.hex : undefined,
            borderColor: borderOn ? style.border.color.hex : undefined,
            borderWidthPx: borderOn ? px(style.border.width) : 0,
            borderRadiusPx: 0,
            borderRadiiPx: radii,
            ...(sides ? { borderSides: sides } : {}),
          })
        : {
            backgroundColor: style.backgroundEnabled ? style.background.hex : undefined,
            borderColor: borderOn ? style.border.color.hex : undefined,
            borderWidthPx: borderOn ? px(style.border.width) : 0,
            borderRadiusPx: px(uniformRadius(style.borderRadius)!),
          },
    });
  }
  const boxPainted = overlayBlocks.length > boxShapeAt;
  // The highlighted lines of a listing (#624): a band across the inner
  // area and its padding, under the text.
  if (highlights.length > 0) {
    const tint = resolvedCodeStyle(input.resolved).highlightBackground.hex;
    for (const h of highlights) {
      overlayBlocks.push({
        kind: 'box',
        bbox: createBoundingBox(innerX - padL, h.y, innerWidth + padL + padR, h.height),
        box: { backgroundColor: tint, borderWidthPx: 0, borderRadiusPx: 0 },
      });
    }
  }
  let stripeBlock: VDTDesignBoxBlock | undefined;
  if (stripeOn) {
    const stripeBox = topStripe
      ? createBoundingBox(0, 0, boxWidth, stripeW)
      : stripeLeft
        ? createBoundingBox(0, 0, stripeW, boxHeight)
        : createBoundingBox(boxWidth - stripeW, 0, stripeW, boxHeight);
    // On a rounded frame the stripe follows the corners: it is clipped to
    // the frame's rounded rectangle (the radius clamped as the frame's is),
    // so its square ends never stick out past the background and border.
    // Corners of their own (#1059) are clamped as the frame's outline
    // clamps them; a joined tab sets the clip again below.
    const clipRadii: [number, number, number, number] = shaped
      ? boxOutline(createBoundingBox(0, 0, boxWidth, boxHeight), radii).vertices.map((v) => v.r) as [number, number, number, number]
      : (() => {
          const frameRadius = Math.max(0, Math.min(px(uniformRadius(style.borderRadius)!), boxWidth / 2, boxHeight / 2));
          return [frameRadius, frameRadius, frameRadius, frameRadius];
        })();
    stripeBlock = {
      kind: 'box',
      bbox: stripeBox,
      box: { backgroundColor: style.stripe.color.hex, borderWidthPx: 0, borderRadiusPx: 0 },
      ...(clipRadii.some((r) => r > 0)
        ? { clip: { x: 0, y: 0, width: boxWidth, height: boxHeight, radii: clipRadii } }
        : {}),
    };
    overlayBlocks.push(stripeBlock);
  }
  let iconFileId: string | undefined;
  let iconFormat: string | undefined;
  if (hasIcon) {
    // Over a side stripe the icon is centred on the stripe; otherwise it
    // sits in its own column left of the content.
    // A corner badge hangs on its corner half past the border, flush with
    // the top edge.
    const iconX = cornerIcon
      ? (cornerRight ? boxWidth - cornerIconW / 2 : -cornerIconW / 2)
      : sideStripe
        ? (stripeLeft ? (stripeW - iconSize) / 2 : boxWidth - stripeW + (stripeW - iconSize) / 2)
        : innerX - iconColumn;
    const iconY = cornerIcon
      ? 0
      : style.icon.align === 'center'
        ? innerTop + (contentBottom - innerTop - iconSize) / 2
        : innerTop;
    const built = buildIconBlock(style.icon, iconX, iconY, iconSize, ctx, iconBoxW, px);
    if (built) {
      overlayBlocks.push(built.block);
      iconFileId = built.fileId;
      iconFormat = built.format;
    }
  }
  overlayBlocks.push(...groupRules);
  overlayBlocks.push(...designBlocks);
  if (titleBlock) overlayBlocks.push(titleBlock);
  if (fromBlock) overlayBlocks.push(fromBlock);
  if (continuesBlock) overlayBlocks.push(continuesBlock);

  // --- Label tab ---------------------------------------------------------------
  // The fence's `label` on a tab hugging a top corner, rising `offset`
  // above the box; an icon beside it and a rule along the top edge.
  let labelRisePx = 0;
  let labelDropPx = 0;
  if (style.label && labelShown) {
    const lb = style.label;
    const lbFontPx = dimensionToPx(lb.fontSize, dpi, em);
    const lbFont = buildFontString(lb.fontFamily, lbFontPx, lb.fontWeight.toString());
    const padX = dimensionToPx(lb.paddingX, dpi, lbFontPx);
    const tabH = dimensionToPx(lb.height, dpi, lbFontPx);
    // A joined tab (#1059) stands on the edge: it is out of the box by its
    // whole height, whatever `offset` says.
    const rise = labelJoined ? tabH : px(lb.offset);
    const inset = px(lb.inset);
    const textW = flowTextWidth(labelText, lbFont);
    // A picture inside the tab (#981) sits at its start, before the words:
    // the tab is as wide as the picture, the gap, the words and the padding.
    // A drawn ring or dot (#1120) stands where a glyph would, as large as
    // one at `scale` of the words' size.
    const shapeIcon = lb.icon.kind === 'shape';
    const glyphIcon = shapeIcon || (lb.icon.kind === 'glyph' && lb.icon.glyph.length > 0);
    const iconResource = !glyphIcon && lb.icon.resourceId ? ctx.resourceById.get(lb.icon.resourceId) : undefined;
    const iconFileId = iconResource?.bitmap?.fileId ?? iconResource?.svg?.fileId;
    // A glyph (#1054): a character of a font at `scale` of the words' size,
    // as wide as its advance, centred on the tab's middle as the words are.
    const glyphPx = glyphIcon ? lbFontPx * lb.icon.scale : 0;
    const glyphFont = glyphIcon && !shapeIcon ? buildFontString(lb.icon.fontFamily, glyphPx, lb.icon.fontWeight.toString()) : '';
    const glyphW = shapeIcon ? glyphPx : glyphIcon ? flowTextWidth(lb.icon.glyph, glyphFont) : 0;
    const inside = lb.icon.placement === 'inside' && (!!iconFileId || glyphIcon);
    let iconFit = { w: glyphW, h: 0 };
    if (iconFileId) {
      const dims = iconResource?.bitmap ?? iconResource?.svg;
      const boxW = px(lb.icon.width);
      iconFit = { w: boxW, h: tabH };
      if (dims?.width && dims?.height) {
        const k = Math.min(boxW / dims.width, tabH / dims.height);
        iconFit = { w: dims.width * k, h: dims.height * k };
      }
    }
    // The picture painted in the colour of the words (#995), or in a colour
    // of its own (#1120): a print master (a PDF page) cannot be recoloured,
    // so the PDF draws the SVG itself.
    const tint = tintHex(lb.icon.tint, lb.color);
    const tintOf = tint ? { tint } : {};
    const traitsOf = (resource: Parameters<typeof pictureTraits>[0], fileId: string) => {
      const traits = pictureTraits(resource, fileId);
      if (tint) delete traits.pdfFileId;
      return traits;
    };
    const iconRoom = inside ? iconFit.w + px(lb.icon.gap) : 0;
    const tabW = textW + iconRoom + 2 * padX;
    const corner = labelAtFoot ? lb.position.slice('bottom-'.length) : lb.position.startsWith('top-') ? lb.position.slice('top-'.length) : lb.position;
    const tabSide = corner === 'start' ? boxSide('start')
      : corner === 'end' ? boxSide('end')
        : corner === 'right' ? 'right' : 'left';
    const onRight = tabSide === 'right';
    const tabX = onRight ? boxWidth - inset - tabW : inset;
    // A tab at the foot (#1059) is the one at the head turned over: its
    // foot `offset` below the box's.
    const tabY = labelAtFoot ? boxHeight + rise - tabH : -rise;
    if (labelAtFoot) labelDropPx = Math.max(0, rise);
    else labelRisePx = Math.max(0, rise);
    if (labelJoined) {
      // One outline for the box and its tab: the box's fill and border,
      // the tab's outer corners rounded as the box's corner it hugs and
      // its sides meeting the box in fillets of that radius (or
      // `fillet`). The stripe keeps to the box, square where a tab flush
      // with the side goes on.
      const cornerIndex = labelAtFoot ? (onRight ? 2 : 3) : (onRight ? 1 : 0);
      const tabRadius = radii[cornerIndex]!;
      // A radius of the tab's own (#1102) rounds its outer corners, the
      // left one and the right one; the fillets keep the box's corner.
      const own = lb.borderRadius !== undefined ? cornerRadiiPx(lb.borderRadius, px) : undefined;
      const outer: number | [number, number] = own
        ? (labelAtFoot ? [own[3], own[2]] : [own[0], own[1]])
        : tabRadius;
      const shapeTab: ShapeTab = {
        edge: labelAtFoot ? 'bottom' : 'top',
        x0: tabX,
        x1: tabX + tabW,
        height: tabH,
        radius: outer,
        fillet: lb.fillet ? Math.max(0, px(lb.fillet)) : tabRadius,
      };
      const boxRect = createBoundingBox(0, 0, boxWidth, boxHeight);
      const outline = boxOutline(boxRect, radii, shapeTab);
      const whole = borderOn && px(style.border.width) > 0 ? { color: style.border.color.hex, widthPx: px(style.border.width) } : null;
      const border: ShapeBorder = sides ?? { top: whole, right: whole, bottom: whole, left: whole };
      const shapes = shapePathBlocks(outline, style.backgroundEnabled ? style.background.hex : undefined, border);
      // A tab in its own fill (#1102): the tab's part of the outline in the
      // label's background, over the box's fill and under the border.
      if (lb.ownBackground) {
        const [tabFill] = shapePathBlocks(tabRegionOutline(boxRect, radii, shapeTab), lb.background.hex, undefined);
        if (tabFill) {
          const at = shapes.findIndex((b) => b.boxPart !== 'fill');
          shapes.splice(at < 0 ? shapes.length : at, 0, tabFill);
        }
      }
      overlayBlocks.splice(boxShapeAt, boxPainted ? 1 : 0, ...shapes);
      if (stripeBlock) {
        const at = (cx: number, cy: number) => outline.vertices.find((v) => v.x === cx && v.y === cy)?.r ?? 0;
        const clipRadii: [number, number, number, number] = [at(0, 0), at(boxWidth, 0), at(boxWidth, boxHeight), at(0, boxHeight)];
        if (clipRadii.some((r) => r > 0)) stripeBlock.clip = { x: 0, y: 0, width: boxWidth, height: boxHeight, radii: clipRadii };
        else delete stripeBlock.clip;
      }
    } else {
      // A tab apart from the box is square unless it sets corners of its
      // own (#1102): a box style with radii, which every backend draws
      // through `boxOutline` (one radius on every corner stays a plain
      // rounded box).
      const tabRadii = lb.borderRadius !== undefined ? cornerRadiiPx(lb.borderRadius, px) : undefined;
      overlayBlocks.push({
        kind: 'box',
        bbox: createBoundingBox(tabX, tabY, tabW, tabH),
        box: tabRadii && tabRadii.some((r) => r > 0)
          ? normalizeBoxStyle({ backgroundColor: lb.background.hex, borderWidthPx: 0, borderRadiusPx: 0, borderRadiiPx: tabRadii })
          : { backgroundColor: lb.background.hex, borderWidthPx: 0, borderRadiusPx: 0 },
      });
    }
    // The words follow the picture: to its right in a left-to-right box,
    // to its left in a right-to-left one (the box's start side).
    const iconAtRight = inside && boxSide('start') === 'right';
    overlayBlocks.push(directText({
      kind: 'text',
      bbox: createBoundingBox(tabX, tabY, tabW, tabH),
      fontString: lbFont,
      color: lb.color.hex,
      lines: [{ text: labelText, xOffset: padX + (inside && !iconAtRight ? iconRoom : 0), baselineY: tabY + tabH / 2 + lbFontPx * 0.36, width: textW }],
      clip: false,
    }));
    let edgeX = onRight ? tabX : tabX + tabW;
    // The glyph block at `x`: pagination furniture to a reader (a tagged
    // PDF's artifact, hidden in HTML), so the tab reads only its words.
    const glyphBlock = (x: number): VDTDesignBlock => (shapeIcon
      ? iconShapeBlock(lb.icon.shape ?? 'ring', x + glyphW / 2, tabY + tabH / 2, glyphW, (lb.icon.color ?? lb.color).hex,
        lb.icon.strokeWidth ? Math.max(0, dimensionToPx(lb.icon.strokeWidth, dpi, lbFontPx)) : undefined)
      : glyphTextBlock(x));
    const glyphTextBlock = (x: number): VDTDesignTextBlock => ({
      kind: 'text',
      bbox: createBoundingBox(x, tabY, glyphW, tabH),
      fontString: glyphFont,
      color: (lb.icon.color ?? lb.color).hex,
      lines: [{ text: lb.icon.glyph, xOffset: 0, baselineY: tabY + tabH / 2 + glyphPx * 0.36, width: glyphW }],
      clip: false,
      artifact: true,
    });
    if (glyphIcon) {
      const gap = px(lb.icon.gap);
      const gx = inside
        ? (iconAtRight ? tabX + tabW - padX - glyphW : tabX + padX)
        : (onRight ? tabX - gap - glyphW : tabX + tabW + gap);
      overlayBlocks.push(glyphBlock(gx));
      if (!inside) edgeX = onRight ? gx : gx + glyphW;
    } else if (inside) {
      const ix = iconAtRight ? tabX + tabW - padX - iconFit.w : tabX + padX;
      overlayBlocks.push({ kind: 'image', bbox: createBoundingBox(ix, tabY + (tabH - iconFit.h) / 2, iconFit.w, iconFit.h), fileId: iconFileId!, ...traitsOf(iconResource, iconFileId!), ...tintOf });
    } else if (iconFileId) {
      const iconW = px(lb.icon.width);
      const gap = px(lb.icon.gap);
      const iconX = onRight ? tabX - gap - iconW : tabX + tabW + gap;
      overlayBlocks.push({ kind: 'image', bbox: createBoundingBox(onRight ? iconX + iconW - iconFit.w : iconX, tabY + (tabH - iconFit.h) / 2, iconFit.w, iconFit.h), fileId: iconFileId, ...traitsOf(iconResource, iconFileId), ...tintOf });
      edgeX = onRight ? iconX + iconW - iconFit.w : iconX + iconFit.w;
    }
    if (lb.rule.enabled) {
      const ruleW = px(lb.rule.width);
      const x0 = onRight ? 0 : edgeX;
      const len = onRight ? edgeX : boxWidth - edgeX;
      if (len > 0) {
        overlayBlocks.push({
          kind: 'rule',
          bbox: createBoundingBox(x0, (labelAtFoot ? boxHeight : 0) - ruleW / 2, len, ruleW),
          color: lb.rule.color.hex,
          thicknessPx: ruleW,
          direction: 'horizontal',
        });
      }
    }
  }

  // --- Marker column + frame -----------------------------------------------------
  // The frame is as tall as the tallest of box, marker and rule; the three
  // are centred on each other (`marker.align: 'center'`) or top-aligned.
  const ruleLen = ruleOn ? Math.max(px(style.marker.rule.length), boxHeight) : 0;
  const totalHeight = Math.max(boxHeight, markerSize, ruleLen);
  const centerMarker = style.marker.align === 'center';
  const boxDy = centerMarker ? (totalHeight - boxHeight) / 2 : 0;
  const width = markerColumn + boxWidth;
  if (markerColumn > 0 || boxDy > 0) {
    for (const b of overlayBlocks) offsetDesignBlock(b, markerColumn, boxDy);
    for (const blk of childBlocks) offsetBlock(blk, markerColumn, boxDy);
    for (const g of groupLayouts) g.top += boxDy;
    innerRect.x += markerColumn;
    innerRect.y += boxDy;
  }
  // Paint order: marker, rule, then the box decoration (the marker lies
  // outside the box, so the order only matters for readers of the overlay).
  const markerBlocks: VDTDesignBlock[] = [];
  let markerFileId: string | undefined;
  let markerFormat: string | undefined;
  if (hasMarker) {
    const markerY = centerMarker ? (totalHeight - markerSize) / 2 : 0;
    const built = buildIconBlock(style.marker, 0, markerY, markerSize, ctx, markerSize, px);
    if (built) {
      markerBlocks.push(built.block);
      markerFileId = built.fileId;
      markerFormat = built.format;
    }
    if (ruleOn) {
      const ruleY = centerMarker ? (totalHeight - ruleLen) / 2 : 0;
      markerBlocks.push({
        kind: 'rule',
        bbox: createBoundingBox(markerSize, ruleY, ruleW, ruleLen),
        color: style.marker.rule.color.hex,
        thicknessPx: ruleW,
        direction: 'vertical',
      });
    }
  }
  // The label tab rises above the box inside the block: the box starts
  // `labelRisePx` down, so the tab keeps its room at a column head too,
  // where the top margin is dropped.
  if (labelRisePx > 0) {
    for (const b of overlayBlocks) offsetDesignBlock(b, 0, labelRisePx);
    for (const b of markerBlocks) offsetDesignBlock(b, 0, labelRisePx);
    for (const blk of childBlocks) offsetBlock(blk, 0, labelRisePx);
    for (const g of groupLayouts) g.top += labelRisePx;
    innerRect.y += labelRisePx;
  }
  // A tab at the foot (#1059) hangs below the box inside the block too.
  const frameHeight = totalHeight + labelRisePx + labelDropPx;
  const overlay: VDTDesignSlot = {
    bbox: createBoundingBox(0, 0, width, frameHeight),
    blocks: [...markerBlocks, ...overlayBlocks],
  };

  // --- Frame block -------------------------------------------------------------
  const frame = createVDTBlock(frameId, 'callout', bodyStyle.fontString, bodyStyle.color, bodyStyle.textAlign);
  frame.bbox = createBoundingBox(0, 0, width, frameHeight);
  frame.lines = [];
  frame.dirty = false;
  frame.snappedToGrid = false;
  frame.containerId = containerId;
  if (nestPath) frame.calloutPath = [...nestPath];
  frame.designOverlay = overlay;
  frame.callout = {
    styleId: style.id,
    span,
    placement,
    innerRect,
    childIds: childBlocks.map((b) => b.id),
    iconFileId,
    iconFormat,
    markerFileId,
    markerFormat,
    ...(attrs.turn === '180' ? { turned: true as const } : {}),
  };

  return {
    frame,
    children: childBlocks,
    units,
    width,
    totalHeight: frameHeight,
    // A main-flow group's box takes the space its fence asks for in place
    // of its style's (`wrapFlowColumns` copies the attributes, #714).
    marginTopPx: (flowGroupBox ? fenceMarginPx(attrs.marginTop, em, dpi) : undefined) ?? px(style.marginTop),
    marginBottomPx: (flowGroupBox ? fenceMarginPx(attrs.marginBottom, em, dpi) : undefined) ?? px(style.marginBottom),
    continuesMarkerPx,
    ...(overflowPx !== undefined ? { overflowPx } : {}),
    ...(groupLayouts.length > 0 ? { groups: groupLayouts } : {}),
  };
}

// ---------------------------------------------------------------------------
// Icons (shared by the in-box icon and the marker)
// ---------------------------------------------------------------------------

type IconSpec = Omit<ResolvedCalloutStyleConfig['icon'], 'position' | 'cornerSide' | 'width'>;

/** Whether an icon / marker spec draws anything. */
function iconPresent(spec: IconSpec): boolean {
  if (spec.kind === 'glyph') return spec.glyph.length > 0;
  if (spec.kind === 'resource') return spec.resourceId.length > 0;
  return spec.kind === 'shape';
}

/** The colour a picture icon is painted in (#995, #1120): `tint: true`
 *  in `own` (the icon's colour, a label tab's words'), a colour of its own,
 *  none for `false` or unset. */
function tintHex(tint: boolean | ColorValue | undefined, own: ColorValue): string | undefined {
  if (tint === true) return own.hex;
  return tint && typeof tint === 'object' ? tint.hex : undefined;
}

/** Fit a `w × h` image inside the square `(x, y, size)`, centred, keeping
 *  its aspect ratio. Unknown dimensions fill the square. */
function fitInSquare(x: number, y: number, size: number, w?: number, h?: number): BoundingBox {
  if (!w || !h || w <= 0 || h <= 0) return createBoundingBox(x, y, size, size);
  const scale = size / Math.max(w, h);
  const fw = w * scale;
  const fh = h * scale;
  return createBoundingBox(x + (size - fw) / 2, y + (size - fh) / 2, fw, fh);
}

/** How wide the icon `buildIconBlock` draws for `spec` in a slot `size`
 *  tall and `boxWidth` wide: the fitted picture of a wide resource icon (a
 *  strip), else the square. A corner badge is centred on its corner by
 *  this width (EF-142). */
function iconFootprintWidth(spec: IconSpec, size: number, boxWidth: number, ctx: BlockMeasureContext): number {
  if (spec.kind !== 'resource' || boxWidth <= size) return size;
  const resource = ctx.resourceById.get(spec.resourceId);
  const dims = resource?.bitmap ?? resource?.svg;
  if (!dims?.width || !dims.height) return size;
  return dims.width * Math.min(boxWidth / dims.width, size / dims.height);
}

interface BuiltIcon {
  block: VDTDesignBlock;
  /** Resource image id / bitmap format for `kind: 'resource'`. */
  fileId?: string;
  format?: string;
}

/** The design block for an icon spec drawn in the square `(x, y, size)`:
 *  an image block for a resource (aspect-fitted; `undefined` when the
 *  resource is missing), a centred text block for a glyph. */
function buildIconBlock(
  spec: IconSpec,
  x: number,
  y: number,
  size: number,
  ctx: BlockMeasureContext,
  boxWidth = size,
  px: (d: Dimension) => number = () => 0,
): BuiltIcon | undefined {
  if (spec.kind === 'shape') {
    // A drawn ring or dot (#1120), `size` across in the slot's middle.
    const stroke = spec.strokeWidth ? Math.max(0, px(spec.strokeWidth)) : undefined;
    return { block: iconShapeBlock(spec.shape ?? 'ring', x + size / 2, y + size / 2, size, spec.color.hex, stroke) };
  }
  if (spec.kind === 'resource') {
    const resource = ctx.resourceById.get(spec.resourceId);
    const fileId = resource?.bitmap?.fileId ?? resource?.svg?.fileId;
    if (!fileId) return undefined;
    const dims = resource?.bitmap ?? resource?.svg;
    let bbox = fitInSquare(x, y, size, dims?.width, dims?.height);
    if (boxWidth > size && dims?.width && dims?.height) {
      const k = Math.min(boxWidth / dims.width, size / dims.height);
      const fw = dims.width * k;
      const fh = dims.height * k;
      bbox = createBoundingBox(x, y + (size - fh) / 2, fw, fh);
    }
    // Painted in one colour (#1120): one ring picture serves every tint.
    // A print master (a PDF page) cannot be recoloured, so the PDF draws
    // the SVG itself.
    const tint = tintHex(spec.tint, spec.color);
    const traits = pictureTraits(resource, fileId);
    if (tint) delete traits.pdfFileId;
    return {
      block: { kind: 'image', bbox, fileId, ...traits, ...(tint ? { tint } : {}) },
      fileId,
      format: resource?.bitmap?.format,
    };
  }
  const font = buildFontString(spec.fontFamily, size, spec.fontWeight.toString());
  const glyphW = flowTextWidth(spec.glyph, font);
  return {
    block: {
      kind: 'text',
      bbox: createBoundingBox(x, y, size, size),
      fontString: font,
      color: spec.color.hex,
      lines: [{
        text: spec.glyph,
        xOffset: Math.max(0, (size - glyphW) / 2),
        baselineY: y + lineBaselineOffset(size, font),
        width: glyphW,
      }],
      clip: false,
    },
  };
}

/** A rectangle a box's text runs round (`CalloutLayoutInput.exclusions`),
 *  with the shape inside it a contour wrap runs round (#883). */
export interface BoxExclusion {
  x: number;
  y: number;
  width: number;
  height: number;
  contour?: VDTExclusionContour;
}

/** The line insets of a text set from `y0` in `[x, x + width]` with lines
 *  `lineHeight` apart, beside the rectangles of `exclusions` (#855): a line
 *  that meets one, even in part, is set short on the side the rectangle
 *  covers (the wider side left free when it stands inside the measure). */
export function exclusionInsets(
  exclusions: readonly BoxExclusion[],
  x: number,
  width: number,
  y0: number,
  lineHeight: number,
): LineInsetStep[] {
  const steps: LineInsetStep[] = [];
  if (!(lineHeight > 0)) return steps;
  const right = x + width;
  for (const ex of exclusions) {
    const exRight = ex.x + ex.width;
    if (exRight <= x + 0.01 || ex.x >= right - 0.01) continue;
    const bottom = ex.y + ex.height;
    if (bottom <= y0 + 0.01) continue;
    const from = Math.max(0, Math.floor((ex.y - y0 + 0.01) / lineHeight));
    const to = Math.ceil((bottom - y0 - 0.01) / lineHeight) - 1;
    if (to < from) continue;
    const roomLeft = ex.x - x;
    const roomRight = right - exRight;
    const coversLeft = roomLeft <= roomRight;
    if (ex.contour) {
      // A contour (#883): each line as short as the shape is wide beside it.
      steps.push(...contourInsetSteps(ex.contour, coversLeft ? 'left' : 'right', x, width, y0, lineHeight, from, to));
      continue;
    }
    steps.push({
      fromLine: from,
      toLine: to,
      startInsetPx: coversLeft ? Math.min(width, exRight - x) : 0,
      endInsetPx: coversLeft ? 0 : Math.min(width, right - ex.x),
    });
  }
  return steps;
}
