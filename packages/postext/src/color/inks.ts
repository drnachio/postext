/**
 * The job's spot inks as the printer gets them: the ink table
 * (`print.inks`) renames, merges and converts them, the names are checked
 * for what a PDF plate name cannot be, and colours that state their print
 * values each keep a screen colour of their own, since a print render finds
 * a colour's ink by its screen hex.
 */

import type { CmykPercent, PostextConfig, ResolvedPrintInk, ResolvedSpotColor } from '../types.js';
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
export function printedSpot(spot: ResolvedSpotColor, inks: readonly ResolvedPrintInk[]): ResolvedSpotColor | undefined {
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
export function processCmykOfSpot(spot: ResolvedSpotColor, inks: readonly ResolvedPrintInk[]): CmykPercent {
  const entry = inkEntry(spot.name, inks);
  return spotColorCmyk(entry?.cmyk ? { ...spot, cmyk: entry.cmyk } : spot);
}

/** A job's spot colours (by screen hex) as the ink table prints them:
 *  renamed or merged onto the plate it names, or moved to the process
 *  colours (`authored`, by the same hex) when it sends the ink to process. */
export function spotsThroughInkTable(
  spots: ReadonlyMap<string, ResolvedSpotColor>,
  authored: ReadonlyMap<string, CmykPercent>,
  inks: readonly ResolvedPrintInk[],
): { spots: Map<string, ResolvedSpotColor>; authored: Map<string, CmykPercent> } {
  const onPlates = new Map<string, ResolvedSpotColor>();
  const process = new Map(authored);
  for (const [hex, s] of spots) {
    const printed = printedSpot(s, inks);
    if (printed) onPlates.set(hex, printed);
    else process.set(hex, processCmykOfSpot(s, inks));
  }
  return { spots: onPlates, authored: process };
}

/** What a plate name cannot be as written: `All` and `None` mean every
 *  plate and no plate to a PDF reader (`reserved`), `Cyan`, `Magenta`,
 *  `Yellow` and `Black` are the process plates (`process`), a name runs to
 *  127 bytes at most (`tooLong`), and a control character cannot be in
 *  one (`control`). */
export type InkNameProblem = 'reserved' | 'process' | 'tooLong' | 'control';

const RESERVED_INK = /^(all|none)$/i;
const PROCESS_INK = /^(cyan|magenta|yellow|black)$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROLS = /[\u0000-\u001f\u007f]+/g;
/** The longest plate name a PDF carries, in UTF-8 bytes. */
const MAX_INK_BYTES = 127;

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

export function inkNameProblem(name: string): InkNameProblem | undefined {
  const t = name.trim();
  if (RESERVED_INK.test(t)) return 'reserved';
  if (PROCESS_INK.test(t)) return 'process';
  if (CONTROL.test(name)) return 'control';
  if (utf8Length(name) > MAX_INK_BYTES) return 'tooLong';
  return undefined;
}

/** A short hash of a string, four hex digits (FNV-1a folded). */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ((h ^ (h >>> 16)) & 0xffff).toString(16).padStart(4, '0');
}

/**
 * The name a PDF writes for an ink's plate: the name itself when a plate
 * can carry it, otherwise one it can. Control characters are dropped;
 * `All`, `None` and the process plates (`Cyan`, `Magenta`, `Yellow`,
 * `Black`) get ` ink` after them, so the ink keeps a plate of its own
 * instead of printing on every plate, on none, or on a process plate; a
 * name over 127 bytes is cut at a character boundary and ends in a short
 * hash of the whole name, so two long names that share a beginning stay
 * two plates. The preflight reports each renamed ink (`spotInkName`).
 */
export function printableInkName(name: string): string {
  let out = name.replace(CONTROLS, '').trim() || 'Spot';
  if (RESERVED_INK.test(out) || PROCESS_INK.test(out)) out = `${out} ink`;
  if (utf8Length(out) <= MAX_INK_BYTES) return out;
  const suffix = ` ~${shortHash(name)}`;
  const room = MAX_INK_BYTES - suffix.length;
  let cut = '';
  let bytes = 0;
  for (const ch of out) {
    const n = utf8Length(ch);
    if (bytes + n > room) break;
    cut += ch;
    bytes += n;
  }
  return `${cut.trimEnd()}${suffix}`;
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
export function nearestFreeHex(hex: string, taken: ReadonlySet<string>): string {
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
 * screen colour (`model: 'hex'`) equal to a spot or CMYK colour still
 * prints as it, the way an unlinked colour shares a palette colour's
 * value; a colour that overprints moves off a plain colour's hex too, so
 * the plain colour keeps knocking out. Returns the
 * configuration itself when nothing collides.
 *
 * This changes the screen colour of the colour that moves, on purpose: one
 * step (1/255) in one channel, the blue one first, is far below what an
 * eye tells apart (ΔE00 well under 1), and it is the price of the print
 * render reading inks from the painted hex rather than carrying a colour's
 * identity through the layout. The canvas, the HTML, the EPUB and an RGB
 * PDF all show the moved hex; the stored configuration is not changed.
 */
export function separatePrintColors<T extends PostextConfig | undefined>(config: T): T {
  if (!config) return config;
  const palette = new Set((config.colorPalette ?? []).map((e) => e.id));
  const taken = new Set<string>();
  const found: { value: object; hex: string; paint: string }[] = [];
  /** Hexes of plain screen colours (no print values, no link). */
  const plain = new Set<string>();
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
      else if (!linked) plain.add(hex);
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
    // A colour that overprints never shares its hex with a plain colour,
    // which would overprint with it.
    const overPlain = paint.endsWith('|over') && plain.has(hex);
    if (!overPlain) {
      if (held === undefined) {
        owner.set(hex, paint);
        continue;
      }
      if (held === paint) continue;
      if (!movable(held) && !movable(paint)) continue;
    }
    const key = `${hex}|${paint}`;
    let next = movedTo.get(key);
    if (!next) {
      next = nearestFreeHex(hex, taken);
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
