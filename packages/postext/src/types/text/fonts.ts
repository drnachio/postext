/** The font file formats a custom font can be given in. */
export type CustomFontFormat = 'woff2' | 'woff' | 'ttf' | 'otf';
/** The style of a custom font's face. */
export type CustomFontStyle = 'normal' | 'italic';

/** A face of a custom font: its weight, style and file. */
export interface CustomFontVariant {
  /** CSS font-weight (100..900). */
  weight: number;
  style: CustomFontStyle;
  /** Identifier of the binary stored out-of-band (IndexedDB). */
  fileId: string;
  format: CustomFontFormat;
  /** Original filename of the uploaded binary. Shown in the sandbox UI
   *  so the user can tell variants apart at a glance. Optional for
   *  backward compatibility with configs saved before this field was
   *  introduced. */
  fileName?: string;
}

/** A font family the document brings with it, and its faces. */
export interface CustomFontFamily {
  /** Family name — used anywhere a Google Font family name would be used. */
  name: string;
  variants: CustomFontVariant[];
  /** False when the family's files may be used to set this document but not
   *  copied out of it — a licensed typeface a bundle is allowed to show but
   *  not to hand on. Rendering and PDF embedding are unaffected; what honours
   *  the flag is whoever writes the files back out (the sandbox's bundle
   *  export drops the family's files and its `fonts[]` entry). Defaults to
   *  true. */
  redistributable?: boolean;
  /** An open family of about the same width that stands in for the faces
   *  this one has no file for (#978): a bundle that leaves a licensed
   *  family's files out names it, and every host sets the missing faces in
   *  it (its cut of the same weight and slant) under this family's name, so
   *  the lines break near where the real face breaks them. The family's own
   *  files win where it has them. The configuration keeps naming this
   *  family: only the font files change. */
  fallback?: string;
}
