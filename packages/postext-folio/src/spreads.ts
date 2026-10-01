/** A spread as page indexes: [verso, recto], null where the book has no
 *  page (left of a first recto, right of a last verso). */
export type Spread = [number | null, number | null];

/**
 * The spreads of `count` pages. A verso (even page number) faces the recto
 * after it, so a book whose first page is a recto — page 1, or a chapter
 * continued after an even number of pages — opens on that page alone, and
 * one whose first page is a verso fills both sides of its first spread.
 * A right-bound book pairs its pages the same way; only the viewer mirrors
 * them.
 */
export function spreadsOf(count: number, firstPageRecto = true): Spread[] {
  const spreads: Spread[] = [];
  let i = 0;
  if (count > 0 && firstPageRecto) spreads.push([null, i++]);
  for (; i < count; i += 2) spreads.push([i, i + 1 < count ? i + 1 : null]);
  return spreads;
}

/** The spread that shows page `index`. */
export function spreadOfPage(spreads: readonly Spread[], index: number): number {
  return Math.max(0, spreads.findIndex((s) => s[0] === index || s[1] === index));
}
