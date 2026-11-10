import type { PDFFont } from 'pdf-lib';
import type { FileRun } from './faceFiles.js';
import { isDefaultIgnorable, isFallbackHandled } from './pdf-backend/text/fallbackSpaces.js';

/** The symbol font of a face (`symbolFont`), by its first
 *  file: what no file of the face has a glyph for is set in it. */
const symbolFonts = new WeakMap<PDFFont, PDFFont>();

/** Set `symbols` to draw the characters the face whose first file is
 *  `primary` lacks. */
export function setSymbolFont(primary: PDFFont, symbols: PDFFont): void {
  if (symbols !== primary) symbolFonts.set(primary, symbols);
}

/** The symbol font set for the face whose first file is `font`. */
export function symbolFontOf(font: PDFFont): PDFFont | undefined {
  return symbolFonts.get(font);
}

/** Whether `font` (any file) has a glyph for `cp`. */
export function fontHas(font: PDFFont, cp: number): boolean {
  const face = (font as unknown as { embedder?: { font?: { hasGlyphForCodePoint?: (cp: number) => boolean } } }).embedder?.font;
  return face?.hasGlyphForCodePoint?.(cp) ?? false;
}

/** `runs` with the characters the face lacks (`faceHas` false) and
 *  `symbols` has cut out into runs of their own in `symbols`. */
export function withSymbolRuns(runs: FileRun[], symbols: PDFFont, faceHas: (cp: number) => boolean): FileRun[] {
  const symbolic = (cp: number): boolean => !isDefaultIgnorable(cp) && !isFallbackHandled(cp) && !faceHas(cp) && fontHas(symbols, cp);
  const out: FileRun[] = [];
  for (const run of runs) {
    if (![...run.text].some((ch) => symbolic(ch.codePointAt(0)!))) {
      out.push(run);
      continue;
    }
    let current: FileRun | undefined;
    for (const ch of run.text) {
      const target = symbolic(ch.codePointAt(0)!) ? symbols : run.font;
      if (current && current.font === target) current.text += ch;
      else out.push((current = { ...run, font: target, text: ch }));
    }
  }
  return out;
}
