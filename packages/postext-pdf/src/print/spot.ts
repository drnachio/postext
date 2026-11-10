/**
 * Spot colours (`ColorValue.spot`) in a colour-managed print render: each
 * ink is a `[/Separation /<name> /DeviceCMYK <tint transform>]` colour
 * space, and a colour of that ink is painted with `cs` / `scn` at its tint.
 *
 * The painters set colours through pdf-lib, whose colours are gray, RGB or
 * CMYK only. So a spot colour travels through them as a CMYK colour — the
 * ink's alternate at the tint — whose black channel is nudged off the
 * 1/10 000 grid every process colour is rounded to (`round4`): no process
 * colour can carry that value, so the print pass (`printPass.ts`), which
 * already walks every page and vector form, recognises it and writes the
 * Separation instead. One rule catches every way the backend paints.
 */

import { cmyk, type Color, PDFName, type PDFContext, type PDFRef } from 'pdf-lib';
import type { CmykPercent, SpotColor } from 'postext';

/** One ink, as the print pass writes it. */
export interface SpotPlate {
  name: string;
  /** Full-strength alternate, percent. */
  cmyk: CmykPercent;
  overprint: boolean;
}

/** A spot colour as painted: its ink, and the tint (0..1) — or, in a job
 *  on a few plates (`print.plates`), a mix of several inks at a tint each,
 *  painted in a DeviceN colour space. */
export interface SpotPaint {
  plates: SpotPlate[];
  tints: number[];
}

/** Codes stay below half the grid step, so a code added to one grid value
 *  and one subtracted from the next can never meet. */
const STEP = 1e-8;
const MAX_CODE = 4999;

/** Paints by the exact operands of their stand-in `k` / `K`, and the
 *  stand-in by paint: process-wide, so a colour cached by one render (see
 *  `colorFromHex`) decodes in the next. */
const paintsByKey = new Map<string, SpotPaint>();
const colorsByPaint = new Map<string, Color>();

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function plateKey(p: SpotPlate): string {
  return `${p.name}|${p.cmyk.c},${p.cmyk.m},${p.cmyk.y},${p.cmyk.k}|${p.overprint}`;
}

/** The key of four CMYK operands. */
export function operandKey(c: number, m: number, y: number, k: number): string {
  return `${c}|${m}|${y}|${k}`;
}

/** Spot paints that ran out of codes and printed in process, by ink. */
const fallbacks = new Map<string, number>();

/** How many paints of each ink have printed in process for want of a
 *  code, so far in this process: a render compares the counts before and
 *  after to warn. */
export function spotFallbackCounts(): ReadonlyMap<string, number> {
  return new Map(fallbacks);
}

/**
 * The pdf-lib colour that stands for `spot` at `tint` (0..1) until the
 * print pass turns it into the ink's Separation. Past the codes there are
 * (thousands of distinct tints in one process), the plain alternate is
 * returned and the colour prints in process; `spotFallbackCounts` counts
 * it, for the render's warning.
 */
export function spotStandIn(spot: Required<SpotColor>, tint: number): Color {
  return mixStandIn([{ name: spot.name, cmyk: spot.cmyk, overprint: spot.overprint }], [tint]);
}

/** The full-strength alternates of `plates` at `tints`, summed and
 *  clipped: what a mix of inks stands for in process (0..1 a channel). */
export function mixAlternate(plates: readonly SpotPlate[], tints: readonly number[]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  plates.forEach((p, i) => {
    const t = tints[i] ?? 0;
    out[0] += (p.cmyk.c / 100) * t;
    out[1] += (p.cmyk.m / 100) * t;
    out[2] += (p.cmyk.y / 100) * t;
    out[3] += (p.cmyk.k / 100) * t;
  });
  return out.map((v) => round4(Math.min(1, v))) as [number, number, number, number];
}

/**
 * The pdf-lib colour that stands for `plates` at `tints` (0..1 each): one
 * ink is its Separation (see {@link spotStandIn}), several a DeviceN mix,
 * which a job on a few plates paints its colours in. Past the codes, the
 * mix prints in process through its alternates.
 */
export function mixStandIn(plates: readonly SpotPlate[], tints: readonly number[]): Color {
  const ts = plates.map((_, i) => round4(Math.max(0, Math.min(1, tints[i] ?? 0))));
  const key = plates.map((p, i) => `${plateKey(p)}|${ts[i]}`).join('+');
  const known = colorsByPaint.get(key);
  if (known) return known;
  const [c, m, y, k4] = mixAlternate(plates, ts);
  const code = colorsByPaint.size + 1;
  if (code > MAX_CODE) {
    for (const p of plates) fallbacks.set(p.name, (fallbacks.get(p.name) ?? 0) + 1);
    return cmyk(c, m, y, k4);
  }
  const k = k4 >= 0.5 ? k4 - code * STEP : k4 + code * STEP;
  const color = cmyk(c, m, y, k);
  colorsByPaint.set(key, color);
  paintsByKey.set(operandKey(c, m, y, k), { plates: plates.map((p) => ({ ...p, cmyk: { ...p.cmyk } })), tints: ts });
  return color;
}

/** The spot paint a `k` / `K` operator's operands stand for, if any. */
export function spotPaintOf(c: number, m: number, y: number, k: number): SpotPaint | undefined {
  return paintsByKey.get(operandKey(c, m, y, k));
}

/**
 * The PDF name object of an ink: its UTF-8 bytes, each one outside the
 * printable ASCII range written `#xx` (PDF 1.7, 7.3.5), so `Rojo Médica`
 * reaches the printer as `/Rojo#20M#C3#A9dica`. pdf-lib alone writes one
 * Latin-1 byte for `é`, a malformed `#20ac` for `€`, and reads a `#12` in
 * the name as an escape; `#` itself is written `#23`.
 */
export function inkPdfName(name: string): PDFName {
  const bytes = new TextEncoder().encode(name);
  let latin1 = '';
  for (const b of bytes) latin1 += b === 0x23 ? '#23' : String.fromCharCode(b);
  return PDFName.of(latin1);
}

/** The colour space of `plates` in `context`'s document: the Separation
 *  of one ink, the DeviceN of several. */
export function inkSpace(context: PDFContext, plates: readonly SpotPlate[]): PDFRef {
  return plates.length === 1 ? separationSpace(context, plates[0]!) : deviceNSpace(context, plates);
}

/** The Separation colour space objects of each document, by plate. */
const spacesByContext = new WeakMap<PDFContext, Map<string, PDFRef>>();

/** The Separation colour space of `plate` in `context`'s document, one
 *  object per plate: tint 0 is paper, tint 1 the plate's alternate. */
export function separationSpace(context: PDFContext, plate: SpotPlate): PDFRef {
  let spaces = spacesByContext.get(context);
  if (!spaces) spacesByContext.set(context, (spaces = new Map()));
  const key = plateKey(plate);
  let ref = spaces.get(key);
  if (!ref) {
    const { c, m, y, k } = plate.cmyk;
    const fn = context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [c / 100, m / 100, y / 100, k / 100].map(round4), N: 1 });
    ref = context.register(context.obj([PDFName.of('Separation'), inkPdfName(plate.name), PDFName.of('DeviceCMYK'), fn]));
    spaces.set(key, ref);
  }
  return ref;
}

/**
 * The DeviceN colour space of several inks in `context`'s document, one
 * object per set: its tint transform samples the corners of the tint cube
 * — every ink at 0 or 1 — with each corner the sum of its inks' alternates,
 * clipped, and interpolates between them. A process plate (`Black`) is
 * named as such, and the printer prints it on its own plate.
 */
export function deviceNSpace(context: PDFContext, plates: readonly SpotPlate[]): PDFRef {
  let spaces = spacesByContext.get(context);
  if (!spaces) spacesByContext.set(context, (spaces = new Map()));
  const key = `N:${plates.map(plateKey).join('+')}`;
  let ref = spaces.get(key);
  if (!ref) {
    const n = plates.length;
    const samples = new Uint8Array((1 << n) * 4 * 2);
    for (let corner = 0; corner < 1 << n; corner++) {
      // The first input varies fastest.
      const tints = plates.map((_, i) => (corner >> i) & 1);
      mixAlternate(plates, tints).forEach((v, ch) => {
        const u = Math.round(v * 65535);
        samples[(corner * 4 + ch) * 2] = u >> 8;
        samples[(corner * 4 + ch) * 2 + 1] = u & 255;
      });
    }
    const fn = context.register(
      context.stream(samples, {
        FunctionType: 0,
        Domain: plates.flatMap(() => [0, 1]),
        Range: [0, 1, 0, 1, 0, 1, 0, 1],
        Size: plates.map(() => 2),
        BitsPerSample: 16,
      }),
    );
    ref = context.register(context.obj([PDFName.of('DeviceN'), plates.map((p) => inkPdfName(p.name)), PDFName.of('DeviceCMYK'), fn]));
    spaces.set(key, ref);
  }
  return ref;
}
