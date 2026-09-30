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
import { withBookBrackets } from '../parse/annotations';
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

/**
 * A block's text and spans with the 《》 of its book titles in them, when
 * they are the document's book-title mark (`cjk.bookTitleMark:
 * 'brackets'`): for what reads a heading from its source rather than from
 * its lines (contents rows, bookmarks). The brackets are spans flagged
 * `inserted` (they may be there already: a heading set plain). The same
 * text and spans otherwise, and when the spans do not spell the text.
 */
export function withBookTitleBrackets(
  text: string,
  spans: readonly InlineSpan[],
  cjk: Pick<ResolvedCjkConfig, 'bookTitleMark'>,
): { text: string; spans: readonly InlineSpan[] } {
  if (cjk.bookTitleMark !== 'brackets') return { text, spans };
  const bracketed = spans.some((s) => s.bookTitle) ? withBookBrackets(spans) : spans;
  if (!bracketed.some((s) => s.inserted)) return { text, spans };
  let plain = '';
  let out = '';
  for (const s of bracketed) {
    out += s.text;
    if (!s.inserted) plain += s.text;
  }
  return plain === text ? { text: out, spans: bracketed } : { text, spans };
}

/** Book titles as `cjk.bookTitleMark` sets them, for a text measured
 *  outside the paragraph path (an index entry): 《》 added, the titles left
 *  for the wavy line, or plain. The same array when nothing changes. */
export function bookTitlesAsConfigured(spans: InlineSpan[], cjk: Pick<ResolvedCjkConfig, 'bookTitleMark'>): InlineSpan[] {
  if (!spans.some((s) => s.bookTitle)) return spans;
  if (cjk.bookTitleMark === 'brackets') return withBookBrackets(spans);
  if (cjk.bookTitleMark !== 'none') return spans;
  return spans.map((s) => {
    if (!s.bookTitle) return s;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bookTitle: _b, ...rest } = s;
    return rest;
  });
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
  out = bookTitlesAsConfigured(out, cjk);

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
