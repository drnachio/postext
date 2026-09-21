// How a book is laid out one chapter at a time. Each chapter goes to the
// engine on its own with a `continuation`: the heading and resource counters
// of the chapters before it (pure over their text, chained with
// `continuationAfter`) and the pages before it (from the last layout of each
// preceding chapter, recorded as a `ChapterLayout`). Page numbers thus run
// on across chapters without ever laying out the whole book in a preview.

import { contentOutline, continuationAfter, formatNumeral, outlineFromDoc, outlineKey, resolvePageConfig } from 'postext';
import type { LayoutContinuation, NumeralStyle, OutlineEntry, PostextConfig, Resource, VDTDocument } from 'postext';
import type { BookPages, BookPlan, Chapter, ChapterLayout, ChapterPageNumber, ChapterPages, ChapterPlan, OutlinePage } from './types';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from './layoutKeys';

/** The page number `n` resolves to when the chapter's first page is
 *  numbered `start`. */
function resolvePageNumber(n: ChapterPageNumber, start: number): number {
  return 'delta' in n ? start + n.delta : n.value;
}

function samePageNumber(a: ChapterPageNumber, b: ChapterPageNumber): boolean {
  return 'delta' in a ? 'delta' in b && a.delta === b.delta : 'value' in b && a.value === b.value;
}

function sameOutlinePages(a: readonly (OutlinePage | null)[], b: readonly (OutlinePage | null)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) {
      if (x !== y) return false;
      continue;
    }
    if (x.index !== y.index || x.format !== y.format || !samePageNumber(x.number, y.number)) return false;
  }
  return true;
}

/** Where a chapter's pages start in the book. */
interface PageStart {
  physical: number;
  number: number;
  format: NumeralStyle;
}

/** The chapter's outline with the page each entry landed on, as the chain
 *  currently places the chapter: `text` is the outline of its text (no
 *  pages), `pages` where the record says each entry went. */
function placeOutline(text: readonly OutlineEntry[], pages: readonly (OutlinePage | null)[], start: PageStart): OutlineEntry[] {
  return text.map((entry, i) => {
    const page = pages[i];
    if (!page) return entry;
    return { ...entry, pageLabel: formatNumeral(resolvePageNumber(page.number, start.number), page.format), pageIndex: start.physical + page.index };
  });
}

/** The labels printed on a chapter's first and last pages (`XIII`, `15`),
 *  for the page range shown in the UI. */
export function chapterPageLabels(pages: ChapterPages): { from: string; to: string } {
  const from = formatNumeral(pages.pageNumberValue, pages.pageNumberFormat);
  const to = pages.pageCount > 1 ? formatNumeral(pages.lastPageNumberValue, pages.lastPageNumberFormat) : from;
  return { from: from || String(pages.pageNumberValue), to: to || String(pages.lastPageNumberValue) };
}

interface CountersEntry {
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
  before: LayoutContinuation | undefined;
  /** `before` serialised: what the entry actually depends on. The chain
   *  hands every chapter a fresh object whenever an earlier chapter is
   *  re-counted, so identity alone would re-count the whole tail of the
   *  book on each keystroke. */
  beforeKey: string;
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

/** Whether `layout` was built from the inputs the chapter's pages depend
 *  on: its text, the configuration and resources (by fingerprint), the
 *  engine, and what it inherits. The book outline a chapter printing the
 *  contents was laid out with is not one of them (see
 *  {@link ChapterPlan.outlineStale}). */
export function chapterLayoutIsCurrent(
  layout: ChapterLayout | undefined,
  chapter: Chapter,
  config: PostextConfig,
  resources: Resource[],
  continuationKey: string,
): layout is ChapterLayout {
  return !!layout
    && layout.markdown === chapter.markdown
    && layout.engine === ENGINE_KEY
    && layout.configKey === configKeyOf(config)
    && layout.resourcesKey === resourcesKeyOf(resources)
    && layout.continuationKey === continuationKey;
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
 *  from the same inputs (as {@link chapterLayoutIsCurrent} checks them)
 *  with the same page outcome. Recording such a record again changes
 *  nothing downstream. */
export function sameChapterLayout(a: ChapterLayout | undefined, b: ChapterLayout): boolean {
  return !!a
    && a.chapterId === b.chapterId
    && a.markdown === b.markdown
    && a.configKey === b.configKey
    && a.resourcesKey === b.resourcesKey
    && a.engine === b.engine
    && a.continuationKey === b.continuationKey
    && a.pageCount === b.pageCount
    && a.leadingBlankPages === b.leadingBlankPages
    && samePageNumber(a.firstContentPageNumber, b.firstContentPageNumber)
    && a.firstContentPageFormat === b.firstContentPageFormat
    && samePageNumber(a.lastPageNumber, b.lastPageNumber)
    && a.lastPageFormat === b.lastPageFormat
    && a.outlineKey === b.outlineKey
    && sameOutlinePages(a.outlinePages, b.outlinePages);
}

/** The number of a chapter whose outline is `outline`, after the counters
 *  `before`: the ordinal of its first numbered level-1 heading, or null
 *  when it has none (see {@link ChapterPlan.number}). */
function chapterNumber(outline: readonly OutlineEntry[], before: LayoutContinuation | undefined): number | null {
  const opens = outline.some((e) => e.kind === 'heading' && e.level === 1 && e.numbered);
  return opens ? (before?.headings?.h1 ?? 0) + 1 : null;
}

const continuationFingerprint = (c: LayoutContinuation | undefined): string => JSON.stringify(c ?? null);

/** A planner keeps the per-chapter counter chain cached, so a keystroke in
 *  chapter 9 re-derives nothing for chapters 1–8, re-counts chapter 9, and
 *  re-counts the chapters after it only while what they inherit actually
 *  changed (an edit inside a paragraph leaves the counters as they were,
 *  and the chain stops at chapter 10). */
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
      && (hit.before === before || hit.beforeKey === continuationFingerprint(before))
    ) {
      // Hand the same `after` object on so the next chapter hits by identity.
      return hit;
    }
    const after = continuationAfter({ markdown: chapter.markdown, resources }, config, before);
    const { outline, hasToc } = contentOutline({ markdown: chapter.markdown }, config, before);
    const entry: CountersEntry = {
      markdown: chapter.markdown,
      config,
      resources,
      before,
      beforeKey: continuationFingerprint(before),
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

      // The counter chain: what each chapter inherits, pure over the text.
      const entries: CountersEntry[] = [];
      {
        let before: LayoutContinuation | undefined;
        for (const chapter of chapters) {
          const entry = countersAfter(chapter, config, resources, before);
          entries.push(entry);
          before = entry.after;
        }
      }

      // The page chain: where each chapter starts, from the current record
      // of every chapter before it (null once one has none). A record's
      // pages hold whatever book outline it was laid out with — the
      // contents' rows do not move the pages after them — so the chain is
      // settled before the outline is assembled and never re-broken by it.
      const starts: (PageStart | null)[] = [];
      const keys: string[] = [];
      const records: (ChapterLayout | null)[] = [];
      let pendingChapterId: string | null = null;
      {
        let pages: PageStart | null = { physical: 0, number: numbering.startAt, format: numbering.format };
        let countersFingerprint = '';
        chapters.forEach((chapter, index) => {
          const continuationKey = index === 0
            ? 'first'
            : pages
              ? `${countersFingerprint}|${pages.physical % 2}|${pages.format}`
              : `${countersFingerprint}|?`;
          const stored = layouts[chapter.id];
          const layout = pages && chapterLayoutIsCurrent(stored, chapter, config, resources, continuationKey) ? stored : null;
          starts.push(pages);
          keys.push(continuationKey);
          records.push(layout);
          if (layout && pages) {
            pages = {
              physical: pages.physical + layout.pageCount,
              number: resolvePageNumber(layout.lastPageNumber, pages.number) + 1,
              format: layout.lastPageFormat,
            };
          } else {
            if (pendingChapterId === null && pages) pendingChapterId = chapter.id;
            pages = null;
          }
          countersFingerprint = entries[index]!.key;
        });
      }

      // The book's outline: every chapter's headings and parts, with the
      // page labels of the chapters the chain places (their records say
      // where each entry landed within the chapter). A chapter printing the
      // contents (`:::toc`) is laid out with it; when it changes, that
      // chapter's record goes stale — its pages hold, its rows do not.
      const anyToc = entries.some((e) => e.hasToc);
      const bookOutline: OutlineEntry[] = anyToc
        ? chapters.flatMap((_chapter, index) => {
          const text = entries[index]!.outline;
          const layout = records[index];
          const start = starts[index];
          return layout && start && layout.outlinePages.length === text.length
            ? placeOutline(text, layout.outlinePages, start)
            : text;
        })
        : [];
      const bookOutlineKey = anyToc ? outlineKey(bookOutline) : '';

      const plans: ChapterPlan[] = [];
      const byId: Record<string, ChapterPlan> = {};
      const bookPages: BookPages = {};
      let stalePendingId: string | null = null;
      // Counters inherited by the chapter being planned (undefined = first).
      let counters: LayoutContinuation | undefined;
      chapters.forEach((chapter, index) => {
        const first = index === 0;
        const pages = starts[index]!;
        const continuation: LayoutContinuation | undefined = first
          ? undefined
          : {
            ...counters,
            ...(pages ? { pageIndexOffset: pages.physical, pageNumbering: { format: pages.format, startAt: pages.number } } : {}),
          };
        const hasToc = entries[index]!.hasToc;
        const chapterOutlineKey = hasToc ? bookOutlineKey : '';
        const layout = records[index]!;
        const outlineStale = layout !== null && layout.outlineKey !== chapterOutlineKey;
        if (outlineStale && stalePendingId === null) stalePendingId = chapter.id;
        const plan: ChapterPlan = {
          chapterId: chapter.id,
          index,
          number: chapterNumber(entries[index]!.outline, counters),
          continuation,
          paginated: pages !== null,
          continuationKey: keys[index]!,
          layout,
          outlineStale,
          ...(hasToc ? { outline: bookOutline } : {}),
          outlineKey: chapterOutlineKey,
        };
        plans.push(plan);
        byId[chapter.id] = plan;

        if (layout && pages) {
          bookPages[chapter.id] = {
            pageIndex: pages.physical + layout.leadingBlankPages,
            pageNumberValue: resolvePageNumber(layout.firstContentPageNumber, pages.number),
            pageNumberFormat: layout.firstContentPageFormat,
            lastPageNumberValue: resolvePageNumber(layout.lastPageNumber, pages.number),
            lastPageNumberFormat: layout.lastPageFormat,
            pageCount: Math.max(0, layout.pageCount - layout.leadingBlankPages),
          };
        }

        counters = entries[index]!.after;
      });

      // A chapter whose pages are unknown comes first: the contents are
      // refreshed once the book is paginated, not once per chapter.
      return { chapters: plans, byId, bookPages, pendingChapterId: pendingChapterId ?? stalePendingId };
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
  const firstContentIndex = Math.min(leadingBlankPages, pageCount - 1);
  const firstContentPage = doc.pages[firstContentIndex]!;
  const lastPage = doc.pages[pageCount - 1]!;
  // A page at or after a `:::numbering{startAt=…}` restart keeps its
  // absolute number whatever the chapters before it come to; any other
  // page follows the inherited count.
  const firstRestart = doc.pageNumberRestarts?.[0];
  const numberOf = (index: number): ChapterPageNumber => (
    firstRestart !== undefined && index >= firstRestart
      ? { value: doc.pages[index]!.pageNumberValue }
      : { delta: doc.pages[index]!.pageNumberValue - firstPage.pageNumberValue }
  );
  // Where each outline entry landed, relative to the chapter's own pages
  // (the document's offset taken back out) and numbered like its pages.
  const offset = doc.pageIndexOffset ?? 0;
  const text = contentOutline({ markdown: inputs.markdown }, inputs.config, plan.continuation).outline;
  const outlinePages = outlineFromDoc(doc, text).map((entry): OutlinePage | null => {
    if (entry.pageIndex === undefined) return null;
    const index = entry.pageIndex - offset;
    const page = doc.pages[index];
    return page ? { index, number: numberOf(index), format: page.pageNumberFormat } : null;
  });
  return {
    chapterId: plan.chapterId,
    markdown: inputs.markdown,
    configKey: configKeyOf(inputs.config),
    resourcesKey: resourcesKeyOf(inputs.resources),
    engine: ENGINE_KEY,
    continuationKey: plan.continuationKey,
    pageCount,
    leadingBlankPages,
    firstContentPageNumber: numberOf(firstContentIndex),
    firstContentPageFormat: firstContentPage.pageNumberFormat,
    lastPageNumber: numberOf(pageCount - 1),
    lastPageFormat: lastPage.pageNumberFormat,
    outlinePages,
    outlineKey: plan.outlineKey,
  };
}
