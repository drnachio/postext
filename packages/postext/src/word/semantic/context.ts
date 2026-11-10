// The semantic writer's state (#1390): the package being built, the
// fragment log, styles, numbering, notes, and the chapter being written.

import type { ContentBlock } from '../../parse/types.js';
import type { LayoutContinuation, OutlineEntry, PostextConfig, Resource, ResourceType } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { WordFontPlan } from '../fonts/types.js';
import type { DocxPackageBuilder } from '../ooxml/types.js';
import type { FragmentLog } from './fragments.js';
import type { Numbering } from './numbering.js';
import type { StyleRegistry } from './styles.js';
import type { WordChapterInput } from './types.js';
import type { Units } from './wml.js';
import type { BookNumbers } from './engineNumbers.js';
import type { BookCitations } from './prose/citations.js';

/** Where a book that continues a longer one starts: its heading counters
 *  and page numbering. */
export type BookStart = Pick<LayoutContinuation, 'headings' | 'pageNumbering'>;

/** Something `semanticDocx` had to set differently from the book. */
export interface SemanticWarning {
  code: string;
  message: string;
  chapter?: string;
}

export interface ChapterState {
  index: number;
  input: WordChapterInput;
  /** The chapter's whole Markdown (offsets in the map index it). */
  markdown: string;
  /** Where the body starts (after the front matter): parser offsets are
   *  body-relative and get this added. */
  offset: number;
  /** Footnote definitions by id. */
  defs: Map<string, ContentBlock>;
  /** Footnote ids the chapter's text cites (their definitions are set
   *  as Word footnotes, not in the body). */
  cited: Set<string>;
  /** Definitions already set as a Word footnote. */
  usedDefs: Set<string>;
  /** The number prefix the engine prints before each numbered heading. */
  headingNumbers: Map<ContentBlock, string>;
  blockCounter: number;
  /** The palette overrides of the part being written (`:::part
   *  palette="…"`): palette id → hex. */
  palette?: Record<string, string>;
  /** Page numbering a `:::numbering` directive sets for the chapter's
   *  section (Word format name, first number). */
  pageNumbers?: { format?: string; start?: number };
}

/** What the plain design keeps of the book's own (#1458): its resolved
 *  config, for the words of the Markdown a design prints (a kicker the
 *  heading's design reads from an attribute), and the widths its pictures
 *  take in print, which they never outgrow. */
export interface PlainBook {
  book: ResolvedConfig;
  /** Width of the book's text column and of its whole text area, px. */
  columnPx: number;
  textAreaPx: number;
}

export interface WriterContext {
  pkg: DocxPackageBuilder;
  log: FragmentLog;
  config: PostextConfig;
  /** The config the document is set from: the book's, or in the plain
   *  design its neutral one (`plain/config.ts`). */
  resolved: ResolvedConfig;
  /** Set in the plain design (`design: 'plain'`): content only. The
   *  modules that write the book's design check it where they start. */
  plain?: PlainBook;
  units: Units;
  styles: StyleRegistry;
  numbering: Numbering;
  plan?: WordFontPlan;
  resources: Map<string, Resource>;
  resourceTypes: ResourceType[];
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  rasterizeSvg?: (svg: string, widthPx: number, heightPx: number) => Promise<Uint8Array | undefined>;
  /** Width of the text column, px (pictures are fitted to it). */
  columnPx: number;
  /** Width of the text column, twips (box and table width). */
  textTwips: number;
  /** Width of the whole text area, px: what page-spanning content takes
   *  in a book of columns (the column's width in a book of one). */
  textAreaPx: number;
  /** Resources the export shows or references (for the snapshot). */
  usedResources: Set<string>;
  /** The numbers the engine prints: resources (captions, `:ref`s) and
   *  heading prefixes, counted through the book. */
  numbers: BookNumbers;
  footnotes: string[];
  /** Header/footer parts by id (inner XML). */
  headers: Record<string, string>;
  footers: Record<string, string>;
  /** Non-`_ptx_` bookmark names already used (anchors, chapters). */
  bookmarkNames: Set<string>;
  /** Resources a `:ref` floats (cited, shown by no block): each is written
   *  as a figure after the block holding its first reference. */
  floated: ReadonlySet<string>;
  /** Floated resources already written. */
  floatedPlaced: Set<string>;
  /** Pictures prepared before the body is written, by resource id. */
  media: Map<string, PreparedPicture>;
  warn(code: string, message: string): void;
  nextSdtId(): number;
  nextFootnoteId(): number;
  chapter: ChapterState;
  /** Every chapter's parsed blocks, in book order (what a contents or an
   *  index lists). */
  book: readonly { blocks: ContentBlock[] }[];
  /** Where the book starts (`semanticDocx`'s `start`). */
  start?: BookStart;
  /** The book's citations as the processor formats them (a book that
   *  cites works, with a citation engine registered). */
  citations?: BookCitations;
  /** The book's outline, computed on first use (see `fields.ts`). */
  outline?: OutlineEntry[];
}

export interface PreparedPicture {
  /** Relationship id of the bitmap (PNG/JPEG/GIF) the blip embeds. */
  rel: string;
  /** Relationship id of the SVG (`asvg:svgBlip`), when there is one. */
  svgRel?: string;
  widthPx: number;
  heightPx: number;
}

/** A new block id in the current chapter. */
export function blockId(ctx: WriterContext): string {
  return `c${ctx.chapter.index}b${ctx.chapter.blockCounter++}`;
}

/** Absolute (chapter-file) offset of a body-relative parser offset. */
export const abs = (ctx: WriterContext, bodyOffset: number): number => (bodyOffset < 0 ? -1 : bodyOffset + ctx.chapter.offset);
