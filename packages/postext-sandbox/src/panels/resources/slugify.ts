// Slug helpers for auto-suggesting resource ids from a filename or caption.

/** Convert arbitrary text to a lowercase, hyphen-separated slug.
 *  Strips diacritics, keeps the letters and digits of every script (a
 *  Chinese caption gives a Chinese id, #181), collapses anything else to
 *  single hyphens, and trims leading/trailing hyphens. Returns '' for
 *  empty/symbol-only input. Kana keep their voicing marks (dakuten and
 *  handakuten are part of the letter: がっこう stays がっこう, never
 *  かっこう), and half-width katakana come out full width. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/(?![\u3099\u309a])\p{M}/gu, '') // strip combining marks, not the kana voicing marks
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
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
