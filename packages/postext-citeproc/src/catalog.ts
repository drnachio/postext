import type { CitationStyleInfo } from 'postext';

/** The bundled styles, in the order a picker lists them: by citation
 *  system, then by name. Ids are the CSL repository's file names. */
export const STYLE_CATALOG: readonly CitationStyleInfo[] = [
  { id: 'apa', title: 'American Psychological Association 7th edition', short: 'APA 7', format: 'author-date', fields: 'psychology, education, social sciences' },
  { id: 'chicago-author-date', title: 'Chicago Manual of Style 18th edition (author-date)', short: 'Chicago (author-date)', format: 'author-date', fields: 'sciences, social sciences' },
  { id: 'harvard-cite-them-right', title: 'Cite Them Right 12th edition — Harvard', short: 'Harvard', format: 'author-date', fields: 'general, UK universities' },
  { id: 'iso690-author-date-en', title: 'ISO-690 (author-date, English)', short: 'ISO 690 (author-date)', format: 'author-date', fields: 'general, standards' },
  { id: 'iso690-author-date-es', title: 'ISO-690 (autor-fecha, español)', short: 'ISO 690 (autor-fecha)', format: 'author-date', fields: 'general, Spanish universities' },
  { id: 'china-national-standard-gb-t-7714-2025-author-date', title: 'China National Standard GB/T 7714-2025 (author-date)', short: 'GB/T 7714—2025 (著者-出版年)', format: 'author-date', fields: 'Chinese journals and theses' },
  { id: 'china-national-standard-gb-t-7714-2015-author-date', title: 'China National Standard GB/T 7714-2015 (author-date)', short: 'GB/T 7714—2015 (著者-出版年)', format: 'author-date', fields: 'Chinese journals and theses' },
  { id: 'modern-language-association', title: 'Modern Language Association 9th edition', short: 'MLA 9', format: 'author', fields: 'literature, languages, humanities' },
  { id: 'ieee', title: 'IEEE', short: 'IEEE', format: 'numeric', fields: 'engineering, computer science' },
  { id: 'elsevier-vancouver', title: 'Vancouver (Elsevier)', short: 'Vancouver', format: 'numeric', fields: 'medicine, health sciences' },
  { id: 'american-medical-association', title: 'American Medical Association 11th edition', short: 'AMA', format: 'numeric', fields: 'medicine' },
  { id: 'nature', title: 'Nature', short: 'Nature', format: 'numeric', fields: 'natural sciences' },
  { id: 'iso690-numeric-en', title: 'ISO-690 (numeric, English)', short: 'ISO 690 (numeric)', format: 'numeric', fields: 'general, standards' },
  { id: 'china-national-standard-gb-t-7714-2025-numeric', title: 'China National Standard GB/T 7714-2025 (numeric)', short: 'GB/T 7714—2025 (顺序编码)', format: 'numeric', fields: 'Chinese journals and theses' },
  { id: 'china-national-standard-gb-t-7714-2015-numeric', title: 'China National Standard GB/T 7714-2015 (numeric)', short: 'GB/T 7714—2015 (顺序编码)', format: 'numeric', fields: 'Chinese journals and theses' },
  { id: 'chicago-notes-bibliography', title: 'Chicago Manual of Style 18th edition (notes and bibliography)', short: 'Chicago (notes)', format: 'note', fields: 'history, humanities' },
  { id: 'oscola', title: 'OSCOLA (Oxford University Standard for Citation of Legal Authorities)', short: 'OSCOLA', format: 'note', fields: 'law' },
  { id: 'china-national-standard-gb-t-7714-2025-note', title: 'China National Standard GB/T 7714-2025 (note)', short: 'GB/T 7714—2025 (注释)', format: 'note', fields: 'Chinese humanities' },
  { id: 'china-national-standard-gb-t-7714-2015-note', title: 'China National Standard GB/T 7714-2015 (note)', short: 'GB/T 7714—2015 (注释)', format: 'note', fields: 'Chinese humanities' },
];

/** The CSL locales bundled, as a picker lists them. */
export const LOCALE_TAGS: readonly string[] = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-PT', 'pt-BR', 'ca-AD', 'nl-NL', 'zh-CN', 'zh-TW'];
