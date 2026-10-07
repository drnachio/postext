/**
 * The black-handling pass over a content stream (#604), run on every page
 * and every vector form of a colour-managed (ICC) render once its
 * operators are written:
 *
 * - **Overprint**: whatever paints in 100 % K only (black text, rules,
 *   strokes, small black shapes) overprints — `op`/`OP` true with `OPM 1`
 *   — so a plate shifting on press never opens a white halo round it.
 *   Everything else knocks out, as before; pictures and shadings never
 *   overprint.
 * - **Rich black**: a K-only fill whose smaller side reaches
 *   `richBlackMinSize` (a background, a band, a box) is set in the
 *   rich-black recipe instead, and knocks out. Text never turns rich.
 *
 * Working on the operators rather than at each painter catches every way
 * the backend paints (pdf-lib's `drawRectangle`/`drawSvgPath`, raw
 * operator runs, text objects) with one rule.
 */

import { PDFName, PDFNumber, PDFOperator, PDFOperatorNames, type PDFPage } from 'pdf-lib';
import { dimensionToPx } from 'postext';
import type { PrintColorMode } from './colorMode';

/** Overprint flags of a graphics state: fill (`op`) and stroke (`OP`). */
export interface OverprintFlags {
  fill: boolean;
  stroke: boolean;
}

/** Registers (or reuses) the ExtGState for a pair of flags in the
 *  resources the operators run against, returning its name. */
export type OverprintStateFactory = (flags: OverprintFlags) => PDFName;

type Matrix = [number, number, number, number, number, number];

interface GState {
  ctm: Matrix;
  fillK: boolean;
  strokeK: boolean;
  op: OverprintFlags;
  textMode: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  // m then n (PDF: CTM' = m × CTM).
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

interface OperatorParts {
  name: string;
  args: unknown[];
}

function parts(op: PDFOperator): OperatorParts {
  const o = op as unknown as { name: string; args?: unknown[] };
  return { name: o.name, args: o.args ?? [] };
}

function num(arg: unknown): number {
  if (arg instanceof PDFNumber) return arg.asNumber();
  if (typeof arg === 'number') return arg;
  if (typeof arg === 'string') return Number(arg);
  const n = (arg as { asNumber?: () => number; numberValue?: number })?.asNumber?.();
  return typeof n === 'number' ? n : NaN;
}

const EPS = 1e-4;

function isKOnlySolid(args: unknown[]): boolean {
  if (args.length !== 4) return false;
  const [c, m, y, k] = args.map(num) as [number, number, number, number];
  return Math.abs(c) < EPS && Math.abs(m) < EPS && Math.abs(y) < EPS && Math.abs(k - 1) < EPS;
}

const FILL_COLOR_OPS = new Set(['g', 'rg', 'sc', 'scn', 'cs']);
const STROKE_COLOR_OPS = new Set(['G', 'RG', 'SC', 'SCN', 'CS']);
const PATH_OPS = new Set(['m', 'l', 'c', 'v', 'y', 're', 'h']);
const FILL_PAINT = new Set(['f', 'F', 'f*']);
const STROKE_PAINT = new Set(['S', 's']);
const BOTH_PAINT = new Set(['B', 'B*', 'b', 'b*']);
const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"']);

export interface PrintPassOptions {
  /** Apply rich black to large K-only fills. Off for forms, whose size on
   *  the page is not known when they are written. */
  richBlack: boolean;
  /** User-space units per point at the identity CTM (1 for a page). */
  unitsPerPoint?: number;
}

/** Run the black-handling pass over `ops`, returning the new operator
 *  list. `stateFor` names the overprint ExtGStates in the stream's
 *  resources. */
export function applyPrintPass(
  ops: readonly PDFOperator[],
  mode: PrintColorMode,
  stateFor: OverprintStateFactory,
  options: PrintPassOptions = { richBlack: false },
): PDFOperator[] {
  const black = mode.config.black;
  const overprint = black.overprint;
  const rich = black.richBlack && options.richBlack;
  const richColor = black.richBlackColor;
  // Minimum side in points (the dimension's own unit, through 72 dpi).
  const minSide = dimensionToPx(black.richBlackMinSize, 72) * (options.unitsPerPoint ?? 1);
  const named = stateFor;
  const richOps = (): PDFOperator[] => [
    PDFOperator.of(PDFOperatorNames.NonStrokingColorCmyk, [
      PDFNumber.of(richColor.c / 100),
      PDFNumber.of(richColor.m / 100),
      PDFNumber.of(richColor.y / 100),
      PDFNumber.of(richColor.k / 100),
    ]),
  ];

  const out: PDFOperator[] = [];
  const stack: GState[] = [];
  let gs: GState = { ctm: IDENTITY, fillK: false, strokeK: false, op: { fill: false, stroke: false }, textMode: 0 };
  let pathStart = -1;
  let box: [number, number, number, number] | null = null;

  const extend = (x: number, y: number) => {
    const m = gs.ctm;
    const px = m[0] * x + m[2] * y + m[4];
    const py = m[1] * x + m[3] * y + m[5];
    if (!box) box = [px, py, px, py];
    else {
      if (px < box[0]) box[0] = px;
      if (py < box[1]) box[1] = py;
      if (px > box[2]) box[2] = px;
      if (py > box[3]) box[3] = py;
    }
  };

  /** Operators switching the overprint state to `want`, when it differs. */
  const switchTo = (want: OverprintFlags): PDFOperator[] => {
    if (want.fill === gs.op.fill && want.stroke === gs.op.stroke) return [];
    gs.op = { ...want };
    return [PDFOperator.of(PDFOperatorNames.SetGraphicsStateParams, [named(want)])];
  };

  for (const op of ops) {
    const { name, args } = parts(op);
    if (name === 'q') {
      stack.push({ ...gs, op: { ...gs.op } });
      out.push(op);
      continue;
    }
    if (name === 'Q') {
      gs = stack.pop() ?? gs;
      out.push(op);
      continue;
    }
    if (name === 'cm' && args.length === 6) {
      gs.ctm = multiply(args.map(num) as Matrix, gs.ctm);
      out.push(op);
      continue;
    }
    if (name === 'k') {
      gs.fillK = isKOnlySolid(args);
      out.push(op);
      continue;
    }
    if (name === 'K') {
      gs.strokeK = isKOnlySolid(args);
      out.push(op);
      continue;
    }
    if (FILL_COLOR_OPS.has(name)) {
      gs.fillK = false;
      out.push(op);
      continue;
    }
    if (STROKE_COLOR_OPS.has(name)) {
      gs.strokeK = false;
      out.push(op);
      continue;
    }
    if (name === 'Tr') {
      gs.textMode = num(args[0]);
      out.push(op);
      continue;
    }
    if (PATH_OPS.has(name)) {
      if (pathStart < 0) {
        pathStart = out.length;
        box = null;
      }
      const n = args.map(num);
      if (name === 're') {
        const [x, y, w, h] = n as [number, number, number, number];
        extend(x, y);
        extend(x + w, y);
        extend(x, y + h);
        extend(x + w, y + h);
      } else {
        for (let i = 0; i + 1 < n.length; i += 2) extend(n[i]!, n[i + 1]!);
      }
      out.push(op);
      continue;
    }
    const fills = FILL_PAINT.has(name) || BOTH_PAINT.has(name);
    const strokes = STROKE_PAINT.has(name) || BOTH_PAINT.has(name);
    if (fills || strokes) {
      const at = pathStart < 0 ? out.length : pathStart;
      const b = box as [number, number, number, number] | null;
      const large = !!b && Math.min(b[2] - b[0], b[3] - b[1]) >= minSide;
      if (fills && gs.fillK && rich && large) {
        // Rich black, knocked out, inside its own state so the K-only
        // colour (and the overprint) come back after it.
        const saved = { ...gs, op: { ...gs.op } };
        const pre = [PDFOperator.of(PDFOperatorNames.PushGraphicsState), ...switchTo({ fill: false, stroke: overprint && strokes && gs.strokeK }), ...richOps()];
        out.splice(at, 0, ...pre);
        out.push(op, PDFOperator.of(PDFOperatorNames.PopGraphicsState));
        gs = saved;
      } else {
        const want = {
          fill: overprint && (fills ? gs.fillK : gs.op.fill),
          stroke: overprint && (strokes ? gs.strokeK : gs.op.stroke),
        };
        // Only what this paint uses decides: keep the other flag.
        if (!fills) want.fill = gs.op.fill && overprint;
        if (!strokes) want.stroke = gs.op.stroke && overprint;
        out.splice(at, 0, ...switchTo(want));
        out.push(op);
      }
      pathStart = -1;
      box = null;
      continue;
    }
    if (name === 'n') {
      pathStart = -1;
      box = null;
      out.push(op);
      continue;
    }
    if (TEXT_SHOW.has(name)) {
      // Modes 0/4 fill, 1/5 stroke, 2/6 both; 3/7 paint nothing.
      const m = gs.textMode % 4;
      const fill = m === 0 || m === 2;
      const stroke = m === 1 || m === 2;
      out.push(
        ...switchTo({
          fill: overprint && (fill ? gs.fillK : gs.op.fill),
          stroke: overprint && (stroke ? gs.strokeK : gs.op.stroke),
        }),
        op,
      );
      continue;
    }
    if (name === 'Do' || name === 'sh' || name === 'BI') {
      // Pictures, forms and shadings never overprint.
      out.push(...switchTo({ fill: false, stroke: false }), op);
      continue;
    }
    out.push(op);
  }
  return out;
}

/** The ExtGState dictionary of a pair of overprint flags. */
export function overprintStateDict(flags: OverprintFlags): { Type: string; op: boolean; OP: boolean; OPM: number } {
  return { Type: 'ExtGState', op: flags.fill, OP: flags.stroke, OPM: 1 };
}

/** Run the pass over a page's content stream, registering the overprint
 *  states in the page's resources. Rich black applies (a page's user space
 *  is in points). */
export function runPagePrintPass(page: PDFPage, mode: PrintColorMode): void {
  const stream = (page as unknown as { contentStream?: { operators: PDFOperator[] } }).contentStream;
  if (!stream) return;
  const states = new Map<string, PDFName>();
  const next = applyPrintPass(stream.operators, mode, (flags) => {
    const key = `${flags.fill}|${flags.stroke}`;
    let name = states.get(key);
    if (!name) states.set(key, (name = page.node.newExtGState('GSo', page.doc.context.obj(overprintStateDict(flags)))));
    return name;
  }, { richBlack: true });
  // In place: pdf-lib serializes the stream from this array.
  stream.operators.length = 0;
  for (const op of next) stream.operators.push(op);
}
