'use client';

import { forwardRef, useRef, useMemo, useDeferredValue, useState, useEffect } from 'react';
import { type VDTDocument, type HtmlRenderIndex, coordinateVideoPlayback } from 'postext';
import { useSandbox, useSandboxDocSourceRef, useLayoutSource, useSandboxSelector } from '../../../context/SandboxContext.js';
import { composeBookMemo } from '../../../book/compose.js';
import type { ComposedBook } from '../../../book/types.js';
import { useShadowDom } from '../../../hooks/useShadowDom.js';
import { useLayoutWorker } from '../../../worker/useLayoutWorker.js';
import { useTemplateEditorHost } from '../../../templates/useTemplateEditorHost.js';
import { usePageNavigator } from '../../usePageNavigator.js';
import { type ColumnMode, SHADOW_CSS, PADDING_PX } from './constants.js';
import type { HtmlPreviewHandle, HtmlPreviewProps } from './types.js';
import { useRelayout } from './hooks/useRelayout.js';
import { useOverlays } from './hooks/useOverlays.js';

export type { HtmlPreviewHandle } from './types.js';

export const HtmlPreview = forwardRef<HtmlPreviewHandle, HtmlPreviewProps>(
function HtmlPreview({ fontScale, columnMode, onGeneratingChange, onScrollBoundsChange, onPageCountChange, onCurrentPageChange }, ref) {
  const { state, dispatch, docRef: sharedDocRef } = useSandbox();
  const sharedDocSourceRef = useSandboxDocSourceRef();
  const layoutSource = useLayoutSource();
  const { chapterId: activeChapterId } = layoutSource;
  const { hostRef, shadowRef } = useShadowDom();
  const a11yRegion = useSandboxSelector((s) => s.labels.htmlPreviewRegion);
  const a11yNewTab = useSandboxSelector((s) => s.labels.opensInNewTab);
  const a11yRef = useRef({ region: a11yRegion, newTab: a11yNewTab });
  a11yRef.current = { region: a11yRegion, newTab: a11yNewTab };
  // A book meant to be read whole (`view.canvasScope: 'book'`, as the canvas
  // reads it) is laid out whole here too: every chapter as one document,
  // continued from nothing. Otherwise the viewer shows the active chapter,
  // continued after the ones before it.
  const wholeBook = useMemo(
    () => (state.canvasScope === 'book' ? composeBookMemo(state.chapters) : null),
    [state.canvasScope, state.chapters],
  );
  const deferredSource = useDeferredValue(layoutSource);
  const deferredWholeBook = useDeferredValue(wholeBook);
  const deferredConfig = useDeferredValue(state.config);
  // The book the current `docRef` was built from.
  const builtSourceRef = useRef<ComposedBook | null>(null);
  const deferredResources = useDeferredValue(state.resources);

  const layoutWorker = useLayoutWorker('preview');
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const contentHostRef = useRef<HTMLDivElement | null>(null);
  const viewportSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const relayoutTimerRef = useRef<number | null>(null);
  const renderSeqRef = useRef(0);
  // Page geometry captured by the last successful relayout. Used by the
  // column-scroll imperative API and the scroll-bounds emitter so they read
  // the same values doRelayout decided on, without recomputing them. A "page"
  // is the horizontal scroll unit; in multi mode it hosts the document's real
  // column structure (one, two, or one-and-a-half text columns).
  const columnGeomRef = useRef<{ pageWidthPx: number; columnGapPx: number }>({ pageWidthPx: 0, columnGapPx: 0 });
  const onGeneratingChangeRef = useRef(onGeneratingChange);
  onGeneratingChangeRef.current = onGeneratingChange;
  const onScrollBoundsChangeRef = useRef(onScrollBoundsChange);
  onScrollBoundsChangeRef.current = onScrollBoundsChange;
  const onPageCountChangeRef = useRef(onPageCountChange);
  onPageCountChangeRef.current = onPageCountChange;
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  onCurrentPageChangeRef.current = onCurrentPageChange;

  // Refs for click-handler plumbing — same pattern as CanvasPreview so the
  // reused attachSlotClickHandler can dispatch and detect the active panel
  // without re-attaching on every render.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(state.activePanel);
  activePanelRef.current = state.activePanel;
  // Under the whole book, the chapter of every page of the document (a
  // contents row then names the page's chapter, not the active one).
  const chapterOfPageRef = useRef<((pageIndex: number) => number) | null>(null);
  const navigateRef = usePageNavigator(chapterOfPageRef);
  const docRef = useRef<VDTDocument | null>(null);
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  // The label editor writes anchors through the book's state (#956).
  useTemplateEditorHost();
  // The page elements whose label editor is attached (#956).
  const labelEditorPages = useMemo(() => new WeakSet<HTMLElement>(), []);
  // Previous indexed render — drives block-level DOM patching so that an
  // edit that changed a single paragraph touches only that paragraph's DOM.
  const lastRenderRef = useRef<HtmlRenderIndex | null>(null);
  // Signature captured alongside the last render. When any of these differ
  // on the next pass we fall back to a full innerHTML rebuild instead of
  // trying to patch.
  const lastRenderSigRef = useRef<string | null>(null);
  const [docVersion, setDocVersion] = useState(0);
  /** The pages run right to left (see `onScrollBoundsChange`). */
  const rtlRef = useRef(false);
  // The exercises' controls (#1230), laid again after every render, and
  // what their answers are kept under: the book (a project, else the
  // preset shown) and the chapter laid out.
  const detachExercisesRef = useRef<(() => void) | null>(null);
  const exerciseKeyRef = useRef('');
  exerciseKeyRef.current = `postext-sandbox:${state.activeProjectId ?? `preset:${state.activePresetId ?? ''}`}:${wholeBook ? 'book' : activeChapterId ?? ''}`;

  // Latest-value refs so the stable ResizeObserver / font-loader callbacks
  // don't capture stale values via closure.
  const fontScaleRef = useRef(fontScale);
  const columnModeRef = useRef<ColumnMode>(columnMode);
  const sourceRef = useRef(deferredSource);
  const wholeBookRef = useRef(deferredWholeBook);
  const configRef = useRef(deferredConfig);
  const localeRef = useRef(state.locale);
  const resourcesRef = useRef(state.resources);
  fontScaleRef.current = fontScale;
  const labelsRef = useRef(state.labels);
  labelsRef.current = state.labels;
  columnModeRef.current = columnMode;
  sourceRef.current = deferredSource;
  wholeBookRef.current = deferredWholeBook;
  // Where the book starts (#695): the whole book read as one document
  // starts there, as its first chapter does on its own.
  const bookStartRef = useRef(state.bookStart);
  bookStartRef.current = state.bookStart;
  configRef.current = deferredConfig;
  localeRef.current = state.locale;
  resourcesRef.current = state.resources;

  // Initialize shadow DOM structure once.
  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;
    detachExercisesRef.current?.();
    detachExercisesRef.current = null;
    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);
    const scroll = document.createElement('div');
    scroll.className = 'pt-scroll';
    // A named region that takes the keyboard (WCAG 2.1.1): arrow keys and
    // Page Up/Down scroll the pages.
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', a11yRef.current.region);
    scroll.tabIndex = 0;
    shadow.appendChild(scroll);
    // Links in the text open in a new tab (below): each says so (WCAG
    // 3.2.5) through a hidden description in the same shadow root.
    const newTab = document.createElement('span');
    newTab.id = 'pt-new-tab';
    newTab.hidden = true;
    newTab.textContent = a11yRef.current.newTab;
    shadow.appendChild(newTab);
    const describeLinks = () => {
      for (const a of scroll.querySelectorAll<HTMLAnchorElement>('a[href]:not([href^="#"]):not([aria-describedby])')) {
        a.setAttribute('aria-describedby', 'pt-new-tab');
      }
    };
    const linkObserver = new MutationObserver(describeLinks);
    linkObserver.observe(scroll, { childList: true, subtree: true });
    scrollHostRef.current = scroll;
    contentHostRef.current = scroll;
    // A Markdown link in the preview opens in a tab of its own instead of
    // navigating the Sandbox away (`:ref` anchors, `#…`, stay in place).
    const onLinkClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      const href = anchor?.getAttribute('href');
      if (!anchor || !href || href.startsWith('#')) return;
      event.preventDefault();
      window.open((anchor as HTMLAnchorElement).href, '_blank', 'noopener,noreferrer');
    };
    scroll.addEventListener('click', onLinkClick);
    // One video at a time, save those set to play alongside the others
    // (#507): starting a video pauses what it does not play with. The
    // listener sits on the root, so the players of every relayout follow it.
    const stopVideoCoordination = coordinateVideoPlayback(scroll);
    // The DOM that lastRender was diffing against is gone — force a full
    // rebuild on the next relayout.
    lastRenderRef.current = null;
    lastRenderSigRef.current = null;
    overlayMapRef.current.clear();
    return () => {
      linkObserver.disconnect();
      scroll.removeEventListener('click', onLinkClick);
      stopVideoCoordination();
      detachExercisesRef.current?.();
      detachExercisesRef.current = null;
      scrollHostRef.current = null;
      contentHostRef.current = null;
      lastRenderRef.current = null;
      lastRenderSigRef.current = null;
    };
  }, [shadowRef]);

  // Memoize a trigger key so effects run only when real inputs change.
  // Resources are part of the key too: an edit in the Resources panel (a
  // cell, a caption, an SVG payload) must relayout the HTML tab as well.
  // Under the whole book the chapter source is not an input: a chapter
  // switch changes no document (the viewer jumps within it), and a relayout
  // would put the reader back where the switch found them.
  const chapterSource = deferredWholeBook ? null : deferredSource;
  const renderKey = useMemo(
    () => ({
      source: chapterSource,
      wholeBook: deferredWholeBook,
      config: deferredConfig,
      resources: deferredResources,
      fontScale,
      columnMode,
      locale: state.locale,
    }),
    [chapterSource, deferredWholeBook, deferredConfig, deferredResources, fontScale, columnMode, state.locale],
  );

  const {
    scheduleRelayout
  } = useRelayout({
    dispatch, sharedDocRef, sharedDocSourceRef, hostRef, builtSourceRef, layoutWorker, scrollHostRef,
    viewportSizeRef, relayoutTimerRef, renderSeqRef, columnGeomRef, onGeneratingChangeRef,
    onPageCountChangeRef, dispatchRef, activePanelRef, chapterOfPageRef, navigateRef, docRef,
    overlayMapRef, labelEditorPages, lastRenderRef, lastRenderSigRef, setDocVersion, rtlRef,
    detachExercisesRef, exerciseKeyRef, fontScaleRef, columnModeRef, sourceRef, wholeBookRef,
    configRef, localeRef, resourcesRef, labelsRef, bookStartRef, renderKey
  });

  useOverlays({
    ref, state, activeChapterId, builtSourceRef, scrollHostRef, columnGeomRef, dispatchRef,
    activePanelRef, docRef, overlayMapRef, docVersion, rtlRef, columnModeRef, scheduleRelayout
  });

  // Scroll-bounds emitter. Rather than computing column indices (which is
  // ambiguous when several columns are visible per page and pages snap
  // horizontally), just report whether there's room to scroll further in
  // either direction. The toolbar uses these booleans to enable/disable
  // prev/next column buttons.
  useEffect(() => {
    const scroll = scrollHostRef.current;
    if (!scroll) return;
    let rafId = 0;
    const compute = () => {
      rafId = 0;
      if (columnModeRef.current !== 'multi') {
        onScrollBoundsChangeRef.current?.({ canPrev: false, canNext: false });
        return;
      }
      const tolerance = 4;
      const canLeft = scroll.scrollLeft > tolerance;
      const canRight =
        scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - tolerance;
      const rtl = rtlRef.current;
      onScrollBoundsChangeRef.current?.(rtl ? { canPrev: canRight, canNext: canLeft, rtl } : { canPrev: canLeft, canNext: canRight });
    };
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(compute);
    };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    // Compute once now and again after a frame so we pick up scrollWidth
    // updates from the relayout that just completed.
    compute();
    const id = requestAnimationFrame(compute);
    return () => {
      scroll.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(id);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [docVersion, columnMode]);

  // Current-page emitter (mirrors the canvas viewer). Multi mode snaps pages
  // to the leading edge, so the current page is the one whose left edge sits
  // nearest that edge; single mode scrolls vertically, so it's the page whose
  // centre is nearest the viewport centre. Emits on scroll and after every
  // relayout.
  useEffect(() => {
    const scroll = scrollHostRef.current;
    if (!scroll) return;
    let rafId = 0;
    const compute = () => {
      rafId = 0;
      const pages = scroll.querySelectorAll<HTMLElement>('.pt-page[data-page]');
      if (pages.length === 0) return;
      const sRect = scroll.getBoundingClientRect();
      const multi = columnModeRef.current === 'multi';
      const viewportCenter = sRect.top + sRect.height / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      pages.forEach((pageEl) => {
        const r = pageEl.getBoundingClientRect();
        const dist = multi
          ? (rtlRef.current ? Math.abs(sRect.right - r.right - PADDING_PX) : Math.abs(r.left - sRect.left - PADDING_PX))
          : Math.abs(r.top + r.height / 2 - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = Number(pageEl.dataset.page);
        }
      });
      onCurrentPageChangeRef.current?.(bestIdx);
    };
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(compute);
    };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      scroll.removeEventListener('scroll', onScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [docVersion, columnMode]);

  // Left to right whatever the interface's direction: the scroll and page
  // geometry are physical, and a book carries its own direction.
  return <div ref={hostRef} dir="ltr" className="h-full w-full" />;
});
