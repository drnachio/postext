import Hypher, { type HyphenationLanguage } from 'hypher';
import enUs from 'hyphenation.en-us';
import es from 'hyphenation.es';
import fr from 'hyphenation.fr';
import de from 'hyphenation.de';
import it from 'hyphenation.it';
import pt from 'hyphenation.pt';
import ca from 'hyphenation.ca';
import nl from 'hyphenation.nl';
import type { HyphenationLocale } from './types';

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
    h = new Hypher(PATTERNS[locale] ?? PATTERNS['en-us']);
    instances.set(locale, h);
  }
  return h;
}

let currentLocale: HyphenationLocale = 'en-us';

export function setHyphenationLocale(locale: HyphenationLocale): void {
  currentLocale = locale;
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
 * using TeX/Liang patterns for the active locale.
 */
export function hyphenateText(text: string, locale?: HyphenationLocale): string {
  const loc = locale ?? currentLocale;
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

function isSpace(code: number): boolean {
  // The whitespace `\s` matches, as the tokenisers split on it.
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0x3000 || code === 0xfeff;
}
