// Pictures of a book's first page: the small automatic cover a Books row
// shows (./useAutoCover.ts), the EPUB's rendered cover, and the cover an
// exported bundle carries as its `thumbnail` — the one a file manager shows
// as the file's icon (#1210).

import { renderPageToCanvas } from 'postext';
import type { VDTDocument, VDTPage } from 'postext';

/** Width of a cover picture, in pixels (a Books row shows it at 36 px;
 *  a bundle carries one of {@link BUNDLE_COVER_LONG_SIDE}). */
export const COVER_WIDTH = 240;

/** Long side of the cover an exported bundle carries, in pixels: what
 *  Finder asks a thumbnail extension for at its largest icon size. */
export const BUNDLE_COVER_LONG_SIDE = 1024;

/** The first chapter's document as last laid out by the canvas, with the
 *  text it was built from (to tell it still is the book on screen). */
export interface FirstChapterDoc {
  chapterId: string;
  markdown: string;
  doc: VDTDocument;
}

// The canvas's record of its first chapter while it is mounted: an export
// paints the bundle's cover from it.
let onScreen: { readonly current: FirstChapterDoc | null } | null = null;

/** Hand the export the canvas's first-chapter record; the returned function
 *  takes it back (the canvas unmounted, its layout no longer follows the
 *  book). */
export function showFirstChapterDoc(ref: { readonly current: FirstChapterDoc | null }): () => void {
  onScreen = ref;
  return () => {
    if (onScreen === ref) onScreen = null;
  };
}

/** The JPEG quality of a cover picture. */
const COVER_JPEG_QUALITY = 0.85;

/** A canvas to paint a cover on: an `OffscreenCanvas` wherever there is
 *  one, else one of the page's. The EPUB tab paints its cover on the page
 *  and the Books panel's compiler in its worker (#1548): both on the same
 *  kind of canvas, so that the same page set in the same faces comes out
 *  as the same JPEG. Null where neither can be made. */
export function coverCanvas(): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(1, 1);
  return typeof document === 'undefined' ? null : document.createElement('canvas');
}

/** A canvas's pixels as a JPEG. */
function jpegOf(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality: COVER_JPEG_QUALITY }).catch(() => null);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', COVER_JPEG_QUALITY));
}

/** The scale {@link renderCoverImage} paints `page` at before it scales
 *  the picture down to `width` (page pixels to canvas pixels); null for a
 *  page with no area. */
export function coverPaintScale(page: VDTPage, doc: VDTDocument, { width = COVER_WIDTH, trimmed = false }: { width?: number; trimmed?: boolean } = {}): number | null {
  const off = trimmed && doc.trimOffset > 0 ? doc.trimOffset : 0;
  const pageW = page.width - 2 * off;
  if (pageW <= 0 || page.height - 2 * off <= 0) return null;
  // Painted at twice the size and scaled down: small text anti-aliases
  // better than when drawn at the final size.
  return (width * 2) / pageW;
}

/** Paint `page` into a JPEG `width` pixels wide, `COVER_WIDTH` by default
 *  (on white: a page without a paper colour is transparent); `trimmed`
 *  leaves out the cut-line margin a layout with crop marks has around the
 *  page. `missing` when a picture of the page has not been decoded yet,
 *  unless `allowMissing` (placeholders then). The text is set in the faces
 *  of the realm's font set: the page's, or a worker's own (#1548). */
export async function renderCoverImage(
  page: VDTPage,
  doc: VDTDocument,
  allowMissing = false,
  { width = COVER_WIDTH, trimmed = false }: { width?: number; trimmed?: boolean } = {},
): Promise<{ bytes: ArrayBuffer; mime: string } | 'missing' | null> {
  const off = trimmed && doc.trimOffset > 0 ? doc.trimOffset : 0;
  const pageW = page.width - 2 * off;
  const pageH = page.height - 2 * off;
  const scale = coverPaintScale(page, doc, { width, trimmed });
  const big = scale === null ? null : coverCanvas();
  if (scale === null || !big) return null;
  let missing = false;
  // The painter only sizes the canvas and asks it for a 2D context, which
  // an offscreen canvas has as well.
  renderPageToCanvas(page, doc, big as HTMLCanvasElement, {
    scale,
    onWarning: (w) => { if (w.kind === 'missingImage') missing = true; },
  });
  if (missing && !allowMissing) return 'missing';
  const out = coverCanvas();
  if (!out) return null;
  out.width = width;
  out.height = Math.max(1, Math.round((pageH / pageW) * width));
  const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(big, off * scale, off * scale, pageW * scale, pageH * scale, 0, 0, out.width, out.height);
  big.width = 1;
  big.height = 1;
  const blob = await jpegOf(out);
  if (!blob) return null;
  return { bytes: await blob.arrayBuffer(), mime: blob.type || 'image/jpeg' };
}

/** Width of a cover whose long side is `longSide`, for a page `w` × `h`. */
export function coverWidthFor(w: number, h: number, longSide = BUNDLE_COVER_LONG_SIDE): number {
  if (w <= 0 || h <= 0) return longSide;
  return Math.max(1, Math.round(w >= h ? longSide : (longSide * w) / h));
}

/** The cover of the book on screen at the size a bundle carries: its first
 *  page, trimmed, painted now from the canvas's layout. Null when the
 *  canvas holds no layout of `first` as it stands (another viewport is
 *  showing, the chapter was edited since) or a picture of the page is not
 *  decoded yet: the export then keeps the cover the book has. */
export async function bundleCoverImage(first: { id: string; markdown: string } | undefined): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  const built = onScreen?.current;
  if (!built || !first || built.chapterId !== first.id || built.markdown !== first.markdown) return null;
  const page = built.doc.pages[0];
  if (!page) return null;
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  const off = built.doc.trimOffset > 0 ? built.doc.trimOffset : 0;
  const width = coverWidthFor(page.width - 2 * off, page.height - 2 * off);
  const image = await renderCoverImage(page, built.doc, false, { width, trimmed: true });
  return image === 'missing' ? null : image;
}
