// Symbols an embedded face lacks (#1444): the engine draws them in a
// fallback face (or as a missing glyph), and a renderer that falls back
// on its own may pick a face without them too. Such runs name a symbol
// face that has the common ones (⌘, arrows, dingbats) instead.
//
// The document's symbol font (`symbolFont`, #1460) comes first: the
// characters the run's face lacks and it has (∪, ℵ, Greek in a Latin
// face) are set in runs of it, as the canvas and the PDF set them, so Word
// does not pick a face of its own. Whether the run's face lacks a
// character is read from its embedded file; with no file in the plan,
// from the glyph data the engine's warnings read (the glyph probe or the
// registered coverage, `glyphFallback.ts`). The same goes for what the
// symbol font has.

import { fontStringFamilies, parseFontString } from '../../measure/fontString.js';
import { quoteFamily } from '../../measure/font.js';
import { isGenericFamily } from '../../fonts/faces.js';
import { defaultSources } from '../../fonts/glyphFallback.js';
import { wordFontFor } from '../fonts/plan.js';
import { escapeAttr } from '../xml.js';
import { fontSizePx, type FaceAdvances } from './metrics.js';
import type { WriterContext } from './types.js';

/** The face named for symbols the run's face lacks: Windows ships it,
 *  and renderers without it fall back from it to a symbol face of their
 *  own (Apple Symbols, DejaVu Sans). */
export const SYMBOL_FACE = 'Segoe UI Symbol';

const SYMBOL = /\p{S}/u;
/** Characters never moved to another face: spaces (the holders of
 *  embedded content among them), controls, marks. */
const STAYS = /^[\p{Z}\p{C}\p{M}]$/u;

const rFonts = (family: string): string => {
  const f = escapeAttr(family);
  return `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`;
};
const symbolFonts = rFonts(SYMBOL_FACE);

/** Whether `face` has no glyph for `ch`. */
function cmapLacks(face: FaceAdvances, ch: string): boolean {
  const g = face.cmap.get(ch.codePointAt(0)!);
  return g === undefined || g === 0;
}

/** The document's symbol font as a run of the export sees it: the Word
 *  family its runs name, and whether it has a character. */
export interface SymbolFontFace {
  family: string;
  has: (ch: string) => boolean;
}

/** What says whether the run's face lacks a character: its embedded
 *  file, else the engine's glyph data (undefined when neither knows). */
export type FaceLacks = (ch: string) => boolean | undefined;

/** The symbol font a run's font string lists after its family (#1460):
 *  its embedded regular face in the plan, else its CSS family with the
 *  engine's glyph data for it. Undefined when the string lists none, or
 *  nothing says what it has. */
export function runSymbolFont(ctx: WriterContext, fontString: string): SymbolFontFace | undefined {
  const family = fontStringFamilies(fontString)[1];
  if (!family || isGenericFamily(family)) return undefined;
  const regular = `400 ${fontSizePx(fontString)}px ${quoteFamily(family)}`;
  const advances = ctx.plan ? ctx.metrics.faceAdvances(regular) : undefined;
  if (advances && ctx.plan) return { family: wordFontFor(ctx.plan, regular).family, has: (ch) => !cmapLacks(advances, ch) };
  const hasGlyph = defaultSources()?.hasGlyph;
  if (!hasGlyph) return undefined;
  return { family, has: (ch) => hasGlyph(family, 400, 'normal', ch) === true };
}

/** Whether the face of `fontString` lacks a character: by its embedded
 *  advances when the plan has them, else by the engine's glyph data. */
export function runFaceLacks(face: FaceAdvances | undefined, fontString: string): FaceLacks {
  if (face) return (ch) => cmapLacks(face, ch);
  const req = parseFontString(fontString);
  const hasGlyph = defaultSources()?.hasGlyph;
  if (!req || !hasGlyph) return () => undefined;
  return (ch) => {
    const has = hasGlyph(req.family, req.weight, req.style, ch);
    return has === undefined ? undefined : !has;
  };
}

/**
 * `pieces` with the characters the run's face lacks cut out into pieces
 * of their own (same text, same order): those the symbol font has in it,
 * the other symbols in {@link SYMBOL_FACE} when the face is embedded
 * (`face`). Undefined when there are none.
 */
export function symbolPieces<P extends { rPr: string; text: string }>(
  face: FaceAdvances | undefined,
  pieces: readonly P[],
  symbolFont?: SymbolFontFace,
  lacks: FaceLacks = (ch) => (face ? cmapLacks(face, ch) : undefined),
): P[] | undefined {
  const target = (ch: string): string | undefined => {
    if (STAYS.test(ch) || lacks(ch) !== true) return undefined;
    if (symbolFont?.has(ch)) return rFonts(symbolFont.family);
    return face && SYMBOL.test(ch) ? symbolFonts : undefined;
  };
  if (!pieces.some((p) => Array.from(p.text).some((ch) => target(ch) !== undefined))) return undefined;
  const out: P[] = [];
  for (const p of pieces) {
    let text = '';
    let fonts: string | undefined;
    const flush = (): void => {
      if (text) out.push({ ...p, rPr: fonts ? p.rPr.replace(/<w:rFonts [^>]*\/>/, fonts) : p.rPr, text });
      text = '';
    };
    for (const ch of p.text) {
      const t = target(ch);
      if (t !== fonts) flush();
      fonts = t;
      text += ch;
    }
    flush();
  }
  return out;
}
