// Hyphenation exception files on the command line (#1530):
// `--hyphenation-exceptions [LANG=]FILE`, repeatable, merges the words of
// a file into the book's lists of words kept whole for that run, as the
// Sandbox's Import does.

import { readFileSync } from 'node:fs';
import {
  ALL_LANGUAGES_KEY,
  HYPHENATION_LOCALES,
  matchHyphenationLocale,
  mergeHyphenationExceptionsFile,
  parseHyphenationExceptionsFile,
  type BodyTextConfig,
  type PostextConfig,
} from 'postext';
import { CliError, UsageError } from './args';

const OPTION = '--hyphenation-exceptions';

/** `es=words.txt`, `*=words.txt` or `words.txt`: the language a plain
 *  list goes to (none: every language's) and the file. A prefix counts
 *  only when it reads as a language tag, so a file named `a=b.txt` is a
 *  file. */
export function parseExceptionsSpec(spec: string): { language?: string; path: string } {
  const m = /^(\*|[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*)=(.+)$/.exec(spec);
  if (!m) return { path: spec };
  const [, tag, path] = m as unknown as [string, string, string];
  if (tag === ALL_LANGUAGES_KEY) return { path };
  if (!matchHyphenationLocale(tag)) {
    throw new UsageError(`${OPTION} ${spec}: no hyphenation patterns for "${tag}", so it has no list of its own (the languages: ${HYPHENATION_LOCALES.join(', ')}); give the file without a language for every language's list`);
  }
  return { language: tag, path };
}

/** What a run of exception files did, for the log. */
export interface ExceptionFilesResult {
  config: PostextConfig;
  added: number;
  replaced: number;
}

/** `config` with each exception file of `specs` merged into its lists, in
 *  order: a plain list into the language named before `=` (every
 *  language's list without one), a JSON object of lists by its keys. What a
 *  file holds that the engine cannot is reported through `warn`. */
export function applyExceptionFiles(config: PostextConfig, specs: readonly string[], warn: (message: string) => void): ExceptionFilesResult {
  let hyphenation = config.bodyText?.hyphenation;
  let added = 0;
  let replaced = 0;
  for (const spec of specs) {
    const { language, path } = parseExceptionsSpec(spec);
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch (err) {
      throw new CliError(`${OPTION}: ${(err as Error).message}`);
    }
    const file = parseHyphenationExceptionsFile(text);
    const merged = mergeHyphenationExceptionsFile(hyphenation, file, language);
    hyphenation = merged.hyphenation;
    added += merged.added;
    replaced += merged.replaced;
    if (file.dropped.length > 0) {
      const shown = file.dropped.slice(0, 5).map((e) => `"${e}"`).join(', ');
      warn(`${path}: ${file.dropped.length} ${file.dropped.length === 1 ? 'entry is' : 'entries are'} not a word the dictionary can keep (letters and hyphens only), left out: ${shown}${file.dropped.length > 5 ? ', …' : ''}`);
    }
    if (merged.unknownLanguages.length > 0) {
      warn(`${path}: no hyphenation patterns for ${merged.unknownLanguages.map((l) => `"${l}"`).join(', ')}, so ${merged.unknownLanguages.length === 1 ? 'its list is' : 'their lists are'} left out`);
    }
  }
  if (specs.length === 0) return { config, added, replaced };
  const bodyText: BodyTextConfig = { ...config.bodyText };
  if (hyphenation && Object.keys(hyphenation).length > 0) bodyText.hyphenation = hyphenation;
  return { config: { ...config, bodyText }, added, replaced };
}
