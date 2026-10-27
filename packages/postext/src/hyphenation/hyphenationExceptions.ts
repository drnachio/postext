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
