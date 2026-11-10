/**
 * The job's spot inks as the printer gets them: the ink table
 * (`print.inks`) renames, merges and converts them, the names are checked
 * for what a PDF plate name cannot be, and colours that state their print
 * values each keep a screen colour of their own, since a print render finds
 * a colour's ink by its screen hex.
 */

import type { CmykPercent, PostextConfig, ResolvedPrintInk, SpotColor } from '../types.js';
import { isAuthoredCmyk, isAuthoredSpot, normalizeSpotColor, spotColorCmyk } from './authored.js';

/** An ink name as the ink table compares it: trimmed, runs of spaces as
 *  one, ignoring case (`Pantone  286c` and `PANTONE 286C` are one ink;
 *  `PANTONE 286 C` is not). */
export function inkKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** The ink table entry `name` is the name or an alias of. */
export function inkEntry(name: string, inks: readonly ResolvedPrintInk[]): ResolvedPrintInk | undefined {
  if (inks.length === 0) return undefined;
  const key = inkKey(name);
  return inks.find((ink) => inkKey(ink.name) === key || ink.aliases.some((a) => inkKey(a) === key));
}

/**
 * A spot colour as the ink table prints it: on the plate the table names,
 * with the table's alternate and overprint over the colour's own, or —
 * `undefined` — in process (`output: 'process'`). An ink the table does
 * not list prints as the colour defines it.
 */
export function printedSpot(spot: Required<SpotColor>, inks: readonly ResolvedPrintInk[]): Required<SpotColor> | undefined {
  const entry = inkEntry(spot.name, inks);
  if (!entry) return spot;
  if (entry.output === 'process') return undefined;
  return {
    ...spot,
    name: entry.pdfName,
    cmyk: entry.cmyk ? { ...entry.cmyk } : spot.cmyk,
    overprint: entry.overprint ?? spot.overprint,
  };
}

/** The CMYK a spot colour prints in when the table sends its ink to
 *  process: the alternate (the table's, else the colour's) at the tint. */
export function processCmykOfSpot(spot: Required<SpotColor>, inks: readonly ResolvedPrintInk[]): CmykPercent {
  const entry = inkEntry(spot.name, inks);
  return spotColorCmyk(entry?.cmyk ? { ...spot, cmyk: entry.cmyk } : spot);
}

/** A job's spot colours (by screen hex) as the ink table prints them:
 *  renamed or merged onto the plate it names, or moved to the process
 *  colours (`authored`, by the same hex) when it sends the ink to process. */
export function spotsThroughInkTable(
  spots: ReadonlyMap<string, Required<SpotColor>>,
  authored: ReadonlyMap<string, CmykPercent>,
  inks: readonly ResolvedPrintInk[],
): { spots: Map<string, Required<SpotColor>>; authored: Map<string, CmykPercent> } {
  const onPlates = new Map<string, Required<SpotColor>>();
  const process = new Map(authored);
  for (const [hex, s] of spots) {
    const printed = printedSpot(s, inks);
    if (printed) onPlates.set(hex, printed);
    else process.set(hex, processCmykOfSpot(s, inks));
  }
  return { spots: onPlates, authored: process };
}

/** What a plate name cannot be: `All` and `None` mean every plate and no
 *  plate to a PDF reader, and a name runs to 127 bytes at most. */
export type InkNameProblem = 'reserved' | 'tooLong';

export function inkNameProblem(name: string): InkNameProblem | undefined {
  if (/^(all|none)$/i.test(name.trim())) return 'reserved';
  if (new TextEncoder().encode(name).length > 127) return 'tooLong';
  return undefined;
}

/** The plate names that differ only in case or spacing, grouped: the
 *  printer would get two plates of what is most likely one ink. */
export function similarInkNames(names: Iterable<string>): string[][] {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const key = inkKey(name);
    const group = groups.get(key) ?? (groups.set(key, []), groups.get(key)!);
    if (!group.includes(name)) group.push(name);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

const hex6 = (hex: string): string => hex.slice(0, 7).toLowerCase();

/** What a colour that states its print values prints as: its ink (name,
 *  alternate, tint, overprint) or its CMYK. */
function paintOf(v: unknown): string | undefined {
  const over = (v as { overprint?: unknown }).overprint === true ? '|over' : '';
  if (isAuthoredSpot(v)) {
    const s = normalizeSpotColor(v.spot);
    return `spot|${s.name}|${s.cmyk.c},${s.cmyk.m},${s.cmyk.y},${s.cmyk.k}|${s.tint}|${s.overprint}${over}`;
  }
  if (isAuthoredCmyk(v)) {
    const c = v.cmyk;
    return `cmyk|${c.c},${c.m},${c.y},${c.k}${over}`;
  }
  // A screen colour that overprints states a print value too: it keeps a
  // hex apart from colours that print otherwise.
  if (over) return `hex${over}`;
  return undefined;
}

/** Whether a paint moves, or makes another move, when two share a hex: a
 *  spot colour's, or a colour's that overprints. */
const movable = (paint: string): boolean => paint.startsWith('spot|') || paint.endsWith('|over');

const isPlain = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v);
  return Array.isArray(v) || proto === Object.prototype || proto === null;
};

/** The nearest free screen colour to `hex`: a step in blue, then in green,
 *  then in red, up and down — invisible on screen. */
function nearestFree(hex: string, taken: Set<string>): string {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let step = 1; step < 256; step++) {
    for (const ch of [2, 1, 0]) {
      for (const sign of [1, -1]) {
        const v = rgb[ch]! + sign * step;
        if (v < 0 || v > 255) continue;
        const next = rgb.slice();
        next[ch] = v;
        const out = `#${next.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        if (!taken.has(out)) return out;
      }
    }
  }
  return hex;
}

/**
 * The configuration with every spot colour, and every colour that
 * overprints, on a screen hex of its own, apart from any other colour that
 * states its print values (a spot colour, a colour authored in CMYK, a
 * colour that overprints).
 *
 * A print render knows a colour only by the hex the layout painted, so two
 * such colours sharing one (`PANTONE 286 C` and a 40 % tint of another ink,
 * or a spot and a CMYK colour picked to look alike) printed both as the
 * first. The later one moves to the nearest free hex, a step away on
 * screen; a colour linked to a palette entry follows the entry. Two CMYK
 * colours sharing a hex are left as they were: only a spot colour or a
 * colour that overprints moves or makes another colour move, so a book
 * without them keeps every colour it had. A plain
 * screen colour (`model: 'hex'`) equal to one of them still prints as it,
 * the way an unlinked colour shares a palette colour's value. Returns the
 * configuration itself when nothing collides.
 */
export function separatePrintColors<T extends PostextConfig | undefined>(config: T): T {
  if (!config) return config;
  const palette = new Set((config.colorPalette ?? []).map((e) => e.id));
  const taken = new Set<string>();
  const found: { value: object; hex: string; paint: string }[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v) || !isPlain(v)) return;
    seen.add(v);
    const o = v as { hex?: unknown; model?: unknown; paletteId?: unknown };
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      const hex = hex6(o.hex);
      if (!/^#[0-9a-f]{6}$/.test(hex)) return;
      taken.add(hex);
      const linked = typeof o.paletteId === 'string' && palette.has(o.paletteId);
      const paint = linked ? undefined : paintOf(v);
      if (paint) found.push({ value: v, hex, paint });
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  const owner = new Map<string, string>();
  /** The hex a paint moved to, from the hex it collided at. */
  const movedTo = new Map<string, string>();
  const moves = new Map<object, string>();
  for (const { value, hex, paint } of found) {
    const held = owner.get(hex);
    if (held === undefined) {
      owner.set(hex, paint);
      continue;
    }
    if (held === paint) continue;
    if (!movable(held) && !movable(paint)) continue;
    const key = `${hex}|${paint}`;
    let next = movedTo.get(key);
    if (!next) {
      next = nearestFree(hex, taken);
      taken.add(next);
      owner.set(next, paint);
      movedTo.set(key, next);
    }
    moves.set(value, next);
  }
  if (moves.size === 0) return config;
  const copies = new Map<object, unknown>();
  const copy = (v: unknown): unknown => {
    if (!v || typeof v !== 'object' || !isPlain(v)) return v;
    const done = copies.get(v);
    if (done) return done;
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      copies.set(v, out);
      for (const item of v) out.push(copy(item));
      return out;
    }
    const out: Record<string, unknown> = {};
    copies.set(v, out);
    for (const [k, child] of Object.entries(v)) out[k] = copy(child);
    const moved = moves.get(v);
    if (moved) out.hex = moved + (v as { hex: string }).hex.slice(7);
    return out;
  };
  return copy(config) as T;
}
