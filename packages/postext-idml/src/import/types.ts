// The importer's public shapes: what a host passes, and what it gets.

import type { PostextConfig, Resource } from 'postext';
import type { IdmlFontFile } from '../package/archive.js';

export type { IdmlFontFile } from '../package/archive.js';

/** A picture the document links to and does not carry. */
export interface IdmlLink {
  /** File name of the link (`map.png`). */
  name: string;
  /** The link as the document stores it (`file:/Volumes/…/map.png`). */
  uri: string;
}

export interface IdmlImportOptions {
  /** `'pages'`: composed pages that keep the document's geometry;
   *  `'flow'`: a flowing book; `'auto'` (default) decides and says why. */
  layout?: 'auto' | 'pages' | 'flow';
  /** Default: the document's title, else its name. */
  name?: string;
  /** Default: the language most of the text is set in. */
  locale?: string;
  /** Bytes of linked pictures; embedded ones are read from the package. */
  linkBytes?: (link: IdmlLink) => Uint8Array | undefined;
  /** Font files that travel with the document (an InDesign package's
   *  `Document fonts`, see `openIdmlArchive`). Each face the book is set
   *  in is matched to one by its PostScript name, else by family and
   *  style, and the book carries the matched files and the other faces of
   *  their families in `config.customFonts`. Left out, the book names its
   *  families only (`fonts`). */
  fontFiles?: readonly IdmlFontFile[];
  /** Each defaults to `'skip'`; what is skipped is counted in the report. */
  hiddenLayers?: 'skip' | 'include';
  hiddenObjects?: 'skip' | 'include';
  pasteboard?: 'skip' | 'include';
  nonPrinting?: 'skip' | 'include';
  /** `'visible'` (default): text under a condition that is switched off
   *  is left out and reported. */
  conditions?: 'visible' | 'all';
  /** `'accept'` (default): inserted text stays, deleted text goes. */
  trackedChanges?: 'accept' | 'reject';
  /** Default true: master text as running heads, master artwork as
   *  decoration, automatic page numbers as `{pageNumber}`. */
  masterItems?: boolean;
  /** Called once per finding, when the import ends. */
  onWarning?: (finding: ImportFinding) => void;
}

export type FindingSeverity = 'info' | 'warning' | 'loss';

/** One thing the importer read differently from the document, or left
 *  out. `info`: a mapping worth knowing; `warning`: an approximation;
 *  `loss`: something of the document the book does not show. */
export interface ImportFinding {
  id: string;
  severity: FindingSeverity;
  message: string;
  count: number;
  /** A few places or names, at most five. */
  examples: string[];
}

/** How one paragraph style of the document was read. */
export interface StyleMapping {
  /** The style's path (`Heads/H1`). */
  style: string;
  paragraphs: number;
  /** `heading 1`, `body`, `list`, `quote`, `caption`, `paragraph style
   *  <id>`. */
  target: string;
  /** Why: `name`, `size`, `list settings`, `most text`… */
  reason: string;
}

export interface ImportReport {
  findings: ImportFinding[];
  /** `faithful`: nothing lost and no approximation; `approximate`:
   *  warnings only; `lossy`: something of the document is not in the
   *  book. */
  verdict: 'faithful' | 'approximate' | 'lossy';
  styles: StyleMapping[];
  counts: {
    pages: number;
    stories: number;
    paragraphs: number;
    characters: number;
    pictures: number;
    tables: number;
    footnotes: number;
    hyperlinks: number;
    indexMarks: number;
    templates: number;
    info: number;
    warnings: number;
    losses: number;
  };
}

export interface ImportedFont {
  family: string;
  /** `file`: the font file of `fontFiles` that carries the face, when one
   *  does. A face of a collection goes by the collection's path with the
   *  face's file name after it (`Document fonts/PTSans.ttc/PTSans-Narrow.ttf`). */
  styles: { name: string; weight: number; italic: boolean; characters: number; file?: string }[];
}

export interface IdmlImportResult {
  name: string;
  locale: string;
  layout: 'pages' | 'flow';
  /** Why that layout, in a sentence. */
  reason: string;
  /** Only what the document sets. */
  config: PostextConfig;
  chapters: { title: string; markdown: string }[];
  resources: Resource[];
  /** `fileId` → bytes, for `createBundle`. */
  files: Map<string, Uint8Array>;
  /** The faces the book needs, each with the file that carries it when
   *  `fontFiles` had one. */
  fonts: ImportedFont[];
  missingLinks: { name: string; uri: string; uses: number }[];
  report: ImportReport;
}
