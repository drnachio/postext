// preloadResourceImages: every picture of the document embedded up front
// at the size of its largest placement, comic art included
// (#1276: split out of renderResourceBlock.ts).
import type { PDFDocument, PDFImage } from 'pdf-lib';
import { type VDTDocument, type VDTBlock, type VDTPage, type VDTComicArt, pageComics, type PdfColorSpace, resourceBlockIcons, resolveColorValue, applySingleInkToSvg } from 'postext';
import { FontCache, type PdfFontProvider } from '../../../fontCache.js';
import { type VectorFontResolver, svgToVectorDrawing } from '../../vector/svgVector.js';
import { needsComplexShaping, loadComplexShaper } from '../../../complexShaping.js';
import type { PrintColorMode } from '../../../print/colorMode.js';
import { embedPrintRaster, embedDeviceRaster } from '../../../print/images.js';
import { alphaStencil } from '../../vector/tint.js';
import type { ResourceBytesProvider, ResourceImageMap } from '../renderResourceBlock.js';
import { lineIcons } from './lines.js';
import { type SvgRasterizer, rasterizeSvgWithDom, sniffBytes, collectSvgFontStrings, svgCodePoints, fontResolverFor, inlineSvgFontsForRaster, RASTER_DPI, webpToPng } from './rasterize.js';

/** Largest placement of each `fileId` in points, to size raster fallbacks. */
function largestPlacements(doc: VDTDocument, blocks: VDTBlock[]): Map<string, { w: number; h: number }> {
  const scale = 72 / doc.config.page.dpi;
  const out = new Map<string, { w: number; h: number }>();
  const note = (fileId: string, wPx: number, hPx: number) => {
    const w = wPx * scale;
    const h = hPx * scale;
    const prev = out.get(fileId);
    if (!prev || w * h > prev.w * prev.h) out.set(fileId, { w, h });
  };
  for (const block of blocks) {
    const rb = block.resourceBlock;
    // A cropped picture is drawn at its uncropped size.
    if (rb?.fileId) note(rb.fileId, rb.bodyRect.width / (rb.bodySource?.width ?? 1), rb.bodyRect.height / (rb.bodySource?.height ?? 1));
    for (const cell of rb?.table?.cells ?? []) {
      if (cell.image) note(cell.image.fileId, cell.image.rect.width, cell.image.rect.height);
    }
    const overlay = block.designOverlay;
    if (overlay) {
      for (const b of overlay.blocks) if (b.kind === 'image') note(b.fileId, b.bbox.width / (b.crop?.width ?? 1), b.bbox.height / (b.crop?.height ?? 1));
    }
  }
  // Image elements of the page design slots (a logo on a title page).
  for (const page of doc.pages) {
    // A cover crop (#923) draws the whole picture larger than its box.
    for (const slot of [page.header, page.footer, page.openerBand, page.composed?.decoration]) {
      if (!slot) continue;
      for (const b of slot.blocks) if (b.kind === 'image') note(b.fileId, b.bbox.width / (b.crop?.width ?? 1), b.bbox.height / (b.crop?.height ?? 1));
    }
    // Comic panels: the whole picture is drawn at its box, which a crop
    // makes larger than the panel.
    for (const art of comicArts(page)) note(art.fileId, art.box.width, art.box.height);
  }
  return out;
}

/** The pictures of the page's comics (its comic page or half of a spread,
 *  its strips): each panel's art and pop-out cut-out. */
function comicArts(page: VDTPage): VDTComicArt[] {
  const out: VDTComicArt[] = [];
  for (const comic of pageComics(page)) {
    for (const panel of comic.panels) {
      if (panel.art) out.push(panel.art);
      if (panel.pop) out.push(panel.pop);
    }
  }
  return out;
}

/**
 * Embed every bitmap / svg / print-master resource referenced in the
 * document. Returns a map of `fileId → EmbeddedResource` consumed by
 * {@link renderResourceBlock} and the design-overlay image blocks. A missing or
 * undecodable payload is simply absent from the map and the renderer draws a
 * placeholder.
 */
export async function preloadResourceImages(
  pdfDoc: PDFDocument,
  doc: VDTDocument,
  bytesProvider: ResourceBytesProvider | undefined,
  fontCache?: FontCache,
  fontProvider?: PdfFontProvider,
  /** Map to add to (a book renders several documents into one PDF; a
   *  resource is embedded once for all of them). */
  into?: ResourceImageMap,
  /** How to rasterise an SVG outside the vector subset; the document's
   *  own `Image` by default (a worker hands the job to its host). */
  rasterizeSvg: SvgRasterizer = rasterizeSvgWithDom,
  /** A colour-managed print render: pictures are separated into CMYK
   *  through its profile (and flattened for PDF/X-1a). */
  printMode?: PrintColorMode,
  /** The device colour space a render without a print mode is forced to
   *  (#800): its pictures are written in it, as its flat colours are. */
  deviceSpace?: PdfColorSpace,
): Promise<ResourceImageMap> {
  const out: ResourceImageMap = into ?? new Map();
  if (!bytesProvider) return out;
  /** A bitmap embedded as the render wants it. */
  const embedRaster = (data: Uint8Array, format: 'png' | 'jpeg'): Promise<PDFImage> =>
    printMode
      ? embedPrintRaster(pdfDoc, data, format, printMode)
      : deviceSpace === 'grayscale' || deviceSpace === 'cmyk'
        ? embedDeviceRaster(pdfDoc, data, format, deviceSpace)
        : format === 'png' ? pdfDoc.embedPng(data) : pdfDoc.embedJpg(data);
  // Inline resources live in doc.blocks; floated resources only exist on
  // their page's float band (page.floats), so both must be walked.
  const blocks: VDTBlock[] = [...doc.blocks];
  for (const page of doc.pages) {
    if (page.floats) blocks.push(...page.floats);
  }
  const placements = largestPlacements(doc, blocks);
  // Pictures painted in a colour of their own (`VDTDesignImageBlock.tint`,
  // #995): a bitmap among them also gets the stencil of its alpha.
  const tintedIds = new Set<string>();
  for (const block of blocks) for (const b of block.designOverlay?.blocks ?? []) if (b.kind === 'image' && b.tint) tintedIds.add(b.fileId);
  // A tinted inline symbol (#1058).
  for (const block of blocks) for (const icon of resourceBlockIcons(block.resourceBlock)) if (icon.fileId && icon.color) tintedIds.add(icon.fileId);
  for (const block of blocks) for (const icon of lineIcons(block)) if (icon.fileId && icon.color) tintedIds.add(icon.fileId);
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand, page.composed?.decoration]) {
      for (const b of slot?.blocks ?? []) if (b.kind === 'image' && b.tint) tintedIds.add(b.fileId);
    }
  }
  /** A raster embedded as `fileId`, with its stencil when the picture is tinted. */
  const setImage = async (fileId: string, image: PDFImage, data: Uint8Array, format: 'png' | 'jpeg'): Promise<void> => {
    const stencil = tintedIds.has(fileId) ? await alphaStencil(pdfDoc, data, format) : null;
    out.set(fileId, { kind: 'image', image, ...(stencil ? { stencil } : {}) });
  };
  const ds = doc.config.diagramStyle;
  const inkHex = ds?.singleInk
    ? resolveColorValue(ds.inkColor, doc.config.colorPalette, ds.inkColor).hex
    : null;
  // SVGs whose raster fallback keeps its markup as it is (#630:
  // `diagramStyle.inlineFonts: false`, a resource's `svg.inlineFonts: false`).
  const inlineFonts = ds?.inlineFonts !== false;
  const keepMarkup = new Set<string>();
  for (const block of blocks) {
    const svg = block.resourceBlock?.resource?.svg;
    if (svg?.inlineFonts === false && svg.fileId) keepMarkup.add(svg.fileId);
  }
  // Vector print masters (`svg.pdfFileId`) by the SVG's own `fileId`: every
  // use of the picture names its master — the figure, a table cell, a
  // design image or box icon — so the master is embedded wherever the SVG
  // is drawn, in whichever chapter of a book draws it first. Single-ink
  // mode recolours SVG markup, which a master is not, so it keeps the SVG.
  const masters = new Map<string, string>();
  const noteMaster = (fileId: string | undefined, pdfFileId: string | undefined) => {
    if (fileId && pdfFileId && !masters.has(fileId)) masters.set(fileId, pdfFileId);
  };
  if (!inkHex) {
    for (const block of blocks) {
      const svg = block.resourceBlock?.resource?.svg;
      noteMaster(svg?.fileId, svg?.pdfFileId);
      for (const cell of block.resourceBlock?.table?.cells ?? []) noteMaster(cell.image?.fileId, cell.image?.pdfFileId);
      for (const b of block.designOverlay?.blocks ?? []) if (b.kind === 'image') noteMaster(b.fileId, b.pdfFileId);
    }
    for (const page of doc.pages) {
      for (const slot of [page.header, page.footer, page.openerBand, page.composed?.decoration]) {
        for (const b of slot?.blocks ?? []) if (b.kind === 'image') noteMaster(b.fileId, b.pdfFileId);
      }
      for (const art of comicArts(page)) noteMaster(art.fileId, art.pdfFileId);
    }
  }

  /** Embed a print master for `fileId`; false when there is none, or it
   *  does not decode (the SVG is embedded instead). */
  const embedMaster = async (fileId: string): Promise<boolean> => {
    const masterId = masters.get(fileId);
    const bytes = masterId ? bytesProvider(masterId) : undefined;
    if (!bytes || sniffBytes(bytes) !== 'pdf') return false;
    try {
      const [page] = await pdfDoc.embedPdf(bytes, [0]);
      if (!page) return false;
      out.set(fileId, { kind: 'page', page });
      return true;
    } catch {
      return false;
    }
  };

  /** Embed one payload by `fileId` (format hint from the resource when known). */
  const embed = async (fileId: string, format: string | undefined): Promise<void> => {
    if (out.has(fileId)) return;
    if (await embedMaster(fileId)) return;
    const bytes = bytesProvider(fileId);
    if (!bytes) return;
    try {
      const sniffed = sniffBytes(bytes);
      const fmt = sniffed !== 'unknown' ? sniffed : (format ?? '').toLowerCase().replace('jpg', 'jpeg');
      if (fmt === 'pdf') {
        const [page] = await pdfDoc.embedPdf(bytes, [0]);
        if (page) out.set(fileId, { kind: 'page', page });
        return;
      }
      if (fmt === 'svg') {
        let svgText = new TextDecoder().decode(bytes);
        if (inkHex) svgText = applySingleInkToSvg(svgText, inkHex);
        let fonts: VectorFontResolver | undefined;
        let wanted: string[] = [];
        if (fontCache) {
          // Text runs need their fonts embedded before the sync conversion.
          wanted = collectSvgFontStrings(svgText);
          if (wanted.length > 0) {
            const codePoints = svgCodePoints(svgText);
            await fontCache.preloadFontStrings(new Map(wanted.map((fs) => [fs, codePoints])));
          }
          fonts = fontResolverFor(fontCache);
        }
        // Right-to-left or joining text in the drawing is shaped by HarfBuzz
        // (loaded here when the document's own text did not need it).
        if (fonts && needsComplexShaping(svgText)) await loadComplexShaper();
        const drawing = svgToVectorDrawing(svgText, { fonts });
        if (drawing) {
          // Pictures inside the drawing become image XObjects.
          for (const shape of drawing.shapes) {
            if (shape.kind !== 'image') continue;
            try {
              shape.pdfImage = await embedRaster(shape.data, shape.format === 'png' ? 'png' : 'jpeg');
            } catch {
              shape.pdfImage = undefined;
            }
          }
          out.set(fileId, { kind: 'vector', drawing });
          return;
        }
        const size = placements.get(fileId) ?? { w: 360, h: 270 };
        const rasterSvg = wanted.length > 0 && fontProvider && inlineFonts && !keepMarkup.has(fileId)
          ? await inlineSvgFontsForRaster(svgText, wanted, fontProvider)
          : svgText;
        const png = await rasterizeSvg(rasterSvg, (size.w / 72) * RASTER_DPI, (size.h / 72) * RASTER_DPI);
        if (png) await setImage(fileId, await embedRaster(png, 'png'), png, 'png');
        return;
      }
      let image: PDFImage | null = null;
      let data = bytes;
      let dataFormat: 'png' | 'jpeg' = 'png';
      if (fmt === 'jpeg') {
        image = await embedRaster(bytes, 'jpeg');
        dataFormat = 'jpeg';
      } else if (fmt === 'webp') {
        const png = await webpToPng(bytes);
        if (png) {
          image = await embedRaster(png, 'png');
          data = png;
        }
      } else {
        // png / gif-first-frame / unknown all go through embedPng.
        image = await embedRaster(bytes, 'png');
      }
      if (image) await setImage(fileId, image, data, dataFormat);
    } catch (err) {
      // Undecodable — leave absent; renderer falls back to a placeholder.
      if (typeof process !== 'undefined' && process.env?.POSTEXT_SVG_DEBUG) console.warn('embed failed:', fileId, (err as Error).message);
    }
  };
  for (const block of blocks) {
    const rb = block.resourceBlock;
    if (rb && rb.fileId && (rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video')) {
      await embed(rb.fileId, rb.format);
    }
    // Images embedded in table cells draw through the same map.
    for (const cell of rb?.table?.cells ?? []) {
      if (cell.image) await embed(cell.image.fileId, cell.image.format);
    }
    // The pictures of inline symbols in its caption, notes, labels and
    // cells (#1058).
    for (const icon of resourceBlockIcons(rb)) if (icon.fileId) await embed(icon.fileId, icon.svg ? 'svg' : icon.format);
    // And of its own lines: an exercise's activity icons (#1226).
    for (const icon of lineIcons(block)) if (icon.fileId) await embed(icon.fileId, icon.svg ? 'svg' : icon.format);
    // Callout icons and markers (`kind: 'resource'`) draw through the same map.
    const iconFileId = block.callout?.iconFileId;
    if (iconFileId) await embed(iconFileId, block.callout?.iconFormat);
    const markerFileId = block.callout?.markerFileId;
    if (markerFileId) await embed(markerFileId, block.callout?.markerFormat);
    // Pictures of a box's decoration (a label icon) draw through the map too.
    for (const b of block.designOverlay?.blocks ?? []) {
      if (b.kind === 'image') await embed(b.fileId, undefined);
    }
  }
  // Image elements of the page design slots (a logo on a title page, the
  // chapter motif in a running head, a part page's pictures, the pictures
  // of a composed page's decoration).
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand, page.composed?.decoration]) {
      if (!slot) continue;
      for (const b of slot.blocks) if (b.kind === 'image') await embed(b.fileId, undefined);
    }
    // The pictures of a comic page's panels.
    for (const art of comicArts(page)) await embed(art.fileId, art.format);
  }
  return out;
}
