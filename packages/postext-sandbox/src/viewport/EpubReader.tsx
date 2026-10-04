'use client';

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useSandboxLabels } from '../context/SandboxContext';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { useLargeTargets } from '../ui/largeTargets';
import { openViewerBook, type ViewerBook } from '../epub/viewerBook';
import { firstIndexOf, fixedScreens, flattenToc, keepReaderFocus, linkTarget, prefersSpreads, screenOf } from '../epub/viewer';

/** What the toolbar shows of the reader: where it is and where it can go. */
export interface EpubReaderPosition {
  /** 1-based spine position of the first document shown, and the count. */
  position: number;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
  /** The book runs right to left: the left arrow goes forward. */
  rightToLeft: boolean;
  /** Page within the chapter (reflowable), 1-based, and its pages. */
  page?: number;
  pages?: number;
  toc: { label: string; href: string; depth: number }[];
}

/** What the toolbar asks of the reader. */
export interface EpubReaderHandle {
  previous(): void;
  next(): void;
  /** Go to a spine position (1-based). */
  goToPosition(position: number): void;
  /** Go to a zip path with an optional `#fragment` (a TOC entry). */
  goTo(href: string): void;
}

interface EpubReaderProps {
  bytes: Uint8Array;
  fontScale: number;
  handleRef: MutableRefObject<EpubReaderHandle | null>;
  onPosition: (position: EpubReaderPosition | null) => void;
}

/** The reader of the EPUB tab: the generated file opened in memory, its
 *  content documents shown in sandboxed frames (no script runs in them;
 *  the reader follows their links itself). */
export function EpubReader({ bytes, fontScale, handleRef, onPosition }: EpubReaderProps) {
  const [book, setBook] = useState<ViewerBook | null>(null);
  useEffect(() => {
    const opened = openViewerBook(bytes);
    setBook(opened);
    return () => {
      setBook(null);
      opened.dispose();
    };
  }, [bytes]);
  useEffect(() => () => onPosition(null), [onPosition]);
  if (!book) return null;
  return book.epub.layout === 'fixed'
    ? <FixedReader book={book} handleRef={handleRef} onPosition={onPosition} />
    : <ReflowReader book={book} fontScale={fontScale} handleRef={handleRef} onPosition={onPosition} />;
}

/** The size of an element, kept up to date. */
function useSize(ref: MutableRefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Room the docked phone toolbar takes at the bottom of the reader. */
function useToolbarReserve(): number {
  const compact = useCompactLayout();
  const { large } = useLargeTargets();
  return compact ? (large ? 120 : 64) : 0;
}

/** Arrow keys and page keys turn pages; in a right-to-left book the left
 *  arrow goes forward. */
function pageKey(e: KeyboardEvent | React.KeyboardEvent, rtl: boolean): 'previous' | 'next' | 'first' | 'last' | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  switch (e.key) {
    case 'ArrowRight': return rtl ? 'previous' : 'next';
    case 'ArrowLeft': return rtl ? 'next' : 'previous';
    case 'PageDown': case 'ArrowDown': case ' ': return 'next';
    case 'PageUp': case 'ArrowUp': return 'previous';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return null;
  }
}

/** Follow links inside a frame's document and pass page keys on. */
function wireFrame(
  frame: HTMLIFrameElement,
  docPath: string,
  onInternal: (path: string, fragment: string) => void,
  onKey: (e: KeyboardEvent) => void,
): void {
  const doc = frame.contentDocument;
  if (!doc) return;
  doc.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const a = target?.closest?.('a[href]');
    if (!a) return;
    e.preventDefault();
    const link = linkTarget(docPath, a.getAttribute('href') ?? '');
    if (!link) return;
    if (link.kind === 'external') window.open(link.url, '_blank', 'noopener,noreferrer');
    else onInternal(link.path, link.fragment);
  });
  doc.addEventListener('keydown', onKey);
}

const SANDBOX = 'allow-same-origin';

/** Width the floating toolbar takes at the right of the desktop layout,
 *  its offset from the edge included (about 66 px with large targets). */
const TOOLBAR_ROOM = 72;

// ---------------------------------------------------------------------------
// Fixed layout: one page or a spread, scaled to fit.
// ---------------------------------------------------------------------------

function FixedReader({ book, handleRef, onPosition }: { book: ViewerBook; handleRef: MutableRefObject<EpubReaderHandle | null>; onPosition: (p: EpubReaderPosition | null) => void }) {
  const labels = useSandboxLabels();
  const compact = useCompactLayout();
  const reserve = useToolbarReserve();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const area = useSize(areaRef);
  const { epub } = book;
  const viewport = epub.viewport ?? { width: 600, height: 800 };
  const rtl = epub.pageProgression === 'rtl';
  const pad = compact ? 8 : 24;
  // The floating toolbar sits over the right edge of the desktop layout.
  const side = compact ? 0 : TOOLBAR_ROOM;
  const room = { width: area.width - 2 * pad - side, height: area.height - 2 * pad - reserve };
  const spreads = !compact && prefersSpreads(room, viewport);
  const screens = useMemo(() => fixedScreens(epub.spine, epub.pageProgression, spreads), [epub, spreads]);
  // The first page shown, kept across a switch between one page and spreads.
  const [index, setIndex] = useState(0);
  const screen = screenOf(screens, index);
  const current = screens[screen];
  const toc = useMemo(() => flattenToc(epub.toc), [epub]);
  // A page's printed label (from the page list), for its frame's title.
  const printedLabel = useMemo(() => new Map(epub.pageList.map((p) => [p.href.split('#')[0]!, p.label])), [epub]);

  const goToScreen = useCallback((s: number) => {
    const clamped = Math.max(0, Math.min(screens.length - 1, s));
    setIndex(firstIndexOf(screens[clamped]));
  }, [screens]);
  const previous = useCallback(() => goToScreen(screen - 1), [goToScreen, screen]);
  const next = useCallback(() => goToScreen(screen + 1), [goToScreen, screen]);
  const goToPath = useCallback((path: string) => {
    const i = epub.spine.findIndex((s) => s.path === path);
    if (i >= 0) setIndex(i);
  }, [epub]);

  useImperativeHandle(handleRef, () => ({
    previous,
    next,
    goToPosition: (n) => setIndex(Math.max(0, Math.min(epub.spine.length - 1, n - 1))),
    goTo: (href) => goToPath(href.split('#')[0]!),
  }), [previous, next, goToPath, epub]);

  useEffect(() => {
    onPosition({
      position: firstIndexOf(current) + 1,
      count: epub.spine.length,
      canPrevious: screen > 0,
      canNext: screen < screens.length - 1,
      rightToLeft: rtl,
      toc,
    });
  }, [current, screen, screens.length, epub, rtl, toc, onPosition]);

  const onKey = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    const action = pageKey(e, rtl);
    if (!action) return;
    e.preventDefault();
    keepReaderFocus(e.target as Node | null, areaRef.current);
    if (action === 'previous') previous();
    else if (action === 'next') next();
    else goToScreen(action === 'first' ? 0 : screens.length - 1);
  }, [rtl, previous, next, goToScreen, screens.length]);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  const perRow = spreads ? 2 : 1;
  const scale = Math.max(0.05, Math.min(room.width / (viewport.width * perRow), room.height / viewport.height));
  const w = viewport.width * scale;
  const h = viewport.height * scale;
  const slots: (number | null)[] = !current ? [] : spreads ? [current.left, current.right] : [firstIndexOf(current)];

  return (
    <div
      ref={areaRef}
      role="region"
      aria-label={labels.epubReader}
      tabIndex={0}
      onKeyDown={onKey}
      className="absolute inset-0 flex items-center justify-center outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ paddingBottom: reserve, paddingRight: side, outlineColor: 'var(--brand)' }}
    >
      {area.width > 0 && slots.map((i, slot) => (
        <div
          key={slot}
          style={{
            width: w,
            height: h,
            overflow: 'hidden',
            backgroundColor: i === null ? 'transparent' : '#fff',
            boxShadow: i === null ? 'none' : '0 1px 6px rgba(0,0,0,0.25)',
            flex: 'none',
          }}
        >
          {i !== null && (
            <iframe
              key={epub.spine[i]!.path}
              src={book.documentUrl(epub.spine[i]!.path)}
              sandbox={SANDBOX}
              title={labels.epubPageFrame.replace('__page__', printedLabel.get(epub.spine[i]!.path) ?? String(i + 1))}
              onLoad={(e) => wireFrame(e.currentTarget, epub.spine[i]!.path, (path) => goToPath(path), (ev) => onKeyRef.current(ev))}
              style={{
                width: viewport.width,
                height: viewport.height,
                border: 0,
                transform: `scale(${scale})`,
                transformOrigin: '0 0',
                display: 'block',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reflowable: one content document paginated in CSS columns.
// ---------------------------------------------------------------------------

/** Where to land in a document once it is laid out. */
type Landing = { page: number | 'last' } | { fragment: string } | { fraction: number };

const READER_STYLE_ID = 'postext-epub-reader';

/** The style that sets a content document in pages of `width` × `height`
 *  CSS px: columns one screen wide, laid side by side (top to bottom in
 *  vertical writing), the type at `fontScale`. The margins keep a line
 *  to a readable measure on a wide screen. */
function pagedCss(width: number, height: number, fontScale: number, vertical: boolean): string {
  const edge = (size: number) => Math.max(20, Math.min(48, Math.round(size * 0.05)));
  // Lines run across the screen, or down it in vertical writing.
  const ph = vertical ? edge(width) : Math.max(20, Math.round((width - 720) / 2));
  const pv = vertical ? Math.max(edge(height), Math.round((height - 900) / 2)) : edge(height);
  const columns = vertical
    ? `column-width: ${height - 2 * pv}px !important; column-gap: ${2 * pv}px !important;`
    : `column-width: ${width - 2 * ph}px !important; column-gap: ${2 * ph}px !important;`;
  return `html { margin: 0 !important; padding: 0 !important; overflow: hidden !important; font-size: ${Math.round(fontScale * 100)}% !important; }
body { box-sizing: border-box !important; margin: 0 !important; max-width: none !important; max-height: none !important; width: ${width}px !important; height: ${height}px !important; padding: ${pv}px ${ph}px !important; ${columns} column-fill: auto !important; overflow: visible !important; }
img, svg, video { max-width: ${width - 2 * ph}px !important; max-height: ${height - 2 * pv}px !important; object-fit: contain; }
figure, img, svg { break-inside: avoid; }`;
}

function ReflowReader({ book, fontScale, handleRef, onPosition }: { book: ViewerBook; fontScale: number; handleRef: MutableRefObject<EpubReaderHandle | null>; onPosition: (p: EpubReaderPosition | null) => void }) {
  const labels = useSandboxLabels();
  const compact = useCompactLayout();
  const reserve = useToolbarReserve();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const area = useSize(areaRef);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { epub } = book;
  const rtl = epub.pageProgression === 'rtl';
  const toc = useMemo(() => flattenToc(epub.toc), [epub]);
  // The pages stop short of the floating toolbar at the right of the
  // desktop layout, as the docked one on a phone is kept below them.
  const width = Math.max(0, area.width - (compact ? 0 : TOOLBAR_ROOM));
  const height = Math.max(0, area.height - reserve);

  const [docIndex, setDocIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const landingRef = useRef<Landing>({ page: 0 });
  const pageRef = useRef(0);
  pageRef.current = page;
  const pagesRef = useRef(1);
  pagesRef.current = pages;
  const path = epub.spine[docIndex]?.path ?? '';

  /** The frame's document laid out again in pages and moved to the
   *  landing place. */
  const layOut = useCallback(() => {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win || !doc.documentElement || width <= 0 || height <= 0) return;
    const root = doc.documentElement;
    const body = doc.body ?? root;
    const mode = win.getComputedStyle(body).writingMode || win.getComputedStyle(root).writingMode;
    const vertical = mode.startsWith('vertical') || mode.startsWith('sideways');
    let style = doc.getElementById(READER_STYLE_ID);
    if (!style) {
      style = doc.createElementNS('http://www.w3.org/1999/xhtml', 'style');
      style.id = READER_STYLE_ID;
      (doc.head ?? root).appendChild(style);
    }
    const css = pagedCss(width, height, fontScale, vertical);
    if (style.textContent !== css) style.textContent = css;
    // The pages are moved into view rather than scrolled to: a document
    // scrolls no further than its last column reaches, which leaves the
    // last page short of a whole screen.
    const showAt = (p: number) => {
      const shift = vertical ? `translateY(${-p * height}px)` : `translateX(${(dirRtl ? 1 : -1) * p * width}px)`;
      body.style.setProperty('transform', p === 0 ? 'none' : shift);
    };
    const dirRtl = !vertical && win.getComputedStyle(body).direction === 'rtl';
    showAt(0);
    const step = vertical ? height : width;
    const extent = vertical ? root.scrollHeight : root.scrollWidth;
    // The last column may stop short of its page's end.
    const count = Math.max(1, Math.ceil(extent / step - 0.02));
    const landing = landingRef.current;
    let target = 0;
    if ('page' in landing) target = landing.page === 'last' ? count - 1 : landing.page;
    else if ('fraction' in landing) target = Math.round(landing.fraction * (count - 1));
    else {
      const el = doc.getElementById(landing.fragment);
      if (el) {
        const r = el.getBoundingClientRect();
        if (vertical) target = Math.floor((r.top + r.height / 2) / height);
        else if (dirRtl) target = Math.max(0, Math.ceil(-(r.left + r.width / 2) / width));
        else target = Math.floor((r.left + r.width / 2) / width);
      }
    }
    target = Math.max(0, Math.min(count - 1, target));
    showAt(target);
    // Later layouts of this document keep the share read.
    landingRef.current = { fraction: count > 1 ? target / (count - 1) : 0 };
    setPages(count);
    setPage(target);
  }, [width, height, fontScale]);
  const layOutRef = useRef(layOut);
  layOutRef.current = layOut;

  // A new size or type size: the same place, paginated again.
  useEffect(() => {
    const p = pageRef.current;
    const n = pagesRef.current;
    landingRef.current = { fraction: n > 1 ? p / (n - 1) : 0 };
    layOut();
  }, [layOut]);

  const showPage = useCallback((p: number) => {
    landingRef.current = { page: p };
    layOutRef.current();
  }, []);

  const openDocument = useCallback((i: number, landing: Landing) => {
    landingRef.current = landing;
    if (i === docIndex) layOutRef.current();
    else setDocIndex(i);
  }, [docIndex]);

  const previous = useCallback(() => {
    if (page > 0) showPage(page - 1);
    else if (docIndex > 0) openDocument(docIndex - 1, { page: 'last' });
  }, [page, docIndex, showPage, openDocument]);
  const next = useCallback(() => {
    if (page < pages - 1) showPage(page + 1);
    else if (docIndex < epub.spine.length - 1) openDocument(docIndex + 1, { page: 0 });
  }, [page, pages, docIndex, epub, showPage, openDocument]);
  const goTo = useCallback((href: string) => {
    const hash = href.indexOf('#');
    const target = hash < 0 ? href : href.slice(0, hash);
    const fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
    const i = epub.spine.findIndex((s) => s.path === target);
    if (i < 0) return;
    openDocument(i, fragment ? { fragment } : { page: 0 });
  }, [epub, openDocument]);

  useImperativeHandle(handleRef, () => ({
    previous,
    next,
    goToPosition: (n) => openDocument(Math.max(0, Math.min(epub.spine.length - 1, n - 1)), { page: 0 }),
    goTo,
  }), [previous, next, goTo, openDocument, epub]);

  useEffect(() => {
    onPosition({
      position: docIndex + 1,
      count: epub.spine.length,
      canPrevious: docIndex > 0 || page > 0,
      canNext: docIndex < epub.spine.length - 1 || page < pages - 1,
      rightToLeft: rtl,
      page: page + 1,
      pages,
      toc,
    });
  }, [docIndex, page, pages, epub, rtl, toc, onPosition]);

  const onKey = useCallback((e: KeyboardEvent | React.KeyboardEvent) => {
    const action = pageKey(e, rtl);
    if (!action) return;
    e.preventDefault();
    keepReaderFocus(e.target as Node | null, areaRef.current);
    if (action === 'previous') previous();
    else if (action === 'next') next();
    else openDocument(action === 'first' ? 0 : epub.spine.length - 1, { page: action === 'first' ? 0 : 'last' });
  }, [rtl, previous, next, openDocument, epub]);
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const onLoad = useCallback((e: React.SyntheticEvent<HTMLIFrameElement>) => {
    const frame = e.currentTarget;
    wireFrame(frame, path, (p, fragment) => goToRef.current(fragment ? `${p}#${encodeURIComponent(fragment)}` : p), (ev) => onKeyRef.current(ev));
    layOutRef.current();
    // Faces arrive after the load event: paginate again once they are in.
    const fonts = frame.contentDocument?.fonts;
    if (fonts) {
      void fonts.ready.then(() => layOutRef.current());
      fonts.addEventListener('loadingdone', () => layOutRef.current());
    }
  }, [path]);

  return (
    <div
      ref={areaRef}
      role="region"
      aria-label={labels.epubReader}
      tabIndex={0}
      onKeyDown={onKey}
      className="absolute inset-0 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2"
      style={{ outlineColor: 'var(--brand)' }}
    >
      {width > 0 && height > 0 && (
        <iframe
          key={path}
          ref={frameRef}
          src={book.documentUrl(path)}
          sandbox={SANDBOX}
          title={labels.epubChapterFrame.replace('__index__', String(docIndex + 1)).replace('__count__', String(epub.spine.length))}
          onLoad={onLoad}
          style={{ position: 'absolute', left: 0, top: 0, width, height, border: 0, backgroundColor: '#fff', colorScheme: 'light' }}
        />
      )}
    </div>
  );
}
