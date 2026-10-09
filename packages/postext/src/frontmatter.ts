import matter from 'gray-matter';
import type { DocumentMetadata } from './types';
import { languageOf, localeScript } from './locale';

export interface ParsedFrontmatter {
  metadata: DocumentMetadata;
  content: string;
  /** Character offset in the original markdown where `content` begins. */
  contentOffset: number;
  /** Source range of every top-level field's value (quotes excluded), keyed
   *  by field name — what a design element such as `{title}` maps back to.
   *  Absent when there is no frontmatter block. */
  fieldSources?: Record<string, { start: number; end: number }>;
  /** Set when the block does not parse (YAML a reader is still typing, an
   *  unclosed quote): `metadata` is then empty and `content` is the text
   *  after the block's closing line, as with a block that parses. */
  error?: FrontmatterError;
}

/** Why a front-matter block could not be read, and where it is. */
export interface FrontmatterError {
  /** The parser's reason, with the line and column it stopped at
   *  (`unexpected end of the stream within a double quoted scalar (3:1)`). */
  message: string;
  /** The block's source range, from its opening `---` to the end of its
   *  closing line (or of the text, when it is never closed). */
  sourceStart: number;
  sourceEnd: number;
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

/**
 * The locale a date is written in for a document in `locale`: the tag
 * itself, with two Unicode extensions added where it names none.
 * - Arabic is pinned to the Gregorian calendar (`-u-ca-gregory`): a runtime
 *   may default a region to the Hijri one (`ar-SA` to Umm al-Qura in some
 *   ICU versions), and a book prints the date its front matter gives. A tag
 *   that names a calendar keeps it: `ar-u-ca-islamic` writes
 *   `23 ربيع الآخر 1448 هـ`.
 * - `numberingSystem` (`'arab'`, `'latn'`…), when given, sets the digits —
 *   the hook for the document's digit system, so a date's digits follow the
 *   page numbers' (`٤ أكتوبر ٢٠٢٦` where those are Arabic-Indic). A tag
 *   that names its digits (`ar-EG-u-nu-latn`) keeps them; with neither, the
 *   runtime's default for the tag applies (bare `ar`: 0–9; `ar-EG`: ٠–٩).
 * A tag the runtime rejects is returned as given.
 */
export function dateLocaleOf(locale: string, numberingSystem?: string): string {
  const arabic = languageOf(locale) === 'ar';
  if (!arabic && !numberingSystem) return locale;
  try {
    const tag = new Intl.Locale(locale.trim().replace(/_/g, '-'));
    const options: Intl.LocaleOptions = {};
    if (arabic && !tag.calendar) options.calendar = 'gregory';
    if (numberingSystem && !tag.numberingSystem) options.numberingSystem = numberingSystem;
    return Object.keys(options).length > 0 ? new Intl.Locale(tag, options).toString() : locale;
  } catch {
    return locale;
  }
}

/** The separator of a list value (`author: [A, B]`): the Arabic comma in a
 *  language written in Arabic script, a comma elsewhere. */
function listSeparator(locale: string | undefined): string {
  return locale && localeScript(locale) === 'Arab' ? '، ' : ', ';
}

/** `YYYY-MM-DD` of a date's UTC calendar day. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The text a metadata value prints as. YAML frontmatter is typed —
 * `title: 1984` parses as a number, `publishDate: 2026-09-24` as a `Date`,
 * `author: [Ana, Luis]` as a list — so a value is coerced rather than
 * dropped: strings as they are, numbers and booleans as written, a date as
 * its calendar day (long form in `locale` — see {@link dateLocaleOf} for
 * the calendar and the digits, which `numberingSystem` may set — ISO
 * `YYYY-MM-DD` without one), a list as its items joined by `, ` (`، ` in
 * an Arabic-script language). `undefined` for anything else (an object,
 * `null`, an invalid date).
 */
export function metadataText(value: unknown, locale?: string, numberingSystem?: string): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined;
    if (!locale) return isoDay(value);
    // YAML dates are UTC midnights: format in UTC so the day never shifts
    // with the reader's time zone.
    try {
      return new Intl.DateTimeFormat(dateLocaleOf(locale, numberingSystem), { dateStyle: 'long', timeZone: 'UTC' }).format(value);
    } catch {
      return isoDay(value);
    }
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => metadataText(v, locale, numberingSystem)).filter((v): v is string => v !== undefined && v !== '');
    return items.length > 0 ? items.join(listSeparator(locale)) : undefined;
  }
  return undefined;
}

/** `metadata` with the printed fields (`title`, `subtitle`, `author`,
 *  `publishDate`) coerced to text by {@link metadataText}; a field that has
 *  no text form is dropped. Other keys are kept as parsed. `numberingSystem`
 *  sets the digits of a date (see {@link dateLocaleOf}). */
export function normalizeMetadata(metadata: DocumentMetadata, locale?: string, numberingSystem?: string): DocumentMetadata {
  let out: DocumentMetadata | undefined;
  for (const key of METADATA_TEXT_FIELDS) {
    const value: unknown = metadata[key];
    if (value === undefined || typeof value === 'string') continue;
    out ??= { ...metadata };
    const text = metadataText(value, locale, numberingSystem);
    if (text === undefined) delete out[key];
    else out[key] = text;
  }
  return out ?? metadata;
}

/** gray-matter's split of a leading front-matter block, without parsing
 *  it: the block opens with `---` (a fourth `-` makes it no block), the rest
 *  of that line names its language, and it closes at the next line starting
 *  with `---`; the body is what follows, minus one line break. `undefined`
 *  when the text has no block. */
function splitFrontmatter(markdown: string): { blockEnd: number; content: string } | undefined {
  if (!markdown.startsWith('---') || markdown.charAt(3) === '-') return undefined;
  let pos = 3;
  // As gray-matter reads it: up to the first line break (all but the last
  // character when there is none).
  const rest = markdown.slice(pos);
  pos += rest.slice(0, rest.search(/\r?\n/)).length;
  const close = markdown.indexOf('\n---', pos);
  if (close === -1) return { blockEnd: markdown.length, content: '' };
  let start = close + 4;
  const lineEnd = markdown.indexOf('\n', start);
  const blockEnd = lineEnd === -1 ? markdown.length : lineEnd + 1;
  if (markdown[start] === '\r') start++;
  if (markdown[start] === '\n') start++;
  return { blockEnd, content: markdown.slice(start) };
}

/** The YAML reason of a parse failure, with the line (in `markdown`) and
 *  column it stopped at when the parser gives them. */
function frontmatterErrorMessage(error: unknown): string {
  const e = error as { reason?: unknown; message?: unknown; mark?: { line?: unknown; column?: unknown } } | null;
  const reason = typeof e?.reason === 'string' && e.reason ? e.reason : typeof e?.message === 'string' ? e.message.split('\n')[0]! : String(error);
  const line = e?.mark?.line;
  const column = e?.mark?.column;
  // The YAML text begins with the line break that ends the opening `---`
  // line, so its line k is the document's line k + 1.
  return typeof line === 'number' && typeof column === 'number' ? `${reason} (${line + 1}:${column + 1})` : reason;
}

/** gray-matter caches a text before parsing it, so a text whose block
 *  throws is cached half-made: asked again, it comes back unparsed, block
 *  and all, with no error. */
function forgetFailedParse(markdown: string): void {
  const cache = (matter as unknown as { cache?: Record<string, unknown> }).cache;
  if (cache) delete cache[markdown.replace(/^\uFEFF/, '')];
}

/**
 * The front matter of `markdown` and the text after it. Never throws: a
 * block that does not parse (YAML being typed, an unclosed quote) gives no
 * metadata, the text after the block as `content`, and the reason in
 * `error` — `collectContentWarnings` reports it as `invalidFrontmatter`.
 */
export function extractFrontmatter(markdown: string): ParsedFrontmatter {
  let data: unknown;
  let content: string;
  let error: FrontmatterError | undefined;
  try {
    ({ data, content } = matter(markdown));
  } catch (e) {
    forgetFailedParse(markdown);
    const bom = markdown.startsWith('\uFEFF') ? 1 : 0;
    const split = splitFrontmatter(markdown.slice(bom));
    data = {};
    content = split ? split.content : markdown.slice(bom);
    error = { message: frontmatterErrorMessage(e), sourceStart: bom, sourceEnd: bom + (split?.blockEnd ?? 0) };
  }
  // gray-matter strips the leading frontmatter block and one trailing newline.
  // Recover the body offset by searching for the content's prefix — fall back
  // to 0 when there is no frontmatter (content === markdown).
  let contentOffset = 0;
  if (content !== markdown) {
    const idx = markdown.indexOf(content);
    if (idx >= 0) contentOffset = idx;
  }
  const fieldSources = content !== markdown && !error ? frontmatterFieldSources(markdown) : undefined;
  // A block of YAML that is not a mapping (a bare list or scalar) names no
  // fields.
  const metadata = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as DocumentMetadata) : {};
  return { metadata, content, contentOffset, ...(fieldSources ? { fieldSources } : {}), ...(error ? { error } : {}) };
}
