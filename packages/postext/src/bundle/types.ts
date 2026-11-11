// The `.postext` bundle format: a directory-shaped set of files — a
// `preset.json` manifest, one markdown file per chapter, `resources/*` and
// `fonts/*` — zipped into one file. These types describe the manifest; the
// codec lives in `manifest.ts`, `codec.ts` and `zip.ts`.

import type { CustomFontFormat, LayoutContinuation, PostextConfig, Resource } from '../types.js';
import type { ConfigOverride } from '../defaults/configLayers.js';

/** Optional showcase metadata a manifest may carry: everything a picker can
 *  show beyond name and description. All fields are purely descriptive. */
export interface BundleShowcaseMeta {
  /** Every locale the bundle carries chapters for (a bilingual bundle lists
   *  both); `locale` stays the primary one. */
  locales?: string[];
  /** The locale a viewer opens the bundle in when the reader asks for none
   *  (a picker, a link without a language): the original of a book whose
   *  translations would otherwise open for readers of their language. One
   *  of `locales`; absent, the viewer's own language picks. */
  openLocale?: string;
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
export type BundleResourceSpec = Omit<Resource, 'createdAt' | 'updatedAt' | 'bitmap' | 'svg' | 'score'> & {
  file?: string;
  /** Score resources only (#1172): the notation inline (`format` +
   *  `source`), or kept in `file` (`.abc`, `.musicxml`, `.mei`, `.krn`),
   *  whose text becomes `source` (`format` read from the extension when
   *  unset). */
  score?: Partial<NonNullable<Resource['score']>>;
  /** SVG resources only: a single-page PDF holding the same figure as
   *  vectors, embedded verbatim by the PDF backend in place of the SVG
   *  (`Resource.svg.pdfFileId`). */
  pdfFile?: string;
  /** Bitmap resources only: the TIFF or Photoshop original the picture
   *  was imported from, which the PDF backend prints from in place of
   *  `file`, the preview screens show (`Resource.bitmap.printFileId`). */
  printFile?: string;
  /** SVG resources only (#630): `false` keeps the markup as stored when
   *  it is shown as an image, with no `@font-face` added for the families
   *  its text names (`Resource.svg.inlineFonts`). */
  inlineFonts?: false;
  /** Video resources only (#454): the poster frame's file. `file` is then
   *  the video itself (a self-hosted `.mp4` / `.webm`), and `width` /
   *  `height` the poster's size. The `video` object carries the rest
   *  (source, address, player options) without file ids. */
  poster?: string;
  width?: number;
  height?: number;
  /** Bitmap resources only (#631): the picture's ppi at its natural print
   *  size (`Resource.bitmap.resolution`). */
  resolution?: number;
  /** Bitmap resources only: the resolution the file states
   *  (`Resource.bitmap.fileResolution`). Read from the file when the
   *  bundle is opened under `layout.bitmapResolution: 'file'` and the spec
   *  omits it. */
  fileResolution?: number;
  /** Source line / credits set under the resource (`Resource.note`). */
  note?: string;
};

/** A face of a font family as the manifest lists it. */
export interface BundleFontVariantSpec {
  weight: number;
  style: 'normal' | 'italic';
  /** Font file relative to the bundle root (`.ttf`, `.otf` or `.woff2`). */
  file: string;
}

/** A font family as the manifest lists it. */
export interface BundleFontFamilySpec {
  name: string;
  variants: BundleFontVariantSpec[];
  /** False when the bundle may set its pages with this family but must not
   *  pass the files on: writing the bundle out again leaves the family's
   *  files (and its `fonts[]` entry) behind. Defaults to true. */
  redistributable?: boolean;
  /** An open family of about the same width for the faces of this one the
   *  bundle does not carry (a licensed family it leaves out, #978): hosts
   *  set those faces in it under this family's name, so a check of the
   *  plain bundle breaks lines near where the real face does. `variants`
   *  may then be empty. */
  fallback?: string;
}

/** One chapter file inside a version 2 bundle (`chapters/01-intro.md`). */
export interface BundleChapterSpec {
  title: string;
  file: string;
}

/** What a bilingual bundle changes per locale on top of its shared `config`
 *  and `resources`: the configuration fields that locale sets differently
 *  (an override merged field by field, #1209; under `configVersion` 20 or
 *  less, top-level keys replaced wholesale), and the wording of resources — caption, note, alt text, a
 *  table's cells — merged by id. A resource whose artwork carries words may
 *  also name its own `file` for the locale, and a video its own `poster`
 *  and `video` (the cut in that language, at its own address, #478). */
export interface BundleLocaleOverrides {
  /** The book's title in this language, in place of the manifest's `name`
   *  wherever the edition is listed (a library, `postext check`, the
   *  site's shelf). */
  name?: string;
  /** The edition's description, in place of the manifest's
   *  `description`. */
  description?: string;
  /** The fields this language sets differently from the shared `config`,
   *  merged over it field by field (`mergeConfigLayers`): objects key by
   *  key, lists of entries with an `id` (styles, palette, resource types)
   *  entry by entry, `levels` by `level`; `null` puts a shared value back
   *  to this language's default and `{ id, $remove: true }` drops a
   *  shared list entry. Under `configVersion` 20 or less each top-level
   *  key replaces the shared one whole. */
  config?: ConfigOverride;
  /** How this language's edition opens, over the manifest's `view` (a
   *  vertical edition read whole, its translation a chapter at a time). */
  view?: BundleViewSpec;
  /** Where this language's edition starts, in place of the manifest's
   *  `start` (a right-bound edition that opens on the other side). */
  start?: BundleStart;
  resources?: (Pick<BundleResourceSpec, 'id'> & Partial<Pick<BundleResourceSpec, 'caption' | 'note' | 'altText' | 'table' | 'file' | 'pdfFile' | 'printFile' | 'poster' | 'video' | 'width' | 'height' | 'resolution' | 'fileResolution'>>)[];
}

/** Where the book of a bundle starts (#695): what its first chapter is
 *  laid out after, for a bundle that holds part of a longer publication
 *  (pages 58 to 61 of an issue, chapter 4 of a textbook). It is the
 *  `continuation` a single document would be built with
 *  (`buildDocument({ markdown, continuation }, config)`), less
 *  `bookPageCount`, which the reader counts: the pages before the first
 *  one (`pageIndexOffset`: an odd count opens the book on a verso, with
 *  the mirrored margins and running heads of that side), the page
 *  numbering in effect (`pageNumbering`), the heading counters
 *  (`headings`: `{ h1: 3 }` makes the first `#` chapter 4), the open part
 *  and the other counters. Every field is optional. */
export type BundleStart = Omit<LayoutContinuation, 'bookPageCount'>;

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
  /** Where the book starts, when it is part of a longer one (see
   *  {@link BundleStart}). Absent: at page 1, a recto, with every counter
   *  at zero. A reader that does not know the field ignores it. */
  start?: BundleStart;
  /** The configuration rules `config` and each `localized[…].config` are
   *  written for (`CONFIG_VERSION`, which every writer since postext 1.5
   *  sets: 8 from 1.5, 14 from 1.30, 15 since composed pages (#853), whose
   *  `pageTemplates` and `labelStyles` an older reader ignores). A manifest without it was written by postext 1.4 or
   *  earlier, and `readBundle` reads its configuration with the heading
   *  breaks, the maths size, the space around inline resources (in the
   *  text and inside boxes), the heading marks, the drop-cap sizes, the
   *  room under a colon line that introduces a list, the lines a box cut
   *  leaves of a paragraph or list item, the breaks at dashes and at
   *  compounds' hyphens, the breaking of ragged text, the split under a
   *  heading and the space under `:::paragraphs` containers 1.4 laid out
   *  (`pinLegacyHeadingBreaks`, `pinLegacyMathSize`, `pinLegacyInlineGap`,
   *  `pinLegacyBoxResourceGap`, `pinLegacyHeadingMarks`,
   *  `pinLegacyDropCapSize`, `pinLegacyColonListRoom`,
   *  `pinLegacyBoxChildCut`, `pinLegacyDashBreaks`, `pinLegacyHyphenBreaks`,
   *  `pinLegacyRaggedBreaking`, `pinLegacyHeadingSplit`,
   *  `pinLegacyParagraphContainerSpacing`); one stamped 3 to 7 (a 1.5
   *  prerelease) gets the pins of the rules after it only. A manifest
   *  written by hand for today's rules sets it to `CONFIG_VERSION`. */
  configVersion?: number;
  config?: PostextConfig;
  resources?: BundleResourceSpec[];
  fonts?: BundleFontFamilySpec[];
  /** Locale → overrides, resolved with the same rules as a locale →
   *  chapters map (exact tag, then the same language and script — `zh-TW`
   *  reads `zh-Hant` — then the manifest's locale, then the first entry). */
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

/** A bundle's `preset.json`, in either version of its format. */
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

/** Intrinsic pixel size of a picture. A bitmap's may carry the
 *  resolution its file states (see {@link BitmapInfo}). */
export interface BundleImageSize {
  width: number;
  height: number;
  resolution?: BitmapFileResolution;
}

/** Where a bitmap's resolution was read: a PNG `pHYs` chunk, a JPEG JFIF
 *  header, or EXIF (JPEG or WebP). */
export type BitmapResolutionSource = 'pHYs' | 'jfif' | 'exif';

/** The resolution a bitmap's file states, in pixels per inch. */
export interface BitmapFileResolution {
  x: number;
  y: number;
  source: BitmapResolutionSource;
}

/** A bitmap's pixel size and the resolution its file states, if any
 *  (`bitmapInfo`). */
export interface BitmapInfo {
  width: number;
  height: number;
  resolution?: BitmapFileResolution;
}

/** A chapter as read from a bundle. `title` is the manifest's (possibly
 *  empty for a version 1 bundle). */
export interface BundleChapter {
  title: string;
  /** Path of the chapter's markdown inside the bundle. */
  file: string;
  markdown: string;
}

/** A resource file of a bundle. */
export interface BundleBlob {
  fileId: string;
  /** Path inside the bundle. */
  file: string;
  bytes: ArrayBuffer;
  mime: string;
}

/** A font file of a bundle, with the family and face it belongs to. */
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
