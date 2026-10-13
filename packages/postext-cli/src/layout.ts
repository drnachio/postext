// Lay a book out the way the Sandbox does: chapter by chapter, each one
// continuing the last (`buildBundle`), with the maths and citation engines
// loaded only when the text needs them. Problems the engine reports are
// collected with the chapter file and line they come from.

import {
  createMeasurementCache,
  formatWarning,
  initMathEngine,
  parseMarkdownWithIssues,
  type MeasurementCache,
  type VDTDocument,
} from 'postext';
import { buildBundle, type BundleLayoutCache } from 'postext/bundle';
import type { Options } from './args';
import { fontFallbackWarnings, type FontSet } from './fonts';
import type { Book, BookChapter } from './input';
import { parseChapterList } from './input';
import type { Reporter } from './log';

export interface Layout {
  /** One document per chapter laid out. */
  docs: VDTDocument[];
  /** The chapters laid out (all, or those of --chapters). */
  chapters: BookChapter[];
  pageCount: number;
  /** For each chapter, whether this layout laid it out (false: the
   *  document of an earlier layout stands, from the layout cache). */
  laidOut: boolean[];
}

const MATH_RE = /\$[^$\n]+\$|\$\$/;
/** `[@key]`, `@key` after a space or bracket, or a front-matter bibliography. */
const CITATION_RE = /\[[^\]\n]*@[\p{L}\d_][^\]\n]*\]|^(?:references|bibliography|csl|citation-style)\s*:/mu;

let citeprocLoaded = false;

type ParseIssues = ReturnType<typeof parseMarkdownWithIssues>['issues'];
/** The parse problems of each chapter text of the last layout: --watch
 *  parses again only the chapters that changed. */
let issuesByText = new Map<string, ParseIssues>();

/** "chapters/02.md:14" for an offset in a chapter's Markdown. */
export function sourceAt(chapter: BookChapter | undefined, offset: number | undefined): string | undefined {
  if (!chapter || offset === undefined || offset < 0) return undefined;
  const line = chapter.markdown.slice(0, offset).split('\n').length;
  return `${chapter.file ?? chapter.title}:${line}`;
}

export function selectChapters(book: Book, opts: Options): BookChapter[] {
  const spec = opts.string('chapters');
  if (!spec) return book.chapters;
  return parseChapterList(spec, book.chapters.length).map((i) => book.chapters[i]!);
}

/**
 * `config` as the command line lays it out: with the text shaped in the
 * host's language (`bodyText.shapingLanguage: 'host'`, #764), whatever it
 * names. A browser shapes a document in its own language, the default
 * from postext 1.30 (#770); Skia's canvas takes a language and shapes
 * without it (@napi-rs/canvas 1.0: the widths of Noto Serif SC, of Noto
 * Serif JP and of a face with Catalan and Turkish forms are the same
 * under every `lang`), so what is measured here is the forms of each
 * font's default language. The outputs are told so: a PDF shaped in the
 * document's language would set a Catalan `l·l` or a Turkish `fi` in
 * other glyphs than the ones their places were measured for.
 */
export function shapedBySkia<T extends { bodyText?: object }>(config: T): T {
  return { ...config, bodyText: { ...config.bodyText, shapingLanguage: 'host' } };
}

/** Lay `book` out. With a `layoutCache` (--watch), only the chapters whose
 *  inputs changed since the layout that filled it are laid out again. */
export async function layOut(
  book: Book,
  opts: Options,
  reporter: Reporter,
  cache?: MeasurementCache,
  fonts?: FontSet,
  layoutCache?: BundleLayoutCache,
): Promise<Layout> {
  const chapters = selectChapters(book, opts);
  const text = chapters.map((c) => c.markdown);
  if (text.some((t) => MATH_RE.test(t))) await reporter.time('math', () => initMathEngine());
  if (!citeprocLoaded && text.some((t) => CITATION_RE.test(t))) {
    await reporter.time('citations', () => import('postext-citeproc/register'));
    citeprocLoaded = true;
  }
  const issues = new Map<string, ParseIssues>();
  for (const [i, chapter] of chapters.entries()) {
    const found = issues.get(chapter.markdown) ?? issuesByText.get(chapter.markdown) ?? parseMarkdownWithIssues(chapter.markdown).issues;
    issues.set(chapter.markdown, found);
    for (const issue of found ?? []) {
      reporter.warn({ kind: issue.kind, severity: 'warning', message: describeIssue(issue), at: sourceAt(chapters[i], issue.sourceStart) });
    }
  }
  issuesByText = issues;
  // Where the book starts (`preset.json`'s `start`) is where its first
  // chapter does: a selection that leaves that chapter out (--chapters) is
  // laid out from page 1, as it always was.
  const start = chapters[0] === book.chapters[0] ? book.start : undefined;
  const docs = reporter.time('layout', () => buildBundle(
    { chapters, config: shapedBySkia(book.config), resources: book.resources, ...(start ? { start } : {}) },
    {
      cache: cache ?? createMeasurementCache(),
      ...(layoutCache ? { layoutCache } : {}),
    },
  ));
  const laidOut = layoutCache ? layoutCache.stats.laidOut : docs.map(() => true);
  docs.forEach((doc, i) => reporter.detail(`  ${laidOut[i] ? 'laid out' : 'kept'} ${chapters[i]!.file ?? chapters[i]!.title}: ${doc.pages.length} pages`));
  docs.forEach((doc, i) => reportDocWarnings(doc, chapters[i]!, reporter));
  // A weight the family ships, set in another face (#741).
  if (fonts) for (const warning of fontFallbackWarnings(docs, fonts)) reporter.warn(warning);
  const pageCount = docs.reduce((n, d) => n + d.pages.length, 0);
  reporter.data.pages = pageCount;
  return { docs, chapters, pageCount, laidOut };
}

function describeIssue(issue: { kind: string }): string {
  switch (issue.kind) {
    case 'unclosedMath':
      return 'a $ opens maths that never closes';
    case 'unclosedContainer':
      return 'a ::: block is never closed';
    default:
      return issue.kind;
  }
}

/** The page a book-absolute page index prints as. */
export function pageLabelOf(doc: VDTDocument, pageIndex: number | undefined): string | undefined {
  if (pageIndex === undefined) return undefined;
  const local = pageIndex - (doc.pageIndexOffset ?? 0);
  const page = doc.pages[local] ?? doc.pages[pageIndex];
  return page ? String(page.pageLabel ?? page.pageNumberValue ?? local + 1) : undefined;
}

function reportDocWarnings(doc: VDTDocument, chapter: BookChapter, reporter: Reporter): void {
  type Any = Parameters<typeof formatWarning>[0] & { sourceStart?: number; pageIndex?: number };
  const all: Any[] = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? []), ...(doc.configWarnings ?? [])] as Any[];
  for (const w of all) {
    const local = w.pageIndex !== undefined ? doc.pages[w.pageIndex] : undefined;
    reporter.warn({
      kind: w.kind,
      severity: 'warning',
      message: formatWarning(w),
      at: sourceAt(chapter, w.sourceStart),
      ...(local ? { page: String(local.pageLabel ?? local.pageNumberValue) } : {}),
    });
  }
}
