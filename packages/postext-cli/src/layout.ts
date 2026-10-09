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
import { buildBundle } from 'postext/bundle';
import type { Options } from './args';
import type { Book, BookChapter } from './input';
import { parseChapterList } from './input';
import type { Reporter } from './log';

export interface Layout {
  /** One document per chapter laid out. */
  docs: VDTDocument[];
  /** The chapters laid out (all, or those of --chapters). */
  chapters: BookChapter[];
  pageCount: number;
}

const MATH_RE = /\$[^$\n]+\$|\$\$/;
/** `[@key]`, `@key` after a space or bracket, or a front-matter bibliography. */
const CITATION_RE = /\[[^\]\n]*@[\p{L}\d_][^\]\n]*\]|^(?:references|bibliography|csl|citation-style)\s*:/mu;

let citeprocLoaded = false;

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

export async function layOut(book: Book, opts: Options, reporter: Reporter, cache?: MeasurementCache): Promise<Layout> {
  const chapters = selectChapters(book, opts);
  const text = chapters.map((c) => c.markdown);
  if (text.some((t) => MATH_RE.test(t))) await reporter.time('math', () => initMathEngine());
  if (!citeprocLoaded && text.some((t) => CITATION_RE.test(t))) {
    await reporter.time('citations', () => import('postext-citeproc/register'));
    citeprocLoaded = true;
  }
  for (const [i, chapter] of chapters.entries()) {
    for (const issue of parseMarkdownWithIssues(chapter.markdown).issues ?? []) {
      reporter.warn({ kind: issue.kind, severity: 'warning', message: describeIssue(issue), at: sourceAt(chapters[i], issue.sourceStart) });
    }
  }
  const docs = reporter.time('layout', () => buildBundle(
    { chapters, config: book.config, resources: book.resources },
    {
      cache: cache ?? createMeasurementCache(),
      onChapter: (index, doc) => reporter.detail(`  laid out ${chapters[index]!.file ?? chapters[index]!.title}: ${doc.pages.length} pages`),
    },
  ));
  docs.forEach((doc, i) => reportDocWarnings(doc, chapters[i]!, reporter));
  const pageCount = docs.reduce((n, d) => n + d.pages.length, 0);
  reporter.data.pages = pageCount;
  return { docs, chapters, pageCount };
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
