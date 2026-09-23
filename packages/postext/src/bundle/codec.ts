// Bundle codec shared by every transport: a bundle is a directory-shaped set
// of files whether it is served over HTTP, read from a `.postext` zip or
// written out. `readBundle` turns manifest + files into chapters, config,
// resources and file payloads; `planBundle` / `resolveBundleFiles` do the
// reverse. Nothing here touches storage.

import type { PostextConfig, Resource } from '../types';
import { cloneDefaultColorPalette, defaultResourceTypes, stripConfigDefaults } from '../defaults';
import {
  bitmapSize,
  chapterFileName,
  extensionForImageMime,
  extensionForResource,
  fontsToCustomFonts,
  isBitmapFile,
  isBundleManifest,
  isPdfFile,
  isSvgFile,
  mimeForFile,
  pickChapterSpecs,
  pickLocaleOverrides,
  resolveBundleLocale,
  resourceFromSpec,
  slugify,
  svgSize,
  uniqueSlug,
} from './manifest';
import type {
  BundleBlob,
  BundleCanvasScope,
  BundleChapter,
  BundleFileReader,
  BundleFontFamilySpec,
  BundleFontFile,
  BundleIdScheme,
  BundleImageSize,
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
   *  `bundleBaseConfig(locale)`. */
  baseConfig?: PostextConfig;
  /** Intrinsic size of an SVG whose spec omits it. Defaults to `svgSize`. */
  measureSvg?: (markup: string) => BundleImageSize | undefined;
  /** Intrinsic size of a bitmap whose spec omits it. Defaults to reading
   *  the image header (`bitmapSize`). */
  measureBitmap?: (bytes: ArrayBuffer, mime: string) => Promise<BundleImageSize | undefined> | BundleImageSize | undefined;
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
   *  bundle's font families appended to `customFonts`. */
  config: PostextConfig;
  resources: Resource[];
  /** Resource payloads (pictures and PDF print masters). */
  blobs: BundleBlob[];
  fonts: BundleFontFile[];
}

const identityIds: BundleIdScheme = { blob: (f) => f, font: (f) => f };

/** Read a manifest plus its files. Throws on an invalid manifest or a
 *  missing chapter, picture or font file. */
export async function readBundle(
  manifest: unknown,
  readFile: BundleFileReader,
  options: ReadBundleOptions = {},
): Promise<ReadBundleResult> {
  if (!isBundleManifest(manifest)) throw new Error('Invalid bundle manifest (preset.json)');
  const locale = options.locale ?? manifest.locale ?? 'en';
  const ids = options.ids ?? identityIds;
  const onWarning = options.onWarning;
  const measureSvg = options.measureSvg ?? svgSize;
  const measureBitmap = options.measureBitmap ?? ((bytes: ArrayBuffer) => bitmapSize(bytes));

  const decoder = new TextDecoder();
  const chapters: BundleChapter[] = [];
  for (const spec of pickChapterSpecs(manifest, locale)) {
    chapters.push({ title: spec.title, file: spec.file, markdown: decoder.decode(await readFile(spec.file)) });
  }

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
    if (wording.file && wording.file !== spec.file) {
      if (wording.width === undefined) delete merged.width;
      if (wording.height === undefined) delete merged.height;
      if (wording.pdfFile === undefined) delete merged.pdfFile;
    }
    return merged;
  });

  const blobs: BundleBlob[] = [];
  const resources: Resource[] = await Promise.all(
    localizedSpecs.map(async (spec) => {
      const file = spec.file;
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
      return resourceFromSpec(resolved, size, ids.blob);
    }),
  );

  const fontSet = fontsToCustomFonts(manifest.fonts ?? [], ids.font);
  for (const w of fontSet.warnings) onWarning?.(w);
  const fonts: BundleFontFile[] = await Promise.all(
    fontSet.files.map(async (f) => ({ ...f, bytes: await readFile(f.file) })),
  );

  const baseConfig = { ...(options.baseConfig ?? bundleBaseConfig(locale)), ...(manifest.config ?? {}), ...(overrides?.config ?? {}) };
  const customFonts = [...(manifest.config?.customFonts ?? []), ...fontSet.families];
  const config = customFonts.length > 0 ? { ...baseConfig, customFonts } : baseConfig;

  return { manifest, locale: resolveBundleLocale(manifest, locale), chapters, config, resources, blobs, fonts };
}

// ---------------------------------------------------------------------------
// Writing

export interface BundleMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
}

export interface BundleContent {
  chapters: readonly { title: string; markdown: string }[];
  config: PostextConfig;
  resources: readonly Resource[];
  /** Written as the manifest's `view` when it is not the default. */
  canvasScope?: BundleCanvasScope;
  /** The cover picture, carried as the manifest's `thumbnail`. */
  thumbnail?: { fileId: string; mime: string };
}

export interface PlannedFile {
  /** Path inside the bundle (`resources/x.png`, `fonts/y.ttf`). */
  path: string;
  fileId: string;
  kind: 'blob' | 'font';
  /** Resource id (blob) or family name (font), for warnings. */
  owner: string;
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

  const resources: BundleResourceSpec[] = [];
  for (const r of content.resources) {
    const { bitmap, svg } = r;
    const rest = omitStorageFields(r);
    const ext = extensionForResource(r);
    const fileId = bitmap?.fileId ?? svg?.fileId;
    if (!ext || !fileId) {
      resources.push(rest);
      continue;
    }
    const name = uniqueSlug(slugify(r.id), takenResourceNames, 'resource');
    takenResourceNames.add(name);
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
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    });
  }

  const fonts: BundleFontFamilySpec[] = [];
  for (const family of content.config.customFonts ?? []) {
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

  const takenChapterNames = new Set<string>();
  const chapterSpecs: BundleManifestV2['chapters'] = [];
  const chapterFiles: BundlePlan['chapterFiles'] = [];
  content.chapters.forEach((c, i) => {
    const path = chapterFileName(i, c.title, takenChapterNames, content.chapters.length);
    chapterSpecs.push({ title: c.title, file: path });
    chapterFiles.push({ path, markdown: c.markdown });
  });

  const manifest: BundleManifestV2 = {
    version: 2,
    id: meta.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.locale ? { locale: meta.locale } : {}),
    ...(thumbnailPath ? { thumbnail: thumbnailPath } : {}),
    ...(content.canvasScope === 'book' ? { view: { canvasScope: 'book' as const } } : {}),
    chapters: chapterSpecs,
    config: configWithoutFonts as PostextConfig,
    ...(resources.length > 0 ? { resources } : {}),
    ...(fonts.length > 0 ? { fonts } : {}),
  };
  return { manifest, files, chapterFiles, warnings };
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
        warnings.push(`${f.owner}: missing file, skipped`);
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
      ?.filter((r) => !r.file || !missingPaths.has(r.file))
      .map((r) => (r.pdfFile && missingPaths.has(r.pdfFile) ? { ...r, pdfFile: undefined } : r));
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
  }

  const enc = new TextEncoder();
  files['preset.json'] = enc.encode(JSON.stringify(manifest, null, 2));
  for (const c of plan.chapterFiles) files[c.path] = enc.encode(c.markdown);
  return { files, manifest, warnings, missing: [...missingPaths] };
}
