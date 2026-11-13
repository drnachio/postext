/**
 * White and varnish as the press lays them (#1579, #1580).
 *
 * On press an opaque white goes down first, under everything, and a
 * varnish last, over everything. In a PDF, though, any paint that does
 * not overprint knocks out every separation it is not painted in: a
 * picture placed over a white box clears the White plate inside its box,
 * and a running head printed after a varnish band cuts its shape out of
 * the varnish. Neither happens on press.
 *
 * So once a stream has painted a white or a varnish and then something
 * that knocks out, the stream's white and varnish paints are drawn a
 * second time at its end, overprinting, and nothing else is: each path and
 * each piece of text keeps its shape, clip and text position, a paint in
 * another colour ends its path unpainted (`n`) or sets its text invisible,
 * and pictures, forms and shadings are left out. An overprinting paint in
 * a separation touches only its own plate, so the second drawing restores
 * the White and Varnish plates and leaves every colour plate as the first
 * drawing left it. A white with `overprint: false` still knocks out the
 * colour under it in the first drawing.
 */

import { PDFName, PDFNumber, PDFOperator, PDFOperatorNames } from 'pdf-lib';

interface OperatorParts {
  name: string;
  args: unknown[];
}

const parts = (op: PDFOperator): OperatorParts => {
  const o = op as unknown as { name: string; args?: unknown[] };
  return { name: o.name, args: o.args ?? [] };
};

/** The operators that set a white's or a varnish's colour for a `k` / `K`
 *  stand-in, or `undefined` when it is any other colour. */
export type LayerColorOps = (args: unknown[], stroke: boolean) => PDFOperator[] | undefined;

const FILL_COLOR_OPS = new Set(['g', 'rg', 'sc', 'scn', 'cs', 'k']);
const STROKE_COLOR_OPS = new Set(['G', 'RG', 'SC', 'SCN', 'CS', 'K']);
const FILL_PAINT = new Set(['f', 'F', 'f*']);
const STROKE_PAINT = new Set(['S', 's']);
const BOTH_PAINT = new Set(['B', 'B*', 'b', 'b*']);
const TEXT_SHOW = new Set(['Tj', 'TJ', "'", '"']);
/** Painted in the first drawing only. */
const DROPPED = new Set(['Do', 'sh', 'BI', 'ID', 'EI', 'BDC', 'BMC', 'EMC', 'MP', 'DP']);

/** A path paint narrowed to the fill or the stroke it keeps. */
function narrowPaint(name: string, fill: boolean, stroke: boolean): string {
  if (fill && stroke) return name;
  const evenOdd = name.endsWith('*');
  if (fill) return evenOdd ? 'f*' : 'f';
  // A closing paint (b, b*, s) closes the path before its stroke.
  return name === 'b' || name === 'b*' || name === 's' ? 's' : 'S';
}

/**
 * The second drawing of `ops` (see the module comment): only its white
 * and varnish paints, each under `overprint`, the overprinting state of
 * the stream's resources. Run over the stream before the print pass, with
 * `layerOps` naming the white and varnish stand-ins.
 */
export function inkLayerReplay(ops: readonly PDFOperator[], layerOps: LayerColorOps, overprint: PDFName): PDFOperator[] {
  const out: PDFOperator[] = [PDFOperator.of(PDFOperatorNames.BeginMarkedContent, [toArtifact()])];
  interface State { fill: boolean; stroke: boolean; textMode: number }
  let gs: State = { fill: false, stroke: false, textMode: 0 };
  const stack: State[] = [];
  const over = (): PDFOperator => PDFOperator.of(PDFOperatorNames.SetGraphicsStateParams, [overprint]);
  for (const op of ops) {
    const { name, args } = parts(op);
    if (DROPPED.has(name)) continue;
    if (name === 'q') {
      stack.push({ ...gs });
      out.push(op);
      continue;
    }
    if (name === 'Q') {
      gs = stack.pop() ?? gs;
      out.push(op);
      continue;
    }
    if (name === 'k' || name === 'K') {
      const stroke = name === 'K';
      const layer = layerOps(args, stroke);
      if (stroke) gs.stroke = !!layer;
      else gs.fill = !!layer;
      out.push(...(layer ?? [op]));
      continue;
    }
    if (FILL_COLOR_OPS.has(name)) gs.fill = false;
    else if (STROKE_COLOR_OPS.has(name)) gs.stroke = false;
    else if (name === 'Tr') gs.textMode = num(args[0]);
    const fills = FILL_PAINT.has(name) || BOTH_PAINT.has(name);
    const strokes = STROKE_PAINT.has(name) || BOTH_PAINT.has(name);
    if (fills || strokes) {
      const f = fills && gs.fill;
      const s = strokes && gs.stroke;
      if (!f && !s) out.push(PDFOperator.of(PDFOperatorNames.EndPath));
      else out.push(over(), PDFOperator.of(narrowPaint(name, f, s) as PDFOperatorNames));
      continue;
    }
    if (TEXT_SHOW.has(name)) {
      // Modes 0/4 fill, 1/5 stroke, 2/6 both, 3/7 nothing; 4–7 also clip.
      const m = gs.textMode % 4;
      const f = (m === 0 || m === 2) && gs.fill;
      const s = (m === 1 || m === 2) && gs.stroke;
      const mode = (f && s ? 2 : f ? 0 : s ? 1 : 3) + (gs.textMode >= 4 ? 4 : 0);
      const setMode = (v: number) => PDFOperator.of(PDFOperatorNames.SetTextRenderingMode, [PDFNumber.of(v)]);
      if (mode !== gs.textMode) out.push(setMode(mode));
      if (f || s) out.push(over());
      out.push(op);
      if (mode !== gs.textMode) out.push(setMode(gs.textMode));
      continue;
    }
    out.push(op);
  }
  out.push(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  return out;
}

/** `/Artifact`: the second drawing is not content of its own, so a
 *  tagged PDF reads nothing in it. */
function toArtifact(): PDFName {
  return PDFName.of('Artifact');
}

function num(arg: unknown): number {
  if (arg instanceof PDFNumber) return arg.asNumber();
  return Number(String(arg));
}

/**
 * The stream with its white and varnish laid under and over the rest:
 * `drawn` (the print pass's output) when no paint after a white or a
 * varnish knocks out, else `drawn` in a saved state followed by the
 * second drawing of `source` (the stream before the pass).
 */
export function withInkLayers(drawn: PDFOperator[], source: readonly PDFOperator[], knockedOut: boolean, layerOps: LayerColorOps, overprint: () => PDFName): PDFOperator[] {
  if (!knockedOut) return drawn;
  return [
    PDFOperator.of(PDFOperatorNames.PushGraphicsState),
    ...drawn,
    PDFOperator.of(PDFOperatorNames.PopGraphicsState),
    PDFOperator.of(PDFOperatorNames.PushGraphicsState),
    ...inkLayerReplay(source, layerOps, overprint()),
    PDFOperator.of(PDFOperatorNames.PopGraphicsState),
  ];
}
