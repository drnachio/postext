/**
 * Scrolls the page to an element, leaving above it the room a native jump
 * leaves under the sticky bar (#654).
 *
 * It moves the window itself and never calls `scrollIntoView`: a frame runs
 * one smooth `scrollIntoView` at a time, and any other scripted scroll in the
 * frame (a contents list keeping its active entry in view) cancels it, which
 * left the page a few hundred pixels from where it started.
 *
 * A short hop is animated. A long one, or any hop for a reader who asked for
 * less motion, is immediate: on a page hundreds of screens tall an animated
 * jump is a blur that tells the reader nothing.
 */
const SMOOTH_SCREENS = 3;

export function scrollToAnchor(el: Element): void {
  // What a native jump leaves above the target: the page's scroll padding
  // plus the target's own scroll margin.
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - padding - margin);
  const far = Math.abs(top - window.scrollY) > window.innerHeight * SMOOTH_SCREENS;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: far || still ? "instant" : "smooth" });
}

/** Runs `done` once the page has stopped scrolling. `scrollend` where the
 *  browser has it; otherwise, and as a guard, when no scroll event has come
 *  for a moment. Returns a function that cancels the wait. */
export function whenScrollSettles(done: () => void, quietMs = 140): () => void {
  let timer = window.setTimeout(finish, quietMs);
  function finish() {
    cancel();
    done();
  }
  function onScroll() {
    window.clearTimeout(timer);
    timer = window.setTimeout(finish, quietMs);
  }
  function cancel() {
    window.clearTimeout(timer);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("scrollend", finish);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scrollend", finish);
  return cancel;
}
