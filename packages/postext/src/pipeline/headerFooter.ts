import type { PartPageInfo } from './placeholders';
import { applyPartPalettesToFlow } from './partPalette';
import { TITLE_BREAK_RE, applyTitleBreaks } from '../parse/inlineFormatting';
import type { DocumentMetadata, Resource, ResolvedDesignSlot, ResolvedDesignTextElement, ResolvedHeadingLevelConfig } from '../types';
import {
  createBoundingBox,
  type VDTBlock,
  type VDTDocument,
  type VDTDesignSlot,
  type VDTDesignBlock,
  type VDTDesignTextBlock,
  type VDTDesignRuleBlock,
  type VDTDesignBoxBlock,
  type VDTDesignImageBlock,
  type VDTPage,
} from '../vdt';
import { computeChapterTitles, computeChapterNumbers, computeChapterAttrs, computePartValues } from './placeholders';
import { parsePartNumber } from './parts';
import { computePageMetrics } from './buildHelpers';
import { classifyPages } from './pageRoles';
import { computeSectionStyles, createHeadingLevelResolver, type HeadingLevelResolver } from './headingStyles';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import type { PageRole } from '../types';
import {
  layoutDesignSlot,
  type DesignFrames,
  type ResolvedPrimitive,
  type ResolvedTextPrimitive,
  type ResolvedRulePrimitive,
  type ResolvedBoxPrimitive,
  type ResolvedImagePrimitive,
} from '../design/layout';
import type { DesignPlaceholderContext } from '../design/placeholders';

/** Slots live in the page margin area between the body edge and the page
 *  edge. Header slot container: from `top-margin` edge down to body top.
 *  Footer slot container: from body bottom down to `bottom-margin` edge.
 *
 *  We use a larger container (the full page vertical extent of the margin
 *  area) so that anchors like `bottom-center` / `bottom-right` for headers
 *  and `top-*` for footers align with the body edge (the body-facing side
 *  of the margin area) rather than the outer page edge.
 *
 *  This matches the legacy semantics: `marginFromBody` was "distance from
 *  body edge" — the migration translates that to an offset of the same
 *  magnitude from the body-facing edge. */
function headerContainerBbox(contentArea: { x: number; y: number; width: number }) {
  // Header: spans from top of page to body top.
  return { x: contentArea.x, y: 0, width: contentArea.width, height: contentArea.y };
}

function footerContainerBbox(
  contentArea: { x: number; y: number; width: number; height: number },
  pageHeight: number,
) {
  const bodyBottom = contentArea.y + contentArea.height;
  return {
    x: contentArea.x,
    y: bodyBottom,
    width: contentArea.width,
    height: Math.max(0, pageHeight - bodyBottom),
  };
}

function textAlignOffsetX(
  align: 'left' | 'center' | 'right',
  contentWidth: number,
  lineWidth: number,
): number {
  if (align === 'left') return 0;
  if (align === 'right') return Math.max(0, contentWidth - lineWidth);
  return Math.max(0, (contentWidth - lineWidth) / 2);
}

function primitiveToBlock(prim: ResolvedPrimitive): VDTDesignBlock {
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
  };
}

function textPrimitiveToBlock(prim: ResolvedTextPrimitive): VDTDesignTextBlock {
  const totalContentHeight = prim.lines.reduce(
    (s, l) => Math.max(s, l.topY + l.height),
    0,
  );
  const vOffset =
    prim.verticalAlign === 'top' ? 0
    : prim.verticalAlign === 'bottom' ? Math.max(0, prim.contentHeight - totalContentHeight)
    : Math.max(0, (prim.contentHeight - totalContentHeight) / 2);

  const lines = prim.lines.map((l) => ({
    text: l.text,
    xOffset: prim.contentX + (l.xOffset ?? 0) + textAlignOffsetX(prim.align, prim.contentWidth - (l.xOffset ?? 0), l.width),
    baselineY: prim.y + prim.contentY + vOffset + l.baselineY,
    width: l.width,
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
    ...(prim.letterSpacingPx !== undefined && prim.letterSpacingPx > 0
      ? { letterSpacingPx: prim.letterSpacingPx }
      : {}),
  };
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

/** Measure the natural bottom of a heading's advanced-design slot when laid
 *  out against a container of the given `width` with unbounded height.
 *  Returns 0 if the level has no advanced design or the slot is empty. Used
 *  during body layout to enlarge a heading block's reserved height so
 *  subsequent blocks sit below the actual bottom of the design content
 *  rather than below the natural text bottom. Applies to both in-column
 *  headings (overlay in block bbox) and page-spanning openers (width is the
 *  full content area; passed in by the caller). */
export function measureHeadingAdvancedDesignHeight(
  level: ResolvedHeadingLevelConfig,
  heading: { titleText: string; formattedNumber: string; chapterNumber: string; attrs?: Record<string, string> },
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
): number {
  if (!level.advancedDesign.enabled) return 0;
  const minHeightPx = level.advancedDesign.minHeight
    ? dimensionToPx(level.advancedDesign.minHeight, dpi)
    : 0;
  if (level.advancedDesign.slot.elements.length === 0) return minHeightPx;
  const stubPage = { index: pageIndex, pageLabel: '1' } as unknown as VDTPage;
  const placeholders: DesignPlaceholderContext = {
    kind: 'heading',
    page: stubPage,
    allPages: [stubPage],
    metadata,
    chapterTitleByPageIndex: [],
    heading,
  };
  let stubFrames: DesignFrames | undefined;
  if (frames) {
    const ox = origin?.x ?? frames.page.x;
    const oy = origin?.y ?? frames.page.y;
    const shift = (f: DesignFrames['page']) => ({ x: f.x - ox, y: f.y - oy, width: f.width, height: f.height });
    stubFrames = { page: shift(frames.page), bleed: shift(frames.bleed) };
  }
  const result = layoutDesignSlot(
    level.advancedDesign.slot,
    { container: { x: 0, y: 0, width, height: 1e6 }, dpi, placeholders, frames: stubFrames },
    pageIndex,
  );
  let bottom = 0;
  for (const prim of result.primitives) {
    bottom = Math.max(bottom, prim.y + prim.height);
  }
  return Math.max(bottom, minHeightPx);
}

/** Optional page-level inputs for `layoutSlotToVdt`. */
export interface SlotLayoutExtras {
  frames?: DesignFrames;
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
}

const HEADING_LINE_PLACEHOLDER = /\{(number|numberDecimal|numberRoman|numberRomanLower|numberAlpha|numberAlphaLower|chapterNumber|chapterTitle)\}/;
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
    { container, dpi, placeholders, frames: extras?.frames, pageRole: extras?.pageRole, resourceById: extras?.resourceById },
    pageIndex,
  );
  if (result.primitives.length === 0) return undefined;
  const sourceByElement = new Map<string, { start: number; end: number; text?: string; sourceMap?: number[] }>();
  if (extras) {
    for (const el of slot.elements) {
      if (el.kind !== 'text') continue;
      const src = sourceForElement(el.content, extras);
      if (src) sourceByElement.set(el.id, src);
    }
  }
  const blocks = result.primitives.map((prim) => {
    const block = primitiveToBlock(prim);
    const src = sourceByElement.get(prim.id);
    if (block.kind === 'text' && src) {
      block.sourceStart = src.start;
      block.sourceEnd = src.end;
      if (src.text !== undefined && src.sourceMap && src.sourceMap.length === src.text.length) {
        block.sourceText = src.text;
        block.sourceMap = src.sourceMap;
      }
    }
    return block;
  });
  return {
    bbox: createBoundingBox(container.x, container.y, container.width, container.height),
    blocks,
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
): { block: VDTBlock; level: number; titleText: string; numberPrefix: string } | undefined {
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.type !== 'heading' || !block.headingLevel) continue;
      const lvl = levels.forLevel(block.headingLevel, block.headingStyleId);
      if (!lvl) continue;
      if (lvl.span !== 'page') continue;
      const full = block.lines
        .map((ln) => (ln.segments ?? []).map((s) => s.text).join(''))
        .join(' ');
      const pref = block.numberPrefix ?? '';
      const title = applyTitleBreaks(
        pref && full.startsWith(`${pref} `) ? full.slice(pref.length + 1) : full,
        block.titleBreaks,
        block.titleLength ?? -1,
      );
      return { block, level: block.headingLevel, titleText: title, numberPrefix: pref };
    }
  }
  return undefined;
}

/** Build a synthesised default design slot for a `span: 'page'` heading when
 *  the user has not configured an `advancedDesign.slot`. Renders as a single
 *  text element, anchored to fill the full-page-width container, using the
 *  heading level's resolved typography. Emits `{number} {titleText}` when the
 *  heading carries a numberPrefix, otherwise `{titleText}`. */
function synthesiseDefaultOpenerSlot(level: ResolvedHeadingLevelConfig, hasNumberPrefix: boolean): ResolvedDesignSlot {
  // `{number}` is the heading placeholder for the formatted number;
  // `{formattedNumber}` is not one, and left the title with a leading space.
  const content = hasNumberPrefix ? '{number} {titleText}' : '{titleText}';
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
    align: 'left',
    verticalAlign: 'middle',
    lineHeight: level.lineHeight.unit === 'em' ? level.lineHeight.value : 1.2,
    overflow: 'wrap',
    hyphenate: true,
  };
  return { elements: [textEl] };
}

/** Default opener design of a `:::part` page when `parts.design` is empty:
 *  `{number} {titleText}` (or just `{titleText}` without a number) in the
 *  H1 typography, anchored at the top-left of the part's body area — the
 *  container is the trim box, so the offset is the part margins. Purely
 *  decorative: raise `parts.margins.top` to keep the body clear of it. */
function synthesiseDefaultPartSlot(
  resolved: ResolvedConfig,
  page: VDTPage,
  trimBox: { x: number; y: number },
  hasNumber: boolean,
): ResolvedDesignSlot {
  const level = resolved.headings.levels.find((l) => l.level === 1) ?? resolved.headings.levels[0]!;
  const content = hasNumber ? '{number} {titleText}' : '{titleText}';
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
 *  empty: `{number} {titleText}` at the left and `{pageNumber}` at the
 *  right, in the level-1 entry typography. */
function synthesiseDefaultTocPartSlot(resolved: ResolvedConfig): ResolvedDesignSlot {
  const entry = resolved.toc.levels[0]!;
  const common = {
    kind: 'text' as const, parity: 'all' as const, pages: 'all' as const,
    fontFamily: entry.fontFamily, fontSize: entry.fontSize, fontWeight: entry.fontWeight, italic: entry.italic,
    color: entry.color, verticalAlign: 'middle' as const, lineHeight: 1.2, hyphenate: false,
  };
  const title: ResolvedDesignTextElement = {
    ...common, id: 'tocPartTitle', content: '{number} {titleText}', align: 'left', overflow: 'ellipsis-end',
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
  for (const mark of doc.partMarks) {
    let page: number | undefined;
    for (const b of doc.blocks) {
      if (b.contentIndex !== undefined && b.contentIndex > mark.afterContentIndex && b.pageIndex !== undefined) {
        page = page === undefined ? b.pageIndex : Math.min(page, b.pageIndex);
      }
    }
    if (page !== undefined) marked.set(page, { number: mark.number, title: mark.title, ...(mark.palette ? { palette: mark.palette } : {}) });
  }
  return doc.pages.map((p, i) => (marked.has(i) && !p.partInfo ? { ...p, partInfo: marked.get(i) } : p));
}

export function buildHeadersAndFooters(doc: VDTDocument, resourceById?: ReadonlyMap<string, Resource>): void {
  const resolved = doc.config;
  const dpi = resolved.page.dpi;
  const metrics = computePageMetrics(resolved);
  const frames: DesignFrames = { page: metrics.trimBox, bleed: metrics.bleedBox };

  // Page roles drive the per-element `pages` filter of every slot below.
  classifyPages(doc, resolved);

  const chapterTitleByPageIndex = computeChapterTitles(doc.blocks, doc.pages.length, doc.pages);
  const chapterNumberByPageIndex = computeChapterNumbers(doc.blocks, doc.pages.length, doc.pages, doc.chapterOrdinalOffset ?? 0);
  // Parity (odd/even elements) counts the pages before a continued document.
  const pageIndexOffset = doc.pageIndexOffset ?? 0;
  const chapterAttrsByPageIndex = computeChapterAttrs(doc.blocks, doc.pages.length, doc.pages);
  const partValues = computePartValues(pagesWithPartMarks(doc), doc.partStart);
  const { partTitleByPageIndex, partNumberByPageIndex } = partValues;
  const headingLevels = createHeadingLevelResolver(resolved);
  // Styled sections (`{style="…"}` headings): their running heads replace
  // the document's on their pages, and their palette overrides stack on the
  // part's.
  const sectionByPage = computeSectionStyles(doc.blocks, doc.pages.length, doc.pages, resolved);
  const partPaletteByPageIndex = partValues.partPaletteByPageIndex.map((palette, i) => {
    const section = sectionByPage[i];
    return section && Object.keys(section.palette).length > 0 ? { ...palette, ...section.palette } : palette;
  });
  // The same overrides recolour the palette-linked colours of the flow.
  applyPartPalettesToFlow(doc, partPaletteByPageIndex, resolved.colorPalette);

  for (const page of doc.pages) {
    // Per-page content area: mirrored margins swap inner/outer on even pages.
    const contentArea = page.contentArea;
    const extras: SlotLayoutExtras = {
      frames, pageRole: page.role, resourceById,
      metadataSources: doc.metadataSources, metadata: doc.metadata as Record<string, unknown>,
    };
    const section = sectionByPage[page.index];
    const headerSlot = section?.header ?? resolved.header;
    const footerSlot = section?.footer ?? resolved.footer;
    if (headerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'header',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
      };
      page.header = layoutSlotToVdt(
        headerSlot,
        headerContainerBbox(contentArea),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        extras,
      );
    }
    // Back of a part divider: a blank page right after a part page takes the
    // part's verso design (the model book tints the whole leaf).
    const prevPage = page.index > 0 ? doc.pages[page.index - 1] : undefined;
    if (
      !page.partInfo
      && prevPage?.partInfo
      && resolved.parts.versoDesign.elements.length > 0
      && page.columns.every((c) => c.blocks.length === 0)
    ) {
      const { number, title } = prevPage.partInfo;
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        heading: {
          titleText: title.replace(TITLE_BREAK_RE, '\n'),
          formattedNumber: number,
          numericValue: parsePartNumber(number),
          chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
        },
      };
      page.openerBand = layoutSlotToVdt(
        resolved.parts.versoDesign,
        { x: frames.page.x, y: frames.page.y, width: frames.page.width, height: frames.page.height },
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        extras,
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
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
        heading: {
          titleText: title.replace(TITLE_BREAK_RE, '\n'),
          formattedNumber: number,
          numericValue: parsePartNumber(number),
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
        { ...extras, titleSource: partTitleSource },
      );
    }
    const opener = findOpenerHeading(page, headingLevels);
    if (opener) {
      const level = headingLevels.forLevel(opener.level, opener.block.headingStyleId);
      if (level) {
        const slot = level.advancedDesign.enabled && level.advancedDesign.slot.elements.length > 0
          ? level.advancedDesign.slot
          : synthesiseDefaultOpenerSlot(level, opener.numberPrefix.length > 0);
        const placeholders: DesignPlaceholderContext = {
          kind: 'heading',
          page,
          allPages: doc.pages,
          metadata: doc.metadata,
          chapterTitleByPageIndex,
          chapterNumberByPageIndex,
          chapterAttrsByPageIndex,
          partTitleByPageIndex,
          partNumberByPageIndex,
          partPaletteByPageIndex,
          heading: {
            titleText: opener.titleText,
            formattedNumber: opener.numberPrefix,
            chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
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
            titleSource: headingTitleSource(opener.block, opener.titleText),
            attrSources: opener.block.attrSources,
            attrs: opener.block.attrs,
            headingSource: headingLineSource(opener.block),
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
            : synthesiseDefaultTocPartSlot(resolved);
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
            partTitleByPageIndex,
            partNumberByPageIndex,
            partPaletteByPageIndex: doc.pages.map((_, i) => (i === page.index ? palette : partPaletteByPageIndex[i] ?? {})),
            heading: {
              titleText: tp.title,
              formattedNumber: tp.number,
              numericValue: parsePartNumber(tp.number),
              chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
            },
          };
          const overlay = layoutSlotToVdt(
            slot,
            { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
            page.index + pageIndexOffset,
            placeholders,
            dpi,
            extras,
          );
          if (overlay) block.designOverlay = overlay;
          continue;
        }
        if (block.type !== 'heading' || !block.headingLevel) continue;
        const lvl = headingLevels.forLevel(block.headingLevel, block.headingStyleId);
        if (!lvl) continue;
        if (lvl.span === 'page') continue;
        if (!lvl.advancedDesign.enabled) continue;
        if (lvl.advancedDesign.slot.elements.length === 0) continue;
        const full = block.lines
          .map((ln) => (ln.segments ?? []).map((s) => s.text).join(''))
          .join(' ');
        const pref = block.numberPrefix ?? '';
        const title = pref && full.startsWith(`${pref} `) ? full.slice(pref.length + 1) : full;
        const placeholders: DesignPlaceholderContext = {
          kind: 'heading',
          page,
          allPages: doc.pages,
          metadata: doc.metadata,
          chapterTitleByPageIndex,
          chapterNumberByPageIndex,
          chapterAttrsByPageIndex,
          partTitleByPageIndex,
          partNumberByPageIndex,
          partPaletteByPageIndex,
          heading: {
            titleText: title,
            formattedNumber: pref,
            chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
            attrs: block.attrs,
          },
        };
        const overlay = layoutSlotToVdt(
          lvl.advancedDesign.slot,
          { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
          page.index + pageIndexOffset,
          placeholders,
          dpi,
          {
            ...extras,
            titleSource: headingTitleSource(block, title),
            attrSources: block.attrSources,
            attrs: block.attrs,
            headingSource: headingLineSource(block),
          },
        );
        if (overlay) block.designOverlay = overlay;
      }
    }
    if (footerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'footer',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
        chapterNumberByPageIndex,
        chapterAttrsByPageIndex,
        partTitleByPageIndex,
        partNumberByPageIndex,
        partPaletteByPageIndex,
      };
      page.footer = layoutSlotToVdt(
        footerSlot,
        footerContainerBbox(contentArea, page.height),
        page.index + pageIndexOffset,
        placeholders,
        dpi,
        extras,
      );
    }
  }
}
