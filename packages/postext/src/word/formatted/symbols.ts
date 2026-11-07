// Symbols an embedded face lacks (#1444): the engine draws them in a
// fallback face (or as a missing glyph), and a renderer that falls back
// on its own may pick a face without them too. Such runs name a symbol
// face that has the common ones (⌘, arrows, dingbats) instead.

import type { FaceAdvances } from './metrics.js';

/** The face named for symbols the run's face lacks: Windows ships it,
 *  and renderers without it fall back from it to a symbol face of their
 *  own (Apple Symbols, DejaVu Sans). */
export const SYMBOL_FACE = 'Segoe UI Symbol';

const SYMBOL = /\p{S}/u;

const symbolFonts = `<w:rFonts w:ascii="${SYMBOL_FACE}" w:hAnsi="${SYMBOL_FACE}" w:eastAsia="${SYMBOL_FACE}" w:cs="${SYMBOL_FACE}"/>`;

/** Whether `ch` is a symbol `face` has no glyph for. */
function lacks(face: FaceAdvances, ch: string): boolean {
  if (!SYMBOL.test(ch)) return false;
  const g = face.cmap.get(ch.codePointAt(0)!);
  return g === undefined || g === 0;
}

/** `pieces` with the symbols `face` lacks cut out into pieces set in the
 *  symbol face (same text, same order); undefined when there are none. */
export function symbolPieces<P extends { rPr: string; text: string }>(face: FaceAdvances, pieces: readonly P[]): P[] | undefined {
  if (!pieces.some((p) => Array.from(p.text).some((ch) => lacks(face, ch)))) return undefined;
  const out: P[] = [];
  for (const p of pieces) {
    let text = '';
    let symbol = false;
    const flush = (): void => {
      if (text) out.push({ ...p, rPr: symbol ? p.rPr.replace(/<w:rFonts [^>]*\/>/, symbolFonts) : p.rPr, text });
      text = '';
    };
    for (const ch of p.text) {
      const s = lacks(face, ch);
      if (s !== symbol) flush();
      symbol = s;
      text += ch;
    }
    flush();
  }
  return out;
}
