// The semantic model of a reflowable book: what the walk over the laid-out
// pages (walk.ts) rebuilds and the serializer (xhtml.ts) writes. Text is
// kept as inline items, links as targets resolved once every chapter has
// been walked (a cross-reference may point at a later chapter).

import type { VDTComicPanel, VDTResourceVideo } from 'postext';

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
  /** The classes emphasis marks other than the filled dot on the default
   *  side add to `pt-dots` (`inline.ts` `dotsClasses`, #428). */
  dotsStyle?: string;
  proper?: boolean;
  book?: boolean;
  /** A side line (傍線, `:sideline[…]`): how it is drawn and on which
   *  side of the text in its flow (over: right of vertical text). */
  side?: { style: 'solid' | 'double' | 'wavy' | 'dotted'; position: 'over' | 'under' };
  /** Vertical text: tate-chu-yoko, author's orientation. */
  tcy?: boolean;
  orientation?: 'upright' | 'sideways';
  /** A warichu note (two small rows in print, one small run here). */
  warichu?: boolean;
  /** A footnote marker set apart from the line (`footnotes.markerPosition`,
   *  JLReq §4.2.3): in the line gap (`'side'`) or flush right of a
   *  vertical line (`'right'`). */
  note?: 'side' | 'right';
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
  /** Markup written as is (maths, ruby, chips, swatches). `ruby`: the
   *  annotation a `<ruby>` holds (`VDTRuby.id`), which the next base of
   *  the same annotation joins, on this line or the next (#428). */
  | { t: 'raw'; xhtml: string; link?: LinkTarget; lvl?: number; ruby?: string }
  /** The start of a printed page (`epub:type="pagebreak"`). */
  | { t: 'page'; bookIndex: number }
  /** An anchor set in the text (an empty element carrying its id). */
  | { t: 'anchor'; id: string }
  /** A tab at its stop (#622): the line it is on is written as a row of
   *  the parts between its tabs (`pt-tab-row`). `fill`: the stop pushes
   *  the text after it to the row's end (an end, centre or decimal stop, or
   *  any with a leader); otherwise the part before it is at least `minEm`
   *  wide (a start stop, its place in the print). */
  | TabItem;

export interface TabItem {
  t: 'tab';
  fill: boolean;
  leader?: 'text' | 'rule';
  minEm?: number;
}

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
  /** A video resource (#454): what it plays; `fileId` is its poster. */
  video?: VDTResourceVideo;
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

/** A line of verse of a stanza (#620): its text, the turnovers run on
 *  after it, and its own indent. */
export interface VerseLineNode {
  inl: InlineItem[];
  /** The line's indent, in ems of the stanza's text. */
  indentEm: number;
  /** The number printed beside the line (#621): written in the margin on
   *  the line's start side, hidden from assistive technology. */
  num?: string;
}

/** A stanza of a `:::verse` poem set line by line (#620): one block-level
 *  line a line of verse, each hanging its turnovers `hangEm` in, so a
 *  reading system's reflow turns an overlong line over as the print does. */
export interface StanzaNode {
  k: 'stanza';
  /** Page starts and anchors that come before its first line. */
  pre: InlineItem[];
  lines: VerseLineNode[];
  /** The turnovers' hang, in ems of the stanza's text. */
  hangEm: number;
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

/** A line of a comic page's lettering, as the reflowable book reads it:
 *  a character's words after their name, narration (a caption), or a
 *  sound effect. */
export interface ComicLineNode {
  kind: 'speech' | 'caption' | 'sfx';
  /** The speaker's name (`comics.cast[].name`, else their id). */
  speaker?: string;
  text: string;
}

/** A panel of a comic page: its picture, cropped to the panel as printed
 *  (an SVG that shows the panel's part of the picture), then its lettering
 *  in reading order. */
export interface ComicPanelNode {
  panel: VDTComicPanel;
  /** Element id of the panel (its `#id`), when it has one. */
  id?: string;
  lines: ComicLineNode[];
}

/** A comic page (`:::page`, #565). */
export interface ComicNode {
  k: 'comic';
  pre: InlineItem[];
  /** The page's reading direction, when it differs from the document's. */
  dir?: 'ltr' | 'rtl';
  panels: ComicPanelNode[];
  /** A strip's caption (`:::strip{caption=…}`, #590): the strip and its
   *  caption are one `<figure>`, the caption its `<figcaption>`, under the
   *  panels or over them. `id`: the anchor a `:ref` naming the strip
   *  links to. */
  caption?: { inl: InlineItem[]; above: boolean; id?: string };
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
  | StanzaNode
  | TocNode
  | ComicNode
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
  /** The palette overrides of the part in force where the document starts
   *  (`:::part{palette=…}`: palette id → hex). */
  palette?: Record<string, string>;
  /** Stylesheets linked after the book's (hrefs relative to the package
   *  document): what the chapter's configuration and its part's palette
   *  change in it. */
  stylesheets?: string[];
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
