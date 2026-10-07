// The public contract of postext-epub and the publication model shared by
// the two renditions and the package writer.
//
//   renderToEpub(docs, options)          public entry (index.ts)
//     ├─ buildFixedPublication(...)      fixed/      one XHTML per printed page
//     ├─ buildReflowablePublication(...) reflowable/ one XHTML per chapter
//     └─ packEpub(publication)           package/    OCF zip, OPF, nav, NCX
//   readEpub(bytes)                      package/    what a viewer needs
//
// Both renditions read the same input: the book's laid-out print documents,
// one VDTDocument per chapter in book order (the chain the PDF backend
// renders), so numbering, footnotes, citations, cross-references, the TOC and
// the index arrive resolved.

import type { VDTDocument } from 'postext';

/** The two values of the EPUB 3 `rendition:layout` property, as the
 *  industry names them: a fixed layout (`pre-paginated`, FXL) reproduces
 *  every printed page; a reflowable book (the EPUB default) reflows its text
 *  to the reader's screen and settings. */
export type EpubLayout = 'fixed' | 'reflowable';

/** Book metadata written to the package document. */
export interface EpubMetadata {
  title: string;
  subtitle?: string;
  /** Authors, in order (`dc:creator`, role `aut`). */
  creators?: string[];
  /** BCP 47 tag of the book's language (`dc:language`, `xml:lang`). */
  language: string;
  /** Unique identifier: an ISBN (`urn:isbn:…` or bare digits), a URN or a
   *  URL. When absent, a stable `urn:uuid:` is derived from the title,
   *  creators and language, so regenerating a book keeps its identity. */
  identifier?: string;
  /** Publication date (`dc:date`), ISO 8601. */
  date?: string;
  publisher?: string;
  rights?: string;
  description?: string;
  /** `dcterms:modified`; defaults to now (pass one for reproducible output). */
  modified?: Date;
}

/** One font face the book embeds: every family its pages or styles use. */
export interface EpubFontFile {
  family: string;
  /** A weight (`400`) or a variable range (`'100 900'`). */
  weight: number | string;
  style: 'normal' | 'italic';
  bytes: Uint8Array;
  format: 'woff2' | 'woff' | 'ttf' | 'otf';
  /** CSS `unicode-range` of a subset file (Google Fonts slices). */
  unicodeRange?: string;
}

/** Bytes of a resource picture by its `fileId` (bitmap or SVG source), with
 *  its media type (`image/png`, `image/jpeg`, `image/webp`, `image/gif`,
 *  `image/svg+xml`). Undefined when the host has none. */
export type EpubResourceBytes = (
  fileId: string,
) => { bytes: Uint8Array; mediaType: string } | undefined | Promise<{ bytes: Uint8Array; mediaType: string } | undefined>;

export interface EpubCover {
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/svg+xml';
  /** Text alternative of the cover picture; defaults to the title. */
  alt?: string;
  /** The picture shows the book's first printed page (a capture of it).
   *  The fixed layout then gives it no page of its own, which would show
   *  the cover twice: it is only the package's cover image (the reading
   *  system's thumbnail) and the first page is the cover document. The
   *  reflowable book, which has no printed pages, opens with it all the
   *  same. */
  showsFirstPage?: boolean;
}

export interface EpubProgress {
  /** `documents`: content documents being written (pages for the fixed
   *  layout, chapters when reflowable); `resources`: fonts and pictures;
   *  `package`: OPF, navigation and the zip. */
  phase: 'documents' | 'resources' | 'package';
  done: number;
  total: number;
}

export type EpubWarning =
  /** A picture the host gave no bytes for: set as a placeholder. */
  | { kind: 'missingImage'; fileId: string; resourceId?: string }
  /** A family the documents use with no embedded face: readers fall back. */
  | { kind: 'missingFont'; family: string; weight?: number | string; style?: string }
  /** Something the rendition could not express (named in `detail`). */
  | { kind: 'unsupported'; detail: string };

export interface RenderToEpubOptions {
  layout: EpubLayout;
  metadata: EpubMetadata;
  fonts?: EpubFontFile[];
  resourceBytes?: EpubResourceBytes;
  /** The cover picture. Without one, the fixed layout uses the book's first
   *  page as its cover document and the reflowable book has no cover image. */
  cover?: EpubCover;
  onProgress?: (progress: EpubProgress) => void;
  onWarning?: (warning: EpubWarning) => void;
  signal?: AbortSignal;
  /** Fixed layout with comic pages (`:::page`): add Kindle Panel View, a
   *  tap target over each panel that magnifies it (KF8 region
   *  magnification, `app-amzn-magnify`), and the Kindle comic metadata.
   *  Each target holds a copy of its page's comic, hidden until tapped, so
   *  pages grow by one copy per panel: for books bound for Kindle
   *  (Kindle Previewer / KDP). Default false; the region-based navigation
   *  every reading system may use is written either way. */
  kindlePanelView?: boolean;
}

/** The input both renditions read. */
export type EpubSource = readonly VDTDocument[];

// ---------------------------------------------------------------------------
// Publication model: what a rendition produces and packEpub writes.
// Every `href` is relative to the package document (`OEBPS/content.opf`).
// ---------------------------------------------------------------------------

export interface EpubItem {
  /** Manifest id (an XML NCName). */
  id: string;
  href: string;
  mediaType: string;
  data: Uint8Array | string;
  /** Manifest properties (`nav`, `cover-image`, `svg`, `mathml`,
   *  `remote-resources`…). */
  properties?: string[];
  /** A resource read from the web (a video's production address, #454):
   *  declared in the manifest by its absolute `href`, not written in the
   *  container (`data` is then empty). */
  remote?: true;
}

export interface EpubSpineEntry {
  idref: string;
  linear?: boolean;
  /** Spine itemref properties (`page-spread-left`, `page-spread-right`,
   *  `rendition:page-spread-center`, `rendition:layout-pre-paginated`…). */
  properties?: string[];
}

export interface EpubNavPoint {
  label: string;
  href: string;
  children?: EpubNavPoint[];
}

/** One printed page in the `page-list` navigation. */
export interface EpubPageTarget {
  label: string;
  href: string;
}

export interface EpubLandmark {
  /** `epub:type` value: `cover`, `titlepage`, `toc`, `frontmatter`,
   *  `bodymatter`, `backmatter`, `index`, `bibliography`… */
  type: string;
  label: string;
  href: string;
}

/** Accessibility metadata (EPUB Accessibility 1.1, schema.org terms). */
export interface EpubAccessibility {
  accessModes: string[];
  accessModesSufficient: string[];
  features: string[];
  hazards: string[];
  summary: string;
  /** `dcterms:conformsTo`, e.g. `EPUB Accessibility 1.1 - WCAG 2.2 Level AA`;
   *  omitted when the book makes no claim. */
  conformsTo?: string;
}

export interface EpubPublication {
  layout: EpubLayout;
  metadata: EpubMetadata;
  items: EpubItem[];
  spine: EpubSpineEntry[];
  toc: EpubNavPoint[];
  pageList: EpubPageTarget[];
  landmarks: EpubLandmark[];
  pageProgression: 'ltr' | 'rtl';
  /** A reflowable book set in vertical lines (Chinese, Japanese): the
   *  package names its writing mode (`primary-writing-mode`), which some
   *  reading systems read before they open a content document (#428). */
  writingMode?: 'vertical-rl' | 'horizontal-rl';
  /** Kindle comic metadata (fixed layout with comic pages and
   *  {@link RenderToEpubOptions.kindlePanelView}): `book-type`,
   *  `original-resolution` and `RegionMagnification`. */
  kindle?: { comic: true; originalResolution: { width: number; height: number }; regionMagnification: boolean };
  /** Fixed-layout rendition properties. */
  fixed?: {
    spread: 'none' | 'landscape' | 'both' | 'auto';
    orientation?: 'auto' | 'portrait' | 'landscape';
    /** Page size in CSS px, for readers that look at it. */
    viewport: { width: number; height: number };
  };
  accessibility: EpubAccessibility;
}

// ---------------------------------------------------------------------------
// Reading a generated file back (viewers).
// ---------------------------------------------------------------------------

export interface ReadEpubResult {
  layout: EpubLayout;
  metadata: { title: string; language: string; identifier: string; creators: string[] };
  pageProgression: 'ltr' | 'rtl';
  /** Every file by its zip path. */
  files: Map<string, Uint8Array>;
  /** Directory of the package document inside the zip (`OEBPS/`). */
  root: string;
  /** Manifest by id: zip path and media type. */
  manifest: Map<string, { path: string; mediaType: string; properties: string[] }>;
  /** Spine in reading order: zip path and itemref properties. */
  spine: { id: string; path: string; linear: boolean; properties: string[] }[];
  /** Table of contents from the nav document (`path#fragment` targets). */
  toc: EpubNavPoint[];
  pageList: EpubPageTarget[];
  /** Fixed layout page size (from the OPF/first page viewport). */
  viewport?: { width: number; height: number };
  /** Path of the cover picture, if any. */
  coverPath?: string;
}
