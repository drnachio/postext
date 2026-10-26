import { resolvedComics } from '../../defaults/comics.js';
import { fontFamilyOf, getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode, measureCentralBaseline, setMeasureWritingMode, withMeasureWritingMode } from '../../measure/vertical.js';
import type { PartPageInfo } from './placeholders.js';
import { applyPartPalettesToFlow, type FlowColorValues } from '../sections/partPalette.js';
import { recolorLineNumbers } from '../text/lineNumbers.js';
import { CHIP_PLACEHOLDER, applyTitleBreaks, extractInlineChips, injectChipSpans, parseInlineFormatting, replaceTitleBreaks, withoutChips } from '../../parse/inlineFormatting.js';
import type { InlineSpan } from '../../parse/types.js';
import type { ColorPaletteEntry, ColorValue, DesignSlot, DesignTextAlign, Dimension, DocumentMetadata, Resource, ResolvedCalloutDesignConfig, ResolvedDesignSlot, ResolvedDesignTextElement, ResolvedChipStyleConfig, ResolvedHeadingLevelConfig, TextAlign } from '../../types.js';
import {
  createBoundingBox,
  flowRectToPage,
  pageIsMirrored,
  pageIsVertical,
  type ContentWarning,
  type VDTBlock,
  type VDTDocument,
  type VDTDesignSlot,
  type VDTDesignBlock,
  type VDTDesignTextBlock,
  type VDTDesignRuleBlock,
  type VDTDesignBoxBlock,
  type VDTDesignBoxStyle,
  type VDTDesignImageBlock,
  type VDTDesignPathBlock,
  type VDTDesignSlotKind,
  type VDTChip,
  type VDTColumn,
  type VDTFrame,
  type VDTPage,
} from '../../vdt.js';
import { computeChapterTitles, computeChapterTitlesAtTop, computeChapterNumbers, computeChapterNumbersAtTop, computeChapterNumbersByBlock, computeChapterAttrs, computePageMarks, computePartValues, lineJoin, markSourceOf, type JoinedLine, type PageMarks } from './placeholders.js';
import { parsePartNumber, parsePartPalette, partMarkPages } from '../sections/parts.js';
import { composedLeafConfig, computePageMetrics, onComposedLeaf, sheetRectToFlow } from '../blocks/buildHelpers.js';
import { arabicNumbersOf, resolvedLocale } from '../config.js';
import { classifyPages } from './pageRoles.js';
import { computeSectionStyles, createHeadingLevelResolver, headingIsHidden, type HeadingLevelResolver } from '../sections/headingStyles.js';
import { dimensionToPx } from '../../units.js';
import { resolveDesignLineHeight, resolveDesignSlot } from '../../defaults/headerFooter.js';
import { repeatInstance, resolvePageTemplate } from '../../composed/templates.js';
import { splitSpreadDecoration } from '../../composed/spread.js';
import type { ResolvedPageTemplate } from '../../composed/types.js';
import { pathInkBox } from '../../design/pathBlock.js';
import { frameOfBlock, framePageRect } from '../../composed/paint.js';
import { figureAnchorPointOnPage } from '../../composed/labels.js';
import { expectedFurniture, folioMissingWarnings, type PageFurniture } from '../../composed/furniture.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { PageRole } from '../../types.js';
import {
  layoutDesignSlot,
  textVerticalOffset,
  trailingTracking,
  type DesignFrames,
  type ResolvedPrimitive,
  type ResolvedTextPrimitive,
  type ResolvedRulePrimitive,
  type ResolvedBoxPrimitive,
  type ResolvedImagePrimitive,
  type ResolvedPathPrimitive,
} from '../../design/layout.js';
import { resolveDesignText, type DesignLeader, type DesignPlaceholderContext, type HeadingPlaceholderInfo } from '../../design/placeholders.js';
import { plainDesignText } from '../../design/richText.js';
import { withDigits } from '../../arabicNumerals.js';

/** The leader a contents part row's `{leader}` draws (#889): the contents'
 *  character, gap and switch, and the face of `toc.parts.leader` field by
 *  field over `toc.leader`'s (#1121); a field neither sets keeps the text
 *  element's own. */
function tocPartLeader(toc: ResolvedConfig['toc']): DesignLeader {
  const own = toc.parts.leader ?? {};
  const color = own.color ?? toc.leader.color;
  const fontFamily = own.fontFamily ?? toc.leader.fontFamily;
  const fontSize = own.fontSize ?? toc.leader.fontSize;
  const fontWeight = own.fontWeight ?? toc.leader.fontWeight;
  return {
    enabled: toc.leader.enabled,
    char: toc.leader.char,
    gap: toc.leader.gap,
    ...(color ? { color: color.hex } : {}),
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(fontWeight !== undefined ? { fontWeight } : {}),
  };
}

/** Slots live in the page margin area between the body edge and the trim
 *  edge. Header slot container: from the trim top down to body top.
 *  Footer slot container: from body bottom down to the trim bottom.
 *
 *  We use a larger container (the full vertical extent of the margin area)
 *  so that anchors like `bottom-center` / `bottom-right` for headers and
 *  `top-*` for footers align with the body edge (the body-facing side of
 *  the margin area) rather than the outer page edge.
 *
 *  The outer edge is the trim box, not the sheet: with cut lines the sheet
 *  also carries the bleed and the marks band, which would push an element
 *  anchored to the outer edge onto (or past) the trim line. Elements that
 *  should reach the sheet use `anchor.to: 'bleed' | 'page'`.
 *
 *  This matches the legacy semantics: `marginFromBody` was "distance from
 *  body edge" — the migration translates that to an offset of the same
 *  magnitude from the body-facing edge. */
function headerContainerBbox(
  contentArea: { x: number; y: number; width: number },
  trimBox: { y: number },
) {
  // Header: spans from the trim top to body top.
  return { x: contentArea.x, y: trimBox.y, width: contentArea.width, height: Math.max(0, contentArea.y - trimBox.y) };
}

function footerContainerBbox(
  contentArea: { x: number; y: number; width: number; height: number },
  trimBox: { y: number; height: number },
) {
  const bodyBottom = contentArea.y + contentArea.height;
  return {
    x: contentArea.x,
    y: bodyBottom,
    width: contentArea.width,
    height: Math.max(0, trimBox.y + trimBox.height - bodyBottom),
  };
}

function textAlignOffsetX(
  align: DesignTextAlign,
  contentWidth: number,
  lineWidth: number,
  /** The text starts on the right of its box (`ResolvedTextPrimitive.startRight`). */
  startRight = false,
): number {
  // A justified line fills its room; the last line of a paragraph is set
  // flush with the start. `start` / `end` are the sides the text's
  // direction reads from and to.
  const side = align === 'start' || align === 'justify'
    ? (startRight ? 'right' : 'left')
    : align === 'end' ? (startRight ? 'left' : 'right') : align;
  if (side === 'left') return 0;
  if (side === 'right') return Math.max(0, contentWidth - lineWidth);
  return Math.max(0, (contentWidth - lineWidth) / 2);
}

/** A laid-out design primitive as the VDT block the renderers paint (also
 *  used by the comics lettering, which lays out balloon text as design
 *  text). */
export function primitiveToBlock(prim: ResolvedPrimitive): VDTDesignBlock {
  if (prim.kind === 'text') return textPrimitiveToBlock(prim);
  if (prim.kind === 'rule') return rulePrimitiveToBlock(prim);
  if (prim.kind === 'image') return imagePrimitiveToBlock(prim);
  if (prim.kind === 'path') return pathPrimitiveToBlock(prim);
  return boxPrimitiveToBlock(prim);
}

/** A path element's outline as the vector block (#1060): the block's box
 *  is the ink's (`pathInkBox`), for hit tests and clips. */
function pathPrimitiveToBlock(prim: ResolvedPathPrimitive): VDTDesignPathBlock {
  const block: VDTDesignPathBlock = {
    kind: 'path',
    bbox: createBoundingBox(0, 0, 0, 0),
    subpaths: prim.subpaths.map((sp) => sp.map((c) => ({ ...c }))),
    ...(prim.fill ? { fill: prim.fill } : {}),
    ...(prim.stroke ? { stroke: { ...prim.stroke, ...(prim.stroke.dash ? { dash: [...prim.stroke.dash] } : {}) } } : {}),
    // A connector's end marks (#1056).
    ...(prim.markers ? { markers: prim.markers.map((m) => ({ ...m })) } : {}),
    // Painted after the frames (#1076).
    ...(prim.over ? { over: true as const } : {}),
  };
  block.bbox = pathInkBox(block);
  return block;
}

function imagePrimitiveToBlock(prim: ResolvedImagePrimitive): VDTDesignImageBlock {
  return {
    kind: 'image',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    fileId: prim.fileId,
    ...(prim.imageKind ? { imageKind: prim.imageKind } : {}),
    ...(prim.pdfFileId ? { pdfFileId: prim.pdfFileId } : {}),
    ...(prim.upright ? { upright: true } : {}),
    ...(prim.altText ? { altText: prim.altText } : {}),
    ...(prim.crop ? { crop: { ...prim.crop } } : {}),
  };
}

function textPrimitiveToBlock(prim: ResolvedTextPrimitive): VDTDesignTextBlock {
  // Lines taller than the box run out on the side the alignment leaves
  // free (EF-138). A drop cap's primitive carries the offset of its text
  // already, and is top-aligned.
  const vOffset = textVerticalOffset(prim.verticalAlign, prim.contentHeight, prim.lines);

  // A centred or right-aligned line is placed by its ink: the tracking
  // after its last glyph does not count (EF-153).
  // A vertical block's lines stay in its own turned frame: baselines from
  // the box's right edge (see `VDTDesignTextBlock.vertical`).
  const lines = prim.lines.map((l) => ({
    text: l.text,
    xOffset: prim.contentX + (l.xOffset ?? 0)
      + textAlignOffsetX(prim.align, prim.contentWidth - (l.xOffset ?? 0), l.width - trailingTracking(l.text, prim.letterSpacingPx), prim.startRight),
    baselineY: (prim.vertical ? 0 : prim.y) + prim.contentY + vOffset + l.baselineY,
    width: l.width,
    ...(l.runs ? { runs: l.runs.map((r) => ({ ...r })) } : {}),
    ...(l.wordSpacingPx !== undefined ? { wordSpacingPx: l.wordSpacingPx } : {}),
    ...(l.order ? { order: [...l.order] } : {}),
    ...(l.wordOverflow ? { wordOverflow: true as const } : {}),
    ...(l.wordDivided ? { wordDivided: l.wordDivided } : {}),
  }));

  return {
    kind: 'text',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    fontString: prim.fontString,
    color: prim.color,
    lines,
    box: prim.box
      ? {
          backgroundColor: prim.box.backgroundColor,
          borderColor: prim.box.borderColor,
          borderWidthPx: prim.box.borderWidthPx,
          borderRadiusPx: prim.box.borderRadiusPx,
          ...shapeFields(prim.box),
        }
      : undefined,
    clip: prim.needsClip,
    // Negative tracking (a tightened display title) is painted too (EF-82).
    ...(prim.letterSpacingPx !== undefined && prim.letterSpacingPx !== 0
      ? { letterSpacingPx: prim.letterSpacingPx }
      : {}),
    ...(prim.stroke ? { stroke: { ...prim.stroke } } : {}),
    ...(prim.dotted ? { dotted: { ...prim.dotted } } : {}),
    ...(prim.direction ? { direction: prim.direction } : {}),
    ...(prim.vertical ? { vertical: verticalTextOf(prim) } : {}),
  };
}

/** How a vertical design text is set (`VDTDesignTextBlock.vertical`): the
 *  document's region and upright digits, the central axis of each family
 *  of its runs. */
function verticalTextOf(prim: ResolvedTextPrimitive): NonNullable<VDTDesignTextBlock['vertical']> {
  const centralBaselines: Record<string, number> = {};
  const add = (font: string): void => {
    const family = fontFamilyOf(font);
    if (!(family in centralBaselines)) centralBaselines[family] = measureCentralBaseline(family);
  };
  add(prim.fontString);
  for (const line of prim.lines) for (const run of line.runs ?? []) add(run.fontString);
  return { region: getMeasureRegion(), uprightDigits: getMeasureUprightDigits(), centralBaselines };
}

function rulePrimitiveToBlock(prim: ResolvedRulePrimitive): VDTDesignRuleBlock {
  return {
    kind: 'rule',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    color: prim.color,
    thicknessPx: prim.thicknessPx,
    direction: prim.direction,
  };
}

function boxPrimitiveToBlock(prim: ResolvedBoxPrimitive): VDTDesignBoxBlock {
  return {
    kind: 'box',
    bbox: createBoundingBox(prim.x, prim.y, prim.width, prim.height),
    box: {
      backgroundColor: prim.box.backgroundColor,
      borderColor: prim.box.borderColor,
      borderWidthPx: prim.box.borderWidthPx,
      borderRadiusPx: prim.box.borderRadiusPx,
      ...shapeFields(prim.box),
    },
  };
}

/** A box's corners of their own and border per side (#1059), copied. */
function shapeFields(box: Pick<VDTDesignBoxStyle, 'borderRadiiPx' | 'borderSides'>): Pick<VDTDesignBoxStyle, 'borderRadiiPx' | 'borderSides'> {
  return {
    ...(box.borderRadiiPx ? { borderRadiiPx: [...box.borderRadiiPx] as [number, number, number, number] } : {}),
    ...(box.borderSides ? { borderSides: { ...box.borderSides } } : {}),
  };
}

/** Where a primitive's reservation ends: its foot, except for a drop cap,
 *  whose line box runs a quarter of its size under its baseline. The letter
 *  sits inside its paragraph's lines, so it reserves nothing below the text
 *  (`text`, the primitive before it) — at most down to its own baseline,
 *  should the text end above it (EF-108). */
function reservedBottom(prim: ResolvedPrimitive, text: ResolvedPrimitive | undefined): number {
  const foot = prim.y + prim.height;
  if (prim.kind !== 'text' || !prim.dropCap || !text) return foot;
  const baseline = prim.y + (prim.lines[0]?.baselineY ?? prim.height);
  return Math.min(foot, Math.max(text.y + text.height, baseline));
}

/** Height of the container a design is measured against: large enough
 *  that nothing reaches its foot. */
const MEASURE_CONTAINER_HEIGHT = 1e6;

/** The placeholder context a heading design is laid out with during body
 *  layout, before the pages exist (a one-page stub). */
function headingPlaceholders(
  heading: HeadingPlaceholderInfo,
  metadata: DocumentMetadata,
  pageIndex: number,
): DesignPlaceholderContext {
  const stubPage = { index: pageIndex, pageLabel: '1' } as unknown as VDTPage;
  return {
    kind: 'heading',
    page: stubPage,
    allPages: [stubPage],
    metadata,
    chapterTitleByPageIndex: [],
    heading,
  };
}

/**
 * The page boxes a heading's design paints, laid out against `container`
 * — the band the placed heading takes, as `buildHeadersAndFooters` lays it
 * out — in absolute page px. Only the elements that reserve room: those
 * with `reserve: false` are decoration the text and the floats may cover.
 * The placement pass keeps the float-only side column clear of them
 * (EF-78): a chapter numeral set in the margin column is no room for a
 * marginal figure.
 */
export function headingDesignBoxes(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  container: { x: number; y: number; width: number; height: number },
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  resourceById?: ReadonlyMap<string, Resource>,
): Array<{ x: number; y: number; width: number; height: number }> {
  if (!level.advancedDesign.enabled || level.advancedDesign.slot.elements.length === 0) return [];
  const result = layoutDesignSlot(
    level.advancedDesign.slot,
    { container, dpi, placeholders: headingPlaceholders(heading, metadata, pageIndex), frames, resourceById },
    pageIndex,
  );
  const excluded = new Set(level.advancedDesign.slot.elements.filter((el) => el.kind !== 'connector' && el.reserve === false).map((el) => el.id));
  const out: Array<{ x: number; y: number; width: number; height: number }> = [];
  result.primitives.forEach((prim, i) => {
    if (excluded.has(result.elementIds[i]!)) return;
    if (![prim.x, prim.y, prim.width, prim.height].every(Number.isFinite)) return;
    const bottom = reservedBottom(prim, result.primitives[i - 1]);
    out.push({ x: prim.x, y: prim.y, width: prim.width, height: Math.max(0, bottom - prim.y) });
  });
  return out;
}

/** Measure the natural bottom of a heading's advanced-design slot when laid
 *  out against a container of the given `width` with unbounded height.
 *  Returns 0 if the level has no advanced design or the slot is empty. Used
 *  during body layout to enlarge a heading block's reserved height so
 *  subsequent blocks sit below the actual bottom of the design content
 *  rather than below the natural text bottom. Applies to both in-column
 *  headings (overlay in block bbox) and page-spanning openers (width is the
 *  full content area; passed in by the caller).
 *
 *  Two kinds of element never count: those flagged `reserve: false`
 *  (decoration that may overlap the text), and those whose position or
 *  height follows the container's height — anchored to its middle or its
 *  foot, `'fill'` tall, or chained to such an element. The container at
 *  paint time is the band this height reserves, so they are laid out
 *  against the result and cannot set it. They are found by laying the slot
 *  out against two container heights and keeping only the primitives that
 *  did not move. */
export function measureHeadingAdvancedDesignHeight(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  /** Page/bleed frames in absolute page px, for `anchor.to: 'page' |
   *  'bleed'` elements. Translated into the stub coordinate system (the
   *  heading container's top-left at `origin`) so a band anchored above the
   *  heading does not grow the reserved height, while anything extending
   *  below the heading's top does. */
  frames?: DesignFrames,
  /** Absolute page position of the heading container's top-left. Defaults
   *  to the frames' page origin when omitted. */
  origin?: { x: number; y: number },
  /** Resources by id, for `kind: 'image'` elements — the pictures painted
   *  with the design count like its other elements (EF-90). Without it an
   *  image element cannot be sized and counts nothing. */
  resourceById?: ReadonlyMap<string, Resource>,
): number {
  return measureHeadingDesign(level, heading, width, dpi, metadata, pageIndex, frames, origin, resourceById).height;
}

/** What a heading's advanced design needs of the band it is laid out in
 *  (see {@link measureHeadingDesign}). */
export interface HeadingDesignMeasure {
  /** The height the design reserves below the heading's top (see
   *  {@link measureHeadingAdvancedDesignHeight}), `minHeight` included. */
  height: number;
  /** The least height the band needs at paint time for every text that
   *  rides on it to start at or below the heading's top; 0 when none
   *  does. */
  textFloor: number;
  /** What sets `height`, for a host that explains a heading which claims
   *  its column (#997): the id of the element that reaches lowest, unless
   *  the design's own `minHeight` is taller than every element
   *  (`byMinHeight`). Both absent for a design that reserves nothing. */
  claimedBy?: string;
  byMinHeight?: true;
}

/** {@link measureHeadingAdvancedDesignHeight}, with the floor that texts
 *  riding on the band set (`textFloor`). A text anchored to the foot or
 *  the middle of the band (a title set on the last line of a tall opener)
 *  does not set the reserved height, but the band has to be tall enough to
 *  hold it: the caller keeps the band it paints at least `textFloor` tall,
 *  so such a title never rises above the heading's top into the text over
 *  it (EF-176; up to postext 1.4 it did when it was taller than the
 *  heading's own lines). Boxes, rules and pictures that ride on the band
 *  set no floor: a panel may reach above the heading on purpose. */
export function measureHeadingDesign(
  level: ResolvedHeadingLevelConfig,
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  origin?: { x: number; y: number },
  resourceById?: ReadonlyMap<string, Resource>,
): HeadingDesignMeasure {
  return measureDesignBand(level.advancedDesign, heading, width, dpi, metadata, pageIndex, frames, origin, resourceById);
}

/** {@link measureHeadingDesign} for any design laid out in a band: a
 *  heading's, or a box style's (#1014). */
function measureDesignBand(
  design: { enabled: boolean; slot: ResolvedDesignSlot; minHeight?: Dimension },
  heading: HeadingPlaceholderInfo,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  frames?: DesignFrames,
  origin?: { x: number; y: number },
  resourceById?: ReadonlyMap<string, Resource>,
): HeadingDesignMeasure {
  if (!design.enabled) return { height: 0, textFloor: 0 };
  const minHeightPx = design.minHeight
    ? dimensionToPx(design.minHeight, dpi)
    : 0;
  if (design.slot.elements.length === 0) return { height: minHeightPx, textFloor: 0 };
  const placeholders = headingPlaceholders(heading, metadata, pageIndex);
  let stubFrames: DesignFrames | undefined;
  if (frames) {
    const ox = origin?.x ?? frames.page.x;
    const oy = origin?.y ?? frames.page.y;
    const shift = (f: DesignFrames['page']) => ({ x: f.x - ox, y: f.y - oy, width: f.width, height: f.height });
    stubFrames = { page: shift(frames.page), bleed: shift(frames.bleed), ...(frames.upright ? { upright: true } : {}) };
  }
  const layoutAt = (height: number) => layoutDesignSlot(
    design.slot,
    { container: { x: 0, y: 0, width, height }, dpi, placeholders, frames: stubFrames, resourceById },
    pageIndex,
  );
  const result = layoutAt(MEASURE_CONTAINER_HEIGHT);
  // Only an element reaching far down the container can follow its height
  // (its middle is half a million px down): the second layout is skipped
  // for every other design.
  const taller = result.primitives.some((p) => p.y + p.height > MEASURE_CONTAINER_HEIGHT / 4)
    ? layoutAt(2 * MEASURE_CONTAINER_HEIGHT)
    : result;
  const excluded = new Set(design.slot.elements.filter((el) => el.kind !== 'connector' && el.reserve === false).map((el) => el.id));
  let bottom = 0;
  let claimedBy: string | undefined;
  let textFloor = 0;
  result.primitives.forEach((prim, i) => {
    if (excluded.has(result.elementIds[i]!)) return;
    // A primitive a malformed value left without a finite box reserves
    // nothing: a NaN here would make the caller drop the whole reservation
    // (minHeight included).
    if (!Number.isFinite(prim.y + prim.height)) return;
    const moved = taller.primitives[i];
    if (!moved) return;
    const stretched = Math.abs(moved.height - prim.height) > 0.5;
    if (Math.abs(moved.y - prim.y) > 0.5 || stretched) {
      // A text riding on the band: its top moves `rate` px for each px of
      // band, so the band that brings it up to the heading's top (y = 0)
      // is the least it needs.
      if (prim.kind === 'text' && !stretched) {
        const rate = (moved.y - prim.y) / MEASURE_CONTAINER_HEIGHT;
        if (rate > 0) textFloor = Math.max(textFloor, MEASURE_CONTAINER_HEIGHT - prim.y / rate);
      }
      return;
    }
    const reaches = reservedBottom(prim, result.primitives[i - 1]);
    if (reaches > bottom) {
      bottom = reaches;
      claimedBy = result.elementIds[i];
    }
  });
  const byMinHeight = minHeightPx > bottom;
  return { height: Math.max(bottom, minHeightPx), textFloor, ...(byMinHeight ? { byMinHeight: true as const } : claimedBy !== undefined ? { claimedBy } : {}) };
}

/** The band a box style's design (#1014) takes `width` wide: as tall as
 *  its elements reach, or its `minHeight` (see {@link measureHeadingDesign};
 *  a text riding on the band's foot keeps it as tall as it needs). `info`
 *  is the box's title and the fence's attributes. */
export function measureBoxDesign(
  design: ResolvedCalloutDesignConfig,
  info: { titleText: string; attrs: Readonly<Record<string, string>>; boxText: readonly string[] },
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  resourceById?: ReadonlyMap<string, Resource>,
): number {
  const heading: HeadingPlaceholderInfo = { titleText: info.titleText, formattedNumber: '', attrs: { ...info.attrs }, boxText: info.boxText };
  const m = measureDesignBand(design, heading, width, dpi, metadata, 0, undefined, undefined, resourceById);
  return Math.max(m.height, m.textFloor);
}

/** A box style's design (#1014) laid out against its band, in the box's
 *  coordinates: `{titleText}` is the box title, `{attr.<key>}` the fence's
 *  attributes. Its texts are cut to fit as a heading design's are, flagged
 *  as a box's (`slot: 'box'`). */
export function layoutBoxDesign(
  design: ResolvedCalloutDesignConfig,
  info: { titleText: string; attrs: Readonly<Record<string, string>>; boxText: readonly string[] },
  band: { x: number; y: number; width: number; height: number },
  dpi: number,
  metadata: DocumentMetadata,
  extras: Pick<SlotLayoutExtras, 'resourceById' | 'direction' | 'mirrored' | 'arabicNumbers'>,
): VDTDesignBlock[] {
  const heading: HeadingPlaceholderInfo = { titleText: info.titleText, formattedNumber: '', attrs: { ...info.attrs }, boxText: info.boxText };
  const slot = layoutSlotToVdt(design.slot, band, 0, headingPlaceholders(heading, metadata, 0), dpi, {
    ...extras,
    attrs: { ...info.attrs },
    metadata: metadata as Record<string, unknown>,
    slot: 'box',
  });
  return slot?.blocks ?? [];
}

/** Optional page-level inputs for `layoutSlotToVdt`. */
export interface SlotLayoutExtras {
  frames?: DesignFrames;
  /** The document's base direction and whether the slot is painted in the
   *  flow of a mirrored page (see `LayoutContext`). */
  direction?: 'ltr' | 'rtl';
  mirrored?: boolean;
  /** Start and end edges read the start on the right (`LayoutContext`). */
  startRight?: boolean;
  /** See `LayoutContext.arabicNumbers` (#665). */
  arabicNumbers?: boolean;
  pageRole?: PageRole;
  /** Resources by id, for `kind: 'image'` elements. */
  resourceById?: ReadonlyMap<string, Resource>;
  /** Source range of the text `{titleText}` renders; stamped on the text
   *  blocks whose element content mentions the placeholder. */
  titleSource?: { start: number; end: number; text?: string; sourceMap?: number[] };
  /** Source ranges of heading attribute values; a text element whose
   *  content is exactly `{attr.<key>}` maps back to that value. */
  attrSources?: Record<string, { start: number; end: number }>;
  attrs?: Record<string, string>;
  /** Source range of the heading line itself: what `{number}`,
   *  `{chapterNumber}` or `{chapterTitle}` elements map back to. */
  headingSource?: { start: number; end: number };
  /** Source ranges of the frontmatter field values (`{title}`, `{author}`,
   *  `{subtitle}`, `{publishDate}`) and the values themselves. */
  metadataSources?: Record<string, { start: number; end: number }>;
  metadata?: Record<string, unknown>;
  /** Where the slot is painted: a text block cut to fit is flagged with it
   *  (`VDTDesignTextBlock.truncated`, #628). Absent: nothing is flagged. */
  slot?: VDTDesignSlotKind;
  /** JSON pointer of the slot in the configuration (`/footer`,
   *  `/pageTemplates/0/decoration`): every block is stamped with its
   *  element's id and, with this, the element's pointer (`…/elements/<i>`,
   *  or the one `elementPaths` gives) (#857). */
  configPath?: string;
  /** The config pointer of each element by id, where the slot's elements
   *  are not one array of the configuration (a template's decoration
   *  merged over the templates it extends). */
  elementPaths?: ReadonlyMap<string, string>;
  /** Filled with the ends connectors left out (#1056): the connector's id
   *  and the box it named. */
  connectorDropped?: { elementId: string; targetId: string }[];
  /** Filled with the ends connectors set at an anchor no picture of their
   *  frame has (#1057). */
  connectorAnchorUnknown?: { elementId: string; targetId: string; anchor: string; resourceId?: string; known: string[] }[];
  /** The attributes some elements read before `attrs`, with their source
   *  ranges, by element id (#1189): a module's elements read its
   *  `:::module` fence. */
  elementAttrs?: ReadonlyMap<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>;
  /** Text elements painted over the frames of a composed page (#1189):
   *  their blocks are marked `over`. */
  overTexts?: ReadonlySet<string>;
}

/** A composed page's module elements (#1189): the attributes each reads
 *  before the page fence's (its `:::module` fence's, as the laid `pages`
 *  record them), by element id, and the indices of every element of a
 *  module in the template's decoration. `elements` is the decoration
 *  resolved (its ids, in the template's order). */
function moduleDecoration(
  template: ResolvedPageTemplate,
  elements: readonly { id: string }[],
  pages: readonly VDTPage[],
): { elementAttrs: Map<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>; inModule: Set<number> } {
  const elementAttrs = new Map<string, { attrs: Record<string, string>; attrSources: Record<string, { start: number; end: number }> }>();
  const inModule = new Set<number>();
  const laidModules = new Map(pages.flatMap((p) => p.composed?.modules ?? []).filter((m) => m.attrs).map((m) => [m.name, m] as const));
  for (const m of template.modules ?? []) {
    if (!m.decoration) continue;
    const laid = laidModules.get(m.name);
    for (let i = m.decoration.start; i < m.decoration.end; i++) {
      inModule.add(i);
      const id = elements[i]?.id;
      if (id === undefined || !laid?.attrs) continue;
      const attrSources: Record<string, { start: number; end: number }> = {};
      for (const [k, v] of Object.entries(laid.attrSources ?? {})) attrSources[k] = { start: v.sourceStart, end: v.sourceEnd };
      elementAttrs.set(id, { attrs: laid.attrs, attrSources });
    }
  }
  return { elementAttrs, inModule };
}

/** What a composed page's decoration means to draw (`folioMissing`,
 *  #1163), a module's elements reading its fence first (#1189). */
function decorationFurniture(template: ResolvedPageTemplate, page: VDTPage, at: number, role: PageRole | undefined, pageAttrs: Record<string, string> | undefined) {
  const elements = resolveDesignSlot(template.decoration, 'header').elements;
  const { elementAttrs } = moduleDecoration(template, elements, [page]);
  return expectedFurniture(elements, 'decoration', at, role, pageAttrs, elementAttrs.size > 0 ? new Map([...elementAttrs].map(([id, a]) => [id, a.attrs] as const)) : undefined);
}

/** `{ configPath }` when there is one. */
const withPath = (configPath: string | undefined): { configPath?: string } => (configPath !== undefined ? { configPath } : {});

const ATTR_ELEMENT = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/;
const HEADING_LINE_PLACEHOLDER = /\{(number|numberDecimal|numberRoman|numberRomanLower|numberAlpha|numberAlphaLower|numberWords|numberWordsLower|numberOrdinalWords|numberOrdinalWordsLower|numberHan|chapterNumber|chapterTitle)\}/;
const METADATA_ELEMENT = /^\s*\{(title|subtitle|author|publishDate)\}\s*$/;

/** The source a text element maps back to, from what its content renders:
 *  the heading title for `{titleText}`, an attribute value for a bare
 *  `{attr.key}`, the heading line for number / chapter placeholders, a
 *  frontmatter value for a bare `{title}` / `{author}`…; null otherwise. */
function sourceForElement(
  content: string,
  extras: SlotLayoutExtras,
): { start: number; end: number; text?: string; sourceMap?: number[] } | null {
  if (extras.titleSource && content.includes('{titleText}')) return extras.titleSource;
  const attr = /^\s*\{attr\.([A-Za-z_][A-Za-z0-9_-]*)\}\s*$/.exec(content);
  if (attr && extras.attrSources?.[attr[1]!]) {
    const range = extras.attrSources[attr[1]!]!;
    const value = extras.attrs?.[attr[1]!] ?? '';
    return withMap(range, value);
  }
  if (extras.headingSource && HEADING_LINE_PLACEHOLDER.test(content)) return extras.headingSource;
  const meta = METADATA_ELEMENT.exec(content);
  if (meta && extras.metadataSources?.[meta[1]!]) {
    const range = extras.metadataSources[meta[1]!]!;
    const value = extras.metadata?.[meta[1]!];
    return withMap(range, typeof value === 'string' ? value : '');
  }
  return null;
}

/**
 * A title element's source as its lines print it (#546): the template
 * round `{titleText}` (a heading's number and its point, "4. ") is printed
 * too, so the text and its map take it in, the characters before the
 * title mapped to its start and those after it to its end, and
 * `prefixLen` counts the ones before. The source as it was when the
 * printed text does not hold the title as written.
 */
function withPrintedTitle(
  el: ResolvedDesignTextElement,
  src: { start: number; end: number; text?: string; sourceMap?: number[] },
  placeholders: DesignPlaceholderContext,
): { start: number; end: number; text?: string; sourceMap?: number[]; prefixLen?: number } {
  const at = el.content.indexOf('{titleText}');
  const map = src.sourceMap;
  if (at < 0 || src.text === undefined || !map || map.length !== src.text.length) return src;
  // As the layout prints it: placeholders filled, marks dropped, the case
  // transformed.
  const upper = el.textTransform === 'uppercase';
  const print = (template: string): string => {
    const resolved = resolveDesignText(template, placeholders, el.inlineMarks === true);
    const plain = el.inlineMarks ? plainDesignText(resolved) : resolved;
    return upper ? plain.toLocaleUpperCase() : plain;
  };
  const text = print(el.content);
  const title = upper ? src.text.toLocaleUpperCase() : src.text;
  if (text === title) return title === src.text ? src : { ...src, text };
  const prefixLen = print(el.content.slice(0, at)).length;
  if (title.length !== src.text.length || text.slice(prefixLen, prefixLen + title.length) !== title) return src;
  const suffixLen = text.length - prefixLen - title.length;
  return {
    ...src,
    text,
    sourceMap: [...new Array<number>(prefixLen).fill(src.start), ...map, ...new Array<number>(suffixLen).fill(src.end)],
    ...(prefixLen ? { prefixLen } : {}),
  };
}

/** A range plus a per-character map when the rendered value is exactly the
 *  source span (so the caret lands on the clicked glyph). */
function withMap(range: { start: number; end: number }, value: string): { start: number; end: number; text?: string; sourceMap?: number[] } {
  if (value.length > 0 && value.length === range.end - range.start) {
    return { ...range, text: value, sourceMap: Array.from({ length: value.length }, (_, i) => range.start + i) };
  }
  return range;
}

export function layoutSlotToVdt(
  slot: ResolvedDesignSlot,
  container: { x: number; y: number; width: number; height: number },
  pageIndex: number,
  placeholders: DesignPlaceholderContext,
  dpi: number,
  extras?: SlotLayoutExtras,
): VDTDesignSlot | undefined {
  const own = extras?.elementAttrs;
  const result = layoutDesignSlot(
    slot,
    {
      container, dpi, placeholders, frames: extras?.frames, pageRole: extras?.pageRole, resourceById: extras?.resourceById,
      ...(extras?.direction ? { direction: extras.direction } : {}),
      ...(extras?.mirrored ? { mirrored: true } : {}),
      ...(extras?.startRight ? { startRight: true } : {}),
      ...(extras?.arabicNumbers ? { arabicNumbers: true } : {}),
      ...(own && own.size > 0 ? { elementAttrs: new Map([...own].map(([id, a]) => [id, a.attrs] as const)) } : {}),
    },
    pageIndex,
  );
  /** What element `id` reads (#1189): the slot's extras and placeholders,
   *  with a module's fence attributes over the page's. */
  const extrasOf = (id: string): SlotLayoutExtras | undefined => {
    const a = own?.get(id);
    return a && extras ? { ...extras, attrs: { ...extras.attrs, ...a.attrs }, attrSources: { ...extras.attrSources, ...a.attrSources } } : extras;
  };
  const placeholdersOf = (id: string): DesignPlaceholderContext => {
    const a = own?.get(id);
    return a ? { ...placeholders, pageAttrs: { ...placeholders.pageAttrs, ...a.attrs } } : placeholders;
  };
  if (extras?.connectorDropped) {
    for (const issue of result.issues) if (issue.kind === 'connectorDropped') extras.connectorDropped.push({ elementId: issue.elementId, targetId: issue.targetId });
  }
  if (extras?.connectorAnchorUnknown) {
    for (const issue of result.issues) {
      if (issue.kind !== 'connectorAnchorUnknown') continue;
      const { kind: _kind, ...rest } = issue;
      void _kind;
      extras.connectorAnchorUnknown.push(rest);
    }
  }
  if (result.primitives.length === 0) return undefined;
  const sourceByElement = new Map<string, { start: number; end: number; text?: string; sourceMap?: number[]; prefixLen?: number; attr?: string }>();
  if (extras) {
    for (const el of slot.elements) {
      if (el.kind !== 'text') continue;
      const elExtras = extrasOf(el.id)!;
      const elPlaceholders = placeholdersOf(el.id);
      const src = sourceForElement(el.content, elExtras);
      if (!src) continue;
      // Inline marks drop their markers from the printed text. The
      // per-character map holds while the mapped value is still printed as
      // written (no markers or escapes of its own); otherwise only the range
      // maps back.
      const keepMap = !el.inlineMarks || src.text === undefined
        || plainDesignText(resolveDesignText(el.content, elPlaceholders, el.inlineMarks === true)).includes(src.text);
      const attr = ATTR_ELEMENT.exec(el.content)?.[1];
      const mapped = keepMap ? withPrintedTitle(el, src, elPlaceholders) : { start: src.start, end: src.end };
      sourceByElement.set(el.id, attr !== undefined && elExtras.attrSources?.[attr] ? { ...mapped, attr } : mapped);
    }
  }
  // The texts cut to fit (#628), flagged on the element's own block (not
  // on its drop cap's).
  const truncated = new Map<string, { mode: NonNullable<ResolvedTextPrimitive['truncated']>; text: string }>();
  if (extras?.slot) {
    for (const issue of result.issues) {
      if (issue.kind === 'textTruncated') truncated.set(issue.elementId, { mode: issue.mode, text: issue.text });
    }
  }
  // Where each element is written in the configuration (#857).
  const pathById = new Map<string, string>();
  if (extras?.configPath !== undefined) slot.elements.forEach((el, i) => pathById.set(el.id, `${extras.configPath}/elements/${i}`));
  for (const [id, path] of extras?.elementPaths ?? []) pathById.set(id, path);
  // An image picked by an attribute (`resourceId: '{attr.fondo}'`).
  const imageAttrById = new Map<string, string>();
  for (const el of slot.elements) {
    const attr = el.kind === 'image' ? ATTR_ELEMENT.exec(el.resourceId ?? '')?.[1] : undefined;
    if (attr !== undefined && extrasOf(el.id)?.attrs?.[attr] !== undefined) imageAttrById.set(el.id, attr);
  }
  const blocks = result.primitives.map((prim) => {
    const block = primitiveToBlock(prim);
    if (prim.id) {
      block.elementId = prim.id;
      const path = pathById.get(prim.id);
      if (path !== undefined) block.configPath = path;
      const attr = block.kind === 'image' ? imageAttrById.get(prim.id) : undefined;
      if (attr !== undefined) block.attr = attr;
    }
    const cut = prim.kind === 'text' && !prim.dropCap ? truncated.get(prim.id) : undefined;
    if (block.kind === 'text' && cut && extras?.slot) block.truncated = { elementId: prim.id, slot: extras.slot, mode: cut.mode, text: cut.text };
    const src = sourceByElement.get(prim.id);
    if (block.kind === 'text' && src) {
      block.sourceStart = src.start;
      block.sourceEnd = src.end;
      if (src.text !== undefined && src.sourceMap && src.sourceMap.length === src.text.length) {
        block.sourceText = src.text;
        block.sourceMap = src.sourceMap;
        if (src.prefixLen) block.sourcePrefixLen = src.prefixLen;
      }
      if (src.attr !== undefined) block.attr = src.attr;
    }
    if (block.kind === 'text' && extras?.overTexts?.has(prim.id)) block.over = true;
    return block;
  });
  return {
    bbox: createBoundingBox(container.x, container.y, container.width, container.height),
    blocks,
  };
}

/**
 * A running head or footer as page furniture: the pictures it repeats on
 * every page keep no alternative text, so HTML gives them `alt=""` and
 * `role="presentation"` and a screen reader skips them, as the tagged PDF
 * does (a pagination artifact). The pictures of an opener, a part page or a
 * heading design keep theirs.
 */
function asFurniture(slot: VDTDesignSlot | undefined): VDTDesignSlot | undefined {
  if (!slot || !slot.blocks.some((b) => b.kind === 'image' && b.altText !== undefined)) return slot;
  return {
    ...slot,
    blocks: slot.blocks.map((b) => {
      if (b.kind !== 'image' || b.altText === undefined) return b;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { altText: _alt, ...rest } = b;
      return rest;
    }),
  };
}

/** The source of a heading block's title text: its per-character map when
 *  the block has one, else its whole range. */
function headingTitleSource(block: VDTBlock, titleText: string): SlotLayoutExtras['titleSource'] {
  const map = block.sourceMap;
  if (map && map.length > 0) return { start: map[0]!, end: map[map.length - 1]! + 1, text: titleText, sourceMap: map };
  if (block.sourceStart !== undefined && block.sourceEnd !== undefined) return { start: block.sourceStart, end: block.sourceEnd };
  return undefined;
}

function headingLineSource(block: VDTBlock): { start: number; end: number } | undefined {
  return block.sourceStart !== undefined && block.sourceEnd !== undefined ? { start: block.sourceStart, end: block.sourceEnd } : undefined;
}

/** Plain title text of a part (`\\` rendered as a line break) and the
 *  source offset of every character of it, for editor cursor mapping. */
function partTitleSourceMap(rawTitle: string, sourceStart: number): { text: string; sourceMap: number[] } {
  let text = '';
  const sourceMap: number[] = [];
  const re = /[ \t]*\\\\[ \t]*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawTitle)) !== null) {
    for (let i = last; i < m.index; i++) { text += rawTitle[i]; sourceMap.push(sourceStart + i); }
    text += '\n';
    sourceMap.push(sourceStart + m.index);
    last = m.index + m[0].length;
  }
  for (let i = last; i < rawTitle.length; i++) { text += rawTitle[i]; sourceMap.push(sourceStart + i); }
  return { text, sourceMap };
}

/** Container bbox for a page-spanning heading opener band: occupies the
 *  vertical band the heading block reserved in its column, extended
 *  horizontally across the full content area (both columns) — but NOT beyond
 *  the page margins. */
function openerContainerBbox(
  block: VDTBlock,
  contentArea: { x: number; width: number },
) {
  return { x: contentArea.x, y: block.bbox.y, width: contentArea.width, height: block.bbox.height };
}

/** Find the first heading block on `page` that belongs to a level with
 *  `span === 'page'`. Returns the block and info needed to resolve
 *  placeholders in the design slot. Triggers regardless of whether
 *  `advancedDesign.enabled` is true — when false, the pipeline synthesises
 *  a default slot from the heading level typography. */
function findOpenerHeading(
  page: VDTPage,
  levels: HeadingLevelResolver,
): { block: VDTBlock; level: number; title: DefaultOpenerTitle; numberPrefix: string } | undefined {
  for (const col of page.columns) {
    // An opener set mid-page (`spanBreak: false`, #539) heads a later band:
    // it paints its own overlay (see `buildHeadersAndFooters`).
    if ((col.band ?? 0) > 0) continue;
    for (const block of col.blocks) {
      if (block.type !== 'heading' || !block.headingLevel) continue;
      const lvl = levels.forLevel(block.headingLevel, block.headingStyleId);
      if (!lvl) continue;
      if (lvl.span !== 'page') continue;
      // A structural heading prints nothing, not even an opener.
      if (headingIsHidden(block, lvl)) continue;
      const pref = block.numberPrefix ?? '';
      const title = defaultOpenerTitle(block.lines, pref, block.titleBreaks, block.titleLength ?? -1, block.numberSeparator);
      return { block, level: block.headingLevel, title, numberPrefix: pref };
    }
  }
  return undefined;
}

/** The title the default opener of a page-span heading prints, read from
 *  the heading's laid-out lines. */
export interface DefaultOpenerTitle {
  /** The plain title, as `{titleText}` resolves it: the lines joined back
   *  into the text they were broken from (see `lineJoin`: a space where the
   *  break took one, a no-break space where it parted a glued group,
   *  nothing after a hard hyphen or inside a divided word, whose added
   *  hyphen goes), the number prefix dropped, a forced break
   *  (`\\`) as a newline. */
  titleText: string;
  /** The same title written as inline Markdown, when the heading sets bold,
   *  italic, superscript or subscript runs (EF-122): the opener then paints
   *  the runs the heading was measured with. Left out when the heading has
   *  none, or when its runs cannot be written back exactly (a small-capitals
   *  run, a link, a marker character next to a run); the opener then prints
   *  the title plain, and its band still holds every line it paints. */
  marked?: string;
  /** Set when {@link marked} holds the heading's chips (`:chip[…]`, #1162),
   *  which a design text sets with the document's chip styles. A heading
   *  with chips has a marked title even without other runs. */
  chips?: true;
}

/** A heading line as the title readers need it: its segments, and how it
 *  was broken from the next one. */
export type TitleLine = JoinedLine & {
  segments?: readonly { text: string; bold?: boolean; italic?: boolean; script?: 'sup' | 'sub'; chip?: VDTChip }[];
};

/** `{titleText}` of a heading, from the lines it was laid out in: the
 *  plain title of {@link defaultOpenerTitle}. */
export function headingTitleText(
  lines: readonly TitleLine[],
  numberPrefix: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  numberSeparator = ' ',
): string {
  return defaultOpenerTitle(lines, numberPrefix, titleBreaks, titleLength, numberSeparator).titleText;
}

type TitleRunFlags = { bold: boolean; italic: boolean; script?: 'sup' | 'sub'; chip?: VDTChip };
const PLAIN_RUN: TitleRunFlags = { bold: false, italic: false };
/** The marker characters a backslash escapes (see `protectEscapes`). */
const TITLE_ESCAPE_RE = /[*_^~`]/g;
const escapeTitleRun = (text: string): string => text.replace(TITLE_ESCAPE_RE, (c) => `\\${c}`);
const sameEmphasis = (a: TitleRunFlags, b: TitleRunFlags): boolean => a.bold === b.bold && a.italic === b.italic;
/** The characters a chip's label escapes: the inline markers and the
 *  brackets (`\]`, see `extractInlineChips`). */
const CHIP_LABEL_ESCAPE_RE = /[*_^~`[\]]/g;
/** A chip style id that can be written back as `{style="…"}`. */
const CHIP_STYLE_ID_RE = /^[^"{}\n]*$/;

/** A laid-out chip written back as `:chip[…]{style="…"}` (#1162): its
 *  runs in logical order, each with its own bold, italic and script, so a
 *  design text that reads inline marks sets the same words. Undefined when
 *  the style id cannot be written in an attribute. */
function chipMarkdown(chip: VDTChip): string | undefined {
  if (!CHIP_STYLE_ID_RE.test(chip.styleId)) return undefined;
  let label = '';
  for (const run of chip.runs) {
    if (run.text.length === 0) continue;
    let t = run.text.replace(CHIP_LABEL_ESCAPE_RE, (c) => `\\${c}`);
    if (run.baselineShift !== undefined && run.baselineShift !== 0) t = run.baselineShift < 0 ? `^${t}^` : `~${t}~`;
    const marker = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
    // Markers go round the words, their edge spaces outside them.
    const core = t.trim();
    label += marker && core ? t.replace(core, `${marker}${core}${marker}`) : t;
  }
  if (label.trim() === '') label = ' ';
  return `:chip[${label}]${chip.styleId ? `{style="${chip.styleId}"}` : ''}`;
}

/** The characters of a heading's lines read back as the title, with the
 *  run flags of each (see {@link defaultOpenerTitle}). With `keepChips`
 *  each chip stays one {@link CHIP_PLACEHOLDER} carrying its box; else it
 *  is left out with the space beside it (#1100), recorded in `removedAt`.
 *  Undefined when a chip is to be kept and its segment carries no box. */
function readTitleChars(lines: readonly TitleLine[], keepChips: boolean): { chars: string[]; flags: TitleRunFlags[]; hasMarks: boolean; removedAt: number[] } | undefined {
  const chars: string[] = [];
  const flags: TitleRunFlags[] = [];
  /** Where a line break was read back as a space or a no-break space. */
  const separators = new Set<number>();
  let hasMarks = false;
  /** Where each chip of the title was left out (#1100), in `chars`, with
   *  the space after it when a space or the start of the line comes
   *  before it: a chip is a box of the page, not words of the title. */
  const removedAt: number[] = [];
  let afterChip = false;
  let missing = false;
  lines.forEach((ln, i) => {
    const start = chars.length;
    // The hyphen repeated from the line before (`repeatHyphen`) is not part
    // of the title: "bem-" | "-aventurados" reads "bem-aventurados".
    let skipRepeated = ln.repeatedHyphen === true;
    for (const s of ln.segments ?? []) {
      let from = 0;
      if (skipRepeated && s.text.length > 0) {
        if (s.text.startsWith('-')) from = 1;
        skipRepeated = false;
      }
      if (s.text === CHIP_PLACEHOLDER) {
        if (keepChips) {
          // The chip, one character with its box (#1162).
          if (!s.chip) missing = true;
          chars.push(CHIP_PLACEHOLDER);
          flags.push({ bold: false, italic: false, ...(s.chip ? { chip: s.chip } : {}) });
          continue;
        }
        removedAt.push(chars.length);
        afterChip = true;
        continue;
      }
      if (afterChip && s.text === ' ' && (chars.length === start || chars[chars.length - 1] === ' ')) {
        removedAt.push(chars.length);
        afterChip = false;
        continue;
      }
      afterChip = false;
      const f: TitleRunFlags = s.bold || s.italic || s.script
        ? { bold: !!s.bold, italic: !!s.italic, ...(s.script ? { script: s.script } : {}) }
        : PLAIN_RUN;
      if (f !== PLAIN_RUN) hasMarks = true;
      for (let k = from; k < s.text.length; k++) {
        chars.push(s.text[k]!);
        flags.push(f);
      }
    }
    // Read the lines back as the text they were broken from (EF-162): the
    // space a break took comes back, a word the break divided is whole
    // again (its added hyphen goes), and a hard hyphen at a line end keeps
    // its word ("Word-" | "Book" is "Word-Book"), and a group glued by a
    // no-break space that the line parted gets its no-break space back.
    // Up to postext 1.4 every line break became a space.
    const next = lines[i + 1];
    let end = chars.length;
    if (next !== undefined) while (end > start && (chars[end - 1] === ' ' || chars[end - 1] === '\t')) end--;
    const { drop, separator } = lineJoin(chars.slice(start, end).join(''), ln, next, end < chars.length);
    chars.length = end - drop;
    flags.length = end - drop;
    if (separator) {
      separators.add(chars.length);
      chars.push(separator);
      flags.push(PLAIN_RUN);
    }
  });
  if (missing) return undefined;
  // The space two lines were broken at takes the emphasis of the words on
  // both sides of it, when they share one.
  for (let i = 1; i < chars.length - 1; i++) {
    if (flags[i] === PLAIN_RUN && (chars[i] === ' ' || separators.has(i)) && sameEmphasis(flags[i - 1]!, flags[i + 1]!)) {
      const f = flags[i - 1]!;
      if (f.bold || f.italic) flags[i] = { bold: f.bold, italic: f.italic };
    }
  }
  return { chars, flags, hasMarks, removedAt };
}

/** The title written as inline Markdown from its characters and their run
 *  flags (the number prefix dropped), when it reads back as `expected`
 *  with the same runs; a chip is written as `:chip[…]` (#1162). */
function markedTitle(
  chars: readonly string[],
  flags: readonly TitleRunFlags[],
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  title: string,
  expected: string,
): string | undefined {
  let tChars = chars.slice();
  let tFlags = flags.slice();
  // The forced breaks, as `applyTitleBreaks` sets them: a newline at each
  // recorded index, the spaces and tabs around it dropped.
  if (titleBreaks && titleBreaks.length > 0 && title.length === titleLength) {
    for (const i of titleBreaks) if (i < tChars.length) tChars[i] = '\n';
    const keep = tChars.map((c, i) => {
      if (c !== ' ' && c !== '\t') return true;
      let a = i - 1;
      while (a >= 0 && (tChars[a] === ' ' || tChars[a] === '\t')) a--;
      let b = i + 1;
      while (b < tChars.length && (tChars[b] === ' ' || tChars[b] === '\t')) b++;
      return tChars[a] !== '\n' && tChars[b] !== '\n';
    });
    tFlags = tFlags.filter((_, i) => keep[i]);
    tChars = tChars.filter((_, i) => keep[i]);
  }
  if (tChars.join('') !== expected) return undefined;
  const chips = tFlags.some((f) => f.chip);
  let failed = false;
  const scripted = (a: number, b: number): string => {
    let out = '';
    let i = a;
    while (i < b) {
      const chip = tFlags[i]!.chip;
      if (chip) {
        const md = chipMarkdown(chip);
        if (md === undefined) failed = true;
        out += md ?? '';
        i++;
        continue;
      }
      const script = tFlags[i]!.script;
      let j = i + 1;
      while (j < b && tFlags[j]!.script === script && !tFlags[j]!.chip) j++;
      const text = escapeTitleRun(tChars.slice(i, j).join(''));
      out += script === 'sup' ? `^${text}^` : script === 'sub' ? `~${text}~` : text;
      i = j;
    }
    return out;
  };
  let marked = '';
  let i = 0;
  while (i < tChars.length) {
    if (tChars[i] === '\n') {
      marked += '\n';
      i++;
      continue;
    }
    // A run of one emphasis, within one line; its edge spaces stay outside
    // the markers, as Markdown needs them.
    let j = i + 1;
    while (j < tChars.length && tChars[j] !== '\n' && sameEmphasis(tFlags[j]!, tFlags[i]!)) j++;
    const { bold, italic } = tFlags[i]!;
    let a = i;
    let b = j;
    if (bold || italic) {
      while (a < b && /\s/.test(tChars[a]!)) a++;
      while (b > a && /\s/.test(tChars[b - 1]!)) b--;
    }
    if (a < b && (bold || italic)) {
      const marker = bold && italic ? '***' : bold ? '**' : '*';
      marked += scripted(i, a) + marker + scripted(a, b) + marker + scripted(b, j);
    } else {
      marked += scripted(i, j);
    }
    i = j;
  }
  if (failed) return undefined;
  // Kept only when it reads back as the same text with the same runs (a
  // chip as a chip).
  let spans: InlineSpan[];
  if (chips) {
    const { cleaned, chips: metas } = extractInlineChips(marked, 0);
    spans = injectChipSpans(parseInlineFormatting(cleaned), metas);
  } else spans = parseInlineFormatting(marked);
  if (spans.map((s) => s.text).join('') !== expected) return undefined;
  let at = 0;
  for (const s of spans) {
    if (s.smallCaps || s.links || s.math) return undefined;
    for (let k = 0; k < s.text.length; k++, at++) {
      const f = tFlags[at]!;
      if ((s.chip !== undefined) !== (f.chip !== undefined)) return undefined;
      if (s.chip || /\s/.test(s.text[k]!)) continue;
      if (f.bold !== !!s.bold || f.italic !== !!s.italic || f.script !== s.script) return undefined;
    }
  }
  return marked;
}

/** The title a page-span heading's default opener prints, from the lines the
 *  heading was measured into (see {@link DefaultOpenerTitle}). The same
 *  reading serves the band's measure (`build.ts`) and its paint, so the
 *  two lay out one text. */
export function defaultOpenerTitle(
  lines: readonly TitleLine[],
  numberPrefix: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  /** What joins the number to the title in the lines
   *  (`HeadingLevelConfig.numberSeparator`). */
  numberSeparator = ' ',
): DefaultOpenerTitle {
  const { chars, flags, hasMarks, removedAt } = readTitleChars(lines, false)!;
  const keptBreaks = titleBreaks;
  const keptLength = titleLength;
  const full = chars.join('');
  const drop = numberPrefix && full.startsWith(`${numberPrefix}${numberSeparator}`) ? numberPrefix.length + numberSeparator.length : 0;
  if (removedAt.length > 0) {
    // The forced breaks and the length of the title without what was left
    // out; a space a closing chip stood after goes too.
    titleBreaks = titleBreaks?.map((i) => i - removedAt.filter((c, k) => c - drop + k < i).length);
    titleLength -= removedAt.length;
    while (chars.length > drop && chars[chars.length - 1] === ' ') {
      chars.pop();
      flags.pop();
      titleLength--;
    }
    // A chip alone on the first line leaves the space its line was
    // broken at (#1162).
    while (chars.length > drop && chars[drop] === ' ') {
      chars.splice(drop, 1);
      flags.splice(drop, 1);
      titleLength--;
      titleBreaks = titleBreaks?.map((i) => Math.max(0, i - 1));
    }
  }
  const title = chars.join('').slice(drop);
  const titleText = applyTitleBreaks(title, titleBreaks, titleLength);
  // The heading's chips (#1162): the title with them, written as Markdown
  // a design text that reads inline marks sets them from. The plain title
  // leaves them out.
  if (removedAt.length > 0) {
    const marked = markedTitleWithChips(lines, numberPrefix, numberSeparator, keptBreaks, keptLength, titleText);
    if (marked !== undefined) return { titleText, marked, chips: true };
  }
  if (!hasMarks) return { titleText };
  const marked = markedTitle(chars.slice(drop), flags.slice(drop), titleBreaks, titleLength, title, titleText);
  return marked === undefined ? { titleText } : { titleText, marked };
}

/** {@link DefaultOpenerTitle.marked} of a heading with chips (#1162): its
 *  lines read back with each chip kept, the title written with them, when
 *  it reads as `titleText` once its chips are left out again. */
function markedTitleWithChips(
  lines: readonly TitleLine[],
  numberPrefix: string,
  numberSeparator: string,
  titleBreaks: readonly number[] | undefined,
  titleLength: number,
  titleText: string,
): string | undefined {
  const kept = readTitleChars(lines, true);
  if (!kept) return undefined;
  const full = kept.chars.join('');
  const drop = numberPrefix && full.startsWith(`${numberPrefix}${numberSeparator}`) ? numberPrefix.length + numberSeparator.length : 0;
  const title = full.slice(drop);
  const withChips = applyTitleBreaks(title, titleBreaks, titleLength);
  if (withoutChips(withChips) !== titleText) return undefined;
  // Text written as `:chip[…]` in a code span would read as a chip.
  if (titleText.includes(':chip[')) return undefined;
  return markedTitle(kept.chars.slice(drop), kept.flags.slice(drop), titleBreaks, titleLength, title, withChips);
}

/** The marked title of a heading placeholder (`titleMarked`), with the
 *  document's chip styles when it holds the heading's chips (#1162). A
 *  title with chips and no styles to set them in is left plain. */
export function markedTitleFields(
  title: DefaultOpenerTitle,
  chipStyles: readonly ResolvedChipStyleConfig[] | undefined,
): Pick<HeadingPlaceholderInfo, 'titleMarked' | 'chipStyles'> {
  if (title.marked === undefined) return {};
  if (!title.chips) return { titleMarked: title.marked };
  return chipStyles ? { titleMarked: title.marked, chipStyles } : {};
}

/** The height of the title a page-span heading's default opener paints
 *  across `width`, with the opener's own painter (a greedy wrap at natural
 *  widths, a justified heading set flush left). The band reserved for the
 *  heading is at least this tall, so it holds every line the opener paints
 *  even where the heading's own measure fits more on a line: a justified
 *  line whose spaces shrink, a forced break, a run the opener sets plain
 *  (EF-100). */
export function measureDefaultOpenerHeight(
  level: ResolvedHeadingLevelConfig,
  textAlign: TextAlign,
  title: DefaultOpenerTitle,
  numberPrefix: string,
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
  /** The document's chip styles, for a title with chips (#1162). */
  chipStyles?: readonly ResolvedChipStyleConfig[],
): number {
  const slot = synthesiseDefaultOpenerSlot(level, numberPrefix.length > 0, textAlign, title.marked !== undefined);
  const placeholders = headingPlaceholders(
    { titleText: title.titleText, ...markedTitleFields(title, chipStyles), formattedNumber: numberPrefix },
    metadata,
    pageIndex,
  );
  const result = layoutDesignSlot(slot, { container: { x: 0, y: 0, width, height: MEASURE_CONTAINER_HEIGHT }, dpi, placeholders }, pageIndex);
  let bottom = 0;
  for (const prim of result.primitives) {
    if (prim.kind !== 'text') continue;
    for (const ln of prim.lines) bottom = Math.max(bottom, ln.topY + ln.height);
  }
  return bottom;
}

/** Build a synthesised default design slot for a `span: 'page'` heading when
 *  the user has not configured an `advancedDesign.slot`. Renders as a single
 *  text element, anchored to fill the full-page-width container, using the
 *  heading level's resolved typography and `headings.textAlign` (justified
 *  sets flush left, like the last line of a justified heading). Emits
 *  `{number} {titleText}` (the level's `numberSeparator` between them) when
 *  the heading carries a numberPrefix, otherwise `{titleText}`. With `marked`, `{titleText}` holds the title as inline
 *  Markdown (see {@link DefaultOpenerTitle}) and the element reads it so. */
function synthesiseDefaultOpenerSlot(
  level: ResolvedHeadingLevelConfig,
  hasNumberPrefix: boolean,
  textAlign: TextAlign,
  marked = false,
): ResolvedDesignSlot {
  // `{number}` is the heading placeholder for the formatted number;
  // `{formattedNumber}` is not one, and left the title with a leading space.
  // The level's separator joins them, as in the column (`'　'` in Chinese).
  const content = hasNumberPrefix ? `{number}${level.numberSeparator ?? ' '}{titleText}` : '{titleText}';
  const textEl: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'defaultHeadingOpener',
    parity: 'all',
    pages: 'all',
    placement: {
      anchor: { to: 'container', edge: 'top-left' },
      offset: { x: { value: 0, unit: 'pt' }, y: { value: 0, unit: 'pt' } },
      size: { width: 'fill', height: 'fill' },
    },
    content,
    fontFamily: level.fontFamily,
    fontSize: level.fontSize,
    fontWeight: level.fontWeight,
    italic: level.italic,
    color: level.color,
    align: textAlign === 'center' || textAlign === 'right' ? textAlign : 'left',
    verticalAlign: 'middle',
    // The level's own leading, as the band that holds the title was
    // measured with it (EF-100).
    ...resolveDesignLineHeight(level.lineHeight, level.fontSize),
    overflow: 'wrap',
    hyphenate: true,
    // The level's tracking, as its in-column text is measured (EF-83).
    ...(level.letterSpacing && level.letterSpacing.value !== 0 ? { letterSpacing: level.letterSpacing } : {}),
    // The heading's bold, italic and script runs (EF-122).
    ...(marked ? { inlineMarks: true } : {}),
  };
  return { elements: [textEl] };
}

/** The level-1 heading settings, which the default part designs borrow. */
function levelOne(resolved: ResolvedConfig): ResolvedHeadingLevelConfig {
  return resolved.headings.levels.find((l) => l.level === 1) ?? resolved.headings.levels[0]!;
}

/** `{number}` and `{titleText}` joined as the book's chapter openers join
 *  them: with the H1's `numberSeparator` (`'　'` in Chinese, one space by
 *  default). */
function partNumberAndTitle(resolved: ResolvedConfig): string {
  return `{number}${levelOne(resolved).numberSeparator ?? ' '}{titleText}`;
}

/** Default opener design of a `:::part` page when `parts.design` is empty:
 *  `{number} {titleText}` (the H1's `numberSeparator` between them; just
 *  `{titleText}` without a number) in the H1 typography, anchored at the
 *  top-left of the part's body area — the container is the trim box, so
 *  the offset is the part margins. Purely decorative: raise
 *  `parts.margins.top` to keep the body clear of it. */
function synthesiseDefaultPartSlot(
  resolved: ResolvedConfig,
  page: VDTPage,
  trimBox: { x: number; y: number },
  hasNumber: boolean,
): ResolvedDesignSlot {
  const level = levelOne(resolved);
  const content = hasNumber ? partNumberAndTitle(resolved) : '{titleText}';
  const textEl: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'defaultPartOpener',
    parity: 'all',
    pages: 'all',
    placement: {
      anchor: { to: 'container', edge: 'top-left' },
      offset: {
        x: { value: page.contentArea.x - trimBox.x, unit: 'px' },
        y: { value: page.contentArea.y - trimBox.y, unit: 'px' },
      },
      size: { width: { value: page.contentArea.width, unit: 'px' }, height: 'auto' },
    },
    content,
    fontFamily: level.fontFamily,
    fontSize: level.fontSize,
    fontWeight: level.fontWeight,
    italic: level.italic,
    color: level.color,
    align: 'left',
    verticalAlign: 'top',
    lineHeight: level.lineHeight.unit === 'em' ? level.lineHeight.value : 1.2,
    overflow: 'wrap',
    hyphenate: true,
  };
  return { elements: [textEl] };
}

/** Default row design of a part in the contents when `toc.parts.design` is
 *  empty: `{number} {titleText}` (the H1's `numberSeparator` between them;
 *  just `{titleText}` without a number) at the left and `{pageNumber}` at
 *  the right, in the level-1 entry typography. */
function synthesiseDefaultTocPartSlot(resolved: ResolvedConfig, hasNumber: boolean): ResolvedDesignSlot {
  const entry = resolved.toc.levels[0]!;
  const common = {
    kind: 'text' as const, parity: 'all' as const, pages: 'all' as const,
    fontFamily: entry.fontFamily, fontSize: entry.fontSize, fontWeight: entry.fontWeight, italic: entry.italic,
    color: entry.color, verticalAlign: 'middle' as const, lineHeight: 1.2, hyphenate: false,
  };
  const title: ResolvedDesignTextElement = {
    ...common, id: 'tocPartTitle', content: hasNumber ? partNumberAndTitle(resolved) : '{titleText}', align: 'left', overflow: 'ellipsis-end',
    placement: { anchor: { to: 'container', edge: 'left' }, offset: {}, size: { width: 'auto', height: 'auto' } },
  };
  const page: ResolvedDesignTextElement = {
    ...common, id: 'tocPartPage', content: '{pageNumber}', align: 'right', overflow: 'clip',
    fontWeight: resolved.toc.pageNumber.fontWeight, color: resolved.toc.pageNumber.color,
    placement: { anchor: { to: 'container', edge: 'right' }, offset: {}, size: { width: 'auto', height: 'auto' } },
  };
  return { elements: [title, page] };
}

/**
 * After body placement finishes, attach header/footer slots to every page.
 * `resourceById` resolves the `kind: 'image'` elements of the designs.
 */
/** The pages as `computePartValues` reads them, with the parts set without
 *  a divider page (`doc.partMarks`) standing on the page of the first block
 *  placed after their fence. */
function pagesWithPartMarks(doc: VDTDocument): PartPageInfo[] {
  if (!doc.partMarks || doc.partMarks.length === 0) return doc.pages;
  const marked = new Map<number, NonNullable<PartPageInfo['partInfo']>>();
  const pages = partMarkPages(doc);
  doc.partMarks.forEach((mark, i) => {
    const page = pages[i];
    if (page !== undefined) marked.set(page, { number: mark.number, title: mark.title, ...(mark.palette ? { palette: mark.palette } : {}) });
  });
  return doc.pages.map((p, i) => (marked.has(i) && !p.partInfo ? { ...p, partInfo: marked.get(i) } : p));
}

/** What the header/footer pass needs from the content beyond the laid-out
 *  document. */
export interface HeaderFooterInputs {
  /** For a paragraph content block inside a `:::paragraphs{style=…}`
   *  container: the style id and the paragraph's leading bold text, which
   *  `{firstMark.<style>}` / `{lastMark.<style>}` print. */
  paragraphMark?: (contentIndex: number) => { styleId: string; text: string } | undefined;
  /** What each kind of flow colour takes under a page's palette overrides
   *  where two palette entries share a base value (see
   *  `flowColorValues`). Without it such a value takes the last override
   *  that changes it. */
  flowColorValues?: (overrides: Readonly<Record<string, string>>) => FlowColorValues;
}

/**
 * The page frames a heading design inside a composed-page frame is laid out
 * with (#906): in the frame's blocks' own coordinates, where a frame whose
 * text the reflow ladder scaled (#858) lays its content out `1 / scale` as
 * large from its top-left, so a design element anchored to the page lands
 * on the page once the frame is painted scaled. A turned frame's
 * (`rotate`) are left upright: what is anchored to the page turns with the
 * frame.
 */
export function framesInFrame(frames: DesignFrames | undefined, frame: Pick<VDTFrame, 'rect' | 'scale'>): DesignFrames | undefined {
  const s = frame.scale;
  if (!frames || !(s > 0) || Math.abs(s - 1) < 1e-9) return frames;
  const o = frame.rect;
  const back = (r: { x: number; y: number; width: number; height: number }) => ({ x: o.x + (r.x - o.x) / s, y: o.y + (r.y - o.y) / s, width: r.width / s, height: r.height / s });
  return { ...frames, page: back(frames.page), bleed: back(frames.bleed), ...(frames.outer ? { outer: back(frames.outer) } : {}) };
}

/** The ends of connectors at an anchor no picture of their frame has
 *  (#1057), per document, as `labelAnchorUnknown` warnings with the
 *  connector's id (read by {@link connectorAnchorUnknownWarnings}). */
const connectorAnchorWarnings = new WeakMap<VDTDocument, ContentWarning[]>();

/** Per document, the furniture each composed page's running heads and
 *  decoration meant to draw (#1163), read by {@link pageFurnitureWarnings}. */
const pageFurnitureByDoc = new WeakMap<VDTDocument, PageFurniture[]>();

/** The `folioMissing` warnings of `doc` (#1163): a composed page that draws
 *  no folio or running head most pages of its template and side draw. */
export function pageFurnitureWarnings(doc: VDTDocument): ContentWarning[] {
  const records = pageFurnitureByDoc.get(doc);
  return records && records.length > 0 ? folioMissingWarnings(doc.pages, records) : [];
}

/** The `labelAnchorUnknown` warnings of the connectors of `doc`'s composed
 *  pages (#1057): an end set at an anchor no picture of its frame has. */
export function connectorAnchorUnknownWarnings(doc: VDTDocument): ContentWarning[] {
  return connectorAnchorWarnings.get(doc) ?? [];
}

export function buildHeadersAndFooters(doc: VDTDocument, resourceById?: ReadonlyMap<string, Resource>, inputs: HeaderFooterInputs = {}): void {
  // Each page's slots measure their text in the writing mode they are set
  // in (see the loop); the mode in force before is put back.
  const measureMode = getMeasureWritingMode();
  try {
    layoutHeadersAndFooters(doc, resourceById, inputs);
  } finally {
    setMeasureWritingMode(measureMode);
  }
}

function layoutHeadersAndFooters(doc: VDTDocument, resourceById: ReadonlyMap<string, Resource> | undefined, inputs: HeaderFooterInputs): void {
  const resolved = doc.config;
  const dpi = resolved.page.dpi;
  const metrics = computePageMetrics(resolved);
  // Header and footer are laid out on the sheet on every page; every other
  // slot (openers, part pages, overlays) in the page's flow frame, so on a
  // vertical page their text reads vertically.
  const framesOf = (m: typeof metrics): { physical: DesignFrames; vertical: DesignFrames } => ({
    physical: { page: m.physical.trimBox, bleed: m.physical.bleedBox },
    vertical: {
      page: sheetRectToFlow(m.physical.trimBox, m.pageWidthPx),
      bleed: sheetRectToFlow(m.physical.bleedBox, m.pageWidthPx),
      upright: true,
    },
  });
  const docFrames = framesOf(metrics);
  // A composed page laid out on a host's leaf (`composedViewerLeaf`,
  // #1045) has the leaf's sheet: its decoration and furniture are laid on
  // it.
  const leafConfig = composedLeafConfig(resolved);
  const leafMetrics = leafConfig ? computePageMetrics(leafConfig) : undefined;
  const leafFrames = leafMetrics ? framesOf(leafMetrics) : undefined;

  // Page roles drive the per-element `pages` filter of every slot below.
  classifyPages(doc, resolved);

  // The headings a composed page's frames set (#874) count as running
  // marks too: they live in the page's floats, not in `doc.blocks`.
  const markBlocks = withComposedHeadings(doc);
  const chapterTitleByPageIndex = computeChapterTitles(markBlocks, doc.pages.length, doc.pages);
  // A heading style with an empty `numberingTemplate` prints no number, not
  // even the chapter ordinal `{chapterNumber}` falls back to.
  const numberlessStyles = new Set(resolved.headingStyles.filter((s) => s.numberingTemplate === '').map((s) => s.id));
  const numberless = numberlessStyles.size > 0
    ? (b: VDTBlock) => b.headingStyleId !== undefined && numberlessStyles.has(b.headingStyleId)
    : undefined;
  // The digits of the chapter ordinals and page counts the slots print.
  const numerals = resolved.numerals;
  const chapterNumberByPageIndex = computeChapterNumbers(
    markBlocks,
    doc.pages.length,
    doc.pages,
    doc.chapterOrdinalOffset ?? 0,
    numberless,
    numerals,
  );
  // The chapter in force at the top of each page (`{chapterTitleAtTop}`,
  // `{chapterNumberAtTop}`): the one a page runs on from, even where a new
  // chapter starts lower down (EF-187).
  const chapterTitleAtTopByPageIndex = computeChapterTitlesAtTop(markBlocks, doc.pages.length, doc.pages);
  const chapterNumberAtTopByPageIndex = computeChapterNumbersAtTop(
    markBlocks,
    doc.pages.length,
    doc.pages,
    doc.chapterOrdinalOffset ?? 0,
    numberless,
    numerals,
  );
  // A heading design (opener, in-column overlay, contents part row) prints
  // the chapter its block belongs to, not the page's: where two chapters
  // meet on a page, the page value is the later one's. Its height was
  // measured with this value too (`build.ts`).
  const chapterNumberByBlock = computeChapterNumbersByBlock(doc.blocks, doc.chapterOrdinalOffset ?? 0, numberless, numerals);
  const chapterNumberOf = (block: VDTBlock, pageIndex: number): string =>
    chapterNumberByBlock.get(block) ?? chapterNumberByPageIndex[pageIndex] ?? '';
  // Parity (odd/even elements) counts the pages before a continued document.
  const pageIndexOffset = doc.pageIndexOffset ?? 0;
  const chapterAttrsByPageIndex = computeChapterAttrs(doc.blocks, doc.pages.length, doc.pages);
  /** Per composed page, the furniture its slots mean to draw (#1163). */
  const furnitureRecords: PageFurniture[] = [];
  pageFurnitureByDoc.set(doc, furnitureRecords);
  // `{bookTotalPages}`: the host's count of the whole book, else the pages
  // up to the end of this document.
  const bookTotalPages = doc.bookPageCount ?? pageIndexOffset + doc.pages.length;
  // Running marks, computed per key the first time a template names it.
  const marksByKey = new Map<string, PageMarks>();
  const marksFor = (key: string): PageMarks => {
    let marks = marksByKey.get(key);
    if (!marks) {
      marks = computePageMarks(doc.blocks, doc.pages.length, markSourceOf(key), inputs.paragraphMark);
      marksByKey.set(key, marks);
    }
    return marks;
  };
  const partValues = computePartValues(pagesWithPartMarks(doc), doc.partStart);
  const { partTitleByPageIndex, partNumberByPageIndex } = partValues;
  const headingLevels = createHeadingLevelResolver(resolved);
  const locale = resolvedLocale(resolved);
  // Styled sections (`{style="…"}` headings): their running heads replace
  // the document's on their pages, and their palette overrides stack on the
  // part's.
  const sectionByPage = computeSectionStyles(doc.blocks, doc.pages.length, doc.pages, resolved);
  // A composed page (#976) stacks its template's `palette` and the page
  // fence's `palette="id=#hex"` on top of those: the palette-linked fills
  // of its frames and decoration take the page's value.
  const composedPalettes = new Map<string, Record<string, string>>();
  const composedPaletteOf = (page: VDTPage | undefined): Record<string, string> | undefined => {
    const composed = page?.composed;
    if (!page || !composed) return undefined;
    const parity = (page.index + pageIndexOffset) % 2 === 0 ? 'recto' : 'verso';
    const key = `${composed.template}|${parity}`;
    let fromTemplate = composedPalettes.get(key);
    if (!fromTemplate) {
      const template = resolvePageTemplate({ pageTemplates: resolved.pageTemplates, calloutStyles: resolved.calloutStyles }, composed.template, { parity });
      fromTemplate = parsePartPalette(template?.palette);
      composedPalettes.set(key, fromTemplate);
    }
    const fromFence = parsePartPalette(composed.attrs.palette);
    const merged = { ...fromTemplate, ...fromFence };
    return Object.keys(merged).length > 0 ? merged : undefined;
  };
  const partPaletteByPageIndex = partValues.partPaletteByPageIndex.map((palette, i) => {
    const section = sectionByPage[i];
    const base = section && Object.keys(section.palette).length > 0 ? { ...palette, ...section.palette } : palette;
    const own = composedPaletteOf(doc.pages[i]);
    return own ? { ...base, ...own } : base;
  });
  // The same overrides recolour the palette-linked colours of the flow,
  // and of the line numbers (#621).
  applyPartPalettesToFlow(doc, partPaletteByPageIndex, resolved.colorPalette, inputs.flowColorValues);
  recolorLineNumbers(doc, partPaletteByPageIndex);
  // And the paper: a page whose overrides change the entry the page colour
  // links to paints that colour instead.
  stampPageBackgrounds(doc, partPaletteByPageIndex, resolved.page.backgroundColor, resolved.colorPalette);

  /** Pages of a spread whose decoration is laid (#861). */
  const spreadDecorated = new Set<number>();
  for (const page of doc.pages) {
    // Text in the flow (openers, part pages, in-column designs) reads as the
    // page's flow does; running heads and folios are horizontal on the
    // sheet, whatever the flow (see below).
    setMeasureWritingMode(pageIsVertical(page) ? 'vertical-rl' : 'horizontal-tb');
    const onLeaf = leafMetrics !== undefined && onComposedLeaf(resolved, page);
    const pageMetrics = onLeaf ? leafMetrics : metrics;
    const { physical: physicalFrames, vertical: verticalFrames } = onLeaf ? leafFrames! : docFrames;
    // Per-page content area: mirrored margins swap inner/outer on even pages.
    const contentArea = page.contentArea;
    // A right-to-left page lays these out in its mirrored flow, whose trim
    // and bleed boxes are the sheet's (centred, so their own mirror images).
    const frames = pageIsVertical(page) ? verticalFrames : physicalFrames;
    const extras: SlotLayoutExtras = {
      // A composed page reports its template's role (`role`, default
      // `'composed'`) to the `pages` filter of its slots' elements.
      frames, pageRole: (page.composed?.role as PageRole | undefined) ?? page.role, resourceById,
      metadataSources: doc.metadataSources, metadata: doc.metadata as Record<string, unknown>,
      // Right-to-left text: the document's direction, and the mirror of a
      // right-to-left page's flow, which the slots below are painted in.
      ...(resolved.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
      ...(pageIsMirrored(page) ? { mirrored: true } : {}),
      ...(arabicNumbersOf(resolved) ? { arabicNumbers: true } : {}),
    };
    // Running heads and folios stay on the sheet: the physical content
    // area and trim box. `anchor.to: 'outer'` is the outer margin, on the
    // side away from the spine (it swaps with the binding and the page's
    // parity, as mirrored margins do).
    const sheetArea = flowRectToPage(page, contentArea);
    const trim = pageMetrics.physical.trimBox;
    const recto = (page.index + pageIndexOffset) % 2 === 0;
    const outerRight = recto !== (resolved.page.binding === 'right');
    const outer = outerRight
      ? { x: sheetArea.x + sheetArea.width, y: sheetArea.y, width: Math.max(0, trim.x + trim.width - (sheetArea.x + sheetArea.width)), height: sheetArea.height }
      : { x: trim.x, y: sheetArea.y, width: Math.max(0, sheetArea.x - trim.x), height: sheetArea.height };
    // On the sheet, the start of a right-to-left page, and of a vertical one
    // (its lines follow each other leftwards), is its right (#936).
    const startRight = resolved.direction === 'rtl' || pageIsVertical(page);
    const sheetExtras: SlotLayoutExtras = { ...extras, frames: { ...physicalFrames, outer }, mirrored: false, ...(startRight ? { startRight: true } : {}) };
    const section = sectionByPage[page.index];
    // A composed page (#855) takes its template's running heads: a slot of
    // its own, `false` for none, unset for the section's.
    const template = page.composed
      ? resolvePageTemplate({ pageTemplates: resolved.pageTemplates, calloutStyles: resolved.calloutStyles }, page.composed.template, { parity: recto ? 'recto' : 'verso', ...(page.composed.modules ? { modules: page.composed.modules } : {}) })
      : undefined;
    const pageAttrs = page.composed && Object.keys(page.composed.attrs).length > 0 ? page.composed.attrs : undefined;
    const templateSlot = (own: DesignSlot | false | undefined, kind: 'header' | 'footer', inherited: ResolvedDesignSlot): ResolvedDesignSlot =>
      own === false ? { elements: [] } : own ? resolveDesignSlot(own, kind) : inherited;
    const headerSlot = templateSlot(template?.header, 'header', section?.header ?? resolved.header);
    const footerSlot = templateSlot(template?.footer, 'footer', section?.footer ?? resolved.footer);
    // Where each running head is written (#857): the template's own, the
    // styled section's, or the document's.
    const sectionAt = section ? resolved.headingStyles.indexOf(section) : -1;
    const slotPath = (kind: 'header' | 'footer'): string | undefined => {
      const own = template?.[kind];
      if (own === false) return undefined;
      if (own) return kind === 'header' ? template!.headerPath : template!.footerPath;
      if (section?.[kind] && sectionAt >= 0) return `/headingStyles/${sectionAt}/${kind}`;
      return `/${kind}`;
    };
    // `{attr.x}` of the page fence in the running heads of a composed page
    // maps back to the attribute (#857).
    const pageAttrSources: Record<string, { start: number; end: number }> | undefined = page.composed
      ? Object.fromEntries(Object.entries(page.composed.attrSources).map(([k, v]) => [k, { start: v.sourceStart, end: v.sourceEnd }]))
      : undefined;
    const headExtras: SlotLayoutExtras = page.composed ? { ...sheetExtras, attrs: page.composed.attrs, attrSources: pageAttrSources } : sheetExtras;
    // A comic page is all panels: no running heads or folio unless
    // `comics.runningHeads` asks for them (its folio still counts).
    const furniture = !page.comic || resolvedComics(resolved).runningHeads;
    if (furniture && headerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'header',
        ...(pageAttrs ? { pageAttrs } : {}),
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterTitleAtTopByPageIndex,
        chapterNumberAtTopByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
      };
      page.header = asFurniture(withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        headerSlot,
        headerContainerBbox(sheetArea, pageMetrics.physical.trimBox),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...headExtras, slot: 'header', ...withPath(slotPath('header')) },
      )));
    }
    // Back of a part divider: a blank page right after a part page takes the
    // part's verso design (the model book tints the whole leaf). The part
    // page may close the preceding chapter (`doc.afterPartPage`).
    const prevPart = page.index > 0
      ? doc.pages[page.index - 1]!.partInfo
      : doc.afterPartPage ? doc.partStart : undefined;
    if (
      !page.partInfo
      && !page.comic
      && prevPart
      && resolved.parts.versoDesign.elements.length > 0
      && page.columns.every((c) => c.blocks.length === 0)
    ) {
      const { number, title } = prevPart;
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        heading: {
          titleText: replaceTitleBreaks(title, '\n'),
          formattedNumber: number,
          numericValue: parsePartNumber(number),
          locale,
          chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
        },
      };
      page.openerBand = layoutSlotToVdt(
        resolved.parts.versoDesign,
        { x: frames.page.x, y: frames.page.y, width: frames.page.width, height: frames.page.height },
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, slot: 'part' },
      );
    }
    // Part-divider page: the opener design covers the full trim box and is
    // purely decorative (the body column already comes from `parts.margins`).
    if (page.partInfo) {
      const { number, title } = page.partInfo;
      const slot = resolved.parts.design.elements.length > 0
        ? resolved.parts.design
        : synthesiseDefaultPartSlot(resolved, page, frames.page, number.length > 0);
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        heading: {
          titleText: replaceTitleBreaks(title, '\n'),
          formattedNumber: number,
          numericValue: parsePartNumber(number),
          locale,
          chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
        },
      };
      const partTitleSource = page.partInfo.titleSourceStart !== undefined && page.partInfo.titleSourceEnd !== undefined
        ? {
            start: page.partInfo.titleSourceStart,
            end: page.partInfo.titleSourceEnd,
            ...partTitleSourceMap(title, page.partInfo.titleSourceStart),
          }
        : undefined;
      page.openerBand = layoutSlotToVdt(
        slot,
        { x: frames.page.x, y: frames.page.y, width: frames.page.width, height: frames.page.height },
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, titleSource: partTitleSource, slot: 'part' },
      );
    }
    const opener = findOpenerHeading(page, headingLevels);
    if (opener) {
      const level = headingLevels.forLevel(opener.level, opener.block.headingStyleId);
      if (level) {
        const designed = level.advancedDesign.enabled && level.advancedDesign.slot.elements.length > 0;
        // The default opener prints the heading's runs (`marked`); a
        // design's `{titleText}` is the plain title, or the marked one in
        // an element that reads inline marks (#539).
        const marked = opener.title.marked;
        const slot = designed
          ? level.advancedDesign.slot
          : synthesiseDefaultOpenerSlot(level, opener.numberPrefix.length > 0, resolved.headings.textAlign, marked !== undefined);
        const placeholders: DesignPlaceholderContext = {
          kind: 'heading',
          page,
          allPages: doc.pages,
          metadata: doc.metadata,
          chapterTitleByPageIndex,
          chapterNumberByPageIndex,
          chapterAttrsByPageIndex,
          bookTotalPages,
          numerals,
          marksFor,
          partTitleByPageIndex,
          partNumberByPageIndex,
          partPaletteByPageIndex,
          heading: {
            titleText: opener.title.titleText,
            ...markedTitleFields(opener.title, resolved.chipStyles),
            formattedNumber: opener.numberPrefix,
            numericValue: opener.block.headingNumber,
            locale,
            chapterNumber: chapterNumberOf(opener.block, page.index),
            attrs: opener.block.attrs,
          },
        };
        page.openerBand = layoutSlotToVdt(
          slot,
          openerContainerBbox(opener.block, contentArea),
          page.index + pageIndexOffset,
          placeholders,
          dpi,
          {
            ...extras,
            titleSource: headingTitleSource(opener.block, opener.title.titleText),
            attrSources: opener.block.attrSources,
            attrs: opener.block.attrs,
            headingSource: headingLineSource(opener.block),
            slot: 'heading',
          },
        );
        if (page.openerBand) {
          opener.block.hidden = true;
        }
      }
    }
    // Heading advanced-design overlays: any heading whose level has
    // `advancedDesign.enabled` and a non-empty slot gets its default text
    // rendering replaced with a design overlay laid out inside the block's
    // bbox. `span: 'page'` headings are handled via `openerBand` above (and
    // are already `hidden`), so they're skipped here, except in a box.
    // `boxFrames`: the page frames in the coordinates of the frame the
    // heading is set in (see `framesInFrame`).
    const overlayHeading = (block: VDTBlock, col: VDTColumn | undefined, boxFrames?: DesignFrames): void => {
      if (block.type !== 'heading' || !block.headingLevel) return;
      // A heading set in a box or a frame (#906) is laid out as in a page
      // column, against its own block, whatever its span: there is no page
      // band to open inside a box. Its style and attributes are on
      // `boxDesign`.
      const inBox = block.containerId !== undefined;
      const own = inBox ? block.boxDesign : undefined;
      if (inBox && !own) return;
      const lvl = headingLevels.forLevel(block.headingLevel, own ? own.styleId : block.headingStyleId);
      if (!lvl) return;
      const attrs = own ? own.attrs : block.attrs;
      // A page-span heading opened mid-page (`spanBreak: false`, #539)
      // heads a band under the page's first: its design, or the default
      // opener, is laid out across the content area at the heading.
      const midPage = !inBox && lvl.span === 'page' && (col?.band ?? 0) > 0 && !headingIsHidden(block, lvl);
      const designed = lvl.advancedDesign.enabled && lvl.advancedDesign.slot.elements.length > 0;
      if (lvl.span === 'page' && !midPage && !inBox) return;
      if (!midPage && !designed) return;
      const pref = block.numberPrefix ?? '';
      // The lines joined back into the title (EF-162), with a forced break
      // (`\\`) as a newline, as the block's height was measured
      // (`build.ts`) and as an opener prints it (EF-152).
      const read = own
        ? defaultOpenerTitle(block.lines, pref, own.titleBreaks, own.titleLength ?? -1, block.numberSeparator)
        : defaultOpenerTitle(block.lines, pref, block.titleBreaks, block.titleLength ?? -1, block.numberSeparator);
      const { titleText: title, marked } = read;
      const placeholders: DesignPlaceholderContext = {
        kind: 'heading',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        heading: {
          titleText: title,
          ...markedTitleFields(read, resolved.chipStyles),
          formattedNumber: pref,
          numericValue: block.headingNumber,
          locale,
          chapterNumber: chapterNumberOf(block, page.index),
          attrs,
        },
      };
      const overlay = layoutSlotToVdt(
        designed
          ? lvl.advancedDesign.slot
          : synthesiseDefaultOpenerSlot(lvl, pref.length > 0, resolved.headings.textAlign, marked !== undefined),
        midPage
          ? openerContainerBbox(block, contentArea)
          : { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        {
          ...extras,
          ...(boxFrames ? { frames: boxFrames } : {}),
          titleSource: headingTitleSource(block, title),
          attrSources: own ? own.attrSources : block.attrSources,
          attrs,
          headingSource: headingLineSource(block),
          slot: 'heading',
        },
      );
      if (overlay) block.designOverlay = overlay;
    };
    // A part row of the contents: its design laid out in the block's box
    // with the part's own number, title, page label and palette. `boxFrames`:
    // the page frames in the coordinates of the frame the row is set in, for
    // the contents a frame of a composed page holds (#983).
    const overlayTocPart = (block: VDTBlock, boxFrames?: DesignFrames): void => {
      if (!block.tocPart) return;
      const tp = block.tocPart;
      const slot = resolved.toc.parts.design.elements.length > 0
        ? resolved.toc.parts.design
        : synthesiseDefaultTocPartSlot(resolved, tp.number.length > 0);
      const rowPage = { ...page, pageLabel: tp.pageLabel } as VDTPage;
      const palette = { ...(partPaletteByPageIndex[page.index] ?? {}), ...(tp.palette ?? {}) };
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        // `{leader}` fills the row with the contents' leader (#889).
        leader: tocPartLeader(resolved.toc),
        page: rowPage,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex: doc.pages.map((_, i) => (i === page.index ? palette : partPaletteByPageIndex[i] ?? {})),
        heading: {
          titleText: tp.title,
          formattedNumber: tp.number,
          numericValue: parsePartNumber(tp.number),
          locale,
          chapterNumber: chapterNumberOf(block, page.index),
        },
      };
      const overlay = layoutSlotToVdt(
        slot,
        { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, ...(boxFrames ? { frames: boxFrames } : {}), slot: 'tocRow' },
      );
      if (overlay) block.designOverlay = overlay;
    };
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden) continue;
        if (block.tocPart) {
          overlayTocPart(block);
          continue;
        }
        overlayHeading(block, col);
      }
    }
    // The headings of boxes and frames set out of the columns (#906): fixed
    // and floated callouts, the frames of a composed page and the halves of
    // a spread's frames shown on this page.
    const composed = page.composed;
    for (const block of page.floats ?? []) {
      if (block.hidden || block.containerId === undefined) continue;
      const frame = composed ? frameOfBlock(composed, block.id) : undefined;
      if (block.tocPart) overlayTocPart(block, frame ? framesInFrame(extras.frames, frame) : undefined);
      else if (block.type === 'heading') overlayHeading(block, undefined, frame ? framesInFrame(extras.frames, frame) : undefined);
    }
    for (const frame of composed?.frames ?? []) {
      for (const block of frame.facingBlocks ?? []) {
        if (block.hidden || block.containerId === undefined) continue;
        if (block.tocPart) overlayTocPart(block, framesInFrame(extras.frames, frame));
        else if (block.type === 'heading') overlayHeading(block, undefined, framesInFrame(extras.frames, frame));
      }
    }
    if (furniture && footerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'footer',
        ...(pageAttrs ? { pageAttrs } : {}),
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterTitleAtTopByPageIndex,
        chapterNumberAtTopByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
      };
      page.footer = asFurniture(withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        footerSlot,
        footerContainerBbox(sheetArea, pageMetrics.physical.trimBox),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...headExtras, slot: 'footer', ...withPath(slotPath('footer')) },
      )));
    }
    // What the page's running heads and decoration mean to draw on it, for
    // `folioMissing` (#1163). A spread's decoration is laid on its sheet of
    // two pages, so only its running heads are compared.
    if (page.composed && template) {
      const role = (page.composed.role as PageRole | undefined) ?? page.role;
      const at = page.index + pageIndexOffset;
      const expected = [
        ...(furniture ? expectedFurniture(headerSlot.elements, 'header', at, role, pageAttrs) : []),
        ...(furniture ? expectedFurniture(footerSlot.elements, 'footer', at, role, pageAttrs) : []),
        ...(page.composed.spread === undefined && template.decoration.elements.some((el) => el.kind === 'text')
          ? decorationFurniture(template, page, at, role, pageAttrs)
          : []),
      ];
      furnitureRecords.push({ pageIndex: page.index, template: page.composed.template, side: recto ? 'recto' : 'verso', expected });
    }
    // The template's decoration, laid with the frames' final boxes (its
    // elements may anchor to `'#frame'`), on the sheet like the running
    // heads; painted under the frames of layer 1 and up. A spread's (#861)
    // is laid once, on the sheet of its two pages, when its first page
    // comes, and cut for each page.
    const facing = page.composed?.facingPage !== undefined ? doc.pages[page.composed.facingPage] : undefined;
    // Empty frames' ruled lines (#914) are painted with the decoration.
    const ruled = (p: VDTPage | undefined): boolean => (p?.composed?.frames ?? []).some((f) => f.rules && !f.facingBlocks);
    if (page.composed && template && (template.decoration.elements.length > 0 || ruled(page) || ruled(facing)) && !(facing && spreadDecorated.has(page.index))) {
      const pair = facing?.composed?.spread && page.composed.spread ? { left: page.composed.spread === 'left' ? page : facing, right: page.composed.spread === 'left' ? facing : page } : undefined;
      const trimBox = pageMetrics.physical.trimBox;
      const bleedBox = pageMetrics.physical.bleedBox;
      const shift = trimBox.width;
      /** A frame's box on the sheet (of the spread, the right page's set
       *  `shift` along). */
      const named: Record<string, { x: number; y: number; width: number; height: number }> = {};
      /** And the box its template gave it, before groups moved it
       *  (`declaredRect`: what a `pin`ned element keeps to). */
      const declared: Record<string, { x: number; y: number; width: number; height: number }> = {};
      /** Frames that take no room on the page (#912): what anchors to
       *  them is not drawn. */
      const collapsed = new Set<string>();
      /** Frames a connector does not reach (#1056): collapsed, or empty and
       *  optional. */
      const absent = new Set<string>();
      const optional = new Set(template.frames.filter((f) => f.optional).map((f) => f.name));
      /** Empty frames' ruled lines (#914), on the sheet. */
      const rules: VDTDesignRuleBlock[] = [];
      /** The counter of the first numbered heading each frame holds
       *  (#984), in the document's digits, and the first of the page. */
      const headingNumberByFrame: Record<string, string> = {};
      let headingNumber: string | undefined;
      const floatById = new Map<string, VDTBlock>();
      /** The page and the blocks of each frame, for a connector's end at
       *  an anchor of the picture it holds (#1057). */
      const frameBlocks = new Map<string, { page: VDTPage; dx: number; blocks: VDTBlock[] }>();
      const nameFrames = (p: VDTPage, dx: number) => {
        for (const b of p.floats ?? []) floatById.set(b.id, b);
        for (const f of p.composed?.frames ?? []) {
          if (f.collapsed) collapsed.add(f.name);
          if (f.collapsed || (optional.has(f.repeat?.frame ?? f.name) && f.sourceStart === undefined && f.continuedFrom === undefined)) absent.add(f.name);
          if (!f.facingBlocks) {
            for (const id of f.blockIds) {
              const n = floatById.get(id)?.headingNumber;
              if (n === undefined) continue;
              const text = withDigits(String(n), numerals);
              headingNumberByFrame[f.name] ??= text;
              headingNumber ??= text;
            }
          }
          if (f.facingBlocks) continue;
          // A frame in its own writing mode (#944) is anchored to by the box
          // the page gives it, not the turned box its content is laid in.
          const r = flowRectToPage(p, framePageRect(f));
          const d = flowRectToPage(p, framePageRect({ rect: f.declaredRect ?? f.rect, writingMode: f.writingMode }));
          named[f.name] = { ...r, x: r.x + dx };
          declared[f.name] = { ...d, x: d.x + dx };
          frameBlocks.set(f.name, { page: p, dx, blocks: f.blockIds.map((id) => floatById.get(id)).filter((b): b is VDTBlock => b !== undefined) });
          for (const rule of f.rules ?? []) {
            // A vertical page's flow turns a rule across its lines.
            const b = flowRectToPage(p, rule.bbox);
            rules.push({ ...rule, bbox: { ...b, x: b.x + dx }, direction: b.height > b.width ? 'vertical' : 'horizontal' });
          }
        }
        // A module's box (#1062): what its decoration anchored to its
        // `'container'` reads (`#<name>`). A module laid elsewhere has none
        // here, and its decoration is not drawn.
        for (const m of p.composed?.modules ?? []) {
          if (!m.rect || named[m.name] !== undefined) continue;
          const r = flowRectToPage(p, m.rect);
          named[m.name] = { ...r, x: r.x + dx };
          declared[m.name] = { ...r, x: r.x + dx };
        }
      };
      let container: { x: number; y: number; width: number; height: number };
      let slotFrames: { page: typeof trimBox; bleed: typeof trimBox } = physicalFrames;
      if (pair) {
        nameFrames(pair.left, 0);
        nameFrames(pair.right, shift);
        const spreadTrim = { ...trimBox, width: shift + trimBox.width };
        const spreadBleed = { ...bleedBox, width: shift + bleedBox.width };
        const l = flowRectToPage(pair.left, pair.left.contentArea);
        const r = flowRectToPage(pair.right, pair.right.contentArea);
        const cx = Math.min(l.x, r.x + shift);
        const cy = Math.min(l.y, r.y);
        const content = { x: cx, y: cy, width: Math.max(l.x + l.width, r.x + shift + r.width) - cx, height: Math.max(l.y + l.height, r.y + r.height) - cy };
        container = template.area === 'trim' ? spreadTrim : template.area === 'bleed' ? spreadBleed : content;
        slotFrames = { page: spreadTrim, bleed: spreadBleed };
      } else {
        nameFrames(page, 0);
        container = template.area === 'trim' ? trimBox : template.area === 'bleed' ? bleedBox : sheetArea;
      }
      const attrSources: Record<string, { start: number; end: number }> = {};
      for (const [k, v] of Object.entries(page.composed.attrSources)) attrSources[k] = { start: v.sourceStart, end: v.sourceEnd };
      const placeholders: DesignPlaceholderContext = {
        kind: 'composed',
        ...(pageAttrs ? { pageAttrs } : {}),
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterTitleAtTopByPageIndex,
        chapterNumberAtTopByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        bookTotalPages,
        numerals,
        marksFor,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        ...(headingNumber !== undefined ? { headingNumber } : {}),
        ...(Object.keys(headingNumberByFrame).length > 0 ? { headingNumberByFrame } : {}),
      };
      // An element anchored to an instance of a repeated frame (#1061) the
      // page does not have (`#card[5]` on a page of three cards) is not
      // drawn, as one anchored to a frame that takes no room. So is one
      // anchored to a module (#1062), or a frame of it, that went on whole.
      const ofModule = new Set((template.modules ?? []).flatMap((m) => [m.name, ...m.frames, ...m.groups]));
      for (const el of template.decoration.elements) {
        const to = (el as { placement?: { anchor?: { to?: unknown } } }).placement?.anchor?.to;
        const t = typeof to === 'string' && to.startsWith('#') ? to.slice(1) : undefined;
        if (t !== undefined && named[t] === undefined && (repeatInstance(t) !== undefined || ofModule.has(t))) collapsed.add(t);
      }
      const slot = resolveDesignSlot(template.decoration, 'header');
      // A module's elements (#1189): their `{attr.x}` and `when` read the
      // module's fence first, and its texts are painted over the frames
      // unless they say `over: false` (a page template's texts only when
      // they say `over: true`).
      const { elementAttrs, inModule } = moduleDecoration(template, slot.elements, pair ? [pair.left, pair.right] : [page]);
      const overTexts = new Set<string>();
      template.decoration.elements.forEach((el, i) => {
        if (el.kind !== 'text') return;
        const over = typeof el.over === 'boolean' ? el.over : inModule.has(i);
        const id = slot.elements[i]?.id;
        if (over && id !== undefined) overTexts.add(id);
      });
      const connectorDropped: { elementId: string; targetId: string }[] = [];
      const connectorAnchorUnknown: NonNullable<SlotLayoutExtras['connectorAnchorUnknown']> = [];
      // A connector's end at an anchor of the picture its frame holds
      // (#1057): the first figure of the frame whose resource has it.
      const anchorPoint = (frame: string, anchor: string): { x: number; y: number } | { hidden: true } | { resourceId?: string; known: string[] } => {
        const held = frameBlocks.get(frame);
        let first: VDTBlock | undefined;
        for (const b of held?.blocks ?? []) {
          const rb = b.resourceBlock;
          if (!rb || (rb.kind !== 'bitmap' && rb.kind !== 'svg')) continue;
          first ??= b;
          const at = figureAnchorPointOnPage(held!.page, b, anchor);
          if (!at) continue;
          const p = { x: at.x + held!.dx, y: at.y };
          // A point the frame cuts off (its picture runs past the frame's
          // foot) is not shown on the page.
          const box = named[frame];
          if (box && (p.x < box.x - 0.5 || p.x > box.x + box.width + 0.5 || p.y < box.y - 0.5 || p.y > box.y + box.height + 0.5)) return { hidden: true };
          return p;
        }
        const res = first?.resourceBlock?.resource;
        return res ? { resourceId: res.id, known: (res.anchors ?? []).map((a) => a.id) } : { known: [] };
      };
      const laidDecoration = template.decoration.elements.length === 0 ? undefined : withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        collapsed.size > 0 ? withoutAnchoredTo(slot, collapsed) : slot,
        container,
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        {
          ...sheetExtras, frames: { ...slotFrames, named, declared, ...(absent.size > 0 ? { absent } : {}), anchorPoint }, attrs: page.composed!.attrs, attrSources, connectorDropped, connectorAnchorUnknown,
          ...(elementAttrs.size > 0 ? { elementAttrs } : {}),
          ...(overTexts.size > 0 ? { overTexts } : {}),
          // Each element's pointer, from the template that sets it (#857).
          elementPaths: new Map(resolveDesignSlot(template.decoration, 'header').elements.map((el, i) => [el.id, template.decorationPaths[i]!] as const)),
        },
      ));
      // The ends connectors left out, in the reflow log of the page laid
      // (of a spread, its first page); a pass that lays the decoration
      // again replaces them.
      for (const p of pair ? [pair.left, pair.right] : [page]) {
        if (p.composed?.log.some((e) => e.kind === 'connectorDropped')) p.composed.log = p.composed.log.filter((e) => e.kind !== 'connectorDropped');
      }
      for (const d of connectorDropped) page.composed.log.push({ frame: d.targetId, kind: 'connectorDropped', cause: d.elementId });
      // Ends at an anchor the frame's picture lacks (#1057): a content
      // warning on the page laid, once per pass.
      const unknown = connectorAnchorWarnings.get(doc) ?? [];
      const kept = unknown.filter((w) => !(pair ? [pair.left.index, pair.right.index] : [page.index]).includes(w.pageIndex ?? -1));
      for (const d of connectorAnchorUnknown) {
        kept.push({
          kind: 'labelAnchorUnknown',
          resourceId: d.resourceId ?? '',
          anchor: d.anchor,
          known: d.known,
          connector: d.elementId,
          frame: d.targetId,
          ...(doc.config?.locale ? { locale: doc.config.locale } : {}),
          pageIndex: page.index,
        });
      }
      if (kept.length > 0 || unknown.length > 0) connectorAnchorWarnings.set(doc, kept);
      const decoration = rules.length === 0 ? laidDecoration
        : laidDecoration ? { ...laidDecoration, blocks: [...laidDecoration.blocks, ...rules] } : { bbox: { ...container }, blocks: rules };
      if (decoration && pair) {
        const halves = splitSpreadDecoration(decoration, shift, { left: bleedBox, right: { ...bleedBox, x: bleedBox.x + shift } });
        pair.left.composed!.decoration = halves.left;
        pair.right.composed!.decoration = halves.right;
        spreadDecorated.add(pair.left.index);
        spreadDecorated.add(pair.right.index);
      } else if (decoration) page.composed.decoration = decoration;
    }
  }
}

/** `slot` without the elements anchored to one of `frames` (`'#name'`),
 *  directly or through other elements: the decoration of frames that take
 *  no room on a page added by continuation (#912). */
function withoutAnchoredTo(slot: ResolvedDesignSlot, frames: ReadonlySet<string>): ResolvedDesignSlot {
  const dropped = new Set<string>();
  const target = (el: ResolvedDesignSlot['elements'][number]): string | undefined => {
    // A connector (#1056) drops its own ends on frames the page lacks.
    if (el.kind === 'connector') return undefined;
    const to = el.placement.anchor.to;
    return to.startsWith('#') ? to.slice(1) : undefined;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const el of slot.elements) {
      const t = target(el);
      if (dropped.has(el.id) || t === undefined || (!frames.has(t) && !dropped.has(t))) continue;
      dropped.add(el.id);
      changed = true;
    }
  }
  return dropped.size > 0 ? { ...slot, elements: slot.elements.filter((el) => !dropped.has(el.id)) } : slot;
}

/** Set `page.background` on the pages whose palette overrides (part and
 *  styled section) change the colour `page.backgroundColor` follows: the
 *  entry it links to (`paletteId`), or, unlinked, an entry of the same
 *  value, as the flow's colours are matched. */
export function stampPageBackgrounds(
  doc: { pages: { index: number; background?: string }[] },
  palettes: readonly (Record<string, string> | undefined)[],
  pageColor: ColorValue,
  basePalette: readonly ColorPaletteEntry[] | undefined,
): void {
  const base = pageColor.hex?.toLowerCase();
  if (!base || base === 'transparent') return;
  const linked = pageColor.paletteId;
  const sameValue = (basePalette ?? []).filter((e) => e.value.hex.toLowerCase() === base).map((e) => e.id);
  for (const page of doc.pages) {
    const overrides = palettes[page.index];
    if (!overrides) continue;
    const id = linked && overrides[linked] !== undefined ? linked : sameValue.find((e) => overrides[e] !== undefined);
    if (!id) continue;
    const hex = overrides[id]!.startsWith('#') ? overrides[id]! : `#${overrides[id]}`;
    if (hex.toLowerCase() !== base) page.background = hex;
  }
}

/** `doc.blocks` as the running marks read them (#874): on a composed page
 *  only its headings count, in frame order, so a chapter that opens in one
 *  of its frames opens the page (`{chapterTitleAtTop}`) even though the
 *  story boxes of the frames come first. The same array when the document
 *  has no composed page. */
function withComposedHeadings(doc: VDTDocument): VDTBlock[] {
  const composed = new Set<number>();
  for (const page of doc.pages) if (page.composed) composed.add(page.index);
  if (composed.size === 0) return doc.blocks;
  const out: VDTBlock[] = [];
  const seen = new Set<string>();
  let lastComposed = -1;
  const pushFrames = (index: number) => {
    const page = doc.pages[index];
    if (!page?.composed) return;
    const byId = new Map((page.floats ?? []).map((b) => [b.id, b]));
    for (const f of page.composed.frames) {
      for (const id of f.blockIds) {
        const b = byId.get(id);
        if (b && b.headingLevel !== undefined && !seen.has(b.id)) {
          seen.add(b.id);
          out.push(b);
        }
      }
    }
  };
  for (const b of doc.blocks) {
    if (!composed.has(b.pageIndex)) {
      out.push(b);
      continue;
    }
    if (b.pageIndex !== lastComposed) {
      lastComposed = b.pageIndex;
      pushFrames(b.pageIndex);
    }
    if (b.headingLevel !== undefined && !seen.has(b.id)) {
      seen.add(b.id);
      out.push(b);
    }
  }
  return out;
}
