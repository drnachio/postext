// The public contract of postext-scorm.
//
//   renderToScorm(docs, options)      public entry (index.ts)
//     ├─ cutFragments(...)            fragments.ts  the documents each SCO holds
//     ├─ build{Fixed,Reflowable}Publication   postext-epub, once for all SCOs
//     ├─ scoPages(...)                sco.ts        a launch page per SCO
//     ├─ manifest(...)                manifest.ts   imsmanifest.xml
//     └─ zipSync                      the package
//
// The input is the one `renderToEpub` takes: the book's laid-out print
// documents, one per chapter in book order. The organization says which
// parts of them go in and how they are grouped.

import type { EpubCover, EpubFontFile, EpubMetadata, EpubResourceBytes, EpubSvgFontOptions, EpubWarning } from 'postext-epub';

/** The data model the package speaks: SCORM 1.2, or SCORM 2004 4th
 *  edition. */
export type ScormVersion = '1.2' | '2004';

/** The content: the printed pages (`'fixed'`), or the text reflowed to
 *  the screen (`'reflowable'`), as in the EPUB writer. */
export type ScormLayout = 'fixed' | 'reflowable';

/** A part of one chapter: a range of its Markdown body (front matter
 *  excluded), from a heading line to the next heading of its level or
 *  above. */
export interface ScormRange {
  /** Source offset of the range's start. */
  start: number;
  /** Source offset past its end. Absent: the chapter's end. */
  end?: number;
}

/**
 * An item of the package's organization (the tree the LMS shows). An item
 * with `children` groups them (an aggregation, with no content of its
 * own); one without is a SCO: a chapter (`doc`) whole, or the `range` of it.
 */
export interface ScormItem {
  title: string;
  /** The chapter a SCO is cut from: its index in the input. */
  doc?: number;
  /** The part of that chapter. Absent: the whole chapter. */
  range?: ScormRange;
  children?: ScormItem[];
}

export interface ScormProgress {
  /** `documents` and `resources`: the content (as `renderToEpub` reports
   *  them); `package`: the launch pages, the manifest and the zip. */
  phase: 'documents' | 'resources' | 'package';
  done: number;
  total: number;
}

export interface RenderToScormOptions {
  version: ScormVersion;
  layout: ScormLayout;
  /** The organization. Default: one SCO per input document, titled after
   *  its first heading. */
  items?: ScormItem[];
  /** The book's title, language and identifier (the manifest and the
   *  organization take them). */
  metadata: EpubMetadata;
  fonts?: EpubFontFile[];
  svgFonts?: EpubSvgFontOptions;
  resourceBytes?: EpubResourceBytes;
  /** Shown at the head of the first SCO in the reflowable layout. */
  cover?: EpubCover;
  /** The score that passes, a percentage (overrides the documents'
   *  `exercises.digital.passingScore`). `0`: none. */
  passingScore?: number;
  onProgress?: (progress: ScormProgress) => void;
  onWarning?: (warning: EpubWarning) => void;
  signal?: AbortSignal;
}

/** An exercise a SCO reports, as its launch page lists it. */
export interface ScoExercise {
  /** Its answers' key below the book's (`<doc>:<anchor or #ordinal.id>`). */
  key: string;
  /** What its score counts out of: its graded slots. */
  points: number;
  number: string;
  title?: string;
}

/** What a SCO's launch page is told (its `script#pt-scorm` data). */
export interface ScoData {
  version: ScormVersion;
  layout: ScormLayout;
  /** The item's title and the book's. */
  title: string;
  book: string;
  lang: string;
  dir: 'ltr' | 'rtl';
  /** The content documents, in reading order, relative to the launch
   *  page, with a label each (a page's printed number, a chapter's title). */
  docs: { href: string; label: string }[];
  /** The SCO's contents: headings and where they are. */
  toc: { label: string; doc: number; href: string; depth: number }[];
  /** A fixed layout's page size, CSS px. */
  page?: { width: number; height: number };
  /** The page progression: a right-bound book turns its pages leftwards. */
  rtl?: boolean;
  /** What the answers are kept under: the book's key, which the exercise
   *  keys follow. */
  storageKey: string;
  exercises: ScoExercise[];
  /** The passing score as a fraction, when one is set. */
  passing?: number;
  /** The player's words, in the book's language. */
  words: ScormWords;
}

/** The words of the player. */
export interface ScormWords {
  previous: string;
  next: string;
  contents: string;
  /** "{n} of {total}" */
  position: string;
  /** The content's frame, for assistive technology. */
  content: string;
}

export type { EpubWarning as ScormWarning };
