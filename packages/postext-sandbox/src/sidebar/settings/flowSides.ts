'use client';

// The sides the settings call left and right, in a right-to-left book.
//
// In a book set right to left the engine lays the body out in a mirrored
// frame (#370): every side the body flow knows — a paragraph's `left`
// alignment, a float's `align`, a callout's stripe, a side column — is
// the flow's, and the flow's left is the sheet's right. `left` is the
// side a line starts on (#371). The panels keep the values and name each
// option after the side it lands on in such a book, so "Ragged right"
// reads "Ragged left" for the alignment an Arabic paragraph starts flush
// right with.

import { useSandboxSelector } from '../../context/SandboxContext';
import { documentDirection, documentLanguage } from '../../context/documentDirection';
import { defaultDocumentLocale } from '../../controls/hyphenation';

/** Whether the book's body runs right to left in a mirrored frame: a
 *  right-to-left direction (set, or the language's) on horizontal pages.
 *  A vertical book keeps its own frame. */
export function useRightToLeftFlow(): boolean {
  const uiLocale = useSandboxSelector((s) => s.locale);
  const direction = useSandboxSelector((s) => s.config.direction);
  const locale = useSandboxSelector((s) => s.config.locale);
  const hyphenationLocale = useSandboxSelector((s) => s.config.bodyText?.hyphenation?.locale);
  const vertical = useSandboxSelector((s) => s.config.layout?.writingMode === 'vertical-rl');
  if (vertical) return false;
  const language = documentLanguage({ locale, bodyText: { hyphenation: { locale: hyphenationLocale } } }, defaultDocumentLocale(uiLocale));
  return documentDirection(direction, language) === 'rtl';
}

/** The names of a `left` / `right` pair of options as they land on the
 *  sheet: swapped in a right-to-left book (see {@link useRightToLeftFlow}). */
export function flowSideLabels(rtl: boolean, left: string, right: string): { left: string; right: string } {
  return rtl ? { left: right, right: left } : { left, right };
}
