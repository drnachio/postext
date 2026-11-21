/**
 * A cover sheet painted on a canvas, off screen: for what shows a cover
 * small (a template's thumbnail) or in part (Folio's spine). Laid out on
 * the layout worker, its fonts and pictures readied first, as the
 * designer's canvas does.
 */

import { useCallback } from 'react';
import { renderPageToCanvas, type ProductionSheet, type VDTDocument } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext.js';
import { ensureConfigFontsLoaded } from '../../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../../controls/media/resourceImages.js';
import { useLayoutWorker } from '../../worker/useLayoutWorker.js';
import { bookTrimMm, coverDocumentInput, pickSheet, type BookProduction, type CoverDesignSettings } from '../model/bookProduction.js';
import type { GalleryPicture } from '../library/coverGallery.js';
import { registerCoverImages } from '../library/coverImages.js';
import { useCoverGallery, useCoverWorkspace, useLogos } from './useProduction.js';

const MM_PER_IN = 25.4;

type Input = ReturnType<typeof coverDocumentInput>;
type Build = ReturnType<typeof useLayoutWorker>['build'];

/** A sheet's input laid out and painted at `scale` of its page: the
 *  canvas and the document. */
export async function paintSheet(input: Input, build: Build, scale: number): Promise<{ canvas: HTMLCanvasElement; doc: VDTDocument } | null> {
  await ensureConfigFontsLoaded(input.config, input.markdown);
  await registerCoverImages(input.cover.files);
  await ensureResourceImages(input.resources.filter((r) => r.id !== 'isbn-barcode'));
  const doc = await build({ markdown: input.markdown, resources: input.resources }, input.config);
  const page = doc.pages[0];
  if (!page) return null;
  const canvas = document.createElement('canvas');
  renderPageToCanvas(page, doc, canvas, { scale });
  return { canvas, doc };
}

/** A rectangle of the sheet (mm from its corner, bleed included) on a
 *  painted page, px. */
export function sheetRectPx(sheet: ProductionSheet, doc: VDTDocument, rect: { x: number; y: number; width: number; height: number }, scale: number): { x: number; y: number; w: number; h: number } {
  const dpi = doc.config.page.dpi ?? 96;
  // The sheet's corner (the bleed's) on the page, which has room for the
  // cut marks round it.
  const offset = (doc.trimOffset * MM_PER_IN) / dpi - sheet.trim.x;
  const k = (dpi / MM_PER_IN) * scale;
  return { x: (rect.x + offset) * k, y: (rect.y + offset) * k, w: rect.width * k, h: rect.height * k };
}

/** A canvas's region as a new canvas `width` px wide. */
export function cropCanvas(from: HTMLCanvasElement, r: { x: number; y: number; w: number; h: number }, width = Math.round(r.w)): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width));
  out.height = Math.max(1, Math.round((r.h / r.w) * out.width));
  out.getContext('2d')!.drawImage(from, r.x, r.y, r.w, r.h, 0, 0, out.width, out.height);
  return out;
}

/** The px a template's thumbnail is wide. */
export const THUMBNAIL_WIDTH = 360;

/** How to paint a design's thumbnail on this book's cover sheet (its
 *  trim, back, spine and front): a JPEG, or null when the book has no
 *  version to paint it on. `pictures` are a template's own, beside the
 *  book's gallery. */
export function useCoverThumbnail(): ((design: CoverDesignSettings | undefined, texts: BookProduction['texts'], pictures?: readonly GalleryPicture[]) => Promise<Uint8Array | undefined>) | null {
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const bookResources = useSandboxSelector((s) => s.resources);
  const { version, sheets } = useCoverWorkspace();
  const library = useLogos();
  const [gallery] = useCoverGallery();
  const { build } = useLayoutWorker('preview');
  const paint = useCallback(async (design: CoverDesignSettings | undefined, texts: BookProduction['texts'], pictures: readonly GalleryPicture[] = []) => {
    if (!version || !sheets) return undefined;
    const sheet = pickSheet(sheets, 'cover', bookTrimMm(config));
    const input = coverDocumentInput(sheet, version, texts, config, design, bookResources, {
      logos: library,
      gallery: { ...gallery, pictures: [...gallery.pictures, ...pictures.filter((p) => !gallery.pictures.some((g) => g.id === p.id))] },
      workIsbnLabel: labels.productionWorkIsbnCaption,
    });
    try {
      // About screen resolution: enough for a thumbnail.
      const scale = Math.min(1, 96 / ((input.config.page?.dpi as number | undefined) ?? 96));
      const painted = await paintSheet(input, build, scale);
      if (!painted) return undefined;
      const thumb = cropCanvas(painted.canvas, sheetRectPx(sheet, painted.doc, sheet.trim, scale), THUMBNAIL_WIDTH);
      const blob = await new Promise<Blob | null>((res) => thumb.toBlob(res, 'image/jpeg', 0.85));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
    } catch {
      return undefined;
    }
  }, [version, sheets, config, bookResources, library, gallery, labels.productionWorkIsbnCaption, build]);
  return version && sheets ? paint : null;
}
