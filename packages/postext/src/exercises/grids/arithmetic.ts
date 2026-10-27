// Operations in columns: sums, differences, products and long division.
import type { DesignElement } from '../../types.js';
import { withDigits } from '../../numerals/arabicNumerals.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { textElement, pathElement, drawnBox } from '../designs.js';
import type { ExerciseOperation } from '../types.js';
import type { ExerciseSlot } from '../record.js';
import { dimPt } from '../expand.js';
import type { GridBoxInput, GridBox } from '../grids.js';
import { r, letterSize, BLACK } from './common.js';

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

export function arithmeticBox(input: GridBoxInput): GridBox {
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
