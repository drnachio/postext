// Which edition of a stored book the Books panel compiles (#1526): the one
// asked for by its language tag, else the one the record opens with, with
// the title that edition shows in the Books panel.

import { recordHasEdition, recordLocaleOf } from '../storage/projectEditions.js';
import { editionContentOf, editionTitleOf, type ProjectEditionContent, type ProjectRecord } from '../storage/projects.js';

export interface CompiledEdition {
  /** The edition's language tag. */
  locale: string;
  content: ProjectEditionContent;
  /** Its title: the edition's own from the bundle, unless the reader
   *  renamed the project (`titleEdited`). */
  name: string;
}

/** The edition of `record` in `locale` (compared without case), or the
 *  one it opens with; null when the record has no edition in `locale`.
 *  `uiLocale`: what a book that names no language is read as. */
export function compiledEdition(record: ProjectRecord, locale: string | undefined, uiLocale: string): CompiledEdition | null {
  const own = recordLocaleOf(record, uiLocale);
  if (locale !== undefined && !recordHasEdition(record, locale, uiLocale)) return null;
  const tag = locale ?? own;
  const content = editionContentOf(record, tag);
  if (!content) return null;
  const title = record.titleEdited ? undefined : editionTitleOf(record, tag);
  return { locale: content === record ? own : tag, content, name: title?.name ?? record.name };
}
