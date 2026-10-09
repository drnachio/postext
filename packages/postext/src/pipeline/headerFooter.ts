import { resolvedComics } from '../defaults/comics';
import { fontFamilyOf, getMeasureRegion, getMeasureUprightDigits, getMeasureWritingMode, measureCentralBaseline, setMeasureWritingMode, withMeasureWritingMode } from '../measure/vertical';
import type { PartPageInfo } from './placeholders';
import { applyPartPalettesToFlow, type FlowColorValues } from './partPalette';
import { recolorLineNumbers } from './lineNumbers';
import { TITLE_BREAK_RE, applyTitleBreaks, parseInlineFormatting } from '../parse/inlineFormatting';
import type { ColorPaletteEntry, ColorValue, DesignTextAlign, DocumentMetadata, Resource, ResolvedDesignSlot, ResolvedDesignTextElement, ResolvedHeadingLevelConfig, TextAlign } from '../types';
import {
  createBoundingBox,
  flowRectToPage,
  pageIsMirrored,
  pageIsVertical,
  type VDTBlock,
  type VDTDocument,
  type VDTDesignSlot,
  type VDTDesignBlock,
  type VDTDesignTextBlock,
  type VDTDesignRuleBlock,
  type VDTDesignBoxBlock,
  type VDTDesignImageBlock,
  type VDTDesignSlotKind,
  type VDTPage,
} from '../vdt';
import { computeChapterTitles, computeChapterTitlesAtTop, computeChapterNumbers, computeChapterNumbersAtTop, computeChapterNumbersByBlock, computeChapterAttrs, computePageMarks, computePartValues, lineJoin, markSourceOf, type JoinedLine, type PageMarks } from './placeholders';
import { parsePartNumber, partMarkPages } from './parts';
import { computePageMetrics, sheetRectToFlow } from './buildHelpers';
import { resolvedLocale } from './config';
import { classifyPages } from './pageRoles';
import { computeSectionStyles, createHeadingLevelResolver, headingIsHidden, type HeadingLevelResolver } from './headingStyles';
import { dimensionToPx } from '../units';
import { resolveDesignLineHeight } from '../defaults/headerFooter';
import type { ResolvedConfig } from '../vdt';
import type { PageRole } from '../types';
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
} from '../design/layout';
import { resolveDesignText, type DesignPlaceholderContext, type HeadingPlaceholderInfo } from '../design/placeholders';
import { plainDesignText } from '../design/richText';

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
  return boxPrimitiveToBlock(prim);
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
        }
      : undefined,
    clip: prim.needsClip,
    // Negative tracking (a tightened display title) is painted too (EF-82).
    ...(prim.letterSpacingPx !== undefined && prim.letterSpacingPx !== 0
      ? { letterSpacingPx: prim.letterSpacingPx }
      : {}),
    ...(prim.stroke ? { stroke: { ...prim.stroke } } : {}),
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
    },
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
  const excluded = new Set(level.advancedDesign.slot.elements.filter((el) => el.reserve === false).map((el) => el.id));
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
  if (!level.advancedDesign.enabled) return { height: 0, textFloor: 0 };
  const minHeightPx = level.advancedDesign.minHeight
    ? dimensionToPx(level.advancedDesign.minHeight, dpi)
    : 0;
  if (level.advancedDesign.slot.elements.length === 0) return { height: minHeightPx, textFloor: 0 };
  const placeholders = headingPlaceholders(heading, metadata, pageIndex);
  let stubFrames: DesignFrames | undefined;
  if (frames) {
    const ox = origin?.x ?? frames.page.x;
    const oy = origin?.y ?? frames.page.y;
    const shift = (f: DesignFrames['page']) => ({ x: f.x - ox, y: f.y - oy, width: f.width, height: f.height });
    stubFrames = { page: shift(frames.page), bleed: shift(frames.bleed), ...(frames.upright ? { upright: true } : {}) };
  }
  const layoutAt = (height: number) => layoutDesignSlot(
    level.advancedDesign.slot,
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
  const excluded = new Set(level.advancedDesign.slot.elements.filter((el) => el.reserve === false).map((el) => el.id));
  let bottom = 0;
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
    bottom = Math.max(bottom, reservedBottom(prim, result.primitives[i - 1]));
  });
  return { height: Math.max(bottom, minHeightPx), textFloor };
}

/** Optional page-level inputs for `layoutSlotToVdt`. */
export interface SlotLayoutExtras {
  frames?: DesignFrames;
  /** The document's base direction and whether the slot is painted in the
   *  flow of a mirrored page (see `LayoutContext`). */
  direction?: 'ltr' | 'rtl';
  mirrored?: boolean;
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
}

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
  const result = layoutDesignSlot(
    slot,
    {
      container, dpi, placeholders, frames: extras?.frames, pageRole: extras?.pageRole, resourceById: extras?.resourceById,
      ...(extras?.direction ? { direction: extras.direction } : {}),
      ...(extras?.mirrored ? { mirrored: true } : {}),
    },
    pageIndex,
  );
  if (result.primitives.length === 0) return undefined;
  const sourceByElement = new Map<string, { start: number; end: number; text?: string; sourceMap?: number[]; prefixLen?: number }>();
  if (extras) {
    for (const el of slot.elements) {
      if (el.kind !== 'text') continue;
      const src = sourceForElement(el.content, extras);
      if (!src) continue;
      // Inline marks drop their markers from the printed text. The
      // per-character map holds while the mapped value is still printed as
      // written (no markers or escapes of its own); otherwise only the range
      // maps back.
      const keepMap = !el.inlineMarks || src.text === undefined
        || plainDesignText(resolveDesignText(el.content, placeholders, el.inlineMarks === true)).includes(src.text);
      sourceByElement.set(el.id, keepMap ? withPrintedTitle(el, src, placeholders) : { start: src.start, end: src.end });
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
  const blocks = result.primitives.map((prim) => {
    const block = primitiveToBlock(prim);
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
    }
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
}

/** A heading line as the title readers need it: its segments, and how it
 *  was broken from the next one. */
export type TitleLine = JoinedLine & {
  segments?: readonly { text: string; bold?: boolean; italic?: boolean; script?: 'sup' | 'sub' }[];
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

type TitleRunFlags = { bold: boolean; italic: boolean; script?: 'sup' | 'sub' };
const PLAIN_RUN: TitleRunFlags = { bold: false, italic: false };
/** The marker characters a backslash escapes (see `protectEscapes`). */
const TITLE_ESCAPE_RE = /[*_^~`]/g;
const escapeTitleRun = (text: string): string => text.replace(TITLE_ESCAPE_RE, (c) => `\\${c}`);
const sameEmphasis = (a: TitleRunFlags, b: TitleRunFlags): boolean => a.bold === b.bold && a.italic === b.italic;

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
  const chars: string[] = [];
  const flags: TitleRunFlags[] = [];
  /** Where a line break was read back as a space or a no-break space. */
  const separators = new Set<number>();
  let hasMarks = false;
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
  // The space two lines were broken at takes the emphasis of the words on
  // both sides of it, when they share one.
  for (let i = 1; i < chars.length - 1; i++) {
    if (flags[i] === PLAIN_RUN && (chars[i] === ' ' || separators.has(i)) && sameEmphasis(flags[i - 1]!, flags[i + 1]!)) {
      const f = flags[i - 1]!;
      if (f.bold || f.italic) flags[i] = { bold: f.bold, italic: f.italic };
    }
  }
  const full = chars.join('');
  const drop = numberPrefix && full.startsWith(`${numberPrefix}${numberSeparator}`) ? numberPrefix.length + numberSeparator.length : 0;
  const title = full.slice(drop);
  const titleText = applyTitleBreaks(title, titleBreaks, titleLength);
  if (!hasMarks) return { titleText };
  let tChars = chars.slice(drop);
  let tFlags = flags.slice(drop);
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
  if (tChars.join('') !== titleText) return { titleText };
  const scripted = (a: number, b: number): string => {
    let out = '';
    let i = a;
    while (i < b) {
      const script = tFlags[i]!.script;
      let j = i + 1;
      while (j < b && tFlags[j]!.script === script) j++;
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
  // Kept only when it reads back as the same text with the same runs.
  const spans = parseInlineFormatting(marked);
  if (spans.map((s) => s.text).join('') !== titleText) return { titleText };
  let at = 0;
  for (const s of spans) {
    if (s.smallCaps || s.links || s.math) return { titleText };
    for (let k = 0; k < s.text.length; k++, at++) {
      if (/\s/.test(s.text[k]!)) continue;
      const f = tFlags[at]!;
      if (f.bold !== !!s.bold || f.italic !== !!s.italic || f.script !== s.script) return { titleText };
    }
  }
  return { titleText, marked };
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
): number {
  const slot = synthesiseDefaultOpenerSlot(level, numberPrefix.length > 0, textAlign, title.marked !== undefined);
  const placeholders = headingPlaceholders(
    { titleText: title.titleText, ...(title.marked !== undefined ? { titleMarked: title.marked } : {}), formattedNumber: numberPrefix },
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
  const physicalFrames: DesignFrames = { page: metrics.physical.trimBox, bleed: metrics.physical.bleedBox };
  const verticalFrames: DesignFrames = {
    page: sheetRectToFlow(metrics.physical.trimBox, metrics.pageWidthPx),
    bleed: sheetRectToFlow(metrics.physical.bleedBox, metrics.pageWidthPx),
    upright: true,
  };

  // Page roles drive the per-element `pages` filter of every slot below.
  classifyPages(doc, resolved);

  const chapterTitleByPageIndex = computeChapterTitles(doc.blocks, doc.pages.length, doc.pages);
  // A heading style with an empty `numberingTemplate` prints no number, not
  // even the chapter ordinal `{chapterNumber}` falls back to.
  const numberlessStyles = new Set(resolved.headingStyles.filter((s) => s.numberingTemplate === '').map((s) => s.id));
  const numberless = numberlessStyles.size > 0
    ? (b: VDTBlock) => b.headingStyleId !== undefined && numberlessStyles.has(b.headingStyleId)
    : undefined;
  // The digits of the chapter ordinals and page counts the slots print.
  const numerals = resolved.numerals;
  const chapterNumberByPageIndex = computeChapterNumbers(
    doc.blocks,
    doc.pages.length,
    doc.pages,
    doc.chapterOrdinalOffset ?? 0,
    numberless,
    numerals,
  );
  // The chapter in force at the top of each page (`{chapterTitleAtTop}`,
  // `{chapterNumberAtTop}`): the one a page runs on from, even where a new
  // chapter starts lower down (EF-187).
  const chapterTitleAtTopByPageIndex = computeChapterTitlesAtTop(doc.blocks, doc.pages.length, doc.pages);
  const chapterNumberAtTopByPageIndex = computeChapterNumbersAtTop(
    doc.blocks,
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
  const partPaletteByPageIndex = partValues.partPaletteByPageIndex.map((palette, i) => {
    const section = sectionByPage[i];
    return section && Object.keys(section.palette).length > 0 ? { ...palette, ...section.palette } : palette;
  });
  // The same overrides recolour the palette-linked colours of the flow,
  // and of the line numbers (#621).
  applyPartPalettesToFlow(doc, partPaletteByPageIndex, resolved.colorPalette, inputs.flowColorValues);
  recolorLineNumbers(doc, partPaletteByPageIndex);
  // And the paper: a page whose overrides change the entry the page colour
  // links to paints that colour instead.
  stampPageBackgrounds(doc, partPaletteByPageIndex, resolved.page.backgroundColor, resolved.colorPalette);

  for (const page of doc.pages) {
    // Text in the flow (openers, part pages, in-column designs) reads as the
    // page's flow does; running heads and folios are horizontal on the
    // sheet, whatever the flow (see below).
    setMeasureWritingMode(pageIsVertical(page) ? 'vertical-rl' : 'horizontal-tb');
    // Per-page content area: mirrored margins swap inner/outer on even pages.
    const contentArea = page.contentArea;
    // A right-to-left page lays these out in its mirrored flow, whose trim
    // and bleed boxes are the sheet's (centred, so their own mirror images).
    const frames = pageIsVertical(page) ? verticalFrames : physicalFrames;
    const extras: SlotLayoutExtras = {
      frames, pageRole: page.role, resourceById,
      metadataSources: doc.metadataSources, metadata: doc.metadata as Record<string, unknown>,
      // Right-to-left text: the document's direction, and the mirror of a
      // right-to-left page's flow, which the slots below are painted in.
      ...(resolved.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
      ...(pageIsMirrored(page) ? { mirrored: true } : {}),
    };
    // Running heads and folios stay on the sheet: the physical content
    // area and trim box. `anchor.to: 'outer'` is the outer margin, on the
    // side away from the spine (it swaps with the binding and the page's
    // parity, as mirrored margins do).
    const sheetArea = flowRectToPage(page, contentArea);
    const trim = metrics.physical.trimBox;
    const recto = (page.index + pageIndexOffset) % 2 === 0;
    const outerRight = recto !== (resolved.page.binding === 'right');
    const outer = outerRight
      ? { x: sheetArea.x + sheetArea.width, y: sheetArea.y, width: Math.max(0, trim.x + trim.width - (sheetArea.x + sheetArea.width)), height: sheetArea.height }
      : { x: trim.x, y: sheetArea.y, width: Math.max(0, sheetArea.x - trim.x), height: sheetArea.height };
    const sheetExtras: SlotLayoutExtras = { ...extras, frames: { ...physicalFrames, outer }, mirrored: false };
    const section = sectionByPage[page.index];
    const headerSlot = section?.header ?? resolved.header;
    const footerSlot = section?.footer ?? resolved.footer;
    // A comic page is all panels: no running heads or folio unless
    // `comics.runningHeads` asks for them (its folio still counts).
    const furniture = !page.comic || resolvedComics(resolved).runningHeads;
    if (furniture && headerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'header',
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
        headerContainerBbox(sheetArea, metrics.physical.trimBox),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...sheetExtras, slot: 'header' },
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
          titleText: title.replace(TITLE_BREAK_RE, '\n'),
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
          titleText: title.replace(TITLE_BREAK_RE, '\n'),
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
            ...(marked !== undefined ? { titleMarked: marked } : {}),
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
    // In-column heading advanced-design overlays: any heading whose level
    // has `advancedDesign.enabled` and a non-empty slot gets its default
    // text rendering replaced with a design overlay laid out inside the
    // block's bbox. `span: 'page'` headings are handled via `openerBand`
    // above (and are already `hidden`), so they're skipped here.
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden) continue;
        // A part row of the contents: its design laid out in the block's box
        // with the part's own number, title, page label and palette.
        if (block.tocPart) {
          const tp = block.tocPart;
          const slot = resolved.toc.parts.design.elements.length > 0
            ? resolved.toc.parts.design
            : synthesiseDefaultTocPartSlot(resolved, tp.number.length > 0);
          const rowPage = { ...page, pageLabel: tp.pageLabel } as VDTPage;
          const palette = { ...(partPaletteByPageIndex[page.index] ?? {}), ...(tp.palette ?? {}) };
          const placeholders: DesignPlaceholderContext = {
            kind: 'part',
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
            { ...extras, slot: 'tocRow' },
          );
          if (overlay) block.designOverlay = overlay;
          continue;
        }
        if (block.type !== 'heading' || !block.headingLevel) continue;
        const lvl = headingLevels.forLevel(block.headingLevel, block.headingStyleId);
        if (!lvl) continue;
        // A page-span heading opened mid-page (`spanBreak: false`, #539)
        // heads a band under the page's first: its design, or the default
        // opener, is laid out across the content area at the heading.
        const midPage = lvl.span === 'page' && (col.band ?? 0) > 0 && !headingIsHidden(block, lvl);
        const designed = lvl.advancedDesign.enabled && lvl.advancedDesign.slot.elements.length > 0;
        if (lvl.span === 'page' && !midPage) continue;
        if (!midPage && !designed) continue;
        const pref = block.numberPrefix ?? '';
        // The lines joined back into the title (EF-162), with a forced break
        // (`\\`) as a newline, as the block's height was measured
        // (`build.ts`) and as an opener prints it (EF-152).
        const { titleText: title, marked } = defaultOpenerTitle(block.lines, pref, block.titleBreaks, block.titleLength ?? -1, block.numberSeparator);
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
            ...(marked !== undefined ? { titleMarked: marked } : {}),
            formattedNumber: pref,
            numericValue: block.headingNumber,
            locale,
            chapterNumber: chapterNumberOf(block, page.index),
            attrs: block.attrs,
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
            titleSource: headingTitleSource(block, title),
            attrSources: block.attrSources,
            attrs: block.attrs,
            headingSource: headingLineSource(block),
            slot: 'heading',
          },
        );
        if (overlay) block.designOverlay = overlay;
      }
    }
    if (furniture && footerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'footer',
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
        footerContainerBbox(sheetArea, metrics.physical.trimBox),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...sheetExtras, slot: 'footer' },
      )));
    }
  }
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
