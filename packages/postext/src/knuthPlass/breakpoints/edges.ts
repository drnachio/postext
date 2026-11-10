// The edges of the lines a paragraph could be set in, as stacks compare
// them (`KPOptions.stacks`, #1463): the word a line ends or starts on and
// its last or first characters, spaces included. The line breaker reads
// them by break position ({@link LineEdges}); the stack check of a laid-out
// document reads them off each line's text ({@link textEdges}), with the
// same rules, so `'warn'` reports what `'avoid'` would have weighed.
import type { KPItem } from '../types.js';
import { KP_INFINITY } from '../constants.js';

/** Text as stacks compare it: lower-cased and without its accents and
 *  other marks (`sól` is `sol`: a stack reads alike to the eye however it
 *  is accented). Recomposed afterwards, so a syllable block stays one
 *  character. */
export function foldEdge(text: string): string {
  // ASCII has no marks to drop: most edges of Latin text (#1463, a
  // paragraph folds one or two per break it could take).
  if (ASCII.test(text)) return text.toLowerCase();
  let folded = FOLDED.get(text);
  if (folded === undefined) {
    folded = text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC').toLowerCase();
    if (FOLDED.size >= 4096) FOLDED.clear();
    FOLDED.set(text, folded);
  }
  return folded;
}
const ASCII = /^[\x00-\x7f]*$/;
/** Folded edges outside ASCII, kept across paragraphs (words repeat). */
const FOLDED = new Map<string, string>();

/** Whether a UTF-16 unit separates words: whitespace or a zero-width
 *  break. */
function separates(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c === 32) return true;
  if (c < 128) return c >= 9 && c <= 13;
  return SEPARATOR.test(ch);
}

/** What stands in the text for a box that paints no letters (a formula, a
 *  chip, a swatch): an edge that reaches it is not compared, so a formula
 *  is never read by its TeX source nor credited the word before it. */
export const OPAQUE = '￼';
/** A break between two words with nothing painted (a zero-width space). */
const WORD_BREAK = '​';

/** Scripts that do not separate their words with spaces: Chinese, Japanese
 *  kana, Thai, Lao, Khmer, Myanmar, Tibetan. Their lines are set on a grid
 *  or broken between syllables, and a "word" at a line's edge is no unit a
 *  reader sees repeated, so an edge in one of them has no stack (#1463). */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;
const SEPARATOR = /[\s​]/u;
const EDGE_PUNCT_END = /[^\p{L}\p{N}￼]+$/u;
const EDGE_PUNCT_START = /^[^\p{L}\p{N}￼]+/u;

/** A word longer than this has no word edge: it is no repeated word the
 *  eye catches, and it bounds what an edge reads. */
export const MAX_EDGE_WORD = 48;
/** Characters of text an edge looks at: the longest word and the
 *  punctuation and spaces after it. */
const EDGE_WINDOW = 96;

/** One edge of a line: its word and its characters (`''`: none), and how
 *  far each reaches into the line from that edge, in UTF-16 units of the
 *  text the edge was read from (a line shorter than the reach does not
 *  hold that edge). */
export interface Edge {
  word: string;
  chars: string;
  wordReach: number;
  charsReach: number;
}

const NO_EDGE: Edge = { word: '', chars: '', wordReach: 0, charsReach: 0 };

/** A token at a line's edge as a word: without soft hyphens and the
 *  punctuation at either end, folded; `''` when it holds no letter or
 *  number, a box with no text, a character of a script without spaces, or
 *  is longer than {@link MAX_EDGE_WORD}. */
function edgeWord(token: string): string {
  if (token.includes(OPAQUE) || UNSPACED.test(token)) return '';
  const bare = token.replace(/­/g, '').replace(EDGE_PUNCT_START, '').replace(EDGE_PUNCT_END, '');
  return bare.length > MAX_EDGE_WORD ? '' : foldEdge(bare);
}

/** The characters an edge compares: `minChars` of them, spaces included
 *  (zero-width breaks and soft hyphens are nothing), past the punctuation
 *  at the edge; `''` when the text is shorter, or they reach a box with no
 *  text or a script without spaces. Returns them with their reach. */
function edgeChars(text: string, minChars: number, end: boolean): { chars: string; reach: number } {
  const clean = text.includes('­') || text.includes(WORD_BREAK) ? text.replace(/[­​]/g, '') : text;
  const trimmed = end ? clean.replace(EDGE_PUNCT_END, '') : clean.replace(EDGE_PUNCT_START, '');
  if (trimmed.length < minChars) return { chars: '', reach: 0 };
  const chars = end ? trimmed.slice(-minChars) : trimmed.slice(0, minChars);
  if (chars.includes(OPAQUE) || UNSPACED.test(chars)) return { chars: '', reach: 0 };
  // Reach in the text as given (soft hyphens and zero-width breaks
  // counted), so a caller can hold it against a line's length.
  return { chars: foldEdge(chars), reach: rawReach(text, clean.length - trimmed.length + minChars, end) };
}

/** How many UTF-16 units of `text`, from its end (or start), hold `n`
 *  units once soft hyphens and zero-width breaks are left out. */
function rawReach(text: string, n: number, end: boolean): number {
  let seen = 0;
  for (let k = 0; k < text.length; k++) {
    const ch = text[end ? text.length - 1 - k : k]!;
    if (ch !== '­' && ch !== WORD_BREAK) seen++;
    if (seen >= n) return k + 1;
  }
  return text.length;
}

/** The word at one edge of `text`: the last (first) token holding a letter
 *  or a number, past the punctuation and spaces at the edge, with its
 *  reach. A box with no text met on the way stops it. A token cut by the
 *  start of `text` while `clipped` (the text is a window of a longer one)
 *  is too long to be a word. */
function edgeToken(text: string, end: boolean, clipped: boolean): { word: string; reach: number } {
  const n = text.length;
  let k = 0;
  while (k < n) {
    // Skip separators and punctuation-only tokens.
    while (k < n && separates(text[end ? n - 1 - k : k]!)) k++;
    const from = k;
    while (k < n && !separates(text[end ? n - 1 - k : k]!)) k++;
    if (k === from) break;
    const token = end ? text.slice(n - k, n - from) : text.slice(from, k);
    if (token.includes(OPAQUE)) return { word: '', reach: 0 };
    if (!/[\p{L}\p{N}]/u.test(token)) continue;
    if (clipped && k === n) return { word: '', reach: 0 };
    return { word: edgeWord(token), reach: k };
  }
  return { word: '', reach: 0 };
}

/** The end (or start) edge of a line's text, as stacks compare it. */
export function textEdges(text: string, minChars: number, end: boolean, clipped = false): Edge {
  const { word, reach: wordReach } = edgeToken(text, end, clipped);
  // The characters lie near the edge: read them off a short piece of it
  // first, the whole text only when punctuation fills that piece.
  const near = minChars + 16;
  let { chars, reach: charsReach } = edgeChars(text.length > near ? (end ? text.slice(-near) : text.slice(0, near)) : text, minChars, end);
  if (chars === '' && text.length > near) ({ chars, reach: charsReach } = edgeChars(text, minChars, end));
  if (word === '' && chars === '') return NO_EDGE;
  return { word, chars, wordReach: word === '' ? 0 : wordReach, charsReach };
}

/** An edge whose reach a line of `length` units holds; else none of it. */
export function edgeWithin(edge: Edge, length: number): Edge {
  if (edge.wordReach <= length && edge.charsReach <= length) return edge;
  const word = edge.wordReach <= length ? edge.word : '';
  const chars = edge.charsReach <= length ? edge.chars : '';
  return { word, chars, wordReach: word === '' ? 0 : edge.wordReach, charsReach: chars === '' ? 0 : edge.charsReach };
}

/** The paragraph as one text, as its lines would print it: a word space is
 *  a space, a forced break a line feed, a zero-width break U+200B, a box
 *  with no text {@link OPAQUE}, the closing glue nothing; soft hyphens are
 *  kept (and skipped by the edges). `at[k]` is where item k starts. */
function paragraphText(items: readonly KPItem[]): { text: string; at: number[] } {
  const parts: string[] = [];
  const at = new Array<number>(items.length + 1);
  let length = 0;
  for (let k = 0; k < items.length; k++) {
    at[k] = length;
    const item = items[k]!;
    let part = '';
    if (item.type === 'box') part = item.text ?? OPAQUE;
    else if (item.type === 'glue') part = item.sourceIndex >= 0 ? ' ' : '';
    else if (item.penalty <= -KP_INFINITY) part = '\n';
    else if (item.separates) part = WORD_BREAK;
    if (part !== '') {
      parts.push(part);
      length += part.length;
    }
  }
  at[items.length] = length;
  return { text: parts.join(''), at };
}

/** The line edges of a paragraph's items, each worked out once per break
 *  position and kept. A position is an item index; `-1` is the paragraph's
 *  start (the edge before its first line). Built once per paragraph and
 *  shared by every search over it. */
export class LineEdges {
  private readonly text: string;
  private readonly at: number[];
  private readonly ends: (Edge | undefined)[];
  private readonly starts: (Edge | undefined)[];

  constructor(items: readonly KPItem[], readonly minChars: number) {
    const { text, at } = paragraphText(items);
    this.text = text;
    this.at = at;
    this.ends = new Array<Edge | undefined>(items.length);
    this.starts = new Array<Edge | undefined>(items.length + 1);
  }

  /** Where item `k` starts in the paragraph's text (`k` = the item
   *  count: its end). */
  offset(k: number): number {
    return this.at[k]!;
  }

  /** The length, in units of the paragraph's text, of the line from the
   *  break at `from` to the one at `to`. */
  lineLength(from: number, to: number): number {
    return this.at[to]! - this.at[from + 1]!;
  }

  /** The end edge of a line that ends at break `pos` (whatever its start). */
  end(pos: number): Edge {
    if (pos < 0) return NO_EDGE;
    let e = this.ends[pos];
    if (e === undefined) {
      const to = this.at[pos]!;
      const from = Math.max(0, to - EDGE_WINDOW);
      // A break inside a word of a script without spaces (between two
      // ideographs) has no edge: decided on the character before it.
      e = to > 0 && UNSPACED.test(this.text[to - 1]!) ? NO_EDGE : textEdges(this.text.slice(from, to), this.minChars, true, from > 0);
      this.ends[pos] = e;
    }
    return e;
  }

  /** The start edge of the line after break `pos` (whatever its end). */
  start(pos: number): Edge {
    let e = this.starts[pos + 1];
    if (e === undefined) {
      const from = this.at[pos + 1]!;
      const to = Math.min(this.text.length, from + EDGE_WINDOW);
      e = from < this.text.length && UNSPACED.test(this.text[from]!) ? NO_EDGE : textEdges(this.text.slice(from, to), this.minChars, false, to < this.text.length);
      this.starts[pos + 1] = e;
    }
    return e;
  }

  /** The end edge of the line from break `from` to break `to`. */
  lineEnd(from: number, to: number): Edge {
    return edgeWithin(this.end(to), this.lineLength(from, to));
  }

  /** The start edge of the line from break `from` to break `to`. */
  lineStart(from: number, to: number): Edge {
    return edgeWithin(this.start(from), this.lineLength(from, to));
  }
}

/** The vowels of each script whose monosyllables count (#1463): Latin,
 *  Greek and Cyrillic, folded (no accents). A word of any other script is
 *  never a monosyllable. */
const VOWELS: readonly [RegExp, RegExp][] = [
  [/^\p{Script=Latin}+$/u, /[aeiouyæœø]+/g],
  [/^\p{Script=Greek}+$/u, /[αεηιουω]+/g],
  [/^\p{Script=Cyrillic}+$/u, /[аеёиоуыэюяіїєў]+/g],
];

/**
 * Whether a folded word is a monosyllable (`a`, `y`, `de`, `la`, `que`,
 * `bien`, `и`, `на`, `και`): one run of vowels at most, in a word written
 * in one of the scripts of {@link VOWELS}. Two lines ending (or starting)
 * on the same one cost twice `stackPenalty`: the eye catches a short
 * repeated word at once.
 */
export function isMonosyllable(word: string): boolean {
  if (word === '') return false;
  for (const [script, vowels] of VOWELS) {
    if (script.test(word)) return (word.match(vowels)?.length ?? 0) <= 1;
  }
  return false;
}

/** Whether the same edge of two consecutive lines stacks: they end (or
 *  start) on the same word, or on the same characters, spaces included. */
export function edgesStack(a: Edge, b: Edge): boolean {
  return (a.word !== '' && a.word === b.word) || (a.chars !== '' && a.chars === b.chars);
}

/** What a stack between edges `a` and `b` costs, in units of
 *  `stackPenalty`: 2 for a repeated monosyllable, else 1 (0: no stack). */
export function stackWeight(a: Edge, b: Edge): number {
  if (!edgesStack(a, b)) return 0;
  return a.word !== '' && a.word === b.word && isMonosyllable(a.word) ? 2 : 1;
}
