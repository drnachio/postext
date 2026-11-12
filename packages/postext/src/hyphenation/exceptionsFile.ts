// Hyphenation exception lists as files (#1530): read from the shapes such
// lists come in (plain text, TeX, JSON), written one word per line, and
// merged into `bodyText.hyphenation`. Pure, shared by the Sandbox's Import
// and Export and the command line's `--hyphenation-exceptions`.

import type { HyphenationConfig } from '../types.js';
import { normalizeHyphenationExceptions } from './hyphenationExceptions.js';
import { matchHyphenationLocale } from './locale.js';

/** The key of a JSON exception file that stands for every language: its
 *  list goes to `exceptions`. An empty key reads the same. */
export const ALL_LANGUAGES_KEY = '*';

/** What an exception file holds. */
export interface HyphenationExceptionsFile {
  /** The words of a list that names no language (plain text, a TeX
   *  `\hyphenation{…}` block, a JSON array): the reader decides which list
   *  they go to. */
  words: string[];
  /** The lists of a JSON object, by its keys: a language tag, or
   *  {@link ALL_LANGUAGES_KEY} for every language. */
  byLanguage: Record<string, string[]>;
  /** Entries read and left out: what the engine cannot hold (digits,
   *  punctuation, no letter). */
  dropped: string[];
}

/** A soft hyphen, a hyphenation point (U+2027), a Unicode hyphen (U+2010)
 *  or `=`: other ways of marking a break. The middle dot of a Catalan
 *  `l·l` (U+00B7) is a letter of the word, not a mark. */
const BREAK_MARKS = /[­‧‐=]/g;
/** A comment line of a plain list. */
const COMMENT_LINE = /^\s*(?:#|%|\/\/)/;
const TEX_BLOCK = /\\hyphenation\s*\{([^}]*)\}/g;

/** One entry as the engine writes it: a hyphen at each break. A leading
 *  `~` keeps the word whole; other tildes (one or more, a ranking some
 *  page-layout programs write) mark breaks. */
function readEntry(raw: string): string {
  const entry = raw.trim();
  if (entry.startsWith('~')) return entry.replace(/[~­‧‐=-]+/g, '');
  return entry.replace(/~+/g, '-').replace(BREAK_MARKS, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}

/** The entries of a plain list, or of the `\hyphenation{…}` blocks of a
 *  TeX file when it has some (so `\documentclass{book}` is no word). */
function textEntries(text: string): string[] {
  if (/\\hyphenation\s*\{/.test(text)) {
    // TeX comments run from an unescaped % to the end of the line.
    const code = text.replace(/(^|[^\\])%.*$/gm, '$1');
    return [...code.matchAll(TEX_BLOCK)].flatMap((m) => m[1]!.split(/[\s,;]+/));
  }
  return text.split(/\r?\n/).filter((line) => !COMMENT_LINE.test(line)).join('\n').split(/[\s,;]+/);
}

/** The key that tells two entries for one word apart from two words: the
 *  word without its breaks. Case is kept, as the engine reads it (`Rose`
 *  and `rose` are two entries). */
const wordOf = (entry: string): string => entry.normalize('NFC').replace(/-/g, '');

/** `entries` read one by one: the kept ones in order, a word given twice
 *  in its last form, and the dropped ones. */
function readList(entries: readonly unknown[], dropped: string[]): string[] {
  const byWord = new Map<string, string>();
  for (const raw of entries) {
    if (typeof raw !== 'string') {
      if (raw !== null && raw !== undefined) dropped.push(String(raw));
      continue;
    }
    if (raw.trim() === '') continue;
    const entry = readEntry(raw);
    const kept = entry === '' ? undefined : normalizeHyphenationExceptions([entry])?.[0];
    if (kept === undefined) {
      dropped.push(raw.trim());
      continue;
    }
    byWord.delete(wordOf(kept));
    byWord.set(wordOf(kept), kept);
  }
  return [...byWord.values()];
}

/** The JSON of `text`, or undefined when it is none. */
function jsonOf(text: string): unknown {
  if (!text.startsWith('[') && !text.startsWith('{')) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The lists of an exception file, in any of the shapes such lists come in:
 * words separated by new lines, commas, semicolons or spaces, with `#`, `%`
 * and `//` comment lines; the `\hyphenation{…}` blocks of a TeX file (only
 * those); a JSON array of words; or a JSON object of lists keyed by
 * language tag, `"*"` for every language. A break may be marked with a
 * hyphen, a soft hyphen, a hyphenation point (U+2027), `=` or tildes, and a
 * leading `~` keeps the word whole. A word given twice keeps its last form.
 */
export function parseHyphenationExceptionsFile(text: string): HyphenationExceptionsFile {
  const trimmed = text.replace(/^﻿/, '').trim();
  const dropped: string[] = [];
  const data = jsonOf(trimmed);
  if (Array.isArray(data)) return { words: readList(data, dropped), byLanguage: {}, dropped };
  if (typeof data === 'object' && data !== null) {
    const merged = new Map<string, unknown[]>();
    for (const [rawKey, value] of Object.entries(data)) {
      const key = rawKey.trim() === '' ? ALL_LANGUAGES_KEY : rawKey.trim();
      const entries = Array.isArray(value) ? value : typeof value === 'string' ? textEntries(value) : undefined;
      if (!entries) {
        dropped.push(rawKey);
        continue;
      }
      merged.set(key, [...(merged.get(key) ?? []), ...entries]);
    }
    const byLanguage: Record<string, string[]> = {};
    for (const [key, entries] of merged) {
      const words = readList(entries, dropped);
      if (words.length > 0) byLanguage[key] = words;
    }
    return { words: [], byLanguage, dropped };
  }
  return { words: readList(textEntries(trimmed), dropped), byLanguage: {}, dropped };
}

/** An exception list as a file: two comment lines (whose list it is, how
 *  to read it), then one word per line. {@link parseHyphenationExceptionsFile}
 *  reads it back as it was. */
export function formatHyphenationExceptionsFile(words: readonly string[], language?: string): string {
  const whose = language && language !== ALL_LANGUAGES_KEY ? `language ${language}` : 'all languages';
  return [
    `# Postext hyphenation exceptions, ${whose}`,
    '# One word per line. Hyphens mark the only places a word may be divided (hy-phen-ation); a word without one is never divided.',
    ...words,
  ].join('\n') + '\n';
}

/** What {@link mergeHyphenationExceptions} gives. */
export interface HyphenationExceptionsMerge {
  /** The merged list, as the engine keeps it (checked, sorted). */
  words: string[];
  /** Words the list did not have. */
  added: number;
  /** Words the list had in another form, now in the new one. */
  replaced: number;
}

/** `current` with `incoming` merged in: an incoming entry replaces the
 *  entry for the same word (`desa-rro-llo` replaces `de-sa-rro-llo`), the
 *  rest is kept. */
export function mergeHyphenationExceptions(current: readonly string[], incoming: readonly string[]): HyphenationExceptionsMerge {
  const byWord = new Map<string, string>();
  for (const entry of normalizeHyphenationExceptions(current) ?? []) byWord.set(wordOf(entry), entry);
  const before = new Map(byWord);
  // One by one, in order: of two forms of one word, the later wins.
  for (const raw of incoming) {
    const entry = normalizeHyphenationExceptions([raw])?.[0];
    if (entry !== undefined) byWord.set(wordOf(entry), entry);
  }
  let added = 0;
  let replaced = 0;
  for (const [word, entry] of byWord) {
    const was = before.get(word);
    if (was === undefined) added++;
    else if (was !== entry) replaced++;
  }
  return { words: normalizeHyphenationExceptions([...byWord.values()]) ?? [], added, replaced };
}

/** The dictionary a language's list is kept under, or undefined for a
 *  language with no patterns of its own. */
const dictionaryOf = (tag: string): string | undefined => matchHyphenationLocale(tag.trim());

const isAll = (language: string | undefined): boolean => language === undefined || language.trim() === '' || language === ALL_LANGUAGES_KEY;

/** The list a language's text is divided with, as written in `hyphenation`:
 *  `exceptions` for every language ({@link ALL_LANGUAGES_KEY} or none), else
 *  the `exceptionsByLanguage` lists of every tag that shares its
 *  dictionary. */
export function hyphenationExceptionsFor(hyphenation: HyphenationConfig | undefined, language?: string): string[] {
  if (isAll(language)) return [...(hyphenation?.exceptions ?? [])];
  const dictionary = dictionaryOf(language!);
  if (dictionary === undefined) return [];
  return Object.entries(hyphenation?.exceptionsByLanguage ?? {})
    .filter(([tag, list]) => Array.isArray(list) && dictionaryOf(tag) === dictionary)
    .flatMap(([, list]) => list);
}

/** `hyphenation` with one list replaced: `exceptions` for every language,
 *  else the language's list in `exceptionsByLanguage`, kept under the tag
 *  already written for its dictionary (other tags of that dictionary are
 *  merged into it). An empty list takes the field out. */
export function withHyphenationExceptions(hyphenation: HyphenationConfig | undefined, words: readonly string[] | undefined, language?: string): HyphenationConfig {
  const list = normalizeHyphenationExceptions(words ?? []);
  const next: HyphenationConfig = { ...hyphenation };
  if (isAll(language)) {
    if (list) next.exceptions = list;
    else delete next.exceptions;
    return next;
  }
  const dictionary = dictionaryOf(language!);
  if (dictionary === undefined) return next;
  const record: Record<string, string[]> = {};
  let key: string | undefined;
  for (const [tag, entries] of Object.entries(hyphenation?.exceptionsByLanguage ?? {})) {
    if (dictionaryOf(tag) === dictionary) key ??= tag;
    else record[tag] = entries;
  }
  if (list) record[key ?? language!.trim()] = list;
  if (Object.keys(record).length > 0) next.exceptionsByLanguage = record;
  else delete next.exceptionsByLanguage;
  return next;
}

/** What {@link mergeHyphenationExceptionsFile} gives. */
export interface HyphenationExceptionsFileMerge {
  hyphenation: HyphenationConfig;
  /** Words the lists did not have. */
  added: number;
  /** Words the lists had in another form. */
  replaced: number;
  /** Entries left out: the file's dropped ones, and the words of a list
   *  for a language with no patterns of its own. */
  dropped: number;
  /** The languages of the file with no patterns of their own (`el`, `ar`):
   *  their lists are left out. */
  unknownLanguages: string[];
}

/**
 * `hyphenation` with an exception file merged in: the file's unkeyed words
 * into the list of `language` (`exceptions` when it names none, or
 * {@link ALL_LANGUAGES_KEY}), each keyed list into its own (`"*"` into
 * `exceptions`), an entry replacing the entry for the same word.
 */
export function mergeHyphenationExceptionsFile(hyphenation: HyphenationConfig | undefined, file: HyphenationExceptionsFile, language?: string): HyphenationExceptionsFileMerge {
  let next: HyphenationConfig = { ...hyphenation };
  let added = 0;
  let replaced = 0;
  let dropped = file.dropped.length;
  const unknownLanguages: string[] = [];
  const into = (lang: string | undefined, words: readonly string[]) => {
    if (words.length === 0) return;
    if (!isAll(lang) && dictionaryOf(lang!) === undefined) {
      dropped += words.length;
      if (!unknownLanguages.includes(lang!)) unknownLanguages.push(lang!);
      return;
    }
    const merged = mergeHyphenationExceptions(hyphenationExceptionsFor(next, lang), words);
    next = withHyphenationExceptions(next, merged.words, lang);
    added += merged.added;
    replaced += merged.replaced;
  };
  into(language, file.words);
  for (const [key, words] of Object.entries(file.byLanguage)) into(key === ALL_LANGUAGES_KEY ? undefined : key, words);
  return { hyphenation: next, added, replaced, dropped, unknownLanguages };
}
