// Fragments of a map written again from the book, matched with the
// bookmarks of a file exported earlier (#1458). While the book stands as
// it did at the export the two agree name by name. Once it changed (a
// paragraph added, a chapter rewritten) the names after the change shift,
// so the fragments are matched by their text, in order: the ones that read
// the same pair up, the ones between two such pairs pair up when they
// still share most of their words, and the rest have no partner.

import { diffTokens } from './diff.js';

export interface Named {
  id: string;
  text: string;
}

export interface Alignment {
  /** Fragment id of the book's map → bookmark id of the file. */
  ids: Map<string, string>;
  /** Fragments of the book the file holds no text for. */
  unplaced: Set<string>;
  /** Bookmarks of the file whose text the book no longer has. */
  foreign: Set<string>;
}

/** The counter a fragment id was made from (`_ptx_<base 36>`). */
export const counterOf = (id: string): number => {
  const n = parseInt(id, 36);
  return Number.isFinite(n) ? n : -1;
};

/** A text as it is compared: spaces as one, case apart (an editor may
 *  type out the capitals a style gave). */
export const looseText = (text: string): string => text.replace(/\s+/gu, ' ').trim().toLowerCase();

function words(text: string): Set<string> {
  return new Set(looseText(text).match(/[\p{L}\p{N}]+/gu) ?? []);
}

/** How much of two texts' words they share, 0 to 1. */
function likeness(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return a.size === b.size ? 1 : 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.max(a.size, b.size);
}

/** Two texts that share this much are the same passage, edited. */
const SAME_PASSAGE = 0.5;

/** A run this short between two pairs is the same passages rewritten. */
const SHORT_RUN = 3;

/** Pair the fragments between two matched ones: in order, each with the
 *  bookmark it shares most words with. `bounded`: something around them
 *  did match (the two lists are the same text at all). */
function pairGap(r: readonly Named[], f: readonly Named[], out: Alignment, bounded: boolean): void {
  const rw = r.map((x) => words(x.text));
  const fw = f.map((x) => words(x.text));
  const pair = (i: number, j: number): void => void out.ids.set(r[i]!.id, f[j]!.id);
  const used = new Set<number>();
  const taken = new Set<number>();
  if (r.length * f.length <= 250000) {
    // Longest chain of like pairs that keeps the order of both.
    const n = r.length;
    const m = f.length;
    const best = new Float64Array((n + 1) * (m + 1));
    const at = (i: number, j: number): number => i * (m + 1) + j;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        const like = likeness(rw[i]!, fw[j]!);
        const both = like >= SAME_PASSAGE ? like + best[at(i + 1, j + 1)]! : 0;
        best[at(i, j)] = Math.max(both, best[at(i + 1, j)]!, best[at(i, j + 1)]!);
      }
    }
    for (let i = 0, j = 0; i < n && j < m; ) {
      const like = likeness(rw[i]!, fw[j]!);
      if (like >= SAME_PASSAGE && best[at(i, j)] === like + best[at(i + 1, j + 1)]!) {
        pair(i, j);
        used.add(i);
        taken.add(j);
        i++;
        j++;
      } else if (best[at(i + 1, j)]! >= best[at(i, j + 1)]!) i++;
      else j++;
    }
  }
  // Between two pairs, as many fragments as bookmarks, and few: the same
  // passages in the same order, each rewritten past likeness (a table
  // cell of one word, changed).
  for (let i = 0, j = 0; bounded && i <= r.length; ) {
    let i1 = i;
    while (i1 < r.length && !used.has(i1)) i1++;
    let j1 = j;
    while (j1 < f.length && !taken.has(j1)) j1++;
    if (i1 - i === j1 - j && i1 - i <= SHORT_RUN) {
      for (let k = 0; k < i1 - i; k++) {
        pair(i + k, j + k);
        used.add(i + k);
        taken.add(j + k);
      }
    }
    i = i1 + 1;
    j = j1 + 1;
  }
  r.forEach((x, i) => {
    if (!used.has(i)) out.unplaced.add(x.id);
  });
  f.forEach((x, j) => {
    if (!taken.has(j)) out.foreign.add(x.id);
  });
}

/** Match `r`, the fragments of the book as it is now, with `f`, the
 *  bookmarks of the file, both in the order they were written in. */
export function alignFragments(r: readonly Named[], f: readonly Named[], into?: Alignment): Alignment {
  const out: Alignment = into ?? { ids: new Map(), unplaced: new Set(), foreign: new Set() };
  const codes = new Map<string, number>();
  const code = (x: Named): number => {
    const key = looseText(x.text);
    let c = codes.get(key);
    if (c === undefined) codes.set(key, (c = codes.size));
    return c;
  };
  const a = r.map(code);
  const b = f.map(code);
  let i = 0;
  let j = 0;
  for (const h of [...diffTokens(a, b), { a0: a.length, a1: a.length, b0: b.length, b1: b.length }]) {
    for (; i < h.a0 && j < h.b0; i++, j++) out.ids.set(r[i]!.id, f[j]!.id);
    pairGap(r.slice(h.a0, h.a1), f.slice(h.b0, h.b1), out, h.a1 - h.a0 < a.length || h.b1 - h.b0 < b.length);
    i = h.a1;
    j = h.b1;
  }
  return out;
}
