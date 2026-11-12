import type { InlineSpan } from './types.js';
import { sliceLinks } from './links.js';
import { annotationFields } from './annotations.js';

/** `span` struck through as a whole when `strike` is set (`~~…~~` around
 *  a formula, a swatch, a reference, a note marker): its text, or a chip's
 *  words (a chip holds no character of the text itself). Underlined the
 *  same way when `underline` is set (`++…++`), and highlighted when `mark`
 *  is (`:mark[…]` around a citation or a reference, #1519 review). */
function struckSpan(span: InlineSpan, strike: { id: number } | undefined, underline?: { id: number }, mark?: { style: string; id: number }): InlineSpan {
  if (!strike && !underline && !mark) return span;
  const ranges = (n: number) => [
    ...(strike ? [{ start: 0, end: n, href: '', strike: { ...strike } }] : []),
    ...(underline ? [{ start: 0, end: n, href: '', underline: { ...underline } }] : []),
    ...(mark ? [{ start: 0, end: n, href: '', mark: { ...mark } }] : []),
  ];
  const whole = (s: InlineSpan): InlineSpan =>
    s.text.length > 0 ? { ...s, links: [...(s.links ?? []), ...ranges(s.text.length)] } : s;
  if (span.chip) return { ...span, chip: { ...span.chip, spans: span.chip.spans.map(whole) } };
  return whole(span);
}

/**
 * Walk an InlineSpan list and replace each occurrence of `placeholder` with a
 * dedicated span produced by `makeSpan` (carrying the ambient bold/italic),
 * consuming `items` in order. Plain-text spans are split around the
 * placeholder (the pieces keep their share of the span's links; the new
 * span takes none, but stays struck through when the placeholder was: see
 * {@link struckSpan}). Shared by ref and math injection. A small-caps span
 * keeps the flag on every piece, the placeholder's span included, and so
 * do the Chinese marks (see `annotationFields`); an orientation mark
 * (`:tcy`, `:upright`, `:sideways`) stays on the text pieces only.
 */
export function injectPlaceholderSpans<T>(
  spans: InlineSpan[],
  items: T[],
  placeholder: string,
  makeSpan: (item: T, bold: boolean, italic: boolean) => InlineSpan,
): InlineSpan[] {
  if (items.length === 0) return spans;
  const out: InlineSpan[] = [];
  let idx = 0;
  for (const span of spans) {
    let from = span.text.indexOf(placeholder);
    if (from < 0) {
      out.push(span);
      continue;
    }
    // Small capitals stay on every piece, the placeholder's span included.
    // The orientation marks of vertical text stay on the text around it:
    // a reference, a note marker, a chip, a swatch or a formula keeps its
    // own setting (#190 review).
    const sc = span.smallCaps ? { smallCaps: true } : {};
    const text = {
      ...sc,
      ...(span.combineUpright ? { combineUpright: true } : {}),
      ...(span.orientation ? { orientation: span.orientation } : {}),
    };
    // The Chinese marks of the run (#193–#195) go on with every piece; a
    // warichu note or a mark holds the placeholder's span too (a `:ref`
    // inside a note is part of the note), a ruby only its text: the first
    // piece of it, which carries the reading once.
    const placeholderMarks = annotationFields(span, false);
    let marks = annotationFields(span);
    const piece = (from: number, to: number): InlineSpan => {
      const out: InlineSpan = { text: span.text.slice(from, to), bold: span.bold, italic: span.italic, ...text, ...marks, ...sliceLinks(span.links, from, to) };
      marks = placeholderMarks;
      return out;
    };
    let last = 0;
    while (from >= 0) {
      if (from > last) out.push(piece(last, from));
      const item = items[idx++];
      const at = from;
      const strike = span.links?.find((l) => l.strike && l.start <= at && l.end > at)?.strike;
      const underline = span.links?.find((l) => l.underline && l.start <= at && l.end > at)?.underline;
      const mark = span.links?.find((l) => l.mark && l.start <= at && l.end > at)?.mark;
      if (item) out.push(struckSpan({ ...makeSpan(item, span.bold, span.italic), ...sc, ...placeholderMarks }, strike, underline, mark));
      last = from + placeholder.length;
      from = span.text.indexOf(placeholder, last);
    }
    if (last < span.text.length) out.push(piece(last, span.text.length));
  }
  return out;
}
