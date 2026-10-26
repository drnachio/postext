// How a book is laid out one chapter at a time. Each chapter goes to the
// engine on its own with a `continuation`: the heading and resource counters
// of the chapters before it (pure over their text, chained with
// `continuationAfter`) and the pages before it (from the last layout of each
// preceding chapter, recorded as a `ChapterLayout`). Page numbers thus run
// on across chapters without ever laying out the whole book in a preview.

import { builtWithoutFaces } from './withoutFaces.js';
import { type PostextConfig, type Resource, type LayoutContinuation, type OutlineEntry, parseMarkdown, extractFrontmatter, DEFAULT_PARTS_CONFIG, resolveHeadingsConfig, configUsesPlaceholder, type CitationSource, mayNeedCitations, citationSourceOf, continuationAfter, contentOutline, resolvePageConfig, type StoryJump, formatNumeral, type CarriedPlace, mergeCarriedOutline, tocOutline, indexOutline, anchorOutline, outlineKey, needsCitationContext, bookCitationContexts, citationContextKey, type VDTDocument, outlineFromDoc } from 'postext';
import type { Chapter, ChapterLayout, BookStart, BookPlan, ChapterPart, ChapterPlan, BookPages, ChapterPageNumber, OutlinePage, CarriedOutlinePage } from './types.js';
import { configKeyOf, resourcesKeyOf, ENGINE_KEY } from './layoutKeys.js';
import { createPageIdsCache, laterIdsOfBook, jumpsKeyOf, keyOf, routeJumps } from './jumps.js';
import { countersKey, type PageStart, firstContinuationKey, chapterLayoutIsCurrent, lineCountBase, resolvePageNumber, placeOutline } from './pagination/compare.js';

export { chapterPageLabels, chapterLayoutIsCurrent, sameLayoutInputs, sameChapterLayout } from './pagination/compare.js';

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
  /** `start`: where the book starts, when it holds part of a longer one
   *  (#695). Its first chapter then inherits it, and every chapter after
   *  counts on from it. */
  plan(chapters: readonly Chapter[], config: PostextConfig, resources: Resource[], layouts: Record<string, ChapterLayout>, start?: BookStart): BookPlan;
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
  /** The page fence ids of each chapter (#943). */
  const pageIdsOf = createPageIdsCache();
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
    plan(chapters, config, resources, layouts, bookStart) {
      const numbering = resolvePageConfig(config.page).pageNumbering;
      // Where the book starts: the pages before it and the numbering in
      // effect are the first chapter's alone (the page chain supplies them
      // from then on); the counters and the open part are what the
      // counter chain goes on from.
      const start = bookStart && Object.keys(bookStart).length > 0 ? bookStart : undefined;
      const { pageIndexOffset: startOffset = 0, pageNumbering: startNumbering, ...startCounters } = start ?? {};

      // The counter chain: what each chapter inherits, pure over the text.
      const entries: CountersEntry[] = [];
      {
        let before: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
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
      // The page fences of the chapters after each chapter (#943), where a
      // story of a composed page may jump to, and the stories the
      // chapters laid out so far send on, by the chapter that has the page.
      const laterIds = laterIdsOfBook(chapters, config, (i) => pageIdsOf(chapters[i]!, config));
      const jumpsIn = new Map<number, StoryJump[]>();
      const starts: (PageStart | null)[] = [];
      const keys: string[] = [];
      const records: (ChapterLayout | null)[] = [];
      let pendingChapterId: string | null = null;
      // The book's page count once every chapter is paginated — handed to
      // every chapter when the configuration prints `{bookTotalPages}`. It
      // never moves a page, so the records stay current when it changes.
      let bookPageCount: number | undefined;
      // Line numbers counted through the book (#621): the number each
      // chapter goes on from, from the layouts of the chapters before it
      // while the chain places them (a count of every line depends on the
      // layout); undefined where unknown, and the chapter then inherits
      // the count of its verse from the text (`continuationAfter`).
      const lineStarts: (number | undefined)[] = [];
      {
        let pages: PageStart | null = {
          physical: startOffset,
          number: startNumbering?.startAt ?? numbering.startAt,
          format: startNumbering?.format ?? numbering.format,
        };
        let lines: number | undefined;
        let linesKnown = true;
        let countersFingerprint = '';
        chapters.forEach((chapter, index) => {
          // What the chapters before it send it, and the ids it may send
          // to: its layout depends on them, and so does its key. They
          // stay out of a book without such stories, whose keys are what
          // they were.
          const sent = jumpsKeyOf(jumpsIn.get(index));
          const reach = laterIds[index];
          const extra = `${sent ? `|j${sent}` : ''}${reach ? `|l${keyOf(reach)}` : ''}`;
          const continuationKey = (index === 0
            ? firstContinuationKey(start)
            : pages
              ? `${countersFingerprint}|${pages.physical % 2}|${pages.format}`
              : `${countersFingerprint}|?`) + extra;
          const stored = layouts[chapter.id];
          const layout = pages && chapterLayoutIsCurrent(stored, chapter, config, resources, continuationKey) ? stored : null;
          starts.push(pages);
          keys.push(continuationKey);
          records.push(layout);
          if (layout) routeJumps(index, layout.jumps, reach, jumpsIn);
          lineStarts.push(linesKnown ? lines : undefined);
          if (layout && pages) {
            const last = layout.lastLineNumber;
            if (last) lines = 'value' in last ? last.value : (lines ?? lineCountBase(config)) + last.delta;
          } else {
            linesKnown = false;
          }
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
      // The entries each chapter's record places, then the pages the
      // receiving chapters found for the marks, anchors and headings of the
      // stories they carry put into the sender's (#988).
      const placedOutlines = anyToc
        ? chapters.map((_chapter, index): readonly OutlineEntry[] => {
          const text = entries[index]!.outline;
          const layout = records[index];
          const start = starts[index];
          if (!layout || !start || layout.outlinePages.length !== text.length) return text;
          return placeOutline(text, layout.outlinePages, start);
        })
        : [];
      const carriedPlaces = anyToc
        ? records.map((layout, index): CarriedPlace[] | undefined => {
          const start = starts[index];
          if (!layout?.carriedOutline || !start) return undefined;
          return layout.carriedOutline.map((c) => ({
            chapter: c.chapter,
            kind: c.kind,
            sourceStart: c.sourceStart,
            pageLabel: formatNumeral(resolvePageNumber(c.page.number, start.number), c.page.format),
            pageIndex: start.physical + c.page.index,
            pageFormat: c.page.format,
          }));
        })
        : [];
      const mergedOutlines = anyToc ? mergeCarriedOutline(placedOutlines, carriedPlaces) : [];
      const bookOutline: OutlineEntry[] = anyToc
        ? chapters.flatMap((_chapter, index) => {
          const placed = mergedOutlines[index] as OutlineEntry[];
          const text = entries[index]!.outline;
          const layout = records[index];
          const start = starts[index];
          if (!layout || !start || layout.outlinePages.length !== text.length) return placed;
          // A part that reached no page of its chapter — set without a
          // divider page (`parts.page: false`) by a fence closing the
          // chapter — starts with the next chapter's content, as its
          // running heads do.
          let next: { pageLabel: string; pageIndex: number } | null | undefined;
          return placed.map((entry) => {
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
      const chapterOutline = (entry: CountersEntry, carriesRefs: boolean): { outline?: OutlineEntry[]; key: string } => {
        if (entry.hasRefs || carriesRefs) {
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
      // Counters inherited by the chapter being planned (undefined = the
      // first of a book that starts at its beginning).
      let counters: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
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
        const incoming = jumpsIn.get(index);
        const continuation: LayoutContinuation | undefined = first
          ? (start ? { ...start, ...total } : total)
          : {
            ...counters,
            ...(incoming ? { jumps: incoming } : {}),
            ...(pages ? { pageIndexOffset: pages.physical, pageNumbering: { format: pages.format, startAt: pages.number } } : provisional),
            ...(lineStarts[index] !== undefined ? { lineNumber: lineStarts[index] } : {}),
            ...total,
          };
        const { outline: printedOutline, key: printedKey } = chapterOutline(entries[index]!, (jumpsIn.get(index) ?? []).some((j) => j.outline));
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
          ...(laterIds[index] ? { laterPageIds: laterIds[index] } : {}),
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
  // The marks, anchors and headings of the stories that came in (#988).
  const carriedOutline = (doc.carriedOutline ?? []).flatMap((c): CarriedOutlinePage[] => {
    const page = doc.pages[c.pageIndex];
    return page ? [{ chapter: c.chapter, kind: c.kind, sourceStart: c.sourceStart, page: { index: c.pageIndex, number: numberOf(c.pageIndex), format: page.pageNumberFormat } }] : [];
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
    // The last line counted (#621), relative to the count the chapter
    // inherited unless it started again inside the chapter.
    ...(doc.lastLineNumber !== undefined
      ? { lastLineNumber: doc.lineNumberRestarted ? { value: doc.lastLineNumber } : { delta: doc.lastLineNumber - (plan.continuation?.lineNumber ?? lineCountBase(inputs.config)) } }
      : {}),
    outlinePages,
    ...(carriedOutline.length > 0 ? { carriedOutline } : {}),
    outlineKey: plan.outlineKey,
    // The stories the chapter sends to a page of a later one (#943).
    ...(doc.pendingJumps && doc.pendingJumps.length > 0 ? { jumps: doc.pendingJumps, jumpsKey: jumpsKeyOf(doc.pendingJumps) } : {}),
    // Laid out without a face it asked for (#757): not the chapter's pages.
    ...(builtWithoutFaces(doc) ? { withoutFaces: true as const } : {}),
  };
}
