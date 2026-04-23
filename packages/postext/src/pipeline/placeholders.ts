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
  const out = new Array<string>(totalPages).fill('');
  const byPage = new Map<number, string>();
  let current = '';
  // Walk blocks in page/column order. The VDT `doc.blocks` array is already
  // insertion-ordered by placement, so pages are in increasing index.
  let lastPageIndex = -1;
  // Track H1 page-indices so we can reassign any parity-padding pages
  // that precede them.
  const h1PageIndices: Array<{ pageIndex: number; title: string }> = [];
  for (const b of blocks) {
    if (b.pageIndex < 0) continue;
    while (lastPageIndex < b.pageIndex) {
      lastPageIndex++;
      byPage.set(lastPageIndex, current);
    }
    if (b.headingLevel === 1) {
      current = plainTextOfBlock(b);
      byPage.set(b.pageIndex, current);
      h1PageIndices.push({ pageIndex: b.pageIndex, title: current });
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
  // chapter's title. The blank page was inserted solely to push the
  // chapter onto the correct parity — conceptually it belongs to the
  // chapter it precedes. `blankForForce` pages (the mandatory leading
  // separator of `always-*` modes) stop the walk: they belong to the
  // previous chapter.
  if (pages) {
    for (const { pageIndex, title } of h1PageIndices) {
      for (let p = pageIndex - 1; p >= 0; p--) {
        const info = pages[p];
        if (!info) break;
        if (info.blankForForce) break;
        if (!info.blankForParity) break;
        out[p] = title;
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
 *   - `{name}` with name matching `[a-zA-Z][a-zA-Z0-9]*` is a placeholder.
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
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
        out += template.slice(i, end + 1);
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
      if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) names.add(name);
      i = end + 1;
      continue;
    }
    i++;
  }
  return [...names];
}

export function isKnownPlaceholder(name: string): boolean {
  return PLACEHOLDER_NAMES.has(name);
}

export function isMetadataPlaceholder(name: string): boolean {
  return METADATA_PLACEHOLDERS.has(name);
}
