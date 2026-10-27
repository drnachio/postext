// Planning a bundle from a document: the files to write, their paths and
// the manifest, with contour tracing and per-locale overrides.
import type { PostextConfig, Resource } from '../../types.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { type ConfigOverride, leastConfigOverride } from '../../defaults/configLayers.js';
import { uniqueSlug, slugify, extensionForVideo, extensionForBitmapFormat, extensionForResource, extensionForImageMime, chapterFileName, bundleStart } from '../manifest.js';
import { CONFIG_VERSION } from '../configVersion.js';
import { type TraceContourOptions, contourWantsAlpha, contourRowsOf, traceResourceContour, withContourTrace } from '../../contour/index.js';
import type { BundleStart, BundleCanvasScope, BundleManifestV2, BundleBlob, BundleResourceSpec, BundleFontFamilySpec, BundleChapterSpec, BundleLocaleOverrides } from '../types.js';

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
  /** The book's title in this language, written as `localized[…].name`
   *  when it is not the shared `name` (#891). */
  name?: string;
  /** The description in this language, likewise. */
  description?: string;
  /** The locale's own chapters, in book order. Absent: it reads the
   *  shared (primary) chapters. */
  chapters?: readonly { title: string; markdown: string }[];
  /** The locale's configuration: its top-level keys over the shared
   *  configuration's (or, with `BundleContent.sharedConfig`, the whole
   *  configuration of the edition). Written as an override of the fields
   *  that differ from the shared settings, merged over them field by field
   *  when read (#1209). Fonts are shared: the families of `customFonts`
   *  join the bundle's. */
  config?: PostextConfig;
  /** The locale's wording and artwork of the shared resources, merged by
   *  id: `caption`, `note`, `altText`, `table`, and a picture of its own
   *  (`bitmap.fileId` / `svg.fileId`, `svg.pdfFileId`) when the artwork
   *  carries words. Other fields are shared; an id that is not among the
   *  resources is left out with a warning. */
  resources?: readonly (Pick<Resource, 'id'> & Partial<Resource>)[];
  /** Where the locale's edition starts, when not where the shared one
   *  does (see {@link BundleContent.start}). */
  start?: BundleStart;
}

export interface BundleContent {
  chapters: readonly { title: string; markdown: string }[];
  /** The primary edition's configuration. */
  config: PostextConfig;
  /** The book's general settings (#1209), when they are not the primary
   *  edition's: written as the manifest's `config`, and every edition, the
   *  primary included (`BundleMeta.locale`), as an override over them
   *  (`localized[…].config`). `config` and each `localized[…].config` are
   *  then whole configurations. Absent, the primary's `config` is the
   *  shared one. */
  sharedConfig?: PostextConfig;
  resources: readonly Resource[];
  /** Written as the manifest's `view` when it is not the default. */
  canvasScope?: BundleCanvasScope;
  /** The cover picture, carried as the manifest's `thumbnail`. */
  thumbnail?: { fileId: string; mime: string };
  /** Where the book starts, for a bundle that holds part of a longer one:
   *  the `continuation` its first chapter is laid out with, written as the
   *  manifest's `start`. Left out, or empty, nothing is written. */
  start?: BundleStart;
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
  /** The paths of the chapters a locale has of its own (`localized[…]` with
   *  `chapters`), in book order, by locale: what a host that writes a
   *  pagination file per language (`layouts.<locale>.json`) keys it by.
   *  Absent for a locale that reads the primary chapters. */
  localeChapterFiles?: Record<string, string[]>;
  warnings: string[];
}

/** Whether a configuration has a page-template frame that pushes with its
 *  pictures' contour (#883). */
function configWrapsContours(config: PostextConfig): boolean {
  const frames = (patch: { frames?: { wrap?: string }[] } | undefined): boolean => (patch?.frames ?? []).some((f) => f?.wrap === 'contour');
  return (config.pageTemplates ?? []).some((t) => frames(t) || frames(t.variants?.recto) || frames(t.variants?.verso));
}

/**
 * Trace the alpha channel of the bitmaps a contour wrap runs round (#883):
 * those with a `contour`, or whose placement or type wraps by contour, and
 * all of them when a frame of the configuration does. A picture whose
 * trace is already there (this file, this threshold) keeps it.
 */
export async function traceBundleContours(
  resources: Resource[],
  blobs: readonly BundleBlob[],
  config: PostextConfig,
  options: TraceContourOptions = {},
): Promise<Resource[]> {
  const all = configWrapsContours(config);
  const types = new Map((config.resourceTypes ?? []).map((t) => [t.id, t]));
  const bytesOf = new Map(blobs.map((b) => [b.fileId, b]));
  return Promise.all(resources.map(async (r) => {
    if (!r.bitmap || !contourWantsAlpha(r)) return r;
    const wants = all || r.contour !== undefined || (r.placement?.wrap ?? types.get(r.typeId)?.defaultPlacement?.wrap) === 'contour';
    if (!wants) return r;
    if (r.contour?.traced && contourRowsOf(r)) return r;
    const blob = bytesOf.get(r.bitmap.fileId);
    if (!blob) return r;
    const trace = await traceResourceContour(r, blob.bytes, blob.mime, options);
    return trace ? withContourTrace(r, trace) : r;
  }));
}

/** A resource minus the fields that only make sense in storage, and the
 *  alpha trace of its contour (#883), which the reader makes again from
 *  the file. */
function omitStorageFields(r: Resource): Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg'> {
  const copy: Partial<Resource> = { ...r };
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.bitmap;
  delete copy.svg;
  if (copy.contour?.traced) {
    const { traced: _t, ...contour } = copy.contour;
    void _t;
    copy.contour = contour;
  }
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
      // A family with a `fallback` (#978) is still named, with no file, so
      // the book that opens without its faces sets them in the fallback.
      if (family.fallback) {
        warnings.push(`${family.name}: font files left out of the export (the family is not redistributable); the bundle names ${family.fallback} to set it in`);
        fonts.push({ name: family.name, variants: [], redistributable: false, fallback: family.fallback });
      } else {
        warnings.push(`${family.name}: font files left out of the export (the family is not redistributable)`);
      }
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
    if (variants.length > 0 || family.fallback) {
      fonts.push({ name: family.name, variants, ...(family.fallback ? { fallback: family.fallback } : {}) });
    }
  }

  const thumbExt = content.thumbnail ? extensionForImageMime(content.thumbnail.mime) : null;
  const thumbnailPath = content.thumbnail && thumbExt ? `thumbnail.${thumbExt}` : undefined;
  if (content.thumbnail && thumbnailPath) {
    files.push({ path: thumbnailPath, fileId: content.thumbnail.fileId, kind: 'blob', owner: 'thumbnail' });
  }

  const sharedSource = content.sharedConfig ?? content.config;
  const configWithoutFonts: Partial<PostextConfig> = { ...stripConfigDefaults(sharedSource) };
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
  const localeChapterFiles: Record<string, string[]> = {};
  if (localized && perLocale && meta.locale) {
    const primary = writeChapters(content.chapters, localeFolder(meta.locale));
    const map: Record<string, BundleChapterSpec[]> = { [meta.locale]: primary };
    for (const [locale, entry] of Object.entries(localized)) {
      if (entry.chapters && entry.chapters.length > 0) {
        map[locale] = writeChapters(entry.chapters, localeFolder(locale));
        localeChapterFiles[locale] = map[locale].map((c) => c.file);
      } else map[locale] = primary;
    }
    chapterSpecs = map;
  } else {
    chapterSpecs = writeChapters(content.chapters);
  }

  const start = bundleStart(content.start);

  // Per locale, what differs from the shared content: configuration keys,
  // and the wording and artwork of resources.
  const localizedSpecs: Record<string, BundleLocaleOverrides> = {};
  const byId = new Map(content.resources.map((r) => [r.id, r]));
  for (const [locale, entry] of Object.entries(localized ?? {})) {
    const overrides: BundleLocaleOverrides = {};
    if (entry.name && entry.name !== meta.name) overrides.name = entry.name;
    if (entry.description && entry.description !== meta.description) overrides.description = entry.description;
    if (entry.config) {
      const config = localizedConfig(entry.config, configWithoutFonts, sharedSource, !!content.sharedConfig);
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
    // A start of its own, when it is not the shared one; an empty one
    // says the locale's edition starts at its beginning.
    if (entry.start !== undefined) {
      const own = bundleStart(entry.start);
      if (!sameJson(own, start)) overrides.start = own ?? {};
    }
    localizedSpecs[locale] = overrides;
  }

  // General settings of their own: the primary edition is an override too.
  if (content.sharedConfig && meta.locale) {
    const config = localizedConfig(content.config, configWithoutFonts, sharedSource, true);
    if (Object.keys(config).length > 0) localizedSpecs[meta.locale] = { config, ...localizedSpecs[meta.locale] };
  }
  const writesLocalized = Object.keys(localizedSpecs).length > 0;

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
    ...(start ? { start } : {}),
    chapters: chapterSpecs,
    config: configWithoutFonts as PostextConfig,
    ...(resources.length > 0 ? { resources } : {}),
    ...(fonts.length > 0 ? { fonts } : {}),
    ...(localized || writesLocalized ? { localized: localizedSpecs } : {}),
  };
  return { manifest, files, chapterFiles, ...(Object.keys(localeChapterFiles).length > 0 ? { localeChapterFiles } : {}), warnings };
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

/** A locale's configuration as an override of the shared (stripped)
 *  settings (#1209): the fields it sets differently, `null` for a shared
 *  value it reads at its default (see `mergeConfigLayers`).
 *
 *  The locale is stripped of its defaults as a whole, so the defaults that
 *  depend on the rest of the configuration (the language, the writing
 *  mode, a character grid) are its own: a value the shared settings drop
 *  as a default of their language is written for a locale whose default
 *  differs (`index.see.italic: true` under a Japanese locale), and one
 *  they keep that is the locale's default is not taken out by mistake.
 *  `own` is the whole edition (`whole`), or its top-level keys over the
 *  shared ones (#651: a locale that only sets `headings` on a shared
 *  character grid keeps `balancing.enabled: true`). */
function localizedConfig(own: PostextConfig, shared: Partial<PostextConfig>, sharedSource: PostextConfig, whole: boolean): ConfigOverride {
  const merged: Record<string, unknown> = whole ? { ...own } : { ...sharedSource };
  if (!whole) for (const [key, value] of Object.entries(own)) if (value !== undefined) merged[key] = value;
  const target = stripConfigDefaults(merged as PostextConfig) as Record<string, unknown>;
  delete target.customFonts;
  // The output profile travels once, under the shared name of its file.
  const profile = (target.print as PostextConfig['print'])?.customProfile;
  if (profile && profile.fileId === sharedSource.print?.customProfile?.fileId && shared.print?.customProfile) {
    target.print = { ...(target.print as object), customProfile: shared.print.customProfile };
  }
  // A `null` the locale reads the same without (the shared value is its
  // default too) is not written.
  return leastConfigOverride(shared as PostextConfig, target as PostextConfig, (c) => {
    const out = stripConfigDefaults(c) as Record<string, unknown>;
    delete out.customFonts;
    return out as PostextConfig;
  });
}
