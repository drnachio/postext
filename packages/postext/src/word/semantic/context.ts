// The semantic writer's state (#1390): the package being built, the
// fragment log, styles, numbering, notes, and the chapter being written.

import type { ContentBlock } from '../../parse/types.js';
import type { PostextConfig, Resource, ResourceType } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { WordFontPlan } from '../fonts/types.js';
import type { DocxPackageBuilder } from '../ooxml/types.js';
import type { FragmentLog } from './fragments.js';
import type { Numbering } from './numbering.js';
import type { StyleRegistry } from './styles.js';
import type { WordChapterInput } from './types.js';
import type { Units } from './wml.js';
import type { BookNumbers } from './engineNumbers.js';

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
}

export interface WriterContext {
  pkg: DocxPackageBuilder;
  log: FragmentLog;
  config: PostextConfig;
  resolved: ResolvedConfig;
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
  /** Pictures prepared before the body is written, by resource id. */
  media: Map<string, PreparedPicture>;
  warn(code: string, message: string): void;
  nextSdtId(): number;
  nextFootnoteId(): number;
  chapter: ChapterState;
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
