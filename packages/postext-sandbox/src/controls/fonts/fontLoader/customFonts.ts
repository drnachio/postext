// The registry of user-uploaded fonts: setting and forgetting families,
// edition fonts, listeners, fallback faces and their payloads (#1276:
// split out of fontLoader.ts).
import { type CustomFontFamily, type CustomFontVariant, type FontVariantUse, fontFallbackOf, STANDARD_FONT_VARIANTS, hasOwnStyle } from 'postext';
import type { FontPayload } from 'postext/worker';
import { getFontFile } from '../../../storage/fontStorage.js';
import type { FamilyFace } from './catalogue.js';
import { familyFilesCache, familyFacesFailedAt, familyCutFaces, isSlanted, faceHolds } from './faces.js';
import { loadFont, forgetFeatureFamilies, loadedFonts, loadingPromises } from './loading.js';
import { facePayloadCache, faceCacheKey, fetchFacePayloads } from './payloads.js';

// ---------------------------------------------------------------------------
// Custom (user-uploaded) font registry
// ---------------------------------------------------------------------------

const customFontRegistry = new Map<string, CustomFontFamily>();
/** Families declared by an edition laid out behind the reader that the book
 *  on screen does not have (see {@link declareEditionFonts}). */
const editionFamilies = new Map<string, CustomFontFamily>();
/** Names of families registered as a custom font since the book on screen
 *  was opened. Seeded by every `setCustomFonts` call so
 *  `isRemovedCustomFontFamily` can tell "deleted a custom family I had
 *  declared" from "never seen this name". Emptied when another book comes
 *  in (`newBook`): a family the last book bundled may be a Google Font the
 *  next one asks for by name (紅樓夢 bundles Noto Serif SC; the guide's
 *  Chinese edition loads it from Google Fonts). */
const everSeenCustomFamilies = new Set<string>();
/** Listeners notified when the set of known custom families changes. The
 *  payload is the list of family names whose definition changed, was added,
 *  or was removed. Consumers (the worker bundle) use it to drop stale
 *  registrations so the next build reloads the fresh bytes. */
const customFontListeners = new Set<(changedFamilies: string[]) => void>();
/** Document-level FontFace instances we registered, keyed by family — so
 *  `setCustomFonts` can remove them when a family is updated or deleted. */
const registeredCustomFaces = new Map<string, FontFace[]>();
/** The `FontFace`s a family with a `fallback` has from that family (#978),
 *  by family and face key, so they can be removed with it. */
const fallbackFaces = new Map<string, Map<string, FontFace>>();

function variantKey(v: CustomFontVariant): string {
  return `${v.weight}|${v.style}|${v.fileId}`;
}

export function familySignature(f: CustomFontFamily): string {
  const vs = [...f.variants].map(variantKey).sort();
  return `${f.name}::${vs.join(';')}${f.fallback ? `::>${f.fallback}` : ''}`;
}

/** Replace the sandbox's known custom fonts. Invalidates every cached
 *  loader state for families that changed, added, or were removed.
 *  `newBook`: the list is another book's (a preset, a project, a draft
 *  opened), not an edit of this one's, so the families left out were not
 *  deleted by the author. */
export function setCustomFonts(list: CustomFontFamily[] | undefined, options: { newBook?: boolean } = {}): void {
  const next = new Map<string, CustomFontFamily>();
  for (const f of list ?? []) next.set(f.name, f);

  const changed: string[] = [];
  for (const [name, fam] of next) {
    const prev = customFontRegistry.get(name);
    if (!prev || familySignature(prev) !== familySignature(fam)) changed.push(name);
  }
  for (const name of customFontRegistry.keys()) {
    if (!next.has(name)) changed.push(name);
  }
  // The families only a background edition declared (#968) give way to the
  // book on screen's: its definition of the name wins, and another book's
  // editions are not this one's.
  for (const name of [...editionFamilies.keys()]) {
    if (options.newBook || next.has(name)) {
      editionFamilies.delete(name);
      if (!changed.includes(name)) changed.push(name);
    }
  }
  // A family set in another custom family's faces (#978) follows it.
  for (const [name, fam] of next) {
    if (fam.fallback && changed.includes(fam.fallback) && !changed.includes(name)) changed.push(name);
  }

  customFontRegistry.clear();
  if (options.newBook) everSeenCustomFamilies.clear();
  for (const [name, fam] of next) {
    customFontRegistry.set(name, fam);
    everSeenCustomFamilies.add(name);
  }

  forgetCustomFamilies(changed);

  // Kick off FontFace registration on document.fonts for every currently
  // declared custom family. Without this, the HTML viewport (which only
  // applies the family via CSS) falls back to a system font because no
  // FontFace matches the name.
  if (typeof document !== 'undefined' && document.fonts) {
    for (const name of customFontRegistry.keys()) {
      loadFont(name).catch(() => { /* individual variant failures are logged below */ });
    }
  }
}

/** Drop what the loader holds of `families` (their loaded state, payloads,
 *  declared faces) and tell the listeners. */
function forgetCustomFamilies(changed: readonly string[]): void {
  forgetFeatureFamilies(changed);
  for (const family of changed) {
    loadedFonts.delete(family);
    loadingPromises.delete(family);
    facePayloadCache.delete(family);
    familyFilesCache.delete(family);
    familyFacesFailedAt.delete(family);
    const faces = registeredCustomFaces.get(family);
    if (faces && typeof document !== 'undefined' && document.fonts) {
      for (const ff of faces) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    registeredCustomFaces.delete(family);
    const stood = fallbackFaces.get(family);
    if (stood && typeof document !== 'undefined' && document.fonts) {
      for (const ff of stood.values()) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    fallbackFaces.delete(family);
  }

  if (changed.length > 0) {
    for (const cb of customFontListeners) cb([...changed]);
  }
}

/**
 * The custom families an edition laid out behind the reader declares (#968):
 * the book on screen holds one edition's list (`setCustomFonts`), and an
 * edition read from its draft or the bundle may name a family that list
 * lacks. Laid out on the layout worker and painted in the side-by-side view
 * with the book's families only, its text was measured in a fallback face.
 * The families the book on screen does not declare are declared here, for
 * the loader to serve as it serves its own (`getCustomFontFamily`); the
 * book's definition of a name always wins, and another book (`newBook`)
 * drops them.
 */
export function declareEditionFonts(list: readonly CustomFontFamily[] | undefined): void {
  const changed: string[] = [];
  for (const family of list ?? []) {
    if (customFontRegistry.has(family.name)) continue;
    const prev = editionFamilies.get(family.name);
    if (prev && familySignature(prev) === familySignature(family)) continue;
    editionFamilies.set(family.name, family);
    changed.push(family.name);
  }
  if (changed.length === 0) return;
  forgetCustomFamilies(changed);
  if (typeof document !== 'undefined' && document.fonts) {
    for (const name of changed) loadFont(name).catch(() => { /* logged by the loader */ });
  }
}

/** Signature of a custom-font list — of the registry's current contents
 *  when `list` is omitted. Callers compare the two to detect a registry that
 *  drifted from the config it should mirror, including a dev-server hot
 *  reload, which re-evaluates this module (emptying the registry) while
 *  React keeps the config it was seeded from. */
export function customFontsSignature(list?: CustomFontFamily[]): string {
  const source = list ?? Array.from(customFontRegistry.values());
  return source.map(familySignature).sort().join('|');
}

export function getCustomFontFamily(name: string): CustomFontFamily | undefined {
  return customFontRegistry.get(name) ?? editionFamilies.get(name);
}

export function listCustomFontFamilies(): CustomFontFamily[] {
  return Array.from(customFontRegistry.values());
}

export function isCustomFontFamily(name: string): boolean {
  return customFontRegistry.has(name) || editionFamilies.has(name);
}

/** True when `name` was registered as a custom family since the book on
 *  screen was opened but is no longer present — i.e. the user has deleted
 *  it while some `fontFamily` field still references it. */
export function isRemovedCustomFontFamily(name: string): boolean {
  return everSeenCustomFamilies.has(name) && !customFontRegistry.has(name);
}

/** Subscribe to custom-font registry changes. The callback receives the
 *  family names whose definition changed (added, removed, or variant set
 *  altered). Returns an unsubscribe function. */
export function onCustomFontsChanged(cb: (families: string[]) => void): () => void {
  customFontListeners.add(cb);
  return () => { customFontListeners.delete(cb); };
}

export async function loadVariantBuffer(variant: CustomFontVariant): Promise<ArrayBuffer | null> {
  const file = await getFontFile(variant.fileId).catch(() => null);
  return file ? file.buffer : null;
}

export async function loadCustomFontFamily(family: CustomFontFamily): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const existing = registeredCustomFaces.get(family.name) ?? [];
  // Skip variants that already have a matching FontFace loaded.
  const haveKeys = new Set(
    existing.map((ff) => `${ff.weight}|${ff.style}`),
  );
  const faces: FontFace[] = [...existing];
  await Promise.all(
    family.variants.map(async (variant) => {
      const key = `${variant.weight}|${variant.style}`;
      if (haveKeys.has(key)) return;
      const buffer = await loadVariantBuffer(variant);
      if (!buffer) return;
      try {
        const ff = new FontFace(family.name, buffer, {
          weight: String(variant.weight),
          style: variant.style,
        });
        await ff.load();
        document.fonts.add(ff);
        faces.push(ff);
      } catch (err) {
        console.warn('[postext-sandbox] failed to load custom font variant', family.name, variant, err);
      }
    }),
  );
  registeredCustomFaces.set(family.name, faces);
}

/** The faces `family` has no file of, as another family's (#978): its
 *  `fallback`'s cuts of the weights and slants asked, in the slants the
 *  family has no file of, named for the family. A fallback that is a custom
 *  family gives its own files. */
async function fallbackFacesOf(family: CustomFontFamily, uses: readonly FontVariantUse[]): Promise<FamilyFace[]> {
  const stands = fontFallbackOf([family], family.name);
  if (!stands || getCustomFontFamily(stands)) return [];
  const wanted = [...STANDARD_FONT_VARIANTS, ...uses].filter((use) => !hasOwnStyle(family.variants, use.style));
  if (wanted.length === 0) return [];
  const faces = await familyCutFaces(stands, wanted);
  return faces.filter((face) => !hasOwnStyle(family.variants, isSlanted(face.style) ? 'italic' : 'normal')).map((face) => ({ ...face, family: family.name }));
}

/** The files of another custom family a family stands in for (#978). */
function fallbackCustomVariants(family: CustomFontFamily): CustomFontVariant[] {
  const stands = fontFallbackOf([family], family.name);
  const source = stands ? getCustomFontFamily(stands) : undefined;
  return source ? source.variants.filter((v) => !hasOwnStyle(family.variants, v.style)) : [];
}

/** Declare on the page the faces `family` has from its fallback (#978),
 *  under its own name, and load the one that holds the Latin letters. */
export async function declareFallbackFaces(family: CustomFontFamily, uses: readonly FontVariantUse[]): Promise<void> {
  const FontFaceCtor = (globalThis as { FontFace?: typeof FontFace }).FontFace;
  if (typeof document === 'undefined' || !document.fonts || !FontFaceCtor) return;
  let held = fallbackFaces.get(family.name);
  if (!held) fallbackFaces.set(family.name, (held = new Map()));
  const first: FontFace[] = [];
  const add = (key: string, make: () => FontFace, latin: boolean): void => {
    if (held!.has(key)) return;
    try {
      const face = make();
      held!.set(key, face);
      document.fonts.add(face);
      if (latin) first.push(face);
    } catch (err) {
      console.warn('[postext-sandbox] failed to declare fallback font face', family.name, err);
    }
  };
  for (const face of await fallbackFacesOf(family, uses)) {
    add(faceCacheKey(face), () => new FontFaceCtor(family.name, `url(${JSON.stringify(face.url)}) format('woff2')`, {
      weight: face.weight,
      style: face.style,
      ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
    }), faceHolds(face, 0x61));
  }
  for (const variant of fallbackCustomVariants(family)) {
    const key = `${variant.weight}|${variant.style}|${variant.fileId}`;
    if (held.has(key)) continue;
    const buffer = await loadVariantBuffer(variant);
    if (!buffer) continue;
    add(key, () => new FontFaceCtor(family.name, buffer, { weight: String(variant.weight), style: variant.style }), true);
  }
  await Promise.all(first.map((face) => face.load().catch(() => undefined)));
}

export async function fetchCustomFamilyPayloads(family: CustomFontFamily, uses: readonly FontVariantUse[] = []): Promise<FontPayload[]> {
  const payloads: FontPayload[] = [];
  if (family.fallback) {
    // Its fallback's faces, named for it (#978).
    const stood = await fetchFacePayloads(await fallbackFacesOf(family, uses));
    payloads.push(...stood);
    await Promise.all(fallbackCustomVariants(family).map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (buffer) payloads.push({ family: family.name, weight: String(variant.weight), style: variant.style, buffer: buffer.slice(0) });
    }));
  }
  await Promise.all(
    family.variants.map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (!buffer) return;
      payloads.push({
        family: family.name,
        weight: String(variant.weight),
        style: variant.style,
        buffer: buffer.slice(0),
      });
    }),
  );
  return payloads;
}
