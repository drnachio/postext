// Inline cross-references: `:ref{…}`, `@id` and LaTeX `\ref` read out of
// a run into placeholders, and their spans put back (#1276: split out of
// inlineFormatting.ts).
import type { RefStyle, RefCase, InlineSpan } from '../types.js';
import { injectPlaceholderSpans } from '../injectSpans.js';
import { parseDirectiveAttrs } from '../attrs.js';
import { restoreEscapes } from './markup.js';

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
  style?: RefStyle;
  text?: string;
  case?: RefCase;
  /** Absolute source offset of the leading `:` of `:ref{…}`. */
  sourceStart: number;
  /** Absolute source offset just past the closing `}`. */
  sourceEnd: number;
}

/** The next `<open>…}` from `from` on, as `/<open>([^}]*)\}/g` finds it
 *  (`open`: `:ref{`, `:swatch{`), with the text between the braces. A scan
 *  in one pass: once no `}` follows an opening, none follows a later one.
 *
 *  `:ref{…}` — the attribute blob is parsed with the shared directive
 *  attribute grammar, so attributes may come in any order and use either
 *  quote style. A ref without an `id` is not a reference (left as text). */
export function nextBraced(text: string, open: string, from: number): { index: number; end: number; body: string } | null {
  const index = text.indexOf(open, from);
  if (index < 0) return null;
  const close = text.indexOf('}', index + open.length);
  return close < 0 ? null : { index, end: close + 1, body: text.slice(index + open.length, close) };
}

/** A pandoc-crossref reference (#262): `@sec:intro`, `[@fig:map]`, and
 *  `[-@tbl:x]` for the bare number; a capital (`@Sec:intro`) capitalises
 *  the label. The `@` follows no letter, digit or backslash (an e-mail
 *  address stays text). The identifier ends on a letter or a digit, so the
 *  stop after it stays text. */
const CROSSREF_ID = '[\\p{L}\\p{N}_](?:[\\p{L}\\p{N}_.:-]*[\\p{L}\\p{N}_])?';
const CROSSREF_PREFIX = '[Ss]ec|[Ff]ig|[Tt]bl|[Ee]q|[Ll]st';
const CROSSREF_RE = new RegExp(
  `\\[(-)?@(${CROSSREF_PREFIX}):(${CROSSREF_ID})\\]|(?<![\\p{L}\\p{N}_\\\\])@(${CROSSREF_PREFIX}):(${CROSSREF_ID})`,
  'gu',
);

/** LaTeX's references in the text (#530): `\eqref{eq:x}` prints the
 *  equation's number as its formula does ("(3)"), `\ref{x}` the bare
 *  number of whatever it names. A `~` before one (`Eq.~\eqref{x}`) is
 *  LaTeX's tie: a no-break space. Inside `$…$` they are left to the
 *  formula. */
const LATEX_REF_RE = /(~?)\\(eq)?ref\{([^{}\s]+)\}/g;

/** The `[start, end)` ranges of a line's inline `$…$` formulas (a `\$` is
 *  no delimiter, a `$$` no formula), as `extractInlineMath` reads them. */
function inlineMathRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let open = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\') { i++; continue; }
    if (c === '\n') { open = -1; continue; }
    if (c !== '$') continue;
    if (text[i + 1] === '$' && open < 0) { i++; continue; }
    if (open < 0) open = i;
    else {
      out.push([open, i + 1]);
      open = -1;
    }
  }
  return out;
}

const REF_STYLES: ReadonlySet<string> = new Set(['default', 'number', 'full', 'title', 'page', 'pageNumber']);
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
  if (!text.includes(':ref{') && !text.includes('@') && !text.includes('ref{')) return { cleaned: text, refs: [] };
  const found: { index: number; length: number; meta: Omit<RefMeta, 'sourceStart' | 'sourceEnd'>; tie?: boolean }[] = [];
  for (let r = nextBraced(text, ':ref{', 0); r; r = nextBraced(text, ':ref{', r.end)) {
    const attrs = parseDirectiveAttrs(r.body);
    const id = attrs.id;
    // Malformed (no id): keep the literal text so the author sees it.
    if (id === undefined || id.length === 0) continue;
    const meta: Omit<RefMeta, 'sourceStart' | 'sourceEnd'> = { resourceId: id };
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
    found.push({ index: r.index, length: r.end - r.index, meta });
  }
  let m: RegExpExecArray | null;
  if (text.includes('@')) {
    CROSSREF_RE.lastIndex = 0;
    while ((m = CROSSREF_RE.exec(text)) !== null) {
      const bracketed = m[2] !== undefined;
      const prefix = (bracketed ? m[2] : m[4])!;
      const id = (bracketed ? m[3] : m[5])!;
      const meta: Omit<RefMeta, 'sourceStart' | 'sourceEnd'> = { resourceId: `${prefix.toLowerCase()}:${id}` };
      if (bracketed && m[1] === '-') meta.style = 'number';
      if (prefix[0] !== prefix[0]!.toLowerCase()) meta.case = 'capitalize';
      found.push({ index: m.index, length: m[0].length, meta });
    }
  }
  if (text.includes('\\ref{') || text.includes('\\eqref{')) {
    const maths = text.includes('$') ? inlineMathRanges(text) : [];
    LATEX_REF_RE.lastIndex = 0;
    while ((m = LATEX_REF_RE.exec(text)) !== null) {
      const at = m.index;
      if (maths.some(([a, b]) => at >= a && at < b)) continue;
      // `\ref` prints the bare number; `\eqref` the equation's printed
      // form, a reference's default.
      const meta: Omit<RefMeta, 'sourceStart' | 'sourceEnd'> = { resourceId: m[3]! };
      if (m[2] === undefined) meta.style = 'number';
      found.push({ index: at, length: m[0].length, meta, ...(m[1] ? { tie: true } : {}) });
    }
  }
  found.sort((a, b) => a.index - b.index);
  const refs: RefMeta[] = [];
  let out = '';
  let last = 0;
  for (const f of found) {
    if (f.index < last) continue; // inside a `:ref{…}` already taken
    out += text.slice(last, f.index);
    refs.push({ ...f.meta, sourceStart: fallbackStart + f.index + (f.tie ? 1 : 0), sourceEnd: fallbackStart + f.index + f.length });
    out += f.tie ? `\u00a0${REF_PLACEHOLDER}` : REF_PLACEHOLDER;
    last = f.index + f.length;
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
    if (meta.case !== undefined) ref.case = meta.case;
    return { text: REF_PLACEHOLDER, bold, italic, ref };
  });
}
