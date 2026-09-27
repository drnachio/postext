import type { InlineLink, InlineSpan, RefCase } from './types';
import { injectPlaceholderSpans } from './injectSpans';
import { sliceSpan } from './links';
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
/** Forced line break in a resource snippet (caption, note, table cell):
 *  `\\`, as in a title, or a backslash that ends a line (Markdown's hard
 *  break), with the spaces before it and, after `\\`, the spaces and one
 *  newline that follow. The indentation of the next line is kept: in a
 *  table cell two leading spaces nest a list item. It becomes
 *  {@link BREAK_PLACEHOLDER} in the snippet's plain text (see
 *  {@link replaceSnippetBreaks}); a plain newline stays a space in captions
 *  and notes. */
export const SNIPPET_BREAK_RE = /[ \t]*(?:\\\\[ \t]*(?:\r?\n)?|\\\r?\n)/g;

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
    // The value is printed as written. A pre-pass that ran before this one
    // (inline code) may have hidden characters of it behind escape
    // placeholders, which nothing else would turn back.
    if (attrs.text !== undefined) meta.text = restoreEscapes(attrs.text);
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
  /** Whitespace collapsed and trimmed; `''` for a chip of spaces alone. */
  text: string;
  style?: string;
  /** Absolute source offset of the leading `:` of `:chip[…]`. */
  sourceStart: number;
  /** Absolute source offset just past the directive (`]` or its `{…}`). */
  sourceEnd: number;
}

/** `:chip[text]` with an optional `{attrs}` right after the bracket. The
 *  text is one line, may not be empty (`:chip[]` stays literal text) and
 *  takes `\]` for a literal bracket. Text of spaces alone (NBSP included)
 *  makes an empty chip: a blank box as wide as its style's padding. */
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
 *  are parsed for their own inline marks. A chip's label is not parsed for
 *  maths, so its `\$` is unescaped here, as in the running text. */
export function injectChipSpans(spans: InlineSpan[], chips: ChipMeta[]): InlineSpan[] {
  return injectPlaceholderSpans(spans, chips, CHIP_PLACEHOLDER, (meta, bold, italic) => ({
    text: CHIP_PLACEHOLDER,
    bold,
    italic,
    chip: {
      ...(meta.style ? { style: meta.style } : {}),
      spans: parseInlineFormatting(protectDollarEscapes(meta.text)),
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

/** Inline code (`` `…` ``) is literal, as in CommonMark: the characters that
 *  would open a directive (`:ref{…}`, `:chip[…]`…), maths, a link or an
 *  inline mark inside the backticks are protected like backslash escapes
 *  and restored in the spans, so `` `:ref{id="x"}` `` prints as written
 *  instead of resolving a reference. Length-preserving, so source offsets
 *  hold. Runs first, before any inline pre-pass. */
const CODE_SPAN_RE = /(?<!\\)`([^`\n]+?)`/g;
const CODE_LITERAL_RE = /[:$*_^~[\]{}\\]/g;
export function protectCodeSpans(text: string): string {
  if (!text.includes('`')) return text;
  return text.replace(CODE_SPAN_RE, (_, inner: string) =>
    '`' + inner.replace(CODE_LITERAL_RE, (c) => String.fromCharCode(ESCAPE_BASE + c.charCodeAt(0))) + '`');
}

/** `:smallcaps[text]`: the text set in small capitals. The text is one
 *  line, may not be empty, may hold other inline marks and takes `\]` for a
 *  literal bracket (like `:chip[…]`). */
export const INLINE_SMALLCAPS_RE = /:smallcaps\[((?:\\.|[^\]\\\n])+)\]/g;
/** Opening of a `:smallcaps[` run in the source (see `computeSourceMap`). */
export const SMALLCAPS_OPENER = ':smallcaps[';
/** Private-use marks bracketing a small-caps run while the emphasis
 *  regexes run; they become the spans' `smallCaps` flag and are dropped. */
const SMALLCAPS_OPEN = '\uE1A1';
const SMALLCAPS_CLOSE = '\uE1A2';

const unescapeBrackets = (inner: string): string => inner.replace(/\\([[\]])/g, '$1');

/** Replace every `:smallcaps[…]` by its text between the private-use marks. */
function markSmallCaps(text: string): string {
  if (!text.includes(SMALLCAPS_OPENER)) return text;
  return text.replace(INLINE_SMALLCAPS_RE, (_, inner: string) => `${SMALLCAPS_OPEN}${unescapeBrackets(inner)}${SMALLCAPS_CLOSE}`);
}

/** Split the spans at the small-caps marks, flagging the text between them
 *  `smallCaps` and dropping the marks (and any piece left empty). */
function applySmallCapsMarks(spans: InlineSpan[]): InlineSpan[] {
  if (!spans.some((s) => s.text.includes(SMALLCAPS_OPEN) || s.text.includes(SMALLCAPS_CLOSE))) return spans;
  const out: InlineSpan[] = [];
  let depth = 0;
  for (const span of spans) {
    let piece = '';
    const flush = (): void => {
      if (piece.length > 0) out.push({ ...span, text: piece, ...(depth > 0 ? { smallCaps: true } : {}) });
      piece = '';
    };
    for (const ch of span.text) {
      if (ch === SMALLCAPS_OPEN) { flush(); depth++; }
      else if (ch === SMALLCAPS_CLOSE) { flush(); depth = Math.max(0, depth - 1); }
      else piece += ch;
    }
    flush();
  }
  return out;
}

/** `_` opens or closes emphasis only at a word boundary (CommonMark): an
 *  underscore between two letters or digits — a URL's `SR_AIR_EN.pdf`, a
 *  `snake_case` name — is text. `*` still works inside a word. */
const UNDERSCORE_OPEN = '(?<![\\p{L}\\p{N}])';
const UNDERSCORE_CLOSE = '(?![\\p{L}\\p{N}])';
const UNDERSCORE_BOLD_RE = new RegExp(`${UNDERSCORE_OPEN}__(.+?)__${UNDERSCORE_CLOSE}`, 'gu');
const UNDERSCORE_ITALIC_RE = new RegExp(`${UNDERSCORE_OPEN}_(.+?)_${UNDERSCORE_CLOSE}`, 'gu');

/** Left where markup was taken out — an image, the backticks of inline
 *  code, and here also a link, small caps or an emphasis marker — so that
 *  an `_` beside it reads as at a word boundary, as CommonMark reads the
 *  `)`, backtick or `*` it stands for (`**Nota**_bene_`). Dropped once the
 *  emphasis scanners have run. */
const MARKUP_BOUNDARY = '\uE1A5';

/** Remove the {@link MARKUP_BOUNDARY} marks from the spans, dropping any
 *  span left empty. */
function dropMarkupBoundaries(spans: InlineSpan[]): InlineSpan[] {
  if (!spans.some((s) => s.text.includes(MARKUP_BOUNDARY))) return spans;
  const out: InlineSpan[] = [];
  for (const span of spans) {
    if (!span.text.includes(MARKUP_BOUNDARY)) {
      out.push(span);
      continue;
    }
    const text = span.text.split(MARKUP_BOUNDARY).join('');
    if (text.length > 0) out.push({ ...span, text });
  }
  return out;
}

/** `spans` with the whitespace at the start of the first and at the end of
 *  the last trimmed, as `String.prototype.trim` trims their joined text;
 *  spans left empty are dropped and link ranges follow their text. */
export function trimSpans(spans: InlineSpan[]): InlineSpan[] {
  const out = [...spans];
  while (out.length > 0) {
    const first = out[0]!;
    const text = first.text.trimStart();
    if (text.length > 0) {
      if (text.length !== first.text.length) out[0] = sliceSpan(first, first.text.length - text.length);
      break;
    }
    out.shift();
  }
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    const text = last.text.trimEnd();
    if (text.length > 0) {
      if (text.length !== last.text.length) out[out.length - 1] = sliceSpan(last, 0, text.length);
      break;
    }
    out.pop();
  }
  return out;
}

/** `spans` set plain: bold, italic, scripts, small capitals and links
 *  dropped, adjacent text spans merged — a heading's spans as they were
 *  built before headings read inline marks (`headings.inlineMarks:
 *  false`). Formulas, references and swatches keep their own spans. */
export function plainSpans(spans: readonly InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let changed = false;
  for (const span of spans) {
    const { script, smallCaps, links, bold, italic, ...rest } = span;
    if (script || smallCaps || links || bold || italic) changed = true;
    const plain: InlineSpan = { ...rest, bold: false, italic: false };
    const special = plain.math || plain.mathRender || plain.swatch || plain.ref || plain.chip || plain.captionLabel;
    const last = out[out.length - 1];
    const lastSpecial = last && (last.math || last.mathRender || last.swatch || last.ref || last.chip || last.captionLabel);
    if (!special && last && !lastSpecial) {
      out[out.length - 1] = { ...last, text: last.text + plain.text };
      changed = true;
    } else {
      out.push(plain);
    }
  }
  return changed ? out : [...spans];
}

/** The text {@link parseInlineFormatting} sets, without its spans: each
 *  mark taken out leaves a {@link MARKUP_BOUNDARY}, as the parser's own
 *  marks and span splits do, so an `_` next to bold, a link or code opens
 *  emphasis in a heading as it does in a paragraph. */
export function stripInlineFormatting(text: string): string {
  const b = MARKUP_BOUNDARY;
  const wrap = (_: string, inner: string): string => b + inner + b;
  return restoreEscapes(replaceLinkSyntax(replaceLinkSyntax(protectEscapes(text), true, () => b), false, (label) => b + label + b)
    .replace(INLINE_SMALLCAPS_RE, (_, inner: string) => b + unescapeBrackets(inner) + b) // small caps
    .replace(/`(.+?)`/g, wrap)               // inline code
    .replace(/\*\*(.+?)\*\*/g, wrap)          // bold
    .replace(UNDERSCORE_BOLD_RE, wrap)        // bold alt
    .replace(/\*(.+?)\*/g, wrap)              // italic
    .replace(UNDERSCORE_ITALIC_RE, wrap)      // italic alt
    .replace(SUPERSCRIPT_RE, '$1')           // superscript
    .replace(SUBSCRIPT_RE, '$1')             // subscript
    .split(b).join('')
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

/** Private-use marks bracketing the text of a Markdown link while the
 *  emphasis scanners run (see {@link parseInlineFormatting}); never left in
 *  a span. Beside the chip placeholder and the small-caps marks, outside
 *  the escape range. */
const LINK_OPEN = '\uE1A3';
const LINK_CLOSE = '\uE1A4';

/** URL schemes a link may point at. Anything else with a scheme
 *  (`javascript:`, `data:`, `file:`…) sets its text without a link. */
const SAFE_LINK_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

/**
 * The target of a Markdown link destination (`url`, `url "title"`, `<url>`)
 * when it is safe to follow: an `http:`, `https:`, `mailto:`, `tel:` or
 * `ftp:` URL, or a relative one (`../guide`, `#top`). Spaces inside `<…>`
 * are percent-encoded; anything else unsafe or malformed gives undefined.
 */
export function linkHref(destination: string): string | undefined {
  const d = destination.trim();
  const angled = /^<([^<>]*)>/.exec(d);
  const raw = angled ? angled[1]!.trim().replace(/ /g, '%20') : (d.split(/\s+/)[0] ?? '');
  // Backslash escapes stand for the character itself (`\_`, `\(`).
  const url = restoreEscapes(raw).replace(/\\([!-/:-@[-`{-~])/g, '$1');
  if (url.length === 0 || /[\s\u0000-\u001f\u007f]/.test(url)) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (scheme !== undefined && !SAFE_LINK_SCHEMES.has(scheme)) return undefined;
  return url;
}

/**
 * Strip non-emphasis inline formatting (images, links, code) but keep
 * bold/italic markers. A link keeps its text between {@link LINK_OPEN} /
 * {@link LINK_CLOSE} marks, and its target joins `hrefs`, when the target
 * is safe; otherwise only the text is kept.
 */
function stripNonEmphasisFormatting(text: string, hrefs: string[]): string {
  // An image and the backticks of inline code leave a boundary mark, so an
  // `_` right after one still opens emphasis (see MARKUP_BOUNDARY).
  const images = replaceLinkSyntax(text, true, () => MARKUP_BOUNDARY);
  const links = replaceLinkSyntax(images, false, (label, destination) => {
    const href = destination === undefined ? undefined : linkHref(destination);
    if (href === undefined) return MARKUP_BOUNDARY + label + MARKUP_BOUNDARY;
    hrefs.push(href);
    return LINK_OPEN + label + LINK_CLOSE;
  });
  return links.replace(/`(.+?)`/g, `${MARKUP_BOUNDARY}$1${MARKUP_BOUNDARY}`);   // inline code
}

/** Spaces and line ends around a link destination and its title. */
function isLinkSpace(c: string | undefined): boolean {
  return c === ' ' || c === '\t' || c === '\n';
}

/**
 * Index just past the `)` closing the link destination that starts at
 * `from` (just after `](`), read as CommonMark reads it: `<…>`, or a run of
 * non-space characters whose parentheses balance (`File:A_(b).jpg`), then
 * an optional title in `"…"`, `'…'` or `(…)` after a space. A backslash
 * escapes the character after it. -1 when no well-formed destination
 * starts there.
 */
function destinationEnd(text: string, from: number): number {
  let i = from;
  while (isLinkSpace(text[i])) i++;
  if (text[i] === '<') {
    i++;
    while (i < text.length && text[i] !== '>') {
      if (text[i] === '\n' || text[i] === '<') return -1;
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= text.length) return -1;
    i++;
  } else {
    let depth = 0;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c <= ' ' || c === '\u007f') break;
      if (c === '(') depth++;
      else if (c === ')') {
        if (depth === 0) break;
        depth--;
      }
      i++;
    }
    if (depth !== 0) return -1;
  }
  let j = i;
  while (isLinkSpace(text[j])) j++;
  const quote = text[j];
  if (j > i && (quote === '"' || quote === "'" || quote === '(')) {
    const close = quote === '(' ? ')' : quote;
    j++;
    while (j < text.length && text[j] !== close) j += text[j] === '\\' ? 2 : 1;
    if (j >= text.length) return -1;
    j++;
    while (isLinkSpace(text[j])) j++;
  }
  return text[j] === ')' ? j + 1 : -1;
}

/**
 * Replace each Markdown link `[label](destination)` — or image
 * `![label](destination)`, with `image` — by `replace(label, destination)`.
 * The destination is read with balanced parentheses ({@link destinationEnd}).
 * One that is not well formed (an unclosed parenthesis, a space inside)
 * ends at the first `)`, as the syntax was always read, and reaches
 * `replace` as undefined: its label is set without a link. An empty `()`
 * leaves a link literal and removes an image, as before.
 */
function replaceLinkSyntax(
  text: string,
  image: boolean,
  replace: (label: string, destination: string | undefined) => string,
): string {
  const start = image ? /!\[(.*?)\]\(/g : /\[([^\]]+)\]\(/g;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text)) !== null) {
    const from = m.index + m[0].length;
    let end = destinationEnd(text, from);
    let destination: string | undefined;
    if (end > from + 1) {
      destination = text.slice(from, end - 1);
    } else {
      // Images never crossed a line end (`.*?`); links did (`[^)]+`).
      const rest = text.slice(from);
      const close = image ? rest.search(/[)\n]/) : rest.indexOf(')');
      if (close < (image ? 0 : 1) || rest[close] !== ')') {
        start.lastIndex = m.index + 1;
        continue;
      }
      end = from + close + 1;
    }
    out += text.slice(pos, m.index) + replace(m[1]!, destination);
    pos = end;
    start.lastIndex = end;
  }
  return pos === 0 ? text : out + text.slice(pos);
}

/** `[start, end)` of each well-formed link or image destination in `text`
 *  (what follows `](`, up to and with its closing `)`), read as
 *  {@link replaceLinkSyntax} reads it. */
function linkDestinationRanges(text: string): Array<readonly [number, number]> {
  const out: Array<readonly [number, number]> = [];
  const start = /\[[^\]]*\]\(/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(text)) !== null) {
    const from = m.index + m[0].length;
    const end = destinationEnd(text, from);
    if (end > from + 1) {
      out.push([from, end]);
      start.lastIndex = end;
    }
  }
  return out;
}

/** The `{…}` attributes of an inline directive — `:ref{…}`, `:swatch{…}`,
 *  a chip's `:chip[…]{…}` — in group 1: data, never text to break. */
const DIRECTIVE_ATTRS_RE = /(?::ref|:swatch|:chip\[(?:\\.|[^\]\\\n])+\])(\{[^}\n]*\})/g;

/**
 * Turn the forced line breaks of a resource snippet ({@link SNIPPET_BREAK_RE})
 * into {@link BREAK_PLACEHOLDER}. A `\\` inside a link destination belongs
 * to the URL (an escaped backslash, as in CommonMark) and one inside a
 * directive's attributes (a ref's `text="…"`) to the value: both stay. Run
 * after {@link protectCodeSpans}, so inline code keeps its backslashes too.
 */
export function replaceSnippetBreaks(text: string): string {
  if (!text.includes('\\')) return text;
  const kept = dataRanges(text);
  return text.replace(SNIPPET_BREAK_RE, (match: string, offset: number) => {
    const at = offset + match.indexOf('\\');
    return kept.some(([s, e]) => at >= s && at < e) ? match : BREAK_PLACEHOLDER;
  });
}

/** `[start, end)` of the parts of `text` that are data rather than text to
 *  set: link and image destinations, and the `{…}` attributes of the
 *  inline directives. */
function dataRanges(text: string): Array<readonly [number, number]> {
  const kept: Array<readonly [number, number]> = text.includes('](') ? linkDestinationRanges(text) : [];
  if (text.includes('{')) {
    DIRECTIVE_ATTRS_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DIRECTIVE_ATTRS_RE.exec(text)) !== null) {
      const end = m.index + m[0].length;
      kept.push([end - m[1]!.length, end]);
    }
  }
  return kept;
}

/**
 * `\$` sets a dollar sign. In the body the maths pass unescapes it; a
 * snippet (a table cell, a caption, a note) and a chip's label are not
 * parsed for maths, so their `\$` is protected like the other escapes and
 * restored in the spans (EF-151). Inside inline code the pair is already
 * protected and prints as written. A link destination and a directive's
 * attributes are left alone: `linkHref` reads the destination's escapes
 * itself, and a ref's `text="…"` prints as written, as in the body.
 */
const DOLLAR_ESCAPE_RE = /\\\$/g;
const DOLLAR_PLACEHOLDER = String.fromCharCode(ESCAPE_BASE + 0x24);
export function protectDollarEscapes(text: string): string {
  if (!text.includes('\\$')) return text;
  const kept = dataRanges(text);
  return text.replace(DOLLAR_ESCAPE_RE, (match: string, offset: number) =>
    kept.some(([s, e]) => offset >= s && offset < e) ? match : DOLLAR_PLACEHOLDER);
}

/** Remove the link marks from parsed spans, recording each link as a
 *  range of the spans it covers (`InlineSpan.links`); a span left empty
 *  (it held marks only) is dropped. `hrefs` are the targets in order. */
function takeLinkMarks(spans: InlineSpan[], hrefs: readonly string[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let next = 0;
  let open: string | undefined;
  for (const span of spans) {
    let text = '';
    let start = 0;
    const links: InlineLink[] = [];
    const close = () => {
      if (open !== undefined && text.length > start) links.push({ start, end: text.length, href: open });
    };
    for (let i = 0; i < span.text.length; i++) {
      const ch = span.text[i]!;
      if (ch === LINK_OPEN) {
        open = hrefs[next++];
        start = text.length;
      } else if (ch === LINK_CLOSE) {
        close();
        open = undefined;
      } else {
        text += ch;
      }
    }
    // A link still open runs on into the next span.
    close();
    if (text.length === 0) continue;
    out.push(links.length > 0 ? { ...span, text, links } : text === span.text ? span : { ...span, text });
  }
  return out;
}

/**
 * Split a text region into italic/non-italic spans, carrying an ambient bold flag.
 */
function splitItalicSpans(text: string, bold: boolean, forcedItalic: boolean, out: InlineSpan[]): void {
  if (forcedItalic) {
    if (text.length > 0) splitScriptSpans(text, bold, true, out);
    return;
  }
  const italicRe = new RegExp(`\\*(.+?)\\*|${UNDERSCORE_OPEN}_(.+?)_${UNDERSCORE_CLOSE}`, 'gu');
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
 * Recognizes ***bold italic***, **bold**, *italic* (and underscore equivalents),
 * `^sup^` / `~sub~` and `:smallcaps[…]`.
 */
export function parseInlineFormatting(text: string): InlineSpan[] {
  // Links keep their text between two marks while the emphasis scanners
  // run — so a link inside, across or around emphasis never changes how
  // the text splits into spans — and become ranges once the spans exist.
  const hrefs: string[] = [];
  const cleaned = stripNonEmphasisFormatting(markSmallCaps(protectEscapes(text)), hrefs);
  const spans: InlineSpan[] = [];

  // Triple markers (bold+italic) first, then double (bold) — longest first.
  const boldRe = new RegExp(
    `\\*\\*\\*(.+?)\\*\\*\\*|${UNDERSCORE_OPEN}___(.+?)___${UNDERSCORE_CLOSE}|\\*\\*(.+?)\\*\\*|${UNDERSCORE_OPEN}__(.+?)__${UNDERSCORE_CLOSE}`,
    'gu',
  );
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
  // Small caps first: its marks split spans without moving link ranges,
  // which are taken from the finished spans.
  const marked = applySmallCapsMarks(dropMarkupBoundaries(spans));
  return hrefs.length > 0 ? takeLinkMarks(marked, hrefs) : marked;
}
