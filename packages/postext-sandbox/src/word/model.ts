// What the DOCX reader keeps of a Word document: its blocks (paragraphs and
// tables), runs with the formatting Postext can say, the styles in use, the
// numbering definitions, the notes and the pictures. The quality report and
// the Markdown converter both read this model, never the XML.

export type WordStyleType = 'paragraph' | 'character' | 'table' | 'numbering';

export interface WordStyle {
  id: string;
  /** The style's name as stored (`heading 1`, `Quote`, `Box Title`). Built-in
   *  styles carry Word's English name whatever the UI language. */
  name: string;
  type: WordStyleType;
  basedOn?: string;
  /** Run formatting the style itself sets (character styles map to marks by
   *  default from these). */
  bold?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  script?: 'sup' | 'sub';
  /** Numbering a list style carries (`List Bullet`, `List Number`). */
  numId?: string;
  ilvl?: number;
  /** `w:outlineLvl` (0-based): a heading level the style declares. */
  outlineLevel?: number;
}

export interface WordTextRun {
  type: 'text';
  text: string;
  /** Direct formatting (undefined: not set on the run). */
  bold?: boolean;
  italic?: boolean;
  smallCaps?: boolean;
  script?: 'sup' | 'sub';
  /** Character style name, when the run has one. */
  charStyle?: string;
  /** Live link target. */
  href?: string;
  /** The run sets a font, size, colour, highlight, underline or caps by
   *  hand: direct formatting Postext drops (quality report). */
  manual?: boolean;
  /** Hidden text (`w:vanish`). */
  hidden?: boolean;
}

export type WordRun =
  | WordTextRun
  | { type: 'break'; kind: 'line' | 'page' | 'column' }
  | { type: 'tab' }
  | { type: 'note'; kind: 'footnote' | 'endnote'; id: string }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'image'; rId: string; name?: string; alt?: string; widthEmu?: number; heightEmu?: number }
  | { type: 'index'; term: string[]; main?: boolean; see?: string };

export interface WordParagraph {
  type: 'paragraph';
  /** Paragraph style id ('' = the document's default). */
  styleId: string;
  runs: WordRun[];
  /** Word numbering on the paragraph (direct or from its style). */
  list?: { numId: string; ilvl: number };
  pageBreakBefore?: boolean;
  /** The paragraph sets alignment, indents or spacing by hand. */
  manualLayout?: boolean;
  /** Paragraphs of text boxes anchored in this paragraph. */
  textBoxes?: WordBlock[];
}

export interface WordCell {
  blocks: WordBlock[];
  colSpan: number;
  /** `w:vMerge`: 'restart' opens a vertical merge, 'continue' is covered. */
  vMerge?: 'restart' | 'continue';
  shading?: string;
}

export interface WordTable {
  type: 'table';
  rows: WordCell[][];
  /** Rows marked to repeat as the header (`w:tblHeader`). */
  headerRows: number;
  /** Grid column widths (twips), when the table declares them. */
  widths?: number[];
}

export type WordBlock = WordParagraph | WordTable;

export interface WordNumberingLevel {
  /** `bullet`, `decimal`, `lowerLetter`, `upperRoman`… */
  format: string;
  start: number;
}

export interface WordNumbering {
  /** numId → abstract id and per-level start overrides. */
  nums: Map<string, { abstractId: string; starts: Map<number, number> }>;
  abstracts: Map<string, Map<number, WordNumberingLevel>>;
}

export interface WordMedia {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

export interface WordDocument {
  blocks: WordBlock[];
  styles: Map<string, WordStyle>;
  /** Id of the default paragraph style (`Normal`). */
  defaultParagraphStyle: string;
  numbering: WordNumbering;
  footnotes: Map<string, WordBlock[]>;
  endnotes: Map<string, WordBlock[]>;
  /** Relationship id → picture. */
  media: Map<string, WordMedia>;
  /** Core properties. */
  title?: string;
  author?: string;
  /** The import template a Postext export embeds (`customXml`), as stored. */
  embeddedTemplate?: unknown;
  /** Revision marks and comments met while reading (quality report). */
  revisions: { insertions: number; deletions: number; comments: number };
}

/** A paragraph's style name ('Normal' when unset). */
export function paragraphStyleName(doc: WordDocument, p: WordParagraph): string {
  const id = p.styleId || doc.defaultParagraphStyle;
  return doc.styles.get(id)?.name ?? (id || 'Normal');
}

/** Plain text of a paragraph's runs (tabs and breaks as spaces). */
export function paragraphText(p: WordParagraph): string {
  let out = '';
  for (const r of p.runs) {
    if (r.type === 'text') out += r.text;
    else if (r.type === 'tab' || r.type === 'break') out += ' ';
    else if (r.type === 'math') out += r.tex;
  }
  return out;
}
