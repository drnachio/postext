import type { InlineSpan } from './types';
import { injectPlaceholderSpans } from './injectSpans';

/** Atomic plain-text placeholder for an inline reference span. One code unit
 *  per `:ref{…}` so `sourceMap` stays 1-to-1 (mirroring the inline-math
 *  `MATH_PLACEHOLDER` technique). A distinct code point from the math
 *  placeholder so `sourceMap` building and span injection can tell the two
 *  apart even when a paragraph mixes refs and math. */
export const REF_PLACEHOLDER = '⁣';

/** Resolved metadata for an inline `:ref{…}` directive. The owning span's
 *  `text` is a single `REF_PLACEHOLDER`; the pipeline later resolves the
 *  reference to its computed number/label. */
export interface RefMeta {
  resourceId: string;
  style?: 'default' | 'number' | 'full';
  text?: string;
  /** Absolute source offset of the leading `:` of `:ref{…}`. */
  sourceStart: number;
  /** Absolute source offset just past the closing `}`. */
  sourceEnd: number;
}

/** `:ref{id="…"}` with optional `style=` and `text=` attributes. */
const INLINE_REF_RE =
  /:ref\{id="([^"]+)"(?:\s+style="(default|number|full)")?(?:\s+text="([^"]*)")?\}/g;

/**
 * Extract inline `:ref{…}` references from a line's text.
 *  - Returns a cleaned text where each match is replaced by `REF_PLACEHOLDER`.
 *  - Returns the list of ref metadata aligned with the order of placeholders.
 *
 *  This runs as the first inline pre-pass (before math and formatting) so that
 *  a `text="…"` attribute cannot be mangled by later passes.
 *
 *  `fallbackStart` is the absolute source offset of `text[0]` in the original
 *  markdown; ref offsets are computed relative to it.
 */
export function extractInlineRefs(
  text: string,
  fallbackStart: number,
): { cleaned: string; refs: RefMeta[] } {
  const refs: RefMeta[] = [];
  let out = '';
  let last = 0;
  INLINE_REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_REF_RE.exec(text)) !== null) {
    out += text.slice(last, m.index);
    const meta: RefMeta = {
      resourceId: m[1]!,
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.index + m[0].length,
    };
    if (m[2] !== undefined) meta.style = m[2] as RefMeta['style'];
    if (m[3] !== undefined) meta.text = m[3];
    refs.push(meta);
    out += REF_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleaned: out, refs };
}

/** Walk an InlineSpan list and attach a `ref` to each `REF_PLACEHOLDER`
 *  occurrence in order. Splits plain-text spans around the placeholder so the
 *  ref span is its own entry (carrying the ambient bold/italic). Mirrors
 *  `injectMathSpans`. */
export function injectRefSpans(spans: InlineSpan[], refs: RefMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, refs, REF_PLACEHOLDER, (meta, bold, italic) => {
    const ref: InlineSpan['ref'] = { resourceId: meta.resourceId };
    if (meta.style !== undefined) ref.style = meta.style;
    if (meta.text !== undefined) ref.text = meta.text;
    return { text: REF_PLACEHOLDER, bold, italic, ref };
  });
}

/**
 * Strip inline markdown formatting for plain-text extraction.
 * Handles bold, italic, code, links, and images.
 */
export function stripInlineFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/__(.+?)__/g, '$1')              // bold alt
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/_(.+?)_/g, '$1')               // italic alt
    .replace(/`(.+?)`/g, '$1')              // inline code
    .trim();
}

/**
 * Strip non-emphasis inline formatting (images, links, code) but keep bold/italic markers.
 */
function stripNonEmphasisFormatting(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/`(.+?)`/g, '$1');             // inline code
}

/**
 * Split a text region into italic/non-italic spans, carrying an ambient bold flag.
 */
function splitItalicSpans(text: string, bold: boolean, forcedItalic: boolean, out: InlineSpan[]): void {
  if (forcedItalic) {
    if (text.length > 0) out.push({ text, bold, italic: true });
    return;
  }
  const italicRe = /\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index);
      if (before.length > 0) out.push({ text: before, bold, italic: false });
    }
    const inner = m[1] ?? m[2]!;
    if (inner.length > 0) out.push({ text: inner, bold, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last);
    if (rest.length > 0) out.push({ text: rest, bold, italic: false });
  }
}

/**
 * Parse inline formatting to produce spans with bold and italic flags.
 * Recognizes ***bold italic***, **bold**, *italic* (and underscore equivalents).
 */
export function parseInlineFormatting(text: string): InlineSpan[] {
  const cleaned = stripNonEmphasisFormatting(text);
  const spans: InlineSpan[] = [];

  // Triple markers (bold+italic) first, then double (bold) — longest first.
  const boldRe = /\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      splitItalicSpans(cleaned.slice(lastIndex, match.index), false, false, spans);
    }
    const triple = match[1] ?? match[2];
    if (triple !== undefined) {
      splitItalicSpans(triple, true, true, spans);
    } else {
      const inner = match[3] ?? match[4]!;
      splitItalicSpans(inner, true, false, spans);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < cleaned.length) {
    splitItalicSpans(cleaned.slice(lastIndex), false, false, spans);
  }

  if (spans.length === 0) {
    const trimmed = cleaned.trim();
    if (trimmed.length > 0) {
      splitItalicSpans(trimmed, false, false, spans);
    }
  }

  return spans;
}
