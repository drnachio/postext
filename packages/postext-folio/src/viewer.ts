import { type SpreadSrc } from './pageFlip.js';
import { type Spread, spreadOfPage } from './spreads.js';
import { injectStyles } from './styles.js';
import { DEFAULT_LABELS, paperOf, sourceOf, SINGLE_BELOW, clamp, ZOOM_MIN, ZOOM_MAX } from './viewer/constants.js';
import type { FolioOptions, FolioViewer } from './viewer/types.js';
import { createFolioLayout } from './viewer/layout.js';
import { createFolioTurning } from './viewer/turning.js';
import { createFolioInput } from './viewer/input.js';
import { createFolioLens } from './viewer/lens.js';
import { createFolioPointer } from './viewer/pointer.js';
import type { FolioViewerState, FolioViewerLate } from './viewer/state.js';

export type { FolioPage, FolioAppearance, FolioInteraction, FolioMagnifier, FolioPageDetail, FolioPagePoint, FolioPageVideo, FolioLabels, FolioOptions, FolioPageSize, FolioState, FolioViewer } from './viewer/types.js';
export { SINGLE_BELOW } from './viewer/constants.js';

/**
 * A book on the page: the pages in spreads by the recto rule, turned with
 * the ‹ › buttons, ←/→, a swipe, a click on a page, or taken by hand and
 * dragged over, the leaves curling in three.js with their shadows. The
 * WebGL canvas draws the book still and turning alike, so a page never
 * changes look when it lands; the DOM pages under it (images or canvases)
 * are its textures' sources and the pages' text alternatives. Without
 * WebGL2, or with reduced motion, the DOM pages show and the spreads
 * simply change.
 */
export function createFolio(container: HTMLElement, options: FolioOptions): FolioViewer {
  const vs = {} as FolioViewerState;
  const vlate = {} as FolioViewerLate;
  injectStyles(container);
  vs.labels = { ...DEFAULT_LABELS, ...options.labels };
  vs.pages = options.pages;
  vs.firstPageRecto = options.firstPageRecto ?? true;
  vs.binding = options.binding ?? "left";
  vs.mode = options.mode ?? "auto";
  vs.paper = options.paper ?? "#fff";
  vs.appearance = options.appearance ?? {};
  let papersKey = JSON.stringify(vs.pages.map(paperOf));
  /** The appearance the flipper was last given, as text. */
  vs.appearanceKey = "";
  const animate = options.animate ?? true;
  const controls = options.controls ?? true;
  const showCount = options.showCount ?? true;
  vs.interaction = options.interaction ?? "hand";

  const root = document.createElement("div");
  root.className = "postext-folio";
  root.tabIndex = 0;
  root.setAttribute("role", "group");
  root.setAttribute("aria-roledescription", "carousel");
  const prevBtn = document.createElement("button");
  const nextBtn = document.createElement("button");
  for (const btn of [prevBtn, nextBtn]) {
    btn.type = "button";
    btn.className = "postext-folio-nav";
  }
  const spreadEl = document.createElement("div");
  spreadEl.className = "postext-folio-spread";
  const count = document.createElement("p");
  count.className = "postext-folio-count";
  count.setAttribute("aria-live", "polite");
  prevBtn.classList.add("is-prev");
  nextBtn.classList.add("is-next");
  // The count is always there for screen readers (a live region), shown
  // only with `showCount`; `controls: false` leaves the turning to the
  // host's own buttons.
  root.append(spreadEl, prevBtn, nextBtn, count);
  if (!showCount) count.classList.add("is-unseen");
  if (!controls) prevBtn.hidden = nextBtn.hidden = true;
  container.append(root);

  vs.single = false;
  vs.spreads = [];
  vs.current = 0;
  vs.shown = 0;
  vs.flipper = null;
  vs.flipCanvas = null;
  vs.holding = null;
  vs.press = null;
  vs.swipe = null;
  vs.disposed = false;
  vs.slot = { width: 0, height: 0, deviceWidth: 0, deviceHeight: 0 };
  vs.pageVideos = [];
  /** Where a press on a page began, on the page (a click there may act on
   *  it rather than turn it). */
  vs.pressPoint = null;

  const rtl = () => vs.binding === "right";
  const pagesOf = (s: Spread | undefined) => (s ?? [null, null]).filter((i): i is number => i !== null);
  /** One page at a time on a WebGL book: the spine runs along the page's
   *  inner edge, the leaf turns over it and out of the box. */
  const singleGl = () => vs.single && !!vs.flipper;
  // In single mode every sheet carries one page: its back is blank paper
  // (the page after it lies under it, not on its back).
  const bookOf = (): SpreadSrc[] =>
    vs.spreads.map((s, k) => (vs.single ? [k === 0 ? null : "", sourceOf(vs.pages[s[1]!])] : s.map((i) => (i === null ? null : sourceOf(vs.pages[i])))) as SpreadSrc);

  const {
    flipAppearance, aspect, fit, pageEl
  } = createFolioLayout({
    options, controls, showCount, root, prevBtn, spreadEl, count, rtl, singleGl, vs, vlate
  });

  const {
    applyVideo, unplace, placeDomVideo, render, go, jump, rebuild, applyLabels
  } = createFolioTurning({
    options, animate, root, prevBtn, nextBtn, spreadEl, count, rtl, pagesOf, singleGl, bookOf,
    flipAppearance, fit, pageEl, vs, vlate
  });
  Object.assign(vlate, { placeDomVideo });

  createFolioInput({
    options, root, prevBtn, nextBtn, rtl, go, vs, vlate
  });

  const {
    zoomNow, lensOf, heldAt, raiseLens, hideLens, zoomBy, scheduleDetail, releaseLens
  } = createFolioLens({
    options, root, spreadEl, rtl, pagesOf, aspect, go, vs, vlate
  });
  Object.assign(vlate, { lensOf, raiseLens, hideLens, zoomBy, scheduleDetail });

  const {
    onPage, leftToHost, aimedPageAt, pointOnScreen, applyInteraction
  } = createFolioPointer({
    options, root, spreadEl, rtl, singleGl, go, heldAt, scheduleDetail, releaseLens, vs
  });
  Object.assign(vlate, { onPage, leftToHost, aimedPageAt });

  let lastWidth = -1;
  const observer = new ResizeObserver(() => {
    if (vs.disposed) return;
    const w = root.clientWidth;
    const wasSingle = vs.single;
    const nowSingle = vs.mode === "single" || (vs.mode === "auto" && w > 0 && w < SINGLE_BELOW);
    if (lastWidth >= 0 && nowSingle !== wasSingle) rebuild(pagesOf(vs.spreads[vs.shown])[0] ?? 0);
    else fit();
    lastWidth = w;
  });
  observer.observe(root);

  applyLabels();
  applyInteraction();
  rebuild(options.at ?? 0);

  return {
    element: root,
    goToPage: (index, opts) => (opts?.instant ? jump : go)(spreadOfPage(vs.spreads, index)),
    goToSpread: (index, opts) => (opts?.instant ? jump : go)(index),
    next: () => go(vs.current + 1),
    prev: () => go(vs.current - 1),
    setLabels(next) {
      vs.labels = { ...vs.labels, ...next };
      applyLabels();
      render();
    },
    get pageSize() {
      return vs.slot;
    },
    resetView() {
      vs.flipper?.resetOrbit();
    },
    getView() {
      return vs.flipper?.view() ?? null;
    },
    setInteraction(next) {
      if (next === vs.interaction) return;
      vs.interaction = next;
      applyInteraction();
    },
    setMagnification(zoom) {
      vs.lensZoom = zoom ? clamp(zoom, ZOOM_MIN, ZOOM_MAX) : null;
      if (vs.lensAt) vs.flipper?.setLens(lensOf(vs.lensAt));
      scheduleDetail(250);
    },
    getMagnifier() {
      return { zoom: zoomNow(), held: vs.lensAt !== null };
    },
    holdMagnifier(held) {
      if (!held) {
        hideLens();
        return;
      }
      if (vs.interaction !== "magnify" || !vs.flipper) return;
      raiseLens();
      if (vs.lensAt) vs.flipper.setLens(lensOf(vs.lensAt));
      scheduleDetail(250);
    },
    pageAt: aimedPageAt,
    pointOnScreen,
    refreshPage(src) {
      vs.flipper?.touch(src);
    },
    setPageVideo(video) {
      this.setPageVideos(video ? [video] : []);
    },
    setPageVideos(videos) {
      for (const v of vs.pageVideos) if (!videos.some((n) => n.element === v.element)) unplace(v);
      vs.pageVideos = videos.slice();
      applyVideo();
    },
    setAppearance(next) {
      vs.appearance = { ...vs.appearance, ...next };
      const flip = flipAppearance();
      const key = JSON.stringify(flip);
      if (key === vs.appearanceKey) return;
      vs.appearanceKey = key;
      vs.flipper?.setAppearance(flip);
      fit();
    },
    get state() {
      return { spread: vs.current, pages: pagesOf(vs.spreads[vs.current]) };
    },
    setPages(next, opts = {}) {
      const atPage = opts.at ?? pagesOf(vs.spreads[vs.shown])[0] ?? 0;
      const relayout =
        next.length !== vs.pages.length ||
        (opts.firstPageRecto ?? vs.firstPageRecto) !== vs.firstPageRecto ||
        (opts.binding ?? vs.binding) !== vs.binding ||
        (opts.mode ?? vs.mode) !== vs.mode ||
        (opts.paper ?? vs.paper) !== vs.paper;
      vs.pages = next;
      vs.firstPageRecto = opts.firstPageRecto ?? vs.firstPageRecto;
      vs.binding = opts.binding ?? vs.binding;
      vs.mode = opts.mode ?? vs.mode;
      vs.paper = opts.paper ?? vs.paper;
      if (relayout) return rebuild(atPage);
      // Same spreads: the leaves take their new pages where they lie.
      vs.flipper?.setBook(bookOf(), opts.at !== undefined ? spreadOfPage(vs.spreads, opts.at) : undefined);
      // The glass's paintings follow pages that came as other sources (a
      // page decorated for the first time, #543).
      scheduleDetail(0);
      // Pages that came with another paper (a relayout moved a plate run).
      const papers = JSON.stringify(vs.pages.map(paperOf));
      if (vs.flipper && papers !== papersKey) {
        const flip = flipAppearance();
        vs.appearanceKey = JSON.stringify(flip);
        vs.flipper.setAppearance(flip);
      }
      papersKey = papers;
      if (opts.at !== undefined) vs.current = vs.shown = spreadOfPage(vs.spreads, opts.at);
      // The videos' pages may be painted on other canvases now.
      if (vs.pageVideos.length) vs.flipper?.setVideos(vs.pageVideos.map((v) => ({ src: sourceOf(vs.pages[v.page]), element: v.element, frame: v })));
      fit();
      render();
    },
    dispose() {
      vs.disposed = true;
      clearTimeout(vs.detailTimer);
      for (const v of vs.pageVideos) v.element.remove();
      vs.pageVideos = [];
      observer.disconnect();
      vs.holding?.(false);
      vs.flipper?.dispose();
      root.remove();
    },
  } satisfies FolioViewer;
}
