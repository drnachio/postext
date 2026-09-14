// A sandbox project is a *book*: one shared configuration, font set and
// resource set, plus one markdown document per chapter. These types are the
// vocabulary shared by state, storage records and preset bundles.

import type { DocumentMetadata } from 'postext';

export interface Chapter {
  /** Random UUID; stable across rename/reorder; unique across projects. */
  id: string;
  /** Shown in the UI only; never injected into the markdown. */
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
}

/** What the layout engine receives: every chapter concatenated (a real
 *  book — continuous page numbers, cross-chapter references) or just the
 *  active chapter, for quick edits of long books. */
export type LayoutScope = 'book' | 'chapter';

/** The book-shaped content slice shared by state, records and bundles. */
export interface BookContent {
  /** Book order; always at least one chapter. */
  chapters: Chapter[];
  /** One of `chapters[].id`. */
  activeChapterId: string;
  layoutScope: LayoutScope;
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

/** First page of each chapter from the last whole-book layout. */
export interface ChapterPages {
  /** 0-based index of the chapter's first page. */
  pageIndex: number;
  /** Numeric page value shown on that page (respects `startAt`). */
  pageNumberValue: number;
  pageCount: number;
}

export type BookPages = Record<string, ChapterPages>;
