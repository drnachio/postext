// Font requests, files and providers, their declarations and order, the
// warnings about them and the fallback faces (#1276: split out of fontCache.ts).
import { cssWeightOrder } from 'postext';
import type { PDFFont } from 'pdf-lib';
import type { FileDeclaration, FaceFiles } from '../faceFiles.js';

/** What the pages set in a face, handed to the {@link PdfFontProvider}. */
export interface PdfFontRequest {
  /** The characters (Unicode code points) the document sets in the face,
   *  collected from its pages before any is drawn. A provider serving a
   *  family as several files (Fontsource's unicode-range slices) returns
   *  the files that hold them; one serving a single file may ignore it.
   *  May be empty when the render cannot tell (a face asked for with no
   *  text yet). When the same face is asked for again, it lists only the
   *  characters the files already given lack. */
  codePoints: ReadonlySet<number>;
}

/**
 * One file of a face, which may say what its `@font-face` rule says of it:
 * the bytes themselves, carrying two properties, for a provider that
 * knows how the page that measured the layout declared the face (postext
 * #770). A plain `Uint8Array` is a file that says nothing.
 *
 * A browser sets a character in the file declared last among those whose
 * `unicode-range` holds it, and the files of a family overlap: Fontsource
 * repeats the ASCII letters of a Japanese family in its `latin` file and
 * in its numbered slices, the space in every file, the brackets in the
 * `arabic` file of an Arabic one. Two characters set in two files do not
 * kern, so the file decides the width the layout measured. A provider
 * that hands every file of a face this way has each character drawn from
 * the file the browser took it from.
 *
 * The properties ride on the bytes, so a described file is still the
 * `Uint8Array` every reader of a provider expects (the engine's SVG
 * inliner and `bundleFontProvider`, a postext-pdf released before this),
 * and what does not look at them reads the file as before. A copy of the
 * bytes does not carry them: {@link declaredFontFile} puts them on.
 */
export type PdfFontFile = Uint8Array & {
  /** The `unicode-range` of the file's rule, as CSS writes it
   *  (`U+0000-00FF,U+0131,U+4E??`). A file with none answers for every
   *  character, as a rule without the descriptor does. */
  unicodeRange?: string;
  /** Where the file is declared among the files of the face (one weight
   *  and style of the family): any number that grows with the order of
   *  the `@font-face` rules in the page, or of the calls to
   *  `document.fonts.add`; the file with the greatest is the one declared
   *  last. The same file keeps its number in every answer for the face.
   *  Files with none are read in the order given, the first being the
   *  one declared last. */
  order?: number;
};

/** What a {@link PdfFontFile} says of itself. */
export type PdfFontFileDeclaration = FileDeclaration;

/**
 * `bytes` as a file that says how the page declared it: a view of the
 * same bytes (nothing is copied, and `bytes` itself is left as it is)
 * carrying `unicodeRange` and `order` ({@link PdfFontFile}). A plain
 * `Object.assign(bytes, { unicodeRange, order })` does as well where the
 * bytes are the provider's own to mark.
 */
export function declaredFontFile(bytes: Uint8Array, declaration: PdfFontFileDeclaration): PdfFontFile {
  const file: PdfFontFile = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (declaration.unicodeRange !== undefined) file.unicodeRange = declaration.unicodeRange;
  if (declaration.order !== undefined) file.order = declaration.order;
  return file;
}

/** What `file` says of itself, when it says anything a browser would
 *  read: a range that is text, a place that is a number. */
export function declarationOf(file: PdfFontFile): PdfFontFileDeclaration | undefined {
  const unicodeRange = typeof file.unicodeRange === 'string' ? file.unicodeRange : undefined;
  const order = typeof file.order === 'number' && Number.isFinite(file.order) ? file.order : undefined;
  if (unicodeRange === undefined && order === undefined) return undefined;
  return { ...(unicodeRange !== undefined ? { unicodeRange } : {}), ...(order !== undefined ? { order } : {}) };
}

/**
 * The bytes of a face (TrueType, or CFF-flavoured OpenType): one file, or
 * several that together make the face — each holding part of its
 * characters, like the numbered unicode-range slices Fontsource ships for
 * Chinese, Japanese and Korean families. Each file is embedded as its own
 * subset font.
 *
 * A character is drawn from the first file, in the order given, that has
 * a glyph for it. When a file of the face comes with its range
 * ({@link PdfFontFile}), a character is drawn from the file a browser
 * takes it from: the one declared last among those whose range holds it
 * and that have a glyph for it; a character no range holds is drawn from
 * the first file with a glyph. So it is in a document shaped in its own
 * language (`bodyText.shapingLanguage: 'document'`); one that keeps the
 * host's language reads the files in the order given whatever they say,
 * and prints as it did. A provider that describes its files therefore
 * still lists them with the one declared last first.
 *
 * Reject (throw) for a face the provider cannot supply: another cut of
 * the family is set in its place (`fontFallback`).
 */
export type PdfFontProvider = (
  family: string,
  weight: number,
  style: 'normal' | 'italic',
  request?: PdfFontRequest,
) => Promise<PdfFontAnswer>;

/** What a {@link PdfFontProvider} answers a face with. */
export type PdfFontAnswer = PdfFontFile | PdfFontFile[];

/** The files of an answer. */
export function fontFilesOf(answer: PdfFontAnswer): PdfFontFile[] {
  return Array.isArray(answer) ? answer : [answer];
}

/**
 * `provider` answering with files that say nothing: what each says of
 * itself is left off. For a render with no document shaped in its own
 * language, which reads every face as it did before a file could say
 * more (the first file with a glyph), and asks for the same characters.
 */
export function withBareFiles(provider: PdfFontProvider): PdfFontProvider {
  const bare = (file: PdfFontFile): Uint8Array => (declarationOf(file) ? new Uint8Array(file.buffer, file.byteOffset, file.byteLength) : file);
  return async (family, weight, style, request) => {
    const answer = await provider(family, weight, style, request);
    return Array.isArray(answer) ? answer.map(bare) : bare(answer);
  };
}

/** The files of an answer from the one declared first to the one declared
 *  last, as a style sheet lists its rules (`PdfFontFile.order`; a file
 *  with no number takes its place in the answer, the first being the one
 *  declared last). */
export function inDeclarationOrder(files: readonly PdfFontFile[]): PdfFontFile[] {
  return files
    .map((file, at) => ({ file, at, order: declarationOf(file)?.order ?? -at }))
    .sort((a, b) => a.order - b.order || b.at - a.at)
    .map((entry) => entry.file);
}

/** A face some characters of which no file of it has a glyph for; the PDF
 *  draws them as the font's `.notdef` glyph. */
export interface FontMissingGlyphs {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** The characters, in the order the pages first set them. */
  characters: string[];
}

/** A problem with a face's file the render works around: a variable font
 *  asked for at a weight other than its default instance (pdf-lib embeds
 *  that instance, so the text prints at the default weight), or a CFF
 *  face larger than the limit embedded whole (pdf-lib cannot subset CFF
 *  outlines reliably). */
export type FontFileIssue =
  | { kind: 'variableFontDefaultInstance'; family: string; weight: number; style: 'normal' | 'italic'; defaultWeight: number }
  | { kind: 'cffEmbeddedWhole'; family: string; weight: number; style: 'normal' | 'italic'; bytes: number };

/** Size from which a CFF face embedded whole is reported: 2 MB, about ten
 *  times a Latin text face, and a fraction of a CJK one (Source Han Serif
 *  is 8 to 25 MB a weight). */
export const CFF_WHOLE_WARN_BYTES = 2 * 1024 * 1024;

/** A face the document asked for, and the face of the same family set in
 *  its place because the provider rejected it (see
 *  {@link FontCache.preloadFontStrings}). */
export interface FontFallback {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  fallback: { weight: number; style: 'normal' | 'italic' };
  /** The provider's error message for the requested face. */
  reason: string;
}

export interface FaceSpec {
  family: string;
  weight: number;
  style: 'normal' | 'italic';
}

/** The nine standard weights: the cuts a font provider may have. */
const STANDARD_WEIGHTS: readonly number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];

/** Faces of the same family to try, in order, when the provider rejects
 *  `spec`: every standard weight in the requested style, in CSS matching
 *  order ({@link cssWeightOrder}), then every weight in the other style
 *  the same way — italic falls back to upright, and upright to italic. A
 *  family with no italics (a display face) sets its italic runs upright; a
 *  family shipping only 400 and 700 takes a 600 as 700; one shipping a
 *  single cut sets everything in it. */
export function fallbackFaces(spec: FaceSpec): FaceSpec[] {
  const weights = cssWeightOrder(spec.weight, [...STANDARD_WEIGHTS, spec.weight]);
  const styles: Array<'normal' | 'italic'> = spec.style === 'italic' ? ['italic', 'normal'] : ['normal', 'italic'];
  const out: FaceSpec[] = [];
  for (const style of styles) {
    for (const weight of weights) {
      if (style === spec.style && weight === spec.weight) continue;
      out.push({ family: spec.family, weight, style });
    }
  }
  return out;
}

/** A face as loaded: its files (the first one is the font the renderers
 *  are handed) and the characters it was asked for. */
export interface LoadedFace {
  spec: FaceSpec;
  primary: PDFFont;
  files: FaceFiles;
  /** The provider answered with a list: a face that grows when later text
   *  needs characters its files lack. A single file is the whole face. */
  sliced: boolean;
  /** Every character the face was asked for so far. */
  asked: Set<number>;
  /** The growth in progress, one at a time. */
  growing: Promise<void>;
}
