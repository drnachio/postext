/**
 * Anchors (#261): the points of a document a cross-reference may name —
 * a heading with an identifier (`## Title {#id}`), an anchor set in the
 * text (`:anchor{#id}`, `[text]{#id}`) and a container opened with one
 * (`:::callout{#id}`). After layout each is located: the page it landed on
 * and the top-left of its heading or line, which the renderers turn into
 * link destinations and the sandbox scrolls to.
 */

import type { ContentBlock } from '../parse';
import type { VDTAnchor, VDTBlock, VDTDocument } from '../vdt';

/** Whether the parsed content sets any anchor. */
export function hasAnchors(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => (b.anchorMarks?.length ?? 0) > 0 || (b.type === 'heading' && b.attrs?.id !== undefined));
}

/**
 * Where each anchor of `blocks` (the parsed markdown body) landed in the
 * laid-out `doc`. A heading's anchor is its first fragment; an inline
 * anchor is the line holding the character it is attached to (as for an
 * index mark, see `locateIndexMarks`), else the nearest line on the side
 * it attaches to. Undefined when the document sets no anchor.
 */
export function locateAnchors(
  doc: VDTDocument,
  blocks: readonly ContentBlock[],
  bodyOffset: number,
): VDTAnchor[] | undefined {
  const marks = blocks.flatMap((b) => b.anchorMarks ?? []);
  const out: VDTAnchor[] = [];
  const seenHeading = new Set<number>();
  for (const b of doc.blocks) {
    // A heading an opener design draws (its block hidden) is a target all
    // the same: its block keeps its page and place.
    if (b.type !== 'heading' || b.pageIndex < 0) continue;
    const id = b.attrs?.id;
    if (id === undefined || id.length === 0) continue;
    // A split heading keeps its attributes on its first part only; the
    // content index guards against a repeated one all the same.
    if (b.contentIndex !== undefined) {
      if (seenHeading.has(b.contentIndex)) continue;
      seenHeading.add(b.contentIndex);
    }
    out.push({ id, kind: 'heading', pageIndex: b.pageIndex, x: b.bbox.x, y: b.bbox.y });
  }
  // Bibliography entries: the anchors `ref-<key>` citations link to (#269).
  const seenEntry = new Set<string>();
  for (const b of doc.blocks) {
    if (b.bibEntry === undefined || b.pageIndex < 0 || seenEntry.has(b.bibEntry)) continue;
    seenEntry.add(b.bibEntry);
    out.push({ id: `ref-${b.bibEntry}`, kind: 'anchor', pageIndex: b.pageIndex, x: b.bbox.x, y: b.bbox.y });
  }
  if (marks.length === 0) return out.length > 0 ? out : undefined;

  const lines: { start: number; end: number; page: number; x: number; y: number }[] = [];
  const add = (b: VDTBlock): void => {
    if (b.pageIndex < 0 || b.hidden) return;
    // A display formula's line maps no source of its own: the formula is
    // where its labels' anchors land (#530).
    if (b.type === 'mathDisplay' && b.sourceStart !== undefined && b.sourceEnd !== undefined) {
      lines.push({ start: b.sourceStart, end: b.sourceEnd, page: b.pageIndex, x: b.bbox.x, y: b.bbox.y });
      return;
    }
    for (const l of b.lines) {
      if (l.sourceStart !== undefined && l.sourceEnd !== undefined) {
        lines.push({ start: l.sourceStart, end: l.sourceEnd, page: b.pageIndex, x: l.bbox.x, y: l.bbox.y });
      }
    }
  };
  for (const b of doc.blocks) add(b);
  for (const page of doc.pages) for (const f of page.floats ?? []) add(f);
  lines.sort((a, b) => a.start - b.start || a.page - b.page);
  /** Index of the last line starting at or before `at` (-1: none). */
  const lastAtOrBefore = (at: number): number => {
    let lo = 0;
    let hi = lines.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid]!.start <= at) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  };
  for (const mark of marks) {
    if (mark.anchor < 0 || lines.length === 0) continue;
    const at = mark.anchor + bodyOffset;
    const i = lastAtOrBefore(at);
    let line: (typeof lines)[number] | undefined;
    for (let j = i; j >= 0 && j > i - 64; j--) {
      const l = lines[j]!;
      if (at >= l.start && at < l.end && (line === undefined || l.page < line.page)) line = l;
    }
    line ??= mark.attach === 'before' ? lines[i] ?? lines[i + 1] : lines[i + 1] ?? lines[i];
    if (!line) continue;
    out.push({ id: mark.anchorId, kind: 'anchor', pageIndex: line.page, x: line.x, y: line.y, sourceStart: mark.sourceStart });
  }
  return out.length > 0 ? out : undefined;
}

/** The identifiers set more than once in `blocks`, each with the source
 *  ranges of its second and later settings (`duplicateAnchor`). */
export function duplicateAnchors(blocks: readonly ContentBlock[]): { id: string; start: number; end: number }[] {
  const seen = new Set<string>();
  const out: { id: string; start: number; end: number }[] = [];
  const note = (id: string, start: number, end: number): void => {
    if (seen.has(id)) out.push({ id, start, end });
    else seen.add(id);
  };
  for (const b of blocks) {
    const marks = b.anchorMarks ?? [];
    // A container's anchor (its fence opens before the block) comes first.
    for (const m of marks) if (m.sourceEnd <= b.sourceStart) note(m.anchorId, m.sourceStart, m.sourceEnd);
    if (b.type === 'heading' && b.attrs?.id) note(b.attrs.id, b.sourceStart, b.attrSources?.id?.end ?? b.sourceEnd);
    for (const m of marks) if (m.sourceEnd > b.sourceStart) note(m.anchorId, m.sourceStart, m.sourceEnd);
  }
  return out;
}
