import type { Dimension, DigitSystem, DocumentMetadata, PostextConfig, ResolvedChipStyleConfig } from '../types.js';
import { withDigits } from '../numerals/arabicNumerals.js';
import type { VDTPage } from '../vdt.js';
import { formatCounter, formatNumeral, hanInformalStyle } from '../numerals/numbering.js';
import { metadataText } from '../parse/frontmatter.js';
import {
  resolvePlaceholders as legacyResolvePlaceholders,
  attrPlaceholderKey,
  headingNumberPlaceholder,
  markPlaceholder,
  PLACEHOLDER_NAME_RE,
  boxTextPlaceholderIndex,
  type PageMarks,
  type PlaceholderContext as LegacyPlaceholderContext,
  type PlaceholderResolveOptions,
  type PlaceholderResult,
} from '../pipeline/pages/placeholders.js';

/** `'part'` is the opener design of a `:::part` page: it resolves the
 *  heading placeholder set with the part's number and title. */
/** Where a design slot is laid: a running head, a heading's or a part's
 *  design, or a composed page's template decoration (`'composed'`, #855:
 *  the running-head placeholders, with `{attr.x}` read from the page
 *  fence's attributes before the chapter heading's). */
export type DesignContextKind = 'header' | 'footer' | 'heading' | 'part' | 'composed';

/** Heading-specific fields for placeholder resolution. */
export interface HeadingPlaceholderInfo {
  titleText: string;
  /** The title as inline Markdown, when the heading sets bold, italic,
   *  superscript or subscript runs (`DefaultOpenerTitle.marked`): what
   *  `{titleText}` prints in a design text element that reads inline marks
   *  (`inlineMarks: true`), so the element sets the heading's runs (#539).
   *  Elements that do not read marks print {@link titleText}. */
  titleMarked?: string;
  /** The document's chip styles, given with a {@link titleMarked} that
   *  holds a heading's chips (`:chip[…]`, #1162): a design text that reads
   *  inline marks sets them as the heading does. Absent otherwise, and a
   *  design text then reads `:chip[…]` as written. */
  chipStyles?: readonly ResolvedChipStyleConfig[];
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
  /** In a box style's design (#1014): the box's content as plain text, one
   *  entry per paragraph or list item, for `{boxText}` (all of them, one
   *  per line) and `{boxText.<n>}`. */
  boxText?: readonly string[];
}

/** What `{leader}` prints in place: a private-use character the layout
 *  of a design text replaces with the leader run (#889,
 *  `design/layout.ts`). Never painted. */
export const LEADER_MARK = '\uE0A0';

/** The contents' leader settings (`toc.leader`), for the `{leader}` of a
 *  contents part row (#889). */
export interface DesignLeader {
  /** Off: the room between the texts stays blank, the page number still
   *  flush with the row's end. */
  enabled: boolean;
  char: string;
  /** Room kept on either side of the run. */
  gap: Dimension;
  /** The run's own colour, face, size (`em` of the element's) and weight
   *  (#1121); each unset keeps the element's. */
  color?: string;
  fontFamily?: string;
  fontSize?: Dimension;
  fontWeight?: number;
}

export interface DesignPlaceholderContext {
  kind: DesignContextKind;
  /** A contents part row (#889): `{leader}` fills the room between the
   *  text before it and the text after it with this leader. Absent
   *  elsewhere, where `{leader}` prints nothing. */
  leader?: DesignLeader;
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
  /** On a composed page (#984): the counter of the first numbered heading
   *  its frames hold (`{headingNumber}`), and of the one each frame holds
   *  (`{headingNumber.<frame>}`), in the document's digits. */
  headingNumber?: string;
  headingNumberByFrame?: Record<string, string>;
  /** A composed page's fence attributes (`::::page{template fondo=…}`),
   *  for `{attr.<key>}` in its template's decoration and running heads
   *  (#855). They win over the chapter heading's. */
  pageAttrs?: Record<string, string>;
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

/** What the decoration of a composed page reads (#984): the running head's
 *  names and the counter of the heading its frames take. */
const COMPOSED_PLACEHOLDERS = new Set([...HEADER_FOOTER_PLACEHOLDERS, 'headingNumber']);

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
  return kind === 'heading' || kind === 'part' ? HEADING_PLACEHOLDERS : kind === 'composed' ? COMPOSED_PLACEHOLDERS : HEADER_FOOTER_PLACEHOLDERS;
}

/** Whether `name` is a valid placeholder in a slot of the given kind. Covers
 *  the fixed sets above plus the open-ended `attr.<key>` namespace, and —
 *  in running heads (header and footer) — the `firstMark.<key>` /
 *  `lastMark.<key>` marks. */
export function isAllowedPlaceholder(name: string, kind: DesignContextKind): boolean {
  if (allowedPlaceholdersFor(kind).has(name) || attrPlaceholderKey(name) !== undefined) return true;
  // A box style's content (#1014): laid out with the heading placeholders.
  if (kind === 'heading' && boxTextPlaceholderIndex(name) !== undefined) return true;
  if (kind === 'composed' && headingNumberPlaceholder(name) !== undefined) return true;
  // `{leader}`: the contents part rows' (#889), a part context.
  if (name === 'leader') return kind === 'part';
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
      // Counted kanji numerals in the document's language: 第{numberHan}回
      // in the Chinese of its script (第一百零一回), Japanese in a ja
      // document (第百一章).
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, hanInformalStyle(h.locale)) : '';
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
      chapterAttrsByPageIndex: ctx.pageAttrs && Object.keys(ctx.pageAttrs).length > 0
        ? withPageAttrs(ctx.chapterAttrsByPageIndex, ctx.page.index, ctx.pageAttrs)
        : ctx.chapterAttrsByPageIndex,
      partTitleByPageIndex: ctx.partTitleByPageIndex,
      partNumberByPageIndex: ctx.partNumberByPageIndex,
      chapterNumberByPageIndex: ctx.chapterNumberByPageIndex,
      bookTotalPages: ctx.bookTotalPages,
      marksFor: ctx.marksFor,
      numerals: ctx.numerals,
      ...(ctx.headingNumber !== undefined ? { headingNumber: ctx.headingNumber } : {}),
      ...(ctx.headingNumberByFrame ? { headingNumberByFrame: ctx.headingNumberByFrame } : {}),
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
      const boxItem = boxTextPlaceholderIndex(name);
      if (boxItem !== undefined) {
        // A box's own content (#1014); nothing outside a box design.
        const items = ctx.heading?.boxText ?? [];
        out += boxItem === 0 ? items.join('\n') : items[boxItem - 1] ?? '';
        i = end + 1;
        continue;
      }
      if (name === 'leader') {
        // A contents part row's leader (#889): marked here, set by the
        // layout over the room the row leaves.
        if (ctx.leader) out += LEADER_MARK;
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
export function resolveDesignText(
  template: string,
  ctx: DesignPlaceholderContext,
  /** The element reads inline marks: `{titleText}` is the marked title of
   *  a heading that has one (see {@link HeadingPlaceholderInfo.titleMarked}). */
  inlineMarks = false,
): string {
  const h = ctx.heading;
  const at = inlineMarks && h?.titleMarked !== undefined ? { ...ctx, heading: { ...h, titleText: h.titleMarked } } : ctx;
  return resolveDesignPlaceholders(unescapeLineBreaks(template), at, { attrValue: unescapeLineBreaks }).text;
}

/** `byPage` with the page `index`'s attributes merged under `attrs`. */
function withPageAttrs(byPage: Record<string, string>[] | undefined, index: number, attrs: Record<string, string>): Record<string, string>[] {
  const out = byPage ? byPage.slice() : [];
  out[index] = { ...(byPage?.[index] ?? {}), ...attrs };
  return out;
}
