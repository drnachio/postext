// Markdown links on measured lines (EF-36).
//
// The parser records a link as a range of the spans it covers
// (`InlineSpan.links`) without splitting them, so measurement never sees it
// and the layout is exactly the link-free one. After a block is measured,
// its segments are walked against the text they were cut from and the
// target is stamped on every segment holding a linked character
// (`VDTLineSegment.href`), for the HTML and PDF backends to make live.

import type { VDTLine, VDTLineSegment } from '../vdt';
import type { InlineSpan } from '../parse';
import { SOFT_HYPHEN } from './types';
import { GEMINATE_DOT, endsInsideGeminate } from './geminate';
import { BREAKING_SPACE_RE } from './spaces';

/** Whitespace between words: the measurers split words at breaking
 *  whitespace only, and keep a no-break space inside the word it glues. */
const WHITESPACE = BREAKING_SPACE_RE;

/** Characters that take no room: soft hyphens, zero-width spaces and
 *  joiners, word joiners. The measurer may add or drop them. */
const INVISIBLE = new RegExp(`[${SOFT_HYPHEN}\\u200B-\\u200D\\u2060\\uFEFF]`);

/** Link target of each character of the spans' joined text; null when no
 *  span carries a link. The spans hold no `inserted` one (see
 *  {@link linkSegments}). */
function hrefsByChar(spans: readonly InlineSpan[]): (string | undefined)[] | null {
  if (!spans.some((s) => s.links && s.links.length > 0)) return null;
  const out: (string | undefined)[] = [];
  for (const span of spans) {
    const base = out.length;
    for (let i = 0; i < span.text.length; i++) out.push(undefined);
    for (const link of span.links ?? []) {
      for (let i = Math.max(0, link.start); i < Math.min(span.text.length, link.end); i++) out[base + i] = link.href;
    }
  }
  return out;
}

/**
 * Stamp the Markdown link targets of `spans` on the segments of `lines`
 * measured from them. The segments are matched character by character
 * against the spans' text — skipping the whitespace a line break swallows,
 * the soft hyphens and zero-width break opportunities the measurer inserted
 * and the hyphen a break adds — and a
 * segment holding any linked character takes that link's `href` (a word
 * glued to the link text, like its closing full stop, is part of the link
 * area). Characters the layout added (`inserted`: the 《》 of
 * `cjk.bookTitleMark: 'brackets'`, which are spans, and a warichu note's
 * brackets, which the composer adds and no span holds) are no character of
 * the text: their spans and segments are passed over, and never linked.
 * Returns `lines` itself when nothing is linked, or when the segments
 * cannot be matched (the block then simply has no live links).
 */
export function linkSegments(lines: VDTLine[], spans: readonly InlineSpan[]): VDTLine[] {
  const written = spans.some((s) => s.inserted) ? spans.filter((s) => !s.inserted) : spans;
  const hrefs = hrefsByChar(written);
  if (!hrefs) return lines;
  const text = written.map((s) => s.text).join('');
  let p = 0;
  const same = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();

  /** Consume `chunk` from the text; its first link target, `null` when it
   *  does not match. */
  const consume = (chunk: string): string | undefined | null => {
    while (p < text.length && WHITESPACE.test(text[p]!) && !WHITESPACE.test(chunk[0] ?? '')) p++;
    let href: string | undefined;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      while (p < text.length && INVISIBLE.test(text[p]!) && text[p] !== c) p++;
      if (p < text.length && same(text[p]!, c)) {
        href ??= hrefs[p];
        p++;
        continue;
      }
      // A break opportunity the measurer inserted (a zero-width space
      // inside a URL), or the hyphen a break (dictionary or emergency
      // split) adds.
      if (INVISIBLE.test(c)) continue;
      if (c === '-' && i === chunk.length - 1) {
        // The hyphen of a break inside an `l·l` stands for the middle dot.
        if (text[p] === GEMINATE_DOT && endsInsideGeminate(text.slice(p - 1, p + 1))) p++;
        continue;
      }
      return null;
    }
    return href;
  };

  const out: VDTLine[] = [];
  let changed = false;
  for (const line of lines) {
    // A line that opens with the hyphen of the compound the line before
    // broke at, repeated (`repeatHyphen`): that hyphen is not in the text.
    let lead = line.repeatedHyphen === true;
    if (!line.segments || line.segments.length === 0) {
      if (consume(lead && line.text.startsWith('-') ? line.text.slice(1) : line.text) === null) return lines;
      out.push(line);
      continue;
    }
    let lineChanged = false;
    const segments: VDTLineSegment[] = [];
    for (const seg of line.segments) {
      if (seg.inserted) {
        segments.push(seg);
        continue;
      }
      if (seg.kind === 'space') {
        while (p < text.length && WHITESPACE.test(text[p]!)) p++;
        segments.push(seg);
        continue;
      }
      const skip = lead && seg.text.startsWith('-') ? 1 : 0;
      lead = false;
      const href = consume(seg.text.slice(skip));
      if (href === null) return lines;
      if (href === undefined) {
        segments.push(seg);
        continue;
      }
      segments.push({ ...seg, href });
      lineChanged = true;
    }
    out.push(lineChanged ? { ...line, segments } : line);
    if (lineChanged) changed = true;
  }
  return changed ? out : lines;
}
