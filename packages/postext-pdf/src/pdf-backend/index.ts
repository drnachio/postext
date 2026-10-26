import './text/shapedText.js';
import './text/verticalText.js';
import { PDFDocument, ReadingDirection, PDFName } from 'pdf-lib';
import { type ResourceBytesProvider, type SvgRasterizer, type ResourceImageMap, preloadResourceImages } from './blocks/renderResourceBlock.js';
import fontkit from '@pdf-lib/fontkit';
import { type PdfColorSpace, type PrintConfig, type VDTDocument, shapingLanguageOf, type ResolvedPrintConfig, resolvePrintConfig, outputProfileInfo, parseIccProfile, loadOutputProfile, type CmykPercent, authoredCmykColors } from 'postext';
import { type ColorMode, type PrintColorMode, createPrintColorMode } from '../print/colorMode.js';
import { runPagePrintPass } from '../print/printPass.js';
import { writePdfX } from '../print/pdfx.js';
import { type PdfFontProvider, type PdfFontAnswer, type PdfFontFile, type PdfFontFileDeclaration, type PdfFontRequest, withBareFiles, FontCache } from '../fontCache.js';
import { codePointNeedsComplexShaping, loadComplexShaper } from '../complexShaping.js';
import type { HarfBuzzWasmSource } from '../harfbuzz.js';
import { type FontText, collectFontText } from './text/fontHelpers.js';
import type { ResourceRenderContext } from './blocks/blockRender.js';
import { addOutlines } from './structure/outlines.js';
import { addPageLabels } from './page/pageLabels.js';
import { preloadScoreDrawings } from './blocks/scoreRender.js';
import { LinkRegistry } from './structure/links.js';
import { StructTree } from './structure/tagging.js';
import { StructureFlow } from './structure/structureFlow.js';
import { metadataString, documentTitle, languageTag } from './renderToPdf/metadata.js';
import { renderPage } from './renderToPdf/paintPage.js';
import { type PdfWarning, fontFallbackWarning, fileIssueWarning, missingGlyphWarning } from './renderToPdf/warnings.js';

export type { PdfPrintWarning, PdfComplexShapingWarning, PdfFontFallbackWarning, PdfMissingGlyphWarning, PdfVariableFontWarning, PdfCffEmbeddedWholeWarning, PdfWarning, PdfFontWarning } from './renderToPdf/warnings.js';

export interface RenderToPdfOptions {
  fontProvider: PdfFontProvider;
  pageNegative?: boolean;
  /** Emit a PDF outline tree (bookmarks) so readers can jump between
   *  headings. When omitted, the first document's
   *  `config.pdfGeneration.outlines`, else true. */
  outlines?: boolean;
  /** Force every colour in the rendered output through the given PDF colour
   *  space. When omitted, the first document's `config.pdfGeneration`
   *  (`colorSpace`, while its `forceColorSpace` is on), else `'rgb'`
   *  (pdf-lib's native output). In `'cmyk'`, crop marks are painted in
   *  registration colour (the `/All` separation), so they print on every
   *  plate. */
  colorSpace?: PdfColorSpace;
  /** Resolver for resource binary bytes by `fileId`. The bytes are sniffed:
   *  bitmaps embed as images, SVG markup is emitted as vector paths (or
   *  rasterised in the browser when it uses unsupported features), and a
   *  single-page PDF is embedded verbatim. An SVG with a print master
   *  (`Resource.svg.pdfFileId`) is asked for by the master's id first,
   *  wherever it is drawn (a figure, a table cell, a design image, a box
   *  icon) — its first page is embedded in place of the SVG unless
   *  `diagramStyle.singleInk` is on — and by the SVG's own id when the
   *  master is missing or does not decode. When omitted, resource images
   *  are drawn as placeholders. */
  resourceBytes?: ResourceBytesProvider;
  /** Emit an accessible, tagged PDF (PDF/UA-1 oriented): logical structure
   *  tree, alt text on figures, document language and title, decoration
   *  flagged as artifacts. When omitted, the first document's
   *  `config.pdfGeneration.accessible`, else true. */
  accessible?: boolean;
  /** Draw the character grid (`cjk.grid.show`) over the type area, as
   *  the canvas and HTML do on screen. Default false: the grid is a
   *  screen aid and stays out of a file meant for print. */
  characterGrid?: boolean;
  /** Called as the render advances: after the fonts and resources are
   *  embedded, after every page, and before the file is written. */
  onProgress?: (progress: RenderProgress) => void;
  /** Rasterises an SVG the vector subset cannot draw. Defaults to the
   *  document's `Image` + canvas; a worker must supply one (its host's). */
  rasterizeSvg?: SvgRasterizer;
  /** Called for each non-fatal problem met while rendering (see
   *  {@link PdfWarning}): a face the font provider rejected and another cut
   *  of its family embedded instead (`fontFallback`); characters no file of
   *  a face has a glyph for (`missingGlyph`, once per face, after the pages
   *  are drawn); a variable font asked for at a weight other than its
   *  default instance (`variableFontDefaultInstance`); a CFF face over
   *  2 MB embedded whole (`cffEmbeddedWhole`); and an image with no bytes
   *  from `resourceBytes` (or bytes that did not decode), drawn as a
   *  placeholder and reported once per `fileId` as a `missingImage` warning
   *  carrying the page and the index of its document in `input`. Without
   *  it, the font warnings go to `console.warn` with their `message`, and
   *  a `missingImage` is not reported. A document that sets right-to-left
   *  or joining text while HarfBuzz cannot be loaded gets a
   *  `complexShapingUnavailable` warning. */
  onWarning?: (warning: PdfWarning) => void;
  /** Where to load HarfBuzz's `harfbuzz.wasm` from, for a document that
   *  sets right-to-left or joining scripts: its URL (a relative one
   *  resolves against the page's location) or its bytes. When omitted, the copy
   *  beside postext-pdf's module (`dist/harfbuzz.wasm`, which a bundler
   *  emits as an asset), then the same harfbuzzjs release from jsDelivr
   *  and esm.sh. Give it when a host serves the package's files elsewhere
   *  and cannot reach those CDNs. Only the first successful load counts:
   *  HarfBuzz is loaded once per module instance. */
  harfbuzzWasm?: HarfBuzzWasmSource;
  /** Print production settings (PDF/X standard, output profile, black,
   *  …). When omitted, the first document's `config.print`, else the
   *  defaults (no PDF/X). A PDF/X standard, or a `'cmyk'` colour space,
   *  separates every colour through the output profile (ICC), converts
   *  RGB pictures, makes 100 % K overprint and large black areas rich
   *  black. */
  print?: PrintConfig;
  /** The output profile's bytes (an `.icc` file): the catalogue profile
   *  `print.outputProfile` names, or the custom one. When omitted, a
   *  catalogue profile is fetched from `profileBaseUrl`. */
  outputProfile?: Uint8Array;
  /** Where catalogue profiles are fetched from (`<base>/<id>.icc`).
   *  Defaults to the npm CDN copy of postext's `icc/` folder. */
  profileBaseUrl?: string;
  /** The file's date (#734): its `/CreationDate` and `/ModDate` and, in a
   *  PDF/X render, the dates of the XMP packet, with the trailer `/ID` and
   *  the XMP `DocumentID` taken from it, the title and the page count.
   *  The same document rendered twice with one `date` gives the same
   *  bytes. When omitted, the file is stamped with the time of the call
   *  (and a PDF/X one gets a random id). The type `mtime` has in
   *  `createBundle`; an invalid date throws. */
  date?: Date | number | string;
}

/** `RenderToPdfOptions.date` as a date, or a throw that names the option. */
function checkedDate(date: Date | number | string): Date {
  const out = new Date(date);
  if (Number.isNaN(out.getTime())) {
    throw new Error(`postext-pdf: renderToPdf's \`date\` is not a valid date (got ${String(date)})`);
  }
  return out;
}

export interface RenderProgress {
  phase: 'prepare' | 'pages' | 'save';
  /** Pages rendered so far, and how many there are. */
  pages: number;
  totalPages: number;
}

export type { PdfFontAnswer, PdfFontFile, PdfFontFileDeclaration, PdfFontProvider, PdfFontRequest };
export { declaredFontFile } from '../fontCache.js';
export type { ResourceBytesProvider } from './blocks/renderResourceBlock.js';

/** The output settings of a render: each one from `options` when given,
 *  else from the document's `config.pdfGeneration` (a colour space only
 *  while its `forceColorSpace` is on), else the default — RGB, bookmarks
 *  and tagging on. */
function pdfSettings(
  options: Pick<RenderToPdfOptions, 'outlines' | 'accessible' | 'colorSpace'>,
  doc: VDTDocument | undefined,
): { outlines: boolean; accessible: boolean; colorSpace: PdfColorSpace } {
  const gen = doc?.config.pdfGeneration;
  return {
    outlines: options.outlines ?? gen?.outlines ?? true,
    accessible: options.accessible ?? gen?.accessible ?? true,
    colorSpace: options.colorSpace ?? (gen?.forceColorSpace ? gen.colorSpace : undefined) ?? 'rgb',
  };
}

/**
 * Render one document — or a book, as the documents of its chapters in
 * order, each laid out with the continuation of the ones before it — into
 * one PDF. The chapters share fonts, embedded resources and the structure
 * tree; page indices in contents links are book-absolute already, so they
 * resolve across chapters.
 */
/** `/ViewerPreferences << /Direction /R2L >>` and `/PageLayout
 *  /TwoPageRight` (page 1 alone, then pairs), for a right-bound book. */
export function setRightToLeft(pdfDoc: PDFDocument): void {
  pdfDoc.catalog.getOrCreateViewerPreferences().setReadingDirection(ReadingDirection.R2L);
  pdfDoc.catalog.set(PDFName.of('PageLayout'), PDFName.of('TwoPageRight'));
}

/** Whether any face sets a character HarfBuzz shapes. */
function setsComplexScript(fontText: FontText): boolean {
  for (const cps of fontText.values()) for (const cp of cps) if (codePointNeedsComplexShaping(cp)) return true;
  return false;
}

export async function renderToPdf(
  input: VDTDocument | VDTDocument[],
  options: RenderToPdfOptions,
): Promise<Uint8Array> {
  const docs = Array.isArray(input) ? input : [input];
  const first = docs[0];
  if (!first) throw new Error('postext-pdf: nothing to render');
  const totalPages = docs.reduce((n, d) => n + d.pages.length, 0);
  const date = options.date !== undefined ? checkedDate(options.date) : undefined;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  // pdf-lib stamps a new file with the time of the call.
  if (date) {
    pdfDoc.setCreationDate(date);
    pdfDoc.setModificationDate(date);
  }

  const metaTitle = metadataString(first.metadata?.title);
  const metaAuthor = metadataString(first.metadata?.author);
  if (metaTitle) pdfDoc.setTitle(metaTitle);
  if (metaAuthor) pdfDoc.setAuthor(metaAuthor);
  pdfDoc.setCreator('postext');
  pdfDoc.setProducer('postext-pdf');

  const warn = options.onWarning ?? ((w: PdfWarning) => { if ('message' in w) console.warn(w.message); });
  // What a provider says of its files (their ranges, the order they are
  // declared in: `PdfFontFile`, #770) is for the documents shaped in their
  // own language. With none in the render it is dropped here, so every
  // face is asked, embedded and read as before.
  const fontProvider = docs.some((doc) => shapingLanguageOf(doc.config) !== undefined) ? options.fontProvider : withBareFiles(options.fontProvider);
  const fontCache = new FontCache(pdfDoc, fontProvider, {
    onFallback: (f) => warn(fontFallbackWarning(f)),
    onFileIssue: (issue) => warn(fileIssueWarning(issue)),
  });
  // The faces of every chapter at once, each with the characters set in
  // it: a provider serving a family as slices is asked once per face.
  const fontText: FontText = new Map();
  for (const doc of docs) collectFontText(doc, fontText);
  await fontCache.preloadFontStrings(fontText);
  // HarfBuzz (WebAssembly) is fetched only for a document that sets
  // right-to-left or joining scripts; the pages are then shaped with it
  // synchronously. Without it the PDF still builds, its Arabic marks
  // misplaced: said loudly, since nothing else in the file shows it.
  if (setsComplexScript(fontText)) {
    await loadComplexShaper(options.harfbuzzWasm, ({ reason }) => warn({
      kind: 'complexShapingUnavailable',
      reason,
      message: `postext-pdf: HarfBuzz did not load, so right-to-left and joining text is shaped with fontkit and its marks are misplaced (${reason})`,
    }));
  }

  const missing = fontCache.missing();
  if (missing.length > 0) {
    throw new Error(
      `postext-pdf: failed to load font(s): ${missing.join(', ')}`,
    );
  }

  // Each setting: the option when given, else the first document's
  // `pdfGeneration`, else the default.
  const settings = pdfSettings(options, first);
  const printConfig: ResolvedPrintConfig = options.print ? resolvePrintConfig(options.print) : first.config.print ?? resolvePrintConfig();
  const printMode = await printColorMode(printConfig, settings.colorSpace, options, warn, docs);
  const colorSpace: ColorMode = printMode ?? settings.colorSpace;
  const pdfx = printMode && printMode.standard !== 'none' ? printMode.standard : undefined;
  let pageNegative = options.pageNegative ?? false;
  if (pageNegative && pdfx === 'pdfx1a') {
    pageNegative = false;
    warn({ kind: 'pageNegativeIgnored', message: 'postext-pdf: PDF/X-1a has no blend modes, so the page negative was left out' });
  }

  // Accessible output: the structure tree the pages tag their content into.
  const tree = settings.accessible
    ? new StructTree(pdfDoc, {
        title: documentTitle(docs),
        author: metaAuthor,
        lang: languageTag(first.config),
        producer: 'postext-pdf',
        creatorTool: 'postext',
        // Vertical text: the document's layout reads top to bottom, lines
        // right to left (`WritingMode /TbRl`, inherited by every element).
        ...(first.config.layout.writingMode === 'vertical-rl' ? { writingMode: 'TbRl' as const } : {}),
      })
    : undefined;

  // Resource images are embedded up front (async) so page rendering stays
  // sync; one map for every document, so a figure reused across chapters
  // is embedded once.
  const resourceImages: ResourceImageMap = new Map();
  for (const doc of docs) {
    await preloadResourceImages(pdfDoc, doc, options.resourceBytes, fontCache, fontProvider, resourceImages, options.rasterizeSvg, printMode, printMode ? undefined : settings.colorSpace);
    // Music scores (#1172): each system a vector drawing, its words' faces
    // embedded.
    await preloadScoreDrawings(doc, fontCache);
  }
  options.onProgress?.({ phase: 'prepare', pages: 0, totalPages });

  // Contents links carry book-absolute page indices; the registry maps them
  // onto the PDF's pages from the first document's offset.
  const linkRegistry = new LinkRegistry(first.pageIndexOffset ?? 0);
  let rendered = 0;
  // Placeholders are reported once per image for the whole file.
  const onWarning = options.onWarning;
  const reportedImages = new Set<string>();
  for (const [documentIndex, doc] of docs.entries()) {
    // Block ids restart per document: each gets its own structure flow
    // (paragraph fragments, lists and callouts never span chapters).
    const resourceCtx: ResourceRenderContext = {
      images: resourceImages,
      linkRegistry,
      structure: tree ? new StructureFlow(tree) : undefined,
    };
    linkRegistry.documentIndex = documentIndex;
    for (const page of doc.pages) {
      const onMissingImage = onWarning
        ? (fileId: string, resourceId?: string) => {
            if (reportedImages.has(fileId)) return;
            reportedImages.add(fileId);
            onWarning({ kind: 'missingImage', fileId, ...(resourceId !== undefined ? { resourceId } : {}), pageIndex: page.index, documentIndex });
          }
        : undefined;
      renderPage(pdfDoc, page, doc, fontCache, pageNegative, colorSpace, resourceCtx, tree, onMissingImage, options.characterGrid ?? false);
      // Black handling over the page's operators (overprint, rich black).
      if (printMode) runPagePrintPass(pdfDoc.getPage(pdfDoc.getPageCount() - 1), printMode);
      rendered++;
      options.onProgress?.({ phase: 'pages', pages: rendered, totalPages });
    }
  }

  // Attach inline-ref link annotations now that every destination is known.
  // A PDF/X file carries none: it is for the press, and annotations inside
  // the bleed box are not allowed.
  if (!pdfx) linkRegistry.finalize(pdfDoc, tree);

  if (settings.outlines) {
    addOutlines(pdfDoc, docs);
  }

  addPageLabels(pdfDoc, docs);

  tree?.finalize();
  // A right-bound book (`VDTDocument.binding`) tells viewers to lay its
  // spreads out right to left, page 1 alone (Acrobat and Foxit follow it;
  // Chrome's viewer does not).
  if (first.binding === 'right') setRightToLeft(pdfDoc);
  // Untagged output declares its language too (the tagged one did above).
  if (!tree) {
    const lang = languageTag(first.config);
    if (lang) pdfDoc.setLanguage(lang);
  }

  // Characters drawn with no glyph, once per face.
  for (const m of fontCache.missingGlyphs()) warn(missingGlyphWarning(m));

  // A face asked for but never drawn with is not written.
  fontCache.dropUnusedFonts();

  if (printMode && pdfx) {
    writePdfX(pdfDoc, printMode, {
      title: documentTitle(docs),
      ...(metaAuthor ? { author: metaAuthor } : {}),
      ...(languageTag(first.config) ? { lang: languageTag(first.config)! } : {}),
      producer: 'postext-pdf',
      creatorTool: 'postext',
      pdfua: !!tree,
      ...(date ? { date, pages: totalPages } : {}),
    }, !printMode.convertImages);
  }

  options.onProgress?.({ phase: 'save', pages: rendered, totalPages });
  // PDF/X-1a is PDF 1.4: no object or cross-reference streams.
  const bytes = await pdfDoc.save(pdfx === 'pdfx1a' ? { useObjectStreams: false } : {});
  if (pdfx) setHeaderVersion(bytes, pdfx === 'pdfx1a' ? '1.4' : '1.6');
  return bytes;
}

/** pdf-lib always writes `%PDF-1.7`; PDF/X-1a:2003 is PDF 1.4 and PDF/X-4
 *  PDF 1.6. The version has the same length, so no offset moves. */
function setHeaderVersion(bytes: Uint8Array, version: '1.4' | '1.6'): void {
  if (String.fromCharCode(...bytes.subarray(0, 8)) !== '%PDF-1.7') return;
  bytes[7] = version.charCodeAt(2);
}

/** The ICC print mode of a render, when it writes CMYK: a PDF/X standard
 *  always does, and so does a `'cmyk'` colour space. Undefined for RGB and
 *  grayscale output, and for plain CMYK when no profile could be loaded
 *  (then the naive conversion runs, with a warning). */
async function printColorMode(
  config: ResolvedPrintConfig,
  colorSpace: PdfColorSpace,
  options: Pick<RenderToPdfOptions, 'outputProfile' | 'profileBaseUrl'>,
  warn: (w: PdfWarning) => void,
  docs: readonly VDTDocument[],
): Promise<PrintColorMode | undefined> {
  const pdfx = config.standard !== 'none';
  if (!pdfx && colorSpace !== 'cmyk') return undefined;
  const custom = config.outputProfile === 'custom' ? config.customProfile : undefined;
  const info = custom ? undefined : outputProfileInfo(config.outputProfile);
  try {
    const profile = options.outputProfile
      ? parseIccProfile(options.outputProfile)
      : custom
        ? (() => { throw new Error(`the custom output profile "${custom.name}" was not given (outputProfile)`); })()
        : await loadOutputProfile(config.outputProfile, options.profileBaseUrl);
    if (profile.colorSpace !== 'CMYK') throw new Error(`the output profile "${profile.description}" is not a CMYK profile`);
    const condition = custom
      ? { registryName: custom.registryName ?? 'Custom', condition: custom.name, name: profile.description || custom.name }
      : { registryName: info!.registryName, condition: info!.condition, name: info!.name };
    const authored = new Map<string, CmykPercent>();
    for (const doc of docs) authoredCmykColors(doc.config, authored);
    return createPrintColorMode(profile, config, condition, authored);
  } catch (err) {
    const reason = (err as Error).message;
    if (pdfx) throw new Error(`postext-pdf: cannot write PDF/X without its output profile (${reason})`);
    warn({ kind: 'outputProfileUnavailable', message: `postext-pdf: output profile unavailable (${reason}); CMYK converted with the naive formula` });
    return undefined;
  }
}
