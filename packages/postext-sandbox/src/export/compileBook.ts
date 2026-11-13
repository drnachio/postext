// A book of the Books panel compiled to one file, PDF, HTML or EPUB 3, in
// the language asked for, whether or not it is the book open (#1526).
//
// It runs in a worker of its own (`compile.worker.ts`), never on the page:
// the font loader, the layout service and the stores are modules, and a
// worker has its own instances of them. The registry of custom fonts set
// here is the compiled book's alone, the layout service here starts its
// own layout worker (its own faces, measurements and documents), and the
// PDF's font provider and the EPUB's and HTML's fonts read that registry.
// The open book's registry, its layout worker, its caches and its stored
// layouts are never touched: setting another book's fonts on the page
// would have the provider put the open book's back at its next render
// (`fontsAndGc.ts`) and the open book's viewers lay out again with
// foreign faces. The stored layout records are read (the contents print
// the page numbers they settled) and never written.
//
// The chain is the Sandbox's own: the chapters the records do not reach
// paginated as the paginator does (`paginateBook`), the book laid out as
// the PDF and EPUB tabs lay it out (`layOutBookPrint`), and written with
// the options those tabs write with (`pdfWriterSettings`,
// `epubWriterOptions`); the HTML is the command line's page
// (`renderHtmlBook`). The EPUB's cover, when the book has no picture of
// its own, is its first page painted here with the book's faces
// (`compileCover.ts`, #1548). The page is asked only for what a worker
// cannot do: an SVG rasterized, for the PDF or for that cover.

import { metadataText, htmlBookFiles, renderHtmlBook, type HtmlBookFontNote, type HtmlBookWarning, type PostextConfig, type Resource } from 'postext';
import { diagramInkHex } from 'postext/bundle';
import { renderToEpub, type EpubLayout } from 'postext-epub';
import { renderToPdf, type SvgRasterizer } from 'postext-pdf';
import { composeBookMemo } from '../book/compose.js';
import { paginateBook } from '../book/paginate.js';
import { layOutBookPrint } from '../book/printChain.js';
import { withDefaultResourceTypes } from '../context/defaultConfig.js';
import type { PdfFontCheck } from '../controls/fonts/pdfFontWarnings.js';
import { setCustomFonts } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { epubOwnCover } from '../epub/cover.js';
import { collectEpubFonts } from '../epub/inputs.js';
import { epubFileName } from '../epub/metadata.js';
import { epubNotices, epubWriterOptions, type EpubNotice } from '../epub/write.js';
import { getBlob } from '../storage/blobStore.js';
import { getChapterLayouts } from '../storage/layouts.js';
import { getProject } from '../storage/projects.js';
import { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';
import { pdfWarnings, pdfWriterSettings } from '../viewport/pdf/pdfWriterOptions.js';
import { createLayoutService } from '../worker/LayoutService.js';
import type { LayoutService } from '../worker/LayoutService.js';
import { compiledBookCover } from './compileCover.js';
import { compiledEdition } from './edition.js';

export type CompiledFormat = 'pdf' | 'html' | 'epub';

export interface CompileRequest {
  projectId: string;
  format: CompiledFormat;
  /** The edition, by language tag; the one the record opens with when
   *  left out. */
  locale?: string;
  /** The interface language: the resource types and the hyphenation of a
   *  book that names no language follow it, as on screen. */
  uiLocale: string;
  /** The EPUB's rendition. */
  epubLayout: EpubLayout;
  /** Where catalogue output profiles are fetched from (absolute). */
  profileBaseUrl: string;
}

/** Where a compilation stands: the chapters paginated, the chapters laid
 *  out, then the writer's steps as the EPUB tab counts them (the fonts and
 *  pictures gathered, the pages or documents written, the package). */
export interface CompileProgress {
  phase: 'paginate' | 'layout' | 'inputs' | 'documents' | 'resources' | 'package';
  done: number;
  total: number;
}

export interface CompiledBook {
  bytes: Uint8Array;
  fileName: string;
  mime: string;
  pages: number;
  /** The edition compiled. */
  locale: string;
  /** What the PDF or HTML writer could not do as asked, as sentences. */
  warnings: string[];
  /** The EPUB writer's warnings, said in the interface's words by the page
   *  (`noticeText`). */
  epubNotices?: EpubNotice[];
  /** A PDF's font checks (the Checks panel's, for the book open). */
  fontChecks?: PdfFontCheck[];
}

/** What the compilation asks of the page. */
export interface CompileHost {
  onProgress: (progress: CompileProgress) => void;
  /** An SVG as a bitmap: one the PDF cannot draw as vectors, or a picture
   *  of the page painted as the EPUB's cover. */
  rasterizeSvg: SvgRasterizer;
  /** The layout service (a test's stub); one of its own by default. */
  layoutService?: () => LayoutService;
}

/** A file name from the book's title. */
export const compiledBaseName = (title: string): string => title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'book';

const bytesToBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const dataUri = (mime: string, content: Uint8Array | string): string =>
  `data:${mime};base64,${bytesToBase64(typeof content === 'string' ? new TextEncoder().encode(content) : content)}`;
const FONT_MIME = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' } as const;

/** Lay the book out and write it as `request.format`. */
export async function compileBook(request: CompileRequest, host: CompileHost): Promise<CompiledBook> {
  const record = await getProject(request.projectId);
  if (!record) throw new Error('Project not found');
  const edition = compiledEdition(record, request.locale, request.uiLocale);
  if (!edition) throw new Error(`The book has no edition in "${request.locale}"`);
  const { chapters, resources, start } = edition.content;
  // As the book is opened (`applyRecord`): its configuration with the
  // resource types filled in, the hyphenation fallback of the interface.
  const config = withDefaultResourceTypes(edition.content.config, request.uiLocale);
  const effective = withHyphenationLocale(config, request.uiLocale);
  // This worker's registry, the compiled book's alone (see above).
  setCustomFonts(config.customFonts, { newBook: true });
  const service = host.layoutService?.() ?? createLayoutService();
  try {
    const build = (content: Parameters<LayoutService['build']>[0]['content'], cfg: PostextConfig, cacheKey: string) =>
      service.build({ clientId: 'compile', priority: 'pdf', content, config: cfg, cacheKey });
    const stored = await getChapterLayouts(chapters.map((c) => c.id)).catch(() => ({}));
    const { plan } = await paginateBook({
      chapters, config, effective, resources, ...(start ? { start } : {}), layouts: stored, build,
      onChapter: (done, total) => host.onProgress({ phase: 'paginate', done, total }),
    });
    const docs = await layOutBookPrint({
      plan, chapters, resources, config: effective,
      build: (content, cfg, opts) => build(content, cfg, opts.cacheKey),
      onChapter: (done, total) => host.onProgress({ phase: 'layout', done, total }),
    });
    if (docs.length === 0) throw new Error('No chapters to compile');
    const pages = docs.reduce((n, d) => n + d.pages.length, 0);
    const metadata = composeBookMemo(chapters).metadata;
    const title = metadataText(metadata.title) || edition.name;
    const base = { pages, locale: edition.locale };
    host.onProgress({ phase: 'inputs', done: 0, total: 1 });

    if (request.format === 'pdf') {
      const { resourceBytes, previewBytes, ...settings } = await pdfWriterSettings(effective, resources, { profileBaseUrl: request.profileBaseUrl });
      // As the PDF tab routes them: the font checks are kept (the Checks
      // panel's, and the notice's), the rest goes to the console.
      const { onWarning, fontChecks } = pdfWarnings();
      const bytes = await renderToPdf(docs, {
        ...settings,
        resourceBytes: (id) => resourceBytes.get(id),
        ...(previewBytes ? { previewBytes: (id: string) => previewBytes.get(id) } : {}),
        fontProvider: createPdfFontProvider(),
        rasterizeSvg: host.rasterizeSvg,
        onWarning,
        onProgress: (p) => { if (p.phase === 'pages') host.onProgress({ phase: 'documents', done: p.pages, total: p.totalPages }); },
      });
      const warnings = fontChecks.map((w) => w.message.replace(/^postext-pdf: /, ''));
      return { ...base, bytes, fileName: `${compiledBaseName(title)}.pdf`, mime: 'application/pdf', warnings, fontChecks };
    }

    if (request.format === 'epub') {
      const { note, notices } = epubNotices();
      const { options, metadata: meta } = await epubWriterOptions({
        docs, chapters, config: effective, layout: request.epubLayout,
        identity: { kind: 'project', id: record.id, name: edition.name },
        locale: request.uiLocale,
        cover: async (coverTitle) => (await epubOwnCover(coverTitle, record.thumbnail ? { projectThumbnail: record.thumbnail } : {}))
          ?? compiledBookCover(docs[0]!, { config: effective, resources, markdown: chapters[0]?.markdown ?? '' }, coverTitle, host.rasterizeSvg),
        note,
      });
      const bytes = await renderToEpub(docs, { ...options, onProgress: (p) => host.onProgress({ phase: p.phase, done: p.done, total: p.total }) });
      return { ...base, bytes, fileName: epubFileName(meta.title), mime: 'application/epub+zip', warnings: [], epubNotices: notices };
    }

    // HTML: one self-contained page, the pictures and fonts inside.
    const markdowns = chapters.map((c) => c.markdown);
    const [{ fonts, withheld, stoodIn }, blobs] = await Promise.all([
      collectEpubFonts(effective, docs, markdowns),
      readPictures(resources),
    ]);
    const urls = new Map(htmlBookFiles(resources, (id) => blobs.get(id)?.bytes, { inkHex: diagramInkHex(effective) })
      .map((f) => [f.fileId, dataUri(typeof f.content === 'string' ? 'image/svg+xml' : blobs.get(f.fileId)!.mime, f.content)] as const));
    const fontNotes: HtmlBookFontNote[] = [...stoodIn.map((s) => ({ family: s.family, standIn: s.standIn })), ...withheld.map((family) => ({ family }))];
    host.onProgress({ phase: 'documents', done: 0, total: 1 });
    const found: HtmlBookWarning[] = [];
    const html = renderHtmlBook(docs, {
      title: edition.name,
      lang: effective.locale ?? edition.locale,
      // One under another: a page to read down, as the HTML tab shows it.
      mode: 'single',
      faces: fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, url: dataUri(FONT_MIME[f.format], f.bytes), ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}) })),
      fontNotes,
      pictureUrl: (id) => urls.get(id),
      videoPosters: true,
      onWarning: (w) => found.push(w),
    });
    const bytes = new TextEncoder().encode(html);
    return { ...base, bytes, fileName: `${compiledBaseName(title)}.html`, mime: 'text/html;charset=utf-8', warnings: found.map((w) => w.message) };
  } finally {
    service.dispose();
  }
}

/** The bytes of every picture the resources name, from the blob store. */
async function readPictures(resources: readonly Resource[]): Promise<Map<string, { bytes: Uint8Array; mime: string }>> {
  const ids = new Set<string>();
  for (const r of resources) for (const id of [r.bitmap?.fileId, r.svg?.fileId, r.video?.poster?.fileId]) if (id) ids.add(id);
  const out = new Map<string, { bytes: Uint8Array; mime: string }>();
  await Promise.all([...ids].map(async (id) => {
    const blob = await getBlob(id).catch(() => null);
    if (blob) out.set(id, { bytes: new Uint8Array(blob.bytes), mime: blob.contentType });
  }));
  return out;
}
