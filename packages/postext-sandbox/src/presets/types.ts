// Preset bundles: a markdown document + PostextConfig + resources (with their
// binary payloads) + custom fonts, loadable into the sandbox as one unit. The
// built-in preset wraps the default sample document; remote presets are
// described by JSON manifests served from a base URL (see remote.ts).

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';
import type {
  BundleChapterSpec,
  BundleFontFamilySpec,
  BundleFontVariantSpec,
  BundleLocaleOverrides,
  BundleManifest,
  BundleManifestV1,
  BundleManifestV2,
  BundleResourceSpec,
  BundleShowcaseMeta,
  BundleViewSpec,
} from 'postext/bundle';
import type { BookStart, ChapterLayout, Chapter, LayoutScope } from '../book/types.js';

export type PresetSource = 'builtin' | 'public' | 'private';

/** Where to fetch a preset index from. `private` sources are only ever served
 *  in local development and are tagged as such in the UI. */
export interface PresetSourceSpec {
  url: string;
  private?: boolean;
}

/** Optional showcase metadata shared by index entries, manifests and
 *  summaries (the bundle format's own; see `postext/bundle`). */
export type PresetShowcaseMeta = BundleShowcaseMeta;

/** The title and description of each edition of a preset in several
 *  languages, by locale tag: the manifest's `localized.<lang>.name` and
 *  `description`, copied into its `index.json` entry (#891). */
export type PresetLocalizedNames = Record<string, { name?: string; description?: string }>;

export interface PresetSummary extends PresetShowcaseMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
  /** Each edition's own title and description (#891). */
  localized?: PresetLocalizedNames;
  /** Auto-load this preset for a pristine sandbox (private sources only). */
  default?: boolean;
  source: PresetSource;
  /** False when the preset was active in a previous session but its source
   *  no longer lists it (e.g. a private source not served in this build). */
  available: boolean;
  /** Absolute URL of `thumbnail` for remote presets. */
  thumbnailUrl?: string;
}

/** `index.json` at a source's base URL. */
export interface PresetIndexEntry extends PresetShowcaseMeta {
  id: string;
  /** Directory (relative to the base URL) holding `preset.json` and files. */
  dir: string;
  name: string;
  description?: string;
  locale?: string;
  /** Each edition's own title and description (#891). */
  localized?: PresetLocalizedNames;
  default?: boolean;
}

export interface PresetIndex {
  version: 1;
  presets: PresetIndexEntry[];
}

// The manifest (`preset.json`) is the `.postext` bundle format, defined by
// `postext/bundle`; the sandbox keeps its historical names for it.
export type PresetResourceSpec = BundleResourceSpec;
export type PresetFontVariantSpec = BundleFontVariantSpec;
export type PresetFontFamilySpec = BundleFontFamilySpec;
export type PresetChapterSpec = BundleChapterSpec;
export type PresetLocaleOverrides = BundleLocaleOverrides;
export type PresetViewSpec = BundleViewSpec;
export type PresetManifestV1 = BundleManifestV1;
export type PresetManifestV2 = BundleManifestV2;
export type PresetManifest = BundleManifest;

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
  /** The locale the content was resolved for: the chapter-map key a
   *  bilingual bundle served (`es` when `es-ES` was asked of an `es`/`en`
   *  bundle), else the bundle's own locale, else the one requested. */
  locale: string;
  /** Chapters in book order, with fresh ids. */
  chapters: Chapter[];
  config: PostextConfig;
  /** The general settings of a bundle in several languages (#1209), read
   *  under the same rules as `config`. */
  sharedConfig?: PostextConfig;
  resources: Resource[];
  blobs: LoadedPresetBlob[];
  fonts: LoadedPresetFont[];
  /** The bundle's layout records (`layouts.json`), by chapter id, when they
   *  were built by this engine from this configuration and these resources. */
  layouts?: Record<string, ChapterLayout>;
  /** The canvas scope the manifest's `view` asks for, when it names one. */
  canvasScope?: LayoutScope;
  /** Where the bundle's book starts (the manifest's `start`, #695). */
  start?: BookStart;
  /** The book's cover Markdown (the manifest's `coverMarkdown`, #1669). */
  coverMarkdown?: string;
}

export interface PresetProvider {
  summary: PresetSummary;
  load(locale: string): Promise<LoadedPreset>;
  /** Cheap identity of the bundle's current contents on its source (for
   *  remote presets, the server-side `fingerprint.json`). Resolves to null
   *  when unknown or unreachable; providers that cannot change (built-in)
   *  leave it undefined. The sandbox polls it to follow edits on disk. */
  fingerprint?: () => Promise<string | null>;
}

/** What the sandbox recorded when it last applied a preset: the bundle's
 *  fingerprint at that moment plus hashes of the document, configuration and
 *  resource set as applied, so later edits can be told apart from a bundle
 *  that changed underneath (see hash.ts / watch.ts). */
export interface AppliedPresetSnapshot {
  presetId: string;
  /** The locale the preset's content was loaded in (`LoadedPreset.locale`);
   *  reloads keep it, so a bundle opened in its second language stays
   *  there. Absent in snapshots written before locale switching. */
  locale?: string;
  fingerprint: string | null;
  /** Hash of the chapter list (titles + text, in order). */
  markdownHash: string;
  /** Length of the text {@link markdownHash} hashes (#1646): a chapter list
   *  of another length was edited, and is told so without hashing the
   *  book. Absent in snapshots written before. */
  markdownLength?: number;
  configHash: string;
  resourcesHash: string;
  /** Hash of the cover Markdown (#1669), when the book had one. */
  coverHash?: string;
}

/** Which slice of a loaded preset to apply. `resources` only replaces the
 *  resource set (used to reseed an emptied store without touching the user's
 *  document). */
export type PresetApplyParts = 'all' | 'document' | 'config' | 'resources';
