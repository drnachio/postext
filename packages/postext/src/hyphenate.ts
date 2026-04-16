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

/**
 * Hyphenate a full text string by inserting soft hyphens at syllable boundaries
 * using TeX/Liang patterns for the active locale.
 */
export function hyphenateText(text: string, locale?: HyphenationLocale): string {
  return getHyphenator(locale ?? currentLocale).hyphenateText(text);
}
