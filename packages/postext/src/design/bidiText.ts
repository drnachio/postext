/**
 * Right-to-left text in designs and chips: running heads, opener titles,
 * contents part rows, callout titles and the runs of an inline chip.
 *
 * A design text line is laid out in logical order, as the body is: wrapping,
 * justification and truncation never look at direction. Once a line is
 * cut, {@link directRuns} resolves its bidi levels (UAX #9, `bidi.ts`) at
 * the text's base direction, cuts its runs where the level changes, flags
 * the right-to-left ones (`rtl`) and gives the order in which a renderer
 * advances through them (`order`). Renderers then paint run after run, each
 * shaped in its own direction, the same way on the canvas, in the HTML and
 * in the PDF.
 *
 * The order depends on the frame the line is painted in. Running heads and
 * folios stand on the sheet: their runs go in visual order, left to right.
 * A design set in the flow of a mirrored page (an opener band, a heading
 * design, a contents part row) is painted through the mirror, where the x
 * axis runs from the sheet's right edge: its runs go in the reverse of the
 * visual order, as {@link VDTLine.order} does for body lines. A chip is
 * measured blind to its frame, like the body line it sits in; the build's
 * mirror pass (`pipeline/mirrorFrame.ts`) turns its order on mirrored
 * pages.
 */

import { bidiClassOf, lineLevels, needsBidi, resolveParagraph, visualOrder } from '../bidi';
import { graphemeCount } from '../measure/graphemes';
import { flowTextWidth } from '../measure/vertical';
import type { VDTDesignTextBlock, VDTDesignTextRun } from '../vdt';

/** A run of a design text line or of a chip, as far as ordering it goes. */
interface Run {
  text: string;
  width: number;
  /** A subscript set over a superscript (width 0), or a run the author
   *  oriented in vertical text: never cut. */
  stacked?: boolean;
  tcy?: true;
  orientation?: 'upright' | 'sideways';
}

/** The direction of the first strong letter of `text` (UAX #9 P2, isolates
 *  not skipped), or undefined when it has none (digits, punctuation). */
export function firstStrongDirection(text: string): 'ltr' | 'rtl' | undefined {
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i)!;
    if (cp > 0xFFFF) i++;
    const cls = bidiClassOf(cp);
    if (cls === 'L') return 'ltr';
    if (cls === 'R' || cls === 'AL') return 'rtl';
  }
  return undefined;
}

/** The base direction a design text is set at: its own `direction`, where
 *  `'auto'` reads the first strong letter of `text`; else the document's. */
export function designBaseDirection(
  direction: 'ltr' | 'rtl' | 'auto' | undefined,
  text: string,
  documentDirection: 'ltr' | 'rtl',
): 'ltr' | 'rtl' {
  if (direction === 'ltr' || direction === 'rtl') return direction;
  if (direction === 'auto') return firstStrongDirection(text) ?? documentDirection;
  return documentDirection;
}

/** Runs cut where the direction changes, and the order to paint them in
 *  (see {@link directRuns}). */
export interface DirectedRuns<R> {
  runs: (R & { rtl?: true })[];
  /** Indices into `runs` in paint order; absent when that is 0 … n − 1. */
  order?: number[];
}

/**
 * The runs of one line (or one chip) ordered for painting: the line's bidi
 * levels resolved at `base` (UAX #9, rules L1 and L2 for the line), each run
 * cut where the level changes, the pieces at an odd level flagged `rtl`,
 * and the order to paint them in — the visual order, or its reverse when
 * `mirrored` (the line is painted through a mirrored flow frame; see the
 * module comment). Undefined when there is nothing to do: a left-to-right
 * line with no right-to-left character, or one whose text resolves to one
 * even level throughout.
 *
 * A piece takes `widthOf(run, text)` as its advance; the last piece of a
 * run takes what is left of the run's width, so the line advances exactly
 * as far as it was measured (kerning across a cut stays inside the run).
 * A stacked script or an oriented vertical run is never cut.
 */
export function directRuns<R extends Run>(
  runs: readonly R[],
  base: 'ltr' | 'rtl',
  mirrored: boolean,
  widthOf: (run: R, text: string) => number,
): DirectedRuns<R> | undefined {
  let text = '';
  for (const r of runs) text += r.text;
  if (text.length === 0) return undefined;
  if (base === 'ltr' && !needsBidi(text)) return undefined;
  const par = resolveParagraph(text, base);
  const levels = lineLevels(par);
  let odd = false;
  let mixed = false;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]! & 1) odd = true;
    if (levels[i] !== levels[0]) mixed = true;
  }
  if (!odd && !mixed) return undefined;
  const out: (R & { rtl?: true })[] = [];
  const pieceLevels: number[] = [];
  let at = 0;
  for (const run of runs) {
    const start = at;
    const end = at + run.text.length;
    at = end;
    if (run.text.length === 0) continue;
    const whole = run.stacked || run.tcy || run.orientation;
    // The cut points: every change of level inside the run.
    const cuts: number[] = [start];
    if (!whole) for (let i = start + 1; i < end; i++) if (levels[i] !== levels[i - 1]) cuts.push(i);
    cuts.push(end);
    let used = 0;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const a = cuts[k]!;
      const b = cuts[k + 1]!;
      const piece = text.slice(a, b);
      const last = k + 2 === cuts.length;
      const width = last ? run.width - used : widthOf(run, piece);
      used += width;
      const level = levels[a]!;
      const next = { ...run, text: piece, width } as R & { rtl?: true };
      if (level & 1) next.rtl = true;
      else delete next.rtl;
      out.push(next);
      pieceLevels.push(level);
    }
  }
  const visual = visualOrder(pieceLevels);
  const order = mirrored ? visual.reverse() : visual;
  const identity = order.every((v, i) => v === i);
  return identity ? { runs: out } : { runs: out, order };
}

/**
 * {@link directRuns} on every line of a design text block built by hand (a
 * callout's title, its continuation marker, a label tab), in place: lines
 * that need it get `runs` and `order`, and the block `direction` when
 * `base` is right to left. `trackingPx` is the tracking the lines were
 * measured with.
 */
export function directDesignTextBlock(
  block: VDTDesignTextBlock,
  base: 'ltr' | 'rtl',
  mirrored: boolean,
  trackingPx = 0,
): void {
  if (base === 'rtl') block.direction = 'rtl';
  for (const line of block.lines) {
    const runs: VDTDesignTextRun[] = line.runs ?? [{ text: line.text, fontString: block.fontString, width: line.width }];
    const directed = directRuns(runs, base, mirrored, (r, t) => Math.max(0, flowTextWidth(t, r.fontString) + trackingPx * graphemeCount(t)));
    if (!directed) continue;
    line.runs = directed.runs;
    if (directed.order) line.order = directed.order;
    else delete line.order;
  }
}

/**
 * A chip's runs ordered for painting (`VDTChipRun.rtl`, `VDTChip.order`):
 * {@link directRuns} at the base direction of the chip's own first strong
 * letter (left to right when it has none), in visual order — the build's
 * mirror pass reverses the order on mirrored pages. `measure` is the width
 * the chip's runs were measured with. The runs come back as they were when
 * nothing needs ordering.
 */
export function directChipRuns<R extends Run>(
  runs: R[],
  measure: (text: string, font: string) => number,
): { runs: (R & { rtl?: true })[]; order?: number[] } {
  let text = '';
  for (const r of runs) text += r.text;
  if (!needsBidi(text)) return { runs };
  const directed = directRuns(runs as (R & { fontString: string })[], firstStrongDirection(text) ?? 'ltr', false, (r, t) => measure(t, r.fontString));
  return directed ?? { runs };
}
