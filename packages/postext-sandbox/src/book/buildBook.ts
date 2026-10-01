/**
 * The whole book laid out for a page viewer (the canvas, the folio): every
 * chapter on its own, after the pages the ones before it came to, kept from
 * the last build when nothing it depends on changed. The documents are
 * stitched into one by the caller (`stitchDocuments`).
 */
import type { LayoutContinuation, NumeralStyle, PostextConfig, PostextContent, Resource, VDTDocument } from 'postext';
import { composeBookMemo } from './compose';
import { layoutCacheKey, stableStringify } from './layoutKeys';
import { chapterLayoutFromDoc } from './pagination';
import type { StitchedChapter } from './stitch';
import type { BookPlan, Chapter, ChapterLayout, ComposedBook } from './types';

/** One chapter's document as last built, with the key of everything it
 *  was built from (a hit spares the worker). */
export interface HeldChapterDoc {
  key: string;
  doc: VDTDocument;
  source: ComposedBook;
}

export interface BookBuild {
  /** Every chapter's document, by chapter id (the next build's `held`). */
  held: Map<string, HeldChapterDoc>;
  /** The documents in book order, for `stitchDocuments`. */
  built: StitchedChapter[];
  /** Layout records of the chapters the plan already starts where they
   *  actually start (the others are recorded as the plan catches up). */
  records: ChapterLayout[];
}

export interface BuildBookInput {
  chapters: readonly Chapter[];
  plan: BookPlan;
  /** The config the layout runs with, and the state's own (layout records
   *  are keyed on it). */
  config: PostextConfig;
  rawConfig: PostextConfig;
  resources: Resource[];
  held: ReadonlyMap<string, HeldChapterDoc>;
  build: (content: PostextContent, config: PostextConfig, opts?: { cacheKey?: string }) => Promise<VDTDocument>;
  cancelled: () => boolean;
}

/** Lays the book out; null when the build was cancelled or the plan lags
 *  behind a chapter just added (the next build starts over). */
export async function buildBookChapters({ chapters, plan, config, rawConfig, resources, held, build, cancelled }: BuildBookInput): Promise<BookBuild | null> {
  const next = new Map<string, HeldChapterDoc>();
  const built: StitchedChapter[] = [];
  const records: ChapterLayout[] = [];
  let offset = 0;
  let nextNumbering: { format: NumeralStyle; startAt: number } | null = null;
  for (const chapter of chapters) {
    const chapterPlan = plan.byId[chapter.id];
    if (!chapterPlan) return null;
    const source = composeBookMemo(chapters, chapter.id);
    // The first chapter inherits nothing but the book's page count; the
    // page fields of a plan not yet paginated are provisional.
    const { pageNumbering: planNumbering, ...inherited } = chapterPlan.continuation ?? {};
    const numbering = nextNumbering ?? (chapterPlan.paginated ? planNumbering : undefined);
    const continuation: LayoutContinuation | undefined = chapterPlan.index === 0
      ? chapterPlan.continuation
      : { ...inherited, pageIndexOffset: offset, ...(numbering ? { pageNumbering: numbering } : {}) };
    const keyInput = { markdown: source.markdown, metadata: source.metadata, config, resources, continuation, outlineKey: chapterPlan.outlineKey };
    // What the chapter was built from, whatever the records say: the
    // counters and pages it actually continues.
    const key = layoutCacheKey({ ...keyInput, continuationKey: `stitched:${stableStringify(continuation ?? null)}` });
    const hit = held.get(chapter.id);
    let doc: VDTDocument;
    if (hit && hit.key === key) {
      doc = hit.doc;
    } else {
      doc = await build(
        { markdown: source.markdown, metadata: source.metadata, resources, continuation, outline: chapterPlan.outline, ...(chapterPlan.citations ? { citations: chapterPlan.citations } : {}) },
        config,
        // Under the key the paginator and the PDF tab use, when the plan's
        // page chain agrees with the actual one, so the worker's cache is
        // shared.
        { cacheKey: layoutCacheKey({ ...keyInput, continuationKey: chapterPlan.paginated ? chapterPlan.continuationKey : `stitched:${stableStringify(continuation ?? null)}` }) },
      );
      if (cancelled()) return null;
    }
    next.set(chapter.id, { key, doc, source });
    built.push({ chapterId: chapter.id, doc });
    if (chapterPlan.paginated && (chapterPlan.continuation?.pageIndexOffset ?? 0) === offset) {
      const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: chapter.markdown, config: rawConfig, resources });
      if (layout) records.push(layout);
    }
    offset += doc.pages.length;
    const last = doc.pages[doc.pages.length - 1];
    if (last) nextNumbering = { format: last.pageNumberFormat, startAt: last.pageNumberValue + 1 };
  }
  return cancelled() ? null : { held: next, built, records };
}
