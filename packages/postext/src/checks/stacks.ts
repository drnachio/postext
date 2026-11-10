// Stacks in a laid-out document (#1463): two consecutive lines of a
// paragraph, in one column, that end or start alike, read off the lines'
// text with the edges the line breaker weighs under `bodyText.stacks:
// 'avoid'` (`knuthPlass/breakpoints/edges.ts`). What `'warn'` and
// `'avoid'` report, and what the Sandbox marks on the page.
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt.js';
import { OPAQUE, type Edge, edgesStack, textEdges } from '../knuthPlass/breakpoints/edges.js';

/** The characters of one segment of a line a stack's mark covers. */
export interface StackRange {
  /** Index in `line.segments`. */
  segment: number;
  /** UTF-16 offsets into that segment's `text`. */
  from: number;
  to: number;
}

/** A stack: lines `line` and `line + 1` of `block` end (`'end'`) or start
 *  (`'start'`) alike. */
export interface Stack {
  block: VDTBlock;
  /** Index of the first of the two lines in `block.lines`. */
  line: number;
  edge: 'end' | 'start';
  /** What the lines repeat, as the first one prints it. */
  text: string;
  /** Where each of the two lines prints it (empty for a line without
   *  segments). */
  ranges: [StackRange[], StackRange[]];
}

/** Options for {@link findStacks}. */
export interface FindStacksOptions {
  /** Characters two edges must share (`bodyText.stackMinCharacters`).
   *  Default: the document's. */
  minChars?: number;
  /** Only the stacks of this page. Default: every page. */
  pageIndex?: number;
}

/** The blocks whose lines are running text set by the line breaker. */
const TEXT_BLOCKS: ReadonlySet<string> = new Set(['paragraph', 'listItem', 'blockquote', 'footnoteRef']);

/** A line's text as stacks compare it, and the segment character each of
 *  its units comes from. A segment that paints no letters (a formula, a
 *  chip, a swatch, a score) is {@link OPAQUE}; a footnote marker is a soft
 *  hyphen, which the edges skip. */
function lineText(line: VDTLine): { text: string; owner: { segment: number; offset: number }[] } {
  if (!line.segments || line.segments.length === 0) return { text: line.text, owner: [] };
  const parts: string[] = [];
  const owner: { segment: number; offset: number }[] = [];
  line.segments.forEach((seg, segment) => {
    const t = seg.text;
    if (seg.kind === 'text' && seg.footnoteId === undefined) {
      parts.push(t);
      for (let k = 0; k < t.length; k++) owner.push({ segment, offset: k });
    } else if (seg.kind === 'space') {
      parts.push(' ');
      owner.push({ segment, offset: 0 });
    } else {
      const ch = seg.kind === 'text' ? '­' : OPAQUE;
      const n = Math.max(1, t.length);
      parts.push(ch.repeat(n));
      for (let k = 0; k < n; k++) owner.push({ segment, offset: k });
    }
  });
  return { text: parts.join(''), owner };
}

const isPunct = (ch: string): boolean => !/[\p{L}\p{N}]/u.test(ch);
const SEPARATOR = /[\s\u200B]/u;

/** The span of `text` an edge covers, punctuation at its ends left out:
 *  [from, to). The word at the edge when the stack is of words, else its
 *  characters. */
function edgeSpan(text: string, edge: Edge, byWord: boolean, end: boolean): [number, number] {
  const reach = byWord ? edge.wordReach : edge.charsReach;
  let from = end ? text.length - reach : 0;
  let to = end ? text.length : reach;
  if (byWord) {
    // The reach runs from the far side of the word to the edge: the word
    // alone ends (starts) at the first separator after (before) it.
    if (end) {
      let k = from;
      while (k < to && !SEPARATOR.test(text[k]!)) k++;
      to = k;
    } else {
      let k = to;
      while (k > from && !SEPARATOR.test(text[k - 1]!)) k--;
      from = k;
    }
  }
  while (from < to && isPunct(text[from]!)) from++;
  while (to > from && isPunct(text[to - 1]!)) to--;
  return [from, to];
}

/** The segment ranges of [from, to) of a line's compared text. */
function rangesOf(owner: { segment: number; offset: number }[], from: number, to: number): StackRange[] {
  const out: StackRange[] = [];
  for (let k = from; k < to; k++) {
    const o = owner[k];
    if (!o) continue;
    const last = out[out.length - 1];
    if (last && last.segment === o.segment && last.to === o.offset) last.to = o.offset + 1;
    else out.push({ segment: o.segment, from: o.offset, to: o.offset + 1 });
  }
  return out;
}

/**
 * The stacks of a laid-out document, in block and line order: two
 * consecutive lines of a paragraph, a list item, a quotation or a note, in
 * one column, that end on the same word or the same last `minChars`
 * characters, or start on the same word or the same first ones (#1463).
 * Accents and case do not count; scripts without word spaces have none.
 */
export function findStacks(doc: VDTDocument, options: FindStacksOptions = {}): Stack[] {
  const minChars = Math.max(1, options.minChars ?? doc.config.bodyText.stackMinCharacters);
  const out: Stack[] = [];
  for (const block of doc.blocks) {
    if (options.pageIndex !== undefined && block.pageIndex !== options.pageIndex) continue;
    if (!TEXT_BLOCKS.has(block.type) || block.lines.length < 2) continue;
    let prev: { text: string; owner: { segment: number; offset: number }[]; end: Edge; start: Edge } | undefined;
    block.lines.forEach((line, i) => {
      const t = lineText(line);
      const cur = { ...t, end: textEdges(t.text, minChars, true), start: textEdges(t.text, minChars, false) };
      if (prev) {
        for (const edge of ['end', 'start'] as const) {
          const a = prev[edge];
          const b = cur[edge];
          if (!edgesStack(a, b)) continue;
          const byWord = a.word !== '' && a.word === b.word;
          const [af, at] = edgeSpan(prev.text, a, byWord, edge === 'end');
          const [bf, bt] = edgeSpan(cur.text, b, byWord, edge === 'end');
          out.push({
            block,
            line: i - 1,
            edge,
            text: prev.text.slice(af, at).replace(/[­￼]/g, ''),
            ranges: [rangesOf(prev.owner, af, at), rangesOf(cur.owner, bf, bt)],
          });
        }
      }
      prev = cur;
    });
  }
  return out;
}
