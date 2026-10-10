/**
 * Where the headings of a page that was split live now. A table maps the slug
 * of each new page to the ids the old page gave its headings, separated by
 * spaces; an id that changed with the move is written `old>new` (heading ids
 * hold neither spaces nor `>`). No Node APIs: the browser resolves an old
 * `#anchor` with it.
 */
export type OldAnchorTable = Record<string, string>;

/** The page that holds an old heading id, and the id it has there. */
export function resolveOldAnchor(table: OldAnchorTable, id: string): { slug: string; id: string } | null {
  if (!id) return null;
  for (const [slug, ids] of Object.entries(table)) {
    for (const entry of ids.split(" ")) {
      if (entry === id) return { slug, id };
      if (entry.startsWith(`${id}>`)) return { slug, id: entry.slice(id.length + 1) };
    }
  }
  return null;
}

/** A URL fragment as the id it names (ids hold accents, Arabic and CJK, which
 *  a browser or a link may have percent-encoded). */
export function fragmentId(hash: string): string {
  const raw = hash.replace(/^#/, "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
