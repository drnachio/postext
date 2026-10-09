/**
 * Forced line breaks inside a paragraph (#620): the parser writes a
 * backslash ending a source line, or `\\`, as `BREAK_PLACEHOLDER` (U+2028,
 * LINE SEPARATOR). The text between two breaks is broken on its own, by
 * whichever breaker sets the paragraph (Knuth–Plass or line by line, the
 * word-by-word breaker or the CJK composer): a forced break splits a
 * Knuth–Plass paragraph into independent problems (the break is an infinite
 * penalty after glue that fills the line), so breaking each piece alone
 * finds the same lines. The pieces are then stacked as one paragraph:
 *
 * - every option that counts lines counts them through the whole paragraph:
 *   a piece that starts on line `n` gets the indents, the measures
 *   (`restWidths`), the lines that should not end on a hyphen
 *   (`avoidHyphenAtLines`) and the kept breaks (`keepBreaks`) of lines
 *   `n`, `n + 1`…;
 * - the line before a break is set at its natural width, as a paragraph's
 *   last line is (`isLastLine`), and flagged `hardBreak`;
 * - the runt penalty and `lastLineRunt` are the last piece's, the
 *   paragraph's end; `looseness` is taken by the last piece that can take
 *   it, then the one before;
 * - the break trace (`MeasuredBlock.breaks`) numbers the item positions of
 *   piece `k` from `k × PIECE_STRIDE`, so a trace cut to its first lines
 *   still tells each piece its own.
 *
 * Two breaks in a row are one (the parser merges them); a piece with no
 * text sets no line.
 */

import type { InlineSpan } from '../parse/types';
import { sliceSpan } from '../parse/links';
import type { VDTLine } from '../vdt';
import type { BreakTrace, LineWidthStep, MeasureBlockOptions, MeasuredBlock } from './types';
import { lineIndentAt, lineMeasure } from './types';

/** The forced line break in a paragraph's text (`BREAK_PLACEHOLDER`). */
export const FORCED_BREAK = ' ';

/** Where the item positions of each piece start in a combined break trace. */
export const PIECE_STRIDE = 1 << 24;

/** The spans cut at the forced breaks, the breaks dropped. A span set
 *  whole (a reference, a formula) holds none. */
export function splitAtForcedBreaks(spans: readonly InlineSpan[]): InlineSpan[][] {
  const pieces: InlineSpan[][] = [[]];
  for (const span of spans) {
    if (!span.text.includes(FORCED_BREAK)) {
      pieces[pieces.length - 1]!.push(span);
      continue;
    }
    let from = 0;
    for (let i = 0; i <= span.text.length; i++) {
      if (i < span.text.length && span.text[i] !== FORCED_BREAK) continue;
      if (i > from) pieces[pieces.length - 1]!.push(sliceSpan(span, from, i));
      if (i < span.text.length) pieces.push([]);
      from = i + 1;
    }
  }
  return pieces;
}

/** The indents of lines `n`, `n + 1`… as a table (see `lineIndentsPx`),
 *  or none when they are all 0. */
function indentsFrom(options: MeasureBlockOptions | undefined, n: number): number[] | undefined {
  const until = Math.max(n, (options?.lineIndentsPx?.length ?? 2) - 1);
  const table: number[] = [];
  for (let li = n; li <= until; li++) table.push(lineIndentAt(options, li));
  return table.some((v) => v > 0) ? table : undefined;
}

/** The options of the piece that starts on line `n` of the paragraph
 *  (see the module comment). */
export function pieceOptions(
  options: MeasureBlockOptions | undefined,
  maxWidthPx: number,
  piece: number,
  n: number,
  last: boolean,
  looseness: number,
): MeasureBlockOptions {
  const { firstLineIndentPx: _first, hangingIndent: _hanging, lineIndentsPx: _table, labelColumnPx, restWidths, avoidHyphenAtLines, keepBreaks, looseness: _loose, runtPenalty, ...rest } = options ?? {};
  void _first;
  void _hanging;
  void _table;
  void _loose;
  const out: MeasureBlockOptions = { ...rest };
  if (n === 0) {
    if (options?.firstLineIndentPx !== undefined) out.firstLineIndentPx = options.firstLineIndentPx;
    if (options?.hangingIndent !== undefined) out.hangingIndent = options.hangingIndent;
    if (options?.lineIndentsPx !== undefined) out.lineIndentsPx = options.lineIndentsPx;
  } else {
    const table = indentsFrom(options, n);
    if (table) out.lineIndentsPx = table;
  }
  // A bibliography entry's label column: its first line's.
  if (labelColumnPx !== undefined && piece === 0) out.labelColumnPx = labelColumnPx;
  if (restWidths && restWidths.length > 0) {
    const steps: LineWidthStep[] = [];
    const at = lineMeasure(maxWidthPx, restWidths, n);
    if (restWidths.some((s) => s.fromLine <= n)) steps.push({ fromLine: 0, maxWidthPx: at });
    for (const s of restWidths) if (s.fromLine > n) steps.push({ fromLine: s.fromLine - n, maxWidthPx: s.maxWidthPx });
    if (steps.length > 0) out.restWidths = steps;
  }
  if (avoidHyphenAtLines) {
    const lines = avoidHyphenAtLines.filter((l) => l > n).map((l) => l - n);
    if (lines.length > 0) out.avoidHyphenAtLines = lines;
  }
  if (keepBreaks) {
    const at = keepBreaks.at.filter((a) => a >= piece * PIECE_STRIDE && a < (piece + 1) * PIECE_STRIDE).map((a) => a - piece * PIECE_STRIDE);
    if (at.length > 0) out.keepBreaks = { path: keepBreaks.path, at };
  }
  // A short last line before a forced break is the author's: the runt
  // penalty weighs the paragraph's own end only.
  if (runtPenalty !== undefined) out.runtPenalty = last ? runtPenalty : 0;
  if (looseness !== 0) out.looseness = looseness;
  return out;
}

/** Lines `lines` moved down by `dy`. */
function shifted(lines: readonly VDTLine[], dy: number): VDTLine[] {
  if (dy === 0) return [...lines];
  return lines.map((line) => ({ ...line, bbox: { ...line.bbox, y: line.bbox.y + dy }, baseline: line.baseline + dy }));
}

/**
 * Measure a paragraph whose spans hold forced line breaks (see the module
 * comment): `measurePiece` breaks the text of one piece with the options
 * given, as the paragraph's own breaker would.
 */
export function measureForcedBreaks(
  spans: readonly InlineSpan[],
  maxWidthPx: number,
  lineHeightPx: number,
  options: MeasureBlockOptions | undefined,
  measurePiece: (piece: InlineSpan[], options: MeasureBlockOptions) => MeasuredBlock,
): MeasuredBlock {
  const pieces = splitAtForcedBreaks(spans);
  const lastPiece = pieces.length - 1;
  // A placeholder (a formula, a reference, a note marker) is no
  // whitespace: only a piece of spaces sets nothing.
  const blank = (piece: InlineSpan[]) => piece.every((s) => s.text.trim() === '');
  const measureAll = (loose: readonly number[]): { results: (MeasuredBlock | null)[]; starts: number[] } => {
    const results: (MeasuredBlock | null)[] = [];
    const starts: number[] = [];
    let n = 0;
    pieces.forEach((piece, k) => {
      starts.push(n);
      if (blank(piece)) {
        results.push(null);
        return;
      }
      const r = measurePiece(piece, pieceOptions(options, maxWidthPx, k, n, k === lastPiece, loose[k] ?? 0));
      results.push(r);
      n += r.lines.length;
    });
    return { results, starts };
  };
  let { results, starts } = measureAll([]);
  // Looseness: the last piece that can set itself that many lines longer
  // (or shorter) does, then the one before for what is left.
  const wanted = options?.looseness ?? 0;
  if (wanted !== 0) {
    const loose: number[] = pieces.map(() => 0);
    let remaining = wanted;
    for (let k = lastPiece; k >= 0 && remaining !== 0; k--) {
      const base = results[k];
      if (!base) continue;
      const trial = measurePiece(pieces[k]!, pieceOptions(options, maxWidthPx, k, starts[k]!, k === lastPiece, remaining));
      const delta = trial.lines.length - base.lines.length;
      if (delta === 0 || Math.sign(delta) !== Math.sign(remaining)) continue;
      loose[k] = remaining;
      remaining -= delta;
    }
    if (loose.some((v) => v !== 0)) ({ results, starts } = measureAll(loose));
  }

  const lines: VDTLine[] = [];
  let totalHeight = 0;
  const traces: number[] = [];
  let tracePath: BreakTrace['path'] | undefined;
  let traced = true;
  let lastMeasured: MeasuredBlock | undefined;
  results.forEach((r, k) => {
    if (!r || r.lines.length === 0) return;
    const placed = shifted(r.lines, lines.length * lineHeightPx);
    if (k < lastPiece) {
      const end = placed[placed.length - 1]!;
      const { justifiedSpaceRatio: _ratio, ...ragged } = end;
      void _ratio;
      placed[placed.length - 1] = { ...ragged, isLastLine: true, hardBreak: true };
    }
    lines.push(...placed);
    totalHeight += r.totalHeight;
    if (r.breaks && (tracePath === undefined || tracePath === r.breaks.path)) {
      tracePath = r.breaks.path;
      for (const a of r.breaks.at) traces.push(a + k * PIECE_STRIDE);
    } else {
      traced = false;
    }
    lastMeasured = r;
  });
  // The paragraph ends on its last line: a trailing break (none: the
  // parser keeps one at the end of a block as text) leaves no flag behind.
  const tail = lines[lines.length - 1];
  if (tail?.hardBreak) {
    const { hardBreak: _flag, ...end } = tail;
    void _flag;
    lines[lines.length - 1] = end;
  }
  return {
    lines,
    totalHeight,
    ...(traced && tracePath !== undefined ? { breaks: { path: tracePath, at: traces } } : {}),
    ...(lastMeasured?.lastLineRunt && results[lastPiece] === lastMeasured ? { lastLineRunt: true } : {}),
  };
}
