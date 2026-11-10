// The marker syntax under the spans: backslash escapes, code spans,
// highlights, small caps, underscore emphasis, superscript and subscript
// (#1276: split out of inlineFormatting.ts).
import type { InlineSpan } from '../types.js';
import { sliceSpan } from '../links.js';
import { parseDirectiveAttrs } from '../attrs.js';

/**
 * Strip inline markdown formatting for plain-text extraction.
 * Handles bold, italic, code, links, and images.
 */
/** Backslash escapes (CommonMark): `\*`, `\_`, `\^`, `\~`, `\+` and `` \` `` set
 *  the character itself instead of opening a marker — a footnote asterisk
 *  in a table note, a literal caret. Protected behind private-use
 *  placeholders while the marker regexes run, restored in the spans. */
const ESCAPE_RE = /\\([*_^~+`@])/g;
export const ESCAPE_BASE = 0xe100;
export const ESCAPED_RE = /[\ue100-\ue17f]/g;
/** The faces `^_^` and `^o^` (#181) stay text, protected like escapes so
 *  that no marker scanner reads their carets or underscore: two `^_^` on a
 *  line must not pair their underscores into italics. `^o^` after a letter,
 *  a digit or a full stop is a superscript (`n.^o^`, `1^o^`). */
const CARET_FACE_RE = /\^_\^|(?<![A-Za-z0-9.])\^[oO]\^/g;
const protectChar = (c: string): string => String.fromCharCode(ESCAPE_BASE + c.charCodeAt(0));
export function protectEscapes(text: string): string {
  const escaped = text.replace(ESCAPE_RE, (_, c: string) => protectChar(c));
  return escaped.includes('^') ? escaped.replace(CARET_FACE_RE, (face) => face.replace(/./g, protectChar)) : escaped;
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
export const CODE_SPAN_RE = /(?<!\\)`([^`\n]+?)`/g;
const CODE_LITERAL_RE = /[:$*_^~+[\]{}\\@]/g;
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

export const unescapeBrackets = (inner: string): string => inner.replace(/\\([[\]])/g, '$1');

/** Opening of a highlight mark (`:mark[text]{style="…"}`, #888) in the
 *  source. */
export const MARK_OPENER = ':mark[';
/** Private-use marks bracketing a highlight mark's text while the emphasis
 *  scanners run; they become a range of the spans (`InlineSpan.links`,
 *  with `mark`) and are dropped. */
export const MARK_OPEN = '\uE1AA';
export const MARK_CLOSE = '\uE1AB';

/** Where the `:mark[` at `at` ends: past its closing `]` and the `{…}`
 *  attributes right after it (on the same line), with the text between
 *  the brackets and the attributes. The text may hold other inline marks,
 *  links included (brackets nest), may run over a soft line break and
 *  takes `\]` for a literal bracket; it may not be empty. Undefined when
 *  the bracket does not close before a blank line or the end. */
export function readMarkAt(text: string, at: number): { end: number; inner: string; attrs?: string } | undefined {
  if (!text.startsWith(MARK_OPENER, at)) return undefined;
  const from = at + MARK_OPENER.length;
  let depth = 0;
  let i = from;
  for (; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\') { i++; continue; }
    if (c === '\n' && text[i + 1] === '\n') return undefined;
    if (c === '[') depth++;
    else if (c === ']') {
      if (depth === 0) break;
      depth--;
    }
  }
  if (i >= text.length || i === from) return undefined;
  const inner = text.slice(from, i);
  let end = i + 1;
  let attrs: string | undefined;
  if (text[end] === '{') {
    let stop = end + 1;
    while (stop < text.length && text[stop] !== '}' && text[stop] !== '\n') stop++;
    if (text[stop] === '}') {
      attrs = text.slice(end + 1, stop);
      end = stop + 1;
    }
  }
  return { end, inner, ...(attrs !== undefined ? { attrs } : {}) };
}

/** Every `:mark[…]{…}` of `text` replaced by `replace(inner, style)`, an
 *  inner mark first (one inside another is read as its text). */
export function replaceMarkSyntax(text: string, replace: (inner: string, style: string) => string): string {
  if (!text.includes(MARK_OPENER)) return text;
  let out = '';
  let pos = 0;
  for (let at = text.indexOf(MARK_OPENER); at >= 0; ) {
    const read = readMarkAt(text, at);
    if (!read) {
      at = text.indexOf(MARK_OPENER, at + 1);
      continue;
    }
    const style = read.attrs !== undefined ? parseDirectiveAttrs(read.attrs).style?.trim() ?? '' : '';
    // A mark inside the text is set as its text alone.
    const inner = replaceMarkSyntax(unescapeBrackets(read.inner), (t) => t);
    out += text.slice(pos, at) + replace(inner, style);
    pos = read.end;
    at = text.indexOf(MARK_OPENER, read.end);
  }
  return out + text.slice(pos);
}

/** Private-use marks bracketing struck-through text (`~~text~~`) while
 *  the emphasis scanners run; they become a range of the spans
 *  (`InlineSpan.links`, with `strike`), as a highlight mark does, and are
 *  dropped. */
export const STRIKE_OPEN = '\uE1AD';
export const STRIKE_CLOSE = '\uE1AE';

/** `~~text~~`: struck-through text (GitHub Flavored Markdown). Exactly two
 *  tildes on each side (a third one beside them keeps the row literal),
 *  and the text starts and ends with a character that is neither a space
 *  nor a tilde; tildes that make no strikethrough are read as before (a
 *  pair of single tildes is a subscript). The text may
 *  hold other inline marks, single-tilde subscripts included
 *  (`~~H~2~O~~`), and may run over a soft line break, not over a blank
 *  line. A single `~` pair stays a subscript; `\~` sets a literal tilde. */
export const STRIKE_RE = /(?<!~)~~(?=[^\s~])((?:[^~\n]|~(?!~)|\n(?!\n))+?)(?<=[^\s~])~~(?!~)/g;

/** Every `~~text~~` of `text` replaced by its text between
 *  {@link STRIKE_OPEN} and {@link STRIKE_CLOSE}, or by what `replace`
 *  makes of it. */
export function markStrikethrough(text: string, replace: (inner: string) => string = (inner) => STRIKE_OPEN + inner + STRIKE_CLOSE): string {
  if (!text.includes('~~')) return text;
  return text.replace(STRIKE_RE, (_, inner: string) => replace(inner));
}

/** Private-use marks bracketing underlined text (`++text++`) while the
 *  emphasis scanners run; they become a range of the spans
 *  (`InlineSpan.links`, with `underline`), as struck-through text does, and
 *  are dropped. */
export const UNDERLINE_OPEN = '\uE1B9';
export const UNDERLINE_CLOSE = '\uE1BA';

/** The sign written twice on each side of underlined text (`++text++`).
 *  The one place the spelling lives: {@link UNDERLINE_RE} and
 *  {@link markUnderline} are built from it. */
export const UNDERLINE_SIGN = '+';
const UNDERLINE_PAIR = UNDERLINE_SIGN + UNDERLINE_SIGN;
const U = UNDERLINE_SIGN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `++text++`: underlined text (the inserted text of Pandoc and
 *  markdown-it-ins, set as an underline as word processors do). Read like
 *  `~~text~~`: exactly two plus signs on each side (a third one beside them
 *  keeps the row literal: `C+++`), and the text starts and ends with a
 *  character that is neither a space nor a plus sign; a letter or digit
 *  right before the opening or after the closing pair keeps them literal,
 *  so `C++ and C++`, `C++-Kurs und C++-Buch` and `1 ++ 2` stay text. The text may hold other inline marks, single plus
 *  signs included, and may run over a soft line break, not over a blank
 *  line. `\+` sets a literal plus sign. */
export const UNDERLINE_RE = new RegExp(
  `(?<![${U}\\p{L}\\p{N}])${U}${U}(?=[^\\s${U}])((?:[^${U}\\n]|${U}(?!${U})|\\n(?!\\n))+?)(?<=[^\\s${U}])${U}${U}(?![${U}\\p{L}\\p{N}])`,
  'gu',
);

/** A pair that only looks like an underline: its text begins and ends
 *  with a one-character word, the increment operator written at a
 *  variable on both sides (`use ++i rather than i++ here`). */
const OPERATOR_FIRST = /^[\p{L}\p{N}_](?![\p{L}\p{N}_])/u;
const OPERATOR_LAST = /(?<![\p{L}\p{N}_])[\p{L}\p{N}_]$/u;
const operatorPair = (inner: string): boolean => /\s/u.test(inner) && OPERATOR_FIRST.test(inner) && OPERATOR_LAST.test(inner);

/** Every `++text++` of `text` replaced by its text between
 *  {@link UNDERLINE_OPEN} and {@link UNDERLINE_CLOSE}, or by what `replace`
 *  makes of it; an increment operator's pair stays as written. */
export function markUnderline(text: string, replace: (inner: string) => string = (inner) => UNDERLINE_OPEN + inner + UNDERLINE_CLOSE): string {
  if (!text.includes(UNDERLINE_PAIR)) return text;
  return text.replace(UNDERLINE_RE, (whole, inner: string) => (operatorPair(inner) ? whole : replace(inner)));
}

/** Where each `++text++` of `text` is, as the engine reads it (the
 *  Sandbox editor marks them): `from`–`to` the whole of it, the text
 *  `UNDERLINE_SIGN.length * 2` in from either end. */
export function underlineRanges(text: string): Array<{ from: number; to: number; marker: number }> {
  const out: Array<{ from: number; to: number; marker: number }> = [];
  if (!text.includes(UNDERLINE_PAIR)) return out;
  for (const m of text.matchAll(UNDERLINE_RE)) {
    // `\++`: an escaped sign opens nothing.
    if (!operatorPair(m[1]!) && text[m.index - 1] !== '\\') out.push({ from: m.index, to: m.index + m[0].length, marker: UNDERLINE_PAIR.length });
  }
  return out;
}

/** Replace every `:smallcaps[…]` by its text between the private-use marks. */
export function markSmallCaps(text: string): string {
  if (!text.includes(SMALLCAPS_OPENER)) return text;
  return text.replace(INLINE_SMALLCAPS_RE, (_, inner: string) => `${SMALLCAPS_OPEN}${unescapeBrackets(inner)}${SMALLCAPS_CLOSE}`);
}

/** Split the spans at the small-caps marks, flagging the text between them
 *  `smallCaps` and dropping the marks (and any piece left empty). */
export function applySmallCapsMarks(spans: InlineSpan[]): InlineSpan[] {
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

/** A letter or digit that keeps an `_` beside it from opening or closing
 *  emphasis. Chinese, Japanese and Korean letters do not: they are written
 *  without spaces, so `中文__粗体__中文` is bold (the CJK-friendly emphasis
 *  rule, #181). A `_` does too, so a `__` that is not bold never turns into
 *  a single-underscore italic (`foo__bar__baz` stays text). */
const UNDERSCORE_BLOCKER = '(?:_|(?![\\p{sc=Han}\\p{sc=Hira}\\p{sc=Kana}\\p{sc=Hang}])[\\p{L}\\p{N}])';
/** `_` opens or closes emphasis only at a word boundary (CommonMark): an
 *  underscore between two letters or digits — a URL's `SR_AIR_EN.pdf`, a
 *  `snake_case` name — is text. `*` still works inside a word. */
const UNDERSCORE_OPEN = `(?<!${UNDERSCORE_BLOCKER})`;
const UNDERSCORE_CLOSE = `(?!${UNDERSCORE_BLOCKER})`;
/** `n` underscores opening a run: not one of a longer row. */
export const underscores = (n: number): string => `${UNDERSCORE_OPEN}${'_'.repeat(n)}(?!_)`;
/** `n` underscores closing a run. */
export const underscoresClose = (n: number): string => `(?<!_)${'_'.repeat(n)}${UNDERSCORE_CLOSE}`;
/** What counts as punctuation beside a `*` (CommonMark's flanking rules):
 *  Unicode punctuation and symbols, and the private-use marks the parser
 *  leaves where markup was taken out. */
const STAR_PUNCT = '\\p{P}\\p{S}\\p{Co}';
/** Chinese, Japanese and Korean letters, written without spaces: beside
 *  punctuation they stand where a space would (the CJK-friendly rule, #181),
 *  so `粗体。**中文` closes. */
const STAR_CJK = '\\p{sc=Han}\\p{sc=Hira}\\p{sc=Kana}\\p{sc=Hang}';
/** Full-width CJK punctuation (`《》`, `。`, `「」`), which carries its own
 *  space: a run beside it opens or closes whatever is on its other side,
 *  so `**《**of` is a bold `《`. */
const STAR_CJK_PUNCT = '\\u3000-\\u303f\\uff00-\\uff60';
/** `n` asterisks that can open emphasis: the first `n` of a run of stars
 *  that is left-flanking. The run as a whole decides (CommonMark): it is
 *  not followed by a space, and is followed by punctuation only after a
 *  space or punctuation. The `*` of `Sgr A* at` opens nothing (#1444), and
 *  neither does either star of `** foo`. */
export const starsOpen = (n: number): string =>
  `(?<!\\*)(?:(?<=^|[\\s${STAR_PUNCT}${STAR_CJK}])\\*{${n}}(?=\\**[^\\s*])|\\*{${n}}(?=\\**[^\\s${STAR_PUNCT}])|\\*{${n}}(?=\\**[${STAR_CJK_PUNCT}]))`;
/** `n` asterisks that can close emphasis: the last `n` of a run of stars
 *  that is right-flanking, not after a space, and after punctuation only
 *  before a space or punctuation. */
export const starsClose = (n: number): string =>
  `(?:(?<=[^\\s${STAR_PUNCT}]\\**)\\*{${n}}|(?<=(?!\\*)[${STAR_PUNCT}]\\**)\\*{${n}}(?=$|[\\s${STAR_PUNCT}${STAR_CJK}])|(?<=[${STAR_CJK_PUNCT}]\\**)\\*{${n}})(?!\\*)`;
export const UNDERSCORE_BOLD_RE = new RegExp(`${underscores(2)}(.+?)${underscoresClose(2)}`, 'gu');
export const UNDERSCORE_ITALIC_RE = new RegExp(`${underscores(1)}(.+?)${underscoresClose(1)}`, 'gu');

/** Left where markup was taken out — an image, the backticks of inline
 *  code, and here also a link, small caps or an emphasis marker — so that
 *  an `_` beside it reads as at a word boundary, as CommonMark reads the
 *  `)`, backtick or `*` it stands for (`**Nota**_bene_`). Dropped once the
 *  emphasis scanners have run. */
export const MARKUP_BOUNDARY = '\uE1A5';

/** Remove the {@link MARKUP_BOUNDARY} marks from the spans, dropping any
 *  span left empty. */
export function dropMarkupBoundaries(spans: InlineSpan[]): InlineSpan[] {
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

/** `spans` set plain: bold, italic, scripts, small capitals, links,
 *  strikethrough, underline and the
 *  Chinese and Japanese marks (emphasis dots, proper-name and book-title
 *  marks, side lines) dropped,
 *  adjacent text spans merged — a heading's spans as they were built before
 *  headings read inline marks (`headings.inlineMarks: false`). Formulas,
 *  references, swatches, ruby, kanbun marks and warichu notes keep their
 *  own spans, and so do characters the layout added (a book title's 《》). */
export function plainSpans(spans: readonly InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  let changed = false;
  for (const span of spans) {
    const { script, smallCaps, links, bold, italic, emphasisMark, properName, bookTitle, sideline, ...rest } = span;
    if (script || smallCaps || links || bold || italic || emphasisMark || properName !== undefined || bookTitle || sideline) changed = true;
    const plain: InlineSpan = { ...rest, bold: false, italic: false };
    // A run set upright or sideways in vertical text keeps its span: the
    // mark is about how it stands, not a style. So does a directional
    // isolate: it decides the order of the text.
    const special = plain.math || plain.mathRender || plain.swatch || plain.ref || plain.chip || plain.captionLabel || plain.footnote || plain.combineUpright || plain.orientation || plain.ruby || plain.kunten || plain.warichu || plain.inserted || plain.direction;
    const last = out[out.length - 1];
    const lastSpecial = last && (last.math || last.mathRender || last.swatch || last.ref || last.chip || last.captionLabel || last.footnote || last.combineUpright || last.orientation || last.ruby || last.kunten || last.warichu || last.inserted || last.direction);
    if (!special && last && !lastSpecial) {
      out[out.length - 1] = { ...last, text: last.text + plain.text };
      changed = true;
    } else {
      out.push(plain);
    }
  }
  return changed ? out : [...spans];
}

const SUPERSCRIPT = '\\^(\\S(?:[^^\\n]*?\\S)?)\\^';
/** Chinese and Japanese characters (Han, kana, CJK punctuation, fullwidth
 *  forms), in a class that needs no `u` flag. */
const EAST_ASIAN_CHAR = '(?:[\\u3000-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff01-\\uff60]|[\\ud840-\\ud8bf][\\udc00-\\udfff])';
/** A `~` with an ASCII digit on both sides is a range (`3~5天`, `10~20`):
 *  it neither opens nor closes a subscript (#181). */
const TILDE = '(?!(?<=[0-9])~[0-9])~';
/** A `~` between two Chinese words is a range too (`周一~周五`, `北京~上海`):
 *  it does not open a subscript. It may close one, so a Han subscript
 *  still ends before a Han character (`F~合~等于`). */
const TILDE_OPEN = `(?!(?<=${EAST_ASIAN_CHAR})~${EAST_ASIAN_CHAR})${TILDE}`;
const SUBSCRIPT = `${TILDE_OPEN}(\\S(?:[^~\\n]*?\\S)?)${TILDE}`;

/** `^text^` (superscript) and `~text~` (subscript): the marked text starts
 *  and ends with a non-space character and carries no other marker of the
 *  same kind, so a stray caret or tilde in prose stays literal. The faces
 *  `^_^` and `^o^` never reach them (see `protectEscapes`). */
export const SUPERSCRIPT_RE = new RegExp(SUPERSCRIPT, 'g');
export const SUBSCRIPT_RE = new RegExp(SUBSCRIPT, 'g');
const SCRIPT_RE = new RegExp(`${SUPERSCRIPT}|${SUBSCRIPT}`, 'g');

/** Split a bold / italic run into plain and script spans: `^…^` becomes a
 *  superscript span, `~…~` a subscript one (the markers are dropped). */
export function splitScriptSpans(text: string, bold: boolean, italic: boolean, out: InlineSpan[]): void {
  const re = new RegExp(SCRIPT_RE.source, 'g');
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
