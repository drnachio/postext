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

/** Whether a change of the book stands in the way of the range `[s, e)`. */
function touches(h: Hunk, s: number, e: number): boolean {
  const editEmpty = s === e;
  const hunkEmpty = h.a0 === h.a1;
  if (editEmpty && hunkEmpty) return h.a0 === s;
  if (editEmpty) return h.a0 < s && s < h.a1;
  if (hunkEmpty) return s < h.a0 && h.a0 < e;
  return h.a0 < e && s < h.a1;
}

/** Carry `[s, e)` of `base` into the current text; undefined on a conflict. */
function transform(hunks: readonly Hunk[], s: number, e: number): [number, number] | undefined {
  let delta = 0;
  for (const h of hunks) {
    if (h.a0 > e) break;
    if (touches(h, s, e)) return undefined;
    if (h.a1 <= s) delta += h.b1 - h.b0 - (h.a1 - h.a0);
  }
  return [s + delta, e + delta];
}

/** Whether a change of the book meets the range `[s, e)` or stands at
 *  its edge: a diff may write one replaced word as an insertion before it
 *  and a deletion of its rest. */
const meets = (h: Hunk, s: number, e: number): boolean => touches(h, s, e) || (h.a0 === h.a1 && (h.a0 === s || h.a0 === e)) || (s === e && (s === h.a0 || s === h.a1));

/** The edits the book already holds: where the book changed since the
 *  export, the edits and the book's changes that meet are taken together,
 *  and when both leave the same text there (the file imported a second
 *  time, a correction made on both sides) there is nothing to bring. */
function alreadyThere(base: string, ours: string, hunks: readonly Hunk[], edits: readonly SourceEdit[]): Set<SourceEdit> {
  const same = new Set<SourceEdit>();
  const seen = new Set<SourceEdit>();
  const live = edits.filter((x) => !x.reject && x.start >= 0);
  for (const first of live) {
    if (seen.has(first) || !hunks.some((h) => meets(h, first.start, first.end))) continue;
    const mine = new Set<SourceEdit>([first]);
    const theirs = new Set<Hunk>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const h of hunks) {
        if (theirs.has(h) || ![...mine].some((x) => meets(h, x.start, x.end))) continue;
        theirs.add(h);
        grew = true;
      }
      for (const x of live) {
        if (mine.has(x) || ![...theirs].some((h) => meets(h, x.start, x.end))) continue;
        mine.add(x);
        grew = true;
      }
    }
    for (const x of mine) seen.add(x);
    const lo = Math.min(...[...mine].map((x) => x.start), ...[...theirs].map((h) => h.a0));
    const hi = Math.max(...[...mine].map((x) => x.end), ...[...theirs].map((h) => h.a1));
    const grow = (h: Hunk): number => h.b1 - h.b0 - (h.a1 - h.a0);
    let from = lo;
    let length = hi - lo;
    for (const h of hunks) {
      if (theirs.has(h)) length += grow(h);
      else if (h.a1 <= lo) from += grow(h);
      else if (h.a0 >= lo && h.a1 <= hi && !(h.a0 === h.a1 && h.a0 === hi)) length += grow(h);
    }
    let text = base.slice(lo, hi);
    const order = [...mine].map((x, k) => ({ x, k })).sort((a, b) => b.x.start - a.x.start || b.x.end - a.x.end || b.k - a.k);
    let floor = Infinity;
    let apart = true;
    for (const { x } of order) {
      if (x.end > floor) apart = false;
      else text = text.slice(0, x.start - lo) + x.text + text.slice(x.end - lo);
      floor = x.start;
    }
    if (apart && ours.slice(from, from + length) === text) for (const x of mine) same.add(x);
  }
  return same;
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
  const there = hunks.length ? alreadyThere(base, ours, hunks, edits) : new Set<SourceEdit>();
  for (const edit of edits) {
    if (there.has(edit)) continue;
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
