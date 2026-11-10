// Ink a reflowed page can show (#1444): a design sets white or pale text
// on a band, a photograph or a coloured page the semantic document does
// not draw, so such ink is left to the paper's default unless the band is
// written too.

/** Relative luminance of an `RRGGBB` colour (0 black … 1 white). */
export function luminance(rgb: string): number {
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(rgb.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Whether ink `rgb` is too pale to read on white paper (contrast under
 *  2:1). */
export const paleOnWhite = (rgb: string | undefined): boolean => !!rgb && 1.05 / (luminance(rgb) + 0.05) < 2;
