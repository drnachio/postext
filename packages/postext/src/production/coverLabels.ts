/**
 * The words a cover prints of its own (#1667): the line naming the whole
 * work's ISBN above a volume's barcode, in the book's language, as the
 * ISBN agencies word it. A book in another language takes the English.
 */

const WORK_ISBN: Readonly<Record<string, string>> = {
  en: 'ISBN of the complete work',
  es: 'ISBN obra completa',
  ca: 'ISBN obra completa',
  fr: 'ISBN de l’ouvrage complet',
  it: 'ISBN opera completa',
  de: 'ISBN Gesamtwerk',
  pt: 'ISBN da obra completa',
  ja: '全巻 ISBN',
  zh: '全套书 ISBN',
  ar: 'ردمك العمل الكامل',
};

/** The caption of the whole work's ISBN in `locale` (a BCP 47 tag). */
export function workIsbnCaption(isbn: string, locale?: string): string {
  const lang = (locale ?? 'en').toLowerCase().split(/[-_]/)[0]!;
  return `${WORK_ISBN[lang] ?? WORK_ISBN.en} ${isbn.trim()}`;
}
