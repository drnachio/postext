// Design text with inline marks (`inlineMarks: true`): the resolved text is
// read as inline Markdown — bold, italic, superscript, subscript — and laid
// out as runs, each in its own font. The plain path in `layout.ts` measures
// whole strings; here every width is the sum of per-run widths, exactly as
// the renderers paint the runs one after another.

import { parseInlineFormatting } from '../parse/inlineFormatting';
import { buildFontString, measureTextWidth } from '../measure';
import { scriptMetrics, stackedScriptPairs } from '../measure/rich';
import { graphemeCount } from '../measure/graphemes';
import { hyphenateText } from '../hyphenate';
import { NO_BREAK_SPACES, isBreakingSpace } from '../measure/spaces';
import type { TextOverflow } from '../types';

/** One run of a design text line in its own font (see `VDTDesignTextRun`). */
export interface DesignTextRun {
  text: string;
  fontString: string;
  /** Advance of the run, tracking included. */
  width: number;
  /** Script offset off the baseline (px, positive down). */
  baselineShift?: number;
  /** The first of a subscript and a superscript set over each other: it
   *  advances nothing (width 0) and the next run is painted at its x. */
  stacked?: boolean;
}

interface RunStyle {
  font: string;
  shift?: number;
  /** The script, for stacking a subscript and a superscript that touch;
   *  `stackedShift` is a subscript's drop under a superscript. */
  script?: 'sup' | 'sub';
  stackedShift?: number;
}

/** A design text read for inline marks: its plain text (markers dropped)
 *  and the style of every character. */
export interface RichDesignText {
  text: string;
  /** Index into `styles` of each character of `text`. */
  styleAt: number[];
  /** `styles[0]` is the element's own font. */
  styles: RunStyle[];
  /** Whether any character is set in a style other than the element's. */
  hasMarks: boolean;
}

/** The element typography the runs derive from. */
export interface RichFontSpec {
  family: string;
  sizePx: number;
  weight: number;
  italic: boolean;
}

const fontFor = (spec: RichFontSpec, weight: number, italic: boolean): string =>
  buildFontString(spec.family, spec.sizePx, weight === 400 ? 'normal' : String(weight), italic ? 'italic' : 'normal');

/** Read `text` for inline marks. Bold runs take weight 700 (the element's
 *  own weight when it is heavier); italic runs flip the element's slant;
 *  scripts use the body text's script size and shift. */
export function parseRichDesignText(text: string, spec: RichFontSpec): RichDesignText {
  const styles: RunStyle[] = [{ font: fontFor(spec, spec.weight, spec.italic) }];
  const keys = new Map<string, number>([['0|0|', 0]]);
  let out = '';
  const styleAt: number[] = [];
  let hasMarks = false;
  for (const span of parseInlineFormatting(text)) {
    const key = `${span.bold ? 1 : 0}|${span.italic ? 1 : 0}|${span.script ?? ''}`;
    let idx = keys.get(key);
    if (idx === undefined) {
      const base = fontFor(spec, span.bold ? Math.max(700, spec.weight) : spec.weight, span.italic ? !spec.italic : spec.italic);
      const style: RunStyle = { font: base };
      if (span.script) {
        const m = scriptMetrics(base, span.script);
        style.font = m.font;
        style.shift = m.baselineShift;
        style.script = span.script;
        if (span.script === 'sub') style.stackedShift = scriptMetrics(base, 'sub', true).baselineShift;
      }
      idx = styles.length;
      styles.push(style);
      keys.set(key, idx);
    }
    if (idx !== 0) hasMarks = true;
    out += span.text;
    for (let i = 0; i < span.text.length; i++) styleAt.push(idx);
  }
  return { text: out, styleAt, styles, hasMarks };
}

/** The plain text of `text` read for inline marks: the markers dropped,
 *  as `parseRichDesignText` sets it. */
export function plainDesignText(text: string): string {
  return parseInlineFormatting(text).map((span) => span.text).join('');
}

/** A laid-out line: its visible pieces in order (a hyphen or an ellipsis
 *  is a piece of its own, in the style of the text beside it). */
type Piece = { text: string; style: number };

export interface RichLine {
  text: string;
  width: number;
  runs: DesignTextRun[];
}

/** `pieces` with the empty ones dropped and adjacent ones of one style
 *  merged, as the runs of a line are. */
function merge(pieces: Piece[]): Piece[] {
  const merged: Piece[] = [];
  for (const p of pieces) {
    if (p.text.length === 0) continue;
    const last = merged[merged.length - 1];
    if (last && last.style === p.style) last.text += p.text;
    else merged.push({ ...p });
  }
  return merged;
}

/** Measuring and run building over one rich text. */
export class RichMeasurer {
  constructor(readonly rt: RichDesignText, readonly letterSpacingPx: number) {}

  private widthOf(text: string, style: number): number {
    return Math.max(0, measureTextWidth(text, this.rt.styles[style]!.font) + this.letterSpacingPx * graphemeCount(text));
  }

  /** The pieces of `[a, b)`, one per change of style. */
  pieces(a: number, b: number): Piece[] {
    const out: Piece[] = [];
    let i = a;
    while (i < b) {
      const style = this.rt.styleAt[i]!;
      let j = i + 1;
      while (j < b && this.rt.styleAt[j] === style) j++;
      out.push({ text: this.rt.text.slice(i, j), style });
      i = j;
    }
    return out;
  }

  /** Width of `[a, b)` plus any extra pieces, as the runs will paint it: a
   *  subscript and a superscript that touch advance as far as the wider. */
  measure(a: number, b: number, ...extra: Piece[]): number {
    // Pieces as they come (a hyphen or an ellipsis measured apart), as
    // before; only the stacked pairs change the sum.
    const pieces = [...this.pieces(a, b), ...extra].filter((p) => p.text.length > 0);
    const widths = pieces.map((p) => this.widthOf(p.text, p.style));
    for (const i of stackedScriptPairs(pieces.map((p) => this.rt.styles[p.style]!.script))) {
      widths[i + 1] = Math.max(widths[i]!, widths[i + 1]!);
      widths[i] = 0;
    }
    let w = 0;
    for (const x of widths) w += x;
    return w;
  }

  /** Character ranges `[start, end)` of the subscripts and superscripts of
   *  `[a, b)` that are set over each other: a line never ends inside one. */
  stackedRanges(a: number, b: number): [number, number][] {
    const pieces = this.pieces(a, b);
    const starts: number[] = [];
    let k = a;
    for (const p of pieces) {
      starts.push(k);
      k += p.text.length;
    }
    return stackedScriptPairs(pieces.map((p) => this.rt.styles[p.style]!.script))
      .map((i) => [starts[i]!, starts[i + 1]! + pieces[i + 1]!.text.length]);
  }

  /** Style of the character at `i` (clamped to the text), for a hyphen or
   *  an ellipsis set beside it. */
  styleNear(i: number): number {
    if (this.rt.styleAt.length === 0) return 0;
    return this.rt.styleAt[Math.max(0, Math.min(i, this.rt.styleAt.length - 1))]!;
  }

  /** A line from its pieces: adjacent pieces of one style merge into a run. */
  line(pieces: Piece[]): RichLine {
    const merged = merge(pieces);
    let text = '';
    let width = 0;
    const runs: DesignTextRun[] = merged.map((p) => {
      const style = this.rt.styles[p.style]!;
      const w = this.widthOf(p.text, p.style);
      text += p.text;
      return style.shift !== undefined
        ? { text: p.text, fontString: style.font, width: w, baselineShift: style.shift }
        : { text: p.text, fontString: style.font, width: w };
    });
    // A subscript and a superscript that touch are set one over the other
    // (EF-80), as in the body.
    for (const i of stackedScriptPairs(merged.map((p) => this.rt.styles[p.style]!.script))) {
      const first = runs[i]!;
      const second = runs[i + 1]!;
      const subIdx = this.rt.styles[merged[i]!.style]!.script === 'sub' ? i : i + 1;
      const sub = runs[subIdx]!;
      sub.baselineShift = this.rt.styles[merged[subIdx]!.style]!.stackedShift ?? sub.baselineShift;
      second.width = Math.max(first.width, second.width);
      first.width = 0;
      first.stacked = true;
    }
    for (const r of runs) width += r.width;
    return { text, width, runs };
  }

  rangeLine(a: number, b: number, hyphen = false): RichLine {
    const pieces = this.pieces(a, b);
    if (hyphen) pieces.push({ text: '-', style: this.styleNear(b - 1) });
    return this.line(pieces);
  }
}

const SOFT_HYPHEN = '­';
/** A space the line may break at: a no-break space glues (EF-66). */
const isSpace = isBreakingSpace;

/** Where to cut a word `[a, b)` that does not fit `maxWidth`: at the last
 *  no-break space that leaves a head that fits (the next line opens after
 *  it, `next`), else at the last syllable break whose head (with its
 *  hyphen) fits, else at the last character that fits (at least one). A
 *  subscript and a superscript set over each other are never parted, as in
 *  the body (EF-80): the cut falls before the pair, or after it when the
 *  pair opens the word. */
function breakWord(m: RichMeasurer, a: number, b: number, maxWidth: number, hyphenate: boolean): { end: number; hyphen: boolean; next?: number } {
  const text = m.rt.text;
  const pairs = m.stackedRanges(a, b);
  const pairAround = (k: number): [number, number] | undefined => pairs.find(([s, e]) => k > s && k < e);
  for (let k = b - 2; k > a; k--) {
    if (!NO_BREAK_SPACES.includes(text[k]!) || NO_BREAK_SPACES.includes(text[k - 1]!) || pairAround(k)) continue;
    if (m.measure(a, k) <= maxWidth) return { end: k, hyphen: false, next: k + 1 };
  }
  if (hyphenate) {
    const word = m.rt.text.slice(a, b);
    const hy = hyphenateText(word);
    if (hy.includes(SOFT_HYPHEN) && hy.replaceAll(SOFT_HYPHEN, '') === word) {
      let best = -1;
      let k = 0;
      for (const part of hy.split(SOFT_HYPHEN).slice(0, -1)) {
        k += part.length;
        if (m.measure(a, a + k, { text: '-', style: m.styleNear(a + k - 1) }) > maxWidth) break;
        if (!pairAround(a + k)) best = k;
      }
      if (best > 0) return { end: a + best, hyphen: true };
    }
  }
  let lo = 1;
  let hi = b - a;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (m.measure(a, a + mid) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  const pair = pairAround(a + lo);
  if (pair) return { end: pair[0] > a ? pair[0] : pair[1], hyphen: false };
  return { end: a + lo, hyphen: false };
}

/** How many characters of the word `[a, b)` the line opened at `lineStart`
 *  can take up to a syllable break, with a hyphen, within `maxWidth`: the
 *  longest such head, or 0. A subscript and a superscript set over each
 *  other are never parted. */
function syllableFill(m: RichMeasurer, lineStart: number, a: number, b: number, maxWidth: number): number {
  const word = m.rt.text.slice(a, b);
  const hy = hyphenateText(word);
  if (!hy.includes(SOFT_HYPHEN) || hy.replaceAll(SOFT_HYPHEN, '') !== word) return 0;
  const pairs = m.stackedRanges(a, b);
  let best = 0;
  let k = 0;
  for (const part of hy.split(SOFT_HYPHEN).slice(0, -1)) {
    k += part.length;
    if (m.measure(lineStart, a + k, { text: '-', style: m.styleNear(a + k - 1) }) > maxWidth) break;
    if (!pairs.some(([s, e]) => a + k > s && a + k < e)) best = k;
  }
  return best;
}

/** Greedy word wrap of one paragraph `[start, end)` (no newline inside),
 *  line `i` being `widthFor(i)` wide. Leading spaces of the paragraph are
 *  kept, trailing spaces of every line dropped; a word wider than a line
 *  breaks by syllable (with `hyphenate`) or by character. */
export function wrapRich(
  m: RichMeasurer,
  start: number,
  end: number,
  widthFor: (i: number) => number,
  hyphenate: boolean,
  /** A justified text that hyphenates (EF-109): a word that does not fit
   *  the rest of a line is cut at its last syllable break that does. */
  fill = false,
): RichLine[] {
  const text = m.rt.text;
  const out: RichLine[] = [];
  let lineStart = -1; // -1: the line holds nothing yet
  let lineEnd = start;
  let maxW = Math.max(1, widthFor(0));
  const trimmedEnd = (a: number, b: number) => {
    while (b > a && isSpace(text[b - 1])) b--;
    return b;
  };
  const flush = (a: number, b: number, hyphen = false) => {
    out.push(m.rangeLine(a, hyphen ? b : trimmedEnd(a, b), hyphen));
    maxW = Math.max(1, widthFor(out.length));
  };
  let i = start;
  while (i < end) {
    let j = i + 1;
    const space = isSpace(text[i]);
    while (j < end && isSpace(text[j]) === space) j++;
    if (space) {
      // A space never breaks a line by itself: the next word decides.
      if (lineStart >= 0 || out.length === 0) {
        if (lineStart < 0) lineStart = i;
        lineEnd = j;
      }
      i = j;
      continue;
    }
    if (lineStart >= 0 && m.measure(lineStart, j) > maxW && trimmedEnd(lineStart, lineEnd) > lineStart) {
      const head = fill && hyphenate ? syllableFill(m, lineStart, i, j, maxW) : 0;
      if (head > 0) {
        // The line takes the word's head and a hyphen; its tail opens the
        // next line.
        flush(lineStart, i + head, true);
        lineStart = -1;
        i += head;
        continue;
      }
      flush(lineStart, lineEnd);
      lineStart = -1;
    } else if (lineStart >= 0 && m.measure(lineStart, j) > maxW) {
      // Only leading spaces on the line: drop them.
      lineStart = -1;
    }
    if (lineStart >= 0) {
      lineEnd = j;
      i = j;
      continue;
    }
    // The word opens a line; cut it while it is wider than the line.
    let a = i;
    while (m.measure(a, j) > maxW) {
      const cut = breakWord(m, a, j, maxW, hyphenate);
      if (cut.end >= j) break;
      flush(a, cut.end, cut.hyphen);
      a = cut.next ?? cut.end;
    }
    lineStart = a;
    lineEnd = j;
    i = j;
  }
  if (lineStart >= 0) flush(lineStart, lineEnd);
  else if (out.length === 0) out.push(m.line([]));
  return out;
}

// ---------------------------------------------------------------------------
// Truncation with an ellipsis — where the cut falls (shared with the plain
// path in `layout.ts`)
// ---------------------------------------------------------------------------

/** Characters a head cut before an ellipsis drops at its end: spaces,
 *  separators, dashes and opening brackets / quotes ("Rivers, …" →
 *  "Rivers…", "Part one — …" → "Part one…"). */
const DROP_BEFORE_ELLIPSIS = /[\s,;:\-‐‑–—/([{«‹“‘„¿¡]/u;
/** Characters a tail cut after an ellipsis drops at its start: spaces,
 *  separators, dashes, sentence ends and closing brackets / quotes. */
const DROP_AFTER_ELLIPSIS = /[\s,;:.!?…\-‐‑–—/)\]}»›”’]/u;
/** Where a word may end inside a run of letters: after a hyphen, a dash or
 *  a slash. Not after U+2011 NON-BREAKING HYPHEN, which glues its
 *  neighbours like a no-break space ("MS\u2011DOS" is one word). */
const JOINS_WORDS = /[\-\u2010\u2013\u2014/]/u;
// No-break spaces glue their neighbours ("225 000", "37 °C"): never a place
// to cut. `isBreakingSpace` (measure/spaces) already leaves them out (EF-66).

/** Whether `i` is a word boundary of `text[from, to)`: an end of the range,
 *  a (breaking) space on either side, or just after a hyphen, dash or
 *  slash. */
function isWordBoundary(text: string, i: number, from: number, to: number): boolean {
  if (i <= from || i >= to) return true;
  const before = text[i - 1]!;
  return isBreakingSpace(before) || isBreakingSpace(text[i]) || JOINS_WORDS.test(before);
}

/** The end of a head cut at `cut` once the spaces and joining punctuation
 *  before the ellipsis are dropped. */
function trimHead(text: string, from: number, cut: number): number {
  while (cut > from && DROP_BEFORE_ELLIPSIS.test(text[cut - 1]!)) cut--;
  return cut;
}

/** The start of a tail cut at `cut` once the spaces and punctuation after
 *  the ellipsis are dropped. */
function trimTail(text: string, to: number, cut: number): number {
  while (cut < to && DROP_AFTER_ELLIPSIS.test(text[cut]!)) cut++;
  return cut;
}

/** Where an `ellipsis-end` truncation of `text[from, to)` ends, given `fit`
 *  — the end of the longest head that fits beside the ellipsis. The cut
 *  moves back to the last word boundary, and the spaces and joining
 *  punctuation before the ellipsis are dropped — unless what is left keeps
 *  less than half of what fits (a single long word, a URL): then the word
 *  is cut where it must. Never past `fit`, so the head still fits. */
export function ellipsisEndCut(text: string, from: number, to: number, fit: number): number {
  if (!isWordBoundary(text, fit, from, to)) {
    let b = fit - 1;
    while (b > from && !isWordBoundary(text, b, from, to)) b--;
    if (b > from) {
      const head = trimHead(text, from, b);
      // The guard counts what is kept, after the trim.
      if (head - from >= (fit - from) / 2) return head;
    }
  }
  return trimHead(text, from, fit);
}

/** Where an `ellipsis-start` truncation of `text[from, to)` starts, given
 *  `fit` — the start of the longest tail that fits beside the ellipsis: the
 *  mirror of `ellipsisEndCut`. Never before `fit`. */
export function ellipsisStartCut(text: string, from: number, to: number, fit: number): number {
  if (!isWordBoundary(text, fit, from, to)) {
    let b = fit + 1;
    while (b < to && !isWordBoundary(text, b, from, to)) b++;
    if (b < to) {
      const tail = trimTail(text, to, b);
      if (to - tail >= (to - fit) / 2) return tail;
    }
  }
  return trimTail(text, to, fit);
}

/** An `ellipsis-middle` truncation keeping `text[from, from + left)` and
 *  `text[to - right, to)`, with the spaces that would touch the ellipsis
 *  dropped. */
export function ellipsisMiddleCut(text: string, from: number, to: number, left: number, right: number): { left: number; right: number } {
  while (left > 0 && isSpace(text[from + left - 1])) left--;
  while (right > 0 && isSpace(text[to - right])) right--;
  return { left, right };
}

/** One explicit line `[s, e)` set on a single line: whole, clipped by the
 *  renderer, or truncated with an ellipsis at `mode` (the cut placed by
 *  `ellipsisEndCut` / `ellipsisStartCut` / `ellipsisMiddleCut`). */
export function singleRichLine(m: RichMeasurer, s: number, e: number, maxWidth: number, overflow: TextOverflow): RichLine {
  if (overflow === 'clip' || m.measure(s, e) <= maxWidth) return m.rangeLine(s, e);
  const text = m.rt.text;
  const ell = (style: number) => ({ text: '…', style });
  const len = e - s;
  if (overflow === 'ellipsis-start') {
    // The ellipsis takes the style of the character after it.
    const fitsFrom = (a: number) => m.measure(a, e, ell(m.styleNear(a))) <= maxWidth;
    let a = s;
    while (a <= e && !fitsFrom(a)) a++;
    if (a > e) return m.line([]);
    a = ellipsisStartCut(text, s, e, a);
    // A tail moved on to a word boundary puts the ellipsis beside another
    // character, whose style may be wider: measure again.
    while (a < e && !fitsFrom(a)) a = ellipsisStartCut(text, s, e, a + 1);
    return m.line([ell(m.styleNear(a)), ...m.pieces(a, e)]);
  }
  if (overflow === 'ellipsis-middle') {
    let left = 0;
    let right = 0;
    const fits = (l: number, r: number) => m.measure(s, s + l, ell(m.styleNear(s + l - 1)), ...m.pieces(e - r, e)) <= maxWidth;
    if (!fits(0, 0)) return m.line([]);
    while (left + right < len) {
      if (!fits(left + 1, right)) break;
      left++;
      if (left + right >= len) break;
      if (!fits(left, right + 1)) break;
      right++;
    }
    ({ left, right } = ellipsisMiddleCut(text, s, e, left, right));
    return m.line([...m.pieces(s, s + left), ell(m.styleNear(s + left - 1)), ...m.pieces(e - right, e)]);
  }
  // ellipsis-end: the ellipsis takes the style of the character before it,
  // so a head moved back to a word boundary is measured again in case that
  // style is wider.
  const fitsTo = (b: number) => m.measure(s, b, ell(m.styleNear(b - 1))) <= maxWidth;
  let b = e;
  while (b >= s && !fitsTo(b)) b--;
  if (b < s) return m.line([]);
  let cut = ellipsisEndCut(text, s, e, b);
  while (cut > s && !fitsTo(cut)) cut = ellipsisEndCut(text, s, e, cut - 1);
  return m.line([...m.pieces(s, cut), ell(m.styleNear(cut - 1))]);
}
