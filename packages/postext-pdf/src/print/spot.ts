/**
 * Spot colours (`ColorValue.spot`) in a colour-managed print render: each
 * ink is a `[/Separation /<name> /DeviceCMYK <tint transform>]` colour
 * space, and a colour of that ink is painted with `cs` / `scn` at its tint.
 *
 * The painters set colours through pdf-lib, whose colours are gray, RGB or
 * CMYK only. So a spot colour travels through them as a CMYK colour — the
 * ink's alternate at the tint — whose black (and, past the first few
 * thousand, cyan) channel is nudged off the 1/10 000 grid every process
 * colour is rounded to (`round4`): no process colour can carry those
 * values, so the print pass (`printPass.ts`), which already walks every
 * page and vector form, recognises it and writes the Separation instead.
 * One rule catches every way the backend paints.
 *
 * The codes live in a {@link SpotInkRegistry}, one per render, owned by the
 * render's print colour mode: every render starts with none, and nothing a
 * render registered is seen by another (a Sandbox session, the CLI in watch
 * mode and parallel workers each render from scratch).
 */

import { cmyk, type Color, PDFName, type PDFContext, type PDFRef } from 'pdf-lib';
import { mixAlternate, printableInkName, type CmykPercent, type ProcessChannel, type ResolvedSpotColor } from 'postext';

/** One ink, as the print pass writes it. */
export interface SpotPlate {
  name: string;
  /** Full-strength alternate, percent. */
  cmyk: CmykPercent;
  overprint: boolean;
  /** A process plate (`Cyan` … `Black`) in a mix of a job on a few plates
   *  (`print.plates`): named as it is, never renamed. */
  process?: ProcessChannel;
}

/** A spot colour as painted: its ink, the tint (0..1), and whether it
 *  overprints (its ink's `overprint`, or the colour's own,
 *  `ColorValue.overprint`). */
export interface SpotPaint {
  plate: SpotPlate;
  tint: number;
  overprint: boolean;
}

/** A mix of inks at a tint each (0..1), in a job on a few plates
 *  (`print.plates`): painted in their DeviceN colour space. It overprints
 *  when the colour does or every ink in it does. */
export interface MixPaint {
  mix: SpotPlate[];
  tints: number[];
  overprint: boolean;
}

/** A process colour that overprints (`ColorValue.overprint`): written
 *  back as this CMYK (0..1), under an overprinting state. */
export interface OverprintPaint {
  process: [number, number, number, number];
}

/** What a stand-in `k` / `K` is written back as. */
export type StandInPaint = SpotPaint | MixPaint | OverprintPaint;

/** Codes stay below half the grid step, so a code added to one grid value
 *  and one subtracted from the next can never meet. */
const STEP = 1e-8;
/** Codes per channel: 1 … 4 999 in black, 0 … 4 999 in cyan. */
const PER_CHANNEL = 4999;
/** Distinct paints (ink × tint) one render can carry on their plates:
 *  some 25 million, far past the 10 001 tints an ink has at four
 *  decimals. */
export const MAX_SPOT_CODES = PER_CHANNEL * (PER_CHANNEL + 1);

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function plateKey(p: SpotPlate): string {
  return `${p.process ? 'process:' : ''}${p.name}|${p.cmyk.c},${p.cmyk.m},${p.cmyk.y},${p.cmyk.k}|${p.overprint}`;
}

/** The key of four CMYK operands. */
export function operandKey(c: number, m: number, y: number, k: number): string {
  return `${c}|${m}|${y}|${k}`;
}

/** `v` moved `code` steps off the grid, away from the nearer end. */
const nudge = (v: number, code: number): number => (v >= 0.5 ? v - code * STEP : v + code * STEP);

/**
 * The spot inks of one render: the stand-in colour of every ink and tint
 * painted so far, the plate each stand-in decodes to, the name each plate
 * is written under, and its Separation colour space in the document.
 */
export class SpotInkRegistry {
  private readonly paintsByKey = new Map<string, StandInPaint>();
  private readonly colorsByPaint = new Map<string, Color>();
  /** The first definition of each ink name: one name, one plate. */
  private readonly platesByName = new Map<string, SpotPlate>();
  /** The name each ink's plate is written under, by ink name. */
  private readonly pdfNames = new Map<string, string>();
  private readonly takenPdfNames = new Set<string>();
  private readonly spaces = new WeakMap<PDFContext, Map<string, PDFRef>>();
  /** Paints that found no code and printed in process, by ink. */
  private readonly fallbacks = new Map<string, number>();
  /** Process colours that overprint and found no code (knocked out). */
  private overprintFallbacks = 0;
  /** In a job on a few plates: every coded paint's alternate, for the
   *  nearest one past the codes; and how many paints took it. */
  private readonly coded: Array<{ alt: [number, number, number, number]; color: Color }> = [];
  private approximations = 0;
  /** Pictures placed as they are in a job on a few plates, by kind. */
  private readonly offPlates = new Map<string, number>();
  /** Paints of a white ink or a varnish a job on a few plates does not
   *  print, left out, by ink. */
  private readonly dropped = new Map<string, number>();

  /**
   * `maxCodes` is for tests; a render uses {@link MAX_SPOT_CODES}.
   * `confined`: a job on a few plates (`print.plates`), where a paint past
   * the codes takes the nearest coded one instead of printing in process,
   * which would put it on plates the job does not print.
   */
  constructor(
    private readonly maxCodes: number = MAX_SPOT_CODES,
    private readonly confined = false,
  ) {}

  /**
   * The pdf-lib colour that stands for `spot` at `tint` (0..1) until the
   * print pass turns it into the ink's Separation. An ink named twice with
   * different values prints as its first definition (the preflight reports
   * the conflict). Past the codes there are, the plain alternate is
   * returned and the colour prints in process; {@link exhausted} counts it,
   * for the render's warning.
   */
  standIn(spot: ResolvedSpotColor, tint: number): Color {
    const plate = this.plateOf(spot);
    const t = round4(Math.max(0, Math.min(1, tint)));
    // One ink, two colours: one of them may overprint and the other not.
    const overprint = plate.overprint || spot.overprint;
    const key = `${plateKey(plate)}|${t}${overprint !== plate.overprint ? '|over' : ''}`;
    return this.code(key, mixAlternate([plate], [t]), { plate, tint: t, overprint }, [plate]);
  }

  /**
   * The pdf-lib colour that stands for a mix of `plates` at `tints` (0..1
   * each) in a job on a few plates, until the print pass turns it into
   * their DeviceN colour (one spot plate: its Separation). Process plates
   * keep their names; a plate named twice is one, its tints summed.
   */
  mixStandIn(plates: readonly SpotPlate[], tints: readonly number[], overprint = false): Color {
    const merged: SpotPlate[] = [];
    const ts: number[] = [];
    plates.forEach((p, i) => {
      const plate = p.process ? p : this.plateOf({ name: p.name, cmyk: p.cmyk, overprint: p.overprint, tint: 100 });
      const at = merged.findIndex((q) => q.name === plate.name);
      const t = Math.max(0, Math.min(1, tints[i] ?? 0));
      if (at >= 0) {
        ts[at] = Math.min(1, ts[at]! + t);
      } else {
        merged.push(plate);
        ts.push(t);
      }
    });
    if (merged.length === 1 && !merged[0]!.process) {
      const p = merged[0]!;
      return this.standIn({ name: p.name, cmyk: p.cmyk, overprint: p.overprint || overprint, tint: 100 }, ts[0]!);
    }
    const t4 = ts.map(round4);
    const over = overprint || merged.every((p) => p.overprint);
    const key = `${merged.map(plateKey).join('+')}|${t4.join(',')}${over ? '|over' : ''}`;
    return this.code(key, mixAlternate(merged, t4), { mix: merged, tints: t4, overprint: over }, merged);
  }

  /** The coded colour of a paint, registered under `key`; past the codes,
   *  its alternate in process — or, confined to a job's plates, the
   *  nearest coded paint. */
  private code(key: string, alt: [number, number, number, number], paint: SpotPaint | MixPaint, plates: readonly SpotPlate[]): Color {
    const known = this.colorsByPaint.get(key);
    if (known) return known;
    const [c, m, y, k] = alt;
    const index = this.colorsByPaint.size;
    if (index >= this.maxCodes) {
      if (this.confined) {
        this.approximations++;
        const near = this.nearest(alt);
        this.colorsByPaint.set(key, near);
        return near;
      }
      for (const p of plates) this.fallbacks.set(p.name, (this.fallbacks.get(p.name) ?? 0) + 1);
      return cmyk(c, m, y, k);
    }
    // Black always carries a code (1 …), cyan the overflow (0 …).
    const kc = nudge(k, (index % PER_CHANNEL) + 1);
    const cc = nudge(c, Math.floor(index / PER_CHANNEL));
    const color = cmyk(cc, m, y, kc);
    this.colorsByPaint.set(key, color);
    this.paintsByKey.set(operandKey(cc, m, y, kc), paint);
    if (this.confined) this.coded.push({ alt, color });
    return color;
  }

  /** The coded paint whose alternate is closest to `alt` (paper when
   *  none is). */
  private nearest(alt: readonly number[]): Color {
    let best: Color = cmyk(0, 0, 0, 0);
    let bestD = Infinity;
    for (const { alt: a, color } of this.coded) {
      const d = (a[0] - alt[0]!) ** 2 + (a[1] - alt[1]!) ** 2 + (a[2] - alt[2]!) ** 2 + (a[3] - alt[3]!) ** 2;
      if (d < bestD) [best, bestD] = [color, d];
    }
    return best;
  }

  /** How many paints of a job on a few plates took the nearest coded
   *  paint for want of a code of their own. */
  approximated(): number {
    return this.approximations;
  }

  /** Notes artwork of a job on a few plates placed as it is (a PDF page,
   *  a picture that does not decode): its inks were not moved onto them. */
  noteOffPlates(kind: 'pdf' | 'image'): void {
    this.offPlates.set(kind, (this.offPlates.get(kind) ?? 0) + 1);
  }

  /**
   * The pdf-lib colour of a paint left out (#1566): a white ink or a
   * varnish in a job on a few plates that does not print it. It stands
   * for no ink at all, written back as process 0/0/0/0 under an
   * overprinting state with `OPM 1`, which leaves every plate as it was,
   * PDF/X-1a included (no transparency). Counted by ink for the render's
   * warning.
   */
  dropStandIn(ink: string): Color {
    this.dropped.set(ink, (this.dropped.get(ink) ?? 0) + 1);
    return this.overprintStandIn(0, 0, 0, 0);
  }

  /** The paints left out of a job on a few plates, by ink. */
  droppedOffPlates(): ReadonlyMap<string, number> {
    return this.dropped;
  }

  /** Artwork placed off the job's plates, by kind. */
  offPlateArtwork(): ReadonlyMap<string, number> {
    return this.offPlates;
  }

  /**
   * The pdf-lib colour that stands for a process colour that overprints
   * (`ColorValue.overprint`) until the print pass writes it back as it is,
   * under an overprinting graphics state: coded like a spot colour's
   * stand-in. Past the codes it prints knocked out, as any process colour.
   */
  overprintStandIn(c: number, m: number, y: number, k: number): Color {
    const key = `over|${c},${m},${y},${k}`;
    const known = this.colorsByPaint.get(key);
    if (known) return known;
    const index = this.colorsByPaint.size;
    if (index >= this.maxCodes) {
      this.overprintFallbacks++;
      return cmyk(c, m, y, k);
    }
    const kc = nudge(k, (index % PER_CHANNEL) + 1);
    const cc = nudge(c, Math.floor(index / PER_CHANNEL));
    const color = cmyk(cc, m, y, kc);
    this.colorsByPaint.set(key, color);
    this.paintsByKey.set(operandKey(cc, m, y, kc), { process: [c, m, y, k] });
    return color;
  }

  /** The paint a `k` / `K` operator's operands stand for, if any: a spot
   *  ink at a tint, or a process colour that overprints. */
  paintOf(c: number, m: number, y: number, k: number): StandInPaint | undefined {
    return this.paintsByKey.get(operandKey(c, m, y, k));
  }

  /** How many process colours that overprint knocked out for want of a
   *  code. */
  overprintsExhausted(): number {
    return this.overprintFallbacks;
  }

  /** How many paints of each ink printed in process for want of a code. */
  exhausted(): ReadonlyMap<string, number> {
    return this.fallbacks;
  }

  /**
   * The name the plate of ink `name` is written under: the name itself
   * when a plate can carry it, else `printableInkName`'s, made unique in
   * the render (two inks never share a plate because a name was changed).
   */
  pdfNameOf(name: string): string {
    let out = this.pdfNames.get(name);
    if (out !== undefined) return out;
    const base = printableInkName(name);
    out = base;
    for (let n = 2; this.takenPdfNames.has(out); n++) out = `${base} ${n}`;
    this.takenPdfNames.add(out);
    this.pdfNames.set(name, out);
    return out;
  }

  /** The inks whose plate is written under another name: ink → written. */
  renamed(): [string, string][] {
    return [...this.pdfNames].filter(([name, written]) => name !== written);
  }

  /** The Separation colour space of `plate` in `context`'s document, one
   *  object per plate: tint 0 is paper, tint 1 the plate's alternate. */
  separationSpace(context: PDFContext, plate: SpotPlate): PDFRef {
    let spaces = this.spaces.get(context);
    if (!spaces) this.spaces.set(context, (spaces = new Map()));
    const key = plateKey(plate);
    let ref = spaces.get(key);
    if (!ref) {
      const { c, m, y, k } = plate.cmyk;
      const fn = context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [c / 100, m / 100, y / 100, k / 100].map(round4), N: 1 });
      ref = context.register(context.obj([PDFName.of('Separation'), this.plateName(plate), PDFName.of('DeviceCMYK'), fn]));
      spaces.set(key, ref);
    }
    return ref;
  }

  /** The colour space of `plates` in `context`'s document: the Separation
   *  of one, the DeviceN of several. */
  inkSpace(context: PDFContext, plates: readonly SpotPlate[]): PDFRef {
    return plates.length === 1 ? this.separationSpace(context, plates[0]!) : this.deviceNSpace(context, plates);
  }

  /**
   * The DeviceN colour space of several inks in `context`'s document, one
   * object per set: its tint transform samples the corners of the tint
   * cube — every ink at 0 or 1 — each corner the sum of its inks'
   * alternates, clipped, and interpolates between them. Each colorant
   * once: a process plate under its own name, a spot plate under the name
   * the render writes it as.
   */
  private deviceNSpace(context: PDFContext, plates: readonly SpotPlate[]): PDFRef {
    let spaces = this.spaces.get(context);
    if (!spaces) this.spaces.set(context, (spaces = new Map()));
    const key = `N:${plates.map(plateKey).join('+')}`;
    let ref = spaces.get(key);
    if (ref) return ref;
    const names = plates.map((p) => this.plateName(p));
    if (new Set(names.map((n) => n.toString())).size !== names.length) throw new Error('postext-pdf: a DeviceN colour space names one plate twice');
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
    ref = context.register(context.obj([PDFName.of('DeviceN'), names, PDFName.of('DeviceCMYK'), fn]));
    spaces.set(key, ref);
    return ref;
  }

  /** The PDF name of a plate: a process plate's own, a spot plate's as
   *  the render writes it ({@link pdfNameOf}). */
  private plateName(plate: SpotPlate): PDFName {
    return plate.process ? PDFName.of(plate.name) : inkPdfName(this.pdfNameOf(plate.name));
  }

  private plateOf(spot: ResolvedSpotColor): SpotPlate {
    const first = this.platesByName.get(spot.name);
    if (first) return first;
    const plate: SpotPlate = { name: spot.name, cmyk: { ...spot.cmyk }, overprint: spot.overprint };
    this.platesByName.set(spot.name, plate);
    return plate;
  }
}

/**
 * The PDF name object of an ink: its UTF-8 bytes, each one outside the
 * printable ASCII range written `#xx` (PDF 1.7, 7.3.5), so `Rojo Médica`
 * reaches the printer as `/Rojo#20M#C3#A9dica`. pdf-lib alone writes one
 * Latin-1 byte for `é`, a malformed `#20ac` for `€`, and reads a `#12` in
 * the name as an escape; `#` itself is written `#23`. Pass a name a plate
 * can carry (`SpotInkRegistry.pdfNameOf`).
 */
export function inkPdfName(name: string): PDFName {
  const bytes = new TextEncoder().encode(name);
  let latin1 = '';
  for (const b of bytes) latin1 += b === 0x23 ? '#23' : String.fromCharCode(b);
  return PDFName.of(latin1);
}
