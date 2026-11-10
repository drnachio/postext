// Colours as swatches: authored CMYK colours become process swatches under
// their palette names, other colours RGB ones. Swatch names are unique, and
// none takes the name of one of InDesign's own (Black, Paper,
// Registration, None).

import { parseColor as parseHexColor, type Rgba } from '../checks/contrast/colours.js';
import { wordColor } from '../word/formatted/units.js';
import { num } from './parts.js';
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

/** A colour as a swatch reference: authored CMYK (palette names when the
 *  configuration names it), else RGB. */
export function swatch(w: Writer, color: string | undefined): { ref: string; opacity: number } | undefined {
  const c = parseColor(color);
  if (!c) return undefined;
  if (c.a === 0) return undefined;
  const key = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  const cmyk = w.cmyk.get(key);
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 100) return { ref: 'Color/Black', opacity: c.a };
  if (cmyk && cmyk.c === 0 && cmyk.m === 0 && cmyk.y === 0 && cmyk.k === 0) return { ref: 'Color/Paper', opacity: c.a };
  let s = w.swatches.get(key);
  if (!s) {
    const fallback = cmyk ? `C=${num(cmyk.c)} M=${num(cmyk.m)} Y=${num(cmyk.y)} K=${num(cmyk.k)}` : `R=${c.r} G=${c.g} B=${c.b}`;
    const name = uniqueName(w.swatchNames, w.palette.get(key) ?? fallback);
    s = cmyk
      ? { self: `Color/${name}`, name, space: 'CMYK', value: [cmyk.c, cmyk.m, cmyk.y, cmyk.k] }
      : { self: `Color/${name}`, name, space: 'RGB', value: [c.r, c.g, c.b] };
    w.swatches.set(key, s);
  }
  return { ref: s.self, opacity: c.a };
}
