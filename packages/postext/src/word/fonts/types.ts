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
  /** Figure features of a feature family (`Lora@onum`, #1237), for
   *  `w14:numForm` / `w14:numSpacing`. */
  features?: readonly ('onum' | 'lnum' | 'pnum' | 'tnum')[];
}

/** A font a `.docx` could not embed, and why. */
export interface FontWarning {
  family: string;
  /** `preview-print` is a note, not a refusal: the face is embedded, and
   *  Word shows and prints it but will not let its text be edited. */
  reason: 'restricted' | 'cff' | 'variable' | 'missing' | 'merge-failed' | 'preview-print';
  detail?: string;
}

/** The faces a `.docx` embeds, and which Word family and slot each font maps
 *  to. */
export interface WordFontPlan {
  /** Faces to embed. */
  faces: EmbeddedFontFace[];
  /** `${family}|${weight}|${style}` → Word family + slot flags. */
  map: Map<string, WordFontRef>;
  warnings: FontWarning[];
  /** Word family → the CSS family it stands for, for `w:altName` (a
   *  reader without the embedded copy falls back to an installed face). */
  altNames: Map<string, string>;
}

/** Options of the font plan: the text used, the font strings and the WOFF2
 *  decoder. */
export interface PlanWordFontsOptions {
  /** Code points the book sets per face (`${family}|${weight}|${style}`)
   *  or per family: unicode-range slices holding none of them (and not
   *  Basic Latin) are left out of the merged face. */
  usedText?: Map<string, Set<number>>;
  /** VDT font strings the export uses: only the faces they resolve to are
   *  embedded (all faces when absent). */
  fontStrings?: string[];
  /** WOFF2 decompressor (postext-pdf's `decompressWoff2`); WOFF2 files are
   *  skipped with a `missing` warning without one. */
  decompressWoff2?: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Appended to every embedded Word family so an installed copy of
   *  another version does not stand in for the book's face (default
   *  `' PTX'`; `''` keeps the CSS names). */
  familySuffix?: string;
}
