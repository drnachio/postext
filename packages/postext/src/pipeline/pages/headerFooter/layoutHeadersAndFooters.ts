// layoutHeadersAndFooters: every page's header, footer, opener, part and
// contents designs laid out once body placement is done (#1276: split out of headerFooter.ts).
import { resolvedComics } from '../../../defaults/comics.js';
import { setMeasureWritingMode, withMeasureWritingMode } from '../../../measure/vertical.js';
import { computeChapterTitles, computeChapterNumbers, computeChapterTitlesAtTop, computeChapterNumbersAtTop, computeChapterNumbersByBlock, computeChapterAttrs, type PageMarks, computePageMarks, markSourceOf, computePartValues } from '../placeholders.js';
import { applyPartPalettesToFlow } from '../../sections/partPalette.js';
import { recolorLineNumbers } from '../../text/lineNumbers.js';
import { replaceTitleBreaks } from '../../../parse/inlineFormatting.js';
import type { Resource, PageRole, DesignSlot, ResolvedDesignSlot } from '../../../types.js';
import { type ResolvedConfig, type VDTDocument, type VDTBlock, type VDTPage, pageIsVertical, pageIsMirrored, flowRectToPage, type VDTColumn, type VDTDesignRuleBlock } from '../../../vdt.js';
import { parsePartPalette, parsePartNumber } from '../../sections/parts.js';
import { computePageMetrics, sheetRectToFlow, composedLeafConfig, onComposedLeaf } from '../../blocks/buildHelpers.js';
import { resolvedLocale, arabicNumbersOf } from '../../config.js';
import { classifyPages } from '../pageRoles.js';
import { createHeadingLevelResolver, computeSectionStyles, headingIsHidden } from '../../sections/headingStyles.js';
import { resolveDesignSlot } from '../../../defaults/structure/headerFooter.js';
import { resolvePageTemplate, repeatInstance } from '../../../composed/templates.js';
import { splitSpreadDecoration } from '../../../composed/spread.js';
import { frameOfBlock, framePageRect } from '../../../composed/paint.js';
import { figureAnchorPointOnPage } from '../../../composed/labels.js';
import { type PageFurniture, expectedFurniture } from '../../../composed/furniture.js';
import type { DesignFrames } from '../../../design/layout.js';
import type { DesignLeader, DesignPlaceholderContext } from '../../../design/placeholders.js';
import { withDigits } from '../../../numerals/arabicNumerals.js';
import { synthesiseDefaultPartSlot, synthesiseDefaultOpenerSlot, synthesiseDefaultTocPartSlot } from './defaultSlots.js';
import { findOpenerHeading, markedTitleFields, openerContainerBbox, defaultOpenerTitle } from './openerTitle.js';
import { type HeaderFooterInputs, withComposedHeadings, pageFurnitureByDoc, pagesWithPartMarks, stampPageBackgrounds, framesInFrame, withoutAnchoredTo, connectorAnchorWarnings } from './pass.js';
import { headerContainerBbox, footerContainerBbox } from './primitives.js';
import { type SlotLayoutExtras, asFurniture, layoutSlotToVdt, withPath, partTitleSourceMap, headingTitleSource, headingLineSource, decorationFurniture, moduleDecoration } from './slotLayout.js';

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

export function layoutHeadersAndFooters(doc: VDTDocument, resourceById: ReadonlyMap<string, Resource> | undefined, inputs: HeaderFooterInputs): void {
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
