/**
 * One edition of a book laid out behind the reader (#867): the chapters
 * holding composed pages (and the contents), each continued after the
 * chapters before it as the paginator chains them, with the checks the
 * Checks panel lists for them. The Sandbox holds one edition of a book at
 * a time (the one on screen); the others are read from their draft or
 * from the bundle and laid out here, on the shared layout worker at
 * background priority, for the checks of every language and the
 * side-by-side view.
 *
 * Pure orchestration over a `build` function: the tests hand it the
 * engine itself.
 */

import type { PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { composeBookMemo } from '../book/compose.js';
import { layoutCacheKey } from '../book/layoutKeys.js';
import { chapterLayoutFromDoc, createBookPlanner } from '../book/pagination.js';
import type { BookStart, Chapter, ChapterLayout, ComposedBook } from '../book/types.js';
import { withHyphenationLocale } from '../controls/language/hyphenation.js';
import { computeComposedWarnings } from '../warnings/compute.js';
import type { Warning } from '../warnings/types.js';
import { planContent } from '../book/jumps.js';

/** An edition of a book, as the Sandbox would open it. */
export interface EditionSource {
  /** The edition's locale tag (`LoadedPreset.locale`, a draft's own). */
  locale: string;
  chapters: readonly Chapter[];
  config: PostextConfig;
  resources: Resource[];
  /** Layout records already known (a bundle's `layouts.json`, the book on
   *  screen's), so chapters laid out before need no build to be counted. */
  layouts?: Record<string, ChapterLayout>;
  start?: BookStart;
}

export interface EditionChapter {
  index: number;
  chapterId: string;
  title: string;
  /** The chapter's own book (its offsets are the document's). */
  book: ComposedBook;
  doc: VDTDocument | null;
  /** Its composed checks, chapter-attributed. */
  warnings: Warning[];
}

export interface EditionLayout {
  locale: string;
  /** Every chapter of the edition; `doc` is set on the ones laid out. */
  chapters: EditionChapter[];
  /** The configuration the chapters were laid out with. */
  config: PostextConfig;
  resources: Resource[];
  /** False when the paginator did not settle (a chapter kept being asked
   *  for): page numbers may then be the estimate's. */
  settled: boolean;
  builds: number;
}

export type EditionBuild = (content: PostextContent, config: PostextConfig, cacheKey: string) => Promise<VDTDocument>;

const COMPOSED_FENCE = /^::::page\b/m;
const TOC_FENCE = /^:::toc\b/m;

/** Whether a chapter is checked: it sets a composed page, or the contents
 *  (whose groups a column may cut, `tocGroupSplit`). */
export function chapterHasComposedChecks(markdown: string): boolean {
  return COMPOSED_FENCE.test(markdown) || TOC_FENCE.test(markdown);
}

export interface LayOutEditionOptions {
  /** Which chapters to lay out and check (default: those with a composed
   *  page or the contents). Every chapter before them is paginated. */
  wanted?: (chapter: Chapter, index: number) => boolean;
  /** Chapters whose document is already known (the one on screen): used
   *  as they are, not built again. */
  known?: ReadonlyMap<string, VDTDocument>;
  signal?: AbortSignal;
}

function abortIfNeeded(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

/** Lay an edition out: the paginator's pending chapters first, in book
 *  order (their page counts give the later chapters their numbers), then
 *  every wanted chapter not built yet, each with its plan's continuation. */
export async function layOutEdition(source: EditionSource, build: EditionBuild, options: LayOutEditionOptions = {}): Promise<EditionLayout> {
  const { chapters, resources, start } = source;
  const config = withHyphenationLocale(source.config, source.locale || 'en');
  const wanted = options.wanted ?? ((c: Chapter) => chapterHasComposedChecks(c.markdown));
  const planner = createBookPlanner();
  const layouts: Record<string, ChapterLayout> = { ...(source.layouts ?? {}) };
  const docs = new Map<string, VDTDocument>();
  let builds = 0;
  let settled = false;

  const buildChapter = async (id: string): Promise<VDTDocument | null> => {
    const known = options.known?.get(id);
    if (known) return known;
    const plan = planner.plan(chapters, source.config, resources, layouts, start);
    const chapterPlan = plan.byId[id];
    if (!chapterPlan) return null;
    const book = composeBookMemo(chapters, id);
    const content: PostextContent = {
      markdown: book.markdown,
      metadata: book.metadata,
      resources,
      continuation: chapterPlan.continuation,
      ...planContent(chapterPlan),
    };
    abortIfNeeded(options.signal);
    const doc = await build(content, config, layoutCacheKey({
      markdown: book.markdown, metadata: book.metadata, config, resources,
      continuation: chapterPlan.continuation, continuationKey: chapterPlan.continuationKey, outlineKey: chapterPlan.outlineKey,
    }));
    builds++;
    abortIfNeeded(options.signal);
    const target = chapters.find((c) => c.id === id);
    if (target) {
      const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: target.markdown, config: source.config, resources });
      if (layout) layouts[id] = layout;
    }
    return doc;
  };

  // Paginate: what the plan asks for next, until nothing is left.
  const limit = chapters.length * 6 + 4;
  for (let round = 0; round < limit; round++) {
    const plan = planner.plan(chapters, source.config, resources, layouts, start);
    const id = plan.pendingChapterId;
    if (id === null) {
      settled = true;
      break;
    }
    const before = layouts[id];
    const doc = await buildChapter(id);
    if (!doc) break;
    docs.set(id, doc);
    // The record did not change: asking again would not either.
    if (before && layouts[id] === before) break;
  }

  // The chapters checked, each laid out where the book now puts it.
  const out: EditionChapter[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i]!;
    const book = composeBookMemo(chapters, c.id);
    if (!wanted(c, i)) {
      out.push({ index: i, chapterId: c.id, title: c.title, book, doc: null, warnings: [] });
      continue;
    }
    let doc = options.known?.get(c.id) ?? docs.get(c.id) ?? null;
    if (!doc) {
      doc = await buildChapter(c.id);
      if (doc) docs.set(c.id, doc);
    }
    const warnings = computeComposedWarnings({ markdown: book.markdown, config, doc, resources, book });
    out.push({ index: i, chapterId: c.id, title: c.title, book, doc, warnings });
  }
  return { locale: source.locale, chapters: out, config, resources, settled, builds };
}
