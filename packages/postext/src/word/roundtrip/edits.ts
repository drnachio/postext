// A block's character diff turned into source edits. Equal characters keep
// their source; a changed hunk deletes the source of its mapped characters
// (markup between them goes only when it pairs up inside the deletion) and
// inserts the new text where the neighbouring character's markup wants it.
// Atoms change whole; synthetic characters (engine line breaks, added
// hyphens, generated numbers) are no edit by themselves.

import type { FragmentTarget } from '../anchors/types.js';
import { diffText, type Hunk } from './diff.js';
import type { BlockView } from './blocks.js';
import { escapeTyped, markupDeletable, splitKey, widenOverDelimiters, wrapFlags } from './markup.js';
import { mathUnchanged, mathSource } from './math.js';
import { OBJECT_CHAR, PARA_CHAR } from './walk.js';

export interface SourceEdit {
  target: FragmentTarget;
  /** Range in the export-time text of the target. */
  start: number;
  end: number;
  text: string;
  kind: 'text' | 'format' | 'paragraph' | 'tracked';
  /** Not applied, and why. */
  reject?: string;
  /** For a rejected edit to text without a source: what Word holds. */
  before?: string;
}

const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch) && ch !== PARA_CHAR;

/** Hunks of the block, atoms widened to whole atoms and changed equations
 *  added, merged where they meet. */
export function blockHunks(v: BlockView, base: string): Hunk[] {
  // A paragraph mark the writer put between two engine lines (the
  // formatted writer starts a new paragraph where the alignment changes)
  // reads back as a paragraph break where the map has a line break: the
  // same break, not a paragraph the user made.
  const raw = slideOffAtoms(v, diffText(v.O, v.N).filter((h) => !(h.a1 - h.a0 === h.b1 - h.b0 && h.a1 > h.a0 && sameBreaks(v, base, h))));
  // Equations in equal text whose TeX Word changed.
  const eq = equalPairs(v, raw);
  const extra: Hunk[] = [];
  for (const a of v.atoms) {
    if (a.a1 - a.a0 !== 1 || v.O[a.a0] !== OBJECT_CHAR) continue;
    const j = eq.get(a.a0);
    if (j === undefined) continue;
    const tex = v.NT[j];
    // The OMML the writer emitted, untouched (Word only rewrote its
    // attributes and run properties): keep the source as it is.
    if (a.hash !== undefined && v.NH[j] === a.hash) continue;
    if (tex !== undefined && !mathUnchanged(base.slice(a.start, a.end), tex)) extra.push({ a0: a.a0, a1: a.a1, b0: j, b1: j + 1 });
  }
  const all = [...raw, ...extra].sort((x, y) => x.a0 - y.a0 || x.a1 - y.a1);
  // Widen over atoms the hunk touches (an insertion strictly inside one
  // too), and over the words it changes, so a replaced word is one edit
  // ("negro" → "blanco", not "bla" + "egr" → "c"). A word here is a run of
  // letters whose source is contiguous: markup inside it bounds it, so a
  // typo fixed in half a bold word stays inside its markup. Then merge
  // what meets; the b side of a group comes from its outermost hunks
  // (outside the hunks the texts are equal).
  const spans = [...v.atoms, ...wordSpans(v)];
  const groups: { a0: number; a1: number; first: Hunk; last: Hunk }[] = [];
  for (const h of all) {
    let a0 = h.a0;
    let a1 = h.a1;
    for (const at of spans) {
      const touches = h.a0 === h.a1 ? h.a0 > at.a0 && h.a0 < at.a1 : h.a0 < at.a1 && at.a0 < h.a1;
      if (touches) {
        a0 = Math.min(a0, at.a0);
        a1 = Math.max(a1, at.a1);
      }
    }
    // Never cut a surrogate pair (😀 → 😃 differ in the low half only).
    if (splitsPair(v.O, a0)) a0--;
    if (splitsPair(v.O, a1)) a1++;
    const g = groups[groups.length - 1];
    if (g && a0 <= g.a1) {
      g.a0 = Math.min(g.a0, a0);
      if (h.a1 > g.last.a1 || (h.a1 === g.last.a1 && h.b1 > g.last.b1)) g.last = h;
      if (h.a0 < g.first.a0) g.first = h;
      g.a1 = Math.max(g.a1, a1);
    } else groups.push({ a0, a1, first: h, last: h });
  }
  return groups.map((g) => ({ a0: g.a0, a1: g.a1, b0: g.first.b0 - (g.first.a0 - g.a0), b1: g.last.b1 + (g.a1 - g.last.a1) }));
}

/** Hunks that take characters of an atom moved, where the diff allows it,
 *  onto the equal source characters beside it. An atom's holder can be the
 *  very character the source has next to it (U+00A0 holds an equation's
 *  room, and a typed no-break space is U+00A0 too): the diff may pair the
 *  holder with the source character and delete the holder, and widening
 *  would then delete the whole atom. A hunk slides one step when the
 *  character it lets go equals the one it takes on the other side, so the
 *  text it makes stays the same. */
export function slideOffAtoms(v: BlockView, hunks: Hunk[]): Hunk[] {
  const onAtom = (a0: number, a1: number): boolean => {
    for (let i = a0; i < a1; i++) if (v.atomOf[i]! >= 0) return true;
    return false;
  };
  // A character the hunk may take: plain source text, not an atom's.
  const plain = (i: number): boolean => v.M[i]! >= 0 && v.atomOf[i]! < 0;
  const out = hunks.map((h) => ({ ...h }));
  out.forEach((h, k) => {
    if (h.a1 === h.a0 || !onAtom(h.a0, h.a1)) return;
    const lo = k > 0 ? out[k - 1]! : { a1: 0, b1: 0 };
    const hi = k + 1 < out.length ? out[k + 1]! : { a0: v.O.length, b0: v.N.length };
    // Leftwards: O[a0 - 1] joins the hunk, O[a1 - 1] pairs with N[b1 - 1].
    for (let d = 1; d <= h.a1 - h.a0; d++) {
      const i = h.a0 - d;
      if (i < lo.a1 || h.b0 - d < lo.b1 || !plain(i) || v.O[h.a1 - d] !== v.N[h.b1 - d]) break;
      if (!onAtom(i, h.a1 - d)) return Object.assign(h, { a0: i, a1: h.a1 - d, b0: h.b0 - d, b1: h.b1 - d });
    }
    // Rightwards: O[a1] joins the hunk, O[a0] pairs with N[b0].
    for (let d = 1; d <= h.a1 - h.a0; d++) {
      const i = h.a1 + d - 1;
      if (i >= hi.a0 || h.b1 + d > hi.b0 || !plain(i) || v.O[h.a0 + d - 1] !== v.N[h.b0 + d - 1]) break;
      if (!onAtom(h.a0 + d, i + 1)) return Object.assign(h, { a0: h.a0 + d, a1: i + 1, b0: h.b0 + d, b1: h.b1 + d });
    }
  });
  return out;
}

/** Whether the hunk only turns engine line breaks (synthetic, or standing
 *  for the space they replace) into paragraph marks or spaces. */
function sameBreaks(v: BlockView, base: string, h: Hunk): boolean {
  for (let k = 0; k < h.a1 - h.a0; k++) {
    const m = v.M[h.a0 + k]!;
    const n = v.N[h.b0 + k];
    if (v.O[h.a0 + k] !== '\n') return false;
    // A synthetic break turned into a paragraph mark; one standing for a
    // space turned into a paragraph mark or back into a space.
    if (m < 0 ? n !== PARA_CHAR : !isSpace(base[m]) || (n !== PARA_CHAR && n !== ' ')) return false;
  }
  return true;
}

/** Whether offset `i` falls between the two halves of a surrogate pair. */
const splitsPair = (s: string, i: number): boolean =>
  i > 0 && i < s.length && /[\uD800-\uDBFF]/.test(s[i - 1]!) && /[\uDC00-\uDFFF]/.test(s[i]!);

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}\p{M}]/u.test(ch);

/** Runs of letters with contiguous source offsets. */
function wordSpans(v: BlockView): { a0: number; a1: number }[] {
  const out: { a0: number; a1: number }[] = [];
  let start = -1;
  for (let i = 0; i <= v.O.length; i++) {
    const ok = i < v.O.length && isWordChar(v.O[i]) && v.M[i]! >= 0 && v.atomOf[i]! < 0;
    const joins = ok && start >= 0 && v.M[i] === v.M[i - 1]! + 1;
    if (joins) continue;
    if (start >= 0 && i - start > 1) out.push({ a0: start, a1: i });
    start = ok ? i : -1;
  }
  return out;
}

/** Equal characters: index in O → index in N. */
export function equalPairs(v: BlockView, hunks: readonly Hunk[]): Map<number, number> {
  const out = new Map<number, number>();
  let a = 0;
  let b = 0;
  const run = (to: number): void => {
    for (; a < to; a++, b++) out.set(a, b);
  };
  for (const h of hunks) {
    run(h.a0);
    a = h.a1;
    b = h.b1;
  }
  run(v.O.length);
  return out;
}

/** What a paragraph break typed in this block writes: a blank line, or a
 *  new item of the same list. */
function paragraphBreak(v: BlockView, base: string): string {
  const head = base.slice(v.range[0], v.range[0] + 40);
  const m = /^([ \t]*)(?:([-*+])|(\d+)([.)]))[ \t]+/.exec(head);
  if (m) return `\n${m[1]}${m[2] ?? `${Number(m[3]) + 1}${m[4]}`} `;
  if (/^[ \t]*>/.test(head)) return '\n>\n> ';
  return '\n\n';
}

function sourceAfter(v: BlockView, i: number): number {
  const at = v.atomOf[i]!;
  return at >= 0 ? v.atoms[at]!.end : v.M[i]! + 1;
}

function sourceBefore(v: BlockView, i: number): number {
  const at = v.atomOf[i]!;
  return at >= 0 ? v.atoms[at]!.start : v.M[i]!;
}

/** The text a hunk inserts, as Markdown: typed text escaped, equations as
 *  `$…$`, line and paragraph breaks, formatting the context lacks. */
function insertText(v: BlockView, base: string, h: Hunk, contextKey: string, display = false): string {
  // Line breaks and hyphens the engine added and the hunk drops come back
  // as nothing (the text reflowed), not as real breaks.
  let newlines = 0;
  let hyphens = 0;
  for (let i = h.a0; i < h.a1; i++) {
    if (v.M[i] !== -1) continue;
    if (v.O[i] === '\n') newlines++;
    else if (v.O[i] === '-' || v.O[i] === '‐') hyphens++;
  }
  const ctx = splitKey(contextKey);
  let out = '';
  let run = '';
  let runKey: string | undefined;
  const flush = (): void => {
    if (!run) return;
    const k = splitKey(runKey ?? '');
    let added = '';
    for (const l of k.flags) if (!ctx.flags.includes(l)) added += l;
    const href = k.href && k.href !== ctx.href ? k.href : undefined;
    const lead = /^\s*/.exec(run)![0];
    const trail = /\s*$/.exec(run.slice(lead.length))![0];
    const core = run.slice(lead.length, run.length - trail.length);
    out += added || href ? lead + (core ? wrapFlags(core, added, href) : '') + trail : run;
    run = '';
  };
  for (let j = h.b0; j < h.b1; j++) {
    const ch = v.N[j]!;
    let piece: string;
    let plain = true;
    if (ch === PARA_CHAR) {
      piece = paragraphBreak(v, base);
      plain = false;
    } else if (ch === '\n') {
      if (newlines > 0) {
        newlines--;
        continue;
      }
      piece = '\\\n';
      plain = false;
    } else if ((ch === '-' || ch === '‐') && hyphens > 0) {
      hyphens--;
      continue;
    } else if (ch === OBJECT_CHAR) {
      const tex = v.NT[j];
      if (tex === undefined) continue;
      piece = mathSource(tex, display);
      plain = false;
    } else piece = escapeTyped(ch);
    if (!plain) {
      flush();
      out += piece;
      continue;
    }
    if (runKey !== v.NK[j]) {
      flush();
      runKey = v.NK[j];
    }
    run += piece;
  }
  flush();
  return out;
}

function hunkKind(v: BlockView, h: Hunk): SourceEdit['kind'] {
  for (let j = h.b0; j < h.b1; j++) if (v.NTracked[j]) return 'tracked';
  if (v.dels.some((d) => d >= h.b0 && d <= h.b1)) return 'tracked';
  for (let j = h.b0; j < h.b1; j++) if (v.N[j] === PARA_CHAR) return 'paragraph';
  return 'text';
}

/** Source ranges of the characters a hunk deletes, joined where the markup
 *  between them may go too. */
function deletedRanges(v: BlockView, base: string, h: Hunk): [number, number][] {
  const units: [number, number][] = [];
  const seen = new Set<number>();
  for (let i = h.a0; i < h.a1; i++) {
    const at = v.atomOf[i]!;
    if (at >= 0) {
      if (!seen.has(at)) units.push([v.atoms[at]!.start, v.atoms[at]!.end]);
      seen.add(at);
      continue;
    }
    if (v.M[i]! < 0) continue;
    let e = v.M[i]! + 1;
    // A space stands for a run of source whitespace (a line end and the
    // next line's indent): it goes whole.
    if (isSpace(v.O[i])) {
      let limit = v.range[1];
      for (let j = i + 1; j < v.O.length; j++) if (v.M[j]! >= 0) { limit = v.M[j]!; break; }
      while (e < limit && /[ \t\r\n]/.test(base[e]!)) e++;
    }
    units.push([v.M[i]!, e]);
  }
  if (!units.length) return [];
  units.sort((x, y) => x[0] - y[0]);
  const joined: [number, number][] = [[...units[0]!]];
  for (const u of units.slice(1)) {
    const last = joined[joined.length - 1]!;
    if (u[0] <= last[1]) last[1] = Math.max(last[1], u[1]);
    else joined.push([...u]);
  }
  const gaps: string[] = [];
  for (let k = 1; k < joined.length; k++) gaps.push(base.slice(joined[k - 1]![1], joined[k]![0]));
  if (markupDeletable(gaps)) return [[joined[0]![0], joined[joined.length - 1]![1]]];
  // Keep the markup: join only across whitespace.
  const out: [number, number][] = [[...joined[0]!]];
  for (let k = 1; k < joined.length; k++) {
    const last = out[out.length - 1]!;
    if (/^\s*$/.test(gaps[k - 1]!)) last[1] = joined[k]![1];
    else out.push([...joined[k]!]);
  }
  return out;
}

/** Where a pure insertion lands in the source, and the format key of the
 *  character whose markup it joins. */
function insertionPoint(v: BlockView, base: string, h: Hunk): { pos: number; key: string } {
  let prev = -1;
  for (let i = h.a0 - 1; i >= 0; i--) if (v.M[i]! >= 0 || v.atomOf[i]! >= 0) { prev = i; break; }
  let next = -1;
  for (let i = h.a1; i < v.O.length; i++) if (v.M[i]! >= 0 || v.atomOf[i]! >= 0) { next = i; break; }
  const first = v.N[h.b0];
  const last = v.N[h.b1 - 1];
  if (first === PARA_CHAR && next < 0) return { pos: v.range[1], key: '' };
  if (last === PARA_CHAR && prev < 0) return { pos: v.range[0], key: '' };
  if (prev < 0 && next < 0) return { pos: v.range[0], key: '' };
  if (prev < 0) return { pos: sourceBefore(v, next), key: v.OK[next]! };
  if (next < 0) return { pos: sourceAfter(v, prev), key: v.OK[prev]! };
  const after = sourceAfter(v, prev);
  const before = sourceBefore(v, next);
  const key = v.NK[h.b0] ?? '';
  const between = base.slice(after, before);
  if (/^\s*$/.test(between)) {
    // Only whitespace between: after a word, or before the next one when
    // the previous character is the space itself.
    return isSpace(v.O[prev]) ? { pos: before, key: v.OK[next]! } : { pos: after, key: v.OK[prev]! };
  }
  if (v.OK[prev] === key && v.OK[next] !== key) return { pos: after, key: v.OK[prev]! };
  if (v.OK[next] === key && v.OK[prev] !== key) return { pos: before, key: v.OK[next]! };
  return isSpace(v.O[prev]) ? { pos: before, key: v.OK[next]! } : { pos: after, key: v.OK[prev]! };
}

/** Synthetic characters that are reflow (engine line breaks, added or
 *  repeated hyphens, kashida, the space at a break): Word may drop them. */
const REFLOW_RE = /^[\s\-\u2010\u00AD\u0640]$/;

/** A synthetic character that is generated content (a number, a label). */
const isGenerated = (v: BlockView, i: number): boolean => i >= 0 && i < v.O.length && v.M[i] === -1 && v.atomOf[i]! < 0 && !REFLOW_RE.test(v.O[i]!);

/** Whether a hunk changes generated text (or types inside it). */
function touchesGenerated(v: BlockView, h: Hunk): boolean {
  if (h.a0 === h.a1) return isGenerated(v, h.a0 - 1) && isGenerated(v, h.a0);
  for (let i = h.a0; i < h.a1; i++) if (isGenerated(v, i)) return true;
  // A printed label ("Fig. 1.1", a note number) retyped: the engine writes
  // it, so only deleting it whole changes the source.
  return h.b1 > h.b0 && v.atoms.some((a) => LABEL_ATOMS.has(a.kind) && a.a0 < h.a1 && h.a0 < a.a1);
}

/** Atoms whose printed text the engine generates from the construct. */
const LABEL_ATOMS = new Set(['ref', 'footnote']);

/** Source edits for one changed hunk. */
export function hunkEdits(v: BlockView, base: string, h: Hunk): SourceEdit[] {
  const kind = hunkKind(v, h);
  if (touchesGenerated(v, h)) {
    // Generated text has no source to change: report it, apply nothing.
    const { pos } = insertionPoint(v, base, h);
    return [{ target: v.target, start: pos, end: pos, text: v.N.slice(h.b0, h.b1), kind, reject: 'generated', before: v.O.slice(h.a0, h.a1) }];
  }
  const ranges = deletedRanges(v, base, h);
  if (!ranges.length) {
    const { pos, key } = insertionPoint(v, base, h);
    const text = insertText(v, base, h, key);
    if (!text) return [];
    let s = pos;
    let e = pos;
    // A paragraph break leaves no trailing or leading spaces behind.
    if (/^\n/.test(text)) while (s > 0 && (base[s - 1] === ' ' || base[s - 1] === '\t')) s--;
    if (/\n$/.test(text) || /\n\n$/.test(text)) while (base[e] === ' ' || base[e] === '\t') e++;
    return [{ target: v.target, start: s, end: e, text, kind }];
  }
  let firstMapped = -1;
  for (let i = h.a0; i < h.a1; i++) if (v.M[i]! >= 0 || v.atomOf[i]! >= 0) { firstMapped = i; break; }
  const display = base.startsWith('$$', ranges[0]![0]);
  const text = insertText(v, base, h, v.OK[firstMapped] ?? '', display);
  if (!text && ranges.length === 1) ranges[0] = widenOverDelimiters(base, ranges[0]![0], ranges[0]![1]);
  return ranges.map(([s, e], k) => ({ target: v.target, start: s, end: e, text: k === 0 ? text : '', kind }));
}
