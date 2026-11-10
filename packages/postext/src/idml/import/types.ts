// The options and the result of the IDML import.

import type { PostextConfig, Resource } from '../../types.js';
import type { CharacterRole, IdmlAnalysis, ParagraphRole } from './analyze.js';

export interface IdmlImportOptions {
  /** What each paragraph style becomes, by `Self`; the analysis's guess
   *  for a style left out. */
  paragraphRoles?: Readonly<Record<string, ParagraphRole>>;
  /** What each character style becomes, by `Self`. */
  characterRoles?: Readonly<Record<string, CharacterRole>>;
  /** The files of the `Links` folder, by file name. */
  links?: ReadonlyMap<string, Uint8Array>;
  /** The title of text before the first chapter heading. */
  untitledChapter?: string;
  /** The book's language (BCP 47). */
  locale?: string;
  /** Leave the design out: the text only, on Postext's defaults. */
  textOnly?: boolean;
}

/** Something the import could not carry over as it is. */
export type IdmlNoteId =
  | 'missingLinks'
  | 'unsupportedPictures'
  | 'loosePictures'
  | 'anchoredFrames'
  | 'otherObjects'
  | 'marginFrames'
  | 'masterItems'
  | 'otherMasters'
  | 'indexMarks'
  | 'verticalText'
  | 'characterStyles'
  | 'spotSwatches'
  | 'fonts';

export interface IdmlNote {
  id: IdmlNoteId;
  count: number;
  /** Names that say which (files, fonts, masters). */
  examples: string[];
}

export interface IdmlImportResult {
  chapters: Array<{ title: string; markdown: string }>;
  config: PostextConfig;
  resources: Resource[];
  /** The bytes the resources name by `fileId`. */
  files: Map<string, { bytes: Uint8Array; mime: string }>;
  notes: IdmlNote[];
  analysis: IdmlAnalysis;
}
