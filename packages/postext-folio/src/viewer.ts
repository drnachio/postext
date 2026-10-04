import { resolveFolioConfig, type FolioConfig, type FolioPaperConfig } from "postext";
import { canFlip, PageFlipper, type FlipAppearance, type PageSource, type SpreadSrc } from "./pageFlip";
import { spreadOfPage, spreadsOf, type Spread } from "./spreads";
import { injectStyles } from "./styles";

/** A page of the book: its source, or its source with a text alternative
 *  and the paper it is printed on when that is not the book's (a plate
 *  section on gloss in a matte book). */
export type FolioPage = PageSource | { src: PageSource; alt?: string; paper?: FolioPaperConfig };

/** How the 3D book is presented. */
export interface FolioAppearance {
  /** View, paper, binding, desk and light (postext's `folio` config). */
  folio?: FolioConfig;
  /** The trim width of a page in mm (the paper's caliper and the cover's
   *  board are scaled against it). Default 150. */
  pageWidthMm?: number;
  /** Pages of the book before the first page given and after the last
   *  (the other chapters of a book shown a chapter at a time): they are
   *  never drawn, only counted for the thickness of the page block. */
  extraPages?: { before: number; after: number };
  /** Where the scanned desk textures are served (see
   *  `FlipAppearance.textureBaseUrl`). */
  textureBaseUrl?: string;
  /** The first page given is the book's front cover, the last its back
   *  cover (when it falls on a verso): they turn as boards and no case
   *  is drawn round the pages. */
  covers?: { front: boolean; back: boolean };
  /** The picture printed on the spine: the image the `folio.binding.
   *  spineImage` resource names, as a URL (or a drawn canvas or image).
   *  See `FlipAppearance.spineImage`. */
  spineImage?: PageSource;
}

/** What the left button (or one finger) does on the book: `hand` takes
 *  and turns the pages, `orbit` turns the view round the book (what the
 *  right button always does), `select` leaves the pointer to the host (to
 *  select text: `pageAt` says where on which page it is). */
export type FolioInteraction = "hand" | "orbit" | "select";

/** A point on a page as printed: the page index and where on it, as
 *  fractions of its width and height from its top left corner. */
export interface FolioPagePoint {
  page: number;
  x: number;
  y: number;
}

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
  /** A page's width / height, when the pages cannot tell it yet (blank
   *  until painted). Default: the first sized page's, else 1 : √2. */
  aspect?: number;
  /** The colour of blank pages (any CSS colour). Default white. */
  paper?: string;
  /** Turns leaves in 3D when WebGL2 is there and the reader has not asked
   *  for reduced motion. Default true. */
  animate?: boolean;
  /** Draws the ‹ › buttons and the page count. Default true. */
  controls?: boolean;
  /** Shows the page count under the book. Default true. When false it is
   *  still announced to screen readers (a visually hidden live region). */
  showCount?: boolean;
  labels?: Partial<FolioLabels>;
  /** How the 3D book is presented (see {@link FolioAppearance}). */
  appearance?: FolioAppearance;
  /** What the left button does (see {@link FolioInteraction}). Default
   *  `hand`. */
  interaction?: FolioInteraction;
  /** Told of every spread that settles: its index and the pages on show. */
  onChange?: (state: FolioState) => void;
  /** Told as soon as the book is sent to another spread (a button, a key,
   *  a page let go past halfway), before its leaves have landed. */
  onTarget?: (state: FolioState) => void;
  /** Told when the page slots change size: a host painting pages for the
   *  viewer paints them at `deviceWidth` × `deviceHeight` pixels, so they
   *  are shown 1:1 both at rest and on a turning leaf. */
  onLayout?: (size: FolioPageSize) => void;
}

/** One page slot of the spread: its CSS size, and the device pixels it
 *  covers (the size a page bitmap is shown 1:1 at). */
export interface FolioPageSize {
  width: number;
  height: number;
  deviceWidth: number;
  deviceHeight: number;
}

export interface FolioState {
  spread: number;
  /** The page indexes on show (one or two). */
  pages: number[];
}

export interface FolioViewer {
  /** The viewer's root element. */
  readonly element: HTMLElement;
  /** Turns to the spread that shows page `index`; `instant` opens it
   *  there without turning the leaves (a link, a restored position). */
  goToPage(index: number, options?: { instant?: boolean }): void;
  /** Turns to spread `index` (`instant`: opens it there). */
  goToSpread(index: number, options?: { instant?: boolean }): void;
  next(): void;
  prev(): void;
  /** Replaces the pages (a relayout, or more pages painted), staying on
   *  the page on show unless `at` says otherwise. */
  setPages(pages: FolioPage[], options?: Pick<FolioOptions, "firstPageRecto" | "binding" | "at" | "paper" | "mode">): void;
  /** The page slot's size, as last laid out. */
  readonly pageSize: FolioPageSize;
  /** Swaps the labels (a host that changes language). */
  setLabels(labels: Partial<FolioLabels>): void;
  /** Changes how the 3D book is presented. */
  setAppearance(appearance: FolioAppearance): void;
  /** Eases the view back to the one the settings give (after the reader
   *  orbited it with a right-drag). */
  resetView(): void;
  /** Changes what the left button does. */
  setInteraction(mode: FolioInteraction): void;
  /** A page's canvas was drawn again in place: shows it again. */
  refreshPage(src: PageSource): void;
  /** The page under a pointer and where on it, as the book is seen (the
   *  tilted, orbited 3D book included); null off the open pages. */
  pageAt(event: { clientX: number; clientY: number }): FolioPagePoint | null;
  /** Where a point of a page lies on screen (client px), when the page
   *  lies open; null otherwise. */
  pointOnScreen(point: FolioPagePoint): { x: number; y: number } | null;
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
/** Space kept round the book (CSS px): beside it for the ‹ › buttons, and
 *  above and below it for the page count (and a lifted leaf's corner). */
const GAP = 12;
const MIN_MARGIN_Y = 20;

const CHEVRON = (dir: "left" | "right") =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}"/></svg>`;

const sourceOf = (page: FolioPage | undefined): PageSource => (page && typeof page === "object" && "src" in page ? page.src : (page ?? null));
const altOf = (page: FolioPage | undefined) => (page && typeof page === "object" && "src" in page ? page.alt : undefined);
const paperOf = (page: FolioPage | undefined) =>
  page && typeof page === "object" && "src" in page ? (page as { paper?: FolioPaperConfig }).paper : undefined;

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
  // Over white: a transparent page is white paper.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

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
  injectStyles(container);
  let labels: FolioLabels = { ...DEFAULT_LABELS, ...options.labels };
  let pages = options.pages;
  let firstPageRecto = options.firstPageRecto ?? true;
  let binding = options.binding ?? "left";
  let mode = options.mode ?? "auto";
  let paper = options.paper ?? "#fff";
  let appearance: FolioAppearance = options.appearance ?? {};
  let papersKey = JSON.stringify(pages.map(paperOf));
  /** The appearance the flipper was last given, as text. */
  let appearanceKey = "";
  const animate = options.animate ?? true;
  const controls = options.controls ?? true;
  const showCount = options.showCount ?? true;
  let interaction: FolioInteraction = options.interaction ?? "hand";

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
  let slot: FolioPageSize = { width: 0, height: 0, deviceWidth: 0, deviceHeight: 0 };

  const rtl = () => binding === "right";
  const pagesOf = (s: Spread | undefined) => (s ?? [null, null]).filter((i): i is number => i !== null);
  /** One page at a time on a WebGL book: the spine runs along the page's
   *  inner edge, the leaf turns over it and out of the box. */
  const singleGl = () => single && !!flipper;
  // In single mode every sheet carries one page: its back is blank paper
  // (the page after it lies under it, not on its back).
  const bookOf = (): SpreadSrc[] =>
    spreads.map((s, k) => (single ? [k === 0 ? null : "", sourceOf(pages[s[1]!])] : s.map((i) => (i === null ? null : sourceOf(pages[i])))) as SpreadSrc);

  /** The flipper's appearance: the leaves' own papers (a leaf takes its
   *  recto's, else its verso's) and the leaves outside the pages given. */
  function flipAppearance(): FlipAppearance {
    const extra = appearance.extraPages ?? { before: 0, after: 0 };
    const leafPapers = spreads.slice(0, -1).map((s, k) =>
      single ? paperOf(pages[s[1]!]) : (paperOf(pages[s[1] ?? -1]) ?? paperOf(pages[spreads[k + 1]?.[0] ?? -1])),
    );
    return {
      folio: appearance.folio,
      pageWidthMm: appearance.pageWidthMm,
      extraLeaves: single ? { before: extra.before, after: extra.after } : { before: Math.ceil(extra.before / 2), after: Math.ceil(extra.after / 2) },
      leafPapers,
      singlePage: single,
      textureBaseUrl: appearance.textureBaseUrl,
      coverLeaves: coverLeavesOf(),
      ...(appearance.spineImage ? { spineImage: appearance.spineImage } : {}),
    };
  }

  /** The leaves that are the covers: the first, when the book opens on its
   *  first page alone; the last, when the last page is a verso alone. */
  function coverLeavesOf(): FlipAppearance["coverLeaves"] {
    const c = appearance.covers;
    if (!c || spreads.length < 2) return undefined;
    const last = spreads[spreads.length - 1];
    return {
      ...(c.front && (single || spreads[0][0] === null) ? { front: 0 } : {}),
      ...(c.back && !single && last[1] === null ? { back: spreads.length - 2 } : {}),
    };
  }

  function aspect() {
    if (options.aspect) return options.aspect;
    for (const page of pages) {
      const ar = aspectOf(sourceOf(page));
      if (ar) return ar;
    }
    return 1 / Math.SQRT2;
  }

  /**
   * Fits the book into the box, as large as it goes: the ‹ › buttons and
   * the count sit in the margins round it. The spread lies on the device
   * pixel grid, its page slots a whole number of device pixels wide, so a
   * page painted at that size is shown 1:1 in the DOM and on the canvas
   * alike. The WebGL canvas covers the box, centred on the spread (the
   * camera maps the spread onto it 1:1), with room for a lifted leaf.
   */
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const box = root.getBoundingClientRect();
    const boxW = Math.floor(box.width * dpr);
    const boxH = Math.floor(box.height * dpr);
    const ar = aspect();
    const gap = Math.round(GAP * dpr);
    // The widest page up to `max` device px whose width and height are
    // even: the spread's centre and the spine (the camera's centre in one
    // or the other mode) then lie on the pixel grid.
    const fitWidth = (max: number) => {
      let w = Math.max(2, Math.floor(max));
      while (w > 2 && (w % 2 || Math.round(w / ar) % 2)) w--;
      return w;
    };
    let deviceWidth: number;
    let left: number;
    let top: number;
    let across: number;
    if (single) {
      // One page across the box, the buttons and the count in a bar below.
      const bar = controls ? Math.round((prevBtn.offsetWidth + 2 * GAP) * dpr) : gap;
      const availW = Math.max(0, boxW - 2 * gap);
      const availH = Math.max(0, boxH - gap - bar);
      deviceWidth = fitWidth(Math.min(availW, availH > 0 ? availH * ar : Infinity));
      const deviceHeight = Math.round(deviceWidth / ar);
      const pageLeft = gap + Math.floor((availW - deviceWidth) / 2);
      top = gap + Math.max(0, Math.floor((availH - deviceHeight) / 2));
      if (flipper) {
        // The WebGL book is a spread whose other page lies off the box: the
        // spine on the page's inner edge (its left, or its right when the
        // book is bound on the right).
        across = 2;
        left = rtl() ? pageLeft : pageLeft - deviceWidth;
      } else {
        across = 1;
        left = pageLeft;
      }
    } else {
      across = 2;
      const marginX = Math.round((controls ? prevBtn.offsetWidth + 2 * GAP : GAP) * dpr);
      const marginY = Math.round(Math.max(MIN_MARGIN_Y, showCount ? count.offsetHeight + 2 * GAP : GAP) * dpr);
      const availW = Math.max(0, boxW - 2 * marginX);
      const availH = Math.max(0, boxH - 2 * marginY);
      // A tilted book is foreshortened: its pages may be taller than the
      // box before their image is.
      const tall = flipper ? 1 / Math.max(0.7, Math.cos((resolveFolioConfig(appearance.folio).tilt * Math.PI) / 180)) : 1;
      deviceWidth = fitWidth(Math.min(availW / 2, availH > 0 ? availH * tall * ar : Infinity));
      left = Math.floor((boxW - 2 * deviceWidth) / 2);
      top = Math.max(0, Math.floor((boxH - Math.round(deviceWidth / ar)) / 2));
    }
    const deviceHeight = Math.max(1, Math.round(deviceWidth / ar));
    Object.assign(spreadEl.style, {
      left: `${left / dpr}px`,
      top: `${top / dpr}px`,
      width: `${(across * deviceWidth) / dpr}px`,
      height: `${deviceHeight / dpr}px`,
    });
    if (flipCanvas) {
      // Centred on the spine (the camera maps the spread onto the canvas
      // 1:1 about its centre) and reaching every edge of the box; what
      // falls outside the box is clipped.
      const cx = left + deviceWidth;
      const cy = top + deviceHeight / 2;
      const hw = Math.max(cx, boxW - cx);
      const hh = Math.max(cy, boxH - cy);
      Object.assign(flipCanvas.style, {
        left: `${(cx - hw) / dpr}px`,
        top: `${(cy - hh) / dpr}px`,
        width: `${(2 * hw) / dpr}px`,
        height: `${(2 * hh) / dpr}px`,
      });
    }
    const next = { width: deviceWidth / dpr, height: deviceHeight / dpr, deviceWidth, deviceHeight };
    if (next.deviceWidth !== slot.deviceWidth || next.deviceHeight !== slot.deviceHeight) {
      slot = next;
      options.onLayout?.(slot);
    }
    flipper?.redraw();
  }

  function pageEl(i: number | null, slot: 0 | 1) {
    const el = document.createElement("div");
    el.className = "postext-folio-page";
    if (!single || singleGl()) el.classList.add(slot === 0 ? "is-verso" : "is-recto");
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
    const slots = single && !singleGl() ? [s[0] ?? s[1]] : s;
    spreadEl.replaceChildren(...slots.map((i, side) => pageEl(i, side as 0 | 1)));
    spreadEl.classList.toggle("is-solo", single && !singleGl());
    spreadEl.classList.toggle("is-by-hand", !!flipper);
    // The canvas draws the book, still or turning; the DOM pages stay as
    // the textures' sources and the pages' text alternatives.
    spreadEl.classList.toggle("is-gl", !!flipper);
    const on = pagesOf(spreads[current]);
    count.textContent = on.length ? labels.count(on, pages.length) : "";
    prevBtn.disabled = current <= 0;
    nextBtn.disabled = current >= spreads.length - 1;
    // The settled spread, drawn at rest.
    flipper?.clear();
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

  /** Opens spread `index` at once, no leaf turning. */
  function jump(index: number) {
    const to = Math.max(0, Math.min(spreads.length - 1, index));
    if (to === current && to === shown) return;
    current = to;
    options.onTarget?.({ spread: to, pages: pagesOf(spreads[to]) });
    flipper?.setBook(bookOf(), to);
    settle(to);
  }

  function setUpFlipper() {
    flipper?.dispose();
    flipper = null;
    flipCanvas?.remove();
    flipCanvas = null;
    if (!animate || spreads.length < 2 || !canFlip()) return;
    flipCanvas = document.createElement("canvas");
    flipCanvas.className = "postext-folio-flip";
    flipCanvas.setAttribute("aria-hidden", "true");
    root.append(flipCanvas);
    const initial = flipAppearance();
    appearanceKey = JSON.stringify(initial);
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
      // One page at a time the spine is the box's edge: the leaf cannot be
      // carried past halfway, so a shorter pull turns it.
      { persistent: true, turnAt: single ? 0.2 : 0.5, appearance: initial },
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
  // Right-drag orbits the view round the book; the view stays where it is
  // left until `resetView()` (the host's button) eases it back.
  root.addEventListener("contextmenu", (event) => {
    if (flipper) event.preventDefault();
  });
  root.addEventListener("pointerdown", (event) => {
    // In orbit mode the left button (one finger, a pen) orbits too.
    const orbits = event.button === 2 || (event.button === 0 && interaction === "orbit");
    if (!orbits || !flipper || holding) return;
    if ((event.target as Element).closest(".postext-folio-nav")) return;
    event.preventDefault();
    const mask = event.button === 2 ? 2 : 1;
    const id = event.pointerId;
    root.classList.add("is-orbiting");
    let x = event.clientX;
    let y = event.clientY;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      if ((e.buttons & mask) === 0) return end();
      flipper?.orbitBy(e.clientX - x, e.clientY - y);
      x = e.clientX;
      y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === id) end();
    };
    const end = () => {
      root.classList.remove("is-orbiting");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", end);
  });
  // Select mode: a text cursor over the pages as the book is seen.
  root.addEventListener("pointermove", (event) => {
    if (interaction !== "select" || event.buttons) return;
    root.classList.toggle("is-over-page", !!pageAt(event));
  });
  root.addEventListener("pointerdown", (event) => {
    // Only the hand takes pages, swipes and clicks them over.
    if (interaction !== "hand") return;
    if (onPage(event)) return;
    if (event.pointerType !== "mouse") swipe = { x: event.clientX, y: event.clientY };
  });
  root.addEventListener("pointerup", (event) => {
    const start = swipe;
    swipe = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(current + ((dx < 0) !== rtl() ? 1 : -1));
  });
  /** A press on a page: taken by hand (the WebGL book, hit in 3D, since
   *  the tilted book does not lie over the DOM spread), or remembered as a
   *  possible click. True when the stage's swipe should not hear it. */
  function onPage(event: PointerEvent): boolean {
    if (event.button !== 0 || holding) return false;
    const target = event.target as Element;
    if (target.closest(".postext-folio-nav")) return false;
    if (flipper ? !flipper.hit(event) : !target.closest(".postext-folio-spread")) return false;
    press = { x: event.clientX, y: event.clientY };
    if (singleGl()) {
      decide(event);
      return true;
    }
    if (!flipper?.grab(event)) return false;
    event.preventDefault();
    hold(event, press);
    return true;
  }

  /**
   * One page at a time, the page is taken only once the pointer shows
   * which way it goes: towards the spine it is lifted and dragged over
   * (from where it was pressed), away from it the book goes back a page (a
   * swipe); a press that does not move is a tap and turns forward.
   */
  function decide(down: PointerEvent) {
    down.stopPropagation();
    swipe = null;
    const id = down.pointerId;
    const start = { x: down.clientX, y: down.clientY };
    const toSpine = rtl() ? 1 : -1;
    const done = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < CLICK_SLOP || Math.abs(dy) > Math.abs(dx)) return;
      if (Math.sign(dx) !== toSpine) return; // a swipe back: settled on release
      done();
      if (!flipper?.grab(down)) return;
      hold(down, start);
      flipper.drag(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      done();
      press = null;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < CLICK_SLOP) go(current + 1);
      else if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) && Math.sign(dx) === -toSpine) go(current - 1);
      e.stopPropagation();
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === id) done();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Holds the page taken at `event` until the pointer lets go. */
  function hold(event: PointerEvent, start: { x: number; y: number }) {
    // The hold follows the pointer anywhere: the window hears it even if
    // the capture is lost, and a move with the button up means the release
    // was missed.
    const id = event.pointerId;
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
  }
  root.addEventListener("pointerup", (event) => {
    if (holding || singleGl() || interaction !== "hand") return;
    const start = press;
    press = null;
    const click = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP;
    if (!click) return;
    // A click on the recto turns forward, on the verso back (pages already
    // in the air: it joins them).
    if (flipper) {
      const side = flipper.hit(event);
      if (!side) return;
      swipe = null;
      return go(current + (single ? 1 : side));
    }
    if (!(event.target as Element).closest(".postext-folio-page:not(.is-empty)")) return;
    const rect = spreadEl.getBoundingClientRect();
    swipe = null;
    if (single) go(current + 1);
    else go(current + ((event.clientX > rect.left + rect.width / 2) !== rtl() ? 1 : -1));
  });

  /** The page index in slot `side` (0 the verso, 1 the recto) of the
   *  spread on show. */
  const pageInSlot = (side: 0 | 1): number | null => {
    const s = spreads[shown];
    if (!s) return null;
    return single && !singleGl() ? (s[0] ?? s[1]) : s[side];
  };

  function pageAt(event: { clientX: number; clientY: number }): FolioPagePoint | null {
    if (flipper) {
      const hit = flipper.pagePoint(event);
      if (!hit) return null;
      const page = pageInSlot(hit.side);
      return page === null || page === undefined ? null : { page, x: hit.x, y: hit.y };
    }
    // The DOM spread: its pages, as laid out (a right-bound book's in
    // reverse order).
    const els = [...spreadEl.children] as HTMLElement[];
    for (let k = 0; k < els.length; k++) {
      const r = els[k].getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) continue;
      const side = (els.length === 1 ? 1 : rtl() ? 1 - k : k) as 0 | 1;
      const page = els.length === 1 ? pageInSlot(0) : pageInSlot(side);
      if (page === null || page === undefined) return null;
      return { page, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height };
    }
    return null;
  }

  function pointOnScreen(point: FolioPagePoint): { x: number; y: number } | null {
    const s = spreads[shown];
    if (!s) return null;
    const found = pageInSlot(1) === point.page ? 1 : pageInSlot(0) === point.page ? 0 : -1;
    if (found < 0) return null;
    const side = found as 0 | 1;
    if (flipper) return flipper.screenPoint(side, point.x, point.y);
    const els = [...spreadEl.children] as HTMLElement[];
    const el = els.length === 1 ? els[0] : els[rtl() ? 1 - side : side];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + point.x * r.width, y: r.top + point.y * r.height };
  }

  function applyInteraction() {
    root.classList.toggle("is-orbit", interaction === "orbit");
    root.classList.toggle("is-select", interaction === "select");
    if (interaction !== "select") root.classList.remove("is-over-page");
  }

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
  applyInteraction();
  rebuild(options.at ?? 0);

  return {
    element: root,
    goToPage: (index, opts) => (opts?.instant ? jump : go)(spreadOfPage(spreads, index)),
    goToSpread: (index, opts) => (opts?.instant ? jump : go)(index),
    next: () => go(current + 1),
    prev: () => go(current - 1),
    setLabels(next) {
      labels = { ...labels, ...next };
      applyLabels();
      render();
    },
    get pageSize() {
      return slot;
    },
    resetView() {
      flipper?.resetOrbit();
    },
    setInteraction(next) {
      if (next === interaction) return;
      interaction = next;
      applyInteraction();
    },
    pageAt,
    pointOnScreen,
    refreshPage(src) {
      flipper?.touch(src);
    },
    setAppearance(next) {
      appearance = { ...appearance, ...next };
      const flip = flipAppearance();
      const key = JSON.stringify(flip);
      if (key === appearanceKey) return;
      appearanceKey = key;
      flipper?.setAppearance(flip);
      fit();
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
      // Pages that came with another paper (a relayout moved a plate run).
      const papers = JSON.stringify(pages.map(paperOf));
      if (flipper && papers !== papersKey) {
        const flip = flipAppearance();
        appearanceKey = JSON.stringify(flip);
        flipper.setAppearance(flip);
      }
      papersKey = papers;
      if (opts.at !== undefined) current = shown = spreadOfPage(spreads, opts.at);
      fit();
      render();
    },
    dispose() {
      disposed = true;
      observer.disconnect();
      holding?.(false);
      flipper?.dispose();
      root.remove();
    },
  } satisfies FolioViewer;
}
