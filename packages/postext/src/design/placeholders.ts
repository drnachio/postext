import type { DocumentMetadata } from '../types';
import type { VDTPage } from '../vdt';
import { formatNumeral } from '../numbering';
import {
  resolvePlaceholders as legacyResolvePlaceholders,
  type PlaceholderContext as LegacyPlaceholderContext,
  type PlaceholderResult,
} from '../pipeline/placeholders';

export type DesignContextKind = 'header' | 'footer' | 'heading';

/** Heading-specific fields for placeholder resolution. */
export interface HeadingPlaceholderInfo {
  titleText: string;
  /** Formatted number per the level's `numberingTemplate`, or empty string. */
  formattedNumber: string;
  /** Raw numeric counter for the heading level, if available. */
  numericValue?: number;
  chapterNumber?: string;
  chapterTitle?: string;
}

export interface DesignPlaceholderContext {
  kind: DesignContextKind;
  page: VDTPage;
  allPages: VDTPage[];
  metadata: DocumentMetadata;
  chapterTitleByPageIndex: string[];
  /** Only present in heading contexts. */
  heading?: HeadingPlaceholderInfo;
}

const HEADER_FOOTER_PLACEHOLDERS = new Set([
  'pageNumber',
  'totalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
]);

const HEADING_PLACEHOLDERS = new Set([
  'pageNumber',
  'totalPages',
  'title',
  'subtitle',
  'author',
  'publishDate',
  'chapterTitle',
  'chapterNumber',
  'titleText',
  'number',
  'numberDecimal',
  'numberRoman',
  'numberRomanLower',
  'numberAlpha',
  'numberAlphaLower',
]);

export function allowedPlaceholdersFor(kind: DesignContextKind): Set<string> {
  return kind === 'heading' ? HEADING_PLACEHOLDERS : HEADER_FOOTER_PLACEHOLDERS;
}

function resolveHeadingName(name: string, ctx: DesignPlaceholderContext): string {
  const h = ctx.heading;
  switch (name) {
    case 'titleText':
      return h?.titleText ?? '';
    case 'number':
      return h?.formattedNumber ?? '';
    case 'numberDecimal':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'decimal') : '';
    case 'numberRoman':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'upper-roman') : '';
    case 'numberRomanLower':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'lower-roman') : '';
    case 'numberAlpha':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'upper-alpha') : '';
    case 'numberAlphaLower':
      return h?.numericValue !== undefined ? formatNumeral(h.numericValue, 'lower-alpha') : '';
    case 'chapterNumber':
      return h?.chapterNumber ?? '';
    case 'chapterTitle':
      return h?.chapterTitle ?? ctx.chapterTitleByPageIndex[ctx.page.index] ?? '';
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
    default:
      return '';
  }
}

/** Resolve placeholders for a design slot. The header/footer context
 *  reuses the legacy resolver (same placeholder set). Heading contexts
 *  use the extended heading-aware resolver. */
export function resolveDesignPlaceholders(
  template: string,
  ctx: DesignPlaceholderContext,
): PlaceholderResult {
  if (ctx.kind !== 'heading') {
    const legacy: LegacyPlaceholderContext = {
      page: ctx.page,
      allPages: ctx.allPages,
      metadata: ctx.metadata,
      chapterTitleByPageIndex: ctx.chapterTitleByPageIndex,
    };
    return legacyResolvePlaceholders(template, legacy);
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
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
        out += template.slice(i, end + 1);
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
