import { type VDTDocument } from 'postext';
import { type FolioAppearance, createFolio, type FolioPageSize } from './viewer.js';
import { autoKey } from './videos.js';
import { pagePaperOf, trimmedSize, appearanceOf, firstPageIsRecto, paperOf, signature, carriedPaintings } from './postext/book.js';
import { cancelIdle, RESIZE_SETTLE_MS } from './postext/constants.js';
import type { FolioDocumentOptions, FolioDocumentViewer } from './postext/types.js';
import { createDocumentPainting } from './postext/painting.js';
import { createDocumentVideos } from './postext/pageVideos.js';
import { createDocumentSharp } from './postext/sharp.js';
import type { FolioDocumentState, FolioDocumentLate } from './postext/state.js';

export type { FolioDocumentOptions, FolioDocumentViewer } from './postext/types.js';
export { firstPageIsRecto, trimmedSize, appearanceOf, carriedPaintings } from './postext/book.js';
export { sweepFor } from './postext/sweep.js';
export type { SweepRun } from './postext/sweep.js';

/**
 * A postext document as a book: `createFolio` over its pages, painted with
 * `renderPageToCanvas` at exactly the device pixels of a page slot, so the
 * WebGL book shows every page texel for pixel, as sharp as a page on the
 * canvas preview. Pages are painted only when needed: the open spread
 * first, then the spreads around it when the browser is idle; pages that
 * fall out of that window are freed, so a long book costs a few pages of
 * memory. A resize paints them again at the new size.
 *
 * The fonts and the resource images the document uses must be loaded
 * (`document.fonts`, `registerResourceImage`) before the pages are painted,
 * as for `renderPage`.
 */
export function createFolioFromDocument(container: HTMLElement, doc: VDTDocument, options: FolioDocumentOptions = {}): FolioDocumentViewer {
  const ds = {} as FolioDocumentState;
  const dlate = {} as FolioDocumentLate;
  const reach = options.window ?? 3;
  ds.current = doc;
  ds.canvases = [];
  /** A decorated page's canvas: its painting with the decorations over
   *  it, kept (and drawn again in place) once a page has been decorated. */
  ds.decorated = [];
  /** Page → the slot width (device px) it was painted for. */
  ds.painted = new Map<number, number>();
  ds.focus = [options.at ?? 0];
  ds.idle = 0;
  /** The pages on show when the book last came to rest. */
  ds.settled = [];
  /** The pages a turn in progress sweeps past, in the order their leaves
   *  lift (from the spread at rest towards the target). */
  ds.sweep = [];
  ds.sweepFrame = 0;
  /** The run of turns since the book last came to rest. */
  ds.run = null;
  /** Leaves are in the air (sent to a spread that has not landed yet). */
  ds.turning = false;
  let resizeTimer = 0;
  ds.ready = false;
  let hostAppearance: FolioAppearance | undefined = options.appearance;

  const slotWidth = () => viewer.pageSize.deviceWidth;

  const sources = () =>
    ds.current.pages.map((_, i) => {
      const canvas = ds.canvases[i];
      const paper = pagePaperOf(ds.current.pages[i]);
      if (ds.painted.has(i) && canvas) return { src: ds.decorated[i] ?? canvas, alt: options.alt?.(i) ?? `Page ${i + 1}`, ...(paper ? { paper } : {}) };
      return paper ? { src: "" as const, paper } : "";
    });

  const {
    wanted, paint, free, decorate, refresh, startSweep, around
  } = createDocumentPainting({
    options, reach, slotWidth, sources, ds, dlate
  });

  const {
    autoplayed, autoStarted, spotsOf, urlOf, spotAt, stopPlayer, stopVideos, startVideo,
    toggleVideoAt, togglePlaying, scheduleAutoplay, followVideos
  } = createDocumentVideos({
    options, ds, dlate
  });

  const {
    sharp, sharpDirty, redecorateSharp, paintSharp, releaseSharp
  } = createDocumentSharp({
    options, free, ds, dlate
  });

  const first = doc.pages[0];
  const viewer = createFolio(container, {
    ...options,
    detail: options.detail ?? { paint: paintSharp, release: releaseSharp },
    pages: doc.pages.map((p) => {
      const paper = pagePaperOf(p);
      return paper ? { src: "", paper } : "";
    }),
    appearance: appearanceOf(doc, options.appearance),
    aspect: first ? ((s) => s.width / s.height)(trimmedSize(first, doc)) : undefined,
    firstPageRecto: firstPageIsRecto(doc),
    binding: doc.binding === "right" ? "right" : "left",
    paper: options.paper ?? paperOf(doc),
    onTarget: (state) => {
      ds.focus = state.pages;
      ds.turning = true;
      // The sweep first: the pages it keeps are not let go by the refresh.
      startSweep(state.pages);
      refresh(around(state));
      options.onTarget?.(state);
    },
    onPageClick: (point) => toggleVideoAt(point) || !!options.onPageClick?.(point),
    isPageAction: (point) => !!spotAt(point) || !!options.isPageAction?.(point),
    onChange: (state) => {
      // A video whose page has turned away stops; one set to play on its
      // own starts when its spread is shown (see `autoplayOn`).
      for (const p of [...ds.players]) if (!state.pages.includes(p.page)) stopPlayer(p);
      for (const key of [...autoStarted]) if (!state.pages.some((i) => key.startsWith(autoKey(i, "")))) autoStarted.delete(key);
      scheduleAutoplay();
      ds.focus = state.pages;
      ds.settled = state.pages;
      ds.turning = false;
      // At rest: the pages the turn carried past are let go.
      ds.sweep = [];
      ds.run = null;
      cancelAnimationFrame(ds.sweepFrame);
      refresh([]);
      options.onChange?.(state);
    },
    onLayout: (size: FolioPageSize) => {
      options.onLayout?.(size);
      if (!ds.ready) return;
      // Painted again once the box stops changing (a dragged divider).
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => refresh(around(viewer.state)), RESIZE_SETTLE_MS);
    },
  });
  Object.assign(dlate, { viewer });
  // The open spread, painted at the slot's size before the first frame.
  ds.ready = true;
  ds.focus = viewer.state.pages;
  ds.settled = viewer.state.pages;
  refresh(around(viewer.state));
  scheduleAutoplay();
  // Debugging (`__postextFolioPreserve`, as for the renderer): the videos.
  if ((globalThis as { __postextFolioPreserve?: boolean }).__postextFolioPreserve) {
    (globalThis as { __postextFolioVideos?: unknown }).__postextFolioVideos = {
      playing: () => ds.players,
      autoplayed,
      spots: (i: number) => spotsOf(i),
      state: () => viewer.state,
      turning: () => ds.turning,
    };
  }

  // Space plays or pauses the first video on the spread on show.
  viewer.element.addEventListener("keydown", (event) => {
    if (event.target !== viewer.element || (event.key !== " " && event.key !== "Enter") || options.videos === false) return;
    const on = viewer.state.pages;
    const shown = ds.players.filter((p) => on.includes(p.page));
    const p = shown.find((x) => !x.alongside) ?? shown[0];
    if (p) togglePlaying(p);
    else {
      const page = on.find((i) => spotsOf(i).some((s) => urlOf(s)));
      if (page === undefined) return;
      startVideo(page, spotsOf(page).find((s) => urlOf(s))!);
    }
    event.preventDefault();
  });

  return {
    element: viewer.element,
    goToPage: viewer.goToPage,
    goToSpread: viewer.goToSpread,
    next: viewer.next,
    prev: viewer.prev,
    setPages: viewer.setPages,
    refreshPage: viewer.refreshPage,
    setPageVideo: viewer.setPageVideo,
    setPageVideos: viewer.setPageVideos,
    toggleVideoAt,
    stopVideo: stopVideos,
    setLabels: viewer.setLabels,
    resetView: viewer.resetView,
    getView: viewer.getView,
    setInteraction: viewer.setInteraction,
    setMagnification: viewer.setMagnification,
    getMagnifier: viewer.getMagnifier,
    holdMagnifier: viewer.holdMagnifier,
    pageAt: viewer.pageAt,
    pointOnScreen: viewer.pointOnScreen,
    setAppearance(next: FolioAppearance) {
      hostAppearance = { ...hostAppearance, ...next };
      viewer.setAppearance(appearanceOf(ds.current, hostAppearance));
    },
    get pageSize() {
      return viewer.pageSize;
    },
    get state() {
      return viewer.state;
    },
    setDocument(next: VDTDocument, opts: { at?: number; repaint?: boolean; appearance?: FolioAppearance } = {}) {
      if (opts.appearance) hostAppearance = { ...hostAppearance, ...opts.appearance };
      const at = Math.max(0, Math.min(next.pages.length - 1, opts.at ?? viewer.state.pages[0] ?? 0));
      const before = ds.current;
      const oldCanvases = ds.canvases;
      const oldDecorated = ds.decorated;
      const oldPainted = ds.painted;
      ds.current = next;
      ds.canvases = [];
      ds.decorated = [];
      ds.painted = new Map();
      ds.focus = [at];
      // A page that reads the same keeps its painting (and its texture):
      // a relayout elsewhere in the book (the plan settling, an edit in
      // another chapter) leaves the open spread as it is.
      const keep = !opts.repaint && (next.config === before.config || signature(next.config) === signature(before.config));
      if (keep) {
        for (const [i, k] of carriedPaintings(before.pages, [...oldPainted.keys()], next.pages, wanted())) {
          const canvas = oldCanvases[k];
          if (!canvas) continue;
          ds.canvases[i] = canvas;
          ds.painted.set(i, oldPainted.get(k)!);
          oldCanvases[k] = null;
          // Its decorated canvas too (drawn again below, for the new
          // document's selection).
          ds.decorated[i] = oldDecorated[k] ?? null;
          oldDecorated[k] = null;
        }
      }
      // The open pages painted before the swap, so no frame shows them
      // blank; the old paintings no page took are let go.
      const width = slotWidth();
      for (let i = at - 2; i <= at + 3; i++) if (i >= 0 && i < next.pages.length && ds.painted.get(i) !== width) paint(i, width);
      for (const canvas of oldCanvases) if (canvas) canvas.width = canvas.height = 0;
      for (const canvas of oldDecorated) free(canvas);
      for (const i of ds.painted.keys()) decorate(i);
      viewer.setAppearance(appearanceOf(next, hostAppearance));
      viewer.setPages(sources(), {
        firstPageRecto: firstPageIsRecto(next),
        binding: next.binding === "right" ? "right" : "left",
        paper: options.paper ?? paperOf(next),
        at,
      });
      ds.focus = viewer.state.pages;
      // A relayout while leaves are in the air (the chapter the book was
      // sent to becoming the active one) keeps the pages they carry.
      if (!ds.turning) {
        ds.settled = viewer.state.pages;
        ds.sweep = [];
        ds.run = null;
      }
      refresh(around(viewer.state));
      followVideos();
      scheduleAutoplay();
    },
    redecorate(pages?: Iterable<number>) {
      const list = pages ? [...pages] : null;
      let swapped = false;
      for (const i of list ?? [...ds.painted.keys()]) {
        if (!ds.painted.has(i)) continue;
        const had = ds.decorated[i];
        if (decorate(i)) swapped = true;
        else if (had) viewer.refreshPage(had);
      }
      if (swapped) viewer.setPages(sources());
      // What the glass shows of them too (#543).
      for (const i of list ?? [...sharp.keys()]) if (sharp.has(i)) sharpDirty.add(i);
      if (sharpDirty.size && !ds.sharpFrame) ds.sharpFrame = requestAnimationFrame(redecorateSharp);
    },
    dispose() {
      clearTimeout(ds.autoTimer);
      stopVideos();
      cancelIdle(ds.idle);
      cancelAnimationFrame(ds.sweepFrame);
      clearTimeout(resizeTimer);
      viewer.dispose();
      releaseSharp();
      for (const canvas of ds.canvases) if (canvas) canvas.width = canvas.height = 0;
      for (const canvas of ds.decorated) free(canvas);
      ds.canvases = [];
      ds.decorated = [];
      ds.painted.clear();
    },
  };
}
