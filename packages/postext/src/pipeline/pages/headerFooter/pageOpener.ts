// A page that opens a chapter: the opener design, the headings it overlays
// and the contents parts set on it.
// Part of layoutHeadersAndFooters (layoutHeadersAndFooters.ts), split out of
// its loop in #1276.
import type { PageFurnitureTurn } from './pageFurnitureTurn.js';
import type { VDTDocument, ResolvedConfig, VDTBlock, VDTColumn, VDTPage } from '../../../vdt.js';
import type { PageMarks } from '../placeholders.js';
import { type HeadingLevelResolver, headingIsHidden } from '../../sections/headingStyles.js';
import { findOpenerHeading, markedTitleFields, openerContainerBbox, defaultOpenerTitle } from './openerTitle.js';
import { synthesiseDefaultOpenerSlot, synthesiseDefaultTocPartSlot } from './defaultSlots.js';
import type { DesignPlaceholderContext } from '../../../design/placeholders.js';
import { layoutSlotToVdt, headingTitleSource, headingLineSource } from './slotLayout.js';
import type { DesignFrames } from '../../../design/layout.js';
import { tocPartLeader } from './layoutHeadersAndFooters.js';
import { parsePartNumber } from '../../sections/parts.js';

/** What createPageOpener takes from around the loop. */
export interface PageOpenerDeps {
  doc: VDTDocument;
  resolved: ResolvedConfig;
  dpi: number;
  chapterTitleByPageIndex: string[];
  numerals: "arab" | "arabext" | undefined;
  chapterNumberByPageIndex: string[];
  chapterNumberOf: (block: VDTBlock, pageIndex: number) => string;
  pageIndexOffset: number;
  chapterAttrsByPageIndex: Record<string, string>[];
  bookTotalPages: number;
  marksFor: (key: string) => PageMarks;
  partTitleByPageIndex: string[];
  partNumberByPageIndex: string[];
  headingLevels: HeadingLevelResolver;
  locale: string;
  partPaletteByPageIndex: Record<string, string>[];
}

export function createPageOpener(deps: PageOpenerDeps) {
  const {
    doc, resolved, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex, chapterNumberOf,
    pageIndexOffset, chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex,
    partNumberByPageIndex, headingLevels, locale, partPaletteByPageIndex
  } = deps;
  /** Sets the opener design of a page that opens a chapter. */
  const setPageOpener = (pageTurn: PageFurnitureTurn): void => {
    const {
      contentArea, extras
    } = pageTurn;
    const opener = findOpenerHeading(pageTurn.page, headingLevels);
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
            titleText: opener.title.titleText,
            ...markedTitleFields(opener.title, resolved.chipStyles),
            formattedNumber: opener.numberPrefix,
            numericValue: opener.block.headingNumber,
            locale,
            chapterNumber: chapterNumberOf(opener.block, pageTurn.page.index),
            attrs: opener.block.attrs,
          },
        };
        pageTurn.page.openerBand = layoutSlotToVdt(
          slot,
          openerContainerBbox(opener.block, contentArea),
          pageTurn.page.index + pageIndexOffset,
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
        if (pageTurn.page.openerBand) {
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
          titleText: title,
          ...markedTitleFields(read, resolved.chipStyles),
          formattedNumber: pref,
          numericValue: block.headingNumber,
          locale,
          chapterNumber: chapterNumberOf(block, pageTurn.page.index),
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
        pageTurn.page.index + pageIndexOffset,
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
      const rowPage = { ...pageTurn.page, pageLabel: tp.pageLabel } as VDTPage;
      const palette = { ...(partPaletteByPageIndex[pageTurn.page.index] ?? {}), ...(tp.palette ?? {}) };
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
        partPaletteByPageIndex: doc.pages.map((_, i) => (i === pageTurn.page.index ? palette : partPaletteByPageIndex[i] ?? {})),
        heading: {
          titleText: tp.title,
          formattedNumber: tp.number,
          numericValue: parsePartNumber(tp.number),
          locale,
          chapterNumber: chapterNumberOf(block, pageTurn.page.index),
        },
      };
      const overlay = layoutSlotToVdt(
        slot,
        { x: block.bbox.x, y: block.bbox.y, width: block.bbox.width, height: block.bbox.height },
        pageTurn.page.index + pageIndexOffset,
        placeholders,
        dpi,
        { ...extras, ...(boxFrames ? { frames: boxFrames } : {}), slot: 'tocRow' },
      );
      if (overlay) block.designOverlay = overlay;
    };
    pageTurn.overlayHeading = overlayHeading;
    pageTurn.overlayTocPart = overlayTocPart;
  };
  return { setPageOpener };
}
