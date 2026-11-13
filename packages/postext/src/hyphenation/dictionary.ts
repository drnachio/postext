// The dictionary a word is divided with: the document's (or its chapter
// style's), or the one of a passage marked with another language (#1547).
import type { HyphenationLocale, LocaleTag } from '../types.js';
import { hyphenationLocaleFor, matchHyphenationLocale, languageOf, presentTag } from './locale.js';

/** The dictionary of the text: `bodyText.hyphenation.locale`, as the build
 *  sets it for the document or the chapter (`initHyphenator`). */
let textLocale: HyphenationLocale = 'en-us';
/** The tag it was set from, which a passage in the same language keeps. */
let textTag: string | undefined;
/** The dictionary of the passage being measured: a language's own, or
 *  `null` for a language with no patterns, which divides no word.
 *  `undefined` outside a passage. */
let passage: HyphenationLocale | null | undefined;

/** Set the dictionary `hyphenateText` uses when called without a locale.
 *  Any BCP 47 tag is accepted (see `matchHyphenationLocale`); a missing or
 *  blank one sets `'en-us'`. */
export function setHyphenationLocale(locale: LocaleTag): void {
  textLocale = hyphenationLocaleFor(locale);
  textTag = presentTag(locale);
  passage = undefined;
}

/** The dictionary of the text around any passage (see
 *  {@link dictionaryInForce} for the one in force). */
export function getHyphenationLocale(): HyphenationLocale {
  return textLocale;
}

/** The dictionary `hyphenateText` divides with when given no locale: the
 *  passage's, inside one ({@link withHyphenationLanguage}), else the
 *  text's. `null`: a passage in a language without patterns. */
export function dictionaryInForce(): HyphenationLocale | null {
  return passage === undefined ? textLocale : passage;
}

/** {@link dictionaryInForce} as a key of what was measured under it: the
 *  measurement caches keep a passage's lines apart from the text's. */
export function hyphenationDictionaryKey(): string {
  return dictionaryInForce() ?? '-';
}

/**
 * The dictionary of a passage marked with `tag` (`:::paragraphs{lang=fr}`,
 * `:ltr[…]{lang=fr}`): its language's own patterns; the text's dictionary
 * when it is the text's language (a Greek book hyphenated with the English
 * patterns keeps them in a passage marked Greek); else `null`, since no
 * patterns ship for it and another language's would divide it wrong.
 * `undefined` for no tag.
 */
function passageDictionary(tag: string | undefined): HyphenationLocale | null | undefined {
  const t = presentTag(tag);
  if (t === undefined) return undefined;
  const own = matchHyphenationLocale(t);
  if (own) return own;
  return textTag !== undefined && languageOf(t) === languageOf(textTag) ? textLocale : null;
}

/**
 * Divide the words `fn` measures with the dictionary of the passage in
 * language `tag` (#1547), and its list of words kept whole
 * (`hyphenation.exceptionsByLanguage`), which `hyphenateText` picks by
 * dictionary. A chapter style already chooses the dictionary of a whole
 * chapter; this does it for a container's `lang` and an isolate's
 * `{lang=…}`, as a nested one inside another. No tag leaves the dictionary
 * in force.
 */
export function withHyphenationLanguage<T>(tag: string | undefined, fn: () => T): T {
  const restore = enterHyphenationLanguage(tag);
  try {
    return fn();
  } finally {
    restore();
  }
}

/** {@link withHyphenationLanguage} for a stretch of code that cannot be
 *  wrapped in a callback (a loop with `continue`): enter the passage, and
 *  call the function returned to leave it. */
export function enterHyphenationLanguage(tag: string | undefined): () => void {
  const wanted = passageDictionary(tag);
  if (wanted === undefined || wanted === dictionaryInForce()) return NOTHING;
  const outer = passage;
  passage = wanted;
  return () => {
    passage = outer;
  };
}

const NOTHING = (): void => undefined;
