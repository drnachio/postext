// Preset bundles: a markdown document + PostextConfig + resources (with their
// binary payloads) + custom fonts, loadable into the sandbox as one unit. The
// built-in preset wraps the default sample document; remote presets are
// described by JSON manifests served from a base URL (see remote.ts).

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';

export type PresetSource = 'builtin' | 'public' | 'private';

/** Where to fetch a preset index from. `private` sources are only ever served
 *  in local development and are tagged as such in the UI. */
export interface PresetSourceSpec {
  url: string;
  private?: boolean;
}

export interface PresetSummary {
  id: string;
  name: string;
  description?: string;
  locale?: string;
  /** Auto-load this preset for a pristine sandbox (private sources only). */
  default?: boolean;
  source: PresetSource;
  /** False when the preset was active in a previous session but its source
   *  no longer lists it (e.g. a private source not served in this build). */
  available: boolean;
}

/** `index.json` at a source's base URL. */
export interface PresetIndexEntry {
  id: string;
  /** Directory (relative to the base URL) holding `preset.json` and files. */
  dir: string;
  name: string;
  description?: string;
  locale?: string;
  default?: boolean;
}

export interface PresetIndex {
  version: 1;
  presets: PresetIndexEntry[];
}

/** A resource declaration inside `preset.json`. Bitmap/SVG payloads are
 *  referenced by `file` (relative to the preset directory); tables keep their
 *  model inline. `width`/`height` are optional — when missing they are read
 *  from the file at load time. */
export type PresetResourceSpec = Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg'> & {
  file?: string;
  width?: number;
  height?: number;
  /** Source line / credits set under the resource (`Resource.note`). */
  note?: string;
};

export interface PresetFontVariantSpec {
  weight: number;
  style: 'normal' | 'italic';
  /** Font file relative to the preset directory. */
  file: string;
}

export interface PresetFontFamilySpec {
  name: string;
  variants: PresetFontVariantSpec[];
}

/** `preset.json` inside a preset directory. */
export interface PresetManifest {
  version: 1;
  id: string;
  name: string;
  description?: string;
  locale?: string;
  default?: boolean;
  /** Markdown file, or a locale → file map. */
  markdown: string | Record<string, string>;
  config?: PostextConfig;
  resources?: PresetResourceSpec[];
  fonts?: PresetFontFamilySpec[];
}

export interface LoadedPresetBlob {
  fileId: string;
  bytes: ArrayBuffer;
  mime: string;
}

export interface LoadedPresetFont {
  fileId: string;
  fileName: string;
  format: CustomFontFormat;
  buffer: ArrayBuffer;
}

/** Everything needed to apply a preset, fully fetched but not yet written to
 *  storage. `config.customFonts` already lists the families in `fonts`. */
export interface LoadedPreset {
  summary: PresetSummary;
  markdown: string;
  config: PostextConfig;
  resources: Resource[];
  blobs: LoadedPresetBlob[];
  fonts: LoadedPresetFont[];
}

export interface PresetProvider {
  summary: PresetSummary;
  load(locale: string): Promise<LoadedPreset>;
}

/** Which slice of a loaded preset to apply. `resources` only replaces the
 *  resource set (used to reseed an emptied store without touching the user's
 *  document). */
export type PresetApplyParts = 'all' | 'document' | 'config' | 'resources';
