// The folio viewer's turning: page videos, the render of a spread, go and
// jump, the flipper's set-up and the rebuild (#1276: split out of viewer.ts).
import { sourceOf, rgbOf, SINGLE_BELOW, CHEVRON } from './constants.js';
import type { FolioPageVideo, FolioOptions } from './types.js';
import { canFlip, PageFlipper, type SpreadSrc, type FlipAppearance } from '../pageFlip.js';
import { type Spread, spreadsOf, spreadOfPage } from '../spreads.js';
import type { FolioViewerState, FolioViewerLate } from './state.js';

/** What createFolioTurning takes from createFolio. */
export interface FolioTurningDeps {
  options: FolioOptions;
  animate: boolean;
  root: HTMLDivElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  spreadEl: HTMLDivElement;
  count: HTMLParagraphElement;
  rtl: () => boolean;
  pagesOf: (s: Spread | undefined) => number[];
  singleGl: () => boolean;
  bookOf: () => SpreadSrc[];
  flipAppearance: () => FlipAppearance;
  fit: () => void;
  pageEl: (i: number | null, slot: 0 | 1) => HTMLDivElement;
  vs: FolioViewerState;
  vlate: FolioViewerLate;
}

export function createFolioTurning(deps: FolioTurningDeps) {
  const {
    options, animate, root, prevBtn, nextBtn, spreadEl, count, rtl, pagesOf, singleGl, bookOf,
    flipAppearance, fit, pageEl, vs, vlate
  } = deps;
  /** Shows the page videos: on the WebGL book, drawn by the leaves that
   *  carry their pages; on the DOM spread, laid over the pages. */
  function applyVideo() {
    vs.flipper?.setVideos(vs.pageVideos.map((v) => ({ src: sourceOf(vs.pages[v.page]), element: v.element, frame: v })));
    placeDomVideo();
  }

  /** Takes a video element laid over a DOM page off it. */
  const unplace = (v: FolioPageVideo) => {
    if (!v.element.classList.contains("postext-folio-video")) return;
    v.element.classList.remove("postext-folio-video");
    v.element.remove();
  };

  /** The DOM spread (no WebGL): each video element over its page, mapped
   *  onto the picture's place by a transform (it may lie turned). */
  function placeDomVideo() {
    if (vs.flipper) {
      for (const v of vs.pageVideos) unplace(v);
      return;
    }
    const els = [...spreadEl.children] as HTMLElement[];
    const s = vs.spreads[vs.shown] ?? [null, null];
    const slots = vs.single && !singleGl() ? [s[0] ?? s[1]] : s;
    for (const v of vs.pageVideos) {
      const at = slots.indexOf(v.page);
      const el = at >= 0 ? els[at] : undefined;
      if (!el) {
        v.element.remove();
        continue;
      }
      const w = el.clientWidth;
      const h = el.clientHeight;
      const unit = 100;
      v.element.classList.add("postext-folio-video");
      Object.assign(v.element.style, {
        width: `${unit}px`,
        height: `${unit}px`,
        transform: `matrix(${(v.across.x * w) / unit}, ${(v.across.y * h) / unit}, ${(v.down.x * w) / unit}, ${(v.down.y * h) / unit}, ${v.origin.x * w}, ${v.origin.y * h})`,
      });
      if (v.element.parentElement !== el) el.append(v.element);
    }
  }

  function render() {
    const s = vs.spreads[vs.shown] ?? [null, null];
    const slots = vs.single && !singleGl() ? [s[0] ?? s[1]] : s;
    spreadEl.replaceChildren(...slots.map((i, side) => pageEl(i, side as 0 | 1)));
    spreadEl.classList.toggle("is-solo", vs.single && !singleGl());
    spreadEl.classList.toggle("is-by-hand", !!vs.flipper);
    // The canvas draws the book, still or turning; the DOM pages stay as
    // the textures' sources and the pages' text alternatives.
    spreadEl.classList.toggle("is-gl", !!vs.flipper);
    const on = pagesOf(vs.spreads[vs.current]);
    count.textContent = on.length ? vs.labels.count(on, vs.pages.length) : "";
    prevBtn.disabled = vs.current <= 0;
    nextBtn.disabled = vs.current >= vs.spreads.length - 1;
    placeDomVideo();
    // The settled spread, drawn at rest.
    vs.flipper?.clear();
    vlate.scheduleDetail(120);
  }

  function settle(index: number) {
    vs.shown = index;
    render();
    options.onChange?.({ spread: index, pages: pagesOf(vs.spreads[index]) });
  }

  function go(index: number) {
    const to = Math.max(0, Math.min(vs.spreads.length - 1, index));
    if (to === vs.current && to === vs.shown) return;
    vs.current = to;
    options.onTarget?.({ spread: to, pages: pagesOf(vs.spreads[to]) });
    if (vs.flipper) {
      vs.flipper.go(to);
      // The count and buttons follow the hand at once.
      count.textContent = vs.labels.count(pagesOf(vs.spreads[to]), vs.pages.length);
      prevBtn.disabled = to <= 0;
      nextBtn.disabled = to >= vs.spreads.length - 1;
    } else settle(to);
  }

  /** Opens spread `index` at once, no leaf turning. */
  function jump(index: number) {
    const to = Math.max(0, Math.min(vs.spreads.length - 1, index));
    if (to === vs.current && to === vs.shown) return;
    vs.current = to;
    options.onTarget?.({ spread: to, pages: pagesOf(vs.spreads[to]) });
    vs.flipper?.setBook(bookOf(), to);
    settle(to);
  }

  function setUpFlipper() {
    vs.flipper?.dispose();
    vs.flipper = null;
    vs.flipCanvas?.remove();
    vs.flipCanvas = null;
    if (!animate || vs.spreads.length < 2 || !canFlip()) return;
    vs.flipCanvas = document.createElement("canvas");
    vs.flipCanvas.className = "postext-folio-flip";
    vs.flipCanvas.setAttribute("aria-hidden", "true");
    root.append(vs.flipCanvas);
    const initial = flipAppearance();
    vs.appearanceKey = JSON.stringify(initial);
    vs.flipper = new PageFlipper(
      vs.flipCanvas,
      spreadEl,
      bookOf(),
      vs.shown,
      settle,
      (i) => {
        vs.current = i;
        options.onTarget?.({ spread: i, pages: pagesOf(vs.spreads[i]) });
        count.textContent = vs.labels.count(pagesOf(vs.spreads[i]), vs.pages.length);
      },
      vs.binding,
      // One page at a time the spine is the box's edge: the leaf cannot be
      // carried past halfway, so a shorter pull turns it.
      { persistent: true, turnAt: vs.single ? 0.2 : 0.5, appearance: initial },
    );
    const rgb = rgbOf(vs.paper);
    if (rgb) vs.flipper.setPaper(...rgb);
    if (vs.pageVideos.length) applyVideo();
    // A new book: its glass and paintings start afresh.
    vs.details = new Map();
    vs.detailAsked = new Map();
    if (vs.lensAt) vs.flipper.setLens(vlate.lensOf(vs.lensAt));
  }

  /** Lays the book out again: spreads, mode, flipper. */
  function rebuild(atPage: number) {
    vs.single = vs.mode === "single" || (vs.mode === "auto" && root.clientWidth > 0 && root.clientWidth < SINGLE_BELOW);
    vs.spreads = vs.single ? vs.pages.map((_, i) => [null, i] as Spread) : spreadsOf(vs.pages.length, vs.firstPageRecto);
    vs.current = vs.shown = spreadOfPage(vs.spreads, atPage);
    root.dir = rtl() ? "rtl" : "ltr";
    root.style.setProperty("--postext-folio-paper", vs.paper);
    root.classList.toggle("is-single", vs.single);
    prevBtn.innerHTML = CHEVRON(rtl() ? "right" : "left");
    nextBtn.innerHTML = CHEVRON(rtl() ? "left" : "right");
    setUpFlipper();
    fit();
    render();
  }

  function applyLabels() {
    root.setAttribute("aria-label", vs.labels.region);
    prevBtn.setAttribute("aria-label", vs.labels.prev);
    nextBtn.setAttribute("aria-label", vs.labels.next);
  }
  return {
    applyVideo, unplace, placeDomVideo, render, go, jump, rebuild, applyLabels
  };
}
