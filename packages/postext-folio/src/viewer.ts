import { canFlip, PageFlipper, type PageSource, type SpreadSrc } from "./pageFlip";
import { spreadOfPage, spreadsOf, type Spread } from "./spreads";
import { injectStyles } from "./styles";

/** A page of the book: its source, or its source with a text alternative. */
export type FolioPage = PageSource | { src: PageSource; alt?: string };

export interface FolioLabels {
  /** The viewer's accessible name. */
  region: string;
  prev: string;
  next: string;
  /** The pages on show, for the live count under the book: page indexes
   *  (0-based) and the page count. */
  count: (pages: number[], total: number) => string;
}

export interface FolioOptions {
  pages: FolioPage[];
  /** Whether the first page is a recto (it opens alone, on the right of a
   *  left-bound book). Default true. */
  firstPageRecto?: boolean;
  /** The edge the book is bound on. A right-bound book lies mirrored: page
   *  1 alone on the left, pairs [3 | 2], and its pages turn leftward. */
  binding?: "left" | "right";
  /** The page to open on (0-based). Default 0. */
  at?: number;
  /** `double` shows spreads and turns leaves in 3D; `single` one page at a
   *  time; `auto` (default) is single in a box narrower than 560 px. */
  mode?: "auto" | "single" | "double";
  /** The colour of blank pages (any CSS colour). Default white. */
  paper?: string;
  /** Turns leaves in 3D when WebGL2 is there and the reader has not asked
   *  for reduced motion. Default true. */
  animate?: boolean;
  /** Draws the ‹ › buttons and the page count. Default true. */
  controls?: boolean;
  labels?: Partial<FolioLabels>;
  /** Told of every spread that settles: its index and the pages on show. */
  onChange?: (state: FolioState) => void;
  /** Told as soon as the book is sent to another spread (a button, a key,
   *  a page let go past halfway), before its leaves have landed. */
  onTarget?: (state: FolioState) => void;
}

export interface FolioState {
  spread: number;
  /** The page indexes on show (one or two). */
  pages: number[];
}

export interface FolioViewer {
  /** The viewer's root element. */
  readonly element: HTMLElement;
  /** Turns to the spread that shows page `index`. */
  goToPage(index: number): void;
  /** Turns to spread `index`. */
  goToSpread(index: number): void;
  next(): void;
  prev(): void;
  /** Replaces the pages (a relayout, or more pages painted), staying on
   *  the page on show unless `at` says otherwise. */
  setPages(pages: FolioPage[], options?: Pick<FolioOptions, "firstPageRecto" | "binding" | "at" | "paper" | "mode">): void;
  /** Swaps the labels (a host that changes language). */
  setLabels(labels: Partial<FolioLabels>): void;
  readonly state: FolioState;
  dispose(): void;
}

const DEFAULT_LABELS: FolioLabels = {
  region: "Book",
  prev: "Previous pages",
  next: "Next pages",
  count: (pages, total) =>
    pages.length > 1 ? `Pages ${pages[0] + 1}–${pages[pages.length - 1] + 1} of ${total}` : `Page ${(pages[0] ?? 0) + 1} of ${total}`,
};

/** A press on a page that moves less than this (px) is a click: it turns
 *  the page (the recto forward, the verso back). */
const CLICK_SLOP = 6;
/** A horizontal swipe longer than this (px) turns the spread. */
const SWIPE = 40;
/** Below this width (px) `mode: 'auto'` shows one page at a time. */
export const SINGLE_BELOW = 560;
/** The flip canvas overhangs the spread (room for a lifted leaf): its
 *  size relative to the spread's. */
const OVERHANG_X = 1.12;
const OVERHANG_Y = 1.36;

const CHEVRON = (dir: "left" | "right") =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}"/></svg>`;

const sourceOf = (page: FolioPage | undefined): PageSource => (page && typeof page === "object" && "src" in page ? page.src : (page ?? null));
const altOf = (page: FolioPage | undefined) => (page && typeof page === "object" && "src" in page ? page.alt : undefined);

/** The natural width / height of a page source, when it is known. */
function aspectOf(src: PageSource): number | null {
  if (!src || typeof src === "string") return null;
  const w = src instanceof HTMLCanvasElement ? src.width : src.naturalWidth;
  const h = src instanceof HTMLCanvasElement ? src.height : src.naturalHeight;
  return w > 0 && h > 0 ? w / h : null;
}

/** A CSS colour as 0 … 1 channels. */
function rgbOf(color: string): [number, number, number] | null {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

/**
 * A book on the page: the pages in spreads by the recto rule, turned with
 * the ‹ › buttons, ←/→, a swipe, a click on a page, or taken by hand and
 * dragged over, the leaves curling in three.js with their shadows. At rest
 * the pages are plain DOM (images or canvases); the WebGL canvas over them
 * draws only while leaves move. Without WebGL2, or with reduced motion,
 * the spreads simply change.
 */
export function createFolio(container: HTMLElement, options: FolioOptions): FolioViewer {
  injectStyles(container);
  let labels: FolioLabels = { ...DEFAULT_LABELS, ...options.labels };
  let pages = options.pages;
  let firstPageRecto = options.firstPageRecto ?? true;
  let binding = options.binding ?? "left";
  let mode = options.mode ?? "auto";
  let paper = options.paper ?? "#fff";
  const animate = options.animate ?? true;
  const controls = options.controls ?? true;

  const root = document.createElement("div");
  root.className = "postext-folio";
  root.tabIndex = 0;
  root.setAttribute("role", "group");
  root.setAttribute("aria-roledescription", "carousel");
  const stage = document.createElement("div");
  stage.className = "postext-folio-stage";
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
  stage.append(prevBtn, spreadEl, nextBtn);
  root.append(stage);
  if (controls) root.append(count);
  else prevBtn.hidden = nextBtn.hidden = true;
  container.append(root);

  let single = false;
  let spreads: Spread[] = [];
  let current = 0;
  let shown = 0;
  let flipper: PageFlipper | null = null;
  let flipCanvas: HTMLCanvasElement | null = null;
  let holding: ((click: boolean) => void) | null = null;
  let press: { x: number; y: number } | null = null;
  let swipe: { x: number; y: number } | null = null;
  let disposed = false;
  let uncover = 0;

  const rtl = () => binding === "right";
  const pagesOf = (s: Spread | undefined) => (s ?? [null, null]).filter((i): i is number => i !== null);
  const bookOf = (): SpreadSrc[] => spreads.map((s) => s.map((i) => (i === null ? null : sourceOf(pages[i]))) as SpreadSrc);

  function aspect() {
    for (const page of pages) {
      const ar = aspectOf(sourceOf(page));
      if (ar) return ar;
    }
    return 1 / Math.SQRT2;
  }

  /** Fits the spread into the box, leaving room for a lifted leaf. */
  function fit() {
    const ar = (single ? 1 : 2) * aspect();
    const style = getComputedStyle(root);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const nav = controls ? 2 * (prevBtn.offsetWidth + 12) : 0;
    const w = Math.max(0, root.clientWidth - padX - nav) / (flipper ? OVERHANG_X : 1);
    const h = Math.max(0, root.clientHeight - padY - (controls ? count.offsetHeight : 0)) / (flipper ? OVERHANG_Y : 1);
    const width = h > 0 ? Math.min(w, h * ar) : w;
    spreadEl.style.width = `${Math.floor(width)}px`;
    spreadEl.style.height = `${Math.floor(width / ar)}px`;
  }

  function pageEl(i: number | null, slot: 0 | 1) {
    const el = document.createElement("div");
    el.className = "postext-folio-page";
    if (!single) el.classList.add(slot === 0 ? "is-verso" : "is-recto");
    const src = i === null ? null : sourceOf(pages[i]);
    if (src === null) {
      el.classList.add("is-empty");
      el.setAttribute("aria-hidden", "true");
    } else if (src === "") {
      el.classList.add("is-blank");
      el.setAttribute("aria-hidden", "true");
    } else {
      const alt = altOf(pages[i!]) ?? "";
      if (typeof src === "string") {
        const img = document.createElement("img");
        img.src = src;
        img.alt = alt;
        img.draggable = false;
        img.decoding = "async";
        el.append(img);
      } else {
        // The page's own element (a canvas, or a decoded image), shown as is.
        src.classList.add("postext-folio-surface");
        if (src instanceof HTMLCanvasElement) {
          src.setAttribute("role", "img");
          if (alt) src.setAttribute("aria-label", alt);
        } else {
          src.alt = alt;
          src.draggable = false;
        }
        el.append(src);
      }
    }
    return el;
  }

  function render() {
    const s = spreads[shown] ?? [null, null];
    const slots = single ? [s[0] ?? s[1]] : s;
    spreadEl.replaceChildren(...slots.map((i, slot) => pageEl(i, slot as 0 | 1)));
    if (flipCanvas) spreadEl.append(flipCanvas);
    spreadEl.classList.toggle("is-solo", single);
    spreadEl.classList.toggle("is-by-hand", !!flipper);
    const on = pagesOf(spreads[current]);
    count.textContent = on.length ? labels.count(on, pages.length) : "";
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= spreads.length - 1;
    // Once the DOM shows the settled spread, the canvas steps aside.
    if (flipper) {
      cancelAnimationFrame(uncover);
      const imgs = [...spreadEl.querySelectorAll("img")];
      void Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => {
        uncover = requestAnimationFrame(() => flipper?.clear());
      });
    }
  }

  function settle(index: number) {
    shown = index;
    render();
    options.onChange?.({ spread: index, pages: pagesOf(spreads[index]) });
  }

  function go(index: number) {
    const to = Math.max(0, Math.min(spreads.length - 1, index));
    if (to === current && to === shown) return;
    current = to;
    options.onTarget?.({ spread: to, pages: pagesOf(spreads[to]) });
    if (flipper) {
      flipper.go(to);
      // The count and buttons follow the hand at once.
      count.textContent = labels.count(pagesOf(spreads[to]), pages.length);
      prevBtn.disabled = to <= 0;
      nextBtn.disabled = to >= spreads.length - 1;
    } else settle(to);
  }

  function setUpFlipper() {
    flipper?.dispose();
    flipper = null;
    flipCanvas?.remove();
    flipCanvas = null;
    if (single || !animate || spreads.length < 2 || !canFlip()) return;
    flipCanvas = document.createElement("canvas");
    flipCanvas.className = "postext-folio-flip";
    flipCanvas.setAttribute("aria-hidden", "true");
    spreadEl.append(flipCanvas);
    flipper = new PageFlipper(
      flipCanvas,
      spreadEl,
      bookOf(),
      shown,
      settle,
      (i) => {
        current = i;
        options.onTarget?.({ spread: i, pages: pagesOf(spreads[i]) });
        count.textContent = labels.count(pagesOf(spreads[i]), pages.length);
      },
      binding,
    );
    const rgb = rgbOf(paper);
    if (rgb) flipper.setPaper(...rgb);
  }

  /** Lays the book out again: spreads, mode, flipper. */
  function rebuild(atPage: number) {
    single = mode === "single" || (mode === "auto" && root.clientWidth > 0 && root.clientWidth < SINGLE_BELOW);
    spreads = single ? pages.map((_, i) => [null, i] as Spread) : spreadsOf(pages.length, firstPageRecto);
    current = shown = spreadOfPage(spreads, atPage);
    root.dir = rtl() ? "rtl" : "ltr";
    root.style.setProperty("--postext-folio-paper", paper);
    root.classList.toggle("is-single", single);
    prevBtn.innerHTML = CHEVRON(rtl() ? "right" : "left");
    nextBtn.innerHTML = CHEVRON(rtl() ? "left" : "right");
    setUpFlipper();
    fit();
    render();
  }

  function applyLabels() {
    root.setAttribute("aria-label", labels.region);
    prevBtn.setAttribute("aria-label", labels.prev);
    nextBtn.setAttribute("aria-label", labels.next);
  }

  // ── Input ──
  prevBtn.addEventListener("click", () => go(current - 1));
  nextBtn.addEventListener("click", () => go(current + 1));
  root.addEventListener("keydown", (event) => {
    if (event.target !== root) return;
    const forward = rtl() ? "ArrowLeft" : "ArrowRight";
    const back = rtl() ? "ArrowRight" : "ArrowLeft";
    if (event.key === back || event.key === "PageUp") go(current - 1);
    else if (event.key === forward || event.key === "PageDown") go(current + 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(spreads.length - 1);
    else return;
    event.preventDefault();
  });
  root.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") swipe = { x: event.clientX, y: event.clientY };
  });
  root.addEventListener("pointerup", (event) => {
    const start = swipe;
    swipe = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(current + ((dx < 0) !== rtl() ? 1 : -1));
  });
  spreadEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || holding) return;
    press = { x: event.clientX, y: event.clientY };
    if (!flipper?.grab(event)) return;
    event.preventDefault();
    event.stopPropagation();
    // The hold follows the pointer anywhere: the window hears it even if
    // the capture is lost, and a move with the button up means the release
    // was missed.
    const id = event.pointerId;
    const start = press;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if ((e.buttons & 1) === 0) end(false);
      else flipper?.drag(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId === id) end(Math.hypot(e.clientX - start.x, e.clientY - start.y) < CLICK_SLOP);
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === id) end(false);
    };
    const onBlur = () => end(false);
    const end = (click: boolean) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", onBlur);
      spreadEl.classList.remove("is-held");
      holding = null;
      press = null;
      flipper?.release(click);
    };
    window.addEventListener("pointermove", onMove);
    // Captured, so the stage's swipe does not hear the hold's release.
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    holding = end;
    swipe = null;
    spreadEl.classList.add("is-held");
    try {
      spreadEl.setPointerCapture(id);
    } catch {
      // The window listeners carry the hold without it.
    }
  });
  spreadEl.addEventListener("pointerup", (event) => {
    if (holding) return;
    const start = press;
    press = null;
    const click = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP;
    if (!click || !(event.target as Element).closest(".postext-folio-page:not(.is-empty)")) return;
    // A click on the recto turns forward, on the verso back (pages already
    // in the air: it joins them).
    const rect = spreadEl.getBoundingClientRect();
    swipe = null;
    if (single) go(current + 1);
    else go(current + ((event.clientX > rect.left + rect.width / 2) !== rtl() ? 1 : -1));
  });

  let lastWidth = -1;
  const observer = new ResizeObserver(() => {
    if (disposed) return;
    const w = root.clientWidth;
    const wasSingle = single;
    const nowSingle = mode === "single" || (mode === "auto" && w > 0 && w < SINGLE_BELOW);
    if (lastWidth >= 0 && nowSingle !== wasSingle) rebuild(pagesOf(spreads[shown])[0] ?? 0);
    else fit();
    lastWidth = w;
  });
  observer.observe(root);

  applyLabels();
  rebuild(options.at ?? 0);

  return {
    element: root,
    goToPage: (index) => go(spreadOfPage(spreads, index)),
    goToSpread: go,
    next: () => go(current + 1),
    prev: () => go(current - 1),
    setLabels(next) {
      labels = { ...labels, ...next };
      applyLabels();
      render();
    },
    get state() {
      return { spread: current, pages: pagesOf(spreads[current]) };
    },
    setPages(next, opts = {}) {
      const atPage = opts.at ?? pagesOf(spreads[shown])[0] ?? 0;
      const relayout =
        next.length !== pages.length ||
        (opts.firstPageRecto ?? firstPageRecto) !== firstPageRecto ||
        (opts.binding ?? binding) !== binding ||
        (opts.mode ?? mode) !== mode ||
        (opts.paper ?? paper) !== paper;
      pages = next;
      firstPageRecto = opts.firstPageRecto ?? firstPageRecto;
      binding = opts.binding ?? binding;
      mode = opts.mode ?? mode;
      paper = opts.paper ?? paper;
      if (relayout) return rebuild(atPage);
      // Same spreads: the leaves take their new pages where they lie.
      flipper?.setBook(bookOf(), opts.at !== undefined ? spreadOfPage(spreads, opts.at) : undefined);
      if (opts.at !== undefined) current = shown = spreadOfPage(spreads, opts.at);
      fit();
      render();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      holding?.(false);
      cancelAnimationFrame(uncover);
      flipper?.dispose();
      root.remove();
    },
  } satisfies FolioViewer;
}
