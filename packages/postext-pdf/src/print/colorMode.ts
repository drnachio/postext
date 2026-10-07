/**
 * Colour-managed print output: the "colour mode" a page paints in. Plain
 * `PdfColorSpace` strings keep their old meaning (`'rgb'`, `'grayscale'`,
 * and `'cmyk'` through the naive formula when no profile is at hand); a
 * {@link PrintColorMode} separates every colour through an ICC output
 * profile and carries what the print pass needs (black handling, the
 * PDF/X standard).
 */

import {
  outputTransform,
  type CmykPercent,
  type IccProfile,
  type OutputTransform,
  type PdfColorSpace,
  type PdfXStandard,
  type ResolvedPrintConfig,
} from 'postext';

export interface PrintColorMode {
  kind: 'print';
  /** Distinguishes modes in caches (profile + options). */
  key: string;
  standard: PdfXStandard;
  profile: IccProfile;
  transform: OutputTransform;
  config: ResolvedPrintConfig;
  /** The printing condition the output intent names. */
  condition: { registryName: string; condition: string; name: string };
  /** PDF/X-1a: no transparency, so translucent colours are pre-composed
   *  over the paper and soft masks flattened. */
  flattenTransparency: boolean;
  /** Convert RGB pictures to the output CMYK. */
  convertImages: boolean;
  /** Colours authored in CMYK, by screen hex (`#rrggbb`): set as they are. */
  authored: ReadonlyMap<string, CmykPercent>;
}

export type ColorMode = PdfColorSpace | PrintColorMode;

export function isPrintMode(mode: ColorMode): mode is PrintColorMode {
  return typeof mode === 'object';
}

/** Whether the mode paints in DeviceCMYK. */
export function isCmykMode(mode: ColorMode): boolean {
  return mode === 'cmyk' || isPrintMode(mode);
}

/** A cache key for a mode. */
export function modeKey(mode: ColorMode): string {
  return isPrintMode(mode) ? mode.key : mode;
}

export function createPrintColorMode(
  profile: IccProfile,
  config: ResolvedPrintConfig,
  condition: PrintColorMode['condition'],
  authored: ReadonlyMap<string, CmykPercent> = new Map(),
): PrintColorMode {
  const transform = outputTransform(profile, {
    intent: config.renderingIntent,
    blackPointCompensation: config.blackPointCompensation,
    preserveNeutrals: config.black.kOnlyNeutrals,
  });
  const flattenTransparency = config.standard === 'pdfx1a';
  return {
    kind: 'print',
    key: `print:${profile.hash}:${config.renderingIntent}:${config.blackPointCompensation}:${config.black.kOnlyNeutrals}:${flattenTransparency}:${authoredKey(authored)}`,
    standard: config.standard,
    profile,
    transform,
    config,
    condition,
    flattenTransparency,
    convertImages: config.standard === 'pdfx1a' || config.convertImages,
    authored,
  };
}

function authoredKey(authored: ReadonlyMap<string, CmykPercent>): string {
  return [...authored].map(([hex, c]) => `${hex}=${c.c},${c.m},${c.y},${c.k}`).join(';');
}

/** Pre-compose a translucent sRGB colour over white paper. */
export function overPaper(r: number, g: number, b: number, alpha: number): [number, number, number] {
  const a = Math.max(0, Math.min(1, alpha));
  return [r * a + (1 - a), g * a + (1 - a), b * a + (1 - a)];
}
