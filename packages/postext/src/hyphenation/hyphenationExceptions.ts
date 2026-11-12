import { matchHyphenationLocale } from './locale.js';

/** A letter or a combining mark. */
const LETTER_RE = /[\p{L}\p{M}]/u;
/** What an entry of `bodyText.hyphenation.exceptions` may hold: letters,
 *  combining marks, ASCII hyphens (its points) and the middle dot of a
 *  Catalan `l·l`. */
const EXCEPTION_RE = /^(?:[\p{L}\p{M}-]|(?<=[lL])·(?=[lL]))+$/u;

/**
 * The exception list of `bodyText.hyphenation.exceptions` as the engine
 * reads it (#699): each entry trimmed, one that holds anything but letters,
 * combining marks and ASCII hyphens (and the middle dot of a Catalan `l·l`)
 * or that has no letter dropped, duplicates removed, sorted, so equal lists
 * compare equal. Undefined when nothing is left. Kept apart from
 * `hyphenate.ts` so the configuration resolves without the dictionaries.
 */
export function normalizeHyphenationExceptions(entries: readonly unknown[] | undefined): string[] | undefined {
  if (!Array.isArray(entries)) return undefined;
  const out = new Set<string>();
  for (const raw of entries) {
    if (typeof raw !== 'string') continue;
    const entry = raw.trim().normalize('NFC');
    if (entry === '' || !EXCEPTION_RE.test(entry) || !LETTER_RE.test(entry)) continue;
    out.add(entry);
  }
  return out.size > 0 ? [...out].sort() : undefined;
}

/**
 * `bodyText.hyphenation.exceptionsByLanguage` as the engine reads it: each
 * list read by {@link normalizeHyphenationExceptions}, keyed by the
 * dictionary `dictionaryOf` gives its tag (tags sharing one are merged),
 * keys sorted. A tag with no dictionary of its own (`'el'`, `'ar'`, `'ja'`:
 * their text, when divided, is divided with the English patterns) has no
 * list, so a Greek list never reaches an English edition. Undefined when no
 * list is left.
 */
export function normalizeExceptionsByLanguage(
  record: unknown,
  dictionaryOf: (tag: string) => string | undefined = matchHyphenationLocale,
): Record<string, string[]> | undefined {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return undefined;
  const merged = new Map<string, unknown[]>();
  for (const [tag, list] of Object.entries(record)) {
    if (tag.trim() === '' || !Array.isArray(list)) continue;
    const key = dictionaryOf(tag.trim());
    if (key === undefined) continue;
    merged.set(key, [...(merged.get(key) ?? []), ...list]);
  }
  const out: Record<string, string[]> = {};
  for (const key of [...merged.keys()].sort()) {
    const words = normalizeHyphenationExceptions(merged.get(key));
    if (words) out[key] = words;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
