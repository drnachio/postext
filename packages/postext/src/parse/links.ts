// Link ranges of inline spans (`InlineSpan.links`, EF-36): helpers for the
// passes that cut a span's text, so every piece keeps its share of the
// links with offsets rebased to it.

import type { InlineLink, InlineSpan } from './types';

/** The links of `[start, end)` of a span's text, rebased to that slice —
 *  spread into a span cut from it. Empty when none falls inside. */
export function sliceLinks(links: readonly InlineLink[] | undefined, start: number, end: number): { links?: InlineLink[] } {
  if (!links) return {};
  const out: InlineLink[] = [];
  for (const l of links) {
    const s = Math.max(l.start, start);
    const e = Math.min(l.end, end);
    if (e > s) out.push({ start: s - start, end: e - start, href: l.href });
  }
  return out.length > 0 ? { links: out } : {};
}

/** `span` cut to `[start, end)` of its text, its links rebased. */
export function sliceSpan(span: InlineSpan, start: number, end: number = span.text.length): InlineSpan {
  const { links, ...rest } = span;
  return { ...rest, text: span.text.slice(start, end), ...sliceLinks(links, start, end) };
}
