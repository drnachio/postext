import type { DocumentMetadata } from '../types';
import type {
  ResolvedHeaderFooterSlot,
  ResolvedHeaderFooterElement,
  ResolvedHeaderFooterTextElement,
  ResolvedHeaderFooterRuleElement,
  PageParity,
  HeaderFooterHAlign,
} from '../types';
import {
  createBoundingBox,
  type VDTDocument,
  type VDTPage,
  type VDTHeaderFooterSlot,
  type VDTHeaderFooterBlock,
  type VDTHeaderFooterTextBlock,
  type VDTRuleBlock,
} from '../vdt';
import { dimensionToPx } from '../units';
import { buildFontString, measureTextWidth } from '../measure';
import { computeChapterTitles, resolvePlaceholders, type PlaceholderContext } from './placeholders';
import { computePageMetrics } from './buildHelpers';

function pageMatchesParity(pageIndex: number, parity: PageParity): boolean {
  if (parity === 'all') return true;
  // Convention: use page-number parity (page 1 = odd).
  const pageNumber = pageIndex + 1;
  const isOdd = pageNumber % 2 === 1;
  return parity === 'odd' ? isOdd : !isOdd;
}

function elementHeightPx(el: ResolvedHeaderFooterElement, dpi: number): number {
  if (el.kind === 'text') {
    const fontSizePx = dimensionToPx(el.fontSize, dpi);
    // Approximate line height as 1.2 × font size.
    return fontSizePx * 1.2;
  }
  return dimensionToPx(el.thickness, dpi);
}

function filterElementsByParity(
  slot: ResolvedHeaderFooterSlot,
  pageIndex: number,
): ResolvedHeaderFooterElement[] {
  return slot.elements.filter((el) => pageMatchesParity(pageIndex, el.parity));
}

function xForAlign(
  align: HeaderFooterHAlign,
  contentX: number,
  contentWidth: number,
  elementWidth: number,
  edgeInsetPx: number,
): number {
  if (align === 'left') return contentX + edgeInsetPx;
  if (align === 'right') return contentX + contentWidth - elementWidth - edgeInsetPx;
  return contentX + (contentWidth - elementWidth) / 2;
}

function buildTextBlock(
  el: ResolvedHeaderFooterTextElement,
  resolvedText: string,
  contentX: number,
  contentWidth: number,
  elementTop: number,
  dpi: number,
): VDTHeaderFooterTextBlock {
  const fontSizePx = dimensionToPx(el.fontSize, dpi);
  const weight = el.fontWeight === 400 ? 'normal' : String(el.fontWeight);
  const style = el.italic ? 'italic' : 'normal';
  const fontString = buildFontString(el.fontFamily, fontSizePx, weight, style);
  const textWidth = measureTextWidth(resolvedText, fontString);
  const blockHeight = fontSizePx * 1.2;
  const edgeInsetPx = dimensionToPx(el.marginFromEdge, dpi);
  const x = xForAlign(el.align, contentX, contentWidth, textWidth, edgeInsetPx);
  // Baseline at ~0.8 of the block height, matching body text convention.
  const baseline = elementTop + blockHeight * 0.8;
  return {
    kind: 'text',
    bbox: createBoundingBox(x, elementTop, textWidth, blockHeight),
    text: resolvedText,
    align: el.align,
    fontString,
    color: el.color.hex,
    baseline,
  };
}

function buildRuleBlock(
  el: ResolvedHeaderFooterRuleElement,
  contentX: number,
  contentWidth: number,
  elementTop: number,
  dpi: number,
): VDTRuleBlock {
  const thicknessPx = dimensionToPx(el.thickness, dpi);
  const widthPx = el.width === 'full' ? contentWidth : dimensionToPx(el.width, dpi);
  // `marginFromEdge` only meaningful for non-full rules — a full-width rule
  // already spans the content, so the inset would just crop it asymmetrically.
  const edgeInsetPx = el.width === 'full' ? 0 : dimensionToPx(el.marginFromEdge, dpi);
  const x = xForAlign(el.align, contentX, contentWidth, widthPx, edgeInsetPx);
  return {
    kind: 'rule',
    bbox: createBoundingBox(x, elementTop, widthPx, thicknessPx),
    color: el.color.hex,
    thicknessPx,
  };
}

/**
 * Layout elements for one slot on one page.
 *
 * Each element's `marginFromBody` is an absolute distance between its
 * body-facing edge and the body edge — elements are independent and never
 * push each other. Two elements with the same `marginFromBody` will overlap;
 * that's on the author to avoid.
 */
function layoutSlot(
  slot: ResolvedHeaderFooterSlot,
  pageIndex: number,
  contentX: number,
  contentWidth: number,
  anchor: 'bottom' | 'top',
  anchorY: number,
  metadata: DocumentMetadata,
  allPages: VDTPage[],
  chapterTitleByPageIndex: string[],
  dpi: number,
): VDTHeaderFooterSlot | undefined {
  const elements = filterElementsByParity(slot, pageIndex);
  if (elements.length === 0) return undefined;

  const page = allPages[pageIndex]!;
  const ctx: PlaceholderContext = {
    page,
    allPages,
    metadata,
    chapterTitleByPageIndex,
  };

  const blocks: VDTHeaderFooterBlock[] = [];
  let minY = anchorY;
  let maxBottom = anchorY;

  for (const el of elements) {
    const height = elementHeightPx(el, dpi);
    const marginPx = dimensionToPx(el.marginFromBody, dpi);
    // For a header (anchor='bottom' at body top): element's bottom edge sits
    // `marginPx` above the body. For a footer (anchor='top' at body bottom):
    // element's top edge sits `marginPx` below the body.
    const elementTop = anchor === 'bottom' ? anchorY - marginPx - height : anchorY + marginPx;
    if (el.kind === 'text') {
      const { text } = resolvePlaceholders(el.content, ctx);
      if (text.length > 0) {
        blocks.push(buildTextBlock(el, text, contentX, contentWidth, elementTop, dpi));
      }
    } else {
      blocks.push(buildRuleBlock(el, contentX, contentWidth, elementTop, dpi));
    }
    minY = Math.min(minY, elementTop);
    maxBottom = Math.max(maxBottom, elementTop + height);
  }
  if (blocks.length === 0) return undefined;
  const slotBbox = createBoundingBox(contentX, minY, contentWidth, maxBottom - minY);
  return { bbox: slotBbox, blocks };
}

/**
 * After body placement finishes, attach header/footer slots (with their
 * rendered text/rule blocks) to every page of the document.
 *
 * Headers and footers are rendered inside the existing page margins — they
 * do not consume body space. Header elements stack upward from the body's
 * top edge; footer elements stack downward from the body's bottom edge.
 */
export function buildHeadersAndFooters(doc: VDTDocument): void {
  const resolved = doc.config;
  const dpi = resolved.page.dpi;
  const { contentArea } = computePageMetrics(resolved);

  const chapterTitleByPageIndex = computeChapterTitles(doc.blocks, doc.pages.length);

  for (const page of doc.pages) {
    if (resolved.header.elements.length > 0) {
      page.header = layoutSlot(
        resolved.header,
        page.index,
        contentArea.x,
        contentArea.width,
        'bottom',
        contentArea.y,
        doc.metadata,
        doc.pages,
        chapterTitleByPageIndex,
        dpi,
      );
    }
    if (resolved.footer.elements.length > 0) {
      page.footer = layoutSlot(
        resolved.footer,
        page.index,
        contentArea.x,
        contentArea.width,
        'top',
        contentArea.y + contentArea.height,
        doc.metadata,
        doc.pages,
        chapterTitleByPageIndex,
        dpi,
      );
    }
  }
}
