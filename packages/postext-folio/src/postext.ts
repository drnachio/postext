import { renderPageToCanvas, type VDTDocument } from "postext";
import { createFolio, type FolioOptions, type FolioPageSize, type FolioState, type FolioViewer } from "./viewer";

export interface FolioDocumentOptions extends Omit<FolioOptions, "pages" | "firstPageRecto" | "binding" | "at" | "aspect"> {
  /** The page to open on (0-based). Default 0. */
  at?: number;
  /** Spreads painted on either side of the open one; pages farther away
   *  are let go (drawn as blank paper should a long turn sweep past them).
   *  Default 3. */
  window?: number;
  /** Passed to `renderPageToCanvas` (see its `RenderPageOptions`). */
  singleInk?: boolean;
  pageNegative?: boolean;
  /** A page's text alternative. Default `Page n`. */
  alt?: (index: number) => string;
}

export interface FolioDocumentViewer extends FolioViewer {
  /** Shows another layout of the book (after an edit), on the same page
   *  unless `at` says otherwise. */
  setDocument(doc: VDTDocument, options?: { at?: number }): void;
}

/** Whether the document's first page is a recto: page 1, or a chapter
 *  continued after an even number of pages. */
export function firstPageIsRecto(doc: VDTDocument): boolean {
  return (doc.pageIndexOffset ?? 0) % 2 === 0;
}

/** The page's colour, for blank pages: white when it has none. */
function paperOf(doc: VDTDocument): string {
  const hex = doc.config.page.backgroundColor.hex;
  return hex && hex !== "transparent" ? hex : "#fff";
}

/** How long a resize settles before the pages are painted at the new size. */
const RESIZE_SETTLE_MS = 120;

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
  const reach = options.window ?? 3;
  let current = doc;
  let canvases: (HTMLCanvasElement | null)[] = [];
  /** Page → the slot width (device px) it was painted for. */
  let painted = new Map<number, number>();
  let focus: number[] = [options.at ?? 0];
  let idle = 0;
  let resizeTimer = 0;
  let ready = false;

  const slotWidth = () => viewer.pageSize.deviceWidth;

  const sources = () =>
    current.pages.map((_, i) => {
      const canvas = canvases[i];
      return painted.has(i) && canvas ? { src: canvas, alt: options.alt?.(i) ?? `Page ${i + 1}` } : "";
    });

  /** Pages within `reach` spreads of the ones on show. */
  function wanted(): Set<number> {
    const keep = new Set<number>();
    const span = 2 * reach + 1;
    for (const p of focus) for (let i = p - span; i <= p + span; i++) if (i >= 0 && i < current.pages.length) keep.add(i);
    return keep;
  }

  /** Paints page `i` on a fresh canvas (the leaves cache their texture by
   *  element) exactly `width` device pixels wide. */
  function paint(i: number, width: number) {
    const page = current.pages[i];
    if (!page) return;
    const canvas = document.createElement("canvas");
    renderPageToCanvas(page, current, canvas, {
      scale: width / page.width,
      singleInk: options.singleInk,
      pageNegative: options.pageNegative,
    });
    const old = canvases[i];
    if (old) old.width = old.height = 0;
    canvases[i] = canvas;
    painted.set(i, width);
  }

  /** Paints what the open spread needs now and lets go of the far pages;
   *  the rest of the window fills in when the browser is idle. */
  function refresh(urgent: number[]) {
    if (!ready) return;
    const width = slotWidth();
    const keep = wanted();
    let changed = false;
    for (const i of urgent) {
      if (i < 0 || i >= current.pages.length || painted.get(i) === width) continue;
      paint(i, width);
      changed = true;
    }
    for (const i of [...painted.keys()]) {
      if (keep.has(i)) continue;
      const canvas = canvases[i];
      if (canvas) canvas.width = canvas.height = 0;
      canvases[i] = null;
      painted.delete(i);
      changed = true;
    }
    if (changed) viewer.setPages(sources());
    schedule();
  }

  function schedule() {
    cancelIdle(idle);
    idle = onIdle(() => {
      const width = slotWidth();
      const distance = (i: number) => Math.min(...focus.map((f) => Math.abs(i - f)));
      const next = [...wanted()].filter((i) => painted.get(i) !== width).sort((a, b) => distance(a) - distance(b)).slice(0, 4);
      if (!next.length) return;
      for (const i of next) paint(i, width);
      viewer.setPages(sources());
      schedule();
    });
  }

  const around = (state: FolioState) => {
    const pages = state.pages.length ? state.pages : [0];
    // The leaf a hand would lift next shows the neighbours' pages.
    return [...pages, pages[0] - 2, pages[0] - 1, pages[pages.length - 1] + 1, pages[pages.length - 1] + 2];
  };

  const first = doc.pages[0];
  const viewer = createFolio(container, {
    ...options,
    pages: doc.pages.map(() => ""),
    aspect: first ? first.width / first.height : undefined,
    firstPageRecto: firstPageIsRecto(doc),
    binding: doc.binding === "right" ? "right" : "left",
    paper: options.paper ?? paperOf(doc),
    onTarget: (state) => {
      focus = state.pages;
      refresh(around(state));
      options.onTarget?.(state);
    },
    onChange: (state) => {
      focus = state.pages;
      options.onChange?.(state);
    },
    onLayout: (size: FolioPageSize) => {
      options.onLayout?.(size);
      if (!ready) return;
      // Painted again once the box stops changing (a dragged divider).
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => refresh(around(viewer.state)), RESIZE_SETTLE_MS);
    },
  });
  // The open spread, painted at the slot's size before the first frame.
  ready = true;
  focus = viewer.state.pages;
  refresh(around(viewer.state));

  return {
    element: viewer.element,
    goToPage: viewer.goToPage,
    goToSpread: viewer.goToSpread,
    next: viewer.next,
    prev: viewer.prev,
    setPages: viewer.setPages,
    setLabels: viewer.setLabels,
    get pageSize() {
      return viewer.pageSize;
    },
    get state() {
      return viewer.state;
    },
    setDocument(next: VDTDocument, opts: { at?: number } = {}) {
      const at = Math.max(0, Math.min(next.pages.length - 1, opts.at ?? viewer.state.pages[0] ?? 0));
      for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 0;
      current = next;
      canvases = [];
      painted = new Map();
      focus = [at];
      viewer.setPages(
        next.pages.map(() => ""),
        {
          firstPageRecto: firstPageIsRecto(next),
          binding: next.binding === "right" ? "right" : "left",
          paper: options.paper ?? paperOf(next),
          at,
        },
      );
      focus = viewer.state.pages;
      refresh(around(viewer.state));
    },
    dispose() {
      cancelIdle(idle);
      clearTimeout(resizeTimer);
      viewer.dispose();
      for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 0;
      canvases = [];
      painted.clear();
    },
  };
}

const onIdle = (cb: () => void): number =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 500 }) : (setTimeout(cb, 50) as unknown as number);
const cancelIdle = (id: number) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
