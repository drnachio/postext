// Keep the pixels of a composed page a relayout did not change (#857).
//
// A relayout of the chapter hands the canvas a new document; a composed
// page whose frames the engine took from its memo carries the same
// `layoutKey`, and with the same running heads, decoration and paint
// options it paints the same pixels. Those pages keep their bitmaps: an
// edit on one page repaints that page (and the ones its edit moved), not
// every page in view.

import { composedPagePaintKey, type RenderPageOptions, type VDTPage } from 'postext';

export interface PaintedPages {
  /** Whether `page` at `pageIndex` would paint what its canvas holds. */
  same(pageIndex: number, page: VDTPage, opts: RenderPageOptions): boolean;
  /** Record that `page` was painted at `pageIndex` with `opts`. */
  painted(pageIndex: number, page: VDTPage, opts: RenderPageOptions): void;
  /** Forget what page `pageIndex`'s canvas held (its bitmap was freed). */
  forget(pageIndex: number): void;
  /** Forget everything (new canvases, new pixels). */
  clear(): void;
}

const previewIds = new WeakMap<object, number>();
let nextPreviewId = 1;

/** The paint options that change pixels, as a key (a print preview by
 *  identity: it holds colour transforms). */
function optionsKey(opts: RenderPageOptions): string {
  let preview = 0;
  if (opts.printPreview) {
    preview = previewIds.get(opts.printPreview) ?? nextPreviewId++;
    previewIds.set(opts.printPreview, preview);
  }
  return `${opts.scale ?? 1}|${opts.pageNegative ? 1 : 0}|${opts.singleInk ? 1 : 0}|${opts.trim ? 1 : 0}|${preview}`;
}

function signature(page: VDTPage, opts: RenderPageOptions): string | undefined {
  const key = composedPagePaintKey(page);
  return key === undefined ? undefined : `${key}|${optionsKey(opts)}`;
}

export function createPaintedPages(): PaintedPages {
  const byIndex = new Map<number, string>();
  return {
    same(pageIndex, page, opts) {
      const s = signature(page, opts);
      return s !== undefined && byIndex.get(pageIndex) === s;
    },
    painted(pageIndex, page, opts) {
      const s = signature(page, opts);
      if (s === undefined) byIndex.delete(pageIndex);
      else byIndex.set(pageIndex, s);
    },
    forget(pageIndex) {
      byIndex.delete(pageIndex);
    },
    clear() {
      byIndex.clear();
    },
  };
}
