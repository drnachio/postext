import { renderPageToCanvas, type VDTDocument, type VDTPage } from "postext";
import { resolveFolioConfig, type FolioPaperConfig } from "postext";
import { BLOCK_PAGES } from "./pageFlip";
import { createFolio, type FolioAppearance, type FolioOptions, type FolioPageSize, type FolioState, type FolioViewer } from "./viewer";

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
  /**
   * Draws over a painted page (a selection, a caret): `ctx` is set to the
   * page's own pixels (the untrimmed sheet, as the document's coordinates
   * are), over the page as painted. Returns whether it drew anything. Run
   * when a page is painted and on `redecorate`.
   */
  decorate?: (index: number, ctx: CanvasRenderingContext2D) => boolean;
}

export interface FolioDocumentViewer extends FolioViewer {
  /** Shows another layout of the book (after an edit), on the same page
   *  unless `at` says otherwise. A page that reads the same as before
   *  keeps its painting; `repaint` paints every page again (an image that
   *  came in after the pages were painted). */
  setDocument(doc: VDTDocument, options?: { at?: number; repaint?: boolean }): void;
  /** Draws the decorations (`decorate`) again on these pages, or on every
   *  painted page; the book shows them at once, on a turning leaf too. */
  redecorate(pages?: Iterable<number>): void;
}

/** Whether the document's first page is a recto: page 1, or a chapter
 *  continued after an even number of pages. */
export function firstPageIsRecto(doc: VDTDocument): boolean {
  return (doc.pageIndexOffset ?? 0) % 2 === 0;
}

/** A page's width and height as bound: the trim box, since a book is cut
 *  (a sheet laid out with cut lines also carries the bleed, the slug and
 *  the crop marks, none of which a bound page shows). */
export function trimmedSize(page: VDTPage, doc: VDTDocument): { width: number; height: number } {
  const inset = Math.max(0, doc.trimOffset);
  return { width: page.width - 2 * inset, height: page.height - 2 * inset };
}

/** The page's colour, for blank pages: white when it has none. */
function paperOf(doc: VDTDocument): string {
  const hex = doc.config.page.backgroundColor.hex;
  return hex && hex !== "transparent" ? hex : "#fff";
}

/** How the document's book is presented: its `folio` settings, its page
 *  width, the book's pages before and after it (a chapter of a longer
 *  book), with the host's own appearance laid over them. */
function appearanceOf(doc: VDTDocument, own: FolioAppearance | undefined): FolioAppearance {
  const page = doc.pages[0];
  const before = doc.pageIndexOffset ?? 0;
  const after = Math.max(0, (doc.bookPageCount ?? 0) - before - doc.pages.length);
  const folio = own && "folio" in own ? own.folio : doc.config.folio;
  // The document's own covers: the book's first page (a recto) and its
  // last, when that is a verso (an even page number).
  const ownCovers = resolveFolioConfig(folio).binding.cover === "pages";
  const total = before + doc.pages.length;
  return {
    folio: doc.config.folio,
    covers: { front: ownCovers && before === 0, back: ownCovers && after === 0 && total % 2 === 0 },
    // Page sizes are in device pixels at the page's dpi.
    ...(page ? { pageWidthMm: (trimmedSize(page, doc).width * 25.4) / (doc.config.page.dpi || 300) } : {}),
    extraPages: { before, after },
    ...own,
  };
}

/** The paper a page is printed on, when a `:::paper` run sets one. */
const pagePaperOf = (page: VDTPage | undefined) => (page as { paper?: FolioPaperConfig } | undefined)?.paper;

/** What a page is painted from, as text: two pages with the same
 *  signature under the same config paint the same. */
const signatures = new WeakMap<object, string>();
function signature(of: VDTPage | VDTDocument["config"]): string {
  let sig = signatures.get(of);
  if (sig === undefined) {
    sig = JSON.stringify(of);
    signatures.set(of, sig);
  }
  return sig;
}

/**
 * Which paintings a new layout can keep: new page index → old page index,
 * for every page of `wanted` that is the same page as a painted one (the
 * same object, or one that reads the same). Each old painting goes to one
 * page at most.
 */
export function carriedPaintings(
  before: readonly VDTPage[],
  painted: Iterable<number>,
  next: readonly VDTPage[],
  wanted: Iterable<number>,
): Map<number, number> {
  const carried = new Map<number, number>();
  const byPage = new Map<VDTPage, number>();
  for (const k of painted) if (before[k]) byPage.set(before[k], k);
  if (byPage.size === 0) return carried;
  let bySignature: Map<string, number> | null = null;
  for (const i of wanted) {
    const page = next[i];
    if (!page) continue;
    let k = byPage.get(page);
    if (k === undefined) {
      bySignature ??= new Map([...byPage].map(([p, j]) => [signature(p), j]));
      k = bySignature.get(signature(page));
    }
    if (k === undefined) continue;
    carried.set(i, k);
    byPage.delete(before[k]!);
    bySignature = null;
  }
  return carried;
}

/** Pages a turn paints for its leaves, at most. */
const MAX_SWEEP = 160;
/** Painting time per frame while leaves are in the air. */
const SWEEP_BUDGET_MS = 8;

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
  /** A decorated page's canvas: its painting with the decorations over
   *  it, kept (and drawn again in place) once a page has been decorated. */
  let decorated: (HTMLCanvasElement | null)[] = [];
  /** Page → the slot width (device px) it was painted for. */
  let painted = new Map<number, number>();
  let focus: number[] = [options.at ?? 0];
  let idle = 0;
  /** The pages on show when the book last came to rest. */
  let settled: number[] = [];
  /** The pages a turn in progress sweeps past, in the order their leaves
   *  lift (from the spread at rest towards the target). */
  let sweep: number[] = [];
  let sweepFrame = 0;
  /** Leaves are in the air (sent to a spread that has not landed yet). */
  let turning = false;
  let resizeTimer = 0;
  let ready = false;
  let hostAppearance: FolioAppearance | undefined = options.appearance;

  const slotWidth = () => viewer.pageSize.deviceWidth;

  const sources = () =>
    current.pages.map((_, i) => {
      const canvas = canvases[i];
      const paper = pagePaperOf(current.pages[i]);
      if (painted.has(i) && canvas) return { src: decorated[i] ?? canvas, alt: options.alt?.(i) ?? `Page ${i + 1}`, ...(paper ? { paper } : {}) };
      return paper ? { src: "" as const, paper } : "";
    });

  /** Pages within `reach` spreads of the ones on show. */
  function wanted(): Set<number> {
    const keep = new Set<number>();
    const span = 2 * reach + 1;
    for (const p of focus) for (let i = p - span; i <= p + span; i++) if (i >= 0 && i < current.pages.length) keep.add(i);
    for (const i of sweep) keep.add(i);
    return keep;
  }

  /** Paints page `i` on a fresh canvas (the leaves cache their texture by
   *  element) exactly `width` device pixels wide. */
  function paint(i: number, width: number) {
    const page = current.pages[i];
    if (!page) return;
    const canvas = document.createElement("canvas");
    // The page as bound: trimmed, without the slug and the crop marks.
    renderPageToCanvas(page, current, canvas, {
      trim: true,
      scale: width / trimmedSize(page, current).width,
      singleInk: options.singleInk,
      pageNegative: options.pageNegative,
    });
    const old = canvases[i];
    if (old) old.width = old.height = 0;
    canvases[i] = canvas;
    painted.set(i, width);
    // A new painting: decorated afresh, on a canvas of its own (its
    // texture follows the element).
    free(decorated[i]);
    decorated[i] = null;
    decorate(i);
  }

  const free = (canvas: HTMLCanvasElement | null | undefined) => {
    if (canvas) canvas.width = canvas.height = 0;
  };

  /** Draws page `i`'s decorations over its painting. True when the page
   *  shows another canvas than before (it was not decorated). */
  function decorate(i: number): boolean {
    const draw = options.decorate;
    const base = canvases[i];
    const page = current.pages[i];
    if (!draw || !base || !page) return false;
    let target = decorated[i];
    const fresh = !target;
    target ??= document.createElement("canvas");
    if (target.width !== base.width || target.height !== base.height) {
      target.width = base.width;
      target.height = base.height;
    }
    const ctx = target.getContext("2d");
    if (!ctx) return false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(base, 0, 0);
    // The page's own pixels: the canvas shows the trimmed page at its size.
    const inset = Math.max(0, current.trimOffset);
    const scale = base.width / trimmedSize(page, current).width;
    ctx.setTransform(scale, 0, 0, scale, -inset * scale, -inset * scale);
    ctx.save();
    const drew = draw(i, ctx);
    ctx.restore();
    if (!drew && fresh) return false;
    decorated[i] = target;
    return fresh;
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
      free(decorated[i]);
      decorated[i] = null;
      painted.delete(i);
      changed = true;
    }
    if (changed) viewer.setPages(sources());
    schedule();
  }

  /** A turn across several spreads: every page its leaves carry is
   *  painted, a frame at a time, in the order the leaves lift, so no page
   *  goes over blank. */
  function startSweep(target: number[]) {
    const from = settled.length ? settled : [0];
    // A long jump goes over as one block: only its two faces show, the
    // pages on show now (kept until it lands) and the ones it lands on
    // (painted with the target).
    if (Math.abs((target[0] ?? 0) - (from[0] ?? 0)) > BLOCK_PAGES) {
      sweep = [...from];
      return;
    }
    const lo = Math.max(0, Math.min(...from, ...target) - 1);
    const hi = Math.min(current.pages.length - 1, Math.max(...from, ...target) + 1);
    const pages: number[] = [];
    for (let i = lo; i <= hi; i++) pages.push(i);
    if ((target[0] ?? 0) < (from[0] ?? 0)) pages.reverse();
    sweep = pages.slice(0, MAX_SWEEP);
    cancelAnimationFrame(sweepFrame);
    sweepFrame = requestAnimationFrame(paintSweep);
  }

  function paintSweep() {
    sweepFrame = 0;
    const width = slotWidth();
    const start = performance.now();
    let changed = false;
    for (const i of sweep) {
      if (painted.get(i) === width) continue;
      paint(i, width);
      changed = true;
      if (performance.now() - start > SWEEP_BUDGET_MS) break;
    }
    if (!changed) return;
    viewer.setPages(sources());
    sweepFrame = requestAnimationFrame(paintSweep);
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
      focus = state.pages;
      turning = true;
      // The sweep first: the pages it keeps are not let go by the refresh.
      startSweep(state.pages);
      refresh(around(state));
      options.onTarget?.(state);
    },
    onChange: (state) => {
      focus = state.pages;
      settled = state.pages;
      turning = false;
      // At rest: the pages the turn carried past are let go.
      sweep = [];
      cancelAnimationFrame(sweepFrame);
      refresh([]);
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
  settled = viewer.state.pages;
  refresh(around(viewer.state));

  return {
    element: viewer.element,
    goToPage: viewer.goToPage,
    goToSpread: viewer.goToSpread,
    next: viewer.next,
    prev: viewer.prev,
    setPages: viewer.setPages,
    refreshPage: viewer.refreshPage,
    setLabels: viewer.setLabels,
    resetView: viewer.resetView,
    getView: viewer.getView,
    setInteraction: viewer.setInteraction,
    pageAt: viewer.pageAt,
    pointOnScreen: viewer.pointOnScreen,
    setAppearance(next: FolioAppearance) {
      hostAppearance = { ...hostAppearance, ...next };
      viewer.setAppearance(appearanceOf(current, hostAppearance));
    },
    get pageSize() {
      return viewer.pageSize;
    },
    get state() {
      return viewer.state;
    },
    setDocument(next: VDTDocument, opts: { at?: number; repaint?: boolean } = {}) {
      const at = Math.max(0, Math.min(next.pages.length - 1, opts.at ?? viewer.state.pages[0] ?? 0));
      const before = current;
      const oldCanvases = canvases;
      const oldDecorated = decorated;
      const oldPainted = painted;
      current = next;
      canvases = [];
      decorated = [];
      painted = new Map();
      focus = [at];
      // A page that reads the same keeps its painting (and its texture):
      // a relayout elsewhere in the book (the plan settling, an edit in
      // another chapter) leaves the open spread as it is.
      const keep = !opts.repaint && (next.config === before.config || signature(next.config) === signature(before.config));
      if (keep) {
        for (const [i, k] of carriedPaintings(before.pages, [...oldPainted.keys()], next.pages, wanted())) {
          const canvas = oldCanvases[k];
          if (!canvas) continue;
          canvases[i] = canvas;
          painted.set(i, oldPainted.get(k)!);
          oldCanvases[k] = null;
          // Its decorated canvas too (drawn again below, for the new
          // document's selection).
          decorated[i] = oldDecorated[k] ?? null;
          oldDecorated[k] = null;
        }
      }
      // The open pages painted before the swap, so no frame shows them
      // blank; the old paintings no page took are let go.
      const width = slotWidth();
      for (let i = at - 2; i <= at + 3; i++) if (i >= 0 && i < next.pages.length && painted.get(i) !== width) paint(i, width);
      for (const canvas of oldCanvases) if (canvas) canvas.width = canvas.height = 0;
      for (const canvas of oldDecorated) free(canvas);
      for (const i of painted.keys()) decorate(i);
      viewer.setAppearance(appearanceOf(next, hostAppearance));
      viewer.setPages(sources(), {
        firstPageRecto: firstPageIsRecto(next),
        binding: next.binding === "right" ? "right" : "left",
        paper: options.paper ?? paperOf(next),
        at,
      });
      focus = viewer.state.pages;
      // A relayout while leaves are in the air (the chapter the book was
      // sent to becoming the active one) keeps the pages they carry.
      if (!turning) {
        settled = viewer.state.pages;
        sweep = [];
      }
      refresh(around(viewer.state));
    },
    redecorate(pages?: Iterable<number>) {
      let swapped = false;
      for (const i of pages ?? [...painted.keys()]) {
        if (!painted.has(i)) continue;
        const had = decorated[i];
        if (decorate(i)) swapped = true;
        else if (had) viewer.refreshPage(had);
      }
      if (swapped) viewer.setPages(sources());
    },
    dispose() {
      cancelIdle(idle);
      cancelAnimationFrame(sweepFrame);
      clearTimeout(resizeTimer);
      viewer.dispose();
      for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 0;
      for (const canvas of decorated) free(canvas);
      canvases = [];
      decorated = [];
      painted.clear();
    },
  };
}

const onIdle = (cb: () => void): number =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(cb, { timeout: 500 }) : (setTimeout(cb, 50) as unknown as number);
const cancelIdle = (id: number) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
