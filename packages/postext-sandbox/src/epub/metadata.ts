// The package metadata of the Sandbox's EPUB: the book's front matter,
// its configured language and a stable identifier per book.

import { canonicalLocaleTag, metadataText, type DocumentMetadata, type PostextConfig } from 'postext';
import { uuidV5, type EpubMetadata } from 'postext-epub';

/** The book on screen, for its identifier and fallback title. */
export type EpubBookIdentity =
  | { kind: 'project'; id: string; name?: string }
  | { kind: 'preset'; id: string; locale?: string; name?: string };

/** A front-matter value as text: a list joined, typed YAML coerced. */
function textOf(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const parts = value.map((v) => metadataText(v)?.trim()).filter((v): v is string => !!v);
    return parts.length > 0 ? parts.join(', ') : undefined;
  }
  return metadataText(value)?.trim() || undefined;
}

/** The book's authors: a YAML list, else one name. */
function creatorsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list.map((v) => metadataText(v)?.trim()).filter((v): v is string => !!v);
}

/** A `dc:date` (ISO 8601: a year, a month or a day) from a front-matter
 *  date, or undefined when it is not one. */
export function isoDateOf(value: unknown): string | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  return /^\d{4}(?:-\d{2}(?:-\d{2})?)?/.exec(text)?.[0];
}

/** The book's language as a BCP 47 tag: its `locale`, else the tag its
 *  hyphenation was asked for, else the patterns' own, else `fallback`. */
export function bookLanguageOf(config: PostextConfig, fallback: string): string {
  const h = config.bodyText?.hyphenation as { tag?: string; locale?: string } | undefined;
  return canonicalLocaleTag(config.locale) ?? canonicalLocaleTag(h?.tag) ?? canonicalLocaleTag(h?.locale) ?? canonicalLocaleTag(fallback) ?? 'en';
}

/** The identifier of a book the front matter does not give one: the same
 *  for every EPUB of the same project (or of a sample book in one
 *  language), so a reading system keeps its place across versions. */
export function sandboxBookIdentifier(identity: EpubBookIdentity): string {
  const name = identity.kind === 'project'
    ? `postext-sandbox:project:${identity.id}`
    : `postext-sandbox:preset:${identity.id}:${identity.locale ?? ''}`;
  return `urn:uuid:${uuidV5(name)}`;
}

/** The package metadata from the book's front matter (`title`,
 *  `subtitle`, `author`, `publishDate` or `date`, `isbn` or `identifier`,
 *  `publisher`, `rights`, `description`), its configured language and the
 *  book it is. */
export function epubMetadataOf(
  frontMatter: DocumentMetadata,
  config: PostextConfig,
  identity: EpubBookIdentity | null,
  uiLocale: string,
): EpubMetadata {
  const fm = frontMatter as Record<string, unknown>;
  const title = textOf(fm.title) ?? identity?.name?.trim() ?? 'Untitled';
  const identifier = textOf(fm.isbn) ?? textOf(fm.identifier) ?? (identity ? sandboxBookIdentifier(identity) : undefined);
  const date = isoDateOf(fm.publishDate ?? fm.date);
  const subtitle = textOf(fm.subtitle);
  const publisher = textOf(fm.publisher);
  const rights = textOf(fm.rights) ?? textOf(fm.copyright) ?? textOf(fm.license);
  const description = textOf(fm.description) ?? textOf(fm.abstract);
  const creators = creatorsOf(fm.author ?? fm.authors);
  return {
    title,
    language: bookLanguageOf(config, uiLocale),
    ...(subtitle ? { subtitle } : {}),
    ...(creators.length > 0 ? { creators } : {}),
    ...(identifier ? { identifier } : {}),
    ...(date ? { date } : {}),
    ...(publisher ? { publisher } : {}),
    ...(rights ? { rights } : {}),
    ...(description ? { description } : {}),
  };
}

/** The file name of the download: the title, in the PDF's spelling. */
export function epubFileName(title: string): string {
  const base = title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${base || 'book'}.epub`;
}
