// The export map (#1389): what both Word variants embed so edits made in
// Word re-import into the exact Markdown and resource positions (#1395).
// Stored deflated + base64 JSON in a custom XML part; every fragment is
// wrapped in a hidden bookmark `_ptx_<id>` in the document.

export const EXPORT_MAP_NS = 'https://postext.dev/ns/docx-map/1';
export const EXPORT_MAP_ROOT = 'postextExportMap';
export const BOOKMARK_PREFIX = '_ptx_';

export type ExportVariant = 'semantic' | 'formatted';

export interface MapChapter {
  /** Book chapter id (Sandbox) or file name (CLI). */
  id: string;
  title?: string;
  /** Hash of the chapter Markdown at export time. */
  hash: string;
}

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

export interface ExportSnapshot {
  chapters: { id: string; markdown: string }[];
  /** Resources as JSON (only the ones the export references). */
  resources?: Record<string, unknown>;
  configHash?: string;
}

export interface ExportMap {
  version: 1;
  exportId: string;
  variant: ExportVariant;
  /** postext version that wrote the file. */
  engine: string;
  createdAt: string;
  chapters: MapChapter[];
  /** In document reading order. */
  fragments: MapFragment[];
  snapshot?: ExportSnapshot;
}
