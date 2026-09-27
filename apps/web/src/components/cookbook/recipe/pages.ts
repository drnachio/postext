import type { PageImage } from "@/lib/cookbook/images";

/** The number a page prints (its folio), else its place in the document. */
export function folio(page: PageImage): string {
  return page.label || String(page.n);
}

/** An image's description (the write-up's note, `PageImage.note`), which
 *  the light table renders once, hidden. */
export const noteId = (page: PageImage) => `cb-pnote-${page.n}`;

/** The attributes every rendering of a page image shares (`alt` aside,
 *  which each `<img>` states itself). */
export function pageImgProps(page: PageImage) {
  return {
    src: page.src,
    width: page.w,
    height: page.h,
    ...(page.lang ? { lang: page.lang } : {}),
    ...(page.note ? { "aria-describedby": noteId(page) } : {}),
  };
}
