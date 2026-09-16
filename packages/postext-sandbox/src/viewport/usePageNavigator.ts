'use client';

import { useRef, type MutableRefObject } from 'react';
import { useBookContent, useBookPages } from '../context/SandboxContext';
import { viewHashFragment } from '../storage/viewHash';
import type { PageNavigator } from './CanvasPreview/interaction';

/**
 * Where a link to a book page (a row of the contents) takes the reader:
 * the page's chapter and printed number go into the URL fragment
 * (`#chapter=C&page=P`, assigned so `hashchange` fires), and the chapter
 * and page syncs do the rest — a switch when the page is in another
 * chapter, a jump when it is in the one on screen. A page of the document
 * being read needs no book lookup; any other is found through the page
 * ranges of the paginated chapters, and one not paginated yet is out of
 * reach (nothing happens).
 */
export function usePageNavigator(): MutableRefObject<PageNavigator | null> {
  const { chapters, activeChapterId } = useBookContent();
  const bookPages = useBookPages();
  const ref = useRef<PageNavigator | null>(null);
  ref.current = (pageIndex, doc) => {
    const local = pageIndex - (doc.pageIndexOffset ?? 0);
    let chapter: number;
    let page: number;
    if (local >= 0 && local < doc.pages.length) {
      chapter = chapters.findIndex((c) => c.id === activeChapterId);
      page = doc.pages[local]!.pageNumberValue;
    } else {
      chapter = chapters.findIndex((c) => {
        const p = bookPages[c.id];
        return p !== undefined && pageIndex >= p.pageIndex && pageIndex < p.pageIndex + p.pageCount;
      });
      if (chapter < 0) return;
      const p = bookPages[chapters[chapter]!.id]!;
      page = p.pageNumberValue + (pageIndex - p.pageIndex);
    }
    if (chapter < 0) return;
    const fragment = viewHashFragment({ chapter, page });
    if (window.location.hash === fragment) return;
    window.location.hash = fragment;
  };
  return ref;
}
