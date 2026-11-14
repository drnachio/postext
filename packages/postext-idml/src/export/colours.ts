// Colours as swatches: authored CMYK colours become process swatches under
// their palette names, other colours RGB ones. Swatch names are unique, and
// none takes the name of one of InDesign's own (Black, Paper,
// Registration, None).

import { parseColor as parseHexColor, type Rgba } from 'postext/writer';
import { cssColor as wordColor } from 'postext/writer';
import { num, type Swatch } from './parts.js';
import { inkLabel, type InkDef } from './inks.js';
import type { Writer } from './writer.js';

/** InDesign's own swatches, whose names a document's swatches cannot take. */
export const RESERVED_SWATCH_NAMES = ['Black', 'Paper', 'Registration', 'None'];

/** `#rgb`, `#rrggbb`, `#rrggbbaa` (as the contrast check reads them), and
 *  `rgb()`/`rgba()` (as the Word export does) → 0–255 and alpha 0–1. */
export function parseColor(s: string | undefined): Rgba | undefined {
  if (!s || !/^\s*rgba?\(/i.test(s)) return parseHexColor(s);
  const c = wordColor(s);
  const rgb = c && parseHexColor(`#${c.hex}`);
  return rgb ? { ...rgb, a: c.alpha } : undefined;
}

/** `name`, or `name 2`, `name 3`… when a swatch has it already. */
function uniqueName(taken: Set<string>, name: string): string {
  let out = name;
  for (let i = 2; taken.has(out.toLowerCase()); i++) out = `${name} ${i}`;
  taken.add(out.toLowerCase());
  return out;
}

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');

/** The swatch of a spot ink, written once (`ink:<name>`). */
export function inkSwatch(w: Writer, ink: InkDef): Swatch {
  const key = `ink:${ink.name}`;
  let s = w.swatches.get(key);
  if (!s) {
    const name = uniqueName(w.swatchNames, ink.name);
    s = { self: `Color/${name}`, name, space: 'CMYK', value: [ink.cmyk.c, ink.cmyk.m, ink.cmyk.y, ink.cmyk.k], model: 'Spot', label: inkLabel(ink) };
    w.swatches.set(key, s);
  }
  return s;
}

/** A colour as a swatch reference: a spot ink (or a tint of one), authored
 *  CMYK (palette names when the configuration names it), else RGB. It
 *  overprints when its ink does or the colour says so. */
export function swatch(w: Writer, color: string | undefined): { ref: string; opacity: number; overprint?: boolean } | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  if (c.a === 0) return undefined;
  const key = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  const overprint = w.inks.overprints.has(key) ? { overprint: true } : {};
  const spot = w.inks.spots.get(key);
  const ink = spot && w.inks.inks.get(spot.ink);
  if (spot && ink) {
    const base = inkSwatch(w, ink);
    if (spot.tint >= 100) return { ref: base.self, opacity: c.a, ...overprint };
    let t = w.swatches.get(key);
    if (!t) {
      t = { self: `Tint/${base.name} ${num(spot.tint)}%`, name: `${base.name} ${num(spot.tint)}%`, space: 'CMYK', value: base.value, model: 'Spot', base: base.self, tint: spot.tint };
      w.swatches.set(key, t);
    }
    return { ref: t.self, opacity: c.a, ...overprint };
  }
  const cmyk = w.cmyk.get(key) ?? w.inks.process.get(key);
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 100) return { ref: 'Color/Black', opacity: c.a, ...overprint };
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 0) return { ref: 'Color/Paper', opacity: c.a, ...overprint };
  let s = w.swatches.get(key);
  if (!s) {
    const fallback = cmyk ? `C=${num(cmyk.c)} M=${num(cmyk.m)} Y=${num(cmyk.y)} K=${num(cmyk.k)}` : `R=${c.r} G=${c.g} B=${c.b}`;
    const name = uniqueName(w.swatchNames, w.palette.get(key) ?? fallback);
    s = cmyk
      ? { self: `Color/${name}`, name, space: 'CMYK', value: [cmyk.c, cmyk.m, cmyk.y, cmyk.k] }
      : { self: `Color/${name}`, name, space: 'RGB', value: [c.r, c.g, c.b] };
    w.swatches.set(key, s);
  }
  return { ref: s.self, opacity: c.a, ...overprint };
}

/** The overprint attributes of a page item painted with `fill` and
 *  `stroke`. */
export const overprintAttrs = (fill: { overprint?: boolean } | undefined, stroke: { overprint?: boolean } | undefined): string =>
  `${fill?.overprint ? ' OverprintFill="true"' : ''}${stroke?.overprint ? ' OverprintStroke="true"' : ''}`;
