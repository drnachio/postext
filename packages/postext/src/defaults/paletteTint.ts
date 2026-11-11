// Tints of a palette entry (`ColorValue.tint`): a palette-linked colour
// painted at a strength of its entry over the page.
import type { CmykPercent, ColorValue } from '../types.js';

const WHITE = '#ffffff';

/** `#rrggbb` of a colour string, or undefined. */
function rgb6(hex: string | undefined): number | undefined {
  const m = hex ? /^#?([0-9a-f]{6})/i.exec(hex) : null;
  return m ? parseInt(m[1]!, 16) : undefined;
}

/**
 * `hex` (`#rrggbb`) at `tint` percent over `paper` (the page colour,
 * `page.backgroundColor`; white without one): what a `ColorValue.tint`
 * shows on screen. 100 or more (or no tint) is the colour itself.
 */
export function paletteTintHex(hex: string, tint: number | undefined, paper: string = WHITE): string {
  if (tint === undefined || !Number.isFinite(tint) || tint >= 100) return hex;
  const n = rgb6(hex);
  if (n === undefined) return hex;
  const p = rgb6(paper) ?? 0xffffff;
  const t = Math.max(0, tint) / 100;
  const channel = (shift: number): string => {
    const over = (p >> shift) & 0xff;
    return Math.round(over + (((n >> shift) & 0xff) - over) * t).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Whether `link` is tinted (`ColorValue.tint` under 100). */
export function isTinted(link: ColorValue | undefined): boolean {
  return link?.tint !== undefined && Number.isFinite(link.tint) && link.tint < 100;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The colour a link at `tint` takes from its palette `entry`, in the
 * entry's own model: a screen colour mixed over the page (`paper`), a
 * CMYK colour with every ink scaled (plus the page's own inks under it
 * when the page colour is authored in CMYK, `paperCmyk`), a spot colour
 * at that fraction of its tint, so it stays on the ink's plate. `hex` is
 * always the screen rendering over the page. Whether the entry overprints
 * carries over.
 */
export function tintedEntryValue(entry: ColorValue, tint: number, paper: string = WHITE, paperCmyk?: CmykPercent): ColorValue {
  const t = Math.max(0, Math.min(100, tint)) / 100;
  const hex = paletteTintHex(entry.hex, tint, paper);
  const over = entry.overprint === true ? { overprint: true } : {};
  if (entry.model === 'cmyk' && entry.cmyk) {
    const under = paperCmyk ?? { c: 0, m: 0, y: 0, k: 0 };
    const mix = (ink: number, base: number): number => round2(Math.min(100, ink * t + base * (1 - t)));
    const c = entry.cmyk;
    return { hex, model: 'cmyk', cmyk: { c: mix(c.c, under.c), m: mix(c.m, under.m), y: mix(c.y, under.y), k: mix(c.k, under.k) }, ...over };
  }
  if (entry.model === 'spot' && entry.spot) {
    return { hex, model: 'spot', spot: { ...entry.spot, tint: round2((entry.spot.tint ?? 100) * t) }, ...over };
  }
  return { hex, model: entry.model === 'spot' || entry.model === 'cmyk' ? 'hex' : entry.model, ...over };
}

/** The page colour tints mix over: `page.backgroundColor` when it is a
 *  colour, white otherwise. */
export function tintPaperOf(page: { backgroundColor?: ColorValue } | undefined): { paper: string; paperCmyk?: CmykPercent } {
  const bg = page?.backgroundColor;
  const n = rgb6(bg?.hex);
  if (!bg || n === undefined) return { paper: WHITE };
  const paper = `#${n.toString(16).padStart(6, '0')}`;
  return bg.model === 'cmyk' && bg.cmyk ? { paper, paperCmyk: bg.cmyk } : { paper };
}

/** The tints (`ColorValue.tint`) the palette-linked colours of `value`
 *  use (a configuration, or the resources of a document): a part's or a
 *  section's palette recolours each of them as well. */
export function paletteTints(value: object): number[] {
  // Memoised per object: every build asks again.
  const hit = tintsMemo.get(value);
  if (hit) return hit;
  const tints = new Set<number>();
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as { hex?: unknown; paletteId?: unknown; tint?: unknown };
    if (typeof o.hex === 'string') {
      if (typeof o.paletteId === 'string' && typeof o.tint === 'number' && o.tint < 100) tints.add(o.tint);
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(value);
  const out = [...tints];
  tintsMemo.set(value, out);
  return out;
}

const tintsMemo = new WeakMap<object, number[]>();
