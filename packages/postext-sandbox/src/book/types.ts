// A sandbox project is a *book*: one shared configuration, font set and
// resource set, plus one markdown document per chapter. These types are the
// vocabulary shared by state, storage records and preset bundles.

import type { DocumentMetadata, LayoutContinuation, NumeralStyle, OutlineEntry, PostextConfig, Resource } from 'postext';

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
  /** Numeric page value shown on that page (respects `startAt` and a
   *  `:::numbering` restart at the chapter's head). */
  pageNumberValue: number;
  /** Page-number format on that page (`upper-roman` front matter…). */
  pageNumberFormat: NumeralStyle;
  /** Numeric page value and format of the chapter's last page. */
  lastPageNumberValue: number;
  lastPageNumberFormat: NumeralStyle;
  /** Content pages (leading parity padding excluded). */
  pageCount: number;
}

export type BookPages = Record<string, ChapterPages>;

/** How a page of a chapter is numbered, in terms the record keeps valid
 *  when the chapters before it shift: `delta` pages after the number the
 *  chapter inherits (its first page's) while no `:::numbering{startAt=…}`
 *  restarts the count before the page, else the absolute `value` the
 *  restart set. */
export type ChapterPageNumber = { delta: number } | { value: number };

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
  /** How the first content page is numbered (see {@link ChapterPageNumber})
   *  and the format printed on it. */
  firstContentPageNumber: ChapterPageNumber;
  firstContentPageFormat: NumeralStyle;
  /** How the last page is numbered, so the next chapter's first number
   *  follows whatever numbering the chapter ends on. */
  lastPageNumber: ChapterPageNumber;
  /** Page-number format on the last page. */
  lastPageFormat: NumeralStyle;
  /** The chapter's outline — its headings and parts with the page label
   *  each landed on — the book's table of contents is assembled from. */
  outline: OutlineEntry[];
  /** {@link ChapterPlan.outlineKey} at build time: the book outline a
   *  chapter printing the contents was laid out with (`''` otherwise). */
  outlineKey: string;
}

/** How one chapter is laid out on its own, continued after the chapters
 *  before it. */
export interface ChapterPlan {
  chapterId: string;
  index: number;
  /** The chapter's number: the ordinal of its first numbered level-1
   *  heading, counted over the book. Null when it opens no numbered
   *  chapter — the front matter (headings styled `numbered: false`) or a
   *  chapter without a level-1 heading. */
  number: number | null;
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
  /** The book's outline, handed to the engine as `content.outline` — only
   *  for a chapter printing the contents (`:::toc`), which depends on the
   *  headings and pages of every chapter. */
  outline?: OutlineEntry[];
  /** Fingerprint of `outline` (`''` when the chapter prints no contents). */
  outlineKey: string;
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
