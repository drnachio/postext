// Shared input of the Word writers (#1390, #1392) and the importer (#1395).

/** One chapter of the book as the writers take it: its id (Sandbox
 *  chapter id or CLI file name), its title and its whole Markdown file,
 *  front matter included. */
export interface WordChapterInput {
  id: string;
  title?: string;
  markdown: string;
}
