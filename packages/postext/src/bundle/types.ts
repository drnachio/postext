// The `.postext` bundle format: a directory-shaped set of files — a
// `preset.json` manifest, one markdown file per chapter, `resources/*` and
// `fonts/*` — zipped into one file. These types describe the manifest; the
// codec lives in `manifest.ts`, `codec.ts` and `zip.ts`.

import type { CustomFontFormat, PostextConfig, Resource } from '../types';

/** Optional showcase metadata a manifest may carry: everything a picker can
 *  show beyond name and description. All fields are purely descriptive. */
export interface BundleShowcaseMeta {
  /** Every locale the bundle carries chapters for (a bilingual bundle lists
   *  both); `locale` stays the primary one. */
  locales?: string[];
  /** Preview image (`thumbnail.jpg`), relative to the bundle root. */
  thumbnail?: string;
  /** Licence of the bundled content, as a short label (`CC BY 4.0`). */
  license?: string;
  /** One-line credit for the content and imagery sources. */
  credits?: string;
  /** Free-form tags (`two-column`, `magazine`, `book`). */
  tags?: string[];
}

/** A resource declaration inside `preset.json`. Bitmap/SVG payloads are
 *  referenced by `file` (relative to the bundle root); tables keep their
 *  model inline. `width`/`height` are optional — when missing they are read
 *  from the file when the bundle is opened. */
export type BundleResourceSpec = Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg'> & {
  file?: string;
  /** SVG resources only: a single-page PDF holding the same figure as
   *  vectors, embedded verbatim by the PDF backend in place of the SVG
   *  (`Resource.svg.pdfFileId`). */
  pdfFile?: string;
  width?: number;
  height?: number;
  /** Source line / credits set under the resource (`Resource.note`). */
  note?: string;
};

export interface BundleFontVariantSpec {
  weight: number;
  style: 'normal' | 'italic';
  /** Font file relative to the bundle root (`.ttf`, `.otf` or `.woff2`). */
  file: string;
}

export interface BundleFontFamilySpec {
  name: string;
  variants: BundleFontVariantSpec[];
  /** False when the bundle may set its pages with this family but must not
   *  pass the files on: writing the bundle out again leaves the family's
   *  files (and its `fonts[]` entry) behind. Defaults to true. */
  redistributable?: boolean;
}

/** One chapter file inside a version 2 bundle (`chapters/01-intro.md`). */
export interface BundleChapterSpec {
  title: string;
  file: string;
}

/** What a bilingual bundle changes per locale on top of its shared `config`
 *  and `resources`: top-level config keys replaced wholesale for that
 *  locale, and the wording of resources — caption, note, alt text, a
 *  table's cells — merged by id. A resource whose artwork carries words may
 *  also name its own `file` for the locale. */
export interface BundleLocaleOverrides {
  config?: Partial<PostextConfig>;
  resources?: (Pick<BundleResourceSpec, 'id'> & Partial<Pick<BundleResourceSpec, 'caption' | 'note' | 'altText' | 'table' | 'file' | 'pdfFile' | 'width' | 'height'>>)[];
}

/** What a canvas lays out: the active chapter (continued after the ones
 *  before it) or the whole book as one continuous document. */
export type BundleCanvasScope = 'chapter' | 'book';

/** How a viewer opens the bundle: settings that are not part of the engine
 *  configuration. */
export interface BundleViewSpec {
  canvasScope?: BundleCanvasScope;
}

interface BundleManifestBase extends BundleShowcaseMeta {
  id: string;
  name: string;
  description?: string;
  locale?: string;
  /** Sandbox only: auto-load this bundle for a pristine sandbox when it is
   *  served from a private preset source. */
  default?: boolean;
  view?: BundleViewSpec;
  config?: PostextConfig;
  resources?: BundleResourceSpec[];
  fonts?: BundleFontFamilySpec[];
  /** Locale → overrides, resolved with the same rules as a locale →
   *  chapters map (exact tag, base language, the manifest's locale, first
   *  entry). */
  localized?: Record<string, BundleLocaleOverrides>;
}

/** `preset.json` version 1: a single markdown document. Still read; every
 *  writer produces version 2. */
export interface BundleManifestV1 extends BundleManifestBase {
  version: 1;
  /** Markdown file, or a locale → file map. */
  markdown: string | Record<string, string>;
}

/** `preset.json` version 2: a book — one markdown file per chapter, in
 *  order, or a locale → chapter list map. */
export interface BundleManifestV2 extends BundleManifestBase {
  version: 2;
  chapters: BundleChapterSpec[] | Record<string, BundleChapterSpec[]>;
}

export type BundleManifest = BundleManifestV1 | BundleManifestV2;

/** Reads one bundle file by its manifest-relative path; rejects when the
 *  file does not exist. */
export type BundleFileReader = (path: string) => Promise<ArrayBuffer>;

/** How the files a bundle declares are named once loaded: the `fileId`
 *  written into `Resource.bitmap/svg` and `config.customFonts`. Defaults to
 *  the path inside the bundle. */
export interface BundleIdScheme {
  blob: (file: string) => string;
  font: (file: string) => string;
}

/** Intrinsic pixel size of a picture. */
export interface BundleImageSize {
  width: number;
  height: number;
}

/** A chapter as read from a bundle. `title` is the manifest's (possibly
 *  empty for a version 1 bundle). */
export interface BundleChapter {
  title: string;
  /** Path of the chapter's markdown inside the bundle. */
  file: string;
  markdown: string;
}

export interface BundleBlob {
  fileId: string;
  /** Path inside the bundle. */
  file: string;
  bytes: ArrayBuffer;
  mime: string;
}

export interface BundleFontFile {
  fileId: string;
  /** Path inside the bundle. */
  file: string;
  fileName: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  format: CustomFontFormat;
  bytes: ArrayBuffer;
}
