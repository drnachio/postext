/** The showcase books in shelf order: the books without a `shelfOrder`
 *  keep the index order (by id) and come first, the others follow by it
 *  (a stable sort). */
export function shelfOrder<T extends { shelfOrder?: number }>(presets: readonly T[]): T[] {
  return presets
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.shelfOrder ?? 0) - (b.p.shelfOrder ?? 0) || a.i - b.i)
    .map(({ p }) => p);
}
