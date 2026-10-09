import type { VDTLine } from '../vdt';
import type { CjkWordBreak, TextAlign, WritingMode } from '../types';
import type { CjkLineBreakLevel } from './cjkClasses';
import type { CjkComposition } from './cjkPunctuation';

/** Where the Knuth–Plass breaker broke a paragraph: the path it ran on
 *  (the plain and the rich path number their items differently) and the
 *  item position each line ends at, in order. */
export interface BreakTrace {
  path: 'plain' | 'rich';
  at: readonly number[];
}

/** A change of measure inside a paragraph (see
 *  `MeasureBlockOptions.restWidths`). */
export interface LineWidthStep {
  /** First line (0-based) set at this width. */
  fromLine: number;
  /** The measure of that line and the ones after it, before any indent. */
  maxWidthPx: number;
}

/** The measure of line `lineIndex` (before its indent): the width of the
 *  last step at or before it, else `maxWidthPx`. */
export function lineMeasure(maxWidthPx: number, steps: readonly LineWidthStep[] | undefined, lineIndex: number): number {
  let width = maxWidthPx;
  if (steps) for (const s of steps) if (s.fromLine <= lineIndex) width = s.maxWidthPx;
  return width;
}

/** Lines of a paragraph set short on either side (see
 *  `MeasureBlockOptions.lineInsets`): the lines beside a picture that
 *  text wraps round (#627). The sides are the measurer's: `start` is the
 *  side the lines are set from (the flow's left; the indent's side), `end`
 *  the other. A paragraph set against its frame's direction keeps them
 *  where they are when its lines are mirrored (`mirrorLineSpans`). */
export interface LineInsetStep {
  /** First line (0-based) set short. */
  fromLine: number;
  /** Last line (0-based, inclusive) set short; unset, every later line. */
  toLine?: number;
  /** Room taken off the start side (px), before the line's own indent. */
  startInsetPx: number;
  /** Room taken off the end side (px). */
  endInsetPx: number;
}

/** The insets of line `li` (0-based): the sum of the steps that cover it. */
export function lineInsetsAt(steps: readonly LineInsetStep[] | undefined, li: number): { start: number; end: number } {
  let start = 0;
  let end = 0;
  if (steps) {
    for (const s of steps) {
      if (s.fromLine > li || (s.toLine !== undefined && s.toLine < li)) continue;
      start += Math.max(0, s.startInsetPx);
      end += Math.max(0, s.endInsetPx);
    }
  }
  return { start, end };
}

/** The largest inset (both sides together) any line takes. */
export function maxLineInset(steps: readonly LineInsetStep[] | undefined): number {
  if (!steps || steps.length === 0) return 0;
  let max = 0;
  for (const s of steps) {
    const at = lineInsetsAt(steps, s.fromLine);
    max = Math.max(max, at.start + at.end);
  }
  return max;
}

/** Where line `li` starts, from the measure's start (px): its indent
 *  (`lineIndentAt`) past its start inset (`lineInsets`). */
export function lineStartAt(options: MeasureBlockOptions | undefined, li: number): number {
  const inset = options?.lineInsets ? lineInsetsAt(options.lineInsets, li).start : 0;
  return inset + lineIndentAt(options, li);
}

/** The room line `li` breaks to (px): its measure (`lineMeasure`) less
 *  its insets and its indent. */
export function lineWidthAt(maxWidthPx: number, options: MeasureBlockOptions | undefined, li: number): number {
  const end = options?.lineInsets ? lineInsetsAt(options.lineInsets, li).end : 0;
  return lineMeasure(maxWidthPx, options?.restWidths, li) - end - lineStartAt(options, li);
}

/** Give each line set short beside a picture (`lineInsets`, #627) its
 *  span (`VDTLine.measure`, flagged `wrap`): from its start (`bbox.x`, its
 *  inset and indent) to its measure less its end inset. Renderers justify
 *  and align the line in it. Lines with no inset are left as they are. */
export function markInsetLines(lines: VDTLine[], maxWidthPx: number, options: MeasureBlockOptions | undefined): void {
  const steps = options?.lineInsets;
  if (!steps || steps.length === 0) return;
  lines.forEach((line, li) => {
    const { start, end } = lineInsetsAt(steps, li);
    if (!(start > 0) && !(end > 0)) return;
    const width = Math.max(0, lineMeasure(maxWidthPx, options.restWidths, li) - end - line.bbox.x);
    line.measure = { x: line.bbox.x, width, wrap: true };
  });
}

/** The line from which the measure stops changing: after the first line
 *  (its indent), after the last step, after the last entry of an indent
 *  table (`lineIndentsPx`: the lines a drop cap shortens, #623) and after
 *  the last line set short beside a picture (`lineInsets`, #627). */
export function uniformMeasureFrom(steps: readonly LineWidthStep[] | undefined, indents?: readonly number[], insets?: readonly LineInsetStep[]): number {
  let from = Math.max(1, (indents?.length ?? 0) - 1);
  if (steps) for (const s of steps) from = Math.max(from, s.fromLine);
  if (insets) for (const s of insets) from = Math.max(from, s.toLine !== undefined ? s.toLine + 1 : s.fromLine);
  return from;
}

/** The indent of line `li` (0-based) the options ask for: its entry in
 *  `lineIndentsPx`, else the first-line indent on line 0 (or, hanging, on
 *  every line but line 0). Never negative. */
export function lineIndentAt(options: MeasureBlockOptions | undefined, li: number): number {
  const table = options?.lineIndentsPx;
  if (table && table.length > 0) return Math.max(0, table[Math.min(li, table.length - 1)]!);
  const indent = options?.firstLineIndentPx ?? 0;
  if (!(indent > 0)) return 0;
  return options?.hangingIndent ? (li === 0 ? 0 : indent) : (li === 0 ? indent : 0);
}

/** The largest indent any line of the block takes (see {@link lineIndentAt}). */
export function maxLineIndent(options: MeasureBlockOptions | undefined): number {
  const table = options?.lineIndentsPx;
  if (table && table.length > 0) return Math.max(0, ...table);
  return Math.max(0, options?.firstLineIndentPx ?? 0);
}

export interface MeasuredBlock {
  lines: VDTLine[];
  totalHeight: number;
  /** Set on the Knuth–Plass path: where each line was broken. Pass its
   *  head as `MeasureBlockOptions.keepBreaks` to break the same text again
   *  with those lines kept. */
  breaks?: BreakTrace;
  /** Set on the optimal path when runt avoidance is on and the paragraph
   *  still ends in one: its last line is narrower than the runt threshold.
   *  The pipeline may then set the paragraph a line shorter (see
   *  `bodyText.tightenRunts`). */
  lastLineRunt?: boolean;
}

export interface MeasurementCache {
  _blocks: Map<string, MeasuredBlock>;
}

export interface MeasureBlockOptions {
  textAlign?: TextAlign;
  hyphenate?: boolean;
  /** The first line's indent (px); with {@link hangingIndent}, the indent
   *  of every line but the first instead. A negative value counts as 0.
   *  {@link lineIndentsPx} takes the place of both when set. */
  firstLineIndentPx?: number;
  hangingIndent?: boolean;
  /** The indent of each line (px, from the measure's start) in line
   *  order, from line 0; the last entry holds for every line after it.
   *  `[first, rest]` pairs a first-line indent with a hanging one (a
   *  paragraph style that sets both, a turnover of verse, #620); a longer
   *  table indents the first lines each its own way. Takes the place of
   *  {@link firstLineIndentPx} and {@link hangingIndent} when set; see
   *  {@link lineIndentAt}. Joins the cache key only when set. */
  lineIndentsPx?: readonly number[];
  /** The label column of a numbered bibliography entry (#290), in px from
   *  the line's start: the spans' `labelTab` spaces are widened so the
   *  entry's text starts there. */
  labelColumnPx?: number;
  /** The paragraph's tab stops (#622, `measure/tabs.ts`): where its tabs
   *  (`InlineSpan.tab`) send the text after them. A paragraph that holds a
   *  tab is set line by line, whatever {@link optimal} says. Unset: a tab
   *  without a stop of its own (`:tab{at=…}`) is a word space. Joins the
   *  cache key only when set. */
  tabs?: import('./tabs').TabSettings;
  /** Use Knuth-Plass optimal line breaking instead of greedy. */
  optimal?: boolean;
  /** Max space stretch ratio (for K-P glue model). Default 1.5. */
  maxStretchRatio?: number;
  /** Min space shrink ratio (for K-P glue model). Default 0.8. */
  minShrinkRatio?: number;
  /** Demerit for a too-short final line (runt). 0 disables. */
  runtPenalty?: number;
  /** Approximate minimum characters on the final line before runt penalty
   *  applies. Converted internally to a pixel threshold via normal space width. */
  runtMinCharacters?: number;
  /** Scale the runt penalty by the last line's shortfall under the
   *  threshold (`BodyTextConfig.gradedRuntPenalty`). Joins the cache key
   *  only when set. */
  runtGraded?: boolean;
  /** Line numbers (1-based) that should not end on a hyphen: the lines a
   *  column or a page ends on (`BodyTextConfig.hyphenateAcrossColumns`).
   *  Knuth–Plass path only. Joins the cache key only when set. */
  avoidHyphenAtLines?: readonly number[];
  /** The first line breaks of an earlier setting of the same text, with the
   *  same options otherwise (its `MeasuredBlock.breaks`, cut to the lines
   *  to keep): those lines come out as they were, and the rest of the
   *  paragraph is broken again. A paragraph broken again after its first
   *  lines were placed passes theirs (`hyphenateAcrossColumns: false`).
   *  Knuth–Plass path only, and only on the path the breaks were traced
   *  on. Such a measurement is never cached: `cachedMeasureBlock` and
   *  `cachedMeasureRichBlock` measure it afresh and leave their cache as it
   *  was. */
  keepBreaks?: BreakTrace;
  /** Other measures for the later lines of the paragraph, in line order:
   *  from line `fromLine` (0-based) on, lines are broken at `maxWidthPx`
   *  instead of the block's width, until the next entry. A paragraph that
   *  runs on into a column of another width (a one-and-a-half layout with
   *  text in both columns) is broken again this way, with the lines it
   *  already placed kept by `keepBreaks`. Every breaker honours it. Such a
   *  measurement is never cached. */
  restWidths?: readonly LineWidthStep[];
  /** Lines set short on either side (#627, see {@link LineInsetStep}): the
   *  lines of a paragraph beside a picture that text wraps round. A line
   *  starts past its start inset (its indent after it) and breaks to its
   *  measure less both insets; `VDTLine.bbox.x` and `VDTLine.measure`
   *  carry them. Every breaker honours it. Such a measurement is never
   *  cached. */
  lineInsets?: readonly LineInsetStep[];
  /** Knuth-Plass looseness: re-break the paragraph with this many lines more
   *  (column balancing's "run a paragraph long" lever) or fewer — negative —
   *  when a feasible sequence of that length exists. Ignored on the greedy
   *  path. */
  looseness?: number;
  /** Tracking: extra advance added after every character (px). Column
   *  balancing uses a little positive tracking on a loose paragraph when
   *  word spacing alone cannot gain the line, and a little negative tracking
   *  to set a paragraph short and pull up a runt. Rich path only. */
  letterSpacingPx?: number;
  /** Hyphenation zone for ragged text (px): a word that does not fit is
   *  split at a dictionary syllable only when sending it whole to the next
   *  line would leave more than this much empty space at the line end. Hard
   *  hyphens, URL joints and words wider than the line break as always.
   *  Unset: every dictionary syllable is a candidate, as on justified text.
   *  Only meaningful with `hyphenate` on the greedy (ragged) path. */
  hyphenationZonePx?: number;
  /** Tracking a justified line may take on the Knuth–Plass path, in px
   *  after every character either way, when its word spaces alone would set
   *  it past `maxStretchRatio` or `minShrinkRatio`: the body's
   *  `maxJustifyTracking` at the text size. The line records it as
   *  `VDTLine.letterSpacing`. Unset or 0: off. */
  justifyTrackingPx?: number;
  /** Kashida justification (`bodyText.kashida`, #375; `measure/kashida.ts`):
   *  a justified paragraph's Arabic words count their elongation as stretch
   *  in Knuth–Plass, and its lines but the last fill their slack with
   *  tatweels before their spaces. Rich path only (a paragraph with
   *  right-to-left text always takes it). Unset: off. */
  kashida?: import('./kashida').KashidaOptions;
  /** Let a line end after an em or en dash set closed between words ("say—
   *  that’s", "riddles.—I"; see `breaksAfterDash`), on the Knuth–Plass path
   *  as well as line by line (`BodyTextConfig.breakAfterDashes`). Unset:
   *  Knuth–Plass never breaks there, and the line-by-line breaker of the
   *  rich path only between two letters, as up to postext 1.4. Pretext's
   *  own first-fit breaker (plain text set line by line) keeps its rules
   *  either way. */
  breakAfterDashes?: boolean;
  /** Break a ragged block (`textAlign` left, right or centre) with
   *  Knuth–Plass too, when `optimal` is on (`BodyTextConfig.optimalRagged`):
   *  word spaces keep their width, a line may fall short of the measure
   *  (`RAGGED_STRETCH_EM` of the text size costs what a justified line at
   *  its stretch limit does), and the runt penalty, `looseness` and
   *  `avoidHyphenAtLines` apply as on justified text. A line may end after
   *  a hyphen the text carries between two letters on the plain path too,
   *  as pretext's line-by-line breaker and the rich path allow. With
   *  `hyphenationZonePx` a dictionary syllable is taken only where sending
   *  the word whole down would leave more than the zone empty. Unset: ragged
   *  text is set line by line, as up to postext 1.4. */
  optimalRagged?: boolean;
  /** Let Knuth–Plass end a justified line after the hyphen of a compound
   *  (a hyphen between two letters) in plain text too
   *  (`BodyTextConfig.breakAfterHyphens`), as it does in formatted text.
   *  Unset: plain justified text never breaks there, as up to postext 1.4. */
  breakAfterHyphens?: boolean;
  /** `false`: the dictionary leaves compounds (a word with a hyphen between
   *  two letters) whole, and they break only after their own hyphen
   *  (`HyphenationConfig.compounds`). A soft hyphen typed in the word still
   *  breaks. Unset or `true`: compounds are hyphenated like any word. */
  hyphenateCompounds?: boolean;
  /** Open the line after a break at a compound's hyphen with a hyphen too
   *  (`BodyTextConfig.repeatHyphen`): the line is measured with it and
   *  flagged `repeatedHyphen`. Plain text holding a compound is then
   *  measured by the formatted-text breaker. Unset: off. */
  repeatHyphen?: boolean;
  /** Where lines of CJK text may break (`cjk.lineBreak`, resolved): see
   *  `CjkLineBreakLevel`. Unset: the document's level, which the build sets
   *  (`setCjkLineBreak`); `gb` outside a build. Only CJK text reads it. */
  cjkLineBreak?: CjkLineBreakLevel;
  /** Where CJK text breaks between characters, for this paragraph alone (a
   *  paragraph style's `wordBreak`): `'keep-all'` only at spaces and next
   *  to punctuation, `'normal'` between any two characters. Unset: the
   *  composition's (`cjk.wordBreak`). Only CJK text reads it. */
  cjkWordBreak?: CjkWordBreak;
  /** The writing mode the text is measured in: `'vertical-rl'` gives every
   *  character that stands in a cell of its own in vertical text its cell
   *  (CJK characters, Chinese marks, the signs Unicode sets upright: see
   *  `verticalRuns`), and runs the rest sideways at its horizontal width.
   *  Unset: the build's (`setMeasureWritingMode`), horizontal outside a
   *  build. ASCII text measures the same either way. */
  writingMode?: WritingMode;
  /** How CJK text is composed: punctuation widths, adjacent marks, line
   *  edges, hanging, the Han–Latin space (`cjk`, resolved; see
   *  `cjkPunctuation.ts`). Unset: the document's, which the build sets
   *  (`setCjkComposition`); outside a build, none (every mark at its full
   *  advance). Only CJK text reads it. */
  cjkComposition?: CjkComposition;
  /** The paragraph's base direction (its embedding level, UAX #9): `rtl`
   *  for an Arabic paragraph, `ltr` for an English one, whatever letter it
   *  opens with. Its lines get their segments' directions and order
   *  (`VDTLine.order`, `VDTLineSegment.rtl`; see `measure/bidiLines.ts`).
   *  Unset: the build's (`setMeasureDirection`, the document's direction),
   *  left to right outside a build. A paragraph set left to right that
   *  holds no right-to-left letter is measured as it always was. */
  direction?: 'ltr' | 'rtl';
}

export const SOFT_HYPHEN = '\u00AD';
