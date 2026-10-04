// The whole book as the print viewers take it: every chapter laid out on
// the layout worker after the pages the chapters before it came to, one
// document per chapter (the chain `renderToPdf` and `renderToEpub` read).
// The PDF tab's book scope and the EPUB tab share it.

import { configUsesPlaceholder, type PostextConfig, type PostextContent, type Resource, type VDTDocument } from 'postext';
import { layOutBookChain } from './chain';
import { composeBookMemo } from './compose';
import { layoutCacheKey } from './layoutKeys';
import type { BookPlan, Chapter } from './types';

export interface BookPrintChainInput {
  plan: BookPlan;
  chapters: readonly Chapter[];
  resources: Resource[];
  /** The configuration the layout runs with (hyphenation locale applied). */
  config: PostextConfig;
  build: (content: PostextContent, config: PostextConfig, opts: { cacheKey: string }) => Promise<VDTDocument>;
  /** Told before each chapter is laid out: its place in the book, the
   *  number of chapters and the pages laid out before it. */
  onChapter?: (index: number, count: number, pagesBefore: number) => void;
}

/** The book as its chapters in order, each laid out after the ones before
 *  it — the documents the previews show, so a chapter the worker has
 *  already built (or holds in its cache) costs nothing and the contents
 *  chapter is laid out once, with the outline the plan already settled.
 *  Pages and numbering chain on what the chapters actually came to, not on
 *  the records; so does the book's page count (`{bookTotalPages}`) when a
 *  chapter printed another one than the book came to. */
export function layOutBookPrint({ plan, chapters, resources, config, build, onChapter }: BookPrintChainInput): Promise<VDTDocument[]> {
  const count = plan.chapters.length;
  return layOutBookChain(
    plan.chapters,
    async (chapterPlan, continuation, pagesBefore) => {
      const chapter = chapters.find((c) => c.id === chapterPlan.chapterId);
      if (!chapter) return null;
      onChapter?.(chapterPlan.index, count, pagesBefore);
      const book = composeBookMemo(chapters, chapter.id);
      return build(
        { markdown: book.markdown, metadata: book.metadata, resources, continuation, outline: chapterPlan.outline, ...(chapterPlan.citations ? { citations: chapterPlan.citations } : {}) },
        config,
        {
          cacheKey: layoutCacheKey({
            markdown: book.markdown,
            metadata: book.metadata,
            config,
            resources,
            continuation,
            continuationKey: chapterPlan.continuationKey,
            outlineKey: chapterPlan.outlineKey,
          }),
        },
      );
    },
    configUsesPlaceholder(config, 'bookTotalPages'),
  );
}
