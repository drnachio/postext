import { renderPageToCanvas, type VDTDocument } from "postext";
import { createFolio, SINGLE_BELOW, type FolioOptions, type FolioState, type FolioViewer } from "./viewer";

export interface FolioDocumentOptions extends Omit<FolioOptions, "pages" | "firstPageRecto" | "binding" | "at"> {
  /** The page to open on (0-based). Default 0. */
  at?: number;
  /** Bitmap pixels per page pixel. Default `'auto'`: the size the page is
   *  shown at, times the device pixel ratio (never past the page's own
   *  resolution). */
  scale?: number | "auto";
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

/**
 * A postext document as a book: `createFolio` over its pages, painted with
 * `renderPageToCanvas` at the size they are shown. Only the spreads around
 * the open one are painted, so a long book costs a few pages of memory.
 * The fonts and the resource images the document uses must be loaded
 * (`document.fonts`, `registerResourceImage`) before the pages are painted,
 * as for `renderPage`.
 */
export function createFolioFromDocument(container: HTMLElement, doc: VDTDocument, options: FolioDocumentOptions = {}): FolioDocumentViewer {
  const reach = options.window ?? 3;
  let current = doc;
  let canvases: (HTMLCanvasElement | null)[] = [];
  let painted = new Map<number, number>(); // page → the scale it was painted at
  let focus: number[] = [options.at ?? 0];
  let idle = 0;

  const scaleOf = (d: VDTDocument) => {
    if (typeof options.scale === "number") return options.scale;
    const page = d.pages[0];
    if (!page) return 1;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const box = container.getBoundingClientRect();
    // One page across in single mode (set, or `auto` in a narrow box).
    const mode = options.mode ?? "auto";
    const across = mode === "single" || (mode === "auto" && box.width < SINGLE_BELOW) ? 1 : 2;
    const fit = Math.min(box.width / (across * page.width), box.height > 0 ? box.height / page.height : Infinity);
    return Math.min(1, Math.max(0.1, fit * dpr));
  };

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

  function paint(i: number, scale: number) {
    const page = current.pages[i];
    let canvas = canvases[i];
    if (!canvas) canvas = canvases[i] = document.createElement("canvas");
    renderPageToCanvas(page, current, canvas, { scale, singleInk: options.singleInk, pageNegative: options.pageNegative });
    painted.set(i, scale);
  }

  /** Paints what the open spread needs now and lets go of the far pages;
   *  the rest of the window fills in when the browser is idle. */
  function refresh(urgent: number[]) {
    const scale = scaleOf(current);
    const keep = wanted();
    let changed = false;
    for (const i of urgent) {
      if (i < 0 || i >= current.pages.length || painted.get(i) === scale) continue;
      // A fresh canvas: the leaves cache their texture by element.
      canvases[i] = null;
      paint(i, scale);
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
      const scale = scaleOf(current);
      const keep = [...wanted()].sort((a, b) => Math.min(...focus.map((f) => Math.abs(a - f))) - Math.min(...focus.map((f) => Math.abs(b - f))));
      const next = keep.filter((i) => painted.get(i) !== scale).slice(0, 4);
      if (!next.length) return;
      for (const i of next) {
        canvases[i] = null;
        paint(i, scale);
      }
      viewer.setPages(sources());
      schedule();
    });
  }

  const around = (state: FolioState) => {
    const pages = state.pages.length ? state.pages : [0];
    // The leaf a hand would lift next shows the neighbours' pages.
    return [...pages, pages[0] - 2, pages[0] - 1, pages[pages.length - 1] + 1, pages[pages.length - 1] + 2];
  };

  const firstPages = () => {
    const at = options.at ?? 0;
    return [at - 2, at - 1, at, at + 1, at + 2];
  };
  // The open spread is painted before the viewer first shows it.
  const opening = scaleOf(doc);
  for (const i of firstPages()) if (i >= 0 && i < doc.pages.length) paint(i, opening);

  const viewer = createFolio(container, {
    ...options,
    pages: sources(),
    firstPageRecto: firstPageIsRecto(doc),
    binding: doc.binding === "right" ? "right" : "left",
    paper: options.paper ?? doc.config.page.backgroundColor.hex,
    onTarget: (state) => {
      focus = state.pages;
      refresh(around(state));
      options.onTarget?.(state);
    },
    onChange: (state) => {
      focus = state.pages;
      options.onChange?.(state);
    },
  });
  focus = viewer.state.pages;
  schedule();

  let lastScale = opening;
  const observer = new ResizeObserver(() => {
    const scale = scaleOf(current);
    // Repaint only for a real change of size (a bitmap far too small or too big).
    if (scale > lastScale * 1.25 || scale < lastScale * 0.5) {
      lastScale = scale;
      refresh(around(viewer.state));
    }
  });
  observer.observe(container);

  return {
    element: viewer.element,
    goToPage: viewer.goToPage,
    goToSpread: viewer.goToSpread,
    next: viewer.next,
    prev: viewer.prev,
    setPages: viewer.setPages,
    setLabels: viewer.setLabels,
    get state() {
      return viewer.state;
    },
    setDocument(next: VDTDocument, opts: { at?: number } = {}) {
      current = next;
      for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 0;
      canvases = [];
      painted = new Map();
      const at = Math.min(next.pages.length - 1, opts.at ?? viewer.state.pages[0] ?? 0);
      focus = [at];
      const scale = scaleOf(next);
      for (const i of [at - 2, at - 1, at, at + 1, at + 2]) if (i >= 0 && i < next.pages.length) paint(i, scale);
      viewer.setPages(sources(), {
        firstPageRecto: firstPageIsRecto(next),
        binding: next.binding === "right" ? "right" : "left",
        paper: options.paper ?? next.config.page.backgroundColor.hex,
        at: Math.max(0, at),
      });
      focus = viewer.state.pages;
      schedule();
    },
    dispose() {
      cancelIdle(idle);
      observer.disconnect();
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
