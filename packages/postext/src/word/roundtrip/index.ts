// Round-trip import of Word corrections (#1395): a .docx exported by the
// semantic or the formatted writer carries an export map; the edits made
// in Word go back to the exact Markdown and resource positions, merged
// with whatever changed in the book since the export.

export type { DocxEditSource, DocxEdit, DocxEditResult, DocxComment } from './types.js';
export { isExportedDocx } from './read.js';
export { applyDocxEdits } from './apply.js';
export { DocxReadError } from '../docxRead/parts.js';
export { diffText, type Hunk } from './diff.js';
