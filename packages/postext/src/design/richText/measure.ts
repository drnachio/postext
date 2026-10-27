// RichMeasurer: measures pieces of rich text with their run styles
// (#1278: split out of richText.ts).
import { fontEm, flowTextWidth } from '../../measure/vertical.js';
import { measureTextWidth } from '../../measure/canvas.js';
import { stackedScriptPairs } from '../../measure/rich.js';
import { graphemeCount } from '../../measure/graphemes.js';
import { endsInsideGeminate } from '../../measure/geminate.js';
import type { DesignTextRun, RichDesignText } from './parse.js';

/** A laid-out line: its visible pieces in order (a hyphen or an ellipsis
 *  is a piece of its own, in the style of the text beside it). */
type Piece = { text: string; style: number };

export interface RichLine {
  text: string;
  width: number;
  runs: DesignTextRun[];
  /** The line ends in a piece of a word wider than the line, cut at a
   *  syllable or between two characters (#1150). */
  wordDivided?: 'syllable' | 'character';
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
  constructor(
    readonly rt: RichDesignText,
    readonly letterSpacingPx: number,
    /** How a run's text is measured, untracked, when not as any text of
     *  the flow: in the direction its pieces are painted in, in a document
     *  shaped in its own language (#770, `design/bidiText.ts`). */
    private readonly flow?: (text: string, font: string) => number,
  ) {}

  private widthOf(text: string, style: number): number {
    const s = this.rt.styles[style]!;
    // A chip advances as far as its box.
    if (s.chipWidth !== undefined) return s.chipWidth;
    // An oriented run, as the body measures it: one cell (tate-chu-yoko),
    // a cell per character (upright), its horizontal width (sideways); the
    // tracking follows a cell once.
    if (s.orient === 'tcy') return fontEm(s.font) + this.letterSpacingPx;
    const n = graphemeCount(text);
    if (s.orient === 'upright') return (fontEm(s.font) + this.letterSpacingPx) * n;
    if (s.orient === 'sideways') return Math.max(0, measureTextWidth(text, s.font) + this.letterSpacingPx * n);
    return Math.max(0, (this.flow ? this.flow(text, s.font) : flowTextWidth(text, s.font)) + this.letterSpacingPx * n);
  }

  /** Whether `[k, k + 1)` lies inside a run the author oriented (a line
   *  never breaks inside one, even at a space). */
  insideOriented(k: number): boolean {
    const style = this.rt.styleAt[k];
    if (style === undefined || this.rt.styles[style]!.orient === undefined) return false;
    return this.rt.styleAt[k - 1] === style && this.rt.styleAt[k + 1] === style;
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

  /** Character ranges `[start, end)` of `[a, b)` a line never ends inside:
   *  the subscripts and superscripts set over each other, and in vertical
   *  text the runs the author oriented (a `:tcy` cell, an `:upright` or
   *  `:sideways` run). */
  stackedRanges(a: number, b: number): [number, number][] {
    const pieces = this.pieces(a, b);
    const starts: number[] = [];
    let k = a;
    for (const p of pieces) {
      starts.push(k);
      k += p.text.length;
    }
    const ranges: [number, number][] = stackedScriptPairs(pieces.map((p) => this.rt.styles[p.style]!.script))
      .map((i) => [starts[i]!, starts[i + 1]! + pieces[i + 1]!.text.length]);
    pieces.forEach((p, i) => {
      if (this.rt.styles[p.style]!.orient !== undefined && p.text.length > 1) ranges.push([starts[i]!, starts[i]! + p.text.length]);
    });
    return ranges;
  }

  /** Style of the character at `i` (clamped to the text), for a hyphen or
   *  an ellipsis set beside it: an oriented run's without its orientation. */
  styleNear(i: number): number {
    if (this.rt.styleAt.length === 0) return 0;
    const style = this.rt.styleAt[Math.max(0, Math.min(i, this.rt.styleAt.length - 1))]!;
    return this.rt.styles[style]!.base ?? style;
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
      const run: DesignTextRun = style.shift !== undefined
        ? { text: p.text, fontString: style.font, width: w, baselineShift: style.shift }
        : { text: p.text, fontString: style.font, width: w };
      if (style.orient === 'tcy') run.tcy = true;
      else if (style.orient) run.orientation = style.orient;
      if (style.chip) run.chip = style.chip;
      return run;
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
    // A chip opening or closing the line sits flush with it: no gap
    // margin on that side (as `trimChipLineEdges` does in a paragraph).
    // Wrapping measured it with the margin, so the line still fits.
    const edge = (k: number, side: 'marginLeft' | 'marginRight'): void => {
      const run = runs[k];
      const m = run?.chip?.[side] ?? 0;
      if (!run || m <= 0) return;
      runs[k] = { ...run, width: run.width - m, chip: { ...run.chip!, [side]: 0 } };
    };
    edge(0, 'marginLeft');
    edge(runs.length - 1, 'marginRight');
    for (const r of runs) width += r.width;
    return { text, width, runs };
  }

  rangeLine(a: number, b: number, hyphen = false): RichLine {
    // The hyphen of a break inside an `l·l` takes the middle dot's place.
    const pieces = this.pieces(a, hyphen && endsInsideGeminate(this.rt.text.slice(a, b)) ? b - 1 : b);
    if (hyphen) pieces.push({ text: '-', style: this.styleNear(b - 1) });
    return this.line(pieces);
  }
}
