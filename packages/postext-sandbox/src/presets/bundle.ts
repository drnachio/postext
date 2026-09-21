// Bundle codec shared by every transport. A bundle is a directory-shaped set
// of files — `preset.json`, the markdown, `resources/*`, `fonts/*` — whether
// it is served over HTTP (remote.ts), read from a `.postext` zip (zip.ts) or
// written out for export. `parseBundle` turns manifest + files into a
// `LoadedPreset`; `planBundle`/`buildBundleFiles` do the reverse from the
// sandbox's working slices. Nothing here touches storage or the DOM.

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';
import { ENGINE_KEY, configKeyOf, resourcesKeyOf } from '../book/layoutKeys';
import { stripConfigDefaults } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import { svgIntrinsicSize } from '../panels/resources/svgIntrinsic';
import { slugify, uniqueSlug } from '../panels/resources/slugify';
import { deriveChapterTitle, newChapter } from '../book/chapterOps';
import type { Chapter, ChapterLayout } from '../book/types';
import { chapterFileName, extensionForResource, fontsToCustomFonts, isBitmapFile, isPdfFile, isPresetManifest, isSvgFile, mimeForFile, pickChapterSpecs, presetChapterId, presetFileId, presetFontFileId, resourceFromSpec } from './manifest';
import type {
  LoadedPreset,
  LoadedPresetBlob,
  LoadedPresetFont,
  PresetChapterSpec,
  PresetFontFamilySpec,
  PresetManifestV2,
  PresetResourceSpec,
  PresetSummary,
} from './types';

/** Reads one bundle file by its manifest-relative path; rejects when the
 *  file does not exist. */
export type BundleFileReader = (path: string) => Promise<ArrayBuffer>;

/** How the loaded resources/fonts name their IndexedDB records. Presets use
 *  deterministic `preset:` ids (a reload overwrites in place); projects use
 *  their own namespace so preset reloads never touch them. */
export interface BundleIdScheme {
  blob: (file: string) => string;
  font: (file: string) => string;
}

export function presetIdScheme(presetId: string): BundleIdScheme {
  return {
    blob: (file) => presetFileId(presetId, file),
    font: (file) => presetFontFileId(presetId, file),
  };
}

export interface ParseBundleOptions {
  locale: string;
  summary: PresetSummary;
  ids?: BundleIdScheme;
  onWarning?: (message: string) => void;
  /** Id generator for the loaded chapters. Defaults to ids derived from
   *  the preset id and the chapter file (`presetChapterId`), so applying
   *  the same preset again yields the same ids; a project imports with
   *  random ids (chapter ids are unique across projects). */
  chapterIds?: () => string;
  /** Fallback title for a chapter without a heading (`n` is 1-based). */
  untitledChapter?: (n: number) => string;
}

/** Read a bitmap's pixel size; zero when it cannot be decoded (or outside a
 *  browser). */
export async function bitmapSize(bytes: ArrayBuffer, mime: string): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'undefined') return { width: 0, height: 0 };
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime }));
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Turn a manifest plus its files into an in-memory `LoadedPreset`. Throws
 *  on an invalid manifest or a missing file. */
export async function parseBundle(
  manifest: unknown,
  readFile: BundleFileReader,
  { locale, summary, ids, onWarning, chapterIds, untitledChapter }: ParseBundleOptions,
): Promise<LoadedPreset> {
  if (!isPresetManifest(manifest)) {
    throw new Error(`Invalid preset manifest for "${summary.id}"`);
  }
  const presetId = manifest.id;
  const scheme = ids ?? presetIdScheme(presetId);
  const idOf = (file: string): string => (chapterIds ? chapterIds() : presetChapterId(presetId, file));
  const untitled = untitledChapter ?? ((n: number) => `Chapter ${n}`);

  const decoder = new TextDecoder();
  const chapters: Chapter[] = [];
  const specs = pickChapterSpecs(manifest, locale);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const text = decoder.decode(await readFile(spec.file));
    chapters.push(newChapter(idOf(spec.file), spec.title || deriveChapterTitle(text, untitled(i + 1)), text));
  }

  const blobs: LoadedPresetBlob[] = [];
  const resources: Resource[] = await Promise.all(
    (manifest.resources ?? []).map(async (spec) => {
      const file = spec.file;
      if (!file) return resourceFromSpec(presetId, spec);
      const mime = mimeForFile(file);
      const bytes = await readFile(file);
      blobs.push({ fileId: scheme.blob(file), bytes, mime });
      // Optional vector print master next to an SVG: a missing or non-PDF
      // file only costs the master, never the figure.
      let resolved = spec;
      const pdfFile = spec.pdfFile;
      if (pdfFile && isSvgFile(file)) {
        const master = isPdfFile(pdfFile) ? await readFile(pdfFile).catch(() => null) : null;
        if (master) {
          blobs.push({ fileId: scheme.blob(pdfFile), bytes: master, mime: mimeForFile(pdfFile) });
        } else {
          onWarning?.(`${spec.id}: print master "${pdfFile}" ${isPdfFile(pdfFile) ? 'not found' : 'is not a .pdf'}, ignored`);
          resolved = { ...spec, pdfFile: undefined };
        }
      }
      let size: { width: number; height: number } | undefined;
      if (spec.width === undefined || spec.height === undefined) {
        if (isSvgFile(file)) {
          size = svgIntrinsicSize(new TextDecoder().decode(bytes));
        } else if (isBitmapFile(file)) {
          size = await bitmapSize(bytes, mime);
        }
      }
      return resourceFromSpec(presetId, resolved, size, scheme.blob);
    }),
  );

  const fontSet = fontsToCustomFonts(presetId, manifest.fonts ?? [], scheme.font);
  for (const w of fontSet.warnings) onWarning?.(w);
  const fonts: LoadedPresetFont[] = await Promise.all(
    fontSet.files.map(async (f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      format: f.format,
      buffer: await readFile(f.file),
    })),
  );

  const baseConfig = { ...createDefaultConfig(locale), ...(manifest.config ?? {}) };
  const customFonts = [...(manifest.config?.customFonts ?? []), ...fontSet.families];
  const config = customFonts.length > 0 ? { ...baseConfig, customFonts } : baseConfig;

  // The bundle's pagination, taken as is when it was built by this engine
  // from this configuration and these resources — else laid out afresh.
  let layouts: Record<string, ChapterLayout> | undefined;
  const layoutsBytes = await readFile(LAYOUTS_FILE).catch(() => null);
  if (layoutsBytes) {
    try {
      const parsed = JSON.parse(decoder.decode(layoutsBytes)) as BundleLayoutsFile;
      const configKey = configKeyOf(config);
      const resourcesKey = resourcesKeyOf(resources);
      if (parsed.version === 1 && parsed.engine === ENGINE_KEY && parsed.configKey === configKey && parsed.resourcesKey === resourcesKey) {
        layouts = {};
        specs.forEach((spec, i) => {
          const rest = parsed.chapters[spec.file];
          const chapter = chapters[i];
          if (rest && chapter) layouts![chapter.id] = { ...rest, chapterId: chapter.id, markdown: chapter.markdown, configKey, resourcesKey, engine: ENGINE_KEY };
        });
      }
    } catch (err) {
      onWarning?.(`${LAYOUTS_FILE}: ${err instanceof Error ? err.message : 'unreadable'}, ignored`);
    }
  }

  return {
    summary: {
      ...summary,
      description: manifest.description ?? summary.description,
      locale: manifest.locale ?? summary.locale,
    },
    chapters,
    config,
    resources,
    blobs,
    fonts,
    ...(layouts ? { layouts } : {}),
  };
}

// ---------------------------------------------------------------------------
// Export side

export interface BundleMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
}

export interface BundleContent {
  chapters: readonly Chapter[];
  config: PostextConfig;
  resources: Resource[];
  /** Current layout records by chapter id, carried as `layouts.json` so
   *  the bundle opens paginated. */
  layouts?: Record<string, ChapterLayout>;
}

/** `layouts.json`: the pagination of the bundle's chapters, keyed by
 *  chapter file, valid for the engine, configuration and resources named
 *  by their fingerprints (`layoutKeys.ts`). */
export const LAYOUTS_FILE = 'layouts.json';
export interface BundleLayoutsFile {
  version: 1;
  engine: string;
  configKey: string;
  resourcesKey: string;
  chapters: Record<string, Omit<ChapterLayout, 'chapterId' | 'markdown' | 'configKey' | 'resourcesKey' | 'engine'>>;
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
  manifest: PresetManifestV2;
  files: PlannedFile[];
  /** Chapter file path → text, in book order. */
  chapterFiles: { path: string; markdown: string }[];
  /** The pagination file, when any chapter has a current record. */
  layouts?: BundleLayoutsFile;
  warnings: string[];
}

/** The v1 single-document file name (read path only). */
export const MARKDOWN_FILE = 'document.md';

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
 *  and by `fontsToCustomFonts`, so exporting it would only round-trip a
 *  warning). */
export const EXPORTABLE_FONT_FORMATS: readonly CustomFontFormat[] = ['ttf', 'otf', 'woff2'];

/** Decide file names and the manifest for a bundle. Pure; bytes are resolved
 *  by `buildBundleFiles`. Fonts are declared in `fonts[]`, never inside
 *  `config.customFonts` (their ids are storage-local). */
export function planBundle(meta: BundleMeta, content: BundleContent): BundlePlan {
  const warnings: string[] = [];
  const files: PlannedFile[] = [];
  const takenResourceNames = new Set<string>();
  const takenFontNames = new Set<string>();

  const resources: PresetResourceSpec[] = [];
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

  const fonts: PresetFontFamilySpec[] = [];
  for (const family of content.config.customFonts ?? []) {
    const variants: PresetFontFamilySpec['variants'] = [];
    for (const v of family.variants) {
      if (!EXPORTABLE_FONT_FORMATS.includes(v.format)) {
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

  const configWithoutFonts: Partial<PostextConfig> = { ...stripConfigDefaults(content.config) };
  delete configWithoutFonts.customFonts;

  const takenChapterNames = new Set<string>();
  const chapterSpecs: PresetChapterSpec[] = [];
  const chapterFiles: BundlePlan['chapterFiles'] = [];
  const layoutChapters: BundleLayoutsFile['chapters'] = {};
  content.chapters.forEach((c, i) => {
    const path = chapterFileName(i, c.title, takenChapterNames, content.chapters.length);
    chapterSpecs.push({ title: c.title, file: path });
    chapterFiles.push({ path, markdown: c.markdown });
    const layout = content.layouts?.[c.id];
    if (layout && layout.markdown === c.markdown && layout.engine === ENGINE_KEY
      && layout.configKey === configKeyOf(content.config) && layout.resourcesKey === resourcesKeyOf(content.resources)) {
      const rest: BundleLayoutsFile['chapters'][string] = {
        continuationKey: layout.continuationKey,
        pageCount: layout.pageCount,
        leadingBlankPages: layout.leadingBlankPages,
        firstContentPageNumber: layout.firstContentPageNumber,
        firstContentPageFormat: layout.firstContentPageFormat,
        lastPageNumber: layout.lastPageNumber,
        lastPageFormat: layout.lastPageFormat,
        outlinePages: layout.outlinePages,
        outlineKey: layout.outlineKey,
      };
      layoutChapters[path] = rest;
    }
  });
  // Whatever records are current: the reader takes them in book order and
  // lays out afresh from the first chapter without one, so a pagination
  // that stops short still spares the chapters before the gap.
  const layouts: BundleLayoutsFile | undefined = Object.keys(layoutChapters).length > 0
    ? { version: 1, engine: ENGINE_KEY, configKey: configKeyOf(content.config), resourcesKey: resourcesKeyOf(content.resources), chapters: layoutChapters }
    : undefined;

  const manifest: PresetManifestV2 = {
    version: 2,
    id: meta.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.locale ? { locale: meta.locale } : {}),
    chapters: chapterSpecs,
    config: configWithoutFonts as PostextConfig,
    ...(resources.length > 0 ? { resources } : {}),
    ...(fonts.length > 0 ? { fonts } : {}),
  };
  return { manifest, files, chapterFiles, ...(layouts ? { layouts } : {}), warnings };
}

export interface BundleByteSources {
  readBlob: (fileId: string) => Promise<ArrayBuffer | null>;
  readFont: (fileId: string) => Promise<ArrayBuffer | null>;
}

export interface BuiltBundle {
  /** Path → bytes, ready to zip. */
  files: Record<string, Uint8Array>;
  manifest: PresetManifestV2;
  warnings: string[];
}

/** Resolve a plan's bytes. A resource whose blob is gone is dropped from the
 *  manifest (a spec without a file would round-trip as a broken figure); a
 *  font variant whose file is gone is dropped likewise, and its family with
 *  it when nothing remains. */
export async function buildBundleFiles(
  meta: BundleMeta,
  content: BundleContent,
  sources: BundleByteSources,
): Promise<BuiltBundle> {
  const plan = planBundle(meta, content);
  const warnings = [...plan.warnings];
  const files: Record<string, Uint8Array> = {};
  const missingPaths = new Set<string>();

  await Promise.all(
    plan.files.map(async (f) => {
      const bytes = f.kind === 'blob'
        ? await sources.readBlob(f.fileId).catch(() => null)
        : await sources.readFont(f.fileId).catch(() => null);
      if (!bytes) {
        missingPaths.add(f.path);
        warnings.push(`${f.owner}: missing file, skipped`);
        return;
      }
      files[f.path] = new Uint8Array(bytes);
    }),
  );

  let manifest = plan.manifest;
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
  if (plan.layouts && missingPaths.size === 0) files[LAYOUTS_FILE] = enc.encode(JSON.stringify(plan.layouts));
  return { files, manifest, warnings };
}
