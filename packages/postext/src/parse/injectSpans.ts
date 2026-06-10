import type { InlineSpan } from './types';

/**
 * Walk an InlineSpan list and replace each occurrence of `placeholder` with a
 * dedicated span produced by `makeSpan` (carrying the ambient bold/italic),
 * consuming `items` in order. Plain-text spans are split around the
 * placeholder. Shared by ref and math injection.
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
    let last = 0;
    while (from >= 0) {
      if (from > last) {
        out.push({ text: span.text.slice(last, from), bold: span.bold, italic: span.italic });
      }
      const item = items[idx++];
      if (item) out.push(makeSpan(item, span.bold, span.italic));
      last = from + placeholder.length;
      from = span.text.indexOf(placeholder, last);
    }
    if (last < span.text.length) {
      out.push({ text: span.text.slice(last), bold: span.bold, italic: span.italic });
    }
  }
  return out;
}
