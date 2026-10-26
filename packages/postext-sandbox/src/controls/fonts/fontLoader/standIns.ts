// Stand-in faces: the file declared for a bold or an italic a family has
// no file of its own for, and their payloads (#1276: split out of
// fontLoader.ts).
import { cssWeightOrderOf, type PostextConfig, type FontContentText, configFontFaces, comicFontFamilies, STANDARD_FONT_VARIANTS, fontSampleText, type PostextContent, configFeatureFamilies, baseFontFamily } from 'postext';
import type { FontPayload } from 'postext/worker';
import { parseUnicodeRange } from '../../../viewport/pdf/fontsourceSlices.js';
import { getConfigFontFamilies } from '../fontLoader.js';
import type { FamilyFace } from './catalogue.js';
import { getCustomFontFamily } from './customFonts.js';
import { isSlanted, fetchFamilyFaces } from './faces.js';
import { loadFontSpecs } from './loading.js';
import { faceCacheKey, fetchFacePayloads, asFeaturePayloads } from './payloads.js';
import { fontProgress } from './requests.js';

// ---------------------------------------------------------------------------
// Stand-in faces: a bold or an italic the family has no file for
// ---------------------------------------------------------------------------
//
// A browser asked for the 700 of a family with one 400 file draws the 400
// heavier, and slants an upright for an italic the family lacks: letters no
// file holds, while the PDF embeds the file there is (the provider snaps to
// the nearest weight, and to the upright). The comic faces are the common
// case: a shout and a sound effect are lettered in bold, an inner voice in
// italics, in families that ship one weight (Bangers, Patrick Hand, Zen
// Antique, Dela Gothic One). The Sandbox declares the file the browser
// would have drawn from as the face asked, so the previews set the letters
// the PDF embeds, as the Cookbook kit's comics block and the command line
// do (#688). A weight another real face answers as it is (a 600 set from
// the 700) is left to the browser, and reported by the engine (#650).

/** The weights the heaviest cut of a family with no bold stands in for:
 *  the ones a browser makes bold from a face of 500 or less. */
const BOLD_STAND_IN = '600 900';

/** A weight descriptor (`'400'`, `'bold'`, `'100 900'`) as a range. */
export function weightSpan(weight: string): [number, number] {
  const parts = weight.trim().split(/\s+/).map((w) => (w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w)));
  const lo = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const hi = Number.isFinite(parts[1]) ? parts[1]! : lo;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The weight descriptor CSS font matching settles on for `target` among
 *  `weights` (the engine's `cssWeightOrderOf`: CSS Fonts 4, §5.2). */
export function matchWeight(weights: readonly string[], target: number): string | undefined {
  return cssWeightOrderOf(target, [...new Set(weights)], weightSpan)[0];
}

/**
 * The faces to declare beside a family's own (`own`: every file of the
 * family, with its weight, slant and range), each the copy of one of them
 * under another weight or slant:
 *
 * - in each slant, the heaviest cut for 600 to 900 when that cut is 500 or
 *   lighter (the weights a browser would make bold from it);
 * - for a family with no italic, the upright cut each weight of `italics`
 *   (the italics a build asks of the family) is matched to, as an italic.
 *
 * A family with a bold and an italic of its own gets none.
 */
export function standInFaces<T extends { weight: string; style: string }>(own: readonly T[], italics: readonly number[] = []): T[] {
  const upright = own.filter((f) => !isSlanted(f.style));
  const slanted = own.filter((f) => isSlanted(f.style));
  const bold = (pool: readonly T[]): T[] => {
    if (pool.length === 0) return [];
    const top = Math.max(...pool.map((f) => weightSpan(f.weight)[1]));
    if (top > 500) return [];
    return pool.filter((f) => weightSpan(f.weight)[1] === top).map((f) => ({ ...f, weight: BOLD_STAND_IN }));
  };
  const uprightBold = bold(upright);
  const out = [...uprightBold, ...bold(slanted)];
  if (slanted.length === 0 && italics.length > 0) {
    const pool = [...upright, ...uprightBold];
    const weights = pool.map((f) => f.weight);
    const cuts = new Set<string>();
    for (const weight of italics) {
      const cut = matchWeight(weights, weight);
      if (cut !== undefined) cuts.add(cut);
    }
    for (const f of pool) if (cuts.has(f.weight)) out.push({ ...f, style: 'italic' });
  }
  return out;
}

/**
 * The italics a build may ask of each family, by weight: the ones the
 * configuration sets (the engine's `configFontFaces`: the body's emphasis,
 * a style set in italics, code), and the regular and bold italics of the
 * faces comic pages are lettered in (an inner voice is set in italics,
 * emphasis in bold italics). A bold needs no asking: its stand-in follows
 * from the family's faces alone.
 */
export function askedItalics(config: PostextConfig, markdown?: FontContentText): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const add = (family: string, weight: number): void => {
    const list = out.get(family);
    if (!list) out.set(family, [weight]);
    else if (!list.includes(weight)) list.push(weight);
  };
  for (const f of configFontFaces(config, markdown)) if (f.style === 'italic') add(f.family, f.weight);
  for (const family of comicFontFamilies(config, markdown)) {
    for (const v of STANDARD_FONT_VARIANTS) if (v.style === 'italic') add(family, v.weight);
  }
  return out;
}

/** The stand-in faces of a family that is not a custom one, for the
 *  italics asked of it; none when its faces cannot be had. A custom
 *  family keeps what its author uploaded (and its own check, *Missing
 *  font variant*). */
async function familyStandIns(family: string, italics: readonly number[] | undefined): Promise<FamilyFace[]> {
  if (getCustomFontFamily(family)) return [];
  return standInFaces(await fetchFamilyFaces(family), italics);
}

/** `FontFace`s the Sandbox declared itself (the faces of a Fontsource
 *  family, the stand-ins), by face key. */
const declaredFaces = new Set<string>();

/** Declare `faces` in `document.fonts`, each once; they load when a text
 *  or a `load` asks for them. Returns the ones added. */
export function declareFaces(faces: readonly FamilyFace[]): FamilyFace[] {
  const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (typeof document === 'undefined' || !document.fonts || !FontFaceCtor) return [];
  const added: FamilyFace[] = [];
  for (const face of faces) {
    const key = faceCacheKey(face);
    if (declaredFaces.has(key)) continue;
    declaredFaces.add(key);
    try {
      const declared = new FontFaceCtor(face.family, `url(${JSON.stringify(face.url)}) format('woff2')`, {
        weight: face.weight,
        style: face.style,
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
      });
      document.fonts.add(declared);
      // A face of the page that loads is a font file that arrived (#757):
      // the page takes its files over the same line as the loader's
      // requests, which are alive while it does.
      void (declared as { loaded?: Promise<unknown> }).loaded?.then(fontProgress, () => {});
      added.push(face);
    } catch (err) {
      console.warn('[postext-sandbox] failed to declare font face', face.family, face.weight, face.style, err);
    }
  }
  return added;
}

/** Family and the italics asked of it: what a family's stand-ins were
 *  declared for. */
function standInKey(family: string, italics: readonly number[] | undefined): string {
  return `${family}|${[...(italics ?? [])].sort((a, b) => a - b).join(',')}`;
}

/** The keys whose stand-ins are declared on the page (or were tried). */
const settledStandIns = new Set<string>();
const standInDeclarations = new Map<string, Promise<boolean>>();

function standInKeys(config: PostextConfig, markdown?: FontContentText): { family: string; italics: number[] | undefined; key: string }[] {
  const italics = askedItalics(config, markdown);
  return getConfigFontFamilies(config, markdown)
    .filter((family) => !getCustomFontFamily(family))
    .map((family) => ({ family, italics: italics.get(family), key: standInKey(family, italics.get(family)) }));
}

/** Whether the stand-ins of every family of a config are declared on the
 *  page: nothing left for `declareStandIns` to do. */
export function standInsSettled(config: PostextConfig, markdown?: FontContentText): boolean {
  if (typeof document === 'undefined' || !document.fonts || typeof (globalThis as { FontFace?: unknown }).FontFace === 'undefined') return true;
  return standInKeys(config, markdown).every(({ key }) => settledStandIns.has(key));
}

/**
 * Declare on the page the stand-in faces of every family a config sets
 * text in, and load them for the characters of the document, so the canvas
 * paints a bold or an italic the family lacks with the family's own
 * letters. Once per family and set of italics asked. Resolves to whether
 * any face was added (the previews paint again then).
 */
export async function declareStandIns(config: PostextConfig, markdown?: FontContentText): Promise<boolean> {
  if (standInsSettled(config, markdown)) return false;
  const sample = fontSampleText(markdown, config);
  const results = await Promise.all(standInKeys(config, markdown).map(({ family, italics, key }) => {
    if (settledStandIns.has(key)) return false;
    let declaration = standInDeclarations.get(key);
    if (!declaration) {
      declaration = (async (): Promise<boolean> => {
        const added = declareFaces(await familyStandIns(family, italics).catch((): FamilyFace[] => []));
        // One load per weight and slant brings in the files that hold
        // the document's characters.
        const specs = [...new Set(added.map((f) => `${isSlanted(f.style) ? 'italic ' : ''}${weightSpan(f.weight)[0]} 16px "${family}"`))];
        await loadFontSpecs(specs, sample);
        return added.length > 0;
      })().finally(() => {
        settledStandIns.add(key);
        standInDeclarations.delete(key);
      });
      standInDeclarations.set(key, declaration);
    }
    return declaration;
  }));
  return results.some(Boolean);
}

/** A unicode-range holds one of `codePoints`. */
function rangeHolds(unicodeRange: string | undefined, codePoints: ReadonlySet<number>): boolean {
  if (!unicodeRange) return true;
  const ranges = parseUnicodeRange(unicodeRange);
  for (const cp of codePoints) for (const [lo, hi] of ranges) if (cp >= lo && cp <= hi) return true;
  return false;
}

/**
 * The stand-in faces of a build as worker payloads: for every family the
 * config sets text in, the files of its stand-ins that hold a character
 * of the document (a Japanese display face comes as some 120 slices, and a
 * page uses a handful), leaving out the faces of `sent` (face keys, as
 * {@link fontPayloadKey} gives them). The worker registers them after the
 * family's own faces.
 */
export async function collectStandInPayloads(
  config: PostextConfig,
  content: PostextContent | FontContentText,
  sent?: ReadonlySet<string>,
): Promise<FontPayload[]> {
  const markdown = content !== undefined && typeof content === 'object' && !Array.isArray(content) ? (content as PostextContent).markdown : content as FontContentText;
  const italics = askedItalics(config, markdown);
  let codePoints: Set<number> | undefined;
  // A feature family (a style's figures, #1237) takes its base family's
  // stand-ins, under its name with its features.
  const features = configFeatureFamilies(config);
  const out: FontPayload[] = [];
  for (const family of getConfigFontFamilies(config, markdown)) {
    const all = await familyStandIns(family, italics.get(family)).catch((): FamilyFace[] => []);
    if (all.length === 0) continue;
    if (!codePoints) {
      codePoints = new Set<number>();
      for (const ch of fontSampleText(content, config)) codePoints.add(ch.codePointAt(0)!);
    }
    const held = all.filter((face) => rangeHolds(face.unicodeRange, codePoints!));
    const own = held.filter((face) => !sent?.has(faceCacheKey(face)));
    if (own.length > 0) out.push(...await fetchFacePayloads(own));
    for (const feature of features) {
      if (baseFontFamily(feature).toLowerCase() !== family.toLowerCase()) continue;
      const twins = held.filter((face) => !sent?.has(faceCacheKey({ ...face, family: feature })));
      if (twins.length > 0) out.push(...asFeaturePayloads(feature, await fetchFacePayloads(twins)));
    }
  }
  return out;
}

/** The key of a payload's face: family, weight, style and range. */
export function fontPayloadKey(payload: Pick<FontPayload, 'family' | 'weight' | 'style' | 'unicodeRange'>): string {
  return faceCacheKey(payload);
}
