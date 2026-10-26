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
 * Which file sets a character two files hold (postext #770): a browser
 * takes it from the `@font-face` rule declared last among those whose
 * `unicode-range` holds it, and Fontsource's files overlap. A Japanese
 * family repeats the ASCII letters in its `latin` file and in its numbered
 * slices, and a pen declares the slices after `latin`: Chrome 154 sets the
 * letters of `Shift_JIS` from slice 118 and the `_` from slice 113 of Noto
 * Serif JP, 4252 thousandths of the em wide, where the `latin` file alone
 * kerns `t_` and `_J` and sets it 4318 wide. A provider that hands each
 * file with its range and its place in the declaration (`PdfFontFile`)
 * gets each character from the file the browser took it from
 * ({@link FaceFiles.declaredFile}), in a document shaped in its own
 * language; one that hands bare files gets it from the first file with a
 * glyph, as before, and so does a document that keeps the host's language.
 *
 * Characters a face lacks in every file are recorded as they are shaped
 * ({@link noteMissingGlyphs}), for the `missingGlyph` warning.
 */
import type { PDFFont } from 'pdf-lib';
import { mirroredCodePoint } from 'postext';
import { isDefaultIgnorable, isFallbackHandled, substituteGlyph } from './pdf-backend/text/fallbackSpaces.js';
import { besideLetterOf, shapesAsCanvas, shapingScript, shapingScriptLetter, withBesideLetter, withinWideText } from './shapingLanguage.js';
import { canvasWords } from './canvasWords.js';
import { parseUnicodeRange, rangesHold, type CodePointRanges } from './unicodeRange.js';

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

/** What a provider says of a file of a face (`PdfFontFile`): the
 *  characters its `@font-face` rule answers for, and where the rule is
 *  declared among the rules of the face. */
export interface FileDeclaration {
  unicodeRange?: string;
  order?: number;
}

/** The files of one face, in the order their glyphs are looked up. */
export class FaceFiles {
  readonly files: PDFFont[];
  private readonly faces = new Map<PDFFont, CoverageFace | undefined>();
  /** First file holding each code point, or null for none. */
  private readonly first = new Map<number, PDFFont | null>();
  /** The range each file was given with; a file with none answers for
   *  every character. */
  private readonly ranges = new Map<PDFFont, CodePointRanges>();
  /** Where each file is declared: the number it was given with, else its
   *  place in the list counted down, the first file being the one
   *  declared last. */
  private readonly orders = new Map<PDFFont, number>();
  /** The files from the one declared last to the one declared first. */
  private lastDeclaredFirst: PDFFont[] | undefined;
  /** The file a browser sets each code point in, or null for none. */
  private readonly declared = new Map<number, PDFFont | null>();
  private hasRanges = false;

  constructor(files: readonly PDFFont[], declarations?: ReadonlyMap<PDFFont, FileDeclaration>) {
    this.files = [];
    for (const file of files) this.add(file, declarations?.get(file));
  }

  /** Append a file (a slice fetched later), with what the provider says
   *  of it; a file already listed is kept where it is, as it was given. */
  add(file: PDFFont, declaration?: FileDeclaration): void {
    if (this.faces.has(file)) return;
    this.orders.set(file, declaration?.order ?? -this.files.length);
    this.files.push(file);
    this.faces.set(file, coverageFace(file));
    const ranges = declaration?.unicodeRange === undefined ? undefined : parseUnicodeRange(declaration.unicodeRange);
    if (ranges) {
      this.ranges.set(file, ranges);
      this.hasRanges = true;
    }
    // A code point no file had may be in this one, and a file declared
    // later than the one that set a character takes it.
    for (const [cp, hit] of this.first) if (hit === null) this.first.delete(cp);
    this.declared.clear();
    this.lastDeclaredFirst = undefined;
  }

  /** Whether the provider gave a file of the face with its range: the
   *  face is then read as a browser reads its `@font-face` rules
   *  ({@link declaredFile}). */
  get ranged(): boolean {
    return this.hasRanges;
  }

  /** Whether `file` has a glyph for `cp`. */
  covers(file: PDFFont, cp: number): boolean {
    return this.faces.get(file)?.hasGlyphForCodePoint(cp) ?? false;
  }

  /** Whether `file` answers for `cp` as a browser reads it: its range
   *  holds the character and the file has a glyph for it. Chrome 154 skips
   *  a file whose range claims a character it has no glyph for and takes
   *  the next one down, and never draws a glyph a file has outside its
   *  range. */
  private answers(file: PDFFont, cp: number): boolean {
    const ranges = this.ranges.get(file);
    return (ranges === undefined || rangesHold(ranges, cp)) && this.covers(file, cp);
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

  /** The files a browser tries in turn: the one declared last first.
   *  Files of one number keep the order they were given in. */
  private byDeclaration(): readonly PDFFont[] {
    if (!this.lastDeclaredFirst) {
      const at = new Map(this.files.map((file, i) => [file, i]));
      this.lastDeclaredFirst = [...this.files].sort((a, b) => this.orders.get(b)! - this.orders.get(a)! || at.get(a)! - at.get(b)!);
    }
    return this.lastDeclaredFirst;
  }

  /**
   * The file a browser sets `cp` in: the one declared last among those
   * whose range holds it and that have a glyph for it. Null when none
   * does: the browser then leaves the family, for the next one of the
   * `font-family` list or a font of the system.
   */
  declaredFile(cp: number): PDFFont | null {
    const hit = this.declared.get(cp);
    if (hit !== undefined) return hit;
    const found = this.byDeclaration().find((file) => this.answers(file, cp)) ?? null;
    this.declared.set(cp, found);
    return found;
  }

  /**
   * The file a browser sets a letter and the marks on it in (`cps`, the
   * letter first): the one declared last that answers for every one of
   * them. With Source Serif 4 declared first and Noto Serif JP after it
   * for `a` alone, Chrome sets `a` in the second (557 thousandths) and
   * `a` + U+0308 whole in the first (541). Null when no file sets them
   * all.
   */
  declaredFileOfAll(cps: readonly number[]): PDFFont | null {
    return this.byDeclaration().find((file) => cps.every((cp) => this.answers(file, cp))) ?? null;
  }
}

const faceFiles = new WeakMap<PDFFont, FaceFiles>();

/** Register the files of a face under its first file, the font the
 *  renderers are handed. A first file already registered (two faces the
 *  provider answered with the same files) keeps its list, which takes the
 *  new files too; the list in force is returned. */
export function registerFaceFiles(primary: PDFFont, files: readonly PDFFont[], declarations?: ReadonlyMap<PDFFont, FileDeclaration>): FaceFiles {
  const known = faceFiles.get(primary);
  if (known) {
    for (const file of files) known.add(file, declarations?.get(file));
    return known;
  }
  const list = new FaceFiles([primary, ...files], declarations);
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
  /** A letter of the script the run is shaped in, when it holds no letter
   *  and the text it was cut out of does (`besideLetterOf`, #764): the
   *  caller shapes the run inside `withBesideLetter`. */
  beside?: number;
  /** The run is a word, or part of one, of a string with a character
   *  above U+00FF ({@link wordRuns}): with no letter it has no script. */
  wide?: true;
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
 *
 * With `rtl` (a run HarfBuzz shapes right to left) a mirrored character
 * goes by the glyph that run will show: HarfBuzz sets `(` as `)` only when
 * the file has a `)`, and keeps the `(` otherwise. Fontsource's `arabic`
 * file of Amiri holds `(` and not `)`, so an opening bracket cut into it
 * printed unmirrored in an Arabic line (#401). Such a character is set in
 * the first file with its mirror (the `latin` one), or by its own glyph
 * when no file has the mirror.
 *
 * In a left-to-right run a character that opens what follows it (an
 * opening bracket, an initial quotation mark) goes to the file the next
 * character is set in when that file has it (postext #670): the `(` of
 * `(d. 1367)` in an Arabic book was cut into the `arabic` file, the first
 * to hold it, and printed in that file's form, wider than the layout
 * measured, against a closing bracket from the `latin` one.
 *
 * A word shaped in a script the layout gave it (#725, the script in force,
 * `withShapingScript`) is set whole in the file that holds a letter of
 * that script, when that file has all its characters: `46.` after a Latin
 * word in the `latin` file, whose `latn` forms the layout measured. The
 * first file to hold a full stop may be the `arabic` one, which has no
 * Latin form for it. A word the file cannot set whole (the `(` of an
 * Arabic sentence, whose mirror only the `latin` file holds) is cut as
 * any other text.
 *
 * A run with no letter, cut out of text that has one (the `.»` of
 * `خالة.»`, which the `latin` file draws), says the letter whose script
 * the browser shaped it in (`beside`, #764), in a document shaped in its
 * own language.
 *
 * A face given with the ranges of its files is cut as a browser cuts it
 * ({@link declaredRuns}, #770) in a document shaped in its own language,
 * and none of the rules above that guess at the browser's file apply.
 */
export function fileRuns(font: PDFFont, text: string, rtl = false): FileRun[] {
  const list = faceFilesOf(font);
  if (!list) return [{ font, text }];
  if (setsAsDeclared(list)) return besideLetters(declaredRuns(list, font, text, rtl), text, font);
  const letter = shapingScriptLetter();
  if (letter !== undefined) {
    const file = list.fileFor(letter);
    // A mirrored character of a right-to-left run goes by the glyph the
    // run will show, as below (#401): the file must hold that one.
    if (file && [...text].every((ch) => {
      const cp = ch.codePointAt(0)!;
      const mirror = rtl ? mirroredCodePoint(cp) : cp;
      return isDefaultIgnorable(cp) || isJoiningControl(cp) || list.covers(file, mirror !== cp && list.fileFor(mirror) ? mirror : cp);
    })) return [{ font: file, text }];
  }
  const runs: FileRun[] = [];
  let current: FileRun | undefined;
  // Joining controls waiting for the letter after them (see below).
  let pending = '';
  let previous = 0;
  const chars = [...text];
  for (let at = 0; at < chars.length; at++) {
    const ch = chars[at]!;
    const cp = ch.codePointAt(0)!;
    // A zero width joiner or non-joiner shapes with the letters it sits
    // between (HarfBuzz reads it only inside one run): it stays with the
    // letter before it, and one with no letter before it (opening the
    // text, after a space) goes with the letter after it. Fontsource
    // serves U+2000–206F from the `latin` file, so the file that covers it
    // first is rarely the Arabic letters' one.
    if (isJoiningControl(cp) && (!current || !joinsOnto(previous))) {
      pending += ch;
      continue;
    }
    const mirror = rtl ? mirroredCodePoint(cp) : cp;
    const shown = mirror !== cp && list.fileFor(mirror) ? mirror : cp;
    let file = current?.font;
    if (!file || (!list.covers(file, shown) && !isDefaultIgnorable(cp))) {
      file = list.fileFor(shown) ?? current?.font ?? font;
    }
    // An opening mark goes with what it opens (#670).
    if (!rtl && OPENING_RE.test(ch)) {
      const opened = openedFile(list, chars, at + 1, current?.font);
      if (opened && list.covers(opened, cp)) file = opened;
    }
    if (current && current.font === file) {
      current.text += pending + ch;
    } else {
      current = { font: file, text: pending + ch };
      runs.push(current);
    }
    pending = '';
    previous = cp;
  }
  if (pending) {
    if (current) current.text += pending;
    else runs.push({ font, text: pending });
  }
  return besideLetters(runs, text, font);
}

/** `runs`, the runs `text` was cut into, each saying the letter it was
 *  cut from beside when it has none; one run in `font` for no run. */
function besideLetters(runs: FileRun[], text: string, font: PDFFont): FileRun[] {
  if (runs.length > 1) {
    // The runs follow each other through the text.
    let at = 0;
    for (const run of runs) {
      const beside = besideLetterOf(text, at, at + run.text.length);
      if (beside !== undefined) run.beside = beside;
      at += run.text.length;
    }
  }
  return runs.length > 0 ? runs : [{ font, text }];
}

/**
 * Whether the text being painted takes each character from the file a
 * browser takes it from: a face whose provider gave its files with their
 * ranges, in a document shaped in its own language.
 *
 * The page chose the file of a character the same way whatever language
 * it shaped the text in, but a document that keeps the host's language is
 * shaped string by string, each run in the script it shows, as it always
 * was, and prints the same bytes. Cut by the browser's files, its strings
 * fall into more runs with no letter, which that shaping gives no script:
 * in Noto Serif SC the space is another slice's than the letters and the
 * digits, so `GB/T 15834` became `GB/T`, a space and `15834`, and the
 * digits alone took the proportional forms of the default script, 0.80 pt
 * short of the tabular ones the page measured in a Latin string (15.75
 * pt, the Cookbook's Chinese official document). `renderToPdf` drops what
 * the files say when no document of the render is shaped in its own
 * language (`withBareFiles`); this is for a page of one that is not, in a
 * render that has one.
 */
function setsAsDeclared(list: FaceFiles): boolean {
  return list.ranged && shapesAsCanvas();
}

/** A combining mark: it is set in the file of the letter it stands on. */
const MARK_RE = /^\p{M}$/u;

/**
 * `text` cut into runs by the file a browser sets each character in, for
 * a face given with the ranges of its files (postext #770). As measured
 * in Chrome 154 (two files that draw the same letters at other widths,
 * declared as one family, on a canvas in a page and in a worker):
 *
 * - a character is set in the file declared last among those whose range
 *   holds it: of two `FontFace` objects, the one added to the font set
 *   last, whichever was made or loaded first; of two `@font-face` rules,
 *   the later one in the document; and a `FontFace` added by script
 *   rather than any rule of a style sheet, whichever came first;
 * - a file with no range answers for every character;
 * - a file whose range claims a character it has no glyph for is passed
 *   over for the next one down, and a glyph a file has outside its range
 *   is never drawn;
 * - nothing stays in a file because the character before it was set
 *   there: `Aa` with the capitals in one file is `A` from it and `a` from
 *   the other, 1269 thousandths, where either file alone gives 1253 or
 *   1274. A space goes to the file whose range holds it, though every
 *   file has one;
 * - a letter and the marks on it are set in one file, the one declared
 *   last that answers for them all. (Chrome also composes the pair where
 *   a file answers for the composed character: `o` + U+0304 is the `ō` of
 *   `latin-ext`. The PDF's shapers compose nothing, so here the pair goes
 *   to a file that has both.)
 *
 * So no character follows the one before it here, an opening bracket does
 * not go with what it opens and a word shaped in a script is not looked up
 * by a letter of that script: the browser did none of that. What stays is
 * what the shapers need: a zero width joiner or non-joiner with the letter
 * it joins, an invisible character in the run it stands in.
 *
 * A character no file answers for was drawn by the browser in another
 * family; here it is set as in a face given without ranges: in the run
 * before it when that file has a glyph, else in the first file that has
 * one (its mirror's, in a right-to-left run), and reported as missing
 * when none has.
 */
function declaredRuns(list: FaceFiles, font: PDFFont, text: string, rtl: boolean): FileRun[] {
  const runs: FileRun[] = [];
  let current: FileRun | undefined;
  // Joining controls waiting for the letter after them.
  let pending = '';
  let previous = 0;
  // The file of the letter whose marks follow, up to `wholeEnd`.
  let whole: PDFFont | null = null;
  let wholeEnd = 0;
  const chars = [...text];
  for (let at = 0; at < chars.length; at++) {
    const ch = chars[at]!;
    const cp = ch.codePointAt(0)!;
    if (isJoiningControl(cp) && (!current || !joinsOnto(previous))) {
      pending += ch;
      continue;
    }
    let file: PDFFont | null | undefined;
    if (at < wholeEnd) {
      file = whole;
    } else if (current && isDefaultIgnorable(cp)) {
      file = current.font;
    } else if (MARK_RE.test(ch)) {
      // A mark whose letter no file sets with it: beside its letter when
      // that file has a glyph for it.
      file = current && list.covers(current.font, cp) ? current.font : list.declaredFile(cp);
    } else {
      let end = at + 1;
      while (end < chars.length && MARK_RE.test(chars[end]!)) end++;
      if (end > at + 1) {
        whole = list.declaredFileOfAll(chars.slice(at, end).map((c) => c.codePointAt(0)!));
        wholeEnd = whole ? end : 0;
      }
      file = (at < wholeEnd ? whole : null) ?? list.declaredFile(cp);
    }
    if (!file) {
      const mirror = rtl ? mirroredCodePoint(cp) : cp;
      const shown = mirror !== cp && list.fileFor(mirror) ? mirror : cp;
      file = current && (list.covers(current.font, shown) || isDefaultIgnorable(cp)) ? current.font : list.fileFor(shown) ?? current?.font ?? font;
    }
    if (current && current.font === file) {
      current.text += pending + ch;
    } else {
      current = { font: file, text: pending + ch };
      runs.push(current);
    }
    pending = '';
    previous = cp;
  }
  if (pending) {
    if (current) current.text += pending;
    else runs.push({ font, text: pending });
  }
  return runs;
}

/** A string a browser keeps in eight bits: no character above U+00FF. */
const LATIN_1_RE = /^[\u0000-\u00FF]*$/;

/**
 * `text`, a string the canvas was handed whole (a line of a running head,
 * a word of the body), cut into the runs it is shaped in: its words
 * (`canvasWords.ts`, #770), each cut by file ({@link fileRuns}). The
 * canvas shapes every word alone, so no kerned pair and no ligature
 * crosses a space or stands between two CJK characters, and a word takes
 * the script of its own letters: one with no letter, a space among them,
 * has none in a string not kept in eight bits (`wide`).
 *
 * {@link fileRuns} itself, the string shaped whole as up to postext-pdf
 * 1.29, for a string of one word, in a document that keeps the host's
 * language, and with a script in force (#725: a word with no letter the
 * layout measured in the script of its context).
 */
export function wordRuns(font: PDFFont, text: string, rtl = false): FileRun[] {
  if (!shapesAsCanvas() || shapingScript() !== undefined) return fileRuns(font, text, rtl);
  const words = canvasWords(text);
  if (words.length === 1) return fileRuns(font, text, rtl);
  const wide = !LATIN_1_RE.test(text);
  const runs: FileRun[] = [];
  for (const word of words) {
    for (const run of fileRuns(font, word, rtl)) {
      if (wide) run.wide = true;
      runs.push(run);
    }
  }
  return runs;
}

/** Run `fn`, the shaping of `run` ({@link wordRuns}), with what the run
 *  says of its script in force: the letter it was cut from beside, and
 *  whether it is a word of a string not kept in eight bits. */
export function inRun<T>(run: FileRun, fn: () => T): T {
  return run.wide ? withinWideText(true, () => withBesideLetter(run.beside, fn)) : withBesideLetter(run.beside, fn);
}

/** Opening brackets and initial quotation marks (`Ps`, `Pi`). */
const OPENING_RE = /^[\p{Ps}\p{Pi}]$/u;

/** The file the first character after a row of opening marks (from `from`)
 *  is set in: the current run's when it covers it, else the first file
 *  that does. Undefined when a space or nothing follows the marks, or no
 *  file has the character. */
function openedFile(list: FaceFiles, chars: readonly string[], from: number, current: PDFFont | undefined): PDFFont | undefined {
  let at = from;
  while (at < chars.length && OPENING_RE.test(chars[at]!)) at++;
  const next = chars[at];
  if (next === undefined || /\s/u.test(next)) return undefined;
  const cp = next.codePointAt(0)!;
  if (isJoiningControl(cp) || isDefaultIgnorable(cp)) return undefined;
  if (current && list.covers(current, cp)) return current;
  return list.fileFor(cp) ?? undefined;
}

/** ZWNJ (U+200C) and ZWJ (U+200D): they choose the joining form of the
 *  letters either side of them. */
function isJoiningControl(cp: number): boolean {
  return cp === 0x200c || cp === 0x200d;
}

/** Whether a joining control after `cp` belongs with it: anything but a
 *  space or a control (a letter, a mark, a digit, punctuation). */
function joinsOnto(cp: number): boolean {
  return cp > 0x20 && !(cp >= 0x7f && cp < 0xa0) && !/\s/u.test(String.fromCodePoint(cp)) && !isJoiningControl(cp);
}

/** `text`'s width at `size` (points), each run measured in its file. */
export function widthOfTextAtSize(font: PDFFont, text: string, size: number): number {
  const runs = fileRuns(font, text);
  if (runs.length === 1) return runs[0]!.font.widthOfTextAtSize(runs[0]!.text, size);
  let width = 0;
  for (const run of runs) width += run.font.widthOfTextAtSize(run.text, size);
  return width;
}

/** Characters each font lacks, with the order they were first met in:
 *  one count for every font, so the characters a face lacks in several of
 *  its files still sort in the order the pages set them. */
const missingByFont = new WeakMap<PDFFont, Map<number, number>>();
let missingSeq = 0;

/** Record the characters of `text` that `font` has no glyph for (it draws
 *  them as `.notdef`). Called once per shaped text, from the caches of the
 *  text primitives. A character the fallbacks draw with another glyph of
 *  the face (U+2011 as a hyphen, see `fallbackSpaces.ts`) is not missing. */
export function noteMissingGlyphs(font: PDFFont, text: string): void {
  const face = coverageFace(font);
  if (!face) return;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (neverMissing(cp) || face.hasGlyphForCodePoint(cp) || substituteGlyph(face, cp) !== undefined) continue;
    let seen = missingByFont.get(font);
    if (!seen) {
      seen = new Map();
      missingByFont.set(font, seen);
    }
    if (!seen.has(cp)) seen.set(cp, missingSeq++);
  }
}

/** The characters drawn in `font` that it has no glyph for, each with its
 *  place in the order every font's missing characters were first met. */
export function missingGlyphsOf(font: PDFFont): ReadonlyMap<number, number> | undefined {
  return missingByFont.get(font);
}

/** Whether a face is missing `cp` in a way worth asking its provider for:
 *  a printing character. */
export function wantsGlyph(cp: number): boolean {
  return !neverMissing(cp);
}
