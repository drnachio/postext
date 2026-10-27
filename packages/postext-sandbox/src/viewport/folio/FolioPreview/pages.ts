'use client';

// The Folio preview's page helpers: the videos a page plays, the shown
// document and the book's pages round a chapter, a page's place in another
// layout, the desk textures, the proof paper and the label fill (#1276:
// split out of FolioPreview.tsx).
import { type PageVideoSpot, pageVideoSpots, spotContains } from 'postext-folio';
import type { VDTDocument } from 'postext';
import type { BookPlan } from '../../../book/types.js';
import type { PlayableVideo } from '../../viewerVideos.js';

/** The videos of a page that Folio plays itself (a file or its address;
 *  a YouTube or Vimeo poster turns the page as any other). */
export function playableVideos(doc: VDTDocument, pageIndex: number): PlayableVideo<PageVideoSpot>[] {
  const page = doc.pages[pageIndex];
  if (!page) return [];
  return pageVideoSpots(page, doc)
    .filter((spot) => spot.video.source === 'file')
    .map((spot) => ({ resource: spot.resourceId, pageIndex, contains: (x, y) => spotContains(spot, x, y), item: spot }));
}

export const videoKey = (pageIndex: number, resource: string): string => `${pageIndex}|${resource}`;

/** A laid-out document with what tells its pages apart across layouts:
 *  the chapter (position in the book) of every page of a whole-book
 *  document, or the one chapter of a chapter's. */
export interface ShownDoc {
  doc: VDTDocument;
  pageChapters: readonly number[] | null;
  chapter: number;
  /** A chapter's document: the book's pages before and after it (its
   *  first and last leaves are the covers only at the book's ends). */
  extraPages?: { before: number; after: number };
  /** The book it was laid out from (`bookVersion`). */
  book: number;
}

/** The pages of the book round a chapter laid out on its own: those before
 *  it (its offset; at least one when a chapter before it is not paginated
 *  yet) and those of the chapters after it (their last layouts, one page
 *  for a chapter not laid out yet). Only the first chapter has none before
 *  it and only the last none after: a chapter from the middle of a book
 *  with its own covers turns paper leaves at both ends (#449). */
export function pagesAround(doc: VDTDocument, plan: BookPlan, chapterId: string): { before: number; after: number } {
  const index = plan.chapters.findIndex((c) => c.chapterId === chapterId);
  const offset = doc.pageIndexOffset ?? 0;
  if (index < 0) return { before: offset, after: 0 };
  const before = index > 0 ? Math.max(1, offset) : offset;
  const after = plan.chapters.slice(index + 1).reduce((n, c) => n + Math.max(1, c.layout?.pageCount ?? 1), 0);
  return { before, after };
}

/** Where page `index` of `from` lies in `to`: the page of the same chapter
 *  carrying the same number (indexes differ between a chapter's document
 *  and the whole book's, and shift with an edit); -1 when `to` has none. */
export function samePage(from: ShownDoc, index: number, to: ShownDoc): number {
  const page = from.doc.pages[index];
  if (!page) return -1;
  const chapter = from.pageChapters?.[index] ?? from.chapter;
  return to.doc.pages.findIndex((p, i) =>
    (to.pageChapters?.[i] ?? to.chapter) === chapter
    && p.pageNumberValue === page.pageNumberValue
    && p.pageNumberFormat === page.pageNumberFormat);
}

/** The scanned desk textures the site serves (apps/web/public). */
export const FOLIO_TEXTURES = '/folio/textures';

/** The book's paper while the print preview proofs the pages on the
 *  paper's own white (#799): neutral, so that white is the one shown. */
export const PROOF_PAPER = { hex: '#ffffff', model: 'hex' } as const;

export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/__(\w+)__/g, (m, key: string) => (key in values ? String(values[key]) : m));
