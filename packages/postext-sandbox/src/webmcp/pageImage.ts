// A laid-out page as a picture an agent can look at: the same painter the
// Canvas viewer uses, on a canvas of its own, so any page of any chapter
// is at hand whatever tab is on screen. What the page shows of the
// configuration (baseline grid, crop marks, the character grid) is in the
// picture; the viewer's own overlays (caret, selection) are not.

import {
  dimensionToPx,
  preflightDocument,
  renderPageToCanvas,
  resolveColorValue,
  resolveDebugConfig,
  resolveDiagramStyleConfig,
  resolvePrintConfig,
} from 'postext';
import type { BoundingBox, PostextConfig, PrintPreview, Resource, VDTDocument, VDTPage } from 'postext';
import { declareStandIns, ensureConfigFontsLoaded, loadVerticalTwins } from '../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { preflightInputs } from '../print/preflightInputs.js';
import { loadPrintProfile, previewFor, printTransform } from '../print/printSetup.js';

/** Pixels the supersampled page may take before it is scaled down. */
const MAX_PAINT_PIXELS = 24_000_000;

export interface PageImageOptions {
  /** Width of the picture, in pixels. */
  width: number;
  format: 'jpeg' | 'png' | 'webp';
  /** 0–1, for JPEG and WebP. */
  quality: number;
  /** A part of the page: x, y, width and height as fractions of it. */
  crop?: { x: number; y: number; width: number; height: number };
  /** Leave out the cut-line margin (bleed, crop marks) of a layout that
   *  has one. */
  trimmed?: boolean;
  /** The soft proof and guides of the print preview. */
  printPreview?: PrintPreview;
}

export interface PageImage {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  /** Pictures of the page that could not be read: placeholders stand in. */
  missingImages: number;
}

/** Everything the painter reads from the page itself, in place: the faces
 *  the book sets its text in and the pictures it places. Without them a
 *  page paints in fallback faces, with placeholders. */
export async function preparePainting(config: PostextConfig, markdown: string | string[], resources: Resource[]): Promise<void> {
  const diagram = resolveDiagramStyleConfig(config.diagramStyle);
  const ink = diagram.singleInk ? resolveColorValue(diagram.inkColor, config.colorPalette, diagram.inkColor).hex : null;
  await Promise.all([
    ensureConfigFontsLoaded(config, markdown).catch(() => undefined),
    loadVerticalTwins(config, markdown).catch(() => false),
    declareStandIns(config, markdown).catch(() => false),
    ensureResourceImages(resources, ink, { inlineFonts: config.diagramStyle?.inlineFonts !== false }).catch(() => false),
  ]);
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
}

/** The print preview a page is painted with, as the Canvas viewer builds
 *  it: the output profile's proof on the paper's white, the trim, bleed
 *  and safe-zone guides, and the marks of what preflight found on `doc`. */
export async function printPreviewFor(config: PostextConfig, resources: readonly Resource[], doc: VDTDocument): Promise<PrintPreview | undefined> {
  const print = resolvePrintConfig(config.print);
  const loaded = await loadPrintProfile(print);
  const transform = printTransform(loaded.profile, print);
  const dpi = (config.page?.dpi as number | undefined) ?? 300;
  const base = previewFor({ print, loaded, transform }, dpi, true);
  if (!base) return undefined;
  const { imageSize } = preflightInputs(config.print, resources);
  const byPage = new Map<number, BoundingBox[]>();
  const offset = doc.pageIndexOffset ?? 0;
  for (const issue of preflightDocument(doc, { print, transform, resources: [...resources], imageSize, cmyk: true })) {
    if (!issue.rect) continue;
    const list = byPage.get(issue.pageIndex - offset) ?? [];
    list.push(issue.rect);
    byPage.set(issue.pageIndex - offset, list);
  }
  return {
    ...base,
    guides: { safeZonePx: dimensionToPx(print.preflight.safeZone, dpi) },
    marksFor: (pageIndex) => byPage.get(pageIndex) ?? [],
  };
}

const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/** Paint `page` of `doc` into a picture `width` pixels wide (or its
 *  `crop`, that wide). Painted larger and scaled down, so small type keeps
 *  its shape. Call {@link preparePainting} first. */
export function pageImage(page: VDTPage, doc: VDTDocument, options: PageImageOptions): PageImage {
  const crop = options.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const trim = !!options.trimmed && doc.trimOffset > 0;
  const inset = trim ? doc.trimOffset : 0;
  const pageW = page.width - 2 * inset;
  const pageH = page.height - 2 * inset;
  // Twice the pixels the picture needs, as far as the canvas may grow.
  const wanted = (options.width * 2) / (pageW * crop.width);
  const scale = Math.min(wanted, Math.sqrt(MAX_PAINT_PIXELS / (pageW * pageH)));
  const negative = resolveDebugConfig((doc.config as PostextConfig).debug).pageNegative.enabled;
  const big = document.createElement('canvas');
  let missingImages = 0;
  renderPageToCanvas(page, doc, big, {
    scale,
    pageNegative: negative,
    ...(trim ? { trim: true } : {}),
    ...(options.printPreview ? { printPreview: options.printPreview } : {}),
    onWarning: (w) => { if (w.kind === 'missingImage') missingImages++; },
  });
  const sx = Math.round(crop.x * big.width);
  const sy = Math.round(crop.y * big.height);
  const sw = Math.max(1, Math.min(big.width - sx, Math.round(crop.width * big.width)));
  const sh = Math.max(1, Math.min(big.height - sy, Math.round(crop.height * big.height)));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(options.width));
  out.height = Math.max(1, Math.round((sh / sw) * out.width));
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('This browser gave no 2D canvas to paint the page on.');
  // A page without a paper colour is transparent: on white, as printed
  // (on black when the pages are shown in negative).
  ctx.fillStyle = negative ? '#000000' : '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(big, sx, sy, sw, sh, 0, 0, out.width, out.height);
  big.width = 1;
  big.height = 1;
  const mimeType = MIME[options.format];
  const url = out.toDataURL(mimeType, options.quality);
  const width = out.width;
  const height = out.height;
  out.width = 1;
  out.height = 1;
  return { base64: url.slice(url.indexOf(',') + 1), mimeType: url.slice(5, url.indexOf(';')), width, height, missingImages };
}
