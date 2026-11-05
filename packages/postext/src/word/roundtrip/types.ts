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
}
