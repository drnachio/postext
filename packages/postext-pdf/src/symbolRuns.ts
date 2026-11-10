import type { PDFFont } from 'pdf-lib';
import type { FileRun } from './faceFiles.js';
import { isDefaultIgnorable, isFallbackHandled } from './pdf-backend/text/fallbackSpaces.js';

/** The symbol face of a face (`symbolFont`, #1460), by the first file of
 *  each: what no file of the face has a glyph for is set in it. */
const symbolFaces = new WeakMap<PDFFont, PDFFont>();

/** Link `symbols` (the first file of the symbol face) to the face whose
 *  first file is `primary`: it draws the characters that face lacks. Named
 *  apart from postext's `setSymbolFont`, which sets the family every font
 *  string lists. */
export function linkSymbolFace(primary: PDFFont, symbols: PDFFont): void {
  if (symbols !== primary) symbolFaces.set(primary, symbols);
}

/** The first file of the symbol face linked to the face whose first file
 *  is `font`. */
export function symbolFaceOf(font: PDFFont): PDFFont | undefined {
  return symbolFaces.get(font);
}

/** The faces of a symbol family a PDF asks for, in turn (#1460): its
 *  regular face, the one the canvas loads, then the nearest upright
 *  weights, for a family with no 400. Three at most: a provider that has
 *  none of them is not asked for every weight and slant. */
export function symbolFaceCandidates(family: string): Array<{ family: string; weight: number; style: 'normal' }> {
  return [400, 500, 300].map((weight) => ({ family, weight, style: 'normal' as const }));
}

/** Whether `font` (one file) has a glyph for `cp`. */
export function fontHas(font: PDFFont, cp: number): boolean {
  const face = (font as unknown as { embedder?: { font?: { hasGlyphForCodePoint?: (cp: number) => boolean } } }).embedder?.font;
  return face?.hasGlyphForCodePoint?.(cp) ?? false;
}

/** How the text face and the symbol face answer for a character, and how
 *  a piece of text in the symbol face is cut by its own files. */
export interface SymbolFace {
  /** Whether some file of the text face has `cp`. */
  faceHas: (cp: number) => boolean;
  /** Whether some file of the symbol face has `cp`. */
  symbolsHave: (cp: number) => boolean;
  /** A piece of text set in the symbol face, cut by its files: a symbol
   *  face served in several `unicode-range` files (Noto Sans Math from
   *  Google's style sheet) draws each character from the file that has it,
   *  not from its first file alone. */
  split: (text: string) => FileRun[];
}

/** `runs` with the characters the text face lacks and the symbol face has
 *  cut out into runs of their own, each set in the symbol face's file that
 *  has it. */
export function withSymbolRuns(runs: FileRun[], symbols: SymbolFace): FileRun[] {
  const symbolic = (cp: number): boolean => !isDefaultIgnorable(cp) && !isFallbackHandled(cp) && !symbols.faceHas(cp) && symbols.symbolsHave(cp);
  const out: FileRun[] = [];
  for (const run of runs) {
    if (![...run.text].some((ch) => symbolic(ch.codePointAt(0)!))) {
      out.push(run);
      continue;
    }
    // Pieces in the run's file and pieces in the symbol face, in turn.
    let piece = '';
    let inSymbols = false;
    const flush = (): void => {
      if (!piece) return;
      if (inSymbols) out.push(...symbols.split(piece));
      else out.push({ ...run, text: piece });
      piece = '';
    };
    for (const ch of run.text) {
      const symbol = symbolic(ch.codePointAt(0)!);
      if (symbol !== inSymbols) {
        flush();
        inSymbols = symbol;
      }
      piece += ch;
    }
    flush();
  }
  return out;
}
