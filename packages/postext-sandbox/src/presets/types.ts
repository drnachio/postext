// Preset bundles: a markdown document + PostextConfig + resources (with their
// binary payloads) + custom fonts, loadable into the sandbox as one unit. The
// built-in preset wraps the default sample document; remote presets are
// described by JSON manifests served from a base URL (see remote.ts).

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';
import type { ChapterLayout, Chapter, LayoutScope } from '../book/types';

export type PresetSource = 'builtin' | 'public' | 'private';

/** Where to fetch a preset index from. `private` sources are only ever served
 *  in local development and are tagged as such in the UI. */
export interface PresetSourceSpec {
  url: string;
  private?: boolean;
}

/** Optional showcase metadata shared by index entries, manifests and
 *  summaries: everything the preset picker can show beyond name and
 *  description. All fields are optional and purely descriptive. */
export interface PresetShowcaseMeta {
  /** Every locale the bundle carries chapters for (a bilingual bundle lists
   *  both); `locale` stays the primary one. */
  locales?: string[];
  /** Preview image (`thumbnail.jpg`), relative to the preset directory. */
  thumbnail?: string;
  /** Licence of the bundled content, as a short label (`CC BY 4.0`,
   *  `Public domain`, `CC BY-SA 4.0`). */
  license?: string;
  /** One-line credit for the content and imagery sources. */
  credits?: string;
  /** Free-form tags (`two-column`, `magazine`, `book`). */
  tags?: string[];
}

export interface PresetSummary extends PresetShowcaseMeta {
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
  /** SVG resources only: a single-page PDF holding the same figure as
   *  vectors, embedded verbatim by the PDF export in place of the SVG
   *  (`Resource.svg.pdfFileId`). Relative to the preset directory. */
  pdfFile?: string;
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
  /** False when the bundle may set its pages with this family but must not
   *  pass the files on: exporting a project built from the bundle leaves the
   *  family's files (and its `fonts[]` entry) out. Defaults to true. */
  redistributable?: boolean;
}

/** One chapter file inside a v2 bundle (`chapters/01-intro.md`). */
export interface PresetChapterSpec {
  title: string;
  file: string;
}

/** What a bilingual bundle changes per locale on top of its shared `config`
 *  and `resources`: top-level config keys replaced wholesale for that locale
 *  (`resourceTypes` with translated caption prefixes, say) and the wording of
 *  resources — caption, note, alt text, a table's cells — merged by id. A
 *  resource whose artwork itself carries words (a diagram with labels set in
 *  it) may also name its own `file` for the locale; the size is then read
 *  from that file unless the override states it. */
export interface PresetLocaleOverrides {
  config?: Partial<PostextConfig>;
  resources?: (Pick<PresetResourceSpec, 'id'> & Partial<Pick<PresetResourceSpec, 'caption' | 'note' | 'altText' | 'table' | 'file' | 'pdfFile' | 'width' | 'height'>>)[];
}

/** How the sandbox opens the bundle: view settings that are not part of
 *  the engine configuration. */
export interface PresetViewSpec {
  /** What the canvas lays out: the whole book as one continuous document,
   *  or (the default) the active chapter continued after the ones before
   *  it. */
  canvasScope?: LayoutScope;
}

interface PresetManifestBase extends PresetShowcaseMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
  default?: boolean;
  view?: PresetViewSpec;
  config?: PostextConfig;
  resources?: PresetResourceSpec[];
  fonts?: PresetFontFamilySpec[];
  /** Locale → overrides, resolved with the same rules as a locale → chapters
   *  map (exact tag, base language, the manifest's locale, first entry). */
  localized?: Record<string, PresetLocaleOverrides>;
}

/** `preset.json` (version 1): a single markdown document. Still accepted
 *  on import; the sandbox always writes version 2. */
export interface PresetManifestV1 extends PresetManifestBase {
  version: 1;
  /** Markdown file, or a locale → file map. */
  markdown: string | Record<string, string>;
}

/** `preset.json` (version 2): a book — one markdown file per chapter, in
 *  order, or a locale → chapter list map. */
export interface PresetManifestV2 extends PresetManifestBase {
  version: 2;
  chapters: PresetChapterSpec[] | Record<string, PresetChapterSpec[]>;
}

export type PresetManifest = PresetManifestV1 | PresetManifestV2;

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
  resources: Resource[];
  blobs: LoadedPresetBlob[];
  fonts: LoadedPresetFont[];
  /** The bundle's layout records (`layouts.json`), by chapter id, when they
   *  were built by this engine from this configuration and these resources. */
  layouts?: Record<string, ChapterLayout>;
  /** The canvas scope the manifest's `view` asks for, when it names one. */
  canvasScope?: LayoutScope;
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
  configHash: string;
  resourcesHash: string;
}

/** Which slice of a loaded preset to apply. `resources` only replaces the
 *  resource set (used to reseed an emptied store without touching the user's
 *  document). */
export type PresetApplyParts = 'all' | 'document' | 'config' | 'resources';
