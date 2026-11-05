// A chapter style (`config.chapterStyles`) edited with the Design panel:
// the panel shows the style merged over the book's settings and every
// write it makes is kept as the style's override of them — what differs
// from the book, nothing more — the book's page settings (trim, dpi, cut
// lines, binding) left out, as the engine ignores them in a style.

import { chapterConfig, leastConfigOverride, stripConfigDefaults, type ChapterStyleConfig, type ConfigOverride, type PostextConfig } from 'postext';

const BOOK_PAGE_KEYS = ['sizePreset', 'width', 'height', 'dpi', 'cutLines', 'binding'];

/** The settings the panel shows while it edits style `id` of `book`. */
export function chapterStyleView(book: PostextConfig, id: string): PostextConfig {
  return chapterConfig(book, id);
}

/** `book` with style `id` changed so that, merged over the book, it reads
 *  `after` (the settings the panel wrote, over the view it showed). */
export function writeChapterStyle(book: PostextConfig, id: string, after: PostextConfig): PostextConfig {
  const { chapterStyles: styles = [], ...bookRest } = book;
  const { chapterStyles: _ignored, ...afterRest } = after;
  void _ignored;
  const override: ConfigOverride = leastConfigOverride(bookRest as PostextConfig, afterRest as PostextConfig, stripConfigDefaults);
  delete override.chapterStyles;
  if (override.page && typeof override.page === 'object') {
    const page = { ...(override.page as Record<string, unknown>) };
    for (const key of BOOK_PAGE_KEYS) delete page[key];
    if (Object.keys(page).length > 0) override.page = page;
    else delete override.page;
  }
  return { ...book, chapterStyles: styles.map((s) => (s.id === id ? { ...s, config: override } : s)) };
}

/** A new, empty chapter style with an id the book does not use yet. */
export function newChapterStyle(styles: readonly ChapterStyleConfig[], name: string): ChapterStyleConfig {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';
  let id = base;
  for (let n = 2; styles.some((s) => s.id === id); n++) id = `${base}-${n}`;
  return { id, name, config: {} };
}
