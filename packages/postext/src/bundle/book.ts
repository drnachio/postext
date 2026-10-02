// Lay a bundle's book out chapter by chapter, the way the Sandbox does:
// each chapter continues the one before it (heading and resource counters,
// the open part, page parity and page numbering), every chapter reads the
// book's metadata (the first chapter's front matter), a chapter printing
// the contents (`:::toc`) receives the whole book's outline, and
// `{bookTotalPages}` counts the whole book.

import { bookCitationContexts, citationSourceOf, needsCitationContext } from '../citations/context';
import type { DocumentMetadata, LayoutContinuation, OutlineEntry, PostextConfig, Resource } from '../types';
import type { VDTDocument } from '../vdt';
import { buildDocument, continuationAfter, contentOutline, outlineFromDoc, outlineKey } from '../pipeline';
import type { BuildDocumentOptions } from '../pipeline';
import { createMeasurementCache } from '../measure';
import type { MeasurementCache } from '../measure';
import { extractFrontmatter } from '../frontmatter';
import { configUsesPlaceholder } from '../design/placeholders';
import type { BundleChapter } from './types';

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
}

/** How many times the book is laid out at most while the contents' page
 *  numbers settle. */
const MAX_ROUNDS = 3;

const FRONTMATTER_OPEN_RE = /^---[ \t]*(?:\r?\n|$)/;

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

/** Lay out every chapter of `bundle`, in order; returns one `VDTDocument`
 *  per chapter. Hand the array to `renderToPdf` for the whole book, or
 *  paint `docs[i]` for one chapter. */
export function buildBundle(
  bundle: { chapters: readonly Pick<BundleChapter, 'markdown'>[]; config: PostextConfig; resources?: readonly Resource[] },
  options: BuildBundleOptions = {},
): VDTDocument[] {
  const { config: configOverride, cache: sharedCache, onChapter, metadata: givenMetadata, ...buildOptions } = options;
  const config = configOverride ?? bundle.config;
  const resources = [...(bundle.resources ?? [])];
  const cache = sharedCache ?? createMeasurementCache();
  const chapters = bundle.chapters;
  // The book's metadata: the first chapter's front matter over the given
  // values. Later chapters' front matter is not the book's.
  const first = chapters[0];
  const metadata: DocumentMetadata = { ...(givenMetadata ?? {}), ...(first ? extractFrontmatter(first.markdown).metadata : {}) };
  const sources = chapters.map((c, index) => (index === 0 ? c.markdown : blankFrontmatter(c.markdown)));
  // A chapter printing the contents (`:::toc`) or the index (`:::index`)
  // reads the whole book's outline; so does one whose references name
  // anchors, which may lie in another chapter (#262).
  const hasToc = sources.map((markdown) => {
    const { hasToc: toc, hasIndex, hasRefs } = contentOutline({ markdown, resources }, config);
    return toc || hasIndex || hasRefs;
  });
  const anyToc = hasToc.some(Boolean);
  // Citations are numbered and listed across the book (#272): each chapter
  // is formatted against the book's references and citations.
  // Every chapter's front matter counts here (its references), not only
  // the first's.
  const citationSources = chapters.map((c, index) => {
    try {
      return citationSourceOf(c.markdown);
    } catch {
      // Front matter the YAML reader rejects counts for nothing.
      return citationSourceOf(sources[index]!);
    }
  });
  const citations = citationSources.some((s) => needsCitationContext(s.blocks, s.metadata))
    ? bookCitationContexts(citationSources)
    : undefined;
  // `{bookTotalPages}` needs the page count of the whole book, known once
  // every chapter is laid out: the book goes round once more with it. It
  // never moves a page break, so one more round settles it.
  const usesBookTotal = configUsesPlaceholder(config, 'bookTotalPages');

  let outline: OutlineEntry[] | undefined;
  let bookPageCount: number | undefined;
  let docs: VDTDocument[] = [];
  for (let round = 0; ; round++) {
    docs = [];
    const continuations: (LayoutContinuation | undefined)[] = [];
    let counters: LayoutContinuation | undefined;
    let physical = 0;
    let next: { startAt: number; format: VDTDocument['pages'][number]['pageNumberFormat'] } | undefined;
    const total = bookPageCount !== undefined ? { bookPageCount } : {};
    sources.forEach((markdown, index) => {
      const continuation: LayoutContinuation | undefined = index === 0
        ? (bookPageCount !== undefined ? total : undefined)
        : { ...counters, pageIndexOffset: physical, ...(next ? { pageNumbering: next } : {}), ...total };
      const doc = buildDocument(
        { markdown, metadata, resources, ...(continuation ? { continuation } : {}), ...(hasToc[index] && outline ? { outline } : {}), ...(citations ? { citations: citations[index] } : {}) },
        config,
        cache,
        buildOptions,
      );
      docs.push(doc);
      continuations.push(continuation);
      const last = doc.pages[doc.pages.length - 1];
      physical += doc.pages.length;
      if (last) next = { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat };
      counters = continuationAfter({ markdown, resources }, config, counters);
    });
    // Another round for the contents while their page labels move (at
    // most MAX_ROUNDS layouts), and for the book's page count while the
    // one printed is not the one laid out (at most one more).
    let outlineMoved = false;
    if (anyToc) {
      const bookOutline = sources.flatMap((markdown, index) => {
        const entries = outlineFromDoc(docs[index]!, contentOutline({ markdown }, config, continuations[index]).outline);
        // A part that reached no page of its chapter — set without a
        // divider page (`parts.page: false`) by a fence closing the
        // chapter — starts with the next chapter's content, as its running
        // heads do.
        if (!entries.some((e) => e.kind === 'part' && e.pageIndex === undefined)) return entries;
        const next = docs.slice(index + 1).map(firstContentPage).find((p) => p !== undefined);
        return next ? entries.map((e) => (e.kind === 'part' && e.pageIndex === undefined ? { ...e, ...next } : e)) : entries;
      });
      outlineMoved = !outline || outlineKey(outline) !== outlineKey(bookOutline);
      // The first round laid the contents out from its own chapter alone:
      // always lay the book out once more with the whole outline.
      if (outlineMoved) outline = bookOutline;
    }
    const totalMoved = usesBookTotal && bookPageCount !== physical;
    if (usesBookTotal) bookPageCount = physical;
    const again = (outlineMoved && round + 1 < MAX_ROUNDS) || (totalMoved && round + 1 < MAX_ROUNDS + 1);
    if (!again) break;
  }
  if (onChapter) docs.forEach((doc, index) => onChapter(index, doc));
  return docs;
}
