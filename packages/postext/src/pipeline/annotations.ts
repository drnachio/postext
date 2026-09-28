/**
 * Chinese inline annotations before measurement (#193, #194, #195): what
 * the configuration makes of the spans the parser marked, on every text
 * the layout measures as a block.
 *
 * - `cjk.emphasis: 'dots'`: the Chinese characters of `*…*` lose their
 *   italics and take emphasis dots; Latin letters in the same emphasis keep
 *   the italics.
 * - `cjk.bookTitleMark`: `'brackets'` adds 《》 (〈〉 nested) around each
 *   `:book[…]` title as text the lines are broken with (spans flagged
 *   `inserted`, which take no character of the plain text); `'wavy'` keeps
 *   the title's run for the wavy line; `'none'` drops it.
 * - Ruby readings and warichu notes get their font (at their size, in the
 *   text's face unless `cjk.ruby.fontFamily` names one) and colour; a note
 *   gets the brackets `cjk.warichu` gives it unless it names its own.
 *
 * Spans without any of these marks pass through untouched (the same
 * array), so text without them measures and caches as before.
 */

import type { InlineSpan, InlineWarichu } from '../parse';
import type { ResolvedCjkConfig } from '../types';
import { sliceSpan } from '../parse/links';
import { graphemesOf } from '../measure/graphemes';
import { buildFontString } from '../measure/font';
import { dimensionToPx } from '../units';

/** What annotation resolution needs. */
export interface AnnotationContext {
  cjk: ResolvedCjkConfig;
  dpi: number;
  /** The text's font (CSS shorthand) and size. */
  fontString: string;
  fontSizePx: number;
}

/** Characters that take emphasis dots under `cjk.emphasis: 'dots'`: Han,
 *  kana, bopomofo, CJK punctuation and fullwidth forms. */
const CJK_EMPHASIS_RE = /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}　-〿＀-￯ー]/u;

/** `font` at `sizePx`, its style, weight and family kept. */
export function fontAtSize(font: string, sizePx: number): string {
  const m = /^(.*?)(\d*\.?\d+)px(\s*\/\s*[^\s]+)?\s+(.+)$/.exec(font);
  if (!m) return font;
  return `${m[1]}${sizePx}px ${m[4]}`;
}

/** Whether a span list holds anything {@link resolveAnnotationSpans}
 *  changes under `cjk`. */
export function hasAnnotations(spans: readonly InlineSpan[], cjk: ResolvedCjkConfig): boolean {
  for (const s of spans) {
    if (s.ruby || s.warichu || s.bookTitle) return true;
    if (cjk.emphasis === 'dots' && s.italic && !s.math && !s.chip && !s.swatch && !s.ref && CJK_ANY_RE.test(s.text)) return true;
  }
  return false;
}
const CJK_ANY_RE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}　-〿＀-￯]/u;

/** The Chinese characters of an italic span set with emphasis dots
 *  instead: the span cut where the script changes. */
function emphasisAsDots(span: InlineSpan): InlineSpan[] {
  const graphemes = graphemesOf(span.text);
  const out: InlineSpan[] = [];
  let at = 0;
  let from = 0;
  let cjk: boolean | undefined;
  const flush = (end: number): void => {
    if (end <= from || cjk === undefined) return;
    const piece = sliceSpan(span, from, end);
    out.push(cjk ? { ...piece, italic: false, emphasisMark: span.emphasisMark ?? {} } : piece);
  };
  for (const g of graphemes) {
    const isCjk = CJK_EMPHASIS_RE.test(g);
    if (cjk !== undefined && isCjk !== cjk) {
      flush(at);
      from = at;
    }
    cjk = isCjk;
    at += g.length;
  }
  flush(at);
  return out;
}

/** 《》 around the titles of `:book[…]` (〈〉 for a title inside one). */
function bookBrackets(spans: readonly InlineSpan[]): InlineSpan[] {
  const out: InlineSpan[] = [];
  // Open titles, by depth (index 0 = depth 1): their run ids.
  const open: number[] = [];
  const bracket = (text: string): InlineSpan => ({ text, bold: false, italic: false, inserted: true });
  const close = (toDepth: number): void => {
    while (open.length > toDepth) {
      out.push(bracket(open.length > 1 ? '〉' : '》'));
      open.pop();
    }
  };
  for (const span of spans) {
    const book = span.bookTitle;
    if (!book) {
      close(0);
      out.push(span);
      continue;
    }
    if (open.length >= book.depth && open[book.depth - 1] === book.id) close(book.depth);
    else {
      close(book.depth - 1);
      while (open.length < book.depth) {
        out.push(bracket(open.length > 0 ? '〈' : '《'));
        open.push(open.length === book.depth - 1 ? book.id : -1);
      }
    }
    const { bookTitle: _b, ...rest } = span;
    out.push(rest);
  }
  close(0);
  return out;
}

/** The hex of a resolved colour, if any. */
const hexOf = (c: { hex: string } | undefined): string | undefined => c?.hex;

/**
 * The spans as the configuration sets them (see the module comment). The
 * same array when nothing changes.
 */
export function resolveAnnotationSpans(spans: InlineSpan[], ctx: AnnotationContext): InlineSpan[] {
  const { cjk } = ctx;
  if (!hasAnnotations(spans, cjk)) return spans;
  let out: InlineSpan[] = [];

  // `*…*` on Chinese characters: emphasis dots.
  if (cjk.emphasis === 'dots') {
    for (const span of spans) {
      if (span.italic && !span.math && !span.chip && !span.swatch && !span.ref && !span.footnote && !span.ruby && CJK_ANY_RE.test(span.text)) {
        out.push(...emphasisAsDots(span));
      } else out.push(span);
    }
  } else out = [...spans];

  // Book titles.
  if (out.some((s) => s.bookTitle)) {
    if (cjk.bookTitleMark === 'brackets') out = bookBrackets(out);
    else if (cjk.bookTitleMark === 'none') {
      out = out.map((s) => {
        if (!s.bookTitle) return s;
        const { bookTitle: _b, ...rest } = s;
        return rest;
      });
    }
  }

  // Ruby readings and warichu notes: font and colour.
  if (out.some((s) => s.ruby || s.warichu)) {
    const em = ctx.fontSizePx;
    const rubySize = dimensionToPx(cjk.ruby.fontSize, ctx.dpi, em);
    const rubyFont = cjk.ruby.fontFamily ? buildFontString(cjk.ruby.fontFamily, rubySize) : fontAtSize(ctx.fontString, rubySize);
    const rubyColor = hexOf(cjk.ruby.color ?? cjk.annotationColor);
    const noteSize = dimensionToPx(cjk.warichu.fontSize, ctx.dpi, em);
    const noteFont = fontAtSize(ctx.fontString, noteSize);
    const noteColor = hexOf(cjk.warichu.color ?? cjk.annotationColor);
    const notes = new Map<InlineWarichu, InlineWarichu>();
    const position = cjk.ruby.position === 'auto' ? undefined : cjk.ruby.position;
    out = out.map((s) => {
      if (!s.ruby && !s.warichu) return s;
      const next: InlineSpan = { ...s };
      if (s.ruby) {
        next.ruby = {
          ...s.ruby,
          ...(s.ruby.position === undefined && position ? { position } : {}),
          fontString: rubyFont,
          ...(rubyColor ? { color: rubyColor } : {}),
        };
      }
      if (s.warichu) {
        let note = notes.get(s.warichu);
        if (!note) {
          note = {
            ...s.warichu,
            open: s.warichu.open ?? cjk.warichu.open,
            close: s.warichu.close ?? cjk.warichu.close,
            fontString: noteFont,
            ...(noteColor ? { color: noteColor } : {}),
          };
          notes.set(s.warichu, note);
        }
        next.warichu = note;
      }
      return next;
    });
  }
  return out;
}
