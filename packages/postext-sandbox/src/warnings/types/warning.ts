// One entry of the Warnings panel (split out of warnings/types.ts).
import type { WarningPayload } from '../types.js';

export interface Warning {
  id: string;
  payload: WarningPayload;
  /** Absolute source offset to focus in the editor on click. Undefined for
   *  warnings that don't map to a specific markdown location (e.g. missing
   *  fonts sourced from the config). */
  sourceStart?: number;
  sourceEnd?: number;
  /** Approximate line number in the editor (1-based), when available. In a
   *  multi-chapter book this is the line in the composed document. */
  line?: number;
  /** Chapter the warning points at, with a chapter-local line, when the
   *  document was composed from several chapters. */
  chapterId?: string;
  chapterIndex?: number;
  chapterLine?: number;
  /** Chapter-local offsets (`sourceStart`/`sourceEnd` stay document-wide). */
  chapterStart?: number;
  chapterEnd?: number;
}
