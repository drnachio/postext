/**
 * The faces a document's comic pages are lettered in (#559), for hosts
 * that load fonts before a build: the lettering face, every balloon
 * style's own face (the sound-effect face among them) and the cast's. The
 * defaults follow the document language (`Comic Neue`, `Zen Antique` for
 * Japanese, `Bangers` for sound effects…), so a book that never names them
 * still needs them as soon as it has a `:::page`.
 */

import type { PostextConfig } from '../types';
import { presentTag } from '../locale';
import { resolveComicsConfig } from '../defaults/comics';

/** A line that opens a comic block (`:::page`, `:::strip`). */
const COMIC_FENCE_LINE = /^[ \t]*:::(?:page|strip)(?=[\s{]|$)/m;

/** Whether a Markdown text (or any of several, the chapters of a book)
 *  holds a comic page or strip. */
export function markdownHasComics(markdown: string | readonly string[] | undefined): boolean {
  if (markdown === undefined) return false;
  const texts = typeof markdown === 'string' ? [markdown] : markdown;
  return texts.some((t) => COMIC_FENCE_LINE.test(t));
}

/**
 * The families the comic pages of a document letter with: none when the
 * config has no `comics` section and no text given holds a comic block;
 * else the lettering face, each balloon style's and each cast member's
 * (defaults resolved for the document language), first seen first.
 */
export function comicFontFamilies(config: PostextConfig, markdown?: string | readonly string[]): string[] {
  if (!config.comics && !markdownHasComics(markdown)) return [];
  const locale = presentTag(config.locale) ?? presentTag(config.bodyText?.hyphenation?.locale);
  const comics = resolveComicsConfig(config.comics, locale);
  const out = new Set<string>();
  out.add(comics.lettering.fontFamily);
  for (const s of comics.balloonStyles) if (s.fontFamily) out.add(s.fontFamily);
  for (const c of comics.cast) if (c.fontFamily) out.add(c.fontFamily);
  return [...out];
}
