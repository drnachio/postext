import matter from 'gray-matter';
import type { DocumentMetadata } from './types';

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  content: string;
  /** Character offset in the original markdown where `content` begins. */
  contentOffset: number;
  /** Source range of every top-level field's value (quotes excluded), keyed
   *  by field name — what a design element such as `{title}` maps back to.
   *  Absent when there is no frontmatter block. */
  fieldSources?: Record<string, { start: number; end: number }>;
}

/** Offsets of the `key: value` values of a frontmatter block: line 1 is the
 *  opening `---`, the block ends at the next `---` line; a value is what
 *  follows the first colon, trimmed, minus surrounding quotes. */
export function frontmatterFieldSources(markdown: string): Record<string, { start: number; end: number }> | undefined {
  if (!/^---[ \t]*\r?\n/.test(markdown)) return undefined;
  const out: Record<string, { start: number; end: number }> = {};
  let pos = markdown.indexOf('\n') + 1;
  while (pos < markdown.length) {
    const nl = markdown.indexOf('\n', pos);
    const lineEnd = nl === -1 ? markdown.length : nl;
    const line = markdown.slice(pos, lineEnd).replace(/\r$/, '');
    if (/^(---|\.\.\.)[ \t]*$/.test(line)) break;
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m && !(m[1]! in out)) {
      let start = pos + line.indexOf(':') + 1;
      while (start < lineEnd && /[ \t]/.test(markdown[start]!)) start++;
      let end = pos + line.length;
      while (end > start && /[ \t]/.test(markdown[end - 1]!)) end--;
      if (end - start >= 2 && /^["']$/.test(markdown[start]!) && markdown[end - 1] === markdown[start]) {
        start++;
        end--;
      }
      out[m[1]!] = { start, end };
    }
    if (nl === -1) break;
    pos = nl + 1;
  }
  return out;
}

/** The metadata fields the engine prints (`{title}`, `{subtitle}`,
 *  `{author}`, `{publishDate}`; the PDF title and author). */
const METADATA_TEXT_FIELDS = ['title', 'subtitle', 'author', 'publishDate'] as const;

/** `YYYY-MM-DD` of a date's UTC calendar day. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The text a metadata value prints as. YAML frontmatter is typed —
 * `title: 1984` parses as a number, `publishDate: 2026-09-24` as a `Date`,
 * `author: [Ana, Luis]` as a list — so a value is coerced rather than
 * dropped: strings as they are, numbers and booleans as written, a date as
 * its calendar day (long form in `locale`, ISO `YYYY-MM-DD` without one),
 * a list as its items joined by `, `. `undefined` for anything else (an
 * object, `null`, an invalid date).
 */
export function metadataText(value: unknown, locale?: string): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    if (!locale) return isoDay(value);
    // YAML dates are UTC midnights: format in UTC so the day never shifts
    // with the reader's time zone.
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(value);
    } catch {
      return isoDay(value);
    }
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => metadataText(v, locale)).filter((v): v is string => v !== undefined && v !== '');
    return items.length > 0 ? items.join(', ') : undefined;
  }
  return undefined;
}

/** `metadata` with the printed fields (`title`, `subtitle`, `author`,
 *  `publishDate`) coerced to text by {@link metadataText}; a field that has
 *  no text form is dropped. Other keys are kept as parsed. */
export function normalizeMetadata(metadata: DocumentMetadata, locale?: string): DocumentMetadata {
  let out: DocumentMetadata | undefined;
  for (const key of METADATA_TEXT_FIELDS) {
    const value: unknown = metadata[key];
    if (value === undefined || typeof value === 'string') continue;
    out ??= { ...metadata };
    const text = metadataText(value, locale);
    if (text === undefined) delete out[key];
    else out[key] = text;
  }
  return out ?? metadata;
}

export function extractFrontmatter(markdown: string): ParsedFrontmatter {
  const { data, content } = matter(markdown);
  // gray-matter strips the leading frontmatter block and one trailing newline.
  // Recover the body offset by searching for the content's prefix — fall back
  // to 0 when there is no frontmatter (content === markdown).
  let contentOffset = 0;
  if (content !== markdown) {
    const idx = markdown.indexOf(content);
    if (idx >= 0) contentOffset = idx;
  }
  const fieldSources = content !== markdown ? frontmatterFieldSources(markdown) : undefined;
  return { metadata: data as DocumentMetadata, content, contentOffset, ...(fieldSources ? { fieldSources } : {}) };
}
