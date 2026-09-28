import type { InlineSpan } from './types';
import { sliceLinks } from './links';
import { annotationFields } from './annotations';

/**
 * Walk an InlineSpan list and replace each occurrence of `placeholder` with a
 * dedicated span produced by `makeSpan` (carrying the ambient bold/italic),
 * consuming `items` in order. Plain-text spans are split around the
 * placeholder (the pieces keep their share of the span's links; the new
 * span takes none). Shared by ref and math injection. A small-caps span
 * keeps the flag on every piece, the placeholder's span included, and so
 * do the Chinese marks (see `annotationFields`).
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
    const sc = span.smallCaps ? { smallCaps: true } : {};
    // The Chinese marks of the run (#193–#195) go on with every piece; a
    // warichu note or a mark holds the placeholder's span too (a `:ref`
    // inside a note is part of the note), a ruby only its text.
    const marks = annotationFields(span);
    const placeholderMarks = annotationFields(span, false);
    let last = 0;
    while (from >= 0) {
      if (from > last) {
        out.push({ text: span.text.slice(last, from), bold: span.bold, italic: span.italic, ...sc, ...marks, ...sliceLinks(span.links, last, from) });
      }
      const item = items[idx++];
      if (item) out.push({ ...makeSpan(item, span.bold, span.italic), ...sc, ...placeholderMarks });
      last = from + placeholder.length;
      from = span.text.indexOf(placeholder, last);
    }
    if (last < span.text.length) {
      out.push({ text: span.text.slice(last), bold: span.bold, italic: span.italic, ...sc, ...marks, ...sliceLinks(span.links, last, span.text.length) });
    }
  }
  return out;
}
