// Hyphenation exception lists as files, to share them between books and
// people: plain text, one word per line, a hyphen at each break it may
// take. Pure, so it stays testable.

/** The file a list exports to: a comment naming its language, then one
 *  word per line. */
export function formatExceptionsFile(words: readonly string[], locale: string): string {
  return [`# Postext hyphenation exceptions (${locale})`, '# One word per line, a hyphen at each break: hy-phen-ation', ...words].join('\n') + '\n';
}

/**
 * The words of an exception file. Reads what `formatExceptionsFile`
 * writes, and the usual shapes such lists come in: words separated by new
 * lines, commas, semicolons or spaces; `#`, `%` and `//` comment lines; a
 * TeX `\hyphenation{…}` block; a JSON list of words, or lists keyed by
 * language (all taken); breaks marked with a hyphen, a soft hyphen, a
 * hyphenation point or `=`; and tilde marks: `~` (one or more, a ranking)
 * at a break, a leading `~` for a word never divided. A word repeated keeps
 * its last form. Words the engine cannot hold are left to it, which drops
 * them (`normalizeHyphenationExceptions`).
 */
export function parseExceptionsFile(text: string): string[] {
  const trimmed = text.replace(/^﻿/, '').trim();
  const fromJson = trimmed.startsWith('[') || trimmed.startsWith('{') ? jsonWords(trimmed) : undefined;
  const raw = fromJson ?? trimmed
    .split(/\r?\n/)
    .filter((line) => !/^\s*([#%]|\/\/)/.test(line))
    .join('\n')
    .replace(/\\hyphenation\s*\{([^}]*)\}/g, '$1')
    .split(/[\s,;]+/);
  const out: string[] = [];
  for (const entry of raw) {
    let word = entry.trim();
    // A leading tilde keeps the word whole; the others mark breaks.
    word = word.startsWith('~') ? word.replace(/~+/g, '') : word.replace(/~+/g, '-');
    word = word.replace(/[­‧=]/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
    if (word !== '') out.push(word);
  }
  return mergeExceptions([], out);
}

/** The words of a JSON list, or of lists keyed by language. Undefined when
 *  the text is not JSON. */
function jsonWords(text: string): string[] | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((w): w is string => typeof w === 'string') : []);
  if (Array.isArray(data)) return strings(data);
  if (typeof data === 'object' && data !== null) return Object.values(data).flatMap(strings);
  return undefined;
}

/** `current` with `added` merged in: an added entry replaces the entry for
 *  the same word written the same way (its breaks aside); the rest keep
 *  their order. Case is kept apart, as the engine reads it: `Rose` and
 *  `rose` are two entries. */
export function mergeExceptions(current: readonly string[], added: readonly string[]): string[] {
  const byWord = new Map<string, string>();
  for (const w of [...current, ...added]) {
    const bare = w.replace(/-/g, '');
    byWord.delete(bare);
    byWord.set(bare, w);
  }
  return [...byWord.values()];
}
