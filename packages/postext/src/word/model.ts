// What the DOCX reader keeps of a Word document: its blocks (paragraphs and
// tables), runs with the formatting Postext can say, the styles in use, the
// numbering definitions, the notes and the pictures. The quality report and
// the Markdown converter both read this model, never the XML.

/** The types of a Word style. */
export type WordStyleType = 'paragraph' | 'character' | 'table' | 'numbering';

/** A style of a Word document. */
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
  /** `w:tabs`: the tab stops the style sets or clears (#622). */
  tabs?: WordTabStop[];
  /** `w:spacing` of the style's run properties: the character spacing, in
   *  twentieths of a point (negative condenses; #932). */
  letterSpacing?: number;
  /** `w:sz` of the style's run properties, in half-points. */
  fontSizeHalfPoints?: number;
}

/** A tab stop of a Word paragraph or style (`w:tab` in `w:tabs`, #622):
 *  `val` its alignment (`left`, `right`, `center`, `decimal`, `start`,
 *  `end`; `clear` removes an inherited stop at `pos`), `pos` in twips from
 *  the start of the text, `leader` Word's leader word (`dot`, `hyphen`,
 *  `underscore`, `middleDot`, `heavy`, `none`). */
export interface WordTabStop {
  val: string;
  pos: number;
  leader?: string;
}

/** A run of text in a Word paragraph. */
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

/** Anything a Word paragraph holds: text, breaks, tabs, note references. */
export type WordRun =
  | WordTextRun
  | { type: 'break'; kind: 'line' | 'page' | 'column' }
  | { type: 'tab' }
  | { type: 'note'; kind: 'footnote' | 'endnote'; id: string }
  | { type: 'math'; tex: string; display: boolean }
  | { type: 'image'; rId: string; name?: string; alt?: string; widthEmu?: number; heightEmu?: number }
  | { type: 'index'; term: string[]; main?: boolean; see?: string };

/** A paragraph of a Word document. */
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
  /** `w:tabs` set on the paragraph itself (#622). */
  tabs?: WordTabStop[];
  /** Paragraphs of text boxes anchored in this paragraph. */
  textBoxes?: WordBlock[];
}

/** A table cell of a Word document. */
export interface WordCell {
  blocks: WordBlock[];
  colSpan: number;
  /** `w:vMerge`: 'restart' opens a vertical merge, 'continue' is covered. */
  vMerge?: 'restart' | 'continue';
  shading?: string;
}

/** A table of a Word document. */
export interface WordTable {
  type: 'table';
  rows: WordCell[][];
  /** Rows marked to repeat as the header (`w:tblHeader`). */
  headerRows: number;
  /** Grid column widths (twips), when the table declares them. */
  widths?: number[];
}

/** A block of a Word document. */
export type WordBlock = WordParagraph | WordTable;

/** A level of a Word list. */
export interface WordNumberingLevel {
  /** `bullet`, `decimal`, `lowerLetter`, `upperRoman`… */
  format: string;
  start: number;
}

/** The numbering definitions of a Word document. */
export interface WordNumbering {
  /** numId → abstract id and per-level start overrides. */
  nums: Map<string, { abstractId: string; starts: Map<number, number> }>;
  abstracts: Map<string, Map<number, WordNumberingLevel>>;
}

/** A media file of a Word document. */
export interface WordMedia {
  path: string;
  bytes: Uint8Array;
  contentType: string;
}

/** A Word document read into a plain model. */
export interface WordDocument {
  blocks: WordBlock[];
  styles: Map<string, WordStyle>;
  /** Id of the default paragraph style (`Normal`). */
  defaultParagraphStyle: string;
  /** `w:docDefaults` size, half-points: the size of text whose styles set none. */
  defaultFontSizeHalfPoints?: number;
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
