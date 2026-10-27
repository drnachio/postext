import type { VDTDocument } from 'postext';
import { composedPageScale, isComposedLeaf } from './pageGeometry.js';

/** Class of the box a composed page is shown in at its scale: as large as
 *  the page scaled, clipping the page's own (unscaled) layout box. */
export const COMPOSED_FIT_CLASS = 'pt-page-fit';
/** Class of the box a composed page scrolls down in, in the paged view. */
export const COMPOSED_SCROLL_CLASS = 'pt-page-scroll';

export interface ComposedFitOptions {
  mode: 'single' | 'multi';
  /** The width a composed page is shown at, px (never wider than its
   *  leaf): the viewer's. */
  fitWidthPx: number;
  /** Height of a page of the paged view, px: a composed page taller than
   *  that scrolls down in a box this high. */
  unitHeightPx: number;
  /** Room left under a composed page in the vertical scroll, px: a leaf
   *  is as tall as it is, and the next page would touch it. */
  gapPx: number;
}

/** Show the composed pages of `doc` (laid out on the print leaf, #1045)
 *  whole on the screen: each scaled to `fitWidthPx` in a box of its scaled
 *  size, and in the paged view set in a box a page high that scrolls down
 *  the composition, so a page taller than the screen is never cut.
 *
 *  The scale is a transform, not CSS `zoom`: Chrome clips the lines of a
 *  vertical page (`writing-mode: vertical-rl`, a turned flow) under a
 *  zoom. The viewer's hit-testing reads rectangles, which the transform
 *  scales too. Run after every render: a patch keeps the page elements, a
 *  rebuild makes new ones, and the scale follows the viewport while the
 *  leaf does not. */
export function fitComposedPages(scroll: HTMLElement, doc: VDTDocument, opts: ComposedFitOptions): void {
  const els = new Map<number, HTMLElement>();
  scroll.querySelectorAll<HTMLElement>('.pt-page[data-page]').forEach((el) => els.set(Number(el.dataset.page), el));
  for (const page of doc.pages) {
    const el = els.get(page.index);
    if (!el || !isComposedLeaf(page)) continue;
    const k = composedPageScale(page, opts.fitWidthPx) ?? 1;
    const shownWidth = page.width * k;
    const shownHeight = page.height * k;
    el.style.transform = k !== 1 ? `scale(${k})` : '';
    el.style.transformOrigin = '0 0';
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    const fit = parentWith(el, COMPOSED_FIT_CLASS) ?? wrap(el, COMPOSED_FIT_CLASS);
    fit.style.cssText = `position:relative;flex-shrink:0;overflow:clip;width:${shownWidth}px;height:${shownHeight}px;` +
      (opts.mode === 'single' ? `margin-bottom:${opts.gapPx}px;` : '');
    const box = parentWith(fit, COMPOSED_SCROLL_CLASS);
    if (opts.mode === 'multi' && shownHeight > opts.unitHeightPx + 0.5) {
      const holder = box ?? wrap(fit, COMPOSED_SCROLL_CLASS);
      holder.style.height = `${Math.floor(opts.unitHeightPx)}px`;
      holder.style.width = `${shownWidth}px`;
    } else if (box) {
      box.replaceWith(fit);
    }
  }
}

function parentWith(el: HTMLElement, cls: string): HTMLElement | null {
  const parent = el.parentElement;
  return parent?.classList.contains(cls) ? parent : null;
}

function wrap(el: HTMLElement, cls: string): HTMLElement {
  const box = el.ownerDocument.createElement('div');
  box.className = cls;
  el.replaceWith(box);
  box.appendChild(el);
  return box;
}
