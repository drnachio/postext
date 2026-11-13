// The IDML writer's shared state and the options and result of the
// export: what every part of the writer (shapes, pictures, stories,
// spreads) reads and adds to as the pages are written.

import type { DisplayItem, DisplayRun } from 'postext';
import type { VDTPage } from 'postext';
import type { VDTDocument } from 'postext/writer';
import type { BlockStyle } from 'postext/writer';
import type { CharacterStyleDef, ParagraphStyleDef, Swatch } from './parts.js';
import type { StyleSurvey } from './styles.js';
import type { FontNames } from './sfnt.js';

import type { IdmlWarning } from '../model/document.js';

export type { IdmlWarning };

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
  /** Inline maths, music and colour swatches as inline anchored objects
   *  in their line (default `true`); `false` leaves them out, with a
   *  warning. */
  inlineObjects?: boolean;
  /** `keep` (default): every line ends where Postext ended it (a forced
   *  line break), on the baseline Postext set it on, so InDesign shows the
   *  pages as the PDF does. `reflow`: paragraphs are left to InDesign's
   *  composer, for a book that will be set again there: frames, styles,
   *  text and first baselines match, line breaks may not. */
  lineBreaks?: 'keep' | 'reflow';
  /** `facing`: the pages two to a spread about the spine, the first one
   *  alone, as a book is made up in InDesign; `single`: a page a spread.
   *  Default: `facing` for a book with mirrored margins, else `single`. */
  spreads?: 'facing' | 'single';
  /** `thread` (default): the running text of the pages Postext laid out
   *  in columns runs through one story threaded through a frame per
   *  column, as in a book set in InDesign (`thread.ts`, #1559); `frames`:
   *  a frame and a story for each block, where the engine painted it. */
  text?: 'thread' | 'frames';
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
  /** Where the page's left edge stands in its spread, pt: 0 for a page at
   *  the right of the spine (or alone), minus its width at the left. */
  px: number;
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
  /** Inline objects written, for their names. */
  inlineCount: number;
  /** Hyperlinks: the text source of each and where it goes. */
  links: { source: string; url?: string; page?: number }[];
  /** Set while a halo's copy of a text item is written: every run takes
   *  this ink and a stroke of this weight (pt). */
  halo?: { color: string; weight: number };
  /** Pages of the documents before the one being written. */
  pageBase: number;
  paraStyles: Map<string, ParagraphStyleDef>;
  /** Character styles written, by name: a run whose look a named style
   *  gave (a chip, a `:span`), or whose face or size its paragraph's
   *  style does not have (#1555). */
  charStyles: Map<string, CharacterStyleDef>;
  /** What the first of the two passes over the pages saw of every
   *  paragraph style, and in the second, what each style settled on
   *  (`styles.ts`). */
  styles: StyleSurvey;
  /** The callout style of each block of the page being written that
   *  stands in a box of the flow, by block key (`calloutOf`). */
  callouts?: Map<string, string>;
  /** The document being written, and the engine's block styles of its
   *  paragraphs by frame style and paragraph style (`engineStyle`). */
  doc: VDTDocument;
  /** The laid-out page being written (its flow frame places a vertical
   *  page's composed frames). */
  page?: VDTPage;
  blockStyles: Map<string, BlockStyle>;
  stories: { id: string; xml: string }[];
  /** While the thread's story is written: what each of its breaks and
   *  paragraph ends was (`thread.ts`). */
  joins?: string[];
  /** The page being written is one of the thread's. */
  threaded?: boolean;
  /** The paragraph styles chapter titles are set in, with how many
   *  titles each sets (`masters.ts`). */
  titleStyles?: Map<string, number>;
  /** The chapter titles the running heads show, as `titleKey` has them. */
  chapterTitles?: Set<string>;
  media: Map<string, { path: string; bytes: Uint8Array }>;
  opts: IdmlOptions;
  warn: (code: string, message: string) => void;
}

export type TextItem = Extract<DisplayItem, { kind: 'text' }>;
/** A text item in a story: `joinsPrevious` when it is the rest of the
 *  paragraph the item before it holds (a paragraph a frame break split). */
export type StoryItem = TextItem & {
  joinsPrevious?: boolean;
  /** The first item of a thread's frame after a column the author broke. */
  columnBreak?: boolean;
  /** Frames anchored above its first line (the thread's boxes), and the
   *  sheet height (px) they take in its column. */
  anchors?: string[];
  anchorHeight?: number;
};

/** A frame's name in its template (`cp3:body` → `body`). */
export const frameName = (id: string) => id.replace(/^cp\d+:/, '');

/** A chip that is written as a form field. */
/** Lines are kept as Postext broke them (the default). */
export const keepsLines = (w: Writer): boolean => w.opts.lineBreaks !== 'reflow';

export const isField = (w: Writer, run: DisplayRun): boolean => run.inline?.kind === 'chip' && !!run.inline.field && w.opts.forms !== false;
