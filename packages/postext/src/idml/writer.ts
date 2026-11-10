// The IDML writer's shared state and the options and result of the
// export: what every part of the writer (shapes, pictures, stories,
// spreads) reads and adds to as the pages are written.

import type { DisplayItem, DisplayRun } from '../paint/displayList/types.js';
import type { VDTDocument } from '../vdt/document.js';
import type { BlockStyle } from '../pipeline/styles.js';
import type { ParagraphStyleDef, Swatch } from './parts.js';

export interface IdmlWarning {
  code: string;
  message: string;
}

export interface IdmlOptions {
  /** The laid-out documents (chapters), in book order. */
  docs: readonly VDTDocument[];
  /** Bytes of a picture by its file id (`DisplayItem.fileId`). */
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  /** `embed` (default): pictures inside the IDML; `link`: linked to
   *  `Links/<name>`, returned in `links` for the caller to write beside it. */
  images?: 'embed' | 'link';
  title?: string;
  /** InDesign's style name of a face (`Regular`, `Bold Italic`…); the
   *  default derives it from weight and slant. */
  fontStyleName?: (family: string, weight: number, italic: boolean) => string;
  /** Paragraph style names for text outside composed frames, by display
   *  list role (`body`, `heading`, `list`…); a heading's name gets its
   *  level. Defaults: `Body`, `Heading`, `List`, `Quote`, `Caption`,
   *  `Footnote`, `Header`, `Footer`, `Design`; other roles keep the role. */
  styleNames?: Partial<Record<string, string>>;
  /** Chips that carry a form field (`field="…"`) become InDesign form
   *  fields (default `true`); `false` writes them as any chip, the value
   *  as text. */
  forms?: boolean;
  onWarning?: (w: IdmlWarning) => void;
}

export interface IdmlResult {
  bytes: Uint8Array;
  /** Linked pictures (`images: 'link'`): path relative to the IDML file. */
  links: { path: string; bytes: Uint8Array }[];
}

export interface Writer {
  next: () => string;
  k: number;
  /** Sheet px → spread pt. */
  ox: number;
  oy: number;
  pageH: number;
  swatches: Map<string, Swatch>;
  /** Swatch names taken, lower-cased: InDesign's own and those written. */
  swatchNames: Set<string>;
  cmyk: Map<string, { c: number; m: number; y: number; k: number }>;
  palette: Map<string, string>;
  fonts: Map<string, Set<string>>;
  paraStyles: Map<string, ParagraphStyleDef>;
  /** The document being written, and the engine's block styles of its
   *  paragraphs by frame style and paragraph style (`engineStyle`). */
  doc: VDTDocument;
  blockStyles: Map<string, BlockStyle>;
  stories: { id: string; xml: string }[];
  media: Map<string, { path: string; bytes: Uint8Array }>;
  opts: IdmlOptions;
  warn: (code: string, message: string) => void;
}

export type TextItem = Extract<DisplayItem, { kind: 'text' }>;
/** A text item in a story: `joinsPrevious` when it is the rest of the
 *  paragraph the item before it holds (a paragraph a frame break split). */
export type StoryItem = TextItem & { joinsPrevious?: boolean };

/** A frame's name in its template (`cp3:body` → `body`). */
export const frameName = (id: string) => id.replace(/^cp\d+:/, '');

/** A chip that is written as a form field. */
export const isField = (w: Writer, run: DisplayRun): boolean => run.inline?.kind === 'chip' && !!run.inline.field && w.opts.forms !== false;
