import type { RecipeView } from "../recipe/model";

/** `<PageRef page={3}>the opener</PageRef>`: a link that opens the light
 *  table's lightbox at that page (the light table handles `#page-N`). Its
 *  mark prints the page's folio, the number the reader sees on it. Server
 *  component; the page binds `view`. */
export function PageRef({ view, page, children }: { view?: RecipeView; page: number | string; children?: React.ReactNode }) {
  const n = Number(page);
  const shot = view?.pages.find((p) => p.n === n);
  return (
    <a href={`#page-${n}`} className="cb-pageref">
      {children}
      <span aria-hidden="true" className="cb-pageref-mark">
        p.&nbsp;{shot?.label || n}
      </span>
    </a>
  );
}
