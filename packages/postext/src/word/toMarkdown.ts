// Word model → Postext chapters. Each paragraph style becomes what the
// template says (heading, paragraph style, callout, quote, caption…), runs
// become inline marks, Word lists become Postext lists, notes become
// footnotes, pictures and tables become resources placed where they were.

import type { WordDocument } from './model.js';
import { Converter } from './toMarkdown/converter.js';
import type { ImportSettings, ImportResult } from './toMarkdown/helpers.js';

export { pictureResolution, paragraphTabs, paragraphTargetOf, characterTargetOf, stripCaptionLabel, tableModel } from './toMarkdown/helpers.js';
export type { ChapterMode, ImportedPicture, ImportedTable, ImportedChapter, ImportResult, ImportSettings } from './toMarkdown/helpers.js';

/** Convert a read Word document to Postext chapters and resources. */
export function wordToPostext(doc: WordDocument, settings: ImportSettings): ImportResult {
  return new Converter(doc, settings).run();
}
