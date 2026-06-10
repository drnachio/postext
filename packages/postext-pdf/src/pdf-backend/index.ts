import {
  PDFDocument,
  BlendMode,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PdfColorSpace, VDTDocument, VDTPage } from 'postext';
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

export interface RenderToPdfOptions {
  fontProvider: PdfFontProvider;
  pageNegative?: boolean;
  /** Emit a PDF outline tree (bookmarks) so readers can jump between
   *  headings. Defaults to true. */
  outlines?: boolean;
  /** Force every colour in the rendered output through the given PDF colour
   *  space. Defaults to `'rgb'` (pdf-lib's native output). */
  colorSpace?: PdfColorSpace;
  /** Resolver for resource binary bytes by `fileId` (bitmaps, and SVGs
   *  pre-rasterised to PNG by the host). When omitted, resource images are
   *  drawn as placeholders. */
  resourceBytes?: ResourceBytesProvider;
}

export type { PdfFontProvider };
export type { ResourceBytesProvider } from './renderResourceBlock';

function renderPage(
  pdfDoc: PDFDocument,
  vdtPage: VDTPage,
  doc: VDTDocument,
  fontCache: FontCache,
  pageNegative: boolean,
  colorSpace: PdfColorSpace,
  resourceCtx: ResourceRenderContext,
): void {
  const scale = makeScale(doc.config.page.dpi);
  const pageWidthPt = vdtPage.width * scale;
  const pageHeightPt = vdtPage.height * scale;
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
  const ctx: PageCtx = { page, pageHeightPt, scale, colorSpace };

  // Background: full page white first (cut-mark area stays white), then the
  // trim+bleed area filled with the configured page background colour.
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
      renderBlock(ctx, block, col.bbox.width, col.bbox.x, fontCache, resourceCtx);
    }
    popClip(ctx);
  }

  // Floated resources sit outside the column clip (a `span: 'page'` float can
  // cross the gutter); they carry an absolute bbox positioned at build time.
  if (vdtPage.floats) {
    for (const fb of vdtPage.floats) {
      renderBlock(ctx, fb, fb.bbox.width, fb.bbox.x, fontCache, resourceCtx);
    }
  }

  if (vdtPage.openerBand) renderHeaderFooterSlot(ctx, vdtPage.openerBand, fontCache);
  if (vdtPage.header) renderHeaderFooterSlot(ctx, vdtPage.header, fontCache);
  if (vdtPage.footer) renderHeaderFooterSlot(ctx, vdtPage.footer, fontCache);

  // Page negative: overlay white rect with Difference blend across trim+bleed.
  // Crop marks remain un-inverted (drawn afterwards).
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

  // Resource images are embedded up front (async) so page rendering stays sync.
  const resourceImages = await preloadResourceImages(pdfDoc, doc, options.resourceBytes);
  const resourceCtx: ResourceRenderContext = {
    images: resourceImages,
    linkRegistry: new LinkRegistry(),
  };

  for (const page of doc.pages) {
    renderPage(pdfDoc, page, doc, fontCache, options.pageNegative ?? false, colorSpace, resourceCtx);
  }

  // Attach inline-ref link annotations now that every destination is known.
  resourceCtx.linkRegistry.finalize(pdfDoc);

  if (options.outlines ?? true) {
    addOutlines(pdfDoc, doc);
  }

  addPageLabels(pdfDoc, doc);

  return pdfDoc.save();
}
