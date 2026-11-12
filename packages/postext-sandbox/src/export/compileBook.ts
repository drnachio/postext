import {
  metadataText,
  renderToHtml,
  resolveDebugConfig,
  resolvePdfGenerationConfig,
  resolvePrintConfig,
  type PostextConfig,
  type PostextContent,
  type Resource,
  type VDTDocument,
} from 'postext';
import { renderToEpub, type EpubFontFile, type EpubLayout } from 'postext-epub';
import { createPdfWorker } from 'postext-pdf/worker';
import { composeBookMemo } from '../book/compose.js';
import { chapterLayoutFromDoc, createBookPlanner } from '../book/pagination.js';
import { layOutBookPrint } from '../book/printChain.js';
import { layoutCacheKey } from '../book/layoutKeys.js';
import type { BookPlan, Chapter, ChapterLayout } from '../book/types.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { epubCoverOf } from '../epub/cover.js';
import { collectEpubFonts, epubResourceBytes, epubSvgFonts } from '../epub/inputs.js';
import { epubFileName, epubMetadataOf, type EpubBookIdentity } from '../epub/metadata.js';
import { loadPrintProfile, outputProfileBaseUrl } from '../print/printSetup.js';
import { getBlob } from '../storage/blobStore.js';
import { getChapterLayouts, putChapterLayouts } from '../storage/layouts.js';
import { buildPdfResourceBytes } from '../viewport/pdf/pdfResourceBytes.js';
import { createPdfFontProvider } from '../viewport/pdf/pdfFontProvider.js';

// ---------------------------------------------------------------------------
// A whole book compiled to a file — PDF, HTML or EPUB 3 — for the Books
// panel, whether or not it is the book open: the same print chain the PDF
// and EPUB tabs lay out (every chapter after the pages of the ones before
// it), paginated first where the stored records stop (so the contents
// print their page numbers), then written as those tabs write it. The
// HTML is one self-contained page: the book's pages as laid out, its
// pictures and fonts inlined.
// ---------------------------------------------------------------------------

export type CompiledFormat = 'pdf' | 'html' | 'epub';

/** The layout worker's build, as the tabs call it. */
export type LayoutBuild = (content: PostextContent, config: PostextConfig, opts: { cacheKey: string }) => Promise<VDTDocument>;

export interface CompileBookInput {
  chapters: Chapter[];
  /** The book's configuration as stored (its resource types filled in). */
  config: PostextConfig;
  resources: Resource[];
  /** The interface language (the hyphenation fallback). */
  locale: string;
  name: string;
  identity: EpubBookIdentity | null;
  /** The book's cover picture, when it has one (the EPUB's cover). */
  thumbnail?: { fileId: string; mime: string };
  epubLayout: EpubLayout;
  build: LayoutBuild;
  /** What the compiler is doing, for the panel's busy line. */
  onStep?: (step: 'paginate' | 'layout' | 'write', done: number, total: number) => void;
}

export interface CompiledBook {
  bytes: Uint8Array;
  fileName: string;
  mime: string;
}

/** A file name from the book's title. */
export const compiledBaseName = (title: string): string => title.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'book';

/**
 * The book's plan, every chapter paginated: from its stored records, the
 * chapters the records do not reach laid out here in turn (each needs the
 * pages of the one before), as the paginator does for the book open. The
 * records found are stored, so the next compile or opening starts from
 * them.
 */
export async function paginateBook(input: Pick<CompileBookInput, 'chapters' | 'config' | 'resources' | 'locale' | 'build' | 'onStep'>): Promise<BookPlan> {
  const { chapters, config, resources, locale, build } = input;
  const effective = withHyphenationLocale(config, locale);
  const planner = createBookPlanner();
  const layouts: Record<string, ChapterLayout> = await getChapterLayouts(chapters.map((c) => c.id)).catch(() => ({}));
  let plan = planner.plan(chapters, config, resources, layouts);
  const found: ChapterLayout[] = [];
  for (let guard = 0; plan.pendingChapterId && guard < chapters.length * 2; guard++) {
    const id = plan.pendingChapterId;
    const chapterPlan = plan.byId[id];
    const chapter = chapters.find((c) => c.id === id);
    if (!chapterPlan?.paginated || !chapter) break;
    input.onStep?.('paginate', chapters.findIndex((c) => c.id === id), chapters.length);
    const book = composeBookMemo(chapters, id);
    const doc = await build(
      { markdown: book.markdown, metadata: book.metadata, resources, continuation: chapterPlan.continuation, outline: chapterPlan.outline, ...(chapterPlan.citations ? { citations: chapterPlan.citations } : {}) },
      effective,
      {
        cacheKey: layoutCacheKey({
          markdown: book.markdown, metadata: book.metadata, config: effective, resources,
          continuation: chapterPlan.continuation, continuationKey: chapterPlan.continuationKey, outlineKey: chapterPlan.outlineKey,
        }),
      },
    );
    const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: chapter.markdown, config, resources });
    if (!layout) break;
    layouts[id] = layout;
    found.push(layout);
    plan = planner.plan(chapters, config, resources, layouts);
  }
  if (found.length > 0) await putChapterLayouts(found).catch(() => undefined);
  return plan;
}

/** The book laid out and written as `format`. */
export async function compileBook(format: CompiledFormat, input: CompileBookInput): Promise<CompiledBook> {
  const effective = withHyphenationLocale(input.config, input.locale);
  const markdowns = input.chapters.map((c) => c.markdown);
  await ensureConfigFontsLoaded(effective, markdowns);
  const plan = await paginateBook(input);
  const docs = await layOutBookPrint({
    plan,
    chapters: input.chapters,
    resources: input.resources,
    config: effective,
    build: input.build,
    onChapter: (index, count) => input.onStep?.('layout', index, count),
  });
  if (docs.length === 0) throw new Error('No chapters to compile');
  input.onStep?.('write', 0, 1);
  const metadata = composeBookMemo(input.chapters).metadata;
  const title = metadataText(metadata.title) || input.name;
  if (format === 'pdf') return { bytes: await writePdf(docs, effective, input.resources), fileName: `${compiledBaseName(title)}.pdf`, mime: 'application/pdf' };
  if (format === 'epub') {
    const meta = epubMetadataOf(metadata, effective, input.identity, input.locale);
    const [{ fonts }, cover] = await Promise.all([
      collectEpubFonts(effective, docs, markdowns),
      epubCoverOf(docs[0]!, { config: effective, resources: input.resources }, meta.title, input.thumbnail ? { projectThumbnail: input.thumbnail } : {}),
    ]);
    const bytes = await renderToEpub(docs, {
      layout: input.epubLayout,
      metadata: meta,
      fonts,
      resourceBytes: epubResourceBytes(),
      svgFonts: epubSvgFonts(),
      ...(cover ? { cover } : {}),
    });
    return { bytes, fileName: epubFileName(meta.title), mime: 'application/epub+zip' };
  }
  const html = await writeHtml(docs, effective, input.resources, markdowns, title);
  return { bytes: new TextEncoder().encode(html), fileName: `${compiledBaseName(title)}.html`, mime: 'text/html;charset=utf-8' };
}

/** The PDF, as the PDF tab writes the whole book. */
async function writePdf(docs: VDTDocument[], config: PostextConfig, resources: Resource[]): Promise<Uint8Array> {
  const debug = resolveDebugConfig(config.debug);
  const pdfGen = resolvePdfGenerationConfig(config.pdfGeneration);
  const print = resolvePrintConfig(config.print);
  const colorSpace = pdfGen.forceColorSpace ? pdfGen.colorSpace : 'rgb';
  const outputProfile = print.standard !== 'none' || colorSpace === 'cmyk'
    ? await loadPrintProfile(print).then((p) => p.bytes, () => undefined)
    : undefined;
  const { bytes: resourceBytes, previews: previewBytes } = await buildPdfResourceBytes(resources, config);
  const worker = createPdfWorker();
  try {
    return await worker.render(docs, {
      fontProvider: createPdfFontProvider(),
      pageNegative: debug.pageNegative.enabled,
      outlines: pdfGen.outlines,
      ...(pdfGen.forms ? { forms: pdfGen.forms } : {}),
      colorSpace,
      accessible: pdfGen.accessible,
      resourceBytes,
      ...(previewBytes.size > 0 ? { previewBytes } : {}),
      ...(config.print ? { print: config.print } : {}),
      ...(outputProfile ? { outputProfile } : {}),
      profileBaseUrl: outputProfileBaseUrl(),
    });
  } finally {
    worker.dispose();
  }
}

/** Bytes as a base64 string. */
function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const FONT_MIME: Record<EpubFontFile['format'], string> = { woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf' };
const FONT_FORMAT: Record<EpubFontFile['format'], string> = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/** An `@font-face` rule for one embedded font file. */
export function fontFaceRule(f: EpubFontFile): string {
  return `@font-face{font-family:${JSON.stringify(f.family)};font-weight:${f.weight};font-style:${f.style};src:url(data:${FONT_MIME[f.format]};base64,${base64(f.bytes)}) format(${JSON.stringify(FONT_FORMAT[f.format])});${f.unicodeRange ? `unicode-range:${f.unicodeRange};` : ''}}`;
}

/** The HTML: one page holding the book's pages one under another, as the
 *  HTML backend draws them, with the pictures as data URIs and the fonts
 *  the text uses embedded (`@font-face`). The pictures are the stored
 *  originals, so the backend recolours SVGs for single ink itself. */
async function writeHtml(docs: VDTDocument[], config: PostextConfig, resources: Resource[], markdowns: string[], title: string): Promise<string> {
  const fileIds = new Set<string>();
  for (const r of resources) {
    for (const id of [r.bitmap?.fileId, r.svg?.fileId, r.video?.poster?.fileId]) if (id) fileIds.add(id);
  }
  const urls = new Map<string, string>();
  await Promise.all([...fileIds].map(async (id) => {
    const blob = await getBlob(id).catch(() => null);
    if (blob) urls.set(id, `data:${blob.contentType};base64,${base64(new Uint8Array(blob.bytes))}`);
  }));
  const { fonts } = await collectEpubFonts(config, docs, markdowns);
  const faces = fonts.map(fontFaceRule).join('\n');
  const body = docs.map((doc) => renderToHtml(doc, { mode: 'single', resourceImageUrl: (id) => urls.get(id), singleInk: true })).join('\n');
  const lang = config.locale ?? 'en';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
${faces}
body{margin:0;background:#e9e9e9}
</style>
</head>
<body>
${body}
</body>
</html>
`;
}
