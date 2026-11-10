/**
 * IDML into Postext: an InDesign document as a new book. Read
 * the package, look at what it holds (`analyzeIdml`: the stories, the
 * styles and a guess at what each becomes), then convert it with the roles
 * chosen (`idmlToPostext`).
 */

import { readIdml } from './read.js';
import { idmlToPostext, type IdmlImportOptions, type IdmlImportResult } from './convert.js';

export { readIdml } from './read.js';
export type { IdmlDocument, IdmlStyle, IdmlPara, IdmlStory } from './read.js';
export { analyzeIdml, guessParagraphRole, guessCharacterRole, linkName, PARAGRAPH_ROLES, CHARACTER_ROLES } from './analyze.js';
export type { IdmlAnalysis, ParagraphRole, CharacterRole, StyleUse } from './analyze.js';
export { idmlToPostext } from './convert.js';
export type { IdmlImportOptions, IdmlImportResult, IdmlNote, IdmlNoteId } from './convert.js';

/** Read and convert an `.idml` in one step, every style as guessed unless
 *  `options` says otherwise. */
export function importIdml(bytes: Uint8Array, options: IdmlImportOptions = {}): IdmlImportResult {
  return idmlToPostext(readIdml(bytes), options);
}
