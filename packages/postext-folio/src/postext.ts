import { renderPageToCanvas, type VDTDocument, type VDTPage } from "postext";
import { resolveFolioConfig, type FolioPaperConfig } from "postext";
import { BLOCK_PAGES } from "./pageFlip";
import { createFolio, type FolioAppearance, type FolioOptions, type FolioPagePoint, type FolioPageSize, type FolioState, type FolioViewer } from "./viewer";
import { attachVideoSource, isHlsVideo, pageVideoSpots, spotContains, type PageVideoSpot } from "./videos";

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
  /**
   * Videos printed on the pages play there (#477): a click on a video's
   * poster plays it on the page (in every pointer mode), a click on it
   * again pauses it, and it goes on playing while its leaf turns. A video
   * with `player.autoplay` starts by itself the first time its spread is
   * shown (muted until the reader has interacted with the page). Starting another
   * stops the one playing; it stops too when the book comes to rest on a
   * spread that does not show it. Self-hosted videos only (a file, or its
   * address: MP4, WebM or an HLS stream); a YouTube or Vimeo poster turns
   * the page as any other. The video's server must allow cross-origin
   * reads (CORS) for WebGL to draw it. Default true.
   */
  videos?: boolean;
  /** The address a self-hosted video's file plays from (an object URL for
   *  its `fileId`); without one, its production address (`video.url`). */
  videoUrl?: (fileId: string) => string | undefined;
  /** Told when a video on a page starts playing, pauses, stops or cannot
   *  play (`error`: no address, a refused cross-origin read, no HLS). */
  onVideo?: (event: { resourceId: string; page: number; state: "playing" | "paused" | "stopped" | "error" }) => void;
}

export interface FolioDocumentViewer extends FolioViewer {
  /** Shows another layout of the book (after an edit), on the same page
   *  unless `at` says otherwise. A page that reads the same as before
   *  keeps its painting; `repaint` paints every page again (an image that
   *  came in after the pages were painted). `appearance` is laid over the
   *  host's own, as `setAppearance` does, for the new document (a chapter
   *  saying how many pages of the book lie round it). */
  setDocument(doc: VDTDocument, options?: { at?: number; repaint?: boolean; appearance?: FolioAppearance }): void;
  /** Draws the decorations (`decorate`) again on these pages, or on every
   *  painted page; the book shows them at once, on a turning leaf too. */
  redecorate(pages?: Iterable<number>): void;
  /** Plays or pauses the video printed at a point of a page, as a click
   *  there does; false when no playable video lies there. */
  toggleVideoAt(point: FolioPagePoint): boolean;
  /** Stops the video playing on a page (its poster shows again). */
  stopVideo(): void;
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
 *  book), with the host's own appearance laid over them. The pages round
 *  it are the host's word when it gives them (`extraPages`: a host laying
 *  a book out a chapter at a time knows the chapters after this one, which
 *  the document only knows when it was given the book's page count). */
export function appearanceOf(doc: VDTDocument, own: FolioAppearance | undefined): FolioAppearance {
  const page = doc.pages[0];
  const before = Math.max(0, own?.extraPages?.before ?? doc.pageIndexOffset ?? 0);
  const after = Math.max(0, own?.extraPages?.after ?? (doc.bookPageCount ?? 0) - before - doc.pages.length);
  const folio = own && "folio" in own ? own.folio : doc.config.folio;
  // The document's own covers: the book's first page (a recto) and its
  // last, when that is a verso (an even page number). A chapter from the
  // middle of the book has neither: its first and last leaves are paper
  // (#449).
  const ownCovers = resolveFolioConfig(folio).binding.cover === "pages";
  const total = before + doc.pages.length;
  return {
    folio: doc.config.folio,
    covers: { front: ownCovers && before === 0, back: ownCovers && after === 0 && total % 2 === 0 },
    // Page sizes are in device pixels at the page's dpi.
    ...(page ? { pageWidthMm: (trimmedSize(page, doc).width * 25.4) / (doc.config.page.dpi || 300) } : {}),
    ...own,
    extraPages: { before, after },
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

/** A run of turns, from the spread at rest to the book's next rest: where
 *  its leaves started and, when it opened with a block jump, the spread
 *  that block lands on. */
export interface SweepRun {
  from: number[];
  block: number[] | null;
}

/**
 * The pages a turn to `target` sweeps past, in the order its leaves lift,
 * and the run it belongs to. A turn set at rest (`run` null) more than
 * `BLOCK_PAGES` away goes over as one block, as the renderer turns it: it
 * keeps only the pages on show (the block's top face), the target's being
 * painted with it. A target set while leaves are in the air carries the
 * run on leaf by leaf (the renderer lifts a block only with no leaf in
 * the air), so every page from where the run started (or its block
 * lands) to the target is swept, a run of fast clicks included.
 */
export function sweepFor(run: SweepRun | null, settled: number[], target: number[], count: number): { run: SweepRun; pages: number[] } {
  if (!run) {
    const from = settled.length ? settled : [0];
    if (Math.abs((target[0] ?? 0) - (from[0] ?? 0)) > BLOCK_PAGES) return { run: { from, block: target }, pages: [...from] };
    run = { from, block: null };
  }
  const from = run.block ?? run.from;
  const lo = Math.max(0, Math.min(...from, ...target) - 1);
  const hi = Math.min(count - 1, Math.max(...from, ...target) + 1);
  const pages: number[] = [];
  for (let i = lo; i <= hi; i++) pages.push(i);
  if ((target[0] ?? 0) < (from[0] ?? 0)) pages.reverse();
  // The block's top face stays until it lands.
  const swept = run.block ? [...run.from, ...pages] : pages;
  return { run, pages: swept.slice(0, MAX_SWEEP) };
}
/** Painting time per frame while leaves are in the air. */
const SWEEP_BUDGET_MS = 8;

/** How long the book must stay as it is before a video set to play on its
 *  own starts (a host's layouts settling, a run of turns). */
const AUTOPLAY_SETTLE_MS = 700;

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
  /** The run of turns since the book last came to rest. */
  let run: SweepRun | null = null;
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
    const next = sweepFor(run, settled, target, current.pages.length);
    run = next.run;
    sweep = next.pages;
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

  // ── Videos on the pages (#477) ──
  /** The video spots of each page of the current document, as found. */
  let spots = new Map<number, PageVideoSpot[]>();
  /** The video playing (or paused) on a page; `autoMuted` while it plays
   *  muted because it started on its own. */
  let playing: { page: number; spot: PageVideoSpot; element: HTMLVideoElement; release?: () => void; shown: boolean; autoMuted: boolean } | null = null;
  /** The videos that have started on their own once (`player.autoplay`). */
  const autoplayed = new Set<string>();

  const spotsOf = (i: number): PageVideoSpot[] => {
    let found = spots.get(i);
    if (!found) {
      const page = current.pages[i];
      found = page ? pageVideoSpots(page, current) : [];
      spots.set(i, found);
    }
    return found;
  };
  /** Where a self-hosted video plays from: its file, else its address. */
  const urlOf = (spot: PageVideoSpot): string | undefined => {
    const v = spot.video;
    if (v.source !== "file") return undefined;
    return (v.fileId ? options.videoUrl?.(v.fileId) : undefined) ?? v.link;
  };
  const spotAt = (point: FolioPagePoint): PageVideoSpot | undefined =>
    options.videos === false ? undefined : spotsOf(point.page).find((s) => urlOf(s) && spotContains(s, point.x, point.y));

  const report = (state: "playing" | "paused" | "stopped" | "error") => {
    if (playing) options.onVideo?.({ resourceId: playing.spot.resourceId, page: playing.page, state });
  };

  /** Shows the playing video on its page (once it has a frame to show). */
  function showVideo() {
    if (!playing) return;
    playing.shown = true;
    viewer.setPageVideo({ page: playing.page, element: playing.element, origin: playing.spot.origin, across: playing.spot.across, down: playing.spot.down, ...(playing.spot.crop ? { crop: playing.spot.crop } : {}) });
  }

  function stopVideo(state: "stopped" | "error" = "stopped") {
    const p = playing;
    if (!p) return;
    report(state);
    playing = null;
    p.element.pause();
    p.release?.();
    if (p.shown) viewer.setPageVideo(null);
  }

  function startVideo(page: number, spot: PageVideoSpot, auto = false) {
    stopVideo();
    const url = urlOf(spot);
    if (!url) return;
    const element = document.createElement("video");
    element.playsInline = true;
    element.preload = "auto";
    // WebGL draws the picture only when its server allows the read.
    if (!/^(blob|data):/i.test(url)) element.crossOrigin = "anonymous";
    const player = spot.video.player;
    // A video that starts on its own has its sound once the reader has
    // clicked or typed on the page (the browser allows it then); before
    // that it starts muted, as browsers require, and a click unmutes it.
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? false;
    element.muted = player.muted || (auto && !activated);
    const entry: NonNullable<typeof playing> = { page, spot, element, shown: false, autoMuted: !player.muted && element.muted };
    playing = entry;
    const live = () => playing === entry;
    const range = { start: spot.video.start ?? 0, end: spot.video.end };
    element.addEventListener("error", () => live() && stopVideo("error"));
    element.addEventListener("loadedmetadata", () => {
      if (range.start) element.currentTime = range.start;
    }, { once: true });
    element.addEventListener("loadeddata", () => live() && showVideo(), { once: true });
    element.addEventListener("playing", () => live() && report("playing"));
    element.addEventListener("pause", () => live() && !element.ended && report("paused"));
    const atEnd = () => {
      if (!live()) return;
      if (player.loop) {
        element.currentTime = range.start;
        void element.play().catch(() => {});
      } else stopVideo();
    };
    element.addEventListener("ended", atEnd);
    element.addEventListener("timeupdate", () => {
      if (range.end && element.currentTime >= range.end) atEnd();
    });
    // The picture's height on screen: an HLS stream needs no larger variant.
    const size = viewer.pageSize;
    const maxHeight = Math.max(Math.hypot(spot.down.x * size.deviceWidth, spot.down.y * size.deviceHeight), Math.hypot(spot.across.x * size.deviceWidth, spot.across.y * size.deviceHeight));
    void attachVideoSource(element, url, { hls: isHlsVideo(spot.video, url), maxHeight, corsTag: true }).then(
      (release) => {
        if (!live()) return release();
        entry.release = release;
        // The click's gesture lets it play with sound; a browser that still
        // refuses gets it muted.
        element.play().catch((err: unknown) => {
          if (!live()) return;
          if ((err as { name?: string })?.name === "NotAllowedError" && !element.muted) {
            element.muted = true;
            entry.autoMuted = !player.muted;
            return element.play();
          }
          throw err;
        }).catch(() => live() && stopVideo("error"));
      },
      () => live() && stopVideo("error"),
    );
  }

  /** A click at a point of a page: plays, pauses or resumes the video
   *  printed there. */
  function toggleVideoAt(point: FolioPagePoint): boolean {
    const spot = spotAt(point);
    if (!spot) return false;
    if (playing && playing.page === point.page && playing.spot.key === spot.key) togglePlaying();
    else startVideo(point.page, spot);
    return true;
  }

  /** A click (or Space) on the video playing: one that started on its own
   *  is unmuted first; otherwise it pauses or resumes. */
  function togglePlaying() {
    const p = playing;
    if (!p) return;
    if (p.autoMuted && !p.element.paused) {
      p.autoMuted = false;
      p.element.muted = false;
      return;
    }
    if (p.element.paused) void p.element.play().catch(() => {});
    else p.element.pause();
  }

  /** Autoplay waits for the book to settle: a host lays a book out in
   *  steps (a chapter, then the whole book), and only the spread the reader
   *  is left looking at counts as shown. */
  let autoTimer = 0;
  const scheduleAutoplay = () => {
    clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => {
      if (!turning) autoplayOn(viewer.state.pages);
    }, AUTOPLAY_SETTLE_MS);
  };

  /** The first time a spread shows a video set to play on its own
   *  (`player.autoplay`), it starts, muted; never again in this viewer. */
  function autoplayOn(pages: number[]) {
    if (options.videos === false || playing) return;
    for (const page of pages) {
      for (const spot of spotsOf(page)) {
        if (!spot.video.player.autoplay || !urlOf(spot) || autoplayed.has(spot.key)) continue;
        autoplayed.add(spot.key);
        startVideo(page, spot, true);
        return;
      }
    }
  }

  /** A new layout: the playing video follows its resource to where the
   *  layout puts it, or stops when it is gone. */
  function followVideo() {
    spots = new Map();
    const p = playing;
    if (!p) return;
    const near = [p.page, ...viewer.state.pages];
    for (let i = 0; i < current.pages.length; i++) near.push(i);
    for (const i of near) {
      const spot = spotsOf(i).find((s) => s.key === p.spot.key && urlOf(s) === urlOf(p.spot));
      if (!spot) continue;
      p.page = i;
      p.spot = spot;
      if (p.shown) showVideo();
      return;
    }
    stopVideo();
  }

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
    onPageClick: (point) => toggleVideoAt(point) || !!options.onPageClick?.(point),
    isPageAction: (point) => !!spotAt(point) || !!options.isPageAction?.(point),
    onChange: (state) => {
      // A video whose page has turned away stops; one set to play on its
      // own starts the first time its spread is shown.
      if (playing && !state.pages.includes(playing.page)) stopVideo();
      scheduleAutoplay();
      focus = state.pages;
      settled = state.pages;
      turning = false;
      // At rest: the pages the turn carried past are let go.
      sweep = [];
      run = null;
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
  scheduleAutoplay();
  // Debugging (`__postextFolioPreserve`, as for the renderer): the videos.
  if ((globalThis as { __postextFolioPreserve?: boolean }).__postextFolioPreserve) {
    (globalThis as { __postextFolioVideos?: unknown }).__postextFolioVideos = {
      playing: () => playing,
      autoplayed,
      spots: (i: number) => spotsOf(i),
      state: () => viewer.state,
      turning: () => turning,
    };
  }

  // Space plays or pauses the first video on the spread on show.
  viewer.element.addEventListener("keydown", (event) => {
    if (event.target !== viewer.element || (event.key !== " " && event.key !== "Enter") || options.videos === false) return;
    const on = viewer.state.pages;
    if (playing && on.includes(playing.page)) togglePlaying();
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
    toggleVideoAt,
    stopVideo: () => stopVideo(),
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
    setDocument(next: VDTDocument, opts: { at?: number; repaint?: boolean; appearance?: FolioAppearance } = {}) {
      if (opts.appearance) hostAppearance = { ...hostAppearance, ...opts.appearance };
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
        run = null;
      }
      refresh(around(viewer.state));
      followVideo();
      scheduleAutoplay();
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
      clearTimeout(autoTimer);
      stopVideo();
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
