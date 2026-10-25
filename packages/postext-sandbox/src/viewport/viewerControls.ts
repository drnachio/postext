'use client';

// What each viewer tab lets code outside it do: read its own settings
// (zoom, spreads, reader type size — kept in the tab, not in the sandbox
// state), change them, turn its pages and run its buttons. The tab on
// screen registers its controls here; the WebMCP tools (../webmcp) are
// what calls them, so an agent works the viewers the reader sees.

import { useEffect, useRef } from 'react';
import type { ViewportTab } from '../types/index.js';

/** The settings a viewer keeps for itself. Each tab takes its own and
 *  ignores the rest. */
export interface ViewerSettings {
  /** Canvas: magnification, applied when `fit` is `none`. */
  zoom?: number;
  /** Canvas: the page fitted to the width or the height of the viewer. */
  fit?: 'none' | 'width' | 'height';
  /** Canvas: one page per row, or facing pages. */
  pages?: 'single' | 'spread';
  /** HTML and EPUB (reflowable): the reader's type size, 1 as designed. */
  fontScale?: number;
  /** HTML: one scrolling column, or screen-high columns paged sideways. */
  columns?: 'single' | 'multi';
  /** Folio: what the pointer does on the book. */
  interaction?: 'hand' | 'orbit' | 'select' | 'magnify';
  /** The floating bar kept on screen. */
  toolbarPinned?: boolean;
  /** SCORM: the ids of the tree's nodes ticked (`contents[].href`); a node
   *  named is ticked whole, the rest left out (#1266). */
  scormPick?: string[];
}

/** An entry of the EPUB's table of contents: where it goes (`href`, a
 *  path inside the file with an optional `#fragment`) and how deep it is
 *  nested (0 at the top). */
export interface ViewerContentsEntry {
  title: string;
  href: string;
  depth: number;
  /** SCORM: the tree's node (`href` is its id) ticked whole, in part or
   *  not at all. */
  picked?: 'all' | 'some' | 'none';
}

/** A warning of the last EPUB written: its kind as the writer names it
 *  (`missingFont`, `missingImage`, `fontWithheld`, `unsupported`…) and
 *  what it is about. */
export type ViewerNotice = { kind: string } & Record<string, unknown>;

/** A video a viewer can play on its pages. */
export interface ViewerVideo {
  /** The id of the video resource. */
  resource: string;
  /** The number its page carries in the book. */
  pageNumber: number;
  state: 'playing' | 'paused' | 'stopped';
}

/** The video a caller means: the one of a resource, the one on a page,
 *  the one under a point of a page (`x`, `y` as fractions of the page's
 *  width and height from its top left corner); the first one on show when
 *  nothing is named. */
export interface ViewerVideoTarget {
  resource?: string;
  pageNumber?: number;
  x?: number;
  y?: number;
}

/** What came of asking a viewer to play a video. */
export interface ViewerVideoResult {
  /** The video plays (it started, went on, or was playing already). */
  played: boolean;
  resource?: string;
  pageNumber?: number;
  /** It was playing before the call. */
  already?: boolean;
  /** The browser let it start only without sound. */
  muted?: boolean;
  /** It was asked to play and is still fetching what it plays. */
  loading?: boolean;
  /** Why nothing plays: no playable video matches (`none`), the video is
   *  on pages the viewer does not show now (`elsewhere`, with
   *  `pageNumbers`), or the browser refused to play it (`refused`). */
  reason?: 'none' | 'elsewhere' | 'refused';
  pageNumbers?: number[];
}

export interface ViewerStatus extends ViewerSettings {
  /** A layout or a file is being made. */
  generating: boolean;
  /** PDF and EPUB: the book changed since the file on screen was made. */
  stale?: boolean;
  error?: string | null;
  /** PDF and EPUB, while the file is written: the share done (0 to 1, as
   *  the progress bar shows it) and what is being done — `layout` or
   *  `render` for the PDF; `layout`, `inputs`, `documents`, `resources` or
   *  `package` for the EPUB. Null when nothing is being written. */
  progress?: number | null;
  phase?: string | null;
  /** Pages of the document on screen (PDF: of the file last written). */
  pageCount?: number;
  /** The page on screen: its position in that document (0-based) and the
   *  number it carries in the book. */
  pageIndex?: number;
  pageNumber?: number;
  /** PDF and EPUB: size of the file on screen, in bytes. */
  fileSize?: number | null;
  /** EPUB: the document on screen in the reading order (1-based). */
  position?: number;
  positionCount?: number;
  /** EPUB (reflowable): the page on screen within that document (1-based)
   *  and the pages the document takes at this size. */
  documentPage?: number;
  documentPages?: number;
  /** Whether a page lies after or before the one on screen. */
  canNext?: boolean;
  canPrevious?: boolean;
  /** EPUB: the table of contents of the file on screen. */
  contents?: ViewerContentsEntry[];
  /** EPUB: what the last file was written with warnings about. */
  notices?: ViewerNotice[];
  /** Folio: the view as it is seen now, in degrees, as `folio.tilt` and
   *  `folio.yaw` name it; null without the 3D book. */
  view?: { tilt: number; yaw: number } | null;
  /** Folio: how many times the magnifying glass magnifies while it is
   *  held over the book; null while it is put away. */
  magnification?: number | null;
  /** HTML: the reader asked for one column and the book, set vertically,
   *  is only read in columns paged sideways. */
  columnsForced?: boolean;
  /** Folio: the videos of the spread on show; HTML: those of the document
   *  on screen. Only videos the viewer plays itself (a file or a stream
   *  address, not a YouTube or Vimeo frame). */
  videos?: ViewerVideo[];
}

export interface ViewerControls {
  status: () => ViewerStatus;
  set: (settings: ViewerSettings) => void;
  /** Lay the document out again, or write the file again. Resolves when
   *  the PDF or the EPUB is written; at once for the previews. */
  regenerate: () => void | Promise<void>;
  /** Show the page at this position of the document on screen (0-based). */
  goToPage?: (pageIndex: number) => void;
  /** The next page, spread, column or document (1), or the one before (-1). */
  step?: (delta: 1 | -1) => void;
  /** The first page of the document on screen, or its last. */
  goToEdge?: (edge: 'first' | 'last') => void;
  /** EPUB: go where an entry of the contents points (a path inside the
   *  file, with an optional `#fragment`). */
  goTo?: (href: string) => void;
  /** PDF and EPUB: the file on screen. */
  file?: () => { bytes: Uint8Array; name: string; mime: string } | null;
  download?: () => void;
  print?: () => void;
  /** Folio: the view the settings give, and the view on screen kept as
   *  the book's (`folio.tilt`, `folio.yaw`). */
  resetView?: () => void;
  saveView?: () => void;
  /** Folio: hold the magnifying glass over the middle of the open spread
   *  at this magnification (the pointer mode becomes `magnify`, which the
   *  glass belongs to), or put it away with null. */
  setMagnification?: (zoom: number | null) => void;
  /** Folio and HTML: play a video of the pages, as a click on it does. */
  playVideo?: (target: ViewerVideoTarget) => ViewerVideoResult | Promise<ViewerVideoResult>;
  /** Folio and HTML: stop the videos playing on the pages. */
  stopVideo?: () => void;
}

const registered = new Map<ViewportTab, ViewerControls>();

/** The controls of the tab on screen, or null while it is not mounted. */
export function viewerControls(tab: ViewportTab): ViewerControls | null {
  return registered.get(tab) ?? null;
}

/** Registers `controls` for `tab` until the function it returns is
 *  called (the viewer unmounting). */
export function registerViewerControls(tab: ViewportTab, controls: ViewerControls): () => void {
  registered.set(tab, controls);
  return () => {
    if (registered.get(tab) === controls) registered.delete(tab);
  };
}

/** The members a viewer may leave out, each named once: a member added to
 *  {@link ViewerControls} must be listed here to reach a viewer. */
const OPTIONAL: Record<Exclude<keyof ViewerControls, 'status' | 'set' | 'regenerate'>, true> = {
  goToPage: true,
  step: true,
  goToEdge: true,
  goTo: true,
  file: true,
  download: true,
  print: true,
  resetView: true,
  saveView: true,
  setMagnification: true,
  playVideo: true,
  stopVideo: true,
};

/** Controls that always call the ones `read` gives at that moment. A
 *  member the viewer leaves out reads as undefined here too, so a caller
 *  can tell what a viewer does not do. */
export function latestControls(read: () => ViewerControls): ViewerControls {
  const proxy: ViewerControls = {
    status: () => read().status(),
    set: (settings) => read().set(settings),
    regenerate: () => read().regenerate(),
  };
  for (const name of Object.keys(OPTIONAL) as (keyof typeof OPTIONAL)[]) {
    Object.defineProperty(proxy, name, {
      enumerable: true,
      get: () => (read()[name] ? (...args: unknown[]) => (read()[name] as (...a: unknown[]) => unknown)(...args) : undefined),
    });
  }
  return proxy;
}

/** Registers `controls` for `tab` while the calling viewer is mounted.
 *  The object may be new on every render: calls reach the latest one. */
export function useViewerControls(tab: ViewportTab, controls: ViewerControls): void {
  const latest = useRef(controls);
  latest.current = controls;
  useEffect(() => registerViewerControls(tab, latestControls(() => latest.current)), [tab]);
}
