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
import { joiningScriptIn } from './measure/joining';

export { HYPHENATION_LOCALES, matchHyphenationLocale, hyphenationLocaleFor } from './locale';

/** Catalan words the IEC divides at their prefix rather than by syllable
 *  (*Llibre d'estil*, VI § 2.7): `vos-altres`, not `vo-saltres`. */
const CATALAN_EXCEPTIONS = [
  'nos‧al‧tres', 'vos‧al‧tres', 'ben‧es‧tar', 'mal‧es‧tar', 'mal‧en‧tès', 'mal‧en‧te‧sa', 'mal‧en‧te‧sos',
  'mal‧en‧te‧ses', 'mal‧au‧rat', 'mal‧au‧ra‧da', 'mal‧au‧rats', 'mal‧au‧ra‧des', 'des‧en‧gany',
  'des‧en‧ga‧nys', 'des‧en‧ga‧nyar', 'des‧en‧ga‧nyat', 'des‧en‧ga‧nya‧da', 'des‧i‧gual', 'des‧i‧guals',
  'des‧i‧gual‧tat', 'cel‧o‧bert', 'cel‧o‧berts', 'bes‧a‧vi', 'bes‧a‧via', 'bes‧a‧vis', 'bes‧a‧vies',
  'trans‧at‧làn‧tic', 'trans‧at‧làn‧ti‧ca', 'trans‧at‧làn‧tics', 'trans‧at‧làn‧ti‧ques', 'sub‧rat‧llar',
  'sub‧rat‧lla‧da', 'sub‧rat‧llat',
].join(', ');

const PATTERNS: Record<HyphenationLocale, HyphenationLanguage> = {
  'en-us': enUs,
  'es': es,
  'fr': fr,
  'de': de,
  'it': it,
  'pt': pt,
  // The IEC leaves at least two letters on either side of the break (VI
  // § 1.6), as TeX does with these same patterns: `ter-ra`, `cai-xa`. The
  // package ships three.
  'ca': { ...ca, leftmin: 2, rightmin: 2, exceptions: CATALAN_EXCEPTIONS },
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
        // A word of a joining script (an Arabic word quoted in an English
        // book) is never divided: its letters connect (`measure/joining.ts`).
        hyphenated = joiningScriptIn(word) ? word : loc === 'ca' ? hyphenateCatalan(hyphenator, word) : hyphenator.hyphenateText(word);
        if (memo.size >= WORD_MEMO_SLOTS) memo.clear();
        memo.set(word, hyphenated);
      }
      out += hyphenated;
    }
    i = j;
  }
  return out;
}

/** A Catalan word run: letters and apostrophes, with the middle dot of an
 *  ela geminada (`l·l`) kept inside the word. hypher's own word class stops
 *  at the dot, so `il·lusió` would reach the patterns as `il` and `lusió`. */
const CATALAN_WORD_RE = /(?:[\p{L}\p{M}'’]|(?<=[lL])·(?=[lL]))+/gu;
const CATALAN_VOWELS = 'aeiouàèéíïòóúüAEIOUÀÈÉÍÏÒÓÚÜ';
/** hypher's default: shorter words are left whole. */
const MIN_WORD_LENGTH = 4;

/** `word` (one whitespace-free token) with soft hyphens at the Catalan
 *  syllable breaks the IEC accepts at a line end. Two vowels in hiatus stay
 *  together (`cièn-cia`, `ca-mions`, VI § 2.4), but an intervocalic `i` or
 *  `u` is a consonant and opens its syllable (`fe-ia`, `ve-ient`). No
 *  break follows an apostrophe (`s'ha-via`). The
 *  break inside `l·l` is kept: the line breakers print it `l-` | `l`. */
function hyphenateCatalan(hyphenator: Hypher, word: string): string {
  return word.replace(CATALAN_WORD_RE, (run) => {
    if (run.length < MIN_WORD_LENGTH) return run;
    const parts = hyphenator.hyphenate(run);
    let out = parts[0] ?? '';
    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1]!;
      const next = parts[i]!;
      // Never right after an apostrophe (`l'al-ba`, not `l'-alba`, VI § 1.7).
      const apostrophe = "'’".includes(prev[prev.length - 1]!);
      const hiatus = CATALAN_VOWELS.includes(prev[prev.length - 1]!) && CATALAN_VOWELS.includes(next[0]!)
        && !('iuIU'.includes(next[0]!) && next.length > 1 && CATALAN_VOWELS.includes(next[1]!));
      out += (hiatus || apostrophe ? '' : SOFT_HYPHEN) + next;
    }
    return out;
  });
}

const SOFT_HYPHEN = '­';

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
  // The ideographic space U+3000 is a character of CJK text, not a space.
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0xfeff;
}
