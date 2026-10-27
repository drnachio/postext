// What layoutCallout takes and returns, the box designs and the headings
// they replace, and the fence attributes a box is read with (span,
// placement, columns, margins) (#1276: split out of calloutLayout.ts).
import type { DirectiveAttrs, ContentBlock } from '../../../parse/index.js';
import type { ResolvedCalloutStyleConfig, ResolvedCalloutDesignConfig, CalloutSpan, CalloutPlacement } from '../../../types.js';
import { dimensionToPx } from '../../../units.js';
import type { ResolvedConfig, VDTBlock, VDTDesignBlock, VDTLine } from '../../../vdt.js';
import type { BlockMeasureContext } from '../../blocks/measureContentBlock.js';
import type { MeasureMemo } from '../../composedPages/measureMemo.js';
import type { ParagraphContainerPlan } from '../paragraphContainers.js';
import { parseLengthText } from '../../../defaults/text/tabStops.js';
import type { GalleyItem } from '../../columns/columnsGroup.js';
import type { CalloutLineWidth, GroupPos } from '../../columns/cutTypes.js';
import type { BoxExclusion } from './geometry.js';

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
export const designedBoxHeadings = new WeakSet<VDTBlock>();
/** Whether `block` is a heading of a box set with its own design (see
 *  `CalloutLayoutInput.headingDesign`). */
export const isDesignedBoxHeading = (block: VDTBlock): boolean => designedBoxHeadings.has(block);
/** Mark `to`, a copy of `from`, as a designed heading when `from` is one. */
export const copyDesignedBoxHeading = (from: VDTBlock, to: VDTBlock): void => {
  if (designedBoxHeadings.has(from)) designedBoxHeadings.add(to);
};


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
