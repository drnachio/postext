/**
 * The exercises drawn on a grid (#1228): two columns with dots to join, a
 * word search, a crossword and operations in columns. Each is generated
 * here — seeded, so it is the same in every output — and drawn as a box
 * design (`designs.ts`). The teacher's edition draws the answers in place.
 */

import type { ContentBlock } from '../parse/index.js';
import type { CalloutStyleConfig, ColorValue, DesignElement, DigitSystem } from '../types.js';
import { withDigits } from '../numerals/arabicNumerals.js';
import type { ResolvedExerciseStyle } from '../defaults/boxes/exercises.js';
import { graphemesOf } from '../measure/graphemes.js';
import { drawnBox, pathElement, textElement } from './designs.js';
import type { ExerciseModel, ExerciseOperation } from './types.js';
import type { ExerciseGridInfo, ExerciseSlot } from './record.js';
import { seededRandom, shuffledOrder } from './shuffle.js';
import { runOf, type Run } from './text.js';
import { dimPt } from './expand.js';

const r = (n: number): string => String(Math.round(n * 100) / 100);

/** The size of a grid's letters: the style's `grid.fontSize` (an `em` of
 *  the text), else `share` of the cell. */
function letterSize(style: ResolvedExerciseStyle, bodySizePt: number, cell: number, share: number): number {
  return style.grid.fontSize ? dimPt(style.grid.fontSize, bodySizePt) : cell * share;
}
const BLACK: ColorValue = { hex: '#000000', model: 'hex' };

export interface GridBoxInput {
  kind: 'match' | 'wordsearch' | 'crossword' | 'arithmetic';
  id: string;
  style: ResolvedExerciseStyle;
  bodySizePt: number;
  lineHeightPt: number;
  measurePt: number;
  teacher?: boolean;
  seed?: number;
  exercise?: ExerciseModel;
  blocks?: readonly ContentBlock[];
  /** Match: the left items, the right column in printed order, the right
   *  position each left item joins (a teacher's edition) and the labels. */
  left?: string[];
  right?: string[];
  links?: number[];
  labels?: string[];
  /** A right-to-left page: the engine mirrors the drawing. */
  rtl?: boolean;
  /** The text's font family, for the letters drawn. */
  font?: string;
  /** The words of the document language (a crossword's clue headings),
   *  and what separates two entries of a list (`, `, `، `, `、`). */
  words?: { across: string; down: string; comma?: string };
  /** The document's digits, when they are not the European ones. */
  digits?: DigitSystem;
  /** A number in the document's digits (a crossword's cells and clues). */
  num?: (n: number) => string;
}

export type GridBox = CalloutStyleConfig & {
  slots?: ExerciseSlot[];
  key?: string[];
  clues?: Array<{ label: string; clue?: Run; heading?: boolean }>;
  words?: string[];
  info?: Omit<ExerciseGridInfo, 'box'>;
  /** Words a crossword or word search could not place. */
  unplaced?: string[];
};

export function gridBox(input: GridBoxInput): GridBox {
  switch (input.kind) {
    case 'match': return matchBox(input);
    case 'wordsearch': return wordSearchBox(input);
    case 'crossword': return crosswordBox(input);
    case 'arithmetic': return arithmeticBox(input);
  }
}

/** A circle path (two arcs) of radius `rad` at (x, y). */
const circle = (x: number, y: number, rad: number): string => `M${r(x - rad)} ${r(y)}A${r(rad)} ${r(rad)} 0 1 0 ${r(x + rad)} ${r(y)}A${r(rad)} ${r(rad)} 0 1 0 ${r(x - rad)} ${r(y)}Z`;

// --- Match ---------------------------------------------------------------------

function matchBox(input: GridBoxInput): GridBox {
  const { style } = input;
  const left = input.left ?? [];
  const right = input.right ?? [];
  const size = input.bodySizePt;
  const w = input.measurePt;
  const gap = Math.min(w * 0.3, dimPt(style.match.gap, size));
  const colW = (w - gap) / 2;
  const dot = dimPt(style.match.dotSize, size) / 2;
  const rows = Math.max(left.length, right.length);
  // Lines a text takes in its column, estimated from its length.
  const perLine = Math.max(8, Math.floor(colW / (size * 0.5)));
  const linesOf = (t: string | undefined): number => Math.max(1, Math.ceil((t?.length ?? 0) / perLine));
  const rowLines = Array.from({ length: rows }, (_, i) => Math.min(3, Math.max(linesOf(left[i]), linesOf(right[i]))));
  const pad = size * 0.45;
  const rowH = rowLines.map((n) => n * input.lineHeightPt + pad);
  const tops: number[] = [];
  let y = 0;
  for (const h of rowH) { tops.push(y); y += h; }
  const height = y;
  const els: DesignElement[] = [];
  const lx = colW - dot * 1.5;
  const rx = colW + gap + dot * 1.5;
  let dots = '';
  for (let i = 0; i < rows; i++) {
    const cy = tops[i]! + rowH[i]! / 2;
    if (left[i] !== undefined) {
      els.push(textElement(`l${i}`, left[i]!, 0, tops[i]!, colW - dot * 4, rowH[i]!, size, { align: 'end', overflow: 'wrap', lineHeight: { value: input.lineHeightPt, unit: 'pt' }, ...(input.font ? { fontFamily: input.font } : {}) }));
      dots += circle(lx, cy, dot);
    }
    if (right[i] !== undefined) {
      const label = input.labels?.[i] && style.match.look === 'letters' ? `${input.labels[i]} ` : '';
      els.push(textElement(`r${i}`, label + right[i]!, colW + gap + dot * 4, tops[i]!, colW - dot * 4, rowH[i]!, size, { align: 'start', overflow: 'wrap', lineHeight: { value: input.lineHeightPt, unit: 'pt' }, ...(input.font ? { fontFamily: input.font } : {}) }));
      dots += circle(rx, tops[i]! + rowH[i]! / 2, dot);
    }
  }
  els.push(pathElement('dots', dots, w, height, style.match.color, 0.1, { fill: style.match.color }));
  if (input.links) {
    let d = '';
    input.links.forEach((pos, i) => {
      d += `M${r(lx)} ${r(tops[i]! + rowH[i]! / 2)}L${r(rx)} ${r(tops[pos]! + rowH[pos]! / 2)}`;
    });
    els.push(pathElement('links', d, w, height, style.answers.color, 1.1));
  }
  const box = drawnBox(input.id, els, height) as GridBox;
  box.info = { kind: 'match', rows, cols: 2, cellPt: 0, xPt: lx, yPt: 0, rowsPt: tops.map((t, i) => t + rowH[i]! / 2), dotsPt: [lx, rx], ...(input.rtl ? { rtl: true as const } : {}) };
  return box;
}

// --- Word search ---------------------------------------------------------------

const DIRS: Record<string, Array<[number, number]>> = {
  across: [[0, 1]],
  down: [[1, 0]],
  diagonal: [[1, 1], [-1, 1]],
  backwards: [[0, -1], [-1, 0], [-1, -1], [1, -1]],
};

/** The letters of a word as the grid sets them. */
function lettersOf(word: string, upper: boolean, locale?: string): string[] {
  return graphemesOf(upper ? word.toLocaleUpperCase(locale) : word);
}

function wordSearchBox(input: GridBoxInput): GridBox {
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

function crosswordBox(input: GridBoxInput): GridBox {
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

// --- Operations in columns -----------------------------------------------------

interface OpLayout { cells: Array<{ r: number; c: number; text: string; answer?: boolean; slot?: string }>; rules: Array<[number, number, number]>; rows: number; cols: number; extra?: string }

const OP_SIGN: Record<ExerciseOperation['op'], string> = { '+': '+', '-': '−', '×': '×', '÷': '÷' };

/** A decimal mark (`,` `.` `٫`). */
const isMark = (g: string): boolean => g === ',' || g === '.' || g === '\u066B';

/** The digits of a number before and after its decimal mark. */
function splitAtMark(n: string[]): { int: string[]; frac: string[]; mark?: string } {
  const at = n.findIndex(isMark);
  return at < 0 ? { int: n, frac: [] } : { int: n.slice(0, at), frac: n.slice(at + 1), mark: n[at]! };
}

/** The partial products of `a × b` (#1244): one per digit of `b` that is
 *  not zero, from its last, with how many places it stands left. */
function partialProducts(a: string[], b: string[]): Array<{ digits: string[]; shift: number }> {
  const toAscii = (g: string): string => { const c = g.charCodeAt(0); return c >= 0x0660 && c <= 0x0669 ? String(c - 0x0660) : c >= 0x06f0 && c <= 0x06f9 ? String(c - 0x06f0) : g; };
  const like = (t: string): string[] => graphemesOf(t).map((d) => (/[٠-٩]/.test(a.join('')) ? String.fromCharCode(0x0660 + Number(d)) : /[۰-۹]/.test(a.join('')) ? String.fromCharCode(0x06f0 + Number(d)) : d));
  const x = BigInt(a.filter((g) => !isMark(g)).map(toAscii).join('') || '0');
  const ds = b.filter((g) => !isMark(g)).map(toAscii);
  const out: Array<{ digits: string[]; shift: number }> = [];
  for (let p = 0; p < ds.length; p++) {
    const d = BigInt(ds[ds.length - 1 - p]!);
    if (d === 0n) continue;
    out.push({ digits: like((x * d).toString()), shift: p });
  }
  return out;
}

/** The layout choices of an operation. */
interface OpOptions {
  division: 'bracket' | 'potence' | 'inline';
  partialProducts: boolean;
  working: 'products' | 'remainders';
}

/** One operation set in cells: rows of digits right-aligned (an addition's
 *  and a subtraction's decimal marks one under the other), the sign at the
 *  left, rules under the operands, a multiplication's partial products,
 *  the answer's cells. */
function layOperation(op: ExerciseOperation, opts: OpOptions, k: number): OpLayout {
  const cells: OpLayout['cells'] = [];
  const rules: OpLayout['rules'] = [];
  const a = graphemesOf(op.a); const b = graphemesOf(op.b); const res = graphemesOf(op.result);
  if (op.op === '×') {
    const parts = opts.partialProducts ? partialProducts(a, b) : [];
    const partial = parts.length > 1 ? parts : [];
    const width = Math.max(a.length, b.length + 1, res.length, ...partial.map((p) => p.digits.length + p.shift)) + 1;
    a.forEach((d, j) => cells.push({ r: 0, c: width - a.length + j, text: d }));
    cells.push({ r: 1, c: 0, text: op.sign ?? OP_SIGN[op.op] });
    b.forEach((d, j) => cells.push({ r: 1, c: width - b.length + j, text: d }));
    rules.push([2, 0, width]);
    partial.forEach((p, i) => p.digits.forEach((d, j) => cells.push({ r: 2 + i, c: width - p.shift - p.digits.length + j, text: d, answer: true, slot: `a${k}_p${i + 1}_${j}` })));
    const at = 2 + partial.length;
    if (partial.length > 0) rules.push([at, 0, width]);
    res.forEach((d, j) => cells.push({ r: at, c: width - res.length + j, text: d, answer: true, slot: `a${k}_${j}` }));
    return { cells, rules, rows: at + 1, cols: width };
  }
  if (op.op !== '÷') {
    // Lined up on the decimal mark: the integer digits end in one column,
    // the mark (when any number has one) in the next.
    const nums = [splitAtMark(a), splitAtMark(b), splitAtMark(res)];
    const frac = Math.max(...nums.map((n) => n.frac.length));
    const intW = Math.max(nums[0]!.int.length, nums[1]!.int.length + 1, nums[2]!.int.length);
    const width = intW + 1 + (frac > 0 ? 1 + frac : 0);
    const place = (n: { int: string[]; frac: string[]; mark?: string }, row: number, answer: boolean): void => {
      const digits = [...n.int, ...(n.mark ? [n.mark, ...n.frac] : [])];
      digits.forEach((d, j) => {
        const c = j < n.int.length ? intW - n.int.length + 1 + j : intW + 1 + (j - n.int.length);
        cells.push({ r: row, c, text: d, ...(answer ? { answer: true, slot: `a${k}_${j}` } : {}) });
      });
    };
    place(nums[0]!, 0, false);
    cells.push({ r: 1, c: 0, text: op.sign ?? OP_SIGN[op.op] });
    place(nums[1]!, 1, false);
    rules.push([2, 0, width]);
    place(nums[2]!, 2, true);
    return { cells, rules, rows: 3, cols: width };
  }
  // The working rows under a long division: a step for each digit of the
  // quotient that is not zero, its product and what is left, or what is
  // left only (#1244).
  const steps = res.filter((g) => !isMark(g) && !/^[0٠۰]$/.test(g)).length;
  const working = Math.max(1, steps * (opts.working === 'remainders' ? 1 : 2));
  const division = opts.division;
  const q = res;
  const rem = op.remainder ? graphemesOf(op.remainder) : [];
  if (division === 'bracket') {
    // ⟌: the quotient over the dividend, the divisor to the left.
    const lead = b.length + 1;
    const cols = lead + a.length;
    q.forEach((d, j) => cells.push({ r: 0, c: cols - q.length + j, text: d, answer: true, slot: `a${k}_${j}` }));
    b.forEach((d, j) => cells.push({ r: 1, c: j, text: d }));
    a.forEach((d, j) => cells.push({ r: 1, c: lead + j, text: d }));
    rules.push([1, lead, cols]);
    return { cells, rules, rows: 2 + working, cols, extra: `bracket:${lead}` };
  }
  if (division === 'potence') {
    // The divisor right of the dividend under an L, the quotient under it.
    const left = a.length;
    const cols = left + Math.max(b.length, q.length) + 1;
    a.forEach((d, j) => cells.push({ r: 0, c: j, text: d }));
    b.forEach((d, j) => cells.push({ r: 0, c: left + 1 + j, text: d }));
    rules.push([1, left + 0.5, cols]);
    q.forEach((d, j) => cells.push({ r: 1, c: left + 1 + j, text: d, answer: true, slot: `a${k}_${j}` }));
    const rows = 1 + working;
    rem.forEach((d, j) => cells.push({ r: rows - 1, c: left - rem.length + j, text: d, answer: true, slot: `a${k}_r${j}` }));
    return { cells, rules, rows, cols, extra: `potence:${left}` };
  }
  // `864 : 4 = 216`, the steps under it.
  const line = [...a, op.sign ?? ':', ...b, '='];
  line.forEach((d, j) => cells.push({ r: 0, c: j, text: d }));
  q.forEach((d, j) => cells.push({ r: 0, c: line.length + j, text: d, answer: true, slot: `a${k}_${j}` }));
  const cols = line.length + q.length + (rem.length > 0 ? rem.length + 2 : 0);
  if (rem.length > 0) {
    cells.push({ r: 0, c: line.length + q.length + 1, text: 'R' });
    rem.forEach((d, j) => cells.push({ r: 0, c: line.length + q.length + 2 + j, text: d, answer: true, slot: `a${k}_r${j}` }));
  }
  return { cells, rules, rows: 1 + working, cols };
}

function arithmeticBox(input: GridBoxInput): GridBox {
  const ex = input.exercise!;
  const { style } = input;
  const cell = dimPt(style.grid.cell, input.bodySizePt) * 0.8;
  // Written in European digits in a book that prints others, an operation
  // takes the book's (`numerals`).
  const D = (t: string): string => withDigits(t, input.digits);
  const written = ex.operations.map((op) => ({ ...op, a: D(op.a), b: D(op.b), result: D(op.result), ...(op.remainder ? { remainder: D(op.remainder) } : {}) }));
  const ops = written.map((op, k) => layOperation(op, style.arithmetic, k + 1));
  const gapCols = 2;
  const columns = style.arithmetic.columns;
  const room = Math.max(1, Math.floor(input.measurePt / cell + gapCols));
  // Rows of operations in slots of one width, so they line up in columns;
  // when one is much wider than the rest (a German `638 : 3 = 212 R 2`),
  // rows packed by each one's own width when that sets fewer rows.
  const colW = Math.max(1, ...ops.map((o) => o.cols)) + gapCols;
  const perRow = Math.max(1, Math.min(columns, Math.floor(room / colW)));
  const packed: number[][] = [];
  let used = room;
  ops.forEach((o, k) => {
    if (used + o.cols + gapCols > room || packed[packed.length - 1]!.length >= columns) { packed.push([]); used = 0; }
    packed[packed.length - 1]!.push(k);
    used += o.cols + gapCols;
  });
  const uniform = Array.from({ length: Math.ceil(ops.length / perRow) }, (_, i) => ops.map((_, k) => k).slice(i * perRow, i * perRow + perRow));
  const rowList = packed.length < uniform.length ? packed : uniform;
  const offsets: number[] = [];
  for (const row of rowList) {
    let x = 0;
    for (const k of row) { offsets[k] = x; x += rowList === uniform ? colW : ops[k]!.cols + gapCols; }
  }
  const widthCells = Math.max(1, ...ops.map((o, k) => offsets[k]! + o.cols));
  const w = Math.min(input.measurePt, widthCells * cell);
  // Numbers read left to right on a right-to-left page too: the engine
  // mirrors a design there, so each operation is drawn mirrored in its own
  // box first (the operations follow one another right to left).
  let mirrorAt = 0;
  let mirrorW = 0;
  const X = (x: number): number => (input.rtl ? mirrorAt + mirrorW - (x - mirrorAt) : x);
  const els: DesignElement[] = [];
  let rulesD = '';
  let boxesD = '';
  let y = 0;
  const slots: ExerciseSlot[] = [];
  const fontColor = style.grid.color ? { color: style.grid.color } : {};
  const font = style.grid.fontFamily ?? input.font ? { fontFamily: (style.grid.fontFamily ?? input.font)! } : {};
  for (const ks of rowList) {
    const row = ks.map((k) => ops[k]!);
    const rows = Math.max(...row.map((o) => o.rows));
    row.forEach((o, j) => {
      const k = ks[j]!;
      const ox = offsets[k]! * cell;
      mirrorAt = ox;
      mirrorW = o.cols * cell;
      for (const c of o.cells) {
        const x = ox + c.c * cell; const yy = y + c.r * cell;
        if (c.answer) {
          boxesD += `M${r(X(x))} ${r(yy)}H${r(X(x + cell))}V${r(yy + cell)}H${r(X(x))}Z`;
          // A cell's column in the flow's direction: on a right-to-left page,
          // counted from the right, where its operation (drawn mirrored in
          // its own box first) is painted.
          if (c.slot) slots.push({ key: c.slot, kind: 'cell', accept: [c.text], cell: [Math.round(yy / cell), input.rtl ? offsets[k]! + o.cols - c.c - 1 : Math.round(x / cell)] });
          if (!input.teacher) continue;
        }
        els.push(textElement(`d${k}_${c.r}_${c.c}`, c.text, input.rtl ? X(x) - cell : x, yy, cell, cell, letterSize(style, input.bodySizePt, cell, 0.7), c.answer ? { color: style.answers.color, ...(style.answers.fontFamily ?? input.font ? { fontFamily: (style.answers.fontFamily ?? input.font)! } : {}) } : { ...font, ...fontColor }));
      }
      for (const [rr, c0, c1] of o.rules) rulesD += `M${r(X(ox + c0 * cell))} ${r(y + rr * cell)}H${r(X(ox + c1 * cell))}`;
      if (o.extra?.startsWith('bracket:')) {
        const lead = Number(o.extra.slice(8));
        rulesD += `M${r(X(ox + lead * cell))} ${r(y + cell)}Q${r(X(ox + (lead + 0.3) * cell))} ${r(y + 1.5 * cell)} ${r(X(ox + lead * cell))} ${r(y + 2 * cell)}`;
      }
      if (o.extra?.startsWith('potence:')) {
        const left = Number(o.extra.slice(8));
        rulesD += `M${r(X(ox + (left + 0.5) * cell))} ${r(y)}V${r(y + 2 * cell)}`;
      }
    });
    y += (rows + 1) * cell;
  }
  const ruleW = dimPt(style.grid.ruleWidth, input.bodySizePt) * 1.4;
  els.unshift(pathElement('answers', boxesD, w, y, style.grid.rule, ruleW * 0.5, { dash: [{ value: ruleW, unit: 'pt' }, { value: ruleW * 1.5, unit: 'pt' }] }));
  els.push(pathElement('rules', rulesD, w, y, style.grid.color ?? BLACK, ruleW));
  const box = drawnBox(input.id, els, y, 4, 4) as GridBox;
  box.info = { kind: 'arithmetic', rows: Math.round(y / cell), cols: widthCells, cellPt: cell, xPt: 0, yPt: 0, ...(input.rtl ? { rtl: true as const } : {}) };
  box.slots = slots;
  box.key = written.map((op) => `${op.a} ${op.sign ?? OP_SIGN[op.op]} ${op.b} = ${op.result}${op.remainder ? ` (${op.remainder})` : ''}`);
  return box;
}

/** The plain text of a block (for keys). */
export function blockText(b: ContentBlock): string {
  return runOf(b).text;
}

