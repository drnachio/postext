// Finding annotation directives in the source and replacing them by marks
// (#1278: split out of annotations.ts).
import type { DirectiveAttrs } from '../types.js';
import { parseDirectiveAttrs } from '../attrs.js';
import type { Frame } from './apply.js';

/** The inline annotation directives, by name. */
export const ANNOTATION_NAMES = ['dots', 'name', 'book', 'ruby', 'warichu', 'ltr', 'rtl', 'sideline', 'kunten', 'span'] as const;
export type AnnotationName = (typeof ANNOTATION_NAMES)[number];

/** Private-use marks opening each kind of annotation while the emphasis
 *  scanners run (after the small-caps and link marks, outside the escape
 *  range), and the one mark that closes any of them. */
const OPEN: Record<AnnotationName, string> = {
  dots: '',
  name: '',
  book: '',
  ruby: '',
  warichu: '',
  ltr: '',
  rtl: '',
  sideline: '',
  kunten: '',
  // Not U+E1B9/U+E1BA: the underline's marks (`markup.ts`).
  span: '',
};
export const CLOSE = '';
export const KIND_OF_OPEN = new Map<string, AnnotationName>(ANNOTATION_NAMES.map((n) => [OPEN[n], n]));
export const MARK_RE = /[-]/;
const MARKS_RE = /[-]/g;

/** One annotation as written: its kind, its attributes, and (a compact
 *  ruby) its readings. Queued in the order of the marks in the text. */
export interface QueuedAnnotation {
  name: AnnotationName;
  attrs: DirectiveAttrs;
  /** The readings of a compact ruby (`{紅樓|hóng|lóu}`), one per `|`. */
  readings?: string[];
}

/** `:dots[`, `:name[`… at the start of a match. `:span[…]{style="id"}`
 *  sets its words in a named character style. */
const OPENER_RE = /:(dots|name|book|ruby|warichu|ltr|rtl|sideline|kunten|span)\[/y;

/** Letters that make a `{…|…}` a compact ruby: Han, kana, bopomofo. A
 *  brace group without one (`{x|x>0}`) stays text. */
const RUBY_BASE_RE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}々〇]/u;

/** What one pass over a text finds for the scanners below, so that a
 *  line of a thousand openers that never close costs one pass, not a
 *  thousand: the `]` closing each `[` (brackets nested inside counting, a
 *  backslash escaping the character after it, -1 when the line ends
 *  first), and where the next `:` or `{` is from each index (-1 for none).
 *  Kept for the last text scanned: the parser asks about one text many
 *  times in a row. */
interface ScanTables {
  text: string;
  close: Int32Array;
  next: Int32Array;
}
let lastTables: ScanTables | undefined;

function scanTables(text: string): ScanTables {
  if (lastTables && lastTables.text === text) return lastTables;
  const n = text.length;
  const close = new Int32Array(n).fill(-1);
  const next = new Int32Array(n + 1).fill(-1);
  const open: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = text[i]!;
    if (c === '\n') {
      open.length = 0;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '[') open.push(i);
    else if (c === ']' && open.length > 0) close[open.pop()!] = i;
  }
  for (let i = n - 1; i >= 0; i--) {
    const c = text[i]!;
    next[i] = c === ':' || c === '{' ? i : next[i + 1]!;
  }
  lastTables = { text, close, next };
  return lastTables;
}

/**
 * The index of the `]` closing the `[` at `open`, brackets nested inside
 * counting and a backslash escaping the character after it; -1 when the
 * line ends first (or `end` is reached). Read from one pass over the text
 * ({@link scanTables}), so asking for every `[` of a line stays linear.
 */
export function closingBracket(text: string, open: number, end: number = text.length): number {
  if (text[open] !== '[') return -1;
  const at = scanTables(text).close[open]!;
  return at >= 0 && at < end ? at : -1;
}

/** The `{…}` attribute blob right after index `at` (`text[at] === '{'`),
 *  on the same line: its end (past the `}`), or -1. */
function attrBlobEnd(text: string, at: number, end: number = text.length): number {
  if (text[at] !== '{') return -1;
  for (let i = at + 1; i < end; i++) {
    const c = text[i]!;
    if (c === '\n' || c === '{') return -1;
    if (c === '}') return i + 1;
  }
  return -1;
}

/** Whether the character at `at` follows an odd run of backslashes. */
function escapedAt(text: string, at: number): boolean {
  let n = 0;
  for (let i = at - 1; i >= 0 && text[i] === '\\'; i--) n++;
  return n % 2 === 1;
}

/** A compact ruby `{base|reading…}` starting at `at`: the index of its `|`
 *  and its end (past the `}`), or undefined. The base holds a Han, kana or
 *  bopomofo letter, no brace, no line end. A backslash escapes the `{`
 *  (`\{紅|hóng}`) or a bar (`{紅\|hóng}`): a literal brace or bar, no ruby. */
function compactRubyAt(text: string, at: number, end: number = text.length): { bar: number; end: number } | undefined {
  if (text[at] !== '{' || escapedAt(text, at)) return undefined;
  let bar = -1;
  for (let i = at + 1; i < end; i++) {
    const c = text[i]!;
    if (c === '\\') {
      if (text[i + 1] === '\n') return undefined;
      i++;
      continue;
    }
    if (c === '\n' || c === '{') return undefined;
    if (c === '|' && bar < 0) {
      bar = i;
      continue;
    }
    if (c === '}') {
      if (bar <= at + 1 || i <= bar + 1) return undefined;
      const base = text.slice(at + 1, bar);
      if (!RUBY_BASE_RE.test(base) || MARK_RE.test(base) || MARK_RE.test(text.slice(bar + 1, i))) return undefined;
      return { bar, end: i + 1 };
    }
  }
  return undefined;
}

/** One annotation found in a text: where its opener, content and closer
 *  (its attribute blob included) sit. */
export interface FoundAnnotation {
  name: AnnotationName;
  /** `[start, contentStart)`: `:name[` or a compact ruby's `{`. */
  start: number;
  contentStart: number;
  /** `[contentEnd, end)`: `]` and its `{…}`, or a compact ruby's `|…}`. */
  contentEnd: number;
  end: number;
  attrs: string | undefined;
  compact?: boolean;
}

/** Where the next `:` or `{` of `text` at or after `from` is, -1 when
 *  there is none: an annotation opens at one of them. */
function nextOpening(text: string, from: number): number {
  return from >= text.length ? -1 : scanTables(text).next[from]!;
}

/** The next annotation of `text` at or after `from` (before `end`). Only
 *  a `:` or a `{` can open one: the text between them is passed over. */
export function nextAnnotation(text: string, from: number, end: number): FoundAnnotation | undefined {
  for (let i = nextOpening(text, from); i >= 0 && i < end; i = nextOpening(text, i + 1)) {
    const c = text[i]!;
    if (c === ':') {
      OPENER_RE.lastIndex = i;
      const m = OPENER_RE.exec(text);
      if (!m) continue;
      const open = i + m[0].length - 1;
      const close = closingBracket(text, open, end);
      if (close < 0 || close === open + 1) continue;
      // A compact ruby right after the bracket is text, not attributes
      // (`:name[賈寶玉]{紅|hóng}`); a brace whose "base" assigns a value is
      // attributes (`:ruby[東京]{rt="とう|きょう"}`, kana readings split
      // on bars, #422).
      const compact = compactRubyAt(text, close + 1, end);
      const blob = compact && !text.slice(close + 2, compact.bar).includes('=') ? -1 : attrBlobEnd(text, close + 1, end);
      return {
        name: m[1] as AnnotationName,
        start: i,
        contentStart: open + 1,
        contentEnd: close,
        end: blob > 0 ? blob : close + 1,
        attrs: blob > 0 ? text.slice(close + 2, blob - 1) : undefined,
      };
    }
    if (c === '{') {
      const ruby = compactRubyAt(text, i, end);
      if (ruby) {
        return { name: 'ruby', start: i, contentStart: i + 1, contentEnd: ruby.bar, end: ruby.end, attrs: undefined, compact: true };
      }
    }
  }
  return undefined;
}

const unescapeBrackets = (s: string): string => s.replace(/\\([[\]])/g, '$1');

/** A brace group that a backslash kept from being a compact ruby
 *  (`\{紅|hóng}`, `{紅\|hóng}`): `\{` and `\|` in it print as `{` and `|`.
 *  Text without a backslash is returned as is. */
const ESCAPED_RUBY_RE = /(\\?)\{((?:\\.|[^{}\n\\])*)\}/g;
function unescapeRubyGroups(s: string): string {
  if (!s.includes('\\')) return s;
  return s.replace(ESCAPED_RUBY_RE, (m: string, slash: string, inner: string) => {
    if (!slash && !inner.includes('\\|')) return m;
    const plain = inner.replace(/\\\|/g, '|');
    const bar = plain.indexOf('|');
    if (bar <= 0 || bar >= plain.length - 1 || !RUBY_BASE_RE.test(plain.slice(0, bar))) return m;
    return `{${plain}}`;
  });
}

/** `s` split at its bars that no backslash escapes, `\|` read as `|`. */
function splitReadings(s: string): string[] {
  return s.split(/(?<!\\)\|/).map((r) => r.replace(/\\\|/g, '|'));
}

/**
 * Replace every annotation of `text` by its content between the private-use
 * marks, pushing each one's attributes on `queue` in text order. A
 * directive whose bracket never closes on its line stays text. `restore`
 * turns the escape placeholders of an attribute value back into the
 * characters written.
 */
export function markAnnotations(text: string, queue: QueuedAnnotation[], restore: (s: string) => string = (s) => s): string {
  if (!text.includes(':') && !text.includes('{')) return text;
  const mark = (from: number, end: number, inside: boolean): string => {
    let out = '';
    let at = from;
    for (;;) {
      const found = nextAnnotation(text, at, end);
      if (!found) break;
      const between = text.slice(at, found.start);
      out += unescapeRubyGroups(inside ? unescapeBrackets(between) : between);
      const entry: QueuedAnnotation = { name: found.name, attrs: {} };
      if (found.compact) {
        entry.readings = splitReadings(text.slice(found.contentEnd + 1, found.end - 1)).map((r) => restore(r).trim());
      } else if (found.attrs !== undefined) {
        const attrs = parseDirectiveAttrs(found.attrs);
        for (const key of Object.keys(attrs)) attrs[key] = restore(attrs[key]!);
        entry.attrs = attrs;
      }
      queue.push(entry);
      const content = mark(found.contentStart, found.contentEnd, true);
      out += OPEN[found.name] + (found.compact ? content.replace(/\\\|/g, '|') : content) + CLOSE;
      at = found.end;
    }
    const rest = text.slice(at, end);
    return out + unescapeRubyGroups(inside ? unescapeBrackets(rest) : rest);
  };
  return mark(0, text.length, false);
}

/** `text` with every annotation reduced to its content (the plain text of
 *  a running head, an index term, a contents row): `boundary` is left where
 *  each mark was. */
export function stripAnnotations(text: string, boundary = ''): string {
  if (!text.includes(':') && !text.includes('{')) return text;
  const marked = markAnnotations(text, []);
  return marked === text ? text : marked.replace(MARKS_RE, boundary);
}

/** Whether a text holds annotation marks (see {@link markAnnotations}). */
export function hasAnnotationMarks(text: string): boolean {
  return MARK_RE.test(text);
}

/** The innermost ruby open on `stack`. */
export function innermostRuby(stack: readonly Frame[]): Frame | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.name === 'ruby') return stack[i];
  return undefined;
}
