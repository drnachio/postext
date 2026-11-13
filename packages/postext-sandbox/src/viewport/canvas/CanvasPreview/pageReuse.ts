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
  /** Whether `page` at `pageIndex` would paint what its canvas holds.
   *  `through` is what the page shows through its die-cut holes (#1567,
   *  `throughKeyOf`): `''` for none, `undefined` when it cannot be keyed
   *  (the page then always repaints). */
  same(pageIndex: number, page: VDTPage, opts: RenderPageOptions, through?: string): boolean;
  /** Record that `page` was painted at `pageIndex` with `opts`. */
  painted(pageIndex: number, page: VDTPage, opts: RenderPageOptions, through?: string): void;
  /** Forget what page `pageIndex`'s canvas held (its bitmap was freed). */
  forget(pageIndex: number): void;
  /** Forget everything (new canvases, new pixels). */
  clear(): void;
}

const previewIds = new WeakMap<object, number>();
let nextPreviewId = 1;

/** The paint options that change pixels, as a key (a print preview by
 *  identity: it holds colour transforms; the form fields' number style and
 *  the special inks' view by value). */
export function optionsKey(opts: RenderPageOptions): string {
  let preview = 0;
  if (opts.printPreview) {
    preview = previewIds.get(opts.printPreview) ?? nextPreviewId++;
    previewIds.set(opts.printPreview, preview);
  }
  return `${opts.scale ?? 1}|${opts.pageNegative ? 1 : 0}|${opts.singleInk ? 1 : 0}|${opts.trim ? 1 : 0}|${preview}|${opts.forms ? JSON.stringify(opts.forms) : ''}|${opts.finishes ?? 'flat'}`;
}

/** `extra` holds the see-through key when the caller passed one (an
 *  explicit `undefined` means a key that cannot be made). */
function signature(page: VDTPage, opts: RenderPageOptions, extra: readonly (string | undefined)[]): string | undefined {
  const key = composedPagePaintKey(page);
  const through = extra.length === 0 ? '' : extra[0];
  if (key === undefined || through === undefined) return undefined;
  return `${key}|${optionsKey(opts)}${through ? `|${through}` : ''}`;
}

export function createPaintedPages(): PaintedPages {
  const byIndex = new Map<number, string>();
  return {
    same(pageIndex, page, opts, ...through) {
      const s = signature(page, opts, through);
      return s !== undefined && byIndex.get(pageIndex) === s;
    },
    painted(pageIndex, page, opts, ...through) {
      const s = signature(page, opts, through);
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

/** The page of `doc` a canvas slot at `index` paints, or `undefined` when
 *  the slot outlived its document: an observer callback for the whole
 *  book can land after the canvas switched to a shorter chapter (#1435). */
export function pageToPaint(doc: { pages: readonly VDTPage[] }, index: number): VDTPage | undefined {
  return Number.isInteger(index) && index >= 0 ? doc.pages[index] : undefined;
}
