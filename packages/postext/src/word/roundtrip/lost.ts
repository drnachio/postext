// Fragments whose bookmark an editor took away while their text was
// replaced (#1458). Google Docs removes a bookmark, start and end, when
// the whole text it holds is replaced (Find and replace over a whole
// heading, table cell, caption, note or box title); Word can do the same
// to a paragraph typed over. The paragraph, cell or note stays where it
// was, with the new text. So text that stands outside every bookmark in
// the very place a fragment without bookmark had is that fragment, with
// new text: the bookmark is put back around it before the text is given
// out to the fragments, and the fragment is then read like any other (a
// heading stays a heading, a cell its cell, a note its note).
//
// The place is told by the neighbours: the fragments are written in
// reading order, so the ones without bookmark between two that kept
// theirs had their text between those two. They pair with the unmarked
// paragraphs that stand there, in order, only when there are as many of
// one as of the other and each paragraph can be its fragment (a note in
// a note, a cell in its table, a paragraph styled like the others of its
// kind). Otherwise nothing is put back: the fragments read as deleted
// and the paragraphs as typed in, as before, and `unpaired` names them.

import type { ExportMap, MapFragment } from '../anchors/types.js';
import { counterOf, looseText } from './align.js';
import { LOOK_HIDDEN } from './looks.js';
import { furnitureKey } from './selfRead.js';
import type { Token } from './walk.js';

export interface LostOptions {
  /** Fragments the file never held a bookmark for (text the book gained
   *  since the export, text the writer hid and the editor dropped). */
  absent?: ReadonlySet<string>;
  /** Bookmarks of the file that stand for nothing in the map. */
  foreign?: ReadonlySet<string>;
  /** The paragraphs the writer set outside every fragment (`selfRead`). */
  furniture?: ReadonlyMap<string, number>;
  /** The containers that are notes of the file. */
  noteBoxes?: ReadonlySet<number>;
}

type Start = Extract<Token, { t: 'bmStart' }>;
type Para = Extract<Token, { t: 'para' }>;

/** Unmarked text that may be a fragment's: a whole paragraph, or what
 *  follows a generated fragment (a caption's number) to its paragraph's
 *  end. */
interface Candidate {
  /** Token range of its text, blanks at either end left out. */
  first: number;
  last: number;
  text: string;
  mark: Para;
  /** The generated fragment it follows in its paragraph. */
  tailOf?: string;
}

interface ParaState {
  /** Loose characters of the paragraph since its last bookmark token. */
  loose: number[];
  marked: boolean;
  /** The fragment whose bookmark closed last in the paragraph. */
  closed?: string;
}

const HEAD = 24;

/** The fragments whose bookmark stands in the file, with where it opens
 *  and closes, and the unmarked text that may stand for the others. */
function survey(tokens: readonly Token[], known: ReadonlySet<string>, generated: ReadonlySet<string>): { where: Map<string, [number, number]>; starts: Map<string, Start>; candidates: Candidate[]; boxes: Set<number> } {
  const where = new Map<string, [number, number]>();
  const starts = new Map<string, Start>();
  const boxes = new Set<number>();
  const candidates: Candidate[] = [];
  const open: { wid: string; fid: string }[] = [];
  const paras = new Map<number, ParaState>();
  const state = (para: number): ParaState => {
    let p = paras.get(para);
    if (!p) paras.set(para, (p = { loose: [], marked: false }));
    return p;
  };
  // As `assign` takes them: a renamed bookmark only when no bookmark
  // keeps the fragment's own name, and the first such one.
  const named = new Set<string>();
  for (const t of tokens) if (t.t === 'bmStart' && !t.renamed) named.add(t.fid);
  tokens.forEach((tok, k) => {
    if (tok.t === 'bmStart') {
      if (!known.has(tok.fid)) return;
      if (tok.renamed) {
        if (named.has(tok.fid)) return;
        named.add(tok.fid);
      }
      open.push({ wid: tok.wid, fid: tok.fid });
      boxes.add(tok.box);
      if (!where.has(tok.fid)) {
        where.set(tok.fid, [k, k]);
        starts.set(tok.fid, tok);
      }
      const p = state(tok.para);
      p.marked = true;
      p.loose = [];
    } else if (tok.t === 'bmEnd') {
      const at = open.findIndex((o) => o.wid === tok.wid);
      if (at < 0) return;
      const [o] = open.splice(at, 1);
      where.get(o!.fid)![1] = k;
      const p = state(tok.para);
      p.marked = true;
      p.loose = [];
      p.closed = o!.fid;
    } else if (tok.t === 'char') {
      const p = state(tok.para);
      if (open.length) p.marked = true;
      else p.loose.push(k);
    } else if (tok.t === 'para') {
      const p = paras.get(tok.para);
      paras.delete(tok.para);
      if (!p || open.length) return;
      const shown = p.loose.filter((i) => {
        const c = tokens[i] as Extract<Token, { t: 'char' }>;
        return c.ch.trim() !== '' || c.tex !== undefined;
      });
      if (!shown.length) return;
      // After a bookmark of the paragraph, only what follows a generated
      // fragment: text typed after the book's own joins that text.
      if (p.marked && !(p.closed !== undefined && generated.has(p.closed))) return;
      const first = shown[0]!;
      const last = shown[shown.length - 1]!;
      // Nothing of another paragraph (a text box anchored there) inside.
      for (let i = first; i <= last; i++) {
        const t = tokens[i]!;
        if (t.t === 'para' || (t.t === 'char' && t.para !== tok.para)) return;
      }
      const text = p.loose.map((i) => (tokens[i] as { ch: string }).ch).join('');
      candidates.push({ first, last, text, mark: tok, ...(p.marked ? { tailOf: p.closed! } : {}) });
    }
  });
  return { where, starts, candidates, boxes };
}

/**
 * Put back the bookmarks of the fragments that lost theirs to a text
 * replaced whole. Returns the tokens with the bookmarks in (the same
 * array when there was nothing to put back), the fragments it put them
 * back for, and the ones that could not be told from text typed beside
 * them.
 */
export function restoreLost(tokens: Token[], map: ExportMap, options: LostOptions = {}): { tokens: Token[]; put: string[]; unpaired: Set<string> } {
  const unpaired = new Set<string>();
  const known = new Set(map.fragments.map((f) => f.id));
  for (const id of options.foreign ?? []) known.add(id);
  const generated = new Set(map.fragments.filter((f) => f.target.kind === 'generated').map((f) => f.id));
  const { where, starts, candidates: all, boxes } = survey(tokens, known, generated);
  // A fragment without text and without bookmark says nothing.
  const order = map.fragments.filter((f) => !options.absent?.has(f.id) && (where.has(f.id) || f.text.trim() !== ''));
  if (order.every((f) => where.has(f.id)) || !all.length) return { tokens, put: [], unpaired };

  const inNote = (c: Candidate): boolean => options.noteBoxes?.has(c.mark.box) === true;
  // Text in a container without any bookmark is decoration (a folio, a
  // list marker), a note's apart; the paragraphs the writer set outside
  // the fragments are the writer's.
  const furniture = new Map(options.furniture ?? []);
  const candidates = all.filter((c) => {
    if (!boxes.has(c.mark.box) && !inNote(c)) return false;
    if (c.tailOf !== undefined) return true;
    const key = furnitureKey(c.text);
    const n = furniture.get(key) ?? 0;
    if (n > 0) furniture.set(key, n - 1);
    return n <= 0;
  });

  // What the fragments that kept their bookmark say about their kind: the
  // paragraph styles of a role, the table of a resource's cells.
  const styleAt = new Map<number, string>();
  for (const t of tokens) if (t.t === 'para') styleAt.set(t.para, t.props?.style ?? '');
  const styles = new Map<string, Set<string>>();
  const tables = new Map<string, number>();
  for (const f of map.fragments) {
    const s = starts.get(f.id);
    if (!s) continue;
    let own = styles.get(f.role ?? '');
    if (!own) styles.set(f.role ?? '', (own = new Set()));
    own.add(styleAt.get(s.para) ?? '');
    if (f.target.kind === 'resource' && f.target.field === 'cell' && s.tbl !== undefined) tables.set(f.target.resourceId, s.tbl);
  }
  const fits = (f: MapFragment, c: Candidate): boolean => {
    const note = f.role === 'footnote';
    if (inNote(c) ? !note : note && (options.noteBoxes?.size ?? 0) > 0) return false;
    if (f.target.kind === 'resource' && f.target.field === 'cell') {
      const table = tables.get(f.target.resourceId);
      if (c.mark.tbl === undefined || (table !== undefined && table !== c.mark.tbl)) return false;
    }
    const own = styles.get(f.role ?? '');
    return !own || own.has(c.mark.props?.style ?? '');
  };

  const put: { f: MapFragment; c: Candidate }[] = [];
  for (let k = 0; k < order.length; ) {
    if (where.has(order[k]!.id)) {
      k++;
      continue;
    }
    let e = k;
    while (e < order.length && !where.has(order[e]!.id)) e++;
    let run = order.slice(k, e);
    const before = order[k - 1];
    const after = order[e];
    k = e;
    const lo = before ? where.get(before.id)![1] : -1;
    const hi = after ? where.get(after.id)![0] : tokens.length;
    if (lo > hi) continue;
    let there = candidates.filter((c) => c.first > lo && c.last < hi);
    // What follows a generated fragment to its paragraph's end stood in
    // the fragment written right after it (a caption after its number).
    const tail = there[0];
    if (before && tail?.tailOf === before.id && fits(run[0]!, tail)) {
      put.push({ f: run[0]!, c: tail });
      run = run.slice(1);
    }
    there = there.filter((c) => c.tailOf === undefined);
    // The first half of the next fragment's paragraph, split in an editor
    // that moved the bookmark to the second half (`rejoinSplits`).
    const half = there[there.length - 1];
    if (after && half) {
      const typed = looseText(half.text).slice(0, HEAD);
      if (typed.length >= 4 && looseText(after.text).startsWith(typed)) there.pop();
    }
    if (!run.length || !there.length) continue;
    if (run.length === there.length && run.every((f, i) => fits(f, there[i]!))) run.forEach((f, i) => put.push({ f, c: there[i]! }));
    else for (const f of run) unpaired.add(f.id);
  }
  if (!put.length) return { tokens, put: [], unpaired };

  const opens = new Map<number, Token>();
  const closes = new Map<number, Token>();
  for (const { f, c } of put) {
    const { para, depth, box, tbl } = c.mark;
    const wid = `lost:${f.id}`;
    opens.set(c.first, { t: 'bmStart', wid, fid: f.id, para, depth, box, ...(tbl !== undefined ? { tbl } : {}) });
    closes.set(c.last, { t: 'bmEnd', wid, para });
  }
  const out: Token[] = [];
  tokens.forEach((tok, k) => {
    const o = opens.get(k);
    if (o) out.push(o);
    out.push(tok);
    const c = closes.get(k);
    if (c) out.push(c);
  });
  return { tokens: out, put: put.map((p) => p.f.id), unpaired };
}

/** The fragments of a map written again from the book that the file
 *  never held a bookmark for: the passages the book gained since the
 *  export, and the ones the writer hid (an editor that keeps no hidden
 *  text drops them, bookmark and all). */
export function neverMarked(rebuilt: { unplaced: ReadonlySet<string>; looks: ReadonlyMap<string, readonly string[]> }): Set<string> {
  const out = new Set(rebuilt.unplaced);
  for (const [id, looks] of rebuilt.looks) if (looks.length > 0 && looks.every((l) => l.includes(LOOK_HIDDEN))) out.add(id);
  return out;
}

/** The name `setApart` gives the text it sets apart. */
export const APART = '~';

/**
 * For a file read without a map, by its bookmarks' names alone: the text
 * that follows a bookmark to its paragraph's end, where the file lacks
 * the next name (the caption after its number, replaced whole), is set
 * apart under `APART`. It is the text of the fragment that lost its
 * bookmark, and read as the bookmark's own it would keep the two from
 * being matched with the book's.
 */
export function setApart(tokens: readonly Token[], names: ReadonlySet<string>): Token[] {
  const out: Token[] = [];
  const open = new Set<string>();
  const fids = new Map<string, string>();
  let after: { para: number; wid?: string } | undefined;
  let n = 0;
  const close = (): void => {
    if (after?.wid !== undefined) out.push({ t: 'bmEnd', wid: after.wid, para: after.para });
    after = undefined;
  };
  for (const tok of tokens) {
    if (tok.t === 'bmStart') {
      close();
      open.add(tok.wid);
      fids.set(tok.wid, tok.fid);
    } else if (tok.t === 'bmEnd' && open.delete(tok.wid)) {
      close();
      const next = counterOf(fids.get(tok.wid) ?? '') + 1;
      if (!open.size && next > 0 && !names.has(next.toString(36))) after = { para: tok.para };
    } else if (tok.t === 'para' && after?.para === tok.para) close();
    else if (tok.t === 'char' && after && !open.size && tok.para === after.para && after.wid === undefined) {
      after.wid = `${APART}${n++}`;
      out.push({ t: 'bmStart', wid: after.wid, fid: APART, para: tok.para, depth: 1, box: -1 });
    }
    out.push(tok);
  }
  return out;
}
