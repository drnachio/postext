/**
 * The family each embedded font was loaded for (`FontCache`): the key of a
 * vertical page's central axes (`VDTFlowFrame.centralBaselines`), which the
 * vertical painter needs for a font it is handed without its font string.
 */
import type { PDFFont } from 'pdf-lib';

const families = new WeakMap<PDFFont, string>();

/** Record that `font` (a file of a face) belongs to `family`; the first
 *  family recorded for a file shared by several faces stays. */
export function registerFontFamily(font: PDFFont, family: string): void {
  if (!families.has(font)) families.set(font, family);
}

/** The family `font` was loaded for, if the font cache loaded it. */
export function fontFamilyOf(font: PDFFont): string | undefined {
  return families.get(font);
}
