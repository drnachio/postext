import { type PostextConfig, type VDTDocument, type Resource, type SvgFontFaceReport, extractFrontmatter, type OutputTransform, resolveContrastConfig, contrastDocument, resolvePrintConfig, resolvePdfGenerationConfig, preflightDocument } from 'postext';
import type { Warning, ContrastCheck, PreflightCheck, WarningPayload } from './types.js';
import type { PdfFontCheck } from '../controls/fonts/pdfFontWarnings.js';
import type { PreflightInputs } from '../print/preflightInputs.js';
import { contrastMediaFor, documentContrastPairs } from '../contrast/contrastStore.js';
import type { ComposedBook } from '../book/types.js';
import { fromBookOffset, fromBookLine } from '../book/compose.js';
import { frontmatterRange } from '../book/frontmatter.js';
import { isComposedCheckKind } from './composedChecks.js';
import { collectConfigValueWarnings } from './compute/design.js';
import { computeDocumentWarnings, collectEngineContentWarnings, type BookContent } from './compute/document.js';
import { collectLayoutWarnings } from './compute/layout.js';

export { configImageResourceIds } from './compute/resources.js';
export { collectHyphenationLocaleWarnings } from './compute/document.js';

export function computeWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
  resources?: Resource[];
  /** True when IndexedDB is unavailable, so binary resource payloads cannot
   *  be persisted or resolved. Surfaces the `storageUnavailable` warning. */
  storageUnavailable?: boolean;
  /** File ids of image payloads the previews could not read or decode
   *  (see `unavailableResourceImages`). Surfaces `missingImage`. */
  unavailableImages?: ReadonlySet<string>;
  /** SVG pictures whose fonts the previews could not all inline, by file
   *  id (see `svgFontIssues`). Surfaces `svgFontUnavailable` and
   *  `svgFontsTooLarge` (#630). */
  svgFontIssues?: ReadonlyMap<string, readonly SvgFontFaceReport[]>;
  /** The composed book `markdown` came from. When given, every located
   *  warning also carries its chapter and chapter-local line/offsets. */
  book?: ComposedBook;
  /** What the chapter's build is handed of the rest of its book (its
   *  plan's outline and citations, `planContent`): references to headings,
   *  anchors and sources of other chapters are not unknown (#1300). */
  bookContent?: BookContent;
  /** Chapter titles by id (for `chapterFrontmatterIgnored`). */
  chapterTitles?: ReadonlyMap<string, string>;
  /** The font warnings of the last PDF generated (see `pdfFontChecksFor`):
   *  `missingGlyph`, `variableFontDefaultInstance`, `cffEmbeddedWhole`. */
  pdfFontChecks?: readonly PdfFontCheck[];
  /** The book has changed since that PDF: its warnings are marked so. */
  pdfFontChecksStale?: boolean;
  /** What the print preflight needs beyond the document (the profile's
   *  separation, placed PDF reports, picture colours); absent, no
   *  preflight runs. */
  preflight?: PreflightInputs;
}): Warning[] {
  const { markdown, config, doc, resources = [], storageUnavailable = false, unavailableImages, svgFontIssues, book, bookContent, chapterTitles, pdfFontChecks = [], pdfFontChecksStale = false, preflight } = params;
  const warnings = computeDocumentWarnings({ markdown, config, doc, resources, storageUnavailable, unavailableImages, svgFontIssues, bookMetadata: book?.metadata, bookContent });
  warnings.push(...pdfFontWarnings(pdfFontChecks, pdfFontChecksStale));
  if (preflight && doc) warnings.push(...collectPreflightWarnings(doc, config, resources, preflight));
  if (doc) warnings.push(...collectContrastWarnings(doc, config, preflight?.transform));
  if (!book) return warnings;
  return attributeToChapters(warnings, book, chapterTitles);
}

/** The checks of a composed book in one chapter (#867): frames that do
 *  not fit, slots, fences, contents cut between columns, and the
 *  configuration's templates and design texts that hold content. What the
 *  Checks panel reads for every edition of a book, the one on screen and
 *  the others it lays out behind it. With `book`, chapter-attributed. */
export function computeComposedWarnings(params: {
  markdown: string;
  config: PostextConfig;
  doc: VDTDocument | null;
  resources?: Resource[];
  book?: ComposedBook;
}): Warning[] {
  const { markdown, config, doc, resources = [], book } = params;
  const metadata = book?.metadata ?? (extractFrontmatter(markdown).metadata as Record<string, unknown> | undefined);
  const found = [
    ...(doc ? collectLayoutWarnings(doc, markdown) : []),
    ...collectEngineContentWarnings(markdown, config, resources),
    ...collectConfigValueWarnings(config, resources, metadata),
  ].filter((w) => isComposedCheckKind(w.payload.kind));
  return book ? attributeToChapters(found, book) : found;
}

/** The contrast check (#748) of the laid-out document: the text and ground
 *  pairs under the book's level, on screen and (for a book set up for
 *  print, once its profile has loaded) on paper, and the reversed text too
 *  fine for the press. One entry per pair, with the book page of its first
 *  occurrence. */
export function collectContrastWarnings(doc: VDTDocument, config: PostextConfig, transform?: OutputTransform): Warning[] {
  const contrast = resolveContrastConfig(config.contrast);
  if (!contrast.enabled) return [];
  // A document that does not carry its page settings has no paper to read
  // the text against.
  if (!doc.config?.page?.backgroundColor || !doc.config.page.cutLines) return [];
  const issues = contrastDocument(doc, {
    contrast,
    media: contrastMediaFor(config, doc, contrast),
    pairs: documentContrastPairs(doc, contrast, transform),
    ...(transform ? { transform } : {}),
  });
  const offset = doc.pageIndexOffset ?? 0;
  return issues.map((issue): Warning => {
    const { sourceStart, sourceEnd, pageIndex } = issue;
    const check = { ...issue } as Partial<typeof issue>;
    delete check.rect;
    delete check.sourceStart;
    delete check.sourceEnd;
    delete check.pageIndex;
    return {
      id: `contrast-${issue.kind}-${issue.color}-${issue.background}-${issue.kind === 'lowContrast' ? issue.required : ''}`,
      payload: { kind: 'contrast', check: check as ContrastCheck, page: doc.pages[pageIndex - offset]?.pageNumberValue ?? pageIndex + 1 },
      ...(sourceStart !== undefined ? { sourceStart, ...(sourceEnd !== undefined ? { sourceEnd } : {}) } : {}),
    };
  });
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/** The print preflight (#605) of the laid-out document, when the book is
 *  set up for print: the engine's checks
 *  (`preflightDocument`) and the placed PDFs' reports, critical first, each
 *  with the book page number to jump to. */
export function collectPreflightWarnings(doc: VDTDocument, config: PostextConfig, resources: readonly Resource[], inputs: PreflightInputs): Warning[] {
  const print = resolvePrintConfig(config.print);
  if (!print.preflight.enabled) return [];
  const pdfGen = resolvePdfGenerationConfig(config.pdfGeneration);
  const cmyk = print.standard !== 'none' || (pdfGen.forceColorSpace && pdfGen.colorSpace === 'cmyk');
  // Only a book set up for print is checked as one: a PDF/X standard, a
  // CMYK PDF, or crop marks.
  if (!cmyk && !doc.config.page.cutLines.enabled) return [];
  const issues = preflightDocument(doc, {
    print,
    resources,
    cmyk,
    imageColor: inputs.imageColor,
    imageSize: inputs.imageSize,
    ...(inputs.transform ? { transform: inputs.transform } : {}),
  });
  const offset = doc.pageIndexOffset ?? 0;
  const pageNumber = (pageIndex: number) => doc.pages[pageIndex - offset]?.pageNumberValue ?? pageIndex + 1;
  // One RGB note per picture, not per page it is on.
  const rgbSeen = new Set<string>();
  const sorted = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.pageIndex - b.pageIndex);
  const out: Warning[] = [];
  sorted.forEach((issue, i) => {
    if (issue.kind === 'rgbImage') {
      if (rgbSeen.has(issue.fileId)) return;
      rgbSeen.add(issue.fileId);
    }
    const { sourceStart, sourceEnd, pageIndex } = issue;
    const check = { ...issue } as Partial<typeof issue>;
    delete check.rect;
    delete check.sourceStart;
    delete check.sourceEnd;
    delete check.pageIndex;
    out.push({
      id: `preflight-${issue.kind}-${pageIndex}-${i}`,
      payload: { kind: 'preflight', check: check as PreflightCheck, page: pageNumber(pageIndex) },
      ...(sourceStart !== undefined ? { sourceStart, ...(sourceEnd !== undefined ? { sourceEnd } : {}) } : {}),
    });
  });
  // Placed PDF masters.
  for (const r of resources) {
    const id = r.svg?.pdfFileId;
    const report = id ? inputs.masters.get(id) : undefined;
    if (!report) continue;
    const name = r.caption?.trim() || r.id;
    if (print.preflight.checkFonts && report.nonEmbeddedFonts.length > 0) {
      out.push({ id: `preflight-masterFonts-${r.id}`, payload: { kind: 'preflight', check: { kind: 'masterFonts', severity: 'warning', name, fonts: report.nonEmbeddedFonts } } });
    }
    if (cmyk && report.rgb) {
      out.push({ id: `preflight-masterRgb-${r.id}`, payload: { kind: 'preflight', check: { kind: 'masterRgb', severity: print.standard === 'pdfx1a' ? 'critical' : 'warning', name } } });
    }
    if (print.standard === 'pdfx1a' && report.transparency) {
      out.push({ id: `preflight-masterTransparency-${r.id}`, payload: { kind: 'preflight', check: { kind: 'masterTransparency', severity: 'critical', name, x1a: true } } });
    }
  }
  return out;
}

/** The Checks-panel entries of the last PDF's font warnings, one per face
 *  and kind. They point at no place in the text. `stale`: the book has
 *  changed since that PDF, and each entry says so. */
export function pdfFontWarnings(checks: readonly PdfFontCheck[], stale = false): Warning[] {
  const out: Warning[] = [];
  const seen = new Set<string>();
  for (const check of checks) {
    const id = `pdf-${check.kind}-${check.family}-${check.weight}-${check.style}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const face = { family: check.family, weight: check.weight, style: check.style, ...(stale ? { stale: true as const } : {}) };
    const payload: WarningPayload = check.kind === 'missingGlyph'
      ? { kind: 'missingGlyph', ...face, characters: [...check.characters] }
      : check.kind === 'variableFontDefaultInstance'
        ? { kind: 'variableFontDefaultInstance', ...face, defaultWeight: check.defaultWeight }
        : { kind: 'cffEmbeddedWhole', ...face, bytes: check.bytes };
    out.push({ id, payload });
  }
  return out;
}

/** Add chapter attribution to every located warning and flag later chapters
 *  whose text starts with a front-matter block (the book ignores it). */
export function attributeToChapters(
  warnings: Warning[],
  book: ComposedBook,
  chapterTitles?: ReadonlyMap<string, string>,
): Warning[] {
  const out: Warning[] = warnings.map((w) => {
    if (w.sourceStart === undefined) return w;
    const start = fromBookOffset(book, w.sourceStart);
    const end = w.sourceEnd !== undefined ? fromBookOffset(book, w.sourceEnd) : start;
    const seg = book.segments.find((s) => s.chapterId === start.chapterId)!;
    const chapterLine = w.line !== undefined ? fromBookLine(book, w.line).line : undefined;
    return {
      ...w,
      chapterId: start.chapterId,
      chapterIndex: seg.index,
      chapterLine,
      chapterStart: start.offset,
      chapterEnd: end.chapterId === start.chapterId ? end.offset : seg.end - seg.start,
    };
  });
  if (book.scope === 'book') {
    book.segments.forEach((seg, i) => {
      if (i === 0) return;
      const text = book.markdown.slice(seg.start, seg.end);
      // The composed text has the block blanked; detect it by the first line
      // being all spaces of width 3 followed by a newline (`---` blanked).
      if (!/^ {3}\r?\n/.test(text)) return;
      const original = chapterTitles?.get(seg.chapterId) ?? String(i + 1);
      out.push({
        id: `chapter-frontmatter-${seg.chapterId}`,
        payload: { kind: 'chapterFrontmatterIgnored', chapterTitle: original },
        sourceStart: seg.start,
        sourceEnd: seg.start,
        line: seg.lineStart + 1,
        chapterId: seg.chapterId,
        chapterIndex: seg.index,
        chapterLine: 1,
        chapterStart: 0,
        chapterEnd: 0,
      });
    });
  }
  return out;
}

/** True when `markdown` begins with a front-matter block. */
export function hasFrontmatter(markdown: string): boolean {
  return frontmatterRange(markdown) !== null;
}
