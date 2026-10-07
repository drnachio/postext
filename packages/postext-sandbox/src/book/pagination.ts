// How a book is laid out one chapter at a time. Each chapter goes to the
// engine on its own with a `continuation`: the heading and resource counters
// of the chapters before it (pure over their text, chained with
// `continuationAfter`) and the pages before it (from the last layout of each
// preceding chapter, recorded as a `ChapterLayout`). Page numbers thus run
// on across chapters without ever laying out the whole book in a preview.

import { anchorOutline, bookCitationContexts, citationContextKey, citationSourceOf, mayNeedCitations, needsCitationContext, configUsesPlaceholder, contentOutline, continuationAfter, extractFrontmatter, formatNumeral, indexOutline, outlineFromDoc, outlineKey, parseMarkdown, resolveHeadingsConfig, resolvePageConfig, DEFAULT_PARTS_CONFIG, tocOutline } from 'postext';
import type { CitationSource, LayoutContinuation, NumeralStyle, OutlineEntry, PostextConfig, Resource, VDTDocument } from 'postext';
import type { BookPages, BookPlan, Chapter, ChapterLayout, ChapterPageNumber, ChapterPages, ChapterPart, ChapterPlan, OutlinePage } from './types';
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
    return {
      ...entry,
      pageLabel: formatNumeral(resolvePageNumber(page.number, start.number), page.format),
      pageIndex: start.physical + page.index,
      // An index merges consecutive pages of one format into a range.
      ...(entry.kind === 'indexMark' ? { pageFormat: page.format } : {}),
    };
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
  /** Whether the chapter prints the index (`:::index`). */
  hasIndex: boolean;
  /** Whether a reference of the chapter may name an anchor of the book
   *  (#262): it reads the book's headings and anchors, with their pages. */
  hasRefs: boolean;
  /** {@link opensOnEvenPage}, worked out the first time a plan asks. */
  opensEven?: boolean;
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
  // A part page closing the chapter before owes its break to this one,
  // which can move its pages. Appended only when set, so the key of every
  // other chapter (and the records stored under it) is what it was.
  const afterPart = c.afterPartPage ? '|after-part' : '';
  return `${headings}|${counters}|${numbers}|${part}${afterPart}`;
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
    && ca.pageNumbering?.startAt === cb.pageNumbering?.startAt
    && ca.bookPageCount === cb.bookPageCount;
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
 *  `before`: the counter of its first numbered level-1 heading (a
 *  `startAt` attribute restarts it), or null when it has none (see
 *  {@link ChapterPlan.number}). */
function chapterNumber(outline: readonly OutlineEntry[], before: LayoutContinuation | undefined): number | null {
  const first = outline.find((e) => e.kind === 'heading' && e.level === 1 && e.numbered);
  if (!first) return null;
  return first.counter ?? (before?.headings?.h1 ?? 0) + 1;
}

/** The part a chapter whose outline is `outline` belongs to, after the
 *  counters `before` (see {@link ChapterPlan.part}). */
function chapterPart(outline: readonly OutlineEntry[], before: LayoutContinuation | undefined): ChapterPart | undefined {
  let part: ChapterPart | undefined = before?.part ? { number: before.part.number, title: before.part.title } : undefined;
  for (const entry of outline) {
    if (entry.kind === 'part') part = { number: entry.number, title: entry.title };
    else if (entry.kind === 'heading' && entry.level === 1) break;
  }
  return part;
}

const continuationFingerprint = (c: LayoutContinuation | undefined): string => JSON.stringify(c ?? null);

/** Directives that set nothing of their own at the head of a document. */
const QUIET_DIRECTIVES = new Set(['pagebreak', 'numbering', 'columnbreak', 'space']);

/** Whether the first thing `markdown` sets is a heading that breaks to an
 *  even page, as a plate set alone on the verso before its chapter's
 *  opener does. The engine lets the first page of a document stand
 *  whatever its heading asks, so such a chapter laid out on its own opens
 *  on a recto; {@link BookPlanner.plan} sets it as if one page came first
 *  while the pages before it are unknown. */
export function opensOnEvenPage(markdown: string, config: PostextConfig): boolean {
  for (const block of parseMarkdown(extractFrontmatter(markdown).content)) {
    if (block.type === 'directive') {
      if (block.directiveName && QUIET_DIRECTIVES.has(block.directiveName)) continue;
      return false;
    }
    if (block.type === 'containerStart' || block.type === 'containerEnd') {
      // A part opening a divider page sets that page first.
      if (block.type === 'containerStart' && block.containerName === 'part' && (config.parts?.page ?? DEFAULT_PARTS_CONFIG.page)) return false;
      continue;
    }
    if (block.type !== 'heading') return false;
    const level = resolveHeadingsConfig(config.headings).levels.find((l) => l.level === (block.level ?? 1));
    const styleId = block.attrs?.style;
    const style = styleId ? config.headingStyles?.find((st) => st.id === styleId)?.breakBefore : undefined;
    const enabled = style?.enabled ?? level?.breakBefore.enabled ?? false;
    const parity = style?.parity ?? level?.breakBefore.parity ?? 'any';
    return enabled && (parity === 'even' || parity === 'always-even');
  }
  return false;
}

const bookTotalUse = new WeakMap<PostextConfig, boolean>();

/** Whether the configuration prints `{bookTotalPages}` anywhere, cached per
 *  configuration object (the plan is re-derived on every state change). */
function usesBookTotalPages(config: PostextConfig): boolean {
  let uses = bookTotalUse.get(config);
  if (uses === undefined) {
    uses = configUsesPlaceholder(config, 'bookTotalPages');
    bookTotalUse.set(config, uses);
  }
  return uses;
}

/** A planner keeps the per-chapter counter chain cached, so a keystroke in
 *  chapter 9 re-derives nothing for chapters 1–8, re-counts chapter 9, and
 *  re-counts the chapters after it only while what they inherit actually
 *  changed (an edit inside a paragraph leaves the counters as they were,
 *  and the chain stops at chapter 10). */
export function createBookPlanner(): BookPlanner {
  const cache = new Map<string, CountersEntry>();
  /** Each chapter's parsed form for the citations, by its text. */
  const citationCache = new Map<string, { markdown: string; captions: boolean; source: CitationSource }>();
  /** `captions`: some resource's caption or note cites (#529), so every
   *  chapter is read for the figures it places. */
  const citationSource = (chapter: Chapter, captions: boolean): CitationSource => {
    const hit = citationCache.get(chapter.id);
    if (hit && hit.markdown === chapter.markdown && hit.captions === captions) return hit.source;
    let source: CitationSource;
    try {
      // A chapter that cannot cite (no `@`, no references) counts as empty.
      source = captions || mayNeedCitations(chapter.markdown) ? citationSourceOf(chapter.markdown) : { blocks: [] };
    } catch {
      source = { blocks: [] };
    }
    citationCache.set(chapter.id, { markdown: chapter.markdown, captions, source });
    return source;
  };

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
    const { outline, hasToc, hasIndex, hasRefs } = contentOutline({ markdown: chapter.markdown, resources }, config, before);
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
      hasIndex,
      hasRefs,
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
      // The book's page count once every chapter is paginated — handed to
      // every chapter when the configuration prints `{bookTotalPages}`. It
      // never moves a page, so the records stay current when it changes.
      let bookPageCount: number | undefined;
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
        if (pages && chapters.length > 0 && usesBookTotalPages(config)) bookPageCount = pages.physical;
      }

      // The book's outline: every chapter's headings and parts, with the
      // page labels of the chapters the chain places (their records say
      // where each entry landed within the chapter), and their index marks.
      // A chapter printing the contents (`:::toc`) or the index
      // (`:::index`) is laid out with it; when what it prints changes, that
      // chapter's record goes stale — its pages hold, its rows do not.
      const anyToc = entries.some((e) => e.hasToc || e.hasIndex || e.hasRefs);
      /** The first content page of the chapters from `index` on (an empty
       *  chapter holds none), while the chain places them. */
      const firstContentPageFrom = (index: number): { pageLabel: string; pageIndex: number } | null => {
        for (let j = index; j < chapters.length; j++) {
          const layout = records[j];
          const start = starts[j];
          if (!layout || !start) return null;
          if (layout.leadingBlankPages >= layout.pageCount) continue;
          return {
            pageLabel: formatNumeral(resolvePageNumber(layout.firstContentPageNumber, start.number), layout.firstContentPageFormat),
            pageIndex: start.physical + layout.leadingBlankPages,
          };
        }
        return null;
      };
      const bookOutline: OutlineEntry[] = anyToc
        ? chapters.flatMap((_chapter, index) => {
          const text = entries[index]!.outline;
          const layout = records[index];
          const start = starts[index];
          if (!layout || !start || layout.outlinePages.length !== text.length) return text;
          // A part that reached no page of its chapter — set without a
          // divider page (`parts.page: false`) by a fence closing the
          // chapter — starts with the next chapter's content, as its
          // running heads do.
          let next: { pageLabel: string; pageIndex: number } | null | undefined;
          return placeOutline(text, layout.outlinePages, start).map((entry) => {
            if (entry.kind !== 'part' || entry.pageIndex !== undefined) return entry;
            if (next === undefined) next = firstContentPageFrom(index + 1);
            return next ? { ...entry, ...next } : entry;
          });
        })
        : [];
      // The contents read the headings and parts, the index the index
      // marks: a chapter printing one goes stale only when what it prints
      // moves.
      // References read the headings with an identifier and the anchors.
      const outlines = anyToc
        ? { toc: tocOutline(bookOutline), index: indexOutline(bookOutline), refs: anchorOutline(bookOutline) }
        : { toc: [], index: [], refs: [] };
      const printedKeys = { toc: '', index: '', refs: '' };
      if (entries.some((e) => e.hasToc)) printedKeys.toc = outlineKey(outlines.toc);
      if (entries.some((e) => e.hasIndex)) printedKeys.index = outlineKey(outlines.index);
      if (entries.some((e) => e.hasRefs)) printedKeys.refs = outlineKey(outlines.refs);
      /** The outline a chapter is laid out with, and its key. */
      const chapterOutline = (entry: CountersEntry): { outline?: OutlineEntry[]; key: string } => {
        if (entry.hasRefs) {
          // The parts the chapter prints, in book order, with the anchors.
          const outline = bookOutline.filter((e) => e.anchorId !== undefined
            || (entry.hasToc && (e.kind === 'heading' || e.kind === 'part'))
            || (entry.hasIndex && e.kind === 'indexMark'));
          const key = [entry.hasToc ? printedKeys.toc : '', entry.hasIndex ? printedKeys.index : '', printedKeys.refs].join('\n\n');
          return { outline, key };
        }
        if (entry.hasToc && entry.hasIndex) return { outline: bookOutline, key: `${printedKeys.toc}\n\n${printedKeys.index}` };
        if (entry.hasToc) return { outline: outlines.toc, key: printedKeys.toc };
        if (entry.hasIndex) return { outline: outlines.index, key: printedKeys.index };
        return { key: '' };
      };

      const plans: ChapterPlan[] = [];
      const byId: Record<string, ChapterPlan> = {};
      const bookPages: BookPages = {};
      let stalePendingId: string | null = null;
      // Counters inherited by the chapter being planned (undefined = first).
      let counters: LayoutContinuation | undefined;
      // The book's citations (#272): numbered, disambiguated and listed
      // across the chapters, each chapter formatted against its share.
      const captionsCite = resources.some((r) => r.caption?.includes('@') || r.note?.includes('@'));
      const citationSources = chapters.map((chapter) => citationSource(chapter, captionsCite));
      const citationContexts = citationSources.some((src) => needsCitationContext(src.blocks, src.metadata))
        ? bookCitationContexts(citationSources, resources)
        : undefined;
      // The book-wide part of every chapter's key, written once.
      const sharedCitationKey = citationContexts?.[0]
        ? citationContextKey({ ...citationContexts[0], local: [], last: false, captions: {} })
        : '';
      chapters.forEach((chapter, index) => {
        const first = index === 0;
        const pages = starts[index]!;
        const total = bookPageCount !== undefined ? { bookPageCount } : undefined;
        // While the pages before it are unknown, a chapter opening on a
        // verso (a plate facing the opener) is set as if one page came
        // first, so the preview does not open it on a recto; the chain of
        // the whole book gives it its real pages.
        const entry = entries[index]!;
        if (!pages && entry.opensEven === undefined) entry.opensEven = opensOnEvenPage(chapter.markdown, config);
        const provisional = !pages && entry.opensEven
          ? { pageIndexOffset: 1, pageNumbering: { format: numbering.format, startAt: numbering.startAt + 1 } }
          : {};
        const continuation: LayoutContinuation | undefined = first
          ? total
          : {
            ...counters,
            ...(pages ? { pageIndexOffset: pages.physical, pageNumbering: { format: pages.format, startAt: pages.number } } : provisional),
            ...total,
          };
        const { outline: printedOutline, key: printedKey } = chapterOutline(entries[index]!);
        const citations = citationContexts?.[index];
        const chapterOutlineKey = citations ? `${printedKey}\n\ncite:${sharedCitationKey}|${citations.local.join(',')}|${citations.last ? 1 : 0}${citations.captions ? `|${JSON.stringify(citations.captions)}` : ''}` : printedKey;
        const layout = records[index]!;
        const outlineStale = layout !== null && layout.outlineKey !== chapterOutlineKey;
        if (outlineStale && stalePendingId === null) stalePendingId = chapter.id;
        const part = chapterPart(entries[index]!.outline, counters);
        const plan: ChapterPlan = {
          chapterId: chapter.id,
          index,
          number: chapterNumber(entries[index]!.outline, counters),
          ...(part ? { part } : {}),
          continuation,
          paginated: pages !== null,
          continuationKey: keys[index]!,
          layout,
          outlineStale,
          ...(printedOutline ? { outline: printedOutline } : {}),
          ...(citations ? { citations } : {}),
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
 *  before a chapter opener. A comic page (`page.comic`) holds no block but
 *  is content: a chapter of comic pages starts on its first one. */
export function leadingBlankPageCount(doc: VDTDocument): number {
  const pageCount = doc.pages.length;
  let n = 0;
  while (n < pageCount && !doc.pages[n]!.comic && !doc.blocks.some((b) => b.pageIndex === n)) n++;
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
