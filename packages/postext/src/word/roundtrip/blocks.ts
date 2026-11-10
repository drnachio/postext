// Logical blocks of an export: the map's fragments grouped by `block` and
// joined in part order, beside the text Word now holds for them. A block
// is what the character diff runs over, so an edit across a column or page
// break (a word hyphenated into the next text box) is one hunk.

import type { FragmentTarget, MapFragment } from '../anchors/types.js';
import type { ReadChar, ReadFragment } from './read.js';
import { markdownOf } from './added.js';
import { makeKey } from './markup.js';
import { PARA_CHAR } from './walk.js';

export interface BlockAtom {
  /** Extent in the exported text. */
  a0: number;
  a1: number;
  /** Source range. */
  start: number;
  end: number;
  kind: string;
  /** Canonical OMML hash the writer recorded (maths). */
  hash?: string;
}

export interface BlockView {
  id: string;
  target: FragmentTarget;
  frags: MapFragment[];
  /** Exported text, source offset per code unit, format key per code unit. */
  O: string;
  M: number[];
  OK: string[];
  atomOf: Int32Array;
  atoms: BlockAtom[];
  /** Text read back, format key, TeX of equations, tracked insertion. */
  N: string;
  NK: string[];
  NT: (string | undefined)[];
  /** Canonical OMML hash of each equation read back. */
  NH: (string | undefined)[];
  /** Which characters read back are atom holders, when the file marks
   *  them (`ReadDocx.holders`). */
  NHeld?: boolean[];
  NTracked: boolean[];
  /** The note a reference typed in the editor calls: an id for it (the
   *  file's own number for the note) and its text as Markdown. */
  NNote: ({ id: string; text: string } | undefined)[];
  /** Definitions of the notes the block's edits add (`[^w3]: …`). */
  noteDefs?: string[];
  /** Positions in N where tracked-deleted text stood. */
  dels: number[];
  /** Fragment and offset in N where each fragment's text starts. */
  starts: Map<string, number>;
  /** Every fragment's bookmark is gone. */
  missing: boolean;
  /** Paragraph ordinals of the first and last fragments found. */
  startPara: number;
  endPara: number;
  range: [number, number];
}

function sameTarget(a: FragmentTarget, b: FragmentTarget): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Blocks in reading order (first appearance in the map). */
export function buildBlocks(fragments: readonly MapFragment[], read: ReadonlyMap<string, ReadFragment>, holders = false, newNotes?: ReadonlyMap<string, readonly ReadChar[]>): BlockView[] {
  const groups = new Map<string, MapFragment[]>();
  for (const f of fragments) {
    let g = groups.get(f.block);
    if (!g) groups.set(f.block, (g = []));
    g.push(f);
  }
  const out: BlockView[] = [];
  for (const [id, group] of groups) {
    group.sort((a, b) => a.part - b.part);
    // A block whose parts point at different targets is read per target.
    const runs: MapFragment[][] = [];
    for (const f of group) {
      const last = runs[runs.length - 1];
      if (last && sameTarget(last[0]!.target, f.target)) last.push(f);
      else runs.push([f]);
    }
    runs.forEach((run, k) => out.push(buildBlock(runs.length > 1 ? `${id}#${k}` : id, run, read, holders, newNotes)));
  }
  return out;
}

function buildBlock(id: string, frags: MapFragment[], read: ReadonlyMap<string, ReadFragment>, holders: boolean, newNotes?: ReadonlyMap<string, readonly ReadChar[]>): BlockView {
  let O = '';
  const M: number[] = [];
  const OK: string[] = [];
  const atoms: BlockAtom[] = [];
  let N = '';
  const NK: string[] = [];
  const NT: (string | undefined)[] = [];
  const NH: (string | undefined)[] = [];
  const NHeld: boolean[] = [];
  const NTracked: boolean[] = [];
  const NNote: ({ id: string; text: string } | undefined)[] = [];
  const dels: number[] = [];
  const starts = new Map<string, number>();
  let found = 0;
  let startPara = -1;
  let endPara = -1;
  let r0 = Infinity;
  let r1 = -Infinity;
  for (const f of frags) {
    const base = O.length;
    O += f.text;
    for (let i = 0; i < f.text.length; i++) M.push(f.map[i] ?? -1);
    const flags = new Array<string>(f.text.length).fill('');
    const hrefs = new Array<string | undefined>(f.text.length).fill(undefined);
    for (const fm of f.formats ?? []) {
      for (let i = Math.max(0, fm.start); i < Math.min(f.text.length, fm.end); i++) {
        flags[i] += fm.flags;
        if (fm.href) hrefs[i] = fm.href;
      }
    }
    for (let i = 0; i < f.text.length; i++) OK.push(makeKey(flags[i]!, hrefs[i]));
    for (const a of f.atoms ?? []) {
      let a1 = a.at + 1;
      while (a1 < f.text.length && f.map[a1] === a.start && a.start >= 0) a1++;
      atoms.push({ a0: base + a.at, a1: base + a1, start: a.start, end: a.end, kind: a.kind, ...(a.hash ? { hash: a.hash } : {}) });
    }
    r0 = Math.min(r0, f.range[0]);
    r1 = Math.max(r1, f.range[1]);
    const got = read.get(f.id);
    starts.set(f.id, N.length);
    if (!got || got.startPara < 0) continue;
    found++;
    if (startPara < 0) startPara = got.startPara;
    endPara = got.endPara >= 0 ? got.endPara : got.startPara;
    for (const d of got.dels) dels.push(N.length + Math.max(0, d));
    // A paragraph mark at either end is the fragment's own paragraph (a
    // bookmark that ends after its paragraph), not a split.
    let c0 = 0;
    let c1 = got.chars.length;
    while (c0 < c1 && got.chars[c0]!.ch === PARA_CHAR) c0++;
    while (c1 > c0 && got.chars[c1 - 1]!.ch === PARA_CHAR) c1--;
    for (const c of got.chars.slice(c0, c1)) {
      N += c.ch;
      NK.push(makeKey(c.flags, c.href));
      NT.push(c.tex);
      NH.push(c.mathHash);
      NHeld.push(c.holder === true);
      NTracked.push(!!c.tracked);
      const note = c.note ? newNotes?.get(c.note) : undefined;
      NNote.push(note ? { id: `w${c.note}`, text: markdownOf(note) } : undefined);
    }
  }
  const atomOf = new Int32Array(O.length).fill(-1);
  atoms.forEach((a, k) => {
    for (let i = a.a0; i < a.a1; i++) atomOf[i] = k;
  });
  return {
    id, target: frags[0]!.target, frags, O, M, OK, atomOf, atoms, N, NK, NT, NH, ...(holders ? { NHeld } : {}), NTracked, NNote, dels, starts,
    missing: found === 0, startPara, endPara, range: [r0, r1],
  };
}

/**
 * An engine line break stands for the space it replaced: the formatted
 * writer maps the break -1 and leaves the space between the lines out, so
 * a synthetic '\n' whose neighbours' sources are one whitespace apart is
 * given that whitespace's offset. Deleting across the break then takes the
 * space along (no double space), and deleting the break alone joins the
 * words, as Word shows them.
 */
export function withLineSpaces(v: BlockView, base: string): void {
  const after = (i: number): number => (v.atomOf[i]! >= 0 ? v.atoms[v.atomOf[i]!]!.end : v.M[i]! + 1);
  const before = (i: number): number => (v.atomOf[i]! >= 0 ? v.atoms[v.atomOf[i]!]!.start : v.M[i]!);
  let prev = -1;
  for (let i = 0; i < v.O.length; i++) {
    if (v.M[i]! >= 0 || v.atomOf[i]! >= 0) {
      prev = i;
      continue;
    }
    if (v.O[i] !== '\n' || prev < 0) continue;
    let next = i + 1;
    while (next < v.O.length && v.M[next]! < 0 && v.atomOf[next]! < 0) next++;
    if (next >= v.O.length) break;
    const gap = after(prev);
    if (before(next) === gap + 1 && /\s/.test(base[gap] ?? '')) {
      v.M[i] = gap;
      prev = i;
    }
  }
}
