import type { DocumentMetadata, ResolvedDesignSlot, ResolvedDesignTextElement, ResolvedHeadingLevelConfig } from '../types';
import {
  createBoundingBox,
  type VDTBlock,
  type VDTDocument,
  type VDTDesignSlot,
  type VDTDesignBlock,
  type VDTDesignTextBlock,
  type VDTDesignRuleBlock,
  type VDTDesignBoxBlock,
  type VDTPage,
} from '../vdt';
import { computeChapterTitles, computeChapterNumbers } from './placeholders';
import { computePageMetrics } from './buildHelpers';
import {
  layoutDesignSlot,
  type ResolvedPrimitive,
  type ResolvedTextPrimitive,
  type ResolvedRulePrimitive,
  type ResolvedBoxPrimitive,
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
function headerContainerBbox(contentArea: { x: number; y: number; width: number }, _pageHeight: number) {
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
  return boxPrimitiveToBlock(prim);
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
    xOffset: prim.contentX + textAlignOffsetX(prim.align, prim.contentWidth, l.width),
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
  heading: { titleText: string; formattedNumber: string; chapterNumber: string },
  width: number,
  dpi: number,
  metadata: DocumentMetadata,
  pageIndex: number,
): number {
  if (!level.advancedDesign.enabled) return 0;
  if (level.advancedDesign.slot.elements.length === 0) return 0;
  const stubPage = { index: pageIndex, pageLabel: '1' } as unknown as VDTPage;
  const placeholders: DesignPlaceholderContext = {
    kind: 'heading',
    page: stubPage,
    allPages: [stubPage],
    metadata,
    chapterTitleByPageIndex: [],
    heading,
  };
  const result = layoutDesignSlot(
    level.advancedDesign.slot,
    { container: { x: 0, y: 0, width, height: 1e6 }, dpi, placeholders },
    pageIndex,
  );
  let bottom = 0;
  for (const prim of result.primitives) {
    bottom = Math.max(bottom, prim.y + prim.height);
  }
  return bottom;
}

export function layoutSlotToVdt(
  slot: ResolvedDesignSlot,
  container: { x: number; y: number; width: number; height: number },
  pageIndex: number,
  placeholders: DesignPlaceholderContext,
  dpi: number,
): VDTDesignSlot | undefined {
  const result = layoutDesignSlot(slot, { container, dpi, placeholders }, pageIndex);
  if (result.primitives.length === 0) return undefined;
  const blocks = result.primitives.map(primitiveToBlock);
  return {
    bbox: createBoundingBox(container.x, container.y, container.width, container.height),
    blocks,
  };
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
  doc: VDTDocument,
): { block: VDTBlock; level: number; titleText: string; numberPrefix: string } | undefined {
  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.type !== 'heading' || !block.headingLevel) continue;
      const lvl = doc.config.headings.levels.find((l) => l.level === block.headingLevel);
      if (!lvl) continue;
      if (lvl.span !== 'page') continue;
      const full = block.lines
        .map((ln) => (ln.segments ?? []).map((s) => s.text).join(''))
        .join(' ');
      const pref = block.numberPrefix ?? '';
      const title = pref && full.startsWith(`${pref} `) ? full.slice(pref.length + 1) : full;
      return { block, level: block.headingLevel, titleText: title, numberPrefix: pref };
    }
  }
  return undefined;
}

/** Build a synthesised default design slot for a `span: 'page'` heading when
 *  the user has not configured an `advancedDesign.slot`. Renders as a single
 *  text element, anchored to fill the full-page-width container, using the
 *  heading level's resolved typography. Emits `{formattedNumber} {titleText}`
 *  when the heading carries a numberPrefix, otherwise `{titleText}`. */
function synthesiseDefaultOpenerSlot(level: ResolvedHeadingLevelConfig, hasNumberPrefix: boolean): ResolvedDesignSlot {
  const content = hasNumberPrefix ? '{formattedNumber} {titleText}' : '{titleText}';
  const textEl: ResolvedDesignTextElement = {
    kind: 'text',
    id: 'defaultHeadingOpener',
    parity: 'all',
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

/**
 * After body placement finishes, attach header/footer slots to every page.
 */
export function buildHeadersAndFooters(doc: VDTDocument): void {
  const resolved = doc.config;
  const dpi = resolved.page.dpi;
  const { contentArea } = computePageMetrics(resolved);

  const chapterTitleByPageIndex = computeChapterTitles(doc.blocks, doc.pages.length, doc.pages);
  const chapterNumberByPageIndex = computeChapterNumbers(doc.blocks, doc.pages.length, doc.pages);

  for (const page of doc.pages) {
    if (resolved.header.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'header',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
      };
      page.header = layoutSlotToVdt(
        resolved.header,
        headerContainerBbox(contentArea, page.height),
        page.index,
        placeholders,
        dpi,
      );
    }
    const opener = findOpenerHeading(page, doc);
    if (opener) {
      const level = resolved.headings.levels.find((l) => l.level === opener.level);
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
          heading: {
            titleText: opener.titleText,
            formattedNumber: opener.numberPrefix,
            chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
          },
        };
        page.openerBand = layoutSlotToVdt(
          slot,
          openerContainerBbox(opener.block, contentArea),
          page.index,
          placeholders,
          dpi,
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
        if (block.type !== 'heading' || !block.headingLevel) continue;
        const lvl = resolved.headings.levels.find((l) => l.level === block.headingLevel);
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
          heading: {
            titleText: title,
            formattedNumber: pref,
            chapterNumber: chapterNumberByPageIndex[page.index] ?? '',
          },
        };
        const overlay = layoutSlotToVdt(
          lvl.advancedDesign.slot,
          { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
          page.index,
          placeholders,
          dpi,
        );
        if (overlay) block.designOverlay = overlay;
      }
    }
    if (resolved.footer.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'footer',
        page,
        allPages: doc.pages,
        metadata: doc.metadata,
        chapterTitleByPageIndex,
      };
      page.footer = layoutSlotToVdt(
        resolved.footer,
        footerContainerBbox(contentArea, page.height),
        page.index,
        placeholders,
        dpi,
      );
    }
  }
}
