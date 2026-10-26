// The foot of a page: block overlays, the running foot and a composed
// page's template slots.
// Part of layoutHeadersAndFooters (layoutHeadersAndFooters.ts), split out of
// its loop in #1276.
import type { PageFurnitureTurn } from './pageFurnitureTurn.js';
import type { VDTDocument } from '../../../vdt.js';
import { type PageFurniture, expectedFurniture } from '../../../composed/furniture.js';
import type { PageMarks } from '../placeholders.js';
import { frameOfBlock } from '../../../composed/paint.js';
import { framesInFrame } from './pass.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import { asFurniture, layoutSlotToVdt, withPath, decorationFurniture } from './slotLayout.js';
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import { footerContainerBbox } from './primitives.js';
import type { PageRole } from '../../../types.js';

/** What createPageFooter takes from around the loop. */
export interface PageFooterDeps {
  doc: VDTDocument;
  dpi: number;
  chapterTitleByPageIndex: string[];
  numerals: "arab" | "arabext" | undefined;
  chapterNumberByPageIndex: string[];
  chapterTitleAtTopByPageIndex: string[];
  chapterNumberAtTopByPageIndex: string[];
  pageIndexOffset: number;
  chapterAttrsByPageIndex: Record<string, string>[];
  furnitureRecords: PageFurniture[];
  bookTotalPages: number;
  marksFor: (key: string) => PageMarks;
  partTitleByPageIndex: string[];
  partNumberByPageIndex: string[];
  partPaletteByPageIndex: Record<string, string>[];
}

export function createPageFooter(deps: PageFooterDeps) {
  const {
    doc, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, furnitureRecords, bookTotalPages, marksFor, partTitleByPageIndex,
    partNumberByPageIndex, partPaletteByPageIndex
  } = deps;
  /** Sets the page's running foot. */
  const setPageFooter = (pageTurn: PageFurnitureTurn): void => {
    const {
      pageMetrics, extras, sheetArea, recto, template, pageAttrs, headerSlot, footerSlot, slotPath,
      headExtras, furniture, overlayHeading, overlayTocPart
    } = pageTurn;
    for (const col of pageTurn.page.columns) {
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
    const composed = pageTurn.page.composed;
    for (const block of pageTurn.page.floats ?? []) {
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
        page: pageTurn.page,
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
      pageTurn.page.footer = asFurniture(withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        footerSlot,
        footerContainerBbox(sheetArea, pageMetrics.physical.trimBox),
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...headExtras, slot: 'footer', ...withPath(slotPath('footer')) },
      )));
    }
    // What the page's running heads and decoration mean to draw on it, for
    // `folioMissing` (#1163). A spread's decoration is laid on its sheet of
    // two pages, so only its running heads are compared.
    if (pageTurn.page.composed && template) {
      const role = (pageTurn.page.composed.role as PageRole | undefined) ?? pageTurn.page.role;
      const at = pageTurn.page.index + pageIndexOffset;
      const expected = [
        ...(furniture ? expectedFurniture(headerSlot.elements, 'header', at, role, pageAttrs) : []),
        ...(furniture ? expectedFurniture(footerSlot.elements, 'footer', at, role, pageAttrs) : []),
        ...(pageTurn.page.composed.spread === undefined && template.decoration.elements.some((el) => el.kind === 'text')
          ? decorationFurniture(template, pageTurn.page, at, role, pageAttrs)
          : []),
      ];
      furnitureRecords.push({ pageIndex: pageTurn.page.index, template: pageTurn.page.composed.template, side: recto ? 'recto' : 'verso', expected });
    }
  };
  return { setPageFooter };
}
