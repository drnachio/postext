// The public functions of the table model: the editor's edits (model.ts)
// and transposition (transpose.ts).
export { addRow, addColumn, removeRow, removeColumn, mergeCells, unmergeCell, setCellContent, setCellImage, setCellBackground, setAlignment, parseTSV, tableGridIssues } from './model.js';
export type { CellPos, CellRange, ParseTSVOptions, TableGridIssue } from './model.js';
export { transposeTable } from './transpose.js';
