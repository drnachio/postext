import Hypher, { type HyphenationLanguage } from 'hypher';
import enUs from 'hyphenation.en-us';
import es from 'hyphenation.es';
import fr from 'hyphenation.fr';
import de from 'hyphenation.de';
import it from 'hyphenation.it';
import pt from 'hyphenation.pt';
import ca from 'hyphenation.ca';
import nl from 'hyphenation.nl';
import type { HyphenationLocale, LocaleTag } from './types';
import { hyphenationLocaleFor } from './locale';

export { HYPHENATION_LOCALES, matchHyphenationLocale, hyphenationLocaleFor } from './locale';

const PATTERNS: Record<HyphenationLocale, HyphenationLanguage> = {
  'en-us': enUs,
  'es': es,
  'fr': fr,
  'de': de,
  'it': it,
  'pt': pt,
  'ca': ca,
  'nl': nl,
};

const instances = new Map<HyphenationLocale, Hypher>();

function getHyphenator(locale: HyphenationLocale): Hypher {
  let h = instances.get(locale);
  if (!h) {
    h = new Hypher(PATTERNS[locale]);
    instances.set(locale, h);
  }
  return h;
}

let currentLocale: HyphenationLocale = 'en-us';

/** Set the dictionary {@link hyphenateText} uses when called without a
 *  locale. Any BCP 47 tag is accepted (see {@link matchHyphenationLocale});
 *  a missing or blank one sets `'en-us'`. */
export function setHyphenationLocale(locale: LocaleTag): void {
  currentLocale = hyphenationLocaleFor(locale);
}

/** The dictionary {@link hyphenateText} uses when called without a locale. */
export function getHyphenationLocale(): HyphenationLocale {
  return currentLocale;
}

/** Hyphenated form of each whitespace-delimited token, per locale. The
 *  same words come back in every paragraph, every pass and every chapter
 *  of a book; the trie walk is not cheap and its result never changes. */
const WORD_MEMO_SLOTS = 50_000;
const wordMemo = new Map<HyphenationLocale, Map<string, string>>();

function memoFor(locale: HyphenationLocale): Map<string, string> {
  let m = wordMemo.get(locale);
  if (!m) {
    m = new Map();
    wordMemo.set(locale, m);
  }
  return m;
}

/**
 * Hyphenate a full text string by inserting soft hyphens at syllable boundaries
 * using TeX/Liang patterns for the active locale, or for `locale` (any BCP 47
 * tag, see {@link matchHyphenationLocale}) when given — a missing or blank
 * one counts as not given. The dictionary also puts a zero-width space after
 * a slash inside a word (see {@link withoutSlashJoints}).
 */
export function hyphenateText(text: string, locale?: LocaleTag): string {
  const loc = typeof locale === 'string' && locale.trim() !== '' ? hyphenationLocaleFor(locale) : currentLocale;
  const hyphenator = getHyphenator(loc);
  const memo = memoFor(loc);
  // Token by token: whitespace never joins a word, so hyphenating the
  // tokens one at a time gives the text the dictionary would.
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    let j = i;
    if (isSpace(text.charCodeAt(j))) {
      while (j < n && isSpace(text.charCodeAt(j))) j++;
      out += text.slice(i, j);
    } else {
      while (j < n && !isSpace(text.charCodeAt(j))) j++;
      const word = text.slice(i, j);
      let hyphenated = memo.get(word);
      if (hyphenated === undefined) {
        hyphenated = hyphenator.hyphenateText(word);
        if (memo.size >= WORD_MEMO_SLOTS) memo.clear();
        memo.set(word, hyphenated);
      }
      out += hyphenated;
    }
    i = j;
  }
  return out;
}

/** A hyphen between two letters: the word is a compound. */
const COMPOUND_RE = /\p{L}-\p{L}/u;

/**
 * {@link hyphenateText} with the active dictionary, leaving every compound
 * whole: a whitespace-delimited word with a hyphen between two letters
 * ("after-dinner") gets no soft hyphen, so it breaks only after its own
 * hyphen (`HyphenationConfig.compounds: false`). The soft hyphens the text
 * carries stay.
 */
export function hyphenateTextKeepingCompounds(text: string): string {
  if (!text.includes('-')) return hyphenateText(text);
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    let j = i;
    const space = isSpace(text.charCodeAt(j));
    while (j < n && isSpace(text.charCodeAt(j)) === space) j++;
    const piece = text.slice(i, j);
    out += space || COMPOUND_RE.test(piece) ? piece : hyphenateText(piece);
    i = j;
  }
  return out;
}

const ZWSP = '\u200B';

/**
 * `hyphenated` — {@link hyphenateText} of `word` — without the zero-width
 * spaces the dictionary puts after a slash (`entrada/` U+200B `salida`). The
 * plain breaker takes them as break opportunities; text laid out word by
 * word (the rich breaker, design text) breaks only at the soft hyphens, and
 * the character must not ride along into its line text. A zero-width space
 * the word itself carries stays.
 */
export function withoutSlashJoints(word: string, hyphenated: string): string {
  if (!hyphenated.includes(ZWSP)) return hyphenated;
  let out = '';
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    if (j < word.length && ch === word[j]) {
      out += ch;
      j++;
    } else if (ch !== ZWSP) {
      out += ch;
    }
  }
  return out;
}

function isSpace(code: number): boolean {
  // The whitespace `\s` matches. A no-break space is one too: it is no
  // break opportunity (the breakers keep it inside the word it glues), but
  // the dictionary hyphenates the words on either side of it on their own.
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0x3000 || code === 0xfeff;
}
