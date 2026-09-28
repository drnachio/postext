/**
 * Faces made of several font files (issue #196).
 *
 * A font provider may answer a face with several files, each holding part
 * of its characters: the numbered unicode-range slices Fontsource ships for
 * Chinese, Japanese and Korean families (about a hundred files for Noto
 * Serif SC), or a Latin family's `latin` and `latin-ext` files. The
 * {@link FontCache} embeds each file as its own subset font and registers
 * the list here under the face's first file, the `PDFFont` every renderer
 * is handed. The text primitives then cut each run by the file that has a
 * glyph for each character ({@link fileRuns}) and switch fonts inside one
 * text object, so a line of Han with a Latin word paints from three or four
 * slices and each slice keeps only the glyphs set in it.
 *
 * Characters a face lacks in every file are recorded as they are shaped
 * ({@link noteMissingGlyphs}), for the `missingGlyph` warning.
 */
import type { PDFFont } from 'pdf-lib';
import { isDefaultIgnorable, isFallbackHandled } from './pdf-backend/fallbackSpaces';

/** The fontkit face of an embedded font, as far as coverage needs it. */
interface CoverageFace {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

function coverageFace(font: PDFFont): CoverageFace | undefined {
  const face = (font as unknown as { embedder?: { font?: CoverageFace } }).embedder?.font;
  return face && typeof face.hasGlyphForCodePoint === 'function' ? face : undefined;
}

/** Whether a font lacking `cp` does not count as missing it: controls, and
 *  the spaces and invisible characters the fallbacks paint without a glyph
 *  (see `fallbackSpaces.ts`). */
function neverMissing(cp: number): boolean {
  return cp < 0x20 || (cp >= 0x7f && cp < 0xa0) || isFallbackHandled(cp);
}

/** The files of one face, in the order their glyphs are looked up. */
export class FaceFiles {
  readonly files: PDFFont[];
  private readonly faces = new Map<PDFFont, CoverageFace | undefined>();
  /** First file holding each code point, or null for none. */
  private readonly first = new Map<number, PDFFont | null>();

  constructor(files: readonly PDFFont[]) {
    this.files = [];
    for (const file of files) this.add(file);
  }

  /** Append a file (a slice fetched later); a file already listed is kept
   *  where it is. */
  add(file: PDFFont): void {
    if (this.faces.has(file)) return;
    this.files.push(file);
    this.faces.set(file, coverageFace(file));
    // A code point no file had may be in this one.
    for (const [cp, hit] of this.first) if (hit === null) this.first.delete(cp);
  }

  /** Whether `file` has a glyph for `cp`. */
  covers(file: PDFFont, cp: number): boolean {
    return this.faces.get(file)?.hasGlyphForCodePoint(cp) ?? false;
  }

  /** The first file with a glyph for `cp`, or null when none has one. */
  fileFor(cp: number): PDFFont | null {
    const hit = this.first.get(cp);
    if (hit !== undefined) return hit;
    let found: PDFFont | null = null;
    for (const file of this.files) {
      if (this.covers(file, cp)) {
        found = file;
        break;
      }
    }
    this.first.set(cp, found);
    return found;
  }
}

const faceFiles = new WeakMap<PDFFont, FaceFiles>();

/** Register the files of a face under its first file, the font the
 *  renderers are handed. A first file already registered (two faces the
 *  provider answered with the same files) keeps its list, which takes the
 *  new files too; the list in force is returned. */
export function registerFaceFiles(primary: PDFFont, files: readonly PDFFont[]): FaceFiles {
  const known = faceFiles.get(primary);
  if (known) {
    for (const file of files) known.add(file);
    return known;
  }
  const list = new FaceFiles([primary, ...files]);
  faceFiles.set(primary, list);
  return list;
}

/** The files of the face whose first file is `font`, when it has several. */
export function faceFilesOf(font: PDFFont): FaceFiles | undefined {
  const list = faceFiles.get(font);
  return list && list.files.length > 1 ? list : undefined;
}

/** A run of text and the file it is set in. */
export interface FileRun {
  font: PDFFont;
  text: string;
}

/**
 * `text` cut into runs by the file of `font`'s face that has a glyph for
 * each character; one run in `font` itself for a face of one file. A
 * character stays in the run before it while that run's file covers it
 * (every Fontsource slice holds the space, so spaces never cut a run), else
 * it goes to the first file that does. A character no file covers, and an
 * invisible one (a joiner, a variation selector), stays in the run before
 * it: it is drawn (or dropped) as that file's fallback, and a printing one
 * is reported as missing when shaped.
 */
export function fileRuns(font: PDFFont, text: string): FileRun[] {
  const list = faceFilesOf(font);
  if (!list) return [{ font, text }];
  const runs: FileRun[] = [];
  let current: FileRun | undefined;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let file = current?.font;
    if (!file || (!list.covers(file, cp) && !isDefaultIgnorable(cp))) {
      file = list.fileFor(cp) ?? current?.font ?? font;
    }
    if (current && current.font === file) {
      current.text += ch;
    } else {
      current = { font: file, text: ch };
      runs.push(current);
    }
  }
  return runs.length > 0 ? runs : [{ font, text }];
}

/** `text`'s width at `size` (points), each run measured in its file. */
export function widthOfTextAtSize(font: PDFFont, text: string, size: number): number {
  const runs = fileRuns(font, text);
  if (runs.length === 1) return runs[0]!.font.widthOfTextAtSize(runs[0]!.text, size);
  let width = 0;
  for (const run of runs) width += run.font.widthOfTextAtSize(run.text, size);
  return width;
}

const missingByFont = new WeakMap<PDFFont, Set<number>>();

/** Record the characters of `text` that `font` has no glyph for (it draws
 *  them as `.notdef`). Called once per shaped text, from the caches of the
 *  text primitives. */
export function noteMissingGlyphs(font: PDFFont, text: string): void {
  const face = coverageFace(font);
  if (!face) return;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (neverMissing(cp) || face.hasGlyphForCodePoint(cp)) continue;
    let set = missingByFont.get(font);
    if (!set) {
      set = new Set();
      missingByFont.set(font, set);
    }
    set.add(cp);
  }
}

/** The characters drawn in `font` that it has no glyph for, in the order
 *  they were first met. */
export function missingGlyphsOf(font: PDFFont): ReadonlySet<number> | undefined {
  return missingByFont.get(font);
}

/** Whether a face is missing `cp` in a way worth asking its provider for:
 *  a printing character. */
export function wantsGlyph(cp: number): boolean {
  return !neverMissing(cp);
}
