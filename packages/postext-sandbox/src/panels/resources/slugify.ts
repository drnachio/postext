// Slug helpers for auto-suggesting resource ids from a filename or caption.

/** Convert arbitrary text to a lowercase, hyphen-separated slug.
 *  Strips diacritics, collapses non-alphanumerics to single hyphens, and
 *  trims leading/trailing hyphens. Returns '' for empty/symbol-only input. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slugify a filename, dropping its extension first. */
export function slugifyFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return slugify(base);
}

/** Ensure `candidate` is unique against `taken`, appending `-2`, `-3`, … when
 *  needed. A blank candidate falls back to `fallback`. */
export function uniqueSlug(candidate: string, taken: Set<string>, fallback = 'resource'): string {
  const base = candidate || fallback;
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
