import type { CmykPercent, ResolvedSpotColor, SpotColor } from '../types.js';

export function isAuthoredCmyk(v: unknown): v is { hex: string; model: 'cmyk'; cmyk: CmykPercent } {
  if (!v || typeof v !== 'object') return false;
  const o = v as { hex?: unknown; model?: unknown; cmyk?: unknown };
  return o.model === 'cmyk' && typeof o.hex === 'string' && !!o.cmyk && typeof o.cmyk === 'object';
}

/**
 * The colours of a configuration authored in CMYK (`ColorValue.cmyk`),
 * keyed by their screen hex (`#rrggbb`, lower case): a print render sets
 * these values as they are. A colour that follows a palette entry shares
 * that entry's hex, so the palette's own CMYK covers every use of it.
 */
export function authoredCmykColors(config: unknown, into: Map<string, CmykPercent> = new Map()): Map<string, CmykPercent> {
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (isAuthoredCmyk(v)) {
      const key = v.hex.slice(0, 7).toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(key) && !into.has(key)) into.set(key, { ...v.cmyk });
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  return into;
}

export function isAuthoredSpot(v: unknown): v is { hex: string; model: 'spot'; spot: SpotColor } {
  if (!v || typeof v !== 'object') return false;
  const o = v as { hex?: unknown; model?: unknown; spot?: unknown };
  if (o.model !== 'spot' || typeof o.hex !== 'string' || !o.spot || typeof o.spot !== 'object') return false;
  const s = o.spot as { name?: unknown; cmyk?: unknown };
  return typeof s.name === 'string' && s.name.trim() !== '' && !!s.cmyk && typeof s.cmyk === 'object';
}

const clampPercent = (n: unknown, fallback: number): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;

/** A spot colour with its name trimmed, its tint and CMYK clamped to
 *  0..100 and its defaults filled in. */
export function normalizeSpotColor(spot: SpotColor): ResolvedSpotColor {
  const c = spot.cmyk;
  return {
    name: spot.name.trim(),
    cmyk: { c: clampPercent(c.c, 0), m: clampPercent(c.m, 0), y: clampPercent(c.y, 0), k: clampPercent(c.k, 0) },
    tint: clampPercent(spot.tint, 100),
    overprint: spot.overprint === true,
  };
}

/** The CMYK a spot colour stands for at its tint (the ink's alternate
 *  scaled by the tint), percent: its screen rendering, and what a press
 *  without the ink would print. */
export function spotColorCmyk(spot: SpotColor): CmykPercent {
  const s = normalizeSpotColor(spot);
  const t = s.tint / 100;
  const r = (n: number) => Math.round(n * t * 100) / 100;
  return { c: r(s.cmyk.c), m: r(s.cmyk.m), y: r(s.cmyk.y), k: r(s.cmyk.k) };
}

/**
 * The spot colours of a configuration (`ColorValue.spot`), keyed by their
 * screen hex (`#rrggbb`, lower case) like {@link authoredCmykColors}: a
 * print render paints these on the ink's own plate. The first colour of a
 * hex wins.
 */
export function authoredSpotColors(config: unknown, into: Map<string, ResolvedSpotColor> = new Map()): Map<string, ResolvedSpotColor> {
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    if (isAuthoredSpot(v)) {
      const key = v.hex.slice(0, 7).toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(key) && !into.has(key)) into.set(key, normalizeSpotColor(v.spot));
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  return into;
}

/** One ink of a job: its name, its full-strength CMYK, whether it
 *  overprints, and the tints the configuration uses it at. */
export interface SpotInk {
  name: string;
  cmyk: CmykPercent;
  overprint: boolean;
  tints: number[];
}

/**
 * The inks of a set of spot colours, by name (the first colour naming an
 * ink sets its CMYK and overprint), and the names that more than one
 * colour defines differently — two plates the printer would be asked to
 * make the same.
 */
export function spotInks(spots: Iterable<ResolvedSpotColor>): { inks: SpotInk[]; conflicts: string[] } {
  const byName = new Map<string, SpotInk>();
  const conflicts = new Set<string>();
  for (const s of spots) {
    const ink = byName.get(s.name);
    if (!ink) {
      byName.set(s.name, { name: s.name, cmyk: { ...s.cmyk }, overprint: s.overprint, tints: [s.tint] });
      continue;
    }
    const a = ink.cmyk;
    const b = s.cmyk;
    if (a.c !== b.c || a.m !== b.m || a.y !== b.y || a.k !== b.k || ink.overprint !== s.overprint) conflicts.add(s.name);
    if (!ink.tints.includes(s.tint)) ink.tints.push(s.tint);
  }
  return { inks: [...byName.values()], conflicts: [...conflicts] };
}

/**
 * The colours of a configuration that overprint (`ColorValue.overprint`),
 * by their screen hex (`#rrggbb`, lower case), whatever their model; a
 * spot colour's ink that overprints (`spot.overprint`) is its own plate's
 * business and is not listed.
 */
export function overprintColors(config: unknown, into: Set<string> = new Set()): Set<string> {
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as { hex?: unknown; model?: unknown; overprint?: unknown };
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      const key = o.hex.slice(0, 7).toLowerCase();
      if (o.overprint === true && /^#[0-9a-f]{6}$/.test(key)) into.add(key);
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(config);
  return into;
}
