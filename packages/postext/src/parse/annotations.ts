/**
 * Chinese and Japanese inline annotations (#193, #194, #195, #421):
 * emphasis dots (`:dots[…]`), the proper-name and book-title marks
 * (`:name[…]`, `:book[…]`), side lines (傍線, `:sideline[…]{style pos}`),
 * ruby (`:ruby[…]{rt="…"}` and the compact `{紅樓|hóng|lóu}`)
 * and warichu notes (`:warichu[…]{open close}`); and the directional
 * isolates (`:rtl[…]`, `:ltr[…]`, with an optional `{lang=…}`, #367), which
 * set a run in its own direction inside text of the other.
 *
 * They preserve their text, as `:smallcaps[…]` does: the characters between
 * the brackets stay in the paragraph's plain text (search, the contents,
 * index anchors and the source map see them), and the mark becomes a field
 * of the spans that hold them. {@link markAnnotations} replaces each
 * directive by private-use marks around its content, before the emphasis
 * scanners run, and queues its attributes (so `*` or `_` inside a reading
 * never reach them); {@link applyAnnotationMarks} turns the marks into span
 * fields once the spans exist. The content may hold other inline marks,
 * nested annotations included (`:warichu[甲戌側批：:name[寶玉]…]`).
 */

import type { DirectiveAttrs, EmphasisMark, InlineDirection, InlineRuby, InlineSideline, InlineSpan, InlineWarichu } from './types';
import { parseDirectiveAttrs } from './attrs';
import { graphemesOf } from '../measure/graphemes';

/** The inline annotation directives, by name. */
export const ANNOTATION_NAMES = ['dots', 'name', 'book', 'ruby', 'warichu', 'ltr', 'rtl', 'sideline'] as const;
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
};
const CLOSE = '';
const KIND_OF_OPEN = new Map<string, AnnotationName>(ANNOTATION_NAMES.map((n) => [OPEN[n], n]));
const MARK_RE = /[-]/;
const MARKS_RE = /[-]/g;

/** One annotation as written: its kind, its attributes, and (a compact
 *  ruby) its readings. Queued in the order of the marks in the text. */
export interface QueuedAnnotation {
  name: AnnotationName;
  attrs: DirectiveAttrs;
  /** The readings of a compact ruby (`{紅樓|hóng|lóu}`), one per `|`. */
  readings?: string[];
}

/** `:dots[`, `:name[`… at the start of a match. */
const OPENER_RE = /:(dots|name|book|ruby|warichu|ltr|rtl|sideline)\[/y;

/** Letters that make a `{…|…}` a compact ruby: Han, kana, bopomofo. A
 *  brace group without one (`{x|x>0}`) stays text. */
const RUBY_BASE_RE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}々〇]/u;

/**
 * The index of the `]` closing the `[` at `open`, brackets nested inside
 * counting and a backslash escaping the character after it; -1 when the
 * line ends first (or `end` is reached).
 */
export function closingBracket(text: string, open: number, end: number = text.length): number {
  let depth = 0;
  for (let i = open; i < end; i++) {
    const c = text[i]!;
    if (c === '\n') return -1;
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
  const colon = text.indexOf(':', from);
  const brace = text.indexOf('{', from);
  return colon < 0 ? brace : brace < 0 ? colon : Math.min(colon, brace);
}

/** The next annotation of `text` at or after `from` (before `end`). Only
 *  a `:` or a `{` can open one: the text between them is passed over. */
function nextAnnotation(text: string, from: number, end: number): FoundAnnotation | undefined {
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
      // (`:name[賈寶玉]{紅|hóng}`).
      const blob = compactRubyAt(text, close + 1, end) ? -1 : attrBlobEnd(text, close + 1, end);
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
function innermostRuby(stack: readonly Frame[]): Frame | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.name === 'ruby') return stack[i];
  return undefined;
}

/** An annotation open while the spans are walked. */
interface Frame {
  name: AnnotationName;
  entry: QueuedAnnotation;
  id: number;
  /** The object every span of a warichu note shares. */
  warichu?: InlineWarichu;
  /** The object every span of a directional isolate shares. */
  direction?: InlineDirection;
  /** The object every span of a side line shares. */
  sideline?: InlineSideline;
  /** Indices (in the output) of the spans a ruby holds. */
  pieces?: number[];
}

const DOT_STYLES = new Set(['dot', 'circle', 'sesame']);
const SIDES = new Set(['over', 'under']);
const SIDELINE_STYLES = new Set(['solid', 'double', 'wavy', 'dotted']);
const RUBY_SIDES = new Set(['over', 'under', 'right']);

function emphasisOf(attrs: DirectiveAttrs): EmphasisMark {
  const mark: EmphasisMark = {};
  if (attrs.style && DOT_STYLES.has(attrs.style)) mark.style = attrs.style as EmphasisMark['style'];
  const fill = attrs.fill;
  if (fill === 'open' || fill === 'filled') mark.fill = fill;
  const pos = attrs.pos ?? attrs.position;
  if (pos && SIDES.has(pos)) mark.position = pos as EmphasisMark['position'];
  return mark;
}

/** A side line's look as written: `style` and `pos` (or `position`);
 *  values the engine does not know are left unset. */
function sidelineOf(id: number, attrs: DirectiveAttrs): InlineSideline {
  const line: InlineSideline = { id };
  if (attrs.style && SIDELINE_STYLES.has(attrs.style)) line.style = attrs.style as InlineSideline['style'];
  const pos = attrs.pos ?? attrs.position;
  if (pos && SIDES.has(pos)) line.position = pos as InlineSideline['position'];
  return line;
}

/** A flag attribute: present, and not written `false` or `no`. */
function flag(value: string | undefined): boolean {
  return value !== undefined && value !== 'false' && value !== 'no';
}

/**
 * The readings of a ruby, one per base character when they pair up (a mono
 * ruby), else undefined (a group ruby): the `rt` attribute split on `|` or
 * spaces, or the readings of a compact ruby (one `|` each; a single one
 * split on spaces).
 */
function monoReadings(entry: QueuedAnnotation, count: number): string[] | undefined {
  if (flag(entry.attrs.group)) return undefined;
  let readings: string[];
  if (entry.readings) {
    readings = entry.readings.length === 1 ? entry.readings[0]!.split(/\s+/) : entry.readings;
  } else {
    const rt = (entry.attrs.rt ?? '').trim();
    readings = rt.includes('|') ? rt.split('|') : rt.split(/\s+/);
  }
  readings = readings.map((r) => r.trim());
  return readings.length === count && readings.every((r) => r.length > 0) ? readings : undefined;
}

/** The whole reading of a group ruby, spaces collapsed. */
function groupReading(entry: QueuedAnnotation): string {
  const raw = entry.readings ? entry.readings.join(entry.readings.length > 1 ? ' ' : '') : entry.attrs.rt ?? '';
  return raw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Split the spans at the annotation marks, setting the fields of each
 * annotation on the spans between its marks and dropping the marks (and
 * any piece left empty). `queue` holds the annotations in the order of
 * their marks (see {@link markAnnotations}); ids count from 1 per call, so
 * a paragraph parsed twice gets the same ones. A mono ruby becomes one span
 * per base character; a group ruby one span (in its first piece's style).
 */
export function applyAnnotationMarks(spans: InlineSpan[], queue: readonly QueuedAnnotation[]): InlineSpan[] {
  if (queue.length === 0 || !spans.some((s) => MARK_RE.test(s.text))) return spans;
  const out: InlineSpan[] = [];
  const stack: Frame[] = [];
  const rubies: Frame[] = [];
  let next = 0;
  let id = 0;
  const fieldsOf = (): Partial<InlineSpan> => {
    const fields: Partial<InlineSpan> = {};
    let depth = 0;
    for (const f of stack) {
      switch (f.name) {
        case 'dots':
          fields.emphasisMark = emphasisOf(f.entry.attrs);
          break;
        case 'name':
          fields.properName = f.id;
          break;
        case 'book':
          depth++;
          fields.bookTitle = { id: f.id, depth };
          break;
        case 'warichu':
          fields.warichu = f.warichu!;
          break;
        case 'ltr':
        case 'rtl':
          // The innermost isolate: it names the ones around it.
          fields.direction = f.direction!;
          break;
        case 'sideline':
          // The innermost line: a span takes one.
          fields.sideline = f.sideline!;
          break;
        case 'ruby':
          break;
      }
    }
    return fields;
  };
  for (const span of spans) {
    if (!MARK_RE.test(span.text)) {
      const fields = stack.length > 0 ? fieldsOf() : undefined;
      out.push(fields ? { ...span, ...fields } : span);
      const ruby = innermostRuby(stack);
      if (ruby) ruby.pieces!.push(out.length - 1);
      continue;
    }
    let piece = '';
    const flush = (): void => {
      if (piece.length === 0) return;
      out.push({ ...span, text: piece, ...fieldsOf() });
      const ruby = innermostRuby(stack);
      if (ruby) ruby.pieces!.push(out.length - 1);
      piece = '';
    };
    for (const ch of span.text) {
      const kind = KIND_OF_OPEN.get(ch);
      if (kind !== undefined) {
        flush();
        const entry = queue[next++] ?? { name: kind, attrs: {} };
        const frame: Frame = { name: kind, entry, id: ++id };
        if (kind === 'warichu') {
          frame.warichu = {
            id: frame.id,
            ...(entry.attrs.open !== undefined ? { open: entry.attrs.open } : {}),
            ...(entry.attrs.close !== undefined ? { close: entry.attrs.close } : {}),
          };
        }
        if (kind === 'ruby') {
          frame.pieces = [];
          rubies.push(frame);
        }
        if (kind === 'sideline') frame.sideline = sidelineOf(frame.id, entry.attrs);
        if (kind === 'ltr' || kind === 'rtl') {
          let outer: InlineDirection | undefined;
          for (let i = stack.length - 1; i >= 0 && !outer; i--) outer = stack[i]!.direction;
          const lang = entry.attrs.lang?.trim();
          frame.direction = {
            dir: kind,
            id: frame.id,
            ...(lang ? { lang } : {}),
            ...(outer ? { outer } : {}),
          };
        }
        stack.push(frame);
        continue;
      }
      if (ch === CLOSE) {
        flush();
        stack.pop();
        continue;
      }
      piece += ch;
    }
    flush();
  }
  if (rubies.length === 0) return out;

  // The rubies: each piece index to the spans it becomes.
  const replace = new Map<number, InlineSpan[]>();
  const drop = new Set<number>();
  for (const frame of rubies) {
    const pieces = frame.pieces!;
    if (pieces.length === 0) continue;
    const base = pieces.map((i) => out[i]!.text).join('');
    const graphemes = graphemesOf(base);
    const pos = frame.entry.attrs.pos ?? frame.entry.attrs.position;
    const position = pos && RUBY_SIDES.has(pos) ? (pos as InlineRuby['position']) : undefined;
    const readings = monoReadings(frame.entry, graphemes.length);
    if (readings) {
      let r = 0;
      for (const i of pieces) {
        const span = out[i]!;
        const parts: InlineSpan[] = [];
        for (const g of graphemesOf(span.text)) {
          parts.push({ ...span, text: g, ruby: { text: readings[r++]!, id: frame.id, ...(position ? { position } : {}) } });
        }
        replace.set(i, parts);
      }
    } else {
      const first = out[pieces[0]!]!;
      const reading = groupReading(frame.entry);
      replace.set(pieces[0]!, [{
        ...first,
        text: base,
        ...(reading.length > 0 ? { ruby: { text: reading, group: true, id: frame.id, ...(position ? { position } : {}) } } : {}),
      }]);
      for (const i of pieces.slice(1)) drop.add(i);
    }
  }
  const result: InlineSpan[] = [];
  out.forEach((span, i) => {
    if (drop.has(i)) return;
    const parts = replace.get(i);
    if (parts) result.push(...parts);
    else result.push(span);
  });
  return result;
}

/** The fields of an annotation a span carries, for a pass that cuts a span
 *  into pieces (a placeholder injected inside it): every piece keeps them.
 *  `withRuby` keeps a ruby too (a text piece; never the placeholder). */
export function annotationFields(span: InlineSpan, withRuby = true): Partial<InlineSpan> {
  const out: Partial<InlineSpan> = {};
  if (span.emphasisMark) out.emphasisMark = span.emphasisMark;
  if (span.properName !== undefined) out.properName = span.properName;
  if (span.bookTitle) out.bookTitle = span.bookTitle;
  if (span.warichu) out.warichu = span.warichu;
  if (span.direction) out.direction = span.direction;
  if (span.sideline) out.sideline = span.sideline;
  if (withRuby && span.ruby) out.ruby = span.ruby;
  if (span.inserted) out.inserted = true;
  return out;
}

/**
 * Where the annotations of a stretch of source (`[from, end)` of
 * `markdown`) put markup the plain text does not print: each opener
 * (`:dots[`, a compact ruby's `{`) and each closer (`]` with its `{…}`, a
 * compact ruby's `|…}`), sorted. `computeSourceMap` steps over them, so a
 * plain space after `:ruby[紅]{rt="hóng lóu"}` never maps into the reading.
 * Inline code is left alone, as the parser leaves it.
 */
export function annotationSourceSkips(markdown: string, from: number, end: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const slice = markdown.slice(from, end);
  if (!/:(?:dots|name|book|ruby|warichu|ltr|rtl|sideline)\[|\{[^{}\n|]*\|/.test(slice)) return out;
  // Inline code spans, which the parser protects.
  const code: Array<[number, number]> = [];
  const codeRe = /(?<!\\)`[^`\n]+?`/g;
  let m: RegExpExecArray | null;
  while ((m = codeRe.exec(slice)) !== null) code.push([from + m.index, from + m.index + m[0].length]);
  const inCode = (at: number): boolean => code.some(([s, e]) => at >= s && at < e);
  const walk = (at: number, stop: number): void => {
    for (;;) {
      const found = nextAnnotation(markdown, at, stop);
      if (!found) return;
      if (inCode(found.start)) {
        at = found.start + 1;
        continue;
      }
      out.push([found.start, found.contentStart]);
      walk(found.contentStart, found.contentEnd);
      out.push([found.contentEnd, found.end]);
      at = found.end;
    }
  };
  walk(from, end);
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Every annotation of a line of source, nested ones included, in order of
 * their openers (for an editor's highlighting): its kind, the opener
 * (`[start, contentStart)`), the text (`[contentStart, contentEnd)`) and the
 * closer with its attributes or readings (`[contentEnd, end)`).
 */
export function findAnnotations(text: string): FoundAnnotation[] {
  const out: FoundAnnotation[] = [];
  const walk = (at: number, stop: number): void => {
    for (;;) {
      const found = nextAnnotation(text, at, stop);
      if (!found) return;
      out.push(found);
      walk(found.contentStart, found.contentEnd);
      at = found.end;
    }
  };
  walk(0, text.length);
  return out;
}

/** The brackets of a Chinese book title: 《》, 〈〉 for a title inside
 *  one (`defaultCjkBookTitleBrackets`). */
const CHINESE_BOOK_BRACKETS: readonly BracketPair[] = [{ open: '《', close: '》' }, { open: '〈', close: '〉' }];

/** An opening and a closing bracket (`cjk.bookTitleBrackets`). */
export interface BracketPair {
  open: string;
  close: string;
}

/** The side line the brackets of the title opening at `spans[at]` carry:
 *  the one its first and its last character share, if any (a line drawn
 *  under a whole title runs on under its brackets). */
function titleSideline(spans: readonly InlineSpan[], at: number, depth: number, id: number): InlineSideline | undefined {
  const line = spans[at]!.sideline;
  if (!line) return undefined;
  let last = at;
  for (let k = at + 1; k < spans.length; k++) {
    const book = spans[k]!.bookTitle;
    if (!book || book.depth < depth || (book.depth === depth && book.id !== id)) break;
    last = k;
  }
  return spans[last]!.sideline?.id === line.id ? line : undefined;
}

/** The brackets of `pairs` around the titles of `:book[…]` (`《》` and
 *  `〈〉` for a title inside one unless `pairs` says otherwise; a title
 *  nested deeper than the list takes its last pair), as spans flagged
 *  `inserted` (they take no character of the plain text); the titles lose
 *  their `bookTitle`. A bracket written empty is left out.
 *  `cjk.bookTitleMark: 'brackets'` with `cjk.bookTitleBrackets`. */
export function withBookBrackets(spans: readonly InlineSpan[], pairs: readonly BracketPair[] = CHINESE_BOOK_BRACKETS): InlineSpan[] {
  const out: InlineSpan[] = [];
  const list = pairs.length > 0 ? pairs : CHINESE_BOOK_BRACKETS;
  const pairAt = (depth: number): BracketPair => list[Math.min(depth, list.length) - 1]!;
  // Open titles, by depth (index 0 = depth 1): their run ids, and the side
  // line their brackets carry.
  const open: { id: number; line?: InlineSideline }[] = [];
  const bracket = (text: string, line: InlineSideline | undefined): void => {
    if (text.length > 0) out.push({ text, bold: false, italic: false, inserted: true, ...(line ? { sideline: line } : {}) });
  };
  const close = (toDepth: number): void => {
    while (open.length > toDepth) {
      bracket(pairAt(open.length).close, open[open.length - 1]!.line);
      open.pop();
    }
  };
  spans.forEach((span, i) => {
    const book = span.bookTitle;
    if (!book) {
      close(0);
      out.push(span);
      return;
    }
    if (open.length >= book.depth && open[book.depth - 1]!.id === book.id) close(book.depth);
    else {
      close(book.depth - 1);
      while (open.length < book.depth) {
        const own = open.length === book.depth - 1;
        const line = own ? titleSideline(spans, i, book.depth, book.id) : undefined;
        bracket(pairAt(open.length + 1).open, line);
        open.push({ id: own ? book.id : -1, ...(line ? { line } : {}) });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bookTitle: _b, ...rest } = span;
    out.push(rest);
  });
  close(0);
  return out;
}

/** `spans` without their Chinese and Japanese annotations: the text as
 *  written, set plain (captions, table cells and notes, which do not draw
 *  them). The same array when none has one. With `bookBrackets` (the
 *  `cjk.bookTitleBrackets` when `cjk.bookTitleMark` is `'brackets'`; `true`
 *  for 《》) a book title keeps its brackets, which are then punctuation of
 *  the text, not a mark. Directional isolates (`:rtl[…]`, `:ltr[…]`)
 *  stay: they decide the order of the text, which no setting drops. */
export function dropAnnotations(spans: InlineSpan[], bookBrackets: boolean | readonly BracketPair[] = false): InlineSpan[] {
  if (bookBrackets && spans.some((s) => s.bookTitle)) spans = withBookBrackets(spans, bookBrackets === true ? undefined : bookBrackets);
  if (!spans.some((s) => s.emphasisMark || s.properName !== undefined || s.bookTitle || s.ruby || s.warichu || s.sideline)) return spans;
  return spans.map((s) => {
    if (!s.emphasisMark && s.properName === undefined && !s.bookTitle && !s.ruby && !s.warichu && !s.sideline) return s;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { emphasisMark: _e, properName: _p, bookTitle: _b, ruby: _r, warichu: _w, sideline: _l, ...rest } = s;
    return rest;
  });
}
