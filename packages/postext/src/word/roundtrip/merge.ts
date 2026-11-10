// Three-way merge: the edits are computed against the export-time text
// (the map's snapshot); when the source changed since, each edit is
// carried through the snapshot → current diff, and one that touches a
// region changed on both sides is a conflict. Then the edits of one text
// are applied from the end backwards.

import { diffText, mapThrough, type Hunk } from './diff.js';
import type { SourceEdit } from './edits.js';

export interface PlacedEdit {
  edit: SourceEdit;
  /** Range in the current text (base range for a conflict). */
  start: number;
  end: number;
  before: string;
  status: 'applied' | 'conflict' | 'rejected';
  reason?: string;
}

/** Carry `[s, e)` of `base` into the current text; undefined on a conflict. */
function transform(hunks: readonly Hunk[], s: number, e: number): [number, number] | undefined {
  let delta = 0;
  for (const h of hunks) {
    if (h.a0 > e) break;
    const editEmpty = s === e;
    const hunkEmpty = h.a0 === h.a1;
    let overlap: boolean;
    if (editEmpty && hunkEmpty) overlap = h.a0 === s;
    else if (editEmpty) overlap = h.a0 < s && s < h.a1;
    else if (hunkEmpty) overlap = s < h.a0 && h.a0 < e;
    else overlap = h.a0 < e && s < h.a1;
    if (overlap) return undefined;
    if (h.a1 <= s) delta += h.b1 - h.b0 - (h.a1 - h.a0);
  }
  return [s + delta, e + delta];
}

/** Place and apply the edits of one text. `base` = export-time text,
 *  `ours` = the current one (undefined: the target is gone). */
export function mergeText(base: string | undefined, ours: string | undefined, edits: readonly SourceEdit[]): { text: string | undefined; placed: PlacedEdit[]; hunks?: Hunk[] } {
  const placed: PlacedEdit[] = [];
  if (ours === undefined || base === undefined) {
    for (const edit of edits) {
      placed.push({ edit, start: edit.start, end: edit.end, before: edit.before ?? base?.slice(edit.start, edit.end) ?? '', status: edit.reject ? 'rejected' : 'conflict', reason: edit.reject ?? (ours === undefined ? 'target-missing' : 'no-snapshot') });
    }
    return { text: ours, placed };
  }
  const hunks = ours === base ? [] : diffText(base, ours);
  for (const edit of edits) {
    const before = base.slice(edit.start, edit.end);
    if (edit.reject) {
      placed.push({ edit, start: edit.start, end: edit.end, before: edit.before ?? before, status: 'rejected', reason: edit.reject });
      continue;
    }
    const at = transform(hunks, edit.start, edit.end);
    if (!at || ours.slice(at[0], at[1]) !== before) {
      placed.push({ edit, start: edit.start, end: edit.end, before, status: 'conflict', reason: 'changed-since-export' });
      continue;
    }
    placed.push({ edit, start: at[0], end: at[1], before, status: 'applied', ...(edit.note ? { reason: edit.note } : {}) });
  }
  // Apply from the end backwards; for one start, a range before an
  // insertion, and of two insertions the later one first.
  const order = placed
    .map((p, k) => ({ p, k }))
    .filter(({ p }) => p.status === 'applied')
    .sort((x, y) => y.p.start - x.p.start || y.p.end - x.p.end || y.k - x.k);
  let text = ours;
  let floor = Infinity;
  for (const { p } of order) {
    if (p.end > floor) {
      p.status = 'conflict';
      p.reason = 'overlap';
      continue;
    }
    text = text.slice(0, p.start) + p.edit.text + text.slice(p.end);
    floor = p.start;
  }
  return { text, placed, hunks };
}

/** Positions of the export-time text in the current one. */
export function positionMapper(base: string, ours: string): (pos: number) => number {
  if (base === ours) return (pos) => pos;
  const hunks = diffText(base, ours);
  return (pos) => mapThrough(hunks, pos);
}
