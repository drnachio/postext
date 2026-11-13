// The first page of a closed book painted as its EPUB's cover, in the
// Books panel's compile worker (#1548).
//
// The cover was painted on the page, whose font set holds the open book's
// faces: a closed book with other custom fonts would have had its first
// page set in them, and declaring its faces on the page would have
// disturbed the open book, so its EPUB went without a cover picture. The
// worker has a font set of its own (`self.fonts`) and the compiled book's
// registry (`compileBook.ts`): the faces the first page is set in are
// declared there from that registry, its pictures decoded into the
// worker's own image registry, and the page painted on an offscreen canvas
// by the paint the EPUB tab makes (`paintedFirstPage`). The same page in
// the same faces, on the same kind of canvas: the same picture.
//
// What a worker cannot do is asked of the page: an SVG picture rasterized
// (an `<img>` decodes SVG, `createImageBitmap` does not in a worker). The
// markup is prepared here, its fonts inlined from the book's registry, so
// the page's fonts play no part in it.

import { documentFontFaces, renderPageToCanvas, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import type { SvgRasterizer } from 'postext-pdf';
import { collectFontPayloadsForFaces, collectStandInPayloads, configFontUses } from '../controls/fonts/fontLoader.js';
import { ensureResourceImages } from '../controls/media/resourceImages.js';
import { coverCanvas, coverPaintScale } from '../covers/renderCover.js';
import { coverPictureOptions, paintedFirstPage } from '../epub/cover.js';
import { documentCodePoints } from '../epub/fontSubsets.js';
import { RENDERED_COVER_WIDTH } from '../epub/inputs.js';

/** How the cover is painted: as the EPUB tab paints it. */
const PAINT = { width: RENDERED_COVER_WIDTH, trimmed: true } as const;

/** The book's first page painted as its EPUB's cover, in this worker with
 *  the book's own faces; null where nothing can be painted (no offscreen
 *  canvas or font set, an empty book). */
export async function compiledBookCover(
  first: VDTDocument,
  book: { config: PostextConfig; resources: Resource[]; markdown: string },
  title: string,
  rasterizeSvg: SvgRasterizer,
): Promise<EpubCover | null> {
  const page = first.pages[0];
  const scale = page ? coverPaintScale(page, first, PAINT) : null;
  if (!page || scale === null) return null;
  const onePage: VDTDocument = { ...first, pages: [page] };
  await declareFaces(onePage, book.config, book.markdown);
  const { ink, options } = coverPictureOptions(book.config);
  // Only the pictures the page shows: every other one would be read and
  // decoded for nothing, an SVG rasterized by the page.
  const shown = pictureIds(onePage);
  const resources = book.resources.filter((r) => [r.bitmap?.fileId, r.svg?.fileId, r.video?.poster?.fileId].some((id) => id !== undefined && shown.has(id)));
  // The largest a picture can show at is the whole page as painted.
  const box = { width: Math.max(1, Math.round(page.width * scale)), height: Math.max(1, Math.round(page.height * scale)) };
  await ensureResourceImages(resources, ink, { ...options, raster: { rasterize: rasterizeSvg, box } }).catch(() => false);
  return paintedFirstPage(first, title);
}

/** Declare in this worker's font set the faces the page is set in, from
 *  the book's registry: the cuts the configuration and the page name, in
 *  the files that hold the page's characters (every file of a custom
 *  family), then the stand-ins of a bold or an italic a family lacks
 *  (#688), as the page and the layout worker declare them. */
async function declareFaces(onePage: VDTDocument, config: PostextConfig, markdown: string): Promise<void> {
  const fonts = (globalThis as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof FontFace === 'undefined') return;
  const faces = [
    ...[...configFontUses(config, markdown)].flatMap(([family, uses]) => uses.map((use) => ({ family, ...use }))),
    ...documentFontFaces(onePage),
  ];
  const [own, standIns] = await Promise.all([
    collectFontPayloadsForFaces(faces, documentCodePoints([onePage])).catch(() => []),
    collectStandInPayloads(config, markdown).catch(() => []),
  ]);
  const declared: FontFace[] = [];
  // Added in the order they come (a family's slices overlap at a few code
  // points, where the order decides, #629), the family's own files first.
  for (const p of [...own, ...standIns]) {
    try {
      const face = new FontFace(p.family, p.buffer, {
        weight: String(p.weight),
        style: p.style,
        ...(p.unicodeRange ? { unicodeRange: p.unicodeRange } : {}),
        ...(p.featureSettings ? { featureSettings: p.featureSettings } : {}),
      });
      fonts.add(face);
      declared.push(face);
    } catch {
      // A file that is not a font: the page paints that face's text in
      // the fallback, as the canvas would.
    }
  }
  await Promise.all(declared.map((face) => face.load().catch(() => undefined)));
}

/** The pictures `doc`'s page shows, by file id: what a paint of it finds
 *  missing in this worker's empty image registry. */
function pictureIds(doc: VDTDocument): Set<string> {
  const ids = new Set<string>();
  const page = doc.pages[0];
  const canvas = coverCanvas();
  if (!page || !canvas) return ids;
  // A paint at the page's own size, a fraction of the cover's: only its
  // warnings are read.
  renderPageToCanvas(page, doc, canvas as HTMLCanvasElement, {
    scale: 1,
    onWarning: (w) => { if (w.kind === 'missingImage') ids.add(w.fileId); },
  });
  canvas.width = 1;
  canvas.height = 1;
  return ids;
}
