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

import { flowTextWidth, lineBaselineOffset } from '../measure/vertical';
import { onTextWidthCacheClear } from '../measure/canvas';
import type { ContentBlock, DirectiveAttrs } from '../parse';
import { suffixJoiner } from '../parse/inlineFormatting';
import { spaceDirectiveLines } from '../parse/attrs';
import type {
  CalloutPlacement,
  CalloutSpan,
  Dimension,
  ResolvedCalloutStyleConfig,
} from '../types';
import { dimensionToPx } from '../units';
import {
  type BoundingBox,
  createBoundingBox,
  createVDTBlock,
  pictureTraits,
  type ResolvedConfig,
  type ResolvedResourceBlock,
  type VDTBlock,
  type VDTDesignBlock,
  type VDTDesignSlot,
  type VDTDesignTextBlock,
} from '../vdt';
import { buildFontString, measureBlock, measureRichBlock } from '../measure';
import { graphemeCount } from '../measure/graphemes';
import { applyStyleAttrs, isMarkerBlock, widthLessEndIndent } from './buildHelpers';
import { resetLinePositions } from './placement';
import { raggedLooseLines } from './raggedLines';
import { resolveBodyStyle, resolveBlockquoteStyle } from './styles';
import { computeLevelIndentsPx, computeOrderedLevelIndentsPx, listBulletPosition, listItemGapPx, mirrorListMarker } from './lists';
import { measureContentBlock, type BlockMeasureContext, type MeasureContentBlockOptions } from './measureContentBlock';
import { uppercasePreservingLength } from './buildBlockKind';
import { headingIsHidden } from './headingStyles';
import { directDesignTextBlock } from '../design/bidiText';
import { containerStyle, paragraphStyleIdOf, type ParagraphContainerPlan } from './paragraphContainers';
import { joiningScriptIn } from '../measure/joining';
import { getMeasureDirection, shiftLineX } from '../measure/bidiLines';
import { resolvedCodeStyle } from '../defaults/codeStyle';
import { parseLengthText } from '../defaults/tabStops';
import { isFlowColumnsStyle } from './flowColumns';
import { fillGalley, galleyBreaks, minFillHeight, type GalleyItem } from './columnsGroup';

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
  return {
    ...resolved,
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
      levels: ul.levels.map((l) => ({
        ...l,
        bulletChar: bulletOverride ? lists.bulletChar : l.bulletChar,
        color: colorOverride ? lists.color : l.color,
        // A bullet size / weight of its own sets the glyph in the box's body
        // face at that size (the document's list face otherwise).
        ...(lists.bulletFontSize ? { fontSize: lists.bulletFontSize, fontFamily: body.fontFamily } : {}),
        ...(lists.bulletFontWeight !== undefined ? { fontWeight: lists.bulletFontWeight } : {}),
      })),
    },
    orderedLists: {
      ...ol,
      color: numberColorOverride ? lists.color : ol.color,
      indent: lists.indent,
      gap: lists.gap,
      itemSpacing: lists.itemSpacing,
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
  if (isFlowColumnsStyle(style.id)) return ctx;
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
}

/** The measures of `layoutCallout`'s first child across widths (see
 *  `CalloutLayoutInput.lineWidths`), per resolved configuration and
 *  content block: a build lays a split box out again on every pass. */
let acrossWidthsMemo = new WeakMap<ResolvedConfig, WeakMap<ContentBlock, Map<string, ReturnType<typeof measureContentBlock> | undefined>>>();
// Measures: dropped with the widths when faces change (#629).
onTextWidthCacheClear(() => {
  acrossWidthsMemo = new WeakMap();
});

/** A box width the first child of a continuation was counted at (see
 *  `CalloutLayoutInput.lineWidths`). */
export interface CalloutLineWidth {
  fromLine: number;
  width: number;
}

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
  /** The `:::columns` groups among the box's own children (not a nested
   *  box's), as laid out: where a fragment may cut inside them (#634). */
  groups?: CalloutGroupLayout[];
}

/** A position in a `:::columns` group's galley (#634): before child
 *  `child` (a position in the box's children), past its first `line`
 *  lines. A stream that is done sits at the next stream's first child (or
 *  the group's closing marker). */
export interface GroupPos {
  child: number;
  line: number;
  /** For a cut inside a paragraph: the sub-column widths its lines up to
   *  `line` were set at, from line `fromLine` on. */
  widths?: readonly CalloutLineWidth[];
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
}

/** Read a `:::columns` fence: `count` (2 by default, at most 6), `gap` (a
 *  length; else `defaultGapPx`), `rule` (a rule down each gutter), `breaks`
 *  (the children that open each column after the first) and `flow`
 *  (`'parallel'` by default with `breaks`, `'snake'` without; an unknown
 *  value takes the default). */
export function columnsSpecOf(attrs: DirectiveAttrs, defaultGapPx: number, emPx: number, dpi: number): ColumnsSpec {
  const count = Number.parseInt(attrs.count ?? '2', 10);
  const breaks = (attrs.breaks ?? '').split(',').map((v) => Number.parseInt(v.trim(), 10)).filter((v) => Number.isFinite(v) && v > 1);
  const gap = attrs.gap !== undefined ? parseLengthText(attrs.gap) : undefined;
  const gapPx = gap ? dimensionToPx(gap, dpi, emPx) : defaultGapPx;
  const flow = attrs.flow === 'snake' || attrs.flow === 'parallel' ? attrs.flow : breaks.length > 0 ? 'parallel' : 'snake';
  return {
    count: Number.isFinite(count) ? count : 2,
    gapPx: Number.isFinite(gapPx) && gapPx >= 0 ? gapPx : defaultGapPx,
    rule: attrs.rule !== undefined && attrs.rule !== 'false',
    flow,
    ...(breaks.length > 0 ? { breaks } : {}),
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
  if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, ox, oy);
  // A nested box's frame carries its decoration on the overlay.
  if (blk.designOverlay) {
    blk.designOverlay.bbox.x += ox;
    blk.designOverlay.bbox.y += oy;
    for (const b of blk.designOverlay.blocks) offsetDesignBlock(b, ox, oy);
  }
}

function offsetDesignBlock(b: VDTDesignBlock, ox: number, oy: number): void {
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
  const { style, attrs, children, childStartIdx, ctx, containerId, frameId } = input;
  const dpi = input.resolved.page.dpi;
  const derivedCtx = deriveCalloutMeasureContext(ctx, style);
  const bodyStyle = derivedCtx.bodyStyle;
  const em = bodyStyle.fontSizePx;
  const px = (d: Dimension): number => dimensionToPx(d, dpi, em);

  const { span, placement, title: rawTitle, label: labelText } = resolveCalloutAttrs(style, attrs);
  const isAuto = style.width === 'auto';
  // The title, the continuation marker and the label are design text set
  // here by hand: in a right-to-left document their lines are ordered at
  // that base direction, for the mirrored flow the box is painted in.
  const rtlDocument = input.resolved.direction === 'rtl';
  const mirroredFlow = rtlDocument && input.resolved.layout.writingMode !== 'vertical-rl';
  const directText = (block: VDTDesignTextBlock, trackingPx = 0): VDTDesignTextBlock => {
    directDesignTextBlock(block, rtlDocument ? 'rtl' : 'ltr', mirroredFlow, trackingPx);
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
  // letters apart breaks the joins (`measure/joining.ts`).
  const titleTrackingPx = joiningScriptIn(titleText) ? 0 : Math.max(0, dimensionToPx(style.titleStyle.letterSpacing, dpi, titleFontPx));
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
    // Tracking only widens lines on the rich path: the plain breaker would
    // fit an untracked line and the tracked title would overrun the box.
    const measured = titleTrackingPx > 0
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
    titleBlock = directText({
      kind: 'text',
      bbox: createBoundingBox(innerX + titleIndentPx, cursorY, titleW, titleHeight),
      fontString: titleFont,
      color: style.titleStyle.color.hex,
      lines: lines.map((ln, i) => ({
        text: ln.text,
        xOffset: 0,
        baselineY: cursorY + i * titleLineHeight + lineBaselineOffset(titleLineHeight, titleFont),
        width: ln.bbox.width,
      })),
      clip: false,
      ...(titleTrackingPx > 0 ? { letterSpacingPx: titleTrackingPx } : {}),
      ...(repeatedTitle ? { artifact: true } : {}),
    }, titleTrackingPx);
    cursorY += titleHeight;
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
      const key = `${styleAt}|${blockIdx}|${steps.slice(0, i + 1).map((st) => `${st.fromLine}:${st.columnWidth}`).join(',')}`;
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
    const blockIdx = childStartIdx + k;
    // Inside a `:::paragraphs` container: its style, and for the block that
    // closes it the tail style, which carries the container's bottom margin.
    const container = input.paragraphContainers?.byBlock[blockIdx];
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
    const measuredBlock = acrossGroup
      ?? (lineCut ? undefined : measureFirstChildAcrossWidths(raw, blockIdx, k, width, styleOverride))
      ?? measureContentBlock(raw, blockIdx, width, derivedCtx, { styleOverride });
    if (!measuredBlock) return undefined;
    const { kind, measured, prefixLen, absoluteSourceMap, mathDisplayRender, resourceBlock, letterSpacingPx, code } = measuredBlock;
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

    const blk = createVDTBlock(input.nextChildId(), vdtType, bs.fontString, bs.color, bs.textAlign);
    applyStyleAttrs(blk, bs);
    // The tracking the lines were measured with (a runt set one line
    // shorter, a heading level's `letterSpacing`): painted as measured,
    // as in the flow (EF-111).
    if (letterSpacingPx !== undefined) blk.letterSpacing = letterSpacingPx;
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
    blk.sourceMap = absoluteSourceMap;
    blk.plainPrefixLen = prefixLen;

    // Line-level cut of the first / last child (split boxes): the kept
    // run of lines, and whether this child opens after its first line
    // (no bullet then — the head carries it).
    const isTextRun = !(vdtType === 'resource' && resourceBlock) && !(vdtType === 'mathDisplay' && mathDisplayRender);
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
    } else {
      blk.lines = resetLinePositions(keptLines, bs.lineHeightPx);
      height = blk.lines.length * bs.lineHeightPx;
      blk.sourceStart = keptLines[0]!.sourceStart ?? raw.sourceStart + ctx.bodyOffset;
      blk.sourceEnd = keptLines[keptLines.length - 1]!.sourceEnd ?? raw.sourceEnd + ctx.bodyOffset;
    }

    // Relocate to the inner rect (box-relative).
    blk.bbox = createBoundingBox(x, st.cursorY, widthLessEndIndent(blk, width), height);
    for (const line of blk.lines) {
      shiftLineX(line, x);
      line.bbox.y += st.cursorY;
      line.baseline += st.cursorY;
    }
    if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, x, st.cursorY);
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
      blk.bulletText = listBullet.bulletText;
      blk.bulletFontString = listBullet.bulletFontString;
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
    const pc = input.paragraphContainers?.byId.get(raw.containerId);
    if (!pc || st.first) return;
    if (raw.type === 'containerEnd' && children[k - 1]?.type === 'paragraph') {
      if (input.resolved.bodyText.paragraphContainerSpacing === 'collapse' && !st.pull && bodyStyle.marginBottomPx > st.prevMarginBottom) {
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
    delete tail.bulletText; delete tail.bulletFontString; delete tail.bulletColor;
    delete tail.bulletOffsetX; delete tail.bulletY; delete tail.bulletBaselineY;
    delete tail.separatorText; delete tail.separatorFontString; delete tail.separatorColor; delete tail.separatorX;
    delete tail.prefixText; delete tail.prefixX;
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
  /** The galley of stacked items, for the split code (see `columnsGroup.ts`). */
  const galleyOf = (stack: readonly GroupItem[]): GalleyItem[] => stack.map((it) => {
    const blk = it.blocks[0]!;
    const cuttable = it.unit.kind === 'block' && blk.type !== 'resource' && blk.type !== 'mathDisplay' && blk.lines.length > 1 && !blk.mathRender;
    return {
      child: it.k,
      lineBase: it.lineBase,
      y: blk.bbox.y,
      height: blk.bbox.height,
      ...(cuttable ? { lineBottoms: blk.lines.map((l) => l.bbox.y + l.bbox.height - blk.bbox.y) } : {}),
    };
  });
  /** A column start in a group's stack: before item `block`, or past its
   *  first `line` lines, at `y` in the stack. */
  interface ColumnCut { y: number; block: number; line: number }
  /** Balanced cuts: each column start at the item or line boundary nearest
   *  an even share of the stack's height. */
  const balancedCuts = (stack: readonly GroupItem[] & { end?: number }, cols: number): ColumnCut[] => {
    if (stack.length === 0) return [];
    const total = stack.end ?? 0;
    // Cut candidates: item boundaries and the line boundaries of text blocks.
    const candidates: ColumnCut[] = [];
    stack.forEach((item, i) => {
      const blk = item.blocks[0]!;
      if (i > 0) candidates.push({ y: blk.bbox.y, block: i, line: 0 });
      const cuttable = item.unit.kind === 'block' && blk.type !== 'resource' && blk.type !== 'mathDisplay' && blk.lines.length > 1 && !blk.mathRender;
      if (cuttable) {
        for (let l = 1; l < blk.lines.length; l++) candidates.push({ y: blk.lines[l]!.bbox.y, block: i, line: l });
      }
    });
    const cuts: ColumnCut[] = [];
    let prevY = 0;
    for (let c = 1; c < cols; c++) {
      const target = (total * c) / cols;
      let best: ColumnCut | undefined;
      for (const cand of candidates) {
        if (cand.y <= prevY + 0.01) continue;
        if (!best || Math.abs(cand.y - target) < Math.abs(best.y - target)) best = cand;
      }
      if (!best) break;
      cuts.push(best);
      prevY = best.y;
    }
    return cuts;
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
    // Spacing above the group: as a block with no margin of its own.
    const groupTop = st.cursorY + st.prevMarginBottom;
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
    st.prevMarginBottom = 0;
    st.pull = false;
    st.prevWasListItem = false;
    st.first = false;
  };

  const holdsContent = children.some((c) => (c.type !== 'directive' || isStripChild(c)) && !isMarkerBlock(c));
  const st: Stack = {
    cursorY,
    prevMarginBottom: hasTitle ? gapPx : 0,
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
        placeColumnsGroup(k + 1, e, columnsSpecOf(raw.containerAttrs ?? {}, columnGapPx, em, dpi), st, {
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
      if (continuesBlock) offsetDesignBlock(continuesBlock, 0, extra / 2);
      for (const blk of childBlocks) offsetBlock(blk, 0, extra / 2);
      for (const r of groupRules) offsetDesignBlock(r, 0, extra / 2);
      for (const g of groupLayouts) g.top += extra / 2;
    }
    contentBottom += extra;
  }
  const boxHeight = contentBottom + padB;
  const innerRect = createBoundingBox(innerX, innerTop, innerWidth, Math.max(0, contentBottom - innerTop));

  // --- Box decoration (paint order: background, stripe, icon, title) ---------
  const borderOn = style.border.enabled;
  if (style.backgroundEnabled || borderOn) {
    overlayBlocks.push({
      kind: 'box',
      bbox: createBoundingBox(0, 0, boxWidth, boxHeight),
      box: {
        backgroundColor: style.backgroundEnabled ? style.background.hex : undefined,
        borderColor: borderOn ? style.border.color.hex : undefined,
        borderWidthPx: borderOn ? px(style.border.width) : 0,
        borderRadiusPx: px(style.borderRadius),
      },
    });
  }
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
  if (stripeOn) {
    const stripeBox = topStripe
      ? createBoundingBox(0, 0, boxWidth, stripeW)
      : stripeLeft
        ? createBoundingBox(0, 0, stripeW, boxHeight)
        : createBoundingBox(boxWidth - stripeW, 0, stripeW, boxHeight);
    // On a rounded frame the stripe follows the corners: it is clipped to
    // the frame's rounded rectangle (the radius clamped as the frame's is),
    // so its square ends never stick out past the background and border.
    const frameRadius = Math.max(0, Math.min(px(style.borderRadius), boxWidth / 2, boxHeight / 2));
    overlayBlocks.push({
      kind: 'box',
      bbox: stripeBox,
      box: { backgroundColor: style.stripe.color.hex, borderWidthPx: 0, borderRadiusPx: 0 },
      ...(frameRadius > 0
        ? { clip: { x: 0, y: 0, width: boxWidth, height: boxHeight, radii: [frameRadius, frameRadius, frameRadius, frameRadius] as [number, number, number, number] } }
        : {}),
    });
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
    const built = buildIconBlock(style.icon, iconX, iconY, iconSize, ctx, iconBoxW);
    if (built) {
      overlayBlocks.push(built.block);
      iconFileId = built.fileId;
      iconFormat = built.format;
    }
  }
  overlayBlocks.push(...groupRules);
  if (titleBlock) overlayBlocks.push(titleBlock);
  if (continuesBlock) overlayBlocks.push(continuesBlock);

  // --- Label tab ---------------------------------------------------------------
  // The fence's `label` on a tab hugging a top corner, rising `offset`
  // above the box; an icon beside it and a rule along the top edge.
  let labelRisePx = 0;
  if (style.label && !input.continuation && labelText.trim().length > 0) {
    const lb = style.label;
    const lbFontPx = dimensionToPx(lb.fontSize, dpi, em);
    const lbFont = buildFontString(lb.fontFamily, lbFontPx, lb.fontWeight.toString());
    const padX = dimensionToPx(lb.paddingX, dpi, lbFontPx);
    const tabH = dimensionToPx(lb.height, dpi, lbFontPx);
    const rise = px(lb.offset);
    const inset = px(lb.inset);
    const textW = flowTextWidth(labelText, lbFont);
    const tabW = textW + 2 * padX;
    const tabSide = lb.position === 'top-start' ? boxSide('start')
      : lb.position === 'top-end' ? boxSide('end')
        : lb.position === 'top-right' ? 'right' : 'left';
    const onRight = tabSide === 'right';
    const tabX = onRight ? boxWidth - inset - tabW : inset;
    const tabY = -rise;
    labelRisePx = Math.max(0, rise);
    overlayBlocks.push({
      kind: 'box',
      bbox: createBoundingBox(tabX, tabY, tabW, tabH),
      box: { backgroundColor: lb.background.hex, borderWidthPx: 0, borderRadiusPx: 0 },
    });
    overlayBlocks.push(directText({
      kind: 'text',
      bbox: createBoundingBox(tabX, tabY, tabW, tabH),
      fontString: lbFont,
      color: lb.color.hex,
      lines: [{ text: labelText, xOffset: padX, baselineY: tabY + tabH / 2 + lbFontPx * 0.36, width: textW }],
      clip: false,
    }));
    let edgeX = onRight ? tabX : tabX + tabW;
    if (lb.icon.resourceId) {
      const iconW = px(lb.icon.width);
      const gap = px(lb.icon.gap);
      const iconX = onRight ? tabX - gap - iconW : tabX + tabW + gap;
      const resource = ctx.resourceById.get(lb.icon.resourceId);
      const fileId = resource?.bitmap?.fileId ?? resource?.svg?.fileId;
      if (fileId) {
        const dims = resource?.bitmap ?? resource?.svg;
        let w = iconW;
        let h = tabH;
        if (dims?.width && dims?.height) {
          const k = Math.min(iconW / dims.width, tabH / dims.height);
          w = dims.width * k; h = dims.height * k;
        }
        overlayBlocks.push({ kind: 'image', bbox: createBoundingBox(onRight ? iconX + iconW - w : iconX, tabY + (tabH - h) / 2, w, h), fileId, ...pictureTraits(resource, fileId) });
        edgeX = onRight ? iconX + iconW - w : iconX + w;
      }
    }
    if (lb.rule.enabled) {
      const ruleW = px(lb.rule.width);
      const x0 = onRight ? 0 : edgeX;
      const len = onRight ? edgeX : boxWidth - edgeX;
      if (len > 0) {
        overlayBlocks.push({
          kind: 'rule',
          bbox: createBoundingBox(x0, -ruleW / 2, len, ruleW),
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
    const built = buildIconBlock(style.marker, 0, markerY, markerSize, ctx);
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
  const frameHeight = totalHeight + labelRisePx;
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
  };

  return {
    frame,
    children: childBlocks,
    units,
    width,
    totalHeight: frameHeight,
    marginTopPx: px(style.marginTop),
    marginBottomPx: px(style.marginBottom),
    continuesMarkerPx,
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
  return false;
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
): BuiltIcon | undefined {
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
    return {
      block: { kind: 'image', bbox, fileId, ...pictureTraits(resource, fileId) },
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
