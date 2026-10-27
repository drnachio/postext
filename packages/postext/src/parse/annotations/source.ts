// Source skips, annotation lookup and Chinese book-title brackets
// (#1278: split out of annotations.ts).
import type { InlineSpan, InlineSideline } from '../types.js';
import { nextAnnotation, type FoundAnnotation } from './scan.js';

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
  if (!/:(?:dots|name|book|ruby|warichu|ltr|rtl|sideline|kunten)\[|\{[^{}\n|]*\|/.test(slice)) return out;
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
