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
 *
 * - **Spot colours**: the CMYK stand-in of a spot colour (see `spot.ts`)
 *   becomes its ink's Separation colour space at the tint, and the paint
 *   overprints when the ink does (a varnish, an ink laid over process).
 * - **White and varnish**: no later paint knocks their plates out; the
 *   stream draws them a second time at its end when one would
 *   (`inkLayers.ts`).
 */

import { PDFDict, PDFName, PDFNumber, PDFOperator, PDFOperatorNames, type PDFPage } from 'pdf-lib';
import { channelsOffPlates, dimensionToPx } from 'postext';
import type { PrintColorMode } from './colorMode.js';
import type { SpotPlate, StandInPaint } from './spot.js';
import { withInkLayers } from './inkLayers.js';

/** Overprint flags of a graphics state: fill (`op`) and stroke (`OP`). */
export interface OverprintFlags {
  fill: boolean;
  stroke: boolean;
}

/** Registers (or reuses) the ExtGState for a pair of flags in the
 *  resources the operators run against, returning its name. */
export type OverprintStateFactory = (flags: OverprintFlags) => PDFName;

/** Registers (or reuses) the colour space of spot inks — one ink's
 *  Separation, a mix's DeviceN — in the resources the operators run
 *  against, returning its name. */
export type SeparationSpaceFactory = (plates: readonly SpotPlate[]) => PDFName;

type Matrix = [number, number, number, number, number, number];

interface GState {
  ctm: Matrix;
  fillK: boolean;
  strokeK: boolean;
  /** The current fill / stroke colour is a spot ink that overprints. */
  fillSpotOver: boolean;
  strokeSpotOver: boolean;
  /** The current fill / stroke colour is a white ink or a varnish. */
  fillLayer: boolean;
  strokeLayer: boolean;
  op: OverprintFlags;
  textMode: number;
}

/** Whether a paint is in a white ink or a varnish only. */
function isLayerPaint(paint: StandInPaint): boolean {
  if ('plate' in paint) return !!paint.plate.layer;
  if ('mix' in paint) return paint.mix.every((p) => !!p.layer);
  return false;
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
  /** Names the Separation colour spaces of spot colours; without it they
   *  print in process, through their alternate. */
  spaceFor?: SeparationSpaceFactory;
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
  // A job on a few plates has rich black only when it prints every ink
  // of the recipe.
  const rich = black.richBlack && options.richBlack && (!mode.plates || channelsOffPlates(black.richBlackColor, mode.plates.plates).length === 0);
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
  let gs: GState = { ctm: IDENTITY, fillK: false, strokeK: false, fillSpotOver: false, strokeSpotOver: false, fillLayer: false, strokeLayer: false, op: { fill: false, stroke: false }, textMode: 0 };
  /** Whether the current fill / stroke colour overprints. */
  const fillOver = (): boolean => (overprint && gs.fillK) || gs.fillSpotOver;
  const strokeOver = (): boolean => (overprint && gs.strokeK) || gs.strokeSpotOver;
  /** The Separation operators of a `k` / `K` stand-in, if it is one. */
  const spotOps = (args: unknown[], stroke: boolean): { ops: PDFOperator[]; over: boolean; kOnly?: boolean; layer?: boolean } | undefined => {
    if (!options.spaceFor || args.length !== 4) return undefined;
    const [c, m, y, k] = args.map(num) as [number, number, number, number];
    const paint = mode.inkRegistry.paintOf(c, m, y, k);
    if (!paint) return undefined;
    if ('process' in paint) {
      // A process colour that overprints: its own values, overprinting.
      // A K-only solid black keeps its rich-black handling.
      return { ops: [PDFOperator.of(stroke ? PDFOperatorNames.StrokingColorCmyk : PDFOperatorNames.NonStrokingColorCmyk, paint.process.map((v) => PDFNumber.of(v)))], over: true, kOnly: isKOnlySolid(paint.process) };
    }
    const mix = 'mix' in paint;
    const space = options.spaceFor(mix ? paint.mix : [paint.plate]);
    return {
      ops: [
        PDFOperator.of(stroke ? PDFOperatorNames.StrokingColorspace : PDFOperatorNames.NonStrokingColorspace, [space]),
        PDFOperator.of(stroke ? PDFOperatorNames.StrokingColorN : PDFOperatorNames.NonStrokingColorN, (mix ? paint.tints : [paint.tint]).map((t) => PDFNumber.of(t))),
      ],
      over: paint.overprint,
      layer: isLayerPaint(paint),
    };
  };
  /** A white or a varnish has been painted; and since then, a paint that
   *  knocks out (which may have cut its plate). */
  let layerPainted = false;
  let knockedOut = false;
  const painted = (knocks: boolean, layer: boolean): void => {
    if (knocks && layerPainted) knockedOut = true;
    if (layer) layerPainted = true;
  };
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
    if (name === 'k' || name === 'K') {
      const stroke = name === 'K';
      const spot = spotOps(args, stroke);
      const k = spot ? spot.kOnly === true : isKOnlySolid(args);
      if (stroke) {
        gs.strokeK = k;
        gs.strokeSpotOver = !!spot?.over;
        gs.strokeLayer = !!spot?.layer;
      } else {
        gs.fillK = k;
        gs.fillSpotOver = !!spot?.over;
        gs.fillLayer = !!spot?.layer;
      }
      if (spot) out.push(...spot.ops);
      else out.push(op);
      continue;
    }
    if (FILL_COLOR_OPS.has(name)) {
      gs.fillK = false;
      gs.fillSpotOver = false;
      gs.fillLayer = false;
      out.push(op);
      continue;
    }
    if (STROKE_COLOR_OPS.has(name)) {
      gs.strokeK = false;
      gs.strokeSpotOver = false;
      gs.strokeLayer = false;
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
      painted((fills && !(fillOver() && !(gs.fillK && rich && large))) || (strokes && !strokeOver()), (fills && gs.fillLayer) || (strokes && gs.strokeLayer));
      if (fills && gs.fillK && rich && large) {
        // Rich black, knocked out, inside its own state so the K-only
        // colour (and the overprint) come back after it.
        const saved = { ...gs, op: { ...gs.op } };
        const pre = [PDFOperator.of(PDFOperatorNames.PushGraphicsState), ...switchTo({ fill: false, stroke: strokes && strokeOver() }), ...richOps()];
        out.splice(at, 0, ...pre);
        out.push(op, PDFOperator.of(PDFOperatorNames.PopGraphicsState));
        gs = saved;
      } else {
        // Only what this paint uses decides: keep the other flag.
        const want = {
          fill: fills ? fillOver() : gs.op.fill,
          stroke: strokes ? strokeOver() : gs.op.stroke,
        };
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
      painted((fill && !fillOver()) || (stroke && !strokeOver()), (fill && gs.fillLayer) || (stroke && gs.strokeLayer));
      out.push(
        ...switchTo({
          fill: fill ? fillOver() : gs.op.fill,
          stroke: stroke ? strokeOver() : gs.op.stroke,
        }),
        op,
      );
      continue;
    }
    if (name === 'Do' || name === 'sh' || name === 'BI') {
      // Pictures, forms and shadings never overprint.
      painted(true, false);
      out.push(...switchTo({ fill: false, stroke: false }), op);
      continue;
    }
    out.push(op);
  }
  const layerOps = (args: unknown[], stroke: boolean): PDFOperator[] | undefined => {
    const spot = spotOps(args, stroke);
    return spot?.layer ? spot.ops : undefined;
  };
  return withInkLayers(out, ops, knockedOut, layerOps, () => named({ fill: true, stroke: true }));
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
  }, { richBlack: true, spaceFor: pageSpaceFactory(page, mode) });
  // In place: pdf-lib serializes the stream from this array.
  stream.operators.length = 0;
  for (const op of next) stream.operators.push(op);
}

/** Names spot inks' colour spaces in a page's resources, one name per
 *  plate or mix of plates. */
function pageSpaceFactory(page: PDFPage, mode: PrintColorMode): SeparationSpaceFactory {
  const names = new Map<string, PDFName>();
  return (plates) => {
    const context = page.doc.context;
    const ref = mode.inkRegistry.inkSpace(context, plates);
    const key = ref.toString();
    let name = names.get(key);
    if (name) return name;
    const { Resources } = page.node.normalizedEntries();
    let spaces = Resources.lookupMaybe(PDFName.of('ColorSpace'), PDFDict);
    if (!spaces) {
      spaces = context.obj({});
      Resources.set(PDFName.of('ColorSpace'), spaces);
    }
    name = spaces.uniqueKey('CSs');
    spaces.set(name, ref);
    names.set(key, name);
    return name;
  };
}
