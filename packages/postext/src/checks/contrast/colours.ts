// Colour arithmetic of the contrast check: parsing, blending, luminance,
// ratios, thresholds and print separations.
import type { ContrastLevel, CmykPercent, ResolvedContrastConfig } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { type OutputTransform, labToXyz } from '../../color/transform.js';
import { resolveContrastConfig } from '../../defaults/output/contrast.js';
import type { ContrastMedium } from './types.js';

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(color: string | undefined): Rgba | undefined {
  if (!color) return undefined;
  const c = color.trim().toLowerCase();
  if (c === 'transparent') return { r: 255, g: 255, b: 255, a: 0 };
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/.exec(c);
  if (m) return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16), a: m[4] ? parseInt(m[4], 16) / 255 : 1 };
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(c);
  if (m) return { r: parseInt(m[1]! + m[1]!, 16), g: parseInt(m[2]! + m[2]!, 16), b: parseInt(m[3]! + m[3]!, 16), a: m[4] ? parseInt(m[4] + m[4], 16) / 255 : 1 };
  return undefined;
}

const hexByte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export const toHex = (c: { r: number; g: number; b: number }) => `#${hexByte(c.r)}${hexByte(c.g)}${hexByte(c.b)}`;

export function blend(top: Rgba, under: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  if (top.a >= 1) return top;
  return { r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) };
}

/** `top` painted over `under`, as `#rrggbb`: a translucent colour
 *  (`#rrggbbaa`) blended, an opaque one as it is. `under` reads as opaque.
 *  A colour that is no hex gives `under`. */
export function blendColors(top: string, under: string): string {
  const u = parseColor(under) ?? { r: 255, g: 255, b: 255, a: 1 };
  const t = parseColor(top);
  return toHex(t ? blend(t, u) : u);
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** The relative luminance of an sRGB colour (WCAG 2), 0 for black to 1 for
 *  white. Alpha is ignored; a colour that is no hex reads as black. */
export function relativeLuminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export const ratioOf = (l1: number, l2: number) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

/** The WCAG 2 contrast ratio of two sRGB colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  return ratioOf(relativeLuminance(a), relativeLuminance(b));
}

/** Whether text counts as large (WCAG 2): 18 pt, or 14 pt at a weight of
 *  700 and over. */
export function isLargeText(sizePt: number, weight = 400): boolean {
  return sizePt >= 18 - 1e-6 || (sizePt >= 14 - 1e-6 && weight >= 700);
}

/** The ratio a level asks: AA 4.5:1 (3:1 for large text), AAA 7:1
 *  (4.5:1). */
export function contrastThreshold(level: ContrastLevel, large: boolean): number {
  if (level === 'AAA') return large ? 4.5 : 7;
  return large ? 3 : 4.5;
}

/** What the print measures need: the job's separation, and the colours of
 *  the configuration authored in CMYK (`authoredCmykColors`), which print
 *  as written. */
export interface PrintContrastContext {
  transform: OutputTransform;
  authored?: ReadonlyMap<string, CmykPercent>;
}

/** The process values a colour prints with, percent: its authored CMYK,
 *  else its separation on the output profile. */
export function printSeparation(color: string, context: PrintContrastContext): CmykPercent {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const exact = context.authored?.get(toHex(c));
  if (exact) return exact;
  const k = context.transform.fromRgb(c.r / 255, c.g / 255, c.b / 255);
  return { c: k.c * 100, m: k.m * 100, y: k.y * 100, k: k.k * 100 };
}

/** The luminance a colour has printed, relative to the bare paper: its
 *  separation read back through the profile (media-relative), 0 to 1.
 *  Paper is 1, as a display's white is in the screen measure; solid black
 *  is about 0.02 on coated stock and 0.1 to 0.17 on newsprint. */
export function printLuminance(color: string, context: PrintContrastContext): number {
  const s = printSeparation(color, context);
  const lab = context.transform.toLab({ c: s.c / 100, m: s.m / 100, y: s.y / 100, k: s.k / 100 });
  return Math.max(0, Math.min(1, labToXyz(lab).Y));
}

/** The contrast ratio of two colours on paper: the WCAG formula over
 *  their printed luminances. */
export function printContrastRatio(a: string, b: string, context: PrintContrastContext): number {
  return ratioOf(printLuminance(a, context), printLuminance(b, context));
}

/** The renditions a document is checked in under `contrast.mode`: with
 *  `'auto'`, the screen always and print for a book set up for print (a
 *  PDF/X standard, a CMYK PDF, or crop marks). */
export function contrastMedia(config: ResolvedConfig, contrast: ResolvedContrastConfig = config.contrast ?? resolveContrastConfig()): ContrastMedium[] {
  if (contrast.mode === 'screen') return ['screen'];
  if (contrast.mode === 'print') return ['print'];
  if (contrast.mode === 'both') return ['screen', 'print'];
  const pdf = config.pdfGeneration;
  const forPrint = (config.print !== undefined && config.print.standard !== 'none')
    || (!!pdf?.forceColorSpace && pdf.colorSpace === 'cmyk')
    || config.page.cutLines.enabled;
  return forPrint ? ['screen', 'print'] : ['screen'];
}
