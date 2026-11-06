// The formatted (page-faithful) Word export (#1392): options and the
// state a page writer shares while the body is written.

import type { DisplayRect } from '../../paint/displayList/types.js';
import type { VDTDocument } from '../../vdt/document.js';
import type { Resource } from '../../types/resources/resources.js';
import type { MapFragment } from '../anchors/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import type { DocxPackageBuilder } from '../ooxml/types.js';
import type { WordChapterInput } from '../semantic/types.js';
import type { MetricsCache } from './metrics.js';
import type { CjkRegion } from '../../types/text/cjk.js';

/** Something `formattedDocx` had to set differently from the page. */
export interface FormattedWarning {
  code: string;
  message: string;
  chapter?: string;
}

/** Options of `formattedDocx`: the laid-out documents, chapters, resources,
 *  fonts and metadata. */
export interface FormattedDocxOptions {
  /** The print chain: one laid-out document per chapter, in order. */
  docs: VDTDocument[];
  /** The chapters in the same order as `docs` (map chapter list and snapshot). */
  chapters: WordChapterInput[];
  resources?: Resource[];
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  /** SVG → PNG for the fallback picture Word needs beside an SVG. */
  rasterizeSvg?: (svg: string, widthPx: number, heightPx: number) => Promise<Uint8Array | undefined>;
  fonts?: WordFontPlan;
  title?: string;
  author?: string;
  /** ISO timestamp; fixes the output bytes (tests, reproducible builds). */
  date?: string;
  exportId?: string;
  onWarning?: (w: FormattedWarning) => void;
  onProgress?: (done: number, total: number) => void;
}

/** What every page writer reads and appends to. */
export interface WriterContext {
  pkg: DocxPackageBuilder;
  dpi: number;
  plan: WordFontPlan | undefined;
  /** `w:lang` of the current document. */
  lang: string | undefined;
  metrics: MetricsCache;
  chapters: WordChapterInput[];
  /** Index of the document (chapter) being written. */
  docIndex: number;
  fragments: MapFragment[];
  /** Next fragment id (base36 counter). */
  nextFragment: number;
  /** Next part number per map block. */
  parts: Map<string, number>;
  /** Resources the export references (snapshot). */
  referenced: Set<string>;
  /** Z-order counter (`wp:anchor relativeHeight`). */
  z: number;
  /** Boxes of the current page's drawings in front of the text layer
   *  (text boxes, pictures, shapes kept over them), px. */
  front?: DisplayRect[];
  warn: (code: string, message: string) => void;
  resourceBytes: FormattedDocxOptions['resourceBytes'];
  rasterizeSvg: FormattedDocxOptions['rasterizeSvg'];
  /** Media relationship ids per picture key (undefined = could not embed). */
  media: Map<string, { blip: string; svg?: string } | undefined>;
  /** CJK setting of the current document (vertical text cells). */
  cjk?: { region: CjkRegion; uprightDigits: number };
  /** Last `w:eastAsianLayout w:id` handed out. */
  eaId?: number;
}
