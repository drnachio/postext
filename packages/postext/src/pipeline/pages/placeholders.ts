import { collapseBreakingSpaces } from '../../measure/spaces.js';
import type { InlineSpan } from '../../parse/index.js';
import type { DocumentMetadata, DigitSystem } from '../../types.js';
import { metadataText } from '../../parse/frontmatter.js';
import { withDigits } from '../../numerals/arabicNumerals.js';
import type { VDTPage, VDTBlock } from '../../vdt.js';
import { plainTextOfBlock } from './placeholders/lineText.js';

export { computeChapterTitles, computeChapterNumbers, computeChapterNumbersByBlock, chapterNumberCounter, computeChapterAttrs, computeChapterTitlesAtTop, computeChapterNumbersAtTop, computePartValues } from './placeholders/chapterValues.js';
export type { ChapterTitlePageInfo, ChapterNumberSource, PartPageInfo } from './placeholders/chapterValues.js';
export { lineJoin, blockLinesText, plainTitleText } from './placeholders/lineText.js';
export type { JoinedLine, BlockLinesTextOptions } from './placeholders/lineText.js';

export interface PlaceholderContext {
  page: VDTPage;
  allPages: VDTPage[];
  metadata: DocumentMetadata;
  /** Chapter title per page index (most recent H1 at or before each page). */
  chapterTitleByPageIndex: string[];
  /** The chapter in force at the top of each page (see
   *  `computeChapterTitlesAtTop`, `computeChapterNumbersAtTop`). Back
   *  `{chapterTitleAtTop}` / `{chapterNumberAtTop}`; a missing entry
   *  resolves to `''`. */
  chapterTitleAtTopByPageIndex?: string[];
  chapterNumberAtTopByPageIndex?: string[];
  /** Heading attributes of the current chapter's H1 per page index (see
   *  `computeChapterAttrs`). Backs `{attr.<key>}` in header/footer slots. A
   *  missing entry or key resolves to `''`. */
  chapterAttrsByPageIndex?: Record<string, string>[];
  /** Current part title / number per page index (see `computePartValues`).
   *  Back `{partTitle}` / `{partNumber}`; a missing entry resolves to `''`. */
  partTitleByPageIndex?: string[];
  partNumberByPageIndex?: string[];
  partPaletteByPageIndex?: Record<string, string>[];
  /** Current chapter number per page index (see `computeChapterNumbers`).
   *  Backs `{chapterNumber}` in header/footer slots. */
  chapterNumberByPageIndex?: string[];
  /** Physical pages of the whole book (`{bookTotalPages}`); defaults to
   *  `allPages.length`, the document being the whole book. */
  bookTotalPages?: number;
  /** The document's digit system: `{totalPages}` and `{bookTotalPages}`
   *  are written in it (the page labels already are). `'latn'` when
   *  unset. */
  numerals?: DigitSystem;
  /** The first and last marks of every page for a mark key (see
   *  `computePageMarks`); backs `{firstMark.<key>}` / `{lastMark.<key>}`.
   *  Called lazily, once per key a template names. Absent → `''`. */
  marksFor?: (key: string) => PageMarks | undefined;
  /** On a composed page (#984): the counter of the first numbered heading
   *  its frames hold, in the document's digits, for `{headingNumber}`;
   *  and the same by frame name, for `{headingNumber.<frame>}`. Absent or
   *  missing → `''`. */
  headingNumber?: string;
  headingNumberByFrame?: Record<string, string>;
}

export interface PlaceholderResult {
  text: string;
  unknownPlaceholders: string[];
  missingMetadata: string[];
}

/** Optional behaviour of the placeholder resolvers. */
export interface PlaceholderResolveOptions {
  /** Applied to every `{attr.<key>}` value before it is inserted (design
   *  text turns the `\n` escape of an attribute value into a newline). */
  attrValue?: (value: string) => string;
}

const PLACEHOLDER_NAMES = new Set([
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
  'headingNumber',
]);

const METADATA_PLACEHOLDERS = new Set(['title', 'subtitle', 'author', 'publishDate']);

/** Placeholder grammar: `name` or `name.key` — the dotted form is reserved
 *  for namespaced lookups such as `{attr.author}` (heading attributes) and
 *  `{boxText.2}` (the second item of a box's content, #1014). */
export const PLACEHOLDER_NAME_RE = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_][a-zA-Z0-9_-]*)?$/;

/** `{boxText}` and `{boxText.<n>}` (#1014): in a box style's design, the
 *  box's content, whole (`0`) or its `n`-th paragraph or list item (from
 *  1). Undefined for any other name. */
export function boxTextPlaceholderIndex(name: string): number | undefined {
  if (name === 'boxText') return 0;
  const m = /^boxText\.([1-9][0-9]*)$/.exec(name);
  return m ? Number(m[1]) : undefined;
}

/** Namespace of the heading-attribute placeholders (`{attr.<key>}`). */
export const ATTR_PLACEHOLDER_PREFIX = 'attr.';

/** When `name` is an `attr.<key>` placeholder, returns `<key>`. */
export function attrPlaceholderKey(name: string): string | undefined {
  if (!name.startsWith(ATTR_PLACEHOLDER_PREFIX)) return undefined;
  const key = name.slice(ATTR_PLACEHOLDER_PREFIX.length);
  return key.length > 0 ? key : undefined;
}

/** When `name` is `headingNumber` (the page's first numbered heading) or
 *  `headingNumber.<frame>` (the one the frame `<frame>` holds), a composed
 *  page's counter of the heading a frame takes (#984): `{}` or the frame's
 *  name. Undefined for any other name. */
export function headingNumberPlaceholder(name: string): { frame?: string } | undefined {
  if (name === 'headingNumber') return {};
  if (!name.startsWith('headingNumber.')) return undefined;
  const frame = name.slice('headingNumber.'.length);
  return frame.length > 0 ? { frame } : undefined;
}

/** When `name` is a running-mark placeholder — `firstMark.<key>` or
 *  `lastMark.<key>`, the first or last mark on the page — returns which one
 *  and the key: `h1`…`h6` for a heading level, else a paragraph style id. */
export function markPlaceholder(name: string): { which: 'first' | 'last'; key: string } | undefined {
  const dot = name.indexOf('.');
  if (dot < 0) return undefined;
  const head = name.slice(0, dot);
  const key = name.slice(dot + 1);
  if (key.length === 0) return undefined;
  if (head === 'firstMark') return { which: 'first', key };
  if (head === 'lastMark') return { which: 'last', key };
  return undefined;
}

/** The marks of one key laid out on each page: `first[p]` is the first mark
 *  that starts on page `p` and `last[p]` the last; a page on which none
 *  starts takes the mark in effect (the last one before it) for both, and
 *  pages before the first mark get `''`. */
export interface PageMarks {
  first: string[];
  last: string[];
}

/** What sets a mark: a heading of `level`, or a paragraph of a
 *  `:::paragraphs{style=…}` container whose style is `styleId`. */
export type MarkSource = { level: number } | { styleId: string };

/** The source a mark key names: `h1`…`h6` a heading level, anything else a
 *  paragraph style id. */
export function markSourceOf(key: string): MarkSource {
  const m = /^h([1-6])$/i.exec(key);
  return m ? { level: Number(m[1]) } : { styleId: key };
}

/** The bold run a paragraph opens with — a dictionary headword, a glossary
 *  term — as a running mark: the leading bold spans joined, trimmed, minus
 *  closing punctuation (`**Aback.**` → `Aback`). `''` when the paragraph
 *  does not open with bold text. */
export function leadingBoldText(spans: readonly InlineSpan[]): string {
  let text = '';
  for (const span of spans) {
    if (span.math || span.swatch || span.chip) break;
    if (!span.bold) {
      if (text.length === 0 && span.text.trim().length === 0) continue;
      break;
    }
    text += span.text;
  }
  return collapseBreakingSpaces(text).trim().replace(/[\s.,:;]+$/, '');
}

/**
 * Per page, the first and last mark of one source (see {@link PageMarks}),
 * walking the blocks in placement order. A heading's mark is its text
 * without the number; a paragraph's is its leading bold run (a headword),
 * given by `paragraphMark` from the content block — a paragraph that does
 * not open with bold text sets none. A block split across columns or pages
 * sets its mark once, where it starts.
 */
export function computePageMarks(
  blocks: readonly VDTBlock[],
  totalPages: number,
  source: MarkSource,
  paragraphMark?: (contentIndex: number) => { styleId: string; text: string } | undefined,
): PageMarks {
  const onPage: string[][] = Array.from({ length: totalPages }, () => []);
  const seen = new Set<number>();
  for (const b of blocks) {
    if (b.pageIndex < 0 || b.pageIndex >= totalPages) continue;
    let text: string | undefined;
    if ('level' in source) {
      // A plate (`runningChapter: false`) sets no guide word.
      if (b.type === 'heading' && b.headingLevel === source.level && !b.notRunningChapter) text = plainTextOfBlock(b);
    } else if (b.type === 'paragraph' && b.contentIndex !== undefined && paragraphMark) {
      const mark = paragraphMark(b.contentIndex);
      if (mark && mark.styleId === source.styleId) text = mark.text;
    }
    if (text === undefined || text.length === 0) continue;
    if (b.contentIndex !== undefined) {
      if (seen.has(b.contentIndex)) continue;
      seen.add(b.contentIndex);
    }
    onPage[b.pageIndex]!.push(text);
  }
  const first = new Array<string>(totalPages).fill('');
  const last = new Array<string>(totalPages).fill('');
  let current = '';
  for (let p = 0; p < totalPages; p++) {
    const marks = onPage[p]!;
    first[p] = marks[0] ?? current;
    if (marks.length > 0) current = marks[marks.length - 1]!;
    last[p] = current;
  }
  return { first, last };
}

/**
 * Resolve placeholder templates. Grammar:
 *   - `{name}` with name matching `[a-zA-Z][a-zA-Z0-9]*` is a placeholder;
 *   - `{name.key}` is a namespaced placeholder — `{attr.<key>}` reads the
 *     current chapter's heading attributes (missing → `''`, no warning),
 *     `{firstMark.<key>}` / `{lastMark.<key>}` the page's running marks;
 *   - `{{` and `}}` are literal braces.
 */
export function resolvePlaceholders(
  template: string,
  ctx: PlaceholderContext,
  options?: PlaceholderResolveOptions,
): PlaceholderResult {
  const unknown: string[] = [];
  const missing: string[] = [];
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') {
      out += '{';
      i += 2;
      continue;
    }
    if (ch === '}' && template[i + 1] === '}') {
      out += '}';
      i += 2;
      continue;
    }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) {
        // Unterminated — treat as literal
        out += ch;
        i++;
        continue;
      }
      const name = template.slice(i + 1, end);
      if (!PLACEHOLDER_NAME_RE.test(name)) {
        out += template.slice(i, end + 1);
        i = end + 1;
        continue;
      }
      const attrKey = attrPlaceholderKey(name);
      if (attrKey !== undefined) {
        const value = ctx.chapterAttrsByPageIndex?.[ctx.page.index]?.[attrKey] ?? '';
        out += options?.attrValue ? options.attrValue(value) : value;
        i = end + 1;
        continue;
      }
      const mark = markPlaceholder(name);
      if (mark) {
        const marks = ctx.marksFor?.(mark.key);
        out += (mark.which === 'first' ? marks?.first : marks?.last)?.[ctx.page.index] ?? '';
        i = end + 1;
        continue;
      }
      const heading = headingNumberPlaceholder(name);
      if (heading) {
        out += heading.frame === undefined ? ctx.headingNumber ?? '' : ctx.headingNumberByFrame?.[heading.frame] ?? '';
        i = end + 1;
        continue;
      }
      if (!PLACEHOLDER_NAMES.has(name)) {
        unknown.push(name);
        i = end + 1;
        continue;
      }
      const value = resolveName(name, ctx);
      if (METADATA_PLACEHOLDERS.has(name) && value === '') {
        missing.push(name);
      }
      out += value;
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return { text: out, unknownPlaceholders: unknown, missingMetadata: missing };
}

function resolveName(name: string, ctx: PlaceholderContext): string {
  switch (name) {
    case 'pageNumber':
      return ctx.page.pageLabel;
    case 'totalPages':
      return withDigits(String(ctx.allPages.length), ctx.numerals);
    case 'bookTotalPages':
      return withDigits(String(ctx.bookTotalPages ?? ctx.allPages.length), ctx.numerals);
    case 'title':
      return metadataText(ctx.metadata.title) ?? '';
    case 'subtitle':
      return metadataText(ctx.metadata.subtitle) ?? '';
    case 'author':
      return metadataText(ctx.metadata.author) ?? '';
    case 'publishDate':
      return metadataText(ctx.metadata.publishDate) ?? '';
    case 'chapterTitle':
      return ctx.chapterTitleByPageIndex[ctx.page.index] ?? '';
    case 'partTitle':
      return ctx.partTitleByPageIndex?.[ctx.page.index] ?? '';
    case 'partNumber':
      return ctx.partNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterNumber':
      return ctx.chapterNumberByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterTitleAtTop':
      return ctx.chapterTitleAtTopByPageIndex?.[ctx.page.index] ?? '';
    case 'chapterNumberAtTop':
      return ctx.chapterNumberAtTopByPageIndex?.[ctx.page.index] ?? '';
    default:
      return '';
  }
}

/**
 * Scan a template for the set of placeholder names it references (unique,
 * including unknown ones). Useful for warnings.
 */
export function collectPlaceholderNames(template: string): string[] {
  const names = new Set<string>();
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') { i += 2; continue; }
    if (ch === '}' && template[i + 1] === '}') { i += 2; continue; }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) break;
      const name = template.slice(i + 1, end);
      if (PLACEHOLDER_NAME_RE.test(name)) names.add(name);
      i = end + 1;
      continue;
    }
    i++;
  }
  return [...names];
}

/**
 * The literal text of a template: every placeholder (`{name}`, known or
 * not, `{attr.key}`, `{firstMark.key}`) removed, the `{{` / `}}` escapes
 * read as the braces they print, and the `\n` escape as a line break.
 * What a design text prints whatever the document (#849).
 */
export function stripPlaceholders(template: string): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    if (ch === '{' && template[i + 1] === '{') { out += '{'; i += 2; continue; }
    if (ch === '}' && template[i + 1] === '}') { out += '}'; i += 2; continue; }
    if (ch === '{') {
      const end = template.indexOf('}', i + 1);
      if (end === -1) { out += template.slice(i); break; }
      const name = template.slice(i + 1, end);
      if (!PLACEHOLDER_NAME_RE.test(name)) out += template.slice(i, end + 1);
      // A placeholder stands for a word of its own.
      else out += ' ';
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out.replace(/\\n/g, '\n');
}

export function isKnownPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name) || attrPlaceholderKey(name) !== undefined || markPlaceholder(name) !== undefined || headingNumberPlaceholder(name) !== undefined;
}

export function isMetadataPlaceholder(name: string): boolean {
  return METADATA_PLACEHOLDERS.has(name);
}
