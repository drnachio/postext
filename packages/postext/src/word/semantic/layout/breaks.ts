// Page and column breaks the pages already make (#1444). The engine sets
// nothing for a `:::pagebreak` or `:::columnbreak` at the head of a page,
// where Word would leave a blank page: after a section break that starts
// a new page, before a paragraph that asks for one, or at the end of a
// chapter (the next chapter starts a new page). Such a break is left out
// of the document. Its `:::` line stays in the source, and the import
// keeps source that no fragment covers as it was, so the round trip is
// unchanged.

import type { ContentBlock } from '../../../parse/types.js';
import type { SectionStart } from '../sections.js';

/** Whether `b` is a `:::pagebreak` or a `:::columnbreak`. */
export const isBreak = (b: ContentBlock | undefined): boolean => b?.type === 'directive' && (b.directiveName === 'pagebreak' || b.directiveName === 'columnbreak');

const PAGE_BREAK_BEFORE = '<w:pageBreakBefore/>';

/** The bounds of the first paragraph of `xml` (inside a content control
 *  or not), or undefined when a table comes first. */
function firstParagraph(xml: string): [number, number] | undefined {
  const p = /<w:(p|tbl)[ >]/.exec(xml);
  if (!p || p[1] !== 'p') return undefined;
  const end = xml.indexOf('</w:p>', p.index);
  return end < 0 ? undefined : [p.index, end];
}

/** Whether a piece's first paragraph asks for a new page. */
function opensPage(xml: string): boolean {
  const at = firstParagraph(xml);
  return !!at && xml.slice(at[0], at[1]).includes(PAGE_BREAK_BEFORE);
}

/** `xml` without the page break its first paragraph asks for. */
function withoutPageBreak(xml: string): string {
  const at = firstParagraph(xml);
  if (!at) return xml;
  const head = xml.slice(at[0], at[1]);
  return head.includes(PAGE_BREAK_BEFORE) ? xml.slice(0, at[0]) + head.replace(PAGE_BREAK_BEFORE, '') + xml.slice(at[1]) : xml;
}

/**
 * Empties the breaks of `sections` the pages already make (`breaks`: the
 * XML of the chapter's break pieces): one at the start of a section that
 * opens a new page, one before a piece that opens a page itself, and one
 * at the end of the chapter or before a section that starts a new page.
 * The first paragraph of a section that opens a new page loses its own
 * page break too: the section break makes it.
 */
export function dropRedundantBreaks(sections: readonly { start: SectionStart; parts: string[] }[], breaks: ReadonlySet<string>): void {
  sections.forEach((s, i) => {
    const next = sections[i + 1];
    const parts = s.parts;
    const top = s.start !== 'continuous';
    const isBreakAt = (j: number): boolean => breaks.has(parts[j]!);
    // Whether a page starts at part `j`: the section's start, before any
    // piece other than a break, or after it (`after`) a break leaves no
    // text above.
    let k = 0;
    if (top) while (k < parts.length && isBreakAt(k)) k++;
    const gone = new Set<number>();
    for (let j = 0; j < k; j++) gone.add(j);
    for (let j = k; j < parts.length; j++) {
      if (!isBreakAt(j)) continue;
      let r = j + 1;
      while (r < parts.length && (!parts[r] || isBreakAt(r))) r++;
      const pageNext = r < parts.length ? opensPage(parts[r]!) : !next || next.start !== 'continuous';
      if (pageNext) gone.add(j);
    }
    for (const j of gone) parts[j] = marksOf(parts[j]!);
    if (top && k < parts.length) parts[k] = withoutPageBreak(parts[k]!);
  });
}

/** What a dropped break keeps: the bookmarks set before it (a chapter's
 *  own, when the break is the chapter's first piece). */
function marksOf(xml: string): string {
  const at = xml.indexOf('<w:sdt>');
  return at > 0 ? xml.slice(0, at) : '';
}
