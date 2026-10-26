// Loading a configuration's faces into the document: the uses it asks for,
// style sheets and feature families, loadFont, preloading, the missing
// config fonts and the font gate (#1276: split out of fontLoader.ts).
import { type PostextConfig, type FontVariantUse, resolveBodyTextConfig, resolveHeadingsConfig, resolveUnorderedListsConfig, resolveOrderedListsConfig, resolveHeaderFooterConfig, collectFontUsage, type FontContentText, configFontFaces, primaryFontFamily, comicFontFamilies, STANDARD_FONT_VARIANTS, addFeatureFaces, baseFontFamily, featureFamilyParts, localeScript, prepareFonts } from 'postext';
import { isGenericFontFamily } from '../systemFonts.js';
import { getConfigFontFamilies, verticalFacesOf } from '../fontLoader.js';
import { type FontMetadata, buildFontUrl } from './catalogue.js';
import { getCustomFontFamily, declareFallbackFaces, loadCustomFontFamily } from './customFonts.js';
import { REGULAR_USE, sortedUses, familyFiles, facesForUse, isSlanted, SLICED_CUT_FILES } from './faces.js';
import { facePayloadCache } from './payloads.js';
import { FONT_LOAD_TIMEOUT_MS } from './requests.js';
import { declareFaces, weightSpan, standInsSettled, declareStandIns } from './standIns.js';

export const loadedFonts = new Set<string>();
export const loadingPromises = new Map<string, Promise<void>>();

/**
 * The faces the built-in designs are set in where a configuration leaves
 * them as they are: the headings and their levels, the lists, the running
 * heads and folios (Open Sans at 600 when no `header` or `footer` is
 * given). The engine's `collectFontUsage` resolves the headings (#1047)
 * but reads the rest of the configuration as written, so it does not see
 * the others; a face a build is set in must be with the layout worker
 * before it starts (#757).
 */
function defaultFontUses(config: PostextConfig): Map<string, FontVariantUse[]> {
  try {
    const body = resolveBodyTextConfig(config.bodyText, config.locale);
    const resolved = {
      headings: resolveHeadingsConfig(config.headings),
      unorderedLists: resolveUnorderedListsConfig(config.unorderedLists, body),
      orderedLists: resolveOrderedListsConfig(config.orderedLists, body, config.locale),
      header: resolveHeaderFooterConfig(config.header, 'header'),
      footer: resolveHeaderFooterConfig(config.footer, 'footer'),
    };
    // The same reading of a node that names a family, on the resolved parts.
    return collectFontUsage(resolved as unknown as PostextConfig);
  } catch {
    return new Map();
  }
}

/** The weights and slants a configuration and its text ask of each family:
 *  the engine's `configFontFaces`, the faces of the built-in designs it
 *  leaves as they are (`defaultFontUses`), and the regular, the bold and
 *  their italics of the faces comic pages are lettered in. A family it
 *  names with no use is asked for its regular face. */
export function configFontUses(config: PostextConfig, markdown?: FontContentText): Map<string, FontVariantUse[]> {
  const out = new Map<string, FontVariantUse[]>();
  for (const family of getConfigFontFamilies(config, markdown)) out.set(family, []);
  const add = (family: string, use: FontVariantUse): void => {
    const list = out.get(family);
    if (list) list.push({ weight: use.weight, style: use.style });
    else out.set(family, [{ weight: use.weight, style: use.style }]);
  };
  for (const face of configFontFaces(config, markdown)) add(face.family, face);
  for (const [family, uses] of defaultFontUses(config)) {
    const name = primaryFontFamily(family);
    // Only the families the configuration sets text in.
    if (out.has(name)) for (const use of uses) add(name, use);
  }
  // The faces comic pages are lettered in: a shout is set in bold, an
  // inner voice in italics, a line's emphasis in either, whatever the
  // styles say. A face with no bold (the default sound-effect faces) is
  // only asked; the engine sets it at 400 (#1047).
  for (const family of comicFontFamilies(config, markdown)) {
    for (const use of STANDARD_FONT_VARIANTS) add(family, use);
  }
  for (const [family, uses] of out) out.set(family, uses.length === 0 ? [...REGULAR_USE] : sortedUses(uses));
  return out;
}

/** Families whose Google style sheet is in the page, by family. */
const sheetLoads = new Map<string, Promise<void>>();

/** Google's style sheet of a family the loader has no static files for,
 *  added to the page once, and its faces loaded. */
function loadStyleSheet(font: string, meta: FontMetadata | null): Promise<void> {
  const existing = sheetLoads.get(font);
  if (existing) return existing;
  const promise = (async () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = buildFontUrl(font, meta);
    const linkLoaded = new Promise<void>((resolve) => {
      link.onload = () => resolve();
      link.onerror = () => resolve();
    });
    document.head.appendChild(link);

    // The stylesheet must be parsed before document.fonts sees the faces;
    // waiting on document.fonts.ready alone can resolve prematurely.
    await Promise.race([
      linkLoaded,
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);

    // Explicitly request each variant so document.fonts tracks them as pending
    const weights = meta?.weights?.length ? meta.weights : [400, 700];
    const quoted = `"${font}"`;
    const specs = meta?.hasItalic
      ? weights.flatMap((w) => [`${w} 16px ${quoted}`, `italic ${w} 16px ${quoted}`])
      : weights.map((w) => `${w} 16px ${quoted}`);
    await Promise.race([
      Promise.all(specs.map((spec) => document.fonts.load(spec).catch(() => []))),
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);

    await Promise.race([
      document.fonts.ready,
      new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
    ]);
  })();
  sheetLoads.set(font, promise);
  return promise;
}

/** A weight and slant of a family, declared on the page and loaded. */
function loadUse(font: string, use: FontVariantUse): Promise<void> {
  const key = `${font}|${use.weight}|${use.style}`;
  if (loadedFonts.has(key)) return Promise.resolve();
  const existing = loadingPromises.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const files = await familyFiles(font);
    // Another book's custom family of this name came in meanwhile.
    if (getCustomFontFamily(font)) return;
    if (files.cuts) {
      // The static cut of the face (#757): its files are declared, and
      // the one that holds a space and the Latin letters loaded, as a
      // style sheet's were. The previews load the rest for their text.
      const faces = await facesForUse(font, files, use);
      declareFaces(faces);
      const first = faces[0];
      if (first) await loadFontSpecs([`${isSlanted(first.style) ? 'italic ' : ''}${weightSpan(first.weight)[0]} 16px "${font}"`], ' ');
    } else {
      // No static files (#757): Google's style sheet, as before.
      await loadStyleSheet(font, files.meta);
    }
    loadedFonts.add(key);
  })().finally(() => {
    loadingPromises.delete(key);
  });
  loadingPromises.set(key, promise);
  return promise;
}

/** The feature families (#1237) declared on the page, by the family and
 *  the faces asked of it, and the faces declared for each. */
const featureLoads = new Map<string, Promise<void>>();
const featureFaces = new Map<string, FontFace[]>();

/**
 * Declare on the page the faces of a feature family (a style's figures,
 * #1237, `Lora@onum`) and load the ones that hold a space: its base
 * family's files of the cuts `uses` asks for and their stand-ins (those
 * of a custom family whole), declared again under its name with the
 * features' `featureSettings`, the descriptor the canvas sets the figures
 * with. The base family is loaded first, as any family is; each file is
 * declared once (the engine's `addFeatureFaces`).
 */
function loadFeatureFamily(font: string, base: string, uses: readonly FontVariantUse[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts || isGenericFontFamily(base)) return Promise.resolve();
  const asked = uses.length > 0 ? sortedUses(uses) : REGULAR_USE;
  const key = `${font}|${asked.map((u) => `${u.weight}${u.style}`).join(',')}`;
  const known = featureLoads.get(key);
  if (known) return known;
  const promise = (async () => {
    await loadFont(base, asked);
    const files = await verticalFacesOf(base, asked);
    const added = addFeatureFaces(document.fonts, font, files.map((f) => ({
      source: typeof f.source === 'string' ? `url(${JSON.stringify(f.source)})` : f.source,
      descriptors: {
        ...(f.weight ? { weight: f.weight } : {}),
        ...(f.style ? { style: f.style } : {}),
        ...(f.unicodeRange ? { unicodeRange: f.unicodeRange } : {}),
      },
    })));
    const own = featureFaces.get(font);
    if (own) own.push(...(added as FontFace[]));
    else featureFaces.set(font, [...(added as FontFace[])]);
    await loadFontSpecs(asked.map((use) => `${use.style === 'italic' ? 'italic ' : ''}${use.weight} 16px "${font}"`), ' ');
  })().catch(() => {
    featureLoads.delete(key);
  });
  featureLoads.set(key, promise);
  return promise;
}

/** Take off the page the feature families of `families` (their faces were
 *  made from files that changed), so the next load declares them anew. */
export function forgetFeatureFamilies(families: readonly string[]): void {
  const bases = new Set(families.map((f) => f.toLowerCase()));
  for (const [font, faces] of [...featureFaces]) {
    if (!bases.has(baseFontFamily(font).toLowerCase())) continue;
    if (typeof document !== 'undefined' && document.fonts) {
      for (const ff of faces) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    featureFaces.delete(font);
    facePayloadCache.delete(font);
    for (const key of [...featureLoads.keys()]) if (key.startsWith(`${font}|`)) featureLoads.delete(key);
  }
}

/**
 * Declare a family's faces on the page and load them: the files of a
 * custom family, else Fontsource's static cuts of the weights and slants
 * asked (`uses`; the regular face when none is given, what a specimen is
 * set in), else Google's style sheet for a family the loader has no static
 * files for. Each face is declared once; the promise resolves when the
 * faces asked have loaded or failed.
 */
export function loadFont(font: string, uses: readonly FontVariantUse[] = REGULAR_USE): Promise<void> {
  const parts = featureFamilyParts(font);
  if (parts.features.length > 0) return loadFeatureFamily(font, parts.family, uses);
  const custom = getCustomFontFamily(font);
  if (custom) {
    // The faces it has no file of come from its fallback family (#978);
    // asked on every call, as a later call may name a weight not declared.
    const stand = (): Promise<void> => (custom.fallback ? declareFallbackFaces(custom, uses) : Promise.resolve());
    if (loadedFonts.has(font)) return stand();
    const existing = loadingPromises.get(font);
    if (existing) return existing.then(stand);
    const promise = loadCustomFontFamily(custom).then(() => {
      loadedFonts.add(font);
      loadingPromises.delete(font);
    });
    loadingPromises.set(font, promise);
    return promise.then(stand);
  }

  // A generic keyword names no face: no style sheet to add, nothing to
  // wait for (#753).
  if (isGenericFontFamily(font)) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();

  return Promise.all((uses.length > 0 ? uses : REGULAR_USE).map((use) => loadUse(font, use))).then(() => {});
}

/**
 * Declare on the page the faces the pages of a laid-out document name
 * (`uses`, by family) and load them for the characters the document sets
 * (`text`), as the wait before a build does for the faces its
 * configuration asks for (#770). `loadFont` loads the file of a cut that
 * holds a space, the Latin one; a cut the pages alone name had its other
 * files (Arabic, Greek, Cyrillic, Latin Extended) fetched by the first
 * paint, which set that text in a fallback face meanwhile: the summaries
 * of the Arabic guide's contents, in Amiri italic at 39.58 px, were painted
 * in the system's Arabic face, «والصفحة» 121.44 px wide in the 111.02 px
 * the layout gave it. A family cut by slices (some hundred files per cut)
 * is left to the page, which fetches the slices its text needs as it
 * paints. Resolves when the faces have loaded, failed or outlasted the
 * timeout.
 */
export async function loadFacesForText(uses: Iterable<readonly [string, readonly FontVariantUse[]]>, text: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([...uses].map(async ([family, list]) => {
    // A feature family (#1237) is its base family's files.
    const base = baseFontFamily(family);
    if (list.length === 0 || isGenericFontFamily(base)) return;
    if (getCustomFontFamily(base)) {
      if (base !== family) await loadFont(family, list);
      return;
    }
    await loadFont(family, list);
    const { cuts } = await familyFiles(base);
    if (cuts) {
      let largest = 0;
      for (const cut of cuts.values()) largest = Math.max(largest, cut.length);
      if (largest > SLICED_CUT_FILES) return;
    }
    await loadFontSpecs(sortedUses(list).map((use) => `${use.style === 'italic' ? 'italic ' : ''}${use.weight} 16px "${family}"`), text);
  }));
}

/** Declare and load the faces a configuration asks of each of its
 *  families (`configFontUses`). */
export function preloadConfigFonts(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  const promises = [...configFontUses(config, markdown)].map(([family, uses]) => loadFont(family, uses));
  return Promise.all(promises).then(() => {});
}

/**
 * Font-spec strings (for `document.fonts.check/load`) covering every
 * family × weight × style combination a build might hit. Size is fixed at
 * 16px because the check is per-face — the actual render size doesn't
 * affect whether a matching face is loaded.
 */
export function getConfigFontSpecs(config: PostextConfig, markdown?: FontContentText): string[] {
  const specs = new Set<string>();
  const push = (family: string) => {
    const q = `"${family}"`;
    specs.add(`400 16px ${q}`);
    specs.add(`700 16px ${q}`);
    specs.add(`italic 400 16px ${q}`);
    specs.add(`italic 700 16px ${q}`);
  };
  for (const f of getConfigFontFamilies(config, markdown)) push(f);
  return [...specs];
}

/**
 * The characters a face must have loaded before a build measures with it,
 * for `document.fonts.check/load`. A Google family comes as one file per
 * script (`latin`, `arabic`… each with its `unicode-range`), and the
 * browser fetches a file only when text needs it: checked with a space
 * alone, an Arabic book would pass with only the Latin file in, measure its
 * first build with a fallback face, and lay out again when the Arabic file
 * lands. A document in a language written in the Arabic script asks for an
 * Arabic letter and digit too. (Chinese faces come in about a hundred
 * slices, fetched as the text needs them; the `loadingdone` rebuild covers
 * those.)
 */
export function configFontSampleText(config: PostextConfig): string {
  const tag = config.locale ?? config.bodyText?.hyphenation?.locale;
  return tag !== undefined && localeScript(tag) === 'Arab' ? ' \u0628\u0661' : ' ';
}

/** The specs of `getConfigFontSpecs` not loaded yet for the document's
 *  text (`configFontSampleText`). */
export function missingConfigFontSpecs(config: PostextConfig, markdown?: FontContentText): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  const text = configFontSampleText(config);
  return getConfigFontSpecs(config, markdown).filter((s) => !document.fonts.check(s, text));
}

/** `document.fonts.load` for each spec, given up after the timeout; a
 *  face that fails to load counts as tried. */
export async function loadFontSpecs(specs: readonly string[], text: string): Promise<void> {
  if (specs.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, text).catch(() => []))),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}

/**
 * Ensure every face the given config will render is actually available to
 * `CanvasRenderingContext2D.measureText`. Resolves once all faces pass
 * `document.fonts.check`, or after the timeout. Safe to call repeatedly.
 */
export function ensureConfigFontsLoaded(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  // The stand-ins first (#688): once declared they are faces the check
  // below names and the loads that follow bring in.
  if (!standInsSettled(config, markdown)) {
    // Given up after the timeout, like a face that does not load: the
    // previews declare what is left when they look again.
    let timer: ReturnType<typeof setTimeout> | undefined;
    return Promise.race([
      declareStandIns(config, markdown).catch(() => false),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, FONT_LOAD_TIMEOUT_MS);
      }),
    ]).then(() => {
      if (timer !== undefined) clearTimeout(timer);
      return loadMissingConfigFonts(config, markdown);
    });
  }
  return loadMissingConfigFonts(config, markdown);
}

function loadMissingConfigFonts(config: PostextConfig, markdown?: FontContentText): Promise<void> {
  const missing = missingConfigFontSpecs(config, markdown);
  if (missing.length === 0) return Promise.resolve();
  // The engine's preparation (#629): every face the configuration asks
  // for, loaded for the characters the text sets (so the Arabic, Greek or
  // CJK slices of a family come in before the first build), the
  // measurements of the families that changed dropped. A face not
  // declared yet gets its static cut, or the family its style sheet
  // (`loadFont`), and is loaded from it.
  return prepareFonts(markdown, config, {
    timeoutMs: FONT_LOAD_TIMEOUT_MS,
    resolve: async (family, weight, style) => {
      await loadFont(family, [{ weight, style }]);
      return null;
    },
  }).then(() => {
    // The preparation loads the faces the configuration sets; the callers
    // hold their build for `missingConfigFontSpecs`, which asks more of
    // each family (a heading face never set in italic is still checked in
    // italic, and answered by the cut matching settles on). For a family
    // taken from Google's style sheet `loadFont` loads all of them, once
    // per family, and Chrome makes the faces of every style sheet anew,
    // unloaded, when another font style sheet lands: a family loaded
    // before the last sheet of the book landed is back to unloaded, and
    // nothing asked for the faces only the check names again, so the
    // previews waited for them without end (#659). What the check still
    // misses is loaded here.
    return loadFontSpecs(missingConfigFontSpecs(config, markdown), configFontSampleText(config));
  });
}

/**
 * A preview's hold on its build until the faces it paints with are loaded
 * (#659). `pending` lists what to wait for, `wait` waits for it, and the
 * preview looks again when the wait ends. A face is waited for once: what
 * a wait ends without (a file that fails or outlasts the timeout) is given
 * up on, and the build goes ahead with the fallback the engine reports; a
 * face that lands later lays the pages out again through `watchFonts`.
 * Looking again can therefore not hold the build twice for the same
 * missing face, whatever the font set answers.
 */
export interface FontGate {
  /** The specs of `missingConfigFontSpecs` to wait for before building:
   *  empty, build. */
  pending(config: PostextConfig, markdown?: FontContentText): string[];
  /** Load them (`ensureConfigFontsLoaded`); the ones still missing when it
   *  settles are not waited for again while they stay missing. */
  wait(config: PostextConfig, markdown?: FontContentText): Promise<void>;
}

/** One per preview. */
export function createFontGate(): FontGate {
  // Sample text and spec of the faces a wait ended without.
  const givenUp = new Set<string>();
  const keyOf = (config: PostextConfig): ((spec: string) => string) => {
    const text = configFontSampleText(config);
    return (spec) => `${text}\n${spec}`;
  };
  return {
    pending(config, markdown) {
      const missing = missingConfigFontSpecs(config, markdown);
      if (givenUp.size === 0) return missing;
      const key = keyOf(config);
      // A face that loaded after all is waited for again if it goes
      // missing once more (its style sheet's faces made anew).
      const still = new Set(missing.map(key));
      for (const k of givenUp) if (!still.has(k)) givenUp.delete(k);
      return missing.filter((s) => !givenUp.has(key(s)));
    },
    async wait(config, markdown) {
      // A preparation that throws ends the wait as one that loaded nothing:
      // the preview is told either way, or it would never look again.
      await ensureConfigFontsLoaded(config, markdown).catch((err: unknown) => {
        console.warn('[postext-sandbox] font preparation failed', err);
      });
      const key = keyOf(config);
      for (const s of missingConfigFontSpecs(config, markdown)) givenUp.add(key(s));
    },
  };
}
