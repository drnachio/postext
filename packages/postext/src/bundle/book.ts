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
import { bundleStart } from './manifest.js';
import type { BundleChapter, BundleStart } from './types.js';
import { beginLayoutBuild, createBundleLayoutCache, jsonKey } from './layoutCache.js';
import type { BundleLayoutCache, ChapterRecord } from './layoutCache.js';

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
 *  stay as they were and the engine parses no metadata from it. The block
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
      return markdown.slice(0, end).replace(/[^\n\r]/g, ' ') + markdown.slice(end);
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

/** Lay out every chapter of `bundle`, in order; returns one `VDTDocument`
 *  per chapter. Hand the array to `renderToPdf` for the whole book, or
 *  paint `docs[i]` for one chapter. A bundle that holds part of a longer
 *  book (`start`, #695) is laid out from there: its first chapter with
 *  that continuation, as `buildDocument({ markdown, continuation: start },
 *  config)` would, and the chapters after it chained from it. */
export function buildBundle(
  bundle: { chapters: readonly Pick<BundleChapter, 'markdown'>[]; config: PostextConfig; resources?: readonly Resource[]; start?: BundleStart },
  options: BuildBundleOptions = {},
): VDTDocument[] {
  const { config: configOverride, cache: sharedCache, onChapter, metadata: givenMetadata, layoutCache, ...buildOptions } = options;
  const config = configOverride ?? bundle.config;
  const resources = [...(bundle.resources ?? [])];
  const cache = sharedCache ?? createMeasurementCache();
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
  const hasToc = sources.map((markdown) => build.derive(`toc\u0000${markdown}`, () => {
    const { hasToc: toc, hasIndex, hasRefs } = contentOutline({ markdown, resources }, config);
    return toc || hasIndex || hasRefs;
  }));
  const anyToc = hasToc.some(Boolean);
  // The page fences of the chapters after each chapter (#943): where a
  // story of a composed page may jump to. A book whose configuration names
  // no `page:` target keeps none, and a chapter without a composed page
  // does not depend on them.
  const jumpsPossible = (jsonKey(config) ?? '').includes('page:');
  const laterIds = jumpsPossible
    ? laterPageIdsOf(sources.map((markdown) => (hasComposedPage(markdown) ? build.derive(`ids\u0000${markdown}`, () => pageFenceIds(markdown, config)) : [])))
    : undefined;
  /** What each chapter needs of `laterIds` to be laid out: only the
   *  chapters with a composed page jump. */
  const laterIdsOf = (index: number): Record<string, number> | undefined =>
    laterIds && hasComposedPage(sources[index]!) && Object.keys(laterIds[index]!).length > 0 ? laterIds[index] : undefined;
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
  // `{bookTotalPages}` needs the page count of the whole book, known once
  // every chapter is laid out: the book goes round once more with it. It
  // never moves a page break, so one more round settles it.
  const usesBookTotal = configUsesPlaceholder(config, 'bookTotalPages');
  // Where the book starts: the pages before it and the numbering in effect
  // are the first chapter's alone (the chain supplies them from then on),
  // the counters and the open part are what every chapter after it counts
  // on from.
  const start = bundleStart(bundle.start);
  const { pageIndexOffset: startOffset = 0, pageNumbering: _startNumbering, ...startCounters } = start ?? {};
  void _startNumbering;

  // The contents before any chapter is laid out (#787): every chapter's
  // headings, parts and anchors, numbered as the book numbers them, without
  // their pages. A contents chapter set with it takes, but for its page
  // labels, the room it takes in the end, so the chapters after it are laid
  // out at their final pages on the first round instead of once short of
  // them and again (Terapia Ocupacional laid 120 chapters out for its 62).
  // The rounds then settle the labels as before.
  let outline: OutlineEntry[] | undefined = anyToc ? provisionalOutline() : undefined;
  let bookPageCount: number | undefined;
  for (let round = 0; ; round++) {
    if (round > 0) build.nextRound();
    const records: ChapterRecord[] = [];
    const outlineText = outline ? jsonKey(outline) : '';
    let counters: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
    let physical = startOffset;
    /** Stories that jump to a later chapter, by the chapter that has the
     *  page, in the order they were sent (#943). */
    const incoming = new Map<number, StoryJump[]>();
    let next: { startAt: number; format: VDTDocument['pages'][number]['pageNumberFormat'] } | undefined;
    const total = bookPageCount !== undefined ? { bookPageCount } : {};
    sources.forEach((markdown, index) => {
      const continuation: LayoutContinuation | undefined = index === 0
        ? (start || bookPageCount !== undefined ? { ...start, ...total } : undefined)
        : { ...counters, pageIndexOffset: physical, ...(next ? { pageNumbering: next } : {}), ...(incoming.has(index) ? { jumps: incoming.get(index)! } : {}), ...total };
      // A story that came in refers to anchors of the book (#943).
      const printsOutline = (hasToc[index] || (incoming.get(index) ?? []).some((j) => j.outline)) && outline !== undefined;
      const laterOf = laterIdsOf(index);
      const key = printsOutline && outlineText === undefined ? undefined : chapterKey(markdown, continuation, printsOutline ? outlineText! : '', citations?.[index], laterOf);
      const record = build.chapter(key, () => {
        const doc = buildDocument(
          { markdown, metadata, resources, ...(continuation ? { continuation } : {}), ...(printsOutline ? { outline } : {}), ...(citations ? { citations: citations[index] } : {}), ...(laterOf ? { laterPageIds: laterOf } : {}) },
          config,
          cache,
          buildOptions,
        );
        const last = doc.pages[doc.pages.length - 1];
        const firstContent = firstContentPage(doc);
        return {
          doc,
          ...(doc.pendingJumps ? { jumps: doc.pendingJumps } : {}),
          pageCount: doc.pages.length,
          ...(last ? { next: { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat } } : {}),
          outline: outlineFromDoc(doc, contentOutline({ markdown }, config, continuation).outline),
          ...(doc.carriedOutline ? { carried: carriedPlaces(doc) } : {}),
          ...(firstContent ? { firstContent } : {}),
        };
      });
      records.push(record);
      // The stories this chapter sends to a page of a later one.
      for (const jump of record.jumps ?? []) {
        const to = laterIds?.[index] && Object.prototype.hasOwnProperty.call(laterIds[index], jump.target) ? laterIds[index]![jump.target] : undefined;
        if (to === undefined) continue;
        const list = incoming.get(to) ?? [];
        list.push({ ...jump, chapter: jump.chapter ?? index, fromChapter: index });
        incoming.set(to, list);
      }
      physical += record.pageCount;
      if (record.next) next = record.next;
      const before = counters;
      const beforeKey = jsonKey(before);
      counters = build.derive(beforeKey === undefined ? undefined : `next\u0000${beforeKey}\u0000${markdown}`, () => continuationAfter({ markdown, resources }, config, before));
    });
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
  const docs = build.finish();
  // Stories that jump from one chapter to a page of another (#943): the
  // marks that name the page print its number.
  if (laterIds) resolveJumpMarks(docs);
  if (onChapter) docs.forEach((doc, index) => onChapter(index, doc));
  return docs;

  /** Every chapter's outline entries as its text gives them, the counters
   *  chained from chapter to chapter as the rounds chain them. */
  function provisionalOutline(): OutlineEntry[] {
    let before: LayoutContinuation | undefined = Object.keys(startCounters).length > 0 ? startCounters : undefined;
    return sources.flatMap((markdown) => {
      const prior = before;
      const priorKey = jsonKey(prior);
      before = build.derive(priorKey === undefined ? undefined : `next\u0000${priorKey}\u0000${markdown}`, () => continuationAfter({ markdown, resources }, config, prior));
      return contentOutline({ markdown, resources }, config, prior).outline;
    });
  }
}
