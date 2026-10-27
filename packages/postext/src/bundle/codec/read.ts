// Reading a bundle: manifest + files into chapters, config, resources and
// file payloads, over the default base configuration.
import { scoreFormatOfFile } from '../../music/types.js';
import type { PostextConfig, Resource, CustomFontFamily } from '../../types.js';
import { cloneDefaultColorPalette, defaultResourceTypes } from '../../defaults/index.js';
import { isBundleManifest, resolveBundleLocale, svgSize, bitmapInfo, pickChapterSpecs, pickLocaleOverrides, mimeForFile, isBitmapFile, resourceFromSpec, isSvgFile, isPdfFile, fontsToCustomFonts, resolveBundleConfigLocale, pickBundleStart } from '../manifest.js';
import { migrateBundleConfig } from '../configVersion.js';
import type { TraceContourOptions } from '../../contour/index.js';
import type { BundleIdScheme, BundleImageSize, BundleManifest, BundleChapter, BundleBlob, BundleFontFile, BundleStart, BundleFileReader, BundleResourceSpec } from '../types.js';
import { traceBundleContours } from './plan.js';

/** The configuration a bundle's own `config` is laid over: the default
 *  colour palette plus the built-in resource types localised to `locale`
 *  (what the Sandbox starts every document from). */
export function bundleBaseConfig(locale = 'en'): PostextConfig {
  return { colorPalette: cloneDefaultColorPalette(), resourceTypes: defaultResourceTypes(locale) };
}

export interface ReadBundleOptions {
  /** Locale to read a bilingual bundle in. Defaults to the manifest's own
   *  locale, else `en`. */
  locale?: string;
  /** How loaded files are named (`fileId`). Defaults to their path. */
  ids?: BundleIdScheme;
  /** Configuration under the manifest's `config`. Defaults to
   *  `bundleBaseConfig()` in the language of the bundle
   *  (`resolveBundleConfigLocale(manifest, locale)`: the locale it serves,
   *  or the language its `config` names when the manifest names none), so
   *  a bundle in one language gets resource types in that language,
   *  whatever `locale` asks for. A host that passes its own base should
   *  localise it to the same language. It is taken in today's terms, with
   *  one exception: under a manifest older than `CONFIG_VERSION`, the pins
   *  its stamp calls for (see `migrateBundleConfig`) also apply to the keys
   *  of the base that the manifest and the locale leave in force, all but
   *  the heading breaks, since the old reader laid the bundle out with
   *  them too: a base `math` is pinned with the bundle's maths size
   *  (`fontSizeScale` × `LEGACY_MATH_SIZE`), a base `layout` with its
   *  inline gap, a base `bodyText` with its dash breaks, and so on, each
   *  under the same conditions on the chapters and the configuration as a
   *  key of the manifest. */
  baseConfig?: PostextConfig;
  /** Intrinsic size of an SVG whose spec omits it. Defaults to `svgSize`. */
  measureSvg?: (markup: string) => BundleImageSize | undefined;
  /** Intrinsic size of a bitmap whose spec omits it, and the resolution
   *  its file states when there is one (`BundleImageSize.resolution`).
   *  Defaults to reading the image header (`bitmapInfo`). */
  measureBitmap?: (bytes: ArrayBuffer, mime: string) => Promise<BundleImageSize | undefined> | BundleImageSize | undefined;
  /** Read each bitmap's resolution from its file into
   *  `Resource.bitmap.fileResolution` when its spec gives none (#631).
   *  Defaults to true when the bundle's `layout.bitmapResolution` is
   *  `'file'`, the one policy that lays the pictures out by it; else the
   *  resources come back as the manifest declares them. */
  readResolution?: boolean;
  onWarning?: (message: string) => void;
  /** Trace the alpha channel of the pictures a contour wrap runs round
   *  (#883) into `contour.traced`: those whose `contour` is set or whose
   *  placement (or type) says `wrap: 'contour'`, and every bitmap when a
   *  page template has a frame with `wrap: 'contour'`. Default `true`. */
  traceContours?: boolean;
  /** Decode a picture the engine does not read itself (a WebP, a GIF) for
   *  the trace (see `traceResourceContour`). */
  decodeContour?: TraceContourOptions['decode'];
}

export interface ReadBundleResult {
  manifest: BundleManifest;
  /** The locale the content was resolved for (the chapter-map key a
   *  bilingual bundle served, else the manifest's locale, else the one
   *  asked for). */
  locale: string;
  chapters: BundleChapter[];
  /** Base config + manifest `config` + the locale's overrides, with the
   *  bundle's font families appended to `customFonts`. A manifest stored
   *  under older rules than `CONFIG_VERSION` (none: postext 1.4 or earlier)
   *  is read in today's terms (see `migrateBundleConfig`): every pin its
   *  stamp calls for, from the heading breaks and the maths size of 1.4 on,
   *  keeps what that version laid out (most only when the chapters show
   *  something they are for). The layout fixes that no pin holds back apply to it as to any
   *  book. */
  config: PostextConfig;
  /** The book's general settings (#1209), for a bundle in several
   *  languages: the base config and the manifest's `config` without the
   *  locale's override, read under the same rules and with the same
   *  fonts. An editor keeps it as the layer every edition shares and the
   *  difference to `config` as this language's own. */
  sharedConfig?: PostextConfig;
  resources: Resource[];
  /** Resource payloads (pictures and PDF print masters). */
  blobs: BundleBlob[];
  fonts: BundleFontFile[];
  /** Where the book starts, for a bundle that holds part of a longer one
   *  (the manifest's `start`, or the locale's own): the `continuation` of
   *  the first chapter. Absent for a book that starts at its beginning. */
  start?: BundleStart;
}

const identityIds: BundleIdScheme = { blob: (f) => f, font: (f) => f };

/** Chapter files a bundle reads at once. */
const CHAPTER_READ_CONCURRENCY = 8;

/** `items` mapped by `fn`, at most `limit` calls in flight, results in the
 *  order of `items`. The first rejection rejects the whole (calls already
 *  started run to their end; no new one starts). */
async function mapConcurrent<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

/** Read a manifest plus its files. Throws on an invalid manifest or a
 *  missing chapter, picture or font file. The configuration of a manifest
 *  stored under older rules than `CONFIG_VERSION` (none: postext 1.4 or
 *  earlier) keeps what that version laid out: the pins its stamp calls for
 *  (see `migrateBundleConfig`) apply to the manifest, the locale's
 *  overrides and the keys of the base they leave in force (all but the
 *  heading breaks). */
export async function readBundle(
  manifest: unknown,
  readFile: BundleFileReader,
  options: ReadBundleOptions = {},
): Promise<ReadBundleResult> {
  if (!isBundleManifest(manifest)) throw new Error('Invalid bundle manifest (preset.json)');
  const locale = options.locale ?? manifest.locale ?? 'en';
  // The language the content comes in: a single-language bundle serves its
  // own whatever the reader asks for, so its default resource types
  // ("Figura", "Tabla") follow that, not the reader's locale (EF-150).
  const served = resolveBundleLocale(manifest, locale);
  const ids = options.ids ?? identityIds;
  const onWarning = options.onWarning;
  const measureSvg = options.measureSvg ?? svgSize;
  const measureBitmap = options.measureBitmap ?? ((bytes: ArrayBuffer) => bitmapInfo(bytes));

  const decoder = new TextDecoder();
  // Only the chosen locale's chapters, several at a time (a 120-chapter
  // book is 120 round trips over HTTP), in manifest order.
  const chapters: BundleChapter[] = await mapConcurrent(
    pickChapterSpecs(manifest, locale),
    CHAPTER_READ_CONCURRENCY,
    async (spec) => ({ title: spec.title, file: spec.file, markdown: decoder.decode(await readFile(spec.file)) }),
  );

  // A bilingual bundle's per-locale wording: resource captions, notes and
  // alt texts merged by id, config keys replaced wholesale.
  const overrides = pickLocaleOverrides(manifest, locale);
  const wordingById = new Map((overrides?.resources ?? []).map((r) => [r.id, r]));
  const localizedSpecs: BundleResourceSpec[] = (manifest.resources ?? []).map((spec) => {
    const wording = wordingById.get(spec.id);
    if (!wording) return spec;
    const merged: BundleResourceSpec = { ...spec, ...wording, id: spec.id };
    // Artwork swapped for this locale: the shared spec's intrinsic size
    // describes the other file, so it is read from the bytes instead.
    if ((wording.file && wording.file !== spec.file) || (wording.poster && wording.poster !== spec.poster)) {
      if (wording.width === undefined) delete merged.width;
      if (wording.height === undefined) delete merged.height;
      if (wording.pdfFile === undefined) delete merged.pdfFile;
      if (wording.fileResolution === undefined) delete merged.fileResolution;
    }
    return merged;
  });

  // The file's own resolution, when the pictures are laid out by it.
  const localeLayout = (overrides?.config as Partial<PostextConfig> | undefined)?.layout;
  const layoutPolicy = (localeLayout?.bitmapResolution !== undefined ? localeLayout : manifest.config?.layout ?? options.baseConfig?.layout)?.bitmapResolution;
  const readResolution = options.readResolution ?? layoutPolicy === 'file';

  const blobs: BundleBlob[] = [];
  const resources: Resource[] = await Promise.all(
    localizedSpecs.map(async (spec) => {
      const file = spec.file;
      if (spec.kind === 'video') {
        // A video (#454): the file it plays (self-hosted) and its poster.
        if (file) {
          const bytes = await readFile(file).catch(() => null);
          if (bytes) blobs.push({ fileId: ids.blob(file), file, bytes, mime: mimeForFile(file) });
          else onWarning?.(`${spec.id}: video "${file}" not found, ignored`);
        }
        let resolved = spec;
        let size: BundleImageSize | undefined;
        if (spec.poster) {
          const bytes = isBitmapFile(spec.poster) ? await readFile(spec.poster).catch(() => null) : null;
          if (bytes) {
            const mime = mimeForFile(spec.poster);
            blobs.push({ fileId: ids.blob(spec.poster), file: spec.poster, bytes, mime });
            if (spec.width === undefined || spec.height === undefined) size = await measureBitmap(bytes, mime);
          } else {
            onWarning?.(`${spec.id}: poster "${spec.poster}" not found or not a picture, ignored`);
            resolved = { ...spec, poster: undefined };
          }
        }
        return resourceFromSpec(resolved, size, ids.blob);
      }
      if (spec.kind === 'score' || (file && scoreFormatOfFile(file))) {
        // A music example (#1172): a notation file's text is the score.
        const bytes = file ? await readFile(file).catch(() => null) : null;
        if (file && !bytes) onWarning?.(`${spec.id}: score "${file}" not found, ignored`);
        const source = bytes ? decoder.decode(bytes) : spec.score?.source ?? '';
        const format = spec.score?.format ?? (file ? scoreFormatOfFile(file) : undefined) ?? 'abc';
        return resourceFromSpec({ ...spec, kind: 'score', file: undefined, score: { ...spec.score, format, source } }, undefined, ids.blob);
      }
      if (!file) return resourceFromSpec(spec, undefined, ids.blob);
      const mime = mimeForFile(file);
      const bytes = await readFile(file);
      blobs.push({ fileId: ids.blob(file), file, bytes, mime });
      // Optional vector print master next to an SVG: a missing or non-PDF
      // file only costs the master, never the figure.
      let resolved = spec;
      const pdfFile = spec.pdfFile;
      if (pdfFile && isSvgFile(file)) {
        const master = isPdfFile(pdfFile) ? await readFile(pdfFile).catch(() => null) : null;
        if (master) {
          blobs.push({ fileId: ids.blob(pdfFile), file: pdfFile, bytes: master, mime: mimeForFile(pdfFile) });
        } else {
          onWarning?.(`${spec.id}: print master "${pdfFile}" ${isPdfFile(pdfFile) ? 'not found' : 'is not a .pdf'}, ignored`);
          resolved = { ...spec, pdfFile: undefined };
        }
      }
      let size: BundleImageSize | undefined;
      if (spec.width === undefined || spec.height === undefined) {
        if (isSvgFile(file)) size = measureSvg(decoder.decode(bytes));
        else if (isBitmapFile(file)) size = await measureBitmap(bytes, mime);
      }
      if (isBitmapFile(file)) {
        if (!readResolution) {
          if (size?.resolution) size = { width: size.width, height: size.height };
        } else if (resolved.fileResolution === undefined && !size?.resolution) {
          const info = bitmapInfo(bytes);
          if (info?.resolution) size = { ...(size ?? { width: info.width, height: info.height }), resolution: info.resolution };
        }
      }
      return resourceFromSpec(resolved, size, ids.blob);
    }),
  );

  const fontSet = fontsToCustomFonts(manifest.fonts ?? [], ids.font);
  for (const w of fontSet.warnings) onWarning?.(w);
  // A font file the manifest names but the bundle does not carry (a pack
  // that left the licensed faces out, #904) is not an error: the face is
  // dropped with a warning, and the families the book sets in it fall back
  // as any missing font does (the Sandbox's font checks report them).
  // A family that names a `fallback` (#978) is kept even with no file of
  // its own: hosts set its missing faces in the fallback, and one warning
  // says so in place of one per file.
  const fallbackOf = new Map(fontSet.families.flatMap((f) => (f.fallback ? [[f.name, f.fallback] as const] : [])));
  const notPacked = new Set<string>();
  const read = await Promise.all(
    fontSet.files.map(async (f): Promise<BundleFontFile | null> => {
      try {
        return { ...f, bytes: await readFile(f.file) };
      } catch {
        notPacked.add(f.fileId);
        if (!fallbackOf.has(f.family)) onWarning?.(`${f.family}: font file "${f.file}" is not in the bundle, the face is left out`);
        return null;
      }
    }),
  );
  const fonts = read.filter((f): f is BundleFontFile => f !== null);
  const families: CustomFontFamily[] = [];
  for (const family of fontSet.families) {
    const variants = family.variants.filter((v) => !notPacked.has(v.fileId));
    const fallback = fallbackOf.get(family.name);
    if (fallback) {
      if (variants.length < family.variants.length || family.variants.length === 0) {
        onWarning?.(`${family.name}: ${variants.length === 0 ? 'none of its font files are' : 'some of its font files are not'} in the bundle, those faces are set in ${fallback}`);
      }
      families.push(variants.length === family.variants.length ? family : { ...family, variants });
    } else if (variants.length > 0) families.push(variants.length === family.variants.length ? family : { ...family, variants });
    else onWarning?.(`${family.name}: none of its font files are in the bundle, it is left out`);
  }

  // A manifest written for older rules (postext 1.4 or earlier has no
  // `configVersion`) is read with what its version laid out. The reader's
  // own base configuration keeps its heading breaks, but its other keys,
  // when no layer replaces them, are the ones the old reader set the book
  // with, so they are pinned with the rest.
  const readerBase = options.baseConfig ?? bundleBaseConfig(resolveBundleConfigLocale(manifest, locale));
  const migrateOptions = { content: chapters.map((c) => c.markdown) };
  const baseConfig = migrateBundleConfig(readerBase, [manifest.config ?? {}, overrides?.config ?? {}], manifest.configVersion, migrateOptions);
  const customFonts = [...(manifest.config?.customFonts ?? []), ...families];
  let config = customFonts.length > 0 ? { ...baseConfig, customFonts } : baseConfig;
  // A book in several languages: its general settings, the shared layer
  // alone, read the same way (#1209).
  let sharedConfig: PostextConfig | undefined;
  if (manifest.localized && Object.keys(manifest.localized).length > 0) {
    const shared = overrides?.config ? migrateBundleConfig(readerBase, [manifest.config ?? {}], manifest.configVersion, migrateOptions) : baseConfig;
    sharedConfig = customFonts.length > 0 ? { ...shared, customFonts } : shared;
  }
  // An uploaded output profile (`print.customProfile`), named by its path in
  // the bundle.
  const profile = config.print?.customProfile;
  if (profile) {
    const bytes = await readFile(profile.fileId).catch(() => null);
    if (bytes) {
      blobs.push({ fileId: ids.blob(profile.fileId), file: profile.fileId, bytes, mime: 'application/vnd.iccprofile' });
      config = { ...config, print: { ...config.print, customProfile: { ...profile, fileId: ids.blob(profile.fileId) } } };
      if (sharedConfig?.print?.customProfile?.fileId === profile.fileId) {
        sharedConfig = { ...sharedConfig, print: { ...sharedConfig.print, customProfile: { ...sharedConfig.print.customProfile, fileId: ids.blob(profile.fileId) } } };
      }
    } else {
      onWarning?.(`output profile "${profile.fileId}" not found, ignored`);
      const print = { ...config.print };
      delete print.customProfile;
      if (print.outputProfile === 'custom') delete print.outputProfile;
      config = { ...config, print };
    }
  }

  const start = pickBundleStart(manifest, locale);
  const traced = options.traceContours === false
    ? resources
    : await traceBundleContours(resources, blobs, config, options.decodeContour ? { decode: options.decodeContour } : {});
  return { manifest, locale: served, chapters, config, ...(sharedConfig ? { sharedConfig } : {}), resources: traced, blobs, fonts, ...(start ? { start } : {}) };
}
