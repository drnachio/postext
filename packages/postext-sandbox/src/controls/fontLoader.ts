import type { CustomFontFamily, CustomFontVariant, PostextConfig } from 'postext';
import type { FontPayload } from 'postext/worker';
import { resolveBodyTextConfig, resolveHeadingsConfig, resolveUnorderedListsConfig, resolveOrderedListsConfig } from 'postext';
import { getFontFile } from '../storage/fontStorage';

const FONT_LOAD_TIMEOUT_MS = 3000;

const loadedFonts = new Set<string>();
const loadingPromises = new Map<string, Promise<void>>();

interface FontMetadata {
  variable: boolean;
  weights: number[];
  hasItalic: boolean;
}

const metadataCache = new Map<string, FontMetadata | null>();
const metadataInFlight = new Map<string, Promise<FontMetadata | null>>();

function toFontsourceId(family: string): string {
  return family.toLowerCase().replace(/\s+/g, '-');
}

async function fetchFontMetadata(family: string): Promise<FontMetadata | null> {
  if (metadataCache.has(family)) return metadataCache.get(family)!;
  const existing = metadataInFlight.get(family);
  if (existing) return existing;

  const promise = (async (): Promise<FontMetadata | null> => {
    try {
      const res = await fetch(`https://api.fontsource.org/v1/fonts/${toFontsourceId(family)}`);
      if (!res.ok) return null;
      const data = await res.json() as {
        variable?: boolean;
        weights?: number[];
        styles?: string[];
      };
      const weights = (data.weights ?? []).filter((w) => typeof w === 'number');
      if (weights.length === 0) return null;
      return {
        variable: data.variable === true,
        weights,
        hasItalic: (data.styles ?? []).includes('italic'),
      };
    } catch {
      return null;
    }
  })();

  metadataInFlight.set(family, promise);
  const meta = await promise;
  metadataCache.set(family, meta);
  metadataInFlight.delete(family);
  return meta;
}

/**
 * Build a Google Fonts CSS2 URL that exposes the full weight axis of a
 * variable font, so canvas text can interpolate across intermediate weights
 * instead of snapping between discrete static instances.
 *
 * - Variable fonts: use `wght@{min}..{max}`, which makes Google Fonts emit a
 *   single `@font-face` with `font-weight: {min} {max}` pointing to the VF.
 *   This is the only shape the browser will interpolate across on canvas.
 * - Static fonts: request each supported weight explicitly.
 * - Unknown fonts (metadata fetch failed): fall back to the historical
 *   regular/bold pair so the font still renders.
 */
function buildFontUrl(family: string, meta: FontMetadata | null): string {
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

export function loadFont(font: string): Promise<void> {
  if (loadedFonts.has(font)) return Promise.resolve();

  const existing = loadingPromises.get(font);
  if (existing) return existing;

  const custom = getCustomFontFamily(font);
  if (custom) {
    const promise = loadCustomFontFamily(custom).then(() => {
      loadedFonts.add(font);
      loadingPromises.delete(font);
    });
    loadingPromises.set(font, promise);
    return promise;
  }

  const promise = (async () => {
    const meta = await fetchFontMetadata(font);
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

    loadedFonts.add(font);
    loadingPromises.delete(font);
  })();

  loadingPromises.set(font, promise);
  return promise;
}

export function getConfigFontFamilies(config: PostextConfig): string[] {
  const body = resolveBodyTextConfig(config.bodyText);
  const headings = resolveHeadingsConfig(config.headings);
  const lists = resolveUnorderedListsConfig(config.unorderedLists, body);
  const ordered = resolveOrderedListsConfig(config.orderedLists, body);
  const families = new Set<string>();
  families.add(body.fontFamily);
  families.add(headings.fontFamily);
  for (const level of headings.levels) families.add(level.fontFamily);
  families.add(lists.fontFamily);
  for (const level of lists.levels) families.add(level.fontFamily);
  families.add(ordered.fontFamily);
  for (const level of ordered.levels) families.add(level.fontFamily);
  return Array.from(families);
}

export function preloadConfigFonts(config: PostextConfig): Promise<void> {
  const promises = getConfigFontFamilies(config).map((family) => loadFont(family));
  return Promise.all(promises).then(() => {});
}

/**
 * Font-spec strings (for `document.fonts.check/load`) covering every
 * family × weight × style combination a build might hit. Size is fixed at
 * 16px because the check is per-face — the actual render size doesn't
 * affect whether a matching face is loaded.
 */
export function getConfigFontSpecs(config: PostextConfig): string[] {
  const specs = new Set<string>();
  const push = (family: string) => {
    const q = `"${family}"`;
    specs.add(`400 16px ${q}`);
    specs.add(`700 16px ${q}`);
    specs.add(`italic 400 16px ${q}`);
    specs.add(`italic 700 16px ${q}`);
  };
  for (const f of getConfigFontFamilies(config)) push(f);
  return [...specs];
}

/**
 * Ensure every face the given config will render is actually available to
 * `CanvasRenderingContext2D.measureText`. Resolves once all faces pass
 * `document.fonts.check`, or after the timeout. Safe to call repeatedly.
 */
export function ensureConfigFontsLoaded(config: PostextConfig): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const specs = getConfigFontSpecs(config);
  const missing = specs.filter((s) => !document.fonts.check(s));
  if (missing.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(missing.map((s) => document.fonts.load(s).catch(() => []))).then(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)),
  ]);
}

// ---------------------------------------------------------------------------
// Worker font payload collection
// ---------------------------------------------------------------------------

interface ParsedFace {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  url: string;
}

const FACE_RE = /@font-face\s*\{([^}]+)\}/g;
const DECL_RES = {
  family: /font-family:\s*['"]?([^;'"]+)['"]?\s*;/i,
  style: /font-style:\s*([^;]+);/i,
  weight: /font-weight:\s*([^;]+);/i,
  unicodeRange: /unicode-range:\s*([^;]+);/i,
  src: /src:\s*url\(([^)]+)\)\s*format\(['"]?woff2['"]?\)/i,
};

function parseFontFaceCss(css: string): ParsedFace[] {
  const out: ParsedFace[] = [];
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

const facePayloadCache = new Map<string, Promise<FontPayload[]>>();

function faceCacheKey(p: { family: string; weight: string; style: string; unicodeRange?: string }): string {
  return `${p.family}|${p.weight}|${p.style}|${p.unicodeRange ?? ''}`;
}

async function fetchFamilyPayloads(family: string): Promise<FontPayload[]> {
  const custom = getCustomFontFamily(family);
  if (custom) return fetchCustomFamilyPayloads(custom);
  const meta = await fetchFontMetadata(family);
  const cssUrl = buildFontUrl(family, meta);
  // Google Fonts returns woff2 only if the UA is browser-like. Normal fetch
  // from the main thread inherits the browser UA, so this is fine. From a
  // worker it would return ttf; that's why we do this on the main thread.
  const cssRes = await fetch(cssUrl, { credentials: 'omit' });
  if (!cssRes.ok) return [];
  const css = await cssRes.text();
  const faces = parseFontFaceCss(css);
  const payloads: FontPayload[] = [];
  await Promise.all(faces.map(async (face) => {
    try {
      const r = await fetch(face.url, { credentials: 'omit' });
      if (!r.ok) return;
      const buffer = await r.arrayBuffer();
      payloads.push({
        family: face.family,
        weight: face.weight,
        style: face.style,
        unicodeRange: face.unicodeRange,
        buffer,
      });
    } catch { /* ignore individual face failures */ }
  }));
  return payloads;
}

/**
 * Collect `FontPayload` objects (woff2 ArrayBuffers + descriptors) for every
 * family a config will render, so they can be shipped to a layout worker.
 *
 * The buffers are freshly fetched each call (so the caller can transfer them
 * into the worker without detaching a shared copy). The CSS lookup and face
 * *list* is cached.
 */
export async function collectFontPayloadsForConfig(
  config: PostextConfig,
): Promise<FontPayload[]> {
  return collectFontPayloadsForFamilies(getConfigFontFamilies(config));
}

/**
 * Variant of `collectFontPayloadsForConfig` that fetches only the requested
 * families, so the caller can ship a delta (newly-seen families) to the
 * worker instead of the whole configured set on every update.
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
          const fresh = fetchFamilyPayloads(family);
          facePayloadCache.set(family, fresh);
          return fresh;
        }
        // Clone buffers so transferring to the worker doesn't neuter the cache.
        return payloads.map((p) => ({ ...p, buffer: p.buffer.slice(0) }));
      });
    }
    const promise = fetchFamilyPayloads(family);
    facePayloadCache.set(family, promise);
    return promise;
  }));
  // Deduplicate across families (cheap — same family appears at most once).
  const seen = new Set<string>();
  const flat: FontPayload[] = [];
  for (const group of byFamily) {
    for (const p of group) {
      const key = faceCacheKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push(p);
    }
  }
  return flat;
}

// ---------------------------------------------------------------------------
// Custom (user-uploaded) font registry
// ---------------------------------------------------------------------------

const customFontRegistry = new Map<string, CustomFontFamily>();
/** Names of families that have ever been registered as a custom font in
 *  this session. Seeded by every `setCustomFonts` call so `hasBeen…`
 *  checks can distinguish "deleted a custom I had declared" from "never
 *  seen this name". Never pruned — membership is monotonic. */
const everSeenCustomFamilies = new Set<string>();
/** Listeners notified when the set of known custom families changes. The
 *  payload is the list of family names whose definition changed, was added,
 *  or was removed. Consumers (the worker bundle) use it to drop stale
 *  registrations so the next build reloads the fresh bytes. */
const customFontListeners = new Set<(changedFamilies: string[]) => void>();
/** Document-level FontFace instances we registered, keyed by family — so
 *  `setCustomFonts` can remove them when a family is updated or deleted. */
const registeredCustomFaces = new Map<string, FontFace[]>();

function variantKey(v: CustomFontVariant): string {
  return `${v.weight}|${v.style}|${v.fileId}`;
}

function familySignature(f: CustomFontFamily): string {
  const vs = [...f.variants].map(variantKey).sort();
  return `${f.name}::${vs.join(';')}`;
}

/** Replace the sandbox's known custom fonts. Invalidates every cached
 *  loader state for families that changed, added, or were removed. */
export function setCustomFonts(list: CustomFontFamily[] | undefined): void {
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

  customFontRegistry.clear();
  for (const [name, fam] of next) {
    customFontRegistry.set(name, fam);
    everSeenCustomFamilies.add(name);
  }

  for (const family of changed) {
    loadedFonts.delete(family);
    loadingPromises.delete(family);
    facePayloadCache.delete(family);
    const faces = registeredCustomFaces.get(family);
    if (faces && typeof document !== 'undefined' && document.fonts) {
      for (const ff of faces) {
        try { document.fonts.delete(ff); } catch { /* ignore */ }
      }
    }
    registeredCustomFaces.delete(family);
  }

  if (changed.length > 0) {
    for (const cb of customFontListeners) cb(changed);
  }

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

export function getCustomFontFamily(name: string): CustomFontFamily | undefined {
  return customFontRegistry.get(name);
}

export function listCustomFontFamilies(): CustomFontFamily[] {
  return Array.from(customFontRegistry.values());
}

export function isCustomFontFamily(name: string): boolean {
  return customFontRegistry.has(name);
}

/** True when `name` was registered as a custom family earlier in this
 *  session but is no longer present — i.e. the user has deleted it while
 *  some `fontFamily` field still references it. */
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

async function loadVariantBuffer(variant: CustomFontVariant): Promise<ArrayBuffer | null> {
  const file = await getFontFile(variant.fileId).catch(() => null);
  return file ? file.buffer : null;
}

async function loadCustomFontFamily(family: CustomFontFamily): Promise<void> {
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

async function fetchCustomFamilyPayloads(family: CustomFontFamily): Promise<FontPayload[]> {
  const payloads: FontPayload[] = [];
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

/** Resolve which of the standard specs (400/700 × normal/italic) are not
 *  covered by this family's variants. Returns an empty array if every spec
 *  has a matching variant (exact weight + style). */
/** Returns true only when we've conclusively tried and failed to fetch
 *  metadata for `family` from Fontsource (so we know it's not a Google
 *  Font). Returns false while the lookup is pending or not yet started. */
export function isKnownUnavailableGoogleFont(family: string): boolean {
  return metadataCache.has(family) && metadataCache.get(family) === null;
}

export function missingStandardVariants(
  family: CustomFontFamily,
): Array<{ weight: number; style: 'normal' | 'italic' }> {
  const have = new Set(
    family.variants.map((v) => `${v.weight}|${v.style}`),
  );
  const want: Array<{ weight: number; style: 'normal' | 'italic' }> = [
    { weight: 400, style: 'normal' },
    { weight: 700, style: 'normal' },
    { weight: 400, style: 'italic' },
    { weight: 700, style: 'italic' },
  ];
  return want.filter((w) => !have.has(`${w.weight}|${w.style}`));
}
