import { resolveColorValue, resolveDiagramStyleConfig, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import { ensureResourceImages, type SvgImageOptions } from '../controls/media/resourceImages.js';
import { renderCoverImage } from '../covers/renderCover.js';
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

/** How the book's pictures are decoded for its cover, as the previews
 *  decode them: SVGs in the diagram ink when it is single, with the
 *  book's fonts inlined unless it says otherwise. */
export function coverPictureOptions(config: PostextConfig): { ink: string | null; options: SvgImageOptions } {
  const ds = resolveDiagramStyleConfig(config.diagramStyle);
  const ink = ds.singleInk ? resolveColorValue(ds.inkColor, config.colorPalette, ds.inkColor).hex : null;
  return { ink, options: { inlineFonts: ds.inlineFonts } };
}

/** The font set of the realm the code runs in: the page's, or a worker's
 *  own (`self.fonts`). */
function realmFonts(): FontFaceSet | undefined {
  if (typeof document !== 'undefined') return document.fonts;
  return (globalThis as { fonts?: FontFaceSet }).fonts;
}

/** The first page painted at {@link RENDERED_COVER_WIDTH} once its faces
 *  are in the realm's font set and its pictures registered: the one paint
 *  the EPUB tab (on the page, {@link epubPaintedCover}) and the Books
 *  panel's compiler (in its worker, `export/compileCover.ts`, #1548) both
 *  make, so a book's cover comes out the same from either. */
export async function paintedFirstPage(first: VDTDocument, title: string): Promise<EpubCover | null> {
  const page = first.pages[0];
  if (!page) return null;
  const fonts = realmFonts();
  if (fonts) await fonts.ready;
  const image = await renderCoverImage(page, first, true, { width: RENDERED_COVER_WIDTH, trimmed: true });
  if (!image || image === 'missing') return null;
  return { bytes: new Uint8Array(image.bytes), mediaType: 'image/jpeg', alt: title, showsFirstPage: true };
}

/** The book's first page painted at {@link RENDERED_COVER_WIDTH} on the
 *  page, with the page's fonts (the page's font set: the open book's) and
 *  its pictures as the canvas paints them. Null where nothing can be
 *  painted (a worker, which paints with `compiledBookCover`; an empty
 *  book). */
export async function epubPaintedCover(
  first: VDTDocument,
  snapshot: { config: PostextConfig; resources: Resource[] },
  title: string,
): Promise<EpubCover | null> {
  if (!first.pages[0] || typeof document === 'undefined') return null;
  const { ink, options } = coverPictureOptions(snapshot.config);
  await ensureResourceImages(snapshot.resources, ink, options).catch(() => false);
  return paintedFirstPage(first, title);
}

/** The cover: the book's own picture when it is a bitmap large enough,
 *  else its first page painted. Either is a picture of the first page, so
 *  the fixed layout keeps it as the cover image without a page of its
 *  own. The EPUB tab's; the Books panel's compiler takes the book's own
 *  picture in the same way and paints the page in its worker
 *  (`export/compileBook.ts`). */
export async function epubCoverOf(
  first: VDTDocument,
  snapshot: { config: PostextConfig; resources: Resource[] },
  title: string,
  source: Parameters<typeof bookCoverPicture>[0],
): Promise<EpubCover | null> {
  return (await epubOwnCover(title, source)) ?? epubPaintedCover(first, snapshot, title);
}
