// A whole book paginated without the interface: the plan asks for the
// chapter whose pages are not known yet, the chapter is laid out on the
// layout service, its record joins the others, until the plan asks for
// nothing (`viewport/ChapterPaginator.tsx` does the same one chapter at a
// time in the provider). The headless Sandbox check (#736) and the Books
// panel's compiler (#1526) run it.

import type { PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { composeBookMemo } from './compose.js';
import { planContent } from './jumps.js';
import { layoutCacheKey } from './layoutKeys.js';
import { chapterLayoutFromDoc, createBookPlanner, sameChapterLayout } from './pagination.js';
import type { BookPlan, BookStart, Chapter, ChapterLayout } from './types.js';

export interface PaginateBookInput {
  chapters: readonly Chapter[];
  /** The book's configuration: the records are keyed on it. */
  config: PostextConfig;
  /** The configuration the layout runs with (hyphenation locale applied). */
  effective: PostextConfig;
  resources: Resource[];
  start?: BookStart;
  /** Records known already (stored ones): the plan starts from them. */
  layouts?: Record<string, ChapterLayout>;
  build: (content: PostextContent, config: PostextConfig, cacheKey: string) => Promise<VDTDocument>;
  /** Told before each chapter is laid out: its place in the book. */
  onChapter?: (index: number, count: number) => void;
}

export interface PaginatedBook {
  plan: BookPlan;
  /** Every record, the ones given and the ones found here. */
  layouts: Record<string, ChapterLayout>;
  /** The records found here. */
  found: ChapterLayout[];
  /** The documents laid out here, by chapter id. */
  docs: Map<string, VDTDocument>;
  builds: number;
  /** False when the plan did not settle (a chapter kept being asked for). */
  settled: boolean;
}

export async function paginateBook(input: PaginateBookInput): Promise<PaginatedBook> {
  const { chapters, config, effective, resources, start, build } = input;
  const planner = createBookPlanner();
  const layouts: Record<string, ChapterLayout> = { ...(input.layouts ?? {}) };
  const found: ChapterLayout[] = [];
  const docs = new Map<string, VDTDocument>();
  let builds = 0;
  let plan = planner.plan(chapters, config, resources, layouts, start);
  // A chapter is built again when the ones before it change its start or
  // the book's outline: a few rounds per chapter at most.
  const limit = chapters.length * 6 + 4;
  for (let round = 0; round < limit; round++) {
    const id = plan.pendingChapterId;
    if (id === null) return { plan, layouts, found, docs, builds, settled: true };
    const chapterPlan = plan.byId[id];
    const target = chapters.find((c) => c.id === id);
    if (!chapterPlan || !target) break;
    input.onChapter?.(chapters.indexOf(target), chapters.length);
    const book = composeBookMemo(chapters, id);
    const content: PostextContent = {
      markdown: book.markdown, metadata: book.metadata, resources,
      continuation: chapterPlan.continuation, ...planContent(chapterPlan),
    };
    const doc = await build(content, effective, layoutCacheKey({
      markdown: book.markdown, metadata: book.metadata, config: effective, resources,
      continuation: chapterPlan.continuation, continuationKey: chapterPlan.continuationKey, outlineKey: chapterPlan.outlineKey,
    }));
    builds++;
    docs.set(id, doc);
    const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: target.markdown, config, resources });
    // No record, or the record there already: the plan would ask again.
    if (!layout || (layouts[id] && sameChapterLayout(layouts[id], layout))) break;
    layouts[id] = layout;
    found.push(layout);
    plan = planner.plan(chapters, config, resources, layouts, start);
  }
  return { plan, layouts, found, docs, builds, settled: false };
}
