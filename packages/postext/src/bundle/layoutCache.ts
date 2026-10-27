// What a book's layout keeps from one build to the next (#782), so that an
// edit lays out only what it moved. Every chapter laid out is recorded
// under a key holding everything its layout reads: its text, the
// continuation it starts from (counters, page offset and numbering, the
// book's page count), the outline when it prints one, and its share of the
// book's citations. The inputs every chapter reads — configuration,
// resources, metadata, the book's references and citations — make the
// book key; when it changes, nothing recorded stands.
//
// A build looks each chapter up before laying it out. A chapter before an
// edit finds its record; the edited one does not; the chapters after it
// find theirs again as soon as the continuation they are handed is the one
// they were laid out with, so the layout stops where the edit stops
// moving anything. A chapter printing the contents, the index or
// cross-references is keyed by the outline too, so an edit that moves a
// heading lays it out again wherever it is in the book.

import type { OutlineEntry } from '../types.js';
import type { StoryJump } from '../composed/carry.js';
import type { CarriedPlace } from '../pipeline/references/carriedOutline.js';
import type { VDTDocument } from '../vdt.js';

/** What a build needs of a chapter laid out, besides its document: what
 *  the next chapter continues from, and what the book's outline reads. */
export interface ChapterRecord {
  /** Dropped when the record is kept only for the page fields (a round of
   *  the contents that turned out not to be the last). */
  doc?: VDTDocument;
  pageCount: number;
  /** The numbering the next page would carry. */
  next?: { startAt: number; format: VDTDocument['pages'][number]['pageNumberFormat'] };
  /** The chapter's outline entries with their pages. */
  outline: OutlineEntry[];
  /** The label and book index of the first page holding a block. */
  firstContent?: { pageLabel: string; pageIndex: number };
  /** The stories of the chapter that jump into a page of a later one
   *  (#943), kept apart from `doc` so they stand when the document is
   *  dropped. */
  jumps?: StoryJump[];
  /** Where the marks, anchors and headings written in the stories this
   *  chapter received landed (#988), for the sending chapters' entries. */
  carried?: CarriedPlace[];
}

/** What the last build did with the chapters. */
export interface BundleLayoutStats {
  /** Chapters laid out, every round of the contents counted. */
  layouts: number;
  /** For each chapter of the result, whether its document was laid out by
   *  that build (false: the one an earlier build laid out stands). */
  laidOut: boolean[];
}

/**
 * The chapters of a book laid out so far, handed to `buildBundle` build
 * after build (`layoutCache`) so that it lays out again only the chapters
 * whose inputs changed. Results are those of a build without it. The
 * cache does not see the fonts: a host whose faces change drops it along
 * with the measurement cache.
 */
export interface BundleLayoutCache {
  readonly stats: BundleLayoutStats;
}

interface CacheState {
  settingsKey?: string;
  citationsKey?: string;
  records: Map<string, ChapterRecord>;
  /** What a build worked out from a chapter's text alone (its counters,
   *  whether it prints the contents, its citations), by text. */
  derived: Map<string, unknown>;
  stats: BundleLayoutStats;
}

const states = new WeakMap<BundleLayoutCache, CacheState>();

export function createBundleLayoutCache(): BundleLayoutCache {
  const state: CacheState = { records: new Map(), derived: new Map(), stats: { layouts: 0, laidOut: [] } };
  const cache: BundleLayoutCache = {
    get stats() {
      return state.stats;
    },
  };
  states.set(cache, state);
  return cache;
}

/** The text of `value` as JSON, or undefined when it cannot be written
 *  (a cycle): a key that cannot be written matches nothing. */
export function jsonKey(value: unknown): string | undefined {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return undefined;
  }
}

/** One build's use of a cache, round after round of the contents. */
export interface LayoutBuild {
  /** `compute()`, or what it gave for the same `key` in a build with the
   *  same settings: for the work a build does on a chapter's text alone,
   *  which a book of many chapters would otherwise parse again on every
   *  build. Undefined `key`: computed. */
  derive<T>(key: string | undefined, compute: () => T): T;
  /** The book-wide inputs worked out from every chapter (the book's
   *  references and citations), once known: when they are not the ones
   *  of the build that filled the cache, none of its chapters stands. */
  bookInputs(key: string | undefined): void;
  /** The record of the chapter keyed `key` (undefined: never reused),
   *  laying it out with `layOut` when none stands. */
  chapter(key: string | undefined, layOut: () => ChapterRecord): ChapterRecord;
  /** Start another round: records this build made that the round before
   *  did not use are kept without their documents. */
  nextRound(): void;
  /** The documents of the last round, laying out again any whose record
   *  had lost its document; the cache keeps the records this build used. */
  finish(): VDTDocument[];
}

/** Begin a build of a book whose configuration, resources and metadata
 *  give `settingsKey` (undefined: nothing is reused). The cache is changed
 *  only when the build finishes. */
export function beginLayoutBuild(cache: BundleLayoutCache, settingsKey: string | undefined): LayoutBuild {
  const state = states.get(cache)!;
  const sameSettings = settingsKey !== undefined && state.settingsKey === settingsKey;
  const derivedBefore = sameSettings ? state.derived : new Map<string, unknown>();
  const derived = new Map<string, unknown>();
  let previous = new Map<string, ChapterRecord>();
  let citationsKey: string | undefined;
  const used = new Map<string, ChapterRecord>();
  const made = new Set<ChapterRecord>();
  let round: { key: string | undefined; record: ChapterRecord; layOut: () => ChapterRecord }[] = [];
  let layouts = 0;
  const lay = (layOut: () => ChapterRecord): ChapterRecord => {
    const record = layOut();
    layouts++;
    made.add(record);
    return record;
  };
  return {
    derive<T>(key: string | undefined, compute: () => T): T {
      if (key === undefined) return compute();
      if (derived.has(key)) return derived.get(key) as T;
      const value = derivedBefore.has(key) ? derivedBefore.get(key) as T : compute();
      derived.set(key, value);
      return value;
    },
    bookInputs(key) {
      citationsKey = key;
      previous = sameSettings && key !== undefined && state.citationsKey === key ? state.records : new Map();
    },
    chapter(key, layOut) {
      let record = key !== undefined ? used.get(key) ?? previous.get(key) : undefined;
      if (!record) record = lay(layOut);
      if (key !== undefined) used.set(key, record);
      round.push({ key, record, layOut });
      return record;
    },
    nextRound() {
      const current = new Set(round.map((c) => c.record));
      for (const record of made) if (!current.has(record)) delete record.doc;
      round = [];
    },
    finish() {
      const docs = round.map((c) => {
        if (c.record.doc) return c.record.doc;
        c.record = lay(c.layOut);
        if (c.key !== undefined) used.set(c.key, c.record);
        return c.record.doc!;
      });
      const last = new Set(round.map((c) => c.record));
      for (const record of used.values()) if (!last.has(record)) delete record.doc;
      state.settingsKey = settingsKey;
      state.citationsKey = citationsKey;
      state.records = used;
      state.derived = derived;
      state.stats = { layouts, laidOut: round.map((c) => made.has(c.record)) };
      return docs;
    },
  };
}
