// Faces: what a run's canvas font shorthand asks for, and InDesign's
// style name of a face.

import { findPxSize, parseFontString } from 'postext/writer';

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
