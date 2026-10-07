/**
 * CMYK as the book will print it (#604): the colour picker's CMYK tab shows
 * the separation through the book's output profile, and a colour typed in
 * CMYK is shown on screen through the profile's soft proof. Until the
 * profile has loaded (or without one) the textbook formula stands in.
 */

import { useMemo } from 'react';
import { useSandboxSelector } from '../context/SandboxContext';
import { cmykToRgb, rgbToCmyk, rgbToHex, type CMYK, type RGB } from '../controls/color-utils';
import { usePrintSetup } from './printSetup';

export interface Separation {
  /** True when the output profile separates (not the textbook formula). */
  icc: boolean;
  /** Screen RGB (0..255) → CMYK percentages. */
  toCmyk: (rgb: RGB) => CMYK;
  /** CMYK percentages → the screen hex that shows them. */
  toHex: (cmyk: CMYK) => string;
}

const round = (v: number) => Math.round(v * 100);

export function useSeparation(): Separation {
  const raw = useSandboxSelector((s) => s.config.print);
  const { transform } = usePrintSetup(raw);
  return useMemo((): Separation => {
    if (!transform) return { icc: false, toCmyk: rgbToCmyk, toHex: (c) => rgbToHex(cmykToRgb(c)) };
    return {
      icc: true,
      toCmyk: (rgb) => {
        const k = transform.fromRgb(rgb.r / 255, rgb.g / 255, rgb.b / 255);
        return { c: round(k.c), m: round(k.m), y: round(k.y), k: round(k.k) };
      },
      toHex: (c) => {
        const [r, g, b] = transform.proof({ c: c.c / 100, m: c.m / 100, y: c.y / 100, k: c.k / 100 });
        return rgbToHex({ r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) });
      },
    };
  }, [transform]);
}
