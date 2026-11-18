// Lay a bundle's book out chapter by chapter, the way the Sandbox does:
// each chapter continues the one before it (heading and resource counters,
// the open part, page parity and page numbering), the first one from where
// the bundle says its book starts (`start`), every chapter reads the
// book's metadata (the first chapter's front matter), a chapter printing
// the contents (`:::toc`) receives the whole book's outline, and
// `{bookTotalPages}` counts the whole book. With a `layoutCache`, a
// chapter laid out before with the same inputs is not laid out again.

import { bookCitationContexts, citationSourceOf, needsCitationContext } from '../citations/context.js';
import type { CitationContext } from '../citations/context.js';
import type { DocumentMetadata, LayoutContinuation, OutlineEntry, PostextConfig, Resource } from '../types.js';
import type { VDTDocument } from '../vdt.js';
import { buildDocument, resolveJumpMarks, continuationAfter, contentOutline, laterPageIdsOf, outlineFromDoc, outlineKey, pageFenceIds, carriedPlaces, mergeCarriedOutline } from '../pipeline/index.js';
import type { StoryJump } from '../composed/carry.js';
import type { BuildDocumentOptions } from '../pipeline/index.js';
import { createMeasurementCache } from '../measure/index.js';
import type { MeasurementCache } from '../measure/index.js';
import { extractFrontmatter } from '../parse/frontmatter.js';
import { configUsesPlaceholder } from '../design/placeholders.js';
import { blankChapterFrontmatter } from '../defaults/chapterStyles.js';
import { bundleStart } from './manifest.js';
import type { BundleChapter, BundleStart } from './types.js';
import { beginLayoutBuild, createBundleLayoutCache, jsonKey } from './layoutCache.js';
import type { BundleLayoutCache, ChapterRecord } from './layoutCache.js';
import { perfLap, perfTimed } from '../util/perfTap.js';
import { holdParseMemo } from '../parse/blockParser.js';

/** Options of `buildBundle`: those of a build, plus a design override, caches
 *  and per-chapter progress. */
export interface BuildBundleOptions extends BuildDocumentOptions {
  /** Configuration to lay out with instead of the bundle's own. */
  config?: PostextConfig;
  /** Measurement cache shared by every chapter; one is created when
   *  omitted. */
  cache?: MeasurementCache;
  /** Book metadata (`{title}`, `{author}`, the PDF title…) handed to every
   *  chapter. The first chapter's front matter is the book's and wins over
   *  these values; a front-matter block at the top of a later chapter is
   *  ignored, as in the Sandbox. */
  metadata?: DocumentMetadata;
  /** Called after each chapter is laid out (the last round's, when the
   *  contents take several). */
  onChapter?: (index: number, doc: VDTDocument) => void;
  /** The chapters an earlier build of the same book laid out (#782): a
   *  chapter whose inputs are unchanged is taken from it instead of laid
   *  out again, and the cache is left holding this build's. Its `stats`
   *  then say which chapters were laid out. `onProgress` and `onPass` hear
   *  only from the chapters laid out. */
  layoutCache?: BundleLayoutCache;
}

/** How many times the book is laid out at most while the contents' page
 *  numbers settle. */
const MAX_ROUNDS = 3;

const FRONTMATTER_OPEN_RE = /^---[ \t]*(?:\r?\n|$)/;

/** A chapter with a composed page fence. */
/** Whether the Markdown holds a page fence (`::::page`, three colons or
 *  more, then `page` as a whole word). A scan, not a regular expression: a
 *  pattern that may start inside a long run of colons is quadratic on it. */
export const hasComposedPage = (markdown: string): boolean => {
  for (let at = markdown.indexOf(':page'); at !== -1; at = markdown.indexOf(':page', at + 1)) {
    let colons = 1;
    while (colons < 3 && at - colons >= 0 && markdown[at - colons] === ':') colons++;
    const next = markdown.charCodeAt(at + 5);
    const wordChar = (next >= 48 && next <= 57) || (next >= 65 && next <= 90) || (next >= 97 && next <= 122) || next === 95;
    if (colons >= 3 && !wordChar) return true;
  }
  return false;
};

/** `markdown` with a leading front-matter block blanked out — every
 *  character but the line breaks turned into a space, so source offsets
 *  stay as they were and the engine parses no metadata from it but the
 *  chapter's style (`chapterStyle:`, kept to lay the chapter out in). The block
 *  is found by its lines alone, never parsed (the Sandbox's rule, which
 *  mirrors gray-matter's): the first line is exactly `---`, and the block
 *  closes at the next line that is exactly `---`. */
function blankFrontmatter(markdown: string): string {
  const open = FRONTMATTER_OPEN_RE.exec(markdown);
  if (!open || (open[0].length >= markdown.length && !open[0].endsWith('\n'))) return markdown;
  let pos = open[0].length;
  while (pos <= markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const lineEnd = nl === -1 ? markdown.length : nl;
    if (markdown.slice(pos, lineEnd).replace(/\r$/, '') === '---') {
      const end = nl === -1 ? markdown.length : nl + 1;
      return blankChapterFrontmatter(markdown.slice(0, end)) + markdown.slice(end);
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return markdown;
}

/** The label and book index of the first page of `doc` holding a block —
 *  past the parity blanks before its opener; undefined for a document
 *  with no content. */
function firstContentPage(doc: VDTDocument): { pageLabel: string; pageIndex: number } | undefined {
  let first: number | undefined;
  for (const b of doc.blocks) {
    if (b.pageIndex >= 0 && (first === undefined || b.pageIndex < first)) first = b.pageIndex;
  }
  const page = first !== undefined ? doc.pages[first] : undefined;
  return page ? { pageLabel: page.pageLabel, pageIndex: (doc.pageIndexOffset ?? 0) + page.index } : undefined;
}

/** A resource as its layout reads it: without the times it was stored
 *  at, which a bundle opened again stamps anew. */
function layoutFields(resource: Resource): Partial<Resource> {
  const copy: Partial<Resource> = { ...resource };
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

/** What every chapter's citations read (the book's references and
 *  citations, the same in every context), as text for the book key. */
function sharedCitationKey(ctx: CitationContext | undefined): unknown {
  return ctx ? [ctx.items, ctx.nocite, ctx.clusters, ctx.placed, ctx.chapters ?? null] : null;
}

/** What one chapter's citations read besides the book's: its own. */
function localCitationKey(ctx: CitationContext | undefined): unknown {
  return ctx ? [ctx.local, ctx.last, ctx.issues, ctx.captions ?? null] : null;
}

/** The key a chapter's layout is recorded under: everything it reads that
 *  is not the book's. The JSON parts hold no raw NUL, so the text after
 *  the second one is the Markdown, whatever it holds. */
function chapterKey(markdown: string, continuation: LayoutContinuation | undefined, outlineText: string, citations: CitationContext | undefined, laterIds: Record<string, number> | undefined): string | undefined {
  const head = jsonKey([continuation ?? null, localCitationKey(citations), laterIds ?? null]);
  return head === undefined ? undefined : `${head}\u0000${outlineText}\u0000${markdown}`;
}

/** One chapter for a layout: what `buildBundle` hands `buildDocument` for
 *  it, less the configuration and the resources, which are the book's. */
export interface ChapterLayoutJob {
  /** The chapter's place in the book. */
  index: number;
  markdown: string;
  /** The book's metadata. */
  metadata: DocumentMetadata;
  continuation?: LayoutContinuation;
  /** The book's outline, for a chapter that prints it. */
  outline?: OutlineEntry[];
  /** The chapter's share of the book's citations. */
  citations?: CitationContext;
  laterPageIds?: Record<string, number>;
}

/** What a chapter is laid out with besides its job. */
export interface ChapterLayoutContext {
  config: PostextConfig;
  resources: Resource[];
  cache: MeasurementCache;
  options?: BuildDocumentOptions;
}

/** Lay one chapter of a book out: its document, and what the book's chain
 *  and outline read from it. What `buildBundle` does for each chapter, and
 *  what a worker of `buildBundleParallel` does for the chapters it is
 *  sent. */
export function layOutChapter(job: ChapterLayoutJob, context: ChapterLayoutContext): ChapterRecord {
  const { markdown, metadata, continuation, outline, citations, laterPageIds } = job;
  const { config, resources } = context;
  const doc = buildDocument(
    { markdown, metadata, resources, ...(continuation ? { continuation } : {}), ...(outline ? { outline } : {}), ...(citations ? { citations } : {}), ...(laterPageIds ? { laterPageIds } : {}) },
    config,
    context.cache,
    context.options,
  );
  const last = doc.pages[doc.pages.length - 1];
  const firstContent = firstContentPage(doc);
  return {
    doc,
    ...(doc.pendingJumps ? { jumps: doc.pendingJumps } : {}),
    pageCount: doc.pages.length,
    ...(last ? { next: { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat } } : {}),
    outline: perfTimed('bundle.chapterOutline', () => outlineFromDoc(doc, contentOutline({ markdown }, config, continuation).outline)),
    ...(doc.carriedOutline ? { carried: carriedPlaces(doc) } : {}),
    ...(firstContent ? { firstContent } : {}),
  };
}

type BundleInput = { chapters: readonly Pick<BundleChapter, 'markdown'>[]; config: PostextConfig; resources?: readonly Resource[]; start?: BundleStart };

/** Lay out every chapter of `bundle`, in order; returns one `VDTDocument`
 *  per chapter. Hand the array to `renderToPdf` for the whole book, or
 *  paint `docs[i]` for one chapter. A bundle that holds part of a longer
 *  book (`start`, #695) is laid out from there: its first chapter with
 *  that continuation, as `buildDocument({ markdown, continuation: start },
 *  config)` would, and the chapters after it chained from it. */
export function buildBundle(bundle: BundleInput, options: BuildBundleOptions = {}): VDTDocument[] {
  // Each chapter is parsed once for the whole build (#1604).
  const release = holdParseMemo();
  try {
    const { context, steps } = bundleLayout(bundle, options, false);
    let step = steps.next();
    while (!step.done) step = steps.next(step.value.map((job) => layOutChapter(job, context)));
    return step.value;
  } finally {
    release();
  }
}

/** Options of `buildBundleParallel`. */
export interface BuildBundleParallelOptions extends Omit<BuildBundleOptions, 'onProgress' | 'onPass' | 'signal'> {
  /** Lays out the chapters it is handed, in any order and on any thread,
   *  each as {@link layOutChapter} does with the book's configuration and
   *  resources, and resolves with their records in the order of the jobs.
   *  A record crosses threads as a structured clone. */
  layOutChapters: (jobs: ChapterLayoutJob[]) => Promise<ChapterRecord[]>;
  /** What an earlier layout of the book gave each chapter (a bundle's
   *  layouts file, a build of the same book before): the first round lays
   *  every chapter out where these pages put it, so a book that has not
   *  changed is laid out once. Guesses only: the documents are those of
   *  `buildBundle` whatever they say. */
  pageHints?: readonly (ChapterPageHint | undefined)[];
}

/** A chapter's pages in an earlier layout of its book. */
export interface ChapterPageHint {
  /** Its pages, a blank one before its opener included. */
  pageCount: number;
  /** The number of its last page — as printed (`value`), or counted from
   *  the number of its first page (`delta`: 0 on a chapter of one page) —
   *  and its format. */
  lastPage?: { number: { value: number } | { delta: number }; format: NonNullable<ChapterRecord['next']>['format'] };
}

/**
 * {@link buildBundle} with the chapters laid out several at a time
 * (#1611): the same documents, from an executor that may spread the
 * chapters over worker threads.
 *
 * A chapter reads the pages of the chapters before it (its page offset
 * and numbering), so a round hands the executor every chapter at once,
 * each with the continuation the chain gives from the layouts known so
 * far, and the rounds end when every chapter stands on the continuation
 * the chain gives it — the layout `buildBundle` reaches chapter by
 * chapter. A book with stories that jump between chapters (#943) is laid
 * out one chapter at a time, as `buildBundle` does.
 */
export async function buildBundleParallel(bundle: BundleInput, options: BuildBundleParallelOptions): Promise<VDTDocument[]> {
  const { layOutChapters, pageHints, ...rest } = options;
  const release = holdParseMemo();
  try {
    const { steps } = bundleLayout(bundle, rest, true, pageHints);
    let step = steps.next();
    while (!step.done) {
      const jobs = step.value;
      const records = await layOutChapters(jobs);
      if (records.length !== jobs.length) throw new Error(`layOutChapters: ${jobs.length} chapters asked, ${records.length} returned`);
      step = steps.next(records);
    }
    return step.value;
  } finally {
    release();
  }
}

/** How many times a round of {@link buildBundleParallel} hands the
 *  executor every chapter not settled yet before it goes on one chapter
 *  at a time. */
const MAX_SPECULATIONS = 12;

/** What the chain reads of a chapter's record. */
type ChainLink = Pick<ChapterRecord, 'pageCount' | 'next' | 'jumps'>;

/** A chapter's last layout in a walk that laid several out at a time,
 *  with where it was told it starts: what the chapters after it are laid
 *  out from until it stands on the chain. */
interface Guess {
  record: ChapterRecord;
  /** The pages before it. */
  physical: number;
  /** The number of its first page and its format, when the chain gave
   *  them. */
  startAt: number | undefined;
  format: NonNullable<ChapterRecord['next']>['format'] | undefined;
}

/** The blank page a chapter that opens on a fixed side starts with (0 or
 *  1), as `guess` was laid out. */
function leadingBlank(guess: Guess): number {
  const first = guess.record.firstContent;
  return first && first.pageIndex - guess.physical === 1 ? 1 : 0;
}

/**
 * What a chapter is taken to give the chain when it starts after
 * `physical` pages numbered from `next`, from its layout elsewhere in the
 * book (`guess`; none: what `hint` says of it, else two pages). Its pages
 * are those it had, less the
 * blank page before its opener when it had one and now starts on the
 * other side, and its numbering goes on from the new start when it went
 * on from the old one. A wrong guess costs a layout, never a page: the
 * chapter is laid out again from the records that settle.
 */
function linkFrom(guess: Guess | undefined, physical: number, next: ChapterRecord['next'], hint?: ChapterPageHint): ChainLink {
  if (!guess && hint) {
    const last = hint.lastPage;
    // (A chapter handed no numbering counts from 1.)
    const numbering = last ? { startAt: ('value' in last.number ? last.number.value : (next?.startAt ?? 1) + last.number.delta) + 1, format: last.format } : undefined;
    return { pageCount: hint.pageCount, ...(numbering ? { next: numbering } : {}) };
  }
  if (!guess) return { pageCount: 2, ...(next ? { next: { startAt: next.startAt + 2, format: next.format } } : {}) };
  const { record } = guess;
  const blank = leadingBlank(guess);
  const flipped = (physical - guess.physical) % 2 !== 0;
  const pageCount = flipped && blank === 1 ? record.pageCount - 1 : record.pageCount;
  // The numbers went on through the chapter, in the format it was handed
  // (one handed no numbering counts from 1 in the book's own format): they
  // go on from the new start. Numbers that start again inside the chapter
  // end where they ended.
  const ran = record.next !== undefined && next !== undefined
    && record.next.startAt === (guess.startAt ?? 1) + record.pageCount
    && (guess.format === undefined || record.next.format === guess.format);
  const numbering = ran ? { startAt: next!.startAt + pageCount, format: next!.format } : record.next;
  return { pageCount, ...(numbering ? { next: numbering } : {}), ...(record.jumps ? { jumps: record.jumps } : {}) };
}

/** A book's layout as steps: each yields the chapters to lay out now and
 *  takes their records, and the last returns the documents. `speculate`:
 *  a step may hold every chapter whose layout is not known, the ones after
 *  the first laid out on a guess of the pages before them. */
function bundleLayout(bundle: BundleInput, options: BuildBundleOptions, speculate: boolean, pageHints?: readonly (ChapterPageHint | undefined)[]): { context: ChapterLayoutContext; steps: Generator<ChapterLayoutJob[], VDTDocument[], ChapterRecord[]> } {
  const { config: configOverride, cache: sharedCache, onChapter, metadata: givenMetadata, layoutCache, ...buildOptions } = options;
  const config = configOverride ?? bundle.config;
  const resources = [...(bundle.resources ?? [])];
  const cache = sharedCache ?? createMeasurementCache();
  const context: ChapterLayoutContext = { config, resources, cache, options: buildOptions };
  return { context, steps: steps() };

  function* steps(): Generator<ChapterLayoutJob[], VDTDocument[], ChapterRecord[]> {
  const chapters = bundle.chapters;
  // The book's metadata: the first chapter's front matter over the given
  // values. Later chapters' front matter is not the book's.
  const first = chapters[0];
  const metadata: DocumentMetadata = { ...(givenMetadata ?? {}), ...(first ? extractFrontmatter(first.markdown).metadata : {}) };
  const sources = chapters.map((c, index) => (index === 0 ? c.markdown : blankFrontmatter(c.markdown)));
  // Without a cache of its own, the build still keeps the chapters a round
  // of the contents leaves as they were for the next round.
  const build = beginLayoutBuild(layoutCache ?? createBundleLayoutCache(), jsonKey([config, resources.map(layoutFields), metadata]));
  // A chapter printing the contents (`:::toc`) or the index (`:::index`)
  // reads the whole book's outline; so does one whose references name
  // anchors, which may lie in another chapter (#262).
  const lap = perfLap();
  const hasToc = sources.map((markdown) => build.derive(`toc\u0000${markdown}`, () => {
    const { hasToc: toc, hasIndex, hasRefs } = contentOutline({ markdown, resources }, config);
    return toc || hasIndex || hasRefs;
  }));
  const anyToc = hasToc.some(Boolean);
  lap('bundle.flags');
  // The page fences of the chapters after each chapter (#943): where a
  // story of a composed page may jump to. A book whose configuration names
  // no `page:` target keeps none, and a chapter without a composed page
  // does not depend on them.
  const jumpsPossible = (jsonKey(config) ?? '').includes('page:');
  let chain: (LayoutContinuation | undefined)[] | undefined;
  // Where the book starts: the pages before it and the numbering in effect
  // are the first chapter's alone (the chain supplies them from then on),
  // the counters and the open part are what every chapter after it counts
  // on from.
  const start = bundleStart(bundle.start);
  const { pageIndexOffset: startOffset = 0, pageNumbering: _startNumbering, ...startCounters } = start ?? {};
  void _startNumbering;
  // A chapter's page fences are read in its own style: the one it names,
  // or the one of the part it is in (#1521), which may give it the
  // templates its pages name.
  const laterIds = jumpsPossible
    ? laterPageIdsOf(sources.map((markdown, index) => {
      if (!hasComposedPage(markdown)) return [];
      const before = inherited(index);
      return build.derive(`ids\u0000${before?.part?.style ?? ''}\u0000${markdown}`, () => pageFenceIds(markdown, config, before));
    }))
    : undefined;
  /** What each chapter needs of `laterIds` to be laid out: only the
   *  chapters with a composed page jump. */
  const laterIdsOf = (index: number): Record<string, number> | undefined =>
    laterIds && hasComposedPage(sources[index]!) && Object.keys(laterIds[index]!).length > 0 ? laterIds[index] : undefined;
  lap('bundle.pageIds');
  // Citations are numbered and listed across the book (#272): each chapter
  // is formatted against the book's references and citations.
  // Every chapter's front matter counts here (its references), not only
  // the first's.
  const citationSources = chapters.map((c, index) => build.derive(`cite\u0000${index === 0 ? 1 : 0}\u0000${c.markdown}`, () => {
    try {
      return citationSourceOf(c.markdown);
    } catch {
      // Front matter the YAML reader rejects counts for nothing.
      return citationSourceOf(sources[index]!);
    }
  }));
  const citations = citationSources.some((s) => needsCitationContext(s.blocks, s.metadata))
    ? bookCitationContexts(citationSources, resources)
    : undefined;
  build.bookInputs(jsonKey(sharedCitationKey(citations?.[0])));
  lap('bundle.citations');
  // `{bookTotalPages}` needs the page count of the whole book, known once
  // every chapter is laid out: the book goes round once more with it. It
  // never moves a page break, so one more round settles it.
  const usesBookTotal = configUsesPlaceholder(config, 'bookTotalPages');
  // The contents before any chapter is laid out (#787): every chapter's
  // headings, parts and anchors, numbered as the book numbers them, without
  // their pages. A contents chapter set with it takes, but for its page
  // labels, the room it takes in the end, so the chapters after it are laid
  // out at their final pages on the first round instead of once short of
  // them and again (Terapia Ocupacional laid 120 chapters out for its 62).
  // The rounds then settle the labels as before.
  let outline: OutlineEntry[] | undefined = anyToc ? provisionalOutline() : undefined;
  lap('bundle.provisionalOutline');
  let bookPageCount: number | undefined;
  /** The last record each chapter was given in a walk laid out several
   *  chapters at a time: what the chapters after it take it to give until
   *  it is laid out on the chain. */
  /** By chapter, for each side it may start on (the pages before it even
   *  or odd): a chapter's pages may depend on the side in ways no rule
   *  here knows (a float that falls on another page), so the layout on
   *  the same side is the one read when there is one. */
  const guesses: [Guess | undefined, Guess | undefined][] = [];
  const guessFor = (index: number, physical: number): Guess | undefined => guesses[index]?.[physical % 2] ?? guesses[index]?.[1 - (physical % 2)];
  /** Each chapter as the last settled walk asked for it. */
  let lastJobs: ChapterLayoutJob[] = [];
  for (let round = 0; ; round++) {
    if (round > 0) build.nextRound();
    const outlineText = outline ? jsonKey(outline) : '';
    const total = bookPageCount !== undefined ? { bookPageCount } : {};
    const roundOutline = outline;
    /** Chapters with no key, laid out on the round's settled chain: their
     *  record stands for the rest of the round. */
    const unkeyed = new Map<number, ChapterRecord>();
    // Stories that jump between chapters are sent on by the chapter laid
    // out, not by a guess of it.
    const guessing = speculate && !laterIds;
    let records: ChapterRecord[] = [];
    let settled: { key: string | undefined; record: ChapterRecord }[] = [];
    // The chain, walked until every chapter stands on a record laid out
    // with the continuation the chain gives it. A walk of `buildBundle`
    // lays each chapter out as it reaches it, so its first is its last.
    for (let walk = 0; ; walk++) {
      records = [];
      settled = [];
      const jobs: { job: ChapterLayoutJob; key: string | undefined; physical: number; startAt: number | undefined; format: Guess['format'] }[] = [];
      const asked: ChapterLayoutJob[] = [];
      let counters: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
      let physical = startOffset;
      /** Stories that jump to a later chapter, by the chapter that has the
       *  page, in the order they were sent (#943). */
      const incoming = new Map<number, StoryJump[]>();
      let next: { startAt: number; format: VDTDocument['pages'][number]['pageNumberFormat'] } | undefined;
      for (let index = 0; index < sources.length; index++) {
        const markdown = sources[index]!;
        const continuation: LayoutContinuation | undefined = index === 0
          ? (start || bookPageCount !== undefined ? { ...start, ...total } : undefined)
          : { ...counters, pageIndexOffset: physical, ...(next ? { pageNumbering: next } : {}), ...(incoming.has(index) ? { jumps: incoming.get(index)! } : {}), ...total };
        // A story that came in refers to anchors of the book (#943).
        const printsOutline = (hasToc[index] || (incoming.get(index) ?? []).some((j) => j.outline)) && roundOutline !== undefined;
        const laterOf = laterIdsOf(index);
        const key = printsOutline && outlineText === undefined ? undefined : chapterKey(markdown, continuation, printsOutline ? outlineText! : '', citations?.[index], laterOf);
        const job: ChapterLayoutJob = {
          index, markdown, metadata,
          ...(continuation ? { continuation } : {}),
          ...(printsOutline ? { outline: roundOutline } : {}),
          ...(citations ? { citations: citations[index]! } : {}),
          ...(laterOf ? { laterPageIds: laterOf } : {}),
        };
        asked.push(job);
        // Whether the chapters before this one all stand on their records.
        const exact = jobs.length === 0;
        let record = build.peek(key) ?? (exact ? unkeyed.get(index) : undefined);
        let link: ChainLink | undefined = record;
        if (!record) {
          if (exact && (!guessing || walk >= MAX_SPECULATIONS || key === undefined)) {
            // Laid out now, alone: the chain goes on from its record.
            const [made] = yield [job];
            link = record = build.put(key, made!);
            if (key === undefined) unkeyed.set(index, record);
          } else if (guessing && key !== undefined && walk < MAX_SPECULATIONS) {
            // Laid out with the others of this walk; the chapters after
            // it go on from what its last layout says of it.
            jobs.push({ job, key, physical, startAt: next?.startAt, format: next?.format });
            link = linkFrom(guessFor(index, physical), physical, next, pageHints?.[index]);
          } else {
            // A chapter that cannot wait for the others: the walk ends
            // here and the next one reaches it on settled records.
            break;
          }
        }
        if (record) {
          if (jobs.length === 0) settled.push({ key, record });
          records.push(record);
        }
        // The stories this chapter sends to a page of a later one.
        for (const jump of link!.jumps ?? []) {
          const to = laterIds?.[index] && Object.prototype.hasOwnProperty.call(laterIds[index], jump.target) ? laterIds[index]![jump.target] : undefined;
          if (to === undefined) continue;
          const list = incoming.get(to) ?? [];
          list.push({ ...jump, chapter: jump.chapter ?? index, fromChapter: index });
          incoming.set(to, list);
        }
        physical += link!.pageCount;
        if (link!.next) next = link!.next;
        const before = counters;
        const beforeKey = jsonKey(before);
        counters = build.derive(beforeKey === undefined ? undefined : `next\u0000${beforeKey}\u0000${markdown}`, () => perfTimed('bundle.continuation', () => continuationAfter({ markdown, resources }, config, before)));
      }
      if (jobs.length === 0 && records.length === sources.length) {
        lastJobs = asked;
        break;
      }
      const made = yield jobs.map((j) => j.job);
      jobs.forEach((j, i) => {
        const guess: Guess = { record: build.put(j.key, made[i]!), physical: j.physical, startAt: j.startAt, format: j.format };
        (guesses[j.job.index] ??= [undefined, undefined])[j.physical % 2] = guess;
      });
    }
    build.settle(settled);
    const physical = startOffset + records.reduce((n, r) => n + r.pageCount, 0);
    // Another round for the contents while their page labels move (at
    // most MAX_ROUNDS layouts), and for the book's page count while the
    // one printed is not the one laid out (at most one more).
    let outlineMoved = false;
    if (anyToc) {
      // The index marks, anchors and headings written in the part of a story
      // that went on in a page of a later chapter are listed where they
      // stand (#988).
      const outlines = laterIds ? mergeCarriedOutline(records.map((r) => r.outline), records.map((r) => r.carried)) : records.map((r) => r.outline);
      const bookOutline = records.flatMap((record, index) => {
        const entries = outlines[index] as OutlineEntry[];
        // A part that reached no page of its chapter — set without a
        // divider page (`parts.page: false`) by a fence closing the
        // chapter — starts with the next chapter's content, as its running
        // heads do.
        if (!entries.some((e) => e.kind === 'part' && e.pageIndex === undefined)) return entries;
        const next = records.slice(index + 1).map((r) => r.firstContent).find((p) => p !== undefined);
        return next ? entries.map((e) => (e.kind === 'part' && e.pageIndex === undefined ? { ...e, ...next } : e)) : entries;
      });
      outlineMoved = !outline || outlineKey(outline) !== outlineKey(bookOutline);
      // The first round laid the contents out from the provisional outline,
      // which has no pages: always lay the book out once more with them.
      if (outlineMoved) outline = bookOutline;
    }
    const totalMoved = usesBookTotal && bookPageCount !== physical;
    if (usesBookTotal) bookPageCount = physical;
    const again = (outlineMoved && round + 1 < MAX_ROUNDS) || (totalMoved && round + 1 < MAX_ROUNDS + 1);
    if (!again) break;
  }
  // A record kept from an earlier round without its document.
  const lost = build.lost();
  if (lost.length > 0) {
    const again = yield lost.map((index) => lastJobs[index]!);
    lost.forEach((index, i) => build.putBack(index, again[i]!));
  }
  const docs = build.finish();
  // Stories that jump from one chapter to a page of another (#943): the
  // marks that name the page print its number.
  if (laterIds) resolveJumpMarks(docs);
  if (onChapter) docs.forEach((doc, index) => onChapter(index, doc));
  return docs;

  /** Every chapter's outline entries as its text gives them, the counters
   *  chained from chapter to chapter as the rounds chain them. */
  function provisionalOutline(): OutlineEntry[] {
    // A chapter's entries are kept with the layout cache, by its text and
    // what it inherits (#1638): a save of one chapter read the headings of
    // every chapter of the book again, 1.2 s on a book of 6 MB.
    return sources.flatMap((markdown, index) => {
      const prior = inherited(index);
      const priorKey = jsonKey(prior);
      return build.derive(
        priorKey === undefined ? undefined : `outline\u0000${priorKey}\u0000${markdown}`,
        () => contentOutline({ markdown, resources }, config, prior).outline,
      );
    });
  }

  /** What chapter `index` inherits from the chapters before it, as the
   *  first round chains it (the same keys, so the round finds them): its
   *  counters and the part it is in. Chained once, on first use. */
  function inherited(index: number): LayoutContinuation | undefined {
    if (!chain) {
      chain = [];
      let before: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
      for (const markdown of sources) {
        const prior = before;
        chain.push(prior);
        const priorKey = jsonKey(prior);
        before = build.derive(priorKey === undefined ? undefined : `next\u0000${priorKey}\u0000${markdown}`, () => continuationAfter({ markdown, resources }, config, prior));
      }
    }
    return chain[index];
  }
  }
}
