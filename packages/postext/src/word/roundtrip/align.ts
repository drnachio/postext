// Fragments of a map written again from the book, matched with the
// bookmarks of a file exported earlier (#1458). While the book stands as
// it did at the export the two agree name by name. Once it changed (a
// paragraph added, a chapter rewritten) the names after the change shift,
// so the fragments are matched by their text, in order: the ones that read
// the same pair up, the ones between two such pairs pair up when they
// still share most of their words, and the rest have no partner. A
// passage that pairs with only one half of itself (two paragraphs the book
// joined and the file holds apart, or one the book cut in two) has no
// partner either: changing it into its half would drop the other half, or
// write it twice.

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
  /** Fragments without partner that stand where the file lacks as many
   *  names (`nameLost`): fragment id of the book's map → the name. */
  lost?: Map<string, string>;
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

/** How much of two texts' words they share, 0 to 1 (none when either
 *  has no word). */
export function sharedWords(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  return x.size && y.size ? likeness(x, y) : 0;
}

/** The words of a text in their order. */
const wordsInOrder = (text: string): string[] => looseText(text).match(/[\p{L}\p{N}]+/gu) ?? [];

/** Whether `part` reads as the start (or the end) of `whole`: most of its
 *  words stand there. One word alone says nothing. */
function standsAt(part: readonly string[], whole: readonly string[], start: boolean): boolean {
  if (part.length < 2 || part.length >= whole.length) return false;
  const span = part.length + 2;
  const there = new Set(start ? whole.slice(0, span) : whole.slice(-span));
  let n = 0;
  for (const w of part) if (there.has(w)) n++;
  return n / part.length >= 0.8;
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
  const pairs: [number, number][] = [];
  const pair = (i: number, j: number): void => {
    out.ids.set(r[i]!.id, f[j]!.id);
    pairs.push([i, j]);
  };
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
  // A pair whose one side is a half of the other, the other half standing
  // right beside it without a partner: no pair.
  const both = (a: Set<string>, b: Set<string>): Set<string> => new Set([...a, ...b]);
  const halves = pairs.filter(([i, j]) => {
    const like = likeness(rw[i]!, fw[j]!);
    const whole = (k: number, start: boolean): boolean =>
      k >= 0 && k < f.length && !taken.has(k) && standsAt(wordsInOrder(f[k]!.text), wordsInOrder(r[i]!.text), start) && likeness(rw[i]!, both(fw[j]!, fw[k]!)) > like;
    const half = (k: number, start: boolean): boolean =>
      k >= 0 && k < r.length && !used.has(k) && standsAt(wordsInOrder(r[k]!.text), wordsInOrder(f[j]!.text), start) && likeness(both(rw[i]!, rw[k]!), fw[j]!) > like;
    return whole(j - 1, true) || whole(j + 1, false) || half(i - 1, true) || half(i + 1, false);
  });
  for (const [i, j] of halves) {
    out.ids.delete(r[i]!.id);
    used.delete(i);
    taken.delete(j);
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

/**
 * The fragments without partner that stand where the file lacks names.
 * The writer names the fragments with a counter, so the names of a file
 * have no gap but where a bookmark went: with the passage it held, or
 * alone when an editor replaced the whole text (`lost.ts`). Between two
 * pairs, as many fragments without partner as names the file lacks there
 * are those passages, in order. `from` and `to` bound the names of `r`
 * (a chapter's); nothing is said past an end that is not known.
 */
export function nameLost(r: readonly Named[], file: ReadonlySet<string>, out: Alignment, from: number, to: number): void {
  let before = from - 1;
  for (let i = 0; i < r.length; ) {
    const paired = out.ids.get(r[i]!.id);
    if (paired !== undefined || !out.unplaced.has(r[i]!.id)) {
      if (paired !== undefined) before = counterOf(paired);
      i++;
      continue;
    }
    let e = i;
    while (e < r.length && out.unplaced.has(r[e]!.id) && !out.ids.has(r[e]!.id)) e++;
    const next = e < r.length ? counterOf(out.ids.get(r[e]!.id) ?? '') : to;
    const gone: string[] = [];
    if (Number.isFinite(next) && before >= from - 1 && next - before <= r.length + file.size + 1) {
      for (let n = before + 1; n < next; n++) if (!file.has(n.toString(36))) gone.push(n.toString(36));
    }
    if (gone.length === e - i) {
      out.lost ??= new Map();
      for (let k = i; k < e; k++) out.lost.set(r[k]!.id, gone[k - i]!);
    }
    i = e;
  }
}
