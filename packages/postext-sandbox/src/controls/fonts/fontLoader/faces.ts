// The files of a family: Fontsource's static cuts and variable instances,
// the faces a use takes, the faces that hold a text's code points and the
// sliced cuts of a family (#1276: split out of fontLoader.ts).
import { type FontVariantUse, STANDARD_FONT_VARIANTS } from 'postext';
import { fontsourceId, fontsourceCssUrl, fontsourceVersionOf, parseFontsourceCss, fontsourceUrlAt, parseUnicodeRange } from '../../../viewport/pdf/fontsourceSlices.js';
import { isGenericFontFamily } from '../systemFonts.js';
import { type FamilyFace, type FontMetadata, declarationOrder, fetchFontMetadata, buildFontUrl } from './catalogue.js';
import { getCustomFontFamily } from './customFonts.js';
import { parseFontFaceCss, faceCacheKey } from './payloads.js';
import { fetchWithin } from './requests.js';
import { matchWeight, weightSpan } from './standIns.js';

// ---------------------------------------------------------------------------
// The files of a family: Fontsource's static cuts (#757)
// ---------------------------------------------------------------------------
//
// A book is measured with the same files wherever it is laid out. A
// Cookbook pen loads Fontsource's static cuts (`cookbook/_kit/fonts.js`),
// the command line Google's static instances, and the PDF embeds a static
// cut per weight; Google's style sheet for a browser gives the variable
// file instead, whose advances between two masters are not rounded to the
// font's units, so the same book broke a few lines at another word in the
// Sandbox. The loader therefore declares, for every family Fontsource has
// as files, one face per weight, style and subset from the family's
// package, on the page and for the layout worker, and the PDF provider
// embeds from the same list.
//
// The subsets and their `unicode-range` are read from the package's own
// style sheet (one request per family: every weight and style of a family
// is cut the same way), so they always describe the files of that package;
// the weights and styles come from the Fontsource record. A family whose
// package cannot be read keeps what the loader did before: Google's style
// sheet, or the record's own files for a family Google does not serve.
//
// The files of a cut are declared as the kit declares them
// (`declarationOrder`): `latin` first, then `latin-ext`, and the script's
// own files last, the `arabic` file or the numbered slices of a Chinese or
// Japanese family. That is not the style sheet's order, which ends in
// `latin`, and it decides the few characters two files hold, which the
// file declared last answers for (CSS Fonts 4 §4.5): the ASCII letters and
// digits the numbered slices repeat, the joiners and hyphens the `arabic`
// file holds beside `latin`. Declared in the style sheet's order, a line
// that mixes scripts came out a fraction of a pixel away from the pen's
// (`bulaq-framed-page`, `gojuon-index`) and `japanese-technical-manual`
// broke a note at another character. The PDF provider and the layout
// worker take the same order from here.
//
// A cut goes to the layout worker whole, before the first build that is
// set in it (`worker/LayoutService.ts`), so its files stand there in the
// order they are declared and a chapter is laid out once. A face that
// arrives after a build is measured with all the same: the engine's worker
// makes its canvas resolve those fonts again (#760).

/** The regular face: what a specimen is set in. */
export const REGULAR_USE: readonly FontVariantUse[] = [{ weight: 400, style: 'normal' }];

/** The files a family is served as. */
interface FamilyFiles {
  /** Every face of the family, in the order it is declared. */
  faces: FamilyFace[];
  /** For a family served as static cuts, the faces of each, by
   *  `weight|style`, in the order they are declared. Unset for a family
   *  taken from Google's style sheet. */
  cuts?: Map<string, FamilyFace[]>;
  meta: FontMetadata | null;
}

function cutKey(weight: number | string, style: string): string {
  return `${weight}|${isSlanted(style) ? 'italic' : 'normal'}`;
}

export function isSlanted(style: string): boolean {
  return /italic|oblique/i.test(style);
}

/** The faces of `faces` by cut. */
function facesByCut(faces: readonly FamilyFace[]): Map<string, FamilyFace[]> {
  const out = new Map<string, FamilyFace[]>();
  for (const face of faces) {
    const key = cutKey(face.weight, face.style);
    const list = out.get(key);
    if (list) list.push(face);
    else out.set(key, [face]);
  }
  return out;
}

/**
 * Every static file of a family, from its Fontsource package: the subsets
 * of one weight's style sheet with its ranges, in the order they are
 * declared (`declarationOrder`), under each weight and style the record
 * lists (a subset the record gives no file for in a weight is left out
 * there). Null when the package's style sheet cannot be had or is not laid
 * out as expected.
 */
/** The version each family's package was answered from, by Fontsource id. */
const packageVersions = new Map<string, string>();

/** The exact version of `family`'s package its files are taken from, once
 *  its style sheet has been read; null before, and when jsDelivr did not
 *  say (#766). */
export function fontsourcePackageVersion(family: string): string | null {
  return packageVersions.get(fontsourceId(family)) ?? null;
}

async function packageFaces(family: string, meta: FontMetadata): Promise<FamilyFace[] | null> {
  const weights = [...new Set(meta.weights)].sort((a, b) => a - b);
  const styles: ('normal' | 'italic')[] = [...(meta.hasUpright ? ['normal' as const] : []), ...(meta.hasItalic ? ['italic' as const] : [])];
  if (weights.length === 0 || styles.length === 0) return null;
  const probeWeight = weights.includes(400) ? 400 : weights[0]!;
  const probeStyle = styles[0]!;
  const cssUrl = fontsourceCssUrl(family, probeWeight, probeStyle);
  let css: string | null;
  // The version of the package this style sheet came from (#766): every
  // file of the family is asked of it, not of the range.
  let version: string | null = null;
  try {
    css = await fetchWithin(cssUrl, async (res) => {
      if (!res.ok) return null;
      version = fontsourceVersionOf(res);
      return await res.text();
    }, { credentials: 'omit' });
  } catch {
    return null;
  }
  if (css === null) return null;
  if (version) packageVersions.set(fontsourceId(family), version);
  const prefix = `${fontsourceId(family)}-`;
  const suffix = `-${probeWeight}-${probeStyle}.woff2`;
  const subsets: { name: string; base: string; unicodeRange?: string }[] = [];
  for (const slice of parseFontsourceCss(css, cssUrl)) {
    const cut = slice.url.lastIndexOf('/') + 1;
    const file = slice.url.slice(cut);
    if (!file.startsWith(prefix) || !file.endsWith(suffix)) return null;
    subsets.push({
      name: file.slice(prefix.length, file.length - suffix.length),
      base: fontsourceUrlAt(slice.url.slice(0, slice.url.length - suffix.length), version),
      ...(slice.unicodeRange ? { unicodeRange: slice.unicodeRange } : {}),
    });
  }
  if (subsets.length === 0) return null;
  const ordered = declarationOrder(subsets, meta.cjk);
  const out: FamilyFace[] = [];
  for (const weight of weights) {
    for (const style of styles) {
      const listed = meta.subsets?.get(`${weight}|${style}`);
      for (const subset of ordered) {
        if (listed && !listed.has(subset.name)) continue;
        out.push({
          family,
          weight: String(weight),
          style,
          ...(subset.unicodeRange ? { unicodeRange: subset.unicodeRange } : {}),
          url: `${subset.base}-${weight}-${style}.woff2`,
        });
      }
    }
  }
  return out.length > 0 ? out : null;
}

export const familyFilesCache = new Map<string, Promise<FamilyFiles>>();
/** When a family's faces could not be had, by family. */
export const familyFacesFailedAt = new Map<string, number>();
/** How long a family that gave no faces is left alone: every build asks
 *  for its families, and a family that is nowhere would otherwise cost a
 *  failed request per keystroke. */
export const FAMILY_FACES_RETRY_MS = 30_000;
/** How long after a family's files could not be had they are asked for
 *  again. */
export const FONT_RETRY_MS = FAMILY_FACES_RETRY_MS;

/**
 * The files of a family that is not a custom one: Fontsource's static
 * cuts where its package can be read; else the record's own files, for a
 * family Google Fonts does not serve (#689); else what Google's style
 * sheet declares. No faces when they cannot be had (the request fails, the
 * family is nowhere), and asked again after a while. Never rejects: a
 * failed style sheet is one family without faces, not a build without
 * fonts (#689).
 */
export function familyFiles(family: string): Promise<FamilyFiles> {
  const cached = familyFilesCache.get(family);
  const failedAt = familyFacesFailedAt.get(family);
  if (cached && (failedAt === undefined || Date.now() - failedAt < FAMILY_FACES_RETRY_MS)) return cached;
  familyFacesFailedAt.delete(family);
  const promise = (async (): Promise<FamilyFiles> => {
    if (isGenericFontFamily(family)) return { faces: [], meta: null };
    let meta: FontMetadata | null = null;
    try {
      meta = await fetchFontMetadata(family);
      if (meta) {
        const cuts = (await packageFaces(family, meta)) ?? meta.fontsource;
        if (cuts && cuts.length > 0) return { faces: cuts, cuts: facesByCut(cuts), meta };
        // Not on Google Fonts and no file to be had: nothing to ask Google.
        if (!meta.google) return { faces: [], meta };
      }
      // Google Fonts returns woff2 only if the UA is browser-like. Normal
      // fetch from the main thread inherits the browser UA, so this is
      // fine. From a worker it would return ttf; that's why we do this on
      // the main thread. A family Google does not have answers 400 with no
      // CORS headers, which rejects.
      const sheet = await fetchWithin(buildFontUrl(family, meta), async (res) => (res.ok ? await res.text() : null), { credentials: 'omit' });
      return { faces: sheet === null ? [] : parseFontFaceCss(sheet), meta };
    } catch {
      return { faces: [], meta };
    }
  })();
  familyFilesCache.set(family, promise);
  void promise.then((files) => {
    if (files.faces.length === 0 && familyFilesCache.get(family) === promise) familyFacesFailedAt.set(family, Date.now());
  });
  return promise;
}

/**
 * Every face a family that is not a custom one is served as, in the order
 * it is declared: all its static cuts (each weight and style, in each
 * subset), or the faces of Google's style sheet for a family the loader
 * has no static files for. Empty when they cannot be had.
 */
export function fetchFamilyFaces(family: string): Promise<FamilyFace[]> {
  return familyFiles(family).then((files) => files.faces);
}

/** A weight of a variable Google family between two of its cuts (a 450),
 *  as Google's style sheet serves it: the variable file, declared at that
 *  weight alone. No static cut holds it, so it stays interpolated, as
 *  every weight was before (#757). Empty when it cannot be had. */
const instanceCache = new Map<string, Promise<FamilyFace[]>>();

function instanceFaces(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[]> {
  const key = `${family}|${weight}|${style}`;
  const cached = instanceCache.get(key);
  if (cached) return cached;
  const axis = style === 'italic' ? `ital,wght@1,${weight}` : `wght@${weight}`;
  const promise = (async (): Promise<FamilyFace[]> => {
    try {
      const sheet = await fetchWithin(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axis}&display=swap`, async (res) => (res.ok ? await res.text() : null), { credentials: 'omit' });
      if (sheet === null) return [];
      return parseFontFaceCss(sheet)
        .filter((face) => isSlanted(face.style) === (style === 'italic'))
        .map((face) => ({ ...face, family, weight: String(weight), style }));
    } catch {
      return [];
    }
  })();
  instanceCache.set(key, promise);
  void promise.then((faces) => {
    if (faces.length === 0 && instanceCache.get(key) === promise) instanceCache.delete(key);
  });
  return promise;
}

/** The style of a family's cuts that answers `style`: its italic for an
 *  italic when it has one, else its upright (which a stand-in declares as
 *  the italic, #688). */
function cutStyle(meta: FontMetadata, style: string): 'normal' | 'italic' {
  if (isSlanted(style)) return meta.hasItalic ? 'italic' : 'normal';
  return meta.hasUpright ? 'normal' : 'italic';
}

/** Whether `weight` falls between two cuts of a variable family. */
function isBetweenCuts(meta: FontMetadata, weight: number): boolean {
  return meta.google && meta.variable && !meta.weights.includes(weight)
    && weight > Math.min(...meta.weights) && weight < Math.max(...meta.weights);
}

/** The weight of `weights` nearest to `target`, the lighter of two as near. */
function nearestWeight(weights: readonly number[], target: number): number {
  const sorted = [...weights].sort((a, b) => a - b);
  return sorted.reduce((best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best), sorted[0]!);
}

/**
 * The faces that answer a weight and slant of a family served as static
 * cuts, in the order they are declared:
 *
 * - the cut of that weight and style, when the family has it;
 * - for a weight between two cuts of a variable family, Google's variable
 *   file at that weight (`instanceFaces`);
 * - else the cut CSS font matching settles on among the family's weights
 *   (a 600 of a family with a 400 and a 700 is its 700), the one a browser
 *   that holds every cut would draw.
 */
export async function facesForUse(family: string, files: FamilyFiles, use: FontVariantUse): Promise<FamilyFace[]> {
  const { meta, cuts } = files;
  if (!cuts || !meta) return files.faces;
  const style = cutStyle(meta, use.style);
  const exact = cuts.get(cutKey(use.weight, style));
  if (exact) return exact;
  if (isBetweenCuts(meta, use.weight)) {
    const instance = await instanceFaces(family, use.weight, style);
    if (instance.length > 0) return instance;
  }
  const weight = matchWeight(meta.weights.map(String), use.weight);
  return (weight !== undefined ? cuts.get(cutKey(weight, style)) : undefined) ?? [];
}

/**
 * The static files a PDF embeds for a face of `family` (#757): the cut the
 * previews measure that weight and slant with, its files in the order
 * they are declared. A weight between two cuts of a variable
 * family, which the previews interpolate and no file holds, is answered
 * with the nearest cut (the lighter of two as near). Null for a family the
 * loader has no static files for.
 */
export async function staticFaceFiles(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[] | null> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return null;
  // A family the catalogue does not have is not asked of Google for a
  // PDF: its lookup answers once, for every weight and style (#753).
  if (!(await fetchFontMetadata(family))) return null;
  const { meta, cuts } = await familyFiles(family);
  if (!cuts || !meta) return null;
  const s = cutStyle(meta, style);
  const w = meta.weights.includes(weight)
    ? weight
    : isBetweenCuts(meta, weight) ? nearestWeight(meta.weights, weight) : Number(matchWeight(meta.weights.map(String), weight));
  const faces = cuts.get(cutKey(w, s));
  return faces && faces.length > 0 ? faces : null;
}

/**
 * The files a PDF or an SVG picture embeds for a face of a family the
 * previews took from Google's style sheet because it has no static cuts
 * (#993): the sheet's faces of the cut CSS font matching settles on for the
 * weight (an exact one, a range that holds it, else the nearest), in the
 * slant asked, else the upright, in the order they are declared. Null for a
 * custom or generic family, one served as static cuts (`staticFaceFiles`)
 * and one whose sheet could not be had.
 */
export async function sheetFaceFiles(family: string, weight: number, style: 'normal' | 'italic'): Promise<FamilyFace[] | null> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return null;
  const { faces, cuts } = await familyFiles(family);
  if (cuts || faces.length === 0) return null;
  const ofSlant = (italic: boolean) => faces.filter((f) => isSlanted(f.style) === italic);
  const pool = ofSlant(style === 'italic').length > 0 ? ofSlant(style === 'italic') : ofSlant(style !== 'italic');
  if (pool.length === 0) return null;
  const spans = pool.map((f) => f.weight);
  const held = pool.filter((f) => {
    const [lo, hi] = weightSpan(f.weight);
    return weight >= lo && weight <= hi;
  });
  if (held.length > 0) return held;
  const matched = matchWeight(spans, weight);
  const picked = matched === undefined ? [] : pool.filter((f) => f.weight === matched);
  return picked.length > 0 ? picked : null;
}

/** Each unicode-range seen, as ranges from low to high that do not overlap. */
const parsedRanges = new Map<string, Array<[number, number]>>();

export function faceHolds(face: FamilyFace, cp: number): boolean {
  if (!face.unicodeRange) return true;
  let ranges = parsedRanges.get(face.unicodeRange);
  if (!ranges) {
    ranges = [];
    for (const [lo, hi] of parseUnicodeRange(face.unicodeRange).sort((a, b) => a[0] - b[0])) {
      const last = ranges[ranges.length - 1];
      if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
      else ranges.push([lo, hi]);
    }
    parsedRanges.set(face.unicodeRange, ranges);
  }
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const range = ranges[mid]!;
    if (cp < range[0]) hi = mid - 1;
    else if (cp > range[1]) lo = mid + 1;
    else return true;
  }
  return false;
}

/** For the faces of one cut, which of them answers each code point asked
 *  so far. */
const winnerMemo = new WeakMap<readonly FamilyFace[], Map<number, number>>();

/**
 * The files of one cut (`faces`, in the order they are declared) that a
 * browser draws `codePoints` from: for each, the last face declared whose
 * range holds it (CSS Fonts 4 §4.5). In the order of `faces`. With no
 * character any file holds (a face asked for before its text is known),
 * the file that holds the Latin letters, or the first one declared.
 */
export function facesForCodePoints<T extends FamilyFace>(faces: readonly T[], codePoints?: Iterable<number>): T[] {
  if (faces.length <= 1) return [...faces];
  let memo = winnerMemo.get(faces);
  if (!memo) winnerMemo.set(faces, (memo = new Map()));
  const winner = (cp: number): number => {
    let index = memo.get(cp);
    if (index === undefined) {
      index = -1;
      for (let i = faces.length - 1; i >= 0; i--) {
        if (faceHolds(faces[i]!, cp)) {
          index = i;
          break;
        }
      }
      memo.set(cp, index);
    }
    return index;
  };
  const picked = new Set<number>();
  for (const cp of codePoints ?? []) {
    if (cp < 0x20) continue;
    const index = winner(cp);
    if (index >= 0) picked.add(index);
  }
  if (picked.size === 0) return [faces[Math.max(0, winner(0x61))]!];
  return faces.filter((_, i) => picked.has(i));
}

/** A cut of more files than this is a family cut by slices (a Chinese or
 *  Japanese one: about a hundred files per weight), not by script. */
export const SLICED_CUT_FILES = 16;

/**
 * The files of `family` that answer the weights and slants of `uses`, in
 * the order they are declared: every file of each cut, whatever characters
 * a text holds (#757). With `standard`, the regular, the bold and their
 * italics too, which a text asks of a family without its configuration
 * saying so (an emphasis inside a heading, a bold in a caption), unless
 * the family is cut by slices, where a cut is some hundred files. Every
 * face of a family taken from Google's style sheet. None for a custom
 * family, whose files are its own.
 */
export async function familyCutFaces(family: string, uses: readonly FontVariantUse[], options: { standard?: boolean } = {}): Promise<FamilyFace[]> {
  if (getCustomFontFamily(family) || isGenericFontFamily(family)) return [];
  const files = await familyFiles(family);
  if (!files.cuts) return files.faces;
  let asked = uses.length > 0 ? uses : REGULAR_USE;
  if (options.standard) {
    let largest = 0;
    for (const cut of files.cuts.values()) largest = Math.max(largest, cut.length);
    if (largest <= SLICED_CUT_FILES) asked = [...asked, ...STANDARD_FONT_VARIANTS];
  }
  const out: FamilyFace[] = [];
  const seen = new Set<string>();
  for (const use of sortedUses(asked)) {
    for (const face of await facesForUse(family, files, use)) {
      const key = faceCacheKey(face);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(face);
    }
  }
  return out;
}

/** `uses` once each, from light to heavy, upright before italic. */
export function sortedUses(uses: readonly FontVariantUse[]): FontVariantUse[] {
  const seen = new Set<string>();
  return uses
    .filter((u) => {
      const key = `${u.weight}|${u.style}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.weight - b.weight || (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1));
}
