import Hypher, { type HyphenationLanguage } from 'hypher';
import enUs from 'hyphenation.en-us';
import es from 'hyphenation.es';
import fr from 'hyphenation.fr';
import de from 'hyphenation.de';
import it from 'hyphenation.it';
import pt from 'hyphenation.pt';
import ca from 'hyphenation.ca';
import nl from 'hyphenation.nl';
import type { HyphenationLocale, LocaleTag } from '../types.js';
import { hyphenationLocaleFor } from './locale.js';
import { joiningScriptIn } from '../measure/rtl/joining.js';
import { normalizeHyphenationExceptions } from './hyphenationExceptions.js';

export { HYPHENATION_LOCALES, matchHyphenationLocale, hyphenationLocaleFor } from './locale.js';
export { normalizeHyphenationExceptions } from './hyphenationExceptions.js';

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
 * a slash inside a word (see {@link withoutSlashJoints}). The document's
 * rules ({@link setHyphenationRules}: words kept whole or divided at named
 * points, capitalised words, cited names) are applied to the dictionary's
 * result; {@link hyphenateByDictionary} gives the dictionary's own.
 */
export function hyphenateText(text: string, locale?: LocaleTag): string {
  const rules = activeRules;
  if (!rules) return hyphenateByDictionary(text, locale);
  const loc = typeof locale === 'string' && locale.trim() !== '' ? hyphenationLocaleFor(locale) : currentLocale;
  let memo = rules.memo.get(loc);
  if (!memo) {
    memo = new Map();
    rules.memo.set(loc, memo);
  }
  return eachToken(text, (word) => {
    let ruled = memo.get(word);
    if (ruled === undefined) {
      ruled = withHyphenationRules(word, hyphenateByDictionary(word, loc), rules);
      if (memo.size >= WORD_MEMO_SLOTS) memo.clear();
      memo.set(word, ruled);
    }
    return ruled;
  });
}

/**
 * {@link hyphenateText} without the document's rules: every point the
 * patterns give. A word wider than its whole measure is divided there when
 * a rule keeps it whole (#699).
 */
export function hyphenateByDictionary(text: string, locale?: LocaleTag): string {
  const loc = typeof locale === 'string' && locale.trim() !== '' ? hyphenationLocaleFor(locale) : currentLocale;
  const hyphenator = getHyphenator(loc);
  const memo = memoFor(loc);
  return eachToken(text, (word) => {
    let hyphenated = memo.get(word);
    if (hyphenated === undefined) {
      // A word of a joining script (an Arabic word quoted in an English
      // book) is never divided: its letters connect (`measure/rtl/joining.ts`).
      hyphenated = joiningScriptIn(word) ? word : loc === 'ca' ? hyphenateCatalan(hyphenator, word) : hyphenator.hyphenateText(word);
      if (APOSTROPHE_LOCALES.has(loc) && APOSTROPHE_RE.test(word)) {
        hyphenated = withoutApostropheBreaks(word, hyphenated, PATTERNS[loc].leftmin, PATTERNS[loc].rightmin, ELISION_LOCALES.has(loc));
      }
      if (memo.size >= WORD_MEMO_SLOTS) memo.clear();
      memo.set(word, hyphenated);
    }
    return hyphenated;
  });
}

/** `text` with each whitespace-delimited token replaced by `divide` of it.
 *  Token by token: whitespace never joins a word, so hyphenating the tokens
 *  one at a time gives the text the dictionary would. */
function eachToken(text: string, divide: (word: string) => string): string {
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
      out += divide(text.slice(i, j));
    }
    i = j;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The document's rules (#699)
// ---------------------------------------------------------------------------

/** What a document asks of its dictionary beyond the patterns
 *  (`bodyText.hyphenation.exceptions` and `capitalized`,
 *  `citations.hyphenateNames`). */
export interface HyphenationRules {
  /** Words the dictionary never divides (`'Alice'`) or divides only at the
   *  hyphens of the entry (`'You-Tube'`), as resolved
   *  (`normalizeHyphenationExceptions`). An entry in lower case matches the
   *  word in any case; one with an initial capital matches the occurrences
   *  that start with a capital. */
  exceptions?: readonly string[];
  /** `false`: no break inside a word that starts with a capital. */
  capitalized?: boolean;
  /** Names never divided where they start with a capital (the authors a
   *  document cites, `citations.hyphenateNames: false`). Each is read run
   *  of letters by run of letters. */
  names?: readonly string[];
}

interface CompiledRules {
  id: number;
  /** Break offsets by lower-cased word, for an entry in lower case. */
  anyCase: Map<string, readonly number[]>;
  /** The same for an entry with an initial capital, and the names. */
  capitalised: Map<string, readonly number[]>;
  keepCapitalised: boolean;
  /** The ruled form of each token under these rules, per locale: a book
   *  whose builds alternate between two sets (with and without the cited
   *  names) keeps both. `wordMemo` holds the dictionary's own result. */
  memo: Map<HyphenationLocale, Map<string, string>>;
}

const NO_POINTS: readonly number[] = [];
/** A run of letters and combining marks, the middle dot of an `l·l` inside
 *  it: what an exception matches and what a capital opens. */
const LETTER_RUN_RE = /(?:[\p{L}\p{M}]|(?<=[lL])·(?=[lL]))+/gu;
const CAPITAL_START_RE = /^[\p{Lu}\p{Lt}]/u;

/** An entry's word (its hyphens removed) and the offsets of its points. */
function readException(entry: string): { word: string; points: number[] } {
  let word = '';
  const points: number[] = [];
  for (const ch of entry) {
    if (ch !== '-') word += ch;
    else if (word.length > 0 && points[points.length - 1] !== word.length) points.push(word.length);
  }
  return { word, points: points.filter((p) => p < word.length) };
}

function compileRules(rules: HyphenationRules, id: number): CompiledRules {
  const anyCase = new Map<string, readonly number[]>();
  const capitalised = new Map<string, readonly number[]>();
  // Names first: an entry of the list for the same word decides.
  for (const name of rules.names ?? []) {
    for (const run of name.normalize('NFC').match(LETTER_RUN_RE) ?? []) {
      if (CAPITAL_START_RE.test(run)) capitalised.set(run.toLowerCase(), NO_POINTS);
    }
  }
  for (const entry of rules.exceptions ?? []) {
    const { word, points } = readException(entry);
    if (word === '') continue;
    (CAPITAL_START_RE.test(word) ? capitalised : anyCase).set(word.toLowerCase(), points.length > 0 ? points : NO_POINTS);
  }
  return { id, anyCase, capitalised, keepCapitalised: rules.capitalized === false, memo: new Map() };
}

/** Rule sets by their canonical text: equal rules share one id, which the
 *  measurement cache key carries (`measure/cache.ts`). */
const internedRules = new Map<string, CompiledRules>();
let nextRulesId = 1;
let activeRules: CompiledRules | undefined;

/**
 * Set the rules {@link hyphenateText} applies to the dictionary's result:
 * the document's, on every build (`initHyphenator`); a call with none, or
 * with rules that ask for nothing, clears the ones of the build before. A
 * host that measures text outside `buildDocument` sets them as it sets the
 * locale ({@link setHyphenationLocale}).
 */
export function setHyphenationRules(rules?: HyphenationRules): void {
  const exceptions = normalizeHyphenationExceptions(rules?.exceptions);
  const names = rules?.names && rules.names.length > 0 ? [...new Set(rules.names)].sort() : undefined;
  const keepCapitalised = rules?.capitalized === false;
  const next = exceptions || names || keepCapitalised
    ? internRules({ ...(exceptions ? { exceptions } : {}), ...(names ? { names } : {}), ...(keepCapitalised ? { capitalized: false } : {}) })
    : undefined;
  activeRules = next;
}

function internRules(rules: HyphenationRules): CompiledRules {
  const key = JSON.stringify([rules.exceptions ?? [], rules.names ?? [], rules.capitalized === false]);
  let compiled = internedRules.get(key);
  if (!compiled) {
    // A host that edits its list word by word interns one set per edit.
    if (internedRules.size >= 256) internedRules.clear();
    compiled = compileRules(rules, nextRulesId++);
    internedRules.set(key, compiled);
  }
  return compiled;
}

/** An id of the active rule set, `''` when no rule is set: lines measured
 *  under one set of rules are not reused under another. */
export function getHyphenationRulesKey(): string {
  return activeRules ? `r${activeRules.id}` : '';
}

/** The points a rule gives `run` (a run of letters), or undefined when no
 *  rule names it and the dictionary's stand. */
function ruledPoints(run: string, rules: CompiledRules): readonly number[] | undefined {
  const capital = CAPITAL_START_RE.test(run);
  const key = run.normalize('NFC').toLowerCase();
  const points = (capital ? rules.capitalised.get(key) : undefined) ?? rules.anyCase.get(key);
  if (points) return points.length > 0 && key.length !== run.length ? NO_POINTS : points;
  return capital && rules.keepCapitalised ? NO_POINTS : undefined;
}

/**
 * `hyphenated` — the dictionary's division of `word` — under `rules`: in
 * each run of letters a rule names, the dictionary's points are dropped and
 * the entry's own, if it has some, put in. A run next to a soft hyphen the
 * author typed is left alone: that occurrence is already decided.
 */
function withHyphenationRules(word: string, hyphenated: string, rules: CompiledRules): string {
  let edits: Array<{ start: number; end: number; points: readonly number[] }> | undefined;
  for (const m of word.matchAll(LETTER_RUN_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    if (word[start - 1] === SOFT_HYPHEN || word[end] === SOFT_HYPHEN) continue;
    const points = ruledPoints(m[0], rules);
    if (points) (edits ??= []).push({ start, end, points });
  }
  if (!edits) return hyphenated;
  let out = '';
  let j = 0;
  let e = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    while (e < edits.length && edits[e]!.end <= j) e++;
    const edit = edits[e];
    const inside = edit !== undefined && j > edit.start && j < edit.end;
    if (j < word.length && ch === word[j]) {
      if (inside && edit.points.includes(j - edit.start)) out += SOFT_HYPHEN;
      out += ch;
      j++;
    } else if (!(inside && ch === SOFT_HYPHEN)) {
      // What the dictionary added outside the run (a point, a slash joint).
      out += ch;
    }
  }
  return out;
}

const APOSTROPHE_RE = /['’]/;
const LETTER_RE = /[\p{L}\p{M}]/u;
/** Dictionaries whose divisions {@link withoutApostropheBreaks} checks.
 *  Catalan has its own word runs ({@link hyphenateCatalan}). */
const APOSTROPHE_LOCALES: ReadonlySet<HyphenationLocale> = new Set(['en-us', 'it', 'fr']);
/** Languages whose apostrophe marks an elision (`dell’acqua`, `jusqu’à`):
 *  the elided word stays with the word it leans on (#835). */
const ELISION_LOCALES: ReadonlySet<HyphenationLocale> = new Set(['it', 'fr']);
/** A vowel letter, accents stripped: the `u` of `qu` is not one. */
const VOWEL_RE = /[aeiouy]/;

/** Whether `letters` hold a vowel of their own, the `u` after `q` not
 *  counted: `l`, `st`, `qu` do not; `jourd` does. */
function syllabic(letters: string): boolean {
  return VOWEL_RE.test(letters.normalize('NFD').toLowerCase().replace(/qu/g, 'q'));
}

/**
 * `hyphenated` — the dictionary's division of `word` — without the breaks
 * that leave too few letters beside an apostrophe (#669). hypher takes the
 * apostrophe for a character of the word and counts it towards the least it
 * leaves on each side of a break, so `m's` passes for three and the English
 * dictionary gives `ar-m's`, `is-n't`, `could-n't`, `o'-clock`. A break
 * stays when `leftmin` letters stand before it and `rightmin` after it in
 * its run of letters and apostrophes, the apostrophes not counted
 * (`per-son's`, `moth-er's`).
 *
 * With `elision` (Italian, French) the apostrophe stands for a dropped
 * vowel, and the patterns, reading `dellacqua`, split the consonants before
 * it from their word: `del-l’acqua`, `que-st’anno`, `jus-qu’à`. A break is
 * dropped when the letters between it and an apostrophe make no syllable,
 * and right after an apostrophe; the next word divides as usual
 * (`dell’ac-qua`, `au-jourd’hui`) (#835). A soft hyphen `word` carries
 * stays.
 */
function withoutApostropheBreaks(word: string, hyphenated: string, leftmin: number, rightmin: number, elision = false): string {
  if (hyphenated.length === word.length) return hyphenated;
  /** Letters of the run of letters and apostrophes from `from` on, walking
   *  by `step`, and whether the run holds an apostrophe. */
  const run = (from: number, step: 1 | -1): { letters: number; apostrophe: boolean } => {
    let letters = 0;
    let apostrophe = false;
    for (let k = from; k >= 0 && k < word.length; k += step) {
      const ch = word[k]!;
      if (APOSTROPHE_RE.test(ch)) apostrophe = true;
      else if (LETTER_RE.test(ch)) letters++;
      else break;
    }
    return { letters, apostrophe };
  };
  /** Whether the letters from `from` up to an apostrophe make no syllable
   *  (false when no apostrophe ends them). */
  const elidedConsonants = (from: number): boolean => {
    for (let k = from; k < word.length; k++) {
      const ch = word[k]!;
      if (APOSTROPHE_RE.test(ch)) return !syllabic(word.slice(from, k));
      if (!LETTER_RE.test(ch)) return false;
    }
    return false;
  };
  let out = '';
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    if (ch === SOFT_HYPHEN && word[j] !== SOFT_HYPHEN) {
      // A break the dictionary added before `word[j]`.
      const before = run(j - 1, -1);
      const after = run(j, 1);
      if ((before.apostrophe || after.apostrophe) && (before.letters < leftmin || after.letters < rightmin)) continue;
      if (elision && (APOSTROPHE_RE.test(word[j - 1] ?? '') || elidedConsonants(j))) continue;
      out += ch;
      continue;
    }
    out += ch;
    if (j < word.length && ch === word[j]) j++;
  }
  return out;
}

/** A Catalan word run: letters and apostrophes, with the middle dot of an
 *  ela geminada (`l·l`) kept inside the word. hypher's own word class stops
 *  at the dot, so `il·lusió` would reach the patterns as `il` and `lusió`.
 *  A soft hyphen the author typed is of the run too, as in hypher's class:
 *  the run that holds one is left as written (#700). */
const CATALAN_WORD_RE = /(?:[\p{L}\p{M}'’\u00AD]|(?<=[lL])·(?=[lL]))+/gu;
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
    // A word with a soft hyphen its author typed gets no other point, as
    // under every other dictionary (#700).
    if (run.length < MIN_WORD_LENGTH || run.includes(SOFT_HYPHEN)) return run;
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

const WORD_CHARACTER_END_RE = /[\p{L}\p{M}\p{N}]$/u;
const WORD_CHARACTER_START_RE = /^[\p{L}\p{M}\p{N}]/u;

/**
 * Whether the soft hyphen typed at `at` in `text` is a break opportunity
 * (#700): only between two letters, combining marks or digits. One typed at
 * the edge of a word, after an opening bracket or quotation mark, or before
 * closing punctuation (`­Alice`, `(­Alice)`, `Alice­,`) breaks nothing and
 * prints no hyphen: the line would end on a hyphen after a whole word, or on
 * one its bracket carries. The word it stands in still gets no dictionary
 * point, so a soft hyphen before the first letter keeps that occurrence of
 * the word whole. Of soft hyphens typed in a row, the first counts.
 */
export function softHyphenBreaks(text: string, at: number): boolean {
  if (at <= 0 || text[at - 1] === SOFT_HYPHEN) return false;
  let next = at + 1;
  while (text[next] === SOFT_HYPHEN) next++;
  return WORD_CHARACTER_END_RE.test(text.slice(Math.max(0, at - 2), at)) && WORD_CHARACTER_START_RE.test(text.slice(next, next + 2));
}

/**
 * `hyphenated` — `source` as written, or with the dictionary's soft hyphens
 * and slash joints added — without the soft hyphens of `source` that are no
 * break ({@link softHyphenBreaks}), for a breaker that takes every soft
 * hyphen it is given (pretext, the design text's word cutter). The
 * dictionary's own points stay.
 */
export function withoutEdgeSoftHyphens(source: string, hyphenated: string = source): string {
  if (!source.includes(SOFT_HYPHEN)) return hyphenated;
  let out = '';
  let j = 0;
  for (let i = 0; i < hyphenated.length; i++) {
    const ch = hyphenated[i]!;
    if (j < source.length && ch === source[j]) {
      if (ch !== SOFT_HYPHEN || softHyphenBreaks(source, j)) out += ch;
      j++;
    } else {
      out += ch;
    }
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
  // The ideographic space U+3000 is a character of CJK text, not a space.
  return code === 0x20 || (code >= 0x09 && code <= 0x0d) || code === 0xa0 || code === 0x1680
    || (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f
    || code === 0x205f || code === 0xfeff;
}
