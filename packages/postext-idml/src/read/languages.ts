// InDesign names a language in English (`English: USA`), with the
// sublanguage after a colon, or by a locale of its own for the
// dictionaries added later (`de_DE_2006`, `hi_IN`). The IETF tag of each.

const NAMES: Record<string, string> = {
  'English: USA': 'en-US', 'English: USA Medical': 'en-US', 'English: USA Legal': 'en-US', 'English: UK': 'en-GB', 'English: Canadian': 'en-CA', 'English': 'en',
  'Spanish: Castilian': 'es-ES', 'Spanish': 'es', 'Catalan': 'ca', 'Galician': 'gl', 'Basque': 'eu',
  'French': 'fr-FR', 'French: Canadian': 'fr-CA',
  'German: Traditional': 'de-DE-1901', 'German: Reformed': 'de-DE-1996', 'German: Swiss': 'de-CH', 'German: Swiss Reformed': 'de-CH-1996', 'German: Austrian': 'de-AT', 'German': 'de', 'German: 2006 Reform': 'de-DE', 'German: Swiss 2006 Reform': 'de-CH', 'German: Austria 2006 Reform': 'de-AT',
  'Italian': 'it-IT', 'Portuguese': 'pt-PT', 'Portuguese: Brazilian': 'pt-BR', 'Portuguese: Orthographic Agreement': 'pt-PT',
  'Dutch': 'nl-NL', 'Dutch: Old Rules': 'nl-NL', 'Dutch: 2005 Reform': 'nl-NL',
  'Japanese': 'ja', 'Chinese: Simplified': 'zh-Hans', 'Chinese: Traditional': 'zh-Hant', 'Korean': 'ko',
  'Arabic': 'ar', 'Hebrew': 'he', 'Farsi': 'fa', 'Urdu': 'ur',
  'Russian': 'ru', 'Ukrainian': 'uk', 'Bulgarian': 'bg', 'Belarusian': 'be', 'Serbian': 'sr',
  'Greek': 'el', 'Polish': 'pl', 'Czech': 'cs', 'Slovak': 'sk', 'Slovenian': 'sl', 'Croatian': 'hr', 'Hungarian': 'hu', 'Romanian': 'ro',
  'Swedish': 'sv', 'Danish': 'da', 'Norwegian: Bokmal': 'nb', 'Norwegian: Nynorsk': 'nn', 'Norwegian': 'nb', 'Finnish': 'fi', 'Icelandic': 'is',
  'Estonian': 'et', 'Latvian': 'lv', 'Lithuanian': 'lt', 'Turkish': 'tr', 'Thai': 'th', 'Vietnamese': 'vi', 'Indonesian': 'id',
  'Hindi': 'hi', 'Bengali': 'bn', 'Gujarati': 'gu', 'Kannada': 'kn', 'Malayalam': 'ml', 'Marathi': 'mr', 'Oriya': 'or', 'Punjabi': 'pa', 'Tamil': 'ta', 'Telugu': 'te',
};

/** The IETF tag of a language as InDesign names it (with or without its
 *  `$ID/` mark, or as a `Language/…` reference); undefined for
 *  `[No Language]` and for a name the reader does not know. */
export function languageTag(name: string | undefined): string | undefined {
  if (!name) return undefined;
  let n = name.replace(/^Language\//, '').replace(/^\$ID\//, '');
  // A `Self` escapes the colon of the name.
  n = n.replace(/%3a/gi, ':').replace(/%20/g, ' ').trim();
  const known = NAMES[n];
  if (known) return known;
  // `de_DE_2006`, `nl_NL_2005`, `hi_IN`: a locale, sometimes with the
  // year of a spelling reform after it.
  const locale = /^([a-z]{2,3})_([A-Z]{2})(?:_\d{4})?$/.exec(n);
  if (locale) return `${locale[1]}-${locale[2]}`;
  const primary = NAMES[n.split(':')[0]!.trim()];
  return primary ? primary.split('-')[0] : undefined;
}
