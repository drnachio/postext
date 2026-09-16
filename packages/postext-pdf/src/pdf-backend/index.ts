import {
  PDFDocument,
  BlendMode,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { HyphenationLocale, PdfColorSpace, VDTBlock, VDTDocument, VDTPage } from 'postext';
import { computePageTextExtent, dimensionToPx } from 'postext';
import { FontCache, type PdfFontProvider } from '../fontCache';
import {
  type PageCtx,
  colorFromHex,
  fillRectPx,
  makeScale,
  popClip,
  pushClipRect,
  whiteColor,
} from './primitives';
import { collectFontStrings } from './fontHelpers';
import {
  computeContentArea,
  renderBaselineGrid,
  renderColumnRule,
  renderCutLines,
} from './pageDecorations';
import { renderBlock, type ResourceRenderContext } from './blockRender';
import { renderHeaderFooterSlot } from './headerFooter';
import { addOutlines } from './outlines';
import { addPageLabels } from './pageLabels';
import {
  preloadResourceImages,
  type ResourceBytesProvider,
} from './renderResourceBlock';
import { LinkRegistry } from './links';
import { StructTree, tagArtifact, type StructElem } from './tagging';
import { StructureFlow } from './structureFlow';

export interface RenderToPdfOptions {
  fontProvider: PdfFontProvider;
  pageNegative?: boolean;
  /** Emit a PDF outline tree (bookmarks) so readers can jump between
   *  headings. Defaults to true. */
  outlines?: boolean;
  /** Force every colour in the rendered output through the given PDF colour
   *  space. Defaults to `'rgb'` (pdf-lib's native output). */
  colorSpace?: PdfColorSpace;
  /** Resolver for resource binary bytes by `fileId`. The bytes are sniffed:
   *  bitmaps embed as images, SVG markup is emitted as vector paths (or
   *  rasterised in the browser when it uses unsupported features), and a
   *  single-page PDF (`Resource.svg.pdfFileId` print masters) is embedded
   *  verbatim. When omitted, resource images are drawn as placeholders. */
  resourceBytes?: ResourceBytesProvider;
  /** Emit an accessible, tagged PDF (PDF/UA-1 oriented): logical structure
   *  tree, alt text on figures, document language and title, decoration
   *  flagged as artifacts. Defaults to true. */
  accessible?: boolean;
}

export type { PdfFontProvider };
export type { ResourceBytesProvider } from './renderResourceBlock';

/** BCP 47 tag of a postext locale (`/Lang`). */
function languageTag(locale: HyphenationLocale | undefined): string | undefined {
  if (!locale) return undefined;
  const [lang, region] = locale.split('-');
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}

/** Title of the document for the PDF metadata: the declared title, else the
 *  first heading (PDF/UA-1 §7.1 requires one). */
function documentTitle(doc: VDTDocument): string {
  const declared = doc.metadata?.title?.trim();
  if (declared) return declared;
  let best: VDTBlock | undefined;
  for (const block of doc.blocks) {
    if (block.type !== 'heading') continue;
    if (!best || (block.headingLevel ?? 1) < (best.headingLevel ?? 1)) best = block;
    if ((best.headingLevel ?? 1) === 1) break;
  }
  const text = best?.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (text) return best?.numberPrefix && !text.startsWith(best.numberPrefix) ? `${best.numberPrefix} ${text}` : text;
  return 'Document';
}

/** The heading element an opener band's text belongs to: the part title on
 *  a part-divider page, else the `span: 'page'` heading the band replaced
 *  (hidden in its column), else a plain paragraph. */
function openerTextElem(page: VDTPage, structure: StructureFlow): () => StructElem {
  let elem: StructElem | undefined;
  return () => {
    if (elem) return elem;
    if (page.partInfo) return (elem = structure.partHeading());
    for (const col of page.columns) {
      for (const block of col.blocks) {
        if (block.hidden && block.type === 'heading') return (elem = structure.blockElem(block));
      }
    }
    return (elem = structure.tree.root.child('P'));
  };
}

function renderPage(
  pdfDoc: PDFDocument,
  vdtPage: VDTPage,
  doc: VDTDocument,
  fontCache: FontCache,
  pageNegative: boolean,
  colorSpace: PdfColorSpace,
  resourceCtx: ResourceRenderContext,
  tree: StructTree | undefined,
): void {
  const scale = makeScale(doc.config.page.dpi);
  const pageWidthPt = vdtPage.width * scale;
  const pageHeightPt = vdtPage.height * scale;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  const ctx: PageCtx = { page, pageHeightPt, scale, colorSpace, tags: tree?.beginPage(page) };
  const structure = resourceCtx.structure;

  // Background: full page white first (cut-mark area stays white), then the
  // trim+bleed area filled with the configured page background colour.
  tagArtifact(ctx, { type: 'Background' });
  fillRectPx(ctx, 0, 0, vdtPage.width, vdtPage.height, whiteColor(colorSpace));

  const bgHex = doc.config.page.backgroundColor.hex;
  const trimOff = doc.trimOffset;
  if (bgHex && bgHex !== 'transparent') {
    const bleedPx = trimOff > 0
      ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
      : 0;
    fillRectPx(
      ctx,
      trimOff - bleedPx,
      trimOff - bleedPx,
      vdtPage.width - (trimOff - bleedPx) * 2,
      vdtPage.height - (trimOff - bleedPx) * 2,
      colorFromHex(bgHex, colorSpace),
    );
  }

  tagArtifact(ctx, { type: 'Layout' });
  if (doc.config.page.baselineGrid.enabled) {
    // Bound the grid to the page's actual text: from the first text line to
    // the last (mirrors the canvas backend). Pages with no text draw no grid.
    const textExtent = computePageTextExtent(vdtPage);
    if (textExtent) {
      const contentArea = computeContentArea(vdtPage, doc);
      const gridLineWidthPx = dimensionToPx(
        doc.config.page.baselineGrid.lineWidth,
        doc.config.page.dpi,
      );
      renderBaselineGrid(
        ctx,
        contentArea,
        doc.baselineGrid,
        doc.config.page.baselineGrid.color.hex,
        gridLineWidthPx,
        textExtent,
      );
    }
  }

  if (doc.config.layout.columnRule.enabled && vdtPage.columns.length > 1) {
    const crLineWidthPx = dimensionToPx(
      doc.config.layout.columnRule.lineWidth,
      doc.config.page.dpi,
    );
    renderColumnRule(
      ctx,
      vdtPage.columns,
      doc.config.layout.columnRule.color.hex,
      crLineWidthPx,
    );
  }

  // Opener / part bands go under the columns so their backgrounds sit
  // beneath the body text (mirrors the canvas backend). Their text is the
  // chapter / part heading; the rest of the band is decoration.
  if (vdtPage.openerBand) {
    renderHeaderFooterSlot(
      ctx,
      vdtPage.openerBand,
      fontCache,
      resourceCtx.images,
      structure ? { text: openerTextElem(vdtPage, structure), artifact: { type: 'Layout' } } : undefined,
    );
  }

  const clipOverhang = dimensionToPx({ value: 2, unit: 'pt' }, doc.config.page.dpi);
  for (const col of vdtPage.columns) {
    pushClipRect(
      ctx,
      col.bbox.x - clipOverhang,
      col.bbox.y,
      col.bbox.width + clipOverhang * 2,
      col.bbox.height,
    );
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) continue;
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
    }
    popClip(ctx);
    // A part row of the contents carries a design of its own, which may
    // run past the column (a band reaching beyond the page numbers): it
    // is drawn outside the column clip, like a float.
    for (const block of col.blocks) {
      if (block.tocPart && block.designOverlay) renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
    }
  }

  // Floated resources sit outside the column clip (a `span: 'page'` float can
  // cross the gutter); they carry an absolute bbox positioned at build time.
  if (vdtPage.floats) {
    for (const fb of vdtPage.floats) {
      renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, fontCache, resourceCtx);
    }
  }

  // Running headers and footers are pagination artifacts.
  const pagination = (subtype: 'Header' | 'Footer') =>
    structure ? { artifact: { type: 'Pagination' as const, subtype } } : undefined;
  if (vdtPage.header) renderHeaderFooterSlot(ctx, vdtPage.header, fontCache, resourceCtx.images, pagination('Header'));
  if (vdtPage.footer) renderHeaderFooterSlot(ctx, vdtPage.footer, fontCache, resourceCtx.images, pagination('Footer'));

  // Page negative: overlay white rect with Difference blend across trim+bleed.
  // Crop marks remain un-inverted (drawn afterwards).
  tagArtifact(ctx, { type: 'Page' });
  if (pageNegative) {
    const bleedPx = trimOff > 0
      ? dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi)
      : 0;
    const invX = trimOff - bleedPx;
    const invY = trimOff - bleedPx;
    const invW = vdtPage.width - (trimOff - bleedPx) * 2;
    const invH = vdtPage.height - (trimOff - bleedPx) * 2;
    fillRectPx(ctx, invX, invY, invW, invH, whiteColor(colorSpace), BlendMode.Difference);
  }

  renderCutLines(ctx, vdtPage, doc);
  ctx.tags?.close();
}

export async function renderToPdf(
  doc: VDTDocument,
  options: RenderToPdfOptions,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  if (doc.metadata?.title) pdfDoc.setTitle(doc.metadata.title);
  if (doc.metadata?.author) pdfDoc.setAuthor(doc.metadata.author);
  pdfDoc.setCreator('postext');
  pdfDoc.setProducer('postext-pdf');

  const fontCache = new FontCache(pdfDoc, options.fontProvider);
  await fontCache.preloadFontStrings(collectFontStrings(doc));

  const missing = fontCache.missing();
  if (missing.length > 0) {
    throw new Error(
      `postext-pdf: failed to load font(s): ${missing.join(', ')}`,
    );
  }

  const colorSpace: PdfColorSpace = options.colorSpace ?? 'rgb';

  // Accessible output: the structure tree the pages tag their content into.
  const tree = (options.accessible ?? true)
    ? new StructTree(pdfDoc, {
        title: documentTitle(doc),
        author: doc.metadata?.author,
        lang: languageTag(doc.config.bodyText.hyphenation?.locale),
        producer: 'postext-pdf',
        creatorTool: 'postext',
      })
    : undefined;

  // Resource images are embedded up front (async) so page rendering stays sync.
  const resourceImages = await preloadResourceImages(pdfDoc, doc, options.resourceBytes, fontCache, options.fontProvider);
  const resourceCtx: ResourceRenderContext = {
    images: resourceImages,
    linkRegistry: new LinkRegistry(doc.pageIndexOffset ?? 0),
    structure: tree ? new StructureFlow(tree) : undefined,
  };

  for (const page of doc.pages) {
    renderPage(pdfDoc, page, doc, fontCache, options.pageNegative ?? false, colorSpace, resourceCtx, tree);
  }

  // Attach inline-ref link annotations now that every destination is known.
  resourceCtx.linkRegistry.finalize(pdfDoc, tree);

  if (options.outlines ?? true) {
    addOutlines(pdfDoc, doc);
  }

  addPageLabels(pdfDoc, doc);

  tree?.finalize();

  return pdfDoc.save();
}
