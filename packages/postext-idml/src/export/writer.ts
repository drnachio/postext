// The IDML writer's shared state and the options and result of the
// export: what every part of the writer (shapes, pictures, stories,
// spreads) reads and adds to as the pages are written.

import type { DisplayItem, DisplayRun } from 'postext';
import type { VDTDocument } from 'postext/writer';
import type { BlockStyle } from 'postext/writer';
import type { ParagraphStyleDef, Swatch } from './parts.js';
import type { FontNames } from './sfnt.js';

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
  /** `keep` (default): every line ends where Postext ended it (a forced
   *  line break), on the baseline Postext set it on, so InDesign shows the
   *  pages as the PDF does. `reflow`: paragraphs are left to InDesign's
   *  composer, for a book that will be set again there: frames, styles,
   *  text and first baselines match, line breaks may not. */
  lineBreaks?: 'keep' | 'reflow';
  /** The font file of a face (TrueType or OpenType bytes; a WOFF2 decoded
   *  first). With it a face is named as the file names it, which is how
   *  InDesign finds it, and the files come back in `fonts`. */
  fontFile?: (family: string, weight: number, italic: boolean) => Uint8Array | undefined;
  onWarning?: (w: IdmlWarning) => void;
}

export interface IdmlResult {
  bytes: Uint8Array;
  /** Linked pictures (`images: 'link'`): path relative to the IDML file. */
  links: { path: string; bytes: Uint8Array }[];
  /** The font files of the faces used (`fontFile`), as `Document fonts/<file>`:
   *  beside the document they serve whoever opens it without the fonts. */
  fonts: { path: string; bytes: Uint8Array }[];
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
  /** Faces written, by InDesign family then style name; the file's names
   *  when the face has a file. */
  fonts: Map<string, Map<string, FontNames | undefined>>;
  /** A CSS face (`family|weight|italic`) as InDesign names it. */
  faces: Map<string, { family: string; style: string }>;
  fontFiles: Map<string, { path: string; bytes: Uint8Array }>;
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
/** Lines are kept as Postext broke them (the default). */
export const keepsLines = (w: Writer): boolean => w.opts.lineBreaks !== 'reflow';

export const isField = (w: Writer, run: DisplayRun): boolean => run.inline?.kind === 'chip' && !!run.inline.field && w.opts.forms !== false;
