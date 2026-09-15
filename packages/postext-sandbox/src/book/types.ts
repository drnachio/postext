// A sandbox project is a *book*: one shared configuration, font set and
// resource set, plus one markdown document per chapter. These types are the
// vocabulary shared by state, storage records and preset bundles.

import type { DocumentMetadata, LayoutContinuation, NumeralStyle, PostextConfig, Resource } from 'postext';

export interface Chapter {
  /** Random UUID; stable across rename/reorder; unique across projects. */
  id: string;
  /** Shown in the UI only; never injected into the markdown. */
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

/** What the PDF viewer renders: every chapter concatenated (one continuous
 *  PDF) or just the active chapter, continued after the ones before it. The
 *  canvas and HTML previews always show the active chapter. */
export type LayoutScope = 'book' | 'chapter';

/** The book-shaped content slice shared by state, records and bundles. */
export interface BookContent {
  /** Book order; always at least one chapter. */
  chapters: Chapter[];
  /** One of `chapters[].id`. */
  activeChapterId: string;
}

/** Where one chapter's text sits inside the composed document. */
export interface BookSegment {
  chapterId: string;
  /** Position in the composed book (0-based). */
  index: number;
  /** Book offset of the chapter's first character. */
  start: number;
  /** Exclusive; `end - start === chapter.markdown.length`. */
  end: number;
  /** 0-based book line of the chapter's first line. */
  lineStart: number;
  lineCount: number;
}

export interface ComposedBook {
  markdown: string;
  /** Book metadata (front matter of the first chapter), handed to the engine
   *  as `PostextContent.metadata` so it applies in chapter-only mode too. */
  metadata: DocumentMetadata;
  segments: BookSegment[];
  /** `'book'` when every chapter is included, else the one included id. */
  scope: 'book' | { only: string };
}

/** Where a chapter's pages sit in the book, derived from the chapter
 *  layouts (see {@link ChapterLayout}) of it and every chapter before it. */
export interface ChapterPages {
  /** 0-based index of the chapter's first content page in the book. */
  pageIndex: number;
  /** Numeric page value shown on that page (respects `startAt`). */
  pageNumberValue: number;
  /** Content pages (leading parity padding excluded). */
  pageCount: number;
}

export type BookPages = Record<string, ChapterPages>;

/** What the last layout of a chapter on its own recorded, with the inputs
 *  it was built from so a stale record is told from a current one. Page
 *  numbers are not part of the inputs: a chapter's page count only depends
 *  on the parity and format it starts with, so shifting the chapters before
 *  it keeps the record valid. */
export interface ChapterLayout {
  chapterId: string;
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
  /** {@link ChapterPlan.continuationKey} at build time. */
  continuationKey: string;
  pageCount: number;
  /** Pages at the start holding no content (parity padding before the
   *  chapter opener). */
  leadingBlankPages: number;
  /** `pageNumberValue` of the last page minus that of the first, so the
   *  next chapter's first number follows whatever numbering the chapter
   *  ends on. */
  lastPageDelta: number;
  /** Page-number format on the last page. */
  lastPageFormat: NumeralStyle;
}

/** How one chapter is laid out on its own, continued after the chapters
 *  before it. */
export interface ChapterPlan {
  chapterId: string;
  index: number;
  /** What the engine inherits. `undefined` for the first chapter (a
   *  self-contained document); the counters alone while the pages of a
   *  preceding chapter are still unknown. */
  continuation: LayoutContinuation | undefined;
  /** Whether `continuation` carries the page fields (offset and numbering)
   *  — false while a preceding chapter still has no current layout. */
  paginated: boolean;
  /** Fingerprint of everything the chapter's page count depends on besides
   *  its own text, config and resources: the counters it inherits, the
   *  parity of its first page and the page-number format it starts with. */
  continuationKey: string;
  /** The current layout record, when one matches every input. */
  layout: ChapterLayout | null;
}

export interface BookPlan {
  chapters: ChapterPlan[];
  byId: Record<string, ChapterPlan>;
  /** Pages of every chapter whose layout (and its predecessors') is known. */
  bookPages: BookPages;
  /** The first chapter without a current layout, in book order; null when
   *  every chapter is paginated. */
  pendingChapterId: string | null;
}
