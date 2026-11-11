// postext-idml: InDesign Markup for Postext, in both directions.
export { idmlDocument } from './export/index.js';
export type { IdmlOptions, IdmlResult } from './export/index.js';
// Reading: the typed model of a package, and what an importer asks of it.
export * from './read/index.js';
// Importing: an IDML package as a Postext book.
export { idmlToPostext, importBundleInput } from './import/index.js';
export type { IdmlImportOptions, IdmlImportResult, IdmlLink, ImportedFont, ImportFinding, ImportReport, FindingSeverity, StyleMapping } from './import/index.js';
