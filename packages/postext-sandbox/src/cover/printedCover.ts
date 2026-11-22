// The front of the book's print cover as the EPUB's cover picture, and
// its spine as the picture Folio binds the 3D book with (#1669), as
// `postext cover` and the command line's EPUB give them (#1668). The
// cover of the book's first print version is laid out with the layout the
// caller has (the EPUB tab's worker, the compiler's service) and painted
// on an offscreen canvas, on the page or in the compiler's worker.

import type { PostextConfig, PostextContent, VDTDocument } from 'postext';
import type { EpubCover } from 'postext-epub';
import { buildCover, type BuiltCover, type CoverSheetKind } from 'postext/production';
import { ensureResourceImages, type SvgRaster } from '../controls/media/resourceImages.js';
import { coverPictureOptions } from '../epub/cover.js';
import { coverBuildInput, pickVersion, type CoverBook } from './coverInput.js';
import { registerCoverFiles } from './coverFiles.js';
import { canvasJpeg, paintCoverZone, type CoverCanvas } from './paintCover.js';

/** Long side of the front cover an EPUB carries, px (the command line's). */
export const EPUB_COVER_LONG_SIDE = 1600;

/** What laying out and painting the cover asks of where it runs. */
export interface PrintedCoverHost {
  build: (content: PostextContent, config: PostextConfig) => Promise<VDTDocument>;
  /** The faces the cover is set in, before it is laid out (the page's
   *  loader) or before it is painted (a worker's own font set). */
  fonts?: (config: PostextConfig, markdown: string, doc?: VDTDocument) => Promise<void>;
  /** How a worker has the SVG pictures rasterized (the page, asked). */
  rasterize?: SvgRaster['rasterize'];
}

export interface LaidCover {
  built: BuiltCover;
  doc: VDTDocument;
}

/** A sheet of a print version (the book's first and its cover sheet by
 *  default) laid out with its pictures readied; null when the book has no
 *  print version or the sheet cannot be built. */
export async function layOutPrintedCover(
  book: CoverBook,
  host: PrintedCoverHost,
  which: { version?: string; sheet?: CoverSheetKind } = {},
): Promise<LaidCover | null> {
  const version = pickVersion(book.config, which.version ?? null);
  if (!version) return null;
  const built = buildCover(coverBuildInput(book, version, which.sheet ?? 'cover'));
  if (!('config' in built)) return null;
  const { content } = built;
  await host.fonts?.(built.config, content.markdown);
  const doc = await host.build(content, built.config);
  const page = doc.pages[0];
  if (!page) return null;
  await host.fonts?.(built.config, content.markdown, doc);
  const raster = host.rasterize ? { rasterize: host.rasterize, box: { width: Math.round(page.width), height: Math.round(page.height) } } : undefined;
  const own = new Set(Object.keys(built.files));
  const pictures = (content.resources ?? book.resources).filter((r) => {
    const file = r.kind === 'bitmap' ? r.bitmap?.fileId : r.kind === 'svg' ? r.svg?.fileId : undefined;
    return !file || !own.has(file);
  });
  const { ink, options } = coverPictureOptions(book.config);
  await Promise.all([
    registerCoverFiles(built.files, raster),
    ensureResourceImages([...pictures], ink, { ...options, ...(raster ? { raster } : {}) }).catch(() => false),
  ]);
  return { built, doc };
}

/** One panel of the laid-out cover painted with its long side `longSide`
 *  px. */
export function paintedCoverPanel(laid: LaidCover, zone: 'front' | 'spine', longSide: number): CoverCanvas | null {
  return paintCoverZone(laid.built, laid.doc, zone, longSide);
}

/** The front of the print cover as the EPUB's cover: a picture of its
 *  own, not of the first page, so the fixed layout keeps the first page
 *  too. Null when the book has no print version or it cannot be painted. */
export async function printedFrontCover(book: CoverBook, title: string, host: PrintedCoverHost): Promise<EpubCover | null> {
  try {
    const laid = await layOutPrintedCover(book, host);
    const canvas = laid ? paintedCoverPanel(laid, 'front', EPUB_COVER_LONG_SIDE) : null;
    const bytes = canvas ? await canvasJpeg(canvas) : null;
    return bytes ? { bytes, mediaType: 'image/jpeg', alt: title, showsFirstPage: false } : null;
  } catch {
    return null;
  }
}
