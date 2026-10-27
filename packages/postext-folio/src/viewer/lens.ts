// The folio viewer's magnifying glass (#527): where it is held, its zoom and
// the sharper paintings it asks for (#1276: split out of viewer.ts).
import { clamp, ZOOM_MIN, ZOOM_MAX, LENS_PX_PER_MM, sourceOf, SWIPE } from './constants.js';
import type { PageSource } from '../pageFlip.js';
import type { FolioOptions } from './types.js';
import type { Spread } from '../spreads.js';
import type { FolioViewerState, FolioViewerLate } from './state.js';

/** What createFolioLens takes from createFolio. */
export interface FolioLensDeps {
  options: FolioOptions;
  root: HTMLDivElement;
  spreadEl: HTMLDivElement;
  rtl: () => boolean;
  pagesOf: (s: Spread | undefined) => number[];
  aspect: () => number;
  go: (index: number) => void;
  vs: FolioViewerState;
  vlate: FolioViewerLate;
}

export function createFolioLens(deps: FolioLensDeps) {
  const {
    options, root, spreadEl, rtl, pagesOf, aspect, go, vs, vlate
  } = deps;
  // ── The magnifying glass (#527) ──
  /** Where the glass is held (client px), when it is. */
  vs.lensAt = null;
  vs.lensZoom = options.magnifier?.zoom ? clamp(options.magnifier.zoom, ZOOM_MIN, ZOOM_MAX) : null;
  /** Page source → its sharper painting, and the width each was asked
   *  for at. */
  vs.details = new Map<PageSource, PageSource>();
  vs.detailAsked = new Map<PageSource, number>();
  vs.detailTimer = 0;

  function zoomNow(): number {
    if (vs.lensZoom) return vs.lensZoom;
    const perMm = vs.slot.width / (vs.appearance.pageWidthMm ?? 150);
    return perMm > 0 ? clamp(LENS_PX_PER_MM / perMm, 2, 8) : 3;
  }
  function lensOf(at: { x: number; y: number }) {
    const box = root.getBoundingClientRect();
    const diameter = options.magnifier?.diameter ?? clamp(0.42 * Math.min(box.width, box.height), 180, 520);
    const rim = clamp(diameter * 0.045, 8, 18);
    return { x: at.x, y: at.y, radius: diameter / 2 - rim, rim, zoom: zoomNow() };
  }
  /** Where the glass is held for a pointer: under a mouse or a pen, but
   *  a finger holds it above itself, where it does not hide it. */
  function heldAt(event: { clientX: number; clientY: number; pointerType?: string }): { x: number; y: number } {
    if (event.pointerType !== "touch") return { x: event.clientX, y: event.clientY };
    const lens = lensOf({ x: event.clientX, y: event.clientY });
    return { x: lens.x, y: lens.y - (lens.radius + lens.rim + 28) };
  }
  function placeLens(event: PointerEvent) {
    if (!vs.flipper) return;
    const lens = lensOf(heldAt(event));
    vs.lensAt = { x: lens.x, y: lens.y };
    root.classList.add("is-magnifying");
    vs.flipper.setLens(lens);
  }
  /** Without a pointer to hold it (the keyboard, a host), the glass comes
   *  up over the spread's centre. */
  function raiseLens() {
    if (vs.lensAt) return;
    const r = spreadEl.getBoundingClientRect();
    vs.lensAt = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    root.classList.add("is-magnifying");
  }
  function hideLens() {
    if (!vs.lensAt) return;
    vs.lensAt = null;
    root.classList.remove("is-magnifying");
    vs.flipper?.setLens(null);
  }
  function zoomBy(factor: number) {
    vs.lensZoom = clamp(zoomNow() * factor, ZOOM_MIN, ZOOM_MAX);
    if (vs.lensAt) vs.flipper?.setLens(lensOf(vs.lensAt));
    scheduleDetail(250);
  }
  root.addEventListener("pointermove", (event) => {
    if (vs.interaction !== "magnify" || vs.holding) return;
    if (event.pointerType === "touch" && !event.buttons) return;
    placeLens(event);
  });
  root.addEventListener("pointerdown", (event) => {
    if (vs.interaction !== "magnify" || event.button !== 0) return;
    if ((event.target as Element).closest(".postext-folio-nav")) return;
    placeLens(event);
  });
  for (const type of ["pointerup", "pointercancel"] as const) {
    root.addEventListener(type, (event) => {
      if (event.pointerType === "touch") hideLens();
    });
  }
  root.addEventListener(
    "wheel",
    (event) => {
      if (vs.interaction !== "magnify" || !vs.flipper) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomBy(Math.exp(-delta * 0.0015));
    },
    { passive: false },
  );

  function scheduleDetail(delay: number) {
    if (vs.interaction !== "magnify" || !options.detail) return;
    clearTimeout(vs.detailTimer);
    vs.detailTimer = window.setTimeout(askDetail, delay);
  }

  /** Asks the host for the open pages painted sharp enough for the glass
   *  (a texel for each screen pixel at its centre, within the largest
   *  texture the book shows), and lets go of the others' paintings. */
  function askDetail() {
    const host = options.detail;
    const flip = vs.flipper;
    if (vs.interaction !== "magnify" || !host || !flip || !vs.slot.deviceWidth || vs.disposed) return;
    const cap = flip.maxTextureSize;
    const want = Math.max(vs.slot.deviceWidth, Math.min(cap, Math.floor(cap * aspect()), Math.ceil((vs.slot.deviceWidth * zoomNow()) / 256) * 256));
    const on = new Map<PageSource, number>();
    for (const i of new Set([...pagesOf(vs.spreads[vs.shown]), ...pagesOf(vs.spreads[vs.current])])) {
      const src = sourceOf(vs.pages[i]);
      if (src) on.set(src, i);
    }
    for (const src of [...vs.details.keys()]) if (!on.has(src)) vs.details.delete(src);
    for (const src of [...vs.detailAsked.keys()]) if (!on.has(src)) vs.detailAsked.delete(src);
    flip.setDetail(vs.details);
    for (const [src, i] of on) {
      if ((vs.detailAsked.get(src) ?? 0) >= want) continue;
      vs.detailAsked.set(src, want);
      void Promise.resolve(host.paint(i, want)).then(
        (painting) => {
          if (!painting || vs.flipper !== flip || vs.interaction !== "magnify" || sourceOf(vs.pages[i]) !== src) return;
          vs.details.set(src, painting);
          flip.setDetail(vs.details);
        },
        () => vs.detailAsked.delete(src),
      );
    }
  }

  /** Puts the glass away and lets go of its paintings. */
  function releaseLens() {
    hideLens();
    clearTimeout(vs.detailTimer);
    if (!vs.details.size && !vs.detailAsked.size) return;
    vs.details = new Map();
    vs.detailAsked = new Map();
    vs.flipper?.setDetail(vs.details);
    options.detail?.release?.();
  }
  root.addEventListener("pointerdown", (event) => {
    // Only the hand takes pages, swipes and clicks them over.
    if (vs.interaction !== "hand") return;
    if (vlate.onPage(event)) return;
    if (event.pointerType !== "mouse") vs.swipe = { x: event.clientX, y: event.clientY };
  });
  root.addEventListener("pointerup", (event) => {
    const start = vs.swipe;
    vs.swipe = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(vs.current + ((dx < 0) !== rtl() ? 1 : -1));
  });
  return {
    zoomNow, lensOf, heldAt, raiseLens, hideLens, zoomBy, scheduleDetail, releaseLens
  };
}
