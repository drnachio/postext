// The font payloads sent to the layout worker: @font-face sheets parsed
// into faces, file bytes fetched once, and the payloads of a
// configuration, of faces and of families (#1276: split out of
// fontLoader.ts).
import { baseFontFamily, STANDARD_FONT_VARIANTS, type PostextConfig, type FontContentText, type FontVariantUse, featureFamilyParts, fontFeatureSettings } from 'postext';
import type { FontPayload } from 'postext/worker';
import type { FamilyFace } from './catalogue.js';
import { getCustomFontFamily, fetchCustomFamilyPayloads } from './customFonts.js';
import { FAMILY_FACES_RETRY_MS, familyCutFaces, familyFiles, sortedUses, facesForCodePoints, facesForUse } from './faces.js';
import { configFontUses } from './loading.js';
import { fetchWithin } from './requests.js';

// ---------------------------------------------------------------------------
// Worker font payload collection
// ---------------------------------------------------------------------------

const FACE_RE = /@font-face\s*\{([^}]+)\}/g;
const DECL_RES = {
  family: /font-family:\s*['"]?([^;'"]+)['"]?\s*;/i,
  style: /font-style:\s*([^;]+);/i,
  weight: /font-weight:\s*([^;]+);/i,
  unicodeRange: /unicode-range:\s*([^;]+);/i,
  src: /src:\s*url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/i,
};

export function parseFontFaceCss(css: string): FamilyFace[] {
  const out: FamilyFace[] = [];
  for (const match of css.matchAll(FACE_RE)) {
    const body = match[1]!;
    const srcMatch = DECL_RES.src.exec(body);
    const familyMatch = DECL_RES.family.exec(body);
    if (!srcMatch || !familyMatch) continue;
    const weight = DECL_RES.weight.exec(body)?.[1]?.trim() ?? '400';
    const style = DECL_RES.style.exec(body)?.[1]?.trim() ?? 'normal';
    const unicodeRange = DECL_RES.unicodeRange.exec(body)?.[1]?.trim();
    const url = srcMatch[1]!.trim().replace(/^['"]|['"]$/g, '');
    out.push({
      family: familyMatch[1]!.trim(),
      weight,
      style,
      unicodeRange,
      url,
    });
  }
  return out;
}

export const facePayloadCache = new Map<string, Promise<FontPayload[]>>();

export function faceCacheKey(p: { family: string; weight: string; style: string; unicodeRange?: string }): string {
  return `${p.family}|${p.weight}|${p.style}|${p.unicodeRange ?? ''}`;
}

/** The bytes of each font file fetched, by URL, and when a fetch failed. */
const fileBytes = new Map<string, Promise<ArrayBuffer | null>>();
const fileFailedAt = new Map<string, number>();
/** The files the server answered it has not (a 404): Fontsource's record
 *  lists cuts its package does not hold (Libertinus Sans has no bold
 *  italic, #168). Not asked for again (#757). */
const filesGone = new Set<string>();

/** A font file's bytes, fetched once per URL; null when it cannot be had,
 *  and asked again after a while. */
function fetchFileBytes(url: string): Promise<ArrayBuffer | null> {
  const cached = fileBytes.get(url);
  const failedAt = fileFailedAt.get(url);
  if (cached && (failedAt === undefined || Date.now() - failedAt < FAMILY_FACES_RETRY_MS)) return cached;
  fileFailedAt.delete(url);
  const promise = (async (): Promise<ArrayBuffer | null> => {
    try {
      return await fetchWithin(url, async (r) => {
        if (r.status === 404) filesGone.add(url);
        return r.ok ? await r.arrayBuffer() : null;
      }, { credentials: 'omit' });
    } catch {
      return null; // ignore individual face failures
    }
  })();
  fileBytes.set(url, promise);
  void promise.then((bytes) => {
    if (bytes === null && !filesGone.has(url) && fileBytes.get(url) === promise) fileFailedAt.set(url, Date.now());
  });
  return promise;
}

/** The files of `faces` as worker payloads, in the order of `faces` (a
 *  family's slices overlap at a few code points, where the order they are
 *  added in decides, #629). Each payload holds bytes of its own (the
 *  worker takes them over). A file that fails is left out. */
export async function fetchFacePayloads(faces: readonly FamilyFace[]): Promise<FontPayload[]> {
  const payloads = await Promise.all(faces.map(async (face): Promise<FontPayload | null> => {
    const bytes = await fetchFileBytes(face.url);
    if (!bytes) return null;
    return {
      family: face.family,
      weight: face.weight,
      style: face.style,
      unicodeRange: face.unicodeRange,
      buffer: bytes.slice(0),
    };
  }));
  return payloads.filter((p): p is FontPayload => p !== null);
}

/** The faces a family named alone is sent with: its regular, its bold and
 *  their italics. */
async function fetchFamilyPayloads(name: string): Promise<FontPayload[]> {
  // A feature family (#1237): its base family's files, with its features.
  const family = baseFontFamily(name);
  const custom = getCustomFontFamily(family);
  if (custom) return asFeaturePayloads(name, await fetchCustomFamilyPayloads(custom));
  return asFeaturePayloads(name, await fetchFacePayloads(await familyCutFaces(family, STANDARD_FONT_VARIANTS)));
}

/**
 * Collect `FontPayload` objects (woff2 ArrayBuffers + descriptors) for
 * every face a config and its text ask for, so they can be shipped to a
 * layout worker: every file of each weight and slant of each family (#757),
 * and of a custom family.
 *
 * The buffers are fresh each call (so the caller can transfer them into
 * the worker without detaching a shared copy). The face list and the
 * files' bytes are cached.
 */
export async function collectFontPayloadsForConfig(
  config: PostextConfig,
  markdown?: FontContentText,
): Promise<FontPayload[]> {
  const faces = [...configFontUses(config, markdown)].flatMap(([family, uses]) => uses.map((use) => ({ family, ...use })));
  return collectFontPayloadsForFaces(faces);
}

/**
 * The payloads of `faces` (family, weight, slant): for each family, the
 * files of those cuts, in the order they are declared, and every file of a
 * custom family. With `codePoints`, only the files a browser draws those
 * characters from (what a file that embeds its fonts needs: an EPUB). A
 * family that cannot be fetched gives no payload; the others are collected
 * all the same (#689).
 */
export async function collectFontPayloadsForFaces(
  faces: readonly { family: string; weight: number; style: 'normal' | 'italic' }[],
  codePoints?: Iterable<number>,
): Promise<FontPayload[]> {
  const uses = new Map<string, FontVariantUse[]>();
  for (const face of faces) {
    const list = uses.get(face.family);
    if (list) list.push({ weight: face.weight, style: face.style });
    else uses.set(face.family, [{ weight: face.weight, style: face.style }]);
  }
  const cps = codePoints === undefined ? undefined : [...codePoints];
  // A feature family (#1237): its base family's files, under its name
  // with its features.
  const byFamily = await Promise.all([...uses].map(async ([family, list]) => asFeaturePayloads(family, await familyPayloads(baseFontFamily(family), list, cps))));
  return dedupePayloads(byFamily);
}

/** The payloads of a family's files for the cuts `list` asks for (every
 *  file of a custom family); with `cps`, only the files that hold them.
 *  None when the family cannot be fetched. */
async function familyPayloads(family: string, list: readonly FontVariantUse[], cps: number[] | undefined): Promise<FontPayload[]> {
  try {
    const custom = getCustomFontFamily(family);
    if (custom) return await fetchCustomFamilyPayloads(custom, list);
    const files = await familyFiles(family);
    if (!cps || !files.cuts) return await fetchFacePayloads(await familyCutFaces(family, list));
    // Cut by cut: each has files of its own for the same characters.
    const wanted: FamilyFace[] = [];
    const seen = new Set<string>();
    for (const use of sortedUses(list)) {
      for (const face of facesForCodePoints(await facesForUse(family, files, use), cps)) {
        const key = faceCacheKey(face);
        if (seen.has(key)) continue;
        seen.add(key);
        wanted.push(face);
      }
    }
    return await fetchFacePayloads(wanted);
  } catch {
    return [];
  }
}

/**
 * The payloads of a base family's files as the faces of `family` when it
 * is a feature family (a style's figures, #1237, `Lora@onum`): under its
 * name, with the `featureSettings` of its features, which the worker
 * declares them with. Any other family's payloads as they are.
 */
export function asFeaturePayloads(family: string, payloads: FontPayload[]): FontPayload[] {
  const parts = featureFamilyParts(family);
  if (parts.features.length === 0) return payloads;
  const featureSettings = fontFeatureSettings(parts.features);
  return payloads.map((p) => ({ ...p, family, featureSettings }));
}

function dedupePayloads(groups: readonly FontPayload[][]): FontPayload[] {
  const seen = new Set<string>();
  const flat: FontPayload[] = [];
  for (const group of groups) {
    for (const p of group) {
      const key = faceCacheKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push(p);
    }
  }
  return flat;
}

/**
 * Variant of `collectFontPayloadsForConfig` for families named alone: the
 * files of a custom family, and for any other those of its regular, its
 * bold and their italics (every face of a family taken from Google's style
 * sheet). The layout service asks for the cuts a build is set in instead
 * (`familyCutFaces`).
 */
export async function collectFontPayloadsForFamilies(
  families: string[],
): Promise<FontPayload[]> {
  if (families.length === 0) return [];
  const byFamily = await Promise.all(families.map(async (family) => {
    const cached = facePayloadCache.get(family);
    if (cached) {
      // The cached promise resolves with FontPayload[] whose buffers may
      // already have been transferred. Re-fetch to produce fresh buffers,
      // but dedupe concurrent re-fetches.
      return cached.then(async (payloads) => {
        // If any buffer has been neutered (byteLength === 0), re-fetch.
        if (payloads.some((p) => p.buffer.byteLength === 0)) {
          const fresh = fetchFamilyPayloads(family).catch((): FontPayload[] => []);
          facePayloadCache.set(family, fresh);
          return fresh;
        }
        // Clone buffers so transferring to the worker doesn't neuter the cache.
        return payloads.map((p) => ({ ...p, buffer: p.buffer.slice(0) }));
      });
    }
    // A family that cannot be fetched gives no payload; the others of
    // the build are registered all the same (#689).
    const promise = fetchFamilyPayloads(family).catch((): FontPayload[] => []).then((payloads) => {
      // An empty face list means the family could not be fetched (or was
      // looked up before its custom definition landed): don't cache it, so
      // the next build retries instead of measuring with a fallback forever.
      if (payloads.length === 0 && facePayloadCache.get(family) === promise) facePayloadCache.delete(family);
      return payloads;
    });
    facePayloadCache.set(family, promise);
    return promise;
  }));
  // Deduplicate across families (cheap — same family appears at most once).
  return dedupePayloads(byFamily);
}
