import type { VDTLine, VDTLineSegment } from '../vdt.js';
import { lineWordSegmentsInOrder, sameSetWidth, type SetLine } from '../paint/wordPieces.js';
import { graphemeCount } from '../measure/graphemes.js';
import { measurementGeneration } from '../measure/canvas.js';
import { languageOf, setLetterSpacing } from './contextState.js';
import { inSegmentLanguage } from './wordRuns.js';
import { contextTextWidth } from './contextText.js';
import { verticalFlowAdvance } from './verticalText.js';

/**
 * The segments the canvas paints a line from (#770): the line's own, the
 * pieces of a word joined where the word was measured whole and the
 * hyphen of a line end set apart where it was measured apart
 * (`lineWordSegments`, the rule the HTML and the PDF apply).
 *
 * The context that paints is the one asked: a text is joined when this
 * canvas, in the font and the language it paints in, sets it as wide as
 * the layout measured its pieces together. A tracked line was measured at
 * its natural widths plus the tracking after each letter (#663), so the
 * context measures with no letter-spacing and the tracking is counted.
 *
 * A ragged line in one style is painted as one text, which is faster.
 * Not when that text is not as wide as its segments were measured
 * together ({@link paintsAsOneText}): the pieces of a plain paragraph's
 * words were measured one by one, and a face that kerns across a cut
 * (the `r` and the `q` of `per|qu`) sets the line shorter as one text
 * than the places of its words. Nor a line with a character past U+00FF
 * and a word of Latin-1 characters with no letter: in such a string the
 * browser takes each word alone and draws that word by the font's default
 * rules, where the layout measured it in a string of its own, in Latin
 * forms (`contextText.ts`). `"好" '行' 2016 10 3 #12 $5 50% 37% (3) 2020`
 * in Noto Serif SC at 10 px is 198.52 px word by word and 197.26 px as
 * one text.
 *
 * A line is asked once: its answers are kept by its segments, for the
 * language, the tracking and the font it was given under, until a face
 * arrives (the measurement generation) or its segments change.
 */

/** What is known of a line. */
interface Painted {
  key: string;
  /** The segments it is painted from, and the order they advance in. */
  set?: SetLine;
  /** Whether its text set as one is as wide as its segments. */
  whole?: boolean;
}

/** A line's segments → what is known of the line. */
const painted = new WeakMap<VDTLineSegment[], Painted>();

/** What is known of the line of `segments` under the faces loaded, the
 *  language and the `tracking` painted in and the line's `font`, with its
 *  segments as they are; nothing yet when any of those changed. */
function knownOf(ctx: CanvasRenderingContext2D, line: VDTLine, segments: VDTLineSegment[], tracking: number, font: string): Painted {
  let widths = 0;
  for (const seg of segments) widths += seg.width;
  const key = `${measurementGeneration()}\u0000${languageOf(ctx) ?? ''}\u0000${tracking}\u0000${segments.length}\u0000${widths}\u0000${line.hyphenated === true}\u0000${font}`;
  let known = painted.get(segments);
  if (known?.key !== key) painted.set(segments, known = { key });
  return known;
}

/**
 * The segments to paint `line` from, and the order to advance through
 * them in when the line carries one (`VDTLine.order`: a line with
 * right-to-left text, any line of a mirrored page; the pieces of a
 * left-to-right word are joined there too, and the order written for the
 * segments that result). `composed`: a line of the CJK composer, painted
 * as it is. A line set word by word down a vertical page is asked as any
 * other, each text at the advance the vertical painter gives it: a Latin
 * word runs sideways down the column, shaped as on a horizontal line, and
 * a piece of it is as wide as the word grew by it. Chrome 154, Noto Sans
 * JP at 14.58 px under `ja`: the layout holds `BY-` 21.01 and `SA` 17.23
 * px, `BY-SA` being 38.24 px, where `SA` alone is 17.55 px; painted piece
 * by piece `SA` ran 0.32 px into the space after it. `tracking` is the
 * context's `letterSpacing` on entry, px, and on return; `fontOf` gives the font
 * string a segment is painted in. The context's font is left at any
 * value: the painter sets its own before each text.
 */
export function paintedSegments(
  ctx: CanvasRenderingContext2D,
  line: VDTLine,
  composed: boolean,
  tracking: number,
  fontOf: (seg: VDTLineSegment) => string,
): SetLine {
  const segments = line.segments;
  const order = segments && !composed && line.order?.length === segments.length ? line.order : undefined;
  if (!segments || segments.length === 0 || composed || typeof ctx.measureText !== 'function') return { segments, order };
  const known = knownOf(ctx, line, segments, tracking, fontOf(segments[0]!));
  if (known.set) return known.set;
  let font = '';
  let spaced = tracking !== 0;
  known.set = lineWordSegmentsInOrder(line, composed, (seg, text) => {
    if (spaced) {
      setLetterSpacing(ctx, 0);
      spaced = false;
    }
    let width = 0;
    inSegmentLanguage(ctx, seg, () => {
      const own = fontOf(seg);
      if (own !== font) ctx.font = font = own;
      // Down a vertical page a text advances as its cells and its
      // sideways runs do (`verticalFlowAdvance`).
      width = verticalFlowAdvance(ctx, text, tracking)
        ?? contextTextWidth(ctx, text) + (tracking === 0 ? 0 : tracking * graphemeCount(text));
    });
    return width;
  });
  if (tracking !== 0 && !spaced) setLetterSpacing(ctx, tracking);
  return known.set;
}

/** A character past Latin-1 (see `contextText.ts`). */
const WIDE_RE = /[^\u0000-\u00FF]/;
const LETTER_RE = /\p{L}/u;

/** Whether the browser may set the line's text otherwise as one text than
 *  segment by segment: two of its pieces touch (a pair kerned across the
 *  cut), the line ends on a hyphen the layout added (measured apart from
 *  its word, and a face may kern the two: at 20 px Fira Sans sets `lec-`
 *  0.86 px narrower than `lec` and `-`, Crimson Pro `bo-` 0.29 px wider),
 *  or its text holds a character past U+00FF and one of its words is of
 *  Latin-1 characters with no letter among them. */
function mayDifferWhole(line: VDTLine, segments: VDTLineSegment[]): boolean {
  if (line.hyphenated === true && !line.hardHyphen) {
    const last = segments[segments.length - 1];
    if (last?.kind === 'text' && last.text.length > 1 && last.text.endsWith('-')) return true;
  }
  const wide = WIDE_RE.test(line.text);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind === 'space') continue;
    if (i > 0 && segments[i - 1]!.kind !== 'space') return true;
    if (wide && seg.kind === 'text' && !WIDE_RE.test(seg.text) && !LETTER_RE.test(seg.text)) return true;
  }
  return false;
}

/**
 * Whether a line's text, painted with one `fillText` in the context's
 * font (the line's `font`, set by the caller), is as wide as the layout
 * measured its segments together. `tracking` is the context's
 * `letterSpacing` on entry, px, and on return. A line with no two pieces
 * that touch and no word the browser shapes otherwise inside a longer
 * string is, with nothing asked: its words and its spaces were measured
 * whole. So is any line where the context does not measure.
 */
export function paintsAsOneText(ctx: CanvasRenderingContext2D, line: VDTLine, tracking: number, font: string): boolean {
  const segments = line.segments;
  if (!segments || typeof ctx.measureText !== 'function' || !mayDifferWhole(line, segments)) return true;
  const known = knownOf(ctx, line, segments, tracking, font);
  if (known.whole === undefined) {
    let measured = 0;
    let widest = 0;
    for (const seg of segments) {
      measured += seg.width;
      if (seg.width > widest) widest = seg.width;
    }
    if (tracking !== 0) setLetterSpacing(ctx, 0);
    const set = contextTextWidth(ctx, line.text) + (tracking === 0 ? 0 : tracking * graphemeCount(line.text));
    if (tracking !== 0) setLetterSpacing(ctx, tracking);
    // What a kerned pair moves is small beside a line: the difference is
    // weighed against the line's widest word, as a word's pieces are.
    known.whole = sameSetWidth(widest + set - measured, widest);
  }
  return known.whole;
}
