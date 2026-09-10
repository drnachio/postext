import type { InlineSpan } from './types';
import { extractInlineRefs, injectRefSpans, parseInlineFormatting } from './inlineFormatting';
import { computeSourceMap } from './sourceMapping';

/**
 * Inline snippets — the self-contained rich-text runs held by a resource
 * (table cells, captions, notes). They share the body text's inline
 * microformat (`**bold**`, `*italic*`, `` `code` ``, `:ref{…}`) but live
 * outside the markdown document, so their "source" is the snippet string
 * itself and offsets are relative to it.
 *
 * Measurement (`pipeline/resourceLayout.ts`) and selection mapping (the
 * sandbox's click-to-edit) must agree on one parse, hence this module: the
 * measurer consumes {@link parseInlineSnippetSpans}; a host that maps a
 * rendered glyph back to a position in the snippet uses
 * {@link mapInlineSnippet}.
 */

/** Parse a snippet into inline spans, recognising the inline `:ref{…}`
 *  microformat so references resolve to their computed labels. Each ref
 *  becomes a one-char placeholder span (see `REF_PLACEHOLDER`). */
export function parseInlineSnippetSpans(content: string): InlineSpan[] {
  const { cleaned, refs } = extractInlineRefs(content, 0);
  return injectRefSpans(parseInlineFormatting(cleaned), refs);
}

/** A parsed snippet with its plain text and per-character source map. */
export interface InlineSnippetMapping {
  /** The parsed spans, exactly what the measurer lays out. */
  spans: InlineSpan[];
  /** The raw joined span text — NOT whitespace-normalised, because resource
   *  runs are measured from the raw spans (a `\n\n` inside a cell survives as
   *  one whitespace token). Each `:ref{…}` is one placeholder char. */
  text: string;
  /** `sourceMap[i]` is the offset in `content` of `text[i]` (markers such as
   *  `**` are skipped; a ref placeholder maps to the leading `:`). */
  sourceMap: number[];
}

/** Parse a snippet and build the plain-text → snippet-offset map. */
export function mapInlineSnippet(content: string): InlineSnippetMapping {
  const spans = parseInlineSnippetSpans(content);
  const text = spans.map((s) => s.text).join('');
  const sourceMap = computeSourceMap(content, 0, content.length, text);
  return { spans, text, sourceMap };
}
