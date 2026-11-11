// Faces: what a run's canvas font shorthand asks for, and InDesign's
// style name of a face.

import { findPxSize, parseFontString } from 'postext/writer';
import { fontFormat, fontNames } from './sfnt.js';
import type { Writer } from './writer.js';

const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

export function defaultFontStyleName(_family: string, weight: number, italic: boolean): string {
  const w = WEIGHT_NAMES[Math.round(weight / 100) * 100] ?? 'Regular';
  if (!italic) return w;
  return w === 'Regular' ? 'Italic' : `${w} Italic`;
}

export interface CssFont {
  family: string;
  weight: number;
  italic: boolean;
  sizePx: number;
}

/** `italic 700 16px "EB Garamond", serif` → its parts, as the measurer
 *  reads them (`parseFontString`, `findPxSize`); a string with no `px`
 *  size is 16px Times. */
export function parseCssFont(s: string): CssFont {
  const face = parseFontString(s);
  const size = findPxSize(s);
  return { family: face?.family ?? 'Times', weight: face?.weight ?? 400, italic: face?.style === 'italic', sizePx: size ? Number(size.value) : 16 };
}

/** A CSS face as InDesign names it: the names of its font file when the
 *  caller gives one (`fontFile`), else the CSS family and a style name
 *  derived from weight and slant (`fontStyleName`). The file is kept for
 *  the package's `Document fonts`. */
export function faceOf(w: Writer, family: string, weight: number, italic: boolean): { family: string; style: string } {
  const key = `${family}|${weight}|${italic}`;
  const hit = w.faces.get(key);
  if (hit) return hit;
  let face = { family, style: (w.opts.fontStyleName ?? defaultFontStyleName)(family, weight, italic) };
  let names: ReturnType<typeof fontNames>;
  const bytes = w.opts.fontFile?.(family, weight, italic);
  if (bytes) {
    names = fontNames(bytes);
    if (names) {
      face = { family: names.family, style: names.style };
      const file = `${(names.postScriptName ?? `${names.family}-${names.style}`).replace(/[^\w.\-]+/g, '')}.${names.extension}`;
      if (!w.fontFiles.has(file)) w.fontFiles.set(file, { path: `Document fonts/${file}`, bytes });
    } else {
      const format = fontFormat(bytes);
      w.warn('font.format', `${family} ${weight}${italic ? ' italic' : ''}: the font file is ${format === 'sfnt' ? 'not readable' : `${format.toUpperCase()}, which has to be decoded to TrueType or OpenType first`}; the face is named from its weight and slant`);
    }
  } else if (w.opts.fontFile) {
    w.warn('font.missing', `${family} ${weight}${italic ? ' italic' : ''}: no font file; the face is named "${face.style}" from its weight and slant, which may not be the name InDesign knows it by`);
  }
  let styles = w.fonts.get(face.family);
  if (!styles) w.fonts.set(face.family, (styles = new Map()));
  if (!styles.has(face.style) || names) styles.set(face.style, names);
  w.faces.set(key, face);
  return face;
}
