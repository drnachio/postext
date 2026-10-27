// The page elements of the HTML preview's paged view: the one at the
// leading edge and its siblings (#1276: split out of HtmlPreview/index.tsx).
import { PADDING_PX } from './constants.js';

/** The page element whose leading edge (its left, or its right in a
 *  right-to-left row) sits nearest the scroll's in the paged view. */
export function leadingPageEl(scroll: HTMLElement, rtl: boolean): HTMLElement | null {
  const sRect = scroll.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestDist = Infinity;
  scroll.querySelectorAll<HTMLElement>('.pt-page[data-page]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const dist = rtl ? Math.abs(sRect.right - r.right - PADDING_PX) : Math.abs(r.left - sRect.left - PADDING_PX);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  });
  return best;
}

/** The page element `by` pages after `el` (before it when negative). */
export function siblingPageEl(el: HTMLElement, by: number): HTMLElement | null {
  const index = Number(el.dataset.page) + by;
  return el.closest('.pt-doc')?.querySelector<HTMLElement>(`.pt-page[data-page="${index}"]`) ?? null;
}
