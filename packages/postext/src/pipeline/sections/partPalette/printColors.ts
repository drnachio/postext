// Print values the configuration alone does not hold (#1471): a part's or
// a section's palette that recolours an entry that overprints
// (`ColorValue.overprint`), and resources linked to the palette at a tint.
// A print render finds a colour's inks and overprint by the hex the layout
// painted, so these colours are listed on the document (`printColors`).

import type { ColorPaletteEntry, ColorValue, Resource } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import { isTinted, paletteTintHex, resolveColorValue, type TintPaper } from '../../../defaults/shared.js';
import { nearestFreeHex } from '../../../color/inks.js';
import { withHash } from './colorKinds.js';

const hex6 = (hex: string): string => hex.slice(0, 7).toLowerCase();

/** Hexes of the resolved configuration's colours that do not overprint. */
function knockoutHexes(resolved: ResolvedConfig): Set<string> {
  const hit = knockoutMemo.get(resolved);
  if (hit) return hit;
  const out = new Set<string>();
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as { hex?: unknown; model?: unknown; overprint?: unknown };
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      if (o.overprint !== true && /^#[0-9a-f]{6}/i.test(o.hex)) out.add(hex6(o.hex));
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(resolved);
  knockoutMemo.set(resolved, out);
  return out;
}

const knockoutMemo = new WeakMap<object, Set<string>>();

/**
 * The page palettes with every override of an entry that overprints moved
 * off any hex a colour that knocks out paints (one step, as
 * `separatePrintColors` moves a colour), and the colours those overrides
 * paint, at full strength and at each tint the book links to its palette,
 * as colours that overprint. `palettes` comes back as it is when no entry
 * overprints.
 */
export function overprintingOverrides(
  palettes: readonly Record<string, string>[],
  resolved: ResolvedConfig,
  tints: readonly number[],
  paperOf: (overrides: Readonly<Record<string, string>>) => string,
): { palettes: Record<string, string>[]; printColors: ColorValue[] } {
  const over = new Set((resolved.colorPalette ?? []).filter((e) => e.value.overprint === true).map((e) => e.id));
  if (over.size === 0 || !palettes.some((p) => p && Object.keys(p).some((id) => over.has(id)))) return { palettes: palettes as Record<string, string>[], printColors: [] };
  const taken = new Set(knockoutHexes(resolved));
  for (const p of palettes) for (const [id, hex] of Object.entries(p ?? {})) if (!over.has(id)) taken.add(hex6(withHash(hex)));
  const moved = new Map<string, string>();
  const printColors = new Map<string, ColorValue>();
  const add = (hex: string): void => {
    if (!printColors.has(hex)) printColors.set(hex, { hex, model: 'hex', overprint: true });
  };
  const out = palettes.map((p) => {
    if (!p || !Object.keys(p).some((id) => over.has(id))) return p;
    const next: Record<string, string> = { ...p };
    for (const [id, raw] of Object.entries(p)) {
      if (!over.has(id)) continue;
      let hex = hex6(withHash(raw));
      if (taken.has(hex)) {
        let to = moved.get(hex);
        if (!to) {
          to = nearestFreeHex(hex, taken);
          taken.add(to);
          moved.set(hex, to);
        }
        hex = to;
        next[id] = to;
      }
      add(hex);
      for (const t of tints) add(paletteTintHex(hex, t, paperOf(next)).toLowerCase());
    }
    return next;
  });
  return { palettes: out, printColors: [...printColors.values()] };
}

/**
 * The colours of `resources` linked to a CMYK or spot entry of `palette`
 * at a tint (a table cell's ground), with the print values they take:
 * their inks scaled, as the configuration's own tints are.
 */
export function resourceTintColors(resources: readonly Resource[], palette: ColorPaletteEntry[] | undefined, paper: TintPaper): ColorValue[] {
  if (!palette || palette.length === 0 || resources.length === 0) return [];
  const inked = new Set(palette.filter((e) => e.value.model === 'cmyk' || e.value.model === 'spot' || e.value.overprint === true).map((e) => e.id));
  if (inked.size === 0) return [];
  const out = new Map<string, ColorValue>();
  const seen = new Set<object>();
  const walk = (v: unknown): void => {
    if (!v || typeof v !== 'object' || seen.has(v)) return;
    seen.add(v);
    const o = v as ColorValue;
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      if (o.paletteId && inked.has(o.paletteId) && isTinted(o)) {
        const value = resolveColorValue(o, palette, o, paper);
        out.set(JSON.stringify(value), value);
      }
      return;
    }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child);
  };
  walk(resources);
  return [...out.values()];
}

/** Add `colors` to `doc.printColors`, each once. */
export function addPrintColors(doc: { printColors?: ColorValue[] }, colors: readonly ColorValue[]): void {
  if (colors.length === 0) return;
  const list = doc.printColors ?? [];
  const known = new Set(list.map((c) => JSON.stringify(c)));
  for (const c of colors) {
    const key = JSON.stringify(c);
    if (known.has(key)) continue;
    known.add(key);
    list.push(c);
  }
  doc.printColors = list;
}
