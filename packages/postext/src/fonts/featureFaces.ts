// The faces of a feature family (#1237, `figureStyle.ts`): the files of its
// base family's faces declared again under its name, with the
// `featureSettings` descriptor that turns its figures on. A face's file is
// known when the engine made the face (`prepareFonts`, a layout worker's
// `registerFonts`), which remembers it here, or when a style sheet of the
// page declares it (`@font-face`, read through the CSSOM: a sheet of
// another origin loaded without CORS cannot be read). A host that declares
// faces any other way declares the feature family's itself.

import type { FontFaceLike, FontFaceSetLike } from './faces.js';
import { featureFamilyParts, fontFeatureSettings } from './figureStyle.js';

type FontFaceConstructor = new (family: string, source: string | ArrayBuffer | ArrayBufferView, descriptors?: FontFaceDescriptors) => FontFaceLike;

/** A face's file and descriptors, as a `FontFace` is made from them. */
export interface FaceSource {
  /** A CSS `src` value, or the file's bytes. */
  source: string | ArrayBuffer | ArrayBufferView;
  descriptors: FontFaceDescriptors;
}

const sources = new WeakMap<object, FaceSource>();

/** Remember the file `face` was made from, so a feature family of its
 *  family can be declared from it. */
export function rememberFaceSource(face: FontFaceLike, source: FaceSource['source'], descriptors: FontFaceDescriptors): void {
  sources.set(face, { source, descriptors });
}

function unquote(family: string): string {
  const f = family.trim();
  return /^(["']).*\1$/.test(f) ? f.slice(1, -1).trim() : f;
}

/** A `src` value with its `url()`s made absolute against `base` (a style
 *  sheet's URL): a `FontFace` resolves them against the document. */
function absoluteSrc(src: string, base: string | undefined): string {
  if (!base) return src;
  return src.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (whole, quote: string, url: string) => {
    try {
      return `url(${quote}${new URL(url, base).href}${quote})`;
    } catch {
      return whole;
    }
  });
}

interface SheetLike {
  href?: string | null;
  cssRules?: ArrayLike<RuleLike>;
}
interface RuleLike {
  type?: number;
  style?: { getPropertyValue(name: string): string };
  cssRules?: ArrayLike<RuleLike>;
  styleSheet?: SheetLike | null;
}

const FONT_FACE_RULE = 5;
const IMPORT_RULE = 3;

/** The `@font-face` rules of the page's style sheets for `family`. */
function sheetSources(family: string): FaceSource[] {
  const doc = (globalThis as { document?: { styleSheets?: ArrayLike<SheetLike>; baseURI?: string } }).document;
  if (!doc?.styleSheets) return [];
  const lower = family.toLowerCase();
  const out: FaceSource[] = [];
  const visit = (sheet: SheetLike | null | undefined, depth: number): void => {
    if (!sheet || depth > 4) return;
    let rules: ArrayLike<RuleLike> | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      // A sheet of another origin, loaded without CORS.
      return;
    }
    for (let i = 0; i < (rules?.length ?? 0); i++) {
      const rule = rules![i]!;
      if (rule.type === IMPORT_RULE) {
        visit(rule.styleSheet, depth + 1);
        continue;
      }
      if (rule.type !== FONT_FACE_RULE || !rule.style) continue;
      const read = (name: string): string => rule.style!.getPropertyValue(name).trim();
      if (unquote(read('font-family')).toLowerCase() !== lower) continue;
      const src = read('src');
      if (!src) continue;
      const descriptors: FontFaceDescriptors = {};
      const weight = read('font-weight');
      const style = read('font-style');
      const stretch = read('font-stretch');
      const range = read('unicode-range');
      if (weight) descriptors.weight = weight;
      if (style) descriptors.style = style;
      if (stretch) descriptors.stretch = stretch;
      if (range) descriptors.unicodeRange = range;
      out.push({ source: absoluteSrc(src, sheet.href ?? doc.baseURI), descriptors });
    }
  };
  for (let i = 0; i < doc.styleSheets.length; i++) visit(doc.styleSheets[i], 0);
  return out;
}

/** The files of `base`'s faces: those `fontSet` holds that the engine
 *  made, and those the page's style sheets declare. */
export function baseFaceSources(fontSet: Iterable<FontFaceLike>, base: string): FaceSource[] {
  const lower = base.toLowerCase();
  const out: FaceSource[] = [];
  for (const face of fontSet) {
    if (unquote(face.family).toLowerCase() !== lower) continue;
    const known = sources.get(face);
    if (known) out.push(known);
  }
  return [...out, ...sheetSources(base)];
}

/** The files each feature family's faces were made from, so each is
 *  declared once: a file's bytes by identity, a `src` value with its
 *  descriptors by text. */
interface Declared {
  bytes: WeakSet<object>;
  texts: Set<string>;
}
const declared = new WeakMap<FontFaceSetLike, Map<string, Declared>>();

function sourceKey(file: FaceSource): string {
  const d = file.descriptors;
  return `${String(file.source)}|${d.weight ?? ''}|${d.style ?? ''}|${d.stretch ?? ''}|${d.unicodeRange ?? ''}`;
}

/**
 * Declare in `fontSet` the faces of feature family `family` (`Lora@onum`)
 * from `files`, the files of its base family's faces, with the
 * `featureSettings` of its features; each file once (by its bytes, or its
 * `src` and descriptors), so a file the base family gains later is added
 * on the next call. Returns the faces added, unloaded: `fontSet.load`
 * loads the ones a text needs. None for a plain family, or with no
 * `FontFace` constructor.
 */
export function addFeatureFaces(fontSet: FontFaceSetLike, family: string, files: readonly FaceSource[], FontFaceCtor?: FontFaceConstructor): FontFaceLike[] {
  const parts = featureFamilyParts(family);
  if (parts.features.length === 0) return [];
  const Ctor = FontFaceCtor ?? (globalThis as { FontFace?: FontFaceConstructor }).FontFace;
  if (!Ctor) return [];
  let byFamily = declared.get(fontSet);
  if (!byFamily) declared.set(fontSet, (byFamily = new Map()));
  const name = unquote(family);
  let seen = byFamily.get(name.toLowerCase());
  if (!seen) byFamily.set(name.toLowerCase(), (seen = { bytes: new WeakSet(), texts: new Set() }));
  const featureSettings = fontFeatureSettings(parts.features);
  const added: FontFaceLike[] = [];
  for (const file of files) {
    if (typeof file.source === 'string') {
      const key = sourceKey(file);
      if (seen.texts.has(key)) continue;
      seen.texts.add(key);
    } else {
      if (seen.bytes.has(file.source)) continue;
      seen.bytes.add(file.source);
    }
    try {
      const face = new Ctor(name, file.source, { ...file.descriptors, featureSettings });
      fontSet.add(face);
      added.push(face);
    } catch {
      // A source the constructor refuses: the family stays as it is.
    }
  }
  return added;
}

/**
 * Declare in `fontSet` the faces of feature family `family` from the files
 * of its base family's faces the engine knows ({@link baseFaceSources}),
 * as {@link addFeatureFaces} does.
 */
export function declareFeatureFaces(fontSet: FontFaceSetLike, family: string, FontFaceCtor?: FontFaceConstructor): FontFaceLike[] {
  const parts = featureFamilyParts(family);
  if (parts.features.length === 0) return [];
  return addFeatureFaces(fontSet, family, baseFaceSources(fontSet, parts.family), FontFaceCtor);
}
