// The whole book on the canvas: every chapter laid out on its own (after
// the ones before it, as the previews and the PDF tab do) and the documents
// stitched into one, page after page, so the canvas shows one continuous
// document while an edit only re-lays out the chapter it touched.
//
// Pages and blocks are renumbered into book page indices; source offsets
// stay chapter offsets (each chapter's document was built from its own
// composition), so a page's chapter is what maps them back to the editor
// — see `pageChapterIds`.

import type { VDTBlock, VDTDocument, VDTPage } from 'postext';
import { segmentAtOffset } from './compose';
import { leadingBlankPageCount } from './pagination';
import type { ComposedBook } from './types';

export interface StitchedChapter {
  chapterId: string;
  doc: VDTDocument;
}

export interface StitchedBook {
  doc: VDTDocument;
  /** Chapter id of every page of `doc`, by page index. */
  pageChapterIds: string[];
  /** Position in the book of every page's chapter, by page index. */
  pageChapters: number[];
  /** Index of every chapter's first content page (its parity padding
   *  skipped), by chapter position; -1 for a chapter without a page. */
  chapterFirstPages: number[];
}

/** Pages before `doc`'s first block, by chapter position, as the book page
 *  index they start at. */
export function stitchDocuments(chapters: readonly StitchedChapter[]): StitchedBook | null {
  const first = chapters[0]?.doc;
  if (!first) return null;
  const pages: VDTPage[] = [];
  const blocks: VDTBlock[] = [];
  const pageChapterIds: string[] = [];
  const pageChapters: number[] = [];
  const chapterFirstPages: number[] = [];
  const warnings: NonNullable<VDTDocument['warnings']> = [];
  const restarts: number[] = [];
  let converged = true;
  let iterationCount = 0;
  chapters.forEach(({ chapterId, doc }, chapterIndex) => {
    const offset = pages.length;
    const count = doc.pages.length;
    chapterFirstPages.push(count === 0 ? -1 : offset + Math.min(leadingBlankPageCount(doc), count - 1));
    for (const page of doc.pages) {
      pages.push(offset === 0 ? page : shiftPage(page, offset));
      pageChapterIds.push(chapterId);
      pageChapters.push(chapterIndex);
    }
    for (const block of doc.blocks) blocks.push(offset === 0 ? block : { ...block, pageIndex: block.pageIndex + offset });
    for (const w of doc.warnings ?? []) warnings.push(offset === 0 ? w : { ...w, pageIndex: w.pageIndex + offset });
    for (const r of doc.pageNumberRestarts ?? []) restarts.push(r + offset);
    converged &&= doc.converged;
    iterationCount += doc.iterationCount;
  });
  const doc: VDTDocument = {
    ...first,
    pages,
    blocks,
    ...(warnings.length > 0 ? { warnings } : {}),
    converged,
    iterationCount,
    pageIndexOffset: 0,
    ...(restarts.length > 0 ? { pageNumberRestarts: restarts } : {}),
  };
  return { doc, pageChapterIds, pageChapters, chapterFirstPages };
}

function shiftPage(page: VDTPage, offset: number): VDTPage {
  const floats = page.floats?.map((b) => ({ ...b, pageIndex: b.pageIndex + offset }));
  return { ...page, index: page.index + offset, ...(floats ? { floats } : {}) };
}

/** The page map of a whole book laid out as one document (the HTML
 *  preview): the chapter of every page, read from the source offsets of
 *  the blocks on it, and every chapter's first content page. A page without
 *  blocks (parity padding, a blank leaf) belongs to the chapter of the page
 *  before it — or, at the front, of the first page with content. */
export function composedBookPageMap(doc: VDTDocument, book: ComposedBook): Pick<StitchedBook, 'pageChapters' | 'chapterFirstPages'> {
  const pageStarts = new Array<number>(doc.pages.length).fill(-1);
  for (const block of doc.blocks) {
    if (block.sourceStart === undefined || block.pageIndex < 0 || block.pageIndex >= pageStarts.length) continue;
    const start = pageStarts[block.pageIndex]!;
    if (start < 0 || block.sourceStart < start) pageStarts[block.pageIndex] = block.sourceStart;
  }
  const chapterCount = book.segments.reduce((n, seg) => Math.max(n, seg.index + 1), 0);
  const chapterFirstPages = new Array<number>(chapterCount).fill(-1);
  const pageChapters = new Array<number>(doc.pages.length).fill(-1);
  let last = -1;
  pageStarts.forEach((start, pageIndex) => {
    if (start < 0) {
      pageChapters[pageIndex] = last;
      return;
    }
    const chapter = segmentAtOffset(book, start).index;
    pageChapters[pageIndex] = chapter;
    if (chapterFirstPages[chapter] === -1) chapterFirstPages[chapter] = pageIndex;
    last = chapter;
  });
  // Leading blank pages: the first content page's chapter.
  const firstContent = pageChapters.findIndex((c) => c >= 0);
  for (let i = 0; i < firstContent; i++) pageChapters[i] = pageChapters[firstContent]!;
  return { pageChapters, chapterFirstPages };
}
