// The semantic model of a reflowable book: what the walk over the laid-out
// pages (walk.ts) rebuilds and the serializer (xhtml.ts) writes. Text is
// kept as inline items, links as targets resolved once every chapter has
// been walked (a cross-reference may point at a later chapter).

/** Where a link goes, resolved to `file#id` by the registry. */
export type LinkTarget =
  /** A URL as written (`https:`, `mailto:`…, or a relative one). */
  | { kind: 'url'; href: string }
  /** An anchor of the book: a heading's `{#id}`, an inline anchor, a
   *  container, a bibliography entry (`ref-<key>`). */
  | { kind: 'anchor'; id: string }
  /** A numbered resource (figure, table). */
  | { kind: 'resource'; id: string }
  /** A footnote of the chapter document `doc`. */
  | { kind: 'note'; doc: number; id: string; first: boolean }
  /** A printed page (book page index), as an index page number links. */
  | { kind: 'page'; bookIndex: number };

/** Inline formatting of a text run. Every flag maps to one element or
 *  class (see xhtml.ts). */
export interface Format {
  bold?: boolean;
  italic?: boolean;
  script?: 'sup' | 'sub';
  smallCaps?: boolean;
  /** Part of a caption's numbered label. */
  label?: boolean;
  /** Chinese emphasis dots / proper-name line / book-title line. */
  dots?: boolean;
  proper?: boolean;
  book?: boolean;
  /** Vertical text: tate-chu-yoko, author's orientation. */
  tcy?: boolean;
  orientation?: 'upright' | 'sideways';
  /** A warichu note (two small rows in print, one small run here). */
  warichu?: boolean;
  /** A completed task's text. */
  done?: boolean;
  /** The language of the run when it differs from its document's: the
   *  one the author named on an inline isolate (`:ltr[…]{lang=en}`,
   *  `VDTLineSegment.lang`). */
  lang?: string;
}

/** `lvl` on a text or raw item: the UAX #9 embedding level the engine
 *  resolved for the segment it comes from (#367/#369: odd for
 *  `VDTLineSegment.rtl`, `level` past 1), on lines that carry levels. The
 *  serializer nests the runs that rise above their paragraph's level in
 *  `dir` isolates (xhtml.ts `bidiLevels`), so a reading system orders them
 *  as the print did; items without one take their level from their
 *  letters or their neighbours. */
export type InlineItem =
  | { t: 'text'; text: string; fmt: Format; link?: LinkTarget; lvl?: number }
  /** Markup written as is (maths, ruby, chips, swatches). */
  | { t: 'raw'; xhtml: string; link?: LinkTarget; lvl?: number }
  /** The start of a printed page (`epub:type="pagebreak"`). */
  | { t: 'page'; bookIndex: number }
  /** An anchor set in the text (an empty element carrying its id). */
  | { t: 'anchor'; id: string };

export interface ParagraphNode {
  k: 'p';
  inl: InlineItem[];
  cls?: string[];
  id?: string;
  dir?: 'ltr' | 'rtl';
}

export interface HeadingNode {
  k: 'h';
  level: number;
  id: string;
  inl: InlineItem[];
  cls?: string[];
  dir?: 'ltr' | 'rtl';
}

export interface ListItemNode {
  marker?: string;
  inl: InlineItem[];
  /** Nested lists. */
  children: Node[];
  done?: boolean;
  dir?: 'ltr' | 'rtl';
}

export interface ListNode {
  k: 'list';
  ordered: boolean;
  task: boolean;
  items: ListItemNode[];
}

export interface QuoteNode {
  k: 'quote';
  children: ParagraphNode[];
}

export interface CalloutNode {
  k: 'callout';
  styleId?: string;
  title?: string;
  children: Node[];
  /** A pull quote: `'echo'` when its words are read in the chapter's
   *  text as well (the box is then hidden from assistive technology, so
   *  the words are read once), `'own'` when only its style names it one
   *  (walk.ts `markPullQuotes`). */
  pullQuote?: 'echo' | 'own';
}

export interface FigureNode {
  k: 'figure';
  id: string;
  /** Pages starting where the figure is read. */
  pre: InlineItem[];
  fileId?: string;
  alt: string;
  caption: InlineItem[];
  captionAbove: boolean;
  note: InlineItem[];
}

export interface TableCellNode {
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
  header: boolean;
  align: string;
  verticalAlign: string;
  inl: InlineItem[];
  image?: { fileId: string; alt: string; width?: number };
  background?: string;
  alternate?: boolean;
}

export interface TableNode {
  k: 'table';
  id: string;
  pre: InlineItem[];
  caption: InlineItem[];
  captionAbove: boolean;
  note: InlineItem[];
  headerRows: number;
  columnWidths?: number[];
  cells: Map<string, TableCellNode>;
}

/** One bayt of a `:::verse` poem (#378): its ṣadr and ʿajuz, or a lone
 *  hemistich (`single`, set centred on the poem). */
export interface BaytNode {
  sadr: InlineItem[];
  ajuz: InlineItem[];
  single?: boolean;
  /** The ornament printed in the gap (`ornament="٭"`), not text. */
  ornament?: string;
}

/** A `:::verse` poem: bayts in two hemistichs. */
export interface VerseNode {
  k: 'verse';
  /** Page starts and anchors that come before its first bayt. */
  pre: InlineItem[];
  bayts: BaytNode[];
  /** The paragraph style its fence names (`ps-<id>`). */
  cls?: string[];
  dir?: 'ltr' | 'rtl';
}

export interface MathNode {
  k: 'math';
  pre: InlineItem[];
  tex: string;
  svg: string;
}

/** A contents row of a `:::toc`. */
export interface TocRowNode {
  number?: string;
  inl: InlineItem[];
  subtitle: InlineItem[];
  /** Book page index the row points at. */
  page?: number;
  part?: boolean;
  /** The row's plain title, to find the heading it lists. */
  title: string;
}

export interface TocNode {
  k: 'toc';
  pre: InlineItem[];
  rows: TocRowNode[];
}

/** Page starts and anchors with no text of their own to sit in (a blank
 *  page, the last page of a chapter). */
export interface MarkerNode {
  k: 'marker';
  inl: InlineItem[];
}

export type Node =
  | ParagraphNode
  | HeadingNode
  | ListNode
  | QuoteNode
  | CalloutNode
  | FigureNode
  | TableNode
  | MathNode
  | VerseNode
  | TocNode
  | MarkerNode;

/** A footnote: its paragraph and the file of its first marker. */
export interface NoteModel {
  doc: number;
  id: string;
  inl: InlineItem[];
  /** The note's direction when it differs from the document's. */
  dir?: 'ltr' | 'rtl';
}

/** One XHTML content document of the spine. */
export interface FileModel {
  /** Href relative to the package document (`text/chapter-001.xhtml`). */
  href: string;
  /** Manifest id. */
  itemId: string;
  kind: 'chapter' | 'part';
  /** Index of the chapter document it comes from. */
  doc: number;
  nodes: Node[];
  notes: NoteModel[];
  lang: string;
  dir?: 'rtl';
  /** The `<title>`: the first heading's text, else the book's. */
  title?: string;
}

/** A heading as the navigation and the contents rows see it. */
export interface HeadingEntry {
  file: FileModel;
  id: string;
  /** Level as written (1–6); 0 for a part opener. */
  level: number;
  label: string;
  /** Book page index the heading was printed on. */
  page: number;
  /** Listed in the navigation (a heading style may opt out). */
  listed: boolean;
}
