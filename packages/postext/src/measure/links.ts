// Markdown links on measured lines (EF-36).
//
// The parser records a link as a range of the spans it covers
// (`InlineSpan.links`) without splitting them, so measurement never sees it
// and the layout is exactly the link-free one. After a block is measured,
// its segments are walked against the text they were cut from and the
// target is stamped on every segment holding a linked character
// (`VDTLineSegment.href`), for the HTML and PDF backends to make live.

import type { VDTLine, VDTLineSegment, VDTSegmentMark } from '../vdt.js';
import type { InlineSpan } from '../parse/index.js';
import { writtenText } from './rtl/kashida.js';
import { SOFT_HYPHEN } from './types.js';
import { GEMINATE_DOT, endsInsideGeminate } from './geminate.js';
import { BREAKING_SPACE_RE } from './spaces.js';

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
      if (link.mark) continue;
      for (let i = Math.max(0, link.start); i < Math.min(span.text.length, link.end); i++) out[base + i] = link.href;
    }
  }
  return out;
}

/** The highlight mark (#888) of each character of the spans' joined text;
 *  null when none carries one. */
function marksByChar(spans: readonly InlineSpan[]): ({ style: string; id: number } | undefined)[] | null {
  if (!spans.some((s) => s.links?.some((l) => l.mark))) return null;
  const out: ({ style: string; id: number } | undefined)[] = [];
  for (const span of spans) {
    const base = out.length;
    for (let i = 0; i < span.text.length; i++) out.push(undefined);
    for (const link of span.links ?? []) {
      if (!link.mark) continue;
      for (let i = Math.max(0, link.start); i < Math.min(span.text.length, link.end); i++) out[base + i] = link.mark;
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
  const hrefs = hrefsByChar(written) ?? [];
  // Highlight marks (#888) ride on the link ranges and are stamped here
  // too (`VDTLineSegment.mark`).
  const marks = marksByChar(written);
  if (hrefs.length === 0 && !marks) return lines;
  const text = written.map((s) => s.text).join('');
  // Each mark's first and last character in the text.
  const markEdges = new Map<number, { first: number; last: number }>();
  marks?.forEach((m, i) => {
    if (!m) return;
    const e = markEdges.get(m.id);
    if (e) e.last = i;
    else markEdges.set(m.id, { first: i, last: i });
  });
  let p = 0;
  const same = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();
  /** The mark of the chunk last consumed (see {@link consume}). */
  let chunkMark: VDTSegmentMark | undefined;

  /** Consume `chunk` from the text; its first link target, `null` when it
   *  does not match. Sets {@link chunkMark} to the chunk's highlight mark:
   *  the first one it holds, with the characters it covers when not all. */
  const consume = (chunk: string): string | undefined | null => {
    while (p < text.length && WHITESPACE.test(text[p]!) && !WHITESPACE.test(chunk[0] ?? '')) p++;
    let href: string | undefined;
    chunkMark = undefined;
    let markFrom = -1;
    let markTo = -1;
    let markId = -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      while (p < text.length && INVISIBLE.test(text[p]!) && text[p] !== c) p++;
      if (p < text.length && same(text[p]!, c)) {
        href ??= hrefs[p];
        const m = marks?.[p];
        if (m && (markId < 0 || m.id === markId)) {
          if (markId < 0) {
            markId = m.id;
            markFrom = i;
            const edges = markEdges.get(m.id)!;
            chunkMark = { style: m.style, id: m.id, ...(edges.first === p ? { start: true as const } : {}) };
          }
          markTo = i + 1;
          if (markEdges.get(m.id)!.last === p) chunkMark!.end = true;
        }
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
    if (chunkMark && (markFrom > 0 || markTo < chunk.length)) {
      chunkMark.from = markFrom;
      chunkMark.to = markTo;
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
      if (seg.inserted || seg.leader) {
        segments.push(seg);
        continue;
      }
      if (seg.kind === 'space') {
        while (p < text.length && WHITESPACE.test(text[p]!)) p++;
        segments.push(seg);
        continue;
      }
      // A word's text as written: without the tatweels kashida inserted.
      const written = writtenText(seg);
      const skip = lead && written.startsWith('-') ? 1 : 0;
      lead = false;
      const href = consume(written.slice(skip));
      if (href === null) return lines;
      const mark = chunkMark ? markOf(chunkMark, skip, written === seg.text) : undefined;
      if (href === undefined && !mark) {
        segments.push(seg);
        continue;
      }
      segments.push({ ...seg, ...(href !== undefined ? { href } : {}), ...(mark ? { mark } : {}) });
      lineChanged = true;
    }
    out.push(lineChanged ? { ...line, segments } : line);
    if (lineChanged) changed = true;
  }
  return changed ? out : lines;
}

/** A segment's mark from its chunk's: the characters it covers counted in
 *  the segment's text (past the `skip` of a repeated hyphen), dropped when
 *  the text is not the one written (tatweels inserted). */
function markOf(m: VDTSegmentMark, skip: number, plain: boolean): VDTSegmentMark {
  if (m.from === undefined) return m;
  if (!plain) {
    const rest = { ...m };
    delete rest.from;
    delete rest.to;
    return rest;
  }
  return { ...m, from: m.from + skip, to: (m.to ?? 0) + skip };
}
