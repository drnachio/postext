// How a book's content locales are named in the interface: the language
// name in the reader's language for tooltips and choices ("Traditional
// Chinese", "chino tradicional"), and a short tag for the library rows
// (繁 / 简 for the two Chinese scripts, 日 for Japanese, ع for Arabic, EN /
// ES otherwise). Pure.

import { canonicalLocaleTag, chineseScriptOf } from 'postext';

/** `tag`'s language name in `uiLocale` (`zh-Hant` in `es`: "chino
 *  tradicional"), else the tag as written. */
export function localeDisplayName(tag: string, uiLocale: string): string {
  const canonical = canonicalLocaleTag(tag);
  if (!canonical) return tag;
  try {
    return new Intl.DisplayNames([uiLocale, 'en'], { type: 'language' }).of(canonical) ?? tag;
  } catch {
    return tag;
  }
}

/** The script of a Chinese tag once maximised (`Hant` for `zh-TW`), else
 *  null. */
function chineseScript(tag: string): 'Hans' | 'Hant' | null {
  return chineseScriptOf(tag) ?? null;
}

export interface LocaleShortTag {
  /** What the tag shows (upper-cased by the row style). */
  text: string;
  /** The `lang` to set it in, for the Chinese or Arabic characters. */
  lang?: string;
}

/** The short tag of `tag` among a book's locales `all`: 繁 or 简 for a
 *  Chinese edition in a script no other locale shares, 日 (of 日本語) for
 *  the only Japanese edition, ع (its first letter, as 简 is the script's)
 *  for the only Arabic edition, the bare language (`en`) when no other
 *  locale is in the same language, else the tag. */
export function localeShortTag(tag: string, all: readonly string[]): LocaleShortTag {
  const script = chineseScript(tag);
  if (script) {
    const others = all.filter((l) => l !== tag && chineseScript(l) === script);
    if (others.length === 0) return script === 'Hant' ? { text: '繁', lang: 'zh-Hant' } : { text: '简', lang: 'zh-Hans' };
    return { text: tag };
  }
  const language = (canonicalLocaleTag(tag) ?? tag).split('-')[0]!;
  const shared = all.some((l) => l !== tag && (canonicalLocaleTag(l) ?? l).split('-')[0]!.toLowerCase() === language.toLowerCase());
  if (!shared && language.toLowerCase() === 'ar') return { text: 'ع', lang: 'ar' };
  if (!shared && language.toLowerCase() === 'ja') return { text: '日', lang: 'ja' };
  return { text: shared ? tag : language };
}
