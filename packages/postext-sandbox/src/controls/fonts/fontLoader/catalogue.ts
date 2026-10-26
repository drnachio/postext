// What Fontsource's catalogue says of a family: its record, subsets and
// weights, whether it is uncatalogued, where its files come from and the
// style sheet URL of a cut (#1276: split out of fontLoader.ts).
import { fontsourceId } from '../../../viewport/pdf/fontsourceSlices.js';
import { isSystemFontFamily } from '../systemFonts.js';
import { isCustomFontFamily, isRemovedCustomFontFamily } from './customFonts.js';
import { fetchWithin } from './requests.js';

/** A face of a family as it is served: one file, with the weight, the slant
 *  and the characters (`unicode-range`) it answers for. */
export interface FamilyFace {
  family: string;
  /** `'400'`, or a range (`'100 900'`). */
  weight: string;
  style: string;
  unicodeRange?: string;
  url: string;
}

export interface FontMetadata {
  variable: boolean;
  weights: number[];
  hasItalic: boolean;
  /** Whether the family has an upright style (every family but a few that
   *  are italics alone). */
  hasUpright: boolean;
  /** Whether the family is on Google Fonts (Fontsource's `type`). */
  google: boolean;
  /** Whether Fontsource serves it as a Chinese, Japanese or Korean family
   *  (its subsets name the script): its numbered files are slices of the
   *  script, where another family's are its emoji. */
  cjk: boolean;
  /** The subsets each weight and style has a file for, by `weight|style`,
   *  where the record says. */
  subsets?: Map<string, Set<string>>;
  /** The family's files as the Fontsource API lists them, for a family
   *  Google Fonts does not serve (Fontsource's `type` is not `google`:
   *  Commit Mono, FiraGO, DejaVu Sans…): asked of Google, its style sheet
   *  is a 400 with no CORS headers (#689). */
  fontsource?: FamilyFace[];
}

/** What the Fontsource API says of a family, as far as the loader reads it. */
interface FontsourceRecord {
  variable?: boolean;
  weights?: number[];
  styles?: string[];
  subsets?: string[];
  type?: string;
  unicodeRange?: Record<string, string>;
  variants?: Record<string, Record<string, Record<string, { url?: { woff2?: string } }>>>;
}

/** Whether a record's subsets name Chinese, Japanese or Korean. */
function isCjkRecord(data: FontsourceRecord): boolean {
  return (data.subsets ?? []).some((subset) => /^(chinese|japanese|korean)/.test(subset));
}

/** The subsets a pen declares for a family that is not Chinese, Japanese or
 *  Korean, in the order it declares them (`cookbook/_kit`: `fonts.js`, then
 *  `arabic.js`). */
const KIT_SUBSETS = ['latin', 'latin-ext', 'greek', 'arabic'];

/**
 * The files of a cut in the order they are declared (#757), from the order
 * the family's style sheet lists them in (`latin` last): the order the kit
 * declares them in, since the file declared last answers for a character
 * two files hold (CSS Fonts 4 §4.5) and a book must be set from the same
 * file in a pen and in the Sandbox.
 *
 * - A Chinese, Japanese or Korean family: the reverse of the sheet, as
 *   `cjk.js` adds its files: `latin`, `latin-ext`, then the numbered slices,
 *   which answer for the ASCII letters and digits they repeat.
 * - Any other family: `latin`, `latin-ext`, `greek`, then `arabic`, which
 *   answers for the joiners and hyphens it holds beside `latin`. The files
 *   a pen does not load (Cyrillic, Vietnamese, maths, the numbered emoji
 *   slices, which repeat the digits) come before them, in the sheet's
 *   order: they answer for the characters no other file holds.
 */
export function declarationOrder<T extends { name: string }>(sheet: readonly T[], cjk: boolean): T[] {
  if (cjk) return [...sheet].reverse();
  const kit = KIT_SUBSETS.flatMap((name) => sheet.filter((subset) => subset.name === name));
  return [...sheet.filter((subset) => !KIT_SUBSETS.includes(subset.name)), ...kit];
}

/** The WOFF2 files of a Fontsource record, one face per weight, style and
 *  subset, the subsets of each in the order they are declared
 *  (`declarationOrder`). A record with ranges also lists a script's whole
 *  file under its name (`chinese-simplified`, `japanese`) with no range:
 *  declared last, it would answer for every character, so it is left out. */
function fontsourceFaces(family: string, data: FontsourceRecord): FamilyFace[] {
  const out: FamilyFace[] = [];
  const ranges = data.unicodeRange ?? {};
  const ranged = Object.keys(ranges).length > 0;
  const cjk = isCjkRecord(data);
  for (const [weight, styles] of Object.entries(data.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const cut: { name: string; face: FamilyFace }[] = [];
      for (const [subset, file] of Object.entries(subsets ?? {})) {
        const url = file?.url?.woff2;
        if (!url) continue;
        const unicodeRange = ranges[subset] ?? ranges[`[${subset}]`];
        if (ranged && !unicodeRange) continue;
        cut.push({ name: subset, face: { family, weight, style: style === 'italic' ? 'italic' : 'normal', ...(unicodeRange ? { unicodeRange } : {}), url } });
      }
      out.push(...declarationOrder(cut, cjk).map((entry) => entry.face));
    }
  }
  return out;
}

/** The subsets a record gives a file for, by weight and style. */
function recordSubsets(data: FontsourceRecord): Map<string, Set<string>> | undefined {
  const out = new Map<string, Set<string>>();
  for (const [weight, styles] of Object.entries(data.variants ?? {})) {
    for (const [style, subsets] of Object.entries(styles ?? {})) {
      const names = Object.keys(subsets ?? {});
      if (names.length > 0) out.set(`${weight}|${style === 'italic' ? 'italic' : 'normal'}`, new Set(names));
    }
  }
  return out.size > 0 ? out : undefined;
}

export const metadataCache = new Map<string, FontMetadata | null>();
export const metadataInFlight = new Map<string, Promise<FontMetadata | null>>();
/** The families Fontsource answered it does not have (a 404), apart from
 *  the ones whose lookup failed (the service down, the network gone), whose
 *  files may still be there. */
const uncatalogued = new Set<string>();

const toFontsourceId = fontsourceId;

export async function fetchFontMetadata(family: string): Promise<FontMetadata | null> {
  // A face of the reader's machine is not in the catalogue (#753).
  if (isSystemFontFamily(family)) return null;
  if (metadataCache.has(family)) return metadataCache.get(family)!;
  const existing = metadataInFlight.get(family);
  if (existing) return existing;

  const promise = (async (): Promise<FontMetadata | null> => {
    try {
      const data = await fetchWithin(`https://api.fontsource.org/v1/fonts/${toFontsourceId(family)}`, async (res) => {
        if (res.status === 404) uncatalogued.add(family);
        return res.ok ? await res.json() as FontsourceRecord : null;
      });
      if (!data) return null;
      const weights = (data.weights ?? []).filter((w) => typeof w === 'number');
      if (weights.length === 0) return null;
      // Fontsource also lists families that are not on Google Fonts.
      const google = data.type === undefined || data.type === 'google';
      const own = google ? [] : fontsourceFaces(family, data);
      const cjk = isCjkRecord(data);
      const styles = data.styles ?? [];
      const subsets = recordSubsets(data);
      return {
        variable: data.variable === true,
        weights,
        hasItalic: styles.includes('italic'),
        hasUpright: styles.length === 0 || styles.includes('normal'),
        google,
        cjk,
        ...(subsets ? { subsets } : {}),
        ...(own.length > 0 ? { fontsource: own } : {}),
      };
    } catch {
      return null;
    }
  })();

  metadataInFlight.set(family, promise);
  const meta = await promise;
  metadataCache.set(family, meta);
  metadataInFlight.delete(family);
  for (const cb of fontSourceListeners) cb(family);
  return meta;
}

/** The weights Fontsource lists for a family, or null when it has no record
 *  of it. The lookup `loadFont` makes, answered from its cache. */
export async function fontFamilyWeights(family: string): Promise<number[] | null> {
  return (await fetchFontMetadata(family))?.weights ?? null;
}

/**
 * Whether Fontsource has no files for `family` (#753): a generic keyword
 * or a face of an operating system (`isSystemFontFamily`), which it is
 * never asked for, or a family it answered it does not have. Its faces are
 * not worth a request per weight and style. False for a custom family, and
 * while the lookup has not answered or has failed.
 */
export function isUncataloguedFontFamily(family: string): boolean {
  if (isCustomFontFamily(family)) return false;
  return isSystemFontFamily(family) || uncatalogued.has(family);
}

/** Where the loader takes a family from. */
export type FontFamilySource = 'custom' | 'google' | 'fontsource' | 'missing';

const fontSourceListeners = new Set<(family: string) => void>();

/** Calls `cb` each time the loader learns where a family comes from (its
 *  record arrived, or the answer that no service has it). */
export function onFontSourceResolved(cb: (family: string) => void): () => void {
  fontSourceListeners.add(cb);
  return () => { fontSourceListeners.delete(cb); };
}

/**
 * Where a family comes from, as the loader resolved it (#739): `custom`
 * for a family uploaded as files; `fontsource` for one Google Fonts does
 * not have and Fontsource does (#689); `google` for any other family the
 * services know; `missing` for one neither has (a misspelt name, a system
 * font) and for a custom family whose files were removed. It names the
 * catalogue the family belongs to: the files of both are Fontsource's
 * static cuts wherever it has them (#757). Undefined while no answer has
 * come: the request is in flight or was never made. A system font is
 * `missing` from the start, no request made for it (#753).
 */
export function fontFamilySource(family: string): FontFamilySource | undefined {
  if (isCustomFontFamily(family)) return 'custom';
  if (isRemovedCustomFontFamily(family)) return 'missing';
  // Known without asking (#753).
  if (isSystemFontFamily(family)) return 'missing';
  if (!metadataCache.has(family)) return undefined;
  const meta = metadataCache.get(family);
  if (!meta) return 'missing';
  return meta.fontsource ? 'fontsource' : 'google';
}

/**
 * The Google Fonts CSS2 URL of a family the loader has no static files for
 * (#757): the whole weight axis of a variable font, as it was asked for
 * every family before, so canvas text interpolates across intermediate
 * weights.
 *
 * - Variable fonts: use `wght@{min}..{max}`, which makes Google Fonts emit a
 *   single `@font-face` with `font-weight: {min} {max}` pointing to the VF.
 *   This is the only shape the browser will interpolate across on canvas.
 * - Static fonts: request each supported weight explicitly.
 * - Unknown fonts (metadata fetch failed): fall back to the historical
 *   regular/bold pair so the font still renders.
 */
export function buildFontUrl(family: string, meta: FontMetadata | null): string {
  const name = encodeURIComponent(family);
  if (!meta) {
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
  }
  const min = Math.min(...meta.weights);
  const max = Math.max(...meta.weights);
  if (meta.variable && min < max) {
    if (meta.hasItalic) {
      return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@0,${min}..${max};1,${min}..${max}&display=swap`;
    }
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${min}..${max}&display=swap`;
  }
  const sorted = [...new Set(meta.weights)].sort((a, b) => a - b);
  if (meta.hasItalic) {
    const parts = sorted.flatMap((w) => [`0,${w}`, `1,${w}`]).join(';');
    return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${parts}&display=swap`;
  }
  const parts = sorted.join(';');
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${parts}&display=swap`;
}
