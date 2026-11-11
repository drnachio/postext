// Small values of a Postext configuration, made from InDesign's: lengths,
// colours, font weights.

import type { ColorPaletteEntry, ColorValue, Dimension } from 'postext';
import type { IdmlDocument } from '../model/document.js';
import { isNoColour, resolveColour, type ResolvedColour } from '../resolve/colour.js';
import { idOf, Ids } from './escape.js';
import type { Reporter } from './report.js';

const round = (n: number, places = 3): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** A length in points. */
export const pt = (n: number): Dimension => ({ value: round(Number.isFinite(n) ? n : 0), unit: 'pt' });

/** A length in millimetres from points: page sizes and margins read
 *  better so, and InDesign's metric documents come out in whole numbers. */
export const mm = (points: number): Dimension => ({ value: round(((Number.isFinite(points) ? points : 0) * 25.4) / 72, 3), unit: 'mm' });

/** The weight a face's style name says (`Semibold Italic` → 600). */
export function weightOf(style: string): number {
  const s = style.toLowerCase().replace(/[\s_-]+/g, '');
  if (/thin|hairline/.test(s)) return 100;
  if (/extralight|ultralight/.test(s)) return 200;
  if (/light/.test(s)) return 300;
  if (/extrabold|ultrabold|heavy/.test(s)) return 800;
  if (/semibold|demibold|demi/.test(s)) return 600;
  if (/black/.test(s)) return 900;
  if (/bold/.test(s)) return 700;
  if (/medium/.test(s)) return 500;
  return 400;
}

/** The style name says the face slants. */
export const italicOf = (style: string): boolean => /italic|oblique|kursiv|cursiva/i.test(style);

/** Swatches as palette entries and colour values. A swatch used at its
 *  own strength is linked to its palette entry; a tint of it is a colour
 *  of its own. */
export class Palette {
  private readonly ids = new Ids();
  private readonly entries = new Map<string, ColorPaletteEntry>();

  constructor(private readonly doc: IdmlDocument, private readonly rep: Reporter) {}

  private valueOf(c: ResolvedColour): ColorValue {
    const value: ColorValue = { hex: c.hex, model: c.cmyk ? 'cmyk' : 'hex' };
    // The authored inks travel with the colour, at the tint it is used at.
    if (c.cmyk) value.cmyk = { c: round(c.cmyk[0] * c.tint, 2), m: round(c.cmyk[1] * c.tint, 2), y: round(c.cmyk[2] * c.tint, 2), k: round(c.cmyk[3] * c.tint, 2) };
    return value;
  }

  /** The colour of a swatch reference; undefined for none. */
  colour(ref: string | undefined, tint?: number, where?: string): ColorValue | undefined {
    if (!ref || isNoColour(this.doc, ref)) return undefined;
    const swatch = this.doc.swatches.get(ref);
    if (!swatch) {
      this.rep.add('missingSwatch', 'warning', 'A colour names a swatch the document does not hold; black is used', ref.replace(/^[A-Za-z]+\//, ''));
      return { hex: '#000000', model: 'hex' };
    }
    const c = resolveColour(this.doc, ref, tint);
    if (!c) {
      this.rep.add('unreadableSwatch', 'warning', 'A swatch has values the importer cannot turn into a colour; black is used', swatch.name);
      return { hex: '#000000', model: 'hex' };
    }
    if (c.kind === 'gradient') this.rep.add('gradient', 'warning', 'A gradient is set as its first colour: Postext has no gradient fill', `${swatch.name}${where ? ` (${where})` : ''}`);
    if (c.kind === 'mixedInk') this.rep.add('mixedInk', 'warning', 'A mixed ink is set as its process equivalent', swatch.name);
    const value = this.valueOf(c);
    const own = tint === undefined || tint < 0 || tint >= 100;
    if (!own) return value;
    let entry = this.entries.get(ref);
    if (!entry) {
      const name = swatch.name || ref;
      entry = { id: this.ids.take(idOf(name, 'colour')), name: c.spot ? `${name} (spot)` : name, value };
      this.entries.set(ref, entry);
      if (c.spot) this.rep.add('spotColour', 'info', 'A spot colour is kept by name in the palette and printed as its process equivalent', name);
    }
    return { ...value, paletteId: entry.id };
  }

  /** The palette: every swatch the book uses, then the document's other
   *  visible swatches, so the library comes whole. */
  list(): ColorPaletteEntry[] {
    for (const [ref, s] of this.doc.swatches) {
      if (s.kind === 'none' || this.entries.has(ref)) continue;
      if (s.kind === 'color' && (!s.visible || s.special === 'reserved' || s.special === 'registration')) continue;
      if (s.kind === 'gradient') continue;
      const c = resolveColour(this.doc, ref);
      if (!c) continue;
      this.entries.set(ref, { id: this.ids.take(idOf(s.name, 'colour')), name: c.spot ? `${s.name} (spot)` : s.name, value: this.valueOf(c) });
    }
    return [...this.entries.values()];
  }
}

export const BLACK: ColorValue = { hex: '#000000', model: 'hex' };

export const sameColour = (a: ColorValue | undefined, b: ColorValue | undefined): boolean => (a?.hex ?? '') === (b?.hex ?? '');
