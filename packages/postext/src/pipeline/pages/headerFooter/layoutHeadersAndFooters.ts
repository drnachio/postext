// layoutHeadersAndFooters: every page's header, footer, opener, part and
// contents designs laid out once body placement is done (#1276: split out of headerFooter.ts).
import { resolvedComics } from '../../../defaults/comics.js';
import { setMeasureWritingMode } from '../../../measure/vertical.js';
import { computeChapterTitles, computeChapterNumbers, computeChapterTitlesAtTop, computeChapterNumbersAtTop, computeChapterNumbersByBlock, computeChapterAttrs, type PageMarks, computePageMarks, markSourceOf, computePartValues } from '../placeholders.js';
import { applyPartPalettesToFlow } from '../../sections/partPalette.js';
import { recolorLineNumbers } from '../../text/lineNumbers.js';
import type { Resource, PageRole, DesignSlot, ResolvedDesignSlot } from '../../../types.js';
import { type ResolvedConfig, type VDTDocument, type VDTBlock, type VDTPage, pageIsVertical, pageIsMirrored, flowRectToPage } from '../../../vdt.js';
import { parsePartPalette } from '../../sections/parts.js';
import { computePageMetrics, sheetRectToFlow, composedLeafConfig, onComposedLeaf } from '../../blocks/buildHelpers.js';
import { resolvedLocale, arabicNumbersOf } from '../../config.js';
import { classifyPages } from '../pageRoles.js';
import { createHeadingLevelResolver, computeSectionStyles } from '../../sections/headingStyles.js';
import { resolveDesignSlot } from '../../../defaults/structure/headerFooter.js';
import { resolvePageTemplate } from '../../../composed/templates.js';
import { type PageFurniture } from '../../../composed/furniture.js';
import type { DesignFrames } from '../../../design/layout.js';
import type { DesignLeader } from '../../../design/placeholders.js';
import { type HeaderFooterInputs, withComposedHeadings, pageFurnitureByDoc, pagesWithPartMarks, stampPageBackgrounds } from './pass.js';
import { type SlotLayoutExtras } from './slotLayout.js';
import type { PageFurnitureTurn } from './pageFurnitureTurn.js';
import { createPageHeads } from './pageHeads.js';
import { createPageOpener } from './pageOpener.js';
import { createPageFooter } from './pageFooter.js';
import { createPageDecoration } from './pageDecoration.js';

/** The leader a contents part row's `{leader}` draws (#889): the contents'
 *  character, gap and switch, and the face of `toc.parts.leader` field by
 *  field over `toc.leader`'s (#1121); a field neither sets keeps the text
 *  element's own. */
export function tocPartLeader(toc: ResolvedConfig['toc']): DesignLeader {
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

  const { setPageHeads } = createPageHeads({
    doc, resolved, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex, partNumberByPageIndex,
    locale, partPaletteByPageIndex
  });
  const { setPageOpener } = createPageOpener({
    doc, resolved, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex, chapterNumberOf,
    pageIndexOffset, chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex,
    partNumberByPageIndex, headingLevels, locale, partPaletteByPageIndex
  });
  const { setPageFooter } = createPageFooter({
    doc, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, furnitureRecords, bookTotalPages, marksFor, partTitleByPageIndex,
    partNumberByPageIndex, partPaletteByPageIndex
  });
  const { setPageDecoration } = createPageDecoration({
    doc, dpi, chapterTitleByPageIndex, numerals, chapterNumberByPageIndex,
    chapterTitleAtTopByPageIndex, chapterNumberAtTopByPageIndex, pageIndexOffset,
    chapterAttrsByPageIndex, bookTotalPages, marksFor, partTitleByPageIndex, partNumberByPageIndex,
    partPaletteByPageIndex, spreadDecorated
  });

  for (const page of doc.pages) {
    const pageTurn = { page } as PageFurnitureTurn;
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
    pageTurn.pageMetrics = pageMetrics;
    pageTurn.frames = frames;
    pageTurn.extras = extras;
    pageTurn.sheetArea = sheetArea;
    pageTurn.pageAttrs = pageAttrs;
    pageTurn.headerSlot = headerSlot;
    pageTurn.slotPath = slotPath;
    pageTurn.headExtras = headExtras;
    pageTurn.furniture = furniture;
    setPageHeads(pageTurn);
    pageTurn.contentArea = contentArea;
    setPageOpener(pageTurn);
    pageTurn.recto = recto;
    pageTurn.template = template;
    pageTurn.footerSlot = footerSlot;
    setPageFooter(pageTurn);
    pageTurn.physicalFrames = physicalFrames;
    pageTurn.sheetExtras = sheetExtras;
    setPageDecoration(pageTurn);
  }
}
