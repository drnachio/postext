import type { ContentBlock, CustomFontFamily, CustomFontVariant, PostextConfig, VerticalAlternatesFace } from 'postext';
import type { FontPayload } from 'postext/worker';
import {
  DEFAULT_TEXT_ELEMENT,
  defaultCjkEmphasis,
  loadVerticalAlternates,
  localeScript,
  unregisterVerticalAlternates,
  primaryFontFamily,
  resolveBodyTextConfig,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  resolveUnorderedListsConfig,
  resolveOrderedListsConfig,
} from 'postext';
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

/** Config keys naming a font family: `fontFamily`, `bodyFontFamily`,
 *  `headerFontFamily`, `separatorFontFamily`, `numberFontFamily`… */
const FONT_FAMILY_KEY = /^(?:f|[a-z]\w*F)ontFamily$/;

/**
 * Adds every family `node` names, at any depth. A design-slot text element
 * that names none is set in the element default. A subtree switched off
 * with `enabled: false` (a heading's advanced design, a contents part row)
 * draws nothing, so its families are skipped.
 */
function collectNamedFamilies(node: unknown, families: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectNamedFamilies(item, families);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec.enabled === false) return;
  if (rec.kind === 'text' && typeof rec.content === 'string' && rec.fontFamily === undefined) {
    families.add(DEFAULT_TEXT_ELEMENT.fontFamily);
  }
  for (const [key, value] of Object.entries(rec)) {
    if (typeof value === 'string') {
      if (FONT_FAMILY_KEY.test(key) && value.trim()) families.add(value);
    } else {
      collectNamedFamilies(value, families);
    }
  }
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
  families.add(ordered.separatorFontFamily);
  for (const level of ordered.levels) {
    families.add(level.fontFamily);
    families.add(level.separatorFontFamily);
  }
  // Callout styles: title, glyph icon / marker and body fonts. Unset fields
  // inherit the headings / body families collected above.
  for (const style of config.calloutStyles ?? []) {
    for (const family of [style.titleStyle?.fontFamily, style.icon?.fontFamily, style.marker?.fontFamily, style.body?.fontFamily]) {
      if (family) families.add(family);
    }
  }
  // Table styles: body and header cell fonts of the document's table style
  // and of every named one. Unset fields inherit the body family.
  for (const style of [config.tableStyle, ...(config.tableStyles ?? [])]) {
    for (const family of [style?.bodyFontFamily, style?.headerFontFamily]) {
      if (family) families.add(family);
    }
  }
  // Chip styles: a chip may set its text in a family of its own; unset, it
  // inherits the text around it.
  for (const style of config.chipStyles ?? []) {
    if (style.fontFamily) families.add(style.fontFamily);
  }
  // Paragraph styles (`:::paragraphs`): a face of their own; unset, the
  // body family.
  for (const style of config.paragraphStyles ?? []) {
    if (style.fontFamily) families.add(style.fontFamily);
  }
  // Part list overrides (partial configs applied inside `:::part`).
  const partLists = [config.parts?.bodyStyle?.unorderedLists, config.parts?.bodyStyle?.orderedLists];
  for (const lists of partLists) {
    if (!lists) continue;
    if (lists.fontFamily) families.add(lists.fontFamily);
    if ('separatorFontFamily' in lists && lists.separatorFontFamily) families.add(lists.separatorFontFamily);
    for (const level of lists.levels ?? []) {
      if (level.fontFamily) families.add(level.fontFamily);
      if ('separatorFontFamily' in level && level.separatorFontFamily) families.add(level.separatorFontFamily);
    }
  }
  // Running heads and folios: with no `header` / `footer`, the built-in
  // ones are drawn, in families of their own.
  for (const slot of [resolveHeaderFooterConfig(config.header, 'header'), resolveHeaderFooterConfig(config.footer, 'footer')]) {
    for (const el of slot.elements) if (el.kind === 'text') families.add(el.fontFamily);
  }
  // Every other family the configuration names: design-slot elements
  // (openers, section running heads, part and contents designs), heading
  // styles, captions, paragraph styles, contents entries…
  collectNamedFamilies(config, families);
  // A CSS font stack sets its text in the first family (the engine's
  // `primaryFontFamily`): load that one.
  return [...new Set(Array.from(families, primaryFontFamily))];
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
export function missingConfigFontSpecs(config: PostextConfig): string[] {
  if (typeof document === 'undefined' || !document.fonts) return [];
  const text = configFontSampleText(config);
  return getConfigFontSpecs(config).filter((s) => !document.fonts.check(s, text));
}

/**
 * Ensure every face the given config will render is actually available to
 * `CanvasRenderingContext2D.measureText`. Resolves once all faces pass
 * `document.fonts.check`, or after the timeout. Safe to call repeatedly.
 */
export function ensureConfigFontsLoaded(config: PostextConfig): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const missing = missingConfigFontSpecs(config);
  if (missing.length === 0) return Promise.resolve();
  const text = configFontSampleText(config);
  return Promise.race([
    Promise.all(missing.map((s) => document.fonts.load(s, text).catch(() => []))).then(() => {}),
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
    const promise = fetchFamilyPayloads(family).then((payloads) => {
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

function variantKey(v: CustomFontVariant): string {
  return `${v.weight}|${v.style}|${v.fileId}`;
}

function familySignature(f: CustomFontFamily): string {
  const vs = [...f.variants].map(variantKey).sort();
  return `${f.name}::${vs.join(';')}`;
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

  customFontRegistry.clear();
  if (options.newBook) everSeenCustomFamilies.clear();
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
  return customFontRegistry.get(name);
}

export function listCustomFontFamilies(): CustomFontFamily[] {
  return Array.from(customFontRegistry.values());
}

export function isCustomFontFamily(name: string): boolean {
  return customFontRegistry.has(name);
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
  return missingVariants(family, STANDARD_VARIANTS);
}

export interface FontVariantUse { weight: number; style: 'normal' | 'italic' }

const STANDARD_VARIANTS: readonly FontVariantUse[] = [
  { weight: 400, style: 'normal' },
  { weight: 700, style: 'normal' },
  { weight: 400, style: 'italic' },
  { weight: 700, style: 'italic' },
];

function missingVariants(family: CustomFontFamily, wanted: readonly FontVariantUse[]): FontVariantUse[] {
  const have = new Set(family.variants.map((v) => `${v.weight}|${v.style}`));
  const seen = new Set<string>();
  const out: FontVariantUse[] = [];
  for (const w of wanted) {
    const key = `${w.weight}|${w.style}`;
    if (have.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

/** What a document's text asks of its faces beyond its configuration. */
export interface FontUsageDocument {
  /** Whether the text sets a letter or digit that is not Chinese in
   *  emphasis (`*…*`): the characters that keep their italics where
   *  emphasis is set as dots ({@link hasLatinEmphasis}). Unset when the
   *  text is not known. */
  latinEmphasis?: boolean;
}

/** Letters and digits outside Chinese and Japanese script. */
const NON_CJK_LETTER_RE = /(?![\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Bopomofo}])[\p{L}\p{N}]/u;

/** Whether the text of `blocks` (headings aside, which are set in their
 *  own face) puts a letter or digit that is not Chinese in emphasis: a
 *  Latin word in `*…*` keeps its italics where the Chinese characters
 *  beside it take dots (`cjk.emphasis: 'dots'`). */
export function hasLatinEmphasis(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type !== 'heading' && b.spans.some((s) => s.italic && !s.math && NON_CJK_LETTER_RE.test(s.text)));
}

/**
 * The (weight, style) pairs the configuration asks of each family: every
 * config node carrying a `fontFamily` contributes its `fontWeight` (400
 * when unset) and `fontStyle` (normal when unset). The body text family
 * also needs the four standard variants, since markdown emphasis sets bold
 * and italic runs in it; so does a design text with `inlineMarks`. Where
 * emphasis is set as dots (`cjk.emphasis`, by default in a Chinese
 * document), `*…*` puts dots under Chinese characters and keeps the
 * italics of the rest: the body family is asked for its italics only when
 * `doc` does not say the text holds no Latin letter or digit in emphasis.
 */
export function collectFontUsage(config: PostextConfig, doc?: FontUsageDocument): Map<string, FontVariantUse[]> {
  const usage = new Map<string, FontVariantUse[]>();
  const add = (family: string, use: FontVariantUse) => {
    const list = usage.get(family) ?? [];
    list.push(use);
    usage.set(family, list);
  };
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (typeof rec.fontFamily === 'string' && rec.fontFamily.trim()) {
      const weight = typeof rec.fontWeight === 'number' ? rec.fontWeight : 400;
      // `fontStyle: 'italic'` (headings) or `italic: true` (titles,
      // paragraph styles, callout bodies).
      const style = rec.fontStyle === 'italic' || rec.italic === true ? 'italic' : 'normal';
      const family = primaryFontFamily(rec.fontFamily);
      add(family, { weight, style });
      // A design text with inline marks sets bold runs (700, or its own
      // weight when heavier) and italic runs in the other slant.
      if (rec.inlineMarks === true) {
        const italic = rec.italic === true;
        add(family, { weight: Math.max(700, weight), style: italic ? 'italic' : 'normal' });
        add(family, { weight, style: italic ? 'normal' : 'italic' });
      }
    }
    for (const value of Object.values(rec)) walk(value);
  };
  walk(config);
  const body = config.bodyText?.fontFamily;
  if (typeof body === 'string' && body.trim()) {
    const emphasis = config.cjk?.emphasis ?? 'auto';
    const dots = emphasis === 'dots' || (emphasis === 'auto' && defaultCjkEmphasis(config.locale) === 'dots');
    const italics = !dots || doc?.latinEmphasis !== false;
    for (const v of STANDARD_VARIANTS) if (italics || v.style !== 'italic') add(primaryFontFamily(body), v);
  }
  return usage;
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
export function configIsVertical(config: PostextConfig): boolean {
  if (config.layout?.writingMode === 'vertical-rl') return true;
  return (config.headingStyles ?? []).some((s) => s.layout?.writingMode === 'vertical-rl');
}

/** The twin load of each family, keyed by where its faces come from
 *  ({@link twinSourceKey}): a family whose sources change is loaded again. */
const verticalTwins = new Map<string, { key: string; promise: Promise<boolean> }>();
/** Per family, the source key whose twin load has settled. */
const verticalTwinsDone = new Map<string, string>();

/** Where a family's faces come from: the files of a custom family (a file
 *  uploaded again under the same name is another source), else Google. */
function twinSourceKey(family: string): string {
  const custom = getCustomFontFamily(family);
  return custom ? `custom:${familySignature(custom)}` : 'google';
}

async function verticalFacesOf(family: string): Promise<VerticalAlternatesFace[]> {
  const custom = getCustomFontFamily(family);
  if (custom) {
    const faces: VerticalAlternatesFace[] = [];
    await Promise.all(custom.variants.map(async (variant) => {
      const buffer = await loadVariantBuffer(variant);
      if (buffer) faces.push({ source: buffer, weight: String(variant.weight), style: variant.style });
    }));
    return faces;
  }
  const meta = await fetchFontMetadata(family);
  const res = await fetch(buildFontUrl(family, meta), { credentials: 'omit' });
  if (!res.ok) return [];
  return parseFontFaceCss(await res.text()).map((face) => ({
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
 * postext). Once per family; resolves when every family is settled, to
 * whether any family has its twin (the preview repaints then).
 */
export async function loadVerticalTwins(config: PostextConfig): Promise<boolean> {
  if (typeof document === 'undefined' || !configIsVertical(config)) return false;
  const results = await Promise.all(getConfigFontFamilies(config).map((family) => {
    const key = twinSourceKey(family);
    const entry = verticalTwins.get(family);
    if (entry && entry.key === key) return entry.promise;
    // New sources for a family (a custom font uploaded again, or a book
    // whose font of that name is another file): the old twin's faces go,
    // and the twin is loaded from the new ones.
    if (entry) {
      unregisterVerticalAlternates(family);
      verticalTwinsDone.delete(family);
    }
    const promise = verticalFacesOf(family)
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
export function verticalTwinsSettled(config: PostextConfig): boolean {
  if (!configIsVertical(config)) return true;
  return getConfigFontFamilies(config).every((f) => verticalTwinsDone.get(f) === twinSourceKey(f));
}
