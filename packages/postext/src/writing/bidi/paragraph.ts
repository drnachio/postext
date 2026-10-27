// A paragraph's resolution: its classes, isolates and options, and the
// spans of a run of directed text.
import type { InlineDirection } from '../../parse/types.js';
import { classCode, TAIL, LRI, RLI, PDI } from './chars.js';
import { resolveClasses } from './resolve.js';

/** A paragraph's base direction as configured: `auto` takes it from the
 *  first strong letter (rules P2–P3), left to right when there is none. */
export type BaseDirection = 'ltr' | 'rtl' | 'auto';

// ---------------------------------------------------------------------------
// Paragraph resolution

/** The embedding levels of one paragraph, before any line is cut. */
export interface BidiParagraph {
  /** The paragraph's text, in logical order. */
  readonly text: string;
  /** The paragraph embedding level: 0 left to right, 1 right to left. */
  readonly paragraphLevel: number;
  /** Resolved embedding level of each UTF-16 unit (rules X1–I2; L1 is per
   *  line, see {@link lineLevels}). Odd levels run right to left. */
  readonly levels: Uint8Array;
  /** Each unit's original `Bidi_Class` code: what L1 reads. */
  readonly classes: Uint8Array;
}

/** A stretch of a paragraph set as an isolate of its own direction (an
 *  inline `:rtl[…]` / `:ltr[…]`), as if it were wrapped in RLI/LRI … PDI:
 *  `[start, end)` in UTF-16 units. Isolates nest or are disjoint. */
export interface BidiIsolate {
  start: number;
  end: number;
  direction: 'ltr' | 'rtl';
}

/** The class codes of a text, one per UTF-16 unit (a pair's second unit is
 *  {@link TAIL}). */
function classesOf(text: string): Uint8Array {
  const n = text.length;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = text.charCodeAt(i);
    if (u >= 0xD800 && u <= 0xDBFF && i + 1 < n) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        out[i] = classCode(((u - 0xD800) << 10) + (lo - 0xDC00) + 0x10000);
        out[++i] = TAIL;
        continue;
      }
    }
    out[i] = classCode(u);
  }
  return out;
}

/** What the engine reads on top of UAX #9 when it resolves a paragraph. */
export interface BidiOptions {
  /**
   * The paragraph belongs to a document written in the Arabic script
   * (#665). Rule W2 reads European digits as an Arabic number when an
   * Arabic letter comes before them, so `شكل 3-1` orders its two numbers
   * from right to left, as `شكل ٣-١` does; the same number with no letter
   * before it (`3-1 الأبواب`, a heading's number, or `3-1` alone in a
   * contents column) would stay a left-to-right `3-1`, the 3 on the left,
   * and one book would print one number two ways. With this option a
   * European number that opens a right-to-left run (a paragraph, an
   * isolate) is read as the numbers after the document's letters are, as
   * an Arabic number: the start of the run counts as an Arabic letter for
   * rule W2. The digits of a number never change order; only how a
   * hyphen, a plus or a percent sign beside it joins it to the next
   * number. Left-to-right runs are not touched.
   */
  arabicNumbers?: boolean;
}

/**
 * Resolve the embedding levels of one paragraph (UAX #9 up to I2). `base`
 * is the paragraph direction: `ltr`, `rtl`, or `auto` for the direction of
 * its first strong letter (left to right when it has none). `isolates`
 * sets stretches of the text as directional isolates, as if their bounds
 * held RLI/LRI and PDI controls (the inline `:rtl[…]` and `:ltr[…]`); the
 * text itself may also hold the Unicode controls. A paragraph separator
 * (`B`) ends the embeddings opened before it, as at the end of a paragraph;
 * callers split the text at paragraph breaks first (rule P1). `options`
 * are the engine's own readings on top of the algorithm
 * ({@link BidiOptions}); without them the result is UAX #9's.
 */
export function resolveParagraph(text: string, base: BaseDirection = 'auto', isolates?: readonly BidiIsolate[], options?: BidiOptions): BidiParagraph {
  const classes = classesOf(text);
  const baseLevel = base === 'rtl' ? 1 : base === 'ltr' ? 0 : -1;
  const arabicLead = options?.arabicNumbers === true;
  if (!isolates || isolates.length === 0) {
    const { levels, paragraphLevel } = resolveClasses(classes, baseLevel, text, null, arabicLead);
    return { text, paragraphLevel, levels, classes };
  }
  // Insert the isolate controls as virtual characters, resolve, and read
  // the levels of the text's own characters back.
  const opens: BidiIsolate[] = [...isolates].filter((s) => s.end >= s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const closes = [...opens].sort((a, b) => a.end - b.end || b.start - a.start);
  const total = text.length + opens.length * 2;
  const ext = new Uint8Array(total);
  const map = new Int32Array(total);
  let o = 0;
  let c = 0;
  let k = 0;
  for (let i = 0; i <= text.length; i++) {
    while (c < closes.length && closes[c]!.end === i) { ext[k] = PDI; map[k++] = -1; c++; }
    while (o < opens.length && opens[o]!.start === i) { ext[k] = opens[o]!.direction === 'rtl' ? RLI : LRI; map[k++] = -1; o++; }
    if (i < text.length) { ext[k] = classes[i]!; map[k++] = i; }
  }
  const resolved = resolveClasses(ext, baseLevel, text, map, arabicLead);
  const levels = new Uint8Array(text.length);
  for (let j = 0; j < total; j++) if (map[j]! >= 0) levels[map[j]!] = resolved.levels[j]!;
  return { text, paragraphLevel: resolved.paragraphLevel, levels, classes };
}

/** A span of a parsed paragraph as {@link resolveSpans} reads it. */
interface DirectedSpan {
  text: string;
  direction?: InlineDirection;
}

/** The chain of isolates a span sits in, outermost first. */
function isolateChain(d: InlineDirection | undefined): InlineDirection[] {
  const chain: InlineDirection[] = [];
  for (let at = d; at; at = at.outer) chain.unshift(at);
  return chain;
}

/**
 * The isolates of a paragraph's spans (`InlineSpan.direction`, set by
 * `:rtl[…]` and `:ltr[…]`) as ranges of their joined text. Spans of one
 * isolate share its `id`; an isolate nested in another names it as `outer`.
 */
export function spanIsolates(spans: readonly DirectedSpan[]): BidiIsolate[] {
  const out: BidiIsolate[] = [];
  const open: { d: InlineDirection; start: number }[] = [];
  let at = 0;
  const closeTo = (depth: number): void => {
    while (open.length > depth) {
      const top = open.pop()!;
      out.push({ start: top.start, end: at, direction: top.d.dir });
    }
  };
  for (const span of spans) {
    const chain = isolateChain(span.direction);
    let same = 0;
    while (same < open.length && same < chain.length && open[same]!.d.id === chain[same]!.id && open[same]!.d.dir === chain[same]!.dir) same++;
    closeTo(same);
    for (let i = same; i < chain.length; i++) open.push({ d: chain[i]!, start: at });
    at += span.text.length;
  }
  closeTo(0);
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

/** {@link resolveParagraph} for a paragraph given as its spans: the text is
 *  their texts joined, and their `direction` isolates apply. */
export function resolveSpans(spans: readonly DirectedSpan[], base: BaseDirection = 'auto'): BidiParagraph {
  let text = '';
  for (const s of spans) text += s.text;
  return resolveParagraph(text, base, spanIsolates(spans));
}
