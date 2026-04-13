import type { HyphenationLocale } from './types';

const SOFT_HYPHEN = '\u00AD';
const MIN_WORD_LENGTH = 5;
const MIN_PREFIX = 2;
const MIN_SUFFIX = 3;

// ---------------------------------------------------------------------------
// Vowel sets per locale
// ---------------------------------------------------------------------------

const VOWELS: Record<HyphenationLocale, Set<string>> = {
  'en-us': new Set('aeiouyAEIOUY'),
  'es': new Set('aeiouáéíóúüAEIOUÁÉÍÓÚÜ'),
  'fr': new Set('aeiouyàâæéèêëïîôœùûüÿAEIOUYÀÂÆÉÈÊËÏÎÔŒÙÛÜŸ'),
  'de': new Set('aeiouyäöüAEIOUYÄÖÜ'),
  'it': new Set('aeiouyàèéìíòóùúAEIOUYÀÈÉÌÍÒÓÙÚ'),
  'pt': new Set('aeiouyáâãàéêíóôõúüAEIOUYÁÂÃÀÉÊÍÓÔÕÚÜ'),
  'ca': new Set('aeiouyàèéíïòóúüAEIOUYÀÈÉÍÏÒÓÚÜ'),
  'nl': new Set('aeiouyAEIOUY'),
};

// ---------------------------------------------------------------------------
// Common prefixes & suffixes for better break points
// ---------------------------------------------------------------------------

const COMMON_PREFIXES: Record<HyphenationLocale, string[]> = {
  'en-us': ['over', 'under', 'inter', 'trans', 'super', 'anti', 'auto', 'counter', 'dis', 'mis', 'non', 'pre', 'post', 'semi', 'sub', 'un', 're'],
  'es': ['des', 'inter', 'trans', 'sobre', 'contra', 'anti', 'auto', 'pre', 'post', 'semi', 'sub', 'in', 're'],
  'fr': ['contre', 'entre', 'inter', 'trans', 'super', 'anti', 'auto', 'pré', 'post', 'semi', 'sous', 'sur', 'dé', 're'],
  'de': ['über', 'unter', 'zwischen', 'gegen', 'wider', 'vor', 'nach', 'aus', 'ein', 'um', 'ab', 'an', 'auf', 'ver', 'zer', 'ent', 'emp', 'be', 'ge', 'miss'],
  'it': ['contro', 'inter', 'trans', 'sopra', 'sotto', 'anti', 'auto', 'pre', 'post', 'semi', 'dis', 'ri', 'in'],
  'pt': ['des', 'inter', 'trans', 'sobre', 'contra', 'anti', 'auto', 'pré', 'pós', 'semi', 'sub', 'in', 're'],
  'ca': ['des', 'inter', 'trans', 'sobre', 'contra', 'anti', 'auto', 'pre', 'post', 'semi', 'sub', 'in', 're'],
  'nl': ['over', 'onder', 'tussen', 'tegen', 'voor', 'ver', 'her', 'ont', 'be', 'ge'],
};

const COMMON_SUFFIXES: Record<HyphenationLocale, string[]> = {
  'en-us': ['tion', 'sion', 'ment', 'ness', 'able', 'ible', 'ful', 'less', 'ous', 'ive', 'ing', 'ence', 'ance', 'ity'],
  'es': ['ción', 'sión', 'mente', 'miento', 'idad', 'ble', 'oso', 'ivo', 'ando', 'endo', 'ción', 'dad'],
  'fr': ['tion', 'sion', 'ment', 'eur', 'euse', 'able', 'ible', 'eux', 'ive', 'ence', 'ance', 'ité'],
  'de': ['ung', 'heit', 'keit', 'lich', 'isch', 'schaft', 'ment', 'tion', 'bar', 'sam', 'haft'],
  'it': ['zione', 'sione', 'mente', 'mento', 'ità', 'bile', 'oso', 'ivo', 'ando', 'endo'],
  'pt': ['ção', 'são', 'mente', 'mento', 'dade', 'vel', 'oso', 'ivo', 'ando', 'endo'],
  'ca': ['ció', 'sió', 'ment', 'tat', 'ble', 'ós', 'iu', 'ant', 'ent'],
  'nl': ['heid', 'lijk', 'ting', 'baar', 'zaam', 'isch', 'ment', 'sel'],
};

// ---------------------------------------------------------------------------
// Core hyphenation algorithm
// ---------------------------------------------------------------------------

function isVowel(char: string, vowelSet: Set<string>): boolean {
  return vowelSet.has(char);
}

function isConsonant(char: string, vowelSet: Set<string>): boolean {
  return /\p{L}/u.test(char) && !vowelSet.has(char);
}

/**
 * Find syllable break points in a word using vowel/consonant patterns.
 * Returns an array of indices where soft hyphens should be inserted.
 */
function findBreakPoints(word: string, locale: HyphenationLocale): number[] {
  if (word.length < MIN_WORD_LENGTH) return [];

  const vowelSet = VOWELS[locale] ?? VOWELS['en-us']!;
  const lower = word.toLowerCase();
  const breaks: number[] = [];

  // Check for prefix break
  const prefixes = COMMON_PREFIXES[locale] ?? COMMON_PREFIXES['en-us']!;
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix) && word.length - prefix.length >= MIN_SUFFIX) {
      breaks.push(prefix.length);
      break;
    }
  }

  // Check for suffix break
  const suffixes = COMMON_SUFFIXES[locale] ?? COMMON_SUFFIXES['en-us']!;
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix) && word.length - suffix.length >= MIN_PREFIX) {
      const idx = word.length - suffix.length;
      if (!breaks.includes(idx)) breaks.push(idx);
      break;
    }
  }

  // V-CV pattern: break before a consonant followed by a vowel
  // VC-CV pattern: break between consonants when surrounded by vowels
  for (let i = MIN_PREFIX; i < word.length - MIN_SUFFIX + 1; i++) {
    if (breaks.includes(i)) continue;

    const prev = word[i - 1]!;
    const curr = word[i]!;
    const next = i + 1 < word.length ? word[i + 1]! : '';

    // Break before consonant + vowel (V-CV)
    if (isVowel(prev, vowelSet) && isConsonant(curr, vowelSet) && next && isVowel(next, vowelSet)) {
      breaks.push(i);
      continue;
    }

    // Break between two consonants (VC-CV)
    if (i >= 2) {
      const prevPrev = word[i - 2]!;
      if (isVowel(prevPrev, vowelSet) && isConsonant(prev, vowelSet) && isConsonant(curr, vowelSet) && next && isVowel(next, vowelSet)) {
        breaks.push(i);
      }
    }
  }

  return breaks.sort((a, b) => a - b);
}

/**
 * Insert soft hyphens into a word at syllable boundaries.
 */
function hyphenateWord(word: string, locale: HyphenationLocale): string {
  // Skip short words, words with existing hyphens, numbers, etc.
  if (word.length < MIN_WORD_LENGTH) return word;
  if (/[\d]/.test(word)) return word;

  const breakPoints = findBreakPoints(word, locale);
  if (breakPoints.length === 0) return word;

  let result = '';
  let lastIdx = 0;
  for (const bp of breakPoints) {
    result += word.slice(lastIdx, bp) + SOFT_HYPHEN;
    lastIdx = bp;
  }
  result += word.slice(lastIdx);
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let currentLocale: HyphenationLocale = 'en-us';

/**
 * Set the current hyphenation locale.
 */
export function setHyphenationLocale(locale: HyphenationLocale): void {
  currentLocale = locale;
}

/**
 * Hyphenate a full text string by inserting soft hyphens at syllable boundaries.
 * Only affects words, preserving all whitespace and punctuation.
 */
export function hyphenateText(text: string, locale?: HyphenationLocale): string {
  const loc = locale ?? currentLocale;
  return text.replace(/\p{L}+/gu, (word) => hyphenateWord(word, loc));
}
