// Bundle codec shared by every transport. A bundle is a directory-shaped set
// of files — `preset.json`, the markdown, `resources/*`, `fonts/*` — whether
// it is served over HTTP (remote.ts), read from a `.postext` zip (zip.ts) or
// written out for export. `parseBundle` turns manifest + files into a
// `LoadedPreset`; `planBundle`/`buildBundleFiles` do the reverse from the
// sandbox's working slices. Nothing here touches storage or the DOM.

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';
import { stripConfigDefaults } from 'postext';
import { createDefaultConfig } from '../context/defaultConfig';
import { svgIntrinsicSize } from '../panels/resources/svgIntrinsic';
import { slugify, uniqueSlug } from '../panels/resources/slugify';
import {
  extensionForResource,
  fontsToCustomFonts,
  isBitmapFile,
  isPresetManifest,
  isSvgFile,
  mimeForFile,
  pickMarkdownFile,
  presetFileId,
  presetFontFileId,
  resourceFromSpec,
} from './manifest';
import type {
  LoadedPreset,
  LoadedPresetBlob,
  LoadedPresetFont,
  PresetFontFamilySpec,
  PresetManifest,
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
  { locale, summary, ids, onWarning }: ParseBundleOptions,
): Promise<LoadedPreset> {
  if (!isPresetManifest(manifest)) {
    throw new Error(`Invalid preset manifest for "${summary.id}"`);
  }
  const presetId = manifest.id;
  const scheme = ids ?? presetIdScheme(presetId);

  const markdown = new TextDecoder().decode(await readFile(pickMarkdownFile(manifest, locale)));

  const blobs: LoadedPresetBlob[] = [];
  const resources: Resource[] = await Promise.all(
    (manifest.resources ?? []).map(async (spec) => {
      if (!spec.file) return resourceFromSpec(presetId, spec);
      const mime = mimeForFile(spec.file);
      const bytes = await readFile(spec.file);
      blobs.push({ fileId: scheme.blob(spec.file), bytes, mime });
      let size: { width: number; height: number } | undefined;
      if (spec.width === undefined || spec.height === undefined) {
        if (isSvgFile(spec.file)) {
          size = svgIntrinsicSize(new TextDecoder().decode(bytes));
        } else if (isBitmapFile(spec.file)) {
          size = await bitmapSize(bytes, mime);
        }
      }
      return resourceFromSpec(presetId, spec, size, scheme.blob);
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

  return {
    summary: {
      ...summary,
      description: manifest.description ?? summary.description,
      locale: manifest.locale ?? summary.locale,
    },
    markdown,
    config,
    resources,
    blobs,
    fonts,
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
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
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
  manifest: PresetManifest;
  files: PlannedFile[];
  warnings: string[];
}

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
    const width = bitmap?.width ?? svg?.width;
    const height = bitmap?.height ?? svg?.height;
    resources.push({
      ...rest,
      file: path,
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

  const manifest: PresetManifest = {
    version: 1,
    id: meta.id,
    name: meta.name,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.locale ? { locale: meta.locale } : {}),
    markdown: MARKDOWN_FILE,
    config: configWithoutFonts as PostextConfig,
    ...(resources.length > 0 ? { resources } : {}),
    ...(fonts.length > 0 ? { fonts } : {}),
  };
  return { manifest, files, warnings };
}

export interface BundleByteSources {
  readBlob: (fileId: string) => Promise<ArrayBuffer | null>;
  readFont: (fileId: string) => Promise<ArrayBuffer | null>;
}

export interface BuiltBundle {
  /** Path → bytes, ready to zip. */
  files: Record<string, Uint8Array>;
  manifest: PresetManifest;
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
    const resources = manifest.resources?.filter((r) => !r.file || !missingPaths.has(r.file));
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
  files[MARKDOWN_FILE] = enc.encode(content.markdown);
  return { files, manifest, warnings };
}
