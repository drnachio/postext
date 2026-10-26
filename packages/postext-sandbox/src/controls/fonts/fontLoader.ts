import { collectFontUsage, hasLatinEmphasis, STANDARD_FONT_VARIANTS, setFigureStyleFamilies, type PostextConfig, type FontContentText, configFontFamilies, baseFontFamily, type FontUsageDocument, type FontVariantUse, type CustomFontFamily, fontFallbackOf, hasOwnStyle, markdownHasComics, isJapaneseLanguage, chineseScriptOf, type VerticalAlternatesFace, unregisterVerticalAlternates, loadVerticalAlternates } from 'postext';
import { takesFigureFeatures, isSystemFontFamily } from './systemFonts.js';
import { metadataCache } from './fontLoader/catalogue.js';
import { getCustomFontFamily, familySignature, loadVariantBuffer } from './fontLoader/customFonts.js';
import { sortedUses, REGULAR_USE, familyCutFaces, fetchFamilyFaces } from './fontLoader/faces.js';
import { configFontUses } from './fontLoader/loading.js';
import { standInFaces, askedItalics } from './fontLoader/standIns.js';

export { FONT_STALL_MS, unansweredFontRequests, fontRequestsUnanswered, fontLoaderState } from './fontLoader/requests.js';
export { fontFamilyWeights, isUncataloguedFontFamily, onFontSourceResolved, fontFamilySource } from './fontLoader/catalogue.js';
export type { FamilyFace, FontFamilySource } from './fontLoader/catalogue.js';
export { fontsourcePackageVersion, FONT_RETRY_MS, fetchFamilyFaces, staticFaceFiles, sheetFaceFiles, facesForCodePoints, familyCutFaces } from './fontLoader/faces.js';
export { configFontUses, loadFont, loadFacesForText, preloadConfigFonts, getConfigFontSpecs, configFontSampleText, missingConfigFontSpecs, ensureConfigFontsLoaded, createFontGate } from './fontLoader/loading.js';
export type { FontGate } from './fontLoader/loading.js';
export { fetchFacePayloads, collectFontPayloadsForConfig, collectFontPayloadsForFaces, asFeaturePayloads, collectFontPayloadsForFamilies } from './fontLoader/payloads.js';
export { standInFaces, askedItalics, standInsSettled, declareStandIns, collectStandInPayloads, fontPayloadKey } from './fontLoader/standIns.js';
export { setCustomFonts, declareEditionFonts, customFontsSignature, getCustomFontFamily, listCustomFontFamilies, isCustomFontFamily, isRemovedCustomFontFamily, onCustomFontsChanged } from './fontLoader/customFonts.js';

// What a configuration asks of its faces lives in the engine, shared with
// the CLI; re-exported here for the Sandbox's own callers.
export { collectFontUsage, hasLatinEmphasis, STANDARD_FONT_VARIANTS };

// A style's figures (#1237) leave a face only the system has as it is: no
// file declares it again with the features. The layout worker says the
// same (`worker/layout.worker.ts`).
setFigureStyleFamilies((family) => takesFigureFeatures(family, typeof document !== 'undefined' ? document.fonts : undefined));

/**
 * Every family a configuration sets text in whose files the Sandbox loads:
 * the engine's `configFontFamilies`, a feature family (a style's figures,
 * #1237, `Lora@onum`) as its base family. The feature families are kept in
 * `configFontUses`, whose faces are declared from the base family's files
 * ({@link loadFont}).
 */
export function getConfigFontFamilies(config: PostextConfig, markdown?: FontContentText): string[] {
  return [...new Set(configFontFamilies(config, markdown).map(baseFontFamily))];
}
export type { FontContentText, FontUsageDocument, FontVariantUse };

/** Resolve which of the standard specs (400/700 × normal/italic) are not
 *  covered by this family's variants. Returns an empty array if every spec
 *  has a matching variant (exact weight + style). */
/** Returns true only when we've conclusively tried and failed to fetch
 *  metadata for `family` from Fontsource (so we know it's not a Google
 *  Font). Returns false while the lookup is pending or not yet started.
 *  A system font is known not to be one without a lookup (#753). */
export function isKnownUnavailableGoogleFont(family: string): boolean {
  if (isSystemFontFamily(family)) return true;
  return metadataCache.has(family) && metadataCache.get(family) === null;
}

export function missingStandardVariants(
  family: CustomFontFamily,
): Array<{ weight: number; style: 'normal' | 'italic' }> {
  return missingVariants(family, STANDARD_FONT_VARIANTS);
}

function missingVariants(family: CustomFontFamily, wanted: readonly FontVariantUse[]): FontVariantUse[] {
  const have = new Set(family.variants.map((v) => `${v.weight}|${v.style}`));
  const seen = new Set<string>();
  const out: FontVariantUse[] = [];
  const stands = fontFallbackOf([family], family.name) !== undefined;
  for (const w of wanted) {
    const key = `${w.weight}|${w.style}`;
    // A slant the fallback sets (#978) is not missing.
    if (stands && !hasOwnStyle(family.variants, w.style)) continue;
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** The variants `config` (and the text `doc` describes) asks of a
 *  declared custom family that it has no file for — bold or italic set in
 *  a family that only carries a regular face, a weight no face covers. */
export function missingUsedVariants(family: CustomFontFamily, config: PostextConfig, doc?: FontUsageDocument): FontVariantUse[] {
  const wanted = collectFontUsage(config, doc).get(family.name) ?? [];
  return missingVariants(family, wanted);
}

// ---------------------------------------------------------------------------
// Vertical forms for vertical text (canvas)
// ---------------------------------------------------------------------------

/** Whether a config sets any text vertically (`layout.writingMode`, or a
 *  heading style's own layout). */
export function configIsVertical(config: PostextConfig, markdown?: FontContentText): boolean {
  if (config.layout?.writingMode === 'vertical-rl') return true;
  if ((config.headingStyles ?? []).some((s) => s.layout?.writingMode === 'vertical-rl')) return true;
  // Comic balloons of Japanese and Traditional Chinese are lettered in
  // columns (`comics.lettering.writingMode: 'auto'`).
  if (!config.comics && !markdownHasComics(markdown)) return false;
  const mode = config.comics?.lettering?.writingMode;
  if (mode === 'vertical') return true;
  if (mode === 'horizontal') return false;
  const tag = config.locale ?? config.bodyText?.hyphenation?.locale;
  return isJapaneseLanguage(tag) || chineseScriptOf(tag) === 'Hant';
}

/** The twin load of each family, keyed by where its faces come from
 *  ({@link twinSourceKey}): a family whose sources change is loaded again. */
const verticalTwins = new Map<string, { key: string; promise: Promise<boolean> }>();
/** Per family, the source key whose twin load has settled. */
const verticalTwinsDone = new Map<string, string>();

const CATALOGUE_TWIN = 'google:';

/** Where a family's faces come from: the files of a custom family (a file
 *  uploaded again under the same name is another source), else the
 *  catalogue, with the weights and slants asked of it (each is a file of
 *  its own, #757). */
function twinSourceKey(family: string, uses: readonly FontVariantUse[] | undefined): string {
  const custom = getCustomFontFamily(family);
  if (custom) return `custom:${familySignature(custom)}`;
  return `${CATALOGUE_TWIN}${sortedUses(uses ?? REGULAR_USE).map((u) => `${u.weight}${u.style === 'italic' ? 'i' : ''}`).join(',')}`;
}

export async function verticalFacesOf(family: string, uses: readonly FontVariantUse[] | undefined, italics?: readonly number[]): Promise<VerticalAlternatesFace[]> {
  const custom = getCustomFontFamily(family);
  if (custom) {
    const faces: VerticalAlternatesFace[] = [];
    await Promise.all(custom.variants.map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (buffer) faces.push({ source: buffer, weight: String(variant.weight), style: variant.style });
    }));
    return faces;
  }
  // The cuts the book is set in, and the stand-ins too (#688): a shout
  // lettered in columns is set in the bold the family's own file answers
  // for.
  const own = await familyCutFaces(family, uses ?? REGULAR_USE);
  const standIns = standInFaces(await fetchFamilyFaces(family), italics);
  return [...own, ...standIns].map((face) => ({
    source: face.url,
    weight: face.weight,
    style: face.style,
    ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
  }));
}

/**
 * For a config that sets text vertically: load, for every family it uses, a
 * twin with the font's vertical forms (OpenType `vert`) that the canvas
 * paints brackets and punctuation with (see `loadVerticalAlternates` in
 * postext). Once per family and set of faces asked of it; resolves when
 * every family is settled, to whether any family has its twin (the preview
 * repaints then).
 */
export async function loadVerticalTwins(config: PostextConfig, markdown?: FontContentText): Promise<boolean> {
  if (typeof document === 'undefined' || !configIsVertical(config, markdown)) return false;
  const italics = askedItalics(config, markdown);
  const uses = configFontUses(config, markdown);
  const results = await Promise.all(getConfigFontFamilies(config, markdown).map((family) => {
    const key = twinSourceKey(family, uses.get(family));
    const entry = verticalTwins.get(family);
    if (entry && entry.key === key) return entry.promise;
    // A catalogue family asked for another weight or slant: its files
    // join the twin there is.
    const joins = entry !== undefined && entry.key.startsWith(CATALOGUE_TWIN) && key.startsWith(CATALOGUE_TWIN);
    // New sources for a family (a custom font uploaded again, or a book
    // whose font of that name is another file): the old twin's faces go,
    // and the twin is loaded from the new ones.
    if (entry && !joins) {
      unregisterVerticalAlternates(family);
      verticalTwinsDone.delete(family);
    }
    const before = joins ? entry.promise.catch(() => false) : Promise.resolve(false);
    const promise = before
      .then(() => verticalFacesOf(family, uses.get(family), italics.get(family)))
      .then((faces) => loadVerticalAlternates(family, faces))
      .catch(() => false)
      .then((ok) => {
        if (verticalTwins.get(family)?.key === key) verticalTwinsDone.set(family, key);
        return ok;
      });
    verticalTwins.set(family, { key, promise });
    return promise;
  }));
  return results.some(Boolean);
}

/** Whether every family of a vertical config has had its twin tried, from
 *  the family's current sources. */
export function verticalTwinsSettled(config: PostextConfig, markdown?: FontContentText): boolean {
  if (!configIsVertical(config, markdown)) return true;
  const uses = configFontUses(config, markdown);
  return getConfigFontFamilies(config, markdown).every((f) => verticalTwinsDone.get(f) === twinSourceKey(f, uses.get(f)));
}
