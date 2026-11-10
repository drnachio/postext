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

/** A spot colour as painted: its ink, and the tint (0..1). */
export interface SpotPaint {
  plate: SpotPlate;
  tint: number;
}

/** A process colour that overprints (`ColorValue.overprint`): written
 *  back as this CMYK (0..1), under an overprinting state. */
export interface OverprintPaint {
  process: [number, number, number, number];
}

/** What a stand-in `k` / `K` is written back as. */
export type StandInPaint = SpotPaint | OverprintPaint;

/** Codes stay below half the grid step, so a code added to one grid value
 *  and one subtracted from the next can never meet. */
const STEP = 1e-8;
const MAX_CODE = 4999;

/** Paints by the exact operands of their stand-in `k` / `K`, and the
 *  stand-in by paint: process-wide, so a colour cached by one render (see
 *  `colorFromHex`) decodes in the next. */
const paintsByKey = new Map<string, StandInPaint>();
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
  const plate: SpotPlate = { name: spot.name, cmyk: spot.cmyk, overprint: spot.overprint };
  const t = round4(Math.max(0, Math.min(1, tint)));
  const key = `${plateKey(plate)}|${t}`;
  const known = colorsByPaint.get(key);
  if (known) return known;
  const [c, m, y, k4] = [plate.cmyk.c, plate.cmyk.m, plate.cmyk.y, plate.cmyk.k].map((v) => round4(Math.min(1, (v / 100) * t))) as [number, number, number, number];
  const code = colorsByPaint.size + 1;
  if (code > MAX_CODE) {
    fallbacks.set(plate.name, (fallbacks.get(plate.name) ?? 0) + 1);
    return cmyk(c, m, y, k4);
  }
  const k = k4 >= 0.5 ? k4 - code * STEP : k4 + code * STEP;
  const color = cmyk(c, m, y, k);
  colorsByPaint.set(key, color);
  paintsByKey.set(operandKey(c, m, y, k), { plate: { ...plate, cmyk: { ...plate.cmyk } }, tint: t });
  return color;
}

/**
 * The pdf-lib colour that stands for a process colour that overprints
 * (`ColorValue.overprint`) until the print pass writes it back as it is,
 * under an overprinting graphics state: coded like a spot colour's
 * stand-in. Past the codes it prints knocked out, as any process colour.
 */
export function overprintStandIn(c: number, m: number, y: number, k4: number): Color {
  const key = `over|${c},${m},${y},${k4}`;
  const known = colorsByPaint.get(key);
  if (known) return known;
  const code = colorsByPaint.size + 1;
  if (code > MAX_CODE) return cmyk(c, m, y, k4);
  const k = k4 >= 0.5 ? k4 - code * STEP : k4 + code * STEP;
  const color = cmyk(c, m, y, k);
  colorsByPaint.set(key, color);
  paintsByKey.set(operandKey(c, m, y, k), { process: [c, m, y, k4] });
  return color;
}

/** The paint a `k` / `K` operator's operands stand for, if any: a spot
 *  ink at a tint, or a process colour that overprints. */
export function spotPaintOf(c: number, m: number, y: number, k: number): StandInPaint | undefined {
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
