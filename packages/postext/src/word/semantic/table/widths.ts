// Column widths of a table in the semantic .docx (#1444). The model's
// weights (`columnWidths`) when it has them, as the engine reads them;
// else weights from the cells' text, longer text wider. Either way no
// column is left narrower than its longest word and the cell padding:
// Word and LibreOffice would break the word inside (a header "Amplitude"
// set as "Amplitud/e").

import type { TableCell, TableModel } from '../../../types.js';

/** What a cell's longest word needs, px: the measure of its cells. */
export interface WordMeasure {
  /** Average advance of a character, as a fraction of the font size. */
  charEm: number;
  fontPx: number;
}

/** The text a reader sees in a cell's Markdown, roughly: inline markup
 *  and directive names out, a chip or a reference's label kept. */
export function visibleText(content: string): string {
  return content
    .replace(/\$[^$]*\$/g, 'xxxx')
    .replace(/:[A-Za-z][\w-]*\[([^\]]*)\](\{[^}]*\})?/g, '$1')
    .replace(/[*_~^`\\]/g, '');
}

/** Width of the longest word of a cell, px. */
export function longestWordPx(content: string, m: WordMeasure): number {
  let longest = 0;
  for (const w of visibleText(content).split(/[\s ]+/)) longest = Math.max(longest, [...w].length);
  return longest * m.charEm * m.fontPx;
}

/** Weights from the cells' text: each column's longest line, with a floor
 *  so a short column keeps some room. */
function contentWeights(model: TableModel, cols: number): number[] {
  const out = new Array<number>(cols).fill(3);
  for (const row of model.rows) {
    row.forEach((cell, c) => {
      if (c >= cols || cell.hiddenBy || (cell.colSpan ?? 1) > 1) return;
      const len = Math.max(0, ...visibleText(cell.content).split(/\n|\\\\/).map((l) => [...l.trim()].length));
      out[c] = Math.max(out[c]!, len + (cell.image ? 12 : 0));
    });
  }
  return out;
}

/**
 * The columns' widths as fractions of the table's width (they add up to
 * 1). `totalPx` is the table's width, `padPx` a cell's padding on each
 * side, `measure` the measure of a cell's words.
 */
export function columnFractions(model: TableModel, cols: number, totalPx: number, padPx: number, measure: (cell: TableCell, row: number) => WordMeasure): number[] {
  const given = model.columnWidths;
  const weights = given?.length === cols && given.every((w) => Number.isFinite(w) && w > 0) ? given : contentWeights(model, cols);
  const sum = weights.reduce((a, b) => a + b, 0);
  const natural = weights.map((w) => (totalPx * w) / sum);
  const min = new Array<number>(cols).fill(0);
  model.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (c >= cols || cell.hiddenBy || (cell.colSpan ?? 1) > 1) return;
      min[c] = Math.max(min[c]!, longestWordPx(cell.content, measure(cell, r)) + 2 * padPx);
    });
  });
  const minSum = min.reduce((a, b) => a + b, 0);
  // The words alone overfill the table: share it out by what they need.
  if (minSum >= totalPx) return min.map((m) => (minSum > 0 ? m / minSum : 1 / cols));
  // Columns narrower than their words take what they need; the others
  // share the rest by their weights, until none is short.
  const fixed = new Set<number>();
  let widths = natural;
  for (let pass = 0; pass < cols; pass++) {
    const short = widths.findIndex((w, c) => !fixed.has(c) && w < min[c]! - 0.01);
    if (short < 0) break;
    for (let c = 0; c < cols; c++) if (!fixed.has(c) && widths[c]! < min[c]! - 0.01) fixed.add(c);
    const room = totalPx - [...fixed].reduce((a, c) => a + min[c]!, 0);
    const free = weights.reduce((a, w, c) => (fixed.has(c) ? a : a + w), 0);
    widths = weights.map((w, c) => (fixed.has(c) ? min[c]! : free > 0 ? (room * w) / free : 0));
  }
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  return widths.map((w) => w / total);
}
