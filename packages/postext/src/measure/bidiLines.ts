/**
 * Right-to-left lines (UAX #9 on the measurer's output, #369).
 *
 * The line breakers work on the logical text and know nothing of
 * direction: a line is a run of the paragraph, and its `segments` stay in
 * logical order (copied text, links, source maps, the hyphen at the end of
 * a line and every other engine rule read them as written). Once a
 * paragraph is broken, {@link applyLineDirections} resolves its embedding
 * levels once (`resolveParagraph`, with the inline `:rtl[…]` / `:ltr[…]`
 * isolates) and, line by line, applies rule L1 to the line's characters,
 * cuts each text segment where its level changes, marks the right-to-left
 * ones (`VDTLineSegment.rtl`, and `level` past 1) and works out the order
 * the renderers advance through the segments in (`VDTLine.order`, rule L2
 * on the segments' levels): the visual order, left to right, whatever the
 * frame; the build turns it around on a mirrored page (#370).
 *
 * A cut at a level change never falls inside a word of a joining script:
 * Arabic letters next to each other have one level, and a cut between a
 * letter and a digit or a Latin letter leaves both sides measured as they
 * are painted. The pieces of a segment share its width in proportion to
 * their own widths, so a line keeps the width it was broken with and no
 * break changes.
 *
 * Only a paragraph that needs it pays for it: one set right to left, or
 * one holding a right-to-left letter or control (`needsBidi`). Every other
 * line is left exactly as it was, with none of these fields.
 */

import type { VDTLine, VDTLineSegment } from '../vdt';
import { lineLevels, visualOrder, type BidiParagraph } from '../bidi';
import { insideJoiningWord } from './joining';
import { lineMeasure, type LineWidthStep } from './types';

let measureDirection: 'ltr' | 'rtl' = 'ltr';

/** Set the base direction a paragraph is measured with when nothing sets
 *  its own (`MeasureBlockOptions.direction`): the document's
 *  (`resolvedDirection`). The build does, and puts back what it found when
 *  it is done; left to right outside a build. */
export function setMeasureDirection(direction: 'ltr' | 'rtl'): void {
  measureDirection = direction === 'rtl' ? 'rtl' : 'ltr';
}

/** See {@link setMeasureDirection}. */
export function getMeasureDirection(): 'ltr' | 'rtl' {
  return measureDirection;
}

/** Source characters a line may leave out of its segments: the space a
 *  break consumed, a soft hyphen or a zero-width space, the middle dot of a
 *  Catalan `l·l` broken as `l-` | `l`. */
const UNPRINTED_RE = /[\s­​·]/;

/** The paragraph-text index of each character of each segment of a line,
 *  -1 for a character the line added (the hyphen of a break, a repeated
 *  hyphen, a book title's brackets), read from `from` on; and where the
 *  next line starts reading. */
function alignLine(segments: readonly VDTLineSegment[], text: string, from: number): { at: Int32Array[]; next: number } {
  let p = from;
  const at: Int32Array[] = [];
  for (const seg of segments) {
    const idx = new Int32Array(seg.text.length).fill(-1);
    at.push(idx);
    if (seg.inserted) continue;
    for (let k = 0; k < seg.text.length; k++) {
      const c = seg.text[k]!;
      let q = p;
      while (q < text.length && !sameChar(c, text[q]!) && UNPRINTED_RE.test(text[q]!)) q++;
      // A character small capitals print as their capital is the same one.
      if (q < text.length && sameChar(c, text[q]!)) {
        idx[k] = q;
        p = q + 1;
      }
    }
  }
  return { at, next: p };
}

function sameChar(printed: string, source: string): boolean {
  return printed === source || printed === source.toUpperCase();
}

/** Whether a segment is set as a whole (a formula, a swatch, a chip, a
 *  reference's label, a note marker): it is never cut, and paints in the
 *  direction of its lowest level (a label `شكل ١-٢` right to left, which
 *  the renderer's shaper orders inside). */
function isAtomic(seg: VDTLineSegment): boolean {
  return (seg.kind !== 'text' && seg.kind !== 'space') || seg.refResourceId !== undefined || seg.footnoteId !== undefined
    || seg.chip !== undefined || seg.stacked === true || seg.labelTab === true || seg.mathRender !== undefined;
}

/** The runs of a word set in several styles (`runs`) that fall in
 *  `[from, to)` of its text. */
function sliceRuns(runs: NonNullable<VDTLineSegment['runs']>, from: number, to: number): VDTLineSegment['runs'] {
  const out: NonNullable<VDTLineSegment['runs']> = [];
  let at = 0;
  for (const run of runs) {
    const a = Math.max(from, at);
    const b = Math.min(to, at + run.text.length);
    if (a < b) out.push({ ...run, text: run.text.slice(a - at, b - at) });
    at += run.text.length;
  }
  return out.length > 1 ? out : undefined;
}

/**
 * Resolve the directions of a paragraph's lines (see the module comment):
 * `par` is the paragraph's levels (`resolveParagraph` on the text the lines
 * were cut from, the spans' texts joined, with its base direction and its
 * inline `:rtl[…]` / `:ltr[…]` isolates); `widthOf` measures a piece of a
 * segment in that segment's font, to share its width. The lines are
 * changed in place.
 */
export function applyLineDirections(
  lines: VDTLine[],
  par: BidiParagraph,
  widthOf: (seg: VDTLineSegment, piece: string) => number,
): void {
  const text = par.text;
  let from = 0;
  for (const line of lines) {
    const segments = line.segments;
    if (!segments || segments.length === 0) continue;
    const { at, next } = alignLine(segments, text, from);
    from = next;
    let start = Infinity;
    let end = -1;
    for (const idx of at) {
      for (const q of idx) {
        if (q < 0) continue;
        if (q < start) start = q;
        if (q > end) end = q;
      }
    }
    if (end < 0) continue;
    const lv = lineLevels(par, start, end + 1);
    const levelAt = (q: number): number => lv[q - start]!;
    const out: VDTLineSegment[] = [];
    const levels: number[] = [];
    let previous = par.paragraphLevel;
    segments.forEach((seg, s) => {
      const idx = at[s]!;
      // Each character's level; one the line added takes its neighbour's.
      const own: number[] = [];
      for (let k = 0; k < idx.length; k++) own.push(idx[k]! >= 0 ? levelAt(idx[k]!) : -1);
      for (let k = 0; k < own.length; k++) if (own[k]! < 0 && k > 0) own[k] = own[k - 1]!;
      for (let k = own.length - 1; k >= 0; k--) if (own[k]! < 0 && k + 1 < own.length) own[k] = own[k + 1]!;
      if (own.length === 0 || own[0]! < 0) own.fill(previous);
      previous = own[own.length - 1] ?? previous;
      // Where the segment changes level: never inside a joining word.
      const cuts: number[] = [];
      if (seg.kind === 'text' && !isAtomic(seg)) {
        for (let k = 1; k < own.length; k++) {
          if (own[k] === own[k - 1] || insideJoiningWord(seg.text, k)) continue;
          const c = seg.text.charCodeAt(k);
          if (c >= 0xDC00 && c <= 0xDFFF) continue;
          cuts.push(k);
        }
      }
      if (cuts.length === 0) {
        out.push(seg);
        levels.push(own.length > 0 ? Math.min(...own) : previous);
        return;
      }
      const bounds = [0, ...cuts, seg.text.length];
      const pieces: { text: string; from: number; to: number; level: number; width: number }[] = [];
      for (let b = 0; b + 1 < bounds.length; b++) {
        const a = bounds[b]!;
        const z = bounds[b + 1]!;
        const piece = seg.text.slice(a, z);
        pieces.push({ text: piece, from: a, to: z, level: Math.min(...own.slice(a, z)), width: widthOf(seg, piece) });
      }
      // The pieces share the segment's width in proportion to their own,
      // so the line keeps the width it was broken with.
      const total = pieces.reduce((sum, p) => sum + p.width, 0);
      for (const p of pieces) {
        const width = total > 0 ? seg.width * (p.width / total) : seg.width * ((p.to - p.from) / seg.text.length);
        const piece: VDTLineSegment = { ...seg, text: p.text, width };
        if (seg.runs) {
          const runs = sliceRuns(seg.runs, p.from, p.to);
          if (runs) piece.runs = runs;
          else delete piece.runs;
        }
        out.push(piece);
        levels.push(p.level);
      }
    });
    // A line with nothing right to left on it (an English line of an
    // Arabic paragraph, all at level 2) paints as it always did.
    if (!levels.some((l) => (l & 1) === 1)) continue;
    out.forEach((seg, i) => {
      const level = levels[i]!;
      if (level & 1) seg.rtl = true;
      if (level > 1) seg.level = level;
    });
    line.segments = out;
    const order = visualOrder(levels);
    if (order.some((v, i) => v !== i)) line.order = order;
  }
}

/**
 * The lines of a paragraph whose direction opposes its frame's: an Arabic
 * quotation in an English book, or an English one in an Arabic book (whose
 * pages are mirrored, #370, so that the flow's right is the sheet's left).
 * Its start side is the frame's right. The breaker set each line's indent
 * on the left (`bbox.x`); the line now fills the span from the block's left
 * edge to its right edge less that indent (`VDTLine.measure`), so a
 * first-line or hanging indent falls on the right, and its line box starts
 * at the span's left edge. Renderers align the line in that span from its
 * start side: a ragged line, or the last line of a justified paragraph,
 * ends flush right (see `VDTLine.measure`). `maxWidthPx` and `restWidths`
 * are the measures the lines were broken at, from the block's left edge.
 */
export function mirrorLineSpans(lines: VDTLine[], maxWidthPx: number, restWidths?: readonly LineWidthStep[]): void {
  lines.forEach((line, i) => {
    const width = Math.max(0, lineMeasure(maxWidthPx, restWidths, i) - line.bbox.x);
    line.measure = { x: 0, width };
    line.bbox.x = 0;
  });
}

/** Move a line along x by `dx`, its {@link VDTLine.measure} with it. The
 *  measure is replaced, never changed in place: a cached measurement may
 *  share it. */
export function shiftLineX(line: VDTLine, dx: number): void {
  line.bbox.x += dx;
  if (line.measure) line.measure = { x: line.measure.x + dx, width: line.measure.width };
}
