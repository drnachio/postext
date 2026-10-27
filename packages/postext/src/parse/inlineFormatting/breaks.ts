// Line breaks written in the text: title breaks with their CJK joins,
// snippet and body breaks, and the data ranges (link destinations,
// directive attributes) they leave alone (#1276: split out of inlineFormatting.ts).
import type { InlineSpan } from '../types.js';
import { linkDestinationRanges } from './links.js';

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

const isBlank = (c: string | undefined): boolean => c === ' ' || c === '\t';

/**
 * `text` with each title break ({@link TITLE_BREAK_RE}: `\\` and the
 * spaces and tabs around it) replaced by `by`, as
 * `text.replace(TITLE_BREAK_RE, by)` replaces them. A scan in one pass: the
 * expression's leading run of spaces is tried again from each position of
 * a long run that no break ends.
 */
export function replaceTitleBreaks(text: string, by: string): string {
  let out = '';
  let pos = 0;
  for (let at = text.indexOf('\\\\'); at >= 0; at = text.indexOf('\\\\', pos)) {
    let start = at;
    while (start > pos && isBlank(text[start - 1])) start--;
    let end = at + 2;
    while (isBlank(text[end])) end++;
    out += text.slice(pos, start) + by;
    pos = end;
  }
  return pos === 0 ? text : out + text.slice(pos);
}

/** `[start, end)` of the next snippet break ({@link SNIPPET_BREAK_RE}) from
 *  `from` on, as the expression finds it, in one pass. */
function nextSnippetBreak(text: string, from: number): readonly [number, number] | null {
  for (let at = text.indexOf('\\', from); at >= 0; at = text.indexOf('\\', at + 1)) {
    let end: number;
    if (text[at + 1] === '\\') {
      end = at + 2;
      while (isBlank(text[end])) end++;
      if (text[end] === '\r' && text[end + 1] === '\n') end += 2;
      else if (text[end] === '\n') end++;
    } else if (text[at + 1] === '\n') end = at + 2;
    else if (text[at + 1] === '\r' && text[at + 2] === '\n') end = at + 3;
    else continue;
    let start = at;
    while (start > from && isBlank(text[start - 1])) start--;
    return [start, end];
  }
  return null;
}

/** Where a directive's `[…]` text that opens at `from` stops, read as
 *  `(?:\\.|[^\]\\\n])*` reads it: at its closing `]` (`closed`), or at a
 *  line feed, a backslash before a line end, or the end of the text. */
export function bracketTextEnd(text: string, from: number): { at: number; closed: boolean } {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === ']') return { at: i, closed: true };
    if (c === '\n') break;
    if (c === '\\') {
      const next = text[i + 1];
      if (next === undefined || next === '\n' || next === '\r' || next === '\u2028' || next === '\u2029') break;
      i += 2;
    } else i++;
  }
  return { at: i, closed: false };
}

/**
 * `[start, end)` of the text between the braces of each inline directive's
 * `{…}` attributes in `text`, in order: the directives named in `braced`
 * take them right after the name (`:ref{…}`), those in `bracketed` after a
 * `[…]` text (`:chip[…]{…}`, the text never empty unless `emptyText`). What
 * a global expression of those alternatives finds — the attributes on one
 * line, a `\\]` in the text no bracket — read in one pass, where the
 * expression would read a long line again from every unclosed directive.
 */
export function directiveAttrRanges(
  text: string,
  braced: readonly string[],
  bracketed: readonly string[],
  emptyText = false,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  // The first `}` or line feed from each position (-1: none), built on
  // first use.
  let stops: Int32Array | undefined;
  const attrsEnd = (from: number): number => {
    if (!stops) {
      stops = new Int32Array(text.length + 1).fill(-1);
      for (let k = text.length - 1; k >= 0; k--) stops[k] = text[k] === '}' || text[k] === '\n' ? k : stops[k + 1]!;
    }
    const at = from <= text.length ? stops[from]! : -1;
    return at >= 0 && text[at] === '}' ? at : -1;
  };
  // A `[…]` text read from any start between the last read's start and
  // where it stopped stops at the same place (see `bracketTextEnd`).
  let read: { at: number; closed: boolean } | undefined;
  for (let i = text.indexOf(':'); i >= 0; ) {
    let found: [number, number] | undefined;
    const name = braced.find((n) => text.startsWith(n, i + 1) && text[i + 1 + n.length] === '{');
    if (name !== undefined) {
      const open = i + 1 + name.length;
      const close = attrsEnd(open + 1);
      if (close >= 0) found = [open + 1, close];
    }
    const bracketName = found ? undefined : bracketed.find((n) => text.startsWith(n, i + 1) && text[i + 1 + n.length] === '[');
    if (bracketName !== undefined) {
      const from = i + 2 + bracketName.length;
      if (!read || from > read.at) read = bracketTextEnd(text, from);
      if (read.closed && (emptyText || read.at > from) && text[read.at + 1] === '{') {
        const close = attrsEnd(read.at + 2);
        if (close >= 0) found = [read.at + 2, close];
      }
    }
    if (found) {
      out.push(found);
      i = text.indexOf(':', found[1] + 1);
    } else i = text.indexOf(':', i + 1);
  }
  return out;
}

/** Positions of the break placeholder in a plain text. */
export function titleBreakIndices(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) if (text[i] === BREAK_PLACEHOLDER) out.push(i);
  return out;
}

/** Han (every plane: `𠀀` is one character in two UTF-16 units), kana, CJK
 *  punctuation and fullwidth forms: text set without spaces between words
 *  (Hangul excluded, Korean spaces its words). */
const CJK_WIDE_RE = /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\u3000-\u303f\uff00-\uffef]$/u;

/** The dashes and the ellipsis Chinese writes doubled (——, ……): wide next to
 *  a Chinese character, and nothing of the kind next to Latin text. */
const CJK_DASH_RE = /^[\u2014\u2015\u2026]$/;

/** Whether `ch` (one character, a surrogate pair included) is Han, kana,
 *  CJK punctuation or a fullwidth form. */
export function isCjkWideChar(ch: string | undefined): boolean {
  return ch !== undefined && CJK_WIDE_RE.test(ch);
}

/** The character that ends at `at` (exclusive), a surrogate pair whole. */
export function charBefore(text: string, at: number): string | undefined {
  if (at <= 0) return undefined;
  const low = text.charCodeAt(at - 1);
  if (low >= 0xdc00 && low <= 0xdfff && at >= 2) {
    const high = text.charCodeAt(at - 2);
    if (high >= 0xd800 && high <= 0xdbff) return text.slice(at - 2, at);
  }
  return text[at - 1];
}

/** The character that starts at `at`, a surrogate pair whole. */
export function charFrom(text: string, at: number): string | undefined {
  const cp = text.codePointAt(at);
  return cp === undefined ? undefined : String.fromCodePoint(cp);
}

/** What goes between a text and a suffix set after it (a continued
 *  caption's or box title's `continuedSuffix`): nothing when the suffix
 *  opens with a wide character, since Chinese sets `（续）` solid against the
 *  text and the fullwidth bracket carries its own space; one space
 *  otherwise (`(cont.)`, after Chinese text too, which keeps a gap before
 *  Latin). */
export function suffixJoiner(suffix: string): '' | ' ' {
  return isCjkWideChar(charFrom(suffix, 0)) ? '' : ' ';
}

/** Whether two characters meet as Chinese or Japanese text does: both wide,
 *  or a Chinese dash or ellipsis beside a wide one. */
export function joinsWide(before: string | undefined, after: string | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  const a = isCjkWideChar(before);
  const b = isCjkWideChar(after);
  return (a && b) || (a && CJK_DASH_RE.test(after)) || (b && CJK_DASH_RE.test(before));
}

/** Replace the break placeholder with a space (single-line contexts): an
 *  ideographic space (U+3000) between two Chinese or Japanese characters,
 *  so a couplet title `甄士隱夢幻識通靈 \\ 賈雨村風塵懷閨秀` reads
 *  `甄士隱夢幻識通靈　賈雨村風塵懷閨秀` in the column, the contents and the
 *  running heads (and `「紅樓夢」 \\ ——序` reads `「紅樓夢」　——序`); one
 *  space anywhere else. One character for one, so the source map holds. */
export function flattenTitleBreaks(text: string): string {
  if (!text.includes('\u2028')) return text;
  return text.replace(/\u2028/g, (_m, at: number) => (joinsWide(charBefore(text, at), charFrom(text, at + 1)) ? '\u3000' : ' '));
}

/** What a forced title break reads as in plain text (PDF bookmarks, the
 *  document title): the ideographic space between two Chinese or Japanese
 *  characters, as {@link flattenTitleBreaks} sets it; nothing where such a
 *  character meets a digit or Latin text, since plain Chinese text puts no
 *  space there (the page sets the Han–Latin space, `cjk.latinSpacing`);
 *  one space between Latin words. */
export function plainTitleBreak(before: string | undefined, after: string | undefined): '' | ' ' | '\u3000' {
  if (joinsWide(before, after)) return '\u3000';
  return isCjkWideChar(before) || isCjkWideChar(after) ? '' : ' ';
}

/** Replace the break placeholder as plain text reads it (see
 *  {@link plainTitleBreak}). Unlike {@link flattenTitleBreaks} the text may
 *  get shorter: it maps to no source. */
export function plainTitleBreaks(text: string): string {
  if (!text.includes('\u2028')) return text;
  return text.replace(/\u2028/g, (_m, at: number) => plainTitleBreak(charBefore(text, at), charFrom(text, at + 1)));
}

/** {@link flattenTitleBreaks} over a block's spans, read against the whole
 *  `text` (the spans' texts joined): a break at a span's edge sees both of
 *  its neighbours. Maths spans are kept as they are. */
export function flattenTitleBreakSpans<T extends { text: string; math?: unknown }>(text: string, spans: readonly T[]): T[] {
  const flat = flattenTitleBreaks(text);
  const aligned = spans.map((s) => s.text).join('') === text;
  let at = 0;
  return spans.map((s) => {
    const from = at;
    at += s.text.length;
    if (s.math) return s;
    return { ...s, text: aligned ? flat.slice(from, at) : flattenTitleBreaks(s.text) };
  });
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

/** The inline directives whose `{…}` attributes are data, never text to
 *  break: `:ref{…}`, `:swatch{…}`, a chip's `:chip[…]{…}`, an annotation's
 *  `:ruby[…]{…}` (read by {@link directiveAttrRanges}). */
const DIRECTIVE_BRACED = ['ref', 'swatch'];
const DIRECTIVE_BRACKETED = ['chip', 'icon', 'dots', 'name', 'book', 'ruby', 'warichu', 'ltr', 'rtl', 'sideline', 'kunten'];

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
  let out = '';
  let pos = 0;
  for (let m = nextSnippetBreak(text, 0); m; m = nextSnippetBreak(text, pos)) {
    const [start, end] = m;
    const at = text.indexOf('\\', start);
    out += text.slice(pos, start) + (kept.some(([s, e]) => at >= s && at < e) ? text.slice(start, end) : BREAK_PLACEHOLDER);
    pos = end;
  }
  return out + text.slice(pos);
}

/** A forced line break in body text (#620): `\\` before a space or the end
 *  of a line, or a backslash that ends a source line, with the spaces
 *  before it and, after `\\`, the spaces and the line end that follow. A
 *  `\\` glued to the next character is no break (`\\*` prints a
 *  backslash and an escaped asterisk, `C:\\path` both backslashes). The
 *  block parser joins a paragraph's lines with a space, except after a line
 *  that ends in a backslash, which it joins with a line feed for this
 *  pattern to find. */
const BODY_BREAK_RE = /[ \t]*(?:\\\\(?=[ \t\n]|$)[ \t]*\n?|\\\n)/g;

/**
 * Turn the forced line breaks of a paragraph, a quotation or a list item
 * (#620, see `BODY_BREAK_RE`) into {@link BREAK_PLACEHOLDER}, as
 * {@link replaceSnippetBreaks} does in a caption: a backslash at the end of
 * a source line (CommonMark's hard break) or `\\` before a space. Run on
 * the text with its maths and chips already taken out, and its inline code
 * protected, so a `\\` in a formula or in code stays; one inside a link
 * destination or a directive's attributes stays too. A break that opens or
 * ends the block is no break (CommonMark: a backslash at the end of a
 * paragraph prints), and two in a row are one. A line feed left (a line
 * join no break took) reads as the space it stands for. The break is
 * written as `mark`: the block parser passes {@link BODY_BREAK_MARK}, which
 * the emphasis patterns read as any character (U+2028 is a line terminator
 * to a regular expression's `.`), and turns it into the placeholder in the
 * spans ({@link bodyBreakSpans}).
 */
export function replaceBodyBreaks(text: string, mark: string = BREAK_PLACEHOLDER): string {
  if (!text.includes('\\')) return text;
  const kept = dataRanges(text);
  const out = text.replace(BODY_BREAK_RE, (match: string, offset: number) => {
    const at = offset + match.indexOf('\\');
    const edge = text.slice(0, offset).trim() === '' || text.slice(offset + match.length).trim() === '';
    return edge || kept.some(([s, e]) => at >= s && at < e) ? match.replace(/\n/g, ' ') : mark;
  });
  const twice = new RegExp(`${mark}(?:[ \\t]*${mark})+`, 'g');
  return out.replace(twice, mark).replace(/\n/g, ' ');
}

/** A forced line break of body text while its inline formatting is read
 *  (see {@link replaceBodyBreaks}). */
export const BODY_BREAK_MARK = '\uE1A7';

/** The spans with every {@link BODY_BREAK_MARK} set as
 *  {@link BREAK_PLACEHOLDER} (the same length: link ranges hold). */
export function bodyBreakSpans(spans: InlineSpan[]): InlineSpan[] {
  return spans.map((s) => (s.text.includes(BODY_BREAK_MARK) ? { ...s, text: s.text.replaceAll(BODY_BREAK_MARK, BREAK_PLACEHOLDER) } : s));
}

/** `[start, end)` of the parts of `text` that are data rather than text to
 *  set: link and image destinations, and the `{…}` attributes of the
 *  inline directives. */
export function dataRanges(text: string): Array<readonly [number, number]> {
  const kept: Array<readonly [number, number]> = text.includes('](') ? linkDestinationRanges(text) : [];
  if (text.includes('{')) {
    for (const [start, end] of directiveAttrRanges(text, DIRECTIVE_BRACED, DIRECTIVE_BRACKETED)) kept.push([start - 1, end + 1]);
  }
  return kept;
}
