// How a book is laid out one chapter at a time. Each chapter goes to the
// engine on its own with a `continuation`: the heading and resource counters
// of the chapters before it (pure over their text, chained with
// `continuationAfter`) and the pages before it (from the last layout of each
// preceding chapter, recorded as a `ChapterLayout`). Page numbers thus run
// on across chapters without ever laying out the whole book in a preview.

import { contentOutline, continuationAfter, outlineFromDoc, outlineKey, resolvePageConfig } from 'postext';
import type { LayoutContinuation, NumeralStyle, OutlineEntry, PostextConfig, Resource, VDTDocument } from 'postext';
import type { BookPages, BookPlan, Chapter, ChapterLayout, ChapterPlan } from './types';

interface CountersEntry {
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
  before: LayoutContinuation | undefined;
  after: LayoutContinuation;
  /** Fingerprint of `after`'s counters. */
  key: string;
  /** The chapter's outline from its text alone (no page labels). */
  outline: OutlineEntry[];
  /** Whether the chapter prints the contents (`:::toc`). */
  hasToc: boolean;
}

export interface BookPlanner {
  plan(chapters: readonly Chapter[], config: PostextConfig, resources: Resource[], layouts: Record<string, ChapterLayout>): BookPlan;
}

function countersKey(c: LayoutContinuation | undefined): string {
  if (!c) return '';
  const h = c.headings;
  const headings = h ? `${h.h1}.${h.h2}.${h.h3}.${h.h4}.${h.h5}.${h.h6}` : '';
  const counters = c.resourceCounters
    ? Object.keys(c.resourceCounters).sort().map((t) => {
      const e = c.resourceCounters![t]!;
      return `${t}=${e.counter}@${e.heading.h1}.${e.heading.h2}.${e.heading.h3}.${e.heading.h4}.${e.heading.h5}.${e.heading.h6}`;
    }).join(',')
    : '';
  const numbers = c.resourceNumbers
    ? Object.keys(c.resourceNumbers).sort().map((id) => `${id}=${c.resourceNumbers![id]!.number}`).join(',')
    : '';
  const part = c.part
    ? `${c.part.number}/${c.part.title}/${Object.entries(c.part.palette ?? {}).sort().map(([k, v]) => `${k}=${v}`).join(',')}`
    : '';
  return `${headings}|${counters}|${numbers}|${part}`;
}

/** Whether `layout` was built from the chapter's current inputs. */
export function chapterLayoutIsCurrent(
  layout: ChapterLayout | undefined,
  chapter: Chapter,
  config: PostextConfig,
  resources: Resource[],
  continuationKey: string,
  /** The book outline the chapter must have been laid out with (a chapter
   *  printing the contents); not checked when omitted. */
  outlineKeyOf?: string,
): layout is ChapterLayout {
  return !!layout
    && layout.markdown === chapter.markdown
    && layout.config === config
    && layout.resources === resources
    && layout.continuationKey === continuationKey
    && (outlineKeyOf === undefined || layout.outlineKey === outlineKeyOf);
}

/** Whether two plans of a chapter hand the engine the same inputs — the
 *  parts of a plan a layout depends on. The plan's `layout` record is the
 *  build's own output, so a preview selecting its plan through this
 *  equality does not rebuild when its previous build lands (the plan is
 *  re-derived, as new objects, whenever any chapter's layout is recorded);
 *  the counters are covered by `continuationKey`, the page fields compared
 *  by value. */
export function sameLayoutInputs(a: ChapterPlan, b: ChapterPlan): boolean {
  if (a === b) return true;
  if (
    a.chapterId !== b.chapterId
    || a.index !== b.index
    || a.paginated !== b.paginated
    || a.continuationKey !== b.continuationKey
    || a.outlineKey !== b.outlineKey
  ) return false;
  const ca = a.continuation;
  const cb = b.continuation;
  if (!ca || !cb) return ca === cb;
  return ca.pageIndexOffset === cb.pageIndexOffset
    && ca.pageNumbering?.format === cb.pageNumbering?.format
    && ca.pageNumbering?.startAt === cb.pageNumbering?.startAt;
}

/** Whether two layout records say the same thing about a chapter: built
 *  from the same inputs (by identity, as {@link chapterLayoutIsCurrent}
 *  checks them) with the same page outcome. Recording such a record again
 *  changes nothing downstream. */
export function sameChapterLayout(a: ChapterLayout | undefined, b: ChapterLayout): boolean {
  return !!a
    && a.chapterId === b.chapterId
    && a.markdown === b.markdown
    && a.config === b.config
    && a.resources === b.resources
    && a.continuationKey === b.continuationKey
    && a.pageCount === b.pageCount
    && a.leadingBlankPages === b.leadingBlankPages
    && a.lastPageDelta === b.lastPageDelta
    && a.lastPageFormat === b.lastPageFormat
    && a.outlineKey === b.outlineKey
    && outlineKey(a.outline) === outlineKey(b.outline);
}

/** A planner keeps the per-chapter counter chain cached, so a keystroke in
 *  chapter 9 re-derives nothing for chapters 1–8 and only the chapters after
 *  the edited one are re-counted. */
export function createBookPlanner(): BookPlanner {
  const cache = new Map<string, CountersEntry>();

  const countersAfter = (
    chapter: Chapter,
    config: PostextConfig,
    resources: Resource[],
    before: LayoutContinuation | undefined,
  ): CountersEntry => {
    const hit = cache.get(chapter.id);
    if (
      hit
      && hit.markdown === chapter.markdown
      && hit.config === config
      && hit.resources === resources
      && hit.before === before
    ) return hit;
    const after = continuationAfter({ markdown: chapter.markdown, resources }, config, before);
    const { outline, hasToc } = contentOutline({ markdown: chapter.markdown }, config, before);
    const entry: CountersEntry = {
      markdown: chapter.markdown,
      config,
      resources,
      before,
      after,
      key: countersKey(after),
      outline,
      hasToc,
    };
    cache.set(chapter.id, entry);
    return entry;
  };

  return {
    plan(chapters, config, resources, layouts) {
      const numbering = resolvePageConfig(config.page).pageNumbering;
      const plans: ChapterPlan[] = [];
      const byId: Record<string, ChapterPlan> = {};
      const bookPages: BookPages = {};
      let pendingChapterId: string | null = null;
      // Counters inherited by the chapter being planned (undefined = first).
      let counters: LayoutContinuation | undefined;
      let countersFingerprint = '';
      // Pages before the chapter being planned; null once unknown.
      let pages: { physical: number; number: number; format: NumeralStyle } | null = { physical: 0, number: numbering.startAt, format: numbering.format };

      // The book's outline: every chapter's headings and parts, with the
      // page labels of the chapters whose layout is current — a chapter
      // printing the contents (`:::toc`) is laid out with it and again
      // whenever it changes. Assembled first, over the counter chain, so
      // the chapter with the contents (usually the front matter, before
      // every other chapter) sees the whole book.
      const entries: CountersEntry[] = [];
      {
        let before: LayoutContinuation | undefined;
        for (const chapter of chapters) {
          const entry = countersAfter(chapter, config, resources, before);
          entries.push(entry);
          before = entry.after;
        }
      }
      const anyToc = entries.some((e) => e.hasToc);
      const bookOutline: OutlineEntry[] = anyToc
        ? chapters.flatMap((chapter, index) => {
          const stored = layouts[chapter.id];
          const entry = entries[index]!;
          // A record built from the chapter's current text carries the
          // page labels; its outline is preferred whenever its titles
          // match the text (the page chain may still move it).
          return stored && stored.markdown === chapter.markdown && stored.config === config && stored.outline.length === entry.outline.length
            ? stored.outline
            : entry.outline;
        })
        : [];
      const bookOutlineKey = anyToc ? outlineKey(bookOutline) : '';

      chapters.forEach((chapter, index) => {
        const first = index === 0;
        const paginated = pages !== null;
        const continuation: LayoutContinuation | undefined = first
          ? undefined
          : {
            ...counters,
            ...(pages ? { pageIndexOffset: pages.physical, pageNumbering: { format: pages.format, startAt: pages.number } } : {}),
          };
        const continuationKey = first
          ? 'first'
          : pages
            ? `${countersFingerprint}|${pages.physical % 2}|${pages.format}`
            : `${countersFingerprint}|?`;
        const hasToc = entries[index]!.hasToc;
        const chapterOutlineKey = hasToc ? bookOutlineKey : '';
        const stored = layouts[chapter.id];
        const layout = paginated && chapterLayoutIsCurrent(stored, chapter, config, resources, continuationKey, chapterOutlineKey) ? stored : null;
        const plan: ChapterPlan = {
          chapterId: chapter.id, index, continuation, paginated, continuationKey, layout,
          ...(hasToc ? { outline: bookOutline } : {}),
          outlineKey: chapterOutlineKey,
        };
        plans.push(plan);
        byId[chapter.id] = plan;

        if (layout && pages) {
          bookPages[chapter.id] = {
            pageIndex: pages.physical + layout.leadingBlankPages,
            pageNumberValue: pages.number + layout.leadingBlankPages,
            pageCount: Math.max(0, layout.pageCount - layout.leadingBlankPages),
          };
          pages = {
            physical: pages.physical + layout.pageCount,
            number: pages.number + layout.lastPageDelta + 1,
            format: layout.lastPageFormat,
          };
        } else {
          if (pendingChapterId === null && pages) pendingChapterId = chapter.id;
          pages = null;
        }

        const entry = entries[index]!;
        counters = entry.after;
        countersFingerprint = entry.key;
      });

      return { chapters: plans, byId, bookPages, pendingChapterId };
    },
  };
}

/** Pages at the start of `doc` holding no block: the parity padding
 *  before a chapter opener. */
export function leadingBlankPageCount(doc: VDTDocument): number {
  const pageCount = doc.pages.length;
  let n = 0;
  while (n < pageCount && !doc.blocks.some((b) => b.pageIndex === n)) n++;
  return n;
}

/** The layout record of a chapter just laid out from `plan` and the inputs
 *  the build used. Records nothing while the chapter was not paginated:
 *  its page count would be tied to an unknown parity. */
export function chapterLayoutFromDoc(
  doc: VDTDocument,
  plan: ChapterPlan,
  inputs: { markdown: string; config: PostextConfig; resources: Resource[] },
): ChapterLayout | null {
  if (!plan.paginated) return null;
  const pageCount = doc.pages.length;
  if (pageCount === 0) return null;
  const leadingBlankPages = leadingBlankPageCount(doc);
  const firstPage = doc.pages[0]!;
  const lastPage = doc.pages[pageCount - 1]!;
  return {
    chapterId: plan.chapterId,
    markdown: inputs.markdown,
    config: inputs.config,
    resources: inputs.resources,
    continuationKey: plan.continuationKey,
    pageCount,
    leadingBlankPages,
    lastPageDelta: lastPage.pageNumberValue - firstPage.pageNumberValue,
    lastPageFormat: lastPage.pageNumberFormat,
    outline: outlineFromDoc(doc, contentOutline({ markdown: inputs.markdown }, inputs.config, plan.continuation).outline),
    outlineKey: plan.outlineKey,
  };
}
