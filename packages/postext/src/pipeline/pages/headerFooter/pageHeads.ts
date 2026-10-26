// The head of a page: its running head, the part line a continued part
// prints and a part page's own design.
// Part of layoutHeadersAndFooters (layoutHeadersAndFooters.ts), split out of
// its loop in #1276.
import type { PageFurnitureTurn } from './pageFurnitureTurn.js';
import type { VDTDocument, ResolvedConfig } from '../../../vdt.js';
import type { PageMarks } from '../placeholders.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import { asFurniture, layoutSlotToVdt, withPath, partTitleSourceMap } from './slotLayout.js';
import { withMeasureWritingMode } from '../../../measure/vertical.js';
import { headerContainerBbox } from './primitives.js';
import { replaceTitleBreaks } from '../../../parse/inlineFormatting.js';
import { parsePartNumber } from '../../sections/parts.js';
import { synthesiseDefaultPartSlot } from './defaultSlots.js';

/** What createPageHeads takes from around the loop. */
export interface PageHeadsDeps {
  doc: VDTDocument;
  resolved: ResolvedConfig;
  dpi: number;
  chapterTitleByPageIndex: string[];
  numerals: "arab" | "arabext" | undefined;
  chapterNumberByPageIndex: string[];
  chapterTitleAtTopByPageIndex: string[];
  chapterNumberAtTopByPageIndex: string[];
  pageIndexOffset: number;
  chapterAttrsByPageIndex: Record<string, string>[];
  bookTotalPages: number;
  marksFor: (key: string) => PageMarks;
  partTitleByPageIndex: string[];
  partNumberByPageIndex: string[];
  locale: string;
  partPaletteByPageIndex: Record<string, string>[];
}

export function createPageHeads(deps: PageHeadsDeps) {
  const {
    doc, resolved, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex, partNumberByPageIndex,
    locale, partPaletteByPageIndex
  } = deps;
  /** Sets the page's running head and its part furniture. */
  const setPageHeads = (pageTurn: PageFurnitureTurn): void => {
    const {
      pageMetrics, frames, extras, sheetArea, pageAttrs, headerSlot, slotPath, headExtras, furniture
    } = pageTurn;
    if (furniture && headerSlot.elements.length > 0) {
      const placeholders: DesignPlaceholderContext = {
        kind: 'header',
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
      pageTurn.page.header = asFurniture(withMeasureWritingMode('horizontal-tb', () => layoutSlotToVdt(
        headerSlot,
        headerContainerBbox(sheetArea, pageMetrics.physical.trimBox),
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...headExtras, slot: 'header', ...withPath(slotPath('header')) },
      )));
    }
    // Back of a part divider: a blank page right after a part page takes the
    // part's verso design (the model book tints the whole leaf). The part
    // page may close the preceding chapter (`doc.afterPartPage`).
    const prevPart = pageTurn.page.index > 0
      ? doc.pages[pageTurn.page.index - 1]!.partInfo
      : doc.afterPartPage ? doc.partStart : undefined;
    if (
      !pageTurn.page.partInfo
      && !pageTurn.page.comic
      && prevPart
      && resolved.parts.versoDesign.elements.length > 0
      && pageTurn.page.columns.every((c) => c.blocks.length === 0)
    ) {
      const { number, title } = prevPart;
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        page: pageTurn.page,
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
          chapterNumber: chapterNumberByPageIndex[pageTurn.page.index] ?? '',
        },
      };
      pageTurn.page.openerBand = layoutSlotToVdt(
        resolved.parts.versoDesign,
        { x: frames.page.x, y: frames.page.y, width: frames.page.width, height: frames.page.height },
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, slot: 'part' },
      );
    }
    // Part-divider page: the opener design covers the full trim box and is
    // purely decorative (the body column already comes from `parts.margins`).
    if (pageTurn.page.partInfo) {
      const { number, title } = pageTurn.page.partInfo;
      const slot = resolved.parts.design.elements.length > 0
        ? resolved.parts.design
        : synthesiseDefaultPartSlot(resolved, pageTurn.page, frames.page, number.length > 0);
      const placeholders: DesignPlaceholderContext = {
        kind: 'part',
        page: pageTurn.page,
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
          chapterNumber: chapterNumberByPageIndex[pageTurn.page.index] ?? '',
        },
      };
      const partTitleSource = pageTurn.page.partInfo.titleSourceStart !== undefined && pageTurn.page.partInfo.titleSourceEnd !== undefined
        ? {
            start: pageTurn.page.partInfo.titleSourceStart,
            end: pageTurn.page.partInfo.titleSourceEnd,
            ...partTitleSourceMap(title, pageTurn.page.partInfo.titleSourceStart),
          }
        : undefined;
      pageTurn.page.openerBand = layoutSlotToVdt(
        slot,
        { x: frames.page.x, y: frames.page.y, width: frames.page.width, height: frames.page.height },
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, titleSource: partTitleSource, slot: 'part' },
      );
    }
  };
  return { setPageHeads };
}
