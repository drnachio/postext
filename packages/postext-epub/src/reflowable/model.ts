// The semantic model of a reflowable book: what the walk over the laid-out
// pages (walk.ts) rebuilds and the serializer (xhtml.ts) writes. Text is
// kept as inline items, links as targets resolved once every chapter has
// been walked (a cross-reference may point at a later chapter).

import type { ExerciseData, ExerciseRecord, VDTComicPanel, VDTResourceVideo } from 'postext';

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
  /** Struck-through text (`~~…~~`), written as `<s>`. */
  strike?: boolean;
  /** Underlined text (`++…++`), written as `<u>`. */
  underline?: boolean;
  /** The character style (`:span[…]{style="id"}`) the run is set in: its id, written
   *  as the class `pt-cs-<id>` the stylesheet styles. */
  charStyle?: string;
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
  /** A task item's drawn box (`VDTBlock.bulletBox`, #765), in place of a
   *  `marker`: whether it is ticked and its stroke over its side. */
  box?: { checked: boolean; stroke: number };
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

/** A box's icon (`CalloutNode.icon`). */
export type CalloutIcon =
  | { kind: 'image'; fileId: string; tint?: string }
  | { kind: 'glyph'; glyph: string }
  | { kind: 'shape' };

export interface CalloutNode {
  k: 'callout';
  styleId?: string;
  title?: string;
  /** The icon the box's style draws beside its title (`icon`): a picture,
   *  painted in `tint` when the style paints it in one colour, a glyph, or
   *  a drawn ring or dot (its look is the stylesheet's). Decoration: hidden
   *  from assistive technology. */
  icon?: CalloutIcon;
  children: Node[];
  /** A pull quote: `'echo'` when its words are read in the chapter's
   *  text as well (the box is then hidden from assistive technology, so
   *  the words are read once), `'own'` when only its style names it one
   *  (walk.ts `markPullQuotes`). */
  pullQuote?: 'echo' | 'own';
  /** Text wrapped round the box in print (#627). */
  wrap?: WrapFloat;
  /** A frame of a composed page (#862): the name of the frame its story
   *  starts in (the slot). Written as a block of the page's section, with
   *  the frame's callout style when it has one (`styleId`). */
  frame?: string;
  /** A frame set in a writing mode other than its book's (#960,
   *  `FrameConfig.writingMode`): its mode, and the length of the box's
   *  extent the lines run along (a vertical frame's height, a horizontal
   *  card's width) in ems of the body text. A box of another writing mode
   *  in a reflowable page needs that extent, or a reader sizes it to the
   *  page. */
  frameMode?: { mode: 'vertical-rl' | 'horizontal-tb'; em: number };
  /** A box of an exercise (#1231), by its own container id (`box`) and
   *  its exercise's (`id`): the outer box carries the exercise's record
   *  and the data of the exercise script; a drawn box (a writing area, a
   *  grid), the picture its design paints. */
  exercise?: {
    id: number;
    box: number;
    record?: ExerciseRecord;
    data?: ExerciseData;
    drawn?: { svg: string; width: number; height: number; em: number };
  };
}

/** A composed page (`::::page{template}`, #862): a section holding its
 *  frames' stories in Markdown order, each a box (`CalloutNode.frame`). The
 *  template's decoration is print furniture, left out. */
export interface ComposedNode {
  k: 'composed';
  /** The template the page was set with. */
  template: string;
  /** The page's start (its page-break marker). */
  pre: InlineItem[];
  children: Node[];
}

/** A figure or a box text wrapped round in print (#627): the reflowable
 *  book floats it to that side, as wide a share of the text as it took. */
export interface WrapFloat {
  /** The physical side it floats to. */
  side: 'left' | 'right';
  /** Its width and the gap beside it, in percent of the text's width. */
  width: number;
  gap: number;
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
  /** Text wrapped round it in print (#627). */
  wrap?: WrapFloat;
  /** The labels a `:::figure` sets on the picture (#862), in the order
   *  written: read as a list after the picture, out of sight (the
   *  picture this book shows does not carry them). */
  labels?: string[];
  /** An SVG over the picture that draws those labels the print sets as
   *  text (#955), in the picture's coordinates. */
  labelsSvg?: string;
  /** A music example (#1172): its systems' SVG, drawn in place of a
   *  picture. */
  score?: { systems: string[]; color: string };
  /** The author's crop of the picture (`Resource.crop`), in its fractions,
   *  and the picture's own height over its width: the figure shows only
   *  the crop, at the crop's ratio. */
  crop?: { x: number; y: number; width: number; height: number; ratio: number };
  /** The class of its resource type (`pt-type-<id>`) when the type sets
   *  its captions apart (#1550). */
  typeClass?: string;
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
  image?: { fileId: string; alt: string; width?: number; crop?: FigureNode['crop'] };
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
  /** The class of its named table style (`pt-table-<id>`, #625). */
  styleClass?: string;
  /** Mark the body rows that head a group (`pt-group`): its style draws a
   *  booktabs rule above them (`groupRules`). */
  groupRules?: boolean;
  /** The class of its resource type (`pt-type-<id>`) when the type sets
   *  its captions apart (#1550), on the box that holds caption and note. */
  typeClass?: string;
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

/** A run of a line of code (#624): its text and the colour, weight and
 *  slant the print set it in. */
export interface CodeRun {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

/** A source line of a code listing (#624): its runs (a line the print
 *  turned over is joined again), its number and whether the fence
 *  highlights it. */
export interface CodeLineNode {
  runs: CodeRun[];
  num?: string;
  highlight?: boolean;
}

/** A code listing (#624): `<pre><code>`, line by line as written. */
export interface CodeNode {
  k: 'code';
  /** Page starts and anchors that come before its first line. */
  pre: InlineItem[];
  /** The fence's language (`language-<lang>` on the `<code>`). */
  lang?: string;
  lines: CodeLineNode[];
}

/** A music score (#1172): its systems, one SVG each, read as one image. */
export interface ScoreNode {
  k: 'score';
  pre: InlineItem[];
  alt: string;
  /** Each system's SVG, in `currentColor`, as wide as the column. */
  systems: string[];
  color: string;
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
  | ScoreNode
  | VerseNode
  | StanzaNode
  | CodeNode
  | TocNode
  | ComicNode
  | ComposedNode
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
