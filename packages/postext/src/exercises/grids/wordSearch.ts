// The word search grid.
import type { DesignElement } from '../../types.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { pathElement, textElement, drawnBox } from '../designs.js';
import { seededRandom } from '../shuffle.js';
import { dimPt } from '../expand.js';
import type { GridBoxInput, GridBox } from '../grids.js';
import { r, letterSize } from './common.js';

// --- Word search ---------------------------------------------------------------

const DIRS: Record<string, Array<[number, number]>> = {
  across: [[0, 1]],
  down: [[1, 0]],
  diagonal: [[1, 1], [-1, 1]],
  backwards: [[0, -1], [-1, 0], [-1, -1], [1, -1]],
};

/** The letters of a word as the grid sets them. */
export function lettersOf(word: string, upper: boolean, locale?: string): string[] {
  return graphemesOf(upper ? word.toLocaleUpperCase(locale) : word);
}

export function wordSearchBox(input: GridBoxInput): GridBox {
  const ex = input.exercise!;
  const { style } = input;
  const upper = style.grid.uppercase;
  const words = ex.entries.map((e) => lettersOf(e.word, upper));
  const longest = Math.max(1, ...words.map((w) => w.length));
  const total = words.reduce((n, w) => n + w.length, 0);
  const asked = parseInt(ex.attrs.size ?? '', 10);
  let size = Number.isFinite(asked) && asked > 0 ? Math.max(asked, longest) : Math.max(longest + 1, Math.ceil(Math.sqrt(total * 2.2)), 8);
  const dirNames = (ex.attrs.directions ?? 'across down diagonal').split(/[\s,]+/).filter((d) => DIRS[d]);
  const dirs = dirNames.flatMap((d) => DIRS[d]!);
  if (dirs.length === 0) dirs.push([0, 1], [1, 0]);
  const random = seededRandom(input.seed ?? 1, ex.ordinal, 'wordsearch');
  let grid: Array<Array<string | undefined>> = [];
  let placed: Array<{ word: number; r: number; c: number; d: [number, number] }> = [];
  const order = words.map((_, k) => k).sort((a, b) => words[b]!.length - words[a]!.length);
  for (let attempt = 0; attempt < 6; attempt++) {
    grid = Array.from({ length: size }, () => new Array<string | undefined>(size).fill(undefined));
    placed = [];
    let ok = true;
    for (const k of order) {
      const w = words[k]!;
      let done = false;
      for (let t = 0; t < 400 && !done; t++) {
        const d = dirs[Math.floor(random() * dirs.length)]!;
        const r0 = Math.floor(random() * size);
        const c0 = Math.floor(random() * size);
        const r1 = r0 + d[0] * (w.length - 1);
        const c1 = c0 + d[1] * (w.length - 1);
        if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
        let fits = true;
        for (let j = 0; j < w.length && fits; j++) {
          const cell = grid[r0 + d[0] * j]![c0 + d[1] * j];
          if (cell !== undefined && cell !== w[j]) fits = false;
        }
        if (!fits) continue;
        for (let j = 0; j < w.length; j++) grid[r0 + d[0] * j]![c0 + d[1] * j] = w[j];
        placed.push({ word: k, r: r0, c: c0, d });
        done = true;
      }
      if (!done) { ok = false; break; }
    }
    if (ok) break;
    size++;
  }
  // The empty cells take letters of the words, drawn at random.
  const pool = words.flat();
  for (const row of grid) for (let c = 0; c < row.length; c++) if (row[c] === undefined) row[c] = pool[Math.floor(random() * pool.length)] ?? 'A';

  const cell = Math.min(dimPt(style.grid.cell, input.bodySizePt), input.measurePt / size);
  const w = size * cell;
  const els: DesignElement[] = [];
  let lines = '';
  for (let i = 0; i <= size; i++) lines += `M0 ${r(i * cell)}H${r(w)}M${r(i * cell)} 0V${r(w)}`;
  els.push(pathElement('grid', lines, w, w, style.grid.rule, dimPt(style.grid.ruleWidth, input.bodySizePt)));
  if (input.teacher) {
    let d = '';
    const rad = cell * 0.42;
    for (const p of placed) {
      const n = words[p.word]!.length - 1;
      const x0 = (p.c + 0.5) * cell; const y0 = (p.r + 0.5) * cell;
      const x1 = (p.c + p.d[1] * n + 0.5) * cell; const y1 = (p.r + p.d[0] * n + 0.5) * cell;
      const len = Math.hypot(x1 - x0, y1 - y0) || 1;
      const ux = (x1 - x0) / len; const uy = (y1 - y0) / len;
      const nx = -uy * rad; const ny = ux * rad;
      d += `M${r(x0 + nx)} ${r(y0 + ny)}L${r(x1 + nx)} ${r(y1 + ny)}A${r(rad)} ${r(rad)} 0 0 0 ${r(x1 - nx)} ${r(y1 - ny)}L${r(x0 - nx)} ${r(y0 - ny)}A${r(rad)} ${r(rad)} 0 0 0 ${r(x0 + nx)} ${r(y0 + ny)}Z`;
    }
    els.push(pathElement('found', d, w, w, input.style.answers.color, 1.1));
  }
  const font = style.grid.fontFamily ?? input.font ? { fontFamily: (style.grid.fontFamily ?? input.font)! } : {};
  const color = style.grid.color ? { color: style.grid.color } : {};
  for (let rr = 0; rr < size; rr++) for (let c = 0; c < size; c++) {
    els.push(textElement(`c${rr}_${c}`, grid[rr]![c]!, c * cell, rr * cell, cell, cell, letterSize(style, input.bodySizePt, cell, 0.58), { ...font, ...color }));
  }
  const box = drawnBox(input.id, els, w, 4, 6) as GridBox;
  box.info = { kind: 'wordsearch', rows: size, cols: size, cellPt: cell, xPt: 0, yPt: 0, ...(input.rtl ? { rtl: true as const } : {}) };
  box.slots = placed.map((p) => {
    const n = words[p.word]!.length - 1;
    const a = `${p.r},${p.c}`;
    const b = `${p.r + p.d[0] * n},${p.c + p.d[1] * n}`;
    return { key: `w${p.word + 1}`, kind: 'word' as const, accept: [`${a}-${b}`, `${b}-${a}`] };
  });
  box.words = ex.entries.map((e) => e.word);
  box.key = ex.entries.map((e) => e.word);
  const placedWords = new Set(placed.map((p) => p.word));
  box.unplaced = ex.entries.filter((_, k) => !placedWords.has(k)).map((e) => e.word);
  return box;
}
