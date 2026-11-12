// A citation corrected in Word (#1516). The processor prints a citation
// from the bibliography, but the parts the author wrote in the brackets
// (`[see @simmons1991, 346–47, emphasis added]`: the prefix, the locator,
// the suffix) are the author's text: an edit that falls inside one of them
// goes back into the citation's source. A part printed otherwise than it
// is written (`346--47` printed `346–47`, a suffix in emphasis) cannot take
// the edit, which is listed for review with the part's source range; an
// edit to the text the bibliography writes (the author's name, the title,
// "Ibid.") is reported as such.

import { affixSpans, extractInlineCitations } from '../../parse/citations.js';
import type { BlockAtom, BlockView } from './blocks.js';
import { diffText, type Hunk } from './diff.js';
import type { SourceEdit } from './edits.js';
import { OBJECT_CHAR, PARA_CHAR } from './walk.js';

/** Atoms whose text the citation processor prints. */
export const CITATION_ATOMS: ReadonlySet<string> = new Set(['citation', 'citation-note']);

/** A part of a citation the author wrote: where it is in the citation's
 *  source, as written there and as printed. */
interface CitationPart {
  key: string;
  kind: 'prefix' | 'locator' | 'suffix';
  at: number;
  written: string;
  shown: string;
}

/** The plain text a prefix or suffix prints (its Markdown emphasis read). */
const printed = (text: string): string => affixSpans(text).map((s) => s.text).join('');

/** Where the key `@id` (or `-@id`) stands in `part` from `from`: at its
 *  start or after a space or an opening bracket. */
function keyAt(part: string, id: string, from = 0): number {
  for (let i = part.indexOf(`@${id}`, from); i >= 0; i = part.indexOf(`@${id}`, i + 1)) {
    const before = part[i - 1];
    const next = part[i + 1 + id.length];
    if (next !== undefined && /[\p{L}\p{N}_]/u.test(next)) continue;
    if (before === undefined || before === '-' || /[\s[(]/.test(before)) return i;
  }
  return -1;
}

/** The ids and the author's parts of the citation written `raw` (one
 *  citation, as the parser reads it), or undefined when it reads as
 *  something else. */
export function citationParts(raw: string): { keys: string[]; parts: CitationPart[] } | undefined {
  const found = extractInlineCitations(raw, 0).citations;
  if (found.length !== 1 || found[0]!.raw !== raw) return undefined;
  const items = found[0]!.cluster.items;
  const bracketed = raw.startsWith('[');
  // The parts of a bracketed citation, each with its offset in `raw`.
  const pieces: { text: string; at: number }[] = [];
  if (bracketed) {
    let at = 1;
    for (const text of raw.slice(1, -1).split(';')) {
      pieces.push({ text, at });
      at += text.length + 1;
    }
  } else pieces.push({ text: raw, at: 0 });
  if (pieces.length !== items.length) return undefined;
  const parts: CitationPart[] = [];
  items.forEach((item, k) => {
    const { text, at } = pieces[k]!;
    const key = keyAt(text, item.id);
    if (key < 0) return;
    if (item.prefix) {
      const p = text.lastIndexOf(item.prefix, key);
      if (p >= 0) parts.push({ key: item.id, kind: 'prefix', at: at + p, written: item.prefix, shown: printed(item.prefix) });
    }
    let from = key + 1 + item.id.length;
    if (item.locator) {
      // Written as printed, or with the `--` the parser reads as a dash.
      let p = text.indexOf(item.locator, from);
      let written = item.locator;
      if (p < 0) {
        written = item.locator.replace(/–/g, '--');
        p = text.indexOf(written, from);
      }
      if (p >= 0) {
        parts.push({ key: item.id, kind: 'locator', at: at + p, written, shown: item.locator });
        from = p + written.length;
      }
    }
    const suffix = item.suffix?.replace(/^,\s*/, '');
    if (suffix) {
      const p = text.indexOf(suffix, from);
      if (p >= 0) parts.push({ key: item.id, kind: 'suffix', at: at + p, written: suffix, shown: printed(suffix) });
    }
  });
  return { keys: items.map((it) => it.id), parts };
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Where `part` stands in the printed citation, when it stands there once
 *  as a whole (its first letter may have been capitalised). */
function placeIn(printedText: string, part: string): number | undefined {
  if (!part) return undefined;
  const fold = (s: string): string => s.slice(0, 1).toLowerCase() + s.slice(1);
  let hit: number | undefined;
  for (let i = 0; i + part.length <= printedText.length; i++) {
    if (fold(printedText.slice(i, i + part.length)) !== fold(part)) continue;
    const before = printedText[i - 1];
    const after = printedText[i + part.length];
    if ((before !== undefined && WORD_CHAR.test(before) && WORD_CHAR.test(part[0]!)) || (after !== undefined && WORD_CHAR.test(after) && WORD_CHAR.test(part[part.length - 1]!))) continue;
    if (hit !== undefined) return undefined;
    hit = i;
  }
  return hit;
}

/** Characters typed into a part that would change how the citation reads. */
const SYNTAX = /[[\]@;\\*_`^~]/;

/** The printed citation an atom stands for in the exported text: from its
 *  first character over the synthetic ones after it (the block's atom
 *  covers the first alone; the processor's text follows it, mapped to no
 *  source). */
function extentOf(v: BlockView, a: BlockAtom): [number, number] {
  let x1 = a.a1;
  while (x1 < v.O.length && v.M[x1]! < 0 && v.atomOf[x1]! < 0 && v.O[x1] !== PARA_CHAR) x1++;
  return [a.a0, x1];
}

/**
 * The source edits for hunk `h` of block `v` when it is a change inside a
 * printed citation: each change inside an author's part goes into the
 * source; the others are reported. A citation deleted whole takes its
 * source with it. Undefined when the hunk is not one: the citation
 * emptied around its note's reference, split, or changed together with
 * the text beside it.
 */
export function citationEdits(v: BlockView, base: string, h: Hunk): SourceEdit[] | undefined {
  let atom: BlockAtom | undefined;
  let x0 = 0;
  let x1 = 0;
  for (const a of v.atoms) {
    if (!CITATION_ATOMS.has(a.kind) || a.start < 0 || a.end <= a.start) continue;
    [x0, x1] = extentOf(v, a);
    if (x0 <= h.a0 && h.a1 <= x1 && (h.a0 < x1 || h.a0 === h.a1)) {
      atom = a;
      break;
    }
  }
  if (!atom) return undefined;
  // The citation as printed and as it reads now (outside the hunk the two
  // texts are equal).
  const n0 = h.b0 - (h.a0 - x0);
  const n1 = h.b1 + (x1 - h.a1);
  const was = v.O.slice(x0, x1);
  const now = v.N.slice(n0, n1);
  const typedAll = v.N.slice(h.b0, h.b1);
  // The citation deleted whole: its source goes.
  if (h.a0 === x0 && h.a1 === x1 && typedAll === '') return [{ target: v.target, start: atom.start, end: atom.end, text: '', kind: 'text' }];
  if (was === now || !/\S/.test(now.replaceAll(OBJECT_CHAR, '')) || typedAll.includes(PARA_CHAR)) return undefined;
  const count = (s: string): number => s.split(OBJECT_CHAR).length - 1;
  if (count(v.O.slice(h.a0, h.a1)) !== count(typedAll)) return undefined;
  // The hunk's own changes, character by character, in the printed text.
  const hunks = diffText(v.O.slice(h.a0, h.a1), typedAll).map((d) => ({ a0: d.a0 + h.a0 - x0, a1: d.a1 + h.a0 - x0, b0: d.b0 + h.b0 - n0, b1: d.b1 + h.b0 - n0 }));
  if (hunks.some((d) => was.slice(d.a0, d.a1).includes(OBJECT_CHAR) || now.slice(d.b0, d.b1).includes(OBJECT_CHAR))) return undefined;
  const raw = base.slice(atom.start, atom.end);
  const read = citationParts(raw);
  const keys = read?.keys.join('; ') ?? '';
  const placed = (read?.parts ?? []).map((p) => ({ p, o: placeIn(was, p.shown) })).filter((x): x is { p: CitationPart; o: number } => x.o !== undefined);

  const edits: SourceEdit[] = [];
  const review = new Map<CitationPart, { o: number; hunks: Hunk[] }>();
  const generated: Hunk[] = [];
  for (const d of hunks) {
    const home = placed.find(({ p, o }) => o <= d.a0 && d.a1 <= o + p.shown.length);
    if (!home) {
      generated.push(d);
      continue;
    }
    const { p, o } = home;
    const typed = now.slice(d.b0, d.b1);
    // The part's first letter capitalised in print: a change to it would
    // write the print's case into the source.
    const recased = d.a0 === o && was[o] !== p.shown[0];
    if (p.written === p.shown && !recased && !SYNTAX.test(typed)) {
      const at = atom.start + p.at + (d.a0 - o);
      edits.push({ target: v.target, start: at, end: at + (d.a1 - d.a0), text: typed, kind: 'text', cite: p.key, citePart: p.kind });
    } else {
      const r = review.get(p) ?? { o, hunks: [] };
      r.hunks.push(d);
      review.set(p, r);
    }
  }
  // The corrected citation must still read as the same works.
  if (edits.length) {
    let fixed = raw;
    for (const e of [...edits].sort((x, y) => y.start - x.start)) fixed = fixed.slice(0, e.start - atom.start) + e.text + fixed.slice(e.end - atom.start);
    const again = citationParts(fixed);
    if (!again || again.keys.join('; ') !== keys) {
      generated.push(...hunks);
      edits.length = 0;
      review.clear();
    }
  }
  for (const [p, { o, hunks: own }] of review) {
    let after = p.shown;
    for (const d of [...own].sort((x, y) => y.a0 - x.a0)) after = after.slice(0, d.a0 - o) + now.slice(d.b0, d.b1) + after.slice(d.a1 - o);
    const at = atom.start + p.at;
    edits.push({ target: v.target, start: at, end: at + p.written.length, text: after, kind: 'text', reject: 'citation-part', before: was.slice(o, o + p.shown.length), cite: p.key, citePart: p.kind });
  }
  if (generated.length) {
    const plain = (s: string): string => s.replaceAll(OBJECT_CHAR, '').trim();
    edits.push({ target: v.target, start: atom.start, end: atom.end, text: plain(now), kind: 'text', reject: 'citation', before: plain(was), ...(keys ? { cite: keys } : {}) });
  }
  return edits;
}

/** A block that is one note a citation made (a note style): the note of
 *  the citation's reference, which the reference's own edits speak for. */
export function isCitationNote(v: BlockView): boolean {
  const a = v.atoms[0];
  return v.atoms.length === 1 && a!.kind === 'citation' && a!.a0 === 0 && v.M.every((m) => m < 0) && v.frags[0]?.role === 'footnote';
}
