import type { DocumentMetadata } from '../types';
import type { VDTBlock, VDTPage } from '../vdt';

/** A minimal view of a page used by `computeChapterTitles` to detect
 *  blank parity-padding pages. We accept just the flags rather than the
 *  whole `VDTPage` so this helper stays easy to test in isolation.
 *
 *  `blankForParity` pages belong to the upcoming chapter (they exist
 *  solely to push it onto the right parity). `blankForForce` pages
 *  belong to the *previous* chapter (they are the mandatory separator
 *  of the `always-*` modes) — the walker stops when it hits one. */
export interface ChapterTitlePageInfo {
  blankForParity?: boolean;
  blankForForce?: boolean;
}

export interface PlaceholderContext {
  page: VDTPage;
  allPages: VDTPage[];
  metadata: DocumentMetadata;
  /** Chapter title per page index (most recent H1 at or before each page). */
  chapterTitleByPageIndex: string[];
  /** Heading attributes of the current chapter's H1 per page index (see
   *  `computeChapterAttrs`). Backs `{attr.<key>}` in header/footer slots. A
   *  missing entry or key resolves to `''`. */
  chapterAttrsByPageIndex?: Record<string, string>[];
}

export interface PlaceholderResult {
  text: string;
  unknownPlaceholders: string[];
  missingMetadata: string[];
}

const PLACEHOLDER_NAMES = new Set([
  'pageNumber',
  'totalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
]);

const METADATA_PLACEHOLDERS = new Set(['title', 'subtitle', 'author', 'publishDate']);

/** Placeholder grammar: `name` or `name.key` — the dotted form is reserved
 *  for namespaced lookups such as `{attr.author}` (heading attributes). */
export const PLACEHOLDER_NAME_RE = /^[a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z_][a-zA-Z0-9_-]*)?$/;

/** Namespace of the heading-attribute placeholders (`{attr.<key>}`). */
export const ATTR_PLACEHOLDER_PREFIX = 'attr.';

/** When `name` is an `attr.<key>` placeholder, returns `<key>`. */
export function attrPlaceholderKey(name: string): string | undefined {
  if (!name.startsWith(ATTR_PLACEHOLDER_PREFIX)) return undefined;
  const key = name.slice(ATTR_PLACEHOLDER_PREFIX.length);
  return key.length > 0 ? key : undefined;
}

/**
 * Precompute chapter titles (most recent H1 text) for each page index by
 * walking blocks once. Returns an array where `result[pageIndex]` is the plain
 * text of the most recent H1 encountered at or before that page. When no H1
 * has appeared yet, the entry is an empty string.
 *
 * When `pages` is supplied, blank parity-padding pages immediately
 * preceding a new H1 are retroactively attributed to the *upcoming*
 * chapter — the blank left-hand page that exists only to push the next
 * chapter onto a right-hand page should display the new chapter's title
 * in its header, not the previous chapter's.
 */
export function computeChapterTitles(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): string[] {
  return computeChapterValues(blocks, totalPages, pages, plainTextOfBlock, '');
}

/**
 * Precompute chapter numbers (most recent H1 `numberPrefix`) per page. Mirrors
 * `computeChapterTitles` but tracks the numeric prefix (e.g. `"1"`, `"2"`) so
 * `{chapterNumber}` in heading-context slots resolves to the current chapter.
 */
export function computeChapterNumbers(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): string[] {
  return computeChapterValues(blocks, totalPages, pages, (b) => b.numberPrefix ?? '', '');
}

/**
 * Precompute the heading attributes (`# Title {key="value"}`) of the most
 * recent H1 per page. Backs `{attr.<key>}` in header/footer slots; pages
 * before the first H1 get an empty record.
 */
export function computeChapterAttrs(
  blocks: VDTBlock[],
  totalPages: number,
  pages?: ChapterTitlePageInfo[],
): Record<string, string>[] {
  return computeChapterValues(blocks, totalPages, pages, (b) => b.attrs ?? {}, {});
}

/** Shared walker behind `computeChapterTitles` / `computeChapterNumbers` /
 *  `computeChapterAttrs`: tracks the most recent H1's extracted value per
 *  page, starting from `empty` before the first H1. */
function computeChapterValues<T>(
  blocks: VDTBlock[],
  totalPages: number,
  pages: ChapterTitlePageInfo[] | undefined,
  extract: (block: VDTBlock) => T,
  empty: T,
): T[] {
  const out = new Array<T>(totalPages).fill(empty);
  const byPage = new Map<number, T>();
  let current: T = empty;
  // Walk blocks in page/column order. The VDT `doc.blocks` array is already
  // insertion-ordered by placement, so pages are in increasing index.
  let lastPageIndex = -1;
  // Track H1 page-indices so we can reassign any parity-padding pages
  // that precede them.
  const h1PageIndices: Array<{ pageIndex: number; value: T }> = [];
  for (const b of blocks) {
    if (b.pageIndex < 0) continue;
    while (lastPageIndex < b.pageIndex) {
      lastPageIndex++;
      byPage.set(lastPageIndex, current);
    }
    if (b.headingLevel === 1) {
      current = extract(b);
      byPage.set(b.pageIndex, current);
      h1PageIndices.push({ pageIndex: b.pageIndex, value: current });
    }
  }
  // Fill any trailing pages (past the last block) with current value.
  for (let p = 0; p < totalPages; p++) {
    if (byPage.has(p)) {
      out[p] = byPage.get(p)!;
    } else if (p > 0) {
      out[p] = out[p - 1]!;
    }
  }
  // Reassign parity-padding pages preceding each H1 to the upcoming
  // chapter's value. The blank page was inserted solely to push the
  // chapter onto the correct parity — conceptually it belongs to the
  // chapter it precedes. `blankForForce` pages (the mandatory leading
  // separator of `always-*` modes) stop the walk: they belong to the
  // previous chapter.
  if (pages) {
    for (const { pageIndex, value } of h1PageIndices) {
      for (let p = pageIndex - 1; p >= 0; p--) {
        const info = pages[p];
        if (!info) break;
        if (info.blankForForce) break;
        if (!info.blankForParity) break;
        out[p] = value;
      }
    }
  }
  return out;
}

function plainTextOfBlock(block: VDTBlock): string {
  // Strip any numbering prefix that was prepended during build.
  const lines = block.lines.map((l) => l.text).join(' ');
  if (block.numberPrefix && lines.startsWith(block.numberPrefix)) {
    return lines.slice(block.numberPrefix.length).trimStart();
  }
  return lines;
}

/**
 * Resolve placeholder templates. Grammar:
 *   - `{name}` with name matching `[a-zA-Z][a-zA-Z0-9]*` is a placeholder;
 *   - `{name.key}` is a namespaced placeholder — `{attr.<key>}` reads the
 *     current chapter's heading attributes (missing → `''`, no warning);
 *   - `{{` and `}}` are literal braces.
 */
export function resolvePlaceholders(
  template: string,
  ctx: PlaceholderContext,
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
        out += ctx.chapterAttrsByPageIndex?.[ctx.page.index]?.[attrKey] ?? '';
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
      return String(ctx.allPages.length);
    case 'title':
      return typeof ctx.metadata.title === 'string' ? ctx.metadata.title : '';
    case 'subtitle':
      return typeof ctx.metadata.subtitle === 'string' ? ctx.metadata.subtitle : '';
    case 'author':
      return typeof ctx.metadata.author === 'string' ? ctx.metadata.author : '';
    case 'publishDate':
      return typeof ctx.metadata.publishDate === 'string' ? ctx.metadata.publishDate : '';
    case 'chapterTitle':
      return ctx.chapterTitleByPageIndex[ctx.page.index] ?? '';
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

export function isKnownPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name) || attrPlaceholderKey(name) !== undefined;
}

export function isMetadataPlaceholder(name: string): boolean {
  return METADATA_PLACEHOLDERS.has(name);
}
