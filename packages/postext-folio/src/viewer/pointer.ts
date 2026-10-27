// The folio viewer's presses on the pages: taken by hand, a click, a swipe,
// and where a point lies on a page (#1276: split out of viewer.ts).
import { CLICK_SLOP, SWIPE } from './constants.js';
import type { FolioPagePoint, FolioOptions } from './types.js';
import type { FolioViewerState } from './state.js';

/** What createFolioPointer takes from createFolio. */
export interface FolioPointerDeps {
  options: FolioOptions;
  root: HTMLDivElement;
  spreadEl: HTMLDivElement;
  rtl: () => boolean;
  singleGl: () => boolean;
  go: (index: number) => void;
  heldAt: (event: { clientX: number; clientY: number; pointerType?: string; }) => { x: number; y: number; };
  scheduleDetail: (delay: number) => void;
  releaseLens: () => void;
  vs: FolioViewerState;
}

export function createFolioPointer(deps: FolioPointerDeps) {
  const {
    options, root, spreadEl, rtl, singleGl, go, heldAt, scheduleDetail, releaseLens, vs
  } = deps;
  /** A press on a page: taken by hand (the WebGL book, hit in 3D, since
   *  the tilted book does not lie over the DOM spread), or remembered as a
   *  possible click. True when the stage's swipe should not hear it. */
  function onPage(event: PointerEvent): boolean {
    if (event.button !== 0 || vs.holding) return false;
    const target = event.target as Element;
    if (target.closest(".postext-folio-nav")) return false;
    if (vs.flipper ? !vs.flipper.hit(event) : !target.closest(".postext-folio-spread")) return false;
    vs.press = { x: event.clientX, y: event.clientY };
    // Where it was pressed, read before the hand lifts the leaf.
    vs.pressPoint = options.onPageClick ? pageAt(event) : null;
    if (singleGl()) {
      decide(event);
      return true;
    }
    if (!vs.flipper?.grab(event)) return false;
    event.preventDefault();
    hold(event, vs.press);
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
    vs.swipe = null;
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
      if (!vs.flipper?.grab(down)) return;
      hold(down, start);
      vs.flipper.drag(e);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      done();
      vs.press = null;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.hypot(dx, dy) < CLICK_SLOP) {
        if (!pageClick()) go(vs.current + 1);
      } else if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) && Math.sign(dx) === -toSpine) go(vs.current - 1);
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
      else vs.flipper?.drag(e);
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
      vs.holding = null;
      vs.press = null;
      // A click that acts on the page (a video) lets the leaf fall back.
      vs.flipper?.release(click && !pageClick());
    };
    window.addEventListener("pointermove", onMove);
    // Captured, so the stage's swipe does not hear the hold's release.
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", onBlur);
    vs.holding = end;
    vs.swipe = null;
    spreadEl.classList.add("is-held");
    try {
      spreadEl.setPointerCapture(id);
    } catch {
      // The window listeners carry the hold without it.
    }
  }
  root.addEventListener("pointerup", (event) => {
    if (vs.holding || singleGl() || vs.interaction !== "hand") return;
    const start = vs.press;
    vs.press = null;
    const click = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP;
    if (!click) return;
    if (pageClick()) {
      vs.swipe = null;
      return;
    }
    // A click on the recto turns forward, on the verso back (pages already
    // in the air: it joins them).
    if (vs.flipper) {
      const side = vs.flipper.hit(event);
      if (!side) return;
      vs.swipe = null;
      return go(vs.current + (vs.single ? 1 : side));
    }
    if (!(event.target as Element).closest(".postext-folio-page:not(.is-empty)")) return;
    const rect = spreadEl.getBoundingClientRect();
    vs.swipe = null;
    if (vs.single) go(vs.current + 1);
    else go(vs.current + ((event.clientX > rect.left + rect.width / 2) !== rtl() ? 1 : -1));
  });

  /** A click at the point pressed: the host's to act on (true), or the
   *  page's to turn. */
  function pageClick(): boolean {
    const point = vs.pressPoint;
    vs.pressPoint = null;
    return !!point && !!options.onPageClick?.(point);
  }

  /** The page index in slot `side` (0 the verso, 1 the recto) of the
   *  spread on show. */
  const pageInSlot = (side: 0 | 1): number | null => {
    const s = vs.spreads[vs.shown];
    if (!s) return null;
    return vs.single && !singleGl() ? (s[0] ?? s[1]) : s[side];
  };

  function pageAt(event: { clientX: number; clientY: number }): FolioPagePoint | null {
    if (vs.flipper) {
      const hit = vs.flipper.pagePoint(event);
      if (!hit) return null;
      const page = pageInSlot(hit.side);
      return page === null || page === undefined ? null : { page, x: hit.x, y: hit.y };
    }
    // The DOM spread: its pages in slot order (`render`), whatever side
    // the layout puts them on (a right-bound book runs right to left, so
    // its verso stands on the right); each is found by its own box.
    const els = [...spreadEl.children] as HTMLElement[];
    for (let k = 0; k < els.length; k++) {
      const r = els[k].getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) continue;
      const side = (els.length === 1 ? 1 : k) as 0 | 1;
      const page = els.length === 1 ? pageInSlot(0) : pageInSlot(side);
      if (page === null || page === undefined) return null;
      return { page, x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height };
    }
    return null;
  }

  /** The pointer is the host's to select with (select mode, and under the
   *  glass in magnify mode, #543). */
  function leftToHost(): boolean {
    return vs.interaction === "select" || vs.interaction === "magnify";
  }

  /** The page point a pointer aims at: under it, or in magnify mode under
   *  the glass's centre (#543). */
  function aimedPageAt(event: { clientX: number; clientY: number; pointerType?: string }): FolioPagePoint | null {
    if (vs.interaction !== "magnify") return pageAt(event);
    const at = heldAt(event);
    return pageAt({ clientX: at.x, clientY: at.y });
  }

  function pointOnScreen(point: FolioPagePoint): { x: number; y: number } | null {
    const s = vs.spreads[vs.shown];
    if (!s) return null;
    const found = pageInSlot(1) === point.page ? 1 : pageInSlot(0) === point.page ? 0 : -1;
    if (found < 0) return null;
    const side = found as 0 | 1;
    if (vs.flipper) return vs.flipper.screenPoint(side, point.x, point.y);
    const els = [...spreadEl.children] as HTMLElement[];
    const el = els.length === 1 ? els[0] : els[side];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + point.x * r.width, y: r.top + point.y * r.height };
  }

  function applyInteraction() {
    root.classList.toggle("is-orbit", vs.interaction === "orbit");
    root.classList.toggle("is-select", vs.interaction === "select");
    root.classList.toggle("is-magnify", vs.interaction === "magnify");
    if (!leftToHost()) root.classList.remove("is-over-page");
    if (vs.interaction !== "hand") root.classList.remove("is-over-grip");
    if (vs.interaction === "magnify") scheduleDetail(0);
    else releaseLens();
  }
  return {
    onPage, leftToHost, aimedPageAt, pointOnScreen, applyInteraction
  };
}
