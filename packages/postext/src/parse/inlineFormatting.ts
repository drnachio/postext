import type { InlineSpan, RefCase } from './types';
import { injectPlaceholderSpans } from './injectSpans';
import { parseDirectiveAttrs } from './attrs';

/** Atomic plain-text placeholder for an inline reference span. One code unit
 *  per `:ref{…}` so `sourceMap` stays 1-to-1 (mirroring the inline-math
 *  `MATH_PLACEHOLDER` technique). A distinct code point from the math
 *  placeholder so `sourceMap` building and span injection can tell the two
 *  apart even when a paragraph mixes refs and math. */
export const REF_PLACEHOLDER = '⁣';

/** Atomic plain-text placeholder for an inline colour swatch span
 *  (`:swatch{…}`), one code unit per swatch like the ref and math
 *  placeholders, and a code point of its own so the three never collide. */
export const SWATCH_PLACEHOLDER = '⁤';

/** Atomic plain-text placeholder for an inline chip (`:chip[…]`), one
 *  code unit per chip. A private-use code point: the chip's words are never
 *  painted from it (they live in the span's `chip.spans`). */
export const CHIP_PLACEHOLDER = '\uE1A0';

/** Forced line break inside a title: `\\` in a heading (or a part `title`)
 *  becomes this LINE SEPARATOR in the plain text. Opener designs render it
 *  as a real line break; the in-column heading, running heads, outlines and
 *  `{chapterTitle}` show a space instead. */
export const BREAK_PLACEHOLDER = '\u2028';
/** `\\` with optional surrounding spaces. */
export const TITLE_BREAK_RE = /[ \t]*\\\\[ \t]*/g;

/** Positions of the break placeholder in a plain text. */
export function titleBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === BREAK_PLACEHOLDER) out.push(i);
  return out;
}

/** Replace the break placeholder with a space (single-line contexts). */
export function flattenTitleBreaks(text: string): string {
  return text.replace(/\u2028/g, ' ');
}

/** Insert `\n` at the recorded break indices when the (possibly uppercased
 *  or otherwise length-preserving transformed) title still has the parsed
 *  length; otherwise the title is returned unchanged. */
export function applyTitleBreaks(title: string, breaks: readonly number[] | undefined, parsedLength: number): string {
  if (!breaks || breaks.length === 0 || title.length !== parsedLength) return title;
  const chars = title.split('');
  for (const i of breaks) if (i < chars.length) chars[i] = '\n';
  return chars.join('').replace(/[ \t]*\n[ \t]*/g, '\n');
}

/** Resolved metadata for an inline `:ref{…}` directive. The owning span's
 *  `text` is a single `REF_PLACEHOLDER`; the pipeline later resolves the
 *  reference to its computed number/label. */
export interface RefMeta {
  resourceId: string;
  style?: 'default' | 'number' | 'full';
  text?: string;
  case?: RefCase;
  /** Absolute source offset of the leading `:` of `:ref{…}`. */
  sourceStart: number;
  /** Absolute source offset just past the closing `}`. */
  sourceEnd: number;
}

/** `:ref{…}` — the attribute blob is parsed with the shared directive
 *  attribute grammar, so attributes may come in any order and use either
 *  quote style. A ref without an `id` is not a reference (left as text). */
const INLINE_REF_RE = /:ref\{([^}]*)\}/g;

const REF_STYLES: ReadonlySet<string> = new Set(['default', 'number', 'full']);
const REF_CASES: ReadonlySet<string> = new Set(['lower', 'upper', 'capitalize']);

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
    const attrs = parseDirectiveAttrs(m[1]!);
    const id = attrs.id;
    // Malformed (no id): keep the literal text so the author sees it.
    if (id === undefined || id.length === 0) continue;
    out += text.slice(last, m.index);
    const meta: RefMeta = {
      resourceId: id,
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.index + m[0].length,
    };
    // Unknown `style` / `case` values are ignored rather than rejected so a
    // typo degrades to the default rendering instead of a literal `:ref{`.
    if (attrs.style !== undefined && REF_STYLES.has(attrs.style)) {
      meta.style = attrs.style as RefMeta['style'];
    }
    if (attrs.text !== undefined) meta.text = attrs.text;
    if (attrs.case !== undefined && REF_CASES.has(attrs.case)) {
      meta.case = attrs.case as RefCase;
    }
    refs.push(meta);
    out += REF_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleaned: out, refs };
}

/** Metadata of an inline `:swatch{color="…"}` directive: the colour as
 *  written (a hex, or a palette entry id the pipeline resolves) and its
 *  source extent. */
export interface SwatchMeta {
  color: string;
  /** Absolute source offset of the leading `:` of `:swatch{…}`. */
  sourceStart: number;
  /** Absolute source offset just past the closing `}`. */
  sourceEnd: number;
}

/** `:swatch{…}` — same attribute grammar as `:ref{…}`. A swatch without a
 *  `color` is not a swatch (left as text). */
const INLINE_SWATCH_RE = /:swatch\{([^}]*)\}/g;

/**
 * Extract inline `:swatch{…}` colour swatches from a line's text, replacing
 * each by `SWATCH_PLACEHOLDER` and returning the swatch metadata in order.
 * Runs right after {@link extractInlineRefs} on its cleaned text.
 */
export function extractInlineSwatches(
  text: string,
  fallbackStart: number,
): { cleaned: string; swatches: SwatchMeta[] } {
  const swatches: SwatchMeta[] = [];
  let out = '';
  let last = 0;
  INLINE_SWATCH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_SWATCH_RE.exec(text)) !== null) {
    const attrs = parseDirectiveAttrs(m[1]!);
    const color = attrs.color?.trim();
    if (color === undefined || color.length === 0) continue;
    out += text.slice(last, m.index);
    swatches.push({
      color,
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.index + m[0].length,
    });
    out += SWATCH_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleaned: out, swatches };
}

/** Metadata of an inline `:chip[text]{style="…"}`: the text as written
 *  between the brackets, the style id and the source extent. */
export interface ChipMeta {
  text: string;
  style?: string;
  /** Absolute source offset of the leading `:` of `:chip[…]`. */
  sourceStart: number;
  /** Absolute source offset just past the directive (`]` or its `{…}`). */
  sourceEnd: number;
}

/** `:chip[text]` with an optional `{attrs}` right after the bracket. The
 *  text is one line, may not be empty and takes `\]` for a literal
 *  bracket. */
const INLINE_CHIP_RE = /:chip\[((?:\\.|[^\]\\\n])+)\](?:\{([^}\n]*)\})?/g;

/**
 * Extract inline `:chip[…]` chips from a line's text, replacing each by
 * `CHIP_PLACEHOLDER` and returning the chip metadata in order. Runs first,
 * before {@link extractInlineRefs}, so the chip text (which may hold marks
 * of its own) is shielded from the later passes.
 */
export function extractInlineChips(
  text: string,
  fallbackStart: number,
): { cleaned: string; chips: ChipMeta[] } {
  const chips: ChipMeta[] = [];
  let out = '';
  let last = 0;
  INLINE_CHIP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_CHIP_RE.exec(text)) !== null) {
    const inner = m[1]!.replace(/\\([\[\]])/g, '$1').replace(/\s+/g, ' ').trim();
    if (inner.length === 0) continue;
    const style = m[2] !== undefined ? parseDirectiveAttrs(m[2]).style?.trim() : undefined;
    out += text.slice(last, m.index);
    chips.push({
      text: inner,
      ...(style ? { style } : {}),
      sourceStart: fallbackStart + m.index,
      sourceEnd: fallbackStart + m.index + m[0].length,
    });
    out += CHIP_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { cleaned: out, chips };
}

/** Attach a `chip` to each `CHIP_PLACEHOLDER` occurrence in order; the chip
 *  span is its own entry carrying the ambient bold / italic, and its words
 *  are parsed for their own inline marks. */
export function injectChipSpans(spans: InlineSpan[], chips: ChipMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, chips, CHIP_PLACEHOLDER, (meta, bold, italic) => ({
    text: CHIP_PLACEHOLDER,
    bold,
    italic,
    chip: {
      ...(meta.style ? { style: meta.style } : {}),
      spans: parseInlineFormatting(meta.text),
    },
  }));
}

/** Attach a `swatch` to each `SWATCH_PLACEHOLDER` occurrence in order; the
 *  swatch span is its own entry, like a ref's. */
export function injectSwatchSpans(spans: InlineSpan[], swatches: SwatchMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, swatches, SWATCH_PLACEHOLDER, (meta, bold, italic) => ({
    text: SWATCH_PLACEHOLDER,
    bold,
    italic,
    swatch: { color: meta.color },
  }));
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
    if (meta.case !== undefined) ref.case = meta.case;
    return { text: REF_PLACEHOLDER, bold, italic, ref };
  });
}

/**
 * Strip inline markdown formatting for plain-text extraction.
 * Handles bold, italic, code, links, and images.
 */
/** Backslash escapes (CommonMark): `\*`, `\_`, `\^`, `\~` and `` \` `` set
 *  the character itself instead of opening a marker — a footnote asterisk
 *  in a table note, a literal caret. Protected behind private-use
 *  placeholders while the marker regexes run, restored in the spans. */
const ESCAPE_RE = /\\([*_^~`])/g;
const ESCAPE_BASE = 0xe100;
const ESCAPED_RE = /[\ue100-\ue17f]/g;
export function protectEscapes(text: string): string {
  return text.replace(ESCAPE_RE, (_, c: string) => String.fromCharCode(ESCAPE_BASE + c.charCodeAt(0)));
}
export function restoreEscapes(text: string): string {
  return text.replace(ESCAPED_RE, (m) => String.fromCharCode(m.charCodeAt(0) - ESCAPE_BASE));
}

export function stripInlineFormatting(text: string): string {
  return restoreEscapes(protectEscapes(text)
    .replace(/!\[.*?\]\(.*?\)/g, '')        // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\*\*(.+?)\*\*/g, '$1')         // bold
    .replace(/__(.+?)__/g, '$1')              // bold alt
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/_(.+?)_/g, '$1')               // italic alt
    .replace(/`(.+?)`/g, '$1')              // inline code
    .replace(SUPERSCRIPT_RE, '$1')           // superscript
    .replace(SUBSCRIPT_RE, '$1')             // subscript
    .trim());
}

/** `^text^` (superscript) and `~text~` (subscript): the marked text starts
 *  and ends with a non-space character and carries no other marker of the
 *  same kind, so a stray caret or tilde in prose stays literal. */
export const SUPERSCRIPT_RE = /\^(\S(?:[^^\n]*?\S)?)\^/g;
export const SUBSCRIPT_RE = /~(\S(?:[^~\n]*?\S)?)~/g;

/** Split a bold / italic run into plain and script spans: `^…^` becomes a
 *  superscript span, `~…~` a subscript one (the markers are dropped). */
function splitScriptSpans(text: string, bold: boolean, italic: boolean, out: InlineSpan[]): void {
  const re = /\^(\S(?:[^^\n]*?\S)?)\^|~(\S(?:[^~\n]*?\S)?)~/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold, italic });
    if (m[1] !== undefined) out.push({ text: m[1], bold, italic, script: 'sup' });
    else out.push({ text: m[2]!, bold, italic, script: 'sub' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold, italic });
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
    if (text.length > 0) splitScriptSpans(text, bold, true, out);
    return;
  }
  const italicRe = /\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index);
      if (before.length > 0) splitScriptSpans(before, bold, false, out);
    }
    const inner = m[1] ?? m[2]!;
    if (inner.length > 0) splitScriptSpans(inner, bold, true, out);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last);
    if (rest.length > 0) splitScriptSpans(rest, bold, false, out);
  }
}

/**
 * Parse inline formatting to produce spans with bold and italic flags.
 * Recognizes ***bold italic***, **bold**, *italic* (and underscore equivalents).
 */
export function parseInlineFormatting(text: string): InlineSpan[] {
  const cleaned = stripNonEmphasisFormatting(protectEscapes(text));
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

  for (const s of spans) if (ESCAPED_RE.test(s.text)) s.text = restoreEscapes(s.text);
  return spans;
}
