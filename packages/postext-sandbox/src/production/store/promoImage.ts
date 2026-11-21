// Screen pictures of the cover (an EPUB's cover, social media sizes): the
// Cover panel exports them, and the EPUB export takes the book's from here.

import { buildDocument, PROMO_FORMATS, renderPageToCanvas, type BindingProfile, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import { ensureConfigFontsLoaded } from '../../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../../controls/media/resourceImages.js';
import { bookTrimMm, coverDocumentInput, pickSheet, sheetsOf } from '../model/bookProduction.js';
import { getBookProduction, getCoverGallery, listLogos, listProfiles } from './productionStore.js';
import { loadMirrorPictures, registerCoverImages } from '../library/coverImages.js';

export /** A screen picture of a laid-out promo sheet: its page painted at the
 *  format's pixel width on white, as a JPEG. */
async function promoImage(doc: VDTDocument, width: number, height: number): Promise<Uint8Array | null> {
  const page = doc.pages[0];
  if (!page) return null;
  const painted = document.createElement('canvas');
  renderPageToCanvas(page, doc, painted, { scale: width / page.width });
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(painted, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

/**
 * The EPUB cover the book's Cover panel makes: its active version's front
 * cover laid out at the EPUB size (1600 × 2560 px), or null when the book
 * has no version there (the export then keeps its own cover). It is a
 * cover of its own, not a capture of the first page, so the fixed layout
 * gives it a page before the book's.
 */
export async function productionEpubCover(
  projectId: string,
  config: PostextConfig,
  resources: readonly Resource[],
  title: string,
): Promise<EpubCover | null> {
  if (typeof document === 'undefined') return null;
  const record = await getBookProduction(projectId).catch(() => null);
  const version = record?.versions.find((v) => v.id === record.activeVersionId) ?? record?.versions[0];
  if (!record || !version) return null;
  const library = (await listProfiles().catch(() => [])).flatMap((p) => (p.kind === 'binding' ? [p.profile as BindingProfile] : []));
  // The spine plays no part in a front cover: any page count will do.
  const sheets = sheetsOf(version, config, 2, library);
  if (!('cover' in sheets)) return null;
  const sheet = pickSheet(sheets, 'epub', bookTrimMm(config));
  const logos = await listLogos().catch(() => []);
  const gallery = (await getCoverGallery(projectId).catch(() => null)) ?? undefined;
  // The pictures of the effects cut to an outline (a promotional picture
  // has no mirror: its margin plays no part).
  const pictures = await loadMirrorPictures(record.design, resources, gallery).catch(() => ({}));
  // A screen picture carries no finishes: they are plates for the press.
  const input = coverDocumentInput(sheet, version, record.texts, config, record.design, resources, { logos, ...(gallery ? { gallery } : {}), mirror: { margin: 0, pictures }, hidden: new Set(['finishes'] as const) });
  await ensureConfigFontsLoaded(input.config, input.markdown);
  await registerCoverImages(input.cover.files);
  const own = new Set(Object.keys(input.cover.files));
  await ensureResourceImages(input.resources.filter((r) => !own.has(r.svg?.fileId ?? r.bitmap?.fileId ?? ''))).catch(() => false);
  if (document.fonts) await document.fonts.ready;
  const doc = buildDocument({ markdown: input.markdown, resources: input.resources }, input.config);
  const px = PROMO_FORMATS.epub;
  const bytes = await promoImage(doc, px.width, px.height);
  return bytes ? { bytes, mediaType: 'image/jpeg', alt: title } : null;
}
