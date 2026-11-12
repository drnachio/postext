import { resolveColorValue, resolveDiagramStyleConfig, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { renderCoverImage } from '../covers/useAutoCover.js';
import { bookCoverPicture, RENDERED_COVER_WIDTH, usableCover } from './inputs.js';

/** The book's own cover picture, when it is a bitmap large enough. A
 *  picture of the first page (the Sandbox's covers are captures of it):
 *  the fixed layout keeps it as the cover image without a page of its
 *  own. Read from the stores, so a worker can ask for it too. */
export async function epubOwnCover(title: string, source: Parameters<typeof bookCoverPicture>[0]): Promise<EpubCover | null> {
  const picture = await bookCoverPicture(source);
  const own = picture ? await usableCover(picture.bytes, picture.mime, title) : null;
  return own ? { ...own, showsFirstPage: true } : null;
}

/** The book's first page painted at {@link RENDERED_COVER_WIDTH}, with
 *  the page's fonts (the page's font set: the open book's) and its
 *  pictures as the canvas paints them. Null where nothing can be painted
 *  (a worker, an empty book). */
export async function epubPaintedCover(
  first: VDTDocument,
  snapshot: { config: PostextConfig; resources: Resource[] },
  title: string,
): Promise<EpubCover | null> {
  const page = first.pages[0];
  if (!page || typeof document === 'undefined') return null;
  const ds = resolveDiagramStyleConfig(snapshot.config.diagramStyle);
  const ink = ds.singleInk ? resolveColorValue(ds.inkColor, snapshot.config.colorPalette, ds.inkColor).hex : null;
  await ensureResourceImages(snapshot.resources, ink, { inlineFonts: ds.inlineFonts }).catch(() => false);
  if (document.fonts) await document.fonts.ready;
  const image = await renderCoverImage(page, first, true, { width: RENDERED_COVER_WIDTH, trimmed: true });
  if (!image || image === 'missing') return null;
  return { bytes: new Uint8Array(image.bytes), mediaType: 'image/jpeg', alt: title, showsFirstPage: true };
}

/** The cover: the book's own picture when it is a bitmap large enough,
 *  else its first page painted. Either is a picture of the first page, so
 *  the fixed layout keeps it as the cover image without a page of its
 *  own. The EPUB tab's; the Books panel's compiler asks for the two in
 *  turn (`export/compileBook.ts`). */
export async function epubCoverOf(
  first: VDTDocument,
  snapshot: { config: PostextConfig; resources: Resource[] },
  title: string,
  source: Parameters<typeof bookCoverPicture>[0],
): Promise<EpubCover | null> {
  return (await epubOwnCover(title, source)) ?? epubPaintedCover(first, snapshot, title);
}
