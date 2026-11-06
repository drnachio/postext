// Where a face puts its strikeout (`~~…~~`): the OS/2 table's
// `yStrikeoutPosition` and `yStrikeoutSize`, over `head.unitsPerEm`. The
// engine measures text through a canvas, which does not report them, so they
// are read from the face's files where those reach the engine: every file
// registered with `registerFontCoverage` (`prepareFonts`, the layout worker,
// the command line) is read here too. A face no file of which was read, or
// whose file leaves the values at zero, takes the fallback of
// `marks/strikeGeometry.ts`.

import { readSfnt } from '../word/fonts/sfnt.js';
import { fontStringFamilies, parseFontString } from '../measure/fontString.js';
import { baseFontFamily, isFeatureFamily } from './figureStyle.js';

/** A face's strikeout in em: the middle of the line over the baseline,
 *  and its thickness. */
export interface StrikeoutMetrics {
  position: number;
  size: number;
}

interface Entry {
  family: string;
  weight: [number, number];
  style: 'normal' | 'italic';
  metrics: StrikeoutMetrics;
}

const entries: Entry[] = [];
/** The answers by font shorthand, cleared whenever a face comes or goes. */
const byFont = new Map<string, StrikeoutMetrics | null>();

/** The strikeout of a TrueType or OpenType file (not WOFF or WOFF2: pass the
 *  decompressed bytes), or undefined when it sets none. */
export function readStrikeout(bytes: Uint8Array): StrikeoutMetrics | undefined {
  const font = readSfnt(bytes);
  const head = font?.tables.get('head');
  const os2 = font?.tables.get('OS/2');
  if (!head || head.length < 20 || !os2 || os2.length < 30) return undefined;
  const unitsPerEm = (head[18]! << 8) | head[19]!;
  const i16 = (at: number): number => {
    const v = (os2[at]! << 8) | os2[at + 1]!;
    return v & 0x8000 ? v - 0x10000 : v;
  };
  const size = i16(26);
  const position = i16(28);
  // A face that leaves them at zero (or sets nonsense) has none.
  if (!unitsPerEm || size <= 0 || position <= 0 || size > unitsPerEm / 4 || position > unitsPerEm) return undefined;
  return { position: position / unitsPerEm, size: size / unitsPerEm };
}

function weightRange(weight: number | string): [number, number] {
  if (typeof weight === 'number') return [weight, weight];
  const parts = String(weight).trim().split(/\s+/).map(Number);
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** Read the strikeout of one file of a face and keep it for its family,
 *  weight (or weight range) and style. Returns false when the file sets
 *  none. A family's slices give the same values: the first one read is
 *  kept. */
export function registerStrikeout(family: string, weight: number | string, style: string, bytes: Uint8Array): boolean {
  const metrics = readStrikeout(bytes);
  if (!metrics) return false;
  const entry: Entry = { family: baseFontFamily(family).toLowerCase(), weight: weightRange(weight), style: /italic|oblique/i.test(style) ? 'italic' : 'normal', metrics };
  if (!entries.some((e) => e.family === entry.family && e.style === entry.style && e.weight[0] === entry.weight[0] && e.weight[1] === entry.weight[1])) {
    entries.push(entry);
    byFont.clear();
  }
  return true;
}

/** Forget the strikeouts read for `families` (all of them without). */
export function forgetStrikeout(families?: Iterable<string>): void {
  byFont.clear();
  if (!families) {
    entries.length = 0;
    return;
  }
  const drop = new Set([...families].filter((f) => !isFeatureFamily(f)).map((f) => f.toLowerCase()));
  for (let i = entries.length - 1; i >= 0; i--) if (drop.has(entries[i]!.family)) entries.splice(i, 1);
}

/** The strikeout of the face a font shorthand sets its text in: its first
 *  family, the cut CSS matching settles on (its slant first, the nearest
 *  weight). Undefined when no file of that family set one: the face may be
 *  another (a system face), whose strikeout is not known. */
export function strikeoutOf(font: string): StrikeoutMetrics | undefined {
  const hit = byFont.get(font);
  if (hit !== undefined) return hit ?? undefined;
  let out: StrikeoutMetrics | undefined;
  const req = parseFontString(font);
  const family = fontStringFamilies(font)[0];
  if (req && family && entries.length > 0) {
    const lower = baseFontFamily(family).toLowerCase();
    const own = entries.filter((e) => e.family === lower);
    if (own.length > 0) {
      const sameStyle = own.filter((e) => e.style === req.style);
      const pool = sameStyle.length > 0 ? sameStyle : own;
      const distance = (e: Entry) => (req.weight < e.weight[0] ? e.weight[0] - req.weight : req.weight > e.weight[1] ? req.weight - e.weight[1] : 0);
      const best = Math.min(...pool.map(distance));
      out = pool.find((e) => distance(e) === best)?.metrics;
    }
  }
  byFont.set(font, out ?? null);
  return out;
}
