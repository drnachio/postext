// Lay a bundle's book out chapter by chapter, the way the Sandbox does:
// each chapter continues the one before it (heading and resource counters,
// the open part, page parity and page numbering), and a chapter printing
// the contents (`:::toc`) receives the whole book's outline.

import type { LayoutContinuation, OutlineEntry, PostextConfig, Resource } from '../types';
import type { VDTDocument } from '../vdt';
import { buildDocument, continuationAfter, contentOutline, outlineFromDoc, outlineKey } from '../pipeline';
import type { BuildDocumentOptions } from '../pipeline';
import { createMeasurementCache } from '../measure';
import type { MeasurementCache } from '../measure';
import type { BundleChapter } from './types';

export interface BuildBundleOptions extends BuildDocumentOptions {
  /** Configuration to lay out with instead of the bundle's own. */
  config?: PostextConfig;
  /** Measurement cache shared by every chapter; one is created when
   *  omitted. */
  cache?: MeasurementCache;
  /** Called after each chapter is laid out (the last round's, when the
   *  contents take several). */
  onChapter?: (index: number, doc: VDTDocument) => void;
}

/** How many times the book is laid out at most while the contents' page
 *  numbers settle. */
const MAX_ROUNDS = 3;

/** Lay out every chapter of `bundle`, in order; returns one `VDTDocument`
 *  per chapter. Hand the array to `renderToPdf` for the whole book, or
 *  paint `docs[i]` for one chapter. */
export function buildBundle(
  bundle: { chapters: readonly Pick<BundleChapter, 'markdown'>[]; config: PostextConfig; resources: readonly Resource[] },
  options: BuildBundleOptions = {},
): VDTDocument[] {
  const { config: configOverride, cache: sharedCache, onChapter, ...buildOptions } = options;
  const config = configOverride ?? bundle.config;
  const resources = [...bundle.resources];
  const cache = sharedCache ?? createMeasurementCache();
  const chapters = bundle.chapters;
  const hasToc = chapters.map((c) => contentOutline({ markdown: c.markdown }, config).hasToc);
  const anyToc = hasToc.some(Boolean);

  let outline: OutlineEntry[] | undefined;
  let docs: VDTDocument[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    docs = [];
    const continuations: (LayoutContinuation | undefined)[] = [];
    let counters: LayoutContinuation | undefined;
    let physical = 0;
    let next: { startAt: number; format: VDTDocument['pages'][number]['pageNumberFormat'] } | undefined;
    chapters.forEach((chapter, index) => {
      const continuation: LayoutContinuation | undefined = index === 0
        ? undefined
        : { ...counters, pageIndexOffset: physical, ...(next ? { pageNumbering: next } : {}) };
      const doc = buildDocument(
        { markdown: chapter.markdown, resources, ...(continuation ? { continuation } : {}), ...(hasToc[index] && outline ? { outline } : {}) },
        config,
        cache,
        buildOptions,
      );
      docs.push(doc);
      continuations.push(continuation);
      const last = doc.pages[doc.pages.length - 1];
      physical += doc.pages.length;
      if (last) next = { startAt: last.pageNumberValue + 1, format: last.pageNumberFormat };
      counters = continuationAfter({ markdown: chapter.markdown, resources }, config, counters);
    });
    if (!anyToc) break;
    const bookOutline = chapters.flatMap((chapter, index) =>
      outlineFromDoc(docs[index]!, contentOutline({ markdown: chapter.markdown }, config, continuations[index]).outline),
    );
    if (outline && outlineKey(outline) === outlineKey(bookOutline)) break;
    outline = bookOutline;
    // The first round laid the contents out from its own chapter alone:
    // always lay the book out once more with the whole outline.
  }
  if (onChapter) docs.forEach((doc, index) => onChapter(index, doc));
  return docs;
}
