// The crossword: words laid across one another, numbered cells and clues.
import type { DesignElement } from '../../types.js';
import { pathElement, textElement, drawnBox } from '../designs.js';
import type { ExerciseSlot } from '../record.js';
import { seededRandom, shuffledOrder } from '../shuffle.js';
import type { Run } from '../text.js';
import { dimPt } from '../expand.js';
import type { GridBoxInput, GridBox } from '../grids.js';
import { r, BLACK, letterSize } from './common.js';
import { lettersOf } from './wordSearch.js';

// --- Crossword -----------------------------------------------------------------

interface Placement { word: number; r: number; c: number; across: boolean }

/** Lay the words in `order`, each across a word already laid where a letter
 *  is shared and no letter touches another word's side or ends. Two
 *  rounds: a word that found no place may find one once others are down. */
function layCrossword(words: string[][], order: number[], random: () => number): { cells: Map<string, string>; placed: Placement[]; unplaced: number[]; area: number } {
  const cells = new Map<string, string>();
  const key = (rr: number, c: number): string => `${rr},${c}`;
  const placed: Placement[] = [];
  const canPlace = (w: string[], r0: number, c0: number, across: boolean): number => {
    let crossings = 0;
    const dr = across ? 0 : 1; const dc = across ? 1 : 0;
    // No letter touches the word's ends.
    if (cells.has(key(r0 - dr, c0 - dc)) || cells.has(key(r0 + dr * w.length, c0 + dc * w.length))) return -1;
    for (let j = 0; j < w.length; j++) {
      const rr = r0 + dr * j; const c = c0 + dc * j;
      const at = cells.get(key(rr, c));
      if (at !== undefined) {
        if (at !== w[j]) return -1;
        // A crossing, never a run along a word set the same way.
        if (placed.some((p) => p.across === across && (across ? p.r === rr && c >= p.c && c < p.c + words[p.word]!.length : p.c === c && rr >= p.r && rr < p.r + words[p.word]!.length))) return -1;
        crossings++;
        continue;
      }
      // An empty cell must have no letter beside it across the word.
      if (cells.has(key(rr + dc, c + dr)) || cells.has(key(rr - dc, c - dr))) return -1;
    }
    return crossings;
  };
  const put = (k: number, r0: number, c0: number, across: boolean): void => {
    const w = words[k]!;
    for (let j = 0; j < w.length; j++) cells.set(key(r0 + (across ? 0 : j), c0 + (across ? j : 0)), w[j]!);
    placed.push({ word: k, r: r0, c: c0, across });
  };
  if (order.length > 0) put(order[0]!, 0, 0, true);
  let rest = order.slice(1);
  for (let pass = 0; pass < 2; pass++) {
    const left: number[] = [];
    for (const k of rest) {
      const w = words[k]!;
      let best: { r: number; c: number; across: boolean; score: number } | undefined;
      for (const p of placed) {
        const pw = words[p.word]!;
        for (let i = 0; i < pw.length; i++) for (let j = 0; j < w.length; j++) {
          if (pw[i] !== w[j]) continue;
          const across = !p.across;
          const pr = p.r + (p.across ? 0 : i); const pc = p.c + (p.across ? i : 0);
          const r0 = across ? pr : pr - j; const c0 = across ? pc - j : pc;
          const score = canPlace(w, r0, c0, across);
          if (score <= 0) continue;
          const s = score + random() * 0.5;
          if (!best || s > best.score) best = { r: r0, c: c0, across, score: s };
        }
      }
      if (best) put(k, best.r, best.c, best.across);
      else left.push(k);
    }
    rest = left;
  }
  let minR = Infinity; let minC = Infinity; let maxR = -Infinity; let maxC = -Infinity;
  for (const k of cells.keys()) {
    const [rr, c] = k.split(',').map(Number) as [number, number];
    minR = Math.min(minR, rr); maxR = Math.max(maxR, rr); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  const area = Number.isFinite(minR) ? (maxR - minR + 1) * (maxC - minC + 1) : 0;
  return { cells, placed, unplaced: rest, area };
}

export function crosswordBox(input: GridBoxInput): GridBox {
  const ex = input.exercise!;
  const { style } = input;
  const words = ex.entries.map((e) => lettersOf(e.word, style.grid.uppercase));
  const random = seededRandom(input.seed ?? 1, ex.ordinal, 'crossword');
  const key = (rr: number, c: number): string => `${rr},${c}`;
  // The longest words first, then a few other orders drawn from the seed:
  // the grid that places the most words wins, then the smallest.
  const byLength = words.map((_, k) => k).sort((a, b) => words[b]!.length - words[a]!.length || a - b);
  let best = layCrossword(words, byLength, random);
  for (let t = 0; t < 24 && best.unplaced.length > 0; t++) {
    const order = [byLength[0]!, ...shuffledOrder(words.length - 1, random, false).map((k) => byLength[k + 1]!)];
    const tried = layCrossword(words, order, random);
    if (tried.unplaced.length < best.unplaced.length || (tried.unplaced.length === best.unplaced.length && tried.area < best.area)) best = tried;
  }
  const { cells, placed, unplaced } = best;
  // The grid's extent, and the numbers of the cells a word starts in, in
  // reading order.
  let minR = Infinity; let minC = Infinity; let maxR = -Infinity; let maxC = -Infinity;
  for (const k of cells.keys()) {
    const [rr, c] = k.split(',').map(Number) as [number, number];
    minR = Math.min(minR, rr); maxR = Math.max(maxR, rr); minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  }
  if (!Number.isFinite(minR)) { minR = maxR = minC = maxC = 0; }
  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const starts = [...placed].sort((a, b) => (a.r - b.r) || (a.c - b.c));
  const numbers = new Map<string, number>();
  for (const p of starts) {
    const k = key(p.r, p.c);
    if (!numbers.has(k)) numbers.set(k, numbers.size + 1);
  }
  const cell = Math.min(dimPt(style.grid.cell, input.bodySizePt), input.measurePt / cols);
  const w = cols * cell; const h = rows * cell;
  const els: DesignElement[] = [];
  let boxes = '';
  for (const k of cells.keys()) {
    const [rr, c] = k.split(',').map(Number) as [number, number];
    const x = (c - minC) * cell; const y = (rr - minR) * cell;
    boxes += `M${r(x)} ${r(y)}H${r(x + cell)}V${r(y + cell)}H${r(x)}Z`;
  }
  // The cells no word takes, filled when the style says so (`grid.blocked`).
  if (style.grid.blocked) {
    let blocked = '';
    for (let rr = minR; rr <= maxR; rr++) for (let c = minC; c <= maxC; c++) {
      if (cells.has(key(rr, c))) continue;
      const x = (c - minC) * cell; const y = (rr - minR) * cell;
      blocked += `M${r(x)} ${r(y)}H${r(x + cell)}V${r(y + cell)}H${r(x)}Z`;
    }
    if (blocked) els.push(pathElement('blocked', blocked, w, h, style.grid.blocked, 0.1, { fill: style.grid.blocked }));
  }
  els.push(pathElement('cells', boxes, w, h, style.grid.rule ?? BLACK, dimPt(style.grid.ruleWidth, input.bodySizePt), { fill: { hex: '#ffffff', model: 'hex' } }));
  for (const [k, n] of numbers) {
    const [rr, c] = k.split(',').map(Number) as [number, number];
    els.push(textElement(`n${n}`, (input.num ?? String)(n), (c - minC) * cell + cell * 0.06, (rr - minR) * cell + cell * 0.02, cell * 0.6, cell * 0.36, cell * 0.28, { align: 'start', verticalAlign: 'top', ...(input.font ? { fontFamily: input.font } : {}) }));
  }
  const slots: ExerciseSlot[] = [];
  for (const [k, letter] of cells) {
    const [rr, c] = k.split(',').map(Number) as [number, number];
    slots.push({ key: `c${rr - minR}_${c - minC}`, kind: 'cell', accept: [letter], cell: [rr - minR, c - minC] });
    if (input.teacher) {
      els.push(textElement(`a${rr}_${c}`, letter, (c - minC) * cell, (rr - minR) * cell + cell * 0.08, cell, cell * 0.92, letterSize(style, input.bodySizePt, cell, 0.56), { color: style.answers.color, ...(style.answers.fontFamily ?? input.font ? { fontFamily: (style.answers.fontFamily ?? input.font)! } : {}) }));
    }
  }
  const box = drawnBox(input.id, els, h, 4, 6) as GridBox;
  box.info = { kind: 'crossword', rows, cols, cellPt: cell, xPt: 0, yPt: 0, ...(input.rtl ? { rtl: true as const } : {}) };
  box.slots = slots;
  const num = input.num ?? String;
  const clue = (p: Placement): { label: string; clue?: Run } => ({ label: num(numbers.get(key(p.r, p.c))!), ...(ex.entries[p.word]!.clue ? { clue: ex.entries[p.word]!.clue } : {}) });
  const across = placed.filter((p) => p.across).sort((a, b) => numbers.get(key(a.r, a.c))! - numbers.get(key(b.r, b.c))!);
  const down = placed.filter((p) => !p.across).sort((a, b) => numbers.get(key(a.r, a.c))! - numbers.get(key(b.r, b.c))!);
  box.clues = [
    ...(across.length > 0 ? [{ label: input.words?.across ?? 'Across', heading: true }, ...across.map(clue)] : []),
    ...(down.length > 0 ? [{ label: input.words?.down ?? 'Down', heading: true }, ...down.map(clue)] : []),
  ];
  // The key in the language's words, not arrows: many text faces (Naskh,
  // Mincho cuts, school faces) have no → ↓.
  const keyOf = (label: string, list: Placement[]): string[] => (list.length > 0 ? [`${label}: ${list.map((p) => `${num(numbers.get(key(p.r, p.c))!)} ${ex.entries[p.word]!.word}`).join(input.words?.comma ?? ', ')}`] : []);
  box.key = [...keyOf(input.words?.across ?? 'Across', across), ...keyOf(input.words?.down ?? 'Down', down)];
  box.unplaced = unplaced.map((k) => ex.entries[k]!.word);
  return box;
}
