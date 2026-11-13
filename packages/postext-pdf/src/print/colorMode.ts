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
  spotsThroughInkTable,
  type CmykPercent,
  type IccProfile,
  type OutputTransform,
  type PdfColorSpace,
  type PdfXStandard,
  type ResolvedPrintConfig,
  type ResolvedSpotColor,
} from 'postext';
import { SpotInkRegistry } from './spot.js';
import { platePlan, type PlatePlan } from './plates.js';

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
  /** Spot colours, by screen hex (`#rrggbb`): painted on their ink's
   *  own plate (see `spot.ts`). */
  spots: ReadonlyMap<string, ResolvedSpotColor>;
  /** A job on a few plates (`print.plates`): every colour and picture is
   *  set on them (see `plates.ts`). */
  plates?: PlatePlan;
  /** This render's spot inks: the stand-in codes, the plates and the
   *  names they are written under. A new mode starts empty, so nothing one
   *  render registers reaches another. */
  inkRegistry: SpotInkRegistry;
  /** Colours that overprint (`ColorValue.overprint`), by screen hex. */
  overprints: ReadonlySet<string>;
  /** The profile every RGB picture is read through
   *  (`print.imageColor.assignedRgbProfile`), when it could be loaded. */
  assignedRgbProfile?: IccProfile;
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
  spots: ReadonlyMap<string, ResolvedSpotColor> = new Map(),
  overprints: ReadonlySet<string> = new Set(),
  assignedRgbProfile?: IccProfile,
): PrintColorMode {
  const transform = outputTransform(profile, {
    intent: config.renderingIntent,
    blackPointCompensation: config.blackPointCompensation,
    preserveNeutrals: config.black.kOnlyNeutrals,
  });
  const flattenTransparency = config.standard === 'pdfx1a';
  // The ink table renames, merges and sends inks to process.
  if (config.inks.length > 0) ({ spots, authored } = spotsThroughInkTable(spots, authored, config.inks));
  spots = onePlatePerInk(spots);
  const plates = platePlan(config, spots.values());
  return {
    kind: 'print',
    key: `print:${profile.hash}:${config.renderingIntent}:${config.blackPointCompensation}:${config.black.kOnlyNeutrals}:${flattenTransparency}:${authoredKey(authored)}${spots.size > 0 ? `:${spotsKey(spots)}` : ''}${overprints.size > 0 ? `:over=${[...overprints].sort().join(',')}` : ''}${plates ? `:plates=${plates.key}` : ''}${imagesKey(config.imageColor, assignedRgbProfile)}`,
    standard: config.standard,
    profile,
    transform,
    config,
    condition,
    flattenTransparency,
    convertImages: config.standard === 'pdfx1a' || config.convertImages,
    authored,
    spots,
    inkRegistry: new SpotInkRegistry(undefined, !!plates),
    overprints,
    ...(plates ? { plates } : {}),
    ...(assignedRgbProfile ? { assignedRgbProfile } : {}),
  };
}

function spotsKey(spots: ReadonlyMap<string, ResolvedSpotColor>): string {
  return [...spots].map(([hex, s]) => `${hex}=${s.name}/${s.cmyk.c},${s.cmyk.m},${s.cmyk.y},${s.cmyk.k}/${s.tint}/${s.overprint}${s.finish ? `/${s.finish.kind}` : ''}`).join(';');
}

/** How pictures' colours are read (`print.imageColor`), for the mode's
 *  key: empty while every field keeps its default, so the key of a book
 *  that does not set them stays as it was. */
function imagesKey(ic: ResolvedPrintConfig['imageColor'], assigned: IccProfile | undefined): string {
  if (ic.embeddedProfile === 'ignore' && ic.grayDotGain === 'none' && ic.cmykProfile === 'keep' && !assigned) return '';
  return `:images=${ic.embeddedProfile}/${ic.grayDotGain}/${ic.cmykProfile}/${assigned?.hash ?? ''}`;
}

function authoredKey(authored: ReadonlyMap<string, CmykPercent>): string {
  return [...authored].map(([hex, c]) => `${hex}=${c.c},${c.m},${c.y},${c.k}`).join(';');
}

/** Pre-compose a translucent sRGB colour over white paper. */
export function overPaper(r: number, g: number, b: number, alpha: number): [number, number, number] {
  const a = Math.max(0, Math.min(1, alpha));
  return [r * a + (1 - a), g * a + (1 - a), b * a + (1 - a)];
}

/** Spot colours with every ink as its first colour defines it: one ink
 *  name is one plate, whatever CMYK, overprint or finish a later colour
 *  gives it (the preflight reports those). */
function onePlatePerInk(spots: ReadonlyMap<string, ResolvedSpotColor>): ReadonlyMap<string, ResolvedSpotColor> {
  const first = new Map<string, ResolvedSpotColor>();
  const out = new Map<string, ResolvedSpotColor>();
  for (const [hex, s] of spots) {
    const ink = first.get(s.name) ?? (first.set(s.name, s), s);
    if (ink === s) {
      out.set(hex, s);
      continue;
    }
    const merged: ResolvedSpotColor = { ...s, cmyk: ink.cmyk, overprint: ink.overprint };
    if (ink.finish) merged.finish = ink.finish;
    else delete merged.finish;
    out.set(hex, merged);
  }
  return out;
}
