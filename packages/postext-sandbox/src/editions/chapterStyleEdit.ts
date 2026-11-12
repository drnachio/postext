// A chapter style (`config.chapterStyles`) edited with the Design panel:
// the panel shows the style merged over the book's settings and every
// write it makes is kept as the style's override of them — what differs
// from the book, nothing more — the settings the whole book shares (its
// trim, dpi, cut lines and binding, its language, fonts, print and
// viewers: `BOOK_WIDE_KEYS`, `BOOK_PAGE_KEYS`) left out, as the engine
// ignores them in a style.

import { BOOK_PAGE_KEYS, BOOK_WIDE_KEYS, chapterConfig, leastConfigOverride, stripConfigDefaults, type ChapterStyleConfig, type ConfigOverride, type PostextConfig } from 'postext';

/** The settings the panel shows while it edits style `id` of `book`. */
export function chapterStyleView(book: PostextConfig, id: string): PostextConfig {
  return chapterConfig(book, id);
}

/** `book` with style `id` changed so that, merged over the book, it reads
 *  `after` (the settings the panel wrote, over the view it showed). A style
 *  cannot hold a setting the whole book shares: with `toBook` (the Design
 *  panel, the agent tools) a change to one is the book's change; without it
 *  (a template kept as a style) the book keeps its own. */
export function writeChapterStyle(book: PostextConfig, id: string, after: PostextConfig, { toBook = false }: { toBook?: boolean } = {}): PostextConfig {
  const { chapterStyles: styles = [], ...bookRest } = book;
  const { chapterStyles: _ignored, ...afterRest } = after;
  void _ignored;
  const override: ConfigOverride = leastConfigOverride(bookRest as PostextConfig, afterRest as PostextConfig, stripConfigDefaults);
  const out: Record<string, unknown> = { ...book };
  const written = afterRest as Record<string, unknown>;
  for (const key of BOOK_WIDE_KEYS) {
    if (toBook && key !== 'chapterStyles' && key in override) {
      if (written[key] === undefined) delete out[key];
      else out[key] = written[key];
    }
    delete override[key];
  }
  if (override.page && typeof override.page === 'object') {
    const page = { ...(override.page as Record<string, unknown>) };
    const bookPage: Record<string, unknown> = { ...(book.page ?? {}) };
    const writtenPage = (after.page ?? {}) as Record<string, unknown>;
    let moved = false;
    for (const key of BOOK_PAGE_KEYS) {
      if (!(key in page)) continue;
      if (!toBook) {
        delete page[key];
        continue;
      }
      if (writtenPage[key] === undefined) delete bookPage[key];
      else bookPage[key] = writtenPage[key];
      delete page[key];
      moved = true;
    }
    if (moved) out.page = bookPage;
    if (Object.keys(page).length > 0) override.page = page;
    else delete override.page;
  }
  return { ...(out as PostextConfig), chapterStyles: styles.map((s) => (s.id === id ? { ...s, config: override } : s)) };
}

/** A new, empty chapter style with an id the book does not use yet. */
export function newChapterStyle(styles: readonly ChapterStyleConfig[], name: string): ChapterStyleConfig {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';
  let id = base;
  for (let n = 2; styles.some((s) => s.id === id); n++) id = `${base}-${n}`;
  return { id, name, config: {} };
}
