// Tints of a palette entry (`ColorValue.tint`): a palette-linked colour
// painted at a strength over the paper.
import type { ColorValue } from '../types.js';

/** `hex` (`#rrggbb`) at `tint` percent over paper white: what a
 *  `ColorValue.tint` paints. 100 or more (or no tint) is the colour itself. */
export function tintHex(hex: string, tint: number | undefined): string {
  if (tint === undefined || !Number.isFinite(tint) || tint >= 100) return hex;
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return hex;
  const t = Math.max(0, tint) / 100;
  const n = parseInt(m[1]!, 16);
  const channel = (shift: number): string =>
    Math.round(255 - (255 - ((n >> shift) & 0xff)) * t).toString(16).padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** Whether `link` is tinted (`ColorValue.tint` under 100). */
export function isTinted(link: ColorValue | undefined): boolean {
  return link?.tint !== undefined && link.tint < 100;
}

/** The tints (`ColorValue.tint`) the palette-linked colours of `config` use:
 *  a part's or a section's palette recolours each of them as well. */
export function paletteTints(config: object): number[] {
  // Memoised per configuration object: every build asks again.
  const hit = tintsMemo.get(config);
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
  walk(config);
  const out = [...tints];
  tintsMemo.set(config, out);
  return out;
}

const tintsMemo = new WeakMap<object, number[]>();
