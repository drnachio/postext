'use client';

// The HTML preview's props and the handle it gives the viewport toolbar
// (#1276: split out of HtmlPreview/index.tsx).
import type { BookPageMap } from '../../usePageHashSync.js';
import type { ColumnMode } from './constants.js';
import type { PreviewVideo, VideoPick, PreviewVideoResult } from '../../viewerVideos.js';

export interface HtmlPreviewProps {
  fontScale: number;
  columnMode: ColumnMode;
  onGeneratingChange?: (generating: boolean) => void;
  // Emits whether the viewer can scroll further in each direction. Scroll
  // bounds rather than column indices — the viewer may show several columns
  // per viewport, so reporting a single "current column" is ambiguous.
  /** `rtl`: the pages run right to left (a right-bound book in multi
   *  mode): the next page is to the left. */
  onScrollBoundsChange?: (info: { canPrev: boolean; canNext: boolean; rtl?: boolean }) => void;
  /** Page count of the last laid-out document. */
  /** After every layout: the page count, the first page with content
   *  (the ones before it are parity padding), the book page number of
   *  every page and — for the whole book laid out as one document — the
   *  chapter of every page. */
  onPageCountChange?: (count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void;
  /** The page the reader is on: the first page snapped into view in multi
   *  mode, the page nearest the viewport centre in single mode. */
  onCurrentPageChange?: (pageIndex: number) => void;
}

export interface HtmlPreviewHandle {
  regenerate: () => void;
  scrollColumn: (delta: number) => void;
  /** Scroll so the given page starts at the viewer's leading edge. */
  jumpToPage: (pageIndex: number) => void;
  /** The video players of the pages. */
  videos: () => PreviewVideo[];
  /** Brings a video's page into view and plays it; one already playing
   *  is left to play. */
  playVideo: (pick: VideoPick) => Promise<PreviewVideoResult>;
  /** Pauses the videos playing on the pages. */
  stopVideo: () => void;
}
