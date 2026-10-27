// The folio viewer's input: the buttons, the keys, the orbit drag and the
// presses on page actions (#1276: split out of viewer.ts).
import type { FolioPagePoint, FolioOptions } from './types.js';
import { CLICK_SLOP } from './constants.js';
import type { FolioViewerState, FolioViewerLate } from './state.js';

/** What createFolioInput takes from createFolio. */
export interface FolioInputDeps {
  options: FolioOptions;
  root: HTMLDivElement;
  prevBtn: HTMLButtonElement;
  nextBtn: HTMLButtonElement;
  rtl: () => boolean;
  go: (index: number) => void;
  vs: FolioViewerState;
  vlate: FolioViewerLate;
}

export function createFolioInput(deps: FolioInputDeps) {
  const {
    options, root, prevBtn, nextBtn, rtl, go, vs, vlate
  } = deps;
  // ── Input ──
  prevBtn.addEventListener("click", () => go(vs.current - 1));
  nextBtn.addEventListener("click", () => go(vs.current + 1));
  root.addEventListener("keydown", (event) => {
    if (event.target !== root) return;
    if (vs.interaction === "magnify" && vs.flipper && (event.key === "+" || event.key === "=" || event.key === "-" || event.key === "Escape")) {
      if (event.key === "Escape") {
        if (!vs.lensAt) return;
        vlate.hideLens();
      } else {
        vlate.raiseLens();
        vlate.zoomBy(event.key === "-" ? 1 / 1.25 : 1.25);
      }
      event.preventDefault();
      return;
    }
    const forward = rtl() ? "ArrowLeft" : "ArrowRight";
    const back = rtl() ? "ArrowRight" : "ArrowLeft";
    if (event.key === back || event.key === "PageUp") go(vs.current - 1);
    else if (event.key === forward || event.key === "PageDown") go(vs.current + 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(vs.spreads.length - 1);
    else return;
    event.preventDefault();
  });
  // Right-drag orbits the view round the book; the view stays where it is
  // left until `resetView()` (the host's button) eases it back.
  root.addEventListener("contextmenu", (event) => {
    if (vs.flipper) event.preventDefault();
  });
  root.addEventListener("pointerdown", (event) => {
    // In orbit mode the left button (one finger, a pen) orbits too.
    const orbits = event.button === 2 || (event.button === 0 && vs.interaction === "orbit");
    if (!orbits || !vs.flipper || vs.holding) return;
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
      vs.flipper?.orbitBy(e.clientX - x, e.clientY - y);
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
    if (event.buttons) return;
    const point = vs.holding ? null : vlate.aimedPageAt(event);
    if (vs.interaction === "select" || vs.interaction === "magnify") root.classList.toggle("is-over-page", !!point);
    if (options.isPageAction) root.classList.toggle("is-over-action", !!point && options.isPageAction(point));
    // Hand mode: the hand shows only where a page can be taken, its
    // outer half (#494).
    root.classList.toggle("is-over-grip", vs.interaction === "hand" && !vs.holding && !!vs.flipper && vs.flipper.hit(event) !== 0);
  });
  // Orbit, select and magnify modes: a click on something a click acts on
  // (a video) acts on it, as in hand mode. The press is taken before the
  // host hears it in select and magnify modes (no caret, no link
  // followed); in orbit mode a drag from it still turns the view.
  let actionPress: { x: number; y: number; id: number; point: FolioPagePoint } | null = null;
  let swallowClick = false;
  root.addEventListener(
    "pointerdown",
    (event) => {
      actionPress = null;
      if (vs.interaction === "hand" || event.button !== 0 || !options.onPageClick || !options.isPageAction) return;
      if ((event.target as Element).closest(".postext-folio-nav")) return;
      const point = vlate.aimedPageAt(event);
      if (!point || !options.isPageAction(point)) return;
      actionPress = { x: event.clientX, y: event.clientY, id: event.pointerId, point };
      if (vlate.leftToHost()) event.stopPropagation();
    },
    true,
  );
  root.addEventListener(
    "pointermove",
    (event) => {
      if (actionPress && vlate.leftToHost() && event.pointerId === actionPress.id) event.stopPropagation();
    },
    true,
  );
  root.addEventListener(
    "pointerup",
    (event) => {
      const press = actionPress;
      if (!press || event.pointerId !== press.id) return;
      actionPress = null;
      if (vlate.leftToHost()) {
        event.stopPropagation();
        swallowClick = true;
      }
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < CLICK_SLOP) options.onPageClick?.(press.point);
    },
    true,
  );
  root.addEventListener(
    "click",
    (event) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.stopPropagation();
    },
    true,
  );
  root.addEventListener("pointerleave", (event) => {
    root.classList.remove("is-over-action", "is-over-grip", "is-over-page");
    if (event.pointerType === "mouse") vlate.hideLens();
  });
  return {
  };
}
