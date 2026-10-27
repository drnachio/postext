/**
 * Index marks, anchors and headings written in the part of a story that
 * went on in a page of another chapter (#988, DESIGN §5.17, §5.18).
 *
 * The chapter that sent the story cannot place them: the words are laid by
 * the chapter that has the page, so the sender's own location finds no line
 * for them and falls back on the page where the story starts. The receiving
 * chapter knows the page and reports it ({@link locateCarriedOutline},
 * `VDTDocument.carriedOutline`); a host with every chapter's outline puts
 * the pages into the sender's entries ({@link mergeCarriedOutline}), keyed
 * by the sending chapter and the offset in its body.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { ImportedJumps } from '../../composed/carry.js';
import type { OutlineEntry } from '../../types.js';
import type { VDTBlock, VDTCarriedOutlineEntry, VDTDocument } from '../../vdt.js';

interface Line {
  start: number;
  end: number;
  page: number;
  x: number;
  y: number;
}

/** The line of the character at `at` among `lines` (sorted by start): the
 *  first page's line holding it; else the line before it
 *  (`attach: 'before'`) or after it, as long as that lies within the span
 *  the lines cover. */
function lineAt(lines: readonly Line[], at: number, attach: 'before' | 'after' | undefined): Line | undefined {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.start <= at) lo = mid + 1;
    else hi = mid;
  }
  const i = lo - 1;
  let found: Line | undefined;
  for (let j = i; j >= 0 && j > i - 64; j--) {
    const l = lines[j]!;
    if (at >= l.start && at < l.end && (found === undefined || l.page < found.page)) found = l;
  }
  if (found) return found;
  // Outside what this chapter laid: the mark is the sender's, not ours.
  if (i < 0 || at > lines[lines.length - 1]!.end) return undefined;
  return attach === 'before' ? lines[i] : lines[i + 1] ?? lines[i];
}

/**
 * What the stories carried into `doc` hold: each index mark, inline anchor
 * and heading of a story that this chapter laid (the part the sender did
 * not), with the page it landed on here. `baseLength` is where the carried
 * blocks start among the chapter's content blocks, `bodyOffset` this
 * chapter's own.
 */
export function locateCarriedOutline(doc: VDTDocument, carried: ImportedJumps, bodyOffset: number): VDTCarriedOutlineEntry[] {
  const out: VDTCarriedOutlineEntry[] = [];
  const known = new Set<VDTBlock>(doc.blocks);
  const placed: VDTBlock[] = doc.blocks.filter((b) => b.pageIndex >= 0);
  for (const page of doc.pages) for (const f of page.floats ?? []) if (f.pageIndex >= 0 && !known.has(f)) placed.push(f);
  for (const story of carried.stories.values()) {
    const blocks: readonly ContentBlock[] = carried.blocks.slice(story.startIdx - carried.baseLength, story.endIdx - carried.baseLength + 1);
    // The story's own lines: offsets in the sending chapter's file.
    const lines: Line[] = [];
    const headingAt = new Map<number, { page: number; x: number; y: number }>();
    for (const b of placed) {
      if (b.contentIndex === undefined || b.contentIndex < story.startIdx || b.contentIndex > story.endIdx) continue;
      if (b.type === 'heading' && !headingAt.has(b.contentIndex)) headingAt.set(b.contentIndex, { page: b.pageIndex, x: b.bbox.x, y: b.bbox.y });
      if (b.hidden) continue;
      for (const l of b.lines) {
        if (l.sourceStart !== undefined && l.sourceEnd !== undefined) lines.push({ start: l.sourceStart, end: l.sourceEnd, page: b.pageIndex, x: l.bbox.x, y: l.bbox.y });
      }
    }
    lines.sort((a, b) => a.start - b.start || a.page - b.page);
    const jump = story.jump;
    // `sourceStart` of a carried block is its sender's plus this much.
    const delta = jump.bodyOffset - bodyOffset;
    const chapter = story.chapter;
    blocks.forEach((block, k) => {
      if (block.type === 'heading') {
        const at = headingAt.get(story.startIdx + k);
        const id = block.attrs?.id;
        if (at) {
          out.push({
            chapter,
            kind: 'heading',
            sourceStart: block.sourceStart - delta,
            pageIndex: at.page,
            ...(id !== undefined && id.length > 0 ? { anchor: { id, x: at.x, y: at.y } } : {}),
          });
        }
      }
      if (lines.length === 0) return;
      for (const m of block.indexMarks ?? []) {
        if (m.anchor < 0) continue;
        const line = lineAt(lines, m.anchor + jump.bodyOffset, m.attach);
        if (line) out.push({ chapter, kind: 'indexMark', sourceStart: m.sourceStart - delta, pageIndex: line.page });
      }
      for (const m of block.anchorMarks ?? []) {
        if (m.anchor < 0) continue;
        const line = lineAt(lines, m.anchor + jump.bodyOffset, m.attach);
        if (line) out.push({ chapter, kind: 'anchor', sourceStart: m.sourceStart - delta, pageIndex: line.page, anchor: { id: m.anchorId, x: line.x, y: line.y } });
      }
    });
  }
  return out;
}

/** An entry of `VDTDocument.carriedOutline` with its page as the book
 *  prints it (label and index in the whole book), what a host keeps of a
 *  chapter once its document is gone. */
export interface CarriedPlace {
  chapter: number;
  kind: VDTCarriedOutlineEntry['kind'];
  sourceStart: number;
  pageLabel: string;
  pageIndex: number;
  pageFormat: VDTDocument['pages'][number]['pageNumberFormat'];
}

/** `doc.carriedOutline` with the pages of the book. */
export function carriedPlaces(doc: VDTDocument): CarriedPlace[] {
  const offset = doc.pageIndexOffset ?? 0;
  const out: CarriedPlace[] = [];
  for (const c of doc.carriedOutline ?? []) {
    const page = doc.pages[c.pageIndex];
    if (page) out.push({ chapter: c.chapter, kind: c.kind, sourceStart: c.sourceStart, pageLabel: page.pageLabel, pageIndex: offset + page.index, pageFormat: page.pageNumberFormat });
  }
  return out;
}

/**
 * `outlines` (one array of entries per chapter, as `outlineFromDoc` gives
 * them) with the pages the receiving chapters found for the index marks,
 * anchors and headings of the stories they carry (`carriedPlaces`, one
 * list per chapter) put into the sending chapter's entries. A chapter
 * nothing was carried from keeps its array.
 */
export function mergeCarriedOutline(
  outlines: readonly (readonly OutlineEntry[])[],
  places: readonly (readonly CarriedPlace[] | undefined)[],
): (readonly OutlineEntry[])[] {
  // The pages found per chapter, by entry index. Kept in a Map and folded
  // into fresh arrays below, so no write goes through a key of the input.
  const found = new Map<number, Map<number, CarriedPlace>>();
  for (const list of places) {
    for (const c of list ?? []) {
      const entries = outlines[c.chapter];
      if (!entries) continue;
      const at = entries.findIndex((e) => (
        c.kind === 'indexMark' ? e.kind === 'indexMark' && e.indexMark?.sourceStart === c.sourceStart
          : c.kind === 'anchor' ? e.kind === 'anchor' && e.anchorSource === c.sourceStart
            : e.kind === 'heading' && e.headingSource === c.sourceStart
      ));
      if (at < 0) continue;
      let byEntry = found.get(c.chapter);
      if (!byEntry) {
        byEntry = new Map();
        found.set(c.chapter, byEntry);
      }
      byEntry.set(at, c);
    }
  }
  return outlines.map((entries, chapter) => {
    const byEntry = found.get(chapter);
    if (!byEntry) return entries;
    return entries.map((e, at) => {
      const c = byEntry.get(at);
      if (!c) return e;
      return {
        ...e,
        pageLabel: c.pageLabel,
        pageIndex: c.pageIndex,
        ...(c.kind === 'indexMark' ? { pageFormat: c.pageFormat } : {}),
      };
    });
  });
}
