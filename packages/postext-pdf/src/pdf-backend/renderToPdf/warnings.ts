// The warnings renderToPdf reports: print, complex shaping, font
// fallback, missing glyphs, variable fonts and CFF fonts embedded whole
// (#1276: split out of pdf-backend/index.ts).
import type { RenderWarning } from 'postext';
import type { FontFallback, FontMissingGlyphs, FontFileIssue } from '../../fontCache.js';

/** A print setting the render could not honour. */
export interface PdfPrintWarning {
  /** `outputProfileUnavailable`: the output profile could not be loaded, so
   *  CMYK was converted with the naive formula (no PDF/X was asked for;
   *  with one, the render fails instead). `pageNegativeIgnored`: PDF/X-1a
   *  has no blend modes, so the debug page negative was left out. */
  kind: 'outputProfileUnavailable' | 'pageNegativeIgnored';
  message: string;
}

/** Right-to-left or joining text drawn without HarfBuzz. */
export interface PdfComplexShapingWarning {
  /** `complexShapingUnavailable`: the pages set right-to-left or joining
   *  text (Arabic, Hebrew, Syriac…) and HarfBuzz could not be loaded (no
   *  WebAssembly, `harfbuzz.wasm` found nowhere). The PDF is drawn with
   *  fontkit's shaping: Arabic keeps its joining but loses its mark
   *  positions (harakat and dots collide or drift), and a right-to-left
   *  run with digits or Latin in it may read in the wrong order. Point
   *  `harfbuzzWasm` at the file. */
  kind: 'complexShapingUnavailable';
  /** Every place the binary was looked for, and why it failed. */
  reason: string;
  message: string;
}

/** A face set in another cut of its family. The render goes on; the text
 *  keeps its layout but is drawn in the substitute face. */
export interface PdfFontFallbackWarning {
  /** `fontFallback`: the font provider rejected a face the pages use, and
   *  another face of the same family is embedded in its place — the first
   *  that loads among the nine standard weights in CSS font-matching order,
   *  in the same style first and then in the other (italic ↔ upright). The
   *  text keeps its layout (positions come from the VDT) but is drawn in
   *  the substitute face. */
  kind: 'fontFallback';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The face embedded instead. */
  fallback: { weight: number; style: 'normal' | 'italic' };
  /** The provider's error message for the rejected face. */
  reason: string;
  /** A one-line English description, for logs. */
  message: string;
}

/** Characters a face has no glyph for in any of its files. */
export interface PdfMissingGlyphWarning {
  /** `missingGlyph`: the pages set characters that no file the font
   *  provider gave for this face has a glyph for. The PDF still builds;
   *  each of them is drawn as the font's `.notdef` glyph (an empty box, or
   *  nothing, depending on the font) at the width the layout measured.
   *  Reported once per face, after the pages are drawn. Typical causes: a
   *  provider that returns only a Latin file for a Chinese family, or a
   *  font's named subset that leaves marks out (Fontsource's
   *  `chinese-traditional` file has no full-width ，！？（）). */
  kind: 'missingGlyph';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The characters, in the order the pages first set them. */
  characters: string[];
  message: string;
}

/** A variable font embedded at its default instance. */
export interface PdfVariableFontWarning {
  /** `variableFontDefaultInstance`: the provider answered a face with a
   *  variable font (it has an `fvar` table) whose default instance is
   *  another weight. pdf-lib embeds the default instance only, so text in
   *  this face prints at `defaultWeight`. Give the provider a static file
   *  per weight (fontTools `instancer` makes one). */
  kind: 'variableFontDefaultInstance';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  defaultWeight: number;
  message: string;
}

/** A large CFF face embedded whole. */
export interface PdfCffEmbeddedWholeWarning {
  /** `cffEmbeddedWhole`: a CFF-flavoured OpenType file (`.otf`) over 2 MB
   *  went into the PDF whole, since postext-pdf does not subset CFF
   *  outlines. A CJK face such as Source Han Serif adds 8 to 25 MB per
   *  weight; its TrueType build (Noto Serif CJK from Google Fonts or
   *  Fontsource) is subset to the glyphs used. */
  kind: 'cffEmbeddedWhole';
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Size of the file, in bytes. */
  bytes: number;
  message: string;
}

/** A non-fatal problem met while rendering a PDF. The render goes on; the
 *  output differs from what the document asked for in the way described:
 *  a font fallback ({@link PdfFontFallbackWarning}), characters a face
 *  lacks ({@link PdfMissingGlyphWarning}), a variable font set at its
 *  default weight ({@link PdfVariableFontWarning}), a CFF face embedded
 *  whole ({@link PdfCffEmbeddedWholeWarning}), right-to-left or joining
 *  text shaped without HarfBuzz ({@link PdfComplexShapingWarning}), or
 *  one of the engine's
 *  render warnings (`RenderWarning`: an image painted as a placeholder,
 *  `formatWarning` describes it). Narrow on `kind`. */
export type PdfWarning =
  | PdfFontFallbackWarning
  | PdfMissingGlyphWarning
  | PdfVariableFontWarning
  | PdfCffEmbeddedWholeWarning
  | PdfComplexShapingWarning
  | PdfPrintWarning
  | RenderWarning;

/** The font warnings: the kinds that carry a `message`, logged when the
 *  caller passes no `onWarning`. */
export type PdfFontWarning = Exclude<PdfWarning, RenderWarning>;

const faceName = (weight: number, style: string) => `${weight}${style === 'italic' ? ' italic' : ''}`;

/** The warning of a face set in another cut of its family. */
export function fontFallbackWarning(f: FontFallback): PdfFontFallbackWarning {
  return {
    kind: 'fontFallback',
    ...f,
    message: `postext-pdf: "${f.family}" ${faceName(f.weight, f.style)} is not available from the font provider (${f.reason}); using ${faceName(f.fallback.weight, f.fallback.style)} instead`,
  };
}

/** How many characters a missing-glyph message lists. */
const LISTED_CHARACTERS = 12;

export function missingGlyphWarning(m: FontMissingGlyphs): PdfMissingGlyphWarning {
  const shown = m.characters.slice(0, LISTED_CHARACTERS).join(' ');
  const more = m.characters.length > LISTED_CHARACTERS ? ` and ${m.characters.length - LISTED_CHARACTERS} more` : '';
  const count = m.characters.length === 1 ? '1 character' : `${m.characters.length} characters`;
  return {
    kind: 'missingGlyph',
    ...m,
    message: `postext-pdf: "${m.family}" ${faceName(m.weight, m.style)} has no glyph for ${count} (${shown}${more}); the PDF draws them as the font's .notdef glyph`,
  };
}

export function fileIssueWarning(issue: FontFileIssue): PdfVariableFontWarning | PdfCffEmbeddedWholeWarning {
  const face = `"${issue.family}" ${faceName(issue.weight, issue.style)}`;
  if (issue.kind === 'variableFontDefaultInstance') {
    return {
      ...issue,
      message: `postext-pdf: ${face} is a variable font; the PDF embeds its default instance, so this text prints at weight ${issue.defaultWeight}. Provide a static ${issue.weight} file.`,
    };
  }
  return {
    ...issue,
    message: `postext-pdf: ${face} is a CFF (.otf) font of ${(issue.bytes / (1024 * 1024)).toFixed(1)} MB, embedded whole; a TrueType build of the face would be subset to the glyphs used.`,
  };
}
