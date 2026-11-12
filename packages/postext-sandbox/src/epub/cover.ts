import { resolveColorValue, resolveDiagramStyleConfig, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { renderCoverImage } from '../covers/useAutoCover.js';
import { bookCoverPicture, RENDERED_COVER_WIDTH, usableCover } from './inputs.js';

/** The cover: the book's own picture when it is a bitmap large enough,
 *  else its first page painted at {@link RENDERED_COVER_WIDTH}. Either is a
 *  picture of the first page (the Sandbox's covers are captures of it), so
 *  the fixed layout keeps it as the cover image without a page of its own.
 *  Shared by the EPUB tab and the book compiler. */
export async function epubCoverOf(
  first: VDTDocument,
  snapshot: { config: PostextConfig; resources: Resource[] },
  title: string,
  source: Parameters<typeof bookCoverPicture>[0],
): Promise<EpubCover | null> {
  const picture = await bookCoverPicture(source);
  const own = picture ? await usableCover(picture.bytes, picture.mime, title) : null;
  if (own) return { ...own, showsFirstPage: true };
  const page = first.pages[0];
  if (!page) return null;
  // The page's pictures as the canvas paints them.
  const ds = resolveDiagramStyleConfig(snapshot.config.diagramStyle);
  const ink = ds.singleInk ? resolveColorValue(ds.inkColor, snapshot.config.colorPalette, ds.inkColor).hex : null;
  await ensureResourceImages(snapshot.resources, ink, { inlineFonts: ds.inlineFonts }).catch(() => false);
  if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
  const image = await renderCoverImage(page, first, true, { width: RENDERED_COVER_WIDTH, trimmed: true });
  if (!image || image === 'missing') return null;
  return { bytes: new Uint8Array(image.bytes), mediaType: 'image/jpeg', alt: title, showsFirstPage: true };
}
