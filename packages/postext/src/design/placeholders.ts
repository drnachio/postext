import type { DigitSystem, DocumentMetadata, PostextConfig } from '../types';
import { withDigits } from '../arabicNumerals';
import type { VDTPage } from '../vdt';
import { chineseInformalStyle, formatCounter, formatNumeral } from '../numbering';
import { metadataText } from '../frontmatter';
import {
  resolvePlaceholders as legacyResolvePlaceholders,
  attrPlaceholderKey,
  markPlaceholder,
  PLACEHOLDER_NAME_RE,
  type PageMarks,
  type PlaceholderContext as LegacyPlaceholderContext,
  type PlaceholderResolveOptions,
  type PlaceholderResult,
} from '../pipeline/placeholders';

/** `'part'` is the opener design of a `:::part` page: it resolves the
 *  heading placeholder set with the part's number and title. */
export type DesignContextKind = 'header' | 'footer' | 'heading' | 'part';

/** Heading-specific fields for placeholder resolution. */
export interface HeadingPlaceholderInfo {
  titleText: string;
  /** Formatted number per the level's `numberingTemplate`, or empty string. */
  formattedNumber: string;
  /** Raw numeric counter for the heading level, if available. */
  numericValue?: number;
  /** Document language of the spelled-out placeholders (`{numberWords}`,
   *  `{numberOrdinalWords}`); English when unset. */
  locale?: string;
  /** The document's digit system, for `{numberDecimal}`; `'latn'` when
   *  unset. */
  numerals?: DigitSystem;
  /** `{chapterNumber}` of the chapter the heading belongs to (its own for a
   *  level-1 heading, else the last level-1 heading's before it) — not the
   *  page's, which is the later chapter where two meet on a page. */
  chapterNumber?: string;
  chapterTitle?: string;
  /** Heading attributes (`# Title {key="value"}`), for `{attr.<key>}`. */
  attrs?: Record<string, string>;
}

export interface DesignPlaceholderContext {
  kind: DesignContextKind;
  page: VDTPage;
  allPages: VDTPage[];
  metadata: DocumentMetadata;
  chapterTitleByPageIndex: string[];
  /** The chapter in force at the top of each page, title and number; back
   *  `{chapterTitleAtTop}` / `{chapterNumberAtTop}` in header and footer
   *  slots (see `computeChapterTitlesAtTop`). */
  chapterTitleAtTopByPageIndex?: string[];
  chapterNumberAtTopByPageIndex?: string[];
  /** Current chapter's H1 attributes per page index; backs `{attr.<key>}`
   *  in header/footer slots (and as a fallback in heading slots). */
  chapterAttrsByPageIndex?: Record<string, string>[];
  /** Current part title / number per page index (`{partTitle}` /
   *  `{partNumber}`); see `computePartValues`. */
  partTitleByPageIndex?: string[];
  partNumberByPageIndex?: string[];
  /** Palette overrides of the current part per page index (palette id →
   *  hex): every palette-linked colour of a design slot laid out on that
   *  page takes the part's value. Absent / empty = the document palette. */
  partPaletteByPageIndex?: Record<string, string>[];
  /** Current chapter number per page index; backs `{chapterNumber}` in
   *  header/footer slots (heading slots use `heading.chapterNumber`). */
  chapterNumberByPageIndex?: string[];
  /** Physical pages of the whole book (`{bookTotalPages}`); defaults to
   *  `allPages.length`. */
  bookTotalPages?: number;
  /** The document's digit system: `{totalPages}`, `{bookTotalPages}` and
   *  `{numberDecimal}` are written in it. `'latn'` when unset. */
  numerals?: DigitSystem;
  /** Running marks per key, for `{firstMark.<key>}` / `{lastMark.<key>}`
   *  in header and footer slots (see `computePageMarks`). */
  marksFor?: (key: string) => PageMarks | undefined;
  /** Only present in heading and part contexts. */
  heading?: HeadingPlaceholderInfo;
}

const HEADER_FOOTER_PLACEHOLDERS = new Set([
  'pageNumber',
  'totalPages',
  'bookTotalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
  'chapterNumber',
  'chapterTitleAtTop',
  'chapterNumberAtTop',
  'partTitle',
  'partNumber',
]);

const HEADING_PLACEHOLDERS = new Set([
  'pageNumber',
  'totalPages',
  'bookTotalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
  'partTitle',
  'partNumber',
  'chapterNumber',
  'titleText',
  'number',
  'numberDecimal',
  'numberRoman',
  'numberRomanLower',
  'numberAlpha',
  'numberAlphaLower',
  'numberWords',
  'numberWordsLower',
  'numberOrdinalWords',
  'numberOrdinalWordsLower',
  'numberHan',
]);

export function allowedPlaceholdersFor(kind: DesignContextKind): Set<string> {
  return kind === 'heading' || kind === 'part' ? HEADING_PLACEHOLDERS : HEADER_FOOTER_PLACEHOLDERS;
}

/** Whether `name` is a valid placeholder in a slot of the given kind. Covers
 *  the fixed sets above plus the open-ended `attr.<key>` namespace, and —
 *  in running heads (header and footer) — the `firstMark.<key>` /
 *  `lastMark.<key>` marks. */
export function isAllowedPlaceholder(name: string, kind: DesignContextKind): boolean {
  if (allowedPlaceholdersFor(kind).has(name) || attrPlaceholderKey(name) !== undefined) return true;
  return (kind === 'header' || kind === 'footer') && markPlaceholder(name) !== undefined;
}

/** Whether any text of `config` names the placeholder `{name}` — a design
 *  slot's element, a heading style's running head… A scan of the whole
 *  configuration, for hosts deciding what a layout needs (the book's page
 *  count for `{bookTotalPages}`); cache it per configuration when calling
 *  it often. */
export function configUsesPlaceholder(config: PostextConfig | undefined, name: string): boolean {
  return config !== undefined && JSON.stringify(config).includes(`{${name}}`);
}

/** `{attr.<key>}`: the heading's own attribute first (heading contexts),
 *  then the current chapter's H1 attribute. Missing → `''`. */
function resolveAttrPlaceholder(key: string, ctx: DesignPlaceholderContext): string {
  const own = ctx.heading?.attrs?.[key];
  if (own !== undefined) return own;
  return ctx.chapterAttrsByPageIndex?.[ctx.page.index]?.[key] ?? '';
}

function resolveHeadingName(name: string, ctx: DesignPlaceholderContext): string {
  const h = ctx.heading;
  const digits = ctx.numerals ?? h?.numerals;
  switch (name) {
    case 'titleText':
      return h?.titleText ?? '';
    case 'number':
      return h?.formattedNumber ?? '';
    case 'numberDecimal':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'decimal', digits) : '';
    case 'numberRoman':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'upper-roman') : '';
    case 'numberRomanLower':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'lower-roman') : '';
    case 'numberAlpha':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'upper-alpha') : '';
    case 'numberAlphaLower':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'lower-alpha') : '';
    case 'numberWords':
      return h?.numericValue !== undefined ? formatCounter(h.numericValue, 'Words', h.locale) : '';
    case 'numberWordsLower':
      return h?.numericValue !== undefined ? formatCounter(h.numericValue, 'words', h.locale) : '';
    case 'numberOrdinalWords':
      return h?.numericValue !== undefined ? formatCounter(h.numericValue, 'Ordinal', h.locale) : '';
    case 'numberOrdinalWordsLower':
      return h?.numericValue !== undefined ? formatCounter(h.numericValue, 'ordinal', h.locale) : '';
    case 'numberHan':
      // Chinese numerals in the document's script: 第{numberHan}回.
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, chineseInformalStyle(h.locale)) : '';
    case 'chapterNumber':
      return h?.chapterNumber ?? ctx.chapterNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterTitle':
      return h?.chapterTitle ?? ctx.chapterTitleByPageIndex[ctx.page.index] ?? '';
    case 'partTitle':
      return ctx.partTitleByPageIndex?.[ctx.page.index] ?? '';
    case 'partNumber':
      return ctx.partNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'pageNumber':
      return ctx.page.pageLabel;
    case 'totalPages':
      return withDigits(String(ctx.allPages.length), digits);
    case 'bookTotalPages':
      return withDigits(String(ctx.bookTotalPages ?? ctx.allPages.length), digits);
    case 'title':
      return metadataText(ctx.metadata.title) ?? '';
    case 'subtitle':
      return metadataText(ctx.metadata.subtitle) ?? '';
    case 'author':
      return metadataText(ctx.metadata.author) ?? '';
    case 'publishDate':
      return metadataText(ctx.metadata.publishDate) ?? '';
    default:
      return '';
  }
}

/** Resolve placeholders for a design slot. The header/footer context
 *  reuses the legacy resolver (same placeholder set). Heading and part
 *  contexts use the extended heading-aware resolver. */
export function resolveDesignPlaceholders(
  template: string,
  ctx: DesignPlaceholderContext,
  options?: PlaceholderResolveOptions,
): PlaceholderResult {
  if (ctx.kind !== 'heading' && ctx.kind !== 'part') {
    const legacy: LegacyPlaceholderContext = {
      page: ctx.page,
      allPages: ctx.allPages,
      metadata: ctx.metadata,
      chapterTitleByPageIndex: ctx.chapterTitleByPageIndex,
      chapterTitleAtTopByPageIndex: ctx.chapterTitleAtTopByPageIndex,
      chapterNumberAtTopByPageIndex: ctx.chapterNumberAtTopByPageIndex,
      chapterAttrsByPageIndex: ctx.chapterAttrsByPageIndex,
      partTitleByPageIndex: ctx.partTitleByPageIndex,
      partNumberByPageIndex: ctx.partNumberByPageIndex,
      chapterNumberByPageIndex: ctx.chapterNumberByPageIndex,
      bookTotalPages: ctx.bookTotalPages,
      marksFor: ctx.marksFor,
      numerals: ctx.numerals,
    };
    return legacyResolvePlaceholders(template, legacy, options);
  }
  const allowed = HEADING_PLACEHOLDERS;
  const unknown: string[] = [];
  const missing: string[] = [];
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') { out += '{'; i += 2; continue; }
    if (ch === '}' && template[i + 1] === '}') { out += '}'; i += 2; continue; }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) { out += ch; i++; continue; }
      const name = template.slice(i + 1, end);
      if (!PLACEHOLDER_NAME_RE.test(name)) {
        out += template.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      const attrKey = attrPlaceholderKey(name);
      if (attrKey !== undefined) {
        const value = resolveAttrPlaceholder(attrKey, ctx);
        out += options?.attrValue ? options.attrValue(value) : value;
        i = end + 1;
        continue;
      }
      if (!allowed.has(name)) {
        unknown.push(name);
        i = end + 1;
        continue;
      }
      out += resolveHeadingName(name, ctx);
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, unknownPlaceholders: unknown, missingMetadata: missing };
}

/** The `\n` escape: the two characters backslash + n, which is how a design
 *  template or a heading attribute value writes a line break. */
export function unescapeLineBreaks(text: string): string {
  return text.replace(/\\n/g, '\n');
}

/** The resource id a design image element draws: its `resourceId` with
 *  the placeholders a design text takes filled in — `{attr.<key>}` for an
 *  id the heading (or part, or the page's chapter) names, so one design
 *  serves every chapter with its own picture. A fixed id is returned as
 *  written; an empty result draws nothing. */
export function resolveDesignResourceId(template: string, ctx: DesignPlaceholderContext): string {
  if (!template.includes('{')) return template;
  return resolveDesignPlaceholders(template, ctx).text.trim();
}

/** The text a design text element prints, before any case transform: its
 *  placeholders filled in, and the `\n` escape turned into a newline in the
 *  element's own template and in `{attr.<key>}` values. Text a placeholder
 *  mirrors from the document (a title, a frontmatter value) is printed as
 *  written, so a code span holding `\n` stays on its line; its real
 *  newlines (a `\\` title break) still start new lines. */
export function resolveDesignText(template: string, ctx: DesignPlaceholderContext): string {
  return resolveDesignPlaceholders(unescapeLineBreaks(template), ctx, { attrValue: unescapeLineBreaks }).text;
}
