import { measurementGeneration } from '../measure/canvas.js';
import { cellsOf } from '../paint/wordPieces.js';
import { languageOf, letterSpacingOf } from './contextState.js';
import { contextTextWidth } from './contextText.js';
import { paintAsOneRun } from './mirrorFrame.js';

/**
 * The characters of a segment of the CJK composer painted where it
 * measured them (#770).
 *
 * The composer measures a Chinese or Japanese character alone, as one
 * cell (`cellAdvance`), and a line carries the cells of one style that
 * advance alike as one segment (`composeLine`). Painted with one
 * `fillText`, the browser shapes that segment as a run and kerns inside
 * it: a kana against the mark after it, a kana against a kana. Measured
 * on Chrome 154 in thousandths of the em, `ja`: Noto Sans JP `す。` −100,
 * `れ、` +10; Noto Serif JP `す。` −130. Every character after such a
 * pair stood that far off its cell: 1.5 px on a line of 18.75 px text
 * that opens with `す。`.
 *
 * So a segment of cells is painted in the runs the browser sets as wide
 * as their cells: cut between two characters it kerns, each run from
 * where the cells before it end. A run of Han characters has no such
 * pair and stays one call, which is nearly every segment of a Chinese
 * page; a Japanese line is cut once or twice.
 *
 * Which texts: two characters or more, each one a CJK character to the
 * composer (`cellsOf`). A Western run was measured whole, with its
 * kerning, and is painted whole. What is known of a text is kept by the
 * font and the language it is painted in, until a face arrives (the
 * measurement generation).
 */

/** The runs a text of cells is painted in. */
interface CellRuns {
  runs: readonly string[];
  /** Each run's advance with no letter-spacing, px: its cells'. */
  advances: readonly number[];
  /** Each run's characters: each takes the letter-spacing once. */
  counts: readonly number[];
}

/** How far, px, a text may stand off the sum of its cells and still be
 *  set as they are: above the rounding of the sum, below the least pair a
 *  face kerns (a hundredth of the em is 0.075 px at 7.5 px). Not a part of
 *  the width: a segment of fifty cells is 1600 px wide at 32 px, and one
 *  pair kerned 0.32 px in it moves every cell after it. */
const SAME_CELLS = 0.02;
const sameCells = (a: number, b: number): boolean => Math.abs(a - b) <= SAME_CELLS;

/** Texts remembered per font and language before the memory starts over. */
const MAX_TEXTS = 8192;

/** Language and font → text → its runs, null for a text painted whole. */
let known = new Map<string, Map<string, CellRuns | null>>();
let knownAt = -1;

type Ctx = Pick<CanvasRenderingContext2D, 'font' | 'measureText'>;

function runsOf(ctx: Ctx, text: string): CellRuns | null {
  const cells = cellsOf(text);
  if (!cells) return null;
  // Widths under the letter-spacing in force: it follows every character,
  // in a cell alone as in a run, so the comparisons hold under any.
  const spacing = letterSpacingOf(ctx);
  const widths = cells.map((cell) => contextTextWidth(ctx, cell));
  let sum = 0;
  for (const w of widths) sum += w;
  if (sameCells(contextTextWidth(ctx, text), sum)) return null;
  // Cut between two characters the browser does not set as two cells.
  const stretches: [from: number, to: number][] = [];
  let from = 0;
  for (let i = 1; i <= cells.length; i++) {
    if (i < cells.length && sameCells(contextTextWidth(ctx, cells[i - 1]! + cells[i]!), widths[i - 1]! + widths[i]!)) continue;
    stretches.push([from, i]);
    from = i;
  }
  const runs: string[] = [];
  const advances: number[] = [];
  const counts: number[] = [];
  const add = (a: number, b: number): void => {
    let advance = 0;
    for (let k = a; k < b; k++) advance += widths[k]! - spacing;
    runs.push(cells.slice(a, b).join(''));
    advances.push(advance);
    counts.push(b - a);
  };
  for (const [a, b] of stretches) {
    // Three characters or more that are not as wide together as their
    // cells, though each pair is: cell by cell.
    let whole = b - a < 3;
    if (!whole) {
      let cellsWidth = 0;
      for (let k = a; k < b; k++) cellsWidth += widths[k]!;
      whole = sameCells(contextTextWidth(ctx, cells.slice(a, b).join('')), cellsWidth);
    }
    if (whole) add(a, b);
    else for (let k = a; k < b; k++) add(k, k + 1);
  }
  return { runs, advances, counts };
}

/**
 * Paint `text`, the cells of a segment of the CJK composer on a
 * horizontal page, with `paint` (the caller's `fillText`) from `x` on
 * `y`, in the context's font, language and letter-spacing: run by run,
 * each where the cells before it end (see the module comment), turned
 * back as one run on a mirrored page. Returns false, with nothing
 * painted, for a text the caller paints whole: one the browser sets as
 * wide as its cells, a text that is not all cells, a context that does
 * not measure.
 */
export function fillCellRuns(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  paint: (text: string, x: number, y: number) => void,
): boolean {
  if (text.length < 2 || typeof ctx.measureText !== 'function') return false;
  const generation = measurementGeneration();
  if (generation !== knownAt) {
    known = new Map();
    knownAt = generation;
  }
  const key = `${languageOf(ctx) ?? ''}\u0000${ctx.font}`;
  let texts = known.get(key);
  if (!texts) known.set(key, texts = new Map());
  let cells = texts.get(text);
  if (cells === undefined) {
    cells = runsOf(ctx, text);
    if (texts.size >= MAX_TEXTS) texts.clear();
    texts.set(text, cells);
  }
  if (!cells) return false;
  const spacing = letterSpacingOf(ctx);
  const { runs, advances, counts } = cells;
  let width = 0;
  for (let i = 0; i < runs.length; i++) width += advances[i]! + spacing * counts[i]!;
  paintAsOneRun(ctx, x, width, () => {
    let at = x;
    for (let i = 0; i < runs.length; i++) {
      paint(runs[i]!, at, y);
      at += advances[i]! + spacing * counts[i]!;
    }
  });
  return true;
}
