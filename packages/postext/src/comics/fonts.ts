/**
 * The faces a document's comic pages are lettered in (#559), for hosts
 * that load fonts before a build: the lettering face, every balloon
 * style's own face (the sound-effect face among them) and the cast's. The
 * defaults follow the document language (`Comic Neue`, `Zen Antique` for
 * Japanese, `Bangers` for sound effects…), so a book that never names them
 * still needs them as soon as it has a `:::page`.
 */

import type { PostextConfig, ResolvedBalloonStyleConfig } from '../types.js';
import { directionOf, isCjkLanguage, presentTag } from '../hyphenation/locale.js';
import { pickBalloonStyle, resolveComicsConfig } from '../defaults/comics.js';
import { parseComicFence } from './page.js';
import type { ComicScriptItem } from './types.js';

/** A line that opens a comic block (`:::page`, `:::strip`). */
const COMIC_FENCE_LINE = /^[ \t]*:::(?:page|strip)(?=[\s{]|$)/m;

/** Whether a Markdown text (or any of several, the chapters of a book)
 *  holds a comic page or strip. */
export function markdownHasComics(markdown: string | readonly string[] | undefined): boolean {
  if (markdown === undefined) return false;
  const texts = typeof markdown === 'string' ? [markdown] : markdown;
  return texts.some((t) => COMIC_FENCE_LINE.test(t));
}

/** A `font=` attribute somewhere in a text: only then is it parsed. */
const LINE_FONT_HINT = /\bfont\s*=/;
/** Every line that opens a comic block. */
const COMIC_FENCE_LINES = /^[ \t]*:::(?:page|strip)(?=[\s{]|$)/gm;

/**
 * The families the comic script lines of a text name themselves (#696):
 * `sfx{font="Dela Gothic One"}: ドン` sets that line in a face the
 * configuration never mentions (`comicLetteringStyle` takes it before the
 * cast's and the style's). Read with the comic parser, so a commented
 * line, or a `font=` outside a comic block, counts for nothing. First
 * seen first.
 */
export function comicLineFontFamilies(markdown: string | readonly string[] | undefined): string[] {
  if (markdown === undefined) return [];
  const out = new Set<string>();
  for (const text of typeof markdown === 'string' ? [markdown] : markdown) {
    if (!LINE_FONT_HINT.test(text)) continue;
    for (const item of comicScriptItems(text)) if (item.font) out.add(item.font);
  }
  return [...out];
}

/** Every script line of the comic blocks of a text, read with the comic
 *  parser. */
function* comicScriptItems(text: string): Generator<ComicScriptItem> {
  let from = 0;
  for (const fence of text.matchAll(COMIC_FENCE_LINES)) {
    // A fence line inside the block before it is that block's text.
    if (fence.index < from) continue;
    const block = parseComicFence(text, fence.index);
    if (!block) continue;
    from = block.end;
    for (const panel of block.source.panels) yield* panel.items;
  }
}

/**
 * The families the comic pages of a document letter with: none when the
 * config has no `comics` section and no text given holds a comic block;
 * else the lettering face, each balloon style's and each cast member's
 * (defaults resolved for the document language), then the ones the script
 * lines name themselves ({@link comicLineFontFamilies}), first seen first.
 */
export function comicFontFamilies(config: PostextConfig, markdown?: string | readonly string[]): string[] {
  if (!config.comics && !markdownHasComics(markdown)) return [];
  const locale = presentTag(config.locale) ?? presentTag(config.bodyText?.hyphenation?.locale);
  const comics = resolveComicsConfig(config.comics, locale);
  const out = new Set<string>();
  out.add(comics.lettering.fontFamily);
  for (const s of comics.balloonStyles) if (s.fontFamily) out.add(s.fontFamily);
  for (const c of comics.cast) if (c.fontFamily) out.add(c.fontFamily);
  for (const family of comicLineFontFamilies(markdown)) out.add(family);
  return [...out];
}

/** One face a comic line is lettered in, at the weight and slant the
 *  layout sets it (`comicLetteringStyle`). */
export interface ComicFontUse { family: string; weight: number; style: 'normal' | 'italic' }

/**
 * The weights and slants the comic pages of a document letter in (#1047):
 * for each script line, the balloon style it picks (its own, its
 * speaker's, its role's, else speech) and the face it ends up in (the
 * line's `font=`, the speaker's, the style's, else the lettering's), at
 * 700 when the style's `bold` (else the lettering's) is set, slanted when
 * its `italic` is and the script has italics. Without the text, every
 * balloon style in its face and in each cast member's. Built-in styles
 * resolved with the configuration's entries laid over them, so the shout's
 * bold counts though no configuration writes it.
 */
export function comicFontUses(config: PostextConfig, markdown?: string | readonly string[]): ComicFontUse[] {
  if (!config.comics && !markdownHasComics(markdown)) return [];
  const locale = presentTag(config.locale) ?? presentTag(config.bodyText?.hyphenation?.locale);
  const comics = resolveComicsConfig(config.comics, locale);
  const L = comics.lettering;
  const tag = locale ?? 'en';
  const slanted = !isCjkLanguage(tag) && directionOf(tag) !== 'rtl';
  const out: ComicFontUse[] = [];
  const use = (st: ResolvedBalloonStyleConfig, family: string | undefined) => {
    out.push({
      family: family || st.fontFamily || L.fontFamily,
      weight: (st.bold ?? L.bold) ? 700 : 400,
      style: (st.italic ?? L.italic) && slanted ? 'italic' : 'normal',
    });
  };
  if (markdown === undefined) {
    for (const st of comics.balloonStyles) {
      use(st, undefined);
      for (const c of comics.cast) if (c.fontFamily) use(st, c.fontFamily);
    }
    return out;
  }
  const castById = new Map(comics.cast.map((c) => [c.id, c] as const));
  for (const text of typeof markdown === 'string' ? [markdown] : markdown) {
    for (const it of comicScriptItems(text)) {
      const cast = it.speaker ? castById.get(it.speaker) : undefined;
      const st = pickBalloonStyle(comics, it.style?.trim())
        ?? pickBalloonStyle(comics, it.role === 'speech' ? cast?.balloonStyle : undefined)
        ?? pickBalloonStyle(comics, it.role === 'speech' ? 'speech' : it.role)
        ?? pickBalloonStyle(comics, 'speech')!;
      use(st, it.font?.trim() || cast?.fontFamily);
    }
  }
  return out;
}
