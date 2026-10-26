/**
 * «Move the text to the Markdown» (#874): rescue a book that keeps its
 * content in heading styles — the pattern of the 1.33 ports, a hidden
 * heading style per page whose running head holds dozens of text elements
 * placed on the page — by turning each page design into a page template
 * whose frames take the text elements' boxes, and each page of the chapter
 * into a `::::page{template}` fence whose `:::frame{slot}` blocks hold the
 * text. The design's boxes and pictures become the template's decoration;
 * the text's face, size and colour a paragraph style (one the book has when
 * it matches); highlight boxes under bold words become chips. Similar pages
 * share a template and extend it.
 *
 * Pure: a configuration and the chapters' Markdown in, the new ones and a
 * report out. The Sandbox runs it from its migration dialog; the CLI and the
 * agent skill can call it as it is.
 */


export type { TextMigrationChapter, TextMigrationInput, TextMigrationOptions, ContentInConfigCount, MigratedPage, TextMigrationReport, TextMigrationResult } from './textToMarkdown/types.js';
export { moveTextToMarkdown } from './textToMarkdown/move.js';
