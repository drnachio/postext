import type { InlineSpan } from './types';
import type { Resource } from '../types';
import { extractInlineChips, extractInlineRefs, extractInlineSwatches, injectChipSpans, injectRefSpans, injectSwatchSpans, parseInlineFormatting, protectCodeSpans, protectDollarEscapes, replaceSnippetBreaks } from './inlineFormatting';
import { computeSourceMap } from './sourceMapping';
import { joinEastAsianSnippetLines } from './softBreaks';
import { extractInlineCitations, injectCitationSpans } from './citations';
import { extractInlineMath, injectMathSpans } from './inlineMath';

/**
 * Inline snippets — the self-contained rich-text runs held by a resource
 * (table cells, captions, notes). They share the body text's inline
 * microformat (`**bold**`, `*italic*`, `` `code` ``, `:ref{…}`, `:swatch{…}`,
 * `:chip[…]`) but live
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
 *  becomes a one-char placeholder span (see `REF_PLACEHOLDER`). A forced
 *  line break (`\\`, or a backslash ending a line) becomes one
 *  `BREAK_PLACEHOLDER` char, where the measurer starts a new line; inside
 *  inline code and link destinations it stays literal, and in a chip's
 *  label (set on one line) it becomes a space. Inline maths `$…$` is a
 *  formula (#541), by Pandoc's rule: the opening `$` has no space after
 *  it, the closing one no space before it and no digit after it, so the
 *  prices of "$5 to $10" stay text; `\$` prints a dollar sign, as it does
 *  in the body. A chip's label is not parsed for maths. A link
 *  destination reads its own escapes, and a directive's
 *  attributes (a ref's `text="…"`) are printed as written. A line end
 *  between two East Asian characters is taken out (see `softBreaks.ts`).
 *  With `citations` (a caption or a note, #529) a citation (`[@key]`,
 *  `@key`) becomes a citation span, as in the body; elsewhere (a table
 *  cell) it stays text. */
export function parseInlineSnippetSpans(content: string, options?: { citations?: boolean }): InlineSpan[] {
  const chips = extractInlineChips(protectDollarEscapes(replaceSnippetBreaks(protectCodeSpans(content))), 0);
  const { cleaned, refs } = extractInlineRefs(chips.cleaned, 0);
  const cites = options?.citations ? extractInlineCitations(cleaned, 0) : { cleaned, citations: [] };
  const sw = extractInlineSwatches(cites.cleaned, 0);
  const maths = sw.cleaned.includes('$') ? extractInlineMath(sw.cleaned, null, 0, sw.cleaned.length, true) : { cleaned: sw.cleaned, maths: [] };
  // A line end between two Chinese or Japanese characters is no space
  // (#181); elsewhere it stays whitespace.
  return joinEastAsianSnippetLines(
    injectChipSpans(injectRefSpans(injectCitationSpans(injectSwatchSpans(injectMathSpans(parseInlineFormatting(maths.cleaned), maths.maths), sw.swatches), cites.citations), refs), chips.chips),
  );
}

/** The citations of a resource's caption and note, in order (#529). */
export function snippetCitations(content: string | undefined): NonNullable<InlineSpan['citation']>[] {
  if (!content || !content.includes('@')) return [];
  return parseInlineSnippetSpans(content, { citations: true }).flatMap((s) => (s.citation ? [s.citation] : []));
}

/** A parsed snippet with its plain text and per-character source map. */
export interface InlineSnippetMapping {
  /** The parsed spans, exactly what the measurer lays out. */
  spans: InlineSpan[];
  /** The raw joined span text — NOT whitespace-normalised, because resource
   *  runs are measured from the raw spans (a `\n\n` inside a cell survives as
   *  one whitespace token). Each `:ref{…}` is one placeholder char, and so
   *  is each forced line break (`BREAK_PLACEHOLDER`, whitespace to `\s`). */
  text: string;
  /** `sourceMap[i]` is the offset in `content` of `text[i]` (markers such as
   *  `**` are skipped; a ref placeholder maps to the leading `:`, a forced
   *  break to its backslash). */
  sourceMap: number[];
}

/** Parse a snippet and build the plain-text → snippet-offset map. */
export function mapInlineSnippet(content: string): InlineSnippetMapping {
  const spans = parseInlineSnippetSpans(content);
  const text = spans.map((s) => s.text).join('');
  const sourceMap = computeSourceMap(content, 0, content.length, text);
  return { spans, text, sourceMap };
}

/** Whether a resource's caption, note or table cells may hold inline maths
 *  (#541): a `$` in any of them. A host starts the math engine before
 *  laying out such a resource, as it does for a `$` in the text. */
export function resourceHasMath(resource: Pick<Resource, 'caption' | 'note' | 'table'>): boolean {
  if (resource.caption?.includes('$') || resource.note?.includes('$')) return true;
  return resource.table?.model.rows.some((row) => row.some((cell) => cell.content.includes('$'))) ?? false;
}

/** Whether laying out `content` sets any formula: a `$` in its text or in
 *  one of its resources (#541). */
export function contentHasMath(content: { markdown: string; resources?: readonly Pick<Resource, 'caption' | 'note' | 'table'>[] }): boolean {
  return content.markdown.includes('$') || (content.resources ?? []).some(resourceHasMath);
}
