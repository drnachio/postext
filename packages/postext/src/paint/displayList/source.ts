// Where each painted character comes from (#1388, #1389 anchors): the
// block's `sourceMap` walked along a line's segments in the unit its
// `plainStart`/`plainEnd` count in, atoms for the placeholders that stand
// for a whole construct, and a greedy alignment for text whose source is
// a string of its own (a resource's caption, a table cell, a design title).
import type { VDTBlock } from '../../vdt/blocks.js';
import type { VDTLine } from '../../vdt/lines.js';
import type { VDTLineSegment } from '../../vdt/segments.js';
import { segmentPlainLength } from '../segmentPlainLength.js';

export interface Atom { at: number; start: number; end: number; kind: string }

/** The text a segment paints: a chip's words in place of its placeholder. */
export function segmentShownText(seg: VDTLineSegment): string {
  if (seg.chip) {
    const words = seg.chip.runs.map((r) => r.text).join('');
    return words.length > 0 ? words : seg.text;
  }
  return seg.text;
}

/** The atom kind of a segment that stands for a whole construct, if any. */
export function atomKind(seg: VDTLineSegment): string | undefined {
  if (seg.refResourceId !== undefined || seg.refAnchor) return 'ref';
  if (seg.footnoteId !== undefined) return 'footnote';
  if (seg.kind === 'math') return 'math';
  if (seg.kind === 'score') return 'score';
  if (seg.kind === 'swatch') return 'swatch';
  if (seg.chip) return seg.chip.blank ? 'gap' : 'chip';
  if (seg.tab !== undefined || seg.labelTab) return 'tab';
  return undefined;
}

/** A line's characters with their source: `text` (segments in logical
 *  order, chip words in place of their placeholders), `map` (absolute
 *  Markdown offset per character, -1 for synthetic ones) and the atoms. */
export interface LineSource {
  text: string;
  map: number[];
  atoms: Atom[];
}

/** The block fields its plain characters are mapped through (`lines`:
 *  where a note's number prefix is read). */
export type SourceBlock = Partial<Pick<VDTBlock, 'sourceMap' | 'plainPrefixLen' | 'footnoteNote' | 'sourceStart' | 'lines'>>;

const notePrefixes = new WeakMap<object, number>();

/** The characters that end a note's number (`footnotes.numberGap`). */
const NOTE_GAP = /[\u2002\u2003\u3000]/;

/** Leading `sourceMap` entries that stand for a generated prefix the
 *  block's `plainPrefixLen` does not count: a footnote paragraph's number
 *  and gap, which the engine maps to the definition's text start — where
 *  the text's own first character maps too when it opens with no markup,
 *  so the length is read off the note's first line (number, then gap). */
function generatedLead(block: SourceBlock): number {
  const map = block.sourceMap;
  if (block.footnoteNote === undefined || !map || map.length === 0) return 0;
  const known = notePrefixes.get(map);
  if (known !== undefined) return known;
  const first = block.lines?.find((l) => l.plainStart === 0);
  if (first) {
    const gap = first.text.search(NOTE_GAP);
    const n = gap > 0 && gap < map.length && map.slice(0, gap + 1).every((o) => o === map[0]) ? gap + 1 : 0;
    notePrefixes.set(map, n);
    return n;
  }
  // A later fragment of a split note: its lines start past the prefix,
  // which only an equal run can stand for (not remembered: the first
  // fragment knows better).
  let n = 0;
  while (n < map.length && map[n] === map[0]) n++;
  return n >= 2 ? n - 1 : 0;
}

/** The source offset of plain character `plain` (block-relative, its
 *  number prefix counted) of `block`, -1 for a generated prefix or one past
 *  the map. */
export function sourceOfPlain(block: SourceBlock, plain: number): number {
  const map = block.sourceMap;
  if (!map) return -1;
  const k = plain - (block.plainPrefixLen ?? 0);
  return k >= generatedLead(block) && k < map.length ? map[k]! : -1;
}

/** The end of an atom's source: from what it is when its markup is known
 *  (`[^id]`, `$tex$`), else the next plain character's source. */
function atomEnd(seg: VDTLineSegment, kind: string, start: number, next: number): number {
  const after = next > start ? next : start + 1;
  if (kind === 'footnote' && seg.footnoteId !== undefined) return Math.min(after, start + seg.footnoteId.length + 3);
  if (kind === 'math' && seg.mathRender?.tex) return Math.min(after, start + seg.mathRender.tex.length + 2);
  return after;
}

/**
 * The source of a line of a block with a `sourceMap`: each segment
 * counts {@link segmentPlainLength} plain characters from the line's
 * `plainStart`; an added or repeated hyphen, inserted brackets, leaders and
 * kashida get -1, a placeholder (reference, footnote marker, formula,
 * swatch, chip, tab) maps its first character and records an atom.
 */
export function lineSource(block: SourceBlock, line: VDTLine): LineSource {
  const segs = line.segments;
  if (!segs || segs.length === 0) {
    const map = new Array<number>(line.text.length).fill(-1);
    if (line.plainStart !== undefined) {
      const dropLead = line.repeatedHyphen === true && line.text.startsWith('-') ? 1 : 0;
      const dropTail = line.hyphenated && !line.hardHyphen && line.text.endsWith('-') ? 1 : 0;
      let p = line.plainStart;
      for (let i = dropLead; i < line.text.length - dropTail; i++) {
        if (line.plainEnd !== undefined && p >= line.plainEnd) break;
        map[i] = sourceOfPlain(block, p++);
      }
    }
    return { text: line.text, map, atoms: [] };
  }
  let text = '';
  const map: number[] = [];
  const atoms: Atom[] = [];
  const dropTrailing = line.hyphenated === true && line.hardHyphen !== true;
  const hasPlain = line.plainStart !== undefined;
  let p = line.plainStart ?? 0;
  segs.forEach((seg, i) => {
    const shown = segmentShownText(seg);
    const at = text.length;
    text += shown;
    const len = hasPlain ? segmentPlainLength(seg, i === segs.length - 1 && dropTrailing, i === 0 && line.repeatedHyphen === true) : 0;
    const kind = atomKind(seg);
    const out = new Array<number>(shown.length).fill(-1);
    if (len > 0 && kind !== undefined && kind !== 'tab') {
      const start = sourceOfPlain(block, p);
      if (seg.chip?.sourceOffsets && start >= 0 && shown !== seg.text) {
        // A chip's words, each through its own offset from the chip's `:`.
        seg.chip.sourceOffsets.forEach((off, k) => { if (k < out.length) out[k] = start + off; });
      } else out[0] = start;
      if (start >= 0) atoms.push({ at, start, end: atomEnd(seg, kind, start, sourceOfPlain(block, p + len)), kind });
    } else if (len > 0) {
      // Characters in order, skipping the ones the layout added.
      const skip = new Set<number>(seg.kashida ?? []);
      if (i === 0 && line.repeatedHyphen && seg.text.startsWith('-')) skip.add(0);
      if (i === segs.length - 1 && dropTrailing && seg.text.endsWith('-')) skip.add(seg.text.length - 1);
      let q = p;
      for (let k = 0; k < shown.length && q < p + len; k++) {
        if (skip.has(k)) continue;
        out[k] = sourceOfPlain(block, q++);
      }
      if (kind === 'tab' && out[0] !== undefined && out[0] >= 0) atoms.push({ at, start: out[0], end: atomEnd(seg, kind, out[0], sourceOfPlain(block, p + len)), kind });
    }
    map.push(...out);
    p += len;
  });
  return { text, map, atoms };
}

/** A placeholder in painted text that stands for a construct of its
 *  source string (a reference, a formula, a note marker, a swatch). */
export interface PaintedAtom { at: number; length: number; kind: string }

/** The markup a placeholder of `kind` comes from in a source string. */
function constructPattern(kind: string): RegExp {
  switch (kind) {
    case 'ref': return /:ref(?:\[[^\]]*\])?\{[^}]*\}/y;
    case 'math': return /\$\$?[^$]+\$\$?/y;
    case 'footnote': return /\[\^[^\]\s]+\]/y;
    default: return /:[A-Za-z][\w-]*(?:\[[^\]]*\])?(?:\{[^}]*\})?/y;
  }
}

/** Where the construct a placeholder stands for opens in `source`, from
 *  `from` within a short reach (markup before it skipped). */
function findConstruct(source: string, from: number, kind: string): { start: number; end: number } | undefined {
  const re = constructPattern(kind);
  for (let k = from; k < source.length && k - from < 32; k++) {
    re.lastIndex = k;
    const m = re.exec(source);
    if (m) return { start: k, end: k + m[0].length };
  }
  return undefined;
}

/**
 * Offsets into `source` for each character of `painted`, matched greedily
 * in order (case-insensitively, as a design may print a title in
 * capitals): markup in the source is skipped, a painted character not met
 * within a short reach gets -1. `base` is added to every offset found.
 * A placeholder of `atoms` ("Fig. 1" for `:ref{…}`) maps its first
 * character to the construct's start and the rest to -1, the construct
 * recorded in `found` — its letters are never matched against the
 * directive's.
 */
export function alignToSource(painted: string, source: string | undefined, base = 0, atoms?: readonly PaintedAtom[], found?: Atom[]): number[] {
  const out = new Array<number>(painted.length).fill(-1);
  if (!source) return out;
  const atomAt = new Map<number, PaintedAtom>();
  for (const a of atoms ?? []) if (a.length > 0) atomAt.set(a.at, a);
  const fold = (c: string | undefined) => (c === undefined ? '' : c.toLocaleLowerCase());
  let j = 0;
  for (let i = 0; i < painted.length && j < source.length; i++) {
    const atom = atomAt.get(i);
    if (atom) {
      const hit = findConstruct(source, j, atom.kind);
      if (hit) {
        out[i] = base + hit.start;
        found?.push({ at: i, start: base + hit.start, end: base + hit.end, kind: atom.kind });
        j = hit.end;
      }
      i += atom.length - 1;
      continue;
    }
    const c = fold(painted[i]);
    if (/\s/.test(painted[i]!)) {
      // A space matches the next whitespace run's first character.
      let k = j;
      while (k < source.length && k - j < 8 && !/\s/.test(source[k]!)) k++;
      if (k < source.length && /\s/.test(source[k]!)) {
        out[i] = base + k;
        j = k + 1;
        while (j < source.length && /\s/.test(source[j]!) && !/\s/.test(painted[i + 1] ?? 'x')) j++;
      }
      continue;
    }
    let k = j;
    while (k < source.length && k - j < 16 && fold(source[k]) !== c) k++;
    if (k < source.length && fold(source[k]) === c) {
      out[i] = base + k;
      j = k + 1;
    }
  }
  return out;
}
