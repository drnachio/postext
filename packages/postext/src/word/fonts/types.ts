// Fonts for the Word exports (#1393): turn the faces a book uses into
// static TrueType faces Word can embed, one Word family per weight/width
// beyond Word's four style slots.

import type { EmbeddedFontFace } from '../ooxml/types.js';

/** One face as the book's font provider delivers it (possibly several
 *  unicode-range slices, WOFF2 or sfnt, TrueType or CFF). */
export interface SourceFace {
  /** CSS family as the VDT font strings name it. */
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  files: Uint8Array[];
}

/** How a VDT font string maps to Word run properties. */
export interface WordFontRef {
  /** `w:rFonts` family name. */
  family: string;
  bold: boolean;
  italic: boolean;
}

export interface FontWarning {
  family: string;
  reason: 'restricted' | 'cff' | 'variable' | 'missing' | 'merge-failed';
  detail?: string;
}

export interface WordFontPlan {
  /** Faces to embed. */
  faces: EmbeddedFontFace[];
  /** `${family}|${weight}|${style}` → Word family + slot flags. */
  map: Map<string, WordFontRef>;
  warnings: FontWarning[];
}
