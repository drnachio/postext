// The export map (#1389): what both Word variants embed so edits made in
// Word re-import into the exact Markdown and resource positions (#1395).
// Stored deflated + base64 JSON in a custom XML part; every fragment is
// wrapped in a hidden bookmark `_ptx_<id>` in the document.

/** The XML namespace of the export map. */
export const EXPORT_MAP_NS = 'https://postext.dev/ns/docx-map/1';
/** The root element of the export map. */
export const EXPORT_MAP_ROOT = 'postextExportMap';
/** The prefix of the bookmarks the export map points at. */
export const BOOKMARK_PREFIX = '_ptx_';

/** Which kind of `.docx` was exported. */
export type ExportVariant = 'semantic' | 'formatted';

/** An export by the name the user chooses it by (#1517): the flow
 *  document with the book's design (`formatted`) or content only
 *  (`semantic`), or the page facsimile. The map's {@link ExportVariant}
 *  names the writer: `semantic` for both flow designs, `formatted` for the
 *  facsimile (its name before #1458). */
export type ExportName = 'formatted' | 'semantic' | 'facsimile';

/** A chapter of the export map. */
export interface MapChapter {
  /** Book chapter id (Sandbox) or file name (CLI). */
  id: string;
  title?: string;
  /** Hash of the chapter Markdown at export time. */
  hash: string;
}

/** What a fragment came from: a chapter's Markdown or a field of a resource. */
export type FragmentTarget =
  | { kind: 'markdown'; chapter: number }
  | { kind: 'resource'; resourceId: string; field: 'caption' | 'note' | 'alt' | 'cell' | 'label'; row?: number; col?: number }
  | { kind: 'generated' };

/** Inline formatting of a span of the exported text, to detect changes. */
export interface MapFormat {
  start: number;
  end: number;
  /** b = bold, i = italic, c = small caps, p = sup, s = sub, k = code. */
  flags: string;
  href?: string;
}

/** A piece of text of the `.docx`, and what it came from. */
export interface MapFragment {
  /** Bookmark suffix (base36, unique in the file). */
  id: string;
  /** Logical block; fragments split by columns/pages share it. */
  block: string;
  /** Order of this fragment within its block. */
  part: number;
  target: FragmentTarget;
  /** Plain text as exported (engine line breaks as '\n', added hyphens included). */
  text: string;
  /** Source offset per UTF-16 code unit of `text` (`map.length ===
   *  text.length`); -1 = synthetic (line break,
   *  added/repeated hyphen, generated number). Resource targets index the
   *  resource field's text. */
  map: number[];
  /** `hash` (maths only): hashText of the canonical OMML the writer
   *  emitted (anchors/ommlHash.ts), so an equation Word left alone keeps
   *  its TeX byte-identical. */
  atoms?: { at: number; start: number; end: number; kind: string; hash?: string }[];
  formats?: MapFormat[];
  /** Source range the fragment covers [start, end). */
  range: [number, number];
  /** Paragraph role/style, used to style paragraphs the user adds. */
  role?: string;
}

/** The text and resources as they were at export, to compare against. */
export interface ExportSnapshot {
  chapters: { id: string; markdown: string }[];
  /** Resources as JSON (only the ones the export references). */
  resources?: Record<string, unknown>;
  configHash?: string;
}

/** What an exported `.docx` carries so that edits made in Word find their way
 *  back to the Markdown. */
export interface ExportMap {
  version: 1;
  exportId: string;
  variant: ExportVariant;
  /** The look of a flow document (#1458): the book's design, or content
   *  only. Absent in files written before, and in the page facsimile. */
  design?: 'book' | 'plain';
  /** postext version that wrote the file. */
  engine: string;
  createdAt: string;
  chapters: MapChapter[];
  /** In document reading order. */
  fragments: MapFragment[];
  snapshot?: ExportSnapshot;
  /** Atom holders are runs marked w:noProof (formatted, since #1406): the
   *  importer tells them from typed no-break spaces. */
  holders?: true;
}
