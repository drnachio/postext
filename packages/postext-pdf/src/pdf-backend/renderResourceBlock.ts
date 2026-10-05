/**
 * PDF rendering of resource blocks (issue #49 §7).
 *
 * Draws an embedded `Resource` (bitmap / svg / table) plus its caption into a
 * pdf-lib page. Image payloads live out-of-band (IndexedDB in the sandbox); the
 * host supplies their raw bytes via {@link RenderToPdfOptions.resourceBytes},
 * which {@link preloadResourceImages} embeds into the document up front (PDF
 * embedding is async; page rendering is sync).
 *
 * The bytes are sniffed, so the host never has to say what it hands over:
 *   - `%PDF`  → the first page is embedded as a form XObject and drawn
 *               verbatim (vector print masters: an SVG's
 *               `Resource.svg.pdfFileId`, named on every use of the SVG in
 *               the VDT, is asked for first, outside single-ink mode);
 *   - SVG     → single-ink recolouring when `diagramStyle.singleInk` is on,
 *               then vector emission through {@link svgToVectorDrawing}, with
 *               `text` set in fonts loaded through the document's
 *               {@link FontCache} (same provider as the body text); SVGs
 *               outside the supported subset are rasterised (browser only) at
 *               {@link RASTER_DPI} for their largest placement;
 *   - PNG / JPEG / WebP / GIF → `embedPng` / `embedJpg` (WebP is decoded to
 *               PNG via a canvas first; browser only).
 * A missing or undecodable payload leaves the map entry absent and the
 * renderer draws a neutral placeholder.
 *
 * Inline `:ref` segments render in the link colour and, via {@link LinkRegistry},
 * become clickable link annotations targeting the resource embed's destination.
 */

import { PDFHexString, type Color, type PDFImage, type PDFDocument, type PDFEmbeddedPage, type PDFFont } from 'pdf-lib';
import type {
  VDTBlock,
  VDTLine,
  VDTDocument,
  ResolvedResourceBlock,
  VDTResourceTableCell,
  VDTResourceVideo,
} from 'postext';
import { applySingleInkToSvg, playMarkTriangle, qrModuleRuns, resolveColorValue, tableCellFillRects, tableFrameOutline, uncroppedPictureBox } from 'postext';
import { roundedRectSvgPath } from './headerFooter';
import { pdfUri } from './links';
import { parseFontString } from '../fontString';
import { FontCache, type PdfFontProvider } from '../fontCache';
import { widthOfTextAtSize } from '../faceFiles';
import {
  type PageCtx,
  type PdfMatrix,
  beginActualTextSpan,
  cjkLineText,
  compressedMarkSpacingPx,
  drawTextPx,
  setTrackingPx,
  endActualTextSpan,
  type LineTextState,
  drawLinePx,
  drawSwatchPx,
  fillRectPx,
  fillRectsPx,
  colorFromHex,
  outerRectMap,
  popFrame,
  pushFrame,
  quarterTurnMatrix,
  pushClipOutline,
  pushClipRect,
  popClip,
  strokeOutlinePx,
  counterFlipPx,
} from './primitives';
import { LinkRegistry, RefRun, refTarget, UriRuns } from './links';
import { paintChip } from './chip';
import { paintKunten, paintLineMarks, paintRuby, paintWarichu } from './annotations';
import { tagArtifact, tagContent, type StructAttrs, type StructElem } from './tagging';
import type { StructureFlow } from './structureFlow';
import {
  svgToVectorDrawing,
  drawVectorDrawing,
  type VectorDrawing,
  type VectorFont,
  type VectorFontResolver,
} from './svgVector';
import { inkScaleOperators } from './inkScale';
import { drawShapedTextPx, drawStyledWordPx } from './shapedText';
import { segmentLanguages, segmentOffsets, wordParts } from './directedLine';
import { loadComplexShaper, needsComplexShaping } from '../complexShaping';

/** Raw bytes of a resource binary, keyed by `fileId`. */
export type ResourceBytesProvider = (fileId: string) => Uint8Array | undefined;

/** One embedded resource payload, ready to draw on any page. */
export type EmbeddedResource =
  | { kind: 'image'; image: PDFImage }
  | { kind: 'page'; page: PDFEmbeddedPage }
  | { kind: 'vector'; drawing: VectorDrawing };

/** Embedded resources keyed by `fileId`, shared across pages. */
export type ResourceImageMap = Map<string, EmbeddedResource>;

/** Resolution of the raster fallback for SVGs the vector path cannot emit,
 *  relative to the figure's largest placement on the page. Diagrams are line
 *  art with small type, so this sits above the 300 dpi photographs need. */
export const RASTER_DPI = 600;

type Sniffed = 'pdf' | 'svg' | 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown';

/** Identify a payload from its leading bytes. */
export function sniffBytes(bytes: Uint8Array): Sniffed {
  const at = (i: number) => bytes[i] ?? -1;
  if (at(0) === 0x25 && at(1) === 0x50 && at(2) === 0x44 && at(3) === 0x46) return 'pdf'; // %PDF
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return 'png';
  if (at(0) === 0xff && at(1) === 0xd8) return 'jpeg';
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return 'gif';
  if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46
    && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return 'webp';
  // SVG: optional BOM / whitespace, then `<` (XML declaration, comment,
  // doctype or the root element itself).
  let i = 0;
  if (at(0) === 0xef && at(1) === 0xbb && at(2) === 0xbf) i = 3;
  while (i < bytes.length && (at(i) === 0x20 || at(i) === 0x09 || at(i) === 0x0a || at(i) === 0x0d)) i++;
  if (at(i) === 0x3c) {
    const head = new TextDecoder().decode(bytes.subarray(i, Math.min(bytes.length, i + 4096)));
    if (/<svg[\s>]/i.test(head) || /^<\?xml/i.test(head) || head.startsWith('<!')) return 'svg';
  }
  return 'unknown';
}

/** A PNG of `bitmap`, drawn on whatever canvas the environment has (a
 *  worker has `OffscreenCanvas`, a document has both). */
async function bitmapToPng(bitmap: ImageBitmap): Promise<Uint8Array | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(bitmap, 0, 0);
    const pngBlob = await canvas.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await pngBlob.arrayBuffer());
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const c2d = canvas.getContext('2d');
  if (!c2d) return null;
  c2d.drawImage(bitmap, 0, 0);
  const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  if (!pngBlob) return null;
  return new Uint8Array(await pngBlob.arrayBuffer());
}

/** Decode WebP bytes to PNG bytes via a canvas. Browser (or worker) only. */
async function webpToPng(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof createImageBitmap === 'undefined') return null;
  try {
    const blob = new Blob([bytes as BlobPart], { type: 'image/webp' });
    return await bitmapToPng(await createImageBitmap(blob));
  } catch {
    return null;
  }
}

/** Rasterises SVG markup to PNG bytes at a pixel size; null when it cannot. */
export type SvgRasterizer = (svgText: string, widthPx: number, heightPx: number) => Promise<Uint8Array | null>;

/** Rasterise SVG markup to PNG bytes at the given pixel size, through an
 *  `Image` and a canvas of the document. Browser main thread only (a
 *  worker cannot decode SVG); returns null elsewhere or when the SVG does
 *  not decode. The default {@link SvgRasterizer}. */
export async function rasterizeSvgWithDom(svgText: string, widthPx: number, heightPx: number): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Image === 'undefined') return null;
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('SVG decode failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(widthPx));
    canvas.height = Math.max(1, Math.round(heightPx));
    const c2d = canvas.getContext('2d');
    if (!c2d) return null;
    c2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pngBlob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Generic CSS families that never name a loadable font. */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial',
]);

/** A canvas font string for one family / weight / style (size is irrelevant
 *  to the cache key). */
function svgFontString(family: string, weight: number, italic: boolean): string {
  return `${italic ? 'italic ' : ''}${weight} 16px ${family}`;
}

/** The character of a numeric reference; nothing for one out of range. */
function charOf(cp: number): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
}

/** The characters an SVG's text may set: those of its markup outside tags,
 *  entities decoded — more than its text nodes (a `<style>` sheet counts
 *  too), which only asks a sliced face for a file more. */
function svgCodePoints(svgText: string): Set<number> {
  const text = svgText
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => charOf(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => charOf(parseInt(dec, 10)))
    .replace(/&(lt|gt|amp|quot|apos);/g, (_, name: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[name] ?? '');
  const out = new Set<number>();
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp > 0x20) out.add(cp);
  }
  out.add(0x20);
  return out;
}

/** Fonts an SVG's text would need, as font strings the {@link FontCache}
 *  can preload: every named (non-generic) family of each run, so the
 *  resolver can fall through the `font-family` list in order. */
function collectSvgFontStrings(svgText: string): string[] {
  const wanted = new Set<string>();
  const probe: VectorFontResolver = (families, weight, italic) => {
    for (const f of families) if (!GENERIC_FAMILIES.has(f.toLowerCase())) wanted.add(svgFontString(f, weight, italic));
    return { widthOf: () => 0, pdfFont: null };
  };
  svgToVectorDrawing(svgText, { fonts: probe, probe: true });
  return [...wanted];
}

/** Resolve SVG font requests against the preloaded cache: the first named
 *  family of the list that loaded wins; generic families never match. */
function fontResolverFor(fontCache: FontCache): VectorFontResolver {
  const fonts = new Map<PDFFont, VectorFont>();
  return (families, weight, italic) => {
    for (const f of families) {
      if (GENERIC_FAMILIES.has(f.toLowerCase())) continue;
      const pdfFont = fontCache.get(svgFontString(f, weight, italic));
      if (!pdfFont) continue;
      let vf = fonts.get(pdfFont);
      if (!vf) {
        vf = { pdfFont, widthOf: (text, size) => widthOfTextAtSize(pdfFont, text, size) };
        fonts.set(pdfFont, vf);
      }
      return vf;
    }
    return null;
  };
}

const FONT_MIME: Record<string, string> = { ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2', woff: 'font/woff' };

function sniffFontFormat(bytes: Uint8Array): string {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === 'OTTO') return 'otf';
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  return 'ttf';
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
}

/** Before an SVG with text is rasterised through an `<img>` — which cannot
 *  see any page font — embed the faces its runs ask for as `@font-face` data
 *  URIs, fetched from the same provider the body text uses. Families the
 *  provider cannot supply are skipped (the image falls back to a system
 *  face, as the screen preview would). */
export async function inlineSvgFontsForRaster(
  svgText: string,
  fontStrings: string[],
  provider: PdfFontProvider,
): Promise<string> {
  let css = '';
  const codePoints = svgCodePoints(svgText);
  for (const fs of fontStrings) {
    const parsed = parseFontString(fs);
    if (!parsed) continue;
    const answer = await provider(parsed.family, parsed.weight, parsed.style, { codePoints }).catch(() => null);
    // A face of several files is one @font-face per file: the browser
    // looks each character up in them in turn.
    for (const bytes of Array.isArray(answer) ? answer : answer ? [answer] : []) {
      if (bytes.length === 0) continue;
      const format = sniffFontFormat(bytes);
      css += `@font-face{font-family:"${parsed.family.replace(/["\\]/g, '')}";font-weight:${parsed.weight};font-style:${parsed.style};src:url(data:${FONT_MIME[format]};base64,${toBase64(bytes)})}`;
    }
  }
  if (!css) return svgText;
  const m = /<svg\b[^>]*?>/i.exec(svgText);
  if (!m || m[0].endsWith('/>')) return svgText;
  const at = m.index + m[0].length;
  return `${svgText.slice(0, at)}<style type="text/css"><![CDATA[${css}]]></style>${svgText.slice(at)}`;
}

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
      for (const b of overlay.blocks) if (b.kind === 'image') note(b.fileId, b.bbox.width, b.bbox.height);
    }
  }
  // Image elements of the page design slots (a logo on a title page).
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand]) {
      if (!slot) continue;
      for (const b of slot.blocks) if (b.kind === 'image') note(b.fileId, b.bbox.width, b.bbox.height);
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
): Promise<ResourceImageMap> {
  const out: ResourceImageMap = into ?? new Map();
  if (!bytesProvider) return out;
  // Inline resources live in doc.blocks; floated resources only exist on
  // their page's float band (page.floats), so both must be walked.
  const blocks: VDTBlock[] = [...doc.blocks];
  for (const page of doc.pages) {
    if (page.floats) blocks.push(...page.floats);
  }
  const placements = largestPlacements(doc, blocks);
  const ds = doc.config.diagramStyle;
  const inkHex = ds?.singleInk
    ? resolveColorValue(ds.inkColor, doc.config.colorPalette, ds.inkColor).hex
    : null;
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
      for (const slot of [page.header, page.footer, page.openerBand]) {
        for (const b of slot?.blocks ?? []) if (b.kind === 'image') noteMaster(b.fileId, b.pdfFileId);
      }
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
              shape.pdfImage = shape.format === 'png' ? await pdfDoc.embedPng(shape.data) : await pdfDoc.embedJpg(shape.data);
            } catch {
              shape.pdfImage = undefined;
            }
          }
          out.set(fileId, { kind: 'vector', drawing });
          return;
        }
        const size = placements.get(fileId) ?? { w: 360, h: 270 };
        const rasterSvg = wanted.length > 0 && fontProvider
          ? await inlineSvgFontsForRaster(svgText, wanted, fontProvider)
          : svgText;
        const png = await rasterizeSvg(rasterSvg, (size.w / 72) * RASTER_DPI, (size.h / 72) * RASTER_DPI);
        if (png) out.set(fileId, { kind: 'image', image: await pdfDoc.embedPng(png) });
        return;
      }
      let image: PDFImage | null = null;
      if (fmt === 'jpeg') {
        image = await pdfDoc.embedJpg(bytes);
      } else if (fmt === 'webp') {
        const png = await webpToPng(bytes);
        if (png) image = await pdfDoc.embedPng(png);
      } else {
        // png / gif-first-frame / unknown all go through embedPng.
        image = await pdfDoc.embedPng(bytes);
      }
      if (image) out.set(fileId, { kind: 'image', image });
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
  // chapter motif in a running head, a part page's pictures).
  for (const page of doc.pages) {
    for (const slot of [page.header, page.footer, page.openerBand]) {
      if (!slot) continue;
      for (const b of slot.blocks) if (b.kind === 'image') await embed(b.fileId, undefined);
    }
  }
  return out;
}

/** Draw an embedded resource fitted to a box in document pixels (top-down). */
export function drawEmbeddedResource(
  ctx: PageCtx,
  res: EmbeddedResource,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const box = {
    x: xPx * scale,
    y: pageHeightPt - (yPx + hPx) * scale,
    width: wPx * scale,
    height: hPx * scale,
  };
  // A picture on a mirrored page reads unmirrored in its box.
  counterFlipPx(ctx, xPx, wPx, () => {
    if (res.kind === 'image') ctx.page.drawImage(res.image, box);
    else if (res.kind === 'page') ctx.page.drawPage(res.page, box);
    else drawVectorDrawing(ctx, res.drawing, xPx, yPx, wPx, hPx);
  });
}

function pickFont(
  bold: boolean,
  italic: boolean,
  fonts: { normal: string; bold: string; italic: string; boldItalic: string },
): string {
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.normal;
}

interface PaintFonts {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

/** Paint one absolutely-positioned rich-text line; records ref link rects.
 *  In a tagged render the text joins `elem` (refs get a `Link` child) and
 *  word spaces are painted as real glyphs; without `elem` the line joins
 *  whatever sequence is open (an artifact for repeated table headers). */
/** A caption, note or cell line. A tracked line (a table header set with
 *  `headerLetterSpacing`) was measured with the tracking in its widths, so
 *  it is painted with the matching character spacing (`Tc`, in points at
 *  the page scale), reset afterwards. Ruby readings, warichu rows and the
 *  marks of the line are painted as on a body line (#429): a reading in
 *  the `RT` of a `Ruby` whose `RB` is its base, the marks as artifacts. */
function paintLine(
  ctx: PageCtx,
  line: VDTLine,
  fonts: PaintFonts,
  fontCache: FontCache,
  color: Color,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  resolveRefId: ((seg: { refResourceId?: string; refAnchor?: true }) => string | undefined),
  labelColor: Color = color,
  elem?: StructElem,
): void {
  const tracking = line.letterSpacing ?? 0;
  if (tracking !== 0) setTrackingPx(ctx, tracking);
  paintLineRuns(ctx, line, fonts, fontCache, color, linkColor, linkRegistry, resolveRefId, labelColor, elem, tracking);
  if (tracking !== 0) setTrackingPx(ctx, 0);
  if (line.marks) paintLineMarks(ctx, line, color);
}

function paintLineRuns(
  ctx: PageCtx,
  line: VDTLine,
  fonts: PaintFonts,
  fontCache: FontCache,
  color: Color,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  resolveRefId: ((seg: { refResourceId?: string; refAnchor?: true }) => string | undefined),
  labelColor: Color,
  elem: StructElem | undefined,
  tracking = 0,
): void {
  const baseFont = fontCache.get(fonts.normal);
  if (!baseFont) return;
  const baseSize = parseFontString(fonts.normal)?.sizePx ?? 0;
  if (line.segments && line.segments.length > 0) {
    const segs = line.segments;
    const refRun = new RefRun();
    let x = line.bbox.x;
    const uris = new UriRuns(ctx, line, linkRegistry, elem);
    // Only a line of the CJK composer carries its fields (a segment's
    // tracking, ink offset and scale); any other is painted as every line
    // was before them (see `renderSegments` in blockRender.ts).
    const composed = line.cjkComposed === true || ctx.vertical !== undefined;
    // A composed CJK line reads as written, not with its gaps.
    const actualLine = composed ? cjkLineText(segs) : undefined;
    let lineState: LineTextState | undefined;
    if (actualLine !== undefined) {
      const first = segs.find((s) => s.kind === 'text' && !s.chip && s.text !== '');
      const fontStr = first ? first.fontString ?? pickFont(!!first.bold, !!first.italic, fonts) : fonts.normal;
      lineState = {
        font: fontCache.get(fontStr) ?? baseFont,
        text: first?.text ?? '',
        sizePx: parseFontString(fontStr)?.sizePx ?? baseSize,
        xPx: line.bbox.x,
        baselinePx: line.baseline,
      };
      beginActualTextSpan(ctx, actualLine, lineState);
    }
    // A line with right-to-left runs is laid out in `order` and painted
    // in logical order, each right-to-left segment shaped as one run (see
    // `renderSegments` in blockRender.ts).
    const directed = line.order !== undefined || segs.some((s) => s.rtl);
    const order = directed && line.order?.length === segs.length ? line.order : undefined;
    const xs = order ? segmentOffsets(segs, order, line.bbox.x, (s) => s.width) : undefined;
    const langs = elem && directed ? segmentLanguages(segs, elem.tree.options.lang) : undefined;
    let langSpan: { lang: string; elem: StructElem } | undefined;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (xs) x = xs[i]!;
      const lang = langs?.[i];
      if (lang && langSpan?.lang !== lang) langSpan = { lang, elem: elem!.child('Span', { lang }) };
      else if (!lang) langSpan = undefined;
      const textElem = langSpan?.elem ?? elem;
      if (seg.kind === 'space') {
        const inLink = uris.space(seg.text);
        if (ctx.tags && seg.text) {
          tagContent(ctx, inLink ?? textElem);
          drawTextPx(ctx, seg.text, x, line.baseline, baseFont, baseSize, color);
        }
        x += seg.width;
        continue;
      }
      if (seg.kind !== 'text' || seg.chip) uris.other();
      if (seg.kind === 'swatch') {
        tagContent(ctx, elem);
        drawSwatchPx(ctx, x, line.baseline, seg.width, seg.swatch?.color, color);
        x += seg.width;
        continue;
      }
      if (seg.chip) {
        const chipColor = seg.chip.color ? colorFromHex(seg.chip.color, ctx.colorSpace) : color;
        paintChip(ctx, seg.chip, x, line.baseline, fontCache, baseFont, baseSize, elem, () => chipColor);
        x += seg.width;
        continue;
      }
      if (composed && seg.warichu) {
        // A warichu note's part: its two rows, not its text (#195), with
        // no character spacing.
        if (tracking !== 0) setTrackingPx(ctx, 0);
        paintWarichu(ctx, seg.warichu, x, line.baseline, color, fontCache, baseFont, textElem);
        if (tracking !== 0) setTrackingPx(ctx, tracking);
        x += seg.width;
        continue;
      }
      const fontStr = seg.fontString ?? pickFont(!!seg.bold, !!seg.italic, fonts);
      const font = fontCache.get(fontStr) ?? baseFont;
      const size = parseFontString(fontStr)?.sizePx ?? baseSize;
      const refId = resolveRefId(seg);
      const segColor = refId !== undefined ? linkColor : seg.captionLabel ? labelColor : color;
      // A `:ref` links to its resource — a ref painted as several runs
      // (small capitals) is one link —, a Markdown link's words to its URL.
      const uriElem = uris.word(refId === undefined ? seg.href : undefined, x, seg.width, seg.text);
      const link = refId !== undefined ? refRun.enter(seg, x, textElem, refId, seg.width) : undefined;
      // A ruby base is the `RB` of a `Ruby` whose `RT` holds its reading.
      const holder = link ?? uriElem ?? textElem;
      const rubyElem = composed && seg.ruby && holder ? holder.child('Ruby') : undefined;
      tagContent(ctx, rubyElem ? rubyElem.child('RB') : holder);
      const baseline = line.baseline + (seg.baselineShift ?? 0);
      const direction = seg.rtl ? 'rtl' : 'ltr';
      if (seg.runs && drawStyledWordPx(ctx, seg.text, x, baseline, font, size, segColor, wordParts(seg, font, segColor, ctx, (bold, italic) => ({ font: fontCache.get(pickFont(bold, italic, fonts)) ?? undefined, color: segColor })), { direction })) {
        // A word set in several styles, shaped whole.
      } else if (directed && (seg.rtl || needsComplexShaping(seg.text)) && drawShapedTextPx(ctx, seg.text, x, baseline, font, size, segColor, { direction })) {
        // One run in its direction, shaped by HarfBuzz.
      } else if (!composed) {
        drawTextPx(ctx, seg.text, x, baseline, font, size, segColor);
      } else {
        // A justified CJK line spreads its characters per segment.
        // A compressed CJK mark advances to its box's end (see blockRender).
        const markSpacing = compressedMarkSpacingPx(font, seg, size);
        if (markSpacing !== undefined) setTrackingPx(ctx, markSpacing);
        else if (seg.tracking !== undefined) setTrackingPx(ctx, (tracking + seg.tracking));
        const stretch = inkScaleOperators(seg.inkScale);
        ctx.page.pushOperators(...stretch.before);
        drawTextPx(ctx, seg.text, x + (seg.inkOffset ?? 0), line.baseline + (seg.baselineShift ?? 0), font, size, segColor);
        ctx.page.pushOperators(...stretch.after);
        if (markSpacing !== undefined || seg.tracking !== undefined) setTrackingPx(ctx, tracking);
        if (seg.ruby) {
          if (tracking !== 0) setTrackingPx(ctx, 0);
          paintRuby(ctx, seg.ruby, x, line.baseline, segColor, fontCache, baseFont, rubyElem);
          if (tracking !== 0) setTrackingPx(ctx, tracking);
        }
        if (seg.kunten) {
          // Kanbun marks (#430), with the character's text.
          if (tracking !== 0) setTrackingPx(ctx, 0);
          paintKunten(ctx, seg.kunten, x, line.baseline, segColor, fontCache, baseFont, holder);
          if (tracking !== 0) setTrackingPx(ctx, tracking);
        }
      }
      const ref = refId !== undefined ? refRun.leave(seg, segs[i + 1], refId) : undefined;
      if (ref && linkRegistry) {
        const { scale, pageHeightPt } = ctx;
        const x1 = ref.left * scale;
        const y2 = pageHeightPt - (line.bbox.y) * scale;
        const y1 = pageHeightPt - (line.bbox.y + line.bbox.height) * scale;
        const x2 = Math.max(ref.right, x + seg.width) * scale;
        const rect: [number, number, number, number] = [x1, y1, x2, y2];
        linkRegistry.addLink(ctx.page, ctx.mapRectPt ? ctx.mapRectPt(rect) : rect, ref.resourceId, link ? { elem: link, contents: ref.text } : undefined);
      }
      x += seg.width;
    }
    uris.end();
    if (lineState) endActualTextSpan(ctx, lineState);
    return;
  }
  tagContent(ctx, elem);
  drawTextPx(ctx, line.text, line.bbox.x, line.baseline, baseFont, baseSize, color);
}

/** Layout attributes of a figure: its bounding box on the page (PDF user
 *  space, bottom-up) and block placement. */
export function figureLayout(ctx: PageCtx, xPx: number, yPx: number, wPx: number, hPx: number): StructAttrs['attributes'] {
  const { scale, pageHeightPt } = ctx;
  const rect: [number, number, number, number] = [
    xPx * scale,
    pageHeightPt - (yPx + hPx) * scale,
    (xPx + wPx) * scale,
    pageHeightPt - yPx * scale,
  ];
  const bbox = ctx.page.doc.context.obj(ctx.mapRectPt ? ctx.mapRectPt(rect) : rect);
  return [{ owner: 'Layout', entries: { BBox: bbox, Placement: 'Block' } }];
}

/** Plain text of a resource caption, for figure alt text fallbacks. */
function captionText(rb: ResolvedResourceBlock): string {
  return rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
}

/** Alt text of a figure: the resource's `altText`, else its caption, else
 *  its label (`Figure 1.2`) — PDF/UA-1 §7.3 requires one on every figure.
 *  A video's text says what the picture is, in its type's name (`Video: …`):
 *  the reader hears a poster that links to a video, not a still. */
function figureAlt(rb: ResolvedResourceBlock): string {
  const label = `${rb.captionPrefix} ${rb.number}`.trim();
  const text = rb.resource.altText?.trim() || captionText(rb);
  if (rb.kind !== 'video') return text || label;
  const name = rb.captionPrefix.trim() || 'Video';
  // A Chinese or Japanese name takes the full-width colon (视频：…).
  const colon = /[\u3040-\u30ff\u3400-\u9fff]$/.test(name) ? '：' : ': ';
  return text ? `${name}${colon}${text}` : label || name;
}

/** Rows whose every cell is a header cell: the column-header rows, which
 *  a continuation slice repeats and an accessible render then flags as
 *  artifacts (the reader already met them on the first slice). */
function headerRows(cells: VDTResourceTableCell[]): Set<number> {
  const rows = new Map<number, boolean>();
  for (const cell of cells) rows.set(cell.row, (rows.get(cell.row) ?? true) && cell.isHeader);
  const out = new Set<number>();
  for (const [row, allHeader] of rows) if (allHeader) out.add(row);
  return out;
}

/** Build the `TR` › `TH` / `TD` elements of a table slice: one element per
 *  cell in row / column order, with span and scope attributes. Cells of
 *  repeated header rows on a continuation slice get no element. */
function tableCellElems(
  table: StructElem,
  cells: VDTResourceTableCell[],
  continued: boolean,
): Map<VDTResourceTableCell, StructElem> {
  const out = new Map<VDTResourceTableCell, StructElem>();
  const heads = headerRows(cells);
  const ordered = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  let row: StructElem | undefined;
  let rowIndex = -1;
  for (const cell of ordered) {
    if (continued && heads.has(cell.row)) continue;
    if (cell.row !== rowIndex) {
      rowIndex = cell.row;
      row = table.child('TR');
    }
    const entries: Record<string, number | string> = {};
    if (cell.colSpan > 1) entries.ColSpan = cell.colSpan;
    if (cell.rowSpan > 1) entries.RowSpan = cell.rowSpan;
    if (cell.isHeader) entries.Scope = heads.has(cell.row) ? 'Column' : 'Row';
    const attrs: StructAttrs = Object.keys(entries).length > 0
      ? { attributes: [{ owner: 'Table', entries }] }
      : {};
    out.set(cell, row!.child(cell.isHeader ? 'TH' : 'TD', attrs));
  }
  return out;
}

function renderTable(
  ctx: PageCtx,
  rb: ResolvedResourceBlock,
  bx: number,
  by: number,
  fontCache: FontCache,
  images: ResourceImageMap,
  linkColor: Color,
  linkRegistry: LinkRegistry | undefined,
  tableElem: StructElem | undefined,
): void {
  const t = rb.table;
  if (!t) return;
  // Cell grid, fills and rules are layout; the reader gets the cell text.
  tagArtifact(ctx, { type: 'Layout' });
  const cellElems = tableElem ? tableCellElems(tableElem, t.cells, !!rb.slice?.continued) : undefined;
  const borderColor = colorFromHex(t.borderColor, ctx.colorSpace);
  const bodyColor = colorFromHex(t.color, ctx.colorSpace);
  const headerColor = colorFromHex(t.headerColor, ctx.colorSpace);
  const bodyFonts: PaintFonts = {
    normal: t.fontString,
    bold: t.boldFontString,
    italic: t.italicFontString,
    boldItalic: t.boldItalicFontString,
  };
  const headerFonts: PaintFonts = {
    normal: t.headerFontString,
    bold: t.headerBoldFontString,
    italic: t.headerItalicFontString,
    boldItalic: t.headerBoldItalicFontString,
  };

  // A rounded frame clips the fills to the frame line and the inner rules
  // to its outer contour, then is stroked round on top.
  const rounded = t.frameRadii !== undefined;
  const outline = (outset: number) => tableFrameOutline(t, bx, by, rb.bodyRect.width, outset);
  const clipTo = (outset: number) => {
    pushClipOutline(ctx, outline(outset));
    tagArtifact(ctx, { type: 'Layout' });
  };
  const unclip = () => {
    popClip(ctx);
    tagArtifact(ctx, { type: 'Layout' });
  };
  // Cell backgrounds (the cell's own fill, else the header tint / the body
  // or zebra fill). Each opaque fill runs across the edges it shares with
  // the cells painted after it, in the same fill operation, so a viewer
  // shows no seam between two cells (see `tableCellFillRects`).
  if (rounded) clipTo(0);
  for (const { fill, rects } of tableCellFillRects(t)) {
    fillRectsPx(ctx, rects, colorFromHex(fill, ctx.colorSpace));
  }
  if (rounded) unclip();
  // Borders: the full cell grid, horizontal rules only, or the outer frame.
  // `drawLinePx` strokes exactly `borderWidthPx` (scaled to pt), so fractional
  // hairlines such as 0.5pt survive.
  if (t.borderWidthPx > 0) {
    const rules = t.rules ?? 'grid';
    const bw = t.borderWidthPx;
    if (rules === 'outer') {
      if (!rounded) {
        const tableHeight = t.rowEdges[t.rowEdges.length - 1] ?? rb.bodyRect.height;
        const x = bx, y = by, width = rb.bodyRect.width, height = tableHeight;
        drawLinePx(ctx, x, y, x + width, y, borderColor, bw);
        drawLinePx(ctx, x, y + height, x + width, y + height, borderColor, bw);
        drawLinePx(ctx, x, y, x, y + height, borderColor, bw);
        drawLinePx(ctx, x + width, y, x + width, y + height, borderColor, bw);
      }
    } else {
      if (rounded) clipTo(bw / 2);
      for (const cell of t.cells) {
        const { x, y, width, height } = cell.rect;
        drawLinePx(ctx, x, y, x + width, y, borderColor, bw);
        drawLinePx(ctx, x, y + height, x + width, y + height, borderColor, bw);
        if (rules === 'grid') {
          drawLinePx(ctx, x, y, x, y + height, borderColor, bw);
          drawLinePx(ctx, x + width, y, x + width, y + height, borderColor, bw);
        }
      }
      if (rounded) unclip();
    }
    if (rounded && (rules === 'grid' || rules === 'outer')) strokeOutlinePx(ctx, outline(0), borderColor, bw);
  }
  // Cell images (bitmap / SVG resources embedded in cells), then text.
  for (const cell of t.cells) {
    const img = cell.image;
    if (!img) continue;
    const { x, y, width, height } = img.rect;
    const cellElem = cellElems?.get(cell);
    if (cellElems) {
      if (cellElem) {
        tagContent(ctx, cellElem.child('Figure', {
          alt: img.altText?.trim() || img.resourceId,
          attributes: figureLayout(ctx, x, y, width, height),
        }));
      } else {
        tagArtifact(ctx, { type: 'Layout' });
      }
    }
    const embedded = images.get(img.fileId);
    if (embedded) drawEmbeddedResource(ctx, embedded, x, y, width, height);
    else {
      ctx.onMissingImage?.(img.fileId, img.resourceId);
      fillRectPx(ctx, x, y, width, height, colorFromHex('#eeeeee', ctx.colorSpace));
    }
  }
  // Cell content.
  for (const cell of t.cells) {
    const fonts = cell.isHeader ? headerFonts : bodyFonts;
    const color = cell.isHeader ? headerColor : bodyColor;
    const cellElem = cellElems?.get(cell);
    if (cellElems && !cellElem) tagArtifact(ctx, { type: 'Layout' });
    for (const line of cell.lines) {
      paintLine(ctx, line, fonts, fontCache, color, linkColor, linkRegistry, refTarget, color, cellElem);
    }
  }
}

function drawPlaceholder(ctx: PageCtx, rb: ResolvedResourceBlock, x: number, y: number): void {
  // A video with no poster: a dark frame its overlays read on (#454).
  const fill = colorFromHex(rb.kind === 'video' ? '#1f1f1f' : '#eeeeee', ctx.colorSpace);
  fillRectPx(ctx, x, y, rb.bodyRect.width, rb.bodyRect.height, fill);
}

/** The play mark and the QR code of a video's poster (#454) as vectors,
 *  over the body at (`bx`, `by`) px. On a mirrored page they are turned
 *  back about the body, so they sit where they are printed in the other
 *  outputs and the code reads. */
function drawVideoOverlays(ctx: PageCtx, video: VDTResourceVideo, bx: number, by: number, bw: number): void {
  if (!video.playMark && !video.qr) return;
  const { scale, pageHeightPt } = ctx;
  // `drawSvgPath` reads its path top-down from this origin, in points.
  const origin = { x: 0, y: pageHeightPt };
  const pt = (v: number): string => String(Math.round(v * scale * 1000) / 1000);
  const alpha = (a: number) => (a < 1 ? { opacity: a, borderOpacity: a } : {});
  counterFlipPx(ctx, bx, bw, () => {
    const mark = video.playMark;
    if (mark) {
      const { x, y, width: w, height: h } = mark.rect;
      const ox = bx + x;
      const oy = by + y;
      const tri = playMarkTriangle(mark)
        .map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${pt(ox + px)} ${pt(oy + py)}`)
        .join(' ') + ' Z';
      const color = colorFromHex(mark.color, ctx.colorSpace);
      const background = colorFromHex(mark.background, ctx.colorSpace);
      if (mark.shape === 'triangle') {
        ctx.page.drawSvgPath(tri, {
          ...origin, color, borderColor: background, borderWidth: h * 0.08 * scale,
          ...(mark.backgroundOpacity < 1 ? { borderOpacity: mark.backgroundOpacity } : {}),
        });
      } else {
        if (mark.shape === 'circle') {
          ctx.page.drawEllipse({
            x: (ox + w / 2) * scale, y: pageHeightPt - (oy + h / 2) * scale,
            xScale: (w / 2) * scale, yScale: (h / 2) * scale,
            color: background, ...alpha(mark.backgroundOpacity),
          });
        } else {
          ctx.page.drawSvgPath(roundedRectSvgPath(ctx, ox, oy, w, h, h * 0.24), { ...origin, color: background, ...alpha(mark.backgroundOpacity) });
        }
        ctx.page.drawSvgPath(tri, { ...origin, color });
      }
    }
    const qr = video.qr;
    if (qr) {
      const { x, y, width: w, height: h } = qr.rect;
      const ox = bx + x;
      const oy = by + y;
      const background = colorFromHex(qr.background, ctx.colorSpace);
      if (qr.radius > 0) ctx.page.drawSvgPath(roundedRectSvgPath(ctx, ox, oy, w, h, qr.radius), { ...origin, color: background });
      else fillRectPx(ctx, ox, oy, w, h, background);
      // One path for every dark module: no seams between them.
      const d = qrModuleRuns(qr)
        .map((r) => `M ${pt(ox + r.x)} ${pt(oy + r.y)} h ${pt(r.w)} v ${pt(r.h)} h ${pt(-r.w)} Z`)
        .join(' ');
      if (d) ctx.page.drawSvgPath(d, { ...origin, color: colorFromHex(qr.color, ctx.colorSpace) });
    }
  });
}

export function renderResourceBlock(
  ctx: PageCtx,
  block: VDTBlock,
  fontCache: FontCache,
  images: ResourceImageMap,
  linkRegistry: LinkRegistry | undefined,
  structure?: StructureFlow,
): void {
  const rb = block.resourceBlock;
  if (!rb) return;
  const { scale, pageHeightPt } = ctx;
  // A rotated block: its geometry is in the upright frame. A quarter-turn
  // matrix lands that frame on the page — set up so the `*Px` helpers, which
  // flip y against the page height, keep working unchanged inside it — and
  // the rects that live outside the content stream (link annotations,
  // structure bounding boxes) go through the same matrix.
  const rot = rb.rotation;
  let matrix: PdfMatrix | undefined;
  // A turned block's text is horizontal in its own frame: an upright
  // figure on a vertical page sets its caption and cells across.
  const outerVertical = rot ? ctx.vertical : undefined;
  if (rot) {
    matrix = quarterTurnMatrix(rot, scale, pageHeightPt);
    // Inside a vertical page's frame the block's rects go through both.
    pushFrame(ctx, matrix);
    delete ctx.vertical;
  }
  const bx = (rot ? 0 : block.bbox.x) + rb.bodyRect.x;
  const by = (rot ? 0 : block.bbox.y) + rb.bodyRect.y;
  const bw = rb.bodyRect.width;
  const bh = rb.bodyRect.height;
  const linkColor = colorFromHex(rb.linkColor, ctx.colorSpace);
  const continued = !!rb.slice?.continued;

  // Structure: a `Figure` (alt text required) or a `Table` (its alt text as
  // the summary), shared by the slices of a split table.
  let owner: StructElem | undefined;
  if (structure) {
    if (rb.kind === 'table') {
      const alt = rb.resource.altText?.trim();
      owner = structure.resourceElem(block, 'Table', alt
        ? { attributes: [{ owner: 'Table', entries: { Summary: PDFHexString.fromText(alt) } }] }
        : {});
    } else {
      owner = structure.resourceElem(block, 'Figure', {
        alt: figureAlt(rb),
        attributes: figureLayout(ctx, bx, by, bw, bh),
      });
    }
  }

  if (rb.kind === 'bitmap' || rb.kind === 'svg' || rb.kind === 'video') {
    const embedded = rb.fileId ? images.get(rb.fileId) : undefined;
    const src = rb.bodySource;
    if (embedded && src) {
      // A picture cropped within its safe area (#442): the whole picture at
      // its uncropped box, clipped to the body (the figure's content opened
      // inside the clip, which closes marked content); on a mirrored page
      // the box is reflected about the body, as the picture is turned back
      // in it.
      let full = uncroppedPictureBox(bx, by, bw, bh, src);
      if (ctx.mirror) full = { ...full, x: 2 * bx + bw - full.x - full.width };
      pushClipRect(ctx, bx, by, bw, bh);
      tagContent(ctx, owner);
      drawEmbeddedResource(ctx, embedded, full.x, full.y, full.width, full.height);
      popClip(ctx);
      tagArtifact(ctx, { type: 'Layout' });
    } else if (embedded) {
      tagContent(ctx, owner);
      drawEmbeddedResource(ctx, embedded, bx, by, bw, bh);
    } else {
      tagContent(ctx, owner);
      if (rb.fileId) ctx.onMissingImage?.(rb.fileId, rb.resource.id);
      drawPlaceholder(ctx, rb, bx, by);
    }
    const video = rb.video;
    if (video) {
      tagContent(ctx, owner);
      drawVideoOverlays(ctx, video, bx, by, bw);
      // The poster opens the video (#454).
      const uri = video.linkPoster && video.link ? pdfUri(video.link) : undefined;
      if (uri && linkRegistry) {
        const rect: [number, number, number, number] = [bx * scale, pageHeightPt - (by + bh) * scale, (bx + bw) * scale, pageHeightPt - by * scale];
        const box = ctx.mapRectPt ? ctx.mapRectPt(rect) : rect;
        const elem = owner?.child('Link');
        linkRegistry.addUriLink(ctx.page, box, uri, elem ? { elem, contents: `${figureAlt(rb)} (${video.link})` } : undefined);
      }
    }
  } else if (rb.kind === 'table') {
    renderTable(ctx, rb, bx, by, fontCache, images, linkColor, linkRegistry, owner);
  }

  // Named destination for inline refs: top-left of the placed block (the
  // first slice of a split table; continuations are not targets).
  if (linkRegistry && rb.resource.id && !rb.slice?.continued) {
    // On the sheet: the block's box is in the page's frame, which a vertical
    // page turns (not the block's own turned frame).
    const pageMap = rot ? outerRectMap(ctx) : ctx.mapRectPt;
    const box: [number, number, number, number] = [
      block.bbox.x * scale, pageHeightPt - (block.bbox.y + block.bbox.height) * scale,
      (block.bbox.x + block.bbox.width) * scale, pageHeightPt - block.bbox.y * scale,
    ];
    const [left, , , top] = pageMap ? pageMap(box) : box;
    linkRegistry.addDestination(rb.resource.id, ctx.page, left, top);
  }

  // Caption bar (behind the caption lines).
  if (rb.captionBar) {
    tagArtifact(ctx, { type: 'Layout' });
    const { rect, background } = rb.captionBar;
    fillRectPx(ctx, rect.x, rect.y, rect.width, rect.height, colorFromHex(background, ctx.colorSpace));
  }

  // Caption — the first slice's is the `Caption` of the figure / table; the
  // repeated (continued) caption of a later slice is an artifact.
  const captionColor = colorFromHex(rb.captionColor, ctx.colorSpace);
  const captionLabelColor = colorFromHex(rb.captionLabelColor, ctx.colorSpace);
  const captionFonts: PaintFonts = {
    normal: rb.captionFontString,
    bold: rb.captionBoldFontString,
    italic: rb.captionItalicFontString,
    boldItalic: rb.captionBoldItalicFontString,
  };
  if (structure && rb.captionLines.length > 0 && continued) tagArtifact(ctx, { type: 'Layout' });
  const captionElem = structure && owner && rb.captionLines.length > 0 && !continued
    ? structure.captionElem(owner)
    : undefined;
  for (const line of rb.captionLines) {
    paintLine(ctx, line, captionFonts, fontCache, captionColor, linkColor, linkRegistry, refTarget, captionLabelColor, captionElem);
  }

  // Note.
  const noteColor = colorFromHex(rb.noteColor, ctx.colorSpace);
  const noteFonts: PaintFonts = {
    normal: rb.noteFontString,
    bold: rb.noteBoldFontString,
    italic: rb.noteItalicFontString,
    boldItalic: rb.noteBoldItalicFontString,
  };
  const noteElem = structure && rb.noteLines.length > 0 ? structure.noteElem(block) : undefined;
  for (const line of rb.noteLines) {
    paintLine(ctx, line, noteFonts, fontCache, noteColor, linkColor, linkRegistry, refTarget, noteColor, noteElem);
  }
  // The "continued" marker of a table slice that goes on is a layout cue.
  if (rb.continuesLines && rb.continuesLines.length > 0) {
    tagArtifact(ctx, { type: 'Layout' });
    for (const line of rb.continuesLines) {
      paintLine(ctx, line, noteFonts, fontCache, noteColor, linkColor, linkRegistry, (seg) => seg.refResourceId);
    }
  }
  if (matrix) {
    popFrame(ctx);
    if (outerVertical) ctx.vertical = outerVertical;
  }
}
