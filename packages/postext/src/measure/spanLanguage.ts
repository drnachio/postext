import type { InlineSpan } from '../parse/index.js';
import { shapingTagOf } from '../hyphenation/locale.js';
import { getMeasureLanguage } from './canvas.js';

/**
 * The language a run is measured in when it names its own (#764): the
 * `lang` of the innermost isolate around it that has one
 * (`:ltr[…]{lang=en}`), in the form a context takes it (`shapingTagOf`).
 * Undefined for a run that names none, which is measured in the language
 * in force, and in a document shaped in the host's language
 * (`bodyText.shapingLanguage: 'host'`), where no context is given one.
 */
export function spanShapingLanguage(span: InlineSpan): string | undefined {
  if (span.direction === undefined || getMeasureLanguage() === undefined) return undefined;
  let lang: string | undefined;
  for (let d: { lang?: string; outer?: unknown } | undefined = span.direction; d && lang === undefined; d = d.outer as typeof d) lang = d.lang;
  return lang === undefined ? undefined : shapingTagOf(lang);
}
