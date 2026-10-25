// The documents each SCO holds (#1265): a chapter whole, or the part of it
// between two heading lines, cut from its laid-out print document by the
// source offset of each block. The fixed layout keeps whole pages (every
// page the part touches, so a page two parts share shows in both); the
// reflowable one keeps exactly the part's blocks.
//
// An exercise belongs to the part its box's source lies in: only that SCO
// counts it, even where its page also shows in a neighbour's.

import { exercisePoints } from 'postext';
import type { ExerciseRecord, VDTBlock, VDTDocument, VDTPage } from 'postext';
import type { ScormLayout, ScormRange } from './types.js';

/** Whether a source offset lies in a range. */
const within = (at: number, range: ScormRange): boolean => at >= range.start && (range.end === undefined || at < range.end);

/** A verdict per block, in reading order: a block that has no source offset
 *  of its own (or whose text comes from another chapter) goes with the
 *  block before it. */
function verdicts(blocks: readonly VDTBlock[], range: ScormRange, state: { last: boolean }): boolean[] {
  return blocks.map((b) => {
    if (b.sourceStart !== undefined && b.sourceChapter === undefined) state.last = within(b.sourceStart, range);
    return state.last;
  });
}

/** The column blocks of a page, in reading order. */
const pageBlocks = (page: VDTPage): VDTBlock[] => page.columns.flatMap((c) => c.blocks);

/** `doc` cut to `range`, for `layout`. Undefined when nothing of the
 *  chapter lies in it. */
export function cutDocument(doc: VDTDocument, range: ScormRange | undefined, layout: ScormLayout): VDTDocument | undefined {
  if (!range) return doc;
  if (layout === 'fixed') {
    // Every page from the first to the last that sets a block of the part.
    const state = { last: false };
    let first = -1;
    let last = -1;
    doc.pages.forEach((page, i) => {
      const hits = verdicts([...pageBlocks(page), ...(page.floats ?? []).filter((f) => f.footnoteNote === undefined)], range, state);
      if (hits.some(Boolean)) {
        if (first < 0) first = i;
        last = i;
      }
    });
    if (first < 0) return undefined;
    return { ...doc, pages: doc.pages.slice(first, last + 1) };
  }
  // Reflowable: the part's blocks, and the footnotes of the pages it keeps.
  const state = { last: false };
  const pages: VDTPage[] = [];
  for (const page of doc.pages) {
    let kept = 0;
    const columns = page.columns.map((col) => {
      const hits = verdicts(col.blocks, range, state);
      const blocks = col.blocks.filter((_, i) => hits[i]);
      kept += blocks.length;
      return { ...col, blocks };
    });
    const inPart = (b: VDTBlock): boolean => b.sourceStart === undefined || b.sourceChapter !== undefined || within(b.sourceStart, range);
    const floats = (page.floats ?? []).filter((f) => (f.footnoteNote !== undefined ? kept > 0 : inPart(f)));
    const marginNotes = page.marginNotes.filter((f) => kept > 0 && inPart(f));
    if (kept === 0 && !floats.some((f) => f.footnoteNote === undefined)) continue;
    pages.push({ ...page, columns, floats, marginNotes });
  }
  if (pages.length === 0) return undefined;
  const all = verdicts(doc.blocks, range, { last: false });
  return { ...doc, pages, blocks: doc.blocks.filter((_, i) => all[i]) };
}

/** The source offset of an exercise's box: where the fence opens. */
function exerciseSource(doc: VDTDocument, record: ExerciseRecord): number | undefined {
  const frames = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
  const box = frames.find((b) => b.type === 'callout' && b.containerId === record.id && b.sourceStart !== undefined);
  return box?.sourceStart;
}

/** The answers' key of an exercise below the book's: what the exercise
 *  script keeps it under in the content document whose data block names
 *  `scope` (the fixed layout's document index, the reflowable file's
 *  href; see `attachExercises`). */
export function exerciseKey(scope: string | number, record: Pick<ExerciseRecord, 'anchor' | 'ordinal' | 'id'>): string {
  return `${scope}:${record.anchor || `#${record.ordinal}.${record.id}`}`;
}

/** The exercises a SCO counts: those of the chapter `doc` whose fence lies
 *  in `range` (all of them for a whole chapter), with something to grade,
 *  and their graded slots. */
export function ownedExercises(doc: VDTDocument, range: ScormRange | undefined): { record: ExerciseRecord; points: number }[] {
  const out: { record: ExerciseRecord; points: number }[] = [];
  for (const record of doc.exercises ?? []) {
    if (range) {
      const at = exerciseSource(doc, record);
      if (at === undefined || !within(at, range)) continue;
    }
    const points = exercisePoints(record);
    if (points > 0) out.push({ record, points });
  }
  return out;
}
