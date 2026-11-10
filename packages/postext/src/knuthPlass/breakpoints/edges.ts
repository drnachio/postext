// The edges of the lines a paragraph could be set in, as stacks compare
// them (`KPOptions.stacks`): the word a line ends or starts on and its last
// or first characters, spaces included. Read by the TypeScript search and
// handed to the WebAssembly one, so both compare the same texts.
import type { KPItem } from '../types.js';

/** Text as stacks compare it: lower-cased and without its accents and
 *  other marks (`sól` is `sol`: a stack reads alike to the eye however it
 *  is accented). Recomposed afterwards, so a syllable block stays one
 *  character. */
export function foldEdge(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();
}

/** A word as stacks compare it: folded ({@link foldEdge}), without soft
 *  hyphens and without the punctuation at either end (`«casa,` → `casa`). */
function edgeWord(text: string): string {
  return foldEdge(text.replace(/­/g, '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
}

const EDGE_SLACK = 16;

/** The line edges of a paragraph's items, each worked out once per break
 *  position and kept. A position is an item index; `-1` is the paragraph's
 *  start (the edge before its first line). */
export class LineEdges {
  /** The word a line ends on when it breaks at item k (the syllable before
   *  a hyphen), and the word the next line starts on (`wordAfter[k + 1]`;
   *  `wordAfter[0]` is the paragraph's first). */
  private readonly wordBefore: string[];
  private readonly wordAfter: string[];
  /** The paragraph as one string — a word space is a space, a soft hyphen
   *  nothing — and where each item starts in it. */
  private readonly stream: string;
  private readonly streamAt: number[];
  private readonly endCache: (string | undefined)[];
  private readonly startCache: (string | undefined)[];

  constructor(items: KPItem[], private readonly minChars: number) {
    const n = items.length;
    this.wordBefore = new Array<string>(n);
    this.wordAfter = new Array<string>(n + 1);
    // A run of glue (the paragraph's closing glue, a space before a break)
    // does not empty the edge: the word before it, or after it, stays the
    // line's.
    let word = '';
    let last = '';
    for (let k = 0; k < n; k++) {
      const item = items[k]!;
      const current = edgeWord(word);
      this.wordBefore[k] = current !== '' ? current : last;
      if (item.type === 'box') word += item.text ?? '';
      else if (item.type === 'glue') {
        if (current !== '') last = current;
        word = '';
      }
    }
    word = '';
    let next = '';
    this.wordAfter[n] = '';
    for (let k = n - 1; k >= 0; k--) {
      const item = items[k]!;
      if (item.type === 'box') word = (item.text ?? '') + word;
      else if (item.type === 'glue') {
        const done = edgeWord(word);
        if (done !== '') next = done;
        word = '';
      }
      const current = edgeWord(word);
      this.wordAfter[k] = current !== '' ? current : next;
    }
    let stream = '';
    this.streamAt = new Array<number>(n + 1);
    for (let k = 0; k < n; k++) {
      this.streamAt[k] = stream.length;
      const item = items[k]!;
      if (item.type === 'box') stream += (item.text ?? '').replace(/­/g, '');
      else if (item.type === 'glue' && item.sourceIndex >= 0) stream += ' ';
    }
    this.streamAt[n] = stream.length;
    this.stream = stream;
    this.endCache = new Array<string | undefined>(n);
    this.startCache = new Array<string | undefined>(n + 1);
  }

  /** The word the line ending at break `pos` ends on. */
  endWord(pos: number): string {
    return pos >= 0 ? this.wordBefore[pos]! : '';
  }

  /** The word the line after break `pos` starts on. */
  startWord(pos: number): string {
    return this.wordAfter[pos + 1]!;
  }

  /** The last `minChars` characters of the line ending at break `pos`,
   *  past the punctuation at its very end; `''` when the line is shorter. */
  endChars(pos: number): string {
    if (pos < 0) return '';
    const known = this.endCache[pos];
    if (known !== undefined) return known;
    const n = this.minChars;
    const at = this.streamAt[pos]!;
    const tail = this.stream.slice(Math.max(0, at - n - EDGE_SLACK), at).replace(/[^\p{L}\p{N}]+$/u, '');
    return (this.endCache[pos] = tail.length >= n ? foldEdge(tail.slice(-n)) : '');
  }

  /** The first `minChars` characters of the line after break `pos`. */
  startChars(pos: number): string {
    const known = this.startCache[pos + 1];
    if (known !== undefined) return known;
    const n = this.minChars;
    const at = this.streamAt[pos + 1]!;
    const head = this.stream.slice(at, at + n + EDGE_SLACK).replace(/^[^\p{L}\p{N}]+/u, '');
    return (this.startCache[pos + 1] = head.length >= n ? foldEdge(head.slice(0, n)) : '');
  }
}

/** Runs of vowels in a folded word: its syllables, near enough. */
const VOWEL_RUN = /[aeiouy]+/g;

/**
 * Whether a word is a monosyllable (`a`, `y`, `de`, `la`, `que`, `bien`):
 * at most one run of vowels, `y` counted as one. Two lines ending (or
 * starting) on the same one are never allowed while stacks are avoided,
 * whatever `stacks.badness` says: the eye catches a short repeated word at
 * once.
 */
export function isMonosyllable(word: string): boolean {
  if (word === '' || !/^\p{L}+$/u.test(word)) return false;
  return (word.match(VOWEL_RUN)?.length ?? 0) <= 1;
}

/** Whether the same edge of two consecutive lines stacks: they end (or
 *  start) on the same word, or on the same characters, spaces included —
 *  `chars`, the last (first) `minChars` of each line, `''` when the line is
 *  shorter ({@link LineEdges}). */
export function edgesStack(wordA: string, wordB: string, charsA: string, charsB: string): boolean {
  return (wordA !== '' && wordA === wordB) || (charsA !== '' && charsA === charsB);
}
