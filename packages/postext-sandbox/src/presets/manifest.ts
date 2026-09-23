// Preset manifests. The bundle format itself (validation, locale picking,
// file naming, manifest entries → resources / fonts) lives in `postext/bundle`;
// this module adds what only the sandbox needs: the preset index and the
// deterministic ids preset files and chapters are stored under.

import type { Resource } from 'postext';
import {
  fontsToCustomFonts as bundleFontsToCustomFonts,
  hasValidShowcaseMeta,
  isBundleManifest,
  resourceFromSpec as bundleResourceFromSpec,
  slugify,
} from 'postext/bundle';
import type { BundleFontFiles } from 'postext/bundle';
import type {
  PresetFontFamilySpec,
  PresetIndex,
  PresetIndexEntry,
  PresetManifest,
  PresetResourceSpec,
} from './types';

export {
  pickMarkdownFile,
  pickLocaleOverrides,
  resolveBundleLocale,
  pickChapterSpecs,
  chapterFileName,
  fileExtension,
  fileBasename,
  mimeForFile,
  isBitmapFile,
  isSvgFile,
  isPdfFile,
  extensionForImageMime,
  extensionForResource,
} from 'postext/bundle';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isIndexEntry(v: unknown): v is PresetIndexEntry {
  return isRecord(v) && isNonEmptyString(v.id) && isNonEmptyString(v.dir) && isNonEmptyString(v.name)
    && hasValidShowcaseMeta(v);
}

export function isPresetIndex(data: unknown): data is PresetIndex {
  return isRecord(data)
    && data.version === 1
    && Array.isArray(data.presets)
    && data.presets.every(isIndexEntry);
}

/** Accepts both manifest versions: v1 (`markdown`) and v2 (`chapters`). */
export function isPresetManifest(data: unknown): data is PresetManifest {
  return isBundleManifest(data);
}

/** Deterministic blob id for a preset resource file, so reloading the preset
 *  overwrites the same IndexedDB record instead of orphaning the old one. */
export function presetFileId(presetId: string, file: string): string {
  return `preset:${presetId}:${slugify(file)}`;
}

/** Deterministic chapter id for a preset chapter file, so re-applying the
 *  preset (a reset, a reload from disk) keeps the chapter ids — and with
 *  them the layout records of the chapters whose text did not change. */
export function presetChapterId(presetId: string, file: string): string {
  return `preset-chapter:${presetId}:${slugify(file)}`;
}

/** Deterministic font-file id; see `presetFileId`. */
export function presetFontFileId(presetId: string, file: string): string {
  return `preset-font:${presetId}:${slugify(file)}`;
}

export interface PresetFontFiles {
  families: BundleFontFiles['families'];
  files: { fileId: string; fileName: string; format: BundleFontFiles['files'][number]['format']; file: string }[];
  warnings: string[];
}

/** Turn manifest font families into `config.customFonts` entries plus the
 *  list of files to fetch, named with the preset's deterministic ids unless
 *  `fileIdFor` says otherwise. */
export function fontsToCustomFonts(
  presetId: string,
  fonts: PresetFontFamilySpec[],
  fileIdFor: (file: string) => string = (file) => presetFontFileId(presetId, file),
): PresetFontFiles {
  const out = bundleFontsToCustomFonts(fonts, fileIdFor);
  return {
    families: out.families,
    files: out.files.map(({ fileId, fileName, format, file }) => ({ fileId, fileName, format, file })),
    warnings: out.warnings,
  };
}

/** Build a sandbox `Resource` from a manifest entry (see `postext/bundle`'s
 *  `resourceFromSpec`), named with the preset's deterministic ids. */
export function resourceFromSpec(
  presetId: string,
  spec: PresetResourceSpec,
  size?: { width: number; height: number },
  fileIdFor: (file: string) => string = (file) => presetFileId(presetId, file),
): Resource {
  return bundleResourceFromSpec(spec, size, fileIdFor);
}
