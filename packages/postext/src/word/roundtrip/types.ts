// The round-trip importer's public shapes (#1395): what a corrected export
// brings back, and the report of every edit found in it.

import type { Resource } from '../../types/resources/resources.js';
import type { WordChapterInput } from '../semantic/types.js';

/** The book as it stands now, which the edits are merged into. */
export interface DocxEditSource {
  chapters: WordChapterInput[];
  resources?: Resource[];
}

/** An edit found in a `.docx` that came back from Word, and whether it
 *  applied. */
export interface DocxEdit {
  /** Chapter id of a Markdown edit. */
  chapter?: string;
  /** Resource of a caption, note, alt text or table cell edit. */
  resourceId?: string;
  /** `caption`, `note`, `alt`, `cell:<row>:<col>` or `label`. */
  field?: string;
  /** Range in the current text (the export-time text for a conflict that
   *  could not be carried over). */
  start: number;
  end: number;
  before: string;
  after: string;
  kind: 'text' | 'format' | 'paragraph' | 'tracked';
  status: 'applied' | 'conflict' | 'rejected';
  /** Why an edit did not apply. On one that did, something to know about
   *  it: `bookmark-unpaired`, a passage whose bookmark the editor took
   *  away, read as deleted because the text that stands around its place
   *  could not be told from text typed there (it comes in as added). */
  reason?: string;
}

/** A Word comment, with the text it was made on. */
export interface DocxComment {
  chapter?: string;
  resourceId?: string;
  /** Source range in the current text (-1 when the comment is not on
   *  exported text). */
  start: number;
  end: number;
  author?: string;
  text: string;
}

/**
 * Something the import has to say about the file as a whole (#1458).
 * `map-rebuilt`: the file came back without its export map (Google Docs
 * drops it) and the map was written again from the book. `book-changed`:
 * the book is not as it was when the file was exported, so the file was
 * compared with the book as it is now, and a change made in the book
 * since may read as an edit. `book-unverified`: a file written before the
 * exports said what the book was like; the same holds, unknown.
 * `writer-changed`: the file was written by another version of postext,
 * so its text was matched with the book's passage by passage.
 * `chapters-missing`: chapters the file was exported with are no longer
 * in the book.
 */
export interface DocxImportNote {
  code: 'map-rebuilt' | 'book-changed' | 'book-unverified' | 'writer-changed' | 'chapters-missing';
  /** `book-changed`: the chapters whose text changed (none: a resource
   *  or a setting did). */
  chapters?: string[];
  /** `book-changed` on a file that does not say what the book was like:
   *  the book changed, or the version of postext that writes it did. */
  unverified?: boolean;
  /** `book-changed`: passages of the book the file has no text for, and
   *  passages of the file the book no longer has; neither is touched.
   *  `chapters-missing`: how many chapters. */
  unplaced?: number;
  foreign?: number;
  count?: number;
}

/** What `applyDocxEdits` returns: the chapters and resources with the edits
 *  in, the edits and the comments. */
export interface DocxEditResult {
  variant: 'semantic' | 'formatted';
  exportId: string;
  /** Every chapter of the source, edits applied. */
  chapters: WordChapterInput[];
  /** Updated resources (deep copies) when a resource field changed. */
  resources?: Resource[];
  edits: DocxEdit[];
  comments: DocxComment[];
  changed: boolean;
  /** What to tell the user about the import as a whole. */
  notes?: DocxImportNote[];
}
