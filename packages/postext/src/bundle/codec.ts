// Bundle codec shared by every transport: a bundle is a directory-shaped set
// of files whether it is served over HTTP, read from a `.postext` zip or
// written out. `readBundle` turns manifest + files into chapters, config,
// resources and file payloads; `planBundle` / `resolveBundleFiles` do the
// reverse. Nothing here touches storage.

import type { PostextConfig, Resource } from '../types';
import { cloneDefaultColorPalette, defaultResourceTypes, stripConfigDefaults } from '../defaults';
import {
  bitmapInfo,
  chapterFileName,
  extensionForBitmapFormat,
  extensionForImageMime,
  extensionForResource,
  extensionForVideo,
  fontsToCustomFonts,
  isBitmapFile,
  isBundleManifest,
  isPdfFile,
  isSvgFile,
  mimeForFile,
  pickChapterSpecs,
  pickLocaleOverrides,
  resolveBundleConfigLocale,
  resolveBundleLocale,
  resourceFromSpec,
  slugify,
  svgSize,
  uniqueSlug,
} from './manifest';
import { CONFIG_VERSION, migrateBundleConfig } from './configVersion';
import type {
  BundleBlob,
  BundleCanvasScope,
  BundleChapter,
  BundleChapterSpec,
  BundleFileReader,
  BundleFontFamilySpec,
  BundleFontFile,
  BundleIdScheme,
  BundleImageSize,
  BundleLocaleOverrides,
  BundleManifest,
  BundleManifestV2,
  BundleResourceSpec,
} from './types';

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
   *  one exception: under a manifest older than `CONFIG_VERSION` whose
   *  chapters set maths, a base `math` that neither the manifest nor the
   *  locale replaces is pinned with the bundle's (`fontSizeScale` ×
   *  `LEGACY_MATH_SIZE`, see `pinLegacyMathSize`), since 1.4 set the
   *  bundle's formulas at that size; so is a base `layout`'s inline gap
   *  (`pinLegacyInlineGap`) when the chapters embed a resource, and its
   *  gap in boxes (`pinLegacyBoxResourceGap`) when they embed one inside a
   *  `:::callout`; a base `bodyText`'s colon-list room
   *  (`pinLegacyColonListRoom`) when they introduce a list with a colon; a
   *  base `headings`' inline marks (`pinLegacyHeadingMarks`) when a heading
   *  of theirs carries one; a base `layout`'s box cut
   *  (`pinLegacyBoxChildCut`) when they hold a `:::callout`; a base
   *  `bodyText`'s dash breaks (`pinLegacyDashBreaks`) when they set a dash
   *  closed between words, its compound breaks (`pinLegacyHyphenBreaks`)
   *  when they set a hyphen between two letters, and its ragged breaking
   *  (`pinLegacyRaggedBreaking`) when the configuration sets some running
   *  text ragged; a base `headings`' split under a heading
   *  (`pinLegacyHeadingSplit`) when they have a heading; a base
   *  `bodyText`'s space under `:::paragraphs` containers
   *  (`pinLegacyParagraphContainerSpacing`) when they hold one and the
   *  configuration declares a paragraph style; and the size of every drop
   *  cap in the base that names none (`pinLegacyDropCapSize`). */
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
   *  is read in today's terms (see `migrateConfig`): its heading breaks,
   *  its maths size when its chapters set maths, the space around its
   *  inline resources when they embed one (inside a box too, when a box
   *  embeds one), its headings' inline marks when a heading carries one,
   *  the size of its drop caps, the room kept for a list under a colon line
   *  when its chapters introduce one so, the lines a box cut leaves of a
   *  paragraph or list item when they hold a box, the line breaks after a
   *  closed dash when they set one, the line breaks at a compound's hyphen
   *  when they set one, the line-by-line breaking of its ragged text when
   *  it has some, the split of a paragraph under a heading when they have
   *  a heading, and the space under its `:::paragraphs` containers when
   *  they hold one, are the ones 1.4 laid out. The layout
   *  fixes of postext 1.5 that no pin holds back apply to it as to any
   *  book. */
  config: PostextConfig;
  resources: Resource[];
  /** Resource payloads (pictures and PDF print masters). */
  blobs: BundleBlob[];
  fonts: BundleFontFile[];
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
 *  written by postext 1.4 or earlier (no `configVersion`) keeps the heading
 *  breaks, the maths size, the space around inline resources in the text
 *  and inside boxes, the heading marks, the drop-cap sizes, the room under
 *  a colon line that introduces a list, the lines a box cut leaves of a
 *  paragraph or list item, the breaks at dashes and at compounds'
 *  hyphens, the breaking of ragged text, the split under a heading and the
 *  space under `:::paragraphs` containers it laid out then (see
 *  `pinLegacyHeadingBreaks`, `pinLegacyMathSize`, `pinLegacyInlineGap`,
 *  `pinLegacyBoxResourceGap`, `pinLegacyHeadingMarks`,
 *  `pinLegacyDropCapSize`, `pinLegacyColonListRoom`, `pinLegacyBoxChildCut`,
 *  `pinLegacyDashBreaks`, `pinLegacyHyphenBreaks`,
 *  `pinLegacyRaggedBreaking`, `pinLegacyHeadingSplit` and
 *  `pinLegacyParagraphContainerSpacing`). */
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
  const layoutPolicy = (overrides?.config?.layout ?? manifest.config?.layout ?? options.baseConfig?.layout)?.bitmapResolution;
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
  const fonts: BundleFontFile[] = await Promise.all(
    fontSet.files.map(async (f) => ({ ...f, bytes: await readFile(f.file) })),
  );

  // A manifest written for older rules (postext 1.4 or earlier has no
  // `configVersion`) is read with the heading breaks, the maths size and
  // the inline gap it laid out then. The reader's own base configuration
  // keeps its heading breaks, but its `math` and `layout`, when no layer
  // replaces them, are the ones 1.4 set the book with, so they are pinned
  // with the rest.
  const baseConfig = migrateBundleConfig(
    options.baseConfig ?? bundleBaseConfig(resolveBundleConfigLocale(manifest, locale)),
    [manifest.config ?? {}, overrides?.config ?? {}],
    manifest.configVersion,
    { content: chapters.map((c) => c.markdown) },
  );
  const customFonts = [...(manifest.config?.customFonts ?? []), ...fontSet.families];
  let config = customFonts.length > 0 ? { ...baseConfig, customFonts } : baseConfig;
  // An uploaded output profile (`print.customProfile`), named by its path in
  // the bundle.
  const profile = config.print?.customProfile;
  if (profile) {
    const bytes = await readFile(profile.fileId).catch(() => null);
    if (bytes) {
      blobs.push({ fileId: ids.blob(profile.fileId), file: profile.fileId, bytes, mime: 'application/vnd.iccprofile' });
      config = { ...config, print: { ...config.print, customProfile: { ...profile, fileId: ids.blob(profile.fileId) } } };
    } else {
      onWarning?.(`output profile "${profile.fileId}" not found, ignored`);
      const print = { ...config.print };
      delete print.customProfile;
      if (print.outputProfile === 'custom') delete print.outputProfile;
      config = { ...config, print };
    }
  }

  return { manifest, locale: served, chapters, config, resources, blobs, fonts };
}

// ---------------------------------------------------------------------------
// Writing

export interface BundleMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
}

/** What another locale of a bilingual bundle brings on top of the shared
 *  content (see {@link BundleContent.localized}). */
export interface BundleLocaleContent {
  /** The locale's own chapters, in book order. Absent: it reads the
   *  shared (primary) chapters. */
  chapters?: readonly { title: string; markdown: string }[];
  /** Top-level configuration keys for the locale, each replacing the
   *  shared key wholesale when read; a key equal to the shared one is not
   *  written. Fonts are shared: the families of `customFonts` join the
   *  bundle's. */
  config?: PostextConfig;
  /** The locale's wording and artwork of the shared resources, merged by
   *  id: `caption`, `note`, `altText`, `table`, and a picture of its own
   *  (`bitmap.fileId` / `svg.fileId`, `svg.pdfFileId`) when the artwork
   *  carries words. Other fields are shared; an id that is not among the
   *  resources is left out with a warning. */
  resources?: readonly (Pick<Resource, 'id'> & Partial<Resource>)[];
}

export interface BundleContent {
  chapters: readonly { title: string; markdown: string }[];
  config: PostextConfig;
  resources: readonly Resource[];
  /** Written as the manifest's `view` when it is not the default. */
  canvasScope?: BundleCanvasScope;
  /** The cover picture, carried as the manifest's `thumbnail`. */
  thumbnail?: { fileId: string; mime: string };
  /** Other locales of a bilingual bundle, by locale tag (`es`, `pt-BR`);
   *  `chapters`, `config` and `resources` are then the primary locale's
   *  (`BundleMeta.locale`, required). Written as the manifest's `locales`,
   *  a locale → chapters map (when any locale has chapters of its own) and
   *  `localized`. */
  localized?: Record<string, BundleLocaleContent>;
}

export interface PlannedFile {
  /** Path inside the bundle (`resources/x.png`, `fonts/y.ttf`). */
  path: string;
  fileId: string;
  kind: 'blob' | 'font';
  /** Resource id (blob) or family name (font), for warnings. */
  owner: string;
  /** Set on a picture only one locale reads (its own artwork). */
  locale?: string;
}

export interface BundlePlan {
  manifest: BundleManifestV2;
  files: PlannedFile[];
  /** Chapter file path → text, in book order (index-aligned with the
   *  content's chapters). */
  chapterFiles: { path: string; markdown: string }[];
  warnings: string[];
}

/** A resource minus the fields that only make sense in storage. */
function omitStorageFields(r: Resource): Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg'> {
  const copy: Partial<Resource> = { ...r };
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.bitmap;
  delete copy.svg;
  return copy as Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg'>;
}

/** Font formats a bundle may carry (`.woff` is rejected by the PDF backend
 *  and by `fontsToCustomFonts`). */
export const EXPORTABLE_FONT_FORMATS = ['ttf', 'otf', 'woff2'] as const;

/** Decide file names and the manifest for a bundle. Pure; the bytes are
 *  resolved by `resolveBundleFiles`. Fonts are declared in `fonts[]`,
 *  never inside `config.customFonts` (their ids are local to the writer). */
export function planBundle(meta: BundleMeta, content: BundleContent): BundlePlan {
  const warnings: string[] = [];
  const files: PlannedFile[] = [];
  const takenResourceNames = new Set<string>();
  const takenFontNames = new Set<string>();
  const localized = content.localized && Object.keys(content.localized).length > 0 ? content.localized : undefined;
  if (localized) {
    if (!meta.locale) throw new Error('planBundle: `localized` needs `locale`, the language of the shared content');
    for (const key of Object.keys(localized)) {
      if (key.trim().length === 0 || key.toLowerCase() === meta.locale.toLowerCase()) {
        throw new Error(`planBundle: \`localized\` names the primary locale "${key}" again`);
      }
    }
  }
  // File name (slug) of each resource with a payload, for the pictures a
  // locale brings of its own.
  const resourceNames = new Map<string, string>();

  const resources: BundleResourceSpec[] = [];
  for (const r of content.resources) {
    const { bitmap, svg } = r;
    const rest = omitStorageFields(r);
    if (r.kind === 'video' && r.video) {
      // A video (#454): its file (self-hosted) and its poster, side by side.
      const { fileId: videoFileId, poster, ...video } = r.video;
      const spec: BundleResourceSpec = { ...rest, video };
      if (videoFileId || poster) {
        const name = uniqueSlug(slugify(r.id), takenResourceNames, 'resource');
        takenResourceNames.add(name);
        resourceNames.set(r.id, name);
        if (videoFileId) {
          spec.file = `resources/${name}.${extensionForVideo(video.format)}`;
          files.push({ path: spec.file, fileId: videoFileId, kind: 'blob', owner: r.id });
        }
        if (poster) {
          spec.poster = `resources/${name}.poster.${extensionForBitmapFormat(poster.format)}`;
          files.push({ path: spec.poster, fileId: poster.fileId, kind: 'blob', owner: r.id });
          if (poster.width) spec.width = poster.width;
          if (poster.height) spec.height = poster.height;
        }
      }
      resources.push(spec);
      continue;
    }
    const ext = extensionForResource(r);
    const fileId = bitmap?.fileId ?? svg?.fileId;
    if (!ext || !fileId) {
      resources.push(rest);
      continue;
    }
    const name = uniqueSlug(slugify(r.id), takenResourceNames, 'resource');
    takenResourceNames.add(name);
    resourceNames.set(r.id, name);
    const path = `resources/${name}.${ext}`;
    files.push({ path, fileId, kind: 'blob', owner: r.id });
    let pdfFile: string | undefined;
    if (svg?.pdfFileId) {
      pdfFile = `resources/${name}.pdf`;
      files.push({ path: pdfFile, fileId: svg.pdfFileId, kind: 'blob', owner: r.id });
    }
    const width = bitmap?.width ?? svg?.width;
    const height = bitmap?.height ?? svg?.height;
    resources.push({
      ...rest,
      file: path,
      ...(pdfFile ? { pdfFile } : {}),
      ...(svg?.inlineFonts === false ? { inlineFonts: false as const } : {}),
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(bitmap?.resolution ? { resolution: bitmap.resolution } : {}),
      ...(bitmap?.fileResolution ? { fileResolution: bitmap.fileResolution } : {}),
    });
  }

  // Fonts are shared by every locale: a family only a locale's config
  // names joins the primary ones.
  const families = [...(content.config.customFonts ?? [])];
  for (const entry of Object.values(localized ?? {})) {
    for (const family of entry.config?.customFonts ?? []) {
      if (!families.some((f) => f.name === family.name)) families.push(family);
    }
  }
  const fonts: BundleFontFamilySpec[] = [];
  for (const family of families) {
    // A family the document may set but not pass on: its files stay behind
    // and no `fonts[]` entry names it, so the bundle opens with the
    // reader's own fallback for that family.
    if (family.redistributable === false) {
      warnings.push(`${family.name}: font files left out of the export (the family is not redistributable)`);
      continue;
    }
    const variants: BundleFontFamilySpec['variants'] = [];
    for (const v of family.variants) {
      if (!(EXPORTABLE_FONT_FORMATS as readonly string[]).includes(v.format)) {
        warnings.push(`${family.name}: variant ${v.weight} ${v.style} skipped (.${v.format} is not supported)`);
        continue;
      }
      const base = v.fileName ? slugify(v.fileName.replace(/\.[^.]+$/, '')) : '';
      const name = uniqueSlug(base || slugify(`${family.name}-${v.weight}-${v.style}`), takenFontNames, 'font');
      takenFontNames.add(name);
      const path = `fonts/${name}.${v.format}`;
      files.push({ path, fileId: v.fileId, kind: 'font', owner: family.name });
      variants.push({ weight: v.weight, style: v.style, file: path });
    }
    if (variants.length > 0) fonts.push({ name: family.name, variants });
  }

  const thumbExt = content.thumbnail ? extensionForImageMime(content.thumbnail.mime) : null;
  const thumbnailPath = content.thumbnail && thumbExt ? `thumbnail.${thumbExt}` : undefined;
  if (content.thumbnail && thumbnailPath) {
    files.push({ path: thumbnailPath, fileId: content.thumbnail.fileId, kind: 'blob', owner: 'thumbnail' });
  }

  const configWithoutFonts: Partial<PostextConfig> = { ...stripConfigDefaults(content.config) };
  delete configWithoutFonts.customFonts;
  // An uploaded output profile travels as a file, named by its path.
  const profile = configWithoutFonts.print?.customProfile;
  if (profile) {
    const path = `profiles/${slugify(profile.name) || 'output-profile'}.icc`;
    files.push({ path, fileId: profile.fileId, kind: 'blob', owner: 'print' });
    configWithoutFonts.print = { ...configWithoutFonts.print, customProfile: { ...profile, fileId: path } };
  }

  // Chapter files: `chapters/01-intro.md`, or one folder per locale when
  // any locale has chapters of its own (`chapters/es/01-intro.md`).
  const chapterFiles: BundlePlan['chapterFiles'] = [];
  const writeChapters = (chapters: readonly { title: string; markdown: string }[], folder?: string): BundleChapterSpec[] => {
    const taken = new Set<string>();
    return chapters.map((c, i) => {
      const name = chapterFileName(i, c.title, taken, chapters.length);
      const path = folder ? name.replace(/^chapters\//, `chapters/${folder}/`) : name;
      chapterFiles.push({ path, markdown: c.markdown });
      return { title: c.title, file: path };
    });
  };
  const perLocale = localized !== undefined && Object.values(localized).some((l) => l.chapters && l.chapters.length > 0);
  let chapterSpecs: BundleManifestV2['chapters'];
  if (localized && perLocale && meta.locale) {
    const primary = writeChapters(content.chapters, localeFolder(meta.locale));
    const map: Record<string, BundleChapterSpec[]> = { [meta.locale]: primary };
    for (const [locale, entry] of Object.entries(localized)) {
      map[locale] = entry.chapters && entry.chapters.length > 0 ? writeChapters(entry.chapters, localeFolder(locale)) : primary;
    }
    chapterSpecs = map;
  } else {
    chapterSpecs = writeChapters(content.chapters);
  }

  // Per locale, what differs from the shared content: configuration keys,
  // and the wording and artwork of resources.
  const localizedSpecs: Record<string, BundleLocaleOverrides> = {};
  const byId = new Map(content.resources.map((r) => [r.id, r]));
  for (const [locale, entry] of Object.entries(localized ?? {})) {
    const overrides: BundleLocaleOverrides = {};
    if (entry.config) {
      const config = localizedConfig(entry.config, configWithoutFonts, content.config);
      if (Object.keys(config).length > 0) overrides.config = config;
    }
    const wording: NonNullable<BundleLocaleOverrides['resources']> = [];
    for (const r of entry.resources ?? []) {
      const base = byId.get(r.id);
      if (!base) {
        warnings.push(`${r.id}: not among the resources, its ${locale} wording left out`);
        continue;
      }
      const spec: NonNullable<BundleLocaleOverrides['resources']>[number] = { id: r.id };
      for (const key of LOCALIZABLE_RESOURCE_FIELDS) {
        const value = r[key];
        if (value !== undefined && !sameJson(value, base[key])) (spec as Record<string, unknown>)[key] = value;
      }
      // Artwork of its own (a picture with words in it), written in the
      // locale's folder under the shared file's name.
      const merged = { ...base, ...r } as Resource;
      const ext = extensionForResource(merged);
      const fileId = r.bitmap?.fileId ?? r.svg?.fileId;
      const pdfFileId = r.svg?.pdfFileId;
      const ownFile = !!ext && !!fileId && fileId !== (base.bitmap?.fileId ?? base.svg?.fileId);
      const ownMaster = !!pdfFileId && pdfFileId !== base.svg?.pdfFileId && merged.kind === 'svg';
      let name = resourceNames.get(r.id);
      if ((ownFile || ownMaster) && name === undefined) {
        name = uniqueSlug(slugify(r.id), takenResourceNames, 'resource');
        takenResourceNames.add(name);
        resourceNames.set(r.id, name);
      }
      if (ownFile) {
        spec.file = `resources/${localeFolder(locale)}/${name}.${ext}`;
        files.push({ path: spec.file, fileId: fileId!, kind: 'blob', owner: r.id, locale });
        const width = r.bitmap?.width ?? r.svg?.width;
        const height = r.bitmap?.height ?? r.svg?.height;
        if (width) spec.width = width;
        if (height) spec.height = height;
        if (r.bitmap?.fileResolution) spec.fileResolution = r.bitmap.fileResolution;
      }
      if (r.bitmap?.resolution && r.bitmap.resolution !== base.bitmap?.resolution) spec.resolution = r.bitmap.resolution;
      if (ownMaster) {
        spec.pdfFile = `resources/${localeFolder(locale)}/${name}.pdf`;
        files.push({ path: spec.pdfFile, fileId: pdfFileId!, kind: 'blob', owner: r.id, locale });
      }
      if (Object.keys(spec).length > 1) wording.push(spec);
    }
    if (wording.length > 0) overrides.resources = wording;
    localizedSpecs[locale] = overrides;
  }

  const manifest: BundleManifestV2 = {
    version: 2,
    configVersion: CONFIG_VERSION,
    id: meta.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.locale ? { locale: meta.locale } : {}),
    ...(localized && meta.locale ? { locales: [meta.locale, ...Object.keys(localized)] } : {}),
    ...(thumbnailPath ? { thumbnail: thumbnailPath } : {}),
    ...(content.canvasScope === 'book' ? { view: { canvasScope: 'book' as const } } : {}),
    chapters: chapterSpecs,
    config: configWithoutFonts as PostextConfig,
    ...(resources.length > 0 ? { resources } : {}),
    ...(fonts.length > 0 ? { fonts } : {}),
    ...(localized ? { localized: localizedSpecs } : {}),
  };
  return { manifest, files, chapterFiles, warnings };
}

/** Resource fields a locale may word differently. */
const LOCALIZABLE_RESOURCE_FIELDS = ['caption', 'note', 'altText', 'table'] as const;

/** Folder a locale's own files are written in (`chapters/es/…`). */
function localeFolder(locale: string): string {
  return slugify(locale) || 'locale';
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The top-level keys of a locale's configuration that differ from the
 *  shared (stripped) configuration, each stripped of its defaults. A key
 *  whose value is all defaults while the shared one is not is written as
 *  given (`layout: {}`), so that it still replaces the shared key.
 *
 *  The locale is read as its keys over the shared ones, so the defaults
 *  that depend on the rest of the configuration (the language, the writing
 *  mode, a character grid) are those of that whole, `sharedSource` (the
 *  shared configuration as given) under `own` (#651): a locale that only
 *  sets `headings` on a shared character grid keeps `balancing.enabled:
 *  true`. A shared key the locale leaves out is written for it too when
 *  its own defaults keep a value the shared ones dropped (`index.see.italic:
 *  true` under a Japanese locale). */
function localizedConfig(own: PostextConfig, shared: Partial<PostextConfig>, sharedSource: PostextConfig): Partial<PostextConfig> {
  const raw = own as Record<string, unknown>;
  const base = shared as Record<string, unknown>;
  const whole: Record<string, unknown> = { ...sharedSource };
  for (const key of Object.keys(raw)) if (raw[key] !== undefined) whole[key] = raw[key];
  const stripped = stripConfigDefaults(whole as PostextConfig) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (key === 'customFonts' || raw[key] === undefined) continue;
    if (sameJson(stripped[key], base[key])) continue;
    out[key] = stripped[key] ?? raw[key];
  }
  const sharedStripped = stripConfigDefaults(sharedSource) as Record<string, unknown>;
  for (const key of Object.keys(sharedSource)) {
    if (key === 'customFonts' || raw[key] !== undefined) continue;
    if (!heldBy(stripped[key], sharedStripped[key])) out[key] = stripped[key];
  }
  return out as Partial<PostextConfig>;
}

/** Whether everything `value` sets is set the same in `holder` (which may
 *  set more): objects field by field, anything else as a whole. */
function heldBy(value: unknown, holder: unknown): boolean {
  if (value === undefined) return true;
  const fields = (v: unknown): Record<string, unknown> | undefined =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
  const a = fields(value);
  const b = fields(holder);
  if (a && b) return Object.keys(a).every((key) => heldBy(a[key], b[key]));
  return sameJson(value, holder);
}

export interface BundleByteSources {
  readBlob: (fileId: string) => Promise<ArrayBuffer | Uint8Array | null | undefined>;
  readFont: (fileId: string) => Promise<ArrayBuffer | Uint8Array | null | undefined>;
}

export interface ResolvedBundleFiles {
  /** Path → bytes, ready to zip (`preset.json` and chapters included). */
  files: Record<string, Uint8Array>;
  manifest: BundleManifestV2;
  warnings: string[];
  /** Planned paths whose bytes could not be read (and were dropped). */
  missing: string[];
}

function toBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

/** Resolve a plan's bytes. A resource whose payload is gone is dropped from
 *  the manifest (a spec without a file would come back as a broken
 *  figure); a font variant whose file is gone is dropped likewise, and its
 *  family with it when nothing remains. */
export async function resolveBundleFiles(plan: BundlePlan, sources: BundleByteSources): Promise<ResolvedBundleFiles> {
  const warnings = [...plan.warnings];
  const files: Record<string, Uint8Array> = {};
  const missingPaths = new Set<string>();

  await Promise.all(
    plan.files.map(async (f) => {
      const bytes = f.kind === 'blob'
        ? await Promise.resolve(sources.readBlob(f.fileId)).catch(() => null)
        : await Promise.resolve(sources.readFont(f.fileId)).catch(() => null);
      if (!bytes) {
        missingPaths.add(f.path);
        warnings.push(f.locale ? `${f.owner}: missing ${f.locale} file, the shared one is used` : `${f.owner}: missing file, skipped`);
        return;
      }
      files[f.path] = toBytes(bytes);
    }),
  );

  let manifest = plan.manifest;
  if (manifest.thumbnail && missingPaths.has(manifest.thumbnail)) {
    manifest = { ...manifest };
    delete manifest.thumbnail;
  }
  if (missingPaths.size > 0) {
    const resources = manifest.resources
      // A video keeps its address and player without its file or poster.
      ?.filter((r) => r.kind === 'video' || !r.file || !missingPaths.has(r.file))
      .map((r) => {
        if (r.kind === 'video') {
          const spec = { ...r };
          if (spec.file && missingPaths.has(spec.file)) delete spec.file;
          if (spec.poster && missingPaths.has(spec.poster)) {
            delete spec.poster;
            delete spec.width;
            delete spec.height;
          }
          return spec;
        }
        return r.pdfFile && missingPaths.has(r.pdfFile) ? { ...r, pdfFile: undefined } : r;
      });
    const fonts = manifest.fonts
      ?.map((fam) => ({ ...fam, variants: fam.variants.filter((v) => !missingPaths.has(v.file)) }))
      .filter((fam) => fam.variants.length > 0);
    manifest = {
      ...manifest,
      ...(resources && resources.length > 0 ? { resources } : {}),
      ...(fonts && fonts.length > 0 ? { fonts } : {}),
    };
    if (!resources || resources.length === 0) delete manifest.resources;
    if (!fonts || fonts.length === 0) delete manifest.fonts;
    // A locale whose own artwork is missing reads the shared picture.
    if (manifest.localized) {
      const localized: Record<string, BundleLocaleOverrides> = {};
      for (const [locale, overrides] of Object.entries(manifest.localized)) {
        const wording = overrides.resources
          ?.map((r) => {
            const spec = { ...r };
            if (spec.file && missingPaths.has(spec.file)) {
              delete spec.file;
              delete spec.width;
              delete spec.height;
              delete spec.pdfFile;
            }
            if (spec.pdfFile && missingPaths.has(spec.pdfFile)) delete spec.pdfFile;
            return spec;
          })
          .filter((r) => Object.keys(r).length > 1);
        const next: BundleLocaleOverrides = { ...overrides };
        if (wording && wording.length > 0) next.resources = wording;
        else delete next.resources;
        localized[locale] = next;
      }
      manifest = { ...manifest, localized };
    }
  }

  const enc = new TextEncoder();
  files['preset.json'] = enc.encode(JSON.stringify(manifest, null, 2));
  for (const c of plan.chapterFiles) files[c.path] = enc.encode(c.markdown);
  return { files, manifest, warnings, missing: [...missingPaths] };
}
