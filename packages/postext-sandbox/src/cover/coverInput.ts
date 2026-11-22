// What the engine's `buildCover` is given in the Sandbox (#1669): the
// book's configuration, its page count (the spine is measured from it),
// its cover Markdown and the metadata its first chapter carries. Pure, so
// the panel, the stage, the EPUB tab and the tools build the same cover.

import type { PostextConfig, Resource } from 'postext';
import type { BuildCoverInput, CoverSheetKind, ProductionVersion } from 'postext/production';
import { bookMetadata } from '../book/compose.js';
import type { BookPages, Chapter } from '../book/types.js';

/** The pages the book has, from the chapters whose pagination is known:
 *  the end of the last one. 0 while none is. */
export function planPageCount(bookPages: BookPages): number {
  let end = 0;
  for (const c of Object.values(bookPages)) end = Math.max(end, c.pageIndex + c.pageCount);
  return end;
}

/** The book a cover is built from. */
export interface CoverBook {
  config: PostextConfig;
  chapters: readonly Chapter[];
  resources: readonly Resource[];
  coverMarkdown?: string | undefined;
  bookPages: BookPages;
  /** The book's page count when it is known otherwise (the EPUB and the
   *  compiler lay the whole book out): goes over `bookPages`. */
  pages?: number;
}

/** The versions the book has, in their order. */
export function bookVersions(config: PostextConfig): readonly ProductionVersion[] {
  return config.production?.versions ?? [];
}

/** The version a choice names, or the book's first when it names none or
 *  one the book no longer has. */
export function pickVersion(config: PostextConfig, id: string | null | undefined): ProductionVersion | undefined {
  const versions = bookVersions(config);
  return versions.find((v) => v.id === id) ?? versions[0];
}

/** `buildCover`'s input for a version and sheet of the book. */
export function coverBuildInput(book: CoverBook, version: string | ProductionVersion, sheet: CoverSheetKind = 'cover'): BuildCoverInput {
  return {
    config: book.config,
    version,
    // At least one page: a book not yet paginated still shows a cover.
    pages: Math.max(1, book.pages ?? planPageCount(book.bookPages)),
    ...(book.coverMarkdown !== undefined ? { markdown: book.coverMarkdown } : {}),
    metadata: bookMetadata(book.chapters),
    resources: book.resources,
    sheet,
  };
}
